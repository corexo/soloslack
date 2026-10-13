'use client';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const inputClass = 'w-full min-w-0 bg-surface-overlay border border-border-subtle rounded-md px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60 transition-colors';

function Section({ label, hint, count, onAdd, children }) {
    return (
        <section className="space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">{label}</h3>
                    {hint && <p className="text-[11px] text-text-muted/70 mt-0.5">{hint}</p>}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-text-muted bg-surface-overlay px-1.5 py-0.5 rounded-md font-mono">
                        {count}
                    </span>
                    <button
                        type="button"
                        onClick={onAdd}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors"
                    >
                        <Plus className="w-3 h-3" /> Add
                    </button>
                </div>
            </div>
            {children}
        </section>
    );
}

function Row({ onRemove, children }) {
    return (
        <div className="flex items-start gap-2 p-2.5 rounded-xl border border-border-subtle bg-surface-overlay">
            <div className="flex-1 min-w-0">{children}</div>
            <button
                type="button"
                onClick={onRemove}
                className="p-1.5 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                title="Remove row"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

export default function TokensEditor({ data, onChange }) {
    const colors = Array.isArray(data?.colors) ? data.colors : [];
    const typography = Array.isArray(data?.typography) ? data.typography : [];
    const spacing = Array.isArray(data?.spacing) ? data.spacing : [];

    const setColors = (next) => onChange({ ...data, colors: next });
    const setTypography = (next) => onChange({ ...data, typography: next });
    const setSpacing = (next) => onChange({ ...data, spacing: next });

    const updateRow = (list, setList, index, patch) => {
        setList(list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    return (
        <div className="space-y-8">
            {/* Colors */}
            <Section
                label="Colors"
                hint="Click a swatch in view mode to copy its hex value"
                count={colors.length}
                onAdd={() => setColors([...colors, { name: '', value: '#6366f1' }])}
            >
                {colors.length === 0 ? (
                    <p className="text-[11px] text-text-muted italic px-1">No colors defined.</p>
                ) : (
                    <div className="space-y-2">
                        {colors.map((c, i) => (
                            <Row key={i} onRemove={() => setColors(colors.filter((_, j) => j !== i))}>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={/^#[0-9a-fA-F]{6}$/.test(c.value ?? '') ? c.value : '#6366f1'}
                                        onChange={(e) => updateRow(colors, setColors, i, { value: e.target.value })}
                                        className="w-9 h-9 rounded-lg border border-border-subtle bg-transparent cursor-pointer shrink-0"
                                        title="Pick color"
                                    />
                                    <input
                                        type="text"
                                        value={c.value ?? ''}
                                        onChange={(e) => updateRow(colors, setColors, i, { value: e.target.value })}
                                        placeholder="#6366f1"
                                        className={cn(inputClass, 'font-mono w-32 sm:w-40 shrink-0')}
                                    />
                                    <input
                                        type="text"
                                        value={c.name ?? ''}
                                        onChange={(e) => updateRow(colors, setColors, i, { name: e.target.value })}
                                        placeholder="Name (e.g. Primary)"
                                        className={inputClass}
                                    />
                                </div>
                            </Row>
                        ))}
                    </div>
                )}
            </Section>

            {/* Typography */}
            <Section
                label="Typography"
                hint="Family, size and weight are applied live to the sample text"
                count={typography.length}
                onAdd={() => setTypography([...typography, { name: '', family: '', size: '', weight: '', sample: '' }])}
            >
                {typography.length === 0 ? (
                    <p className="text-[11px] text-text-muted italic px-1">No typography defined.</p>
                ) : (
                    <div className="space-y-2">
                        {typography.map((t, i) => (
                            <Row key={i} onRemove={() => setTypography(typography.filter((_, j) => j !== i))}>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <input
                                        type="text"
                                        value={t.name ?? ''}
                                        onChange={(e) => updateRow(typography, setTypography, i, { name: e.target.value })}
                                        placeholder="Name (e.g. Heading)"
                                        className={inputClass}
                                    />
                                    <input
                                        type="text"
                                        value={t.family ?? ''}
                                        onChange={(e) => updateRow(typography, setTypography, i, { family: e.target.value })}
                                        placeholder="Font family"
                                        className={inputClass}
                                    />
                                    <input
                                        type="text"
                                        value={t.size ?? ''}
                                        onChange={(e) => updateRow(typography, setTypography, i, { size: e.target.value })}
                                        placeholder="Size (e.g. 24px)"
                                        className={inputClass}
                                    />
                                    <input
                                        type="text"
                                        value={t.weight ?? ''}
                                        onChange={(e) => updateRow(typography, setTypography, i, { weight: e.target.value })}
                                        placeholder="Weight (e.g. 600)"
                                        className={inputClass}
                                    />
                                    <input
                                        type="text"
                                        value={t.sample ?? ''}
                                        onChange={(e) => updateRow(typography, setTypography, i, { sample: e.target.value })}
                                        placeholder="Sample text"
                                        className={cn(inputClass, 'col-span-2 sm:col-span-1')}
                                    />
                                </div>
                                <p
                                    className="mt-2 px-1 text-text-primary truncate"
                                    style={{
                                        fontFamily: t.family || undefined,
                                        fontSize: t.size || undefined,
                                        fontWeight: t.weight || undefined,
                                    }}
                                >
                                    {t.sample || 'The quick brown fox jumps over the lazy dog'}
                                </p>
                            </Row>
                        ))}
                    </div>
                )}
            </Section>

            {/* Spacing */}
            <Section
                label="Spacing"
                hint="Numeric values scale the preview bar proportionally"
                count={spacing.length}
                onAdd={() => setSpacing([...spacing, { name: '', value: '' }])}
            >
                {spacing.length === 0 ? (
                    <p className="text-[11px] text-text-muted italic px-1">No spacing defined.</p>
                ) : (
                    <div className="space-y-2">
                        {spacing.map((s, i) => (
                            <Row key={i} onRemove={() => setSpacing(spacing.filter((_, j) => j !== i))}>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={s.name ?? ''}
                                        onChange={(e) => updateRow(spacing, setSpacing, i, { name: e.target.value })}
                                        placeholder="Name (e.g. md)"
                                        className={inputClass}
                                    />
                                    <input
                                        type="text"
                                        value={s.value ?? ''}
                                        onChange={(e) => updateRow(spacing, setSpacing, i, { value: e.target.value })}
                                        placeholder="Value (e.g. 16px)"
                                        className={cn(inputClass, 'font-mono w-28 shrink-0')}
                                    />
                                </div>
                            </Row>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}
