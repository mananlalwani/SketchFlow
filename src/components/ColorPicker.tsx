import { useState } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { Button } from './ui/button';
import { Palette, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ColorPicker() {
  const {
    brushColor,
    customColors,
    brushOpacity,
    setBrushColor,
    addCustomColor,
    removeCustomColor
  } = useDrawingStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showColorInput, setShowColorInput] = useState(false);

  const handleColorSelect = (color: string) => {
    setBrushColor(color);
  };

  const handleCustomColorAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    addCustomColor(color);
    setBrushColor(color);
    setShowColorInput(false);
  };

  const handleColorRemove = (color: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (customColors.length > 1) {
      removeCustomColor(color);
      if (brushColor === color) {
        setBrushColor(customColors.find(c => c !== color) || '#ffffff');
      }
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      {/* Current Color Display */}
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        variant="glass"
        size="sm"
        className="flex items-center gap-2 min-w-[110px] px-3 py-2 hover:scale-105 transition-transform shadow-lg"
      >
        <div className="relative w-5 h-5 rounded-lg border-2 border-slate-300 dark:border-white/40 color-preview shadow-lg overflow-hidden">
          <div className="absolute inset-0 bg-slate-100 dark:bg-slate-900" />
          <div className="absolute inset-0" style={{ backgroundColor: brushColor, opacity: brushOpacity }} />
        </div>
        <span className="hidden sm:inline text-sm font-medium">Color</span>
        <Palette className="w-4 h-4" />
      </Button>

      {/* Color Palette */}
      {isExpanded && (
        <div
          className="absolute left-0 top-full mt-3 p-5 z-50 animate-fade-in min-w-[300px] shadow-2xl rounded-2xl bg-white dark:bg-slate-800/95 backdrop-blur-xl border border-slate-200 dark:border-white/20"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300">Color Palette</h3>
            <Button
              onClick={() => setIsExpanded(false)}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-6 gap-3 mb-4">
            {customColors.map((color) => (
              <div key={color} className="relative group">
                <button
                  onClick={() => handleColorSelect(color)}
                  className={cn(
                    "w-10 h-10 rounded-xl border-2 transition-all duration-300 hover:scale-110 color-swatch shadow-lg",
                    brushColor === color
                      ? "border-blue-400 shadow-xl shadow-blue-500/50 ring-2 ring-blue-300/50 scale-110"
                      : "border-slate-300 dark:border-white/30 hover:border-slate-400 dark:hover:border-white/50"
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={`Select color ${color}`}
                />
                {customColors.length > 1 && (
                  <Button
                    onClick={(e) => handleColorRemove(color, e)}
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 w-5 h-5 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 rounded-full"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Add Custom Color */}
          <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-white/10">
            {showColorInput ? (
              <div className="flex items-center gap-2 w-full">
                <input
                  type="color"
                  onChange={handleCustomColorAdd}
                  className="w-10 h-10 rounded-lg border-2 border-slate-300 dark:border-white/30 bg-transparent cursor-pointer shadow-lg"
                  autoFocus
                  aria-label="Choose custom color"
                  title="Choose custom color"
                />
                <span className="text-xs text-slate-500 dark:text-gray-400">Pick a color</span>
              </div>
            ) : (
              <Button
                onClick={() => setShowColorInput(true)}
                variant="glass"
                size="sm"
                className="flex items-center gap-2 font-medium hover:scale-105 transition-transform"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add Color</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
