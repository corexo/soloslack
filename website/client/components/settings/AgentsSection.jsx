'use client';
import { useState, useEffect } from 'react';
import { Bot, Plus, Trash2, RefreshCw, Terminal, AlertCircle } from 'lucide-react';
import { agentSkillApi, renderAgentPrompt } from '@/lib/api/agentSkillApi';
import AgentPromptEditor, { CopyTextButton } from './AgentPromptEditor';
import { agentsApi } from '@/lib/api/agentsApi';
import { timeAgo } from '@/lib/utils/formatDate';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Lives inside the settings <form>: every button is type="button" and Enter is swallowed
export default function AgentsSection() {
    const [agents, setAgents] = useState([]);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState(null);
    const [revealed, setRevealed] = useState(null); // { name, token } — shown once
    const [busy, setBusy] = useState(false);
    const [prompt, setPrompt] = useState(null); // { template, isDefault, urls }

    useEffect(() => {
        agentsApi.getAll().then(res => setAgents(res.data)).catch(err => setError(err.message));
        agentSkillApi.getPrompt().then(res => setPrompt(res.data)).catch(() => {});
    }, []);

    const handleCreate = async () => {
        if (!name.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const res = await agentsApi.create({ name: name.trim(), description: description.trim() });
            const { token, ...agent } = res.data;
            setAgents(prev => [...prev, agent].sort((a, b) => a.name.localeCompare(b.name)));
            setRevealed({ name: agent.name, token });
            setName('');
            setDescription('');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const handleRotate = async (agent) => {
        if (!confirm(`Issue a new token for "${agent.name}"? The current token stops working immediately.`)) return;
        try {
            const res = await agentsApi.rotateToken(agent._id);
            const { token, ...updated } = res.data;
            setAgents(prev => prev.map(a => a._id === agent._id ? updated : a));
            setRevealed({ name: updated.name, token });
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (agent) => {
        if (!confirm(`Delete agent "${agent.name}"? Its token stops working and its tickets become unassigned.`)) return;
        try {
            await agentsApi.delete(agent._id);
            setAgents(prev => prev.filter(a => a._id !== agent._id));
            if (revealed?.name === agent.name) setRevealed(null);
        } catch (err) {
            setError(err.message);
        }
    };

    const loginCommand = revealed ? `soloslack login ${API_URL} ${revealed.token}` : '';
    const revealedPrompt = revealed && prompt
        ? renderAgentPrompt(prompt.template, { agentName: revealed.name, token: revealed.token, urls: prompt.urls })
        : '';
    const inputClass = 'bg-surface-overlay border border-border-subtle focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 rounded-lg px-3 py-2 text-xs text-text-primary outline-none transition-all placeholder:text-text-muted/40';

    return (
        <section className="glass-morphism rounded-3xl border border-border-subtle p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute -top-12 -right-12 p-8 text-sky-500/5 pointer-events-none group-hover:text-sky-500/10 transition-all duration-700 scale-150 group-hover:rotate-12">
                <Bot className="w-64 h-64" />
            </div>

            <div className="flex items-center gap-3 mb-2 relative z-10">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
                    <Bot className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-text-primary tracking-tight">AI Agents</h2>
                <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full uppercase border border-sky-500/20">CLI</span>
            </div>
            <p className="text-xs text-text-secondary mb-6 relative z-10">
                Assign tickets to AI agents (Claude Code, Codex, pi …). They read their tickets and post progress, screenshots and markdown reports with the <code className="text-sky-400">soloslack</code> CLI.
            </p>

            <div className="space-y-4 relative z-10">
                {/* Create */}
                <div className="flex flex-col md:flex-row gap-2">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value.toLowerCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                        placeholder="name, e.g. claude-builder"
                        autoComplete="off"
                        data-1p-ignore
                        className={`${inputClass} md:w-56 font-mono`}
                    />
                    <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                        placeholder="description (optional)"
                        autoComplete="off"
                        data-1p-ignore
                        className={`${inputClass} flex-1`}
                    />
                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={!name.trim() || busy}
                        className="px-4 py-2 rounded-lg bg-sky-500/15 text-sky-400 text-xs font-semibold hover:bg-sky-500/25 transition-colors disabled:opacity-30 flex items-center justify-center gap-1.5"
                    >
                        <Plus className="w-3.5 h-3.5" /> Create agent
                    </button>
                </div>

                {error && (
                    <p className="text-[11px] text-red-400 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> {error}
                    </p>
                )}

                {/* Token reveal — only time the token is visible */}
                {revealed && (
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                        <p className="text-xs font-semibold text-emerald-400">
                            Token for {revealed.name} — copy it now, it won&apos;t be shown again.
                        </p>
                        <div className="flex items-center gap-2 bg-surface-overlay rounded-lg px-3 py-2">
                            <code className="text-[11px] font-mono text-text-primary break-all flex-1">{revealed.token}</code>
                            <CopyTextButton text={revealed.token} className="p-1.5" title="Copy token" />
                        </div>
                        <p className="text-[11px] text-text-secondary flex items-center gap-1.5">
                            <Terminal className="w-3 h-3" /> In the agent&apos;s shell:
                        </p>
                        <div className="flex items-center gap-2 bg-surface-overlay rounded-lg px-3 py-2">
                            <code className="text-[11px] font-mono text-text-primary break-all flex-1">{loginCommand}</code>
                            <CopyTextButton text={loginCommand} className="p-1.5" title="Copy login command" />
                        </div>
                        {revealedPrompt && (
                            <div className="flex items-center justify-between gap-2 pt-1">
                                <p className="text-[11px] text-text-secondary">
                                    Or hand over everything at once — start prompt incl. token and the link to the <span className="text-sky-400 font-semibold">Agent Skill</span>:
                                </p>
                                <CopyTextButton text={revealedPrompt} label="Copy prompt" className="text-emerald-400 bg-emerald-500/10 hover:text-emerald-300 hover:bg-emerald-500/20" />
                            </div>
                        )}
                        <button type="button" onClick={() => setRevealed(null)} className="text-[11px] text-text-muted hover:text-text-primary">
                            Done
                        </button>
                    </div>
                )}

                {/* List */}
                {agents.length === 0 ? (
                    <p className="text-[11px] text-text-muted italic">No agents yet.</p>
                ) : (
                    <div className="divide-y divide-border-subtle border border-border-subtle rounded-xl overflow-hidden">
                        {agents.map(agent => (
                            <div key={agent._id} className="flex items-center gap-3 px-4 py-3 bg-surface-overlay/20">
                                <Bot className="w-4 h-4 text-sky-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-text-primary font-mono">{agent.name}</p>
                                    <p className="text-[10px] text-text-muted truncate">
                                        {agent.description && `${agent.description} · `}
                                        token {agent.tokenPrefix}… · {agent.lastSeenAt ? `last seen ${timeAgo(agent.lastSeenAt)}` : 'never connected'}
                                    </p>
                                </div>
                                {prompt && (
                                    <CopyTextButton
                                        text={renderAgentPrompt(prompt.template, { agentName: agent.name, urls: prompt.urls })}
                                        className="p-1.5"
                                        title={`Copy start prompt for ${agent.name}`}
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleRotate(agent)}
                                    className="p-1.5 rounded-md text-text-muted hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                                    title="New token"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(agent)}
                                    className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Delete agent"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <AgentPromptEditor
                    prompt={prompt}
                    agents={agents}
                    onSave={async (content) => setPrompt((await agentSkillApi.savePrompt(content)).data)}
                    onReset={async () => setPrompt((await agentSkillApi.resetPrompt()).data)}
                />
            </div>
        </section>
    );
}
