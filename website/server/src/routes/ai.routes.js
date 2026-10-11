const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

router.get('/settings', aiController.getSettings);
router.put('/settings', aiController.updateSettings);
router.get('/usage', aiController.getUsage);
router.post('/usage', aiController.logUsage);
router.delete('/usage', aiController.clearUsage);
router.post('/proxy', aiController.proxy);

module.exports = router;
