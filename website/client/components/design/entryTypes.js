import { Images, Shapes, Code2, FileText } from 'lucide-react';

// Shared metadata for the four design book entry types
export const ENTRY_TYPES = {
    gallery: {
        label: 'Gallery',
        icon: Images,
        defaultTitle: 'New Gallery',
        description: 'Responsive image grid with lightbox',
        defaultData: () => ({ items: [] }),
    },
    tokens: {
        label: 'Design Tokens',
        icon: Shapes,
        defaultTitle: 'Design Tokens',
        description: 'Colors, typography and spacing',
        defaultData: () => ({ colors: [], typography: [], spacing: [] }),
    },
    snippet: {
        label: 'Snippet',
        icon: Code2,
        defaultTitle: 'New Snippet',
        description: 'HTML/CSS rendered in a sandboxed iframe',
        defaultData: () => ({ html: '', css: '' }),
    },
    doc: {
        label: 'Doc',
        icon: FileText,
        defaultTitle: 'New Doc',
        description: 'Markdown documentation',
        defaultData: () => ({ body: '' }),
    },
};

export const ENTRY_TYPE_ORDER = ['gallery', 'tokens', 'snippet', 'doc'];

// Normalize possibly missing/partial data so renderers can rely on the shape
export function normalizeEntryData(type, data) {
    switch (type) {
        case 'gallery':
            return { items: Array.isArray(data?.items) ? data.items : [] };
        case 'tokens':
            return {
                colors: Array.isArray(data?.colors) ? data.colors : [],
                typography: Array.isArray(data?.typography) ? data.typography : [],
                spacing: Array.isArray(data?.spacing) ? data.spacing : [],
            };
        case 'snippet':
            return { html: data?.html ?? '', css: data?.css ?? '' };
        case 'doc':
            return { body: data?.body ?? '' };
        default:
            return data ?? {};
    }
}
