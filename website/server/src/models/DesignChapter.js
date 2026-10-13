const mongoose = require('mongoose');

const designChapterSchema = new mongoose.Schema(
    {
        workspaceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Workspace',
            default: null,
        },
        title: {
            type: String,
            default: '',
            trim: true,
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('DesignChapter', designChapterSchema);
