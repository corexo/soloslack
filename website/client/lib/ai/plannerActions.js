import { cardsApi } from '@/lib/api/cardsApi';

const LABEL_COLORS = { bug: 'red', fehler: 'red', urgent: 'orange', frontend: 'blue', backend: 'purple', docs: 'green' };
const PRIORITIES = ['low', 'medium', 'high'];

// Local noon so the date is "today" in the user's timezone whatever the UTC offset
const todayNoon = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString();
};

/**
 * Turn raw AI actions (with C-refs and names) into self-contained actions with ids,
 * dropping anything that doesn't match the current board. Returns { actions, dropped }.
 */
export function resolvePlannerActions(rawActions, context, refs) {
    const byRef = new Map(refs.map(r => [r.ref.toUpperCase(), r.ticket]));
    const boards = context.boards;
    const findColumn = (board, name) => board?.columns.find(c => c.name.toLowerCase() === String(name || '').toLowerCase());
    const actions = [];
    let dropped = 0;

    for (const a of rawActions.slice(0, 30)) {
        const type = String(a?.type || '').toLowerCase();
        if (type === 'create') {
            const board = boards.find(b => b.name.toLowerCase() === String(a.board || '').toLowerCase()) || (boards.length === 1 ? boards[0] : null);
            const column = findColumn(board, a.column) || board?.columns[0];
            if (!board || !column || !String(a.title || '').trim()) { dropped++; continue; }
            actions.push({
                type: 'create',
                boardId: board.id, boardName: board.name, columnId: column.id, columnName: column.name,
                title: String(a.title).trim().slice(0, 200),
                description: String(a.description || '').slice(0, 20000),
                priority: PRIORITIES.includes(a.priority) ? a.priority : 'medium',
                labels: (Array.isArray(a.labels) ? a.labels : []).map(String).filter(Boolean).slice(0, 6),
                checklist: (Array.isArray(a.checklist) ? a.checklist : []).map(String).filter(Boolean).slice(0, 20),
                dueToday: Boolean(a.dueToday),
            });
            continue;
        }

        const ticket = byRef.get(String(a?.ref || '').toUpperCase());
        if (!ticket) { dropped++; continue; }
        const base = { cardId: ticket.id, cardTitle: ticket.title, boardId: ticket.boardId };

        if (type === 'plan_today') {
            // Already planned — not worth an approval click
            if (ticket.flags.includes('dueToday')) continue;
            actions.push({ type, ...base });
        } else if (type === 'move') {
            const column = findColumn(boards.find(b => b.id === ticket.boardId), a.column);
            if (!column) { dropped++; continue; }
            if (column.name === ticket.column) continue;
            actions.push({ type, ...base, columnId: column.id, columnName: column.name, fromColumn: ticket.column });
        } else if (type === 'update') {
            const patch = {};
            if (PRIORITIES.includes(a.priority) && a.priority !== ticket.priority) patch.priority = a.priority;
            if (a.assignee !== undefined && (a.assignee || null) !== ticket.assignee) patch.assignee = a.assignee || null;
            if (!Object.keys(patch).length) continue;
            actions.push({ type, ...base, ...patch });
        } else {
            dropped++;
        }
    }
    return { actions, dropped };
}

/** Human-readable one-liner for an action card */
export function describePlannerAction(a) {
    switch (a.type) {
        case 'plan_today': return { verb: 'Plan for today', target: a.cardTitle };
        case 'move': return { verb: `Move ${a.fromColumn} → ${a.columnName}`, target: a.cardTitle };
        case 'update': return {
            verb: [a.priority && `Priority → ${a.priority}`, a.assignee !== undefined && `Assign → ${a.assignee || 'nobody'}`].filter(Boolean).join(', '),
            target: a.cardTitle,
        };
        case 'create': return {
            verb: `New ticket in ${a.boardName} › ${a.columnName}${a.labels.includes('bug') ? ' (bug)' : ''}${a.dueToday ? ', due today' : ''}`,
            target: a.title,
        };
        default: return { verb: a.type, target: '' };
    }
}

/** Apply one approved action to the board */
export async function applyPlannerAction(a) {
    switch (a.type) {
        case 'plan_today':
            return cardsApi.update(a.cardId, { dueDate: todayNoon() });
        case 'move':
            // Large order = append at the bottom of the target column
            return cardsApi.moveCard(a.cardId, { newColumnId: a.columnId, newOrder: 9999 });
        case 'update': {
            const patch = {};
            if (a.priority) patch.priority = a.priority;
            if (a.assignee !== undefined) patch.assignee = a.assignee;
            return cardsApi.update(a.cardId, patch);
        }
        case 'create':
            return cardsApi.create({
                boardId: a.boardId,
                columnId: a.columnId,
                title: a.title,
                description: a.description,
                priority: a.priority,
                labels: a.labels.map(text => ({ text: text.slice(0, 30), color: LABEL_COLORS[text.toLowerCase()] || 'blue' })),
                checklist: a.checklist.map(text => ({ text: text.slice(0, 200), completed: false })),
                ...(a.dueToday && { dueDate: todayNoon() }),
            });
        default:
            throw new Error(`Unknown action ${a.type}`);
    }
}
