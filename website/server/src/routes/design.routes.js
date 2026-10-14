const express = require('express');
const router = express.Router();
const designScan = require('../controllers/designScan.controller');
const { upload, MAX_FILES } = require('../config/uploads');
const { getDesignBook, createChapter, updateChapter, deleteChapter, createEntry, updateEntry, deleteEntry, reorder } = require('../controllers/design.controller');

router.route('/').get(getDesignBook);

// Repo design books: scan + local image uploads
router.route('/scan').get(designScan.getScanInfo).post(designScan.scan);
router.post('/assets', upload.array('files', MAX_FILES), designScan.uploadAssets);

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
