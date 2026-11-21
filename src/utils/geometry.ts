import type {
  BoardObject,
  ConnectorObject,
  PortSide,
  ShapeObject,
  StrokePoint,
} from '../types/smartboard';

export function uid(prefix = 'obj'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function getPortPoint(obj: BoardObject, port: PortSide): { x: number; y: number } {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  switch (port) {
    case 'top':
      return { x: cx, y: obj.y };
    case 'right':
      return { x: obj.x + obj.width, y: cy };
    case 'bottom':
      return { x: cx, y: obj.y + obj.height };
    case 'left':
      return { x: obj.x, y: cy };
    default:
      return { x: cx, y: cy };
  }
}

export function getClosestPort(obj: BoardObject, wx: number, wy: number): { side: PortSide; x: number; y: number } {
  const sides: PortSide[] = ['top', 'right', 'bottom', 'left'];
  let bestSide: PortSide = 'right';
  let bestPt = getPortPoint(obj, 'right');
  let bestDist = Infinity;
  for (const s of sides) {
    const pt = getPortPoint(obj, s);
    const d = dist(wx, wy, pt.x, pt.y);
    if (d < bestDist) {
      bestDist = d;
      bestSide = s;
      bestPt = pt;
    }
  }
  return { side: bestSide, ...bestPt };
}

export function getNearestPortsBetweenObjects(
  fromObj: BoardObject,
  toObj: BoardObject
): { fromPort: PortSide; toPort: PortSide; x1: number; y1: number; x2: number; y2: number } {
  const sides: PortSide[] = ['top', 'right', 'bottom', 'left'];
  let bestDist = Infinity;
  let result = {
    fromPort: 'right' as PortSide,
    toPort: 'left' as PortSide,
    x1: fromObj.x + fromObj.width,
    y1: fromObj.y + fromObj.height / 2,
    x2: toObj.x,
    y2: toObj.y + toObj.height / 2,
  };
  for (const fp of sides) {
    const p1 = getPortPoint(fromObj, fp);
    for (const tp of sides) {
      const p2 = getPortPoint(toObj, tp);
      const d = dist(p1.x, p1.y, p2.x, p2.y);
      if (d < bestDist) {
        bestDist = d;
        result = { fromPort: fp, toPort: tp, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }
    }
  }
  return result;
}

export function scalePointToBox(
  pt: { x: number; y: number },
  oldBox: { x: number; y: number; width: number; height: number },
  newBox: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  const ow = Math.max(1, oldBox.width);
  const oh = Math.max(1, oldBox.height);
  return {
    x: newBox.x + ((pt.x - oldBox.x) / ow) * newBox.width,
    y: newBox.y + ((pt.y - oldBox.y) / oh) * newBox.height,
  };
}

export function scalePointsToBox<T extends { x: number; y: number }>(
  points: T[],
  oldBox: { x: number; y: number; width: number; height: number },
  newBox: { x: number; y: number; width: number; height: number }
): T[] {
  const ow = Math.max(1, oldBox.width);
  const oh = Math.max(1, oldBox.height);
  return points.map((pt) => ({
    ...pt,
    x: newBox.x + ((pt.x - oldBox.x) / ow) * newBox.width,
    y: newBox.y + ((pt.y - oldBox.y) / oh) * newBox.height,
  }));
}

export function toObjectLocalPoint(
  obj: { x: number; y: number; width: number; height: number; rotation?: number; flipX?: boolean; flipY?: boolean },
  wx: number,
  wy: number,
  includeFlip = true
): { x: number; y: number } {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  let lx = wx;
  let ly = wy;
  if (obj.rotation) {
    const rad = (-obj.rotation * Math.PI) / 180;
    const dx = wx - cx;
    const dy = wy - cy;
    lx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
    ly = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  }
  if (includeFlip) {
    if (obj.flipX) lx = 2 * cx - lx;
    if (obj.flipY) ly = 2 * cy - ly;
  }
  return { x: lx, y: ly };
}

export function fromObjectLocalPoint(
  obj: { x: number; y: number; width: number; height: number; rotation?: number; flipX?: boolean; flipY?: boolean },
  lx: number,
  ly: number,
  includeFlip = true
): { x: number; y: number } {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  let fx = lx;
  let fy = ly;
  if (includeFlip) {
    if (obj.flipX) fx = 2 * cx - fx;
    if (obj.flipY) fy = 2 * cy - fy;
  }
  if (obj.rotation) {
    const rad = (obj.rotation * Math.PI) / 180;
    const dx = fx - cx;
    const dy = fy - cy;
    return {
      x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
    };
  }
  return { x: fx, y: fy };
}

export function eraseStrokeByRadius<
  T extends {
    id: string;
    type: 'stroke';
    points: StrokePoint[];
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
  },
>(
  stroke: T,
  wx: number,
  wy: number,
  radius: number,
  shape: 'circle' | 'square' = 'circle'
): { changed: boolean; pieces: T[] } {
  const rawPts = stroke.points;
  if (rawPts.length === 0) return { changed: false, pieces: [] };
  const hasTransform = Boolean(stroke.rotation || stroke.flipX || stroke.flipY);
  const pts = hasTransform
    ? rawPts.map((p) => ({ ...p, ...fromObjectLocalPoint(stroke, p.x, p.y) }))
    : rawPts;
  const inNib = (x: number, y: number) => shape === 'square'
    ? Math.max(Math.abs(x - wx), Math.abs(y - wy)) <= radius
    : dist(x, y, wx, wy) <= radius;
  const keep = pts.map((p) => !inNib(p.x, p.y));
  const edgeCut = pts.map((p, idx) => {
    if (idx === 0) return false;
    if (shape === 'circle') return distToSegment(wx, wy, pts[idx - 1].x, pts[idx - 1].y, p.x, p.y) <= radius;
    const a = pts[idx - 1];
    const steps = Math.max(2, Math.ceil(dist(a.x, a.y, p.x, p.y) / Math.max(2, radius / 2)));
    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      if (inNib(a.x + (p.x - a.x) * t, a.y + (p.y - a.y) * t)) return true;
    }
    return false;
  });

  if (keep.every(Boolean) && !edgeCut.some(Boolean)) {
    return { changed: false, pieces: [stroke] };
  }

  const segments: StrokePoint[][] = [];
  let cur: StrokePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (!keep[i]) {
      if (cur.length > 0) {
        segments.push(cur);
        cur = [];
      }
      continue;
    }
    if (cur.length > 0 && edgeCut[i]) {
      segments.push(cur);
      cur = [];
    }
    cur.push(pts[i]);
  }
  if (cur.length > 0) segments.push(cur);

  const pieces: T[] = [];
  segments.forEach((seg, idx) => {
    if (seg.length === 0) return;
    if (seg.length === 1 && pts.length > 1) return;
    const minX = Math.min(...seg.map((p) => p.x));
    const minY = Math.min(...seg.map((p) => p.y));
    const maxX = Math.max(...seg.map((p) => p.x));
    const maxY = Math.max(...seg.map((p) => p.y));
    pieces.push({
      ...stroke,
      id: idx === 0 ? stroke.id : uid('stroke'),
      points: seg,
      x: minX,
      y: minY,
      width: Math.max(4, maxX - minX),
      height: Math.max(4, maxY - minY),
      rotation: 0,
      flipX: false,
      flipY: false,
    });
  });

  return { changed: true, pieces };
}

function pointInRect(x: number, y: number, r: { x: number; y: number; width: number; height: number }): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const ccw = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number) =>
    (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
  return (
    ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
    ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
  );
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: { x: number; y: number; width: number; height: number }
): boolean {
  if (pointInRect(x1, y1, r) || pointInRect(x2, y2, r)) return true;
  const rx2 = r.x + r.width;
  const ry2 = r.y + r.height;
  return (
    segmentsIntersect(x1, y1, x2, y2, r.x, r.y, rx2, r.y) ||
    segmentsIntersect(x1, y1, x2, y2, rx2, r.y, rx2, ry2) ||
    segmentsIntersect(x1, y1, x2, y2, rx2, ry2, r.x, ry2) ||
    segmentsIntersect(x1, y1, x2, y2, r.x, ry2, r.x, r.y)
  );
}

export function eraseStrokeByRect<
  T extends {
    id: string;
    type: 'stroke';
    points: StrokePoint[];
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
  },
>(
  stroke: T,
  rect: { x: number; y: number; width: number; height: number }
): { changed: boolean; pieces: T[] } {
  const rawPts = stroke.points;
  if (rawPts.length === 0) return { changed: false, pieces: [] };
  const hasTransform = Boolean(stroke.rotation || stroke.flipX || stroke.flipY);
  const pts = hasTransform
    ? rawPts.map((p) => ({ ...p, ...fromObjectLocalPoint(stroke, p.x, p.y) }))
    : rawPts;
  const keep = pts.map((p) => !pointInRect(p.x, p.y, rect));
  const edgeCut = pts.map((p, idx) =>
    idx > 0 && segmentIntersectsRect(pts[idx - 1].x, pts[idx - 1].y, p.x, p.y, rect)
  );

  if (keep.every(Boolean) && !edgeCut.some(Boolean)) {
    return { changed: false, pieces: [stroke] };
  }

  const segments: StrokePoint[][] = [];
  let cur: StrokePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (!keep[i]) {
      if (cur.length > 0) {
        segments.push(cur);
        cur = [];
      }
      continue;
    }
    if (cur.length > 0 && edgeCut[i]) {
      segments.push(cur);
      cur = [];
    }
    cur.push(pts[i]);
  }
  if (cur.length > 0) segments.push(cur);

  const pieces: T[] = [];
  segments.forEach((seg, idx) => {
    if (seg.length === 0) return;
    if (seg.length === 1 && pts.length > 1) return;
    const minX = Math.min(...seg.map((p) => p.x));
    const minY = Math.min(...seg.map((p) => p.y));
    const maxX = Math.max(...seg.map((p) => p.x));
    const maxY = Math.max(...seg.map((p) => p.y));
    pieces.push({
      ...stroke,
      id: idx === 0 ? stroke.id : uid('stroke'),
      points: seg,
      x: minX,
      y: minY,
      width: Math.max(4, maxX - minX),
      height: Math.max(4, maxY - minY),
      rotation: 0,
      flipX: false,
      flipY: false,
    });
  });

  return { changed: true, pieces };
}

export function pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function resolveConnectorEndpoints(
  conn: ConnectorObject,
  objectsById: Map<string, BoardObject>
): { x1: number; y1: number; x2: number; y2: number } {
  let x1 = conn.x1;
  let y1 = conn.y1;
  let x2 = conn.x2;
  let y2 = conn.y2;
  const boundaryPoint = (obj: BoardObject, tx: number, ty: number) => {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const target = obj.rotation ? rotatePointAround(tx, ty, cx, cy, -obj.rotation) : { x: tx, y: ty };
    const dx = target.x - cx;
    const dy = target.y - cy;
    const denom = Math.max(Math.abs(dx) / Math.max(1, obj.width / 2), Math.abs(dy) / Math.max(1, obj.height / 2), 0.0001);
    const local = { x: cx + dx / denom, y: cy + dy / denom };
    return obj.rotation ? rotatePointAround(local.x, local.y, cx, cy, obj.rotation) : local;
  };
  if (conn.fromId) {
    const fromObj = objectsById.get(conn.fromId);
    if (fromObj) {
      const targetObj = conn.toId ? objectsById.get(conn.toId) : undefined;
      const p = conn.anchorPreset === 'anywhere'
        ? boundaryPoint(fromObj, targetObj ? targetObj.x + targetObj.width / 2 : x2, targetObj ? targetObj.y + targetObj.height / 2 : y2)
        : getPortPoint(fromObj, conn.fromPort || 'right');
      x1 = p.x;
      y1 = p.y;
    }
  }
  if (conn.toId) {
    const toObj = objectsById.get(conn.toId);
    if (toObj) {
      const p = conn.anchorPreset === 'anywhere'
        ? boundaryPoint(toObj, x1, y1)
        : getPortPoint(toObj, conn.toPort || 'left');
      x2 = p.x;
      y2 = p.y;
    }
  }
  return { x1, y1, x2, y2 };
}

export function hitTestObject(
  obj: BoardObject,
  wx: number,
  wy: number,
  objectsById: Map<string, BoardObject>,
  tolerance = 8
): boolean {
  if (obj.hidden) return false;

  if (obj.type === 'stroke') {
    const pts = obj.points;
    if (pts.length === 0) return false;
    const local = toObjectLocalPoint(obj, wx, wy, true);
    if (
      local.x < obj.x - tolerance - obj.strokeWidth ||
      local.x > obj.x + obj.width + tolerance + obj.strokeWidth ||
      local.y < obj.y - tolerance - obj.strokeWidth ||
      local.y > obj.y + obj.height + tolerance + obj.strokeWidth
    ) {
      return false;
    }
    const tol = Math.max(tolerance, obj.strokeWidth / 2 + 4);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(local.x, local.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= tol) {
        return true;
      }
    }
    return dist(local.x, local.y, pts[0].x, pts[0].y) <= tol;
  }

  if (obj.type === 'line') {
    const pts = obj.points;
    const local = toObjectLocalPoint(obj, wx, wy, true);
    const tol = Math.max(tolerance, obj.strokeWidth / 2 + 5);
    if (obj.curved && pts.length >= 2) {
      const p0 = pts[0];
      const p1 = pts[pts.length - 1];
      const cpx = typeof obj.cpX === 'number' ? obj.cpX : (p0.x + p1.x) / 2;
      const cpy = typeof obj.cpY === 'number' ? obj.cpY : Math.min(p0.y, p1.y) - 60;
      let prevX = p0.x;
      let prevY = p0.y;
      const steps = 16;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        const bx = u * u * p0.x + 2 * u * t * cpx + t * t * p1.x;
        const by = u * u * p0.y + 2 * u * t * cpy + t * t * p1.y;
        if (distToSegment(local.x, local.y, prevX, prevY, bx, by) <= tol) return true;
        prevX = bx;
        prevY = by;
      }
      return false;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(local.x, local.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= tol) {
        return true;
      }
    }
    return false;
  }

  if (obj.type === 'connector') {
    const { x1, y1, x2, y2 } = resolveConnectorEndpoints(obj, objectsById);
    const tol = Math.max(tolerance, obj.strokeWidth + 6);
    if (obj.routeType === 'orthogonal') {
      const mx = (x1 + x2) / 2;
      return (
        distToSegment(wx, wy, x1, y1, mx, y1) <= tol ||
        distToSegment(wx, wy, mx, y1, mx, y2) <= tol ||
        distToSegment(wx, wy, mx, y2, x2, y2) <= tol
      );
    }
    if (obj.routeType === 'curved') {
      const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
      const sx = x2 >= x1 ? 1 : -1;
      const cp1x = x1 + dx * sx;
      const cp1y = y1;
      const cp2x = x2 - dx * sx;
      const cp2y = y2;
      let prevX = x1;
      let prevY = y1;
      const steps = 12;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        const bx = u * u * u * x1 + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * x2;
        const by = u * u * u * y1 + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * y2;
        if (distToSegment(wx, wy, prevX, prevY, bx, by) <= tol) return true;
        prevX = bx;
        prevY = by;
      }
      return false;
    }
    return distToSegment(wx, wy, x1, y1, x2, y2) <= tol;
  }

  // Rotate hit point into local object coordinates if rotated
  const local = toObjectLocalPoint(obj, wx, wy, false);

  return (
    local.x >= obj.x - tolerance &&
    local.x <= obj.x + obj.width + tolerance &&
    local.y >= obj.y - tolerance &&
    local.y <= obj.y + obj.height + tolerance
  );
}

export function smoothStrokePoints(points: StrokePoint[], smoothingFactor: number, stabilization = 0): StrokePoint[] {
  if (points.length < 3 || smoothingFactor <= 0) return points;
  const iterations = Math.min(3, Math.ceil(smoothingFactor));
  const mix = 0.25 + Math.max(0, Math.min(1, stabilization)) * 0.2;
  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: StrokePoint[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];
      next.push({
        x: (1 - mix) * p0.x + mix * p1.x,
        y: (1 - mix) * p0.y + mix * p1.y,
        p: (1 - mix) * p0.p + mix * p1.p,
        ...(typeof p0.tiltX === 'number' && typeof p1.tiltX === 'number' ? { tiltX: (1 - mix) * p0.tiltX + mix * p1.tiltX } : {}),
        ...(typeof p0.tiltY === 'number' && typeof p1.tiltY === 'number' ? { tiltY: (1 - mix) * p0.tiltY + mix * p1.tiltY } : {}),
      });
      next.push({
        x: mix * p0.x + (1 - mix) * p1.x,
        y: mix * p0.y + (1 - mix) * p1.y,
        p: mix * p0.p + (1 - mix) * p1.p,
        ...(typeof p0.tiltX === 'number' && typeof p1.tiltX === 'number' ? { tiltX: mix * p0.tiltX + (1 - mix) * p1.tiltX } : {}),
        ...(typeof p0.tiltY === 'number' && typeof p1.tiltY === 'number' ? { tiltY: mix * p0.tiltY + (1 - mix) * p1.tiltY } : {}),
      });
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

// Fast heuristic smart-shape recognizer for freehand strokes
export function recognizeRoughShape(
  points: StrokePoint[],
  strokeColor: string,
  strokeWidth: number
): BoardObject | null {
  if (points.length < 6) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let pathLen = 0;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
    if (i > 0) pathLen += dist(points[i - 1].x, points[i - 1].y, pt.x, pt.y);
  }
  const w = Math.max(12, maxX - minX);
  const h = Math.max(12, maxY - minY);
  const start = points[0];
  const end = points[points.length - 1];
  const directDist = dist(start.x, start.y, end.x, end.y);
  const diag = Math.hypot(w, h);

  // Straight line check
  if (pathLen > 24 && directDist / pathLen > 0.91) {
    return {
      id: uid('line'),
      name: 'Smart Line',
      type: 'line',
      x: minX,
      y: minY,
      width: w,
      height: h,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 10,
      points: [
        { x: start.x, y: start.y },
        { x: end.x, y: end.y },
      ],
      stroke: strokeColor,
      strokeWidth,
      lineStyle: 'solid',
      startHead: 'none',
      endHead: 'none',
    };
  }

  // Closed shape check
  if (directDist < Math.max(36, diag * 0.25)) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const radii = points.map((p) => Math.hypot((p.x - cx) / (w / 2 || 1), (p.y - cy) / (h / 2 || 1)));
    const avgR = radii.reduce((a, b) => a + b, 0) / radii.length;
    const variance = radii.reduce((a, r) => a + Math.abs(r - avgR), 0) / radii.length;

    const baseShape: ShapeObject = {
      id: uid('shape'),
      name: 'Smart Shape',
      type: 'shape',
      shapeKind: 'rectangle',
      x: minX,
      y: minY,
      width: w,
      height: h,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 10,
      fill: 'transparent',
      stroke: strokeColor,
      strokeWidth,
      text: '',
      textColor: '#0F172A',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 15,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'center',
    };

    if (variance < 0.16) {
      const aspect = Math.min(w, h) / Math.max(w, h);
      baseShape.shapeKind = aspect > 0.82 ? 'circle' : 'ellipse';
      if (baseShape.shapeKind === 'circle') {
        const s = Math.max(w, h);
        baseShape.width = s;
        baseShape.height = s;
      }
      return baseShape;
    }

    // Check triangle vs rectangle via bounding area fill / corner proximity
    const topPts = points.filter((p) => p.y < minY + h * 0.25);
    const bottomPts = points.filter((p) => p.y > maxY - h * 0.25);
    const topSpread =
      topPts.length > 1
        ? Math.max(...topPts.map((p) => p.x)) - Math.min(...topPts.map((p) => p.x))
        : 0;
    const bottomSpread =
      bottomPts.length > 1
        ? Math.max(...bottomPts.map((p) => p.x)) - Math.min(...bottomPts.map((p) => p.x))
        : 0;

    if (topSpread < w * 0.42 && bottomSpread > w * 0.6) {
      baseShape.shapeKind = 'triangle';
      return baseShape;
    }

    baseShape.shapeKind = Math.abs(w - h) < 20 ? 'square' : 'rounded_rect';
    return baseShape;
  }

  return null;
}

export function syncConnectorBounds(objects: BoardObject[]): BoardObject[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  let changed = false;
  const next = objects.map((o) => {
    if (o.type !== 'connector') return o;
    const { x1, y1, x2, y2 } = resolveConnectorEndpoints(o, byId);
    const nx = Math.round(Math.min(x1, x2));
    const ny = Math.round(Math.min(y1, y2));
    const nw = Math.max(4, Math.round(Math.abs(x2 - x1)));
    const nh = Math.max(4, Math.round(Math.abs(y2 - y1)));
    if (
      Math.round(o.x1) === Math.round(x1) &&
      Math.round(o.y1) === Math.round(y1) &&
      Math.round(o.x2) === Math.round(x2) &&
      Math.round(o.y2) === Math.round(y2) &&
      o.x === nx &&
      o.y === ny &&
      o.width === nw &&
      o.height === nh
    ) {
      return o;
    }
    changed = true;
    return {
      ...o,
      x1,
      y1,
      x2,
      y2,
      x: nx,
      y: ny,
      width: nw,
      height: nh,
    };
  });
  return changed ? next : objects;
}

export function alignObjects(
  objects: BoardObject[],
  selectedIds: Set<string>,
  mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute_h' | 'distribute_v'
): BoardObject[] {
  const selected = objects.filter((o) => selectedIds.has(o.id));
  if (selected.length < 2) return objects;

  const minX = Math.min(...selected.map((o) => o.x));
  const maxX = Math.max(...selected.map((o) => o.x + o.width));
  const minY = Math.min(...selected.map((o) => o.y));
  const maxY = Math.max(...selected.map((o) => o.y + o.height));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const posMap = new Map<string, { x: number; y: number }>();

  if (mode === 'distribute_h' && selected.length >= 3) {
    const sorted = [...selected].sort((a, b) => a.x - b.x);
    const totalWidth = sorted.reduce((acc, o) => acc + o.width, 0);
    const gap = (maxX - minX - totalWidth) / (sorted.length - 1);
    let cursor = minX;
    for (const o of sorted) {
      posMap.set(o.id, { x: cursor, y: o.y });
      cursor += o.width + gap;
    }
  } else if (mode === 'distribute_v' && selected.length >= 3) {
    const sorted = [...selected].sort((a, b) => a.y - b.y);
    const totalHeight = sorted.reduce((acc, o) => acc + o.height, 0);
    const gap = (maxY - minY - totalHeight) / (sorted.length - 1);
    let cursor = minY;
    for (const o of sorted) {
      posMap.set(o.id, { x: o.x, y: cursor });
      cursor += o.height + gap;
    }
  } else {
    for (const o of selected) {
      let x = o.x;
      let y = o.y;
      if (mode === 'left') x = minX;
      if (mode === 'center') x = midX - o.width / 2;
      if (mode === 'right') x = maxX - o.width;
      if (mode === 'top') y = minY;
      if (mode === 'middle') y = midY - o.height / 2;
      if (mode === 'bottom') y = maxY - o.height;
      posMap.set(o.id, { x, y });
    }
  }

  const moved = objects.map((o) => {
    const next = posMap.get(o.id);
    if (!next) return o;
    const nx = Math.round(next.x);
    const ny = Math.round(next.y);
    const dx = nx - o.x;
    const dy = ny - o.y;
    if (o.type === 'stroke') {
      return {
        ...o,
        x: nx,
        y: ny,
        points: o.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })),
      };
    }
    if (o.type === 'line') {
      return {
        ...o,
        x: nx,
        y: ny,
        points: o.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
        cpX: typeof o.cpX === 'number' ? o.cpX + dx : o.cpX,
        cpY: typeof o.cpY === 'number' ? o.cpY + dy : o.cpY,
      };
    }
    if (o.type === 'connector') {
      return {
        ...o,
        x: nx,
        y: ny,
        x1: o.fromId ? o.x1 : o.x1 + dx,
        y1: o.fromId ? o.y1 : o.y1 + dy,
        x2: o.toId ? o.x2 : o.x2 + dx,
        y2: o.toId ? o.y2 : o.y2 + dy,
      };
    }
    return { ...o, x: nx, y: ny };
  });
  return syncConnectorBounds(moved);
}

export type ResizeHandleKind = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export function rotatePointAround(
  px: number,
  py: number,
  cx: number,
  cy: number,
  deg: number
): { x: number; y: number } {
  if (!deg) return { x: px, y: py };
  const rad = (deg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

export function getRotatedResizeHandleAt(
  wx: number,
  wy: number,
  box: { x: number; y: number; width: number; height: number; rotation?: number },
  zoom: number
): ResizeHandleKind | null {
  const pad = 0;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const local = rotatePointAround(wx, wy, cx, cy, -(box.rotation || 0));
  const x1 = box.x - pad;
  const y1 = box.y - pad;
  const x2 = box.x + box.width + pad;
  const y2 = box.y + box.height + pad;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const r = 13 / Math.max(0.25, zoom);

  const pts: { k: ResizeHandleKind; x: number; y: number }[] = [
    { k: 'rotate', x: mx, y: y1 - 24 / Math.max(0.4, zoom) },
    { k: 'nw', x: x1, y: y1 },
    { k: 'n', x: mx, y: y1 },
    { k: 'ne', x: x2, y: y1 },
    { k: 'e', x: x2, y: my },
    { k: 'se', x: x2, y: y2 },
    { k: 's', x: mx, y: y2 },
    { k: 'sw', x: x1, y: y2 },
    { k: 'w', x: x1, y: my },
  ];
  for (const p of pts) {
    if (Math.hypot(local.x - p.x, local.y - p.y) <= r) return p.k;
  }
  return null;
}

// Compute new (x, y, width, height) in unrotated local coordinates while keeping the opposite anchor fixed in world space
export function computeRotatedResizeBox(
  orig: { x: number; y: number; width: number; height: number; rotation?: number },
  handle: Exclude<ResizeHandleKind, 'rotate'>,
  worldDx: number,
  worldDy: number,
  keepAspect = false
): { x: number; y: number; width: number; height: number } {
  const rot = orig.rotation || 0;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Project world delta onto local axes
  const localDx = worldDx * cos + worldDy * sin;
  const localDy = -worldDx * sin + worldDy * cos;

  let newW = orig.width;
  let newH = orig.height;
  // Determine anchor in normalized [0..1] box coordinates (opposite side of dragged handle)
  let anchorU = 0.5;
  let anchorV = 0.5;
  if (handle.includes('e')) {
    newW = orig.width + localDx;
    anchorU = 0;
  } else if (handle.includes('w')) {
    newW = orig.width - localDx;
    anchorU = 1;
  }
  if (handle.includes('s')) {
    newH = orig.height + localDy;
    anchorV = 0;
  } else if (handle.includes('n')) {
    newH = orig.height - localDy;
    anchorV = 1;
  }

  newW = Math.max(18, newW);
  newH = Math.max(18, newH);
  if (keepAspect && orig.width > 0 && orig.height > 0 && handle.length === 2) {
    const ratio = orig.width / orig.height;
    if (Math.abs(newW - orig.width) >= Math.abs(newH - orig.height)) {
      newH = Math.max(18, newW / ratio);
    } else {
      newW = Math.max(18, newH * ratio);
    }
  }

  // World position of fixed anchor point on the original box
  const origCx = orig.x + orig.width / 2;
  const origCy = orig.y + orig.height / 2;
  const origAnchorLocalX = orig.x + anchorU * orig.width - origCx;
  const origAnchorLocalY = orig.y + anchorV * orig.height - origCy;
  const anchorWorldX = origCx + origAnchorLocalX * cos - origAnchorLocalY * sin;
  const anchorWorldY = origCy + origAnchorLocalX * sin + origAnchorLocalY * cos;

  // Offset from new center to anchor in local frame: (anchorU - 0.5)*newW, (anchorV - 0.5)*newH
  const newAnchorLocalX = (anchorU - 0.5) * newW;
  const newAnchorLocalY = (anchorV - 0.5) * newH;
  const newCx = anchorWorldX - (newAnchorLocalX * cos - newAnchorLocalY * sin);
  const newCy = anchorWorldY - (newAnchorLocalX * sin + newAnchorLocalY * cos);

  return {
    x: newCx - newW / 2,
    y: newCy - newH / 2,
    width: newW,
    height: newH,
  };
}

export function computeSelectionBounds(
  objs: BoardObject[],
  objectsById?: Map<string, BoardObject>
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (objs.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const lookup = objectsById || new Map(objs.map((o) => [o.id, o]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objs) {
    if (o.type === 'connector') {
      const { x1, y1, x2, y2 } = resolveConnectorEndpoints(o, lookup);
      minX = Math.min(minX, x1, x2);
      minY = Math.min(minY, y1, y2);
      maxX = Math.max(maxX, x1, x2);
      maxY = Math.max(maxY, y1, y2);
    } else if (o.rotation) {
      const cx = o.x + o.width / 2;
      const cy = o.y + o.height / 2;
      const corners = [
        rotatePointAround(o.x, o.y, cx, cy, o.rotation),
        rotatePointAround(o.x + o.width, o.y, cx, cy, o.rotation),
        rotatePointAround(o.x + o.width, o.y + o.height, cx, cy, o.rotation),
        rotatePointAround(o.x, o.y + o.height, cx, cy, o.rotation),
      ];
      for (const c of corners) {
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x > maxX) maxX = c.x;
        if (c.y > maxY) maxY = c.y;
      }
    } else {
      if (o.x < minX) minX = o.x;
      if (o.y < minY) minY = o.y;
      if (o.x + o.width > maxX) maxX = o.x + o.width;
      if (o.y + o.height > maxY) maxY = o.y + o.height;
    }
  }
  return { x: minX, y: minY, width: Math.max(4, maxX - minX), height: Math.max(4, maxY - minY) };
}

export function computeSmartOrthogonalPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  obstacles: { x: number; y: number; width: number; height: number }[],
  fromPort: PortSide = 'right',
  toPort: PortSide = 'left'
): { x: number; y: number }[] {
  const stub = 24;
  const p1 = {
    x: fromPort === 'left' ? x1 - stub : fromPort === 'right' ? x1 + stub : x1,
    y: fromPort === 'top' ? y1 - stub : fromPort === 'bottom' ? y1 + stub : y1,
  };
  const p2 = {
    x: toPort === 'left' ? x2 - stub : toPort === 'right' ? x2 + stub : x2,
    y: toPort === 'top' ? y2 - stub : toPort === 'bottom' ? y2 + stub : y2,
  };
  let midX = (p1.x + p2.x) / 2;
  const paddedObstacles = obstacles.map((r) => ({
    x: r.x - 14,
    y: r.y - 14,
    width: r.width + 28,
    height: r.height + 28,
  }));
  const hitsObstacleV = (x: number, ya: number, yb: number) =>
    paddedObstacles.some((r) => x >= r.x && x <= r.x + r.width && Math.max(ya, yb) >= r.y && Math.min(ya, yb) <= r.y + r.height);

  if (hitsObstacleV(midX, p1.y, p2.y)) {
    // Search horizontally around midX for an obstacle-free vertical channel
    for (let offset = 36; offset <= 420; offset += 36) {
      if (!hitsObstacleV(midX + offset, p1.y, p2.y)) {
        midX = midX + offset;
        break;
      }
      if (!hitsObstacleV(midX - offset, p1.y, p2.y)) {
        midX = midX - offset;
        break;
      }
    }
  }

  return [
    { x: x1, y: y1 },
    { x: p1.x, y: p1.y },
    { x: midX, y: p1.y },
    { x: midX, y: p2.y },
    { x: p2.x, y: p2.y },
    { x: x2, y: y2 },
  ];
}

export function autoLayoutDiagram(
  objects: BoardObject[],
  selectedIds?: Set<string>,
  originX = 120,
  originY = 120,
  direction: 'TB' | 'LR' | 'radial' = 'TB',
  lockedLayerIds?: Set<string>
): BoardObject[] {
  const nodes = objects.filter(
    (o) =>
      !o.locked &&
      !o.hidden &&
      (!o.layerId || !lockedLayerIds?.has(o.layerId)) &&
      o.type !== 'connector' &&
      o.type !== 'stroke' &&
      o.type !== 'line' &&
      !(o.type === 'shape' && o.shapeKind === 'frame') &&
      (!selectedIds || selectedIds.size === 0 || selectedIds.has(o.id))
  );
  if (nodes.length < 2) return objects;
  const connectors = objects.filter((o): o is ConnectorObject => o.type === 'connector');

  const children = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    children.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const c of connectors) {
    if (c.fromId && c.toId && children.has(c.fromId) && inDegree.has(c.toId)) {
      children.get(c.fromId)!.push(c.toId);
      inDegree.set(c.toId, (inDegree.get(c.toId) || 0) + 1);
    }
  }

  const roots = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0);
  const posMap = new Map<string, { x: number; y: number }>();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Build level groupings if graph has edges, else chunk into balanced rows
  const levels: string[][] = [];
  if (connectors.length > 0 && roots.length > 0 && roots.length < nodes.length) {
    const visited = new Set<string>();
    let frontier = roots.map((r) => r.id);
    while (frontier.length > 0) {
      const nextFrontier: string[] = [];
      const row: string[] = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);
        row.push(id);
        for (const ch of children.get(id) || []) {
          if (!visited.has(ch)) nextFrontier.push(ch);
        }
      }
      if (row.length > 0) levels.push(row);
      frontier = nextFrontier;
    }
    const remaining = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
    if (remaining.length > 0) levels.push(remaining);
  }

  if (direction === 'radial') {
    const ringGroups = levels.length > 0 ? levels : [[nodes[0].id], nodes.slice(1).map((n) => n.id)];
    const centerX = originX;
    const centerY = originY;
    ringGroups.forEach((group, rIdx) => {
      if (rIdx === 0 && group.length === 1) {
        const node = byId.get(group[0]);
        const w = node?.width || 160;
        const h = node?.height || 72;
        posMap.set(group[0], { x: Math.round(centerX - w / 2), y: Math.round(centerY - h / 2) });
        return;
      }
      const radius = Math.max(190, rIdx * 210 + (rIdx === 0 ? 150 : 0));
      group.forEach((id, i) => {
        const angle = (i / Math.max(1, group.length)) * Math.PI * 2 - Math.PI / 2;
        const node = byId.get(id);
        const w = node?.width || 160;
        const h = node?.height || 72;
        posMap.set(id, {
          x: Math.round(centerX + radius * Math.cos(angle) - w / 2),
          y: Math.round(centerY + radius * Math.sin(angle) - h / 2),
        });
      });
    });
  } else if (direction === 'LR') {
    const colsGroup =
      levels.length > 0
        ? levels
        : Array.from({ length: Math.ceil(nodes.length / Math.ceil(Math.sqrt(nodes.length))) }, (_, cIdx) => {
            const rowsPerCol = Math.ceil(Math.sqrt(nodes.length));
            return nodes.slice(cIdx * rowsPerCol, (cIdx + 1) * rowsPerCol).map((n) => n.id);
          });
    const hGap = 80;
    const vGap = 48;
    const totalColsW =
      colsGroup.reduce((acc, col) => acc + Math.max(...col.map((id) => byId.get(id)?.width || 160)), 0) +
      Math.max(0, colsGroup.length - 1) * hGap;
    let cursorX = originX - totalColsW / 2;
    colsGroup.forEach((col) => {
      const totalH =
        col.reduce((acc, id) => acc + (byId.get(id)?.height || 72), 0) + Math.max(0, col.length - 1) * vGap;
      let cursorY = originY - totalH / 2;
      let colMaxW = 140;
      col.forEach((id) => {
        const node = byId.get(id);
        const w = node?.width || 160;
        const h = node?.height || 72;
        if (w > colMaxW) colMaxW = w;
        posMap.set(id, { x: Math.round(cursorX), y: Math.round(cursorY) });
        cursorY += h + vGap;
      });
      cursorX += colMaxW + hGap;
    });
  } else if (levels.length > 0) {
    const hGap = 56;
    const vGap = 72;
    const totalLevelsH =
      levels.reduce((acc, row) => acc + Math.max(...row.map((id) => byId.get(id)?.height || 80)), 0) +
      Math.max(0, levels.length - 1) * vGap;
    let cursorY = originY - totalLevelsH / 2;
    levels.forEach((row) => {
      const totalW =
        row.reduce((acc, id) => acc + (byId.get(id)?.width || 180), 0) + Math.max(0, row.length - 1) * hGap;
      let cursorX = originX - totalW / 2;
      let rowMaxH = 80;
      row.forEach((id) => {
        const node = byId.get(id);
        const w = node?.width || 180;
        const h = node?.height || 80;
        if (h > rowMaxH) rowMaxH = h;
        posMap.set(id, { x: Math.round(cursorX), y: Math.round(cursorY) });
        cursorX += w + hGap;
      });
      cursorY += rowMaxH + vGap;
    });
  } else {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const rowsCount = Math.ceil(nodes.length / cols);
    const hGap = 48;
    const vGap = 48;
    const gridW = cols * 180 + Math.max(0, cols - 1) * hGap;
    const gridH = rowsCount * 90 + Math.max(0, rowsCount - 1) * vGap;
    let cursorY = originY - gridH / 2;
    for (let r = 0; r < rowsCount; r++) {
      let cursorX = originX - gridW / 2;
      let rowMaxH = 80;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= nodes.length) break;
        const n = nodes[idx];
        posMap.set(n.id, { x: Math.round(cursorX), y: Math.round(cursorY) });
        cursorX += Math.max(120, n.width) + hGap;
        if (n.height > rowMaxH) rowMaxH = n.height;
      }
      cursorY += rowMaxH + vGap;
    }
  }

  const laidOut = objects.map((o) => {
    const p = posMap.get(o.id);
    if (!p) return o;
    return { ...o, x: p.x, y: p.y };
  });
  return syncConnectorBounds(laidOut);
}

export interface ImageCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function clampCropRect(crop: ImageCropRect | undefined, natW: number, natH: number): ImageCropRect {
  const nw = Math.max(1, Math.round(natW));
  const nh = Math.max(1, Math.round(natH));
  if (!crop) return { sx: 0, sy: 0, sw: nw, sh: nh };
  const sw = Math.max(1, Math.min(nw, Math.round(crop.sw)));
  const sh = Math.max(1, Math.min(nh, Math.round(crop.sh)));
  const sx = Math.max(0, Math.min(nw - sw, Math.round(crop.sx)));
  const sy = Math.max(0, Math.min(nh - sh, Math.round(crop.sy)));
  return { sx, sy, sw, sh };
}

export function computeFullImageLocalBounds(
  obj: { x: number; y: number; width: number; height: number; flipX?: boolean; flipY?: boolean; crop?: ImageCropRect },
  natW: number,
  natH: number
): { fullX: number; fullY: number; fullW: number; fullH: number; crop: ImageCropRect } {
  const crop = clampCropRect(obj.crop, natW, natH);
  const scaleX = obj.width / Math.max(1, crop.sw);
  const scaleY = obj.height / Math.max(1, crop.sh);
  const leftTrimPx = obj.flipX ? natW - (crop.sx + crop.sw) : crop.sx;
  const topTrimPx = obj.flipY ? natH - (crop.sy + crop.sh) : crop.sy;
  return {
    fullX: obj.x - leftTrimPx * scaleX,
    fullY: obj.y - topTrimPx * scaleY,
    fullW: natW * scaleX,
    fullH: natH * scaleY,
    crop,
  };
}

export function computeCroppedResize(
  orig: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    crop?: ImageCropRect;
  },
  natW: number,
  natH: number,
  handle: Exclude<ResizeHandleKind, 'rotate'>,
  worldDx: number,
  worldDy: number,
  keepAspect = false
): { x: number; y: number; width: number; height: number; crop?: ImageCropRect } {
  const rot = orig.rotation || 0;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ldx = worldDx * cos + worldDy * sin;
  const ldy = -worldDx * sin + worldDy * cos;

  const L0 = -orig.width / 2;
  const R0 = orig.width / 2;
  const T0 = -orig.height / 2;
  const B0 = orig.height / 2;

  const full = computeFullImageLocalBounds(
    { x: L0, y: T0, width: orig.width, height: orig.height, flipX: orig.flipX, flipY: orig.flipY, crop: orig.crop },
    natW,
    natH
  );
  const fullL = full.fullX;
  const fullT = full.fullY;
  const fullR = full.fullX + full.fullW;
  const fullB = full.fullY + full.fullH;
  const minW = Math.min(full.fullW, 20);
  const minH = Math.min(full.fullH, 20);

  let L = L0;
  let R = R0;
  let T = T0;
  let B = B0;

  if (handle.includes('w')) L = Math.max(fullL, Math.min(R0 - minW, L0 + ldx));
  if (handle.includes('e')) R = Math.min(fullR, Math.max(L0 + minW, R0 + ldx));
  if (handle.includes('n')) T = Math.max(fullT, Math.min(B0 - minH, T0 + ldy));
  if (handle.includes('s')) B = Math.min(fullB, Math.max(T0 + minH, B0 + ldy));

  if (keepAspect && handle.length === 2 && orig.width > 0 && orig.height > 0) {
    const ratio = orig.width / orig.height;
    const availW = handle.includes('w') ? R0 - fullL : fullR - L0;
    const availH = handle.includes('n') ? B0 - fullT : fullB - T0;
    let w = R - L;
    let h = B - T;
    if (Math.abs(w - orig.width) / orig.width >= Math.abs(h - orig.height) / orig.height) {
      h = Math.max(minH, w / ratio);
    } else {
      w = Math.max(minW, h * ratio);
    }
    if (w > availW) {
      w = availW;
      h = w / ratio;
    }
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    if (handle.includes('w')) L = R0 - w;
    else R = L0 + w;
    if (handle.includes('n')) T = B0 - h;
    else B = T0 + h;
  }

  const newW = Math.max(8, R - L);
  const newH = Math.max(8, B - T);
  const dcxLocal = (L + R) / 2;
  const dcyLocal = (T + B) / 2;
  const origCx = orig.x + orig.width / 2;
  const origCy = orig.y + orig.height / 2;
  const newCx = origCx + dcxLocal * cos - dcyLocal * sin;
  const newCy = origCy + dcxLocal * sin + dcyLocal * cos;

  const pxScaleX = natW / Math.max(1e-6, full.fullW);
  const pxScaleY = natH / Math.max(1e-6, full.fullH);
  const sw = Math.max(1, Math.min(natW, Math.round(newW * pxScaleX)));
  const sh = Math.max(1, Math.min(natH, Math.round(newH * pxScaleY)));
  const rawSx = orig.flipX ? (fullR - R) * pxScaleX : (L - fullL) * pxScaleX;
  const rawSy = orig.flipY ? (fullB - B) * pxScaleY : (T - fullT) * pxScaleY;
  const sx = Math.max(0, Math.min(natW - sw, Math.round(rawSx)));
  const sy = Math.max(0, Math.min(natH - sh, Math.round(rawSy)));
  const isFull = sx <= 1 && sy <= 1 && sw >= natW - 2 && sh >= natH - 2;

  return {
    x: Math.round(newCx - newW / 2),
    y: Math.round(newCy - newH / 2),
    width: Math.round(newW),
    height: Math.round(newH),
    crop: isFull ? undefined : { sx, sy, sw, sh },
  };
}

// ── Smart Guides ─────────────────────────────────────────────
export type SmartGuide = {
  axis: 'x' | 'y';
  position: number;
  type: 'edge' | 'center' | 'spacing';
};

export function computeSmartGuides(
  draggedIds: Set<string>,
  objects: BoardObject[],
  snapThreshold = 6
): { guides: SmartGuide[]; snapDx: number; snapDy: number } {
  const dragged = objects.filter((o) => draggedIds.has(o.id));
  const others = objects.filter((o) => !draggedIds.has(o.id) && !o.hidden && !o.locked);
  if (dragged.length === 0 || others.length === 0) return { guides: [], snapDx: 0, snapDy: 0 };

  const bounds = computeSelectionBounds(dragged);
  if (!bounds || (bounds.width === 0 && bounds.height === 0)) return { guides: [], snapDx: 0, snapDy: 0 };

  const dLeft = bounds.x;
  const dRight = bounds.x + bounds.width;
  const dCenterX = (dLeft + dRight) / 2;
  const dTop = bounds.y;
  const dBottom = bounds.y + bounds.height;
  const dCenterY = (dTop + dBottom) / 2;

  const guides: SmartGuide[] = [];
  let bestDx = Infinity;
  let bestDy = Infinity;

  for (const o of others) {
    const oLeft = o.x;
    const oRight = o.x + o.width;
    const oCx = o.x + o.width / 2;
    const oTop = o.y;
    const oBottom = o.y + o.height;
    const oCy = o.y + o.height / 2;

    for (const [dv, ov, type] of [
      [dLeft, oLeft, 'edge'],
      [dLeft, oRight, 'edge'],
      [dRight, oLeft, 'edge'],
      [dRight, oRight, 'edge'],
      [dCenterX, oCx, 'center'],
    ] as [number, number, SmartGuide['type']][]) {
      const delta = ov - dv;
      if (Math.abs(delta) < Math.abs(bestDx) && Math.abs(delta) <= snapThreshold) {
        bestDx = delta;
      }
    }

    for (const [dv, ov, type] of [
      [dTop, oTop, 'edge'],
      [dTop, oBottom, 'edge'],
      [dBottom, oTop, 'edge'],
      [dBottom, oBottom, 'edge'],
      [dCenterY, oCy, 'center'],
    ] as [number, number, SmartGuide['type']][]) {
      const delta = ov - dv;
      if (Math.abs(delta) < Math.abs(bestDy) && Math.abs(delta) <= snapThreshold) {
        bestDy = delta;
      }
    }
  }

  const snapDx = Math.abs(bestDx) <= snapThreshold ? bestDx : 0;
  const snapDy = Math.abs(bestDy) <= snapThreshold ? bestDy : 0;

  if (snapDx !== 0) {
    const snappedLeft = dLeft + snapDx;
    const snappedRight = dRight + snapDx;
    const snappedCx = dCenterX + snapDx;
    for (const o of others) {
      const oLeft = o.x;
      const oRight = o.x + o.width;
      const oCx = o.x + o.width / 2;
      for (const v of [oLeft, oRight, oCx]) {
        if (Math.abs(v - snappedLeft) < 1 || Math.abs(v - snappedRight) < 1 || Math.abs(v - snappedCx) < 1) {
          guides.push({ axis: 'x', position: v, type: Math.abs(v - (dCenterX + snapDx)) < 1 ? 'center' : 'edge' });
        }
      }
    }
  }

  if (snapDy !== 0) {
    const snappedTop = dTop + snapDy;
    const snappedBottom = dBottom + snapDy;
    const snappedCy = dCenterY + snapDy;
    for (const o of others) {
      const oTop = o.y;
      const oBottom = o.y + o.height;
      const oCy = o.y + o.height / 2;
      for (const v of [oTop, oBottom, oCy]) {
        if (Math.abs(v - snappedTop) < 1 || Math.abs(v - snappedBottom) < 1 || Math.abs(v - snappedCy) < 1) {
          guides.push({ axis: 'y', position: v, type: Math.abs(v - (dCenterY + snapDy)) < 1 ? 'center' : 'edge' });
        }
      }
    }
  }

  return { guides, snapDx, snapDy };
}

// ── Spatial Index for O(log n) hit testing ──────────────────
export class SpatialGrid {
  private cellSize: number;
  private cells = new Map<string, BoardObject[]>();

  constructor(cellSize = 200) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  build(objects: BoardObject[]): void {
    this.cells.clear();
    for (const obj of objects) {
      if (obj.hidden) continue;
      const x1 = Math.floor(obj.x / this.cellSize);
      const y1 = Math.floor(obj.y / this.cellSize);
      const x2 = Math.floor((obj.x + obj.width) / this.cellSize);
      const y2 = Math.floor((obj.y + obj.height) / this.cellSize);
      for (let cx = x1; cx <= x2; cx++) {
        for (let cy = y1; cy <= y2; cy++) {
          const k = this.key(cx, cy);
          let bucket = this.cells.get(k);
          if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
          }
          bucket.push(obj);
        }
      }
    }
  }

  query(x: number, y: number, radius: number): BoardObject[] {
    const x1 = Math.floor((x - radius) / this.cellSize);
    const y1 = Math.floor((y - radius) / this.cellSize);
    const x2 = Math.floor((x + radius) / this.cellSize);
    const y2 = Math.floor((y + radius) / this.cellSize);
    const seen = new Set<string>();
    const result: BoardObject[] = [];
    for (let cx = x1; cx <= x2; cx++) {
      for (let cy = y1; cy <= y2; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const obj of bucket) {
          if (!seen.has(obj.id)) {
            seen.add(obj.id);
            result.push(obj);
          }
        }
      }
    }
    return result;
  }

  queryRect(rx: number, ry: number, rw: number, rh: number): BoardObject[] {
    const x1 = Math.floor(rx / this.cellSize);
    const y1 = Math.floor(ry / this.cellSize);
    const x2 = Math.floor((rx + rw) / this.cellSize);
    const y2 = Math.floor((ry + rh) / this.cellSize);
    const seen = new Set<string>();
    const result: BoardObject[] = [];
    for (let cx = x1; cx <= x2; cx++) {
      for (let cy = y1; cy <= y2; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const obj of bucket) {
          if (!seen.has(obj.id)) {
            seen.add(obj.id);
            result.push(obj);
          }
        }
      }
    }
    return result;
  }
}

export function computeCropPan(
  orig: { width: number; height: number; rotation?: number; flipX?: boolean; flipY?: boolean; crop?: ImageCropRect },
  natW: number,
  natH: number,
  worldDx: number,
  worldDy: number
): ImageCropRect {
  const crop = clampCropRect(orig.crop, natW, natH);
  const rad = ((orig.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ldx = worldDx * cos + worldDy * sin;
  const ldy = -worldDx * sin + worldDy * cos;
  const pxPerCanvasX = crop.sw / Math.max(1, orig.width);
  const pxPerCanvasY = crop.sh / Math.max(1, orig.height);
  const dsx = (orig.flipX ? 1 : -1) * ldx * pxPerCanvasX;
  const dsy = (orig.flipY ? 1 : -1) * ldy * pxPerCanvasY;
  const sx = Math.max(0, Math.min(natW - crop.sw, Math.round(crop.sx + dsx)));
  const sy = Math.max(0, Math.min(natH - crop.sh, Math.round(crop.sy + dsy)));
  return { sx, sy, sw: crop.sw, sh: crop.sh };
}

export function computeAspectPresetCrop(
  obj: { x: number; y: number; width: number; height: number; crop?: ImageCropRect },
  natW: number,
  natH: number,
  targetAspect: number | null
): { x: number; y: number; width: number; height: number; crop?: ImageCropRect } {
  const crop = clampCropRect(obj.crop, natW, natH);
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const scaleX = obj.width / Math.max(1, crop.sw);
  const scaleY = obj.height / Math.max(1, crop.sh);
  const rawAvgScale = (scaleX + scaleY) / 2;

  if (targetAspect === null) {
    const maxScale = 1400 / Math.max(natW, natH, 1);
    const scale = Math.min(rawAvgScale, maxScale);
    const newW = Math.max(24, Math.round(natW * scale));
    const newH = Math.max(24, Math.round(natH * scale));
    return {
      x: Math.round(cx - newW / 2),
      y: Math.round(cy - newH / 2),
      width: newW,
      height: newH,
      crop: undefined,
    };
  }

  let sw = natW;
  let sh = natH;
  if (natW / natH >= targetAspect) {
    sh = natH;
    sw = Math.max(1, Math.min(natW, Math.round(natH * targetAspect)));
  } else {
    sw = natW;
    sh = Math.max(1, Math.min(natH, Math.round(natW / targetAspect)));
  }
  const sx = Math.max(0, Math.round((natW - sw) / 2));
  const sy = Math.max(0, Math.round((natH - sh) / 2));
  const newW = Math.max(24, Math.round(sw * rawAvgScale));
  const newH = Math.max(24, Math.round(sh * rawAvgScale));
  return {
    x: Math.round(cx - newW / 2),
    y: Math.round(cy - newH / 2),
    width: newW,
    height: newH,
    crop: { sx, sy, sw, sh },
  };
}

export function loadImageNaturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ w: Math.max(1, img.naturalWidth || 800), h: Math.max(1, img.naturalHeight || 600) });
    img.onerror = () => resolve({ w: 800, h: 600 });
    img.src = src;
  });
}



