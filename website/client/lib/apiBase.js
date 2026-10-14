/**
 * Base URL of the SoloSlack API, resolved in the browser.
 *
 * The build bakes in an address like http://localhost:5005/api. Opened from another device
 * (e.g. http://192.168.10.160:3005) "localhost" would mean that device, so the hostname the
 * page was loaded from is used instead — protocol, port and path stay as configured.
 */
const CONFIGURED = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

function resolveApiBase() {
    if (typeof window === 'undefined') return CONFIGURED;
    try {
        const url = new URL(CONFIGURED, window.location.origin);
        if (LOCAL_HOSTS.has(url.hostname) && !LOCAL_HOSTS.has(window.location.hostname)) {
            url.hostname = window.location.hostname;
        }
        return url.toString().replace(/\/$/, '');
    } catch {
        return CONFIGURED;
    }
}

export const API_BASE = resolveApiBase();

/**
 * Uploaded files are stored with origin-relative URLs ("/api/attachments/…/raw") so they work
 * from every device; prefix them with the API origin when rendering.
 */
export function resolveAssetUrl(url) {
    if (!url || !url.startsWith('/api/')) return url;
    return `${API_BASE.replace(/\/api$/, '')}${url}`;
}
