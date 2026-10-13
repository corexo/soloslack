const mongoose = require('mongoose');

// Entry payload shapes by type (documentation only — no runtime validation):
// gallery: { items: [{ url, caption }] }
// tokens:  { colors: [{ name, value }],
//            typography: [{ name, family, size, weight, sample }],
//            spacing: [{ name, value }] }
// snippet: { html, css }
// doc:     { body }  (Markdown)

const designEntrySchema = new mongoose.Schema(
    {
        workspaceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Workspace',
            default: null,
        },
        chapterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DesignChapter',
            default: null,
        },
        type: {
            type: String,
            enum: ['gallery', 'tokens', 'snippet', 'doc'],
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

module.exports = mongoose.model('DesignEntry', designEntrySchema);
