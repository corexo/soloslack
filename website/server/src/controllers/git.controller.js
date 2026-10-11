const gitService = require('../utils/git');
const Board = require('../models/Board');
const Card = require('../models/Card');

// @desc    Git repositories available under REPOS_DIR
// @route   GET /api/git/repos
exports.getRepos = async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await gitService.listRepos() });
    } catch (error) {
        next(error);
    }
};

// @desc    Local + remote branches of a repo (most recent first)
// @route   GET /api/git/repos/:repo/branches
exports.getBranches = async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await gitService.listBranches(req.params.repo) });
    } catch (error) {
        next(error);
    }
};

// @desc    Commit graph + branch stats (ahead/behind/merged vs base) and linked tickets
// @route   GET /api/git/repos/:repo/graph?limit=150
exports.getGraph = async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 150, 20), 500);
        const graph = await gitService.getGraph(req.params.repo, limit);

        // Tickets on boards using this repo that link one of its branches
        const boards = await Board.find({ gitRepo: req.params.repo, isArchived: false }).select('_id name').lean();
        const cards = await Card.find({ boardId: { $in: boards.map(b => b._id) }, branch: { $ne: null }, isArchived: false })
            .select('_id title branch assignee boardId').lean();
        const boardNames = new Map(boards.map(b => [String(b._id), b.name]));
        graph.tickets = cards.map(c => ({ ...c, boardName: boardNames.get(String(c.boardId)) }));

        res.status(200).json({ success: true, data: graph });
    } catch (error) {
        next(error);
    }
};

// @desc    Create a branch (ref only, no checkout)
// @route   POST /api/git/repos/:repo/branches  { name, from? }
exports.createBranch = async (req, res, next) => {
    try {
        const { name, from } = req.body || {};
        if (!name?.trim()) {
            const error = new Error('Branch name is required');
            error.statusCode = 400;
            throw error;
        }
        const branch = await gitService.createBranch(req.params.repo, name.trim(), from?.trim() || undefined);
        res.status(201).json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
};
