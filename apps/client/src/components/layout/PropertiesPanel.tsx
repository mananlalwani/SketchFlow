import { useDrawingStore } from '@/store/drawingStore';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ColorPicker';
import { cn } from '@/lib/utils';
import { FEATURES } from '@/config/features';

export function PropertiesPanel() {
  const {
    brushSize,
    setBrushSize,
    brushOpacity,
    setBrushOpacity,
    shapeFilled,
    setShapeFilled,
    autoShape,
    setAutoShape,
    currentTool,
    eraserMode,
    setEraserMode,
    triangleMode,
    setTriangleMode,
    starPoints,
    setStarPoints,
  } = useDrawingStore();

  const showBrushProps = [
    'pen',
    'line',
    'rectangle',
    'ellipse',
    'triangle',
    'star',
    'text',
  ].includes(currentTool);
  const showEraserProps = currentTool === 'eraser';
  const showTriangleProps = currentTool === 'triangle';
  const showStarProps = currentTool === 'star';
  const showTextProps = currentTool === 'text';

  const fontSize = Math.max(12, brushSize * 3);

  if (!showBrushProps && !showEraserProps) return null;

  return (
    <div className="w-64 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-l border-slate-200 dark:border-white/10 h-full p-4 flex flex-col gap-6 overflow-y-auto z-20 transition-colors duration-200">
      <div className="font-semibold text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        Properties
      </div>

      {showBrushProps && (
        <>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-700 dark:text-slate-200">Size</span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{brushSize}px</span>
            </div>
            <Slider
              aria-label="Brush size"
              value={[brushSize]}
              onValueChange={([v]) => setBrushSize(v)}
              min={1}
              max={100}
              step={1}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-700 dark:text-slate-200">Opacity</span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {Math.round(brushOpacity * 100)}%
              </span>
            </div>
            <Slider
              aria-label="Brush opacity"
              value={[brushOpacity * 100]}
              onValueChange={([v]) => setBrushOpacity(v / 100)}
              min={1}
              max={100}
              step={1}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm text-slate-700 dark:text-slate-200">Color</div>
            <ColorPicker />
          </div>

          {showTriangleProps && (
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="text-sm text-slate-500 dark:text-slate-400">Triangle Type</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={triangleMode === 'custom' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setTriangleMode('custom')}
                  className={cn(triangleMode === 'custom' && 'bg-blue-600')}
                  title="Click 3 points to place vertices"
                >
                  Custom
                </Button>
                <Button
                  variant={triangleMode === 'right' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setTriangleMode('right')}
                  className={cn(triangleMode === 'right' && 'bg-blue-600')}
                  title="Right triangle (90°)"
                >
                  Right
                </Button>
                <Button
                  variant={triangleMode === '45-45-90' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setTriangleMode('45-45-90')}
                  className={cn(triangleMode === '45-45-90' && 'bg-blue-600')}
                  title="Isosceles right triangle"
                >
                  45-45-90
                </Button>
                <Button
                  variant={triangleMode === '30-60-90' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setTriangleMode('30-60-90')}
                  className={cn(triangleMode === '30-60-90' && 'bg-blue-600')}
                  title="30-60-90 special triangle"
                >
                  30-60-90
                </Button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                {triangleMode === 'custom'
                  ? 'Click 3 times to place triangle vertices'
                  : 'Click and drag to draw triangle'}
              </p>
            </div>
          )}

          {showStarProps && (
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="text-sm text-slate-500 dark:text-slate-400">Star Points</div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={starPoints === 5 ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setStarPoints(5)}
                  className={cn(starPoints === 5 && 'bg-blue-600')}
                  title="5-pointed star"
                >
                  5
                </Button>
                <Button
                  variant={starPoints === 6 ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setStarPoints(6)}
                  className={cn(starPoints === 6 && 'bg-blue-600')}
                  title="6-pointed star (Star of David)"
                >
                  6
                </Button>
                <Button
                  variant={starPoints === 8 ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setStarPoints(8)}
                  className={cn(starPoints === 8 && 'bg-blue-600')}
                  title="8-pointed star"
                >
                  8
                </Button>
              </div>
              <p className="text-xs text-slate-500">Click to set center, drag to set size</p>
            </div>
          )}

          {showTextProps && (
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="text-sm text-slate-500 dark:text-slate-400">Text Settings</div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-200">Font Size</span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{fontSize}px</span>
                </div>
                <Slider
                  value={[brushSize]}
                  onValueChange={([v]) => setBrushSize(v)}
                  min={4}
                  max={50}
                  step={1}
                />
              </div>
              <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-white/5">
                <p
                  className="text-center truncate text-slate-700 dark:text-slate-200 text-preview"
                  style={{ fontSize: `${Math.min(fontSize, 32)}px` }}
                >
                  Preview
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Click on canvas to place text. Press Enter to confirm, Shift+Enter for new line,
                Escape to cancel.
              </p>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
            <div className="text-sm text-slate-500 dark:text-slate-400">Options</div>
            {!showTextProps && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 dark:text-slate-200">Fill Shapes</span>
                  <Button
                    variant={shapeFilled ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setShapeFilled(!shapeFilled)}
                    className={cn('w-16', shapeFilled && 'bg-blue-600')}
                  >
                    {shapeFilled ? 'On' : 'Off'}
                  </Button>
                </div>

                {FEATURES.AUTO_SHAPE && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 dark:text-slate-200">Auto Shape</span>
                    <Button
                      variant={autoShape ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => setAutoShape(!autoShape)}
                      className={cn('w-16', autoShape && 'bg-blue-600')}
                    >
                      {autoShape ? 'On' : 'Off'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {showEraserProps && (
        <div className="space-y-3">
          <div className="text-sm text-slate-500 dark:text-slate-400">Eraser Mode</div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={eraserMode === 'partial' ? 'default' : 'secondary'}
              onClick={() => setEraserMode('partial')}
              size="sm"
            >
              Standard
            </Button>
            <Button
              variant={eraserMode === 'object' ? 'default' : 'secondary'}
              onClick={() => setEraserMode('object')}
              size="sm"
            >
              Object
            </Button>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-700 dark:text-slate-200">Size</span>
              <span className="text-slate-500 dark:text-slate-400 font-mono">{brushSize}px</span>
            </div>
            <Slider
              value={[brushSize]}
              onValueChange={([v]) => setBrushSize(v)}
              min={1}
              max={100}
              step={1}
            />
          </div>
        </div>
      )}
    </div>
  );
}
