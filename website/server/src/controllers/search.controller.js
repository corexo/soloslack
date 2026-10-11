const Note = require('../models/Note');
const Card = require('../models/Card');
const Board = require('../models/Board');

// @desc    Full-text search across notes (title + body) and cards (title + description)
// @route   GET /api/search?q=
exports.search = async (req, res, next) => {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(200).json({ success: true, data: { notes: [], cards: [] } });
        }

        const regex = { $regex: q.trim(), $options: 'i' };

        const [notes, cards] = await Promise.all([
            Note.find({ isArchived: false, $or: [{ title: regex }, { body: regex }] })
                .select('_id title body updatedAt')
                .sort({ updatedAt: -1 })
                .limit(10)
                .lean(),

            Card.find({
                isArchived: false,
                $or: [{ title: regex }, { description: regex }],
            })
                .select('_id title description priority boardId')
                .populate('boardId', '_id name')
                .sort({ updatedAt: -1 })
                .limit(10)
                .lean(),
        ]);

        res.status(200).json({ success: true, data: { notes, cards } });
    } catch (error) {
        next(error);
    }
};

// @desc    Everything searchable, for client-side semantic (embedding) search
// @route   GET /api/search/corpus
exports.corpus = async (req, res, next) => {
    try {
        const [notes, cards, boards] = await Promise.all([
            Note.find({ isArchived: false }).select('_id title body updatedAt').lean(),
            Card.find({ isArchived: false }).select('_id title description boardId updatedAt').lean(),
            Board.find({ isArchived: false }).select('_id name').lean(),
        ]);
        const boardNames = new Map(boards.map(b => [String(b._id), b.name]));

        res.status(200).json({
            success: true,
            data: {
                notes: notes.map(n => ({
                    _id: n._id, title: n.title, text: (n.body || '').slice(0, 1500), updatedAt: n.updatedAt,
                })),
                cards: cards
                    .filter(c => boardNames.has(String(c.boardId)))
                    .map(c => ({
                        _id: c._id, title: c.title, text: (c.description || '').slice(0, 1500),
                        boardId: c.boardId, boardName: boardNames.get(String(c.boardId)), updatedAt: c.updatedAt,
                    })),
            },
        });
    } catch (error) {
        next(error);
    }
};
