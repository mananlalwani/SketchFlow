import { Layers, PenLine, Shapes, Type } from 'lucide-react';

import { useDrawingStore } from '@/store/drawingStore';
import { cn } from '@/lib/utils';

function layerLabel(object: { type: string; text?: string; name?: string }) {
  if (object.name?.trim()) return object.name.trim();
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

/** A quiet navigation list. Editing happens in the single selected-object panel. */
export function LayerStack({ className }: LayerStackProps) {
  const { objects, selectedObjectIds, setSelectedObject, toggleSelectedObject } = useDrawingStore();

  return (
    <div className={cn('min-h-0', className)}>
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Layers · {objects.length}
        </p>
        <p className="text-xs text-slate-400">Last drawn is on top</p>
      </div>
      {objects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center dark:border-white/10">
          <Layers className="mx-auto mb-2 h-7 w-7 text-slate-300 dark:text-slate-700" />
          <p className="text-sm text-slate-500">Nothing on this board yet.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {[...objects].reverse().map((object) => {
            const isSelected = selectedObjectIds.includes(object.id);
            const label = layerLabel(object);
            return (
              <button
                key={object.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                  isSelected
                    ? 'bg-blue-50 text-blue-950 dark:bg-blue-500/10 dark:text-blue-100'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06]',
                )}
                onClick={(event) => {
                  if (event.shiftKey) toggleSelectedObject(object.id);
                  else setSelectedObject(object.id);
                }}
                aria-pressed={isSelected}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-black/5 text-slate-600 dark:border-white/10 dark:text-slate-300"
                  style={{
                    backgroundColor: `${object.color}22`,
                    opacity: object.hidden ? 0.35 : 1,
                  }}
                >
                  <LayerGlyph type={object.type} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                {(object.hidden || object.locked) && (
                  <span className="text-[11px] text-slate-400">
                    {object.hidden ? 'hidden' : 'locked'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
