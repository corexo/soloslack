import { API_BASE } from '@/lib/apiBase';
import { cosineSimilarity } from './providers';
import { cacheKey, getCached, putCached } from './embeddingCache';

const BATCH_SIZE = 32;
const MIN_SCORE = 0.3;
// Embedding models differ in their score range (nomic rarely goes below 0.4),
// so also drop results far behind the best match
const MAX_GAP_TO_BEST = 0.08;

// nomic-embed models are trained with task prefixes and rank noticeably worse without them
const prefixes = (modelKey) => /nomic/i.test(modelKey)
    ? { doc: 'search_document: ', query: 'search_query: ' }
    : { doc: '', query: '' };

/**
 * Rank notes and cards by meaning.
 * @param {string} query
 * @param {{ embed: Function, modelKey: string }} ai - embed accepts string or string[]
 * @returns {Promise<Array<{ type: 'note'|'card', item: object, score: number }>>}
 */
export async function semanticSearch(query, { embed, modelKey }, limit = 10) {
    const res = await fetch(`${API_BASE}/search/corpus`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not load search data');

    const items = [
        ...data.data.notes.map(item => ({ type: 'note', item })),
        ...data.data.cards.map(item => ({ type: 'card', item })),
    ].filter(e => `${e.item.title} ${e.item.text}`.trim());

    const prefix = prefixes(modelKey);

    // Embed only what isn't cached yet (new or edited since last search)
    const keys = items.map(e => cacheKey(modelKey, e.item));
    const vectors = await getCached(keys);
    const missing = items.map((_, i) => i).filter(i => !vectors[i]);

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const batch = missing.slice(i, i + BATCH_SIZE);
        const embedded = await embed(batch.map(j => `${prefix.doc}${items[j].item.title}\n${items[j].item.text}`.slice(0, 2000)));
        batch.forEach((j, n) => { vectors[j] = embedded[n]; });
        await putCached(batch.map((j, n) => [keys[j], embedded[n]]));
    }

    const queryVector = await embed(`${prefix.query}${query}`);
    const scored = items
        .map((e, i) => ({ ...e, score: cosineSimilarity(queryVector, vectors[i]) }))
        .sort((a, b) => b.score - a.score);
    const threshold = Math.max(MIN_SCORE, (scored[0]?.score ?? 0) - MAX_GAP_TO_BEST);
    return scored.filter(e => e.score >= threshold).slice(0, limit);
}
