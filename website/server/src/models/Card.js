const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
    {
        columnId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Column',
            required: [true, 'columnId is required'],
        },
        boardId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Board',
            required: [true, 'boardId is required'],
        },
        title: {
            type: String,
            required: [true, 'Card title is required'],
            trim: true,
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        description: {
            type: String,
            default: '',
            maxlength: [20000, 'Description cannot exceed 20000 characters'],
        },
        priority: {
            type: String,
            enum: {
                values: ['low', 'medium', 'high'],
                message: 'Priority must be low, medium, or high',
            },
            default: 'medium',
        },
        order: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        linkedNoteId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Note',
            default: null,
        },
        // Name of the AI agent this ticket is assigned to (see Agent model)
        assignee: {
            type: String,
            default: null,
            trim: true,
            lowercase: true,
        },
        // Git branch linked to this ticket (in the board's gitRepo)
        branch: {
            type: String,
            default: null,
            trim: true,
            maxlength: 200,
        },
        // Files attached to the ticket itself (comment attachments not included)
        attachmentCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        dueDate: {
            type: Date,
            default: null,
        },
        isArchived: {
            type: Boolean,
            default: false,
        },
        labels: {
            type: [
                {
                    text: { type: String, required: true, trim: true, maxlength: 30 },
                    color: {
                        type: String,
                        required: true,
                        enum: ['red', 'orange', 'amber', 'green', 'blue', 'purple'],
                    },
                },
            ],
            default: [],
            validate: [arr => arr.length <= 6, 'A card can have at most 6 labels'],
        },
        checklist: {
            type: [
                {
                    text: { type: String, required: true, trim: true, maxlength: 200 },
                    completed: { type: Boolean, default: false },
                },
            ],
            default: [],
        },
    },
    { timestamps: true }
);

cardSchema.index({ columnId: 1, order: 1 });
cardSchema.index({ boardId: 1 });
cardSchema.index({ boardId: 1, isArchived: 1 });
cardSchema.index({ assignee: 1, isArchived: 1 });

module.exports = mongoose.model('Card', cardSchema);
