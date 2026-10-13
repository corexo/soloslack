'use client';
import { Pencil, Trash2 } from 'lucide-react';
import EntryRenderer from './EntryRenderer';
import { ENTRY_TYPES } from './entryTypes';

// View mode for one entry: type badge + title + edit/delete actions
export default function EntryDetailView({ entry, onEdit, onDelete }) {
    const meta = ENTRY_TYPES[entry?.type];
    const TypeIcon = meta?.icon;

    return (
        <div className="flex flex-col h-full bg-surface-base">
            {/* Toolbar */}
            <header className="h-14 border-b border-border-subtle px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    {TypeIcon && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/10 text-accent text-[11px] font-semibold shrink-0">
                            <TypeIcon className="w-3.5 h-3.5" />
                            {meta?.label}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={onEdit}
                        className="p-1.5 rounded-md text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                        title="Edit entry"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1.5 rounded-md text-text-secondary hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="Delete entry"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-8 mx-auto w-full max-w-4xl space-y-8">
                    <h1 className="text-3xl font-bold text-text-primary break-words">
                        {entry?.title || 'Untitled'}
                    </h1>
                    <EntryRenderer entry={entry} />
                </div>
            </div>
        </div>
    );
}
