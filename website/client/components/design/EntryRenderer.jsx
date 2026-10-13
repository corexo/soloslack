'use client';
import GalleryView from './GalleryView';
import TokensView from './TokensView';
import SnippetView from './SnippetView';
import DocView from './DocView';
import { normalizeEntryData } from './entryTypes';

// Dispatches an entry to its type-specific read-only renderer
export default function EntryRenderer({ entry }) {
    const data = normalizeEntryData(entry?.type, entry?.data);

    switch (entry?.type) {
        case 'gallery':
            return <GalleryView data={data} />;
        case 'tokens':
            return <TokensView data={data} />;
        case 'snippet':
            return <SnippetView data={data} />;
        case 'doc':
            return <DocView data={data} />;
        default:
            return (
                <p className="text-xs text-text-muted py-8 text-center">
                    Unknown entry type: {entry?.type}
                </p>
            );
    }
}
