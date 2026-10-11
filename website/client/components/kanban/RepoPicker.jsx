'use client';
import { useState, useEffect } from 'react';
import { GitBranch, Check, X } from 'lucide-react';
import { gitApi } from '@/lib/api/gitApi';
import { cn } from '@/lib/utils/cn';

// Links a board to a git repository (directory under the server's REPOS_DIR)
export default function RepoPicker({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const [repos, setRepos] = useState(null);
    const [filter, setFilter] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open || repos) return;
        gitApi.getRepos().then(res => setRepos(res.data)).catch(err => setError(err.message));
    }, [open, repos]);

    const visible = (repos || []).filter(r => r.toLowerCase().includes(filter.toLowerCase()));
    const select = (repo) => { onChange(repo); setOpen(false); setFilter(''); };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors max-w-[180px]',
                    value ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                )}
                title={value ? `Git repo: ${value}` : 'Link a git repository'}
            >
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{value || 'Repo'}</span>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-surface-overlay border border-border-subtle rounded-lg shadow-xl overflow-hidden">
                        <input
                            autoFocus
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filter repositories…"
                            className="w-full px-3 py-2 text-xs bg-transparent border-b border-border-subtle text-text-primary outline-none placeholder:text-text-muted"
                        />
                        <div className="max-h-64 overflow-y-auto py-1">
                            {error && <p className="px-3 py-2 text-[11px] text-red-400">{error}</p>}
                            {!repos && !error && <p className="px-3 py-2 text-[11px] text-text-muted">Loading…</p>}
                            {value && (
                                <button onClick={() => select(null)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover">
                                    <X className="w-3 h-3" /> Unlink repository
                                </button>
                            )}
                            {visible.map(repo => (
                                <button
                                    key={repo}
                                    onClick={() => select(repo)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover text-left"
                                >
                                    <span className="w-3">{repo === value && <Check className="w-3 h-3 text-emerald-400" />}</span>
                                    <span className="truncate">{repo}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
