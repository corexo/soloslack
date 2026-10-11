const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const Attachment = require('../models/Attachment');
const Comment = require('../models/Comment');
const Card = require('../models/Card');
const { UPLOAD_DIR } = require('../config/uploads');

// multer hands over the original filename as latin1
const decodeName = (name) => Buffer.from(name, 'latin1').toString('utf8');

const removeFiles = (files = []) =>
    Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));

const serializeAttachment = (a) => ({
    _id: a._id,
    name: a.name,
    mimeType: a.mimeType,
    size: a.size,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt,
    url: `/api/attachments/${a._id}/raw`,
});

const serializeComment = (c) => ({
    ...c,
    attachments: (c.attachments || []).filter(Boolean).map(serializeAttachment),
});

/**
 * Create a comment with optional uploaded files (multer `req.files`).
 * Uploaded files are removed again if anything fails.
 */
async function createCommentWithFiles({ cardId, body = '', files = [], author = 'user', authorType = 'user' }) {
    const text = (body || '').trim();
    if (!text && files.length === 0) {
        await removeFiles(files);
        const error = new Error('Comment needs a body or at least one file');
        error.statusCode = 400;
        throw error;
    }

    // Pre-generate the id so comment + attachments are written once (no "edited" timestamp)
    const commentId = new mongoose.Types.ObjectId();
    let attachments = [];
    try {
        if (files.length) {
            attachments = await Attachment.insertMany(files.map(f => ({
                cardId,
                commentId,
                name: decodeName(f.originalname),
                mimeType: f.mimetype || 'application/octet-stream',
                size: f.size,
                storageKey: f.filename,
                uploadedBy: author,
            })));
        }
        await Comment.create({
            _id: commentId, cardId, body: text, author, authorType,
            attachments: attachments.map(a => a._id),
        });
    } catch (error) {
        await removeFiles(files);
        if (attachments.length) await Attachment.deleteMany({ commentId }).catch(() => {});
        throw error;
    }

    const populated = await Comment.findById(commentId).populate('attachments').lean();
    return serializeComment(populated);
}

/** Attach uploaded files directly to a card (not to a comment) */
async function createCardAttachments({ cardId, files = [], uploadedBy = 'user' }) {
    if (!files.length) {
        const error = new Error('No files uploaded');
        error.statusCode = 400;
        throw error;
    }
    try {
        const attachments = await Attachment.insertMany(files.map(f => ({
            cardId,
            commentId: null,
            name: decodeName(f.originalname),
            mimeType: f.mimetype || 'application/octet-stream',
            size: f.size,
            storageKey: f.filename,
            uploadedBy,
        })));
        await Card.updateOne({ _id: cardId }, { $inc: { attachmentCount: attachments.length } });
        return attachments.map(a => serializeAttachment(a.toObject()));
    } catch (error) {
        await removeFiles(files);
        throw error;
    }
}

async function getCardAttachments(cardId) {
    const attachments = await Attachment.find({ cardId, commentId: null }).sort({ createdAt: 1 }).lean();
    return attachments.map(serializeAttachment);
}

/** Delete one attachment (file + DB), detaching it from its comment or card counter */
async function deleteAttachment(id) {
    const attachment = await Attachment.findByIdAndDelete(id).lean();
    if (!attachment) return null;
    await fs.unlink(path.join(UPLOAD_DIR, attachment.storageKey)).catch(() => {});
    if (attachment.commentId) {
        await Comment.updateOne({ _id: attachment.commentId }, { $pull: { attachments: attachment._id } });
    } else {
        await Card.updateOne({ _id: attachment.cardId, attachmentCount: { $gt: 0 } }, { $inc: { attachmentCount: -1 } });
    }
    return attachment;
}

/** Remove every attachment (and its file) of the given cards — used when cards are deleted */
async function deleteAttachmentsOfCards(cardIds) {
    if (!cardIds?.length) return;
    const attachments = await Attachment.find({ cardId: { $in: cardIds } }).select('storageKey').lean();
    await Promise.all(attachments.map(a => fs.unlink(path.join(UPLOAD_DIR, a.storageKey)).catch(() => {})));
    await Attachment.deleteMany({ cardId: { $in: cardIds } });
}

async function deleteAttachmentsOfComment(commentId) {
    const attachments = await Attachment.find({ commentId }).lean();
    await Promise.all(attachments.map(a => fs.unlink(path.join(UPLOAD_DIR, a.storageKey)).catch(() => {})));
    await Attachment.deleteMany({ commentId });
}

module.exports = {
    createCommentWithFiles, deleteAttachmentsOfComment, serializeAttachment, serializeComment, removeFiles,
    createCardAttachments, getCardAttachments, deleteAttachment, deleteAttachmentsOfCards,
};
