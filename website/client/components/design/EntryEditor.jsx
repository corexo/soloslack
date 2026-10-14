'use client';
import { useState } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import { ENTRY_TYPES, normalizeEntryData } from './entryTypes';
import GalleryEditor from './GalleryEditor';
import TokensEditor from './TokensEditor';
import SnippetEditor from './SnippetEditor';
import DocEditor from './DocEditor';
import ComponentEditor from './ComponentEditor';

// Edit mode for one entry: title + type-specific editor + save/cancel
export default function EntryEditor({ entry, repo = null, saving = false, onSave, onCancel }) {
    const [title, setTitle] = useState(entry?.title ?? '');
    const [data, setData] = useState(() => normalizeEntryData(entry?.type, entry?.data));

    const meta = ENTRY_TYPES[entry?.type];
    const TypeIcon = meta?.icon;

    const renderTypeEditor = () => {
        switch (entry?.type) {
            case 'gallery':
                return <GalleryEditor data={data} onChange={setData} repo={repo} />;
            case 'tokens':
                return <TokensEditor data={data} onChange={setData} />;
            case 'snippet':
                return <SnippetEditor data={data} onChange={setData} />;
            case 'doc':
                return <DocEditor data={data} onChange={setData} />;
            case 'component':
            case 'screen':
                return <ComponentEditor type={entry.type} data={data} onChange={setData} repo={repo} />;
            default:
                return null;
        }
    };

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
                    <span className="text-xs text-text-muted shrink-0 hidden sm:inline">Editing</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onCancel}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                    >
                        <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button
                        onClick={() => onSave(title.trim() || meta?.defaultTitle || 'Untitled', data)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-8 mx-auto w-full max-w-4xl space-y-6">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={meta?.defaultTitle ?? 'Untitled'}
                        className="text-3xl font-bold bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted w-full"
                    />
                    {renderTypeEditor()}
                </div>
            </div>
        </div>
    );
}
