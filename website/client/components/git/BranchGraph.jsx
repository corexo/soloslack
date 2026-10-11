'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { GitBranch, GitMerge, Cloud, Ticket, Bot } from 'lucide-react';
import { layoutCommitGraph } from './commitGraphLayout';
import { timeAgo } from '@/lib/utils/formatDate';
import { cn } from '@/lib/utils/cn';

const ROW = 30;
const LANE = 16;
const PAD = 12;
const COLORS = ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#38bdf8', '#a78bfa', '#fb7185', '#2dd4bf', '#f97316', '#a3e635'];
const laneColor = (k) => COLORS[k % COLORS.length];

const x = (col) => PAD + col * LANE;
const y = (row) => ROW / 2 + row * ROW;

// Path through: child → (lane, next row) → (lane, row above parent) → parent
function edgePath(e, totalRows) {
    const x1 = x(e.fromCol), y1 = y(e.from);
    const xl = x(e.lane);
    if (e.parentRow === null) {
        // Parent beyond the loaded history: run off the bottom in its lane
        const yEnd = y(totalRows - 1) + ROW / 2;
        return e.lane === e.fromCol
            ? `M${x1},${y1} L${xl},${yEnd}`
            : `M${x1},${y1} C${x1},${y1 + ROW / 2} ${xl},${y1 + ROW / 2} ${xl},${y1 + ROW} L${xl},${yEnd}`;
    }
    const x2 = x(e.toCol), y2 = y(e.parentRow);
    let d = `M${x1},${y1}`;
    let cy = y1;
    if (e.lane !== e.fromCol) {
        d += ` C${x1},${cy + ROW / 2} ${xl},${cy + ROW / 2} ${xl},${cy + ROW}`;
        cy += ROW;
    }
    if (e.lane !== e.toCol) {
        const yBend = y2 - ROW;
        if (yBend > cy) d += ` L${xl},${yBend}`;
        d += ` C${xl},${yBend + ROW / 2} ${x2},${yBend + ROW / 2} ${x2},${y2}`;
    } else {
        d += ` L${x2},${y2}`;
    }
    return d;
}

function BranchStatus({ branch, base }) {
    if (branch.name === base) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">base</span>;
    if (!branch.local) return <span className="text-[10px] text-text-muted flex items-center gap-1"><Cloud className="w-3 h-3" /> remote only</span>;
    return (
        <span className="flex items-center gap-1.5 text-[10px]">
            {branch.merged && <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 flex items-center gap-1"><GitMerge className="w-3 h-3" /> merged</span>}
            {branch.ahead > 0 && <span className="text-sky-400">↑{branch.ahead}</span>}
            {branch.behind > 0 && <span className="text-amber-400">↓{branch.behind}</span>}
            {!branch.merged && !branch.ahead && !branch.behind && <span className="text-text-muted">even</span>}
        </span>
    );
}

export default function BranchGraph({ graph }) {
    const [hideMerged, setHideMerged] = useState(false);
    const [focus, setFocus] = useState(null); // highlighted branch name

    const { nodes, edges, width } = useMemo(() => layoutCommitGraph(graph.commits), [graph.commits]);
    const ticketsByBranch = useMemo(() => {
        const map = new Map();
        graph.tickets.forEach(t => map.set(t.branch, [...(map.get(t.branch) || []), t]));
        return map;
    }, [graph.tickets]);

    // Commits reachable from the focused branch tip (first-parent + merges), for highlighting
    const focusSet = useMemo(() => {
        if (!focus) return null;
        const byHash = new Map(graph.commits.map(c => [c.hash, c]));
        const tip = graph.commits.find(c => c.refs.some(r => r === focus || r.endsWith(`/${focus}`)));
        const seen = new Set();
        const stack = tip ? [tip.hash] : [];
        while (stack.length) {
            const h = stack.pop();
            if (seen.has(h) || !byHash.has(h)) continue;
            seen.add(h);
            stack.push(...byHash.get(h).parents);
        }
        return seen;
    }, [focus, graph.commits]);

    const branches = graph.branches
        .filter(b => !hideMerged || !b.merged)
        .sort((a, b) => (a.name === graph.base ? -1 : b.name === graph.base ? 1 : new Date(b.lastCommit.date) - new Date(a.lastCommit.date)));
    const graphWidth = PAD * 2 + Math.max(width - 1, 0) * LANE;
    const height = graph.commits.length * ROW;

    return (
        <div className="space-y-6">
            {/* Branch list */}
            <section className="rounded-xl border border-border-subtle overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-surface-raised/40 border-b border-border-subtle">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5" /> {graph.branches.length} branches · compared to <span className="text-accent normal-case">{graph.base}</span>
                    </h2>
                    <label className="flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={hideMerged} onChange={(e) => setHideMerged(e.target.checked)} className="accent-emerald-500" />
                        Hide merged
                    </label>
                </div>
                <div className="divide-y divide-border-subtle/60 max-h-[340px] overflow-y-auto">
                    {branches.map(b => {
                        const tickets = ticketsByBranch.get(b.name) || [];
                        return (
                            <div
                                key={b.name}
                                onMouseEnter={() => setFocus(b.name)}
                                onMouseLeave={() => setFocus(null)}
                                className={cn('grid grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-center px-4 py-2 text-xs transition-colors',
                                    focus === b.name ? 'bg-accent/5' : 'hover:bg-surface-hover/50', b.merged && 'opacity-60')}
                            >
                                <span className="font-mono text-text-primary truncate flex items-center gap-1.5" title={b.name}>
                                    {b.current && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="checked out" />}
                                    {b.name}
                                </span>
                                <BranchStatus branch={b} base={graph.base} />
                                <span className="text-text-muted truncate" title={b.lastCommit.subject}>
                                    <span className="font-mono text-text-secondary">{b.lastCommit.hash}</span> {b.lastCommit.subject} · {timeAgo(b.lastCommit.date)}
                                </span>
                                <span className="flex flex-wrap gap-1 min-w-0">
                                    {tickets.map(t => (
                                        <Link
                                            key={t._id}
                                            href={`/boards/${t.boardId}?card=${t._id}`}
                                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 truncate max-w-full"
                                            title={`${t.title}${t.assignee ? ` · ${t.assignee}` : ''}`}
                                        >
                                            {t.assignee ? <Bot className="w-3 h-3 shrink-0" /> : <Ticket className="w-3 h-3 shrink-0" />}
                                            <span className="truncate">{t.title}</span>
                                        </Link>
                                    ))}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Commit graph */}
            <section className="rounded-xl border border-border-subtle overflow-x-auto">
                <div className="flex min-w-max">
                    <svg width={graphWidth} height={height} className="shrink-0">
                        {edges.map((e, i) => {
                            const dim = focusSet && !(focusSet.has(graph.commits[e.from].hash));
                            return (
                                <path key={i} d={edgePath(e, graph.commits.length)} fill="none"
                                    stroke={laneColor(e.first ? e.fromCol : e.lane)} strokeWidth={2}
                                    opacity={dim ? 0.15 : 0.9} />
                            );
                        })}
                        {nodes.map((n, row) => {
                            const c = graph.commits[row];
                            const dim = focusSet && !focusSet.has(c.hash);
                            const merge = c.parents.length > 1;
                            return (
                                <circle key={c.hash} cx={x(n.col)} cy={y(row)} r={merge ? 3.5 : 5}
                                    fill={merge ? 'var(--color-surface-base, #0b0b10)' : laneColor(n.col)}
                                    stroke={laneColor(n.col)} strokeWidth={2} opacity={dim ? 0.2 : 1}>
                                    <title>{c.hash.slice(0, 7)} {c.subject}</title>
                                </circle>
                            );
                        })}
                    </svg>
                    <div className="min-w-[480px] flex-1">
                        {graph.commits.map((c, row) => {
                            const dim = focusSet && !focusSet.has(c.hash);
                            return (
                                <div key={c.hash} style={{ height: ROW }} className={cn('flex items-center gap-2 pr-4 text-xs whitespace-nowrap', dim && 'opacity-30')}>
                                    {c.refs.map(ref => {
                                        const remote = ref.includes('/') && !graph.branches.some(b => b.name === ref);
                                        const name = remote ? ref.replace(/^[^/]+\//, '') : ref;
                                        const tag = ref.startsWith('tag: ');
                                        return (
                                            <span key={ref}
                                                onMouseEnter={() => !tag && setFocus(name)}
                                                onMouseLeave={() => setFocus(null)}
                                                className={cn('px-1.5 py-0.5 rounded font-mono text-[10px] border cursor-default',
                                                    tag ? 'border-amber-500/30 text-amber-400' : remote ? 'border-border-subtle text-text-muted' : 'text-white border-transparent')}
                                                style={!tag && !remote ? { backgroundColor: laneColor(nodes[row].col) + '40', borderColor: laneColor(nodes[row].col) } : undefined}
                                            >
                                                {remote && <Cloud className="w-2.5 h-2.5 inline mr-0.5" />}{ref.replace(/^tag: /, '🏷 ')}
                                            </span>
                                        );
                                    })}
                                    <span className="text-text-primary truncate max-w-[520px]" title={c.subject}>{c.subject}</span>
                                    <span className="text-text-muted ml-auto pl-4">{c.author}</span>
                                    <span className="text-text-muted font-mono w-16 text-right">{c.hash.slice(0, 7)}</span>
                                    <span className="text-text-muted w-20 text-right">{timeAgo(c.date)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                {graph.truncated && (
                    <p className="px-4 py-2 text-[11px] text-text-muted border-t border-border-subtle">Showing the latest {graph.commits.length} commits.</p>
                )}
            </section>
        </div>
    );
}
