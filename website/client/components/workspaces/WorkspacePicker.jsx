'use client';
import { useState } from 'react';
import { FolderOpen, Check } from 'lucide-react';
import { useWorkspaces } from '@/context/WorkspacesContext';
import { WORKSPACE_COLOR_MAP } from '@/lib/utils/workspaceColors';
import { cn } from '@/lib/utils/cn';

// Moves a board or note into a workspace (or out of all workspaces)
export default function WorkspacePicker({ value, onChange, align = 'right' }) {
    const { workspaces } = useWorkspaces();
    const [open, setOpen] = useState(false);
    const current = workspaces.find(w => w._id === value);
    const color = current ? (WORKSPACE_COLOR_MAP[current.color] ?? WORKSPACE_COLOR_MAP.indigo) : null;

    const select = (id) => {
        setOpen(false);
        if (id !== (value || null)) onChange(id);
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors max-w-[160px]',
                    current ? 'text-text-primary hover:bg-surface-hover' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                )}
                style={color ? { backgroundColor: color.bg } : undefined}
                title={current ? `Workspace: ${current.name}` : 'Move to a workspace'}
            >
                {color
                    ? <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
                    : <FolderOpen className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{current?.name || 'Workspace'}</span>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className={cn(
                        'absolute top-full mt-1 z-50 w-56 bg-surface-overlay border border-border-subtle rounded-lg shadow-xl py-1',
                        align === 'right' ? 'right-0' : 'left-0'
                    )}>
                        <button onClick={() => select(null)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover text-left">
                            <span className="w-3">{!value && <Check className="w-3 h-3 text-accent" />}</span>
                            No workspace
                        </button>
                        {workspaces.map(ws => {
                            const c = WORKSPACE_COLOR_MAP[ws.color] ?? WORKSPACE_COLOR_MAP.indigo;
                            return (
                                <button key={ws._id} onClick={() => select(ws._id)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover text-left">
                                    <span className="w-3">{ws._id === value && <Check className="w-3 h-3 text-accent" />}</span>
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                                    <span className="truncate">{ws.name}</span>
                                </button>
                            );
                        })}
                        {workspaces.length === 0 && (
                            <p className="px-3 py-1.5 text-[11px] text-text-muted">Create one in the sidebar under Workspaces.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
