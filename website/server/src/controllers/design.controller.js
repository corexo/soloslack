const DesignChapter = require('../models/DesignChapter');
const DesignEntry = require('../models/DesignEntry');

const ENTRY_TYPES = ['gallery', 'tokens', 'snippet', 'doc'];

// @desc    Get all design book chapters and entries
// @route   GET /api/design
exports.getDesignBook = async (req, res, next) => {
    try {
        const { workspaceId } = req.query;
        const query = {};

        if (workspaceId) {
            const wsVal = (workspaceId === 'none' || workspaceId === 'null') ? null : workspaceId;
            query.workspaceId = wsVal;
        }

        const [chapters, entries] = await Promise.all([
            DesignChapter.find(query).sort({ order: 1, createdAt: 1 }).lean(),
            DesignEntry.find(query).sort({ order: 1, createdAt: 1 }).lean(),
        ]);

        res.status(200).json({ success: true, data: { chapters, entries } });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new chapter
// @route   POST /api/design/chapters
exports.createChapter = async (req, res, next) => {
    try {
        const { workspaceId, title } = req.body;

        const chapter = await DesignChapter.create({ workspaceId: workspaceId || null, title });

        res.status(201).json({ success: true, data: chapter });
    } catch (error) {
        next(error);
    }
};

// @desc    Update chapter
// @route   PATCH /api/design/chapters/:id
exports.updateChapter = async (req, res, next) => {
    try {
        const { title, order } = req.body;

        const update = {};
        if (title !== undefined) update.title = title;
        if (order !== undefined) update.order = order;

        const chapter = await DesignChapter.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true,
        }).lean();

        if (!chapter) {
            const error = new Error('Chapter not found');
            error.statusCode = 404;
            throw error;
        }

        res.status(200).json({ success: true, data: chapter });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete chapter and all its entries
// @route   DELETE /api/design/chapters/:id
exports.deleteChapter = async (req, res, next) => {
    try {
        const chapter = await DesignChapter.findByIdAndDelete(req.params.id);

        if (!chapter) {
            const error = new Error('Chapter not found');
            error.statusCode = 404;
            throw error;
        }

        await DesignEntry.deleteMany({ chapterId: req.params.id });

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// @desc    Create new entry
// @route   POST /api/design/entries
exports.createEntry = async (req, res, next) => {
    try {
        const { workspaceId, chapterId, type, title, data } = req.body;

        if (!ENTRY_TYPES.includes(type)) {
            const error = new Error('Invalid type — must be one of: gallery, tokens, snippet, doc');
            error.statusCode = 400;
            throw error;
        }

        const entry = await DesignEntry.create({
            workspaceId: workspaceId || null,
            chapterId: chapterId || null,
            type,
            title,
            data,
        });

        res.status(201).json({ success: true, data: entry });
    } catch (error) {
        next(error);
    }
};

// @desc    Update entry
// @route   PATCH /api/design/entries/:id
exports.updateEntry = async (req, res, next) => {
    try {
        const { title, data, chapterId, order } = req.body;

        const update = {};
        if (title !== undefined) update.title = title;
        if (data !== undefined) update.data = data;
        if (chapterId !== undefined) update.chapterId = chapterId;
        if (order !== undefined) update.order = order;

        const entry = await DesignEntry.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true,
        }).lean();

        if (!entry) {
            const error = new Error('Entry not found');
            error.statusCode = 404;
            throw error;
        }

        res.status(200).json({ success: true, data: entry });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete entry
// @route   DELETE /api/design/entries/:id
exports.deleteEntry = async (req, res, next) => {
    try {
        const entry = await DesignEntry.findByIdAndDelete(req.params.id);

        if (!entry) {
            const error = new Error('Entry not found');
            error.statusCode = 404;
            throw error;
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

// @desc    Bulk reorder chapters and entries
// @route   POST /api/design/reorder
exports.reorder = async (req, res, next) => {
    try {
        const { chapters, entries } = req.body;
        const updates = [];

        if (Array.isArray(chapters)) {
            chapters.forEach(({ id, order }) => {
                updates.push(
                    DesignChapter.findByIdAndUpdate(id, { $set: { order } })
                );
            });
        }

        if (Array.isArray(entries)) {
            entries.forEach(({ id, chapterId, order }) => {
                const update = { $set: { order } };
                if (chapterId !== undefined) {
                    update.$set.chapterId = chapterId;
                }
                updates.push(
                    DesignEntry.findByIdAndUpdate(id, update)
                );
            });
        }

        await Promise.all(updates);

        res.status(200).json({ message: 'ok' });
    } catch (error) {
        next(error);
    }
};
