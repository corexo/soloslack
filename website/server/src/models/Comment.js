const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
    {
        cardId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Card',
            required: [true, 'cardId is required'],
        },
        // May be empty when the comment only carries attachments
        body: {
            type: String,
            default: '',
            trim: true,
            maxlength: [50000, 'Comment cannot exceed 50000 characters'],
        },
        author: { type: String, default: 'user', trim: true },
        authorType: { type: String, enum: ['user', 'agent'], default: 'user' },
        attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attachment' }],
    },
    { timestamps: true }
);

commentSchema.index({ cardId: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
