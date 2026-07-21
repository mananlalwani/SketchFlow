export interface CullableObject {
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: { x: number; y: number }[];
  size?: number;
}

export function objectIntersectsViewport(
  object: CullableObject,
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number,
): boolean {
  const margin = Math.max(2, object.size || 1);
  if (object.type === 'stroke' && object.points?.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of object.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return !(maxX + margin < viewLeft || minX - margin > viewRight || maxY + margin < viewTop || minY - margin > viewBottom);
  }

  if (object.x === undefined || object.y === undefined || object.width === undefined || object.height === undefined) {
    return true;
  }
  const endX = object.x + object.width;
  const endY = object.y + object.height;
  return !(
    Math.max(object.x, endX) + margin < viewLeft ||
    Math.min(object.x, endX) - margin > viewRight ||
    Math.max(object.y, endY) + margin < viewTop ||
    Math.min(object.y, endY) - margin > viewBottom
  );
}
