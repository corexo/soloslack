const mongoose = require('mongoose');
const AgentActivity = require('../models/AgentActivity');
const Card = require('../models/Card');
const bus = require('../utils/activityBus');

// Maps an agent API request to a human-readable action
function classify(req) {
    const { method } = req;
    const path = req.path;
    if (path === '/me') return { action: 'ping' };
    if (path === '/tasks' && method === 'GET') return { action: 'list' };
    const m = /^\/tasks\/([^/]+)(\/comments)?$/.exec(path);
    if (!m) return null;
    if (m[2] && method === 'POST') return { action: 'comment', cardId: m[1] };
    if (method === 'PATCH') return { action: 'update', cardId: m[1] };
    if (method === 'GET') return { action: 'read', cardId: m[1] };
    return null;
}

function describe(action, body = {}, files = []) {
    if (action === 'update') {
        const parts = [];
        if (body.column !== undefined) parts.push(`→ ${body.column}`);
        if (body.assignee !== undefined) parts.push(body.assignee ? `assigned ${body.assignee}` : 'unassigned');
        if (body.branch !== undefined) parts.push(body.branch ? `branch ${body.branch}` : 'branch unlinked');
        if (body.priority !== undefined) parts.push(`priority ${body.priority}`);
        return parts.join(', ') || null;
    }
    if (action === 'comment') {
        const text = (body.body || '').trim().replace(/\s+/g, ' ').slice(0, 140);
        const att = files.length ? ` 📎${files.length}` : '';
        return (text + att).trim() || null;
    }
    return null;
}

// Records each agent request after it finished and broadcasts it
const trackAgentActivity = (req, res, next) => {
    // Classify now: req.path is router-relative only while inside this router
    const info = classify(req);
    if (!info) return next();
    res.on('finish', async () => {
        try {
            if (!req.agent) return;
            const cardId = info.cardId && mongoose.isValidObjectId(info.cardId) ? info.cardId : null;
            const card = cardId ? await Card.findById(cardId).select('title').lean() : null;
            const event = await AgentActivity.create({
                agent: req.agent.name,
                action: info.action,
                cardId: card ? cardId : null,
                cardTitle: card?.title || null,
                detail: describe(info.action, req.body, req.files),
                status: res.statusCode,
            });
            bus.emit('activity', event.toObject());
        } catch (err) {
            console.error('Failed to record agent activity', err.message);
        }
    });
    next();
};

module.exports = trackAgentActivity;
