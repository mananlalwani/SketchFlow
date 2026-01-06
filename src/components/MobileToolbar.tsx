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
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const { currentTool, setTool } = useDrawingStore();
  const [isExpanded, setIsExpanded] = useState(false);

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

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 sm:hidden">
      {isExpanded ? (
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-lg border border-slate-200 dark:border-white/10 p-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-1 flex-wrap justify-center max-w-[280px]">
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
            className="w-full mt-2 text-slate-400"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => setIsExpanded(true)}
          className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30"
        >
          <CurrentIcon className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
}
