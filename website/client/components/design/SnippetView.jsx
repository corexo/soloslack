'use client';
import { useState } from 'react';
import { Code2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// Sandboxed preview: scripts are NOT allowed (empty sandbox attribute)
export function SnippetFrame({ html, css, className }) {
    const srcDoc = `<!doctype html><html><head><style>${css ?? ''}</style></head><body>${html ?? ''}</body></html>`;
    return (
        <iframe
            title="Snippet preview"
            sandbox=""
            srcDoc={srcDoc}
            className={cn('w-full h-[420px] rounded-xl border border-border-subtle bg-white', className)}
        />
    );
}

export default function SnippetView({ data }) {
    const [showCode, setShowCode] = useState(false);
    const html = data?.html ?? '';
    const css = data?.css ?? '';

    if (!html.trim() && !css.trim()) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted space-y-3">
                <Code2 className="w-10 h-10 opacity-30" />
                <p className="text-xs">No snippet yet — edit this entry to add HTML and CSS.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <SnippetFrame html={html} css={css} />

            <div>
                <button
                    onClick={() => setShowCode(prev => !prev)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                >
                    {showCode ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
                    {showCode ? 'Hide code' : 'Show code'}
                </button>
            </div>

            {showCode && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {html.trim() && (
                        <div>
                            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">HTML</p>
                            <pre className="p-4 rounded-xl bg-surface-raised border border-border-subtle text-xs font-mono text-text-primary overflow-x-auto whitespace-pre-wrap break-words">
                                {html}
                            </pre>
                        </div>
                    )}
                    {css.trim() && (
                        <div>
                            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">CSS</p>
                            <pre className="p-4 rounded-xl bg-surface-raised border border-border-subtle text-xs font-mono text-text-primary overflow-x-auto whitespace-pre-wrap break-words">
                                {css}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
