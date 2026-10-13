'use client';
import { API_BASE } from '@/lib/apiBase';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from './SettingsContext';
import { callProvider, streamProvider, getEmbedding, validateKey } from '@/lib/ai/providers';
import { logUsage } from '@/lib/ai/tokenTracker';

const AIContext = createContext(null);

// Rate limit: max 10 requests per minute per the spec
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

// Backend proxy for custom endpoints that don't allow browser CORS
const AI_PROXY_URL = `${API_BASE}/ai/proxy`;

export function AIProvider({ children }) {
    const {
        apiKeys, updateApiKeys, aiConfig, updateAIConfig, aiLoaded,
        activeProvider, updateActiveProvider: setActiveProvider,
    } = useSettings();

    // Validation state per provider
    const [keyStatus, setKeyStatus] = useState({ openai: null, anthropic: null, gemini: null, custom: null });
    const [isValidating, setIsValidating] = useState(false);

    // Rate limiting
    const requestLog = useRef([]);

    // Custom (local) endpoints need URL + model; the key is optional there
    const isProviderReady = useCallback((provider) => {
        if (provider === 'custom') {
            return Boolean(aiConfig.custom?.baseUrl?.trim() && aiConfig.custom?.model?.trim());
        }
        return Boolean(apiKeys[provider]?.trim());
    }, [apiKeys, aiConfig]);

    // Options passed to the provider layer (model override, custom endpoint)
    const getProviderOptions = useCallback((provider) => {
        const cfg = aiConfig[provider] || {};
        const options = {};
        if (cfg.model?.trim()) options.model = cfg.model.trim();
        if (provider === 'custom') {
            options.baseUrl = cfg.baseUrl?.trim();
            options.embeddingModel = cfg.embeddingModel?.trim();
            if (cfg.useProxy !== false) options.proxyUrl = AI_PROXY_URL;
        }
        return options;
    }, [aiConfig]);

    // Auto-select provider if only one is configured
    useEffect(() => {
        if (!aiLoaded || activeProvider) return;
        const providers = ['openai', 'anthropic', 'gemini', 'custom'];
        const available = providers.filter(isProviderReady);
        if (available.length === 1) setActiveProvider(available[0]);
    }, [aiLoaded, isProviderReady, activeProvider, setActiveProvider]);

    const isConfigured = Boolean(activeProvider && isProviderReady(activeProvider));

    // Check rate limit
    const checkRateLimit = useCallback(() => {
        const now = Date.now();
        requestLog.current = requestLog.current.filter(t => now - t < RATE_WINDOW_MS);
        if (requestLog.current.length >= RATE_LIMIT) {
            const oldestReq = requestLog.current[0];
            const waitSec = Math.ceil((RATE_WINDOW_MS - (now - oldestReq)) / 1000);
            throw new Error(`Rate limit reached. Please wait ${waitSec}s before trying again.`);
        }
        requestLog.current.push(now);
    }, []);

    // Get remaining requests count
    const getRemainingRequests = useCallback(() => {
        const now = Date.now();
        requestLog.current = requestLog.current.filter(t => now - t < RATE_WINDOW_MS);
        return RATE_LIMIT - requestLog.current.length;
    }, []);

    /**
     * Unified AI request function.
     * @param {Array} messages - OpenAI-format messages
     * @param {Object} options - { maxTokens, temperature }
     * @returns {{ text: string, usage: object }}
     */
    const askAI = useCallback(async (messages, options = {}) => {
        if (!isConfigured) throw new Error('AI is not configured. Set up a provider in Settings.');
        checkRateLimit();
        const result = await callProvider(activeProvider, apiKeys[activeProvider], messages, { ...getProviderOptions(activeProvider), ...options });
        // Auto-log token usage for analytics
        if (result.usage) {
            logUsage({
                provider: result.provider || activeProvider,
                model: result.model || 'unknown',
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens,
            });
        }
        return result;
    }, [isConfigured, activeProvider, apiKeys, getProviderOptions, checkRateLimit]);

    /**
     * Streaming AI request. Returns an async generator yielding text chunks.
     */
    const askAIStream = useCallback(async function* (messages, options = {}) {
        if (!isConfigured) throw new Error('AI is not configured. Set up a provider in Settings.');
        checkRateLimit();
        yield* streamProvider(activeProvider, apiKeys[activeProvider], messages, { ...getProviderOptions(activeProvider), ...options });
    }, [isConfigured, activeProvider, apiKeys, getProviderOptions, checkRateLimit]);

    /**
     * Which provider/model embeddings come from. Anthropic (and custom endpoints
     * without an embedding model) can't embed — fall back to OpenAI/Gemini keys.
     */
    const resolveEmbedding = useCallback(() => {
        const canEmbed = activeProvider === 'custom'
            ? Boolean(aiConfig.custom?.embeddingModel?.trim())
            : activeProvider !== 'anthropic';
        const provider = canEmbed
            ? activeProvider
            : (apiKeys.openai ? 'openai' : apiKeys.gemini ? 'gemini' : null);
        if (!provider) return null;
        const model = provider === 'custom' ? aiConfig.custom.embeddingModel.trim()
            : provider === 'gemini' ? 'text-embedding-004' : 'text-embedding-3-small';
        return { provider, model, key: `${provider}:${model}` };
    }, [activeProvider, apiKeys, aiConfig]);

    /**
     * Get embedding vector for text, or vectors for an array of texts (one request).
     */
    const embed = useCallback(async (text) => {
        if (!isConfigured) throw new Error('AI is not configured.');
        const target = resolveEmbedding();
        if (!target) throw new Error('Embeddings require an OpenAI or Gemini key, or an embedding model on the custom provider.');
        const { provider } = target;
        // Local endpoints have no quota to protect
        if (provider !== 'custom') checkRateLimit();
        // Chat model overrides don't apply to embeddings
        const { baseUrl, embeddingModel, proxyUrl } = getProviderOptions(provider);
        return getEmbedding(provider, apiKeys[provider], text, { baseUrl, embeddingModel, proxyUrl });
    }, [isConfigured, resolveEmbedding, apiKeys, getProviderOptions, checkRateLimit]);

    /**
     * Validate a specific provider key.
     */
    const validateProviderKey = useCallback(async (provider) => {
        const key = apiKeys[provider]?.trim();
        if (!isProviderReady(provider)) {
            const error = provider === 'custom' ? 'Base URL and model are required' : 'No key provided';
            setKeyStatus(s => ({ ...s, [provider]: { valid: false, error } }));
            return false;
        }
        setIsValidating(true);
        try {
            const result = await validateKey(provider, key, getProviderOptions(provider));
            setKeyStatus(s => ({ ...s, [provider]: result }));
            return result.valid;
        } finally {
            setIsValidating(false);
        }
    }, [apiKeys, isProviderReady, getProviderOptions]);

    /**
     * Update provider key and optionally validate.
     */
    const setProviderKey = useCallback((provider, key) => {
        updateApiKeys({ [provider]: key });
        setKeyStatus(s => ({ ...s, [provider]: null }));
    }, [updateApiKeys]);

    /**
     * Update provider config (model, baseUrl, embeddingModel) and reset validation.
     */
    const setProviderConfig = useCallback((provider, patch) => {
        updateAIConfig(provider, patch);
        setKeyStatus(s => ({ ...s, [provider]: null }));
    }, [updateAIConfig]);

    return (
        <AIContext.Provider value={{
            // State
            activeProvider,
            setActiveProvider,
            isConfigured,
            isProviderReady,
            keyStatus,
            isValidating,

            // Core functions
            askAI,
            askAIStream,
            embed,
            resolveEmbedding,

            // Key management
            setProviderKey,
            setProviderConfig,
            validateProviderKey,

            // Rate limiting
            getRemainingRequests,
        }}>
            {children}
        </AIContext.Provider>
    );
}

export const useAI = () => {
    const context = useContext(AIContext);
    if (!context) throw new Error('useAI must be used within an AIProvider');
    return context;
};
