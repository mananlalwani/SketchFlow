import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useDrawingSocket } from '@/hooks/useSocket';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { 
  Save, 
  FolderOpen, 
  FilePlus, 
  Trash2,
  Cloud,
  Loader2,
  Share2,
  Download,
  Image,
  FileCode
} from 'lucide-react';
import { 
  serializeProject
} from '@/lib/utils';
import { exportAsPNG, exportAsSVG, downloadFile } from '@/lib/export';
import { 
  createProject, 
  updateProject, 
} from '@/lib/api';
import { FloatingAuthButton } from '@/components/AuthButton';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { ProjectShareDialog } from '@/components/ProjectShareDialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useAuth } from '@clerk/clerk-react';

export function TopBar({ hideProjectControls }: { hideProjectControls?: boolean }) {
  const {
    projectTitle,
    setProjectTitle,
    unsavedChanges,
    markSaved,
    newProject,
    clearCanvas,
    objects,
    currentProjectId,
    setCurrentProject,
    lastSavedAt
  } = useDrawingStore();

  const { emitClear } = useDrawingSocket();
  const { toast } = useToast();
  const { getToken, userId } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Create a project-like object for the share dialog
  const currentProject = useMemo(() => {
    if (!currentProjectId || currentProjectId.startsWith('offline-')) return null;
    return {
      id: currentProjectId,
      userId: userId || '',
      title: projectTitle || 'Untitled',
      createdAt: Date.now(),
      updatedAt: lastSavedAt || Date.now(),
      shared: false,
      role: 'owner' as const
    };
  }, [currentProjectId, userId, projectTitle, lastSavedAt]);

  const handleSave = useCallback(async () => {
    if (!userId) {
        const tempId = currentProjectId || `offline-${Date.now().toString(36)}`;
        if (!currentProjectId) setCurrentProject(tempId);
        
        const payload = serializeProject(objects, 4096, 4096);
        localStorage.setItem('local_work', JSON.stringify({
             title: projectTitle,
             data: payload,
             updatedAt: Date.now()
        }));
        
        markSaved();
        toast({ title: 'Saved locally', description: 'Sign in to save to cloud.' });
        return;
    }

    setIsSaving(true);
    const payload = serializeProject(objects, 4096, 4096);
    try {
      const token = await getToken();
      let saved;
      if (currentProjectId && !currentProjectId.startsWith('offline-')) {
        saved = await updateProject(currentProjectId, projectTitle, payload, token);
      } else {
        saved = await createProject(projectTitle || 'Untitled', payload, token);
        setCurrentProject(saved.id);
      }
      markSaved();
      toast({ title: 'Saved to cloud' });
    } catch (e) {
      console.error('Save failed', e);
      toast({ title: 'Save failed', description: 'Could not save to cloud.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [objects, currentProjectId, projectTitle, setCurrentProject, markSaved, toast, userId, getToken]);

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear the canvas?')) {
      clearCanvas();
      emitClear();
      toast({ title: 'Canvas cleared' });
    }
  };

  const handleNew = () => {
    if (!unsavedChanges || window.confirm('Discard changes?')) {
      newProject();
    }
  };

  const goToProjects = useCallback(() => {
    setCurrentProject(undefined);
    clearCanvas();
  }, [setCurrentProject, clearCanvas]);

  const handleExportPNG = useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await exportAsPNG(objects, { scale: 1 });
      const filename = `${projectTitle || 'drawing'}.png`;
      downloadFile(blob, filename);
      toast({ title: 'Exported PNG', description: filename });
    } catch (e) {
      console.error('Export failed', e);
      toast({ title: 'Export failed', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [objects, projectTitle, toast]);

  const handleExportSVG = useCallback(() => {
    try {
      const svg = exportAsSVG(objects);
      const filename = `${projectTitle || 'drawing'}.svg`;
      downloadFile(svg, filename, 'image/svg+xml');
      toast({ title: 'Exported SVG', description: filename });
    } catch (e) {
      console.error('Export failed', e);
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  }, [objects, projectTitle, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && key === 'o') {
        e.preventDefault();
        goToProjects();
      } else if ((e.ctrlKey || e.metaKey) && key === 'n') {
        e.preventDefault();
        handleNew();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave, handleNew, goToProjects]);

  return (
    <div className="h-14 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center px-4 justify-between z-30 relative transition-colors duration-200">
      <div className="flex items-center gap-4">
        <div className="font-bold text-xl bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 bg-clip-text text-transparent cursor-pointer" onClick={goToProjects}>
          DrawApp
        </div>
        
        {!hideProjectControls && (
          <>
            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
            
            <div className="flex items-center gap-2 group">
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-white/10 focus:border-blue-500 rounded px-2 py-1 text-sm transition-colors outline-none min-w-[150px] text-slate-900 dark:text-slate-100"
                placeholder="Untitled Project"
              />
              <div className="flex items-center gap-2 text-xs">
                {isSaving ? (
                    <span className="flex items-center text-blue-500 dark:text-blue-400"><Loader2 className="w-3 h-3 animate-spin mr-1"/> Saving...</span>
                ) : unsavedChanges ? (
                    <span className="text-yellow-600 dark:text-yellow-500 flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5" /> Unsaved</span>
                ) : (
                    <span className="text-slate-500 flex items-center"><Cloud className="w-3 h-3 mr-1" /> Saved</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!hideProjectControls && (
          <>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              onClick={goToProjects}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Projects
            </Button>

            <Button variant="ghost" size="sm" onClick={handleSave} className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            
            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
            
            <Button variant="ghost" size="icon" onClick={handleNew} title="New Project" className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
              <FilePlus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClear} title="Clear Canvas" className="text-slate-600 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
            </Button>

            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleExportPNG} 
              disabled={isExporting || objects.length === 0}
              title="Export as PNG"
              className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              <Image className="w-4 h-4 mr-2" />
              PNG
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleExportSVG}
              disabled={objects.length === 0}
              title="Export as SVG"
              className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              <FileCode className="w-4 h-4 mr-2" />
              SVG
            </Button>

            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />

            {currentProject ? (
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
            )}
            <ShortcutsDialog mode="draw" />
            
            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
          </>
        )}
        
        <ConnectionStatus />
        <div className="h-6 w-px bg-slate-200 dark:bg-white/10" />
        <ThemeToggle className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" />
        <FloatingAuthButton />
      </div>
    </div>
  );
}
