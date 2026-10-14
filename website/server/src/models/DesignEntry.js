const mongoose = require('mongoose');

// Entry payload shapes by type (documentation only — no runtime validation):
// gallery: { items: [{ url, caption }] }
// tokens:  { colors: [{ name, value }],
//            typography: [{ name, family, size, weight, sample }],
//            spacing: [{ name, value }] }
// snippet: { html, css }
// doc:     { body }  (Markdown)
// component: { scanKey, name, path, props, usageCount, snippet, exported, description, status,
//              variants, screenshots: [{ url, caption }], missing }
// screen:  { scanKey, route, path, router, flow, description, screenshots: [{ url, caption }], missing }
// Entries created by a repo scan carry data.scanKey; tokens from a scan use scanKey 'tokens:auto'.

const designEntrySchema = new mongoose.Schema(
    {
        workspaceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Workspace',
            default: null,
        },
        // Design book of a git repo; null = workspace book
        repo: {
            type: String,
            default: null,
        },
        chapterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DesignChapter',
            default: null,
        },
        type: {
            type: String,
            enum: ['gallery', 'tokens', 'snippet', 'doc', 'component', 'screen'],
            required: [true, 'Type is required'],
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
        data: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

designEntrySchema.index({ workspaceId: 1, chapterId: 1, order: 1 });
designEntrySchema.index({ repo: 1, 'data.scanKey': 1 });

module.exports = mongoose.model('DesignEntry', designEntrySchema);
