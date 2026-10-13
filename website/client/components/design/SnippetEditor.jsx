'use client';
import { SnippetFrame } from './SnippetView';

const textareaClass = 'w-full min-h-[200px] p-3 rounded-xl bg-surface-overlay border border-border-subtle text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors resize-y leading-relaxed';

export default function SnippetEditor({ data, onChange }) {
    const html = data?.html ?? '';
    const css = data?.css ?? '';

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="space-y-4">
                <div>
                    <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">
                        HTML
                    </label>
                    <textarea
                        value={html}
                        onChange={(e) => onChange({ ...data, html: e.target.value })}
                        placeholder="<div class=&quot;card&quot;>Hello Design Book</div>"
                        spellCheck={false}
                        className={textareaClass}
                    />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">
                        CSS
                    </label>
                    <textarea
                        value={css}
                        onChange={(e) => onChange({ ...data, css: e.target.value })}
                        placeholder={'.card { padding: 16px; border-radius: 12px; }'}
                        spellCheck={false}
                        className={textareaClass}
                    />
                </div>
            </div>

            <div>
                <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">
                    Live Preview
                </label>
                <SnippetFrame html={html} css={css} className="h-full min-h-[420px]" />
            </div>
        </div>
    );
}
