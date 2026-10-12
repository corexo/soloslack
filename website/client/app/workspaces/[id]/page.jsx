'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
    CalendarCheck, Send, Sparkles, Trash2, Check, X, AlertTriangle, Clock, Bug, Loader2,
    CalendarPlus, ArrowRightLeft, PencilLine, PlusCircle, RotateCcw,
} from 'lucide-react';
import { useAI } from '@/context/AIContext';
import { useWorkspaces } from '@/context/WorkspacesContext';
import { plannerApi } from '@/lib/api/plannerApi';
import { plannerSystemPrompt, parsePlannerReply } from '@/lib/ai/prompts';
import { resolvePlannerActions, describePlannerAction, applyPlannerAction } from '@/lib/ai/plannerActions';
import MarkdownRenderer from '@/components/notes/MarkdownRenderer';
import { cn } from '@/lib/utils/cn';

const HISTORY_MESSAGES = 10;
const MAX_TICKETS_IN_PROMPT = 120;

const QUICK_PROMPTS = [
    'Plane meinen Tag: was ist offen, was ist von gestern liegen geblieben?',
    'Was wurde gestern erledigt und was nicht?',
    'Welche Bugs sind offen und was davon sollte ich heute machen?',
    'Neues Bug-Ticket: ',
];

const ACTION_ICONS = { plan_today: CalendarPlus, move: ArrowRightLeft, update: PencilLine, create: PlusCircle };

// Small models leak the internal refs into prose: drop "(C3)" and turn a bare "C3" into the title
function stripRefs(text, refs) {
    const titles = new Map(refs.map(r => [r.ref, r.ticket.title]));
    return text
        .replace(/\s*\((?:C\d+(?:,\s*)?)+\)/g, '')
        .replace(/\bC(\d+)\b:?/g, (m, n) => (titles.has(`C${n}`) ? `**${titles.get(`C${n}`)}**${m.endsWith(':') ? ':' : ''}` : m));
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// Most relevant tickets (finished ones only if finished yesterday/today, for the recap).
// Refs follow creation order (ids) so "C3" stays the same ticket across messages.
function buildRefs(context) {
    const score = (t) => (t.flags.includes('overdue') ? 50 : 0) + (t.flags.includes('dueToday') ? 40 : 0)
        + (t.flags.includes('carriedOver') ? 30 : 0) + (t.flags.includes('inProgress') ? 20 : 0)
        + (t.flags.includes('bug') ? 15 : 0) + ({ high: 10, medium: 5, low: 0 }[t.priority] || 0);
    return context.tickets
        .filter(t => !t.done || t.flags.some(f => f === 'doneYesterday' || f === 'doneToday'))
        .sort((a, b) => score(b) - score(a))
        .slice(0, MAX_TICKETS_IN_PROMPT)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((ticket, i) => ({ ref: `C${i + 1}`, ticket }));
}

function TodayPanel({ context }) {
    if (!context) return null;
    const open = context.tickets.filter(t => !t.done);
    const sections = [
        { key: 'overdue', title: 'Überfällig', icon: AlertTriangle, color: 'text-red-400', items: open.filter(t => t.flags.includes('overdue')) },
        { key: 'dueToday', title: 'Heute geplant', icon: CalendarCheck, color: 'text-emerald-400', items: open.filter(t => t.flags.includes('dueToday')) },
        { key: 'carriedOver', title: 'Von gestern offen', icon: Clock, color: 'text-amber-400', items: open.filter(t => t.flags.includes('carriedOver') && !t.flags.includes('dueToday') && !t.flags.includes('overdue')) },
        { key: 'bug', title: 'Offene Bugs', icon: Bug, color: 'text-rose-400', items: open.filter(t => t.flags.includes('bug')) },
    ];
    const doneYesterday = context.tickets.filter(t => t.flags.includes('doneYesterday')).length;

    return (
        <div className="space-y-4">
            <p className="text-[11px] text-text-muted">
                {open.length} offen · {doneYesterday} gestern erledigt · {context.boards.length} Board{context.boards.length !== 1 ? 's' : ''}
            </p>
            {sections.map(({ key, title, icon: Icon, color, items }) => (
                <section key={key}>
                    <h3 className={cn('text-[11px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5', color)}>
                        <Icon className="w-3.5 h-3.5" /> {title} <span className="text-text-muted font-normal">{items.length}</span>
                    </h3>
                    {items.length === 0 ? (
                        <p className="text-[11px] text-text-muted/60 pl-5">—</p>
                    ) : (
                        <ul className="space-y-1">
                            {items.slice(0, 12).map(t => (
                                <li key={t.id}>
                                    <Link href={`/boards/${t.boardId}?card=${t.id}`}
                                        className="block px-2 py-1.5 rounded-md hover:bg-surface-hover transition-colors">
                                        <p className="text-xs text-text-primary truncate">{t.title}</p>
                                        <p className="text-[10px] text-text-muted truncate">
                                            {t.board} › {t.column} · {t.priority}{t.assignee ? ` · 🤖 ${t.assignee}` : ''}
                                        </p>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            ))}
        </div>
    );
}

function ActionList({ message, onApply, onSkip, busyIndex }) {
    const pending = message.actions.map((_, i) => i).filter(i => (message.actionStatus?.[i] || 'pending') === 'pending');
    return (
        <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-300">Vorgeschlagene Änderungen</p>
                {pending.length > 1 && (
                    <button onClick={() => onApply(message, pending)} disabled={busyIndex !== null}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 disabled:opacity-40">
                        Alle {pending.length} übernehmen
                    </button>
                )}
            </div>
            {message.actions.map((a, i) => {
                const status = message.actionStatus?.[i] || 'pending';
                const { verb, target } = describePlannerAction(a);
                const Icon = ACTION_ICONS[a.type] || Sparkles;
                return (
                    <div key={i} className={cn('flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs',
                        status === 'applied' ? 'border-emerald-500/30 bg-emerald-500/5'
                            : status === 'skipped' ? 'border-border-subtle opacity-50'
                                : status.startsWith('failed') ? 'border-red-500/30 bg-red-500/5'
                                    : 'border-purple-500/25 bg-purple-500/5')}>
                        <Icon className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-text-primary truncate" title={target}>{target}</p>
                            <p className="text-[10px] text-text-muted truncate">{verb}</p>
                            {status.startsWith('failed') && <p className="text-[10px] text-red-400">{status}</p>}
                        </div>
                        {status === 'pending' ? (
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => onApply(message, [i])} disabled={busyIndex !== null}
                                    className="p-1 rounded-md text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40" title="Übernehmen">
                                    {busyIndex === `${message._id}:${i}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => onSkip(message, i)} disabled={busyIndex !== null}
                                    className="p-1 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40" title="Verwerfen">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <span className={cn('text-[10px] shrink-0', status === 'applied' ? 'text-emerald-400' : 'text-text-muted')}>
                                {status === 'applied' ? '✓ übernommen' : status === 'skipped' ? 'verworfen' : ''}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function WorkspacePlannerPage() {
    const { id } = useParams();
    const { workspaces } = useWorkspaces();
    const { askAI, isConfigured } = useAI();
    const [messages, setMessages] = useState([]);
    const [context, setContext] = useState(null);
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const [error, setError] = useState('');
    const [busyIndex, setBusyIndex] = useState(null);
    const endRef = useRef(null);
    const inputRef = useRef(null);

    const workspaceName = id === 'all' ? 'Alle Boards' : workspaces.find(w => w._id === id)?.name || 'Workspace';

    const loadContext = useCallback(async () => {
        const res = await plannerApi.getContext(id, startOfToday());
        setContext(res.data);
        return res.data;
    }, [id]);

    useEffect(() => {
        setMessages([]);
        setContext(null);
        plannerApi.getMessages(id).then(res => setMessages(res.data)).catch(err => setError(err.message));
        loadContext().catch(err => setError(err.message));
    }, [id, loadContext]);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, thinking]);

    const send = async (text) => {
        const content = (text ?? input).trim();
        if (!content || thinking) return;
        setInput('');
        setError('');
        setThinking(true);
        try {
            const userMsg = (await plannerApi.addMessage(id, { role: 'user', content })).data;
            const history = [...messages, userMsg];
            setMessages(history);

            const ctx = await loadContext();
            const refs = buildRefs(ctx);
            const chat = [
                { role: 'system', content: plannerSystemPrompt(ctx, refs) },
                ...history.slice(-HISTORY_MESSAGES).map(m => ({ role: m.role, content: m.content || '(actions only)' })),
            ];
            const result = await askAI(chat, { maxTokens: 3072, temperature: 0.4 });
            const parsed = parsePlannerReply(result.text);
            const { actions, dropped } = resolvePlannerActions(parsed.actions, ctx, refs);
            const note = dropped ? `\n\n_${dropped} Vorschlag/Vorschläge passten nicht zum Board und wurden weggelassen._` : '';
            const assistantMsg = (await plannerApi.addMessage(id, { role: 'assistant', content: stripRefs(parsed.content, refs) + note, actions })).data;
            setMessages(prev => [...prev, assistantMsg]);
        } catch (err) {
            setError(err.message);
        } finally {
            setThinking(false);
            inputRef.current?.focus();
        }
    };

    const setStatus = async (message, index, status) => {
        await plannerApi.setActionStatus(id, message._id, index, status).catch(() => {});
        setMessages(prev => prev.map(m => m._id === message._id
            ? { ...m, actionStatus: m.actions.map((_, i) => i === index ? status : (m.actionStatus?.[i] || 'pending')) }
            : m));
    };

    const handleApply = async (message, indices) => {
        for (const i of indices) {
            setBusyIndex(`${message._id}:${i}`);
            try {
                await applyPlannerAction(message.actions[i]);
                await setStatus(message, i, 'applied');
            } catch (err) {
                await setStatus(message, i, `failed: ${err.message}`);
            }
        }
        setBusyIndex(null);
        loadContext().catch(() => {});
    };

    const handleClear = async () => {
        if (!confirm('Chatverlauf dieses Workspaces löschen?')) return;
        await plannerApi.clear(id);
        setMessages([]);
    };

    return (
        <div className="h-full flex overflow-hidden">
            {/* Chat */}
            <div className="flex-1 min-w-0 flex flex-col">
                <header className="h-14 px-6 border-b border-border-subtle flex items-center justify-between shrink-0">
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-text-primary flex items-center gap-2">
                            <CalendarCheck className="w-4 h-4 text-purple-400" /> Tagesplanung
                            <span className="text-text-muted font-normal">· {workspaceName}</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => loadContext().catch(err => setError(err.message))} className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover" title="Board neu laden">
                            <RotateCcw className="w-4 h-4" />
                        </button>
                        {messages.length > 0 && (
                            <button onClick={handleClear} className="p-1.5 rounded-md text-text-secondary hover:text-red-400 hover:bg-surface-hover" title="Chat löschen">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="max-w-3xl mx-auto space-y-5">
                        {!isConfigured && (
                            <p className="text-sm text-amber-400">AI ist nicht eingerichtet – bitte unter <Link href="/settings" className="underline">Settings</Link> einen Provider konfigurieren.</p>
                        )}
                        {messages.length === 0 && !thinking && (
                            <div className="text-center py-10 space-y-3">
                                <Sparkles className="w-8 h-8 text-purple-400 mx-auto" />
                                <p className="text-sm text-text-primary font-medium">Plane deinen Tag mit der AI</p>
                                <p className="text-xs text-text-muted max-w-md mx-auto">
                                    Sie kennt alle Tickets in {workspaceName}: was überfällig ist, was gestern liegen geblieben ist und welche Bugs offen sind.
                                    Änderungen am Board schlägt sie nur vor – du entscheidest.
                                </p>
                            </div>
                        )}

                        {messages.map(m => (
                            <div key={m._id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                                <div className={cn('rounded-2xl px-4 py-3 max-w-[85%]',
                                    m.role === 'user' ? 'bg-accent/15 border border-accent/20 text-text-primary text-sm whitespace-pre-wrap' : 'bg-surface-raised border border-border-subtle w-full')}>
                                    {m.role === 'user' ? m.content : (
                                        <>
                                            {m.content && <MarkdownRenderer content={m.content} compact />}
                                            {m.actions?.length > 0 && (
                                                <ActionList message={m} busyIndex={busyIndex}
                                                    onApply={handleApply} onSkip={(msg, i) => setStatus(msg, i, 'skipped')} />
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}

                        {thinking && (
                            <div className="flex items-center gap-2 text-xs text-purple-300">
                                <Loader2 className="w-4 h-4 animate-spin" /> Schaue mir das Board an…
                            </div>
                        )}
                        {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                        <div ref={endRef} />
                    </div>
                </div>

                <div className="border-t border-border-subtle px-6 py-4 shrink-0">
                    <div className="max-w-3xl mx-auto space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_PROMPTS.map(p => (
                                <button key={p} disabled={thinking || !isConfigured}
                                    onClick={() => p.endsWith(': ') ? (setInput(p), inputRef.current?.focus()) : send(p)}
                                    className="text-[11px] px-2.5 py-1 rounded-full border border-purple-500/25 text-purple-300 hover:bg-purple-500/10 disabled:opacity-40">
                                    {p.endsWith(': ') ? p.slice(0, -2) + ' …' : p}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                                placeholder="Frag nach deinem Tag, melde einen Bug, lass Tickets umplanen… (Enter senden, Shift+Enter Zeilenumbruch)"
                                rows={2}
                                disabled={!isConfigured}
                                className="flex-1 bg-surface-overlay border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-purple-500/50 resize-none"
                            />
                            <button onClick={() => send()} disabled={!input.trim() || thinking || !isConfigured}
                                className="p-3 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-30" title="Senden">
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Today */}
            <aside className="hidden lg:block w-80 shrink-0 border-l border-border-subtle overflow-y-auto p-5 bg-surface-raised/20">
                <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-emerald-400" /> Heute
                </h2>
                {context ? <TodayPanel context={context} /> : <p className="text-xs text-text-muted">Lade Board…</p>}
            </aside>
        </div>
    );
}
