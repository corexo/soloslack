'use client';
import { FileCode2, Puzzle, AlertTriangle, Sparkles } from 'lucide-react';
import MarkdownRenderer from '../notes/MarkdownRenderer';
import GalleryView from './GalleryView';
import { cn } from '@/lib/utils/cn';

const STATUS_STYLE = {
    stable: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    draft: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    deprecated: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export function MissingNotice({ what }) {
    return (
        <p className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            This {what} was not found in the repo on the last scan (renamed or removed?). Notes and screenshots are kept.
        </p>
    );
}

export function DescriptionBlock({ data }) {
    if (!data.description) {
        return <p className="text-sm text-text-muted italic">No description yet — edit this entry or use “Describe with AI”.</p>;
    }
    return (
        <div>
            {data.descriptionSource === 'ai' && (
                <p className="text-[10px] text-purple-400 flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> written by AI</p>
            )}
            <MarkdownRenderer content={data.description} />
        </div>
    );
}

// Read-only view of a UI component: status, location, description, props, variants, screenshots, code
export default function ComponentView({ data }) {
    return (
        <div className="space-y-8">
            {data.missing && <MissingNotice what="component" />}

            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('px-2 py-0.5 rounded-full border font-semibold capitalize', STATUS_STYLE[data.status] || STATUS_STYLE.draft)}>
                    {data.status}
                </span>
                {data.path && (
                    <span className="flex items-center gap-1 font-mono text-text-muted"><FileCode2 className="w-3.5 h-3.5" />{data.path}</span>
                )}
                {typeof data.usageCount === 'number' && (
                    <span className="text-text-muted">· used in {data.usageCount} file{data.usageCount !== 1 ? 's' : ''}</span>
                )}
            </div>

            <DescriptionBlock data={data} />

            {data.props.length > 0 && (
                <section>
                    <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">Props</h3>
                    <div className="flex flex-wrap gap-1.5">
                        {data.props.map(p => (
                            <code key={p} className="text-xs px-2 py-0.5 rounded-md bg-surface-overlay border border-border-subtle text-accent">{p}</code>
                        ))}
                    </div>
                </section>
            )}

            {data.variants.length > 0 && (
                <section>
                    <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">Variants &amp; states</h3>
                    <ul className="list-disc pl-5 text-sm text-text-primary space-y-0.5">
                        {data.variants.map((v, i) => <li key={i}>{v}</li>)}
                    </ul>
                </section>
            )}

            <section>
                <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">Screenshots</h3>
                {data.screenshots.length > 0
                    ? <GalleryView data={{ items: data.screenshots }} />
                    : <p className="text-xs text-text-muted flex items-center gap-1.5"><Puzzle className="w-3.5 h-3.5" /> No screenshots yet — add them in edit mode.</p>}
            </section>

            {data.snippet && (
                <section>
                    <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">Source (first lines)</h3>
                    <pre className="text-[11px] leading-relaxed font-mono bg-surface-overlay border border-border-subtle rounded-xl p-4 overflow-x-auto max-h-[420px] text-text-secondary">
                        {data.snippet}
                    </pre>
                </section>
            )}
        </div>
    );
}
