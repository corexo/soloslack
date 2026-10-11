const express = require('express');
const router = express.Router();
const { getColumns, createColumn, updateColumn, deleteColumn, reorderColumns } = require('../controllers/columns.controller');

router.route('/')
    .get(getColumns)
    .post(createColumn);

// Before /:id
router.patch('/reorder', reorderColumns);

router.route('/:id')
    .patch(updateColumn)
    .delete(deleteColumn);

module.exports = router;
