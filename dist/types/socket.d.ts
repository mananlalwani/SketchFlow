export interface StrokeData {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    color: string;
    size: number;
    alpha?: number;
    blend?: string;
    timestamp?: number;
}
export interface ShapeData {
    id: string;
    type: 'line' | 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'parabola' | 'text';
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    size: number;
    alpha: number;
    filled?: boolean;
    orientation?: 'up' | 'down' | 'left' | 'right';
    text?: string;
    fontSize?: number;
    timestamp?: number;
}
export interface CanvasSnapshot {
    dataUrl: string;
    worldW?: number;
    worldH?: number;
    timestamp?: number;
}
export interface ServerToClientEvents {
    'draw:stroke': (stroke: StrokeData) => void;
    'draw:strokes': (strokes: StrokeData[]) => void;
    'draw:shape': (shape: ShapeData) => void;
    'canvas:snapshot': (snapshot: CanvasSnapshot) => void;
    'canvas:clear': () => void;
    'connection:count': (count: number) => void;
}
export interface ClientToServerEvents {
    'draw:stroke': (stroke: StrokeData) => void;
    'draw:strokes': (strokes: StrokeData[]) => void;
    'draw:shape': (shape: ShapeData) => void;
    'canvas:snapshot': (snapshot: CanvasSnapshot) => void;
    'canvas:clear': () => void;
}
export interface InterServerEvents {
    ping: () => void;
}
export interface SocketData {
    userId?: string;
    userName?: string;
}
//# sourceMappingURL=socket.d.ts.map