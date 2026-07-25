import { useEffect, useRef } from 'react';
import type { CursorData } from '@/types/socket';

interface LiveCursorsProps {
  cursors: CursorData[];
  zoom: number;
  viewX: number;
  viewY: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function LiveCursors({
  cursors,
  zoom,
  viewX,
  viewY,
  canvasWidth,
  canvasHeight,
}: LiveCursorsProps) {
  const cursorRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Convert world coordinates to screen coordinates
  const worldToScreen = (worldX: number, worldY: number) => {
    const screenX = (worldX - viewX) * zoom;
    const screenY = (worldY - viewY) * zoom;
    return { screenX, screenY };
  };

  // Check if cursor is in viewport
  const isInViewport = (screenX: number, screenY: number) => {
    return (
      screenX >= -50 &&
      screenX <= canvasWidth + 50 &&
      screenY >= -50 &&
      screenY <= canvasHeight + 50
    );
  };

  useEffect(() => {
    // Clean up old cursors that are no longer active
    const activeCursorIds = new Set(cursors.map((c) => c.clientId ?? c.userId));
    for (const [userId, element] of cursorRefs.current.entries()) {
      if (!activeCursorIds.has(userId)) {
        element.remove();
        cursorRefs.current.delete(userId);
      }
    }
  }, [cursors]);

  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {cursors.map((cursor) => {
        const { screenX, screenY } = worldToScreen(cursor.x, cursor.y);
        const inView = isInViewport(screenX, screenY);

        if (!inView) return null;

        return (
          <div
            key={cursor.clientId ?? cursor.userId}
            ref={(el) => {
              if (el) {
                cursorRefs.current.set(cursor.clientId ?? cursor.userId, el);
              }
            }}
            className="absolute transition-transform duration-75 ease-out"
            style={{
              left: `${screenX}px`,
              top: `${screenY}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Cursor dot */}
            <div
              className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
              style={{
                backgroundColor: cursor.color,
              }}
            />

            {/* Username label */}
            <div
              className="absolute top-5 left-0 whitespace-nowrap px-2 py-1 rounded text-xs font-medium text-white shadow-lg"
              style={{
                backgroundColor: cursor.color,
              }}
            >
              {cursor.username}
            </div>
          </div>
        );
      })}
    </div>
  );
}
