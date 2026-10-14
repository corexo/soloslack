'use client';
import { Route, FileCode2, MonitorSmartphone } from 'lucide-react';
import GalleryView from './GalleryView';
import { MissingNotice, DescriptionBlock } from './ComponentView';

const ROUTER_LABEL = { 'next-app': 'Next.js app router', 'next-pages': 'Next.js pages', 'expo-router': 'Expo Router', 'react-navigation': 'React Navigation' };

// Read-only view of a screen: route, flow, description, screenshot strip
export default function ScreenView({ data }) {
    return (
        <div className="space-y-8">
            {data.missing && <MissingNotice what="screen" />}

            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                {data.route && <span className="flex items-center gap-1 font-mono text-accent"><Route className="w-3.5 h-3.5" />{data.route}</span>}
                {data.flow && <span>flow: <span className="text-text-primary">{data.flow}</span></span>}
                {data.router && <span>{ROUTER_LABEL[data.router] || data.router}</span>}
                {data.path && <span className="flex items-center gap-1 font-mono"><FileCode2 className="w-3.5 h-3.5" />{data.path}</span>}
            </div>

            <DescriptionBlock data={data} />

            <section>
                <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">Screenshots</h3>
                {data.screenshots.length > 0
                    ? <GalleryView data={{ items: data.screenshots }} />
                    : <p className="text-xs text-text-muted flex items-center gap-1.5"><MonitorSmartphone className="w-3.5 h-3.5" /> No screenshots yet — add them in edit mode.</p>}
            </section>
        </div>
    );
}
