import { Layers, PenLine, Shapes, Type } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { expandObjectIdsWithGroups } from '@/lib/canvasObjectTransform';
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

/** A quiet layer list with actions surfaced only for the current single selection. */
export function LayerStack({ className }: LayerStackProps) {
  const {
    objects,
    selectedObjectIds,
    setSelectedObject,
    setSelectedObjects,
    updateObject,
    removeObject,
    saveHistory,
    setObjects,
    requestFullRedraw,
    projectRole,
  } = useDrawingStore();
  const selectedObject =
    selectedObjectIds.length === 1
      ? objects.find((object) => object.id === selectedObjectIds[0])
      : undefined;
  const isEditable = projectRole !== 'viewer';
  const orderedObjects = objects
    .map((object, index) => ({ object, index }))
    .sort((a, b) => (a.object.zIndex ?? a.index) - (b.object.zIndex ?? b.index))
    .map(({ object }) => object);

  const setLayerOrder = (direction: -1 | 1) => {
    if (!selectedObject) return;
    const index = orderedObjects.findIndex((object) => object.id === selectedObject.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= orderedObjects.length) return;
    saveHistory();
    const next = [...orderedObjects];
    [next[index], next[target]] = [next[target], next[index]];
    // Persist the order on every object. Array position alone is local state;
    // zIndex makes this reorder a batch of collaboration-visible updates.
    setObjects(next.map((object, zIndex) => ({ ...object, zIndex })));
    requestFullRedraw();
  };

  const selectLayer = (id: string, append: boolean) => {
    const groupIds = expandObjectIdsWithGroups(objects, [id]);
    if (!append) {
      setSelectedObjects(groupIds);
      return;
    }
    const nextIds = selectedObjectIds.includes(id)
      ? selectedObjectIds.filter((selectedId) => !groupIds.includes(selectedId))
      : [...selectedObjectIds, ...groupIds];
    setSelectedObjects(nextIds);
  };

  const toggleVisibility = () => {
    if (!selectedObject) return;
    saveHistory();
    updateObject(selectedObject.id, { hidden: !selectedObject.hidden });
  };

  const removeSelected = () => {
    if (!selectedObject) return;
    saveHistory();
    removeObject(selectedObject.id);
    setSelectedObject(undefined);
    // The canvas is retained-mode, so an object removal needs an explicit
    // scene refresh just like reorder and visibility changes do.
    requestFullRedraw();
  };

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
          {[...orderedObjects].reverse().map((object) => {
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
                  selectLayer(object.id, event.shiftKey);
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
                {(object.hidden || object.locked || object.groupId) && (
                  <span className="text-[11px] text-slate-400">
                    {object.hidden ? 'hidden' : object.locked ? 'locked' : 'grouped'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {selectedObject && (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-white/10">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Layer actions
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="secondary" disabled={!isEditable} onClick={toggleVisibility}>
              {selectedObject.hidden ? 'Show' : 'Hide'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!isEditable}
              onClick={() => setLayerOrder(1)}
            >
              Bring forward
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!isEditable}
              onClick={() => setLayerOrder(-1)}
            >
              Send backward
            </Button>
            <Button size="sm" variant="secondary" disabled={!isEditable} onClick={removeSelected}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
