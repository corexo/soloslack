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
    // Either a workspace book (workspaceId, null = all) or a repo book (repo)
    getDesignBook: (workspaceId = null, repo = null) => {
        const qs = repo
            ? `?repo=${encodeURIComponent(repo)}`
            : workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
        return request(`/design${qs}`);
    },
    scanRepo: (repo) => request('/design/scan', { method: 'POST', body: JSON.stringify({ repo }) }),
    getScanInfo: (repo) => request(`/design/scan?repo=${encodeURIComponent(repo)}`),
    // Images go to the local uploads volume; returns [{ _id, name, url (origin-relative) }]
    uploadAssets: async (files, repo = null) => {
        const form = new FormData();
        files.forEach(f => form.append('files', f, f.name));
        if (repo) form.append('repo', repo);
        const res = await fetch(`${BASE}/design/assets`, { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        return data;
    },
    createChapter: (data) => request('/design/chapters', { method: 'POST', body: JSON.stringify(data) }),
    updateChapter: (id, data) => request(`/design/chapters/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteChapter: (id) => request(`/design/chapters/${id}`, { method: 'DELETE' }),
    createEntry: (data) => request('/design/entries', { method: 'POST', body: JSON.stringify(data) }),
    updateEntry: (id, data) => request(`/design/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteEntry: (id) => request(`/design/entries/${id}`, { method: 'DELETE' }),
    reorderDesign: (payload) => request('/design/reorder', { method: 'POST', body: JSON.stringify(payload) }),
};
