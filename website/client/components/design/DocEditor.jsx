'use client';
import { useState } from 'react';
import { Edit3, Eye } from 'lucide-react';
import MarkdownRenderer from '@/components/notes/MarkdownRenderer';
import { cn } from '@/lib/utils/cn';

export default function DocEditor({ data, onChange }) {
    const [mode, setMode] = useState('edit'); // 'edit' | 'preview'
    const body = data?.body ?? '';

    return (
        <div className="space-y-4">
            {/* Edit / Preview toggle — same pattern as the notes editor */}
            <div className="flex justify-end">
                <div className="flex bg-surface-overlay rounded-md p-0.5 border border-border-default">
                    <button
                        onClick={() => setMode('edit')}
                        className={cn(
                            'px-2.5 py-1 text-xs rounded flex items-center gap-1 transition-colors',
                            mode === 'edit'
                                ? 'bg-accent text-white'
                                : 'text-text-secondary hover:text-text-primary'
                        )}
                    >
                        <Edit3 className="w-3 h-3" /> Edit
                    </button>
                    <button
                        onClick={() => setMode('preview')}
                        className={cn(
                            'px-2.5 py-1 text-xs rounded flex items-center gap-1 transition-colors',
                            mode === 'preview'
                                ? 'bg-accent text-white'
                                : 'text-text-secondary hover:text-text-primary'
                        )}
                    >
                        <Eye className="w-3 h-3" /> Preview
                    </button>
                </div>
            </div>

            {mode === 'edit' ? (
                <textarea
                    value={body}
                    onChange={(e) => onChange({ ...data, body: e.target.value })}
                    placeholder="Write in markdown…"
                    spellCheck={false}
                    className="w-full min-h-[55vh] bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted resize-none font-mono text-sm leading-relaxed"
                />
            ) : (
                body.trim() ? (
                    <MarkdownRenderer content={body} />
                ) : (
                    <p className="text-xs text-text-muted py-8 text-center">Nothing to preview yet.</p>
                )
            )}
        </div>
    );
}
