'use client';
import { useState } from 'react';
import { MessageSquareText, Copy, Check, Edit3, Eye, Save, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { renderAgentPrompt } from '@/lib/api/agentSkillApi';
import { cn } from '@/lib/utils/cn';

export function CopyTextButton({ text, label, title, className = '' }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-sky-400 hover:bg-sky-500/10 transition-colors shrink-0', className)}
            title={title || label || 'Copy'}
        >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {label}
        </button>
    );
}

const PLACEHOLDERS = ['{{AGENT_NAME}}', '{{TOKEN}}', '{{API_URL}}', '{{WEB_URL}}', '{{SKILL_URL}}'];

/**
 * Start prompt for agents: pick an agent, copy the filled-in prompt, or edit the template.
 * Lives inside the settings <form>: every button is type="button".
 */
export default function AgentPromptEditor({ prompt, agents, onSave, onReset }) {
    const [open, setOpen] = useState(true);
    const [agentName, setAgentName] = useState('');
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    if (!prompt) return null;

    const selected = agentName || agents[0]?.name || '';
    const rendered = renderAgentPrompt(prompt.template, { agentName: selected, urls: prompt.urls });

    const startEdit = () => { setDraft(prompt.template); setEditing(true); };
    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            await onSave(draft);
            setEditing(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-surface-overlay/30 hover:bg-surface-overlay/50 transition-colors text-left"
            >
                {open ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                <MessageSquareText className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-semibold text-text-primary">Agent prompt</span>
                <span className="text-[10px] text-text-muted">— paste this into an agent to get it started</span>
                <span className={cn('ml-auto text-[10px] px-2 py-0.5 rounded-full border',
                    prompt.isDefault ? 'text-text-muted border-border-subtle' : 'text-amber-400 border-amber-500/30 bg-amber-500/10')}>
                    {prompt.isDefault ? 'default' : 'customised'}
                </span>
            </button>

            {open && (
                <div className="p-4 space-y-3">
                    {!editing ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <label className="text-[11px] text-text-muted">For agent</label>
                                <select
                                    value={selected}
                                    onChange={(e) => setAgentName(e.target.value)}
                                    className="bg-surface-overlay border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary font-mono outline-none"
                                >
                                    {agents.length === 0 && <option value="">(create an agent first)</option>}
                                    {agents.map(a => <option key={a._id} value={a.name}>{a.name}</option>)}
                                </select>
                                <div className="ml-auto flex items-center gap-1">
                                    <CopyTextButton text={rendered} label="Copy prompt" className="text-sky-400 bg-sky-500/10" />
                                    <button type="button" onClick={startEdit} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-hover">
                                        <Edit3 className="w-3.5 h-3.5" /> Edit template
                                    </button>
                                </div>
                            </div>
                            <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed font-mono text-text-primary bg-surface-overlay rounded-lg p-3 max-h-[320px] overflow-y-auto">
                                {rendered}
                            </pre>
                            <p className="text-[10px] text-text-muted">
                                The token is never stored in clear text, so it appears as a placeholder here. Right after creating an agent
                                (or issuing a new token) use <span className="text-sky-400">Copy prompt</span> in the green box — that version includes the token.
                            </p>
                        </>
                    ) : (
                        <>
                            <textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                spellCheck={false}
                                className="w-full h-[300px] bg-surface-overlay border border-border-default focus:border-sky-500/40 rounded-lg p-3 text-[11px] font-mono text-text-primary outline-none resize-y"
                            />
                            <p className="text-[10px] text-text-muted flex flex-wrap gap-1 items-center">
                                Placeholders: {PLACEHOLDERS.map(p => <code key={p} className="text-sky-400">{p}</code>)}
                            </p>
                            {error && <p className="text-[11px] text-red-400">{error}</p>}
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={handleSave} disabled={saving || !draft.trim() || draft === prompt.template}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 text-xs font-semibold hover:bg-sky-500/25 disabled:opacity-30">
                                    <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
                                </button>
                                <button type="button" onClick={() => setEditing(false)} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
                                    <Eye className="w-3.5 h-3.5" /> Cancel
                                </button>
                                {!prompt.isDefault && (
                                    <button type="button"
                                        onClick={async () => { if (confirm('Reset the prompt template to the default?')) { await onReset(); setEditing(false); } }}
                                        className="ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-amber-400">
                                        <RotateCcw className="w-3.5 h-3.5" /> Reset to default
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
