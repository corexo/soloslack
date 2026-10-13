'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Palette } from 'lucide-react';
import { designApi } from '@/lib/api/designApi';
import { useWorkspaces } from '@/context/WorkspacesContext';
import { useUndo } from '@/context/UndoContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import DesignBookSidebar from '@/components/design/DesignBookSidebar';
import EntryDetailView from '@/components/design/EntryDetailView';
import EntryEditor from '@/components/design/EntryEditor';
import { ENTRY_TYPES } from '@/components/design/entryTypes';

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

    const fetchBook = useCallback(async () => {
        setLoading(true);
        try {
            const res = await designApi.getDesignBook(activeWorkspaceId ?? null);
            const payload = res?.data ?? res;
            setChapters([...(payload?.chapters ?? [])].sort(byOrder));
            setEntries([...(payload?.entries ?? [])].sort(byOrder));
        } catch (err) {
            console.error('Failed to fetch design book:', err);
            showToast({ label: 'Failed to load design book: ' + err.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [activeWorkspaceId, showToast]);

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
            const res = await designApi.createChapter({ workspaceId: activeWorkspaceId ?? undefined, title });
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

    const handleSelectEntry = (id) => {
        setActiveEntryId(id);
        setEditing(false);
    };

    const hasContent = chapters.length > 0 || entries.length > 0;

    return (
        <div className="flex h-full overflow-hidden">
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
                />
            </div>

            <div className="flex-1 overflow-auto relative">
                {activeEntry ? (
                    editing ? (
                        <EntryEditor
                            key={activeEntry._id}
                            entry={activeEntry}
                            workspaceId={activeWorkspaceId ?? activeEntry.workspaceId}
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
                        <h2 className="text-xl font-bold text-text-primary">Design Book</h2>
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
