import { useDrawingStore, type Tool } from '@/store/drawingStore';
import { Button } from '@/components/ui/button';
import { 
  Pen, 
  Eraser, 
  Minus, 
  Square, 
  Circle, 
  Triangle,
  Type, 
  Hand,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tools = [
  { id: 'hand', icon: Hand, label: 'Pan' },
  { id: 'pen', icon: Pen, label: 'Pen' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
  { id: 'triangle', icon: Triangle, label: 'Triangle' },
  { id: 'text', icon: Type, label: 'Text' },
] as const;

export function Sidebar() {
  const { currentTool, setTool } = useDrawingStore();

  return (
    <div className="h-full w-16 border-r border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-slate-900/50 flex flex-col items-center py-4 gap-2 z-20 transition-colors duration-200">
      {tools.map(({ id, icon: Icon, label }) => (
        <Button
          key={id}
          onClick={() => setTool(id as Tool)}
          variant={currentTool === id ? "default" : "ghost"}
          size="icon"
          className={cn(
            "w-10 h-10 rounded-xl transition-all duration-200",
            currentTool === id 
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10"
          )}
          title={label}
        >
          <Icon className="w-5 h-5" />
        </Button>
      ))}
    </div>
  );
}
