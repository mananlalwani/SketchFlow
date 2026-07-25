import { useDrawingStore } from '@/store/drawingStore';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Palette, Layers, Settings, Moon, Sun, Trash2, FolderOpen, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LayerStack } from '@/components/LayerStack';
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
                    {currentTool === 'text' ? 'Font size' : 'Size'}
                  </label>
                  <span className="text-xs text-slate-400">
                    {currentTool === 'text' ? Math.max(16, brushSize * 2) : brushSize}px
                  </span>
                </div>
                <Slider
                  value={[brushSize]}
                  min={1}
                  max={currentTool === 'text' ? 50 : 100}
                  step={1}
                  onValueChange={([val]) => setBrushSize(val)}
                />
              </div>

              {currentTool === 'text' && (
                <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-white/10">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Text note
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center dark:border-white/10 dark:bg-white/[0.03]">
                    <span
                      className="block truncate"
                      style={{
                        color: brushColor,
                        fontSize: `${Math.min(32, Math.max(16, brushSize * 2))}px`,
                      }}
                    >
                      Preview
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    Tap the canvas, write your note, then tap Add text. Use Shift+Enter for a new
                    line.
                  </p>
                </div>
              )}

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
              <LayerStack />
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
