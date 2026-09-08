export interface RendererDrawing {
  type:
    | 'stroke'
    | 'line'
    | 'rectangle'
    | 'ellipse'
    | 'circle'
    | 'triangle'
    | 'parabola'
    | 'text'
    | 'image'
    | 'arrow'
    | 'star';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  size: number;
  alpha?: number;
  filled?: boolean;
  orientation?: 'up' | 'down' | 'left' | 'right';
  points?: { x: number; y: number; width?: number }[];
  text?: string;
  fontSize?: number;
  imageData?: string;
  rotation?: number;
  properties?: { pointCount?: number; rotation?: number; hidden?: boolean };
  hidden?: boolean;
}

export interface RendererDrawingContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
  ): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillText(text: string, x: number, y: number): void;
  globalAlpha: number;
  strokeStyle: CanvasRenderingContext2D['strokeStyle'];
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  font: string;
  textBaseline: CanvasTextBaseline;
}

/** Shared retained-object drawing semantics for the main-thread adapter. */
export function drawRendererObject(context: RendererDrawingContext, object: RendererDrawing) {
  if (object.hidden || object.properties?.hidden) return;
  if (object.type !== 'stroke' && (object.x === undefined || object.y === undefined)) return;
  const x = object.x ?? 0;
  const y = object.y ?? 0;
  const width = object.width ?? 0;
  const height = object.height ?? 0;
  context.save();
  context.globalAlpha = object.alpha ?? 1;
  context.strokeStyle = object.color;
  context.fillStyle = object.color;
  context.lineWidth = object.size;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const rotation = object.rotation ?? object.properties?.rotation ?? 0;
  if (rotation) {
    context.translate(x + width / 2, y + height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.translate(-(x + width / 2), -(y + height / 2));
  }
  context.beginPath();
  switch (object.type) {
    case 'line':
      context.moveTo(x, y);
      context.lineTo(x + width, y + height);
      context.stroke();
      break;
    case 'stroke':
      if (object.points && object.points.length > 1) {
        for (let i = 1; i < object.points.length; i++) {
          const from = object.points[i - 1];
          const to = object.points[i];
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.lineWidth = to.width ?? object.size;
          context.stroke();
        }
      }
      break;
    case 'rectangle':
      if (object.filled) context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
      break;
    case 'ellipse':
      context.ellipse(
        x + width / 2,
        y + height / 2,
        Math.abs(width) / 2,
        Math.abs(height) / 2,
        0,
        0,
        Math.PI * 2,
      );
      if (object.filled) context.fill();
      context.stroke();
      break;
    case 'circle':
      context.arc(
        x + width / 2,
        y + height / 2,
        Math.min(Math.abs(width), Math.abs(height)) / 2,
        0,
        Math.PI * 2,
      );
      if (object.filled) context.fill();
      context.stroke();
      break;
    case 'triangle': {
      const points =
        object.points?.length === 3
          ? object.points
          : [
              { x: x + width / 2, y },
              { x, y: y + height },
              { x: x + width, y: y + height },
            ];
      context.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.closePath();
      if (object.filled) context.fill();
      context.stroke();
      break;
    }
    case 'star': {
      const count = object.properties?.pointCount ?? 5;
      const cx = x + width / 2;
      const cy = y + height / 2;
      const outer = Math.min(Math.abs(width), Math.abs(height)) / 2;
      const inner = outer * 0.38;
      for (let i = 0; i < count * 2; i++) {
        const angle = (i * Math.PI) / count - Math.PI / 2;
        const radius = i % 2 ? inner : outer;
        const px = cx + radius * Math.cos(angle);
        const py = cy + radius * Math.sin(angle);
        if (!i) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      if (object.filled) context.fill();
      context.stroke();
      break;
    }
    case 'arrow': {
      const points =
        object.points?.length && object.points.length >= 2
          ? object.points
          : [
              { x, y },
              { x: x + width, y: y + height },
            ];
      const start = points[0];
      const end = points[1];
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const length = 15;
      const wing = Math.PI / 6;
      context.beginPath();
      context.moveTo(
        end.x - length * Math.cos(angle - wing),
        end.y - length * Math.sin(angle - wing),
      );
      context.lineTo(end.x, end.y);
      context.lineTo(
        end.x - length * Math.cos(angle + wing),
        end.y - length * Math.sin(angle + wing),
      );
      context.stroke();
      break;
    }
    case 'parabola': {
      if (object.points && object.points.length > 1) {
        context.moveTo(object.points[0].x, object.points[0].y);
        object.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      } else {
        const sideways = object.orientation === 'left' || object.orientation === 'right';
        const direction = object.orientation === 'left' || object.orientation === 'up' ? -1 : 1;
        for (let i = 0; i <= 64; i++) {
          const t = i / 64;
          const n = (t - 0.5) * 2;
          const px = sideways
            ? x + (direction > 0 ? 0 : width) + direction * width * n ** 2
            : x + t * width;
          const py = sideways
            ? y + t * height
            : y + (direction > 0 ? 0 : height) + direction * height * n ** 2;
          if (!i) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
      }
      context.stroke();
      break;
    }
    case 'text':
      if (object.text) {
        const fontSize = object.fontSize ?? 24;
        context.font = `${fontSize}px Inter, system-ui, sans-serif`;
        context.textBaseline = 'top';
        const lineHeight = fontSize * 1.4;
        object.text
          .split('\n')
          .forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
      }
      break;
    case 'image':
      // Images are loaded by the fallback hook and drawn when ready.
      break;
  }
  context.restore();
}
