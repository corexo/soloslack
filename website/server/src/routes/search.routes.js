const express = require('express');
const router = express.Router();
const { search, corpus } = require('../controllers/search.controller');

router.get('/', search);
router.get('/corpus', corpus);

module.exports = router;
