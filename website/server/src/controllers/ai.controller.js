const { Readable } = require('stream');

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
