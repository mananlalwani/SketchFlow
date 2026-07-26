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
  MousePointer2,
  Move,
  ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tools = [
  { id: 'hand', icon: Hand, label: 'Pan' },
  { id: 'select', icon: MousePointer2, label: 'Select (V)' },
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

export function Sidebar() {
  const { currentTool, setTool } = useDrawingStore();

  const handleToolClick = (id: string) => {
    if (id === 'image') {
      const fileInput = document.getElementById('image-upload-input') as HTMLInputElement;
      fileInput?.click();
    } else {
      setTool(id as Tool);
    }
  };

  return (
    <div className="z-20 flex h-full w-[4.5rem] flex-col items-center gap-1 border-r border-stone-200/90 bg-stone-50/90 px-2 py-3 transition-colors duration-200 dark:border-white/[0.08] dark:bg-[#211e1b]/90">
      <span className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500">
        Tools
      </span>
      {tools.map(({ id, icon: Icon, label }) => (
        <Button
          key={id}
          onClick={() => handleToolClick(id)}
          variant={currentTool === id ? 'default' : 'ghost'}
          size="icon"
          className={cn(
            'h-10 w-10 rounded-xl transition-[background-color,color,box-shadow,transform] duration-150',
            currentTool === id
              ? 'bg-stone-900 text-amber-100 shadow-sm shadow-stone-950/20 dark:bg-amber-300 dark:text-stone-950'
              : 'text-stone-500 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-white/[0.07] dark:hover:text-stone-50',
          )}
          title={label}
          aria-label={label}
          aria-pressed={currentTool === id}
        >
          <Icon className="w-5 h-5" />
        </Button>
      ))}
    </div>
  );
}
