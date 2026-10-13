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

// Attachment URLs from the API are origin-relative (/api/attachments/...)
const ORIGIN = (BASE || '').replace(/\/api\/?$/, '');
export const attachmentUrl = (attachment) => `${ORIGIN}${attachment.url}`;

export const cardsApi = {
    getAll: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return request(`/cards${qs ? '?' + qs : ''}`);
    },
    getUpcoming: () => request('/cards/upcoming'),
    getAgenda: (todayStart) => request(`/cards/agenda?todayStart=${encodeURIComponent(todayStart.toISOString())}`),
    getById: (id) => request(`/cards/${id}`),
    create: (data) => request('/cards', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, d) => request(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
    moveCard: (id, data) => request(`/cards/${id}/move`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => request(`/cards/${id}`, { method: 'DELETE' }),
    bulkDelete: (ids) => request('/cards/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
    bulkMove: (ids, targetColumnId) => request('/cards/bulk-move', { method: 'POST', body: JSON.stringify({ ids, targetColumnId }) }),
    bulkArchive: (ids) => request('/cards/bulk-archive', { method: 'POST', body: JSON.stringify({ ids }) }),
    bulkUnarchive: (ids) => request('/cards/bulk-unarchive', { method: 'POST', body: JSON.stringify({ ids }) }),

    // Ticket attachments (files on the card itself)
    getAttachments: (cardId) => request(`/cards/${cardId}/attachments`),
    uploadAttachments: async (cardId, files) => {
        const form = new FormData();
        files.forEach(f => form.append('files', f, f.name));
        const res = await fetch(`${BASE}/cards/${cardId}/attachments`, { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        return data;
    },
    deleteAttachment: (attachmentId) => request(`/attachments/${attachmentId}`, { method: 'DELETE' }),

    // Comments
    getComments: (cardId) => request(`/cards/${cardId}/comments`),
    createComment: async (cardId, body, files = []) => {
        if (!files.length) return request(`/cards/${cardId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
        // Multipart — let the browser set the boundary header
        const form = new FormData();
        form.append('body', body);
        files.forEach(f => form.append('files', f, f.name));
        const res = await fetch(`${BASE}/cards/${cardId}/comments`, { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    },
    updateComment: (cardId, commentId, body) => request(`/cards/${cardId}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    deleteComment: (cardId, commentId) => request(`/cards/${cardId}/comments/${commentId}`, { method: 'DELETE' }),
};
