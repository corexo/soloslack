const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const Attachment = require('../models/Attachment');
const Comment = require('../models/Comment');
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

async function deleteAttachmentsOfComment(commentId) {
    const attachments = await Attachment.find({ commentId }).lean();
    await Promise.all(attachments.map(a => fs.unlink(path.join(UPLOAD_DIR, a.storageKey)).catch(() => {})));
    await Attachment.deleteMany({ commentId });
}

module.exports = { createCommentWithFiles, deleteAttachmentsOfComment, serializeAttachment, serializeComment, removeFiles };
