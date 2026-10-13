const express = require('express');
const router = express.Router();
const { getDesignBook, createChapter, updateChapter, deleteChapter, createEntry, updateEntry, deleteEntry, reorder } = require('../controllers/design.controller');

router.route('/').get(getDesignBook);

router.route('/chapters')
    .post(createChapter);

router.route('/chapters/:id')
    .patch(updateChapter)
    .delete(deleteChapter);

router.route('/entries')
    .post(createEntry);

router.route('/entries/:id')
    .patch(updateEntry)
    .delete(deleteEntry);

router.post('/reorder', reorder);

module.exports = router;
