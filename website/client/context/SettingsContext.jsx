'use client';
import { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext(null);

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
        custom: { baseUrl: '', model: '', embeddingModel: '' }
    });
    const [serverEnv, setServerEnv] = useState({
        MONGODB_URI: '',
        PORT: '5000'
    });
    const [theme, setTheme] = useState('dark');
    const [focusMode, setFocusMode] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    // Load settings from localStorage on mount and fetch server env
    useEffect(() => {
        const savedKeys = localStorage.getItem('notban_api_keys');
        const savedAIConfig = localStorage.getItem('notban_ai_config');
        const savedTheme = localStorage.getItem('theme') || 'dark';

        if (savedKeys) {
            try {
                setApiKeys(prev => ({ ...prev, ...JSON.parse(savedKeys) }));
            } catch (e) {
                console.error('Failed to parse saved API keys', e);
            }
        }
        if (savedAIConfig) {
            try {
                const parsed = JSON.parse(savedAIConfig);
                setAIConfig(prev => Object.fromEntries(
                    Object.entries(prev).map(([k, v]) => [k, { ...v, ...parsed[k] }])
                ));
            } catch (e) {
                console.error('Failed to parse saved AI config', e);
            }
        }
        
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

    const updateApiKeys = (newKeys) => {
        const updatedKeys = { ...apiKeys, ...newKeys };
        setApiKeys(updatedKeys);
        localStorage.setItem('notban_api_keys', JSON.stringify(updatedKeys));
    };

    const updateAIConfig = (provider, patch) => {
        setAIConfig(prev => {
            const next = { ...prev, [provider]: { ...prev[provider], ...patch } };
            localStorage.setItem('notban_ai_config', JSON.stringify(next));
            return next;
        });
    };

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
