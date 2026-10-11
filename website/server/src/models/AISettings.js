const mongoose = require('mongoose');

// Singleton document holding the AI integration config (keys, models, custom endpoint)
const aiSettingsSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'default', unique: true },
        activeProvider: { type: String, default: null },
        apiKeys: { type: Object, default: {} },
        config: { type: Object, default: {} },
    },
    { timestamps: true, minimize: false }
);

module.exports = mongoose.model('AISettings', aiSettingsSchema);
