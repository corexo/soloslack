const mongoose = require('mongoose');

// Small user-editable text documents (e.g. the agent SKILL.md), keyed by name
const appDocumentSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        content: { type: String, default: '', maxlength: 100000 },
    },
    { timestamps: true }
);

module.exports = mongoose.model('AppDocument', appDocumentSchema);
