'use client';
import { FileText } from 'lucide-react';
import MarkdownRenderer from '@/components/notes/MarkdownRenderer';

export default function DocView({ data }) {
    const body = data?.body ?? '';

    if (!body.trim()) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted space-y-3">
                <FileText className="w-10 h-10 opacity-30" />
                <p className="text-xs">This doc is empty — edit this entry to write some markdown.</p>
            </div>
        );
    }

    return <MarkdownRenderer content={body} />;
}
