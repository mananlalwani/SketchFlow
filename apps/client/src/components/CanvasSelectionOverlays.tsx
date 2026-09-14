import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DrawingObject } from '@/store/drawingStore';
import {
  getObjectBounds,
  unionObjectBounds,
  type ObjectBounds,
} from '@/lib/canvasObjectGeometry';
import type { TransformHandle } from '@/lib/canvasObjectTransform';
import type { SelectionPresence } from '@/types/socket';

interface CanvasSelectionOverlaysProps {
  objects: DrawingObject[];
  remoteSelections: SelectionPresence[];
  multiSelectionBounds: ObjectBounds | null;
  selectedBounds: ObjectBounds | null;
  selectedRotation: number;
  selectedCount: number;
  canDirectTransform: boolean;
  projectRole?: string | null;
  viewX: number;
  viewY: number;
  zoom: number;
  selectionRect: { startX: number; startY: number; endX: number; endY: number } | null;
  onStartTransform: (event: ReactPointerEvent<SVGElement>, handle: TransformHandle) => void;
  onDeleteSelected: () => void;
}

const HANDLE_OFFSETS = [
  ['nw', 0, 0],
  ['n', 0.5, 0],
  ['ne', 1, 0],
  ['e', 1, 0.5],
  ['se', 1, 1],
  ['s', 0.5, 1],
  ['sw', 0, 1],
  ['w', 0, 0.5],
] as const;

export function CanvasSelectionOverlays({
  objects,
  remoteSelections,
  multiSelectionBounds,
  selectedBounds,
  selectedRotation,
  selectedCount,
  canDirectTransform,
  projectRole,
  viewX,
  viewY,
  zoom,
  selectionRect,
  onStartTransform,
  onDeleteSelected,
}: CanvasSelectionOverlaysProps) {
  return (
    <>
      {remoteSelections.map((selection) => {
        const bounds = unionObjectBounds(
          selection.objectIds
            .map((id) => objects.find((object) => object.id === id))
            .filter((object): object is DrawingObject => Boolean(object))
            .map(getObjectBounds)
            .filter((objectBounds): objectBounds is ObjectBounds => objectBounds !== null),
        );
        if (!bounds) return null;
        const color = selection.color || '#8b5cf6';
        return (
          <svg
            key={selection.clientId ?? selection.userId}
            className="pointer-events-none absolute inset-0 z-[19] h-full w-full overflow-visible"
          >
            <rect
              x={(bounds.x - viewX) * zoom - 4}
              y={(bounds.y - viewY) * zoom - 4}
              width={Math.max(10, bounds.width * zoom + 8)}
              height={Math.max(10, bounds.height * zoom + 8)}
              rx="3"
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeDasharray="5 3"
            />
            <g
              transform={`translate(${(bounds.x - viewX) * zoom - 4} ${(bounds.y - viewY) * zoom - 24})`}
            >
              <rect width="112" height="17" rx="4" fill={color} />
              <text x="7" y="12" fill="white" fontSize="10" fontWeight="600">
                {selection.username} selecting
              </text>
            </g>
          </svg>
        );
      })}
      {multiSelectionBounds && (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
          <rect
            x={(multiSelectionBounds.x - viewX) * zoom - 5}
            y={(multiSelectionBounds.y - viewY) * zoom - 5}
            width={Math.max(12, multiSelectionBounds.width * zoom + 10)}
            height={Math.max(12, multiSelectionBounds.height * zoom + 10)}
            rx="3"
            fill="rgba(37, 99, 235, 0.04)"
            stroke="#2563eb"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          <g
            transform={`translate(${(multiSelectionBounds.x - viewX) * zoom - 5} ${(multiSelectionBounds.y - viewY) * zoom - 28})`}
          >
            <rect width="164" height="44" rx="6" fill="#2563eb" />
            <text x="10" y="27" fill="white" fontSize="11" fontWeight="600">
              {selectedCount} selected
            </text>
            {projectRole !== 'viewer' && (
              <g
                className="pointer-events-auto cursor-pointer"
                role="button"
                aria-label="Delete selected objects"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDeleteSelected();
                }}
              >
                <title>Delete selected objects</title>
                <rect x="120" width="40" height="44" rx="6" fill="#1d4ed8" />
                <text x="140" y="28" fill="white" fontSize="14" fontWeight="600" textAnchor="middle">
                  ×
                </text>
              </g>
            )}
          </g>
        </svg>
      )}
      {selectedBounds && !multiSelectionBounds && (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
          <g
            transform={`rotate(${selectedRotation} ${(selectedBounds.x + selectedBounds.width / 2 - viewX) * zoom} ${(selectedBounds.y + selectedBounds.height / 2 - viewY) * zoom})`}
          >
            <rect
              x={(selectedBounds.x - viewX) * zoom - 5}
              y={(selectedBounds.y - viewY) * zoom - 5}
              width={Math.max(12, selectedBounds.width * zoom + 10)}
              height={Math.max(12, selectedBounds.height * zoom + 10)}
              rx="2"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
            />
            {canDirectTransform && (
              <>
                <line
                  x1={(selectedBounds.x + selectedBounds.width / 2 - viewX) * zoom}
                  y1={(selectedBounds.y - viewY) * zoom - 5}
                  x2={(selectedBounds.x + selectedBounds.width / 2 - viewX) * zoom}
                  y2={(selectedBounds.y - viewY) * zoom - 28}
                  stroke="#2563eb"
                  strokeWidth="2"
                />
                <circle
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  cx={(selectedBounds.x + selectedBounds.width / 2 - viewX) * zoom}
                  cy={(selectedBounds.y - viewY) * zoom - 32}
                  r="6"
                  fill="white"
                  stroke="#2563eb"
                  strokeWidth="2"
                  onPointerDown={(event) => onStartTransform(event, 'rotate')}
                />
                {HANDLE_OFFSETS.map(([handle, horizontal, vertical]) => (
                  <rect
                    key={handle}
                    className="pointer-events-auto cursor-nwse-resize fill-white"
                    x={(selectedBounds.x + selectedBounds.width * horizontal - viewX) * zoom - 5}
                    y={(selectedBounds.y + selectedBounds.height * vertical - viewY) * zoom - 5}
                    width="10"
                    height="10"
                    rx="1"
                    stroke="#2563eb"
                    strokeWidth="2"
                    onPointerDown={(event) => onStartTransform(event, handle)}
                  />
                ))}
              </>
            )}
          </g>
        </svg>
      )}
      {selectionRect && (
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
          <rect
            x={(Math.min(selectionRect.startX, selectionRect.endX) - viewX) * zoom}
            y={(Math.min(selectionRect.startY, selectionRect.endY) - viewY) * zoom}
            width={Math.abs(selectionRect.endX - selectionRect.startX) * zoom}
            height={Math.abs(selectionRect.endY - selectionRect.startY) * zoom}
            fill="rgba(37, 99, 235, 0.12)"
            stroke="#2563eb"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
        </svg>
      )}
    </>
  );
}
