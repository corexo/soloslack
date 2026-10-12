const express = require('express');
const router = express.Router();
const planner = require('../controllers/planner.controller');

router.get('/:workspace/context', planner.getContext);
router.route('/:workspace/messages')
    .get(planner.getMessages)
    .post(planner.addMessage)
    .delete(planner.clearMessages);
router.patch('/:workspace/messages/:messageId', planner.setActionStatus);

module.exports = router;
