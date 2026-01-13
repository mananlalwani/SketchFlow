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
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerClose, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const COLORS = [
  '#000000', '#ffffff', '#e11d48', '#d97706', '#16a34a', '#2563eb', '#7c3aed', 
  // Custom palette
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'
];

interface MobilePropertiesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction?: (action: string) => void;
}

export function MobilePropertiesDrawer({ open, onOpenChange, onAction }: MobilePropertiesDrawerProps) {
  const { 
    brushColor, 
    setBrushColor, 
    brushSize, 
    setBrushSize, 
    brushOpacity, 
    setBrushOpacity
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
                <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Color</label>
                <div className="grid grid-cols-8 gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-transform",
                        brushColor === color 
                          ? "border-blue-500 scale-110" 
                          : "border-transparent hover:scale-105"
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
                  <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Size</label>
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
                  <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Opacity</label>
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

            <TabsContent value="layers" className="space-y-4 h-[300px] overflow-y-auto">
              <div className="text-center text-slate-500 py-8">
                 <Layers className="w-12 h-12 mx-auto mb-2 opacity-20" />
                 <p>Layer management coming soon to mobile</p>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Button 
                variant="outline" 
                className="w-full justify-between"
                onClick={toggleTheme}
              >
                <span className="flex items-center">
                  {theme === 'dark' ? <Moon className="w-4 h-4 mr-2" /> : <Sun className="w-4 h-4 mr-2" />}
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
