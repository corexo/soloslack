'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const SettingsContext = createContext(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// AI settings live in MongoDB; localStorage is only a cache for instant first paint
const AI_CACHE_KEY = 'notban_ai_settings';
const LEGACY_KEYS = { apiKeys: 'notban_api_keys', config: 'notban_ai_config', activeProvider: 'notban_ai_provider' };
const SAVE_DEBOUNCE_MS = 400;

const parseJSON = (raw) => {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

// Cached settings, falling back to the pre-persistence localStorage keys
const readLocalAISettings = () => {
    const cached = parseJSON(localStorage.getItem(AI_CACHE_KEY));
    if (cached) return cached;
    const apiKeys = parseJSON(localStorage.getItem(LEGACY_KEYS.apiKeys));
    const config = parseJSON(localStorage.getItem(LEGACY_KEYS.config));
    const activeProvider = localStorage.getItem(LEGACY_KEYS.activeProvider);
    if (!apiKeys && !config && !activeProvider) return null;
    return { apiKeys: apiKeys || {}, config: config || {}, activeProvider: activeProvider || null };
};

const hasAISettings = (s) => Boolean(
    s && (s.activeProvider
        || Object.values(s.apiKeys || {}).some(v => v?.trim?.())
        || Object.values(s.config || {}).some(c => Object.values(c || {}).some(v => typeof v === 'string' && v.trim())))
);

const mergeConfig = (base, patch = {}) => Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, { ...v, ...patch[k] }])
);

// Combine queued (not yet saved) patches into one request body
const mergePatch = (a, b) => ({
    ...a,
    ...b,
    apiKeys: { ...a.apiKeys, ...b.apiKeys },
    config: Object.fromEntries(
        [...new Set([...Object.keys(a.config || {}), ...Object.keys(b.config || {})])]
            .map(k => [k, { ...a.config?.[k], ...b.config?.[k] }])
    ),
});

export function SettingsProvider({ children }) {
    const [apiKeys, setApiKeys] = useState({
        openai: '',
        anthropic: '',
        gemini: '',
        custom: ''
    });
    // Per-provider overrides: model for all, baseUrl/embeddingModel for custom (local) endpoints
    const [aiConfig, setAIConfig] = useState({
        openai: { model: '' },
        anthropic: { model: '' },
        gemini: { model: '' },
        custom: { baseUrl: '', model: '', embeddingModel: '', useProxy: true }
    });
    const [activeProvider, setActiveProvider] = useState(null);
    const [aiLoaded, setAILoaded] = useState(false);
    const pendingPatch = useRef(null);
    const saveTimer = useRef(null);
    const [serverEnv, setServerEnv] = useState({
        MONGODB_URI: '',
        PORT: '5000'
    });
    const [theme, setTheme] = useState('dark');
    const [focusMode, setFocusMode] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    const applyAISettings = useCallback((s) => {
        if (!s) return;
        setApiKeys(prev => ({ ...prev, ...s.apiKeys }));
        setAIConfig(prev => mergeConfig(prev, s.config));
        setActiveProvider(s.activeProvider || null);
    }, []);

    // Load AI settings from the server; push local (legacy) settings up on first run
    const loadAISettings = useCallback(async () => {
        const local = readLocalAISettings();
        applyAISettings(local);
        try {
            const res = await fetch(`${API_BASE}/ai/settings`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            if (data.data.exists) {
                applyAISettings(data.data);
                localStorage.setItem(AI_CACHE_KEY, JSON.stringify(data.data));
            } else if (hasAISettings(local)) {
                await fetch(`${API_BASE}/ai/settings`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(local),
                });
            }
            Object.values(LEGACY_KEYS).forEach(k => localStorage.removeItem(k));
        } catch (err) {
            console.error('Failed to load AI settings from server, using local cache', err);
        } finally {
            setAILoaded(true);
        }
    }, [applyAISettings]);

    const flushAISettings = useCallback((keepalive = false) => {
        clearTimeout(saveTimer.current);
        const patch = pendingPatch.current;
        if (!patch) return;
        pendingPatch.current = null;
        fetch(`${API_BASE}/ai/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
            keepalive,
        }).catch(err => console.error('Failed to save AI settings', err));
    }, []);

    // Debounced so typing in a field doesn't fire a request per keystroke
    const queueAISave = useCallback((patch) => {
        pendingPatch.current = mergePatch(pendingPatch.current || {}, patch);
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => flushAISettings(), SAVE_DEBOUNCE_MS);
    }, [flushAISettings]);

    // Don't lose the last edit when the tab closes
    useEffect(() => {
        const onHide = () => flushAISettings(true);
        window.addEventListener('pagehide', onHide);
        return () => window.removeEventListener('pagehide', onHide);
    }, [flushAISettings]);

    // Keep the local cache in sync with state
    useEffect(() => {
        if (!aiLoaded) return;
        localStorage.setItem(AI_CACHE_KEY, JSON.stringify({ apiKeys, config: aiConfig, activeProvider }));
    }, [aiLoaded, apiKeys, aiConfig, activeProvider]);

    // Load settings from localStorage on mount and fetch server env
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') || 'dark';

        loadAISettings();
        setTheme(savedTheme);
        // Apply theme to document root
        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
        document.documentElement.style.colorScheme = savedTheme;
        
        fetchServerEnv();
        setIsLoaded(true);
    }, []);

    const fetchServerEnv = async () => {
        try {
            const res = await fetch(`${API_BASE}/settings/env`);
            const data = await res.json();
            if (data.success) {
                setServerEnv(data.data);
            }
        } catch (err) {
            console.error('Failed to fetch server env', err);
        }
    };

    const updateApiKeys = useCallback((newKeys) => {
        setApiKeys(prev => ({ ...prev, ...newKeys }));
        queueAISave({ apiKeys: newKeys });
    }, [queueAISave]);

    const updateAIConfig = useCallback((provider, patch) => {
        setAIConfig(prev => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
        queueAISave({ config: { [provider]: patch } });
    }, [queueAISave]);

    const updateActiveProvider = useCallback((provider) => {
        setActiveProvider(provider || null);
        queueAISave({ activeProvider: provider || null });
    }, [queueAISave]);

    const updateServerEnv = async (newEnv) => {
        try {
            const res = await fetch(`${API_BASE}/settings/env`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEnv)
            });
            const data = await res.json();
            if (data.success) {
                setServerEnv(prev => ({ ...prev, ...newEnv }));
                return true;
            }
        } catch (err) {
            console.error('Failed to update server env', err);
            return false;
        }
    };

    const updateTheme = (newTheme) => {
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
        document.documentElement.style.colorScheme = newTheme;
    };

    return (
        <SettingsContext.Provider value={{
            apiKeys,
            updateApiKeys,
            aiConfig,
            updateAIConfig,
            activeProvider,
            updateActiveProvider,
            aiLoaded,
            serverEnv,
            updateServerEnv,
            theme,
            updateTheme,
            focusMode,
            setFocusMode,
            isLoaded
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
