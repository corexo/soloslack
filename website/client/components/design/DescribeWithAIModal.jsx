'use client';
import { useState } from 'react';
import { Sparkles, Check, Puzzle, MonitorSmartphone } from 'lucide-react';
import Modal from '../ui/Modal';
import MarkdownRenderer from '../notes/MarkdownRenderer';
import { useAI } from '@/context/AIContext';
import { designDescribePrompt } from '@/lib/ai/prompts';
import { cn } from '@/lib/utils/cn';

const BATCH = 4;
// Local models are slow: describe a manageable chunk per run
const PER_RUN = 12;

/**
 * Proposes descriptions (and variants) for components/screens without one.
 * Nothing is saved until the user applies the selected proposals.
 */
export default function DescribeWithAIModal({ isOpen, onClose, entries, framework, onApply }) {
    const { askAI } = useAI();
    const [proposals, setProposals] = useState([]); // [{ entry, description, variants, selected }]
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState('');
    const [applying, setApplying] = useState(false);

    const candidates = entries.filter(e => (e.type === 'component' || e.type === 'screen') && !e.data?.description?.trim() && !e.data?.missing);

    const run = async () => {
        setError('');
        setProposals([]);
        const results = [];
        const chunk = candidates.slice(0, PER_RUN);
        try {
            for (let i = 0; i < chunk.length; i += BATCH) {
                const batch = chunk.slice(i, i + BATCH);
                setProgress({ done: i, total: chunk.length });
                const items = batch.map((e, j) => ({
                    ref: `D${j + 1}`, type: e.type, name: e.data.name || e.title, path: e.data.path,
                    route: e.data.route, props: e.data.props, snippet: e.data.snippet,
                }));
                const res = await askAI(designDescribePrompt(items, framework), { maxTokens: 3072, temperature: 0.3 });
                const json = /\[[\s\S]*\]/.exec(res.text)?.[0];
                const parsed = json ? JSON.parse(json) : [];
                for (const p of parsed) {
                    const idx = Number(String(p.ref).replace(/\D/g, '')) - 1;
                    const entry = batch[idx];
                    if (!entry || !String(p.description || '').trim()) continue;
                    results.push({
                        entry,
                        description: String(p.description).trim(),
                        variants: Array.isArray(p.variants) ? p.variants.map(String).filter(Boolean).slice(0, 6) : [],
                        selected: true,
                    });
                }
                setProposals([...results]);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setProgress(null);
        }
    };

    const apply = async () => {
        setApplying(true);
        try {
            await onApply(proposals.filter(p => p.selected));
            setProposals([]);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setApplying(false);
        }
    };

    const selectedCount = proposals.filter(p => p.selected).length;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Describe with AI">
            <div className="space-y-4">
                {!proposals.length && !progress && (
                    <div className="text-center py-4 space-y-3">
                        <Sparkles className="w-8 h-8 text-purple-400 mx-auto" />
                        <p className="text-sm text-text-primary">
                            {candidates.length
                                ? `${candidates.length} components/screens have no description yet.`
                                : 'Every component and screen already has a description.'}
                        </p>
                        <p className="text-xs text-text-muted">The AI reads each file and proposes a description and variants. You review before anything is saved.</p>
                        {candidates.length > 0 && (
                            <button onClick={run} className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl text-sm font-semibold hover:bg-purple-500/30">
                                <Sparkles className="w-4 h-4" /> Describe {candidates.length > PER_RUN ? `next ${PER_RUN}` : 'all'}
                            </button>
                        )}
                    </div>
                )}

                {progress && (
                    <p className="text-xs text-purple-300 flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                        Describing {progress.done + 1}–{Math.min(progress.done + BATCH, progress.total)} of {progress.total}…
                    </p>
                )}
                {error && <p className="text-xs text-red-400">{error}</p>}

                {proposals.length > 0 && (
                    <>
                        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                            {proposals.map((p, i) => {
                                const Icon = p.entry.type === 'screen' ? MonitorSmartphone : Puzzle;
                                return (
                                    <label key={p.entry._id} className={cn('flex gap-2.5 p-3 rounded-lg border cursor-pointer',
                                        p.selected ? 'border-purple-500/30 bg-purple-500/5' : 'border-border-subtle opacity-60')}>
                                        <input type="checkbox" checked={p.selected} className="mt-1 accent-purple-500"
                                            onChange={(e) => setProposals(prev => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))} />
                                        <div className="min-w-0 flex-1 text-xs">
                                            <p className="font-semibold text-text-primary flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-purple-300" />{p.entry.title}</p>
                                            <MarkdownRenderer content={p.description} compact />
                                            {p.variants.length > 0 && <p className="text-[11px] text-text-muted mt-1">Variants: {p.variants.join(', ')}</p>}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                        <div className="flex justify-end">
                            <button onClick={apply} disabled={applying || !selectedCount || progress}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold disabled:opacity-40">
                                <Check className="w-3.5 h-3.5" /> Apply {selectedCount}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
