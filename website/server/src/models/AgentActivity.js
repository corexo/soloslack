const mongoose = require('mongoose');

// One agent API access (feeds the live agent network view)
const agentActivitySchema = new mongoose.Schema({
    agent: { type: String, required: true },
    action: { type: String, required: true }, // list | read | comment | update | ping
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', default: null },
    cardTitle: { type: String, default: null },
    detail: { type: String, default: null },
    status: { type: Number, default: 200 },
    createdAt: { type: Date, default: Date.now },
});

// Keep a week of history
agentActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
agentActivitySchema.index({ agent: 1, createdAt: -1 });

module.exports = mongoose.model('AgentActivity', agentActivitySchema);
