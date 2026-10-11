const express = require('express');
const router = express.Router();
const agentsController = require('../controllers/agents.controller');

// Before /:id routes
router.get('/network', agentsController.getNetwork);
router.get('/activity', agentsController.getActivity);
router.get('/activity/stream', agentsController.streamActivity);

router.route('/')
    .get(agentsController.getAgents)
    .post(agentsController.createAgent);

router.post('/:id/rotate', agentsController.rotateToken);
router.delete('/:id', agentsController.deleteAgent);

module.exports = router;
