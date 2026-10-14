'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Palette, ScanSearch, Sparkles, GitBranch, FolderOpen, Loader2 } from 'lucide-react';
import { designApi } from '@/lib/api/designApi';
import { useWorkspaces } from '@/context/WorkspacesContext';
import { useUndo } from '@/context/UndoContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import DesignBookSidebar from '@/components/design/DesignBookSidebar';
import EntryDetailView from '@/components/design/EntryDetailView';
import EntryEditor from '@/components/design/EntryEditor';
import { ENTRY_TYPES } from '@/components/design/entryTypes';
import DescribeWithAIModal from '@/components/design/DescribeWithAIModal';
import { gitApi } from '@/lib/api/gitApi';
import { useAI } from '@/context/AIContext';
import { timeAgo } from '@/lib/utils/formatDate';

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

let tempIdCounter = 0;
const nextTempId = () => `temp-${Date.now()}-${++tempIdCounter}`;

export default function DesignPage() {
    const { activeWorkspaceId, fetchWorkspaces } = useWorkspaces();
    const { showToast } = useUndo();

    const [chapters, setChapters] = useState([]);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeEntryId, setActiveEntryId] = useState(null);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(null);
    // null = workspace book (filtered by the active workspace), otherwise a git repo's book
    const [repo, setRepo] = useState(null);
    const [repos, setRepos] = useState([]);
    const [scanInfo, setScanInfo] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [describeOpen, setDescribeOpen] = useState(false);
    const { isConfigured: aiConfigured } = useAI();

    // ?repo=<name> deep link (e.g. from a board header)
    useEffect(() => {
        const fromUrl = new URLSearchParams(window.location.search).get('repo');
        if (fromUrl) setRepo(fromUrl);
        gitApi.getRepos().then(res => setRepos(res.data)).catch(() => setRepos([]));
    }, []);

    useEffect(() => {
        if (!repo) { setScanInfo(null); return; }
        designApi.getScanInfo(repo).then(res => setScanInfo(res.data)).catch(() => setScanInfo(null));
        const url = new URL(window.location.href);
        url.searchParams.set('repo', repo);
        window.history.replaceState(null, '', url);
    }, [repo]);

    const fetchBook = useCallback(async () => {
        setLoading(true);
        try {
            const res = await designApi.getDesignBook(activeWorkspaceId ?? null, repo);
            const payload = res?.data ?? res;
            setChapters([...(payload?.chapters ?? [])].sort(byOrder));
            setEntries([...(payload?.entries ?? [])].sort(byOrder));
        } catch (err) {
            console.error('Failed to fetch design book:', err);
            showToast({ label: 'Failed to load design book: ' + err.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [activeWorkspaceId, repo, showToast]);

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    useEffect(() => {
        fetchBook();
    }, [fetchBook]);

    const sortedChapters = useMemo(() => [...chapters].sort(byOrder), [chapters]);

    const entriesByChapter = useMemo(() => {
        const map = new Map();
        for (const ch of sortedChapters) map.set(ch._id, []);
        for (const e of [...entries].sort(byOrder)) {
            if (!map.has(e.chapterId)) continue; // ungrouped entries are not reorder targets
            map.get(e.chapterId).push(e);
        }
        return map;
    }, [sortedChapters, entries]);

    const activeEntry = useMemo(
        () => entries.find(e => e._id === activeEntryId) ?? null,
        [entries, activeEntryId]
    );

    // ── Chapters ─────────────────────────────────────────────────────────────
    const handleCreateChapter = async (title) => {
        const tempId = nextTempId();
        const optimistic = { _id: tempId, workspaceId: activeWorkspaceId ?? undefined, title, order: chapters.length };
        setChapters(prev => [...prev, optimistic]);
        try {
            const res = await designApi.createChapter({ workspaceId: activeWorkspaceId ?? undefined, repo: repo ?? undefined, title });
            const created = res?.data ?? res;
            setChapters(prev => prev.map(c => (c._id === tempId ? created : c)));
            return created;
        } catch (err) {
            showToast({ label: 'Could not create chapter: ' + err.message, type: 'error' });
            fetchBook();
            return null;
        }
    };

    const handleRenameChapter = async (id, title) => {
        const prevTitle = chapters.find(c => c._id === id)?.title;
        setChapters(prev => prev.map(c => (c._id === id ? { ...c, title } : c)));
        try {
            await designApi.updateChapter(id, { title });
        } catch (err) {
            showToast({ label: 'Could not rename chapter: ' + err.message, type: 'error' });
            setChapters(prev => prev.map(c => (c._id === id ? { ...c, title: prevTitle } : c)));
        }
    };

    const handleDeleteChapter = async (chapter) => {
        if (!chapter) return;
        // Server deletes the chapter's entries cascadingly
        setChapters(prev => prev.filter(c => c._id !== chapter._id));
        setEntries(prev => prev.filter(e => e.chapterId !== chapter._id));
        if (entries.some(e => e.chapterId === chapter._id && e._id === activeEntryId)) {
            setActiveEntryId(null);
            setEditing(false);
        }
        try {
            await designApi.deleteChapter(chapter._id);
        } catch (err) {
            showToast({ label: 'Could not delete chapter: ' + err.message, type: 'error' });
            fetchBook();
        }
    };

    // ── Entries ──────────────────────────────────────────────────────────────
    const handleCreateEntry = async (type, chapterId) => {
        const meta = ENTRY_TYPES[type];
        if (!meta) return;

        let targetChapterId = chapterId;
        if (!targetChapterId) {
            targetChapterId = activeEntry?.chapterId
                ?? sortedChapters[sortedChapters.length - 1]?._id
                ?? null;
        }
        if (!targetChapterId) {
            // No chapter exists yet — create a starter chapter first
            const created = await handleCreateChapter('General');
            if (!created?._id) return;
            targetChapterId = created._id;
        }

        const siblings = entriesByChapter.get(targetChapterId) ?? [];
        const tempId = nextTempId();
        const optimistic = {
            _id: tempId,
            workspaceId: activeWorkspaceId ?? undefined,
            chapterId: targetChapterId,
            type,
            title: meta.defaultTitle,
            order: siblings.length,
            data: meta.defaultData(),
        };
        setEntries(prev => [...prev, optimistic]);
        setActiveEntryId(tempId);
        setEditing(true);

        try {
            const res = await designApi.createEntry({
                workspaceId: activeWorkspaceId ?? undefined,
                repo: repo ?? undefined,
                chapterId: targetChapterId,
                type,
                title: meta.defaultTitle,
                data: meta.defaultData(),
            });
            const created = res?.data ?? res;
            setEntries(prev => prev.map(e => (e._id === tempId ? created : e)));
            setActiveEntryId(created?._id ?? tempId);
        } catch (err) {
            showToast({ label: 'Could not create entry: ' + err.message, type: 'error' });
            fetchBook();
        }
    };

    const handleSaveEntry = async (title, data) => {
        if (!activeEntry) return;
        setSaving(true);
        try {
            const res = await designApi.updateEntry(activeEntry._id, { title, data });
            const updated = res?.data ?? res;
            setEntries(prev => prev.map(e => (e._id === activeEntry._id ? { ...e, ...updated } : e)));
            setEditing(false);
            showToast({ label: 'Entry saved', type: 'success', duration: 2000 });
        } catch (err) {
            showToast({ label: 'Could not save entry: ' + err.message, type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const executeDeleteEntry = async () => {
        const entry = confirmDeleteEntry;
        if (!entry) return;
        setEntries(prev => prev.filter(e => e._id !== entry._id));
        if (activeEntryId === entry._id) {
            setActiveEntryId(null);
            setEditing(false);
        }
        try {
            await designApi.deleteEntry(entry._id);
        } catch (err) {
            showToast({ label: 'Could not delete entry: ' + err.message, type: 'error' });
            fetchBook();
        }
    };

    // ── Drag reorder (within and across chapters) ────────────────────────────
    const handleMoveEntry = (entryId, targetChapterId, overEntryId) => {
        const moving = entries.find(e => e._id === entryId);
        if (!moving) return;

        // Build per-chapter ordered lists from current state
        const groups = new Map();
        for (const ch of sortedChapters) groups.set(ch._id, []);
        const loose = [];
        for (const e of [...entries].sort(byOrder)) {
            if (groups.has(e.chapterId)) groups.get(e.chapterId).push(e);
            else loose.push(e);
        }

        const source = groups.get(moving.chapterId);
        if (source) {
            const idx = source.findIndex(e => e._id === entryId);
            if (idx !== -1) source.splice(idx, 1);
        } else {
            const idx = loose.findIndex(e => e._id === entryId);
            if (idx !== -1) loose.splice(idx, 1);
        }

        const target = groups.get(targetChapterId);
        if (!target) return; // unknown chapter — ignore

        if (overEntryId) {
            const overIdx = target.findIndex(e => e._id === overEntryId);
            if (overIdx !== -1) target.splice(overIdx, 0, moving);
            else target.push(moving);
        } else {
            target.push(moving);
        }

        // Re-number orders per chapter and collect changed rows
        const next = [];
        const changed = [];
        const before = new Map(entries.map(e => [e._id, { chapterId: e.chapterId, order: e.order ?? 0 }]));
        for (const ch of sortedChapters) {
            const list = groups.get(ch._id);
            list.forEach((e, i) => {
                const row = { ...e, chapterId: ch._id, order: i };
                next.push(row);
                const old = before.get(e._id);
                if (!old || old.chapterId !== ch._id || old.order !== i) {
                    changed.push({ id: e._id, chapterId: ch._id, order: i });
                }
            });
        }
        next.push(...loose);

        if (changed.length === 0) return;

        setEntries(prev => next.map(row => {
            const current = prev.find(e => e._id === row._id);
            return current ? { ...current, chapterId: row.chapterId, order: row.order } : row;
        }));

        designApi.reorderDesign({ entries: changed }).catch((err) => {
            console.error('Failed to reorder design book:', err);
            showToast({ label: 'Reorder failed — reloading', type: 'error' });
            fetchBook();
        });
    };

    const handleScan = async () => {
        if (!repo) return;
        setScanning(true);
        try {
            const res = await designApi.scanRepo(repo);
            setScanInfo(res.data);
            const { created, updated, missing } = res.data;
            showToast({ label: `Scan done: ${created} new, ${updated} updated${missing ? `, ${missing} no longer in repo` : ''}`, type: 'success' });
            fetchBook();
        } catch (err) {
            showToast({ label: 'Scan failed: ' + err.message, type: 'error' });
        } finally {
            setScanning(false);
        }
    };

    const handleApplyDescriptions = async (accepted) => {
        for (const p of accepted) {
            const data = { ...p.entry.data, description: p.description, descriptionSource: 'ai' };
            if (p.entry.type === 'component' && p.variants.length && !p.entry.data.variants?.length) data.variants = p.variants;
            const res = await designApi.updateEntry(p.entry._id, { data });
            const updated = res?.data ?? res;
            setEntries(prev => prev.map(e => (e._id === p.entry._id ? { ...e, ...updated } : e)));
        }
        showToast({ label: `${accepted.length} description${accepted.length !== 1 ? 's' : ''} saved`, type: 'success' });
    };

    const handleSelectEntry = (id) => {
        setActiveEntryId(id);
        setEditing(false);
    };

    const hasContent = chapters.length > 0 || entries.length > 0;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Book source: workspace book or a git repo's book (scannable) */}
            <div className="h-12 shrink-0 border-b border-border-subtle px-4 flex items-center gap-3 bg-surface-raised/20">
                <Palette className="w-4 h-4 text-accent shrink-0" />
                <select
                    value={repo || ''}
                    onChange={(e) => { setRepo(e.target.value || null); setActiveEntryId(null); setEditing(false); }}
                    className="bg-surface-overlay border border-border-subtle rounded-md px-2 py-1 text-xs text-text-primary outline-none max-w-[260px]"
                    title="Design book source"
                >
                    <option value="">Workspace book (manual)</option>
                    {repos.map(r => <option key={r} value={r}>Repo: {r}</option>)}
                </select>
                {repo ? (
                    <>
                        <span className="text-[11px] text-text-muted truncate hidden md:inline">
                            {scanInfo
                                ? `${scanInfo.framework?.name}${scanInfo.framework?.tailwind ? ' + Tailwind' : ''} · ${scanInfo.totals.components} components · ${scanInfo.totals.screens} screens · ${scanInfo.totals.colors} colors · scanned ${timeAgo(scanInfo.scannedAt)}`
                                : 'Not scanned yet'}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                            {aiConfigured && entries.some(e => e.type === 'component' || e.type === 'screen') && (
                                <button onClick={() => setDescribeOpen(true)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20">
                                    <Sparkles className="w-3.5 h-3.5" /> Describe with AI
                                </button>
                            )}
                            <button onClick={handleScan} disabled={scanning}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50">
                                {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
                                {scanInfo ? 'Rescan repo' : 'Scan repo'}
                            </button>
                        </div>
                    </>
                ) : (
                    <span className="text-[11px] text-text-muted flex items-center gap-1">
                        <FolderOpen className="w-3.5 h-3.5" /> Filtered by the active workspace · pick a repo to generate a book from code
                        <GitBranch className="w-3.5 h-3.5 ml-1" />
                    </span>
                )}
            </div>

            <div className="flex flex-1 overflow-hidden">
            <div className="shrink-0">
                <DesignBookSidebar
                    chapters={sortedChapters}
                    entries={entries}
                    activeEntryId={activeEntryId}
                    loading={loading}
                    onSelectEntry={handleSelectEntry}
                    onCreateChapter={handleCreateChapter}
                    onRenameChapter={handleRenameChapter}
                    onDeleteChapter={handleDeleteChapter}
                    onCreateEntry={handleCreateEntry}
                    onMoveEntry={handleMoveEntry}
                    showWorkspaceFilter={!repo}
                />
            </div>

            <div className="flex-1 overflow-auto relative">
                {activeEntry ? (
                    editing ? (
                        <EntryEditor
                            key={activeEntry._id}
                            entry={activeEntry}
                            repo={repo}
                            saving={saving}
                            onSave={handleSaveEntry}
                            onCancel={() => setEditing(false)}
                        />
                    ) : (
                        <EntryDetailView
                            key={activeEntry._id}
                            entry={activeEntry}
                            onEdit={() => setEditing(true)}
                            onDelete={() => setConfirmDeleteEntry(activeEntry)}
                        />
                    )
                ) : loading ? (
                    <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-3">
                        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                        <p className="text-xs">Loading design book…</p>
                    </div>
                ) : hasContent ? (
                    <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-4">
                        <Palette className="w-16 h-16 opacity-20" />
                        <p className="text-lg">Select an entry to view it</p>
                        <p className="text-xs max-w-sm text-center">
                            Or add a new entry with the <span className="text-accent font-medium">+</span> button in the sidebar.
                        </p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-4 p-8">
                        <Palette className="w-16 h-16 opacity-20" />
                        <h2 className="text-xl font-bold text-text-primary">Design Book{repo ? ` · ${repo}` : ''}</h2>
                        {repo && (
                            <button onClick={handleScan} disabled={scanning}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">
                                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
                                Scan {repo} for tokens, components and screens
                            </button>
                        )}
                        <p className="text-sm text-text-secondary max-w-md text-center leading-relaxed">
                            A living style guide for your workspace. Organize chapters with galleries
                            (screenshots &amp; mockups), design tokens (colors, typography, spacing),
                            HTML/CSS snippets and markdown docs — all in one place.
                        </p>
                        <p className="text-xs max-w-md text-center">
                            Start by creating a chapter in the sidebar, then add your first entry.
                        </p>
                    </div>
                )}
            </div>

            </div>

            <DescribeWithAIModal
                isOpen={describeOpen}
                onClose={() => setDescribeOpen(false)}
                entries={entries}
                framework={scanInfo?.framework?.name}
                onApply={handleApplyDescriptions}
            />

            <ConfirmModal
                isOpen={!!confirmDeleteEntry}
                onClose={() => setConfirmDeleteEntry(null)}
                onConfirm={executeDeleteEntry}
                title="Delete Entry"
                message={`Delete "${confirmDeleteEntry?.title}"? This cannot be undone.`}
                confirmText="Delete"
            />
        </div>
    );
}
