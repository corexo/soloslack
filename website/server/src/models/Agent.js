const mongoose = require('mongoose');

// An AI agent (CLI client) that can work on assigned cards via /api/agent
const agentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Agent name is required'],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^[a-z0-9][a-z0-9._-]{1,39}$/, 'Agent name may only contain a-z, 0-9, ".", "_" and "-" (2-40 chars)'],
        },
        description: { type: String, default: '', maxlength: 200 },
        // Only a SHA-256 hash is stored; the plain token is shown once on creation
        tokenHash: { type: String, required: true, select: false },
        tokenPrefix: { type: String, required: true },
        lastSeenAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Agent', agentSchema);
