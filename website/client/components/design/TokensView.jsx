'use client';
import { Copy, Shapes } from 'lucide-react';
import { useUndo } from '@/context/UndoContext';

function SectionHeading({ label, count }) {
    return (
        <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">
                {label}
            </h3>
            <span className="text-[11px] text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded-md font-mono">
                {count}
            </span>
        </div>
    );
}

function ColorSwatch({ color, onCopy }) {
    return (
        <button
            onClick={() => onCopy(color.value)}
            className="group p-3 rounded-xl border border-border-subtle bg-surface-overlay hover:border-accent/40 transition-all text-left"
            title={`Copy ${color.value}`}
        >
            <div
                className="h-14 rounded-lg border border-black/10 mb-2.5 group-hover:scale-[1.02] transition-transform"
                style={{ backgroundColor: color.value || 'transparent' }}
            />
            <p className="text-xs font-medium text-text-primary truncate">{color.name || 'Untitled'}</p>
            <p className="text-[11px] font-mono text-text-muted flex items-center gap-1">
                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                <span className="truncate">{color.value || '—'}</span>
            </p>
            {color.source && <p className="text-[10px] text-text-muted/60 truncate mt-0.5" title={color.source}>{color.source}</p>}
        </button>
    );
}

function TypographySample({ t }) {
    const style = {
        fontFamily: t.family || undefined,
        fontSize: t.size || undefined,
        fontWeight: t.weight || undefined,
    };
    return (
        <div className="p-4 rounded-xl border border-border-subtle bg-surface-overlay">
            <p className="text-text-primary break-words leading-snug" style={style}>
                {t.sample || 'The quick brown fox jumps over the lazy dog'}
            </p>
            <div className="mt-3 pt-3 border-t border-border-subtle flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium text-text-primary truncate">{t.name || 'Untitled'}</p>
                <p className="text-[11px] font-mono text-text-muted truncate shrink-0">
                    {[t.family, t.size, t.weight].filter(Boolean).join(' · ')}
                </p>
            </div>
        </div>
    );
}

function SpacingBar({ s, maxValue }) {
    const numeric = parseFloat(s.value);
    const ratio = Number.isFinite(numeric) && maxValue > 0 ? numeric / maxValue : 0;
    return (
        <div className="flex items-center gap-4 py-2">
            <p className="w-28 shrink-0 text-xs font-medium text-text-primary truncate">{s.name || 'Untitled'}</p>
            <div className="flex-1 h-4 rounded bg-surface-overlay overflow-hidden">
                <div
                    className="h-full rounded bg-accent/40 border-r-2 border-accent"
                    style={{ width: `${Math.max(ratio * 100, 2)}%` }}
                />
            </div>
            <p className="w-16 shrink-0 text-right text-[11px] font-mono text-text-muted">{s.value ?? '—'}</p>
        </div>
    );
}

export default function TokensView({ data }) {
    const { showToast } = useUndo();
    const colors = Array.isArray(data?.colors) ? data.colors : [];
    const typography = Array.isArray(data?.typography) ? data.typography : [];
    const spacing = Array.isArray(data?.spacing) ? data.spacing : [];

    const radii = Array.isArray(data?.radii) ? data.radii : [];
    const shadows = Array.isArray(data?.shadows) ? data.shadows : [];

    if (colors.length === 0 && typography.length === 0 && spacing.length === 0 && radii.length === 0 && shadows.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted space-y-3">
                <Shapes className="w-10 h-10 opacity-30" />
                <p className="text-xs">No tokens yet — edit this entry to add colors, type and spacing.</p>
            </div>
        );
    }

    const handleCopy = async (value) => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            showToast({ label: `${value} copied to clipboard`, type: 'success', duration: 2000 });
        } catch {
            showToast({ label: 'Could not copy to clipboard', type: 'error' });
        }
    };

    const spacingValues = spacing.map(s => parseFloat(s.value)).filter(Number.isFinite);
    const maxSpacing = spacingValues.length > 0 ? Math.max(...spacingValues) : 0;

    return (
        <div className="space-y-10">
            {colors.length > 0 && (
                <section>
                    <SectionHeading label="Colors" count={colors.length} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {colors.map((c, i) => (
                            <ColorSwatch key={i} color={c} onCopy={handleCopy} />
                        ))}
                    </div>
                </section>
            )}

            {typography.length > 0 && (
                <section>
                    <SectionHeading label="Typography" count={typography.length} />
                    <div className="space-y-3">
                        {typography.map((t, i) => (
                            <TypographySample key={i} t={t} />
                        ))}
                    </div>
                </section>
            )}

            {spacing.length > 0 && (
                <section>
                    <SectionHeading label="Spacing" count={spacing.length} />
                    <div className="divide-y divide-border-subtle/60">
                        {spacing.map((s, i) => (
                            <SpacingBar key={i} s={s} maxValue={maxSpacing} />
                        ))}
                    </div>
                </section>
            )}

            {radii.length > 0 && (
                <section>
                    <SectionHeading label="Radii" count={radii.length} />
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                        {radii.map((r, i) => (
                            <button key={i} onClick={() => handleCopy(r.value)} title={`Copy ${r.value}`}
                                className="p-3 rounded-xl border border-border-subtle bg-surface-overlay hover:border-accent/40 transition-all text-left">
                                <div className="h-12 w-12 mb-2 border-2 border-accent/60 bg-accent/10" style={{ borderRadius: r.value }} />
                                <p className="text-xs font-medium text-text-primary truncate">{r.name}</p>
                                <p className="text-[11px] font-mono text-text-muted truncate">{r.value}</p>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {shadows.length > 0 && (
                <section>
                    <SectionHeading label="Shadows" count={shadows.length} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {shadows.map((s, i) => (
                            <button key={i} onClick={() => handleCopy(s.value)} title={`Copy ${s.value}`}
                                className="p-4 rounded-xl border border-border-subtle bg-surface-overlay hover:border-accent/40 transition-all text-left">
                                <div className="h-12 rounded-lg bg-surface-raised mb-3" style={{ boxShadow: s.value }} />
                                <p className="text-xs font-medium text-text-primary truncate">{s.name}</p>
                                <p className="text-[10px] font-mono text-text-muted line-clamp-2">{s.value}</p>
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
