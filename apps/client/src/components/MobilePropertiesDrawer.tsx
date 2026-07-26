import { useDrawingStore } from '@/store/drawingStore';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Palette, Layers, Settings, Moon, Sun, Trash2, FolderOpen, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FEATURES } from '@/config/features';
import { LayerStack } from '@/components/LayerStack';
import { SelectionInspector } from '@/components/SelectionInspector';
import {
  Drawer,
  DrawerContent,
  DrawerClose,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const COLORS = [
  '#000000',
  '#ffffff',
  '#e11d48',
  '#d97706',
  '#16a34a',
  '#2563eb',
  '#7c3aed',
  // Custom palette
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
];

interface MobilePropertiesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction?: (action: string) => void;
}

export function MobilePropertiesDrawer({
  open,
  onOpenChange,
  onAction,
}: MobilePropertiesDrawerProps) {
  const {
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    textFontSize,
    setTextFontSize,
    brushOpacity,
    setBrushOpacity,
    currentTool,
    eraserMode,
    setEraserMode,
    shapeFilled,
    setShapeFilled,
    triangleMode,
    setTriangleMode,
    starPoints,
    setStarPoints,
    autoShape,
    setAutoShape,
    projectTitle,
    setProjectTitle,
    saveStatus,
  } = useDrawingStore();
  const { theme, toggleTheme } = useTheme();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>Tools & Properties</DrawerTitle>
        </DrawerHeader>

        <div className="p-4 pb-0">
          <Tabs defaultValue="brush" className="w-full">
            <TabsList className="w-full grid grid-cols-3 mb-6">
              <TabsTrigger value="brush">
                <Palette className="w-4 h-4 mr-2" />
                Brush
              </TabsTrigger>
              <TabsTrigger value="layers">
                <Layers className="w-4 h-4 mr-2" />
                Layers
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="w-4 h-4 mr-2" />
                App
              </TabsTrigger>
            </TabsList>

            <TabsContent value="brush" className="space-y-6">
              {/* Color Picker */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Color
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 transition-transform',
                        brushColor === color
                          ? 'border-amber-400 scale-110 shadow-sm shadow-amber-500/30'
                          : 'border-transparent hover:scale-105',
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setBrushColor(color)}
                    />
                  ))}
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-slate-200 dark:border-slate-700">
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 p-0 border-0 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Size Slider */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {currentTool === 'text' ? 'Font size' : 'Size'}
                  </label>
                  <label className="flex h-9 items-center rounded-md border border-stone-300 bg-white pl-2 text-sm dark:border-white/[0.1] dark:bg-stone-950/30">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={currentTool === 'text' ? 12 : 1}
                      max={currentTool === 'text' ? 240 : 100}
                      value={currentTool === 'text' ? textFontSize : brushSize}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (!Number.isFinite(value)) return;
                        if (currentTool === 'text') setTextFontSize(value);
                        else setBrushSize(value);
                      }}
                      className="w-12 bg-transparent text-right font-mono tabular-nums text-stone-700 outline-none dark:text-stone-200"
                      aria-label={
                        currentTool === 'text' ? 'Text font size in pixels' : 'Brush size in pixels'
                      }
                    />
                    <span className="px-2 font-mono text-xs text-stone-500">px</span>
                  </label>
                </div>
                <Slider
                  value={[currentTool === 'text' ? textFontSize : brushSize]}
                  min={currentTool === 'text' ? 12 : 1}
                  max={currentTool === 'text' ? 240 : 100}
                  step={1}
                  onValueChange={([value]) => {
                    if (currentTool === 'text') setTextFontSize(value);
                    else setBrushSize(value);
                  }}
                />
              </div>

              {/* Opacity Slider */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Opacity
                  </label>
                  <span className="text-xs text-slate-400">{Math.round(brushOpacity * 100)}%</span>
                </div>
                <Slider
                  value={[brushOpacity]}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onValueChange={([val]) => setBrushOpacity(val)}
                />
              </div>

              {currentTool === 'eraser' && (
                <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Eraser mode
                    </span>
                    <span className="text-xs text-slate-400">
                      {eraserMode === 'partial' ? 'Standard' : 'Object'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={eraserMode === 'partial' ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => setEraserMode('partial')}
                    >
                      Standard
                    </Button>
                    <Button
                      variant={eraserMode === 'object' ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => setEraserMode('object')}
                    >
                      Object
                    </Button>
                  </div>
                </div>
              )}

              {FEATURES.AUTO_SHAPE && currentTool === 'pen' && (
                <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                        Auto-shape
                        <span className="rounded-full border border-amber-300/80 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-800 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-200">
                          Beta
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">
                        Turn deliberate pen shapes into clean geometry.
                      </p>
                    </div>
                    <Button
                      variant={autoShape ? 'default' : 'secondary'}
                      size="sm"
                      aria-pressed={autoShape}
                      onClick={() => setAutoShape(!autoShape)}
                    >
                      {autoShape ? 'On' : 'Off'}
                    </Button>
                  </div>
                </div>
              )}

              {currentTool === 'triangle' && (
                <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Triangle type
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['custom', 'right', '45-45-90', '30-60-90'] as const).map((mode) => (
                      <Button
                        key={mode}
                        variant={triangleMode === mode ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setTriangleMode(mode)}
                      >
                        {mode === 'custom' ? 'Custom' : mode === 'right' ? 'Right' : mode}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {currentTool === 'star' && (
                <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Star points
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {([5, 6, 8] as const).map((points) => (
                      <Button
                        key={points}
                        variant={starPoints === points ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => setStarPoints(points)}
                      >
                        {points}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {(['rectangle', 'ellipse', 'triangle', 'star'] as string[]).includes(currentTool) && (
                <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-white/10">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Fill shape
                  </span>
                  <Button
                    variant={shapeFilled ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setShapeFilled(!shapeFilled)}
                  >
                    {shapeFilled ? 'On' : 'Off'}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="layers" className="h-[300px] overflow-y-auto pr-1">
              <SelectionInspector />
              <LayerStack />
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="mobile-project-title"
                  className="text-sm font-medium text-slate-600 dark:text-slate-300"
                >
                  Project title
                </label>
                <input
                  id="mobile-project-title"
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  placeholder="Untitled project"
                  className="h-10 w-full rounded-md border border-stone-200 bg-stone-50 px-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20 dark:border-white/[0.08] dark:bg-stone-950 dark:text-stone-100"
                />
                <p className="text-xs text-slate-400">
                  {saveStatus === 'failed'
                    ? 'Saving failed — your local changes are still available.'
                    : saveStatus === 'conflict'
                      ? 'This project has a save conflict. Open it on desktop to resolve it.'
                      : saveStatus === 'syncing'
                        ? 'Saving changes…'
                        : 'Changes save automatically.'}
                </p>
              </div>

              <Button variant="outline" className="w-full justify-between" onClick={toggleTheme}>
                <span className="flex items-center">
                  {theme === 'dark' ? (
                    <Moon className="w-4 h-4 mr-2" />
                  ) : (
                    <Sun className="w-4 h-4 mr-2" />
                  )}
                  Theme
                </span>
                <span className="text-xs text-slate-500 capitalize">{theme}</span>
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => onAction && onAction('save')}>
                  <Download className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="secondary" onClick={() => onAction && onAction('open')}>
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Open
                </Button>
              </div>

              <Button
                variant="destructive"
                className="w-full"
                onClick={() => onAction && onAction('clear')}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Canvas
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
