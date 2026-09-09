import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { listProjectHistory, restoreProjectHistory, type ProjectHistorySnapshot } from '@/lib/api';
import { deserializeProjectDocument } from '@/lib/projectDocument';
import { useDrawingStore } from '@/store/drawingStore';

export function ProjectHistoryPanel() {
  const {
    currentProjectId,
    projectRevision,
    projectRole,
    unsavedChanges,
    applyAuthoritativeProject,
    replaceHistory,
  } = useDrawingStore();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string>();
  const [snapshots, setSnapshots] = useState<ProjectHistorySnapshot[]>([]);

  const loadHistory = useCallback(async () => {
    if (!currentProjectId) return;
    setLoading(true);
    try {
      setSnapshots(await listProjectHistory(currentProjectId, await getToken()));
    } catch {
      toast({ title: 'Could not load history', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, getToken, toast]);

  useEffect(() => {
    if (open) void loadHistory();
  }, [loadHistory, open]);

  const restore = async (snapshot: ProjectHistorySnapshot) => {
    if (!currentProjectId || projectRevision === undefined || projectRole === 'viewer') return;
    if (unsavedChanges) {
      toast({ title: 'Save your current changes before restoring history.' });
      return;
    }
    if (
      !window.confirm(`Restore the version from ${new Date(snapshot.createdAt).toLocaleString()}?`)
    )
      return;
    setRestoring(snapshot.id);
    try {
      const result = await restoreProjectHistory(
        currentProjectId,
        snapshot.id,
        projectRevision,
        await getToken(),
      );
      const document = deserializeProjectDocument(result.data);
      const applied = applyAuthoritativeProject({
        objects: document.objects,
        title: result.title,
        revision: result.revision,
        bookmarks: document.metadata.bookmarks,
      });
      if (!applied) throw new Error('The current project changed before restore completed.');
      replaceHistory(document.objects);
      toast({ title: 'History restored', description: 'A new project revision was created.' });
      await loadHistory();
    } catch (error) {
      toast({
        title: 'Could not restore history',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setRestoring(undefined);
    }
  };

  if (!currentProjectId || projectRole === 'viewer') return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs"
        onClick={() => setOpen((value) => !value)}
      >
        <History className="h-3.5 w-3.5" /> History
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-stone-200 bg-stone-50 p-2 shadow-xl dark:border-[#3b352f] dark:bg-[#211e1b]">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold">
            <span>Recent versions</span>
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          {snapshots.length === 0 && !loading ? (
            <p className="px-2 py-3 text-xs text-stone-500">No saved versions yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-100 dark:hover:bg-white/[0.05]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs">{snapshot.title}</div>
                    <div className="text-[10px] text-stone-500">
                      Revision {snapshot.revision} · {new Date(snapshot.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={restoring !== undefined}
                    onClick={() => void restore(snapshot)}
                    title="Restore this version"
                  >
                    {restoring === snapshot.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
