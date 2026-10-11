const crypto = require('crypto');
const Agent = require('../models/Agent');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Resolves `Authorization: Bearer <token>` to req.agent
const agentAuth = async (req, res, next) => {
    try {
        const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
        if (!match) {
            return res.status(401).json({ success: false, error: 'Missing agent token (Authorization: Bearer <token>)' });
        }

        const agent = await Agent.findOne({ tokenHash: hashToken(match[1].trim()) });
        if (!agent) {
            return res.status(401).json({ success: false, error: 'Invalid agent token' });
        }

        // Throttle lastSeen writes to once a minute
        if (!agent.lastSeenAt || Date.now() - agent.lastSeenAt.getTime() > 60_000) {
            agent.lastSeenAt = new Date();
            await agent.save();
        }

        req.agent = agent;
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = { agentAuth, hashToken };
