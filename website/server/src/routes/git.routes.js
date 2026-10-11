const express = require('express');
const router = express.Router();
const gitController = require('../controllers/git.controller');

router.get('/repos', gitController.getRepos);
router.route('/repos/:repo/branches')
    .get(gitController.getBranches)
    .post(gitController.createBranch);

router.get('/repos/:repo/graph', gitController.getGraph);

module.exports = router;
