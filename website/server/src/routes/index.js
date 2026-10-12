const express = require('express');
const router = express.Router();

router.use('/notes', require('./notes.routes'));
router.use('/files', require('./file.routes'));
router.use('/boards', require('./boards.routes'));
router.use('/workspaces', require('./workspaces.routes'));
router.use('/columns', require('./columns.routes'));
router.use('/cards', require('./cards.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/search', require('./search.routes'));
router.use('/archive', require('./archive.routes'));
router.use('/ai', require('./ai.routes'));
router.use('/agents', require('./agents.routes'));
router.use('/agent', require('./agentApi.routes'));
router.use('/attachments', require('./attachments.routes'));
router.use('/git', require('./git.routes'));
router.use('/planner', require('./planner.routes'));

module.exports = router;
