const mongoose = require('mongoose');

// Planning chat per workspace ("all" = every board). Actions are AI proposals the user approves.
const plannerMessageSchema = new mongoose.Schema(
    {
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, default: '', maxlength: 50000 },
        actions: { type: [mongoose.Schema.Types.Mixed], default: [] },
        // Per action: 'applied' | 'skipped' | 'failed: <reason>' (index-aligned with actions)
        actionStatus: { type: [String], default: [] },
    },
    { timestamps: true }
);

const plannerChatSchema = new mongoose.Schema(
    {
        workspaceKey: { type: String, required: true, unique: true },
        messages: { type: [plannerMessageSchema], default: [] },
    },
    { timestamps: true }
);

module.exports = mongoose.model('PlannerChat', plannerChatSchema);
