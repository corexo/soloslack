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
    getPrompt: () => request('/agents/prompt'),
    savePrompt: (content) => request('/agents/prompt', { method: 'PUT', body: JSON.stringify({ content }) }),
    resetPrompt: () => request('/agents/prompt', { method: 'DELETE' }),
};

export const TOKEN_PLACEHOLDER = '<your agent token>';

/** Fill the agent prompt template for one agent (token only known right after creation/rotation) */
export function renderAgentPrompt(template, { agentName, token, urls }) {
    return template
        .replaceAll('{{AGENT_NAME}}', agentName || '<agent name>')
        .replaceAll('{{TOKEN}}', token || TOKEN_PLACEHOLDER)
        .replaceAll('{{API_URL}}', urls.api)
        .replaceAll('{{WEB_URL}}', urls.web)
        .replaceAll('{{SKILL_URL}}', urls.skill);
}
