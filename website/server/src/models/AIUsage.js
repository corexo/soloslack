const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    provider: { type: String, required: true },
    model: { type: String, default: 'unknown' },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
});

aiUsageSchema.index({ timestamp: 1 });

module.exports = mongoose.model('AIUsage', aiUsageSchema);
