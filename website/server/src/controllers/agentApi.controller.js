const mongoose = require('mongoose');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Board = require('../models/Board');
const Comment = require('../models/Comment');
const Agent = require('../models/Agent');
const Workspace = require('../models/Workspace');
const { checkWipLimit } = require('./cards.controller');
const { createCommentWithFiles, createCardAttachments, getCardAttachments, removeFiles, serializeComment } = require('../utils/attachments');

const notFound = (what) => {
    const error = new Error(`${what} not found`);
    error.statusCode = 404;
    return error;
};

const findCard = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw notFound('Card');
    const card = await Card.findById(id).lean();
    if (!card) throw notFound('Card');
    return card;
};

// Compact ticket shape shared by list and detail responses
const toTask = (card, board, column) => ({
    id: card._id,
    title: card.title,
    description: card.description,
    priority: card.priority,
    assignee: card.assignee,
    branch: card.branch || null,
    repo: board?.gitRepo || null,
    dueDate: card.dueDate,
    labels: (card.labels || []).map(l => l.text),
    attachmentCount: card.attachmentCount || 0,
    createdBy: card.createdBy || null,
    checklist: (card.checklist || []).map(i => ({ text: i.text, completed: i.completed })),
    board: board ? { id: board._id, name: board.name } : null,
    column: column ? { id: column._id, name: column.name } : null,
    updatedAt: card.updatedAt,
});

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const LABEL_COLORS = ['blue', 'purple', 'green', 'amber', 'orange', 'red'];
const PRIORITIES = ['low', 'medium', 'high'];

// @desc    Boards with their columns — where agents can create tickets
// @route   GET /api/agent/boards
exports.getBoards = async (req, res, next) => {
    try {
        const boards = await Board.find({ isArchived: false }).sort({ order: 1, createdAt: -1 }).lean();
        const [columns, workspaces, counts] = await Promise.all([
            Column.find({ boardId: { $in: boards.map(b => b._id) } }).sort({ order: 1 }).lean(),
            Workspace.find({ _id: { $in: boards.map(b => b.workspaceId).filter(Boolean) } }).select('name').lean(),
            Card.aggregate([
                { $match: { boardId: { $in: boards.map(b => b._id) }, isArchived: false } },
                { $group: { _id: '$boardId', count: { $sum: 1 } } },
            ]),
        ]);
        const wsName = new Map(workspaces.map(w => [String(w._id), w.name]));
        const countBy = new Map(counts.map(c => [String(c._id), c.count]));

        res.status(200).json({
            success: true,
            data: boards.map(b => ({
                id: b._id,
                name: b.name,
                description: b.description,
                workspace: b.workspaceId ? wsName.get(String(b.workspaceId)) || null : null,
                repo: b.gitRepo || null,
                cards: countBy.get(String(b._id)) || 0,
                columns: columns.filter(c => String(c.boardId) === String(b._id)).map(c => ({ id: c._id, name: c.name, wipLimit: c.wipLimit })),
            })),
        });
    } catch (error) {
        next(error);
    }
};

// Turns one agent task spec into Card fields; throws 400 with a readable message
async function buildCard(spec, { agentName, boards, columnsByBoard, agentNames, defaultBoard }) {
    if (!spec || typeof spec !== 'object') throw badRequest('Task must be an object');
    const title = String(spec.title || '').trim();
    if (!title) throw badRequest('title is required');
    if (title.length > 200) throw badRequest(`title too long (${title.length} > 200)`);

    const boardRef = spec.board ?? defaultBoard;
    let board;
    if (boardRef) {
        board = boards.find(b => String(b._id) === String(boardRef))
            || boards.find(b => b.name.toLowerCase() === String(boardRef).toLowerCase());
        if (!board) throw badRequest(`Board "${boardRef}" not found. Available: ${boards.map(b => b.name).join(', ')}`);
    } else if (boards.length === 1) {
        board = boards[0];
    } else {
        throw badRequest(`board is required. Available: ${boards.map(b => b.name).join(', ')}`);
    }

    const columns = columnsByBoard.get(String(board._id)) || [];
    if (!columns.length) throw badRequest(`Board "${board.name}" has no columns`);
    const column = spec.column
        ? columns.find(c => String(c._id) === String(spec.column)) || columns.find(c => c.name.toLowerCase() === String(spec.column).toLowerCase())
        : columns[0];
    if (!column) throw badRequest(`Column "${spec.column}" not found on "${board.name}". Available: ${columns.map(c => c.name).join(', ')}`);

    const priority = spec.priority ? String(spec.priority).toLowerCase() : 'medium';
    if (!PRIORITIES.includes(priority)) throw badRequest(`priority must be one of ${PRIORITIES.join(', ')}`);

    let assignee = spec.assignee ? String(spec.assignee).toLowerCase() : null;
    if (assignee === 'me') assignee = agentName;
    if (assignee && !agentNames.has(assignee)) throw badRequest(`Agent "${spec.assignee}" does not exist`);

    const labels = (Array.isArray(spec.labels) ? spec.labels : []).slice(0, 6).map((l, i) => {
        const text = String(typeof l === 'string' ? l : l?.text || '').trim().slice(0, 30);
        const color = LABEL_COLORS.includes(l?.color) ? l.color : LABEL_COLORS[i % LABEL_COLORS.length];
        return { text, color };
    }).filter(l => l.text);

    const checklist = (Array.isArray(spec.checklist) ? spec.checklist : []).map(i => ({
        text: String(typeof i === 'string' ? i : i?.text || '').trim().slice(0, 200),
        completed: Boolean(i?.completed),
    })).filter(i => i.text);

    let dueDate = null;
    if (spec.dueDate || spec.due) {
        dueDate = new Date(spec.dueDate || spec.due);
        if (Number.isNaN(dueDate.getTime())) throw badRequest(`Invalid due date "${spec.dueDate || spec.due}"`);
    }

    return {
        board,
        column,
        fields: {
            boardId: board._id,
            columnId: column._id,
            title,
            description: String(spec.description || '').slice(0, 20000),
            priority,
            labels,
            checklist,
            assignee,
            branch: spec.branch ? String(spec.branch).trim() : null,
            dueDate,
            createdBy: agentName,
        },
    };
}

// @desc    Create one ticket ({...}) or several ({ tasks: [...] } or [...]); all-or-nothing validation
// @route   POST /api/agent/tasks
exports.createTasks = async (req, res, next) => {
    try {
        const body = req.body || {};
        const specs = Array.isArray(body) ? body : Array.isArray(body.tasks) ? body.tasks : [body];
        if (!specs.length) throw badRequest('No tasks given');
        if (specs.length > 50) throw badRequest('At most 50 tasks per request');

        const boards = await Board.find({ isArchived: false }).lean();
        const columns = await Column.find({ boardId: { $in: boards.map(b => b._id) } }).sort({ order: 1 }).lean();
        const columnsByBoard = new Map();
        columns.forEach(c => columnsByBoard.set(String(c.boardId), [...(columnsByBoard.get(String(c.boardId)) || []), c]));
        const agentNames = new Set((await Agent.find().select('name').lean()).map(a => a.name));
        const ctx = { agentName: req.agent.name, boards, columnsByBoard, agentNames, defaultBoard: body.board };

        // Validate everything before creating anything
        const built = [];
        for (const [i, spec] of specs.entries()) {
            try {
                built.push(await buildCard(spec, ctx));
            } catch (error) {
                if (specs.length > 1) error.message = `Task ${i + 1}${spec?.title ? ` ("${spec.title}")` : ''}: ${error.message}`;
                throw error;
            }
        }

        const created = [];
        for (const { board, column, fields } of built) {
            await checkWipLimit(column._id);
            const order = await Card.countDocuments({ columnId: column._id, isArchived: false });
            const card = await Card.create({ ...fields, order });
            created.push(toTask(card.toObject(), board, column));
        }

        // One activity event per created ticket (see trackAgentActivity)
        res.locals.activity = created.map(t => ({ cardId: t.id, cardTitle: t.title, detail: `in ${t.board.name} → ${t.column.name}` }));
        res.status(201).json({ success: true, count: created.length, data: created });
    } catch (error) {
        next(error);
    }
};

// @desc    Current agent
// @route   GET /api/agent/me
exports.me = (req, res) => {
    const { name, description, lastSeenAt } = req.agent;
    res.status(200).json({ success: true, data: { name, description, lastSeenAt } });
};

// @desc    Tickets assigned to the calling agent (or ?assignee=any|<name>)
// @route   GET /api/agent/tasks
exports.getTasks = async (req, res, next) => {
    try {
        const { assignee, column, board } = req.query;
        const query = { isArchived: false };
        if (assignee !== 'any') query.assignee = (assignee || req.agent.name).toLowerCase();
        if (board && mongoose.isValidObjectId(board)) query.boardId = board;

        const cards = await Card.find(query).sort({ updatedAt: -1 }).limit(200).lean();
        const [columns, boards] = await Promise.all([
            Column.find({ _id: { $in: cards.map(c => c.columnId) } }).lean(),
            Board.find({ _id: { $in: cards.map(c => c.boardId) } }).lean(),
        ]);
        const colById = new Map(columns.map(c => [String(c._id), c]));
        const boardById = new Map(boards.map(b => [String(b._id), b]));

        let tasks = cards.map(c => toTask(c, boardById.get(String(c.boardId)), colById.get(String(c.columnId))));
        if (column) tasks = tasks.filter(t => t.column?.name.toLowerCase() === column.toLowerCase());

        res.status(200).json({ success: true, count: tasks.length, data: tasks });
    } catch (error) {
        next(error);
    }
};

// @desc    Full ticket incl. comments (oldest first) and the board's columns
// @route   GET /api/agent/tasks/:id
exports.getTask = async (req, res, next) => {
    try {
        const card = await findCard(req.params.id);
        const [board, columns, comments, attachments] = await Promise.all([
            Board.findById(card.boardId).lean(),
            Column.find({ boardId: card.boardId }).sort({ order: 1 }).lean(),
            Comment.find({ cardId: card._id }).sort({ createdAt: 1 }).populate('attachments').lean(),
            getCardAttachments(card._id),
        ]);
        const column = columns.find(c => String(c._id) === String(card.columnId));

        res.status(200).json({
            success: true,
            data: {
                ...toTask(card, board, column),
                columns: columns.map(c => ({ id: c._id, name: c.name })),
                attachments,
                comments: comments.map(serializeComment),
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Post a progress update (JSON {body} or multipart with body + files)
// @route   POST /api/agent/tasks/:id/comments
exports.addComment = async (req, res, next) => {
    try {
        const card = await findCard(req.params.id);
        const comment = await createCommentWithFiles({
            cardId: card._id,
            body: req.body?.body,
            files: req.files || [],
            author: req.agent.name,
            authorType: 'agent',
        });
        res.status(201).json({ success: true, data: comment });
    } catch (error) {
        await removeFiles(req.files);
        next(error);
    }
};

// @desc    Attach files to the ticket itself (multipart `files`)
// @route   POST /api/agent/tasks/:id/attachments
exports.addAttachments = async (req, res, next) => {
    try {
        const card = await findCard(req.params.id);
        const data = await createCardAttachments({ cardId: card._id, files: req.files || [], uploadedBy: req.agent.name });
        res.status(201).json({ success: true, data });
    } catch (error) {
        await removeFiles(req.files);
        next(error);
    }
};

// @desc    Update ticket: move to column (name or id), change priority, reassign, link branch
// @route   PATCH /api/agent/tasks/:id
exports.updateTask = async (req, res, next) => {
    try {
        const card = await findCard(req.params.id);
        const { column, priority, assignee, branch } = req.body || {};
        const update = {};
        if (branch !== undefined) update.branch = branch || null;

        if (column !== undefined) {
            const columns = await Column.find({ boardId: card.boardId }).lean();
            const target = columns.find(c => String(c._id) === String(column))
                || columns.find(c => c.name.toLowerCase() === String(column).toLowerCase());
            if (!target) {
                const error = new Error(`Column "${column}" not found. Available: ${columns.map(c => c.name).join(', ')}`);
                error.statusCode = 400;
                throw error;
            }
            if (String(target._id) !== String(card.columnId)) {
                await checkWipLimit(target._id, card._id);
                update.columnId = target._id;
                // Append at the bottom of the target column
                update.order = await Card.countDocuments({ columnId: target._id, isArchived: false });
            }
        }
        if (priority !== undefined) update.priority = priority;
        if (assignee !== undefined) {
            if (assignee && !(await Agent.exists({ name: String(assignee).toLowerCase() }))) {
                const error = new Error(`Agent "${assignee}" does not exist`);
                error.statusCode = 400;
                throw error;
            }
            update.assignee = assignee || null;
        }

        await Card.findByIdAndUpdate(card._id, update, { runValidators: true });

        // Close the gap left in the source column
        if (update.columnId) {
            const sourceCards = await Card.find({ columnId: card.columnId, isArchived: false }).sort({ order: 1 });
            if (sourceCards.length) {
                await Card.bulkWrite(sourceCards.map((c, i) => ({
                    updateOne: { filter: { _id: c._id }, update: { $set: { order: i } } },
                })));
            }
        }

        req.params.id = card._id;
        return exports.getTask(req, res, next);
    } catch (error) {
        next(error);
    }
};
