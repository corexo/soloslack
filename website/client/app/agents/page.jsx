'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Network, Eye, MessageSquare, ArrowRightLeft, List, Radio, Bot, Paperclip, PlusCircle } from 'lucide-react';
import { agentsApi, subscribeAgentActivity } from '@/lib/api/agentsApi';
import AgentNetwork, { agentStatus } from '@/components/agents/AgentNetwork';
import { timeAgo } from '@/lib/utils/formatDate';
import { cn } from '@/lib/utils/cn';

const NETWORK_REFRESH_MS = 30_000;
const PULSE_MS = 1300;
const FLASH_MS = 2500;

const ACTIONS = {
    read: { icon: Eye, label: 'read', color: '#38bdf8' },
    comment: { icon: MessageSquare, label: 'commented on', color: '#a78bfa' },
    update: { icon: ArrowRightLeft, label: 'updated', color: '#fbbf24' },
    attach: { icon: Paperclip, label: 'attached files to', color: '#34d399' },
    create: { icon: PlusCircle, label: 'created', color: '#f472b6' },
    list: { icon: List, label: 'listed tickets', color: '#64748b' },
    ping: { icon: Radio, label: 'connected', color: '#64748b' },
};

export default function AgentsPage() {
    const [network, setNetwork] = useState(null);
    const [events, setEvents] = useState([]);
    const [pulses, setPulses] = useState([]);
    const [flashes, setFlashes] = useState({});
    const [lastActive, setLastActive] = useState({});
    const [now, setNow] = useState(() => Date.now());
    const [live, setLive] = useState(false);
    const networkRef = useRef(null);
    useEffect(() => { networkRef.current = network; }, [network]);

    const loadNetwork = useCallback(() => agentsApi.getNetwork().then(res => setNetwork(res.data)).catch(() => {}), []);

    // Initial data: graph + recent history (also seeds "last active" per agent)
    useEffect(() => {
        loadNetwork();
        agentsApi.getActivity(60).then(res => {
            setEvents(res.data);
            const last = {};
            res.data.forEach(e => { if (!last[e.agent]) last[e.agent] = e.createdAt; });
            setLastActive(last);
        }).catch(() => {});
        const refresh = setInterval(loadNetwork, NETWORK_REFRESH_MS);
        const tick = setInterval(() => setNow(Date.now()), 5_000);
        return () => { clearInterval(refresh); clearInterval(tick); };
    }, [loadNetwork]);

    // Live stream
    useEffect(() => {
        const unsubscribe = subscribeAgentActivity((event) => {
            setLive(true);
            setNow(Date.now());
            // History load and stream can overlap right after opening the page
            setEvents(prev => [event, ...prev.filter(e => e._id !== event._id)].slice(0, 100));
            setLastActive(prev => ({ ...prev, [event.agent]: event.createdAt }));

            const id = event._id;
            setPulses(prev => [...prev, { id, agent: event.agent, cardId: event.cardId, color: ACTIONS[event.action]?.color || '#38bdf8' }]);
            setTimeout(() => setPulses(prev => prev.filter(p => p.id !== id)), PULSE_MS);
            if (event.cardId) {
                setTimeout(() => setFlashes(prev => ({ ...prev, [event.cardId]: true })), 900);
                setTimeout(() => setFlashes(prev => { const next = { ...prev }; delete next[event.cardId]; return next; }), FLASH_MS);
            }

            // New agent/ticket pair or moved ticket → refresh the graph
            const net = networkRef.current;
            const known = net?.links.some(l => l.agent === event.agent && l.cardId === event.cardId);
            if (!net || (event.cardId && !known) || event.action === 'update') loadNetwork();
        });
        return unsubscribe;
    }, [loadNetwork]);

    const agents = network?.agents || [];
    const activeCount = agents.filter(a => agentStatus(lastActive[a.name], now) === 'active').length;

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-7xl mx-auto p-6 md:p-10 space-y-6">
                <header className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
                            <Network className="w-5 h-5 text-sky-400" /> Agent Network
                        </h1>
                        <p className="text-xs text-text-muted">
                            {agents.length} agents · {activeCount} active · {network?.tickets.length ?? 0} tickets
                        </p>
                    </div>
                    <span className={cn('flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border',
                        live ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-text-muted border-border-subtle')}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', live ? 'bg-emerald-400 animate-pulse' : 'bg-text-muted')} />
                        {live ? 'live' : 'waiting for activity'}
                    </span>
                </header>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
                    <section className="rounded-xl border border-border-subtle bg-surface-raised/20 p-4 min-h-[300px]">
                        {!network ? (
                            <p className="text-sm text-text-muted">Loading…</p>
                        ) : agents.length === 0 ? (
                            <p className="text-sm text-text-muted">
                                No agents yet — create one in <Link href="/settings" className="text-accent hover:underline">Settings → AI Agents</Link>.
                            </p>
                        ) : (
                            <AgentNetwork network={network} lastActive={lastActive} pulses={pulses} flashes={flashes} now={now} />
                        )}
                        <div className="flex flex-wrap gap-4 mt-3 text-[10px] text-text-muted">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> active (&lt; 2 min)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> idle (&lt; 30 min)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500" /> offline</span>
                            <span>── assigned</span>
                            <span>- - touched in last 24 h</span>
                        </div>
                    </section>

                    <section className="rounded-xl border border-border-subtle overflow-hidden">
                        <h2 className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted border-b border-border-subtle bg-surface-raised/40">
                            Activity
                        </h2>
                        <div className="max-h-[70vh] overflow-y-auto divide-y divide-border-subtle/50">
                            {events.length === 0 && <p className="px-4 py-6 text-xs text-text-muted">No agent activity yet.</p>}
                            {events.map(e => {
                                const meta = ACTIONS[e.action] || ACTIONS.read;
                                const Icon = meta.icon;
                                const ticket = network?.tickets.find(t => t.id === e.cardId);
                                return (
                                    <div key={e._id} className="px-4 py-2.5 text-xs animate-in fade-in duration-500">
                                        <div className="flex items-start gap-2">
                                            <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: meta.color }} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-text-secondary">
                                                    <span className="font-mono text-text-primary"><Bot className="w-3 h-3 inline mr-0.5" />{e.agent}</span>{' '}
                                                    {meta.label}{' '}
                                                    {e.cardTitle && (ticket
                                                        ? <Link href={`/boards/${ticket.boardId}?card=${e.cardId}`} className="text-accent hover:underline">{e.cardTitle}</Link>
                                                        : <span className="text-text-primary">{e.cardTitle}</span>)}
                                                </p>
                                                {e.detail && <p className="text-text-muted truncate mt-0.5" title={e.detail}>{e.detail}</p>}
                                                {e.status >= 400 && <p className="text-red-400 mt-0.5">failed ({e.status})</p>}
                                            </div>
                                            <span className="text-[10px] text-text-muted shrink-0">{timeAgo(e.createdAt)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
