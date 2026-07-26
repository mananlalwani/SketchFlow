import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Save, Trash2, Cloud, Loader2, Share2, Download, AlertCircle, PenTool } from 'lucide-react';
import { serializeProject } from '@/lib/utils';
import { exportAsPNG, exportAsSVG, downloadFile, type ExportQuality } from '@/lib/export';
import { createProject } from '@/lib/api';
import {
  activeProjectWriteCoordinator,
  ProjectWriteResetError,
} from '@/lib/projectWriteCoordinator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { ProjectShareDialog } from '@/components/ProjectShareDialog';
import { SettingsDropdown } from '@/components/SettingsDropdown';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useAuth, SignInButton, SignUpButton, useClerk } from '@clerk/clerk-react';
import { User } from 'lucide-react';

export function TopBar({ hideProjectControls }: { hideProjectControls?: boolean }) {
  const {
    projectTitle,
    setProjectTitle,
    unsavedChanges,
    saveStatus,
    documentVersion,
    projectRole,
    clearCanvas,
    requestFullRedraw,
    objects,
    currentProjectId,
    setCurrentProject,
    projectRevision,
    lastSavedAt,
  } = useDrawingStore();

  const { toast } = useToast();
  const { getToken, userId } = useAuth();
  const { isGuest, isAuthenticated, isLoading } = useAuthStore();
  const clerk = useClerk();
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const goToHome = useCallback(() => {
    setCurrentProject(undefined);
    clearCanvas();
  }, [setCurrentProject, clearCanvas]);

  const currentProject = useMemo(() => {
    if (!currentProjectId || currentProjectId.startsWith('offline-')) return null;
    return {
      id: currentProjectId,
      userId: userId || '',
      title: projectTitle || 'Untitled',
      createdAt: Date.now(),
      updatedAt: lastSavedAt || Date.now(),
      shared: false,
      role: 'owner' as const,
    };
  }, [currentProjectId, userId, projectTitle, lastSavedAt]);

  const handleSave = useCallback(async () => {
    if (projectRole === 'viewer') return;
    const savedProjectId = currentProjectId;
    const savedDocumentVersion = documentVersion;
    const savedTitle = projectTitle || 'Untitled';
    const payload = serializeProject(objects, 4096, 4096);
    setIsSaving(true);

    try {
      // Manual save is an explicit retry decision, unlike background autosave.
      activeProjectWriteCoordinator.resume(savedProjectId ?? 'active-draft');
      const saved = await activeProjectWriteCoordinator.enqueue({
        projectKey: savedProjectId ?? 'active-draft',
        projectId: savedProjectId,
        title: savedTitle,
        data: payload,
        documentVersion: savedDocumentVersion,
        expectedRevision: projectRevision,
        cloud: !isGuest,
        tokenProvider: isGuest ? undefined : getToken,
      });
      const currentState = useDrawingStore.getState();
      const isCurrentSnapshot =
        currentState.documentVersion === savedDocumentVersion &&
        (savedProjectId
          ? currentState.currentProjectId === savedProjectId
          : !currentState.currentProjectId);
      if (!isCurrentSnapshot) return;

      if (!savedProjectId) currentState.setCurrentProject(saved.id);
      currentState.setProjectRevision(saved.revision);
      currentState.markSaved(savedDocumentVersion);
      toast({
        title: isGuest ? 'Saved locally' : 'Saved to cloud',
        description: isGuest ? 'Sign in to save to cloud.' : undefined,
      });
    } catch (e) {
      if (e instanceof ProjectWriteResetError) return;
      console.error('Save failed', e);
      toast({
        title: 'Save failed',
        description: isGuest ? 'Could not save locally.' : 'Could not save to cloud.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    currentProjectId,
    documentVersion,
    getToken,
    isGuest,
    objects,
    projectRevision,
    projectRole,
    projectTitle,
    toast,
  ]);

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear the canvas?')) {
      clearCanvas();
      requestFullRedraw();
      toast({ title: 'Canvas cleared' });
    }
  };

  const handleExportPNG = useCallback(
    async (quality: ExportQuality = '1x', format: 'png' | 'jpeg' | 'webp' = 'png') => {
      setIsExporting(true);
      try {
        const blob = await exportAsPNG(objects, { quality, format });
        const ext = format === 'jpeg' ? 'jpg' : format;
        const qualityLabel = quality !== '1x' ? `-${quality}` : '';
        const filename = `${projectTitle || 'drawing'}${qualityLabel}.${ext}`;
        downloadFile(blob, filename);

        const sizeKB = (blob.size / 1024).toFixed(1);
        toast({
          title: `Exported ${format.toUpperCase()}`,
          description: `${filename} (${sizeKB} KB)`,
        });
      } catch (e) {
        console.error('Export failed', e);
        toast({ title: 'Export failed', variant: 'destructive' });
      } finally {
        setIsExporting(false);
      }
    },
    [objects, projectTitle, toast],
  );

  const handleExportSVG = useCallback(() => {
    setIsExporting(true);
    try {
      const svg = exportAsSVG(objects);
      const filename = `${projectTitle || 'drawing'}.svg`;
      const sizeKB = (new Blob([svg]).size / 1024).toFixed(1);
      downloadFile(svg, filename, 'image/svg+xml');
      toast({
        title: 'Exported SVG',
        description: `${filename} (${sizeKB} KB)`,
      });
    } catch (e) {
      console.error('Export failed', e);
      toast({ title: 'Export failed', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [objects, projectTitle, toast]);

  const handleDuplicateRecovery = useCallback(async () => {
    if (!userId) return;
    try {
      const token = await getToken();
      const copy = await createProject(
        `${projectTitle || 'Untitled Project'} (Conflict recovery)`,
        serializeProject(objects, 4096, 4096),
        token,
      );
      setCurrentProject(copy.id);
      toast({
        title: 'Recovery copy created',
        description: 'Your local work is now saved as a new project.',
      });
    } catch {
      toast({ title: 'Could not create recovery copy', variant: 'destructive' });
    }
  }, [getToken, objects, projectTitle, setCurrentProject, toast, userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  return (
    <div className="relative z-30 flex h-14 items-center justify-between border-b border-stone-200/90 bg-stone-50/85 px-3 backdrop-blur-md transition-colors duration-200 dark:border-[#3b352f] dark:bg-[#211e1b]/95 sm:px-4">
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          className="group flex items-center gap-2.5 rounded-lg px-1 py-1 text-left outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#211e1b]"
          onClick={goToHome}
          aria-label="Return to projects"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-amber-200 shadow-sm shadow-stone-950/20 dark:bg-amber-300 dark:text-stone-950">
            <PenTool className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <span className="leading-none">
            <span className="block font-semibold tracking-[-0.035em] text-stone-950 dark:text-stone-50">
              SketchFlow
            </span>
            <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
              Canvas
            </span>
          </span>
        </button>

        {!hideProjectControls && (
          <div className="hidden items-center sm:flex">
            <div className="mx-2 h-6 w-px bg-stone-200 dark:bg-[#3b352f]" />

            <div className="flex items-center gap-2 group">
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="min-w-[150px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-stone-900 outline-none transition-colors hover:border-stone-300 hover:bg-stone-100/60 focus:border-amber-500 focus:bg-amber-50/40 dark:text-stone-100 dark:hover:border-[#3b352f] dark:hover:bg-white/[0.035] dark:focus:border-amber-300 dark:focus:bg-amber-300/[0.06]"
                placeholder="Untitled Project"
              />
              <div className="flex items-center gap-2 text-xs">
                {isSaving || saveStatus === 'syncing' ? (
                  <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                    <Loader2 className="w-3 h-3 animate-spin mr-1" /> Saving...
                  </span>
                ) : saveStatus === 'retrying' ? (
                  <span className="flex items-center text-orange-500 dark:text-orange-400">
                    <Loader2 className="w-3 h-3 animate-spin mr-1" /> Retrying...
                  </span>
                ) : saveStatus === 'failed' ? (
                  <span
                    className="flex items-center text-red-500 dark:text-red-400"
                    title="Auto-save failed. Changes are backed up locally."
                  >
                    <AlertCircle className="w-3 h-3 mr-1" /> Failed
                  </span>
                ) : saveStatus === 'conflict' ? (
                  <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                    <AlertCircle className="w-3 h-3" /> Conflict
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-xs"
                      onClick={() => window.location.reload()}
                    >
                      Reload
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-xs"
                      onClick={handleDuplicateRecovery}
                    >
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-xs"
                      onClick={handleExportSVG}
                    >
                      Export
                    </Button>
                  </div>
                ) : unsavedChanges ? (
                  <span className="text-yellow-600 dark:text-yellow-500 flex items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5" /> Unsaved
                  </span>
                ) : (
                  <span className="flex items-center text-stone-500 dark:text-stone-400">
                    <Cloud className="w-3 h-3 mr-1" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hidden items-center gap-1 rounded-xl border border-stone-200/80 bg-stone-100/65 p-1 shadow-sm shadow-stone-950/[0.04] dark:border-[#3b352f] dark:bg-black/15 dark:shadow-none sm:flex">
        {!hideProjectControls && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              className="text-stone-600 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-stone-50"
              disabled={isSaving}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>

            <div className="mx-1 h-6 w-px bg-stone-200 dark:bg-[#3b352f]" />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              title="Clear Canvas"
              className="text-stone-500 hover:bg-red-500/10 hover:text-red-600 dark:text-stone-400 dark:hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </Button>

            <div className="mx-1 h-6 w-px bg-stone-200 dark:bg-[#3b352f]" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isExporting || objects.length === 0}
                  title="Export drawing"
                  className="text-stone-600 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-stone-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>PNG Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExportPNG('1x', 'png')}>
                  <div className="flex items-center justify-between w-full">
                    <span>Standard Quality</span>
                    <span className="text-xs text-slate-500">1x</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPNG('2x', 'png')}>
                  <div className="flex items-center justify-between w-full">
                    <span>Retina Display</span>
                    <span className="text-xs text-slate-500">2x</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPNG('4x', 'png')}>
                  <div className="flex items-center justify-between w-full">
                    <span>Print Quality</span>
                    <span className="text-xs text-slate-500">4x</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>JPEG Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExportPNG('1x', 'jpeg')}>
                  <div className="flex items-center justify-between w-full">
                    <span>Smaller File Size</span>
                    <span className="text-xs text-slate-500">1x</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPNG('2x', 'jpeg')}>
                  <div className="flex items-center justify-between w-full">
                    <span>High Quality</span>
                    <span className="text-xs text-slate-500">2x</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Other Formats</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportSVG}>
                  <div className="flex items-center justify-between w-full">
                    <span>Vector (SVG)</span>
                    <span className="text-xs text-slate-500">Scalable</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportPNG('1x', 'webp')}>
                  <div className="flex items-center justify-between w-full">
                    <span>WebP</span>
                    <span className="text-xs text-slate-500">Modern</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="mx-1 h-6 w-px bg-stone-200 dark:bg-[#3b352f]" />

            {!isGuest &&
              (currentProject ? (
                <ProjectShareDialog
                  project={currentProject}
                  triggerClassName="h-9 w-9 text-stone-600 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-stone-50"
                />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-stone-400 dark:text-stone-600"
                  title="Save project first to share"
                  disabled
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              ))}
            <ShortcutsDialog mode="draw" />

            <div className="mx-1 h-6 w-px bg-stone-200 dark:bg-[#3b352f]" />
          </>
        )}

        {!isLoading && !isAuthenticated && clerk.loaded && (
          <>
            <SignInButton mode="modal">
              <Button
                variant="ghost"
                size="sm"
                className="text-stone-600 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-stone-50"
              >
                <User className="w-4 h-4 mr-2" />
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button
                size="sm"
                className="bg-amber-300 text-slate-950 hover:bg-amber-200 dark:bg-amber-300 dark:text-slate-950 dark:hover:bg-amber-200"
              >
                Sign Up
              </Button>
            </SignUpButton>
          </>
        )}

        <ConnectionStatus />
        <div className="mx-1 h-6 w-px bg-stone-200 dark:bg-[#3b352f]" />
        <SettingsDropdown />
      </div>
      <div className="flex items-center gap-1 sm:hidden">
        {!hideProjectControls && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSave}
              disabled={isSaving || projectRole === 'viewer'}
              title="Save drawing"
              aria-label="Save drawing"
            >
              <Save className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isExporting || objects.length === 0}
                  title="Export drawing"
                  aria-label="Export drawing"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExportPNG('1x', 'png')}>
                  PNG image
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportSVG}>SVG vector</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!isGuest && currentProject && (
              <ProjectShareDialog
                project={currentProject}
                triggerClassName="h-9 w-9 text-slate-600 dark:text-slate-300"
              />
            )}
          </>
        )}
        <ConnectionStatus />
        {!isLoading && !isAuthenticated && clerk.loaded && (
          <SignInButton mode="modal">
            <Button variant="ghost" size="icon" title="Sign in" aria-label="Sign in">
              <User className="h-4 w-4" />
            </Button>
          </SignInButton>
        )}
        <SettingsDropdown />
      </div>
    </div>
  );
}
