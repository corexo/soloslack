import { Images, Shapes, Code2, FileText, Puzzle, MonitorSmartphone } from 'lucide-react';

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
    component: {
        label: 'Component',
        icon: Puzzle,
        defaultTitle: 'New Component',
        description: 'UI component: props, states, screenshots, code',
        defaultData: () => ({ name: '', path: '', props: [], description: '', status: 'draft', variants: [], screenshots: [] }),
    },
    screen: {
        label: 'Screen',
        icon: MonitorSmartphone,
        defaultTitle: 'New Screen',
        description: 'Screen / route with screenshots, grouped by flow',
        defaultData: () => ({ name: '', route: '', path: '', flow: '', description: '', screenshots: [] }),
    },
};

export const ENTRY_TYPE_ORDER = ['gallery', 'tokens', 'snippet', 'doc', 'component', 'screen'];

export const COMPONENT_STATUSES = ['draft', 'stable', 'deprecated'];

// Normalize possibly missing/partial data so renderers can rely on the shape
export function normalizeEntryData(type, data) {
    switch (type) {
        case 'gallery':
            return { items: Array.isArray(data?.items) ? data.items : [] };
        case 'tokens':
            return {
                ...data,
                colors: Array.isArray(data?.colors) ? data.colors : [],
                typography: Array.isArray(data?.typography) ? data.typography : [],
                spacing: Array.isArray(data?.spacing) ? data.spacing : [],
                radii: Array.isArray(data?.radii) ? data.radii : [],
                shadows: Array.isArray(data?.shadows) ? data.shadows : [],
            };
        case 'component':
            return {
                ...data,
                props: Array.isArray(data?.props) ? data.props : [],
                variants: Array.isArray(data?.variants) ? data.variants : [],
                screenshots: Array.isArray(data?.screenshots) ? data.screenshots : [],
                description: data?.description ?? '',
                status: data?.status || 'draft',
            };
        case 'screen':
            return {
                ...data,
                screenshots: Array.isArray(data?.screenshots) ? data.screenshots : [],
                description: data?.description ?? '',
            };
        case 'snippet':
            return { html: data?.html ?? '', css: data?.css ?? '' };
        case 'doc':
            return { body: data?.body ?? '' };
        default:
            return data ?? {};
    }
}
