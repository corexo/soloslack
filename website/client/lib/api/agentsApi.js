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

    if (res.status === 204) return null;
    return res.json();
};

export const agentsApi = {
    getAll: () => request('/agents'),
    create: (data) => request('/agents', { method: 'POST', body: JSON.stringify(data) }),
    rotateToken: (id) => request(`/agents/${id}/rotate`, { method: 'POST' }),
    delete: (id) => request(`/agents/${id}`, { method: 'DELETE' }),
};
