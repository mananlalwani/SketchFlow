import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Lock,
  RotateCcw,
  Unlock,
} from 'lucide-react';

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

function textDimensions(text: string, fontSize: number) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return { width: fontSize, height: fontSize * 1.2 };
  context.font = `${fontSize}px Inter, system-ui, sans-serif`;
  const lines = text.split('\n');
  return {
    width: Math.max(...lines.map((line) => context.measureText(line).width), fontSize),
    height: Math.max(1, lines.length) * fontSize * 1.2,
  };
}

/** Object-level controls, intentionally shared by the desktop panel and mobile drawer. */
export function SelectionInspector() {
  const {
    objects,
    selectedObjectId,
    selectedObjectIds,
    setSelectedObject,
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
  const alignSelected = (axis: 'x' | 'y', edge: 'min' | 'max') => {
    const positioned = selectedObjects.filter(
      (candidate): candidate is DrawingObject & { x: number; y: number } =>
        candidate.x !== undefined && candidate.y !== undefined,
    );
    if (positioned.length < 2) return;
    const target =
      edge === 'min'
        ? Math.min(...positioned.map((candidate) => candidate[axis]))
        : Math.max(
            ...positioned.map(
              (candidate) =>
                candidate[axis] + (axis === 'x' ? (candidate.width ?? 0) : (candidate.height ?? 0)),
            ),
          );
    saveHistory();
    setObjects(
      objects.map((candidate) => {
        if (!positioned.some((selected) => selected.id === candidate.id)) return candidate;
        if (axis === 'x')
          return { ...candidate, x: target - (edge === 'max' ? (candidate.width ?? 0) : 0) };
        return { ...candidate, y: target - (edge === 'max' ? (candidate.height ?? 0) : 0) };
      }),
    );
    requestFullRedraw();
  };

  const distributeSelected = (axis: 'x' | 'y') => {
    const positioned = selectedObjects
      .filter(
        (candidate): candidate is DrawingObject & { x: number; y: number } =>
          candidate.x !== undefined && candidate.y !== undefined,
      )
      .sort((a, b) => a[axis] - b[axis]);
    if (positioned.length < 3) return;
    const first = positioned[0];
    const last = positioned[positioned.length - 1];
    const firstEdge = first[axis];
    const lastEdge = last[axis] + (axis === 'x' ? (last.width ?? 0) : (last.height ?? 0));
    const occupied = positioned.reduce(
      (sum, candidate) => sum + (axis === 'x' ? (candidate.width ?? 0) : (candidate.height ?? 0)),
      0,
    );
    const gap = (lastEdge - firstEdge - occupied) / (positioned.length - 1);
    let cursor = firstEdge;
    const positions = new Map<string, number>();
    for (const candidate of positioned) {
      positions.set(candidate.id, cursor);
      cursor += (axis === 'x' ? (candidate.width ?? 0) : (candidate.height ?? 0)) + gap;
    }
    saveHistory();
    setObjects(
      objects.map((candidate) => {
        const position = positions.get(candidate.id);
        if (position === undefined) return candidate;
        return axis === 'x' ? { ...candidate, x: position } : { ...candidate, y: position };
      }),
    );
    requestFullRedraw();
  };

  const groupSelected = () => {
    saveHistory();
    const groupId = generateId();
    setObjects(
      objects.map((candidate) =>
        selectedObjectIds.includes(candidate.id) ? { ...candidate, groupId } : candidate,
      ),
    );
    requestFullRedraw();
  };

  const ungroupSelected = () => {
    saveHistory();
    setObjects(
      objects.map((candidate) =>
        selectedObjectIds.includes(candidate.id) ? { ...candidate, groupId: undefined } : candidate,
      ),
    );
    requestFullRedraw();
  };

  if (isMultiSelection) {
    return (
      <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/30 dark:bg-blue-500/[0.08]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">
            {selectedObjects.length} objects selected
          </p>
          <p className="text-xs text-slate-500">Drag any selected object to move the set.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => alignSelected('x', 'min')}>
            Align left
          </Button>
          <Button size="sm" variant="secondary" onClick={() => alignSelected('x', 'max')}>
            Align right
          </Button>
          <Button size="sm" variant="secondary" onClick={() => alignSelected('y', 'min')}>
            Align top
          </Button>
          <Button size="sm" variant="secondary" onClick={() => alignSelected('y', 'max')}>
            Align bottom
          </Button>
          <Button size="sm" variant="secondary" onClick={() => distributeSelected('x')}>
            Space across
          </Button>
          <Button size="sm" variant="secondary" onClick={() => distributeSelected('y')}>
            Space down
          </Button>
          <Button size="sm" variant="secondary" onClick={groupSelected}>
            Group
          </Button>
          <Button size="sm" variant="secondary" onClick={ungroupSelected}>
            Ungroup
          </Button>
        </div>
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

  const isEditable = projectRole !== 'viewer';
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
    saveHistory();
    const dimensions = textDimensions(object.text || ' ', fontSize);
    updateObject(object.id, { fontSize, ...dimensions });
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
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
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
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-blue-200 pt-3 dark:border-blue-500/20">
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
        <div className="space-y-3 border-t border-blue-200 pt-3 dark:border-blue-500/20">
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
            className="min-h-20 w-full rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
          />
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
              <span>Font size</span>
              <span>{object.fontSize ?? 24}px</span>
            </div>
            <Slider
              value={[object.fontSize ?? 24]}
              min={12}
              max={120}
              step={1}
              disabled={isReadOnly}
              onPointerDown={saveHistory}
              onValueChange={([value]) => updateFontSize(value)}
            />
          </div>
        </div>
      )}

      {canResize && (
        <div className="grid grid-cols-2 gap-2 border-t border-blue-200 pt-3 dark:border-blue-500/20">
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
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
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
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
        </div>
      )}

      {object.type !== 'stroke' && (
        <div className="space-y-2 border-t border-blue-200 pt-3 dark:border-blue-500/20">
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

      <div className="border-t border-blue-200 pt-3 dark:border-blue-500/20">
        <Button variant="secondary" size="sm" disabled={isReadOnly} onClick={duplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </Button>
      </div>
    </section>
  );
}
