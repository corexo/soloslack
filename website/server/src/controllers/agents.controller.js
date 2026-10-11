const crypto = require('crypto');
const Agent = require('../models/Agent');
const Card = require('../models/Card');
const Board = require('../models/Board');
const Column = require('../models/Column');
const AgentActivity = require('../models/AgentActivity');
const bus = require('../utils/activityBus');
const { hashToken } = require('../middleware/agentAuth');

const newToken = () => `sls_${crypto.randomBytes(24).toString('base64url')}`;

const toClient = (agent, token) => ({
    _id: agent._id,
    name: agent.name,
    description: agent.description,
    tokenPrefix: agent.tokenPrefix,
    lastSeenAt: agent.lastSeenAt,
    createdAt: agent.createdAt,
    ...(token ? { token } : {}),
});

// @desc    List agents
// @route   GET /api/agents
exports.getAgents = async (req, res, next) => {
    try {
        const agents = await Agent.find().sort({ name: 1 });
        res.status(200).json({ success: true, data: agents.map(a => toClient(a)) });
    } catch (error) {
        next(error);
    }
};

// @desc    Create an agent; the token is returned only in this response
// @route   POST /api/agents
exports.createAgent = async (req, res, next) => {
    try {
        const { name, description = '' } = req.body;
        const token = newToken();
        const agent = await Agent.create({
            name,
            description,
            tokenHash: hashToken(token),
            tokenPrefix: token.slice(0, 8),
        });
        res.status(201).json({ success: true, data: toClient(agent, token) });
    } catch (error) {
        if (error.code === 11000) {
            error.statusCode = 409;
            error.message = 'An agent with this name already exists';
        } else if (error.name === 'ValidationError') {
            error.statusCode = 400;
        }
        next(error);
    }
};

// @desc    Issue a new token (old one stops working)
// @route   POST /api/agents/:id/rotate
exports.rotateToken = async (req, res, next) => {
    try {
        const token = newToken();
        const agent = await Agent.findByIdAndUpdate(
            req.params.id,
            { tokenHash: hashToken(token), tokenPrefix: token.slice(0, 8) },
            { new: true }
        );
        if (!agent) {
            const error = new Error('Agent not found');
            error.statusCode = 404;
            throw error;
        }
        res.status(200).json({ success: true, data: toClient(agent, token) });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete an agent and unassign its cards
// @route   DELETE /api/agents/:id
exports.deleteAgent = async (req, res, next) => {
    try {
        const agent = await Agent.findByIdAndDelete(req.params.id);
        if (!agent) {
            const error = new Error('Agent not found');
            error.statusCode = 404;
            throw error;
        }
        await Card.updateMany({ assignee: agent.name }, { $set: { assignee: null } });
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// @desc    Recent agent activity (newest first)
// @route   GET /api/agents/activity?limit=100
exports.getActivity = async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        const events = await AgentActivity.find().sort({ createdAt: -1 }).limit(limit).lean();
        res.status(200).json({ success: true, data: events });
    } catch (error) {
        next(error);
    }
};

// @desc    Live agent activity via Server-Sent Events
// @route   GET /api/agents/activity/stream
exports.streamActivity = (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    // Comment lines keep proxies from closing an idle stream
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    bus.on('activity', send);
    req.on('close', () => {
        clearInterval(heartbeat);
        bus.off('activity', send);
    });
};

// @desc    Graph data: agents, the tickets they're assigned to or touched in the last 24h
// @route   GET /api/agents/network
exports.getNetwork = async (req, res, next) => {
    try {
        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const [agents, recent] = await Promise.all([
            Agent.find().sort({ name: 1 }).lean(),
            AgentActivity.aggregate([
                { $match: { createdAt: { $gte: since }, cardId: { $ne: null } } },
                { $group: { _id: { agent: '$agent', cardId: '$cardId' }, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
            ]),
        ]);

        const assigned = await Card.find({ assignee: { $ne: null }, isArchived: false })
            .select('_id title assignee columnId boardId branch updatedAt').lean();
        const touchedIds = recent.map(r => r._id.cardId).filter(id => !assigned.some(c => String(c._id) === String(id)));
        const touched = touchedIds.length
            ? await Card.find({ _id: { $in: touchedIds } }).select('_id title assignee columnId boardId branch updatedAt').lean()
            : [];
        const cards = [...assigned, ...touched];

        const [columns, boards] = await Promise.all([
            Column.find({ _id: { $in: cards.map(c => c.columnId) } }).select('_id name').lean(),
            Board.find({ _id: { $in: cards.map(c => c.boardId) } }).select('_id name').lean(),
        ]);
        const colName = new Map(columns.map(c => [String(c._id), c.name]));
        const boardName = new Map(boards.map(b => [String(b._id), b.name]));

        const links = [
            ...assigned.map(c => ({ agent: c.assignee, cardId: String(c._id), type: 'assigned' })),
            ...recent
                .filter(r => !assigned.some(c => String(c._id) === String(r._id.cardId) && c.assignee === r._id.agent))
                .map(r => ({ agent: r._id.agent, cardId: String(r._id.cardId), type: 'touched' })),
        ];
        const activity = Object.fromEntries(recent.map(r => [`${r._id.agent}|${r._id.cardId}`, { count: r.count, last: r.last }]));

        res.status(200).json({
            success: true,
            data: {
                agents: agents.map(a => ({ name: a.name, description: a.description, lastSeenAt: a.lastSeenAt })),
                tickets: cards.map(c => ({
                    id: String(c._id), title: c.title, assignee: c.assignee, branch: c.branch,
                    column: colName.get(String(c.columnId)) || null,
                    boardId: String(c.boardId), boardName: boardName.get(String(c.boardId)) || null,
                })),
                links: links.map(l => ({ ...l, ...(activity[`${l.agent}|${l.cardId}`] || { count: 0, last: null }) })),
            },
        });
    } catch (error) {
        next(error);
    }
};
