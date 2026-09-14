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
import type { DrawingObject } from '@/store/drawingStore';

export function SelectionInspectorObjectForm({
  object,
  isEditable,
  isReadOnly,
  canFill,
  canResize,
  rotation,
  setSelectedObject,
  saveHistory,
  updateObject,
  nudge,
  updateText,
  updateFontSize,
  resize,
  rotateBy,
  duplicate,
}: {
  object: DrawingObject;
  isEditable: boolean;
  isReadOnly: boolean;
  canFill: boolean;
  canResize: boolean;
  rotation: number;
  setSelectedObject: (id: string | undefined) => void;
  saveHistory: () => void;
  updateObject: (id: string, changes: Partial<DrawingObject>) => void;
  nudge: (deltaX: number, deltaY: number) => void;
  updateText: (nextText: string) => void;
  updateFontSize: (fontSize: number) => void;
  resize: (dimension: 'width' | 'height', rawValue: string) => void;
  rotateBy: (delta: number) => void;
  duplicate: () => void;
}) {
  return (
<section className="space-y-3 [&_button]:min-h-11">
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
          className="h-11 w-11 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 disabled:cursor-not-allowed dark:border-white/10"
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
