import { useEffect, useCallback, useState, useRef } from 'react';
import { useDrawingStore, type Tool } from '@/store/drawingStore';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { ColorPicker } from './ColorPicker';
import {
  Pen,
  Eraser,
  Minus,
  Square,
  Circle,
  Triangle,
  Star,
  Type,
  Palette,
  Hand,
  MousePointer2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  serializeProject,
  deserializeProject,
  saveEncryptedOffline,
  loadEncryptedOffline,
  listOfflineProjects,
} from '@/lib/utils';
import {
  createProject,
  updateProject,
  getProject,
  listProjects,
  type ProjectListItem,
} from '@/lib/api';
import { announceToScreenReader } from '@/hooks/useAccessibility';
import { FEATURES } from '@/config/features';

const tools = [
  { id: 'hand', icon: Hand, label: 'Hand', shortcut: 'H', ariaLabel: 'Pan tool (H)' },
  {
    id: 'select',
    icon: MousePointer2,
    label: 'Select',
    shortcut: 'V',
    ariaLabel: 'Select and move tool (V)',
  },
  { id: 'pen', icon: Pen, label: 'Pen', shortcut: 'P', ariaLabel: 'Pen tool (P)' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E', ariaLabel: 'Eraser tool (E)' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: 'L', ariaLabel: 'Line tool (L)' },
  {
    id: 'rectangle',
    icon: Square,
    label: 'Rectangle',
    shortcut: 'R',
    ariaLabel: 'Rectangle tool (R)',
  },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: 'O', ariaLabel: 'Ellipse tool (O)' },
  {
    id: 'triangle',
    icon: Triangle,
    label: 'Triangle',
    shortcut: 'T',
    ariaLabel: 'Triangle tool (T)',
  },
  { id: 'star', icon: Star, label: 'Star', shortcut: 'S', ariaLabel: 'Star tool (S)' },
  { id: 'text', icon: Type, label: 'Text', shortcut: 'X', ariaLabel: 'Text tool (X)' },
] as const;

import { useProjectPermissions } from '@/hooks/useProjectPermissions';

export function DrawingToolbar() {
  const { canDraw, role } = useProjectPermissions();
  const {
    currentTool,
    brushSize,
    brushOpacity,
    shapeFilled,
    triangleMode,
    autoShape,
    autoShapeThresholds,
    projectTitle,
    unsavedChanges,
    eraserMode,
    showToolbar,

    setTool,
    setEraserMode,
    setBrushSize,
    setBrushOpacity,
    setShapeFilled,
    setTriangleMode,
    setAutoShape,
    setAutoShapeThresholds,

    clearCanvas,
    toggleToolbar,
    setProjectTitle,
    markSaved,
    newProject,
  } = useDrawingStore();

  const safeT = {
    closureFactor: autoShapeThresholds?.closureFactor ?? 0.3,
    rectCornerMin: autoShapeThresholds?.rectCornerMin ?? 2,
    rectStraightRatio: autoShapeThresholds?.rectStraightRatio ?? 0.55,
    ellipseError: autoShapeThresholds?.ellipseError ?? 0.5,
    parabolaError: autoShapeThresholds?.parabolaError ?? 0.4,
    lineError: autoShapeThresholds?.lineError ?? 0.25,
    winnerMargin: autoShapeThresholds?.winnerMargin ?? 0.1,
    minSizePx: autoShapeThresholds?.minSizePx ?? 10,
    resampleStep: autoShapeThresholds?.resampleStep ?? 2,
    minParabolaCurvature: autoShapeThresholds?.minParabolaCurvature ?? 1.4,
  } as const;

  const { toast } = useToast();

  const handleClearCanvas = () => {
    const userConfirmed = window.confirm(
      'Are you sure you want to clear the canvas? This action cannot be undone.',
    );
    if (userConfirmed) {
      clearCanvas();
      toast({
        title: 'Canvas cleared',
        description: 'The canvas has been cleared and will be saved automatically.',
      });
    }
  };

  const handleSaveProject = useCallback(async () => {
    const state = useDrawingStore.getState();
    const payload = serializeProject(state.objects, 4096, 4096);
    try {
      let saved;
      if (state.currentProjectId) {
        saved = await updateProject(state.currentProjectId, state.projectTitle, payload);
      } else {
        saved = await createProject(state.projectTitle || 'Untitled', payload);
        useDrawingStore.getState().setCurrentProject(saved.id);
      }
      await saveEncryptedOffline(`project:${saved.id}`, saved);
      markSaved();
      toast({ title: 'Project saved', description: 'Saved to server.' });
    } catch (e) {
      console.warn('Server save failed, saving offline encrypted cache', e);
      if (state.currentProjectId) {
        await saveEncryptedOffline(`project:${state.currentProjectId}`, {
          id: state.currentProjectId,
          title: state.projectTitle,
          data: payload,
          updatedAt: Date.now(),
          createdAt: state.lastSavedAt ?? Date.now(),
        });
        toast({
          title: 'Saved offline',
          description: 'Will sync when online.',
          variant: 'default',
        });
        markSaved();
      } else {
        const tempId = `offline-${Date.now().toString(36)}`;
        useDrawingStore.getState().setCurrentProject(tempId);
        await saveEncryptedOffline(`project:${tempId}`, {
          id: tempId,
          title: state.projectTitle,
          data: payload,
          updatedAt: Date.now(),
          createdAt: Date.now(),
        });
        toast({
          title: 'Saved offline',
          description: 'Will create on server when online.',
          variant: 'default',
        });
        markSaved();
      }
    }
  }, [markSaved, toast]);

  const handleLoadProject = useCallback(async () => {
    if (unsavedChanges && !window.confirm('You have unsaved changes. Continue and discard them?'))
      return;
    const id = prompt('Enter Project ID');
    if (!id) return;
    try {
      const record = await getProject<ReturnType<typeof serializeProject>>(id);
      const objects = deserializeProject(record.data);
      const { setObjects, replaceHistory, requestFullRedraw } = useDrawingStore.getState();
      setObjects(objects);
      replaceHistory(objects);
      requestFullRedraw();
      setProjectTitle(record.title || 'Project');
      useDrawingStore.getState().setCurrentProject(record.id);
      markSaved();
      toast({ title: 'Project loaded', description: 'Loaded from server.' });
    } catch {
      console.warn('Server load failed, trying offline cache');
      const cached = await loadEncryptedOffline<
        import('@/lib/api').ProjectRecord<ReturnType<typeof serializeProject>>
      >(`project:${id}`);
      if (cached && cached.data) {
        const objects = deserializeProject(cached.data);
        const { setObjects, replaceHistory, requestFullRedraw } = useDrawingStore.getState();
        setObjects(objects);
        replaceHistory(objects);
        requestFullRedraw();
        setProjectTitle(cached.title || 'Offline Project');
        useDrawingStore.getState().setCurrentProject(cached.id);
        markSaved();
        toast({ title: 'Project loaded (offline)', description: 'Loaded from encrypted cache.' });
      } else {
        toast({
          title: 'Load failed',
          description: 'Not found on server or offline cache.',
          variant: 'destructive',
        });
      }
    }
  }, [unsavedChanges, toast, setProjectTitle, markSaved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        handleSaveProject();
      } else if ((e.ctrlKey || e.metaKey) && key === 'o') {
        e.preventDefault();
        handleLoadProject();
      } else if ((e.ctrlKey || e.metaKey) && key === 'n') {
        e.preventDefault();
        if (!unsavedChanges || window.confirm('Discard current project and create a new one?'))
          newProject();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unsavedChanges, handleSaveProject, handleLoadProject, newProject]);

  // Tool selection keyboard shortcuts
  useEffect(() => {
    const handleToolShortcut = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).contentEditable === 'true'
      ) {
        return;
      }

      // Don't trigger if modifier keys are pressed (except Shift for constraints)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key.toLowerCase();
      const toolMap: Record<string, Tool> = {
        h: 'hand',
        v: 'select',
        p: 'pen',
        e: 'eraser',
        l: 'line',
        r: 'rectangle',
        o: 'ellipse',
        t: 'triangle',
        s: 'star',
        x: 'text',
      };

      const tool = toolMap[key];
      if (tool && canDraw) {
        e.preventDefault();
        setTool(tool);
        announceToScreenReader(`${tool} tool selected`);
      }
    };

    window.addEventListener('keydown', handleToolShortcut);
    return () => window.removeEventListener('keydown', handleToolShortcut);
  }, [setTool, canDraw]);

  const [projectsModal, setProjectsModal] = useState(false);

  function ProjectMenu({
    unsaved,
    onSave,
    onNew,
    onClear,
  }: {
    unsaved: boolean;
    onSave: () => void;
    onNew: () => void;
    onClear: () => void;
  }) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      const onDocClick = (e: MouseEvent) => {
        if (!menuRef.current) return;
        if (!menuRef.current.contains(e.target as Node)) setOpen(false);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDocClick);
        document.removeEventListener('keydown', onKey);
      };
    }, []);

    return (
      <div className="relative" ref={menuRef}>
        <Button
          variant="glass"
          size="sm"
          title="Project actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'border border-transparent transition-[background-color,border-color,box-shadow] hover:border-slate-200 hover:bg-slate-100/80 dark:hover:border-white/10 dark:hover:bg-white/[0.08]',
            open &&
              'border-slate-200 bg-slate-100 text-slate-950 shadow-sm dark:border-white/10 dark:bg-white/[0.1] dark:text-white',
          )}
        >
          Project
        </Button>
        {open && (
          <div
            className="absolute right-0 mt-2 min-w-[220px] rounded-lg border border-slate-200/90 bg-slate-50/95 p-1.5 text-slate-900 shadow-xl shadow-slate-950/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:text-slate-100 dark:shadow-black/30 z-50"
            role="menu"
            aria-label="Project"
          >
            <button
              onClick={() => {
                onSave();
                setOpen(false);
              }}
              className="w-full rounded-md px-3 py-2 text-left text-slate-700 transition-colors hover:bg-white hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-45 dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white"
              role="menuitem"
              disabled={!unsaved}
              title={unsaved ? 'Save project (Ctrl/Cmd+S)' : 'No changes to save'}
            >
              Save
            </button>
            <button
              onClick={() => {
                setProjectsModal(true);
                setOpen(false);
              }}
              className="w-full rounded-md px-3 py-2 text-left text-slate-700 transition-colors hover:bg-white hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white"
              role="menuitem"
              title="Browse and load projects"
            >
              Browse…
            </button>
            <button
              onClick={() => {
                onNew();
                setOpen(false);
              }}
              className="w-full rounded-md px-3 py-2 text-left text-slate-700 transition-colors hover:bg-white hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white"
              role="menuitem"
              title="New project (Ctrl/Cmd+N)"
            >
              New
            </button>
            <div className="mx-1 my-1.5 h-px bg-slate-200/80 dark:bg-white/10" />
            <button
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="w-full rounded-md px-3 py-2 text-left text-red-600 transition-colors hover:bg-red-100/80 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-500/[0.14] dark:hover:text-red-200"
              role="menuitem"
              title="Clear canvas"
            >
              Clear Canvas
            </button>
          </div>
        )}
      </div>
    );
  }

  function ProjectsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<
      { id: string; title: string; source: 'server' | 'offline'; updatedAt: number }[]
    >([]);
    useEffect(() => {
      if (!open) return;
      let mounted = true;
      (async () => {
        const [server, offline] = await Promise.all([
          listProjects().catch(() => []),
          listOfflineProjects().catch(() => []),
        ]);
        if (!mounted) return;
        const merged = [
          ...server.map((s: ProjectListItem) => ({
            id: s.id,
            title: s.title,
            source: 'server' as const,
            updatedAt: s.updatedAt,
          })),
          ...offline.map((o: ProjectListItem) => ({
            id: o.id,
            title: `${o.title} (offline)`,
            source: 'offline' as const,
            updatedAt: o.updatedAt,
          })),
        ].sort((a, b) => b.updatedAt - a.updatedAt);
        setItems(merged);
      })();
      return () => {
        mounted = false;
      };
    }, [open]);

    const filtered = items.filter(
      (i) => i.title.toLowerCase().includes(query.toLowerCase()) || i.id.includes(query),
    );

    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Projects</div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
          <div className="p-4">
            <input
              className="w-full bg-slate-100 dark:bg-transparent border border-slate-300 dark:border-white/10 rounded px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="Search by title or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="mt-3 max-h-[55vh] overflow-auto">
              {filtered.length === 0 && (
                <div className="text-sm text-slate-500 dark:text-gray-400 px-2 py-8 text-center">
                  No projects found
                </div>
              )}
              {filtered.map((item) => (
                <button
                  key={`${item.source}:${item.id}`}
                  className="w-full text-left px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-sm"
                  onClick={async () => {
                    try {
                      if (
                        unsavedChanges &&
                        !window.confirm('Discard current changes and load this project?')
                      )
                        return;
                      if (item.source === 'server') {
                        const rec = await getProject<ReturnType<typeof serializeProject>>(item.id);
                        const objects = deserializeProject(rec.data);
                        const { setObjects, replaceHistory, requestFullRedraw } =
                          useDrawingStore.getState();
                        setObjects(objects);
                        replaceHistory(objects);
                        requestFullRedraw();
                        setProjectTitle(rec.title || 'Project');
                        useDrawingStore.getState().setCurrentProject(rec.id);
                        markSaved();
                        toast({ title: 'Project loaded', description: 'Loaded from server.' });
                      } else {
                        const cached = await loadEncryptedOffline<
                          import('@/lib/api').ProjectRecord<ReturnType<typeof serializeProject>>
                        >(`project:${item.id}`);
                        if (cached && cached.data) {
                          const objects = deserializeProject(cached.data);
                          const { setObjects, replaceHistory, requestFullRedraw } =
                            useDrawingStore.getState();
                          setObjects(objects);
                          replaceHistory(objects);
                          requestFullRedraw();
                          setProjectTitle(cached.title || 'Offline Project');
                          useDrawingStore.getState().setCurrentProject(cached.id);
                          markSaved();
                          toast({
                            title: 'Project loaded (offline)',
                            description: 'Loaded from encrypted cache.',
                          });
                        }
                      }
                      onClose();
                    } catch {
                      toast({
                        title: 'Load failed',
                        description: 'Could not load project.',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-gray-400">
                        {item.source === 'server' ? 'Server' : 'Offline encrypted'} • {item.id}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-gray-400">
                      {new Date(item.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!showToolbar) {
    return (
      <Button
        onClick={toggleToolbar}
        variant="glass"
        size="icon"
        className="fixed top-20 left-4 z-40"
        data-toolbar="true"
      >
        <Palette className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <div
      className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 p-4 animate-fade-in relative z-40 transition-colors duration-200"
      data-toolbar="true"
    >
      <div className="flex flex-wrap items-center gap-4 max-w-7xl mx-auto">
        {/* Tool Selection */}
        <div
          className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-white/10"
          role="toolbar"
          aria-label="Drawing tools"
        >
          {tools.map(({ id, icon: Icon, label, shortcut, ariaLabel }) => (
            <Button
              key={id}
              onClick={() => {
                setTool(id as Tool);
                announceToScreenReader(`${label} tool selected`);
              }}
              variant={currentTool === id ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'transition-[background-color,color,box-shadow,transform] duration-150 focus-visible-ring',
                currentTool === id && 'bg-blue-600 hover:bg-blue-700',
              )}
              title={`${label} (${shortcut})`}
              aria-label={ariaLabel}
              aria-pressed={currentTool === id}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:inline ml-2">{label}</span>
              <span className="sr-only">Keyboard shortcut: {shortcut}</span>
            </Button>
          ))}
        </div>

        {/* Shape constraint hint */}
        {['rectangle', 'ellipse'].includes(currentTool) && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
            <span>
              💡 Hold Shift for perfect {currentTool === 'ellipse' ? 'circles' : 'squares'}
            </span>
          </div>
        )}
        {currentTool === 'triangle' && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
            <span>
              💡{' '}
              {triangleMode === 'custom'
                ? 'Click three times to place triangle vertices'
                : 'Click and drag to draw triangle'}
            </span>
          </div>
        )}

        {/* Triangle Mode Selector */}
        {currentTool === 'triangle' && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-gray-300 min-w-[80px]">
              Triangle Type:
            </label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-white/10">
              <Button
                onClick={() => setTriangleMode('custom')}
                variant={triangleMode === 'custom' ? 'default' : 'ghost'}
                size="sm"
                title="Free-form triangle (click 3 points)"
              >
                Custom
              </Button>
              <Button
                onClick={() => setTriangleMode('right')}
                variant={triangleMode === 'right' ? 'default' : 'ghost'}
                size="sm"
                title="Right triangle (90°)"
              >
                Right
              </Button>
              <Button
                onClick={() => setTriangleMode('45-45-90')}
                variant={triangleMode === '45-45-90' ? 'default' : 'ghost'}
                size="sm"
                title="45-45-90 triangle"
              >
                45-45-90
              </Button>
              <Button
                onClick={() => setTriangleMode('30-60-90')}
                variant={triangleMode === '30-60-90' ? 'default' : 'ghost'}
                size="sm"
                title="30-60-90 triangle"
              >
                30-60-90
              </Button>
            </div>
          </div>
        )}

        {/* Brush Settings */}
        <div className="flex items-center gap-4">
          {currentTool === 'eraser' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-gray-300 min-w-[60px]">
                Eraser:
              </label>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-white/10">
                <Button
                  onClick={() => setEraserMode('partial')}
                  variant={eraserMode === 'partial' ? 'default' : 'ghost'}
                  size="sm"
                >
                  Partial
                </Button>
                <Button
                  onClick={() => setEraserMode('object')}
                  variant={eraserMode === 'object' ? 'default' : 'ghost'}
                  size="sm"
                >
                  Object
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-gray-300 min-w-[40px]">
              Size:
            </label>
            <Slider
              value={[brushSize]}
              onValueChange={([value]) => setBrushSize(value)}
              min={1}
              max={100}
              step={1}
              className="w-24"
            />
            <span className="text-sm font-mono text-slate-500 dark:text-gray-400 min-w-[40px]">
              {brushSize}px
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-gray-300 min-w-[60px]">
              Opacity:
            </label>
            <Slider
              value={[brushOpacity * 100]}
              onValueChange={([value]) => setBrushOpacity(value / 100)}
              min={10}
              max={100}
              step={1}
              className="w-24"
            />
            <span className="text-sm font-mono text-slate-500 dark:text-gray-400 min-w-[40px]">
              {Math.round(brushOpacity * 100)}%
            </span>
          </div>
        </div>

        {/* Color Picker */}
        <ColorPicker />

        {/* Fill toggle for shapes */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700 dark:text-gray-300 min-w-[36px]">
            Fill:
          </label>
          <Button
            onClick={() => setShapeFilled(!shapeFilled)}
            variant={shapeFilled ? 'default' : 'ghost'}
            size="sm"
            title={shapeFilled ? 'Filled shapes' : 'Outlined shapes'}
          >
            {shapeFilled ? 'On' : 'Off'}
          </Button>
        </div>

        {/* Auto Shape toggle + settings - Hidden when feature is disabled */}
        {FEATURES.AUTO_SHAPE && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-gray-300 min-w-[36px]">
              Auto Shape:
            </label>
            <Button
              onClick={() => setAutoShape(!autoShape)}
              variant={autoShape ? 'default' : 'ghost'}
              size="sm"
              title={autoShape ? 'Auto-convert closed pen loops' : 'Draw normal strokes'}
            >
              {autoShape ? 'On' : 'Off'}
            </Button>
            <details className="ml-1">
              <summary className="cursor-pointer text-xs text-slate-500 dark:text-gray-400">
                Settings
              </summary>
              <div className="mt-2 p-2 bg-white dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-md shadow-lg space-y-2 w-[260px]">
                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Closure tolerance ({(safeT.closureFactor * 100).toFixed(0)}% diag)
                </div>
                <Slider
                  value={[Math.round(safeT.closureFactor * 100)]}
                  onValueChange={([v]) => setAutoShapeThresholds({ closureFactor: v / 100 })}
                  min={5}
                  max={60}
                  step={1}
                />

                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Rectangle straight ratio ({Math.round(safeT.rectStraightRatio * 100)}%)
                </div>
                <Slider
                  value={[Math.round(safeT.rectStraightRatio * 100)]}
                  onValueChange={([v]) => setAutoShapeThresholds({ rectStraightRatio: v / 100 })}
                  min={30}
                  max={90}
                  step={1}
                />

                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Rectangle corners (≥{safeT.rectCornerMin})
                </div>
                <Slider
                  value={[safeT.rectCornerMin]}
                  onValueChange={([v]) => setAutoShapeThresholds({ rectCornerMin: v })}
                  min={1}
                  max={4}
                  step={1}
                />

                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Ellipse error (≤{Math.round(safeT.ellipseError * 100)}%)
                </div>
                <Slider
                  value={[Math.round(safeT.ellipseError * 100)]}
                  onValueChange={([v]) => setAutoShapeThresholds({ ellipseError: v / 100 })}
                  min={10}
                  max={90}
                  step={1}
                />

                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Parabola error (≤{Math.round(safeT.parabolaError * 100)}%)
                </div>
                <Slider
                  value={[Math.round(safeT.parabolaError * 100)]}
                  onValueChange={([v]) => setAutoShapeThresholds({ parabolaError: v / 100 })}
                  min={10}
                  max={90}
                  step={1}
                />

                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Line error (≤{Math.round(safeT.lineError * 100)}%)
                </div>
                <Slider
                  value={[Math.round(safeT.lineError * 100)]}
                  onValueChange={([v]) => setAutoShapeThresholds({ lineError: v / 100 })}
                  min={5}
                  max={60}
                  step={1}
                />
                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Winner margin (≥{Math.round(safeT.winnerMargin * 100)}%)
                </div>
                <Slider
                  value={[Math.round(safeT.winnerMargin * 100)]}
                  onValueChange={([v]) => setAutoShapeThresholds({ winnerMargin: v / 100 })}
                  min={0}
                  max={30}
                  step={1}
                />

                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Min size (≥{safeT.minSizePx}px)
                </div>
                <Slider
                  value={[safeT.minSizePx]}
                  onValueChange={([v]) => setAutoShapeThresholds({ minSizePx: v })}
                  min={6}
                  max={40}
                  step={1}
                />

                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Resample step ({safeT.resampleStep}px)
                </div>
                <Slider
                  value={[safeT.resampleStep]}
                  onValueChange={([v]) => setAutoShapeThresholds({ resampleStep: v })}
                  min={1}
                  max={8}
                  step={1}
                />

                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Parabola curvature (≥{safeT.minParabolaCurvature.toFixed(2)} rad)
                </div>
                <Slider
                  value={[Math.round(safeT.minParabolaCurvature * 100)]}
                  onValueChange={([v]) => setAutoShapeThresholds({ minParabolaCurvature: v / 100 })}
                  min={50}
                  max={300}
                  step={5}
                />
              </div>
            </details>
          </div>
        )}

        {/* Divider */}
        <div className="h-8 w-px bg-slate-200 dark:bg-white/20" />

        {/* Project Title, Status, and Actions Menu */}
        <div className="flex items-center gap-2 relative">
          <input
            className="bg-slate-100 dark:bg-transparent border border-slate-300 dark:border-white/10 rounded px-2 py-1 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="Untitled"
            title="Project title"
            aria-label="Project title"
          />
          {!canDraw && role === 'viewer' && (
            <span
              className="flex items-center gap-1 px-2 py-1 rounded bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 font-semibold"
              aria-label="View only mode"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              View Only
            </span>
          )}
          {unsavedChanges && (
            <span
              className="text-xs text-yellow-600 dark:text-yellow-400"
              aria-live="polite"
              aria-label="Unsaved changes"
            >
              ● Unsaved
            </span>
          )}

          <ProjectMenu
            unsaved={unsavedChanges}
            onSave={handleSaveProject}
            onNew={() => {
              if (
                !unsavedChanges ||
                window.confirm('Discard current project and create a new one?')
              )
                newProject();
            }}
            onClear={handleClearCanvas}
          />
        </div>

        {/* Mobile Toggle */}
        <Button onClick={toggleToolbar} variant="ghost" size="sm" className="md:hidden ml-auto">
          Hide
        </Button>
      </div>
      <ProjectsModal open={projectsModal} onClose={() => setProjectsModal(false)} />
    </div>
  );
}
