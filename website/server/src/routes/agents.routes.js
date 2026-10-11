const express = require('express');
const router = express.Router();
const agentsController = require('../controllers/agents.controller');

router.route('/')
    .get(agentsController.getAgents)
    .post(agentsController.createAgent);

router.post('/:id/rotate', agentsController.rotateToken);
router.delete('/:id', agentsController.deleteAgent);

module.exports = router;
