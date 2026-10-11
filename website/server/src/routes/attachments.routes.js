const express = require('express');
const router = express.Router();
const { getRaw } = require('../controllers/attachments.controller');

router.get('/:id/raw', getRaw);

module.exports = router;
