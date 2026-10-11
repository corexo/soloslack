const BASE = process.env.NEXT_PUBLIC_API_URL;

const request = async (url, options = {}) => {
    const res = await fetch(`${BASE}${url}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Request failed');
    }
    return res.json();
};

export const SKILL_URL = `${BASE}/agents/skill.md`;

export const agentSkillApi = {
    get: () => request('/agents/skill'),
    save: (content) => request('/agents/skill', { method: 'PUT', body: JSON.stringify({ content }) }),
    reset: () => request('/agents/skill', { method: 'DELETE' }),
};
