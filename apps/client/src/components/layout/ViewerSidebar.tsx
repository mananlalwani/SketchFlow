import { useDrawingStore } from '@/store/drawingStore';
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2,
  Hand
} from 'lucide-react';
import { useCallback } from 'react';

export function ViewerSidebar() {
  const { zoom, setZoom, setView, resetView } = useDrawingStore();

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(5, zoom * 1.2);
    setZoom(newZoom);
  }, [zoom, setZoom]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(0.1, zoom / 1.2);
    setZoom(newZoom);
  }, [zoom, setZoom]);

  const handleFit = useCallback(() => {
    const worldW = 4096;
    const worldH = 4096;
    const vpW = window.innerWidth - 64;
    const vpH = window.innerHeight - 56;
    
    const scaleX = vpW / worldW;
    const scaleY = vpH / worldH;
    const newZoom = Math.min(scaleX, scaleY) * 0.9;
    
    setZoom(newZoom);
    const newViewX = (worldW - vpW/newZoom) / 2;
    const newViewY = (worldH - vpH/newZoom) / 2;
    setView(newViewX, newViewY);
  }, [setZoom, setView]);

  return (
    <div className="h-full w-16 border-r border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-slate-900/50 flex flex-col items-center py-4 gap-2 z-20 transition-colors duration-200">
      <Button
        variant="default"
        size="icon"
        className="w-10 h-10 rounded-xl bg-emerald-600 shadow-lg shadow-emerald-500/20 cursor-default"
        title="Pan Mode (Active)"
      >
        <Hand className="w-5 h-5" />
      </Button>
      
      <div className="h-px w-8 bg-slate-200 dark:bg-white/10 my-2" />

      <Button
        onClick={handleZoomIn}
        variant="ghost"
        size="icon"
        className="w-10 h-10 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10"
        title="Zoom In (Ctrl + +)"
        disabled={zoom >= 5}
      >
        <ZoomIn className="w-5 h-5" />
      </Button>

      <Button
        onClick={handleZoomOut}
        variant="ghost"
        size="icon"
        className="w-10 h-10 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10"
        title="Zoom Out (Ctrl + -)"
        disabled={zoom <= 0.1}
      >
        <ZoomOut className="w-5 h-5" />
      </Button>

      <Button
        onClick={() => resetView()}
        variant="ghost"
        size="icon"
        className="w-10 h-10 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10"
        title="Reset View (Ctrl + 0)"
      >
        <RotateCcw className="w-5 h-5" />
      </Button>

      <Button
        onClick={handleFit}
        variant="ghost"
        size="icon"
        className="w-10 h-10 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10"
        title="Fit to Screen"
      >
        <Maximize2 className="w-5 h-5" />
      </Button>
      
      <div className="mt-auto flex flex-col items-center gap-1 mb-2">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Zoom</span>
        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
