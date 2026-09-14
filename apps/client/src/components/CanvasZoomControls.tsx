import { Button } from './ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface CanvasZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function CanvasZoomControls({ zoom, onZoomIn, onZoomOut, onReset }: CanvasZoomControlsProps) {
  return (
    <div className="absolute top-4 left-4 z-40 flex items-center space-x-2">
      <Button onClick={onZoomOut} variant="glass" size="sm" disabled={zoom <= 0.1} title="Zoom out">
        <ZoomOut className="w-4 h-4" />
      </Button>
      <div className="min-w-[80px] rounded px-3 py-1 text-center font-mono text-sm tabular-nums glass">
        {(zoom * 100).toFixed(0)}%
      </div>
      <Button onClick={onZoomIn} variant="glass" size="sm" disabled={zoom >= 5} title="Zoom in">
        <ZoomIn className="w-4 h-4" />
      </Button>
      <Button onClick={onReset} variant="glass" size="sm" title="Reset view">
        <RotateCcw className="w-4 h-4" />
      </Button>
    </div>
  );
}
