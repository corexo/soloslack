const express = require('express');
const router = express.Router();
const gitController = require('../controllers/git.controller');

router.get('/repos', gitController.getRepos);
router.route('/repos/:repo/branches')
    .get(gitController.getBranches)
    .post(gitController.createBranch);

module.exports = router;
