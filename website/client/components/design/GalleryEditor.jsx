'use client';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { fileApi } from '@/lib/api/fileApi';
import { useUndo } from '@/context/UndoContext';

const inputClass = 'w-full bg-surface-overlay border border-border-subtle rounded-md px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors';

export default function GalleryEditor({ data, onChange, workspaceId }) {
    const { showToast } = useUndo();
    const fileInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [newUrl, setNewUrl] = useState('');

    const items = Array.isArray(data?.items) ? data.items : [];

    const setItems = (next) => onChange({ ...data, items: next });

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file
        if (!file) return;

        setUploading(true);
        try {
            const res = await fileApi.uploadFile(file, workspaceId ?? undefined);
            const url = res?.file?.url ?? res?.url;
            if (!url) throw new Error('Upload response contained no file URL');
            setItems([...items, { url, caption: '' }]);
        } catch (err) {
            showToast({ label: 'Upload failed: ' + err.message, type: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleAddUrl = () => {
        const url = newUrl.trim();
        if (!url) return;
        setItems([...items, { url, caption: '' }]);
        setNewUrl('');
    };

    const updateItem = (index, patch) => {
        setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    };

    const removeItem = (index) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const moveItem = (index, delta) => {
        const target = index + delta;
        if (target < 0 || target >= items.length) return;
        const next = [...items];
        [next[index], next[target]] = [next[target], next[index]];
        setItems(next);
    };

    return (
        <div className="space-y-5">
            {/* Add images */}
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="text"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddUrl())}
                    placeholder="Paste an image URL…"
                    className={inputClass}
                />
                <button
                    type="button"
                    onClick={handleAddUrl}
                    disabled={!newUrl.trim()}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/15 text-accent text-xs font-medium hover:bg-accent/25 disabled:opacity-30 transition-colors shrink-0"
                >
                    <Plus className="w-3.5 h-3.5" /> Add URL
                </button>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-hover text-xs font-medium disabled:opacity-50 transition-colors shrink-0"
                >
                    {uploading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ImagePlus className="w-3.5 h-3.5" />}
                    {uploading ? 'Uploading…' : 'Upload image'}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="hidden"
                />
            </div>

            {/* Items */}
            {items.length === 0 ? (
                <p className="text-xs text-text-muted py-6 text-center border border-dashed border-border-subtle rounded-xl">
                    No images yet — upload a file or paste a URL above.
                </p>
            ) : (
                <div className="space-y-2">
                    {items.map((item, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3 p-2.5 rounded-xl border border-border-subtle bg-surface-overlay"
                        >
                            <div className="w-14 h-14 rounded-lg overflow-hidden border border-border-subtle bg-surface-raised shrink-0 flex items-center justify-center">
                                {item.url ? (
                                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-[10px] text-text-muted">no url</span>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 space-y-1.5">
                                <input
                                    type="text"
                                    value={item.url ?? ''}
                                    onChange={(e) => updateItem(i, { url: e.target.value })}
                                    placeholder="Image URL"
                                    className={`${inputClass} font-mono`}
                                />
                                <input
                                    type="text"
                                    value={item.caption ?? ''}
                                    onChange={(e) => updateItem(i, { caption: e.target.value })}
                                    placeholder="Caption (optional)"
                                    className={inputClass}
                                />
                            </div>

                            <div className="flex flex-col gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => moveItem(i, -1)}
                                    disabled={i === 0}
                                    className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover disabled:opacity-20 transition-colors"
                                    title="Move up"
                                >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveItem(i, 1)}
                                    disabled={i === items.length - 1}
                                    className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover disabled:opacity-20 transition-colors"
                                    title="Move down"
                                >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeItem(i)}
                                    className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                    title="Remove image"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
