'use client';
import GalleryEditor from './GalleryEditor';
import { COMPONENT_STATUSES } from './entryTypes';

const inputClass = 'w-full bg-surface-overlay border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors';
const label = 'block text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-1.5';

/**
 * Editor for component and screen entries. Scanned fields (path, props, route…) are
 * read-only here — they come from the repo and are refreshed by "Scan repo".
 */
export default function ComponentEditor({ type, data, onChange, repo }) {
    const set = (patch) => onChange({ ...data, ...patch });
    const scanned = Boolean(data.scanKey);

    return (
        <div className="space-y-6">
            {type === 'component' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={label}>Status</label>
                        <select value={data.status} onChange={(e) => set({ status: e.target.value })} className={inputClass}>
                            {COMPONENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={label}>File</label>
                        <input value={data.path || ''} onChange={(e) => set({ path: e.target.value })} disabled={scanned}
                            placeholder="components/ui/Button.jsx" className={`${inputClass} font-mono disabled:opacity-60`} />
                    </div>
                </div>
            )}

            {type === 'screen' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={label}>Route</label>
                        <input value={data.route || ''} onChange={(e) => set({ route: e.target.value })} disabled={scanned}
                            placeholder="/login" className={`${inputClass} font-mono disabled:opacity-60`} />
                    </div>
                    <div>
                        <label className={label}>Flow</label>
                        <input value={data.flow || ''} onChange={(e) => set({ flow: e.target.value })} disabled={scanned}
                            placeholder="auth" className={`${inputClass} disabled:opacity-60`} />
                    </div>
                </div>
            )}
            {scanned && <p className="text-[11px] text-text-muted -mt-3">Location fields come from the repo scan and update on the next scan.</p>}

            <div>
                <label className={label}>Description (Markdown)</label>
                <textarea
                    value={data.description}
                    onChange={(e) => set({ description: e.target.value, descriptionSource: 'user' })}
                    rows={8}
                    placeholder={type === 'component' ? 'What is it for, when to use it, do & don’t…' : 'What the user does here, where they come from / go next…'}
                    className={`${inputClass} font-mono resize-y`}
                />
            </div>

            {type === 'component' && (
                <div>
                    <label className={label}>Variants &amp; states (one per line)</label>
                    <textarea
                        value={data.variants.join('\n')}
                        onChange={(e) => set({ variants: e.target.value.split('\n').map(v => v.trimStart()).filter((v, i, a) => v || i < a.length - 1) })}
                        rows={4}
                        placeholder={'primary\nsecondary\ndisabled\nloading'}
                        className={`${inputClass} resize-y`}
                    />
                </div>
            )}

            <div>
                <label className={label}>Screenshots</label>
                <GalleryEditor data={{ items: data.screenshots }} onChange={(d) => set({ screenshots: d.items })} repo={repo} />
            </div>
        </div>
    );
}
