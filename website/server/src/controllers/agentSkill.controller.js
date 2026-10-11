const fs = require('fs');
const path = require('path');
const AppDocument = require('../models/AppDocument');

const KEY = 'agent-skill';
const DEFAULT_SKILL = fs.readFileSync(path.join(__dirname, '../assets/agent-skill.md'), 'utf8');

// URLs as the caller reaches them (agents and browser share the host machine)
const urlsFor = (req) => {
    const api = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}/api`;
    const web = process.env.PUBLIC_WEB_URL || api.replace(/\/api$/, '');
    return { api, web };
};

const render = (template, req) => {
    const { api, web } = urlsFor(req);
    return template.replaceAll('{{API_URL}}', api).replaceAll('{{WEB_URL}}', web);
};

const getTemplate = async () => {
    const doc = await AppDocument.findOne({ key: KEY }).lean();
    return { template: doc?.content || DEFAULT_SKILL, isDefault: !doc, updatedAt: doc?.updatedAt || null };
};

// @desc    Agent skill for editing in the UI (template with {{API_URL}}/{{WEB_URL}} + rendered preview)
// @route   GET /api/agents/skill
exports.getSkill = async (req, res, next) => {
    try {
        const { template, isDefault, updatedAt } = await getTemplate();
        res.status(200).json({ success: true, data: { template, rendered: render(template, req), isDefault, updatedAt } });
    } catch (error) {
        next(error);
    }
};

// @desc    Rendered SKILL.md as plain markdown — what agents download
// @route   GET /api/agents/skill.md
exports.getSkillMarkdown = async (req, res, next) => {
    try {
        const { template } = await getTemplate();
        res.type('text/markdown; charset=utf-8');
        if (req.query.download !== undefined) res.attachment('SKILL.md');
        res.send(render(template, req));
    } catch (error) {
        next(error);
    }
};

// @desc    Save a customised skill
// @route   PUT /api/agents/skill  { content }
exports.updateSkill = async (req, res, next) => {
    try {
        const content = req.body?.content;
        if (typeof content !== 'string' || !content.trim()) {
            const error = new Error('Skill content must not be empty');
            error.statusCode = 400;
            throw error;
        }
        await AppDocument.findOneAndUpdate({ key: KEY }, { content }, { upsert: true, runValidators: true });
        return exports.getSkill(req, res, next);
    } catch (error) {
        next(error);
    }
};

// @desc    Back to the built-in default skill
// @route   DELETE /api/agents/skill
exports.resetSkill = async (req, res, next) => {
    try {
        await AppDocument.deleteOne({ key: KEY });
        return exports.getSkill(req, res, next);
    } catch (error) {
        next(error);
    }
};
