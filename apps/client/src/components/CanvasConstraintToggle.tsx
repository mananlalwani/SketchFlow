import { Button } from './ui/button';
import { Square, Circle, Triangle } from 'lucide-react';

interface CanvasConstraintToggleProps {
  currentTool: string;
  isConstraintMode: boolean;
  onToggle: () => void;
}

export function CanvasConstraintToggle({
  currentTool,
  isConstraintMode,
  onToggle,
}: CanvasConstraintToggleProps) {
  const label =
    currentTool === 'ellipse'
      ? 'circle'
      : currentTool === 'triangle'
        ? 'equilateral triangle'
        : 'square';

  return (
    <Button
      onClick={onToggle}
      variant={isConstraintMode ? 'default' : 'glass'}
      size="icon"
      className="fixed bottom-20 right-4 z-40 h-12 w-12"
      title={`${isConstraintMode ? 'Disable' : 'Enable'} perfect ${label} mode`}
    >
      {currentTool === 'ellipse' ? (
        <Circle className={`h-6 w-6 ${isConstraintMode ? 'text-white' : ''}`} />
      ) : currentTool === 'triangle' ? (
        <Triangle className={`h-6 w-6 ${isConstraintMode ? 'text-white' : ''}`} />
      ) : (
        <Square className={`h-6 w-6 ${isConstraintMode ? 'text-white' : ''}`} />
      )}
    </Button>
  );
}
