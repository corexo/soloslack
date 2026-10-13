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

export const designApi = {
    getDesignBook: (workspaceId = null) => {
        const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
        return request(`/design${qs}`);
    },
    createChapter: (data) => request('/design/chapters', { method: 'POST', body: JSON.stringify(data) }),
    updateChapter: (id, data) => request(`/design/chapters/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteChapter: (id) => request(`/design/chapters/${id}`, { method: 'DELETE' }),
    createEntry: (data) => request('/design/entries', { method: 'POST', body: JSON.stringify(data) }),
    updateEntry: (id, data) => request(`/design/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteEntry: (id) => request(`/design/entries/${id}`, { method: 'DELETE' }),
    reorderDesign: (payload) => request('/design/reorder', { method: 'POST', body: JSON.stringify(payload) }),
};
