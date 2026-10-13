import { API_BASE } from '@/lib/apiBase';
const BASE = API_BASE;

const request = async (url, options = {}) => {
    const res = await fetch(`${BASE}${url}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Request failed');
    }

    if (res.status === 204) return null;
    return res.json();
};

export const agentsApi = {
    getAll: () => request('/agents'),
    create: (data) => request('/agents', { method: 'POST', body: JSON.stringify(data) }),
    rotateToken: (id) => request(`/agents/${id}/rotate`, { method: 'POST' }),
    delete: (id) => request(`/agents/${id}`, { method: 'DELETE' }),
    getNetwork: () => request('/agents/network'),
    getActivity: (limit = 60) => request(`/agents/activity?limit=${limit}`),
};

// Live agent activity (Server-Sent Events); returns an unsubscribe function
export function subscribeAgentActivity(onEvent) {
    const source = new EventSource(`${BASE}/agents/activity/stream`);
    source.onmessage = (msg) => {
        try { onEvent(JSON.parse(msg.data)); } catch { /* ignore malformed */ }
    };
    return () => source.close();
}
