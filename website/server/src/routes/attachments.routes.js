const express = require('express');
const router = express.Router();
const { getRaw, deleteAttachment } = require('../controllers/attachments.controller');

router.get('/:id/raw', getRaw);
router.delete('/:id', deleteAttachment);

module.exports = router;
