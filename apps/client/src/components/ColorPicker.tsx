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
    removeCustomColor,
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
        setBrushColor(customColors.find((c) => c !== color) || '#ffffff');
      }
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        variant="glass"
        size="sm"
        className="flex min-w-[110px] items-center gap-2 border border-stone-200/80 bg-stone-100/80 px-3 py-2 shadow-sm dark:border-white/[0.08] dark:bg-stone-900/70"
      >
        <div className="relative h-5 w-5 overflow-hidden rounded-md border-2 border-stone-300 shadow-sm dark:border-white/30">
          <div className="absolute inset-0 bg-stone-100 dark:bg-stone-950" />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: brushColor, opacity: brushOpacity }}
          />
        </div>
        <span className="hidden sm:inline text-sm font-medium">Color</span>
        <Palette className="w-4 h-4" />
      </Button>

      {isExpanded && (
        <div className="surface-raised absolute left-0 top-full z-50 mt-3 min-w-[300px] rounded-xl border-stone-200 bg-stone-50 p-4 shadow-xl shadow-stone-950/15 backdrop-blur-xl dark:border-white/[0.09] dark:bg-[#211e1b] animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
              Color Palette
            </h3>
            <Button
              onClick={() => setIsExpanded(false)}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-stone-200/70 dark:hover:bg-white/[0.08]"
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
                    'h-10 w-10 rounded-lg border-2 transition-[border-color,box-shadow,transform] duration-200 hover:scale-110 shadow-sm',
                    brushColor === color
                      ? 'border-amber-400 shadow-lg shadow-amber-500/20 ring-2 ring-amber-300/50 scale-110'
                      : 'border-stone-300 dark:border-white/30 hover:border-stone-400 dark:hover:border-white/50',
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
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 hover:scale-110"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-stone-200 pt-3 dark:border-white/[0.08]">
            {showColorInput ? (
              <div className="flex items-center gap-2 w-full">
                <input
                  type="color"
                  onChange={handleCustomColorAdd}
                  className="h-10 w-10 cursor-pointer rounded-lg border-2 border-stone-300 bg-transparent shadow-sm dark:border-white/30"
                  autoFocus
                  aria-label="Choose custom color"
                  title="Choose custom color"
                />
                <span className="text-xs text-stone-500 dark:text-stone-400">Pick a color</span>
              </div>
            ) : (
              <Button
                onClick={() => setShowColorInput(true)}
                variant="glass"
                size="sm"
                className="flex items-center gap-2 font-medium"
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
