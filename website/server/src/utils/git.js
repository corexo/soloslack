const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Host directory containing the git repos (mounted at the same path in Docker so
// worktree `.git` files with absolute host paths stay valid)
const REPOS_DIR = process.env.REPOS_DIR ? path.resolve(process.env.REPOS_DIR) : null;
const REPO_NAME = /^[\w.-]+$/;

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

const ensureEnabled = () => {
    if (!REPOS_DIR) throw httpError(501, 'Git integration is disabled (REPOS_DIR not set)');
};

// Only direct children of REPOS_DIR — no path traversal
function repoPath(name) {
    ensureEnabled();
    if (!name || !REPO_NAME.test(name) || name === '.' || name === '..') throw httpError(400, 'Invalid repository name');
    const dir = path.join(REPOS_DIR, name);
    if (!fs.existsSync(path.join(dir, '.git'))) throw httpError(404, `"${name}" is not a git repository`);
    return dir;
}

/**
 * Run git in a repo. Runs as the repo owner (when the server is root) so refs
 * created from the container don't end up root-owned on the host.
 */
function git(dir, args) {
    const { uid, gid } = fs.statSync(dir);
    const asOwner = typeof process.getuid === 'function' && process.getuid() === 0 && uid !== 0;
    return new Promise((resolve, reject) => {
        execFile('git', args, {
            cwd: dir,
            timeout: 15_000,
            maxBuffer: 5 * 1024 * 1024,
            env: { PATH: process.env.PATH, HOME: '/tmp', GIT_TERMINAL_PROMPT: '0' },
            ...(asOwner ? { uid, gid } : {}),
        }, (err, stdout, stderr) => {
            if (err) return reject(httpError(400, (stderr || err.message).trim()));
            resolve(stdout);
        });
    });
}

async function listRepos() {
    ensureEnabled();
    const entries = await fs.promises.readdir(REPOS_DIR, { withFileTypes: true });
    return entries
        .filter(e => e.isDirectory() && REPO_NAME.test(e.name) && fs.existsSync(path.join(REPOS_DIR, e.name, '.git')))
        .map(e => e.name)
        .sort((a, b) => a.localeCompare(b));
}

const SEP = '\x1f';

async function listBranches(name) {
    const dir = repoPath(name);
    const [refs, head] = await Promise.all([
        git(dir, ['for-each-ref', '--sort=-committerdate',
            `--format=%(refname)${SEP}%(objectname:short)${SEP}%(committerdate:iso-strict)${SEP}%(subject)${SEP}%(authorname)`,
            'refs/heads', 'refs/remotes']),
        git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ''),
    ]);
    const current = head.trim();

    // Merge local and remote refs of the same name into one entry
    const branches = new Map();
    for (const line of refs.split('\n').filter(Boolean)) {
        const [ref, hash, date, subject, author] = line.split(SEP);
        if (ref.endsWith('/HEAD')) continue;
        const local = ref.startsWith('refs/heads/');
        const branchName = local ? ref.slice('refs/heads/'.length) : ref.slice('refs/remotes/'.length).replace(/^[^/]+\//, '');
        const lastCommit = { hash, date, subject, author };

        const entry = branches.get(branchName);
        if (!entry) {
            branches.set(branchName, { name: branchName, local, remote: !local, current: local && branchName === current, lastCommit });
        } else if (local) {
            Object.assign(entry, { local: true, current: branchName === current, lastCommit });
        } else {
            entry.remote = true;
        }
    }
    return { repo: name, current, branches: [...branches.values()] };
}

async function createBranch(name, branch, from) {
    const dir = repoPath(name);
    await git(dir, ['check-ref-format', '--branch', branch]).catch(() => {
        throw httpError(400, `Invalid branch name "${branch}"`);
    });
    // `git branch` only creates the ref — never touches the working tree
    await git(dir, ['branch', '--', branch, ...(from ? [from] : [])]);
    return (await listBranches(name)).branches.find(b => b.name === branch);
}

module.exports = { listRepos, listBranches, createBranch, REPOS_DIR };
