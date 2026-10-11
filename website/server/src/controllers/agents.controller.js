const crypto = require('crypto');
const Agent = require('../models/Agent');
const Card = require('../models/Card');
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
