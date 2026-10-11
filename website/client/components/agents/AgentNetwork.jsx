'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

const AGENT_X = 90;
const TICKET_X = 430;
const TICKET_W = 250;
const ROW = 64;
const TOP = 40;

// Activity status from the most recent access
export function agentStatus(lastActive, now) {
    if (!lastActive) return 'offline';
    const age = now - new Date(lastActive).getTime();
    if (age < 2 * 60_000) return 'active';
    if (age < 30 * 60_000) return 'idle';
    return 'offline';
}

// "claude-builder" → "CB"
const initials = (name) => name.split(/[-_.]/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');

const STATUS_COLOR = { active: '#34d399', idle: '#fbbf24', offline: '#6b7280' };

const edgePath = (a, t) => {
    const x1 = AGENT_X + 28, x2 = TICKET_X;
    const mid = (x1 + x2) / 2;
    return `M${x1},${a.y} C${mid},${a.y} ${mid},${t.y} ${x2},${t.y}`;
};

/**
 * Agents (left) linked to the tickets they're assigned to / touched (right).
 * `pulses` are short-lived { id, agent, cardId } entries that animate along the link.
 */
export default function AgentNetwork({ network, lastActive, pulses, flashes, now }) {
    const router = useRouter();

    const layout = useMemo(() => {
        const agents = network.agents.map((a, i) => ({ ...a, y: TOP + i * ROW * 1.4 + ROW / 2 }));
        // Order tickets by their first agent so edges cross less
        const order = new Map(agents.map((a, i) => [a.name, i]));
        const firstAgent = (t) => Math.min(...network.links.filter(l => l.cardId === t.id).map(l => order.get(l.agent) ?? 99), 99);
        const tickets = [...network.tickets]
            .sort((a, b) => firstAgent(a) - firstAgent(b))
            .map((t, i) => ({ ...t, y: TOP + i * ROW + ROW / 2 }));
        const height = Math.max(agents.length * ROW * 1.4, tickets.length * ROW) + TOP * 2;
        return {
            agents: new Map(agents.map(a => [a.name, a])),
            tickets: new Map(tickets.map(t => [t.id, t])),
            height,
        };
    }, [network]);

    const links = network.links.filter(l => layout.agents.has(l.agent) && layout.tickets.has(l.cardId));

    return (
        <svg viewBox={`0 0 ${TICKET_X + TICKET_W + 20} ${layout.height}`} className="w-full" style={{ minHeight: layout.height }}>
            {/* Links */}
            {links.map(l => {
                const a = layout.agents.get(l.agent);
                const t = layout.tickets.get(l.cardId);
                const hot = lastActive[l.agent] && agentStatus(lastActive[l.agent], now) === 'active' && l.last && now - new Date(l.last).getTime() < 120_000;
                return (
                    <path
                        key={`${l.agent}|${l.cardId}`}
                        d={edgePath(a, t)}
                        fill="none"
                        stroke={hot ? '#34d399' : '#64748b'}
                        strokeOpacity={hot ? 0.8 : 0.35}
                        strokeWidth={Math.min(1.5 + (l.count || 0) * 0.3, 5)}
                        strokeDasharray={l.type === 'touched' ? '5 5' : undefined}
                    />
                );
            })}

            {/* Pulses travelling agent → ticket for each access */}
            {pulses.map(p => {
                const a = layout.agents.get(p.agent);
                const t = p.cardId && layout.tickets.get(p.cardId);
                if (!a) return null;
                if (!t) {
                    // Access without a ticket (list / ping): ripple on the agent
                    return (
                        <circle key={p.id} cx={AGENT_X} cy={a.y} r={28} fill="none" stroke="#38bdf8" strokeWidth={2}
                            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'agent-pulse-ripple 1.2s ease-out forwards' }} />
                    );
                }
                // CSS motion path: SMIL animations inserted after load start in the past and never show
                return (
                    <circle key={p.id} r={6} fill={p.color} style={{
                        offsetPath: `path('${edgePath(a, t)}')`,
                        offsetRotate: '0deg',
                        animation: 'agent-pulse-travel 1.1s ease-in forwards',
                        filter: `drop-shadow(0 0 6px ${p.color})`,
                    }} />
                );
            })}

            {/* Agents */}
            {[...layout.agents.values()].map(a => {
                const status = agentStatus(lastActive[a.name], now);
                return (
                    <g key={a.name}>
                        {status === 'active' && (
                            <circle cx={AGENT_X} cy={a.y} r={30} fill="none" stroke={STATUS_COLOR.active} strokeOpacity={0.5}>
                                <animate attributeName="r" values="30;36;30" dur="2s" repeatCount="indefinite" />
                                <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
                            </circle>
                        )}
                        <circle cx={AGENT_X} cy={a.y} r={26} fill="#0f172a" stroke={STATUS_COLOR[status]} strokeWidth={3} />
                        <text x={AGENT_X} y={a.y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#e2e8f0" fontFamily="ui-monospace, monospace">
                            {initials(a.name)}
                        </text>
                        <text x={AGENT_X} y={a.y + 44} textAnchor="middle" fontSize="11" fontWeight="600" fill="#e2e8f0" fontFamily="ui-monospace, monospace">
                            {a.name.length > 22 ? `${a.name.slice(0, 21)}…` : a.name}
                        </text>
                        <text x={AGENT_X} y={a.y + 57} textAnchor="middle" fontSize="10" fill={STATUS_COLOR[status]}>{status}</text>
                        <title>{a.description ? `${a.name} — ${a.description}` : a.name}</title>
                    </g>
                );
            })}

            {/* Tickets */}
            {[...layout.tickets.values()].map(t => {
                const flash = flashes[t.id];
                return (
                    <g key={t.id} className="cursor-pointer" onClick={() => router.push(`/boards/${t.boardId}?card=${t.id}`)}>
                        <rect x={TICKET_X} y={t.y - 24} width={TICKET_W} height={48} rx={8}
                            fill={flash ? '#164e63' : '#111827'} stroke={flash ? '#38bdf8' : '#334155'} strokeWidth={flash ? 2 : 1}
                            style={{ transition: 'fill 0.6s, stroke 0.6s' }} />
                        <text x={TICKET_X + 10} y={t.y - 5} fontSize="12" fill="#e2e8f0" fontWeight="500">
                            {t.title.length > 34 ? `${t.title.slice(0, 33)}…` : t.title}
                        </text>
                        <text x={TICKET_X + 10} y={t.y + 13} fontSize="10" fill="#94a3b8">
                            {[t.column, t.boardName].filter(Boolean).join(' · ')}{t.branch ? `  ⎇ ${t.branch.length > 18 ? t.branch.slice(0, 17) + '…' : t.branch}` : ''}
                        </text>
                        <title>{t.title}</title>
                    </g>
                );
            })}
        </svg>
    );
}
