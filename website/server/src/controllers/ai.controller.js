const { Readable } = require('stream');
const AISettings = require('../models/AISettings');
const AIUsage = require('../models/AIUsage');

const PROVIDERS = ['openai', 'anthropic', 'gemini', 'custom'];
const CONFIG_FIELDS = ['model', 'baseUrl', 'embeddingModel', 'useProxy'];
const MAX_USAGE_RECORDS = 5000;

const toClient = (doc) => ({
    activeProvider: doc?.activeProvider || null,
    apiKeys: doc?.apiKeys || {},
    config: doc?.config || {},
    exists: Boolean(doc),
});

// @desc    Get AI settings
// @route   GET /api/ai/settings
exports.getSettings = async (req, res, next) => {
    try {
        const doc = await AISettings.findOne({ key: 'default' }).lean();
        res.status(200).json({ success: true, data: toClient(doc) });
    } catch (error) {
        next(error);
    }
};

// @desc    Partially update AI settings (merged per provider)
// @route   PUT /api/ai/settings
exports.updateSettings = async (req, res, next) => {
    try {
        const { activeProvider, apiKeys = {}, config = {} } = req.body || {};
        const $set = {};

        if (activeProvider !== undefined) {
            if (activeProvider !== null && !PROVIDERS.includes(activeProvider)) {
                return res.status(400).json({ success: false, error: `Unknown provider: ${activeProvider}` });
            }
            $set.activeProvider = activeProvider;
        }
        for (const provider of PROVIDERS) {
            if (typeof apiKeys[provider] === 'string') $set[`apiKeys.${provider}`] = apiKeys[provider];
            for (const field of CONFIG_FIELDS) {
                const value = config[provider]?.[field];
                if (value !== undefined) $set[`config.${provider}.${field}`] = value;
            }
        }

        const doc = await AISettings.findOneAndUpdate(
            { key: 'default' },
            { $set },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        res.status(200).json({ success: true, data: toClient(doc) });
    } catch (error) {
        next(error);
    }
};

// @desc    Get AI usage records (oldest first)
// @route   GET /api/ai/usage
exports.getUsage = async (req, res, next) => {
    try {
        const records = await AIUsage.find()
            .sort({ timestamp: -1 })
            .limit(MAX_USAGE_RECORDS)
            .lean();
        const data = records.reverse().map(r => ({
            timestamp: new Date(r.timestamp).getTime(),
            provider: r.provider,
            model: r.model,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            totalTokens: r.totalTokens,
        }));
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Log one or more AI usage records
// @route   POST /api/ai/usage  (body: record or array of records)
exports.logUsage = async (req, res, next) => {
    try {
        const input = Array.isArray(req.body) ? req.body : [req.body];
        const records = input
            .filter(r => r && typeof r.provider === 'string')
            .map(r => ({
                timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
                provider: r.provider,
                model: r.model || 'unknown',
                inputTokens: Number(r.inputTokens) || 0,
                outputTokens: Number(r.outputTokens) || 0,
                totalTokens: Number(r.totalTokens) || 0,
            }));
        if (records.length) await AIUsage.insertMany(records);
        res.status(201).json({ success: true, data: { inserted: records.length } });
    } catch (error) {
        next(error);
    }
};

// @desc    Clear all AI usage records
// @route   DELETE /api/ai/usage
exports.clearUsage = async (req, res, next) => {
    try {
        await AIUsage.deleteMany({});
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

// Hosts that mean "this machine" from the browser's point of view. Inside Docker they
// point at the container itself, so rewrite them (AI_PROXY_LOCALHOST_ALIAS=host.docker.internal)
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

const resolveTarget = (raw) => {
    let url;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (!['http:', 'https:'].includes(url.protocol)) return null;

    const alias = process.env.AI_PROXY_LOCALHOST_ALIAS;
    if (alias && LOCAL_HOSTS.has(url.hostname)) url.hostname = alias;
    return url;
};

// @desc    Forward an OpenAI-compatible request to a custom/local AI server.
//          Avoids browser CORS restrictions of local servers (e.g. Unsloth Studio, LM Studio).
// @route   POST /api/ai/proxy  (target in X-AI-Target-URL header)
exports.proxy = async (req, res) => {
    const target = resolveTarget(req.get('x-ai-target-url') || '');
    if (!target) {
        return res.status(400).json({ error: { message: 'Missing or invalid X-AI-Target-URL header' } });
    }

    // Stop generating upstream if the browser goes away mid-stream
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    try {
        const headers = { 'Content-Type': 'application/json' };
        const auth = req.get('authorization');
        if (auth) headers.Authorization = auth;

        const upstream = await fetch(target, {
            method: 'POST',
            headers,
            body: JSON.stringify(req.body),
            signal: abort.signal,
        });

        res.status(upstream.status);
        const contentType = upstream.headers.get('content-type');
        if (contentType) res.set('Content-Type', contentType);
        if (!upstream.body) return res.end();

        Readable.fromWeb(upstream.body)
            .on('error', () => res.end())
            .pipe(res);
    } catch (error) {
        if (abort.signal.aborted) return;
        res.status(502).json({
            error: { message: `Could not reach ${target.origin}: ${error.cause?.code || error.message}` },
        });
    }
};
