'use client';
import { useState } from 'react';
import { FileText, Paperclip, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import MarkdownRenderer from '../notes/MarkdownRenderer';
import { attachmentUrl } from '@/lib/api/cardsApi';

const isImage = (a) => a.mimeType.startsWith('image/');
const isMarkdown = (a) => /\.(md|markdown)$/i.test(a.name);

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Markdown files expand inline so agent reports can be read without leaving the card
function DeleteButton({ attachment, onDelete, className = '' }) {
    if (!onDelete) return null;
    return (
        <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(attachment); }}
            className={`text-text-muted hover:text-red-400 transition-colors ${className}`}
            title={`Delete ${attachment.name}`}
        >
            <Trash2 className="w-3 h-3" />
        </button>
    );
}

function MarkdownAttachment({ attachment, onDelete }) {
    const [open, setOpen] = useState(false);
    const [content, setContent] = useState(null);

    const toggle = async () => {
        if (!open && content === null) {
            const res = await fetch(attachmentUrl(attachment)).catch(() => null);
            setContent(res?.ok ? await res.text() : '_Could not load file._');
        }
        setOpen(o => !o);
    };

    return (
        <div className="border border-border-subtle rounded-md overflow-hidden">
            <button
                type="button"
                onClick={toggle}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-text-secondary hover:bg-surface-overlay transition-colors"
            >
                {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <FileText className="w-3 h-3 text-accent" />
                <span className="truncate flex-1 text-left">{attachment.name}</span>
                <span className="text-text-muted">{formatSize(attachment.size)}</span>
                <DeleteButton attachment={attachment} onDelete={onDelete} className="ml-1" />
            </button>
            {open && (
                <div className="px-3 py-2 border-t border-border-subtle text-xs max-h-[320px] overflow-y-auto">
                    <MarkdownRenderer content={content || ''} compact />
                </div>
            )}
        </div>
    );
}

/** Renders attachments: image thumbnails, expandable markdown, file chips. `onDelete` adds delete buttons. */
export default function CommentAttachments({ attachments, onDelete }) {
    if (!attachments?.length) return null;
    const images = attachments.filter(isImage);
    const others = attachments.filter(a => !isImage(a));

    return (
        <div className="mt-2 space-y-1.5">
            {images.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {images.map(a => (
                        <div key={a._id} className="relative group/att">
                            <a href={attachmentUrl(a)} target="_blank" rel="noopener noreferrer" title={a.name}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={attachmentUrl(a)}
                                    alt={a.name}
                                    className="h-24 max-w-[180px] object-cover rounded-md border border-border-subtle hover:border-accent transition-colors"
                                />
                            </a>
                            {onDelete && (
                                <div className="absolute top-1 right-1 p-1 rounded bg-black/60 opacity-0 group-hover/att:opacity-100 transition-opacity">
                                    <DeleteButton attachment={a} onDelete={onDelete} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {others.map(a => isMarkdown(a) ? (
                <MarkdownAttachment key={a._id} attachment={a} onDelete={onDelete} />
            ) : (
                <a
                    key={a._id}
                    href={attachmentUrl(a)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2 py-1.5 border border-border-subtle rounded-md text-[11px] text-text-secondary hover:border-accent transition-colors"
                >
                    <Paperclip className="w-3 h-3 text-accent" />
                    <span className="truncate flex-1">{a.name}</span>
                    <span className="text-text-muted">{formatSize(a.size)}</span>
                    <DeleteButton attachment={a} onDelete={onDelete} className="ml-1" />
                </a>
            ))}
        </div>
    );
}
