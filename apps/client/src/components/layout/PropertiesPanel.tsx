import { useDrawingStore } from '@/store/drawingStore';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { ColorPicker } from '@/components/ColorPicker';
import { cn } from '@/lib/utils';
import { FEATURES } from '@/config/features';
import { LayerStack } from '@/components/LayerStack';
import { SelectionInspector } from '@/components/SelectionInspector';

export function PropertiesPanel() {
  const {
    brushSize,
    setBrushSize,
    textFontSize,
    setTextFontSize,
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

  return (
    <div className="z-20 flex h-full w-80 flex-col overflow-y-auto border-l border-stone-200/90 bg-stone-50/90 backdrop-blur-md transition-colors duration-200 dark:border-white/[0.08] dark:bg-[#211e1b]/90">
      <div className="border-b border-stone-200/90 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:border-white/[0.08] dark:text-stone-500">
        Inspector
      </div>

      <div className="border-b border-stone-200/90 px-5 py-4 dark:border-white/[0.08]">
        <SelectionInspector />
      </div>

      {showBrushProps && (
        <div className="space-y-5 border-b border-stone-200/90 px-5 py-5 dark:border-white/[0.08]">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <label
                className="text-stone-700 dark:text-stone-200"
                htmlFor={showTextProps ? 'text-font-size' : 'brush-size'}
              >
                {showTextProps ? 'Font size' : 'Size'}
              </label>
              <label className="flex h-8 items-center rounded-md border border-stone-300 bg-white pl-2 dark:border-white/[0.1] dark:bg-stone-950/30">
                <input
                  id={showTextProps ? 'text-font-size' : 'brush-size'}
                  type="number"
                  inputMode="numeric"
                  min={showTextProps ? 12 : 1}
                  max={showTextProps ? 240 : 100}
                  value={showTextProps ? textFontSize : brushSize}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      if (showTextProps) setTextFontSize(value);
                      else setBrushSize(value);
                    }
                  }}
                  className="w-12 bg-transparent text-right font-mono tabular-nums text-sm text-stone-700 outline-none dark:text-stone-200"
                />
                <span className="px-2 font-mono text-xs text-stone-500">px</span>
              </label>
            </div>
            <Slider
              aria-label={showTextProps ? 'Text font size in pixels' : 'Brush size'}
              value={[showTextProps ? textFontSize : brushSize]}
              onValueChange={([value]) => {
                if (showTextProps) setTextFontSize(value);
                else setBrushSize(value);
              }}
              min={showTextProps ? 12 : 1}
              max={showTextProps ? 240 : 100}
              step={1}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-stone-700 dark:text-stone-200">Opacity</span>
              <span className="font-mono tabular-nums text-stone-500 dark:text-stone-400">
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
            <div className="text-sm text-stone-700 dark:text-stone-200">Color</div>
            <ColorPicker />
          </div>

          {showTriangleProps && (
            <div className="space-y-3 border-t border-stone-200 pt-4 dark:border-white/[0.08]">
              <div className="text-sm text-stone-500 dark:text-stone-400">Triangle Type</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={triangleMode === 'custom' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setTriangleMode('custom')}
                  className={cn(
                    triangleMode === 'custom' && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                  )}
                  title="Click 3 points to place vertices"
                >
                  Custom
                </Button>
                <Button
                  variant={triangleMode === 'right' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setTriangleMode('right')}
                  className={cn(
                    triangleMode === 'right' && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                  )}
                  title="Right triangle (90°)"
                >
                  Right
                </Button>
                <Button
                  variant={triangleMode === '45-45-90' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setTriangleMode('45-45-90')}
                  className={cn(
                    triangleMode === '45-45-90' && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                  )}
                  title="Isosceles right triangle"
                >
                  45-45-90
                </Button>
                <Button
                  variant={triangleMode === '30-60-90' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setTriangleMode('30-60-90')}
                  className={cn(
                    triangleMode === '30-60-90' && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                  )}
                  title="30-60-90 special triangle"
                >
                  30-60-90
                </Button>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-500">
                {triangleMode === 'custom'
                  ? 'Click 3 times to place triangle vertices'
                  : 'Click and drag to draw triangle'}
              </p>
            </div>
          )}

          {showStarProps && (
            <div className="space-y-3 border-t border-stone-200 pt-4 dark:border-white/[0.08]">
              <div className="text-sm text-stone-500 dark:text-stone-400">Star Points</div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={starPoints === 5 ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setStarPoints(5)}
                  className={cn(
                    starPoints === 5 && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                  )}
                  title="5-pointed star"
                >
                  5
                </Button>
                <Button
                  variant={starPoints === 6 ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setStarPoints(6)}
                  className={cn(
                    starPoints === 6 && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                  )}
                  title="6-pointed star (Star of David)"
                >
                  6
                </Button>
                <Button
                  variant={starPoints === 8 ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setStarPoints(8)}
                  className={cn(
                    starPoints === 8 && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                  )}
                  title="8-pointed star"
                >
                  8
                </Button>
              </div>
              <p className="text-xs text-stone-500">Click to set center, drag to set size</p>
            </div>
          )}

          {showTextProps && (
            <div className="border-t border-stone-200 pt-4 dark:border-white/[0.08]">
              <p className="text-xs text-stone-500">
                Click the canvas, then use Place text or ⌘/Ctrl+Enter to finish. Enter adds a new
                line.
              </p>
            </div>
          )}

          <div className="space-y-2 border-t border-stone-200 pt-4 dark:border-white/[0.08]">
            <div className="text-sm text-stone-500 dark:text-stone-400">Options</div>
            {!showTextProps && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-700 dark:text-stone-200">Fill Shapes</span>
                  <Button
                    variant={shapeFilled ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setShapeFilled(!shapeFilled)}
                    className={cn(
                      'w-16',
                      shapeFilled && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                    )}
                  >
                    {shapeFilled ? 'On' : 'Off'}
                  </Button>
                </div>

                {FEATURES.AUTO_SHAPE && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-700 dark:text-stone-200">Auto Shape</span>
                    <Button
                      variant={autoShape ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => setAutoShape(!autoShape)}
                      className={cn(
                        'w-16',
                        autoShape && 'bg-amber-300 text-stone-950 hover:bg-amber-200',
                      )}
                    >
                      {autoShape ? 'On' : 'Off'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showEraserProps && (
        <div className="space-y-4 border-b border-stone-200/90 px-5 py-5 dark:border-white/[0.08]">
          <div className="text-sm text-stone-500 dark:text-stone-400">Eraser Mode</div>
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
              <span className="text-stone-700 dark:text-stone-200">Size</span>
              <span className="font-mono text-stone-500 dark:text-stone-400">{brushSize}px</span>
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

      <div className="min-h-[220px] space-y-3 px-5 py-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
          Layers
        </div>
        <LayerStack className="max-h-[360px] overflow-y-auto pr-1" />
      </div>
    </div>
  );
}
