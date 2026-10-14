const mongoose = require('mongoose');

const designChapterSchema = new mongoose.Schema(
    {
        workspaceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Workspace',
            default: null,
        },
        // Design book of a git repo (directory under REPOS_DIR); null = workspace book
        repo: {
            type: String,
            default: null,
        },
        // Set on chapters created by a repo scan, so a rescan finds them again
        scanKey: {
            type: String,
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
