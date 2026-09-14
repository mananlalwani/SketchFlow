import type { PresentationCommand } from '@/lib/canvasPresentation';
import type { DrawingObject } from '@/store/drawingStore';
import { getObjectDirtyRect, rectsOverlap } from '@/lib/canvasObjectGeometry';
import { sendRetainedObjects } from '@/lib/canvasRendererObject';

export function eraseObjectFromScene(
  send: (message: PresentationCommand) => void,
  removed: DrawingObject,
  remaining: DrawingObject[],
): void {
  const dirty = getObjectDirtyRect(removed);
  send({
    type: 'clear-region',
    x: dirty.x,
    y: dirty.y,
    width: dirty.width,
    height: dirty.height,
  });
  sendRetainedObjects(
    send,
    remaining.filter((object) => rectsOverlap(getObjectDirtyRect(object), dirty)),
  );
}
