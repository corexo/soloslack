'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GitBranch, RefreshCw } from 'lucide-react';
import { boardsApi } from '@/lib/api/boardsApi';
import { gitApi } from '@/lib/api/gitApi';
import BranchGraph from '@/components/git/BranchGraph';
import { cn } from '@/lib/utils/cn';

export default function BoardBranchesPage() {
    const { id } = useParams();
    const [board, setBoard] = useState(null);
    const [graph, setGraph] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await boardsApi.getBoardFull(id);
            const b = res.data.board;
            setBoard(b);
            if (!b.gitRepo) return;
            const g = await gitApi.getGraph(b.gitRepo);
            setGraph(g.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-6">
                <header className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Link href={`/boards/${id}`} className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover" title="Back to board">
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                <GitBranch className="w-5 h-5 text-emerald-400" /> Branches
                                {board?.gitRepo && <span className="font-mono text-sm text-emerald-400">{board.gitRepo}</span>}
                            </h1>
                            {board && <p className="text-xs text-text-muted">Board: {board.name}</p>}
                        </div>
                    </div>
                    <button onClick={load} disabled={loading} className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40" title="Refresh">
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                    </button>
                </header>

                {error && <p className="text-sm text-red-400">{error}</p>}
                {board && !board.gitRepo && (
                    <p className="text-sm text-text-muted">
                        This board has no git repository yet — link one via <GitBranch className="w-3.5 h-3.5 inline" /> Repo in the <Link href={`/boards/${id}`} className="text-accent hover:underline">board header</Link>.
                    </p>
                )}
                {graph && <BranchGraph graph={graph} />}
            </div>
        </div>
    );
}
