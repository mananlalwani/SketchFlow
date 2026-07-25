import { useState } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Palette,
  Layers,
  Settings,
  Moon,
  Sun,
  Trash2,
  FolderOpen,
  Download,
  ChevronDown,
  ChevronUp,
  Type,
  PenLine,
  Shapes,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

function layerLabel(object: { type: string; text?: string }) {
  if (object.type === 'stroke') return 'Stroke';
  if (object.type === 'text') return object.text?.trim().slice(0, 24) || 'Text';
  return object.type.charAt(0).toUpperCase() + object.type.slice(1);
}

function LayerGlyph({ type }: { type: string }) {
  if (type === 'stroke') return <PenLine className="h-4 w-4" />;
  if (type === 'text') return <Type className="h-4 w-4" />;
  return <Shapes className="h-4 w-4" />;
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
    brushOpacity,
    setBrushOpacity,
    objects,
    setObjects,
    removeObject,
    saveHistory,
    requestFullRedraw,
  } = useDrawingStore();
  const { theme, toggleTheme } = useTheme();
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  const moveLayer = (id: string, direction: -1 | 1) => {
    const index = objects.findIndex((object) => object.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= objects.length) return;
    saveHistory();
    const next = [...objects];
    [next[index], next[target]] = [next[target], next[index]];
    setObjects(next);
    requestFullRedraw();
  };

  const deleteLayer = (id: string) => {
    saveHistory();
    removeObject(id);
    requestFullRedraw();
    setSelectedLayerId((current) => (current === id ? null : current));
  };

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
                          ? 'border-blue-500 scale-110'
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
                    Size
                  </label>
                  <span className="text-xs text-slate-400">{brushSize}px</span>
                </div>
                <Slider
                  value={[brushSize]}
                  min={1}
                  max={50}
                  step={1}
                  onValueChange={([val]) => setBrushSize(val)}
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
            </TabsContent>

            <TabsContent value="layers" className="h-[300px] overflow-y-auto pr-1">
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {objects.length} {objects.length === 1 ? 'object' : 'objects'}
                </p>
                <p className="text-xs text-slate-400">Top draws last</p>
              </div>
              {objects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <Layers className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-700" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    No layers yet
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Draw something to build your stack.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {[...objects].reverse().map((object, reverseIndex) => {
                    const index = objects.length - 1 - reverseIndex;
                    const isSelected = selectedLayerId === object.id;
                    return (
                      <div
                        key={object.id}
                        className={cn(
                          'group flex items-center gap-2 rounded-xl border p-2 transition-colors',
                          isSelected
                            ? 'border-blue-400 bg-blue-50/70 dark:border-blue-500/60 dark:bg-blue-500/10'
                            : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/60',
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => setSelectedLayerId(object.id)}
                          aria-pressed={isSelected}
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/5 text-slate-600 dark:border-white/10 dark:text-slate-300"
                            style={{ backgroundColor: `${object.color}22` }}
                          >
                            <LayerGlyph type={object.type} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                              {layerLabel(object)}
                            </span>
                            <span className="block text-xs text-slate-400">
                              Layer {objects.length - index}
                            </span>
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={index === objects.length - 1}
                            onClick={() => moveLayer(object.id, 1)}
                            aria-label={`Move ${layerLabel(object)} forward`}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={index === 0}
                            onClick={() => moveLayer(object.id, -1)}
                            aria-label={`Move ${layerLabel(object)} backward`}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-500"
                            onClick={() => deleteLayer(object.id)}
                            aria-label={`Delete ${layerLabel(object)}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
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
