const gitService = require('../utils/git');

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
