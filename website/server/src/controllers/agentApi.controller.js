const mongoose = require('mongoose');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Board = require('../models/Board');
const Comment = require('../models/Comment');
const Agent = require('../models/Agent');
const { checkWipLimit } = require('./cards.controller');
const { createCommentWithFiles, removeFiles, serializeComment } = require('../utils/attachments');

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
    checklist: (card.checklist || []).map(i => ({ text: i.text, completed: i.completed })),
    board: board ? { id: board._id, name: board.name } : null,
    column: column ? { id: column._id, name: column.name } : null,
    updatedAt: card.updatedAt,
});

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
        const [board, columns, comments] = await Promise.all([
            Board.findById(card.boardId).lean(),
            Column.find({ boardId: card.boardId }).sort({ order: 1 }).lean(),
            Comment.find({ cardId: card._id }).sort({ createdAt: 1 }).populate('attachments').lean(),
        ]);
        const column = columns.find(c => String(c._id) === String(card.columnId));

        res.status(200).json({
            success: true,
            data: {
                ...toTask(card, board, column),
                columns: columns.map(c => ({ id: c._id, name: c.name })),
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
