const path = require('path');
const contentDisposition = require('content-disposition');
const mongoose = require('mongoose');
const Attachment = require('../models/Attachment');
const { UPLOAD_DIR } = require('../config/uploads');
const Card = require('../models/Card');
const { createCardAttachments, getCardAttachments, deleteAttachment, removeFiles } = require('../utils/attachments');

const findCardOr404 = async (cardId) => {
    const card = mongoose.isValidObjectId(cardId) ? await Card.findById(cardId).select('_id').lean() : null;
    if (!card) {
        const error = new Error('Card not found');
        error.statusCode = 404;
        throw error;
    }
    return card;
};

// @desc    Files attached to a ticket (not to its comments)
// @route   GET /api/cards/:cardId/attachments
exports.getCardAttachments = async (req, res, next) => {
    try {
        const card = await findCardOr404(req.params.cardId);
        res.status(200).json({ success: true, data: await getCardAttachments(card._id) });
    } catch (error) {
        next(error);
    }
};

// @desc    Upload files to a ticket (multipart `files`)
// @route   POST /api/cards/:cardId/attachments
exports.uploadCardAttachments = async (req, res, next) => {
    try {
        const card = await findCardOr404(req.params.cardId);
        const data = await createCardAttachments({ cardId: card._id, files: req.files || [], uploadedBy: req.agent?.name || 'user' });
        res.status(201).json({ success: true, data });
    } catch (error) {
        await removeFiles(req.files);
        next(error);
    }
};

// @desc    Delete an attachment (ticket or comment attachment)
// @route   DELETE /api/attachments/:id
exports.deleteAttachment = async (req, res, next) => {
    try {
        const deleted = mongoose.isValidObjectId(req.params.id) ? await deleteAttachment(req.params.id) : null;
        if (!deleted) {
            const error = new Error('Attachment not found');
            error.statusCode = 404;
            throw error;
        }
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// Rendered inline in the UI; everything else is forced to download so uploaded
// HTML/SVG can't run script on the API origin
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.log', '.json', '.csv', '.yml', '.yaml']);

// @desc    Download / display an attachment
// @route   GET /api/attachments/:id/raw
exports.getRaw = async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
        const attachment = await Attachment.findById(req.params.id).lean();
        if (!attachment) return res.status(404).json({ success: false, error: 'Attachment not found' });

        const ext = path.extname(attachment.name).toLowerCase();
        res.set('X-Content-Type-Options', 'nosniff');
        const inline = INLINE_TYPES.has(attachment.mimeType)
            || TEXT_EXTENSIONS.has(ext) || attachment.mimeType.startsWith('text/');
        if (INLINE_TYPES.has(attachment.mimeType)) res.type(attachment.mimeType);
        else if (inline) res.type('text/plain; charset=utf-8');
        else res.type('application/octet-stream');
        res.set('Content-Disposition', contentDisposition(attachment.name, { type: inline ? 'inline' : 'attachment' }));

        res.sendFile(attachment.storageKey, { root: UPLOAD_DIR }, (err) => {
            if (err && !res.headersSent) res.status(404).json({ success: false, error: 'File missing on disk' });
        });
    } catch (error) {
        next(error);
    }
};
