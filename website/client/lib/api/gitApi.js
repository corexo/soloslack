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

export const gitApi = {
    getRepos: () => request('/git/repos'),
    getBranches: (repo) => request(`/git/repos/${encodeURIComponent(repo)}/branches`),
    createBranch: (repo, name, from) => request(`/git/repos/${encodeURIComponent(repo)}/branches`, {
        method: 'POST',
        body: JSON.stringify({ name, from }),
    }),
};

// "Fix login bug!" → "feat/fix-login-bug"
export function suggestBranchName(title, prefix = 'feat') {
    const slug = (title || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/-+$/, '');
    return `${prefix}/${slug || 'ticket'}`;
}
