import { Copy, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { generateId } from '@/lib/utils';
import { useDrawingStore, type DrawingObject } from '@/store/drawingStore';

function duplicateObject(object: DrawingObject): DrawingObject {
  const offset = 24;
  return {
    ...object,
    id: generateId(),
    x: object.x === undefined ? undefined : object.x + offset,
    y: object.y === undefined ? undefined : object.y + offset,
    points: object.points?.map((point) => ({ ...point, x: point.x + offset, y: point.y + offset })),
  };
}

/** Object-level controls, intentionally shared by the desktop panel and mobile drawer. */
export function SelectionInspector() {
  const {
    objects,
    selectedObjectId,
    setSelectedObject,
    updateObject,
    addObject,
    removeObject,
    saveHistory,
    projectRole,
  } = useDrawingStore();
  const object = objects.find((candidate) => candidate.id === selectedObjectId);
  if (!object) return null;

  const isReadOnly = projectRole === 'viewer';
  const canFill = ['rectangle', 'ellipse', 'circle', 'triangle', 'star'].includes(object.type);

  const duplicate = () => {
    saveHistory();
    const copy = duplicateObject(object);
    addObject(copy);
    setSelectedObject(copy.id);
  };

  const remove = () => {
    saveHistory();
    removeObject(object.id);
    setSelectedObject(undefined);
  };

  return (
    <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/30 dark:bg-blue-500/[0.08]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">
            Selected {object.type}
          </p>
          <p className="text-xs text-slate-500">Drag it on the canvas to move it.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSelectedObject(undefined)}>
          Done
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <label
          className="text-sm text-slate-600 dark:text-slate-300"
          htmlFor="selected-object-color"
        >
          Color
        </label>
        <input
          id="selected-object-color"
          type="color"
          value={object.color}
          disabled={isReadOnly}
          onChange={(event) => updateObject(object.id, { color: event.target.value })}
          className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 disabled:cursor-not-allowed dark:border-white/10"
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
          <span>Opacity</span>
          <span>{Math.round((object.alpha ?? 1) * 100)}%</span>
        </div>
        <Slider
          value={[(object.alpha ?? 1) * 100]}
          min={10}
          max={100}
          step={5}
          disabled={isReadOnly}
          onValueChange={([value]) => updateObject(object.id, { alpha: value / 100 })}
        />
      </div>

      {canFill && (
        <Button
          className="w-full"
          variant={object.filled ? 'default' : 'secondary'}
          size="sm"
          disabled={isReadOnly}
          onClick={() => updateObject(object.id, { filled: !object.filled })}
        >
          Fill {object.filled ? 'on' : 'off'}
        </Button>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-blue-200 pt-3 dark:border-blue-500/20">
        <Button variant="secondary" size="sm" disabled={isReadOnly} onClick={duplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </Button>
        <Button variant="destructive" size="sm" disabled={isReadOnly} onClick={remove}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </Button>
      </div>
    </section>
  );
}
