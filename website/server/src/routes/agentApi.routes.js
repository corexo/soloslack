const express = require('express');
const router = express.Router();
const { agentAuth } = require('../middleware/agentAuth');
const { upload, MAX_FILES } = require('../config/uploads');
const agentApi = require('../controllers/agentApi.controller');
const trackAgentActivity = require('../middleware/trackAgentActivity');

// Everything here is called by AI agents with their own token
router.use(agentAuth);
router.use(trackAgentActivity);

router.get('/me', agentApi.me);
router.get('/tasks', agentApi.getTasks);
router.get('/tasks/:id', agentApi.getTask);
router.patch('/tasks/:id', agentApi.updateTask);
router.post('/tasks/:id/comments', upload.array('files', MAX_FILES), agentApi.addComment);
router.post('/tasks/:id/attachments', upload.array('files', MAX_FILES), agentApi.addAttachments);

module.exports = router;
