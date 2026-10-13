const DONE_COLUMN = /done|erledigt|fertig|closed|abgeschlossen|released|shipped/i;

/**
 * Per column: name, position and whether it counts as "done".
 * Done = name matches DONE_COLUMN; boards without such a column use their last column.
 * @param {Array} columns - Column docs (any order)
 * @returns {Map<string, { name, index, boardId, done }>}
 */
function columnInfoMap(columns) {
    const byBoard = new Map();
    [...columns]
        .sort((a, b) => a.order - b.order)
        .forEach(c => byBoard.set(String(c.boardId), [...(byBoard.get(String(c.boardId)) || []), c]));

    const info = new Map();
    for (const [boardId, cols] of byBoard) {
        const anyNamedDone = cols.some(c => DONE_COLUMN.test(c.name));
        cols.forEach((c, i) => info.set(String(c._id), {
            name: c.name,
            index: i,
            boardId,
            done: anyNamedDone ? DONE_COLUMN.test(c.name) : i === cols.length - 1 && cols.length > 1,
        }));
    }
    return info;
}

module.exports = { columnInfoMap, DONE_COLUMN };
