/**
 * Lane layout for a topo-ordered commit list (newest first), like `git log --graph`.
 * Each lane holds the hash it expects next; a commit takes the first lane expecting it,
 * other lanes expecting the same commit converge into it.
 *
 * Returns per-commit { col } and edges with the lane each parent line travels in.
 */
export function layoutCommitGraph(commits) {
    const rowOf = new Map(commits.map((c, i) => [c.hash, i]));
    const lanes = [];
    const nodes = [];
    const edges = [];
    let width = 1;

    const freeLane = () => {
        const k = lanes.indexOf(null);
        if (k !== -1) return k;
        lanes.push(null);
        return lanes.length - 1;
    };

    commits.forEach((commit, row) => {
        let col = lanes.indexOf(commit.hash);
        if (col === -1) col = freeLane();
        for (let k = 0; k < lanes.length; k++) {
            if (k !== col && lanes[k] === commit.hash) lanes[k] = null;
        }

        const parentLanes = [];
        lanes[col] = commit.parents[0] ?? null;
        if (commit.parents.length) parentLanes.push(col);
        commit.parents.slice(1).forEach(p => {
            let k = lanes.indexOf(p);
            if (k === -1) {
                k = freeLane();
                lanes[k] = p;
            }
            parentLanes.push(k);
        });

        nodes.push({ col });
        commit.parents.forEach((p, i) => {
            edges.push({ from: row, parentRow: rowOf.has(p) ? rowOf.get(p) : null, lane: parentLanes[i], fromCol: col, first: i === 0 });
        });

        width = Math.max(width, lanes.length);
        while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    });

    // Resolve the parent's column now that every node is placed
    edges.forEach(e => { e.toCol = e.parentRow === null ? e.lane : nodes[e.parentRow].col; });
    return { nodes, edges, width };
}
