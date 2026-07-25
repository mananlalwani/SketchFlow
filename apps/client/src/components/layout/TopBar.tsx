import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Save, Trash2, Cloud, Loader2, Share2, Download, AlertCircle } from 'lucide-react';
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
    <div className="relative z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-3 backdrop-blur-md transition-colors duration-200 dark:border-white/10 dark:bg-slate-900/80 sm:px-4">
      <div className="flex min-w-0 items-center gap-4">
        <div
          className="font-bold text-xl text-blue-600 dark:text-blue-400 cursor-pointer"
          onClick={goToHome}
        >
          SketchFlow
        </div>

        {!hideProjectControls && (
          <div className="hidden items-center sm:flex">
            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />

            <div className="flex items-center gap-2 group">
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-white/10 focus:border-blue-500 rounded px-2 py-1 text-sm transition-colors outline-none min-w-[150px] text-slate-900 dark:text-slate-100"
                placeholder="Untitled Project"
              />
              <div className="flex items-center gap-2 text-xs">
                {isSaving || saveStatus === 'syncing' ? (
                  <span className="flex items-center text-blue-500 dark:text-blue-400">
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
                  <span className="text-slate-500 flex items-center">
                    <Cloud className="w-3 h-3 mr-1" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hidden items-center gap-2 sm:flex">
        {!hideProjectControls && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              disabled={isSaving}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>

            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              title="Clear Canvas"
              className="text-slate-600 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>

            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isExporting || objects.length === 0}
                  title="Export drawing"
                  className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
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

            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />

            {!isGuest &&
              (currentProject ? (
                <ProjectShareDialog
                  project={currentProject}
                  triggerClassName="h-9 w-9 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
                />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-slate-400 dark:text-slate-500"
                  title="Save project first to share"
                  disabled
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              ))}
            <ShortcutsDialog mode="draw" />

            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
          </>
        )}

        {!isLoading && !isAuthenticated && clerk.loaded && (
          <>
            <SignInButton mode="modal">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                <User className="w-4 h-4 mr-2" />
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                Sign Up
              </Button>
            </SignUpButton>
          </>
        )}

        <ConnectionStatus />
        <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
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
