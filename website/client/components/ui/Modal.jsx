import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// size="full": near-fullscreen work view (e.g. task detail) instead of a small dialog
export default function Modal({ isOpen, onClose, title, children, size = 'default', closeOnEscape = false }) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !closeOnEscape) return;
        const onKey = (e) => {
            // Leave Escape to inputs (e.g. cancelling an inline edit)
            if (e.key !== 'Escape' || e.defaultPrevented || e.target.closest?.('input, textarea, select')) return;
            onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, closeOnEscape, onClose]);

    if (!isOpen) return null;
    const full = size === 'full';

    return (
        <div className={cn('fixed inset-0 z-50 flex items-center justify-center', full ? 'p-2 md:p-5' : 'p-4')}>
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Content */}
            <div className={cn(
                'relative bg-surface-raised border border-border-default rounded-xl shadow-2xl w-full overflow-hidden flex flex-col',
                full ? 'h-full max-w-[1600px]' : 'max-w-lg max-h-[90vh]'
            )}>
                <header className="p-4 border-b border-border-subtle flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
                    <button
                        onClick={onClose}
                        className="text-text-secondary hover:text-text-primary p-1 rounded-md hover:bg-surface-hover"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </header>

                <div className={cn('flex-1 overflow-y-auto', full ? 'p-6 md:p-8' : 'p-6')}>
                    {children}
                </div>
            </div>
        </div>
    );
}
