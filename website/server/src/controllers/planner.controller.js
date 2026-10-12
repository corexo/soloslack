const mongoose = require('mongoose');
const Board = require('../models/Board');
const Column = require('../models/Column');
const Card = require('../models/Card');
const Comment = require('../models/Comment');
const Workspace = require('../models/Workspace');
const AgentActivity = require('../models/AgentActivity');
const PlannerChat = require('../models/PlannerChat');

const DONE_COLUMN = /done|erledigt|fertig|closed|abgeschlossen|released|shipped/i;
const BUG = /\b(bug|bugs|fehler|crash|error|defect|hotfix)\b/i;
const MAX_MESSAGES = 200;
const DAY_MS = 24 * 3600 * 1000;

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

// "all" or a workspace id
async function resolveWorkspace(key) {
    if (key === 'all') return { key, name: 'All boards', filter: {} };
    if (!mongoose.isValidObjectId(key)) throw Object.assign(new Error('Workspace not found'), { statusCode: 404 });
    const ws = await Workspace.findById(key).lean();
    if (!ws) throw Object.assign(new Error('Workspace not found'), { statusCode: 404 });
    return { key, name: ws.name, description: ws.description, filter: { workspaceId: ws._id } };
}

// Day boundaries come from the browser so "today" matches the user's timezone
function dayRange(req) {
    const todayStart = new Date(req.query.todayStart || new Date().setHours(0, 0, 0, 0));
    if (Number.isNaN(todayStart.getTime())) throw badRequest('Invalid todayStart');
    return { todayStart, tomorrowStart: new Date(todayStart.getTime() + DAY_MS), yesterdayStart: new Date(todayStart.getTime() - DAY_MS) };
}

const within = (date, from, to) => date && date >= from && date < to;

// @desc    Board snapshot for planning: tickets with flags (overdue, today, carried over, …)
// @route   GET /api/planner/:workspace/context?todayStart=<ISO>
exports.getContext = async (req, res, next) => {
    try {
        const ws = await resolveWorkspace(req.params.workspace);
        const { todayStart, tomorrowStart, yesterdayStart } = dayRange(req);

        const boards = await Board.find({ ...ws.filter, isArchived: false }).sort({ order: 1 }).lean();
        const boardIds = boards.map(b => b._id);
        const [columns, cards] = await Promise.all([
            Column.find({ boardId: { $in: boardIds } }).sort({ order: 1 }).lean(),
            Card.find({ boardId: { $in: boardIds }, isArchived: false }).sort({ updatedAt: -1 }).limit(400).lean(),
        ]);
        const cardIds = cards.map(c => c._id);
        const [comments, activity] = await Promise.all([
            Comment.find({ cardId: { $in: cardIds }, createdAt: { $gte: yesterdayStart, $lt: tomorrowStart } })
                .sort({ createdAt: -1 }).select('cardId body author authorType createdAt').lean(),
            AgentActivity.find({ cardId: { $in: cardIds }, createdAt: { $gte: yesterdayStart, $lt: tomorrowStart } })
                .select('agent action cardId detail createdAt').lean(),
        ]);

        // Done = column name matches, otherwise the board's last column
        const columnsByBoard = new Map();
        columns.forEach(c => columnsByBoard.set(String(c.boardId), [...(columnsByBoard.get(String(c.boardId)) || []), c]));
        const columnInfo = new Map();
        for (const [boardId, cols] of columnsByBoard) {
            const anyNamedDone = cols.some(c => DONE_COLUMN.test(c.name));
            cols.forEach((c, i) => columnInfo.set(String(c._id), {
                name: c.name, index: i, boardId,
                done: anyNamedDone ? DONE_COLUMN.test(c.name) : i === cols.length - 1 && cols.length > 1,
            }));
        }
        const boardName = new Map(boards.map(b => [String(b._id), b.name]));

        const tickets = cards.map(c => {
            const col = columnInfo.get(String(c.columnId)) || { name: '?', index: 0, done: false };
            const due = c.dueDate ? new Date(c.dueDate) : null;
            const cardComments = comments.filter(m => String(m.cardId) === String(c._id));
            const cardActivity = activity.filter(a => String(a.cardId) === String(c._id));
            const touchedYesterday = within(c.updatedAt, yesterdayStart, todayStart)
                || cardComments.some(m => within(m.createdAt, yesterdayStart, todayStart))
                || cardActivity.some(a => within(a.createdAt, yesterdayStart, todayStart));
            const isBug = BUG.test(c.title) || (c.labels || []).some(l => BUG.test(l.text));

            const flags = [];
            if (col.done) {
                if (within(c.updatedAt, yesterdayStart, todayStart)) flags.push('doneYesterday');
                if (within(c.updatedAt, todayStart, tomorrowStart)) flags.push('doneToday');
            } else {
                if (due && due < todayStart) flags.push('overdue');
                if (within(due, todayStart, tomorrowStart)) flags.push('dueToday');
                if (col.index > 0) flags.push('inProgress');
                if (touchedYesterday || within(due, yesterdayStart, todayStart)) flags.push('carriedOver');
                if (isBug) flags.push('bug');
            }

            return {
                id: String(c._id),
                title: c.title,
                board: boardName.get(String(c.boardId)),
                boardId: String(c.boardId),
                column: col.name,
                done: col.done,
                priority: c.priority,
                labels: (c.labels || []).map(l => l.text),
                dueDate: c.dueDate,
                assignee: c.assignee || null,
                branch: c.branch || null,
                checklist: c.checklist?.length ? `${c.checklist.filter(i => i.completed).length}/${c.checklist.length}` : null,
                updatedAt: c.updatedAt,
                flags,
                recent: [
                    ...cardComments.slice(0, 3).map(m => `${m.authorType === 'agent' ? m.author : 'user'} commented: ${(m.body || '').replace(/\s+/g, ' ').slice(0, 140)}`),
                    ...cardActivity.filter(a => ['update', 'create', 'attach'].includes(a.action)).slice(0, 3)
                        .map(a => `${a.agent} ${a.action}${a.detail ? ` (${a.detail})` : ''}`),
                ],
            };
        });

        res.status(200).json({
            success: true,
            data: {
                workspace: { key: ws.key, name: ws.name, description: ws.description || '' },
                today: todayStart,
                boards: boards.map(b => ({
                    id: String(b._id),
                    name: b.name,
                    columns: (columnsByBoard.get(String(b._id)) || []).map(c => ({ id: String(c._id), name: c.name, done: columnInfo.get(String(c._id))?.done })),
                })),
                tickets,
            },
        });
    } catch (error) {
        next(error);
    }
};

const getChat = async (key) => (await PlannerChat.findOne({ workspaceKey: key }).lean()) || { workspaceKey: key, messages: [] };

// @route   GET /api/planner/:workspace/messages
exports.getMessages = async (req, res, next) => {
    try {
        const ws = await resolveWorkspace(req.params.workspace);
        res.status(200).json({ success: true, data: (await getChat(ws.key)).messages });
    } catch (error) {
        next(error);
    }
};

// @route   POST /api/planner/:workspace/messages  { role, content, actions? }
exports.addMessage = async (req, res, next) => {
    try {
        const ws = await resolveWorkspace(req.params.workspace);
        const { role, content = '', actions = [] } = req.body || {};
        if (!['user', 'assistant'].includes(role)) throw badRequest('role must be user or assistant');
        if (!Array.isArray(actions) || actions.length > 30) throw badRequest('actions must be an array (max 30)');

        const message = { _id: new mongoose.Types.ObjectId(), role, content: String(content), actions, actionStatus: actions.map(() => 'pending') };
        await PlannerChat.updateOne(
            { workspaceKey: ws.key },
            { $push: { messages: { $each: [message], $slice: -MAX_MESSAGES } } },
            { upsert: true, runValidators: true }
        );
        const chat = await getChat(ws.key);
        res.status(201).json({ success: true, data: chat.messages.find(m => String(m._id) === String(message._id)) });
    } catch (error) {
        next(error);
    }
};

// @route   PATCH /api/planner/:workspace/messages/:messageId  { index, status }
exports.setActionStatus = async (req, res, next) => {
    try {
        const ws = await resolveWorkspace(req.params.workspace);
        const { index, status } = req.body || {};
        if (!Number.isInteger(index) || index < 0 || typeof status !== 'string') throw badRequest('index and status are required');
        const result = await PlannerChat.updateOne(
            { workspaceKey: ws.key, 'messages._id': req.params.messageId },
            { $set: { [`messages.$.actionStatus.${index}`]: status.slice(0, 300) } }
        );
        if (!result.matchedCount) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

// @route   DELETE /api/planner/:workspace/messages
exports.clearMessages = async (req, res, next) => {
    try {
        const ws = await resolveWorkspace(req.params.workspace);
        await PlannerChat.deleteOne({ workspaceKey: ws.key });
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};
