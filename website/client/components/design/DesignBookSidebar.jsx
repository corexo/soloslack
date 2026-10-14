'use client';
import { useEffect, useState } from 'react';
import {
    BookOpen, ChevronDown, FolderPlus, GripVertical, Pencil, Plus, Trash2,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWorkspaces } from '@/context/WorkspacesContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { cn } from '@/lib/utils/cn';
import { ENTRY_TYPES, ENTRY_TYPE_ORDER } from './entryTypes';

const DROP_PREFIX = 'chapter-drop:';

function SortableEntryItem({ entry, isActive, onSelect }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry._id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const meta = ENTRY_TYPES[entry.type];
    const TypeIcon = meta?.icon ?? BookOpen;

    return (
        <div ref={setNodeRef} style={style} className={cn('relative group', isDragging && 'opacity-50 z-50')}>
            <span
                className="absolute left-1 top-1/2 -translate-y-1/2 p-0.5 cursor-grab opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-text-muted touch-none"
                {...attributes}
                {...listeners}
                title="Drag to reorder"
            >
                <GripVertical className="w-3 h-3" />
            </span>
            <button
                onClick={() => onSelect(entry._id)}
                className={cn(
                    'w-full flex items-center gap-2 pl-6 pr-2.5 py-1.5 text-xs rounded-lg transition-all duration-200',
                    isActive
                        ? 'bg-accent/15 text-accent font-medium'
                        : 'text-text-secondary hover:bg-surface-hover/50 hover:text-text-primary'
                )}
            >
                <TypeIcon className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="truncate flex-1 text-left">
                    {entry.title || meta?.defaultTitle || 'Untitled'}
                </span>
            </button>
        </div>
    );
}

function TypeMenu({ onSelectType, onClose }) {
    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div className="absolute right-0 top-full mt-1 w-48 bg-surface-overlay border border-border-subtle rounded-lg shadow-xl z-50 py-1">
                <p className="px-3 py-1 text-[11px] font-semibold text-text-muted uppercase tracking-widest">
                    New Entry
                </p>
                {ENTRY_TYPE_ORDER.map((type) => {
                    const meta = ENTRY_TYPES[type];
                    const Icon = meta.icon;
                    return (
                        <button
                            key={type}
                            onClick={() => { onSelectType(type); onClose(); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors flex items-center gap-2"
                        >
                            <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            <span className="flex-1">{meta.label}</span>
                        </button>
                    );
                })}
            </div>
        </>
    );
}

function ChapterGroup({ chapter, entries, activeEntryId, onSelectEntry, onRenameChapter, onRequestDelete, onCreateEntry }) {
    const [expanded, setExpanded] = useState(true);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(chapter.title ?? '');
    const [showTypeMenu, setShowTypeMenu] = useState(false);

    const { setNodeRef, isOver } = useDroppable({ id: `${DROP_PREFIX}${chapter._id}` });

    const commitRename = () => {
        const next = title.trim();
        setEditing(false);
        if (next && next !== chapter.title) onRenameChapter(chapter._id, next);
        else setTitle(chapter.title ?? '');
    };

    const entryIds = entries.map(e => e._id);

    return (
        <div className="space-y-0.5">
            {/* Chapter header */}
            {editing ? (
                <div className="px-2.5 py-1">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') { setEditing(false); setTitle(chapter.title ?? ''); }
                        }}
                        className="w-full bg-surface-overlay text-xs font-medium text-text-primary px-2 py-1 rounded border border-accent outline-none"
                        autoFocus
                    />
                </div>
            ) : (
                <div className="relative group flex items-center gap-1 px-2.5 py-1.5">
                    <button
                        onClick={() => setExpanded(prev => !prev)}
                        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                        title={expanded ? 'Collapse chapter' : 'Expand chapter'}
                    >
                        <ChevronDown className={cn(
                            'w-3.5 h-3.5 text-text-muted shrink-0 transition-transform duration-200',
                            !expanded && '-rotate-90'
                        )} />
                        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-widest truncate">
                            {chapter.title || 'Untitled Chapter'}
                        </span>
                        <span className="text-[11px] text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded-md font-mono shrink-0">
                            {entries.length}
                        </span>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity relative">
                        <button
                            onClick={() => setShowTypeMenu(prev => !prev)}
                            className="p-1 rounded text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                            title="Add entry to chapter"
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => { setEditing(true); setTitle(chapter.title ?? ''); }}
                            className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
                            title="Rename chapter"
                        >
                            <Pencil className="w-3 h-3" />
                        </button>
                        <button
                            onClick={() => onRequestDelete(chapter)}
                            className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Delete chapter"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {showTypeMenu && (
                            <TypeMenu onSelectType={(type) => onCreateEntry(type, chapter._id)} onClose={() => setShowTypeMenu(false)} />
                        )}
                    </div>
                </div>
            )}

            {/* Entries */}
            {expanded && (
                <div
                    ref={setNodeRef}
                    className={cn(
                        'space-y-0.5 min-h-[28px] rounded-lg transition-colors',
                        isOver && 'bg-accent/5 ring-1 ring-inset ring-accent/30'
                    )}
                >
                    <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
                        {entries.map(entry => (
                            <SortableEntryItem
                                key={entry._id}
                                entry={entry}
                                isActive={activeEntryId === entry._id}
                                onSelect={onSelectEntry}
                            />
                        ))}
                    </SortableContext>
                    {entries.length === 0 && (
                        <p className="pl-6 pr-2.5 py-1 text-[11px] text-text-muted/70 italic">
                            Empty — drop an entry here or use +
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default function DesignBookSidebar({
    chapters,
    entries,
    activeEntryId,
    loading,
    onSelectEntry,
    onCreateChapter,
    onRenameChapter,
    onDeleteChapter,
    onCreateEntry,
    onMoveEntry,
    showWorkspaceFilter = true,
}) {
    const { workspaces, activeWorkspaceId, setActiveWorkspaceId, fetchWorkspaces } = useWorkspaces();

    const [isCreatingChapter, setIsCreatingChapter] = useState(false);
    const [newChapterTitle, setNewChapterTitle] = useState('');
    const [headerTypeMenu, setHeaderTypeMenu] = useState(false);
    const [deletingChapter, setDeletingChapter] = useState(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    useEffect(() => {
        fetchWorkspaces();
    }, [fetchWorkspaces]);

    const handleCreateChapter = () => {
        const title = newChapterTitle.trim();
        if (!title) return;
        onCreateChapter(title);
        setNewChapterTitle('');
        setIsCreatingChapter(false);
    };

    const handleDragEnd = ({ active, over }) => {
        if (!over) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        if (overId === activeId) return;

        let targetChapterId;
        let overEntryId = null;
        if (overId.startsWith(DROP_PREFIX)) {
            targetChapterId = overId.slice(DROP_PREFIX.length);
        } else {
            overEntryId = overId;
            targetChapterId = entries.find(e => e._id === overId)?.chapterId;
        }
        if (!targetChapterId) return;
        onMoveEntry(activeId, targetChapterId, overEntryId);
    };

    const grouped = chapters.map(ch => ({
        chapter: ch,
        items: entries.filter(e => e.chapterId === ch._id),
    }));
    const ungrouped = entries.filter(e => !chapters.some(ch => ch._id === e.chapterId));

    return (
        <div className="w-72 flex flex-col border-r border-border-subtle bg-surface-base h-full">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-border-subtle">
                <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Design Book</h2>
                <div className="flex items-center gap-1 relative">
                    <button
                        onClick={() => setIsCreatingChapter(true)}
                        disabled={isCreatingChapter}
                        className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-30"
                        title="New chapter"
                    >
                        <FolderPlus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setHeaderTypeMenu(prev => !prev)}
                        className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                        title="New entry"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    {headerTypeMenu && (
                        <TypeMenu onSelectType={(type) => onCreateEntry(type, null)} onClose={() => setHeaderTypeMenu(false)} />
                    )}
                </div>
            </div>

            {/* Workspace filter — same pattern as the notes list */}
            {showWorkspaceFilter && workspaces.length > 0 && (
                <div className="px-3 py-1.5 border-b border-border-subtle">
                    <select
                        value={activeWorkspaceId ?? ''}
                        onChange={(e) => setActiveWorkspaceId(e.target.value || null)}
                        className="w-full bg-surface-overlay border border-border-subtle rounded-md px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent/40"
                    >
                        <option value="">All Workspaces</option>
                        {workspaces.map(ws => (
                            <option key={ws._id} value={ws._id}>{ws.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Chapters & entries */}
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
                {loading && chapters.length === 0 ? (
                    <div className="p-4 text-center text-xs text-text-muted">Loading…</div>
                ) : chapters.length === 0 && !isCreatingChapter ? (
                    <div className="p-4 text-center space-y-2">
                        <p className="text-xs text-text-muted">No chapters yet.</p>
                        <button
                            onClick={() => setIsCreatingChapter(true)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent/15 text-accent text-[11px] font-medium hover:bg-accent/25 transition-colors"
                        >
                            <FolderPlus className="w-3.5 h-3.5" /> Create first chapter
                        </button>
                    </div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        {grouped.map(({ chapter, items }) => (
                            <ChapterGroup
                                key={chapter._id}
                                chapter={chapter}
                                entries={items}
                                activeEntryId={activeEntryId}
                                onSelectEntry={onSelectEntry}
                                onRenameChapter={onRenameChapter}
                                onRequestDelete={setDeletingChapter}
                                onCreateEntry={onCreateEntry}
                            />
                        ))}

                        {ungrouped.length > 0 && (
                            <div className="space-y-0.5">
                                <p className="px-2.5 py-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-widest">
                                    Ungrouped
                                </p>
                                <SortableContext items={ungrouped.map(e => e._id)} strategy={verticalListSortingStrategy}>
                                    {ungrouped.map(entry => (
                                        <SortableEntryItem
                                            key={entry._id}
                                            entry={entry}
                                            isActive={activeEntryId === entry._id}
                                            onSelect={onSelectEntry}
                                        />
                                    ))}
                                </SortableContext>
                            </div>
                        )}
                    </DndContext>
                )}

                {/* Inline chapter creation */}
                {isCreatingChapter && (
                    <div className="px-1 pt-1 space-y-1.5">
                        <input
                            type="text"
                            value={newChapterTitle}
                            onChange={(e) => setNewChapterTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateChapter();
                                if (e.key === 'Escape') setIsCreatingChapter(false);
                            }}
                            placeholder="Chapter title"
                            className="w-full bg-surface-overlay border border-border-default rounded-md px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent"
                            autoFocus
                        />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCreateChapter}
                                disabled={!newChapterTitle.trim()}
                                className="px-2.5 py-1 rounded bg-accent/20 text-accent text-[11px] font-medium hover:bg-accent/30 disabled:opacity-30 transition-colors"
                            >
                                Create
                            </button>
                            <button
                                onClick={() => setIsCreatingChapter(false)}
                                className="text-[11px] text-text-muted hover:text-text-primary"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={!!deletingChapter}
                onClose={() => setDeletingChapter(null)}
                onConfirm={() => onDeleteChapter(deletingChapter)}
                title="Delete Chapter"
                message={`Delete "${deletingChapter?.title}" and all entries inside? This cannot be undone.`}
                confirmText="Delete"
            />
        </div>
    );
}
