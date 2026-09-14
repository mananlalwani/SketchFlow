import { Copy, Lock, Trash2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DrawingObject } from '@/store/drawingStore';

export function SelectionInspectorMulti({
  selectedObjects,
  hasLockedSelection,
  isEditable,
  allSelectedLocked,
  saveHistory,
  duplicateSelected,
  recolorSelected,
  alignSelected,
  distributeSelected,
  groupSelected,
  ungroupSelected,
  toggleSelectedLocks,
  deleteSelected,
  setSelectedObject,
}: {
  selectedObjects: DrawingObject[];
  hasLockedSelection: boolean;
  isEditable: boolean;
  allSelectedLocked: boolean;
  saveHistory: () => void;
  duplicateSelected: () => void;
  recolorSelected: (color: string) => void;
  alignSelected: (axis: 'x' | 'y', edge: 'min' | 'max') => void;
  distributeSelected: (axis: 'x' | 'y') => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  toggleSelectedLocks: () => void;
  deleteSelected: () => void;
  setSelectedObject: (id: string | undefined) => void;
}) {
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
            className="min-h-11"
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={duplicateSelected}
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </Button>
          <label className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-stone-950/30">
            <span className="sr-only">Recolor selected objects</span>
            <span>Color</span>
            <input
              aria-label="Recolor selected objects"
              type="color"
              value={selectedObjects[0]?.color ?? '#000000'}
              disabled={!isEditable || hasLockedSelection}
              onClick={saveHistory}
              onChange={(event) => recolorSelected(event.target.value)}
              className="h-9 w-10 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 disabled:cursor-not-allowed dark:border-white/10"
            />
          </label>
          <Button
            className="min-h-11"
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => alignSelected('x', 'min')}
          >
            Align left
          </Button>
          <Button
            className="min-h-11"
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => alignSelected('x', 'max')}
          >
            Align right
          </Button>
          <Button
            className="min-h-11"
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => alignSelected('y', 'min')}
          >
            Align top
          </Button>
          <Button
            className="min-h-11"
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => alignSelected('y', 'max')}
          >
            Align bottom
          </Button>
          <Button
            className="min-h-11"
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => distributeSelected('x')}
          >
            Space across
          </Button>
          <Button
            className="min-h-11"
            size="sm"
            variant="secondary"
            disabled={!isEditable || hasLockedSelection}
            onClick={() => distributeSelected('y')}
          >
            Space down
          </Button>
          <Button
            className="min-h-11"
            size="sm"
            variant="secondary"
            disabled={!isEditable}
            onClick={groupSelected}
          >
            Group
          </Button>
          <Button
            className="min-h-11"
            size="sm"
            variant="secondary"
            onClick={ungroupSelected}
            disabled={!isEditable || !selectedObjects.some((candidate) => candidate.groupId)}
          >
            Ungroup
          </Button>
        </div>
        <Button
          className="min-h-11 w-full"
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
          className="min-h-11 w-full"
          size="sm"
          variant="destructive"
          disabled={!isEditable || hasLockedSelection}
          onClick={deleteSelected}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete selected objects
        </Button>
        <Button
          className="min-h-11 w-full"
          variant="ghost"
          size="sm"
          onClick={() => setSelectedObject(undefined)}
        >
          Done
        </Button>
      </section>
    );
}
