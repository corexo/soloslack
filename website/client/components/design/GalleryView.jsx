'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Images } from 'lucide-react';

function Lightbox({ items, index, onClose, onNavigate }) {
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') onNavigate(-1);
            if (e.key === 'ArrowRight') onNavigate(1);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose, onNavigate]);

    const item = items[index];
    if (!item) return null;

    return (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fade-in">
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title="Close (Esc)"
            >
                <X className="w-5 h-5" />
            </button>

            <img
                src={item.url}
                alt={item.caption || 'Gallery image'}
                className="max-w-[92vw] max-h-[78vh] object-contain rounded-lg shadow-2xl select-none"
                draggable={false}
            />

            {items.length > 1 && (
                <>
                    <button
                        onClick={() => onNavigate(-1)}
                        disabled={index === 0}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Previous"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => onNavigate(1)}
                        disabled={index === items.length - 1}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        title="Next"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </>
            )}

            <div className="mt-4 text-center max-w-[80vw]">
                {item.caption && (
                    <p className="text-sm text-white/90">{item.caption}</p>
                )}
                {items.length > 1 && (
                    <p className="text-[11px] text-white/40 font-mono mt-1">
                        {index + 1} / {items.length}
                    </p>
                )}
            </div>
        </div>
    );
}

export default function GalleryView({ data }) {
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const items = Array.isArray(data?.items) ? data.items.filter(i => i?.url) : [];

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted space-y-3">
                <Images className="w-10 h-10 opacity-30" />
                <p className="text-xs">No images yet — edit this entry to add some.</p>
            </div>
        );
    }

    const navigate = (delta) => {
        setLightboxIndex(prev => {
            if (prev === null) return prev;
            const next = prev + delta;
            return next >= 0 && next < items.length ? next : prev;
        });
    };

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {items.map((item, i) => (
                    <button
                        key={i}
                        onClick={() => setLightboxIndex(i)}
                        className="group relative rounded-xl overflow-hidden border border-border-subtle bg-surface-overlay hover:border-accent/40 transition-all card-glow"
                        title={item.caption || 'Open image'}
                    >
                        <div className="aspect-[4/3] overflow-hidden">
                            <img
                                src={item.url}
                                alt={item.caption || `Gallery image ${i + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                                draggable={false}
                            />
                        </div>
                        {item.caption && (
                            <p className="px-2.5 py-2 text-[11px] text-text-secondary text-left truncate">
                                {item.caption}
                            </p>
                        )}
                    </button>
                ))}
            </div>

            {lightboxIndex !== null && (
                <Lightbox
                    items={items}
                    index={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                    onNavigate={navigate}
                />
            )}
        </>
    );
}
