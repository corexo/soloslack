const express = require('express');
const router = express.Router();
const agentsController = require('../controllers/agents.controller');
const agentSkill = require('../controllers/agentSkill.controller');

// Before /:id routes
router.route('/skill')
    .get(agentSkill.getSkill)
    .put(agentSkill.updateSkill)
    .delete(agentSkill.resetSkill);
router.get('/skill.md', agentSkill.getSkillMarkdown);
router.get('/network', agentsController.getNetwork);
router.get('/activity', agentsController.getActivity);
router.get('/activity/stream', agentsController.streamActivity);

router.route('/')
    .get(agentsController.getAgents)
    .post(agentsController.createAgent);

router.post('/:id/rotate', agentsController.rotateToken);
router.delete('/:id', agentsController.deleteAgent);

module.exports = router;
