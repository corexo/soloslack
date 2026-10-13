const fs = require('fs');
const path = require('path');
const AppDocument = require('../models/AppDocument');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
const KEY = 'agent-skill';
const PROMPT_KEY = 'agent-prompt';
const DEFAULT_SKILL = fs.readFileSync(path.join(__dirname, '../assets/agent-skill.md'), 'utf8');
const DEFAULT_PROMPT = fs.readFileSync(path.join(__dirname, '../assets/agent-prompt.md'), 'utf8');

// URLs as the caller reaches them (agents and browser share the host machine)
const urlsFor = (req) => {
    const api = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}/api`;
    let web = process.env.PUBLIC_WEB_URL || api.replace(/\/api$/, '');
    // Requested from another device: point the web link at the same host instead of localhost
    try {
        const webUrl = new URL(web);
        const host = req.hostname;
        if (LOCAL_HOSTS.has(webUrl.hostname) && host && !LOCAL_HOSTS.has(host)) {
            webUrl.hostname = host;
            web = webUrl.toString().replace(/\/$/, '');
        }
    } catch { /* keep configured value */ }
    return { api, web };
};

const render = (template, req) => {
    const { api, web } = urlsFor(req);
    return template.replaceAll('{{API_URL}}', api).replaceAll('{{WEB_URL}}', web);
};

const getTemplate = async (key = KEY, fallback = DEFAULT_SKILL) => {
    const doc = await AppDocument.findOne({ key }).lean();
    return { template: doc?.content || fallback, isDefault: !doc, updatedAt: doc?.updatedAt || null };
};

const saveTemplate = async (key, content) => {
    if (typeof content !== 'string' || !content.trim()) {
        const error = new Error('Content must not be empty');
        error.statusCode = 400;
        throw error;
    }
    await AppDocument.findOneAndUpdate({ key }, { content }, { upsert: true, runValidators: true });
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
        await saveTemplate(KEY, req.body?.content);
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

// ── Agent prompt (handed to an agent to get it started) ─────────

// @desc    Prompt template. Placeholders: {{AGENT_NAME}} {{TOKEN}} {{API_URL}} {{WEB_URL}} {{SKILL_URL}}.
//          AGENT_NAME/TOKEN are filled in by the UI (the token only exists client-side).
// @route   GET /api/agents/prompt
exports.getPrompt = async (req, res, next) => {
    try {
        const { template, isDefault, updatedAt } = await getTemplate(PROMPT_KEY, DEFAULT_PROMPT);
        const { api, web } = urlsFor(req);
        res.status(200).json({
            success: true,
            data: { template, isDefault, updatedAt, urls: { api, web, skill: `${api}/agents/skill.md` } },
        });
    } catch (error) {
        next(error);
    }
};

// @route   PUT /api/agents/prompt  { content }
exports.updatePrompt = async (req, res, next) => {
    try {
        await saveTemplate(PROMPT_KEY, req.body?.content);
        return exports.getPrompt(req, res, next);
    } catch (error) {
        next(error);
    }
};

// @route   DELETE /api/agents/prompt
exports.resetPrompt = async (req, res, next) => {
    try {
        await AppDocument.deleteOne({ key: PROMPT_KEY });
        return exports.getPrompt(req, res, next);
    } catch (error) {
        next(error);
    }
};
