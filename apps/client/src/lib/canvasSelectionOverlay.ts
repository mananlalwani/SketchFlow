/** Bounds and handle eligibility for the selection overlay. */
import type { DrawingObject } from '@/store/drawingStore';
import {
  canDirectTransformObject,
  getObjectBounds,
  unionObjectBounds,
} from '@/lib/canvasObjectGeometry';

export function selectionOverlayModel(args: {
  selectedObject: DrawingObject | undefined;
  selectedObjects: DrawingObject[];
  selectedObjectIds: string[];
  dragPreviewObject: DrawingObject | null;
  dragPreviewObjects: DrawingObject[] | null;
  projectRole: string | null | undefined;
}) {
  const displayedSelectedObjects = args.dragPreviewObjects ?? args.selectedObjects;
  const multiSelectionBounds =
    displayedSelectedObjects.length > 1
      ? unionObjectBounds(
          displayedSelectedObjects
            .map(getObjectBounds)
            .filter((bounds): bounds is NonNullable<typeof bounds> => bounds !== null),
        )
      : null;
  const selectedDisplayObject =
    args.dragPreviewObjects?.find((object) => object.id === args.selectedObject?.id) ??
    (args.dragPreviewObject?.id === args.selectedObject?.id
      ? args.dragPreviewObject
      : args.selectedObject);
  return {
    displayedSelectedObjects,
    multiSelectionBounds,
    selectedBounds: selectedDisplayObject ? getObjectBounds(selectedDisplayObject) : null,
    selectedRotation: selectedDisplayObject?.rotation ?? 0,
    canDirectTransform: canDirectTransformObject(
      args.selectedObject,
      args.selectedObjectIds.length,
      args.projectRole,
    ),
  };
}
