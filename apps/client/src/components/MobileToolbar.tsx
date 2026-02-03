import { useState } from 'react';
import { useDrawingStore, type Tool } from '@/store/drawingStore';
import { Button } from '@/components/ui/button';
import {
  Pen,
  Eraser,
  Minus,
  Square,
  Circle,
  Triangle,
  Star,
  Type,
  Hand,
  Move,
  ImageIcon,
  ChevronDown,
  SlidersHorizontal,
  Undo2,
  Redo2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobilePropertiesDrawer } from './MobilePropertiesDrawer';

const tools = [
  { id: 'hand', icon: Hand, label: 'Pan' },
  { id: 'move', icon: Move, label: 'Move' },
  { id: 'pen', icon: Pen, label: 'Pen' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
  { id: 'triangle', icon: Triangle, label: 'Triangle' },
  { id: 'star', icon: Star, label: 'Star' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'image', icon: ImageIcon, label: 'Image' },
] as const;

export function MobileToolbar() {
  const { currentTool, setTool, clearCanvas, undo, redo, canUndo, canRedo } = useDrawingStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Find current tool icon
  const CurrentIcon = tools.find(t => t.id === currentTool)?.icon || Pen;

  const handleToolClick = (id: string) => {
    if (id === 'image') {
      // For image tool, trigger the file input in DrawingCanvas
      const fileInput = document.getElementById('image-upload-input') as HTMLInputElement;
      fileInput?.click();
    } else {
      setTool(id as Tool);
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
      // Trigger save
      setIsDrawerOpen(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 sm:hidden flex items-end gap-3">
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
                    variant={currentTool === id ? "default" : "ghost"}
                    size="icon"
                    className={cn(
                      "w-10 h-10 rounded-xl transition-all",
                      currentTool === id
                        ? "bg-blue-600 text-white"
                        : "text-slate-500 dark:text-slate-400"
                    )}
                    title={label}
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
