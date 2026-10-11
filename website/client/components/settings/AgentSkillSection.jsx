'use client';
import { useState, useEffect } from 'react';
import { BookOpen, Copy, Check, Download, Eye, Edit3, RotateCcw, Save, Terminal, ExternalLink } from 'lucide-react';
import MarkdownRenderer from '@/components/notes/MarkdownRenderer';
import { agentSkillApi, SKILL_URL } from '@/lib/api/agentSkillApi';
import { cn } from '@/lib/utils/cn';

// Split YAML frontmatter off so the preview doesn't render it as text
function splitFrontmatter(md) {
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(md || '');
    if (!m) return { meta: {}, body: md || '' };
    const meta = Object.fromEntries(m[1].split('\n').map(l => {
        const i = l.indexOf(':');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }).filter(([k]) => k));
    return { meta, body: md.slice(m[0].length) };
}

function CopyButton({ text, label }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-sky-400 hover:bg-sky-500/10 transition-colors shrink-0"
            title="Copy"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {label}
        </button>
    );
}

const INSTALL = [
    {
        name: 'Claude Code (skill)',
        cmd: `mkdir -p ~/.claude/skills/soloslack && curl -s ${SKILL_URL} -o ~/.claude/skills/soloslack/SKILL.md`,
    },
    {
        name: 'Codex / pi / other agents (AGENTS.md)',
        cmd: `curl -s ${SKILL_URL} >> AGENTS.md`,
    },
    {
        name: 'Prompt',
        cmd: `Read ${SKILL_URL} and follow it to work on your SoloSlack tickets.`,
    },
];

// Lives inside the settings <form>: every button is type="button"
export default function AgentSkillSection() {
    const [skill, setSkill] = useState(null);
    const [draft, setDraft] = useState('');
    const [mode, setMode] = useState('preview');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const apply = (data) => { setSkill(data); setDraft(data.template); };

    useEffect(() => {
        agentSkillApi.get().then(res => apply(res.data)).catch(err => setError(err.message));
    }, []);

    const dirty = skill && draft !== skill.template;

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            apply((await agentSkillApi.save(draft)).data);
            setMode('preview');
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('Replace your customised skill with the built-in default?')) return;
        try {
            apply((await agentSkillApi.reset()).data);
        } catch (err) {
            setError(err.message);
        }
    };

    const { meta, body } = splitFrontmatter(skill?.rendered);

    return (
        <section className="glass-morphism rounded-3xl border border-border-subtle p-8 shadow-2xl relative overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
                    <BookOpen className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-text-primary tracking-tight">Agent Skill</h2>
                <code className="text-[11px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">SKILL.md</code>
                {skill && (
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border',
                        skill.isDefault ? 'text-text-muted border-border-subtle' : 'text-amber-400 border-amber-500/30 bg-amber-500/10')}>
                        {skill.isDefault ? 'default' : 'customised'}
                    </span>
                )}
            </div>
            <p className="text-xs text-text-secondary mb-6">
                Instructions that teach an AI agent how to work with SoloSlack: finding its tickets, reporting progress,
                attaching screenshots, linking branches and moving tickets. Give it to every agent you create.
            </p>

            {/* Hand it to an agent */}
            <div className="space-y-2 mb-6">
                {INSTALL.map(i => (
                    <div key={i.name}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1 flex items-center gap-1">
                            <Terminal className="w-3 h-3" /> {i.name}
                        </p>
                        <div className="flex items-center gap-2 bg-surface-overlay rounded-lg px-3 py-2">
                            <code className="text-[11px] font-mono text-text-primary break-all flex-1">{i.cmd}</code>
                            <CopyButton text={i.cmd} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex bg-surface-overlay rounded-md p-0.5 border border-border-default">
                    {[['preview', Eye, 'Preview'], ['edit', Edit3, 'Edit']].map(([key, Icon, label]) => (
                        <button key={key} type="button" onClick={() => setMode(key)}
                            className={cn('px-2.5 py-1 text-[11px] rounded flex items-center gap-1 transition-colors',
                                mode === key ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}>
                            <Icon className="w-3 h-3" /> {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    {skill && <CopyButton text={skill.rendered} label="Copy" />}
                    <a href={`${SKILL_URL}?download`} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-sky-400 hover:bg-sky-500/10">
                        <Download className="w-3.5 h-3.5" /> Download
                    </a>
                    <a href={SKILL_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-sky-400 hover:bg-sky-500/10">
                        <ExternalLink className="w-3.5 h-3.5" /> Raw
                    </a>
                </div>
            </div>

            {error && <p className="text-[11px] text-red-400 mb-2">{error}</p>}

            {!skill ? (
                <p className="text-xs text-text-muted">Loading…</p>
            ) : mode === 'preview' ? (
                <div className="rounded-xl border border-border-subtle bg-surface-overlay/30 p-5 max-h-[520px] overflow-y-auto">
                    {meta.name && (
                        <div className="mb-4 pb-3 border-b border-border-subtle text-[11px] text-text-muted space-y-1">
                            <p><span className="font-semibold text-text-secondary">name:</span> <code>{meta.name}</code></p>
                            {meta.description && <p><span className="font-semibold text-text-secondary">description:</span> {meta.description}</p>}
                        </div>
                    )}
                    <MarkdownRenderer content={body} compact />
                </div>
            ) : (
                <div className="space-y-2">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        spellCheck={false}
                        className="w-full h-[520px] bg-surface-overlay border border-border-default focus:border-sky-500/40 rounded-xl p-4 text-xs font-mono text-text-primary outline-none resize-y"
                    />
                    <p className="text-[10px] text-text-muted">
                        <code>{'{{API_URL}}'}</code> and <code>{'{{WEB_URL}}'}</code> are replaced with this server&apos;s addresses when an agent downloads the skill.
                    </p>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={handleSave} disabled={!dirty || saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 text-xs font-semibold hover:bg-sky-500/25 disabled:opacity-30">
                            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => setDraft(skill.template)} disabled={!dirty}
                            className="text-xs text-text-muted hover:text-text-primary disabled:opacity-30">
                            Discard changes
                        </button>
                        {!skill.isDefault && (
                            <button type="button" onClick={handleReset}
                                className="ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-amber-400">
                                <RotateCcw className="w-3.5 h-3.5" /> Reset to default
                            </button>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
