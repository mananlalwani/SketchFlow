import { ChevronDown, ChevronUp, Layers, PenLine, Shapes, Trash2, Type } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDrawingStore } from '@/store/drawingStore';
import { cn } from '@/lib/utils';

function layerLabel(object: { type: string; text?: string }) {
  if (object.type === 'stroke') return 'Stroke';
  if (object.type === 'text') return object.text?.trim().slice(0, 24) || 'Text';
  return object.type.charAt(0).toUpperCase() + object.type.slice(1);
}

function LayerGlyph({ type }: { type: string }) {
  if (type === 'stroke') return <PenLine className="h-4 w-4" />;
  if (type === 'text') return <Type className="h-4 w-4" />;
  return <Shapes className="h-4 w-4" />;
}

interface LayerStackProps {
  className?: string;
}

/** Retained-object stacking controls shared by desktop and mobile surfaces. */
export function LayerStack({ className }: LayerStackProps) {
  const {
    objects,
    setObjects,
    removeObject,
    saveHistory,
    requestFullRedraw,
    selectedObjectId,
    setSelectedObject,
  } = useDrawingStore();

  const moveLayer = (id: string, direction: -1 | 1) => {
    const index = objects.findIndex((object) => object.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= objects.length) return;
    saveHistory();
    const next = [...objects];
    [next[index], next[target]] = [next[target], next[index]];
    setObjects(next);
    requestFullRedraw();
  };

  const deleteLayer = (id: string) => {
    saveHistory();
    removeObject(id);
    requestFullRedraw();
  };

  return (
    <div className={cn('min-h-0', className)}>
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {objects.length} {objects.length === 1 ? 'object' : 'objects'}
        </p>
        <p className="text-xs text-slate-400">Top draws last</p>
      </div>
      {objects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center dark:border-white/10 dark:bg-white/[0.03]">
          <Layers className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No layers yet</p>
          <p className="mt-1 text-xs text-slate-400">Draw something to build your stack.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...objects].reverse().map((object, reverseIndex) => {
            const index = objects.length - 1 - reverseIndex;
            const isSelected = selectedObjectId === object.id;
            const label = layerLabel(object);
            return (
              <div
                key={object.id}
                className={cn(
                  'group flex items-center gap-2 rounded-xl border p-2 transition-colors',
                  isSelected
                    ? 'border-blue-400 bg-blue-50/70 dark:border-blue-500/60 dark:bg-blue-500/10'
                    : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/60',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setSelectedObject(object.id)}
                  aria-pressed={isSelected}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/5 text-slate-600 dark:border-white/10 dark:text-slate-300"
                    style={{ backgroundColor: `${object.color}22` }}
                  >
                    <LayerGlyph type={object.type} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {label}
                    </span>
                    <span className="block text-xs text-slate-400">
                      Layer {objects.length - index}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === objects.length - 1}
                    onClick={() => moveLayer(object.id, 1)}
                    aria-label={`Move ${label} forward`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0}
                    onClick={() => moveLayer(object.id, -1)}
                    aria-label={`Move ${label} backward`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                    onClick={() => deleteLayer(object.id)}
                    aria-label={`Delete ${label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
