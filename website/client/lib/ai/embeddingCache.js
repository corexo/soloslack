/**
 * Persistent embedding cache in IndexedDB (vectors are too large for localStorage).
 * Keyed by "<provider>:<model>|<itemId>|<updatedAt>" so edits and model switches re-embed.
 */
const DB_NAME = 'notban_embeddings';
const STORE = 'vectors';

let dbPromise = null;

function openDB() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    dbPromise ||= new Promise((resolve) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null); // e.g. private mode — just don't cache
    });
    return dbPromise;
}

export const cacheKey = (modelKey, item) => `${modelKey}|${item._id}|${item.updatedAt}`;

export async function getCached(keys) {
    const db = await openDB();
    if (!db) return keys.map(() => undefined);
    return new Promise((resolve) => {
        const store = db.transaction(STORE, 'readonly').objectStore(STORE);
        const out = new Array(keys.length);
        let pending = keys.length;
        if (!pending) return resolve(out);
        keys.forEach((k, i) => {
            const req = store.get(k);
            req.onsuccess = () => { out[i] = req.result; if (--pending === 0) resolve(out); };
            req.onerror = () => { if (--pending === 0) resolve(out); };
        });
    });
}

export async function putCached(entries) {
    const db = await openDB();
    if (!db || !entries.length) return;
    await new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        entries.forEach(([k, v]) => store.put(v, k));
        tx.oncomplete = resolve;
        tx.onerror = resolve;
    });
}
