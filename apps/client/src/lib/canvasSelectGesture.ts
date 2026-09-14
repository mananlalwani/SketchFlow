/** Select, marquee, object-drag, and selection delete plans (no React). */
import type { DrawingObject } from '@/store/drawingStore';
import {
  findCanvasObjectIdAt,
  findCanvasObjectIdsInSelection,
  selectionIdsForHit,
} from '@/lib/canvasSelection';
import {
  canTransformObjects,
  expandObjectIdsWithGroups,
  getObjectDragOffset,
  translateObjectInCollection,
  translateObjectsBy,
} from '@/lib/canvasObjectTransform';

export interface ObjectDragSession {
  id: string;
  ids: string[];
  offsetX: number;
  offsetY: number;
}

export interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export type SelectPointerDownPlan =
  | { kind: 'shift-select'; selectedIds: string[] }
  | {
      kind: 'hit';
      /** `undefined` means keep the current selection. */
      selectedIds: string[] | undefined;
      drag: ObjectDragSession | null;
      haptic: boolean;
    }
  | { kind: 'marquee'; clearPrimarySelection: boolean; rect: SelectionRect };

export type SelectClickPlan =
  | { kind: 'noop' }
  | { kind: 'clear' }
  | { kind: 'select'; selectedIds: string[] };

export function planSelectPointerDown(args: {
  objects: DrawingObject[];
  world: { x: number; y: number };
  shiftKey: boolean;
  selectedObjectIds: string[];
}): SelectPointerDownPlan {
  const hitId = findCanvasObjectIdAt(args.objects, args.world.x, args.world.y, {
    includeImages: true,
  });
  if (hitId) {
    const obj = args.objects.find((object) => object.id === hitId);
    if (obj) {
      if (args.shiftKey) {
        return {
          kind: 'shift-select',
          selectedIds: selectionIdsForHit(args.objects, args.selectedObjectIds, hitId, true),
        };
      }
      const ids = selectionIdsForHit(args.objects, args.selectedObjectIds, hitId, false);
      const selectedIds =
        !args.selectedObjectIds.includes(hitId) || ids.length !== args.selectedObjectIds.length
          ? ids
          : undefined;
      if (obj.locked || !canTransformObjects(args.objects, ids)) {
        return { kind: 'hit', selectedIds, drag: null, haptic: true };
      }
      const offset = getObjectDragOffset(obj, args.world);
      return {
        kind: 'hit',
        selectedIds,
        haptic: true,
        drag: { id: hitId, ids, offsetX: offset.x, offsetY: offset.y },
      };
    }
  }

  return {
    kind: 'marquee',
    clearPrimarySelection: !args.shiftKey,
    rect: {
      startX: args.world.x,
      startY: args.world.y,
      endX: args.world.x,
      endY: args.world.y,
    },
  };
}

export function planSelectClick(args: {
  objects: DrawingObject[];
  world: { x: number; y: number };
  shiftKey: boolean;
  selectedObjectIds: string[];
}): SelectClickPlan {
  const hitId = findCanvasObjectIdAt(args.objects, args.world.x, args.world.y, {
    includeImages: true,
  });
  if (!hitId) {
    return args.shiftKey ? { kind: 'noop' } : { kind: 'clear' };
  }
  if (!args.objects.some((object) => object.id === hitId)) return { kind: 'noop' };
  if (args.shiftKey) {
    return {
      kind: 'select',
      selectedIds: selectionIdsForHit(args.objects, args.selectedObjectIds, hitId, true),
    };
  }
  return {
    kind: 'select',
    selectedIds: expandObjectIdsWithGroups(args.objects, [hitId]),
  };
}

export function extendSelectionRect(
  rect: SelectionRect,
  world: { x: number; y: number },
): SelectionRect {
  return { ...rect, endX: world.x, endY: world.y };
}

export function marqueeSelectedIds(
  objects: DrawingObject[],
  rect: SelectionRect,
): string[] {
  return expandObjectIdsWithGroups(objects, findCanvasObjectIdsInSelection(objects, rect));
}

export function applyObjectDrag(
  objects: DrawingObject[],
  drag: ObjectDragSession,
  world: { x: number; y: number },
): DrawingObject[] | null {
  const obj = objects.find((object) => object.id === drag.id);
  if (!obj) return null;
  if (drag.ids.length > 1) {
    return translateObjectsBy(
      objects,
      drag.ids,
      world.x - drag.offsetX - (obj.x ?? obj.points?.[0]?.x ?? 0),
      world.y - drag.offsetY - (obj.y ?? obj.points?.[0]?.y ?? 0),
    );
  }
  return translateObjectInCollection(objects, drag.id, world, {
    x: drag.offsetX,
    y: drag.offsetY,
  });
}

export function draggedObjectPreviews(
  objects: DrawingObject[],
  ids: readonly string[],
): DrawingObject[] {
  return objects.filter((object) => ids.includes(object.id));
}

export type DeleteSelectionPlan =
  | { kind: 'none' }
  | { kind: 'locked' }
  | { kind: 'delete'; remaining: DrawingObject[] };

export function planDeleteSelection(args: {
  projectRole: string | null | undefined;
  selectedObjectIds: readonly string[];
  objects: DrawingObject[];
}): DeleteSelectionPlan {
  if (args.projectRole === 'viewer' || args.selectedObjectIds.length === 0) return { kind: 'none' };
  const selectedIds = new Set(args.selectedObjectIds);
  if (args.objects.some((object) => selectedIds.has(object.id) && object.locked)) {
    return { kind: 'locked' };
  }
  return {
    kind: 'delete',
    remaining: args.objects.filter((object) => !selectedIds.has(object.id)),
  };
}
