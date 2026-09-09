import { useCallback, useState } from 'react';
import { useDrawingStore, type Tool } from '@/store/drawingStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pen, ChevronDown, SlidersHorizontal, Undo2, Redo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobilePropertiesDrawer } from './MobilePropertiesDrawer';
import { useAuth } from '@clerk/clerk-react';
import { useToast } from '@/hooks/use-toast';
import { ProjectWriteResetError } from '@/lib/projectWriteCoordinator';
import { saveActiveProject } from '@/lib/saveActiveProject';
import { quickTools, tools } from './mobileToolbarTools';

export function MobileToolbar() {
  const {
    currentTool,
    setTool,
    clearCanvas,
    undo,
    redo,
    canUndo,
    canRedo,
    projectRole,
    unsavedChanges,
    newProject,
    brushColor,
    brushSize,
    setBrushColor,
    setBrushSize,
  } = useDrawingStore();
  const { isGuest } = useAuthStore();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleSave = useCallback(async () => {
    if (projectRole === 'viewer') return;
    try {
      const result = await saveActiveProject({
        cloud: !isGuest,
        tokenProvider: isGuest ? undefined : getToken,
      });
      if (result !== 'saved') return;
      toast({ title: isGuest ? 'Saved locally' : 'Saved to cloud' });
    } catch (error) {
      if (error instanceof ProjectWriteResetError) return;
      console.error('Save failed', error);
      toast({
        title: 'Save failed',
        description: isGuest ? 'Could not save locally.' : 'Could not save to cloud.',
        variant: 'destructive',
      });
    }
  }, [getToken, isGuest, projectRole, toast]);

  // Find current tool icon
  const CurrentIcon = tools.find((t) => t.id === currentTool)?.icon || Pen;

  const handleToolClick = (id: Tool) => {
    if (id === 'image') {
      // For image tool, trigger the file input in DrawingCanvas
      document.querySelector<HTMLInputElement>('#image-upload-input')?.click();
    } else {
      setTool(id);
    }
    setIsExpanded(false);
  };

  const handleDrawerAction = (action: string) => {
    if (action === 'clear') {
      if (window.confirm('Clear canvas?')) {
        clearCanvas();
        setIsDrawerOpen(false);
      }
    } else if (action === 'save') {
      void handleSave();
      setIsDrawerOpen(false);
    } else if (action === 'open') {
      if (
        !unsavedChanges ||
        window.confirm('Open your projects? Unsaved changes in this drawing will be discarded.')
      ) {
        newProject();
        setIsDrawerOpen(false);
      }
    }
  };

  return (
    <>
      {isExpanded && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 hidden w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap justify-center gap-2 rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 sm:flex lg:hidden">
          {tools.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              onClick={() => handleToolClick(id)}
              variant={currentTool === id ? 'default' : 'ghost'}
              size="icon"
              className={cn(
                'h-11 w-11 rounded-xl',
                currentTool === id && 'bg-amber-300 text-stone-950',
              )}
              title={label}
              aria-label={label}
              aria-pressed={currentTool === id}
            >
              <Icon className="h-5 w-5" />
            </Button>
          ))}
        </div>
      )}
      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 hidden -translate-x-1/2 items-center gap-2 rounded-2xl border border-stone-200 bg-white/95 p-2 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 sm:flex lg:hidden">
        {quickTools.map(({ id, icon: Icon, label }) => (
          <Button
            key={id}
            onClick={() => setTool(id)}
            variant={currentTool === id ? 'default' : 'ghost'}
            size="icon"
            className={cn(
              'h-11 w-11 rounded-xl',
              currentTool === id && 'bg-amber-300 text-stone-950',
            )}
            aria-label={label}
            aria-pressed={currentTool === id}
            title={label}
          >
            <Icon className="h-5 w-5" />
          </Button>
        ))}
        <label className="flex h-11 items-center gap-2 border-l border-stone-200 px-2 dark:border-white/10">
          <span className="sr-only">Active color</span>
          <input
            type="color"
            value={brushColor}
            onChange={(event) => setBrushColor(event.target.value)}
            className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
            aria-label="Active color"
          />
        </label>
        <label className="flex h-11 items-center gap-2 border-l border-stone-200 px-2 dark:border-white/10">
          <span className="sr-only">Active size</span>
          <input
            type="range"
            min={1}
            max={100}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            className="w-24 accent-amber-500"
            aria-label={`Active size ${brushSize}px`}
          />
          <span className="w-9 text-right font-mono text-xs text-stone-500">{brushSize}</span>
        </label>
        <Button
          onClick={() => setIsExpanded((expanded) => !expanded)}
          size="icon"
          variant={isExpanded ? 'default' : 'ghost'}
          className="h-11 w-11 rounded-xl"
          aria-label="More tools"
          aria-expanded={isExpanded}
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
        <Button
          onClick={() => setIsDrawerOpen(true)}
          size="icon"
          variant="ghost"
          className="h-11 w-11 rounded-xl"
          aria-label="Open properties"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </Button>
        <Button
          onClick={undo}
          disabled={!canUndo}
          size="icon"
          variant="ghost"
          className="h-11 w-11 rounded-xl"
          aria-label="Undo"
        >
          <Undo2 className="h-5 w-5" />
        </Button>
        <Button
          onClick={redo}
          disabled={!canRedo}
          size="icon"
          variant="ghost"
          className="h-11 w-11 rounded-xl"
          aria-label="Redo"
        >
          <Redo2 className="h-5 w-5" />
        </Button>
      </div>

      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-end gap-3 sm:hidden">
        {/* Properties Toggle */}
        <Button
          onClick={() => setIsDrawerOpen(true)}
          className="h-12 w-12 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-lg border border-slate-200 dark:border-slate-700"
          size="icon"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </Button>

        {/* Undo/Redo */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={undo}
            disabled={!canUndo}
            className="h-10 w-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-lg border border-slate-200 dark:border-slate-700"
            size="icon"
          >
            <Undo2 className="w-5 h-5" />
          </Button>
          <Button
            onClick={redo}
            disabled={!canRedo}
            className="h-10 w-10 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-lg border border-slate-200 dark:border-slate-700"
            size="icon"
          >
            <Redo2 className="w-5 h-5" />
          </Button>
        </div>

        {/* Properties Toggle */}
        <div className="relative">
          {isExpanded ? (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 mb-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 p-2 animate-in fade-in slide-in-from-bottom-2 duration-200 w-[280px]">
              <div className="flex items-center gap-1 flex-wrap justify-center">
                {tools.map(({ id, icon: Icon, label }) => (
                  <Button
                    key={id}
                    onClick={() => handleToolClick(id)}
                    variant={currentTool === id ? 'default' : 'ghost'}
                    size="icon"
                    className={cn(
                      'w-10 h-10 rounded-xl transition-[background-color,color,box-shadow,transform] duration-150',
                      currentTool === id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 dark:text-slate-400',
                    )}
                    title={label}
                    aria-label={label}
                  >
                    <Icon className="w-5 h-5" />
                  </Button>
                ))}
              </div>
              <Button
                onClick={() => setIsExpanded(false)}
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-slate-400 hover:text-slate-600"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
          ) : null}

          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30"
          >
            <CurrentIcon className="w-6 h-6" />
          </Button>
        </div>
      </div>

      <MobilePropertiesDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onAction={handleDrawerAction}
      />
    </>
  );
}
