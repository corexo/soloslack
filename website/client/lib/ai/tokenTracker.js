/**
 * Token Usage Tracker
 * Persists AI usage records in the backend (MongoDB). localStorage is a
 * synchronous cache so the analytics helpers below can stay sync.
 */

const STORAGE_KEY = 'notban_ai_usage';
const USAGE_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/ai/usage`;
const MAX_RECORDS = 5000; // prevent unbounded growth

function getRecords() {
    if (typeof window === 'undefined') return [];
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveRecords(records) {
    // Trim to max records (keep most recent)
    const trimmed = records.length > MAX_RECORDS
        ? records.slice(records.length - MAX_RECORDS)
        : records;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * Log a usage record after an AI call.
 * @param {{ provider: string, model: string, inputTokens: number, outputTokens: number, totalTokens: number }} record
 */
export function logUsage({ provider, model, inputTokens, outputTokens, totalTokens }) {
    const record = {
        timestamp: Date.now(),
        provider,
        model: model || 'unknown',
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        totalTokens: totalTokens || 0,
    };
    saveRecords([...getRecords(), record]);
    fetch(USAGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
    }).catch(err => console.error('Failed to persist AI usage', err));
}

/**
 * Refresh the local cache from the backend. On first run, uploads
 * records that only exist locally (pre-persistence data).
 */
export async function syncUsage() {
    try {
        const res = await fetch(USAGE_URL);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const local = getRecords();
        if (data.data.length === 0 && local.length > 0) {
            await fetch(USAGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(local),
            });
            return;
        }
        saveRecords(data.data);
    } catch (err) {
        console.error('Failed to sync AI usage, using local cache', err);
    }
}

/**
 * Get all usage records, optionally filtered by time range.
 * @param {'week' | 'month' | 'year' | 'all'} range
 */
export function getUsage(range = 'all') {
    const records = getRecords();
    if (range === 'all') return records;

    const now = Date.now();
    const cutoffs = {
        week: now - 7 * 86400000,
        month: now - 30 * 86400000,
        year: now - 365 * 86400000,
    };
    const cutoff = cutoffs[range] || 0;
    return records.filter(r => r.timestamp >= cutoff);
}

/**
 * Get summary stats for a given time range.
 */
export function getUsageSummary(range = 'all') {
    const records = getUsage(range);
    const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: records.length };

    for (const r of records) {
        totals.inputTokens += r.inputTokens;
        totals.outputTokens += r.outputTokens;
        totals.totalTokens += r.totalTokens;
    }

    return totals;
}

/**
 * Get usage grouped by day for charting.
 * Returns array of { date: 'YYYY-MM-DD', inputTokens, outputTokens, totalTokens, requests }
 */
export function getUsageByDay(range = 'month') {
    const records = getUsage(range);
    const grouped = {};

    for (const r of records) {
        const date = new Date(r.timestamp).toISOString().split('T')[0];
        if (!grouped[date]) {
            grouped[date] = { date, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };
        }
        grouped[date].inputTokens += r.inputTokens;
        grouped[date].outputTokens += r.outputTokens;
        grouped[date].totalTokens += r.totalTokens;
        grouped[date].requests += 1;
    }

    // Sort by date and fill gaps
    const entries = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
    return entries;
}

/**
 * Get usage grouped by week for charting.
 * Returns array of { week: 'YYYY-Www', inputTokens, outputTokens, totalTokens, requests }
 */
export function getUsageByWeek(range = 'year') {
    const records = getUsage(range);
    const grouped = {};

    for (const r of records) {
        const d = new Date(r.timestamp);
        const startOfYear = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        const key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
        if (!grouped[key]) {
            grouped[key] = { week: key, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };
        }
        grouped[key].inputTokens += r.inputTokens;
        grouped[key].outputTokens += r.outputTokens;
        grouped[key].totalTokens += r.totalTokens;
        grouped[key].requests += 1;
    }

    return Object.values(grouped).sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Get usage grouped by month for charting.
 * Returns array of { month: 'YYYY-MM', inputTokens, outputTokens, totalTokens, requests }
 */
export function getUsageByMonth(range = 'year') {
    const records = getUsage(range);
    const grouped = {};

    for (const r of records) {
        const d = new Date(r.timestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!grouped[key]) {
            grouped[key] = { month: key, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };
        }
        grouped[key].inputTokens += r.inputTokens;
        grouped[key].outputTokens += r.outputTokens;
        grouped[key].totalTokens += r.totalTokens;
        grouped[key].requests += 1;
    }

    return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Get usage broken down by model.
 * Returns array of { model, provider, inputTokens, outputTokens, totalTokens, requests }
 */
export function getUsageByModel(range = 'all') {
    const records = getUsage(range);
    const grouped = {};

    for (const r of records) {
        const key = r.model;
        if (!grouped[key]) {
            grouped[key] = { model: r.model, provider: r.provider, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };
        }
        grouped[key].inputTokens += r.inputTokens;
        grouped[key].outputTokens += r.outputTokens;
        grouped[key].totalTokens += r.totalTokens;
        grouped[key].requests += 1;
    }

    return Object.values(grouped).sort((a, b) => b.totalTokens - a.totalTokens);
}

/**
 * Get usage broken down by provider.
 * Returns array of { provider, inputTokens, outputTokens, totalTokens, requests }
 */
export function getUsageByProvider(range = 'all') {
    const records = getUsage(range);
    const grouped = {};

    for (const r of records) {
        const key = r.provider;
        if (!grouped[key]) {
            grouped[key] = { provider: r.provider, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };
        }
        grouped[key].inputTokens += r.inputTokens;
        grouped[key].outputTokens += r.outputTokens;
        grouped[key].totalTokens += r.totalTokens;
        grouped[key].requests += 1;
    }

    return Object.values(grouped).sort((a, b) => b.totalTokens - a.totalTokens);
}

/**
 * Clear all usage data.
 */
export async function clearUsage() {
    localStorage.removeItem(STORAGE_KEY);
    await fetch(USAGE_URL, { method: 'DELETE' })
        .catch(err => console.error('Failed to clear AI usage', err));
}
