const express = require('express');
const router = express.Router();
const { agentAuth } = require('../middleware/agentAuth');
const { upload, MAX_FILES } = require('../config/uploads');
const agentApi = require('../controllers/agentApi.controller');

// Everything here is called by AI agents with their own token
router.use(agentAuth);

router.get('/me', agentApi.me);
router.get('/tasks', agentApi.getTasks);
router.get('/tasks/:id', agentApi.getTask);
router.patch('/tasks/:id', agentApi.updateTask);
router.post('/tasks/:id/comments', upload.array('files', MAX_FILES), agentApi.addComment);

module.exports = router;
