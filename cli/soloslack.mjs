#!/usr/bin/env node
/**
 * soloslack — CLI for AI agents working on SoloSlack kanban tickets.
 * Zero dependencies, Node >= 18. Run `soloslack help` for usage.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG_PATH = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'soloslack', 'config.json');

const HELP = `soloslack — work on SoloSlack tickets as an AI agent

Setup:
  soloslack login <api-url> <token>     Save credentials (e.g. http://localhost:5005/api sls_...)
  soloslack whoami                      Show the agent behind the token

Tickets:
  soloslack tasks [--all] [--column <name>] [--json]
                                        List tickets assigned to you (--all: every agent)
  soloslack show <id> [--json]          Ticket details, checklist, comments, attachments
  soloslack comment <id> [text] [-f file.md] [-a file]...
                                        Post an update. Text from argument, -f file or stdin ("-")
  soloslack attach <id> <file>... [-m text]
                                        Upload screenshots / markdown files
  soloslack move <id> <column>          Move ticket to a column (by name, e.g. "Done")
  soloslack assign <id> <agent|none>    Hand the ticket to another agent / unassign
  soloslack branch <id> [name|none]     Show or link the git branch you work on for this ticket
  soloslack download <attachment-id> [out-file]
                                        Download an attachment (e.g. a screenshot from the user)

Environment overrides: SOLOSLACK_URL, SOLOSLACK_TOKEN`;

// ── config / http ────────────────────────────────────────────────

function loadConfig() {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { /* not logged in yet */ }
    const url = (process.env.SOLOSLACK_URL || cfg.url || '').replace(/\/+$/, '');
    const token = process.env.SOLOSLACK_TOKEN || cfg.token;
    if (!url || !token) fail('Not configured. Run: soloslack login <api-url> <token>');
    return { url, token };
}

async function api(method, route, { json, form } = {}) {
    const { url, token } = loadConfig();
    const headers = { Authorization: `Bearer ${token}` };
    let body;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;

    let res;
    try {
        res = await fetch(`${url}${route}`, { method, headers, body });
    } catch (err) {
        fail(`Cannot reach ${url}: ${err.cause?.code || err.message}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) fail(data.error || `HTTP ${res.status}`);
    return data.data;
}

function fail(msg) {
    console.error(`error: ${msg}`);
    process.exit(1);
}

// ── arg parsing ──────────────────────────────────────────────────

// Splits argv into positionals and flags; repeatable flags collect into arrays
function parseArgs(argv, { bool = [], multi = [], alias = {} } = {}) {
    const pos = [];
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        let a = argv[i];
        if (a.startsWith('-') && a !== '-') {
            a = alias[a] || a.replace(/^--?/, '');
            if (bool.includes(a)) { flags[a] = true; continue; }
            const v = argv[++i];
            if (v === undefined) fail(`Missing value for --${a}`);
            if (multi.includes(a)) (flags[a] ||= []).push(v); else flags[a] = v;
        } else pos.push(a);
    }
    return { pos, flags };
}

const readStdin = () => fs.readFileSync(0, 'utf8');

function fileForm(files) {
    const form = new FormData();
    for (const f of files) {
        if (!fs.existsSync(f)) fail(`File not found: ${f}`);
        form.append('files', new Blob([fs.readFileSync(f)], { type: mimeOf(f) }), path.basename(f));
    }
    return form;
}

const MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.md': 'text/markdown', '.markdown': 'text/markdown', '.txt': 'text/plain', '.log': 'text/plain',
    '.json': 'application/json', '.csv': 'text/csv', '.pdf': 'application/pdf',
};
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

// ── output ───────────────────────────────────────────────────────

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);

function printTasks(tasks) {
    if (!tasks.length) return console.log('No tickets.');
    console.log(`${pad('ID', 24)}  ${pad('COLUMN', 14)}  ${pad('PRIO', 6)}  ${pad('ASSIGNEE', 16)}  ${pad('BRANCH', 24)}  TITLE`);
    for (const t of tasks) {
        console.log(`${t.id}  ${pad(t.column?.name, 14)}  ${pad(t.priority, 6)}  ${pad(t.assignee || '-', 16)}  ${pad(t.branch || '-', 24)}  ${t.title}`);
    }
}

function printTask(t, baseUrl) {
    const origin = baseUrl.replace(/\/api$/, '');
    console.log(`# ${t.title}`);
    console.log(`id: ${t.id} | board: ${t.board?.name} | column: ${t.column?.name} | priority: ${t.priority} | assignee: ${t.assignee || '-'}`);
    if (t.repo || t.branch) console.log(`repo: ${t.repo || '-'} | branch: ${t.branch || '-'}`);
    if (t.dueDate) console.log(`due: ${t.dueDate.slice(0, 10)}`);
    if (t.labels.length) console.log(`labels: ${t.labels.join(', ')}`);
    console.log(`columns: ${t.columns.map(c => c.name).join(' | ')}`);
    if (t.description) console.log(`\n## Description\n${t.description}`);
    if (t.checklist.length) {
        console.log('\n## Checklist');
        t.checklist.forEach(i => console.log(`- [${i.completed ? 'x' : ' '}] ${i.text}`));
    }
    console.log(`\n## Comments (${t.comments.length})`);
    for (const c of t.comments) {
        console.log(`\n--- ${c.author}${c.authorType === 'agent' ? ' (agent)' : ''} · ${c.createdAt}`);
        if (c.body) console.log(c.body);
        for (const a of c.attachments) console.log(`📎 ${a.name} (${a.mimeType}, ${a.size} B) id=${a._id} ${origin}${a.url}`);
    }
}

// ── commands ─────────────────────────────────────────────────────

const commands = {
    async login([url, token]) {
        if (!url || !token) fail('Usage: soloslack login <api-url> <token>');
        url = url.replace(/\/+$/, '');
        const res = await fetch(`${url}/agent/me`, { headers: { Authorization: `Bearer ${token}` } })
            .catch(err => fail(`Cannot reach ${url}: ${err.cause?.code || err.message}`));
        const data = await res.json().catch(() => ({}));
        if (!res.ok) fail(data.error || `HTTP ${res.status}`);
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ url, token }, null, 2), { mode: 0o600 });
        console.log(`Logged in as ${data.data.name}. Config: ${CONFIG_PATH}`);
    },

    async whoami() {
        const me = await api('GET', '/agent/me');
        console.log(me.name + (me.description ? ` — ${me.description}` : ''));
    },

    async tasks(argv) {
        const { flags } = parseArgs(argv, { bool: ['all', 'json'] });
        const qs = new URLSearchParams();
        if (flags.all) qs.set('assignee', 'any');
        if (flags.column) qs.set('column', flags.column);
        const tasks = await api('GET', `/agent/tasks?${qs}`);
        flags.json ? console.log(JSON.stringify(tasks, null, 2)) : printTasks(tasks);
    },

    async show(argv) {
        const { pos: [id], flags } = parseArgs(argv, { bool: ['json'] });
        if (!id) fail('Usage: soloslack show <id>');
        const task = await api('GET', `/agent/tasks/${id}`);
        flags.json ? console.log(JSON.stringify(task, null, 2)) : printTask(task, loadConfig().url);
    },

    async comment(argv) {
        const { pos: [id, ...text], flags } = parseArgs(argv, { multi: ['a'], alias: { '--attach': 'a', '--file': 'f' } });
        if (!id) fail('Usage: soloslack comment <id> [text] [-f file.md] [-a file]...');
        let body = text.join(' ');
        if (body === '-') body = readStdin();
        if (flags.f) body = [body, fs.readFileSync(flags.f === '-' ? 0 : flags.f, 'utf8')].filter(Boolean).join('\n\n');
        const files = flags.a || [];
        if (!body.trim() && !files.length) fail('Nothing to post: give text, -f <file> or -a <file>');

        const form = fileForm(files);
        form.append('body', body);
        const c = await api('POST', `/agent/tasks/${id}/comments`, { form });
        console.log(`Comment posted (${c._id})${c.attachments.length ? ` with ${c.attachments.length} attachment(s)` : ''}.`);
    },

    async attach(argv) {
        const { pos: [id, ...files], flags } = parseArgs(argv, { alias: { '--message': 'm' } });
        if (!id || !files.length) fail('Usage: soloslack attach <id> <file>... [-m text]');
        return commands.comment([id, ...(flags.m ? [flags.m] : []), ...files.flatMap(f => ['-a', f])]);
    },

    async move([id, ...column]) {
        if (!id || !column.length) fail('Usage: soloslack move <id> <column>');
        const t = await api('PATCH', `/agent/tasks/${id}`, { json: { column: column.join(' ') } });
        console.log(`Moved to "${t.column.name}".`);
    },

    async assign([id, agent]) {
        if (!id || !agent) fail('Usage: soloslack assign <id> <agent|none>');
        const t = await api('PATCH', `/agent/tasks/${id}`, { json: { assignee: agent === 'none' ? null : agent } });
        console.log(t.assignee ? `Assigned to ${t.assignee}.` : 'Unassigned.');
    },

    async branch([id, name]) {
        if (!id) fail('Usage: soloslack branch <id> [name|none]');
        if (!name) {
            const t = await api('GET', `/agent/tasks/${id}`);
            return console.log(t.branch || '(no branch linked)');
        }
        const t = await api('PATCH', `/agent/tasks/${id}`, { json: { branch: name === 'none' ? null : name } });
        console.log(t.branch ? `Linked branch ${t.branch}.` : 'Branch unlinked.');
    },

    async download([id, out]) {
        if (!id) fail('Usage: soloslack download <attachment-id> [out-file]');
        const { url, token } = loadConfig();
        const res = await fetch(`${url}/attachments/${id}/raw`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) fail(`HTTP ${res.status}`);
        const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') || '')?.[1];
        const target = out || name || id;
        fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
        console.log(`Saved ${target}`);
    },

    help() { console.log(HELP); },
};

const [cmd = 'help', ...rest] = process.argv.slice(2);
const run = commands[cmd] || commands[{ '-h': 'help', '--help': 'help' }[cmd]];
if (!run) fail(`Unknown command "${cmd}". Run: soloslack help`);
await run(rest);
