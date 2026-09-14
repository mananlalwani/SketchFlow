import { calculateTriangleVertices, WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/canvasViewport';
import { isTriangleMode } from '@/lib/canvasObjectGeometry';

interface PreviewDrawing {
  type: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface CanvasFigurePreviewProps {
  theme: 'dark' | 'light';
  viewX: number;
  viewY: number;
  zoom: number;
  previewDrawing: PreviewDrawing | null;
  triangleMode: string;
  starPoints: number;
  triangleVertices: { x: number; y: number }[];
  currentTool: string;
}

export function CanvasFigurePreview({
  theme,
  viewX,
  viewY,
  zoom,
  previewDrawing,
  triangleMode,
  starPoints,
  triangleVertices,
  currentTool,
}: CanvasFigurePreviewProps) {
  return (
    <>
      <svg className="absolute inset-0 z-10 h-full w-full pointer-events-none">
        <rect
          x={(0 - viewX) * zoom}
          y={(0 - viewY) * zoom}
          width={WORLD_WIDTH * zoom}
          height={WORLD_HEIGHT * zoom}
          fill="none"
          stroke={theme === 'dark' ? '#475569' : '#94a3b8'}
          strokeWidth={2}
        />
      </svg>
      {previewDrawing && (
        <svg className="absolute pointer-events-none h-full w-full">
          {previewDrawing.type === 'line' ? (
            <line
              x1={(previewDrawing.startX - viewX) * zoom}
              y1={(previewDrawing.startY - viewY) * zoom}
              x2={(previewDrawing.endX - viewX) * zoom}
              y2={(previewDrawing.endY - viewY) * zoom}
              stroke="#60a5fa"
              strokeWidth="2"
              strokeDasharray="8,4"
              opacity="0.6"
            />
          ) : (
            (() => {
              const x = (Math.min(previewDrawing.startX, previewDrawing.endX) - viewX) * zoom;
              const y = (Math.min(previewDrawing.startY, previewDrawing.endY) - viewY) * zoom;
              const w = Math.abs(previewDrawing.endX - previewDrawing.startX) * zoom;
              const h = Math.abs(previewDrawing.endY - previewDrawing.startY) * zoom;
              if (previewDrawing.type === 'ellipse') {
                return (
                  <ellipse
                    cx={x + w / 2}
                    cy={y + h / 2}
                    rx={w / 2}
                    ry={h / 2}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                    strokeDasharray="8,4"
                    opacity="0.6"
                  />
                );
              }
              if (previewDrawing.type === 'triangle') {
                if (!isTriangleMode(triangleMode)) return null;
                const vertices = calculateTriangleVertices(
                  previewDrawing.startX,
                  previewDrawing.startY,
                  previewDrawing.endX,
                  previewDrawing.endY,
                  triangleMode,
                );
                if (vertices.length !== 3) return null;
                const points = vertices
                  .map((vertex) => `${(vertex.x - viewX) * zoom},${(vertex.y - viewY) * zoom}`)
                  .join(' ');
                return (
                  <polygon
                    points={points}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                    strokeDasharray="8,4"
                    opacity="0.6"
                  />
                );
              }
              if (previewDrawing.type === 'star') {
                const centerX = (previewDrawing.startX - viewX) * zoom;
                const centerY = (previewDrawing.startY - viewY) * zoom;
                const dx = (previewDrawing.endX - previewDrawing.startX) * zoom;
                const dy = (previewDrawing.endY - previewDrawing.startY) * zoom;
                const outerRadius = Math.hypot(dx, dy);
                if (outerRadius < 5) return null;
                const innerRadius = outerRadius * 0.38;
                const star = Array.from({ length: starPoints * 2 }, (_, i) => {
                  const angle = (i * Math.PI) / starPoints - Math.PI / 2;
                  const radius = i % 2 === 0 ? outerRadius : innerRadius;
                  return `${centerX + radius * Math.cos(angle)},${centerY + radius * Math.sin(angle)}`;
                });
                return (
                  <polygon
                    points={star.join(' ')}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                    strokeDasharray="8,4"
                    opacity="0.6"
                  />
                );
              }
              return (
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2"
                  strokeDasharray="8,4"
                  opacity="0.6"
                />
              );
            })()
          )}
        </svg>
      )}
      {currentTool === 'triangle' && triangleMode === 'custom' && triangleVertices.length > 0 && (
        <svg className="absolute pointer-events-none h-full w-full">
          {triangleVertices.map((vertex, index) => (
            <circle
              key={index}
              cx={(vertex.x - viewX) * zoom}
              cy={(vertex.y - viewY) * zoom}
              r="5"
              fill="#60a5fa"
              opacity="0.8"
            />
          ))}
          {triangleVertices.length >= 2 && (
            <line
              x1={(triangleVertices[0].x - viewX) * zoom}
              y1={(triangleVertices[0].y - viewY) * zoom}
              x2={(triangleVertices[1].x - viewX) * zoom}
              y2={(triangleVertices[1].y - viewY) * zoom}
              stroke="#60a5fa"
              strokeWidth="2"
              strokeDasharray="8,4"
              opacity="0.6"
            />
          )}
        </svg>
      )}
    </>
  );
}
