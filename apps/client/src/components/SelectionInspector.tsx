import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Lock,
  RotateCcw,
  Trash2,
  Unlock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { generateId } from '@/lib/utils';
import { expandObjectIdsWithGroups } from '@/lib/canvasObjectTransform';
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

function textDimensions(text: string, fontSize: number) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return { width: fontSize, height: fontSize * 1.4 };
  context.font = `${fontSize}px Inter, system-ui, sans-serif`;
  const lines = text.split('\n');
  return {
    width: Math.max(...lines.map((line) => context.measureText(line).width), fontSize),
    height: Math.max(1, lines.length) * fontSize * 1.4,
  };
}

function objectBounds(object: DrawingObject) {
  if (object.type === 'stroke' && object.points?.length) {
    const xs = object.points.map((point) => point.x);
    const ys = object.points.map((point) => point.y);
    return {
      x: Math.min(...xs) - object.size,
      y: Math.min(...ys) - object.size,
      width: Math.max(...xs) - Math.min(...xs) + object.size * 2,
      height: Math.max(...ys) - Math.min(...ys) + object.size * 2,
    };
  }
  if (object.x === undefined || object.y === undefined) return null;
  return {
    x: Math.min(object.x, object.x + (object.width ?? 0)),
    y: Math.min(object.y, object.y + (object.height ?? 0)),
    width: Math.abs(object.width ?? 0),
    height: Math.abs(object.height ?? 0),
  };
}

function translateObject(object: DrawingObject, deltaX: number, deltaY: number): DrawingObject {
  return {
    ...object,
    x: object.x === undefined ? undefined : object.x + deltaX,
    y: object.y === undefined ? undefined : object.y + deltaY,
    points: object.points?.map((point) => ({ ...point, x: point.x + deltaX, y: point.y + deltaY })),
  };
}

/** Object-level controls, intentionally shared by the desktop panel and mobile drawer. */
export function SelectionInspector() {
  const {
    objects,
    selectedObjectId,
    selectedObjectIds,
    setSelectedObject,
    setSelectedObjects,
    updateObject,
    addObject,
    saveHistory,
    projectRole,
    setObjects,
    requestFullRedraw,
  } = useDrawingStore();
  const selectedObjects = objects.filter((candidate) => selectedObjectIds.includes(candidate.id));
  const isMultiSelection = selectedObjects.length > 1;
  const object = objects.find((candidate) => candidate.id === selectedObjectId);
  const isEditable = projectRole !== 'viewer';
  const hasLockedSelection = selectedObjects.some((candidate) => candidate.locked);
  const allSelectedLocked =
    selectedObjects.length > 0 && selectedObjects.every((candidate) => candidate.locked);
  const alignSelected = (axis: 'x' | 'y', edge: 'min' | 'max') => {
    const positioned = selectedObjects
      .map((object) => ({ object, bounds: objectBounds(object) }))
      .filter(
        (
          candidate,
        ): candidate is {
          object: DrawingObject;
          bounds: NonNullable<ReturnType<typeof objectBounds>>;
        } => candidate.bounds !== null,
      );
    if (!isEditable || hasLockedSelection || positioned.length < 2) return;
    const target =
      edge === 'min'
        ? Math.min(...positioned.map((candidate) => candidate.bounds[axis]))
        : Math.max(
            ...positioned.map(
              (candidate) =>
                candidate.bounds[axis] +
                (axis === 'x' ? candidate.bounds.width : candidate.bounds.height),
            ),
          );
    saveHistory();
    setObjects(
      objects.map((candidate) => {
        const selected = positioned.find((item) => item.object.id === candidate.id);
        if (!selected) return candidate;
        const farEdge =
          selected.bounds[axis] + (axis === 'x' ? selected.bounds.width : selected.bounds.height);
        const delta = target - (edge === 'max' ? farEdge : selected.bounds[axis]);
        return axis === 'x'
          ? translateObject(candidate, delta, 0)
          : translateObject(candidate, 0, delta);
      }),
    );
    requestFullRedraw();
  };

  const distributeSelected = (axis: 'x' | 'y') => {
    const positioned = selectedObjects
      .map((object) => ({ object, bounds: objectBounds(object) }))
      .filter(
        (
          candidate,
        ): candidate is {
          object: DrawingObject;
          bounds: NonNullable<ReturnType<typeof objectBounds>>;
        } => candidate.bounds !== null,
      )
      .sort((a, b) => a.bounds[axis] - b.bounds[axis]);
    if (!isEditable || hasLockedSelection || positioned.length < 3) return;
    const first = positioned[0];
    const last = positioned[positioned.length - 1];
    const firstEdge = first.bounds[axis];
    const lastEdge = last.bounds[axis] + (axis === 'x' ? last.bounds.width : last.bounds.height);
    const occupied = positioned.reduce(
      (sum, candidate) => sum + (axis === 'x' ? candidate.bounds.width : candidate.bounds.height),
      0,
    );
    const gap = (lastEdge - firstEdge - occupied) / (positioned.length - 1);
    let cursor = firstEdge;
    const positions = new Map<string, number>();
    for (const candidate of positioned) {
      positions.set(candidate.object.id, cursor);
      cursor += (axis === 'x' ? candidate.bounds.width : candidate.bounds.height) + gap;
    }
    saveHistory();
    setObjects(
      objects.map((candidate) => {
        const position = positions.get(candidate.id);
        if (position === undefined) return candidate;
        const bounds = objectBounds(candidate);
        if (!bounds) return candidate;
        return axis === 'x'
          ? translateObject(candidate, position - bounds.x, 0)
          : translateObject(candidate, 0, position - bounds.y);
      }),
    );
    requestFullRedraw();
  };

  const groupSelected = () => {
    if (!isEditable) return;
    const ids = expandObjectIdsWithGroups(objects, selectedObjectIds);
    if (ids.length < 2) return;
    saveHistory();
    const groupId = generateId();
    setObjects(
      objects.map((candidate) =>
        ids.includes(candidate.id) ? { ...candidate, groupId } : candidate,
      ),
    );
    setSelectedObjects(ids);
    requestFullRedraw();
  };

  const ungroupSelected = () => {
    if (!isEditable) return;
    const groupIds = new Set(
      selectedObjects
        .map((candidate) => candidate.groupId)
        .filter((groupId): groupId is string => Boolean(groupId)),
    );
    if (!groupIds.size) return;
    const ids = objects
      .filter((candidate) => candidate.groupId && groupIds.has(candidate.groupId))
      .map((candidate) => candidate.id);
    saveHistory();
    setObjects(
      objects.map((candidate) =>
        candidate.groupId && groupIds.has(candidate.groupId)
          ? { ...candidate, groupId: undefined }
          : candidate,
      ),
    );
    setSelectedObjects(ids);
    requestFullRedraw();
  };

  const toggleSelectedLocks = () => {
    if (!isEditable || selectedObjects.length === 0) return;
    saveHistory();
    const ids = new Set(selectedObjectIds);
    setObjects(
      objects.map((candidate) =>
        ids.has(candidate.id) ? { ...candidate, locked: !allSelectedLocked } : candidate,
      ),
    );
    requestFullRedraw();
  };

  const deleteSelected = () => {
    if (!isEditable || hasLockedSelection || selectedObjectIds.length === 0) return;
    const ids = new Set(selectedObjectIds);
    saveHistory();
    setObjects(objects.filter((candidate) => !ids.has(candidate.id)));
    setSelectedObject(undefined);
    requestFullRedraw();
  };

  if (isMultiSelection) {
    return (
      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">
            {selectedObjects.length} objects selected
          </p>
          <p className="text-xs text-slate-500">Drag any selected object to move the set.</p>
          {hasLockedSelection && (
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              Unlock every selected object to align, space, or move the set.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => alignSelected('x', 'min')}
          >
            Align left
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => alignSelected('x', 'max')}
          >
            Align right
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => alignSelected('y', 'min')}
          >
            Align top
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => alignSelected('y', 'max')}
          >
            Align bottom
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => distributeSelected('x')}
          >
            Space across
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => distributeSelected('y')}
          >
            Space down
          </Button>
          <Button size="sm" variant="secondary" disabled={!isEditable} onClick={groupSelected}>
            Group
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={ungroupSelected}
            disabled={!isEditable || !selectedObjects.some((candidate) => candidate.groupId)}
          >
            Ungroup
          </Button>
        </div>
        <Button
          className="w-full"
          size="sm"
          variant="secondary"
          disabled={!isEditable}
          onClick={toggleSelectedLocks}
        >
          {allSelectedLocked ? (
            <Unlock className="mr-2 h-4 w-4" />
          ) : (
            <Lock className="mr-2 h-4 w-4" />
          )}
          {allSelectedLocked ? 'Unlock selected objects' : 'Lock selected objects'}
        </Button>
        <Button
          className="w-full"
          size="sm"
          variant="destructive"
          disabled={!isEditable || hasLockedSelection}
          onClick={deleteSelected}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete selected objects
        </Button>
        <Button
          className="w-full"
          variant="ghost"
          size="sm"
          onClick={() => setSelectedObject(undefined)}
        >
          Done
        </Button>
      </section>
    );
  }
  if (!object) return null;

  const isReadOnly = !isEditable || object.locked;
  const canFill = ['rectangle', 'ellipse', 'circle', 'triangle', 'star'].includes(object.type);
  const canResize =
    object.type !== 'stroke' &&
    object.type !== 'text' &&
    object.width !== undefined &&
    object.height !== undefined;

  const updateText = (nextText: string) => {
    if (nextText === object.text) return;
    saveHistory();
    const dimensions = textDimensions(nextText || ' ', object.fontSize ?? 24);
    updateObject(object.id, { text: nextText, ...dimensions });
  };

  const updateFontSize = (fontSize: number) => {
    const nextFontSize = Math.max(12, Math.min(240, Math.round(fontSize)));
    saveHistory();
    const dimensions = textDimensions(object.text || ' ', nextFontSize);
    updateObject(object.id, { fontSize: nextFontSize, ...dimensions });
  };

  const resize = (dimension: 'width' | 'height', rawValue: string) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateObject(object.id, { [dimension]: Math.max(1, Math.round(value)) });
  };

  const rotation = ((object.rotation ?? 0) + 360) % 360;

  const nudge = (deltaX: number, deltaY: number) => {
    if (object.x === undefined || object.y === undefined) return;
    saveHistory();
    updateObject(object.id, {
      x: object.x + deltaX,
      y: object.y + deltaY,
      points:
        object.type === 'triangle' && object.points
          ? object.points.map((point) => ({ ...point, x: point.x + deltaX, y: point.y + deltaY }))
          : object.points,
    });
  };

  const rotateBy = (delta: number) => {
    saveHistory();
    updateObject(object.id, { rotation: ((object.rotation ?? 0) + delta + 360) % 360 });
  };

  const duplicate = () => {
    saveHistory();
    const copy = duplicateObject(object);
    addObject(copy);
    setSelectedObject(copy.id);
  };

  return (
    <section className="space-y-3">
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

      <Button
        className="w-full"
        variant="secondary"
        size="sm"
        disabled={!isEditable}
        onClick={() => {
          saveHistory();
          updateObject(object.id, { locked: !object.locked });
        }}
      >
        {object.locked ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
        {object.locked ? 'Unlock object' : 'Lock object'}
      </Button>

      <div className="space-y-1">
        <label className="text-xs text-slate-500" htmlFor="selected-object-name">
          Layer name
        </label>
        <input
          id="selected-object-name"
          key={object.id}
          defaultValue={object.name ?? ''}
          disabled={isReadOnly}
          placeholder={`Untitled ${object.type}`}
          onFocus={saveHistory}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name !== (object.name ?? '')) updateObject(object.id, { name: name || undefined });
          }}
          className="h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 outline-none focus:border-amber-500 dark:border-white/[0.1] dark:bg-stone-950/30 dark:text-stone-100 dark:focus:border-amber-300"
        />
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
          onClick={saveHistory}
          onChange={(event) => updateObject(object.id, { color: event.target.value })}
          className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 disabled:cursor-not-allowed dark:border-white/10"
        />
      </div>

      {object.x !== undefined && object.y !== undefined && (
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-stone-200 pt-3 dark:border-white/[0.08]">
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">Position</p>
            <p className="text-xs text-slate-400">
              Use Select or Move on canvas, or nudge precisely.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-0.5">
            <span />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={isReadOnly}
              onClick={() => nudge(0, -10)}
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <span />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={isReadOnly}
              onClick={() => nudge(-10, 0)}
              aria-label="Move left"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <span />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={isReadOnly}
              onClick={() => nudge(10, 0)}
              aria-label="Move right"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <span />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={isReadOnly}
              onClick={() => nudge(0, 10)}
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <span />
          </div>
        </div>
      )}

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
          onPointerDown={saveHistory}
          onValueChange={([value]) => updateObject(object.id, { alpha: value / 100 })}
        />
      </div>

      {canFill && (
        <Button
          className="w-full"
          variant={object.filled ? 'default' : 'secondary'}
          size="sm"
          disabled={isReadOnly}
          onClick={() => {
            saveHistory();
            updateObject(object.id, { filled: !object.filled });
          }}
        >
          Fill {object.filled ? 'on' : 'off'}
        </Button>
      )}

      {object.type === 'text' && (
        <div className="space-y-3 border-t border-stone-200 pt-3 dark:border-white/[0.08]">
          <label
            className="block text-sm text-slate-600 dark:text-slate-300"
            htmlFor="selected-text"
          >
            Text
          </label>
          <textarea
            id="selected-text"
            key={object.id}
            defaultValue={object.text}
            disabled={isReadOnly}
            onBlur={(event) => updateText(event.target.value)}
            className="min-h-20 w-full rounded-md border border-stone-300 bg-white p-2 text-sm text-stone-900 outline-none focus:border-amber-500 dark:border-white/[0.1] dark:bg-stone-950/30 dark:text-stone-100 dark:focus:border-amber-300"
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
              <label htmlFor="selected-text-font-size">Font size</label>
              <label className="flex h-9 items-center rounded-md border border-stone-300 bg-white pl-2 dark:border-white/[0.1] dark:bg-stone-950/30">
                <input
                  id="selected-text-font-size"
                  type="number"
                  inputMode="numeric"
                  min="12"
                  max="240"
                  value={object.fontSize ?? 24}
                  disabled={isReadOnly}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) updateFontSize(value);
                  }}
                  className="w-12 bg-transparent text-right font-mono text-sm text-stone-700 outline-none dark:text-stone-200"
                />
                <span className="px-2 font-mono text-xs text-stone-500">px</span>
              </label>
            </div>
            <Slider
              value={[object.fontSize ?? 24]}
              min={12}
              max={240}
              step={1}
              disabled={isReadOnly}
              onPointerDown={saveHistory}
              onValueChange={([value]) => updateFontSize(value)}
            />
          </div>
        </div>
      )}

      {canResize && (
        <div className="grid grid-cols-2 gap-2 border-t border-stone-200 pt-3 dark:border-white/[0.08]">
          <label className="space-y-1 text-xs text-slate-500" htmlFor="selected-object-width">
            Width
            <input
              id="selected-object-width"
              type="number"
              min="1"
              defaultValue={Math.round(Math.abs(object.width!))}
              disabled={isReadOnly}
              onFocus={saveHistory}
              onBlur={(event) => resize('width', event.target.value)}
              className="h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 outline-none focus:border-amber-500 dark:border-white/[0.1] dark:bg-stone-950/30 dark:text-stone-100 dark:focus:border-amber-300"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-500" htmlFor="selected-object-height">
            Height
            <input
              id="selected-object-height"
              type="number"
              min="1"
              defaultValue={Math.round(Math.abs(object.height!))}
              disabled={isReadOnly}
              onFocus={saveHistory}
              onBlur={(event) => resize('height', event.target.value)}
              className="h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 outline-none focus:border-amber-500 dark:border-white/[0.1] dark:bg-stone-950/30 dark:text-stone-100 dark:focus:border-amber-300"
            />
          </label>
        </div>
      )}

      {object.type !== 'stroke' && (
        <div className="space-y-2 border-t border-stone-200 pt-3 dark:border-white/[0.08]">
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>Rotation</span>
            <span>{Math.round(rotation)}°</span>
          </div>
          <Slider
            value={[rotation]}
            min={0}
            max={359}
            step={1}
            disabled={isReadOnly}
            onPointerDown={saveHistory}
            onValueChange={([value]) => updateObject(object.id, { rotation: value })}
          />
          <div className="grid grid-cols-3 gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={isReadOnly}
              onClick={() => rotateBy(-15)}
            >
              −15°
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isReadOnly}
              onClick={() => {
                saveHistory();
                updateObject(object.id, { rotation: 0 });
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isReadOnly}
              onClick={() => rotateBy(15)}
            >
              +15°
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-stone-200 pt-3 dark:border-white/[0.08]">
        <Button variant="secondary" size="sm" disabled={isReadOnly} onClick={duplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </Button>
      </div>
    </section>
  );
}
