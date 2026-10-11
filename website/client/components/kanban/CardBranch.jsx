'use client';
import { useState, useEffect } from 'react';
import { GitBranch, Plus, X, Copy, Check } from 'lucide-react';
import { gitApi, suggestBranchName } from '@/lib/api/gitApi';
import { timeAgo } from '@/lib/utils/formatDate';

const PREFIXES = ['feat', 'fix', 'chore', 'refactor', 'docs'];

// Link a ticket to an existing branch of the board's repo, or create + link a new one
export default function CardBranch({ repo, branch, cardTitle, onChange }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [creating, setCreating] = useState(false);
    const [prefix, setPrefix] = useState('feat');
    const [newName, setNewName] = useState('');
    const [from, setFrom] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!repo) return;
        gitApi.getBranches(repo)
            .then(res => {
                setError('');
                setData(res.data);
                setFrom(res.data.branches.find(b => b.name === 'develop')?.name || res.data.current || '');
            })
            .catch(err => setError(err.message));
    }, [repo, branch]);

    const startCreate = () => {
        setNewName(suggestBranchName(cardTitle, prefix));
        setCreating(true);
    };

    const handleCreate = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await gitApi.createBranch(repo, newName.trim(), from || undefined);
            onChange(res.data.name);
            setCreating(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const linked = data?.branches.find(b => b.name === branch);
    const inputClass = 'bg-surface-overlay border border-border-default rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent transition-colors';

    if (!repo) {
        return (
            <p className="text-[11px] text-text-muted">
                Link a git repository to this board (<GitBranch className="w-3 h-3 inline" /> Repo in the board header) to attach branches.
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {branch && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                    <GitBranch className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-emerald-400 truncate">{branch}</p>
                        {linked ? (
                            <p className="text-[10px] text-text-muted truncate">
                                {linked.lastCommit.hash} · {linked.lastCommit.subject} · {timeAgo(linked.lastCommit.date)}
                                {!linked.local && ' · remote only'}
                            </p>
                        ) : data && (
                            <p className="text-[10px] text-amber-400">Branch not found in {repo}</p>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(`git switch ${branch}`);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }}
                        className="text-text-muted hover:text-accent"
                        title="Copy `git switch` command"
                    >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button onClick={() => onChange(null)} className="text-text-muted hover:text-red-400" title="Unlink branch">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            {creating ? (
                <div className="space-y-1.5 p-2 rounded-md border border-border-subtle">
                    <div className="flex gap-1.5">
                        <select
                            value={prefix}
                            onChange={(e) => { setPrefix(e.target.value); setNewName(suggestBranchName(cardTitle, e.target.value)); }}
                            className={inputClass}
                        >
                            {PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                            className={`${inputClass} flex-1 font-mono`}
                            autoFocus
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-text-muted">from</span>
                        <select value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} flex-1`}>
                            {(data?.branches || []).filter(b => b.local).map(b => (
                                <option key={b.name} value={b.name}>{b.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={handleCreate}
                            disabled={!newName.trim() || busy}
                            className="px-2.5 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/25 disabled:opacity-30"
                        >
                            Create
                        </button>
                        <button onClick={() => setCreating(false)} className="text-[11px] text-text-muted hover:text-text-primary">Cancel</button>
                    </div>
                    <p className="text-[10px] text-text-muted">Creates the branch only — your working tree is not switched.</p>
                </div>
            ) : (
                <div className="flex gap-1.5">
                    <select
                        value=""
                        onChange={(e) => e.target.value && onChange(e.target.value)}
                        className={`${inputClass} flex-1`}
                    >
                        <option value="">{branch ? 'Switch to another branch…' : 'Link existing branch…'}</option>
                        {(data?.branches || []).filter(b => b.name !== branch).map(b => (
                            <option key={b.name} value={b.name}>
                                {b.name}{b.current ? ' (checked out)' : ''}{!b.local ? ' (remote)' : ''}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={startCreate}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/20"
                    >
                        <Plus className="w-3 h-3" /> New branch
                    </button>
                </div>
            )}
            {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
    );
}
