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

const ws = (key) => `/planner/${encodeURIComponent(key)}`;

export const plannerApi = {
    getContext: (key, todayStart) => request(`${ws(key)}/context?todayStart=${encodeURIComponent(todayStart.toISOString())}`),
    getMessages: (key) => request(`${ws(key)}/messages`),
    addMessage: (key, message) => request(`${ws(key)}/messages`, { method: 'POST', body: JSON.stringify(message) }),
    setActionStatus: (key, messageId, index, status) => request(`${ws(key)}/messages/${messageId}`, {
        method: 'PATCH', body: JSON.stringify({ index, status }),
    }),
    clear: (key) => request(`${ws(key)}/messages`, { method: 'DELETE' }),
};
