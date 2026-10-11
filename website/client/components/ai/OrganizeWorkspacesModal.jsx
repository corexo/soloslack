'use client';
import { useState, useEffect, useCallback } from 'react';
import { Sparkles, LayoutDashboard, FileText, Plus, Check } from 'lucide-react';
import Modal from '../ui/Modal';
import { useAI } from '@/context/AIContext';
import { useBoards } from '@/context/BoardsContext';
import { useWorkspaces } from '@/context/WorkspacesContext';
import { notesApi } from '@/lib/api/notesApi';
import { organizeWorkspacesPrompt } from '@/lib/ai/prompts';
import { WORKSPACE_COLOR_MAP } from '@/lib/utils/workspaceColors';
import { cn } from '@/lib/utils/cn';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const NEW_PREFIX = 'new:';
const NEW_COLORS = ['emerald', 'violet', 'amber', 'cyan', 'rose', 'orange', 'teal', 'indigo'];

/**
 * AI proposes a workspace per board/note; nothing changes until the user applies
 * the selected suggestions.
 */
export default function OrganizeWorkspacesModal({ isOpen, onClose }) {
    const { askAI } = useAI();
    const { boards, updateBoard, fetchBoards } = useBoards();
    const { workspaces, createWorkspace, fetchWorkspaces } = useWorkspaces();

    const [onlyUnassigned, setOnlyUnassigned] = useState(true);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState('');
    const [newWorkspaces, setNewWorkspaces] = useState([]); // [{ name, description }]
    const [rows, setRows] = useState([]); // [{ ref, type, id, title, current, target, reason, selected }]
    const [done, setDone] = useState(null);

    useEffect(() => {
        if (!isOpen) { setRows([]); setNewWorkspaces([]); setError(''); setDone(null); }
    }, [isOpen]);

    const wsName = useCallback((id) => workspaces.find(w => w._id === id)?.name || null, [workspaces]);

    const handleSuggest = async () => {
        setLoading(true);
        setError('');
        setRows([]);
        setDone(null);
        try {
            const res = await fetch(`${API_BASE}/search/corpus`);
            const corpus = (await res.json()).data;
            const notes = (await notesApi.getAll()).data;

            const cardsByBoard = new Map();
            corpus.cards.forEach(c => cardsByBoard.set(String(c.boardId), [...(cardsByBoard.get(String(c.boardId)) || []), c.title]));

            const items = [
                ...boards
                    .filter(b => !onlyUnassigned || !b.workspaceId)
                    .map((b, i) => ({
                        ref: `B${i + 1}`, type: 'board', id: b._id, title: b.name, current: b.workspaceId || null,
                        context: [b.description, (cardsByBoard.get(String(b._id)) || []).slice(0, 8).join('; ')].filter(Boolean).join(' — ').slice(0, 400),
                    })),
                ...notes
                    .filter(n => (n.title || n.body || '').trim() && (!onlyUnassigned || !n.workspaceId))
                    .map((n, i) => ({
                        ref: `N${i + 1}`, type: 'note', id: n._id, title: n.title || '(untitled)', current: n.workspaceId || null,
                        context: (n.body || '').replace(/\s+/g, ' ').slice(0, 300),
                    })),
            ];
            if (!items.length) {
                setError(onlyUnassigned ? 'Everything already has a workspace.' : 'No boards or notes to organize.');
                return;
            }

            const result = await askAI(organizeWorkspacesPrompt({
                workspaces,
                items: items.map(i => ({ ...i, currentWorkspace: wsName(i.current) })),
            }), { maxTokens: 3072, temperature: 0.2 });

            // Local models sometimes wrap the JSON in prose — take the outermost object
            const json = /\{[\s\S]*\}/.exec(result.text)?.[0];
            if (!json) throw new Error('AI did not return suggestions');
            const parsed = JSON.parse(json);

            const proposedNew = (parsed.newWorkspaces || [])
                .filter(w => w?.name && !workspaces.some(e => e.name.toLowerCase() === w.name.toLowerCase()));
            setNewWorkspaces(proposedNew);

            const resolve = (name) => {
                if (!name || /^none$/i.test(name)) return '';
                const existing = workspaces.find(w => w.name.toLowerCase() === name.toLowerCase());
                if (existing) return existing._id;
                const proposed = proposedNew.find(w => w.name.toLowerCase() === name.toLowerCase());
                return proposed ? `${NEW_PREFIX}${proposed.name}` : '';
            };

            const byRef = new Map((parsed.assignments || []).map(a => [String(a.ref).toUpperCase(), a]));
            setRows(items.map(item => {
                const a = byRef.get(item.ref);
                const target = resolve(a?.workspace);
                return {
                    ...item,
                    target,
                    reason: a?.reason || '',
                    // Pre-select only real changes
                    selected: Boolean(target) && target !== (item.current || ''),
                };
            }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const updateRow = (ref, patch) => setRows(prev => prev.map(r => r.ref === ref ? { ...r, ...patch } : r));
    const selected = rows.filter(r => r.selected && r.target !== (r.current || ''));

    const handleApply = async () => {
        setApplying(true);
        setError('');
        try {
            // Create the new workspaces that are actually used
            const needed = [...new Set(selected.map(r => r.target).filter(t => t.startsWith(NEW_PREFIX)))];
            const created = {};
            for (const [i, key] of needed.entries()) {
                const name = key.slice(NEW_PREFIX.length);
                const def = newWorkspaces.find(w => w.name === name);
                const ws = await createWorkspace({
                    name,
                    description: def?.description?.slice(0, 300) || '',
                    color: NEW_COLORS[(workspaces.length + i) % NEW_COLORS.length],
                });
                created[key] = ws._id;
            }

            for (const r of selected) {
                const workspaceId = r.target.startsWith(NEW_PREFIX) ? created[r.target] : (r.target || null);
                if (r.type === 'board') await updateBoard(r.id, { workspaceId });
                else await notesApi.update(r.id, { workspaceId });
            }
            await Promise.all([fetchWorkspaces(), fetchBoards()]);
            setDone({ moved: selected.length, created: needed.length });
            setRows([]);
        } catch (err) {
            setError(err.message);
        } finally {
            setApplying(false);
        }
    };

    const targetOptions = [
        ...workspaces.map(w => ({ value: w._id, label: w.name })),
        ...newWorkspaces.map(w => ({ value: `${NEW_PREFIX}${w.name}`, label: `${w.name} (new)` })),
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Organize with AI">
            <div className="space-y-4">
                {!rows.length && !loading && !done && (
                    <div className="text-center py-6 space-y-3">
                        <Sparkles className="w-8 h-8 text-purple-400 mx-auto" />
                        <p className="text-sm text-text-primary font-medium">AI suggests a workspace for your boards and notes</p>
                        <p className="text-xs text-text-muted">Nothing changes until you review and apply the suggestions.</p>
                        <label className="flex items-center justify-center gap-2 text-xs text-text-secondary cursor-pointer">
                            <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} className="accent-purple-500" />
                            Only items without a workspace
                        </label>
                        <button onClick={handleSuggest}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl text-sm font-semibold hover:bg-purple-500/30 transition-colors">
                            <Sparkles className="w-4 h-4" /> Suggest
                        </button>
                    </div>
                )}

                {loading && (
                    <div className="text-center py-8">
                        <div className="w-6 h-6 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-xs text-purple-400">Analyzing boards and notes…</p>
                    </div>
                )}

                {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

                {done && (
                    <div className="text-center py-6">
                        <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                        <p className="text-sm text-emerald-400 font-medium">
                            Moved {done.moved} item{done.moved !== 1 ? 's' : ''}{done.created ? `, created ${done.created} workspace${done.created !== 1 ? 's' : ''}` : ''}.
                        </p>
                        <button onClick={onClose} className="mt-3 px-4 py-2 text-xs text-text-secondary hover:text-text-primary">Close</button>
                    </div>
                )}

                {rows.length > 0 && (
                    <>
                        {newWorkspaces.length > 0 && (
                            <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 text-xs space-y-1">
                                <p className="font-semibold text-purple-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Proposed new workspaces</p>
                                {newWorkspaces.map(w => (
                                    <p key={w.name} className="text-text-secondary"><span className="text-text-primary font-medium">{w.name}</span>{w.description && ` — ${w.description}`}</p>
                                ))}
                                <p className="text-[10px] text-text-muted">Only created if a selected item uses them.</p>
                            </div>
                        )}

                        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                            {rows.map(r => {
                                const unchanged = r.target === (r.current || '');
                                const ws = workspaces.find(w => w._id === r.target);
                                const dot = ws ? (WORKSPACE_COLOR_MAP[ws.color] ?? WORKSPACE_COLOR_MAP.indigo).dot : r.target ? '#a78bfa' : null;
                                return (
                                    <div key={r.ref} className={cn('flex items-start gap-2.5 p-2.5 rounded-lg border',
                                        r.selected && !unchanged ? 'border-purple-500/30 bg-purple-500/5' : 'border-border-subtle')}>
                                        <input type="checkbox" checked={r.selected && !unchanged} disabled={unchanged}
                                            onChange={(e) => updateRow(r.ref, { selected: e.target.checked })}
                                            className="mt-1 accent-purple-500 disabled:opacity-30" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-text-primary flex items-center gap-1.5">
                                                {r.type === 'board'
                                                    ? <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                    : <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                                                <span className="truncate font-medium">{r.title}</span>
                                            </p>
                                            <p className="text-[10px] text-text-muted mt-0.5">
                                                {wsName(r.current) ? `now in ${wsName(r.current)}` : 'no workspace'}
                                                {r.reason && ` · ${r.reason}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {dot && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />}
                                            <select value={r.target} onChange={(e) => updateRow(r.ref, { target: e.target.value, selected: true })}
                                                className="max-w-[150px] bg-surface-overlay border border-border-default rounded-md px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent">
                                                <option value="">No workspace</option>
                                                {targetOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <button onClick={handleSuggest} disabled={loading || applying}
                                className="text-xs text-text-muted hover:text-purple-400 flex items-center gap-1 disabled:opacity-40">
                                <Sparkles className="w-3 h-3" /> Suggest again
                            </button>
                            <button onClick={handleApply} disabled={applying || selected.length === 0}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 disabled:opacity-40">
                                {applying
                                    ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                                    : <Check className="w-3.5 h-3.5" />}
                                Apply {selected.length} change{selected.length !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
