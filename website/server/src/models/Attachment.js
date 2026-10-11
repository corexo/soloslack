const mongoose = require('mongoose');

// File stored on the local uploads volume, attached to a card (and optionally a comment)
const attachmentSchema = new mongoose.Schema(
    {
        cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
        commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
        name: { type: String, required: true, trim: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
        storageKey: { type: String, required: true },
        uploadedBy: { type: String, default: 'user' },
    },
    { timestamps: true }
);

attachmentSchema.index({ cardId: 1, createdAt: -1 });
attachmentSchema.index({ commentId: 1 });

module.exports = mongoose.model('Attachment', attachmentSchema);
