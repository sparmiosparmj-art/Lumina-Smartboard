import katex from 'katex';
import {
  Check,
  Copy,
  Crop,
  BookOpen,
  GitBranch,
  Lock,
  MonitorPlay,
  Paintbrush,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Unlock,
} from 'lucide-react';
import { compile, type EvalFunction } from 'mathjs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BoardObject,
  BoardPage,
  CodeLanguage,
  ConnectorObject,
  EraserSettings,
  GeometryInstrument,
  GraphObject,
  LineEndpointStyle,
  PortSide,
  PresenceUser,
  ShapeKind,
  StickyObject,
  StrokePoint,
  TableObject,
  TextObject,
  TextStickyDefaults,
  ToolType,
} from '../types/smartboard';
import { resourceUrl } from '../utils/api';
import {
  drawBoardObject,
  drawGridBackground,
  getCachedImage,
  hitTestRichCheckbox,
  resolveConnectorEndpoints,
} from '../utils/canvasRenderer';
import {
  clampCropRect,
  computeAspectPresetCrop,
  computeCroppedResize,
  computeCropPan,
  computeFullImageLocalBounds,
  computeRotatedResizeBox,
  computeSelectionBounds,
  dist,
  eraseStrokeByRadius,
  eraseStrokeByRect,
  fromObjectLocalPoint,
  getClosestPort,
  getPortPoint,
  getRotatedResizeHandleAt,
  hitTestObject,
  loadImageNaturalSize,
  pointInPolygon,
  recognizeRoughShape,
  scalePointsToBox,
  scalePointToBox,
  smoothStrokePoints,
  toObjectLocalPoint,
  uid,
} from '../utils/geometry';
import {
  getEffectiveRichBlocks,
  htmlToRichBlocks,
  richBlocksToHtml,
  richBlocksToPlainText,
  toggleRichCheckbox,
} from '../utils/richText';
import { highlightCodeToRichBlocks } from '../utils/codeHighlight';

export type LaserTrailPoint = {
  x: number;
  y: number;
  color: string;
  ts: number;
};

export type FloatingReaction = {
  id: string;
  emoji: string;
  userName: string;
  x: number;
  y: number;
  ts: number;
};

type CanvasStageProps = {
  page: BoardPage;
  activeTool: ToolType;
  activeShapeKind: ShapeKind;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  smoothing: number;
  stabilization: number;
  eraserMode: 'stroke' | 'object' | 'area';
  eraserSize: number;
  eraserSettings: EraserSettings;
  autoSmartShape: boolean;
  palmRejection: boolean;
  snapToGrid: boolean;
  showRulers: boolean;
  showMinimap: boolean;
  canvasLocked: boolean;
  canEdit: boolean;
  zoom: number;
  panX: number;
  panY: number;
  rotationDeg: number;
  selectedIds: Set<string>;
  instruments: GeometryInstrument[];
  remoteCursors: PresenceUser[];
  remoteLaserPoints: LaserTrailPoint[];
  reactions: FloatingReaction[];
  onZoomChange: (zoom: number) => void;
  onPanChange: (panX: number, panY: number) => void;
  onRotationChange?: (deg: number) => void;
  onSelectIds: (ids: Set<string>) => void;
  onCreateObject: (obj: BoardObject) => void;
  onUpdateObject: (id: string, patch: Partial<BoardObject>, commitHistory?: boolean) => void;
  onBatchPatchObjects?: (patches: (Partial<BoardObject> & { id: string })[], pushHistory?: boolean) => void;
  onDeleteObjects: (ids: string[]) => void;
  onSnapshotUndo?: () => void;
  onSyncPageState?: () => void;
  onReplacePageObjects?: (objects: BoardObject[], pushHistory?: boolean) => void;
  onOpenMathOrGraph?: (tab: 'equation' | 'graph', existingObj?: BoardObject) => void;
  onQuickAIAction?: (action: 'sketch_shape' | 'handwriting' | 'math_solve' | 'read_aloud') => void;
  onDismissMenus?: () => void;
  onCursorMove: (wx: number, wy: number) => void;
  onLaserPoint: (wx: number, wy: number) => void;
  onUpdateInstrument: (inst: GeometryInstrument) => void;
  onAddGuide: (axis: 'x' | 'y', position: number) => void;
  onRemoveGuide: (id: string) => void;
  onDropFiles: (files: FileList, wx: number, wy: number) => void;
  canvasRefOut?: React.RefObject<HTMLCanvasElement | null>;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onReorderZ?: (id: string, dir: 'front' | 'back' | 'forward' | 'backward') => void;
  onDuplicateSelected?: () => void;
  onChangeStrokeColor?: (c: string) => void;
  onChangeOpacity?: (o: number) => void;
  onSetActiveTool?: (tool: ToolType) => void;
  onOpenTemplates?: () => void;
  multiSelectMode?: boolean;
  onExitMultiSelect?: () => void;
  selectionMode?: 'crossing' | 'contained';
  preciseSelection?: boolean;
  colorblindPalette?: boolean;
  toolLocked?: boolean;
  userName?: string;
  textDefaults?: TextStickyDefaults;
  shapeFillStyle?: 'solid' | 'hachure' | 'cross_hatch' | 'dots';
  shapeCornerRadius?: number;
  shapeShadow?: boolean;
  connectorRouteType?: 'straight' | 'orthogonal' | 'curved';
  lineStartHead?: LineEndpointStyle;
  lineEndHead?: LineEndpointStyle;
  richEditorRefOut?: React.RefObject<HTMLDivElement | null>;
  syncRichEditorFnRef?: React.MutableRefObject<((commit?: boolean) => void) | null>;
  onEditingObjectIdChange?: (id: string | null) => void;
  onPresentFrame?: (frameObj: BoardObject) => void;
  onExportFrame?: (frameObj: BoardObject) => void;
  onCopyStyle?: (obj: BoardObject) => void;
  onPasteStyle?: () => void;
  hasCopiedStyle?: boolean;
  formatPainterActive?: boolean;
  onFormatPainterClick?: (obj: BoardObject) => void;
  onFormatPaintTarget?: (obj: BoardObject) => void;
  onCancelFormatPainter?: () => void;
  onToggleGroup?: () => void;
  slideArtboard?: {
    width: number;
    height: number;
    showSafeMargins?: boolean;
    isDarkDesk?: boolean;
  };
  hideSelectionOverlayBar?: boolean;
  externalCroppingId?: string | null;
  onExternalCroppingIdChange?: (id: string | null) => void;
};

/** Ruler straight-edge constants (world units at zoom=1) */
const RULER_WIDTH_PX = 420;

/**
 * Snap a world-space point to a visible ruler's top edge if within `threshold` world-units.
 * The ruler's top edge runs from (inst.x, inst.y) rightward by RULER_WIDTH_PX,
 * rotated around (inst.x, inst.y) by inst.rotation degrees.
 */
function snapToRulerEdge(
  wx: number,
  wy: number,
  instruments: GeometryInstrument[],
  threshold = 8
): { x: number; y: number; snapped: boolean } {
  for (const inst of instruments) {
    if (!inst.visible || inst.kind !== 'ruler') continue;
    const rad = (inst.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Vector from ruler origin to point
    const dx = wx - inst.x;
    const dy = wy - inst.y;
    // Project onto ruler-local coordinate system
    const localAlong = dx * cos + dy * sin;
    const localPerp = -dx * sin + dy * cos;
    // Check the point is within the ruler's horizontal span
    if (localAlong >= -threshold && localAlong <= RULER_WIDTH_PX + threshold) {
      if (Math.abs(localPerp) <= threshold) {
        // Snap: project back to world coords along the ruler edge at localPerp=0
        return {
          x: inst.x + localAlong * cos,
          y: inst.y + localAlong * sin,
          snapped: true,
        };
      }
    }
  }
  return { x: wx, y: wy, snapped: false };
}

/**
 * Compute the angle (in degrees) between two line-type objects whose endpoints
 * are close to the protractor centre.  Returns null when fewer than 2 qualifying
 * lines are found.
 */
function computeProtractorAngle(
  objects: BoardObject[],
  cx: number,
  cy: number,
  proximityThreshold = 30
): number | null {
  const nearbyAngles: number[] = [];
  for (const obj of objects) {
    if (obj.type !== 'line' || !('points' in obj)) continue;
    const pts = (obj as { points: { x: number; y: number }[] }).points;
    if (!pts || pts.length < 2) continue;
    const p0 = pts[0];
    const p1 = pts[pts.length - 1];
    const d0 = Math.hypot(p0.x - cx, p0.y - cy);
    const d1 = Math.hypot(p1.x - cx, p1.y - cy);
    if (d0 <= proximityThreshold) {
      nearbyAngles.push(Math.atan2(p1.y - p0.y, p1.x - p0.x));
    } else if (d1 <= proximityThreshold) {
      nearbyAngles.push(Math.atan2(p0.y - p1.y, p0.x - p1.x));
    }
  }
  if (nearbyAngles.length < 2) return null;
  // Angle between first two qualifying lines
  let diff = Math.abs(nearbyAngles[0] - nearbyAngles[1]) * (180 / Math.PI);
  if (diff > 180) diff = 360 - diff;
  return Math.round(diff * 10) / 10;
}

const STANDARD_BAR_COLORS = ['#0F172A', '#2563EB', '#059669', '#D97706', '#DC2626'];
const COLORBLIND_BAR_COLORS = ['#000000', '#0072B2', '#009E73', '#E69F00', '#D55E00'];

export const CanvasStage: React.FC<CanvasStageProps> = ({
  page,
  activeTool,
  activeShapeKind,
  strokeColor,
  fillColor,
  strokeWidth,
  opacity,
  lineStyle,
  smoothing,
  stabilization,
  shapeFillStyle = 'solid',
  shapeCornerRadius,
  shapeShadow = false,
  connectorRouteType = 'curved',
  lineStartHead = 'none',
  lineEndHead = 'arrow',
  eraserMode,
  eraserSize,
  eraserSettings,
  autoSmartShape,
  palmRejection,
  snapToGrid,
  showRulers,
  showMinimap,
  canvasLocked,
  canEdit,
  zoom,
  panX,
  panY,
  rotationDeg,
  selectedIds,
  instruments,
  remoteCursors,
  remoteLaserPoints,
  reactions,
  onZoomChange,
  onPanChange,
  onRotationChange,
  onSelectIds,
  onCreateObject,
  onUpdateObject,
  onBatchPatchObjects,
  onDeleteObjects,
  onSnapshotUndo,
  onSyncPageState,
  onReplacePageObjects,
  onOpenMathOrGraph,
  onQuickAIAction,
  onDismissMenus,
  onCursorMove,
  onLaserPoint,
  onUpdateInstrument,
  onAddGuide,
  onRemoveGuide,
  onDropFiles,
  canvasRefOut,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onReorderZ,
  onDuplicateSelected,
  onChangeStrokeColor,
  onChangeOpacity,
  onSetActiveTool,
  onOpenTemplates,
  multiSelectMode = false,
  onExitMultiSelect,
  selectionMode = 'crossing',
  preciseSelection = false,
  colorblindPalette = false,
  toolLocked = false,
  userName = 'Instructor',
  textDefaults,
  richEditorRefOut,
  syncRichEditorFnRef,
  onEditingObjectIdChange,
  onPresentFrame,
  onExportFrame,
  onCopyStyle,
  onPasteStyle,
  hasCopiedStyle,
  formatPainterActive = false,
  onFormatPainterClick,
  onFormatPaintTarget,
  onCancelFormatPainter,
  onToggleGroup,
  slideArtboard,
  hideSelectionOverlayBar = false,
  externalCroppingId,
  onExternalCroppingIdChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = canvasRefOut || internalCanvasRef;
  const internalEditorRef = useRef<HTMLDivElement>(null);
  const editorRef = richEditorRefOut || internalEditorRef;

  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const createdEmptyEditRef = useRef(false);
  const createdToolOnEditRef = useRef<ToolType | null>(null);
  const [alignSnapLines, setAlignSnapLines] = useState<{
    x?: number;
    y?: number;
    gapLabel?: string;
    gapLine?: { x1: number; y1: number; x2: number; y2: number };
  }>({});
  const [renderTick, setRenderTick] = useState(0);
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');
  const [graph3dAngles, setGraph3dAngles] = useState<Record<string, { yaw: number; pitch: number }>>({});
  const [inkSuggestion, setInkSuggestion] = useState<{ strokeId: string; suggested: BoardObject; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ sx: number; sy: number; wx: number; wy: number; objId?: string } | null>(null);
  const [internalCroppingId, setInternalCroppingId] = useState<string | null>(null);
  const croppingId = externalCroppingId !== undefined ? externalCroppingId : internalCroppingId;
  const setCroppingId = useCallback(
    (valOrFn: string | null | ((prev: string | null) => string | null)) => {
      const next = typeof valOrFn === 'function' ? valOrFn(croppingId) : valOrFn;
      if (onExternalCroppingIdChange) {
        onExternalCroppingIdChange(next);
      } else {
        setInternalCroppingId(next);
      }
    },
    [croppingId, onExternalCroppingIdChange]
  );
  const [editingTableCell, setEditingTableCell] = useState<{
    id: string;
    r: number;
    c: number;
    value: string;
  } | null>(null);
  const hoverWorldRef = useRef<{ x: number; y: number } | null>(null);
  const inertiaRafRef = useRef<number | null>(null);
  const panVelocityRef = useRef<{ vx: number; vy: number; lastTs: number; lastX: number; lastY: number }>({
    vx: 0,
    vy: 0,
    lastTs: 0,
    lastX: 0,
    lastY: 0,
  });

  // Live transient drawing states
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchAngle = useRef<number | null>(null);
  const pinchRotateAccum = useRef<number>(0);
  const lastPenTime = useRef<number>(0);

  const interactionRef = useRef<{
    mode:
      | 'none'
      | 'pan'
      | 'draw_stroke'
      | 'draw_line'
      | 'draw_polyline'
      | 'draw_shape'
      | 'draw_text_box'
      | 'draw_connector'
      | 'erase_stroke'
      | 'erase_area'
      | 'marquee'
      | 'lasso'
      | 'drag_objects'
      | 'resize_object'
      | 'crop_pan'
      | 'rotate_object'
      | 'drag_bezier_cp'
      | 'drag_table_divider'
      | 'laser';
    startX: number;
    startY: number;
    curX: number;
    curY: number;
    panStartX: number;
    panStartY: number;
    points: StrokePoint[];
    polylinePts: { x: number; y: number }[];
    fromId?: string;
    fromPort?: PortSide;
    resizeHandle?: string;
    groupStartBox?: { x: number; y: number; width: number; height: number; rotation: number };
    tableDivider?: { objId: string; axis: 'col' | 'row'; index: number; initialWeights: number[]; totalSize: number; rotation?: number };
    initialBounds?: Map<
      string,
      {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        flipX?: boolean;
        flipY?: boolean;
        natW?: number;
        natH?: number;
        points?: StrokePoint[] | { x: number; y: number }[];
        cpX?: number;
        cpY?: number;
        crop?: { sx: number; sy: number; sw: number; sh: number };
      }
    >;
    rotateCenter?: { x: number; y: number; startAngle: number; initialRot: number };
    didModifyStrokeErase?: boolean;
    undoSnapshotTaken?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    curX: 0,
    curY: 0,
    panStartX: 0,
    panStartY: 0,
    points: [],
    polylinePts: [],
  });

  const localLaserRef = useRef<LaserTrailPoint[]>([]);
  const [, setLaserAnimTick] = useState(0);

  // Observe container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: Math.max(200, Math.floor(entry.contentRect.width)),
          height: Math.max(200, Math.floor(entry.contentRect.height)),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const finishPolyline = useCallback(() => {
    const pts = interactionRef.current.polylinePts;
    if (pts.length >= 2) {
      const minX = Math.min(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const maxX = Math.max(...pts.map((p) => p.x));
      const maxY = Math.max(...pts.map((p) => p.y));
      onCreateObject({
        id: uid('line'),
        name: 'Polyline',
        type: 'line',
        x: minX,
        y: minY,
        width: Math.max(4, maxX - minX),
        height: Math.max(4, maxY - minY),
        rotation: 0,
        opacity,
        locked: false,
        hidden: false,
        zIndex: page.objects.length + 1,
        points: pts,
        stroke: strokeColor,
        strokeWidth,
        lineStyle,
        startHead: lineStartHead,
        endHead: lineEndHead,
      });
    }
    interactionRef.current.mode = 'none';
    interactionRef.current.polylinePts = [];
    setRenderTick((t) => t + 1);
  }, [lineEndHead, lineStartHead, lineStyle, onCreateObject, opacity, page.objects.length, strokeColor, strokeWidth]);

  // Spacebar pan & Enter to finish polyline
  const fitAllHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && formatPainterActive) {
        e.preventDefault();
        onCancelFormatPainter?.();
        return;
      }
      const t = e.target as HTMLElement | null;
      const isUiControl = Boolean(t?.closest('button, select, [role="dialog"], [role="menu"], [role="tablist"]'));
      if (
        e.code === 'Space' &&
        !isUiControl &&
        !(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable || t?.closest?.('[contenteditable="true"]'))
      ) {
        setSpacePressed(true);
      }
      if (!isUiControl && e.key === 'Enter' && interactionRef.current.mode === 'draw_polyline') {
        finishPolyline();
      }
      if (!isUiControl && e.key === 'Escape' && interactionRef.current.mode === 'draw_polyline') {
        interactionRef.current.mode = 'none';
        interactionRef.current.polylinePts = [];
        setRenderTick((t) => t + 1);
      }
      if (e.key === 'Escape' && contextMenu) {
        setContextMenu(null);
      }
      if ((e.key === 'Escape' || e.key === 'Enter') && croppingId) {
        const t = e.target as HTMLElement | null;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable)) {
          e.preventDefault();
          setCroppingId(null);
        }
      }
      // Keyboard navigation for canvas objects
      if (e.key === 'Tab' && !editingId && !isUiControl) {
        const t = e.target as HTMLElement | null;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable)) {
          e.preventDefault();
          const objs = visibleObjects;
          if (objs.length === 0) return;
          const currentIdx = objs.findIndex((o) => selectedIds.has(o.id));
          const nextIdx = e.shiftKey
            ? (currentIdx <= 0 ? objs.length - 1 : currentIdx - 1)
            : (currentIdx < 0 ? 0 : (currentIdx + 1) % objs.length);
          onSelectIds(new Set([objs[nextIdx].id]));
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isUiControl) {
        const t = e.target as HTMLElement | null;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable)) {
          if (selectedIds.size > 0 && canEdit && !canvasLocked) {
            onDeleteObjects([...selectedIds]);
          }
        }
      }
      // Fit All shortcut: Ctrl+Shift+1
      if (e.key === '1' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        fitAllHandlerRef.current();
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !isUiControl) {
        const t = e.target as HTMLElement | null;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable)) {
          if (selectedIds.size > 0 && canEdit && !canvasLocked) {
            e.preventDefault();
            const gridStep = page.gridSize || 28;
            const nudge = e.shiftKey ? gridStep : 1;
            const dx = e.key === 'ArrowLeft' ? -nudge : e.key === 'ArrowRight' ? nudge : 0;
            const dy = e.key === 'ArrowUp' ? -nudge : e.key === 'ArrowDown' ? nudge : 0;
            const patches = [...selectedIds].map((id) => {
              const obj = page.objects.find((o) => o.id === id);
              if (!obj) return null;
              return { id, x: obj.x + dx, y: obj.y + dy };
            }).filter(Boolean) as (Partial<BoardObject> & { id: string })[];
            if (patches.length > 0 && onBatchPatchObjects) {
              onBatchPatchObjects(patches);
            }
          }
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [contextMenu, croppingId, finishPolyline, setCroppingId, editingId, selectedIds, onSelectIds, canEdit, canvasLocked, onDeleteObjects, page.gridSize, page.objects, onBatchPatchObjects, formatPainterActive, onCancelFormatPainter]);

  // Laser decay animation loop
  useEffect(() => {
    const hasLaser = localLaserRef.current.length > 0 || remoteLaserPoints.length > 0;
    if (!hasLaser) return;
    const id = requestAnimationFrame(() => {
      const now = Date.now();
      localLaserRef.current = localLaserRef.current.filter((p) => now - p.ts < 1400);
      setLaserAnimTick((t) => t + 1);
    });
    return () => cancelAnimationFrame(id);
  });

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      let wx = (sx - panX) / zoom;
      let wy = (sy - panY) / zoom;
      if (rotationDeg !== 0) {
        const cx = size.width / 2;
        const cy = size.height / 2;
        const dx = sx - cx;
        const dy = sy - cy;
        const rad = (-rotationDeg * Math.PI) / 180;
        const rx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
        wx = (rx - panX) / zoom;
        wy = (ry - panY) / zoom;
      }
      return { x: wx, y: wy };
    },
    [panX, panY, rotationDeg, size.height, size.width, zoom]
  );

  const maybeSnap = useCallback(
    (val: number) => {
      if (!snapToGrid) return val;
      const g = page.gridSize || 28;
      return Math.round(val / g) * g;
    },
    [page.gridSize, snapToGrid]
  );

  // Snap point to ruler or set-square edge when nearby
  const snapToRuler = useCallback(
    (wx: number, wy: number) => {
      const ruler = instruments.find((i) => i.visible && i.kind === 'ruler');
      if (ruler) {
        const rad = (ruler.rotation * Math.PI) / 180;
        const dx = wx - ruler.x;
        const dy = wy - ruler.y;
        const along = dx * Math.cos(rad) + dy * Math.sin(rad);
        const perp = -dx * Math.sin(rad) + dy * Math.cos(rad);
        const rulerLen = Math.min(420, Math.max(120, size.width - 48));
        if (along >= -20 && along <= rulerLen && Math.abs(perp) < 18) {
          return {
            x: ruler.x + along * Math.cos(rad),
            y: ruler.y + along * Math.sin(rad),
          };
        }
      }
      const setSq = instruments.find((i) => i.visible && i.kind === 'set_square');
      if (setSq) {
        const rad = (setSq.rotation * Math.PI) / 180;
        const cx = setSq.x + 90;
        const cy = setSq.y + 90;
        const dx = wx - cx;
        const dy = wy - cy;
        const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad) + 90;
        const ly = dx * Math.sin(-rad) + dy * Math.cos(-rad) + 90;
        if (Math.abs(lx) < 16 && ly >= -10 && ly <= 190) {
          const sx = cx + (0 - 90) * Math.cos(rad) - (ly - 90) * Math.sin(rad);
          const sy = cy + (0 - 90) * Math.sin(rad) + (ly - 90) * Math.cos(rad);
          return { x: sx, y: sy };
        }
        if (Math.abs(ly - 180) < 16 && lx >= -10 && lx <= 190) {
          const sx = cx + (lx - 90) * Math.cos(rad) - (180 - 90) * Math.sin(rad);
          const sy = cy + (lx - 90) * Math.sin(rad) + (180 - 90) * Math.cos(rad);
          return { x: sx, y: sy };
        }
      }
      return { x: wx, y: wy };
    },
    [instruments]
  );

  const objectsById = useMemo(() => new Map(page.objects.map((o) => [o.id, o])), [page.objects]);
  const hiddenLayerIds = useMemo(
    () => new Set((page.layers || []).filter((l) => !l.visible).map((l) => l.id)),
    [page.layers]
  );
  const lockedLayerIds = useMemo(
    () => new Set((page.layers || []).filter((l) => l.locked).map((l) => l.id)),
    [page.layers]
  );
  const selectedEraserLayerId = page.objects.find((o) => selectedIds.has(o.id))?.layerId;
  const eraserCanTouch = (o: BoardObject) => {
    if (eraserSettings.opacity <= 0) return false;
    if (eraserSettings.insideSelection && !selectedIds.has(o.id)) return false;
    if (eraserSettings.selectedLayerOnly && o.layerId !== selectedEraserLayerId) return false;
    return true;
  };

  const visibleObjects = useMemo(
    () =>
      page.objects
        .filter((o) => !o.hidden && !(o.layerId && hiddenLayerIds.has(o.layerId)))
        .sort((a, b) => a.zIndex - b.zIndex),
    [hiddenLayerIds, page.objects]
  );

  // Screen-reader announcement helper
  const announce = useCallback((msg: string) => {
    setAriaAnnouncement('');
    requestAnimationFrame(() => setAriaAnnouncement(msg));
  }, []);

  // Fit All: zoom/pan to show every object with padding
  const fitAll = useCallback(() => {
    if (visibleObjects.length === 0) return;
    const allBounds = computeSelectionBounds(visibleObjects, objectsById);
    const pad = 60;
    const contentW = allBounds.width + pad * 2;
    const contentH = allBounds.height + pad * 2;
    const fitZoom = Math.max(0.15, Math.min(2, Math.min(size.width / contentW, size.height / contentH)));
    const centerX = allBounds.x + allBounds.width / 2;
    const centerY = allBounds.y + allBounds.height / 2;
    onZoomChange(fitZoom);
    onPanChange(size.width / 2 - centerX * fitZoom, size.height / 2 - centerY * fitZoom);
  }, [visibleObjects, objectsById, size.width, size.height, onZoomChange, onPanChange]);
  fitAllHandlerRef.current = fitAll;

  // Announce selection changes
  useEffect(() => {
    if (selectedIds.size > 0) {
      announce(`${selectedIds.size} object${selectedIds.size > 1 ? 's' : ''} selected`);
    }
  }, [selectedIds.size, announce]);

  // Announce tool changes
  useEffect(() => {
    announce(`Tool: ${activeTool.replace(/_/g, ' ')}`);
  }, [activeTool, announce]);

  // Announce zoom changes
  useEffect(() => {
    announce(`Zoom: ${Math.round(zoom * 100)}%`);
  }, [zoom, announce]);

  // Primary Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    const isDarkMode = document.documentElement.classList.contains('dark');
    if (slideArtboard) {
      ctx.fillStyle = slideArtboard.isDarkDesk ? '#0B1120' : '#E2E8F0';
      ctx.fillRect(0, 0, size.width, size.height);
    } else {
      const pageBg = page.background || '#FFFFFF';
      const isDefaultWhiteBg = !page.background || pageBg === '#FFFFFF' || pageBg === '#ffffff' || pageBg === 'white';
      ctx.fillStyle = isDarkMode && isDefaultWhiteBg ? '#1E293B' : pageBg;
      ctx.fillRect(0, 0, size.width, size.height);
    }

    ctx.save();
    if (rotationDeg !== 0) {
      ctx.translate(size.width / 2, size.height / 2);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.translate(-size.width / 2, -size.height / 2);
    }
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Viewport culling bounds (virtualization for large boards)
    const viewLeft = -panX / zoom - 200;
    const viewTop = -panY / zoom - 200;
    const viewRight = (size.width - panX) / zoom + 200;
    const viewBottom = (size.height - panY) / zoom + 200;

    if (slideArtboard) {
      const aw = slideArtboard.width;
      const ah = slideArtboard.height;
      // Subtle studio desk dot pattern outside slide
      ctx.save();
      ctx.fillStyle = slideArtboard.isDarkDesk ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.16)';
      const deskStep = 32;
      const dStartX = Math.floor(viewLeft / deskStep) * deskStep;
      const dStartY = Math.floor(viewTop / deskStep) * deskStep;
      for (let gx = dStartX; gx <= viewRight; gx += deskStep) {
        for (let gy = dStartY; gy <= viewBottom; gy += deskStep) {
          if (gx >= -12 && gx <= aw + 12 && gy >= -12 && gy <= ah + 12) continue;
          ctx.fillRect(gx - 0.8, gy - 0.8, 1.6, 1.6);
        }
      }
      ctx.restore();

      // Slide Artboard Shadow + Surface
      ctx.save();
      ctx.shadowColor = slideArtboard.isDarkDesk ? 'rgba(0, 0, 0, 0.55)' : 'rgba(15, 23, 42, 0.16)';
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 12;
      if (page.slideGradient?.from && page.slideGradient?.to) {
        const angle = ((page.slideGradient.angle ?? 135) * Math.PI) / 180;
        const cx = aw / 2;
        const cy = ah / 2;
        const half = Math.hypot(aw, ah) / 2;
        const grad = ctx.createLinearGradient(
          cx - Math.cos(angle) * half,
          cy - Math.sin(angle) * half,
          cx + Math.cos(angle) * half,
          cy + Math.sin(angle) * half
        );
        grad.addColorStop(0, page.slideGradient.from);
        grad.addColorStop(1, page.slideGradient.to);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = page.background || '#FFFFFF';
      }
      ctx.fillRect(0, 0, aw, ah);
      ctx.restore();

      // Crisp 1px Slide Artboard Border
      ctx.save();
      ctx.strokeStyle = slideArtboard.isDarkDesk ? 'rgba(148,163,184,0.28)' : 'rgba(15,23,42,0.12)';
      ctx.lineWidth = 1.25 / zoom;
      ctx.strokeRect(0, 0, aw, ah);
      ctx.restore();

      // Grid clipped inside Slide Artboard
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, aw, ah);
      ctx.clip();
      drawGridBackground(ctx, page.gridType, page.gridSize, page.background, 0, 0, aw, ah);
      ctx.restore();

      // Optional Safe Margins & Center Crosshair Guides
      if (slideArtboard.showSafeMargins) {
        ctx.save();
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.28)';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.strokeRect(48, 48, aw - 96, ah - 96);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.16)';
        ctx.beginPath();
        ctx.moveTo(aw / 2, 0);
        ctx.lineTo(aw / 2, ah);
        ctx.moveTo(0, ah / 2);
        ctx.lineTo(aw, ah / 2);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      drawGridBackground(ctx, page.gridType, page.gridSize, page.background, viewLeft, viewTop, viewRight, viewBottom);
    }

    // Guides
    for (const g of page.guides || []) {
      ctx.save();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.beginPath();
      if (g.axis === 'x') {
        ctx.moveTo(g.position, viewTop);
        ctx.lineTo(g.position, viewBottom);
      } else {
        ctx.moveTo(viewLeft, g.position);
        ctx.lineTo(viewRight, g.position);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Draw visible objects in viewport
    for (const obj of visibleObjects) {
      if (obj.id === editingId && (obj.type === 'text' || obj.type === 'sticky')) {
        continue;
      }
      const margin = 120;
      if (
        obj.type !== 'connector' &&
        (obj.x + obj.width < viewLeft - margin ||
          obj.x > viewRight + margin ||
          obj.y + obj.height < viewTop - margin ||
          obj.y > viewBottom + margin)
      ) {
        continue;
      }
      drawBoardObject(ctx, obj, objectsById, () => setRenderTick((t) => t + 1));
    }

    // Alignment & equal-gap snap lines during drag
    if (alignSnapLines.x !== undefined) {
      ctx.save();
      ctx.strokeStyle = '#EC4899';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(alignSnapLines.x, viewTop);
      ctx.lineTo(alignSnapLines.x, viewBottom);
      ctx.stroke();
      ctx.restore();
    }
    if (alignSnapLines.y !== undefined) {
      ctx.save();
      ctx.strokeStyle = '#EC4899';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(viewLeft, alignSnapLines.y);
      ctx.lineTo(viewRight, alignSnapLines.y);
      ctx.stroke();
      ctx.restore();
    }
    if (alignSnapLines.gapLine && alignSnapLines.gapLabel) {
      const gl = alignSnapLines.gapLine;
      ctx.save();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(gl.x1, gl.y1);
      ctx.lineTo(gl.x2, gl.y2);
      ctx.stroke();
      ctx.fillStyle = '#0891B2';
      ctx.font = `600 ${11 / zoom}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(alignSnapLines.gapLabel, (gl.x1 + gl.x2) / 2, (gl.y1 + gl.y2) / 2 - 6 / zoom);
      ctx.restore();
    }

    // Transient interaction preview
    const inter = interactionRef.current;
    if (inter.mode === 'draw_stroke' && inter.points.length > 0) {
      drawBoardObject(
        ctx,
        {
          id: 'preview',
          type: 'stroke',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          opacity,
          locked: false,
          hidden: false,
          zIndex: 999,
          points: inter.points,
          brushKind:
            activeTool === 'pencil' ||
            activeTool === 'brush' ||
            activeTool === 'marker' ||
            activeTool === 'highlighter' ||
            activeTool === 'calligraphy' ||
            activeTool === 'fountain'
              ? activeTool
              : 'pen',
          stroke: strokeColor,
          strokeWidth,
          lineStyle,
          smoothing,
          stabilization,
          pressureSize: true,
          pressureOpacity: false,
          pressureCurve: 'linear',
          tiltSensitivity: activeTool === 'calligraphy' ? 0.65 : 0,
        },
        objectsById
      );
    } else if (inter.mode === 'draw_line') {
      drawBoardObject(
        ctx,
        {
          id: 'preview-line',
          type: 'line',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          opacity,
          locked: false,
          hidden: false,
          zIndex: 999,
          points: [
            { x: inter.startX, y: inter.startY },
            { x: inter.curX, y: inter.curY },
          ],
          curved: activeTool === 'curved_line',
          stroke: strokeColor,
          strokeWidth,
          lineStyle,
          startHead: activeTool === 'double_arrow' ? (lineStartHead !== 'none' ? lineStartHead : 'arrow') : lineStartHead,
          endHead: activeTool === 'arrow' || activeTool === 'double_arrow' ? (lineEndHead !== 'none' ? lineEndHead : 'arrow') : lineEndHead,
        },
        objectsById
      );
    } else if (inter.mode === 'draw_polyline' && inter.polylinePts.length > 0) {
      drawBoardObject(
        ctx,
        {
          id: 'preview-poly',
          type: 'line',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          opacity,
          locked: false,
          hidden: false,
          zIndex: 999,
          points: [...inter.polylinePts, { x: inter.curX, y: inter.curY }],
          stroke: strokeColor,
          strokeWidth,
          lineStyle,
          startHead: lineStartHead,
          endHead: lineEndHead,
        },
        objectsById
      );
    } else if (inter.mode === 'draw_shape') {
      const dx = inter.curX - inter.startX;
      const dy = inter.curY - inter.startY;
      const constrain = inter.shiftKey || activeShapeKind === 'square' || activeShapeKind === 'circle';
      const rawW = Math.max(8, inter.altKey ? Math.abs(dx) * 2 : Math.abs(dx));
      const rawH = Math.max(8, inter.altKey ? Math.abs(dy) * 2 : Math.abs(dy));
      const side = Math.max(rawW, rawH);
      const sw = constrain ? side : rawW;
      const sh = constrain ? side : rawH;
      const sx = inter.altKey ? inter.startX - sw / 2 : dx >= 0 ? inter.startX : inter.startX - sw;
      const sy = inter.altKey ? inter.startY - sh / 2 : dy >= 0 ? inter.startY : inter.startY - sh;
      drawBoardObject(
        ctx,
        {
          id: 'preview-shape',
          type: 'shape',
          shapeKind: activeShapeKind,
          x: sx,
          y: sy,
          width: sw,
          height: sh,
          rotation: 0,
          opacity,
          locked: false,
          hidden: false,
          zIndex: 999,
          fill: fillColor,
          fillStyle: shapeFillStyle,
          stroke: strokeColor,
          strokeWidth,
          lineStyle,
          cornerRadius: shapeCornerRadius ?? (activeShapeKind === 'rounded_rect' ? 14 : activeShapeKind === 'frame' ? 10 : undefined),
          shadow: shapeShadow,
          text: activeShapeKind === 'frame' ? 'Section' : '',
          textColor: '#0F172A',
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 15,
          fontWeight: activeShapeKind === 'frame' ? 'bold' : 'normal',
          fontStyle: 'normal',
          textAlign: 'center',
        },
        objectsById
      );
      const dimLabel = `${Math.round(sw)} × ${Math.round(sh)}`;
      ctx.save();
      ctx.font = '600 11px "JetBrains Mono", monospace';
      const tw = ctx.measureText(dimLabel).width + 12;
      const bx = sx + sw - tw;
      const by = sy + sh + 8;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText(dimLabel, bx + 6, by + 10);
      ctx.restore();
    } else if (inter.mode === 'draw_text_box') {
      const tx = Math.min(inter.startX, inter.curX);
      const ty = Math.min(inter.startY, inter.curY);
      const tw = Math.max(24, Math.abs(inter.curX - inter.startX));
      const th = Math.max(24, Math.abs(inter.curY - inter.startY));
      ctx.save();
      ctx.strokeStyle = '#2563EB';
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.strokeRect(tx, ty, tw, th);
      ctx.restore();
    } else if (inter.mode === 'draw_connector') {
      const targetHover = hoverWorldRef.current
        ? visibleObjects
            .slice()
            .reverse()
            .find((o) => o.type !== 'connector' && o.type !== 'stroke' && o.id !== inter.fromId && hitTestObject(o, inter.curX, inter.curY, objectsById, 16 / zoom))
        : undefined;
      let endX = inter.curX;
      let endY = inter.curY;
      if (targetHover) {
        const snap = getClosestPort(targetHover, inter.curX, inter.curY);
        endX = snap.x;
        endY = snap.y;
        const ports: PortSide[] = ['top', 'right', 'bottom', 'left'];
        ctx.save();
        for (const side of ports) {
          const pt = getPortPoint(targetHover, side);
          ctx.fillStyle = side === snap.side ? '#2563EB' : '#FFFFFF';
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1.5 / zoom;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (side === snap.side ? 6.5 : 4.5) / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(inter.startX, inter.startY);
      const dx = Math.max(40, Math.abs(endX - inter.startX) * 0.42) * (endX >= inter.startX ? 1 : -1);
      ctx.bezierCurveTo(inter.startX + dx, inter.startY, endX - dx, endY, endX, endY);
      ctx.stroke();
      ctx.restore();
    } else if (inter.mode === 'marquee' || inter.mode === 'erase_area') {
      const mx = Math.min(inter.startX, inter.curX);
      const my = Math.min(inter.startY, inter.curY);
      const mw = Math.abs(inter.curX - inter.startX);
      const mh = Math.abs(inter.curY - inter.startY);
      ctx.save();
      ctx.fillStyle = inter.mode === 'erase_area' ? 'rgba(239,68,68,0.12)' : 'rgba(37,99,235,0.09)';
      ctx.strokeStyle = inter.mode === 'erase_area' ? '#EF4444' : '#2563EB';
      ctx.lineWidth = 1.5 / zoom;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeRect(mx, my, mw, mh);
      ctx.restore();
    } else if (inter.mode === 'lasso' && inter.points.length > 1) {
      ctx.save();
      ctx.fillStyle = 'rgba(139, 92, 246, 0.1)';
      ctx.strokeStyle = '#7C3AED';
      ctx.lineWidth = 1.8 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(inter.points[0].x, inter.points[0].y);
      for (let i = 1; i < inter.points.length; i++) ctx.lineTo(inter.points[i].x, inter.points[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Hover ports when connector tool is idle over connectable object
    if (activeTool === 'connector' && inter.mode === 'none' && hoverWorldRef.current) {
      const hw = hoverWorldRef.current;
      const hoverTarget = visibleObjects
        .slice()
        .reverse()
        .find((o) => o.type !== 'connector' && o.type !== 'stroke' && hitTestObject(o, hw.x, hw.y, objectsById, 16 / zoom));
      if (hoverTarget) {
        const snap = getClosestPort(hoverTarget, hw.x, hw.y);
        const ports: PortSide[] = ['top', 'right', 'bottom', 'left'];
        ctx.save();
        for (const side of ports) {
          const pt = getPortPoint(hoverTarget, side);
          ctx.fillStyle = side === snap.side ? '#2563EB' : '#FFFFFF';
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1.5 / zoom;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (side === snap.side ? 5.5 : 4) / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Eraser cursor ring preview
    if ((activeTool === 'eraser_stroke' || activeTool === 'eraser_object') && hoverWorldRef.current) {
      const hw = hoverWorldRef.current;
      ctx.save();
      ctx.strokeStyle = activeTool === 'eraser_stroke' ? '#EF4444' : '#F97316';
      ctx.globalAlpha = Math.max(0.12, eraserSettings.opacity / 100);
      ctx.fillStyle = activeTool === 'eraser_stroke' ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.08)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      if (eraserSettings.shape === 'square') {
        const radius = eraserSize / zoom;
        ctx.rect(hw.x - radius, hw.y - radius, radius * 2, radius * 2);
      } else {
        ctx.arc(hw.x, hw.y, eraserSize / zoom, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Selection bounding box, 8-handles, group transform box, crop overlay, curved Bezier handle, and Table dividers
    const selectedObjs = visibleObjects.filter((o) => selectedIds.has(o.id));
    if (selectedObjs.length > 0 && activeTool === 'select') {
      const singleObj = selectedObjs.length === 1 ? selectedObjs[0] : null;
      const isCroppingSingle = Boolean(singleObj && singleObj.type === 'image' && croppingId === singleObj.id && !singleObj.locked);

      // Interactive Crop Ghost Preview & Rule-of-Thirds Overlay
      if (isCroppingSingle && singleObj && singleObj.type === 'image') {
        const cropImg = getCachedImage(singleObj.src, () => setRenderTick((t) => t + 1));
        const natW = cropImg?.naturalWidth || (singleObj.crop ? singleObj.crop.sx + singleObj.crop.sw : 800);
        const natH = cropImg?.naturalHeight || (singleObj.crop ? singleObj.crop.sy + singleObj.crop.sh : 600);
        const fullBounds = computeFullImageLocalBounds(singleObj, natW, natH);
        const cx = singleObj.x + singleObj.width / 2;
        const cy = singleObj.y + singleObj.height / 2;

        ctx.save();
        if (singleObj.rotation) {
          ctx.translate(cx, cy);
          ctx.rotate((singleObj.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }

        // Dimmed ghost of the full uncropped image outside the active crop frame
        if (cropImg) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(fullBounds.fullX, fullBounds.fullY, fullBounds.fullW, fullBounds.fullH);
          ctx.rect(singleObj.x, singleObj.y, singleObj.width, singleObj.height);
          ctx.clip('evenodd');
          if (singleObj.flipX || singleObj.flipY) {
            ctx.translate(cx, cy);
            ctx.scale(singleObj.flipX ? -1 : 1, singleObj.flipY ? -1 : 1);
            ctx.translate(-cx, -cy);
          }
          const gx = singleObj.flipX ? 2 * cx - (fullBounds.fullX + fullBounds.fullW) : fullBounds.fullX;
          const gy = singleObj.flipY ? 2 * cy - (fullBounds.fullY + fullBounds.fullH) : fullBounds.fullY;
          ctx.globalAlpha = 0.28;
          ctx.drawImage(cropImg, 0, 0, natW, natH, gx, gy, fullBounds.fullW, fullBounds.fullH);
          ctx.restore();
        }

        // Dashed boundary of full uncropped source image
        ctx.save();
        ctx.strokeStyle = 'rgba(5, 150, 105, 0.55)';
        ctx.lineWidth = 1.25 / zoom;
        ctx.setLineDash([5 / zoom, 4 / zoom]);
        ctx.strokeRect(fullBounds.fullX, fullBounds.fullY, fullBounds.fullW, fullBounds.fullH);
        ctx.restore();

        // Rule-of-thirds guides inside active crop rectangle
        if (singleObj.width > 36 / zoom && singleObj.height > 36 / zoom) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.lineWidth = 1 / zoom;
          ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
          ctx.shadowBlur = 2 / zoom;
          ctx.beginPath();
          ctx.moveTo(singleObj.x + singleObj.width / 3, singleObj.y);
          ctx.lineTo(singleObj.x + singleObj.width / 3, singleObj.y + singleObj.height);
          ctx.moveTo(singleObj.x + (singleObj.width * 2) / 3, singleObj.y);
          ctx.lineTo(singleObj.x + (singleObj.width * 2) / 3, singleObj.y + singleObj.height);
          ctx.moveTo(singleObj.x, singleObj.y + singleObj.height / 3);
          ctx.lineTo(singleObj.x + singleObj.width, singleObj.y + singleObj.height / 3);
          ctx.moveTo(singleObj.x, singleObj.y + (singleObj.height * 2) / 3);
          ctx.lineTo(singleObj.x + singleObj.width, singleObj.y + (singleObj.height * 2) / 3);
          ctx.stroke();
          ctx.restore();
        }

        // Crisp emerald crop frame outline
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(singleObj.x, singleObj.y, singleObj.width, singleObj.height);
        ctx.restore();
      } else {
        for (const obj of selectedObjs) {
          ctx.save();
          const cx = obj.x + obj.width / 2;
          const cy = obj.y + obj.height / 2;
          if (obj.rotation) {
            ctx.translate(cx, cy);
            ctx.rotate((obj.rotation * Math.PI) / 180);
            ctx.translate(-cx, -cy);
          }
          ctx.strokeStyle = obj.locked ? '#D97706' : croppingId === obj.id ? '#059669' : '#2563EB';
          ctx.lineWidth = 1.5 / zoom;
          if (selectedObjs.length > 1) ctx.setLineDash([4 / zoom, 3 / zoom]);
          ctx.strokeRect(obj.x - 2 / zoom, obj.y - 2 / zoom, obj.width + 4 / zoom, obj.height + 4 / zoom);
          ctx.restore();
        }
      }

      const boxForHandles = singleObj
        ? !singleObj.locked && singleObj.type !== 'connector' && !(singleObj.layerId && lockedLayerIds.has(singleObj.layerId))
          ? { x: singleObj.x, y: singleObj.y, width: singleObj.width, height: singleObj.height, rotation: singleObj.rotation || 0 }
          : null
        : selectedObjs.some((o) => !o.locked && !(o.layerId && lockedLayerIds.has(o.layerId)))
          ? { ...computeSelectionBounds(selectedObjs, objectsById), rotation: 0 }
          : null;

      if (boxForHandles) {
        ctx.save();
        const b = boxForHandles;
        const bcx = b.x + b.width / 2;
        const bcy = b.y + b.height / 2;
        if (selectedObjs.length > 1) {
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1.5 / zoom;
          ctx.strokeRect(b.x, b.y, b.width, b.height);
        }
        if (b.rotation) {
          ctx.translate(bcx, bcy);
          ctx.rotate((b.rotation * Math.PI) / 180);
          ctx.translate(-bcx, -bcy);
        }
        if (isCroppingSingle) {
          // Pro L-shaped corner brackets and edge grip bars for crop mode
          const arm = Math.min(18 / zoom, Math.max(8 / zoom, Math.min(b.width, b.height) * 0.25));
          const barLen = Math.min(20 / zoom, Math.max(8 / zoom, Math.min(b.width, b.height) * 0.25));
          const drawCornerBracket = (px: number, py: number, dx: number, dy: number) => {
            ctx.beginPath();
            ctx.moveTo(px + dx * arm, py);
            ctx.lineTo(px, py);
            ctx.lineTo(px, py + dy * arm);
            ctx.stroke();
          };
          // Dark halo then bright emerald foreground for contrast on any photo
          for (const pass of [
            { color: 'rgba(15, 23, 42, 0.55)', width: 5.5 / zoom },
            { color: '#10B981', width: 3.2 / zoom },
          ]) {
            ctx.strokeStyle = pass.color;
            ctx.lineWidth = pass.width;
            ctx.lineCap = 'square';
            ctx.lineJoin = 'miter';
            drawCornerBracket(b.x, b.y, 1, 1);
            drawCornerBracket(b.x + b.width, b.y, -1, 1);
            drawCornerBracket(b.x + b.width, b.y + b.height, -1, -1);
            drawCornerBracket(b.x, b.y + b.height, 1, -1);
            // Edge grip bars (N, S, W, E)
            ctx.beginPath();
            ctx.moveTo(bcx - barLen / 2, b.y);
            ctx.lineTo(bcx + barLen / 2, b.y);
            ctx.moveTo(bcx - barLen / 2, b.y + b.height);
            ctx.lineTo(bcx + barLen / 2, b.y + b.height);
            ctx.moveTo(b.x, bcy - barLen / 2);
            ctx.lineTo(b.x, bcy + barLen / 2);
            ctx.moveTo(b.x + b.width, bcy - barLen / 2);
            ctx.lineTo(b.x + b.width, bcy + barLen / 2);
            ctx.stroke();
          }
        } else {
          const hs = 8 / zoom;
          const handles = [
            { x: b.x, y: b.y },
            { x: b.x + b.width / 2, y: b.y },
            { x: b.x + b.width, y: b.y },
            { x: b.x + b.width, y: b.y + b.height / 2 },
            { x: b.x + b.width, y: b.y + b.height },
            { x: b.x + b.width / 2, y: b.y + b.height },
            { x: b.x, y: b.y + b.height },
            { x: b.x, y: b.y + b.height / 2 },
          ];
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#2563EB';
          ctx.lineWidth = 1.5 / zoom;
          for (const h of handles) {
            ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
            ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
          }
          // Rotate handle
          ctx.beginPath();
          ctx.moveTo(bcx, b.y);
          ctx.lineTo(bcx, b.y - 22 / zoom);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(bcx, b.y - 24 / zoom, 5 / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Bezier control handle for curved lines
      if (singleObj && singleObj.type === 'line' && singleObj.curved && singleObj.points.length === 2 && !singleObj.locked) {
        const pts = singleObj.points;
        const cpx = singleObj.cpX ?? (pts[0].x + pts[1].x) / 2;
        const cpy = singleObj.cpY ?? (pts[0].y + pts[1].y) / 2 - 48;
        const wP0 = fromObjectLocalPoint(singleObj, pts[0].x, pts[0].y, true);
        const wP1 = fromObjectLocalPoint(singleObj, pts[1].x, pts[1].y, true);
        const wCp = fromObjectLocalPoint(singleObj, cpx, cpy, true);
        ctx.save();
        ctx.strokeStyle = '#7C3AED';
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.beginPath();
        ctx.moveTo(wP0.x, wP0.y);
        ctx.lineTo(wCp.x, wCp.y);
        ctx.lineTo(wP1.x, wP1.y);
        ctx.stroke();
        ctx.fillStyle = '#7C3AED';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(wCp.x, wCp.y, 6 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Table column / row resize handles
      if (singleObj && singleObj.type === 'table' && !singleObj.locked) {
        const colWs =
          singleObj.colWidths && singleObj.colWidths.length === singleObj.cols
            ? singleObj.colWidths
            : Array(singleObj.cols).fill(singleObj.width / singleObj.cols);
        const sumC = colWs.reduce((a, b) => a + b, 0) || singleObj.width;
        let accX = singleObj.x;
        ctx.save();
        if (singleObj.rotation) {
          const tcx = singleObj.x + singleObj.width / 2;
          const tcy = singleObj.y + singleObj.height / 2;
          ctx.translate(tcx, tcy);
          ctx.rotate((singleObj.rotation * Math.PI) / 180);
          ctx.translate(-tcx, -tcy);
        }
        ctx.fillStyle = '#2563EB';
        for (let c = 0; c < singleObj.cols - 1; c++) {
          accX += (colWs[c] / sumC) * singleObj.width;
          ctx.fillRect(accX - 2 / zoom, singleObj.y - 8 / zoom, 4 / zoom, 8 / zoom);
        }
        const rowHs =
          singleObj.rowHeights && singleObj.rowHeights.length === singleObj.rows
            ? singleObj.rowHeights
            : Array(singleObj.rows).fill(singleObj.height / singleObj.rows);
        const sumR = rowHs.reduce((a, b) => a + b, 0) || singleObj.height;
        let accY = singleObj.y;
        for (let r = 0; r < singleObj.rows - 1; r++) {
          accY += (rowHs[r] / sumR) * singleObj.height;
          ctx.fillRect(singleObj.x - 8 / zoom, accY - 2 / zoom, 8 / zoom, 4 / zoom);
        }
        ctx.restore();
      }
    }

    // Laser pointer trails (local + remote) honoring selected color & width
    const now = Date.now();
    const allLasers = [...localLaserRef.current, ...remoteLaserPoints].filter((p) => now - p.ts < 1400);
    if (localLaserRef.current.length > 1) {
      const localActive = localLaserRef.current.filter((p) => now - p.ts < 900);
      if (localActive.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < localActive.length - 1; i++) {
          const p0 = localActive[i];
          const p1 = localActive[i + 1];
          const life = 1 - (now - p1.ts) / 900;
          ctx.globalAlpha = life * 0.85;
          ctx.strokeStyle = p1.color || strokeColor || '#EF4444';
          ctx.lineWidth = Math.max(3, strokeWidth * 1.4 * life) / zoom;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    for (const lp of allLasers) {
      const life = 1 - (now - lp.ts) / 1400;
      ctx.save();
      ctx.globalAlpha = life * 0.45;
      ctx.fillStyle = lp.color || strokeColor || '#EF4444';
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, (Math.max(4, strokeWidth * 1.5) + (1 - life) * 5) / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }, [
    activeShapeKind,
    activeTool,
    alignSnapLines,
    canvasRef,
    croppingId,
    editingId,
    eraserSize,
    fillColor,
    lineEndHead,
    lineStartHead,
    lineStyle,
    lockedLayerIds,
    objectsById,
    opacity,
    page,
    panX,
    panY,
    remoteLaserPoints,
    renderTick,
    rotationDeg,
    selectedIds,
    selectionMode,
    shapeCornerRadius,
    shapeFillStyle,
    shapeShadow,
    size,
    slideArtboard,
    smoothing,
    stabilization,
    strokeColor,
    strokeWidth,
    visibleObjects,
    zoom,
  ]);

  const findHitObject = (wx: number, wy: number, isTouch = false): BoardObject | undefined => {
    const tol = (isTouch ? 14 : preciseSelection ? 2 : 8) / zoom;
    for (let i = visibleObjects.length - 1; i >= 0; i--) {
      const obj = visibleObjects[i];
      if (hitTestObject(obj, wx, wy, objectsById, tol)) {
        return obj;
      }
    }
    return undefined;
  };

  const getResizeHandleAt = (obj: BoardObject, wx: number, wy: number, _isTouch = false): string | null => {
    if (obj.locked || obj.type === 'connector' || (obj.layerId && lockedLayerIds.has(obj.layerId))) return null;
    return getRotatedResizeHandleAt(
      wx,
      wy,
      { x: obj.x, y: obj.y, width: obj.width, height: obj.height, rotation: obj.rotation || 0 },
      zoom
    );
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    onDismissMenus?.();
    setContextMenu(null);
    if (inertiaRafRef.current) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
    if (editingId) {
      commitInlineEdit();
      return;
    }

    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.pointerType === 'pen') {
      lastPenTime.current = Date.now();
    }
    // Palm rejection MUST happen before activePointers.set so rejected touch never sticks
    if (palmRejection && e.pointerType === 'touch') {
      if ((e.width > 24 && e.height > 24) || Date.now() - lastPenTime.current < 1200) {
        return;
      }
    }

    activePointers.current.set(e.pointerId, { x: sx, y: sy });

    if (activePointers.current.size === 2) {
      const pts = Array.from(activePointers.current.values());
      lastPinchDist.current = dist(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      lastPinchAngle.current = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchRotateAccum.current = 0;
      interactionRef.current.mode = 'pan';
      interactionRef.current.points = [];
      interactionRef.current.didModifyStrokeErase = false;
      interactionRef.current.panStartX = panX;
      interactionRef.current.panStartY = panY;
      interactionRef.current.startX = (pts[0].x + pts[1].x) / 2;
      interactionRef.current.startY = (pts[0].y + pts[1].y) / 2;
      setRenderTick((t) => t + 1);
      return;
    }

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rawWorld = screenToWorld(sx, sy);
    const snapped = snapToRuler(rawWorld.x, rawWorld.y);
    const wx = snapped.x;
    const wy = snapped.y;

    // Right-click should not trigger drawing
    if (e.button === 2) {
      return;
    }

    // Middle mouse, Space+drag, or Hand tool => Pan
    if (e.button === 1 || spacePressed || activeTool === 'hand') {
      panVelocityRef.current = { vx: 0, vy: 0, lastTs: performance.now(), lastX: sx, lastY: sy };
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'pan',
        startX: sx,
        startY: sy,
        panStartX: panX,
        panStartY: panY,
      };
      return;
    }

    if (activeTool === 'laser') {
      const lCol = strokeColor && strokeColor !== '#0F172A' && strokeColor !== '#FFFFFF' ? strokeColor : '#EF4444';
      interactionRef.current = { ...interactionRef.current, mode: 'laser', startX: wx, startY: wy, curX: wx, curY: wy };
      localLaserRef.current.push({ x: wx, y: wy, color: lCol, ts: Date.now() });
      onLaserPoint(wx, wy);
      return;
    }

    if (!canEdit || canvasLocked) {
      if (activeTool === 'select') {
        const hit = findHitObject(wx, wy);
        onSelectIds(hit ? new Set([hit.id]) : new Set());
      }
      return;
    }

    if (activeTool === 'math' || activeTool === 'graph') {
      onOpenMathOrGraph?.(activeTool === 'math' ? 'equation' : 'graph');
      return;
    }

    const isTouch = e.pointerType === 'touch';

    if (activeTool === 'paint_bucket') {
      const hit = findHitObject(wx, wy, isTouch);
      if (hit && !hit.locked && !(hit.layerId && lockedLayerIds.has(hit.layerId))) {
        if (hit.type === 'shape') onUpdateObject(hit.id, { fill: fillColor, fillStyle: 'solid' }, true);
        else if (hit.type === 'sticky') onUpdateObject(hit.id, { noteColor: fillColor }, true);
        else if (hit.type === 'text') onUpdateObject(hit.id, { bgColor: fillColor }, true);
        else if (hit.type === 'stroke') onUpdateObject(hit.id, { stroke: fillColor }, true);
      }
      return;
    }

    if (activeTool === 'lasso') {
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'lasso',
        startX: wx,
        startY: wy,
        curX: wx,
        curY: wy,
        shiftKey: e.shiftKey || e.ctrlKey || e.metaKey,
        points: [{ x: wx, y: wy, p: 0.5 }],
      };
      return;
    }

    if (activeTool === 'select') {
      if (formatPainterActive) {
        const paintTarget = findHitObject(wx, wy, isTouch);
        if (paintTarget) onFormatPaintTarget?.(paintTarget);
        return;
      }
      const selectedObjs = visibleObjects.filter((o) => selectedIds.has(o.id));
      // Check curved line Bezier control point first
      if (selectedObjs.length === 1 && selectedObjs[0].type === 'line' && selectedObjs[0].curved && selectedObjs[0].points.length === 2 && !selectedObjs[0].locked) {
        const lo = selectedObjs[0];
        const cpx = lo.cpX ?? (lo.points[0].x + lo.points[1].x) / 2;
        const cpy = lo.cpY ?? (lo.points[0].y + lo.points[1].y) / 2 - 48;
        const worldCp = fromObjectLocalPoint(lo, cpx, cpy, true);
        if (dist(wx, wy, worldCp.x, worldCp.y) <= 14 / zoom) {
          interactionRef.current = {
            ...interactionRef.current,
            mode: 'drag_bezier_cp',
            startX: wx,
            startY: wy,
            curX: cpx,
            curY: cpy,
            initialBounds: new Map([[lo.id, {
              x: lo.x, y: lo.y, width: lo.width, height: lo.height,
              rotation: lo.rotation, points: lo.points.map((p) => ({ ...p })),
              cpX: lo.cpX, cpY: lo.cpY,
            }]]),
          };
          return;
        }
      }

      // Check table divider handles
      if (selectedObjs.length === 1 && selectedObjs[0].type === 'table' && !selectedObjs[0].locked) {
        const tb = selectedObjs[0] as TableObject;
        const local = toObjectLocalPoint(tb, wx, wy, false);
        const colWs = tb.colWidths && tb.colWidths.length === tb.cols ? tb.colWidths : Array(tb.cols).fill(tb.width / tb.cols);
        const sumC = colWs.reduce((a, b) => a + b, 0) || tb.width;
        let accX = tb.x;
        for (let c = 0; c < tb.cols - 1; c++) {
          accX += (colWs[c] / sumC) * tb.width;
          if (Math.abs(local.x - accX) <= 10 / zoom && local.y >= tb.y - 16 / zoom && local.y <= tb.y + tb.height) {
            interactionRef.current = {
              ...interactionRef.current,
              mode: 'drag_table_divider',
              startX: wx,
              startY: wy,
              tableDivider: {
                objId: tb.id,
                axis: 'col',
                index: c,
                initialWeights: colWs.map((w) => (w / sumC) * tb.width),
                totalSize: tb.width,
                rotation: tb.rotation || 0,
              },
            };
            return;
          }
        }
        const rowHs = tb.rowHeights && tb.rowHeights.length === tb.rows ? tb.rowHeights : Array(tb.rows).fill(tb.height / tb.rows);
        const sumR = rowHs.reduce((a, b) => a + b, 0) || tb.height;
        let accY = tb.y;
        for (let r = 0; r < tb.rows - 1; r++) {
          accY += (rowHs[r] / sumR) * tb.height;
          if (Math.abs(local.y - accY) <= 10 / zoom && local.x >= tb.x - 16 / zoom && local.x <= tb.x + tb.width) {
            interactionRef.current = {
              ...interactionRef.current,
              mode: 'drag_table_divider',
              startX: wx,
              startY: wy,
              tableDivider: {
                objId: tb.id,
                axis: 'row',
                index: r,
                initialWeights: rowHs.map((h) => (h / sumR) * tb.height),
                totalSize: tb.height,
                rotation: tb.rotation || 0,
              },
            };
            return;
          }
        }
      }

      // Single or Multi-selection handle detection
      const transformBox =
        selectedObjs.length === 1
          ? !selectedObjs[0].locked && selectedObjs[0].type !== 'connector' && !(selectedObjs[0].layerId && lockedLayerIds.has(selectedObjs[0].layerId))
            ? { x: selectedObjs[0].x, y: selectedObjs[0].y, width: selectedObjs[0].width, height: selectedObjs[0].height, rotation: selectedObjs[0].rotation || 0 }
            : null
          : selectedObjs.length > 1 && selectedObjs.some((o) => !o.locked && !(o.layerId && lockedLayerIds.has(o.layerId)))
            ? { ...computeSelectionBounds(selectedObjs, objectsById), rotation: 0 }
            : null;

      if (transformBox) {
        const handle = getRotatedResizeHandleAt(wx, wy, transformBox, zoom);
        const isCroppingBox =
          selectedObjs.length === 1 && selectedObjs[0].type === 'image' && croppingId === selectedObjs[0].id;
        if (handle === 'rotate' && !isCroppingBox) {
          const cx = transformBox.x + transformBox.width / 2;
          const cy = transformBox.y + transformBox.height / 2;
          const bounds = new Map<
            string,
            {
              x: number;
              y: number;
              width: number;
              height: number;
              rotation: number;
              points?: StrokePoint[] | { x: number; y: number }[];
            }
          >();
          for (const o of selectedObjs) {
            bounds.set(o.id, { x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation });
          }
          interactionRef.current = {
            ...interactionRef.current,
            mode: 'rotate_object',
            startX: wx,
            startY: wy,
            groupStartBox: transformBox,
            initialBounds: bounds,
            rotateCenter: {
              x: cx,
              y: cy,
              startAngle: Math.atan2(wy - cy, wx - cx),
              initialRot: transformBox.rotation || 0,
            },
          };
          return;
        }
        if (handle && handle !== 'rotate') {
          const bounds = new Map<
            string,
            {
              x: number;
              y: number;
              width: number;
              height: number;
              rotation: number;
              flipX?: boolean;
              flipY?: boolean;
              natW?: number;
              natH?: number;
              points?: StrokePoint[] | { x: number; y: number }[];
              cpX?: number;
              cpY?: number;
              crop?: { sx: number; sy: number; sw: number; sh: number };
            }
          >();
          for (const o of selectedObjs) {
            let natW: number | undefined;
            let natH: number | undefined;
            let clampedCrop = o.type === 'image' && o.crop ? { ...o.crop } : undefined;
            if (o.type === 'image') {
              const cached = getCachedImage(o.src, () => setRenderTick((t) => t + 1));
              natW = cached?.naturalWidth || (o.crop ? Math.max(800, o.crop.sx + o.crop.sw) : Math.max(800, Math.round(o.width)));
              natH = cached?.naturalHeight || (o.crop ? Math.max(600, o.crop.sy + o.crop.sh) : Math.max(600, Math.round(o.height)));
              if (o.crop) clampedCrop = clampCropRect(o.crop, natW, natH);
            }
            bounds.set(o.id, {
              x: o.x,
              y: o.y,
              width: o.width,
              height: o.height,
              rotation: o.rotation,
              flipX: o.flipX,
              flipY: o.flipY,
              natW,
              natH,
              crop: clampedCrop,
              points: o.type === 'stroke' || o.type === 'line' ? o.points.map((p) => ({ ...p })) : undefined,
              cpX: o.type === 'line' ? o.cpX : undefined,
              cpY: o.type === 'line' ? o.cpY : undefined,
            });
          }
          interactionRef.current = {
            ...interactionRef.current,
            mode: 'resize_object',
            resizeHandle: handle,
            startX: wx,
            startY: wy,
            curX: wx,
            curY: wy,
            groupStartBox: transformBox,
            initialBounds: bounds,
          };
          return;
        }
      }

      const hit = findHitObject(wx, wy, isTouch);
      if (hit) {
        if ((hit.type === 'text' || hit.type === 'sticky') && !hit.locked && !(hit.layerId && lockedLayerIds.has(hit.layerId))) {
          const chkIdx = hitTestRichCheckbox(hit, wx, wy);
          if (chkIdx !== null) {
            const nextBlocks = toggleRichCheckbox(getEffectiveRichBlocks(hit), chkIdx);
            onUpdateObject(hit.id, { richBlocks: nextBlocks, text: richBlocksToPlainText(nextBlocks) }, true);
            onSelectIds(new Set([hit.id]));
            return;
          }
        }
        if (croppingId && croppingId !== hit.id) setCroppingId(null);

        // In active Crop Mode, dragging inside a cropped image pans the photo inside the fixed crop window
        if (hit.type === 'image' && croppingId === hit.id && !hit.locked && !(hit.layerId && lockedLayerIds.has(hit.layerId))) {
          const cached = getCachedImage(hit.src, () => setRenderTick((t) => t + 1));
          const natW = cached?.naturalWidth || (hit.crop ? Math.max(800, hit.crop.sx + hit.crop.sw) : 800);
          const natH = cached?.naturalHeight || (hit.crop ? Math.max(600, hit.crop.sy + hit.crop.sh) : 600);
          const curCrop = clampCropRect(hit.crop, natW, natH);
          const hasPanSlack = curCrop.sw < natW - 1 || curCrop.sh < natH - 1;
          if (hasPanSlack) {
            const bounds = new Map<
              string,
              {
                x: number;
                y: number;
                width: number;
                height: number;
                rotation: number;
                flipX?: boolean;
                flipY?: boolean;
                natW?: number;
                natH?: number;
                crop?: { sx: number; sy: number; sw: number; sh: number };
              }
            >();
            bounds.set(hit.id, {
              x: hit.x,
              y: hit.y,
              width: hit.width,
              height: hit.height,
              rotation: hit.rotation,
              flipX: hit.flipX,
              flipY: hit.flipY,
              natW,
              natH,
              crop: curCrop,
            });
            interactionRef.current = {
              ...interactionRef.current,
              mode: 'crop_pan',
              startX: wx,
              startY: wy,
              curX: wx,
              curY: wy,
              initialBounds: bounds,
            };
            return;
          }
        }

        let nextSel = new Set(selectedIds);
        if (e.shiftKey || e.ctrlKey || e.metaKey || multiSelectMode) {
          if (nextSel.has(hit.id)) nextSel.delete(hit.id);
          else nextSel.add(hit.id);
        } else if (!nextSel.has(hit.id)) {
          nextSel = new Set([hit.id]);
        }
        if (hit.groupId && !e.ctrlKey && !e.metaKey) {
          for (const o of visibleObjects) {
            if (o.groupId === hit.groupId) nextSel.add(o.id);
          }
        }
        onSelectIds(nextSel);

        const canDrag = Array.from(nextSel).some((id) => {
          const o = objectsById.get(id);
          return o && !o.locked && !(o.layerId && lockedLayerIds.has(o.layerId));
        });
        if (canDrag) {
          const bounds = new Map<
            string,
            {
              x: number;
              y: number;
              width: number;
              height: number;
              rotation: number;
              points?: StrokePoint[] | { x: number; y: number }[];
              cpX?: number;
              cpY?: number;
            }
          >();
          for (const id of nextSel) {
            const o = objectsById.get(id);
            if (o) {
              bounds.set(id, {
                x: o.x,
                y: o.y,
                width: o.width,
                height: o.height,
                rotation: o.rotation,
                points: o.type === 'stroke' || o.type === 'line' ? o.points.map((p) => ({ ...p })) : undefined,
                cpX: o.type === 'line' ? o.cpX : undefined,
                cpY: o.type === 'line' ? o.cpY : undefined,
              });
              // Section Frame auto-containment: carry unlocked enclosed children along with the frame
              if (o.type === 'shape' && o.shapeKind === 'frame') {
                for (const child of visibleObjects) {
                  if (child.id === o.id || child.locked || (child.layerId && lockedLayerIds.has(child.layerId))) continue;
                  const ccx = child.x + child.width / 2;
                  const ccy = child.y + child.height / 2;
                  if (ccx >= o.x && ccx <= o.x + o.width && ccy >= o.y && ccy <= o.y + o.height && !bounds.has(child.id)) {
                    bounds.set(child.id, {
                      x: child.x,
                      y: child.y,
                      width: child.width,
                      height: child.height,
                      rotation: child.rotation,
                      points: child.type === 'stroke' || child.type === 'line' ? child.points.map((p) => ({ ...p })) : undefined,
                      cpX: child.type === 'line' ? child.cpX : undefined,
                      cpY: child.type === 'line' ? child.cpY : undefined,
                    });
                  }
                }
              }
              // Group co-movement: carry all objects with the same groupId
              if (o.groupId) {
                for (const sibling of visibleObjects) {
                  if (sibling.id === o.id || sibling.locked || (sibling.layerId && lockedLayerIds.has(sibling.layerId))) continue;
                  if (sibling.groupId === o.groupId && !bounds.has(sibling.id)) {
                    bounds.set(sibling.id, {
                      x: sibling.x,
                      y: sibling.y,
                      width: sibling.width,
                      height: sibling.height,
                      rotation: sibling.rotation,
                      points: sibling.type === 'stroke' || sibling.type === 'line' ? sibling.points.map((p) => ({ ...p })) : undefined,
                      cpX: sibling.type === 'line' ? sibling.cpX : undefined,
                      cpY: sibling.type === 'line' ? sibling.cpY : undefined,
                    });
                  }
                }
              }
            }
          }
          interactionRef.current = {
            ...interactionRef.current,
            mode: 'drag_objects',
            startX: wx,
            startY: wy,
            curX: wx,
            curY: wy,
            initialBounds: bounds,
          };
        }
      } else {
        setCroppingId(null);
        if (!multiSelectMode && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          onSelectIds(new Set());
        }
        interactionRef.current = {
          ...interactionRef.current,
          mode: 'marquee',
          startX: wx,
          startY: wy,
          curX: wx,
          curY: wy,
          shiftKey: e.shiftKey || e.ctrlKey || e.metaKey,
        };
      }
      return;
    }

    if (activeTool === 'eraser_stroke' || activeTool === 'eraser_object') {
      onSnapshotUndo?.();
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'erase_stroke',
        startX: wx,
        startY: wy,
        curX: wx,
        curY: wy,
        didModifyStrokeErase: false,
      };
      const eraseRadius = (eraserSize / zoom) * (0.5 + eraserSettings.hardness / 200) * (eraserSettings.opacity / 100);
      if (activeTool === 'eraser_stroke' && onReplacePageObjects) {
        let changed = false;
        const nextObjs: BoardObject[] = [];
        for (const o of page.objects) {
          if (o.locked || o.hidden || !eraserCanTouch(o) || (o.layerId && (hiddenLayerIds.has(o.layerId) || lockedLayerIds.has(o.layerId)))) {
            nextObjs.push(o);
            continue;
          }
          if (o.type === 'stroke') {
            const res = eraseStrokeByRadius(o, wx, wy, eraseRadius, eraserSettings.shape);
            if (res.changed) {
              changed = true;
              nextObjs.push(...res.pieces);
            } else {
              nextObjs.push(o);
            }
          } else {
            nextObjs.push(o);
          }
        }
        if (changed) {
          interactionRef.current.didModifyStrokeErase = true;
          onReplacePageObjects(nextObjs, false);
        }
      } else {
        const hit = visibleObjects.filter(
          (o) => !o.locked && eraserCanTouch(o) && !(o.layerId && lockedLayerIds.has(o.layerId)) && hitTestObject(o, wx, wy, objectsById, eraseRadius)
        );
        if (hit.length > 0 && onReplacePageObjects) {
          const hitSet = new Set(hit.map((h) => h.id));
          interactionRef.current.didModifyStrokeErase = true;
          onReplacePageObjects(page.objects.filter((o) => !hitSet.has(o.id)), false);
        } else if (hit.length > 0) {
          onDeleteObjects(hit.map((h) => h.id));
        }
      }
      return;
    }

    if (activeTool === 'eraser_area') {
      interactionRef.current = { ...interactionRef.current, mode: 'erase_area', startX: wx, startY: wy, curX: wx, curY: wy };
      return;
    }

    if (
      activeTool === 'pen' ||
      activeTool === 'pencil' ||
      activeTool === 'brush' ||
      activeTool === 'marker' ||
      activeTool === 'highlighter' ||
      activeTool === 'calligraphy' ||
      activeTool === 'fountain'
    ) {
      // Snap initial stroke point to ruler edge when using pen/pencil
      const rulerSnap = (activeTool === 'pen' || activeTool === 'pencil')
        ? snapToRulerEdge(wx, wy, instruments)
        : null;
      const sx0 = rulerSnap?.snapped ? rulerSnap.x : wx;
      const sy0 = rulerSnap?.snapped ? rulerSnap.y : wy;
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'draw_stroke',
        startX: sx0,
        startY: sy0,
        curX: sx0,
        curY: sy0,
        points: [{
          x: sx0,
          y: sy0,
          p: e.pointerType === 'mouse' ? 1 : e.pressure > 0 ? e.pressure : 0.5,
          tiltX: e.tiltX,
          tiltY: e.tiltY,
        }],
        shiftKey: e.shiftKey,
      };
      return;
    }

    if (activeTool === 'line' || activeTool === 'curved_line' || activeTool === 'arrow' || activeTool === 'double_arrow') {
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'draw_line',
        startX: maybeSnap(wx),
        startY: maybeSnap(wy),
        curX: maybeSnap(wx),
        curY: maybeSnap(wy),
        shiftKey: e.shiftKey,
      };
      return;
    }

    if (activeTool === 'polyline') {
      if (interactionRef.current.mode !== 'draw_polyline') {
        interactionRef.current = {
          ...interactionRef.current,
          mode: 'draw_polyline',
          polylinePts: [{ x: maybeSnap(wx), y: maybeSnap(wy) }],
          curX: wx,
          curY: wy,
        };
      } else {
        let px = maybeSnap(wx);
        let py = maybeSnap(wy);
        if (e.shiftKey && interactionRef.current.polylinePts.length > 0) {
          const prev = interactionRef.current.polylinePts[interactionRef.current.polylinePts.length - 1];
          const ang = Math.round(Math.atan2(py - prev.y, px - prev.x) / (Math.PI / 4)) * (Math.PI / 4);
          const d = dist(prev.x, prev.y, px, py);
          px = prev.x + d * Math.cos(ang);
          py = prev.y + d * Math.sin(ang);
        }
        interactionRef.current.polylinePts.push({ x: px, y: py });
      }
      setRenderTick((t) => t + 1);
      return;
    }

    if (activeTool === 'connector') {
      const hit = visibleObjects
        .slice()
        .reverse()
        .find((o) => o.type !== 'connector' && o.type !== 'stroke' && hitTestObject(o, wx, wy, objectsById, 16 / zoom));
      let startX = wx;
      let startY = wy;
      let fromPort: PortSide = 'right';
      if (hit) {
        const snap = getClosestPort(hit, wx, wy);
        startX = snap.x;
        startY = snap.y;
        fromPort = snap.side;
      }
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'draw_connector',
        fromId: hit?.id,
        fromPort,
        startX,
        startY,
        curX: wx,
        curY: wy,
      };
      return;
    }

    if (activeTool === 'shape') {
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'draw_shape',
        startX: maybeSnap(wx),
        startY: maybeSnap(wy),
        curX: maybeSnap(wx),
        curY: maybeSnap(wy),
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      };
      return;
    }

    if (activeTool === 'text') {
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'draw_text_box',
        startX: maybeSnap(wx),
        startY: maybeSnap(wy),
        curX: maybeSnap(wx),
        curY: maybeSnap(wy),
      };
      return;
    }

    if (activeTool === 'code') {
      const newObj: TextObject = {
        id: uid('code'),
        name: 'Code Block',
        type: 'text',
        codeBlock: true,
        codeLanguage: 'typescript',
        x: Math.round(maybeSnap(wx)),
        y: Math.round(maybeSnap(wy)),
        width: 520,
        height: 280,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: page.objects.length + 1,
        text: '',
        textColor: '#E2E8F0',
        bgColor: '#0F172A',
        fontFamily: 'JetBrains Mono',
        fontSize: 14,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
        lineHeight: 1.55,
        padding: 14,
        borderColor: '#334155',
        borderWidth: 1,
        borderRadius: 12,
        richBlocks: highlightCodeToRichBlocks('', 'typescript'),
      };
      onCreateObject(newObj);
      onSnapshotUndo?.();
      onSelectIds(new Set([newObj.id]));
      createdEmptyEditRef.current = false;
      createdToolOnEditRef.current = 'code';
      setEditingId(newObj.id);
      setEditingText('');
      return;
    }

    if (activeTool === 'sticky') {
      const d = textDefaults;
      const align = d?.textAlign || 'left';
      const newObj: StickyObject = {
        id: uid('sticky'),
        name: 'Sticky Note',
        type: 'sticky',
        x: maybeSnap(wx),
        y: maybeSnap(wy),
        width: 230,
        height: 185,
        rotation: 0,
        opacity,
        locked: false,
        hidden: false,
        zIndex: page.objects.length + 1,
        text: '',
        noteColor: d?.noteColor || '#FEF08A',
        textColor: d?.noteTextColor || '#1E293B',
        highlightColor: d?.highlightColor,
        author: userName || 'Note',
        fontFamily: d?.stickyFontFamily || 'DM Sans',
        fontSize: d?.stickyFontSize || 15,
        fontWeight: d?.fontWeight || 'normal',
        fontStyle: d?.fontStyle || 'normal',
        underline: Boolean(d?.underline),
        strikethrough: Boolean(d?.strikethrough),
        textAlign: align,
        lineHeight: d?.lineHeight || 1.38,
        noteStyle: d?.noteStyle || 'folded',
        richBlocks: [{ type: 'paragraph', align, indent: 0, listType: 'none', runs: [{ text: '' }] }],
        reactions: {},
      };
      onCreateObject(newObj);
      onSelectIds(new Set([newObj.id]));
      createdEmptyEditRef.current = false;
      createdToolOnEditRef.current = 'sticky';
      setEditingId(newObj.id);
      setEditingText('');
      return;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: sx, y: sy });
    }

    if (activePointers.current.size === 2 && lastPinchDist.current !== null) {
      const pts = Array.from(activePointers.current.values());
      const newDist = dist(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const ratio = newDist / (lastPinchDist.current || newDist);
      const nextZoom = Math.max(0.15, Math.min(4.5, zoom * ratio));
      lastPinchDist.current = newDist;
      // Pinch-to-rotate: track angle between two fingers
      if (lastPinchAngle.current !== null && onRotationChange) {
        const newAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        let angleDelta = ((newAngle - lastPinchAngle.current) * 180) / Math.PI;
        // Normalize to [-180, 180]
        if (angleDelta > 180) angleDelta -= 360;
        if (angleDelta < -180) angleDelta += 360;
        pinchRotateAccum.current += angleDelta;
        lastPinchAngle.current = newAngle;
        // Apply rotation only after exceeding 5-degree threshold
        if (Math.abs(pinchRotateAccum.current) >= 5) {
          onRotationChange(Math.round(rotationDeg + pinchRotateAccum.current));
          pinchRotateAccum.current = 0;
        }
      }
      const prevMidX = interactionRef.current.startX;
      const prevMidY = interactionRef.current.startY;
      const worldX = (prevMidX - panX) / zoom;
      const worldY = (prevMidY - panY) / zoom;
      interactionRef.current.startX = midX;
      interactionRef.current.startY = midY;
      onZoomChange(nextZoom);
      onPanChange(midX - worldX * nextZoom, midY - worldY * nextZoom);
      return;
    }

    const rawWorld = screenToWorld(sx, sy);
    const snapped = snapToRuler(rawWorld.x, rawWorld.y);
    const wx = snapped.x;
    const wy = snapped.y;
    hoverWorldRef.current = { x: wx, y: wy };
    onCursorMove(wx, wy);

    const inter = interactionRef.current;
    if (inter.mode === 'none') {
      if (activeTool === 'connector' || activeTool === 'eraser_stroke' || activeTool === 'eraser_object') {
        setRenderTick((t) => t + 1);
      }
      return;
    }

    if (
      !inter.undoSnapshotTaken &&
      ['drag_objects', 'resize_object', 'crop_pan', 'rotate_object', 'drag_bezier_cp', 'drag_table_divider'].includes(inter.mode)
    ) {
      onSnapshotUndo?.();
      inter.undoSnapshotTaken = true;
    }

    if (inter.mode === 'pan') {
      const sdx = sx - inter.startX;
      const sdy = sy - inter.startY;
      const rad = (-rotationDeg * Math.PI) / 180;
      const rdx = rotationDeg ? sdx * Math.cos(rad) - sdy * Math.sin(rad) : sdx;
      const rdy = rotationDeg ? sdx * Math.sin(rad) + sdy * Math.cos(rad) : sdy;
      const now = performance.now();
      const dt = Math.max(8, now - panVelocityRef.current.lastTs);
      panVelocityRef.current = {
        vx: ((sx - panVelocityRef.current.lastX) / dt) * 16,
        vy: ((sy - panVelocityRef.current.lastY) / dt) * 16,
        lastTs: now,
        lastX: sx,
        lastY: sy,
      };
      onPanChange(inter.panStartX + rdx, inter.panStartY + rdy);
      return;
    }

    if (inter.mode === 'laser') {
      const lCol = strokeColor && strokeColor !== '#0F172A' && strokeColor !== '#FFFFFF' ? strokeColor : '#EF4444';
      localLaserRef.current.push({ x: wx, y: wy, color: lCol, ts: Date.now() });
      onLaserPoint(wx, wy);
      setRenderTick((t) => t + 1);
      return;
    }

    if (inter.mode === 'draw_stroke') {
      if (e.shiftKey && activeTool === 'highlighter') {
        const dx = wx - inter.startX;
        const dy = wy - inter.startY;
        const endPt = Math.abs(dx) > Math.abs(dy) ? { x: wx, y: inter.startY, p: 0.6 } : { x: inter.startX, y: wy, p: 0.6 };
        inter.points = [{ x: inter.startX, y: inter.startY, p: 0.6 }, endPt];
        setRenderTick((t) => t + 1);
        return;
      }
      const last = inter.points[inter.points.length - 1];
      const minStep = 2.5 / zoom;
      if (!last || dist(last.x, last.y, wx, wy) >= minStep) {
        // Snap to ruler straight-edge when pen/pencil is active
        const snapped = (activeTool === 'pen' || activeTool === 'pencil')
          ? snapToRulerEdge(wx, wy, instruments)
          : null;
        const px = snapped?.snapped ? snapped.x : wx;
        const py = snapped?.snapped ? snapped.y : wy;
        inter.points.push({
          x: px,
          y: py,
          p: e.pointerType === 'mouse' ? 1 : e.pressure > 0 ? e.pressure : 0.5,
          tiltX: e.tiltX,
          tiltY: e.tiltY,
        });
        setRenderTick((t) => t + 1);
      }
      return;
    }

    if (inter.mode === 'draw_line') {
      let cx = maybeSnap(wx);
      let cy = maybeSnap(wy);
      if (e.shiftKey) {
        const ang = Math.round(Math.atan2(cy - inter.startY, cx - inter.startX) / (Math.PI / 4)) * (Math.PI / 4);
        const d = dist(inter.startX, inter.startY, cx, cy);
        cx = inter.startX + d * Math.cos(ang);
        cy = inter.startY + d * Math.sin(ang);
      }
      inter.curX = cx;
      inter.curY = cy;
      inter.shiftKey = e.shiftKey;
      setRenderTick((t) => t + 1);
      return;
    }

    if (inter.mode === 'draw_shape' || inter.mode === 'draw_text_box') {
      inter.curX = maybeSnap(wx);
      inter.curY = maybeSnap(wy);
      inter.shiftKey = e.shiftKey;
      inter.altKey = e.altKey;
      setRenderTick((t) => t + 1);
      return;
    }

    if (inter.mode === 'lasso') {
      const last = inter.points[inter.points.length - 1];
      if (!last || dist(last.x, last.y, wx, wy) >= 5 / zoom) {
        inter.points.push({ x: wx, y: wy, p: 0.5 });
        setRenderTick((t) => t + 1);
      }
      return;
    }

    if (inter.mode === 'draw_polyline' || inter.mode === 'draw_connector' || inter.mode === 'marquee' || inter.mode === 'erase_area') {
      inter.curX = wx;
      inter.curY = wy;
      inter.shiftKey = e.shiftKey;
      setRenderTick((t) => t + 1);
      return;
    }

    if (inter.mode === 'erase_stroke') {
      const eraseRadius = (eraserSize / zoom) * (0.5 + eraserSettings.hardness / 200) * (eraserSettings.opacity / 100);
      if (activeTool === 'eraser_stroke' && onReplacePageObjects) {
        let changed = false;
        const nextObjs: BoardObject[] = [];
        for (const o of page.objects) {
          if (o.locked || o.hidden || !eraserCanTouch(o) || (o.layerId && (hiddenLayerIds.has(o.layerId) || lockedLayerIds.has(o.layerId)))) {
            nextObjs.push(o);
            continue;
          }
          if (o.type === 'stroke') {
            const res = eraseStrokeByRadius(o, wx, wy, eraseRadius, eraserSettings.shape);
            if (res.changed) {
              changed = true;
              nextObjs.push(...res.pieces);
            } else {
              nextObjs.push(o);
            }
          } else {
            nextObjs.push(o);
          }
        }
        if (changed) {
          inter.didModifyStrokeErase = true;
          onReplacePageObjects(nextObjs, false);
        } else {
          setRenderTick((t) => t + 1);
        }
      } else {
        const hits = visibleObjects.filter(
          (o) => !o.locked && eraserCanTouch(o) && !(o.layerId && lockedLayerIds.has(o.layerId)) && hitTestObject(o, wx, wy, objectsById, eraseRadius)
        );
        if (hits.length > 0 && onReplacePageObjects) {
          const hitSet = new Set(hits.map((h) => h.id));
          inter.didModifyStrokeErase = true;
          onReplacePageObjects(page.objects.filter((o) => !hitSet.has(o.id)), false);
        } else if (hits.length > 0) {
          onDeleteObjects(hits.map((h) => h.id));
        } else {
          setRenderTick((t) => t + 1);
        }
      }
      return;
    }

    if (inter.mode === 'drag_bezier_cp' && selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      const lo = objectsById.get(id);
      const localCp = lo ? toObjectLocalPoint(lo, wx, wy, true) : { x: wx, y: wy };
      onUpdateObject(id, { cpX: Math.round(localCp.x), cpY: Math.round(localCp.y) }, false);
      return;
    }

    if (inter.mode === 'drag_table_divider' && inter.tableDivider) {
      const td = inter.tableDivider;
      const weights = [...td.initialWeights];
      const rawDx = wx - inter.startX;
      const rawDy = wy - inter.startY;
      const rad = (-(td.rotation || 0) * Math.PI) / 180;
      const localDx = rawDx * Math.cos(rad) - rawDy * Math.sin(rad);
      const localDy = rawDx * Math.sin(rad) + rawDy * Math.cos(rad);
      const delta = td.axis === 'col' ? localDx : localDy;
      const minCell = td.axis === 'col' ? 32 : 24;
      const maxDelta = weights[td.index + 1] - minCell;
      const minDelta = -(weights[td.index] - minCell);
      const clamped = Math.max(minDelta, Math.min(maxDelta, delta));
      weights[td.index] += clamped;
      weights[td.index + 1] -= clamped;
      onUpdateObject(
        td.objId,
        td.axis === 'col' ? { colWidths: weights.map((v) => Math.round(v)) } : { rowHeights: weights.map((v) => Math.round(v)) },
        false
      );
      return;
    }

    if (inter.mode === 'drag_objects' && inter.initialBounds) {
      let dx = wx - inter.startX;
      let dy = wy - inter.startY;
      let snapXLine: number | undefined;
      let snapYLine: number | undefined;
      let gapLabel: string | undefined;
      let gapLine: { x1: number; y1: number; x2: number; y2: number } | undefined;

      if (inter.initialBounds.size === 1) {
        const [dragId, b] = Array.from(inter.initialBounds.entries())[0];
        const candX = maybeSnap(b.x + dx);
        const candY = maybeSnap(b.y + dy);
        dx = candX - b.x;
        dy = candY - b.y;
        const threshold = 7 / zoom;
        const peerHoriz: BoardObject[] = [];
        for (const other of visibleObjects) {
          if (other.id === dragId || other.type === 'stroke') continue;
          if (Math.abs(candY - other.y) < 30 || Math.abs(candY + b.height / 2 - (other.y + other.height / 2)) < 30) {
            peerHoriz.push(other);
          }
          // Edge-to-edge & center X guides
          if (Math.abs(candX - other.x) < threshold) {
            dx = other.x - b.x;
            snapXLine = other.x;
          } else if (Math.abs(candX + b.width - (other.x + other.width)) < threshold) {
            dx = other.x + other.width - b.width - b.x;
            snapXLine = other.x + other.width;
          } else if (Math.abs(candX - (other.x + other.width)) < threshold) {
            dx = other.x + other.width - b.x;
            snapXLine = other.x + other.width;
          } else if (Math.abs(candX + b.width - other.x) < threshold) {
            dx = other.x - b.width - b.x;
            snapXLine = other.x;
          } else if (Math.abs(candX + b.width / 2 - (other.x + other.width / 2)) < threshold) {
            dx = other.x + other.width / 2 - b.width / 2 - b.x;
            snapXLine = other.x + other.width / 2;
          }
          // Edge-to-edge & center Y guides
          if (Math.abs(candY - other.y) < threshold) {
            dy = other.y - b.y;
            snapYLine = other.y;
          } else if (Math.abs(candY + b.height - (other.y + other.height)) < threshold) {
            dy = other.y + other.height - b.height - b.y;
            snapYLine = other.y + other.height;
          } else if (Math.abs(candY - (other.y + other.height)) < threshold) {
            dy = other.y + other.height - b.y;
            snapYLine = other.y + other.height;
          } else if (Math.abs(candY + b.height - other.y) < threshold) {
            dy = other.y - b.height - b.y;
            snapYLine = other.y;
          } else if (Math.abs(candY + b.height / 2 - (other.y + other.height / 2)) < threshold) {
            dy = other.y + other.height / 2 - b.height / 2 - b.y;
            snapYLine = other.y + other.height / 2;
          }
        }
        // Equal-gap horizontal spacing check
        if (peerHoriz.length >= 2) {
          peerHoriz.sort((a, p2) => a.x - p2.x);
          for (let i = 0; i < peerHoriz.length - 1; i++) {
            const pA = peerHoriz[i];
            const pB = peerHoriz[i + 1];
            const existingGap = pB.x - (pA.x + pA.width);
            if (existingGap > 4 && existingGap < 240) {
              const targetX = pB.x + pB.width + existingGap;
              if (Math.abs(candX - targetX) < threshold) {
                dx = targetX - b.x;
                gapLabel = `= ${Math.round(existingGap)}px =`;
                gapLine = { x1: pB.x + pB.width, y1: candY + b.height / 2, x2: targetX, y2: candY + b.height / 2 };
              }
            }
          }
        }
        // Snap to Slide Artboard centers, edges, & safe margins
        if (slideArtboard) {
          const aw = slideArtboard.width;
          const ah = slideArtboard.height;
          if (Math.abs(candX + b.width / 2 - aw / 2) < threshold) {
            dx = aw / 2 - b.width / 2 - b.x;
            snapXLine = aw / 2;
          } else if (Math.abs(candX - 48) < threshold) {
            dx = 48 - b.x;
            snapXLine = 48;
          } else if (Math.abs(candX + b.width - (aw - 48)) < threshold) {
            dx = aw - 48 - b.width - b.x;
            snapXLine = aw - 48;
          } else if (Math.abs(candX) < threshold) {
            dx = -b.x;
            snapXLine = 0;
          } else if (Math.abs(candX + b.width - aw) < threshold) {
            dx = aw - b.width - b.x;
            snapXLine = aw;
          }
          if (Math.abs(candY + b.height / 2 - ah / 2) < threshold) {
            dy = ah / 2 - b.height / 2 - b.y;
            snapYLine = ah / 2;
          } else if (Math.abs(candY - 48) < threshold) {
            dy = 48 - b.y;
            snapYLine = 48;
          } else if (Math.abs(candY + b.height - (ah - 48)) < threshold) {
            dy = ah - 48 - b.height - b.y;
            snapYLine = ah - 48;
          } else if (Math.abs(candY) < threshold) {
            dy = -b.y;
            snapYLine = 0;
          } else if (Math.abs(candY + b.height - ah) < threshold) {
            dy = ah - b.height - b.y;
            snapYLine = ah;
          }
        }
      }
      setAlignSnapLines({ x: snapXLine, y: snapYLine, gapLabel, gapLine });
      for (const [id, b] of inter.initialBounds.entries()) {
        const obj = objectsById.get(id);
        if (!obj || obj.locked || (obj.layerId && lockedLayerIds.has(obj.layerId))) continue;
        const nx = Math.round(b.x + dx);
        const ny = Math.round(b.y + dy);
        const offsetX = nx - b.x;
        const offsetY = ny - b.y;
        if (obj.type === 'stroke' && b.points) {
          onUpdateObject(
            id,
            {
              x: nx,
              y: ny,
              points: (b.points as StrokePoint[]).map((p) => ({ ...p, x: p.x + offsetX, y: p.y + offsetY })),
            },
            false
          );
        } else if (obj.type === 'line' && b.points) {
          onUpdateObject(
            id,
            {
              x: nx,
              y: ny,
              points: b.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })),
              ...(typeof b.cpX === 'number' ? { cpX: b.cpX + offsetX } : {}),
              ...(typeof b.cpY === 'number' ? { cpY: b.cpY + offsetY } : {}),
            },
            false
          );
        } else {
          onUpdateObject(id, { x: nx, y: ny }, false);
        }
      }
      return;
    }

    if (inter.mode === 'crop_pan' && inter.initialBounds) {
      const [id, b] = Array.from(inter.initialBounds.entries())[0];
      const nextCrop = computeCropPan(b, b.natW || 800, b.natH || 600, wx - inter.startX, wy - inter.startY);
      onUpdateObject(id, { crop: nextCrop }, false);
      return;
    }

    if (inter.mode === 'resize_object' && inter.initialBounds && inter.resizeHandle && inter.groupStartBox) {
      const sb = inter.groupStartBox;
      const resizeHandle = (inter.resizeHandle === 'rotate' ? 'se' : inter.resizeHandle) as
        | 'nw'
        | 'n'
        | 'ne'
        | 'e'
        | 'se'
        | 's'
        | 'sw'
        | 'w';
      if (inter.initialBounds.size === 1) {
        const [id, b] = Array.from(inter.initialBounds.entries())[0];
        const obj = objectsById.get(id);
        if (obj && obj.type === 'image' && croppingId === obj.id) {
          const cropped = computeCroppedResize(
            b,
            b.natW || 800,
            b.natH || 600,
            resizeHandle,
            wx - inter.startX,
            wy - inter.startY,
            e.shiftKey
          );
          onUpdateObject(id, cropped, false);
          return;
        }
        const nextBox = computeRotatedResizeBox(sb, resizeHandle, wx - inter.startX, wy - inter.startY, e.shiftKey);
        if (obj && obj.type === 'stroke' && b.points) {
          onUpdateObject(id, { ...nextBox, points: scalePointsToBox(b.points as StrokePoint[], b, nextBox) }, false);
        } else if (obj && obj.type === 'line' && b.points) {
          const scaledCp =
            typeof b.cpX === 'number' && typeof b.cpY === 'number'
              ? scalePointToBox({ x: b.cpX, y: b.cpY }, b, nextBox)
              : null;
          onUpdateObject(
            id,
            {
              ...nextBox,
              points: scalePointsToBox(b.points, b, nextBox),
              ...(scaledCp ? { cpX: Math.round(scaledCp.x), cpY: Math.round(scaledCp.y) } : {}),
            },
            false
          );
        } else {
          onUpdateObject(id, nextBox, false);
        }
      } else {
        const nextBox = computeRotatedResizeBox(sb, resizeHandle, wx - inter.startX, wy - inter.startY, e.shiftKey);
        // Multi-select proportional group scale
        const sxScale = nextBox.width / Math.max(1, sb.width);
        const syScale = nextBox.height / Math.max(1, sb.height);
        for (const [id, b] of inter.initialBounds.entries()) {
          const obj = objectsById.get(id);
          if (!obj || obj.locked || (obj.layerId && lockedLayerIds.has(obj.layerId))) continue;
          const childBox = {
            x: Math.round(nextBox.x + (b.x - sb.x) * sxScale),
            y: Math.round(nextBox.y + (b.y - sb.y) * syScale),
            width: Math.max(12, Math.round(b.width * sxScale)),
            height: Math.max(12, Math.round(b.height * syScale)),
          };
          if (obj.type === 'stroke' && b.points) {
            onUpdateObject(id, { ...childBox, points: scalePointsToBox(b.points as StrokePoint[], b, childBox) }, false);
          } else if (obj.type === 'line' && b.points) {
            const scaledCp =
              typeof b.cpX === 'number' && typeof b.cpY === 'number'
                ? scalePointToBox({ x: b.cpX, y: b.cpY }, b, childBox)
                : null;
            onUpdateObject(
              id,
              {
                ...childBox,
                points: scalePointsToBox(b.points, b, childBox),
                ...(scaledCp ? { cpX: Math.round(scaledCp.x), cpY: Math.round(scaledCp.y) } : {}),
              },
              false
            );
          } else {
            onUpdateObject(id, childBox, false);
          }
        }
      }
      return;
    }

    if (inter.mode === 'rotate_object' && inter.rotateCenter && inter.initialBounds) {
      const angleNow = Math.atan2(wy - inter.rotateCenter.y, wx - inter.rotateCenter.x);
      let deltaDeg = ((angleNow - inter.rotateCenter.startAngle) * 180) / Math.PI;
      if (e.shiftKey) {
        const target = Math.round((inter.rotateCenter.initialRot + deltaDeg) / 15) * 15;
        deltaDeg = target - inter.rotateCenter.initialRot;
      }
      if (inter.initialBounds.size === 1) {
        const [id] = Array.from(inter.initialBounds.keys());
        onUpdateObject(id, { rotation: Math.round(inter.rotateCenter.initialRot + deltaDeg) }, false);
      } else {
        const rad = (deltaDeg * Math.PI) / 180;
        const gcx = inter.rotateCenter.x;
        const gcy = inter.rotateCenter.y;
        for (const [id, b] of inter.initialBounds.entries()) {
          const obj = objectsById.get(id);
          if (!obj || obj.locked || (obj.layerId && lockedLayerIds.has(obj.layerId))) continue;
          const ocx = b.x + b.width / 2;
          const ocy = b.y + b.height / 2;
          const rx = gcx + (ocx - gcx) * Math.cos(rad) - (ocy - gcy) * Math.sin(rad);
          const ry = gcy + (ocx - gcx) * Math.sin(rad) + (ocy - gcy) * Math.cos(rad);
          onUpdateObject(
            id,
            {
              x: Math.round(rx - b.width / 2),
              y: Math.round(ry - b.height / 2),
              rotation: Math.round((b.rotation || 0) + deltaDeg),
            },
            false
          );
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hadMultiTouch = activePointers.current.size >= 2;
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      lastPinchDist.current = null;
      lastPinchAngle.current = null;
      pinchRotateAccum.current = 0;
    }

    const inter = interactionRef.current;
    if (hadMultiTouch || inter.mode === 'pan') {
      const speed = Math.hypot(panVelocityRef.current.vx, panVelocityRef.current.vy);
      if (inter.mode === 'pan' && speed > 3 && !hadMultiTouch) {
        let vx = panVelocityRef.current.vx;
        let vy = panVelocityRef.current.vy;
        let curPanX = panX;
        let curPanY = panY;
        const rad = (-rotationDeg * Math.PI) / 180;
        const stepInertia = () => {
          vx *= 0.88;
          vy *= 0.88;
          if (Math.hypot(vx, vy) < 0.4) {
            inertiaRafRef.current = null;
            return;
          }
          const rdx = rotationDeg ? vx * Math.cos(rad) - vy * Math.sin(rad) : vx;
          const rdy = rotationDeg ? vx * Math.sin(rad) + vy * Math.cos(rad) : vy;
          curPanX += rdx;
          curPanY += rdy;
          onPanChange(curPanX, curPanY);
          inertiaRafRef.current = requestAnimationFrame(stepInertia);
        };
        inertiaRafRef.current = requestAnimationFrame(stepInertia);
      }
      inter.mode = 'none';
      inter.points = [];
      inter.undoSnapshotTaken = false;
      return;
    }
    if (inter.mode === 'draw_polyline') return;

    if (inter.mode === 'lasso') {
      const poly = inter.points;
      if (poly.length >= 3) {
        const hits = visibleObjects.filter((o) => {
          if (o.type === 'stroke') {
            return o.points.some((p) => pointInPolygon(p.x, p.y, poly));
          }
          return pointInPolygon(o.x + o.width / 2, o.y + o.height / 2, poly);
        });
        const nextSet = inter.shiftKey || e.shiftKey || e.ctrlKey || e.metaKey || multiSelectMode ? new Set(selectedIds) : new Set<string>();
        hits.forEach((h) => nextSet.add(h.id));
        onSelectIds(nextSet);
      }
      inter.mode = 'none';
      inter.points = [];
      setRenderTick((t) => t + 1);
      return;
    }

    if (inter.mode === 'draw_text_box') {
      const w = Math.abs(inter.curX - inter.startX);
      const h = Math.abs(inter.curY - inter.startY);
      const isTap = w < 16 && h < 12;
      const boxW = isTap ? 260 : Math.max(120, Math.round(w));
      const boxH = isTap ? 52 : Math.max(48, Math.round(h));
      const bx = isTap ? inter.startX : Math.min(inter.startX, inter.curX);
      const by = isTap ? inter.startY : Math.min(inter.startY, inter.curY);
      const textColor = strokeColor === '#FFFFFF' ? '#0F172A' : strokeColor;
      const d = textDefaults;
      const align = d?.textAlign || 'left';
      const newObj: TextObject = {
        id: uid('text'),
        name: 'Text Box',
        type: 'text',
        x: Math.round(bx),
        y: Math.round(by),
        width: boxW,
        height: boxH,
        rotation: 0,
        opacity,
        locked: false,
        hidden: false,
        zIndex: page.objects.length + 1,
        text: '',
        textColor,
        bgColor: d?.bgColor || 'transparent',
        highlightColor: d?.highlightColor,
        fontFamily: d?.fontFamily || 'Plus Jakarta Sans',
        fontSize: d?.fontSize || 18,
        fontWeight: d?.fontWeight || 'normal',
        fontStyle: d?.fontStyle || 'normal',
        underline: Boolean(d?.underline),
        strikethrough: Boolean(d?.strikethrough),
        textAlign: align,
        lineHeight: d?.lineHeight || 1.38,
        padding: d?.padding ?? 10,
        borderColor: d?.borderColor,
        borderWidth: d?.borderWidth,
        borderRadius: d?.borderRadius ?? 8,
        autoFit: isTap,
        richBlocks: [{ type: 'paragraph', align, indent: 0, listType: 'none', runs: [{ text: '' }] }],
      };
      onCreateObject(newObj);
      onSelectIds(new Set([newObj.id]));
      createdEmptyEditRef.current = true;
      createdToolOnEditRef.current = 'text';
      setEditingId(newObj.id);
      setEditingText('');
      inter.mode = 'none';
      return;
    }

    if (inter.mode === 'draw_stroke') {
      const rawPts = inter.points;
      if (rawPts.length > 0) {
      const smoothed = smoothStrokePoints(rawPts, smoothing, stabilization);
        if (autoSmartShape && activeTool === 'pen') {
          const smart = recognizeRoughShape(smoothed, strokeColor, strokeWidth);
          if (smart) {
            smart.zIndex = page.objects.length + 1;
            smart.opacity = opacity;
            onCreateObject(smart);
            inter.mode = 'none';
            inter.points = [];
            setRenderTick((t) => t + 1);
            return;
          }
        }
        const minX = Math.min(...smoothed.map((p) => p.x));
        const minY = Math.min(...smoothed.map((p) => p.y));
        const maxX = Math.max(...smoothed.map((p) => p.x));
        const maxY = Math.max(...smoothed.map((p) => p.y));
        const newStrokeId = uid('stroke');
        onCreateObject({
          id: newStrokeId,
          name: `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} Stroke`,
          type: 'stroke',
          x: minX,
          y: minY,
          width: Math.max(4, maxX - minX),
          height: Math.max(4, maxY - minY),
          rotation: 0,
          opacity,
          locked: false,
          hidden: false,
          zIndex: page.objects.length + 1,
          points: smoothed,
          brushKind:
            activeTool === 'pencil' ||
            activeTool === 'brush' ||
            activeTool === 'marker' ||
            activeTool === 'highlighter' ||
            activeTool === 'calligraphy' ||
            activeTool === 'fountain'
              ? activeTool
              : 'pen',
          stroke: strokeColor,
          strokeWidth,
          lineStyle,
          smoothing,
          stabilization,
          pressureSize: true,
          pressureOpacity: false,
          pressureCurve: 'linear',
          tiltSensitivity: activeTool === 'calligraphy' ? 0.65 : 0,
          taperStart: 0,
          taperEnd: 0,
        });
        if (!autoSmartShape && activeTool === 'pen' && smoothed.length > 8) {
          const smartCand = recognizeRoughShape(smoothed, strokeColor, strokeWidth);
          if (smartCand) {
            smartCand.zIndex = page.objects.length + 2;
            smartCand.opacity = opacity;
            setInkSuggestion({ strokeId: newStrokeId, suggested: smartCand, x: maxX, y: maxY });
          }
        }
      }
    } else if (inter.mode === 'draw_line') {
      if (dist(inter.startX, inter.startY, inter.curX, inter.curY) > 4) {
        onCreateObject({
          id: uid('line'),
          name: activeTool === 'arrow' ? 'Arrow' : activeTool === 'double_arrow' ? 'Double Arrow' : 'Line',
          type: 'line',
          x: Math.min(inter.startX, inter.curX),
          y: Math.min(inter.startY, inter.curY),
          width: Math.max(4, Math.abs(inter.curX - inter.startX)),
          height: Math.max(4, Math.abs(inter.curY - inter.startY)),
          rotation: 0,
          opacity,
          locked: false,
          hidden: false,
          zIndex: page.objects.length + 1,
          points: [
            { x: inter.startX, y: inter.startY },
            { x: inter.curX, y: inter.curY },
          ],
          curved: activeTool === 'curved_line',
          stroke: strokeColor,
          strokeWidth,
          lineStyle,
          startHead: activeTool === 'double_arrow' ? (lineStartHead !== 'none' ? lineStartHead : 'arrow') : lineStartHead,
          endHead: activeTool === 'arrow' || activeTool === 'double_arrow' ? (lineEndHead !== 'none' ? lineEndHead : 'arrow') : lineEndHead,
        });
      }
    } else if (inter.mode === 'draw_shape') {
      const dx = inter.curX - inter.startX;
      const dy = inter.curY - inter.startY;
      const w = inter.altKey ? Math.abs(dx) * 2 : Math.abs(dx);
      const h = inter.altKey ? Math.abs(dy) * 2 : Math.abs(dy);
      const isTap = Math.abs(dx) < 12 && Math.abs(dy) < 12;
      const constrain = e.shiftKey || inter.shiftKey || activeShapeKind === 'square' || activeShapeKind === 'circle';
      const defaultW =
        activeShapeKind === 'frame' ? 360 : activeShapeKind === 'square' || activeShapeKind === 'circle' ? 120 : 160;
      const defaultH =
        activeShapeKind === 'frame' ? 240 : activeShapeKind === 'square' || activeShapeKind === 'circle' ? 120 : 96;
      const rawW = isTap ? defaultW : Math.max(24, w);
      const rawH = isTap ? defaultH : Math.max(24, h);
      const side = Math.max(rawW, rawH);
      const finalW = Math.round(constrain ? side : rawW);
      const finalH = Math.round(constrain ? side : rawH);
      const sx = isTap ? inter.startX : inter.altKey ? inter.startX - finalW / 2 : dx >= 0 ? inter.startX : inter.startX - finalW;
      const sy = isTap ? inter.startY : inter.altKey ? inter.startY - finalH / 2 : dy >= 0 ? inter.startY : inter.startY - finalH;
      const isDarkFill = (() => {
        if (!fillColor || fillColor === 'transparent' || !fillColor.startsWith('#') || fillColor.length !== 7) return false;
        const r = parseInt(fillColor.slice(1, 3), 16);
        const g = parseInt(fillColor.slice(3, 5), 16);
        const b = parseInt(fillColor.slice(5, 7), 16);
        return 0.299 * r + 0.587 * g + 0.114 * b < 140;
      })();
      onCreateObject({
        id: uid('shape'),
        name: activeShapeKind === 'frame' ? 'Section Frame' : activeShapeKind.replace(/_/g, ' '),
        type: 'shape',
        shapeKind: activeShapeKind,
        x: Math.round(sx),
        y: Math.round(sy),
        width: finalW,
        height: finalH,
        rotation: 0,
        opacity,
        locked: false,
        hidden: false,
        zIndex: page.objects.length + 1,
        fill: activeShapeKind === 'frame' && fillColor === '#EFF6FF' ? 'rgba(248,250,252,0.55)' : fillColor,
        fillStyle: shapeFillStyle,
        stroke: strokeColor,
        strokeWidth,
        lineStyle,
        cornerRadius: shapeCornerRadius ?? (activeShapeKind === 'rounded_rect' ? 14 : activeShapeKind === 'frame' ? 10 : undefined),
        shadow: shapeShadow,
        text: activeShapeKind === 'frame' ? 'Section' : '',
        textColor: isDarkFill ? '#FFFFFF' : '#0F172A',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 15,
        fontWeight: activeShapeKind === 'frame' ? 'bold' : 'normal',
        fontStyle: 'normal',
        textAlign: 'center',
      });
    } else if (inter.mode === 'draw_connector') {
      const target = visibleObjects
        .slice()
        .reverse()
        .find((o) => o.type !== 'connector' && o.type !== 'stroke' && o.id !== inter.fromId && hitTestObject(o, inter.curX, inter.curY, objectsById, 16 / zoom));
      let x2 = inter.curX;
      let y2 = inter.curY;
      let toPort: PortSide = 'left';
      if (target) {
        const snap = getClosestPort(target, inter.curX, inter.curY);
        x2 = snap.x;
        y2 = snap.y;
        toPort = snap.side;
      }
      if (dist(inter.startX, inter.startY, x2, y2) > 10) {
        const conn: ConnectorObject = {
          id: uid('conn'),
          name: 'Connector',
          type: 'connector',
          x: Math.min(inter.startX, x2),
          y: Math.min(inter.startY, y2),
          width: Math.max(4, Math.abs(x2 - inter.startX)),
          height: Math.max(4, Math.abs(y2 - inter.startY)),
          rotation: 0,
          opacity,
          locked: false,
          hidden: false,
          zIndex: page.objects.length + 1,
          fromId: inter.fromId,
          toId: target?.id,
          fromPort: inter.fromPort || 'right',
          toPort,
          x1: inter.startX,
          y1: inter.startY,
          x2,
          y2,
          routeType: connectorRouteType,
          stroke: strokeColor,
          strokeWidth: Math.max(2, strokeWidth),
          lineStyle,
          startHead: lineStartHead,
          endHead: lineEndHead,
        };
        onCreateObject(conn);
      }
    } else if (inter.mode === 'marquee') {
      const mx0 = Math.min(inter.startX, inter.curX);
      const my0 = Math.min(inter.startY, inter.curY);
      const mx1 = Math.max(inter.startX, inter.curX);
      const my1 = Math.max(inter.startY, inter.curY);
      if (mx1 - mx0 > 5 && my1 - my0 > 5) {
        const hits = visibleObjects.filter((o) => {
          let bx0 = o.x,
            by0 = o.y,
            bx1 = o.x + o.width,
            by1 = o.y + o.height;
          if (o.type === 'connector') {
            const { x1, y1, x2, y2 } = resolveConnectorEndpoints(o, objectsById);
            bx0 = Math.min(x1, x2);
            by0 = Math.min(y1, y2);
            bx1 = Math.max(x1, x2);
            by1 = Math.max(y1, y2);
          }
          if (selectionMode === 'contained') {
            return bx0 >= mx0 && bx1 <= mx1 && by0 >= my0 && by1 <= my1;
          }
          return bx1 >= mx0 && bx0 <= mx1 && by1 >= my0 && by0 <= my1;
        });
        const nextSel = inter.shiftKey || e.shiftKey || e.ctrlKey || e.metaKey || multiSelectMode ? new Set(selectedIds) : new Set<string>();
        hits.forEach((h) => nextSel.add(h.id));
        onSelectIds(nextSel);
      }
    } else if (inter.mode === 'erase_area') {
      const mx0 = Math.min(inter.startX, inter.curX);
      const my0 = Math.min(inter.startY, inter.curY);
      const mx1 = Math.max(inter.startX, inter.curX);
      const my1 = Math.max(inter.startY, inter.curY);
      if (onReplacePageObjects) {
        let changed = false;
        const nextObjs: BoardObject[] = [];
        for (const o of page.objects) {
          if (o.locked || o.hidden || (o.layerId && (hiddenLayerIds.has(o.layerId) || lockedLayerIds.has(o.layerId)))) {
            nextObjs.push(o);
            continue;
          }
          if (o.type === 'stroke') {
            const res = eraseStrokeByRect(o, { x: mx0, y: my0, width: mx1 - mx0, height: my1 - my0 });
            if (res.changed) {
              changed = true;
              nextObjs.push(...res.pieces);
            } else {
              nextObjs.push(o);
            }
          } else {
            let intersects = false;
            if (o.type === 'connector') {
              const { x1, y1, x2, y2 } = resolveConnectorEndpoints(o, objectsById);
              intersects = Math.max(x1, x2) >= mx0 && Math.min(x1, x2) <= mx1 && Math.max(y1, y2) >= my0 && Math.min(y1, y2) <= my1;
            } else {
              intersects = o.x + o.width >= mx0 && o.x <= mx1 && o.y + o.height >= my0 && o.y <= my1;
            }
            if (intersects) changed = true;
            else nextObjs.push(o);
          }
        }
        if (changed) onReplacePageObjects(nextObjs, true);
      }
    } else if (inter.mode === 'erase_stroke') {
      if (inter.didModifyStrokeErase) {
        onSyncPageState?.();
      }
    } else if (
      inter.mode === 'drag_objects' ||
      inter.mode === 'resize_object' ||
      inter.mode === 'crop_pan' ||
      inter.mode === 'rotate_object' ||
      inter.mode === 'drag_bezier_cp' ||
      inter.mode === 'drag_table_divider'
    ) {
      setAlignSnapLines({});
      const patches: (Partial<BoardObject> & { id: string })[] = [];
      const changedIds = new Set<string>();
      if (inter.initialBounds) {
        for (const id of inter.initialBounds.keys()) {
          const cur = objectsById.get(id);
          if (cur) {
            const before = inter.initialBounds.get(id)!;
            const hasChanged =
              cur.x !== before.x || cur.y !== before.y || cur.width !== before.width || cur.height !== before.height ||
              (cur.rotation || 0) !== (before.rotation || 0) || cur.flipX !== before.flipX || cur.flipY !== before.flipY ||
              (before.points !== undefined && JSON.stringify(cur.type === 'stroke' || cur.type === 'line' ? cur.points : undefined) !== JSON.stringify(before.points)) ||
              (before.crop !== undefined && JSON.stringify(cur.type === 'image' ? cur.crop : undefined) !== JSON.stringify(before.crop)) ||
              (before.cpX !== undefined && cur.type === 'line' && cur.cpX !== before.cpX) ||
              (before.cpY !== undefined && cur.type === 'line' && cur.cpY !== before.cpY) ||
              (inter.mode === 'drag_bezier_cp' && cur.type === 'line' && (
                (cur.cpX ?? ((cur.points[0].x + cur.points[1].x) / 2)) !== (before.cpX ?? ((cur.points[0].x + cur.points[1].x) / 2)) ||
                (cur.cpY ?? ((cur.points[0].y + cur.points[1].y) / 2 - 48)) !== (before.cpY ?? ((cur.points[0].y + cur.points[1].y) / 2 - 48))
              ));
            if (!hasChanged) continue;
            changedIds.add(id);
            patches.push({
              id,
              x: cur.x,
              y: cur.y,
              width: cur.width,
              height: cur.height,
              rotation: cur.rotation,
              ...(cur.type === 'image' ? { crop: cur.crop } : {}),
              ...(cur.type === 'stroke' || cur.type === 'line' ? { points: cur.points } : {}),
              ...(cur.type === 'line' ? { cpX: cur.cpX, cpY: cur.cpY } : {}),
            });
          }
        }
      } else if (inter.mode === 'drag_bezier_cp' && selectedIds.size === 1) {
        const id = Array.from(selectedIds)[0];
        const cur = objectsById.get(id);
        if (cur && cur.type === 'line') {
          patches.push({ id, cpX: cur.cpX, cpY: cur.cpY });
        }
      } else if (inter.mode === 'drag_table_divider' && inter.tableDivider) {
        const cur = objectsById.get(inter.tableDivider.objId);
        if (cur && cur.type === 'table') {
          const td = inter.tableDivider;
          const size = td.axis === 'col' ? cur.width : cur.height;
          const count = td.axis === 'col' ? cur.cols : cur.rows;
          const actual = td.axis === 'col' ? cur.colWidths : cur.rowHeights;
          const currentWeights = actual && actual.length === count
            ? actual
            : Array(count).fill(size / count);
          if (currentWeights.some((value, i) => Math.abs(value - td.initialWeights[i]) > 0.5)) {
            patches.push({ id: cur.id, colWidths: cur.colWidths, rowHeights: cur.rowHeights });
          }
        }
      }
      // Keep attached connectors' stored endpoints and bounding boxes synced
      for (const obj of page.objects) {
        if (obj.type === 'connector' && ((obj.fromId && changedIds.has(obj.fromId)) || (obj.toId && changedIds.has(obj.toId)))) {
          const fromObj = obj.fromId ? objectsById.get(obj.fromId) : undefined;
          const toObj = obj.toId ? objectsById.get(obj.toId) : undefined;
          const p1 = fromObj ? getPortPoint(fromObj, obj.fromPort || 'right') : { x: obj.x1, y: obj.y1 };
          const p2 = toObj ? getPortPoint(toObj, obj.toPort || 'left') : { x: obj.x2, y: obj.y2 };
          patches.push({
            id: obj.id,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            width: Math.max(4, Math.abs(p2.x - p1.x)),
            height: Math.max(4, Math.abs(p2.y - p1.y)),
          });
        }
      }
      if (patches.length > 0 && onBatchPatchObjects) {
        onBatchPatchObjects(patches, false);
      } else if (patches.length > 0 && onSyncPageState) {
        onSyncPageState();
      }
    }

    inter.mode = 'none';
    inter.points = [];
    inter.didModifyStrokeErase = false;
    inter.undoSnapshotTaken = false;
    setRenderTick((t) => t + 1);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (interactionRef.current.mode === 'draw_polyline') {
      finishPolyline();
      return;
    }

    if (!canEdit || canvasLocked) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const { x: wx, y: wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = findHitObject(wx, wy);
    if (hit && hit.type === 'graph') {
      onOpenMathOrGraph?.('graph', hit);
      return;
    }
    if (hit && hit.type === 'table' && !hit.locked && !(hit.layerId && lockedLayerIds.has(hit.layerId))) {
      onSelectIds(new Set([hit.id]));
      const local = toObjectLocalPoint(hit, wx, wy, false);
      const colWs =
        hit.colWidths && hit.colWidths.length === hit.cols ? hit.colWidths : Array(hit.cols).fill(hit.width / hit.cols);
      const sumC = colWs.reduce((a, b) => a + b, 0) || hit.width;
      let accX = hit.x;
      let clickedCol = Math.max(0, hit.cols - 1);
      for (let c = 0; c < hit.cols; c++) {
        const w = (colWs[c] / sumC) * hit.width;
        if (local.x <= accX + w) {
          clickedCol = c;
          break;
        }
        accX += w;
      }
      const rowHs =
        hit.rowHeights && hit.rowHeights.length === hit.rows ? hit.rowHeights : Array(hit.rows).fill(hit.height / hit.rows);
      const sumR = rowHs.reduce((a, b) => a + b, 0) || hit.height;
      let accY = hit.y;
      let clickedRow = Math.max(0, hit.rows - 1);
      for (let r = 0; r < hit.rows; r++) {
        const h = (rowHs[r] / sumR) * hit.height;
        if (local.y <= accY + h) {
          clickedRow = r;
          break;
        }
        accY += h;
      }
      setEditingTableCell({
        id: hit.id,
        r: clickedRow,
        c: clickedCol,
        value: hit.cells[clickedRow]?.[clickedCol] ?? '',
      });
      return;
    }
    if (hit && hit.type === 'image' && !hit.locked && !(hit.layerId && lockedLayerIds.has(hit.layerId))) {
      onSelectIds(new Set([hit.id]));
      setCroppingId((prev) => (prev === hit.id ? null : hit.id));
      return;
    }
    if (hit && (hit.type === 'text' || hit.type === 'sticky' || hit.type === 'shape' || hit.type === 'math')) {
      onSelectIds(new Set([hit.id]));
      if (hit.type === 'text' && hit.codeBlock) onSnapshotUndo?.();
      createdEmptyEditRef.current = false;
      createdToolOnEditRef.current = null;
      setEditingId(hit.id);
      setEditingText(hit.type === 'math' ? hit.latex : hit.text);
      return;
    }

    // Excalidraw-style double-click anywhere on empty canvas to add rich text
    if (!hit && activeTool === 'select') {
      const d = textDefaults;
      const align = d?.textAlign || 'left';
      const newObj: TextObject = {
        id: uid('text'),
        name: 'Text Box',
        type: 'text',
        x: maybeSnap(wx),
        y: maybeSnap(wy),
        width: 260,
        height: 52,
        rotation: 0,
        opacity,
        locked: false,
        hidden: false,
        zIndex: page.objects.length + 1,
        text: '',
        textColor: strokeColor === '#FFFFFF' ? '#0F172A' : strokeColor,
        bgColor: d?.bgColor || 'transparent',
        highlightColor: d?.highlightColor,
        fontFamily: d?.fontFamily || 'Plus Jakarta Sans',
        fontSize: d?.fontSize || 18,
        fontWeight: d?.fontWeight || 'normal',
        fontStyle: d?.fontStyle || 'normal',
        underline: Boolean(d?.underline),
        strikethrough: Boolean(d?.strikethrough),
        textAlign: align,
        lineHeight: d?.lineHeight || 1.38,
        padding: d?.padding ?? 10,
        borderColor: d?.borderColor,
        borderWidth: d?.borderWidth,
        borderRadius: d?.borderRadius ?? 8,
        richBlocks: [{ type: 'paragraph', align, indent: 0, listType: 'none', runs: [{ text: '' }] }],
      };
      onCreateObject(newObj);
      onSelectIds(new Set([newObj.id]));
      createdEmptyEditRef.current = true;
      createdToolOnEditRef.current = null;
      setEditingId(newObj.id);
      setEditingText('');
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.09 : 0.92;
      const nextZoom = Math.max(0.15, Math.min(4.5, zoom * factor));
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      let rx = sx;
      let ry = sy;
      if (rotationDeg !== 0) {
        const cx = size.width / 2;
        const cy = size.height / 2;
        const dx = sx - cx;
        const dy = sy - cy;
        const rad = (-rotationDeg * Math.PI) / 180;
        rx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
        ry = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
      }
      onZoomChange(nextZoom);
      onPanChange(rx - wx * nextZoom, ry - wy * nextZoom);
    } else {
      onPanChange(panX - e.deltaX, panY - e.deltaY);
    }
  };

  const syncFromRichEditor = useCallback(
    (commitHistory = false) => {
      if (!editingId || !editorRef.current) return;
      const obj = objectsById.get(editingId);
      if (!obj || (obj.type !== 'text' && obj.type !== 'sticky')) return;
      if (obj.type === 'text' && obj.codeBlock) {
        const code = editorRef.current.innerText.replace(/\r\n?/g, '\n');
        onUpdateObject(editingId, {
          text: code,
          richBlocks: highlightCodeToRichBlocks(code, obj.codeLanguage || 'typescript'),
        }, commitHistory);
        return;
      }
      const blocks = htmlToRichBlocks(editorRef.current);
      const plain = richBlocksToPlainText(blocks);
      const bottomPad = obj.type === 'sticky' ? 32 : 8;
      const measuredH = Math.ceil(editorRef.current.scrollHeight / zoom) + bottomPad;
      const nextHeight = Math.max(obj.height, obj.type === 'sticky' ? Math.max(170, measuredH) : Math.max(48, measuredH));
      onUpdateObject(
        editingId,
        {
          text: plain,
          richBlocks: blocks,
          height: nextHeight,
        },
        commitHistory
      );
    },
    [editingId, objectsById, onUpdateObject, zoom]
  );

  const commitInlineEdit = useCallback(() => {
    if (!editingId) return;
    const obj = objectsById.get(editingId);
    if (obj) {
      if (obj.type === 'text' || obj.type === 'sticky') {
        if (editorRef.current) {
          if (obj.type === 'text' && obj.codeBlock) {
            const code = editorRef.current.innerText.replace(/\r\n?/g, '\n');
            onUpdateObject(editingId, {
              text: code,
              richBlocks: highlightCodeToRichBlocks(code, obj.codeLanguage || 'typescript'),
            }, false);
            onSyncPageState?.();
            setEditingId(null);
            createdEmptyEditRef.current = false;
            createdToolOnEditRef.current = null;
            if (!toolLocked) onSetActiveTool?.('select');
            return;
          }
          const blocks = htmlToRichBlocks(editorRef.current);
          const plain = richBlocksToPlainText(blocks);
          const hasTable = blocks.some((b) => b.type === 'table');
          if (obj.type === 'text' && createdEmptyEditRef.current && !plain.trim() && !hasTable) {
            onDeleteObjects([editingId]);
          } else {
            const bottomPad = obj.type === 'sticky' ? 32 : 8;
            const measuredH = Math.ceil(editorRef.current.scrollHeight / zoom) + bottomPad;
            const nextHeight = Math.max(obj.height, obj.type === 'sticky' ? Math.max(170, measuredH) : Math.max(48, measuredH));
            onUpdateObject(editingId, { text: plain, richBlocks: blocks, height: nextHeight }, true);
          }
        }
      } else if (obj.type === 'math') {
        onUpdateObject(editingId, { latex: editingText }, true);
      } else if (obj.type === 'shape') {
        onUpdateObject(editingId, { text: editingText }, true);
      }
    }
    if (!toolLocked && (createdToolOnEditRef.current === 'text' || createdToolOnEditRef.current === 'sticky' || createdToolOnEditRef.current === 'code')) {
      onSetActiveTool?.('select');
    }
    createdEmptyEditRef.current = false;
    createdToolOnEditRef.current = null;
    setEditingId(null);
  }, [editingId, editingText, objectsById, onDeleteObjects, onSetActiveTool, onSyncPageState, onUpdateObject, toolLocked, zoom]);

  // Populate rich contentEditable HTML once when entering edit mode (never fight user typing)
  useEffect(() => {
    if (!editingId) return;
    const obj = objectsById.get(editingId);
    if (!obj || (obj.type !== 'text' && obj.type !== 'sticky')) return;
    const timer = requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      if (obj.type === 'text' && obj.codeBlock) el.innerText = obj.text || '';
      else el.innerHTML = richBlocksToHtml(getEffectiveRichBlocks(obj), obj.textAlign || 'left');
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    return () => cancelAnimationFrame(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    if (syncRichEditorFnRef) {
      syncRichEditorFnRef.current = syncFromRichEditor;
    }
  }, [syncFromRichEditor, syncRichEditorFnRef]);

  useEffect(() => {
    onEditingObjectIdChange?.(editingId);
  }, [editingId, onEditingObjectIdChange]);

  // Outside click commit listener — clicking inside editor or right properties panel keeps editing alive
  useEffect(() => {
    if (!editingId) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (
        t.closest('[data-inline-rich-editor="true"]') ||
        t.closest('[data-properties-panel="true"]')
      ) {
        return;
      }
      commitInlineEdit();
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [commitInlineEdit, editingId]);

  const editingObj = editingId ? objectsById.get(editingId) : null;

  // Compute KaTeX, Media, and 3D Graph DOM overlays
  const overlayObjects = visibleObjects.filter(
    (o) => o.type === 'math' || o.type === 'media' || (o.type === 'graph' && o.mode === '3d')
  );

  // Mini-map bounding calculation
  const minimapBounds = useMemo(() => {
    if (visibleObjects.length === 0) return { minX: -200, minY: -200, maxX: 1400, maxY: 900 };
    return {
      minX: Math.min(-100, ...visibleObjects.map((o) => o.x)) - 120,
      minY: Math.min(-100, ...visibleObjects.map((o) => o.y)) - 120,
      maxX: Math.max(1200, ...visibleObjects.map((o) => o.x + o.width)) + 120,
      maxY: Math.max(800, ...visibleObjects.map((o) => o.y + o.height)) + 120,
    };
  }, [visibleObjects]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Interactive whiteboard canvas"
      tabIndex={0}
      className="relative w-full h-full overflow-hidden bg-slate-100 dark:bg-slate-950 outline-none"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.length && canEdit && !canvasLocked) {
          const rect = containerRef.current!.getBoundingClientRect();
          const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
          onDropFiles(e.dataTransfer.files, x, y);
        }
      }}
    >
      {/* Screen reader live region */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      >
        {ariaAnnouncement}
      </div>

      <canvas
        ref={canvasRef}
        className={`smartboard-canvas-surface block w-full h-full ${
          spacePressed || activeTool === 'hand'
            ? 'cursor-grab active:cursor-grabbing'
            : activeTool === 'select'
              ? 'cursor-default'
              : 'cursor-crosshair'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={(e) => {
          e.preventDefault();
          const rect = canvasRef.current!.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const { x: wx, y: wy } = screenToWorld(sx, sy);
          const hit = findHitObject(wx, wy);
          if (hit && !selectedIds.has(hit.id)) {
            onSelectIds(new Set([hit.id]));
          }
          setContextMenu({ sx, sy, wx, wy, objId: hit?.id });
        }}
      />

      {canEdit && !canvasLocked && page.objects.length === 0 && activeTool === 'select' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-4 pointer-events-none">
          <section
            aria-label="Quick start"
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/70 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-[0_24px_80px_rgba(15,23,42,0.18)] p-3"
          >
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Start a board">
              <button
                type="button"
                onClick={() => onSetActiveTool?.('pen')}
                className="min-h-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 hover:border-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Draw
              </button>
              <button
                type="button"
                onClick={() => onSetActiveTool?.('text')}
                className="min-h-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 hover:border-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <Type className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Add text
              </button>
              <button
                type="button"
                onClick={onOpenTemplates}
                className="min-h-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 hover:border-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 transition-colors flex flex-col items-center justify-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                Templates
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Rotated DOM Layer Matching Canvas Viewport Rotation */}
      <div
        style={{
          transform: rotationDeg ? `rotate(${rotationDeg}deg)` : undefined,
          transformOrigin: '50% 50%',
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* KaTeX Math, 3D Graph & Media Interactive Overlays */}
        {overlayObjects.map((obj) => {
          const left = obj.x * zoom + panX;
          const top = obj.y * zoom + panY;
          const width = obj.width * zoom;
          const height = obj.height * zoom;
          if (left + width < -100 || top + height < -100 || left > size.width + 100 || top > size.height + 100) {
            return null;
          }
          if (obj.type === 'math') {
            let html = '';
            try {
              html = katex.renderToString(obj.latex || 'x^2', { throwOnError: false, displayMode: true });
            } catch {
              html = (obj.latex || '').replace(/[&<>"']/g, (char) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
              })[char] || char);
            }
            return (
              <div
                key={obj.id}
                onDoubleClick={() => {
                  if (canEdit && !canvasLocked) {
                    createdEmptyEditRef.current = false;
                    setEditingId(obj.id);
                    setEditingText(obj.latex);
                  }
                }}
                style={{
                  left,
                  top,
                  width,
                  height,
                  color: obj.color,
                  backgroundColor: obj.bgColor || '#FFFFFF',
                  opacity: obj.opacity ?? 1,
                  fontSize: `${Math.max(10, (obj.fontSize || 18) * zoom)}px`,
                  transform: `rotate(${obj.rotation || 0}deg)`,
                }}
                className="absolute pointer-events-auto flex items-center justify-center rounded-lg border border-slate-300/80 shadow-sm px-2 overflow-hidden select-none cursor-pointer"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          }
          if (obj.type === 'graph' && obj.mode === '3d') {
            return (
              <Graph3DOverlay
                key={obj.id}
                obj={obj}
                left={left}
                top={top}
                width={width}
                height={height}
                angles={graph3dAngles[obj.id] || { yaw: 0.65, pitch: 0.45 }}
                onRotate={(yaw, pitch) => setGraph3dAngles((prev) => ({ ...prev, [obj.id]: { yaw, pitch } }))}
              />
            );
          }
          if (obj.type === 'media') {
            return (
              <div
                key={obj.id}
                style={{
                  left,
                  top,
                  width,
                  height,
                  opacity: obj.opacity ?? 1,
                  transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
                }}
                className="absolute pointer-events-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 flex flex-col justify-between shadow-sm overflow-hidden"
              >
                <div className="text-xs font-medium truncate text-slate-700 dark:text-slate-200">{obj.fileName}</div>
                {obj.mediaKind === 'audio' && (
                  <audio
                    controls
                    src={resourceUrl(obj.src)}
                    ref={(node) => { if (node) node.playbackRate = obj.playbackRate || 1; }}
                    className="w-full h-9"
                  />
                )}
                {obj.mediaKind === 'video' && (
                  <video
                    controls
                    src={resourceUrl(obj.src)}
                    ref={(node) => { if (node) node.playbackRate = obj.playbackRate || 1; }}
                    className="w-full flex-1 min-h-0 rounded bg-black object-contain"
                  />
                )}
                {obj.mediaKind === 'embed' && (
                  <iframe
                    src={obj.embedUrl || resourceUrl(obj.src)}
                    title={obj.fileName || 'Embedded Media'}
                    sandbox="allow-scripts allow-forms allow-presentation"
                    referrerPolicy="no-referrer"
                    className="w-full flex-1 min-h-0 rounded border border-slate-200 dark:border-slate-700 bg-white"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                )}
                {obj.mediaKind === 'file' && (
                  <a
                    href={resourceUrl(obj.src)}
                    download={obj.fileName}
                    className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Download File ({Math.round(obj.fileSize / 1024)} KB)
                  </a>
                )}
              </div>
            );
          }
          return null;
        })}

        {/* Inline Rich Text / Sticky / Math / Shape Editor */}
        {editingObj && (editingObj.type === 'text' || editingObj.type === 'sticky') && (() => {
          const edW = Math.min(Math.max(190, editingObj.width * zoom), Math.max(190, size.width - 16));
          const edLeft = Math.max(8, Math.min(Math.max(8, size.width - edW - 8), editingObj.x * zoom + panX));
          const edTop = Math.max(8, Math.min(Math.max(8, size.height - 96), editingObj.y * zoom + panY));
          return (
          <div
            data-inline-rich-editor="true"
            style={{
              left: edLeft,
              top: edTop,
              width: edW,
              minHeight: Math.max(editingObj.type === 'sticky' ? 170 : 56, editingObj.height * zoom),
              backgroundColor:
                editingObj.type === 'sticky'
                  ? editingObj.noteStyle === 'card'
                    ? '#FFFFFF'
                    : editingObj.noteColor || '#FEF08A'
                  : editingObj.bgColor && editingObj.bgColor !== 'transparent'
                    ? editingObj.bgColor
                    : 'rgba(255, 255, 255, 0.96)',
              borderRadius: `${(editingObj.type === 'text' ? editingObj.borderRadius ?? 8 : 10) * zoom}px`,
              transform: editingObj.rotation ? `rotate(${editingObj.rotation}deg)` : undefined,
              transformOrigin: 'center center',
            }}
            className="absolute z-30 pointer-events-auto border-2 border-indigo-600 shadow-2xl flex flex-col overflow-hidden"
          >
            {editingObj.type === 'sticky' && editingObj.noteStyle === 'card' && (
              <div
                style={{ backgroundColor: editingObj.noteColor || '#FEF08A', height: `${Math.max(6, 8 * zoom)}px` }}
                className="w-full shrink-0"
              />
            )}
            {editingObj.type === 'text' && editingObj.codeBlock && (
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] font-mono text-slate-300">
                <span className="flex gap-1"><i className="h-2 w-2 rounded-full bg-rose-400" /><i className="h-2 w-2 rounded-full bg-amber-400" /><i className="h-2 w-2 rounded-full bg-emerald-400" /></span>
                <span className="ml-auto uppercase tracking-wide">{editingObj.codeLanguage || 'typescript'}</span>
              </div>
            )}
            <div
              ref={editorRef}
              contentEditable={editingObj.type === 'text' && editingObj.codeBlock ? 'plaintext-only' : true}
              suppressContentEditableWarning
              onInput={() => syncFromRichEditor(false)}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target?.dataset.checkBox === 'true') {
                  e.preventDefault();
                  e.stopPropagation();
                  const row = target.closest('[data-block="check"]') as HTMLElement | null;
                  if (row) {
                    const nextChecked = row.dataset.checked !== '1';
                    row.dataset.checked = nextChecked ? '1' : '0';
                    target.style.background = nextChecked ? '#2563EB' : 'transparent';
                    target.style.color = nextChecked ? '#FFFFFF' : 'inherit';
                    target.textContent = nextChecked ? '✓' : '';
                    const textHost = row.querySelector('[data-check-text="true"]') as HTMLElement | null;
                    if (textHost) {
                      textHost.style.textDecoration = nextChecked ? 'line-through' : '';
                      textHost.style.opacity = nextChecked ? '0.65' : '1';
                    }
                    syncFromRichEditor(true);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                  e.preventDefault();
                  commitInlineEdit();
                  return;
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const delta = e.shiftKey ? -1 : 1;
                  const sel = window.getSelection();
                  const blk = (sel?.anchorNode as HTMLElement | null)?.parentElement?.closest?.('[data-block]') as HTMLElement | null;
                  if (blk) {
                    const cur = Number(blk.dataset.indent || 0);
                    const next = Math.max(0, Math.min(5, cur + delta));
                    blk.dataset.indent = String(next);
                    blk.style.paddingLeft = `${next * 20}px`;
                    syncFromRichEditor(false);
                  }
                  return;
                }
                if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
                  e.preventDefault();
                  const k = e.key.toLowerCase();
                  document.execCommand(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline', false);
                  syncFromRichEditor(false);
                }
              }}
              style={{
                padding: `${Math.round((editingObj.type === 'text' ? editingObj.padding ?? 10 : 12) * zoom)}px`,
                color: editingObj.textColor || '#0F172A',
                fontFamily: editingObj.codeBlock ? '"JetBrains Mono", ui-monospace, monospace' : `"${editingObj.fontFamily || (editingObj.type === 'sticky' ? 'DM Sans' : 'Plus Jakarta Sans')}", system-ui, sans-serif`,
                fontSize: `${Math.max(11, (editingObj.fontSize || 16) * zoom)}px`,
                fontWeight: editingObj.fontWeight || 'normal',
                fontStyle: editingObj.fontStyle || 'normal',
                textDecoration: editingObj.underline ? 'underline' : editingObj.strikethrough ? 'line-through' : undefined,
                textAlign: editingObj.codeBlock ? 'left' : editingObj.textAlign || 'left',
                lineHeight: editingObj.lineHeight || 1.38,
              }}
              className={`flex-1 w-full min-h-[36px] focus:outline-none break-words cursor-text ${editingObj.type === 'text' && editingObj.codeBlock ? 'whitespace-pre overflow-auto text-slate-100 selection:bg-blue-500/40' : ''}`}
            />
            <div className="px-2.5 py-1 text-[10px] font-medium text-slate-700/80 dark:text-slate-200 flex items-center justify-between gap-2 border-t border-black/10 bg-white/75 dark:bg-slate-900/75">
              <span className="truncate">
                {editingObj.type === 'sticky' ? editingObj.author || 'Sticky Note' : editingObj.type === 'text' && editingObj.codeBlock ? 'Code Block' : 'Rich Text'}
                <span className="hidden sm:inline text-slate-400 ml-1.5">· Ctrl+Enter</span>
              </span>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  commitInlineEdit();
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 shrink-0"
              >
                <Check className="w-3 h-3" /> Done
              </button>
            </div>
          </div>
          );
        })()}

        {editingObj && (editingObj.type === 'math' || editingObj.type === 'shape') && (() => {
          const edW = Math.min(Math.max(170, editingObj.width * zoom), Math.max(170, size.width - 16));
          const edLeft = Math.max(8, Math.min(Math.max(8, size.width - edW - 8), editingObj.x * zoom + panX));
          const edTop = Math.max(8, Math.min(Math.max(8, size.height - 96), editingObj.y * zoom + panY));
          return (
          <div
            data-inline-rich-editor="true"
            style={{
              left: edLeft,
              top: edTop,
              width: edW,
              minHeight: Math.max(76, editingObj.height * zoom),
              transform: editingObj.rotation ? `rotate(${editingObj.rotation}deg)` : undefined,
              transformOrigin: 'center center',
            }}
            className="absolute z-30 pointer-events-auto flex flex-col bg-white dark:bg-slate-900 border-2 border-blue-600 rounded-lg shadow-xl overflow-hidden"
          >
            <textarea
              autoFocus
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                  e.preventDefault();
                  commitInlineEdit();
                }
              }}
              style={{
                fontFamily: 'fontFamily' in editingObj ? editingObj.fontFamily : 'DM Sans',
                fontSize: `${Math.max(12, ('fontSize' in editingObj ? editingObj.fontSize : 15) * zoom)}px`,
                fontWeight: 'fontWeight' in editingObj ? editingObj.fontWeight : 'normal',
                fontStyle: 'fontStyle' in editingObj ? editingObj.fontStyle : 'normal',
                textAlign: editingObj.type === 'shape' ? editingObj.textAlign || 'center' : 'left',
              }}
              placeholder={editingObj.type === 'math' ? 'Enter LaTeX (e.g. \\frac{a}{b})' : 'Type shape label...'}
              className="flex-1 w-full min-h-[52px] p-2.5 bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none resize-none"
            />
            <div className="px-2.5 py-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <span className="truncate">
                {editingObj.type === 'math' ? 'LaTeX Formula' : editingObj.shapeKind.replace(/_/g, ' ')}
                <span className="hidden sm:inline ml-1.5">· Ctrl+Enter</span>
              </span>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  commitInlineEdit();
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 shrink-0"
              >
                <Check className="w-3 h-3" /> Done
              </button>
            </div>
          </div>
          );
        })()}

        {/* Inline Table Cell Editor Overlay */}
        {editingTableCell && (() => {
          const tb = objectsById.get(editingTableCell.id);
          if (!tb || tb.type !== 'table') return null;
          const colWs =
            tb.colWidths && tb.colWidths.length === tb.cols ? tb.colWidths : Array(tb.cols).fill(tb.width / tb.cols);
          const sumC = colWs.reduce((a, b) => a + b, 0) || tb.width;
          const rowHs =
            tb.rowHeights && tb.rowHeights.length === tb.rows ? tb.rowHeights : Array(tb.rows).fill(tb.height / tb.rows);
          const sumR = rowHs.reduce((a, b) => a + b, 0) || tb.height;
          let cellX = tb.x;
          for (let c = 0; c < editingTableCell.c; c++) cellX += (colWs[c] / sumC) * tb.width;
          const cellW = ((colWs[editingTableCell.c] ?? tb.width / tb.cols) / sumC) * tb.width;
          let cellY = tb.y;
          for (let r = 0; r < editingTableCell.r; r++) cellY += (rowHs[r] / sumR) * tb.height;
          const cellH = ((rowHs[editingTableCell.r] ?? tb.height / tb.rows) / sumR) * tb.height;

          const commitCell = (nextVal: string, advance?: 'next' | 'prev' | 'down' | null) => {
            const nextCells = tb.cells.map((row, ri) =>
              ri === editingTableCell.r ? row.map((cell, ci) => (ci === editingTableCell.c ? nextVal : cell)) : row
            );
            onUpdateObject(tb.id, { cells: nextCells }, true);
            if (!advance) {
              setEditingTableCell(null);
              return;
            }
            let nr = editingTableCell.r;
            let nc = editingTableCell.c;
            if (advance === 'next') {
              nc += 1;
              if (nc >= tb.cols) {
                nc = 0;
                nr += 1;
              }
            } else if (advance === 'prev') {
              nc -= 1;
              if (nc < 0) {
                nc = tb.cols - 1;
                nr -= 1;
              }
            } else if (advance === 'down') {
              nr += 1;
            }
            if (nr >= 0 && nr < tb.rows && nc >= 0 && nc < tb.cols) {
              setEditingTableCell({
                id: tb.id,
                r: nr,
                c: nc,
                value: nextCells[nr]?.[nc] ?? '',
              });
            } else {
              setEditingTableCell(null);
            }
          };

          const pxW = Math.max(48, cellW * zoom);
          const pxH = Math.max(28, cellH * zoom);
          const cellWorldCenter = tb.rotation
            ? fromObjectLocalPoint(tb, cellX + cellW / 2, cellY + cellH / 2, false)
            : { x: cellX + cellW / 2, y: cellY + cellH / 2 };

          return (
            <input
              key={`${tb.id}-${editingTableCell.r}-${editingTableCell.c}`}
              autoFocus
              value={editingTableCell.value}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setEditingTableCell((prev) => (prev ? { ...prev, value: e.target.value } : null))}
              onBlur={() => commitCell(editingTableCell.value, null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingTableCell(null);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  commitCell(editingTableCell.value, 'down');
                } else if (e.key === 'Tab') {
                  e.preventDefault();
                  commitCell(editingTableCell.value, e.shiftKey ? 'prev' : 'next');
                }
              }}
              style={{
                left: cellWorldCenter.x * zoom + panX - pxW / 2,
                top: cellWorldCenter.y * zoom + panY - pxH / 2,
                width: pxW,
                height: pxH,
                fontSize: `${Math.max(11, Math.round(13 * zoom))}px`,
                transform: tb.rotation ? `rotate(${tb.rotation}deg)` : undefined,
                transformOrigin: 'center center',
              }}
              className="absolute z-30 pointer-events-auto px-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-2 border-blue-600 rounded shadow-lg focus:outline-none font-medium"
            />
          );
        })()}

        {/* Interactive Geometry Instruments (Ruler, Protractor, Compass, Set Square) */}
        {instruments
          .filter((inst) => inst.visible)
          .map((inst) => {
            // Compute measured angle for protractor instruments
            const measuredAngle = inst.kind === 'protractor'
              ? computeProtractorAngle(page.objects, inst.x + 130 / zoom, inst.y + 130 / zoom)
              : null;
            return (
            <GeometryInstrumentOverlay
              key={inst.id}
              inst={inst}
              zoom={zoom}
              panX={panX}
              panY={panY}
              onChange={onUpdateInstrument}
              measuredAngle={measuredAngle}
              onStampRay={(ox, oy, deg) => {
                const rad = (deg * Math.PI) / 180;
                const x2 = Math.round(ox + 220 * Math.cos(rad));
                const y2 = Math.round(oy + 220 * Math.sin(rad));
                onCreateObject({
                  id: uid('line'),
                  name: `Angle Ray (${deg}°)`,
                  type: 'line',
                  x: Math.min(ox, x2),
                  y: Math.min(oy, y2),
                  width: Math.max(4, Math.abs(x2 - ox)),
                  height: Math.max(4, Math.abs(y2 - oy)),
                  rotation: 0,
                  opacity: 1,
                  locked: false,
                  hidden: false,
                  zIndex: page.objects.length + 1,
                  points: [
                    { x: ox, y: oy },
                    { x: x2, y: y2 },
                  ],
                  stroke: strokeColor,
                  strokeWidth,
                  lineStyle: 'solid',
                  startHead: 'dot',
                  endHead: 'arrow',
                });
              }}
              onStampCircle={(cx, cy, r) => {
                onCreateObject({
                  id: uid('shape'),
                  name: 'Compass Circle',
                  type: 'shape',
                  shapeKind: 'circle',
                  x: Math.round(cx - r),
                  y: Math.round(cy - r),
                  width: Math.round(r * 2),
                  height: Math.round(r * 2),
                  rotation: 0,
                  opacity: 1,
                  locked: false,
                  hidden: false,
                  zIndex: page.objects.length + 1,
                  fill: 'transparent',
                  stroke: strokeColor,
                  strokeWidth,
                  text: '',
                  textColor: '#0F172A',
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: 14,
                  fontWeight: 'normal',
                  fontStyle: 'normal',
                  textAlign: 'center',
                });
              }}
            />
          );})}

        {/* Remote Live Cursors */}
        {remoteCursors
          .filter((u) => u.pageId === page.id)
          .map((u) => {
            const sx = u.cursorX * zoom + panX;
            const sy = u.cursorY * zoom + panY;
            if (sx < -40 || sy < -40 || sx > size.width + 40 || sy > size.height + 40) return null;
            return (
              <div key={u.userId} style={{ left: sx, top: sy }} className="absolute z-30 pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M2 2L15 7L9 10L6 16L2 2Z" fill={u.color} stroke="#FFFFFF" strokeWidth="1.5" />
                </svg>
                <span
                  style={{ backgroundColor: u.color }}
                  className="ml-3 -mt-1 inline-block px-1.5 py-0.5 text-[11px] font-medium text-white rounded shadow-sm whitespace-nowrap"
                >
                  {u.userName} ({u.role})
                </span>
              </div>
            );
          })}

        {/* Floating Collaborator Reactions */}
        {reactions.map((r) => (
          <div
            key={r.id}
            style={{ left: r.x * zoom + panX, top: r.y * zoom + panY }}
            className="absolute z-30 pointer-events-none flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg shadow-md text-sm animate-bounce"
          >
            <span>{r.emoji}</span>
            <span className="text-[11px] text-slate-600 dark:text-slate-300">{r.userName}</span>
          </div>
        ))}
      </div>

      {/* Rulers & Clickable Guide Spawners */}
      {showRulers && (
        <>
          <div
            title="Click horizontal ruler to place a vertical guide"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const { x } = screenToWorld(e.clientX - rect.left, 0);
              onAddGuide('x', Math.round(x));
            }}
            className="absolute top-0 left-6 right-0 h-6 bg-white/90 dark:bg-slate-900/90 border-b border-slate-300 dark:border-slate-700 cursor-col-resize z-20 flex items-end overflow-hidden select-none"
          >
            {Array.from({ length: 26 }, (_, i) => {
              const wx = Math.round((-panX / zoom) / 100) * 100 + i * 100;
              const sx = wx * zoom + panX - 24;
              if (sx < 0 || sx > size.width) return null;
              return (
                <div key={i} style={{ left: sx }} className="absolute bottom-0 flex flex-col items-start">
                  <span className="text-[9px] font-mono text-slate-500 pl-1">{wx}</span>
                  <div className="w-px h-2 bg-slate-400" />
                </div>
              );
            })}
          </div>
          <div
            title="Click vertical ruler to place a horizontal guide"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const { y } = screenToWorld(0, e.clientY - rect.top);
              onAddGuide('y', Math.round(y));
            }}
            className="absolute top-6 left-0 bottom-0 w-6 bg-white/90 dark:bg-slate-900/90 border-r border-slate-300 dark:border-slate-700 cursor-row-resize z-20 overflow-hidden select-none"
          >
            {Array.from({ length: 20 }, (_, i) => {
              const wy = Math.round((-panY / zoom) / 100) * 100 + i * 100;
              const sy = wy * zoom + panY - 24;
              if (sy < 0 || sy > size.height) return null;
              return (
                <div key={i} style={{ top: sy }} className="absolute right-0 flex items-center">
                  <span className="text-[9px] font-mono text-slate-500 -rotate-90 origin-center">{wy}</span>
                  <div className="h-px w-2 bg-slate-400" />
                </div>
              );
            })}
          </div>
          {(page.guides || []).length > 0 && (
            <button
              onClick={() => page.guides.forEach((g) => onRemoveGuide(g.id))}
              className="absolute top-7 left-7 z-20 px-2 py-0.5 text-[11px] bg-white/90 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 hover:text-red-600"
            >
              Clear Guides ({page.guides.length})
            </button>
          )}
        </>
      )}

      {/* Multi-Select HUD Badge + Done Pill */}
      {multiSelectMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow-lg text-xs font-semibold">
          <span>Multi-Select Active · {selectedIds.size} selected</span>
          {onExitMultiSelect && (
            <button
              onClick={onExitMultiSelect}
              className="px-2 py-0.5 bg-white text-blue-700 rounded-md font-bold hover:bg-blue-50"
            >
              Done
            </button>
          )}
        </div>
      )}

      {/* Tablet/Touch Polyline Finish Controls */}
      {interactionRef.current.mode === 'draw_polyline' && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 text-white shadow-xl text-xs font-medium">
          <span>Polyline ({interactionRef.current.polylinePts.length} pts)</span>
          <button
            onClick={() => {
              interactionRef.current.polylinePts.pop();
              setRenderTick((t) => t + 1);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
          >
            <Undo2 className="w-3 h-3" /> Undo Point
          </button>
          <button
            onClick={finishPolyline}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 font-semibold"
          >
            <Check className="w-3 h-3" /> Finish
          </button>
        </div>
      )}

      {/* Non-intrusive Ink-to-Shape Live Suggestion Chip */}
      {inkSuggestion && (
        <div
          style={{
            left: Math.min(size.width - 180, Math.max(16, inkSuggestion.x * zoom + panX)),
            top: Math.min(size.height - 60, Math.max(16, inkSuggestion.y * zoom + panY + 12)),
          }}
          className="absolute z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 shadow-lg text-xs"
        >
          <button
            onClick={() => {
              if (onReplacePageObjects) {
                onReplacePageObjects(
                  page.objects.map((o) => (o.id === inkSuggestion.strokeId ? inkSuggestion.suggested : o)),
                  true
                );
              }
              setInkSuggestion(null);
            }}
            className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5" /> Convert to Shape
          </button>
          <button onClick={() => setInkSuggestion(null)} className="text-slate-400 hover:text-slate-600 px-1">
            ×
          </button>
        </div>
      )}

      {/* Futuristic Floating Selection Context Bar */}
      {!hideSelectionOverlayBar && selectedIds.size > 0 && !editingId && canEdit && interactionRef.current.mode === 'none' && (() => {
        const selObjs = visibleObjects.filter((o) => selectedIds.has(o.id));
        if (selObjs.length === 0) return null;
        const bounds = computeSelectionBounds(selObjs, objectsById);
        const centerSX = (bounds.x + bounds.width / 2) * zoom + panX;
        const topSY = bounds.y * zoom + panY;
        const bottomSY = (bounds.y + bounds.height) * zoom + panY;
        const placeBelow = topSY < 76;
        const halfMax = Math.min(200, Math.max(40, size.width / 2 - 12));
        const barLeft =
          size.width < 420
            ? size.width / 2
            : Math.max(halfMax + 8, Math.min(size.width - halfMax - 8, centerSX));
        const minBarTop = multiSelectMode ? 52 : showRulers ? 32 : 12;
        const barTop = placeBelow
          ? Math.max(minBarTop, Math.min(size.height - 64, bottomSY + 16))
          : Math.max(minBarTop, Math.min(size.height - 64, topSY - 54));
        const allLocked = selObjs.every((o) => o.locked);
        const hasStrokes = selObjs.some((o) => o.type === 'stroke');
        const hasMath = selObjs.some((o) => o.type === 'math');
        const hasText = selObjs.some((o) => o.type === 'text' || o.type === 'sticky' || o.type === 'shape');
        const singleObj = selObjs.length === 1 ? selObjs[0] : null;
        const isFrame = singleObj?.type === 'shape' && singleObj.shapeKind === 'frame';
        const isImage = singleObj?.type === 'image';
        const palette = colorblindPalette ? COLORBLIND_BAR_COLORS : STANDARD_BAR_COLORS;

        return (
          <div
            data-selection-context-bar="true"
            style={{ left: barLeft, top: barTop, transform: 'translateX(-50%)' }}
            className="absolute z-30 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-lg max-w-[calc(100%-16px)] overflow-x-auto scrollbar-none"
          >
            {palette.map((c) => (
              <button
                key={c}
                onClick={() => onChangeStrokeColor?.(c)}
                style={{ backgroundColor: c }}
                className="w-5 h-5 sm:w-4 sm:h-4 rounded-full border border-white dark:border-slate-800 shadow-sm hover:scale-110 transition-transform shrink-0"
                title={`Color ${c}`}
              />
            ))}
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />
            {onDuplicateSelected && (
              <button
                onClick={onDuplicateSelected}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                title="Duplicate (Ctrl+D)"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            {onFormatPainterClick && (
              <button
                onClick={() => onFormatPainterClick(selObjs[0])}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                  formatPainterActive
                    ? 'bg-amber-500 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={formatPainterActive ? 'Cancel Format Painter (Esc)' : 'Copy this style, then click another object'}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                {formatPainterActive ? 'Cancel Painter' : 'Format Painter'}
              </button>
            )}
            <button
              onClick={() => {
                const patches = selObjs.map((o) => ({ id: o.id, locked: !allLocked }));
                if (onBatchPatchObjects) onBatchPatchObjects(patches);
                else selObjs.forEach((o) => onUpdateObject(o.id, { locked: !allLocked }, true));
              }}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              title={allLocked ? 'Unlock' : 'Lock'}
            >
              {allLocked ? <Unlock className="w-3.5 h-3.5 text-amber-600" /> : <Lock className="w-3.5 h-3.5" />}
            </button>

            {isImage && (
              <>
                <button
                  onClick={() => setCroppingId((prev) => (prev === singleObj.id ? null : singleObj.id))}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 ${
                    croppingId === singleObj.id ? 'bg-emerald-600 text-white' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Toggle Inline Image Crop Handles (or double-click image)"
                >
                  <Crop className="w-3.5 h-3.5" /> {croppingId === singleObj.id ? 'Done Crop' : 'Crop'}
                </button>
                {(croppingId === singleObj.id || singleObj.crop) && (
                  <>
                    {(
                      [
                        { label: '1:1', ratio: 1 },
                        { label: '16:9', ratio: 16 / 9 },
                        { label: '4:3', ratio: 4 / 3 },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.label}
                        onClick={async () => {
                          const cached = getCachedImage(singleObj.src);
                          const dims =
                            cached && cached.naturalWidth > 0
                              ? { w: cached.naturalWidth, h: cached.naturalHeight }
                              : await loadImageNaturalSize(singleObj.src);
                          onUpdateObject(singleObj.id, computeAspectPresetCrop(singleObj, dims.w, dims.h, preset.ratio), true);
                        }}
                        className="px-1.5 py-1 rounded-md text-[10px] font-medium tabular-nums text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0"
                        title={`Crop to ${preset.label}`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    {singleObj.crop && (
                      <button
                        onClick={async () => {
                          const cached = getCachedImage(singleObj.src);
                          const dims =
                            cached && cached.naturalWidth > 0
                              ? { w: cached.naturalWidth, h: cached.naturalHeight }
                              : await loadImageNaturalSize(singleObj.src);
                          onUpdateObject(singleObj.id, computeAspectPresetCrop(singleObj, dims.w, dims.h, null), true);
                        }}
                        className="px-2 py-1 rounded-md text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 whitespace-nowrap shrink-0"
                        title="Reset Crop to Full Image"
                      >
                        Reset
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            {isFrame && onPresentFrame && (
              <button
                onClick={() => onPresentFrame(singleObj)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium whitespace-nowrap shrink-0"
              >
                <MonitorPlay className="w-3 h-3" /> Present Frame
              </button>
            )}
            {isFrame && onExportFrame && (
              <button
                onClick={() => onExportFrame(singleObj)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium whitespace-nowrap shrink-0"
              >
                Export Frame
              </button>
            )}

            {singleObj && (singleObj.type === 'shape' || singleObj.type === 'sticky') && (
              <button
                onClick={() => {
                  const childId = uid(singleObj.type === 'sticky' ? 'sticky' : 'shape');
                  const childX = singleObj.x + singleObj.width + 80;
                  const childY = singleObj.y;
                  const newNode: BoardObject =
                    singleObj.type === 'sticky'
                      ? { ...singleObj, id: childId, x: childX, y: childY, text: 'Branch Note', zIndex: page.objects.length + 1 }
                      : { ...singleObj, id: childId, x: childX, y: childY, text: 'Child Node', zIndex: page.objects.length + 1 };
                  const conn: ConnectorObject = {
                    id: uid('conn'),
                    name: 'Mindmap Link',
                    type: 'connector',
                    x: singleObj.x + singleObj.width,
                    y: singleObj.y + singleObj.height / 2,
                    width: 80,
                    height: 10,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: page.objects.length + 2,
                    fromId: singleObj.id,
                    toId: childId,
                    fromPort: 'right',
                    toPort: 'left',
                    x1: singleObj.x + singleObj.width,
                    y1: singleObj.y + singleObj.height / 2,
                    x2: childX,
                    y2: childY + singleObj.height / 2,
                    routeType: 'curved',
                    stroke: strokeColor,
                    strokeWidth: 2,
                    lineStyle: 'solid',
                    startHead: 'none',
                    endHead: 'arrow',
                  };
                  onCreateObject(newNode);
                  onCreateObject(conn);
                  onSelectIds(new Set([childId]));
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium whitespace-nowrap shrink-0"
                title="Add Connected Child Node"
              >
                <Plus className="w-3 h-3" /> Child
              </button>
            )}

            {onQuickAIAction && (
              <>
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />
                {hasStrokes && (
                  <button
                    onClick={() => onQuickAIAction('handwriting')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium whitespace-nowrap shrink-0"
                    title="Convert ink handwriting to crisp board text"
                  >
                    <Sparkles className="w-3 h-3" />
                    Ink to Text
                  </button>
                )}
                {hasStrokes && (
                  <button
                    onClick={() => onQuickAIAction('sketch_shape')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-[11px] font-medium whitespace-nowrap shrink-0"
                    title="Convert rough sketch to clean shapes"
                  >
                    Clean Sketch
                  </button>
                )}
                {hasMath && (
                  <button
                    onClick={() => onQuickAIAction('math_solve')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3 h-3" />
                    Solve
                  </button>
                )}
                {!hasStrokes && !hasMath && hasText && (
                  <button
                    onClick={() => onQuickAIAction('read_aloud')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium whitespace-nowrap shrink-0"
                    title="AI Read Aloud"
                  >
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    Read Aloud
                  </button>
                )}
              </>
            )}
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />
            <button
              onClick={() => onDeleteObjects(selObjs.map((o) => o.id))}
              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0"
              title="Delete Selected (Del)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      {/* Right-Click Canvas Context Menu */}
      {contextMenu && (
        <div
          style={{
            left: Math.max(8, Math.min(Math.max(8, size.width - 200), contextMenu.sx)),
            top: Math.max(8, Math.min(Math.max(8, size.height - 252), contextMenu.sy)),
          }}
          className="absolute z-40 w-48 max-w-[calc(100%-16px)] max-h-[calc(100%-16px)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 text-xs"
          onClick={() => setContextMenu(null)}
        >
          {contextMenu.objId ? (
            <>
              {onDuplicateSelected && (
                <button
                  onClick={onDuplicateSelected}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Duplicate</span>
                  <span className="text-[10px] text-slate-400">Ctrl+D</span>
                </button>
              )}
              {onCopyStyle && contextMenu.objId && objectsById.get(contextMenu.objId) && (
                <button
                  onClick={() => onCopyStyle(objectsById.get(contextMenu.objId!)!)}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Copy Style
                </button>
              )}
              {hasCopiedStyle && onPasteStyle && (
                <button
                  onClick={onPasteStyle}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Paste Style
                </button>
              )}
              {onReorderZ && (
                <>
                  <button
                    onClick={() => onReorderZ(contextMenu.objId!, 'front')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Bring to Front
                  </button>
                  <button
                    onClick={() => onReorderZ(contextMenu.objId!, 'back')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Send to Back
                  </button>
                </>
              )}
              {onToggleGroup && selectedIds.size > 1 && (
                <button
                  onClick={onToggleGroup}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Group / Ungroup
                </button>
              )}
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              <button
                onClick={() => onDeleteObjects(Array.from(selectedIds.size > 0 ? selectedIds : [contextMenu.objId!]))}
                className="w-full text-left px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() =>
                  onCreateObject({
                    id: uid('sticky'),
                    name: 'Sticky Note',
                    type: 'sticky',
                    x: Math.round(contextMenu.wx),
                    y: Math.round(contextMenu.wy),
                    width: 220,
                    height: 170,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: page.objects.length + 1,
                    text: 'New Note',
                    noteColor: '#FEF08A',
                    textColor: '#1E293B',
                    author: userName,
                    fontFamily: 'DM Sans',
                    fontSize: 15,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    underline: false,
                    textAlign: 'left',
                    noteStyle: 'folded',
                    reactions: {},
                  })
                }
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Add Sticky Note Here
              </button>
              {canUndo && onUndo && (
                <button onClick={onUndo} className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                  Undo
                </button>
              )}
              {canRedo && onRedo && (
                <button onClick={onRedo} className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                  Redo
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Fit All Button */}
      {visibleObjects.length > 0 && (
        <button
          onClick={fitAll}
          title="Fit All Objects (Ctrl+Shift+1)"
          className="absolute bottom-3 right-48 z-20 px-2.5 py-1.5 text-[11px] font-medium bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Fit All
        </button>
      )}

      {/* Mini-Map Navigation */}
      {showMinimap && (
        <MiniMapWidget
          objects={visibleObjects}
          bounds={minimapBounds}
          panX={panX}
          panY={panY}
          zoom={zoom}
          viewportW={size.width}
          viewportH={size.height}
          onNavigate={onPanChange}
        />
      )}
    </div>
  );
};

// Interactive 3D Function Surface Overlay honoring xMin/xMax/yMin/yMax, rotation, opacity & 3D axes
const Graph3DOverlay: React.FC<{
  obj: GraphObject;
  left: number;
  top: number;
  width: number;
  height: number;
  angles: { yaw: number; pitch: number };
  onRotate: (yaw: number, pitch: number) => void;
}> = ({ obj, left, top, width, height, angles, onRotate }) => {
  const cRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    const canvas = cRef.current;
    if (!canvas) return;
    canvas.width = Math.max(120, Math.round(width));
    canvas.height = Math.max(100, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const expr = obj.expressions.find((e) => e.visible)?.expr || obj.expressions[0]?.expr || 'sin(sqrt(x^2 + y^2))';
    let compiled: EvalFunction | null = null;
    try {
      compiled = compile(expr);
    } catch {
      compiled = null;
    }

    const n = 18;
    const sXMin = Number.isFinite(obj.xMin) ? obj.xMin : -5;
    const sXMax = Number.isFinite(obj.xMax) && obj.xMax > sXMin ? obj.xMax : sXMin + 0.5;
    const sYMin = Number.isFinite(obj.yMin) ? obj.yMin : -5;
    const sYMax = Number.isFinite(obj.yMax) && obj.yMax > sYMin ? obj.yMax : sYMin + 0.5;
    const xSpan = Math.max(1e-4, sXMax - sXMin);
    const ySpan = Math.max(1e-4, sYMax - sYMin);
    const xMid = (sXMin + sXMax) / 2;
    const yMid = (sYMin + sYMax) / 2;
    const normFactor = 8 / Math.max(xSpan, ySpan);
    const scale = Math.min(canvas.width, canvas.height) * 0.085;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 + 10;
    const cosY = Math.cos(angles.yaw);
    const sinY = Math.sin(angles.yaw);
    const cosP = Math.cos(angles.pitch);
    const sinP = Math.sin(angles.pitch);

    const project = (nx: number, ny: number, nz: number) => {
      const rx = nx * cosY - ny * sinY;
      const ry = nx * sinY + ny * cosY;
      const rz = ry * sinP + nz * cosP;
      const depth = ry * cosP - nz * sinP;
      return { sx: cx + rx * scale, sy: cy - rz * scale, depth };
    };

    // Draw 3D coordinate axes
    const orig = project(0, 0, 0);
    const axX = project(4.4, 0, 0);
    const axY = project(0, 4.4, 0);
    const axZ = project(0, 0, 3.8);
    ctx.lineWidth = 1.2;
    [
      { pt: axX, col: '#EF4444', lbl: 'X' },
      { pt: axY, col: '#10B981', lbl: 'Y' },
      { pt: axZ, col: '#2563EB', lbl: 'Z' },
    ].forEach((ax) => {
      ctx.strokeStyle = ax.col;
      ctx.beginPath();
      ctx.moveTo(orig.sx, orig.sy);
      ctx.lineTo(ax.pt.sx, ax.pt.sy);
      ctx.stroke();
      ctx.fillStyle = ax.col;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(ax.lbl, ax.pt.sx + 3, ax.pt.sy);
    });

    const scopeBase = { a: obj.params?.a ?? 1, b: obj.params?.b ?? 0, k: obj.params?.k ?? 1 };
    const grid: { sx: number; sy: number; z: number; depth: number }[][] = [];
    for (let i = 0; i <= n; i++) {
      const row: { sx: number; sy: number; z: number; depth: number }[] = [];
      const gx = sXMin + (i / n) * xSpan;
      for (let j = 0; j <= n; j++) {
        const gy = sYMin + (j / n) * ySpan;
        let gz = 0;
        if (compiled) {
          try {
            const val = Number(compiled.evaluate({ ...scopeBase, x: gx, y: gy }));
            if (Number.isFinite(val)) gz = Math.max(-4, Math.min(4, val));
          } catch {
            gz = 0;
          }
        }
        const p = project((gx - xMid) * normFactor, (gy - yMid) * normFactor, gz);
        row.push({ ...p, z: gz });
      }
      grid.push(row);
    }

    // Painter's algorithm: sort quads back-to-front by camera depth
    const quads: {
      p00: { sx: number; sy: number; z: number; depth: number };
      p10: { sx: number; sy: number; z: number; depth: number };
      p11: { sx: number; sy: number; z: number; depth: number };
      p01: { sx: number; sy: number; z: number; depth: number };
      avgDepth: number;
      avgZ: number;
    }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p00 = grid[i][j];
        const p10 = grid[i + 1][j];
        const p11 = grid[i + 1][j + 1];
        const p01 = grid[i][j + 1];
        quads.push({
          p00,
          p10,
          p11,
          p01,
          avgDepth: (p00.depth + p10.depth + p11.depth + p01.depth) / 4,
          avgZ: (p00.z + p10.z + p11.z + p01.z) / 4,
        });
      }
    }
    quads.sort((a, b) => a.avgDepth - b.avgDepth);

    ctx.lineWidth = 1;
    for (const q of quads) {
      const hue = Math.round(210 - q.avgZ * 28);
      ctx.fillStyle = `hsla(${hue}, 82%, 56%, 0.78)`;
      ctx.strokeStyle = 'rgba(15,23,42,0.22)';
      ctx.beginPath();
      ctx.moveTo(q.p00.sx, q.p00.sy);
      ctx.lineTo(q.p10.sx, q.p10.sy);
      ctx.lineTo(q.p11.sx, q.p11.sy);
      ctx.lineTo(q.p01.sx, q.p01.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Z-height colorbar legend
    const barW = 60;
    const barX = canvas.width - barW - 10;
    const barY = 10;
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, 'hsl(290,82%,56%)');
    grad.addColorStop(0.5, 'hsl(210,82%,56%)');
    grad.addColorStop(1, 'hsl(120,82%,56%)');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, 6);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`3D: z = ${expr}`, 10, 18);
  }, [angles, height, obj.expressions, obj.params, obj.xMax, obj.xMin, obj.yMax, obj.yMin, width]);

  return (
    <canvas
      ref={cRef}
      style={{
        left,
        top,
        width,
        height,
        opacity: obj.opacity ?? 1,
        transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
      }}
      className="absolute pointer-events-auto rounded-lg border border-slate-300 shadow-sm cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        e.stopPropagation();
        dragRef.current = { x: e.clientX, y: e.clientY, yaw: angles.yaw, pitch: angles.pitch };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        onRotate(dragRef.current.yaw + dx * 0.01, Math.max(-1.4, Math.min(1.4, dragRef.current.pitch + dy * 0.01)));
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    />
  );
};

// Interactive Draggable & Rotatable Geometry Instrument Overlay
const GeometryInstrumentOverlay: React.FC<{
  inst: GeometryInstrument;
  zoom: number;
  panX: number;
  panY: number;
  onChange: (inst: GeometryInstrument) => void;
  onStampCircle: (cx: number, cy: number, r: number) => void;
  onStampRay: (ox: number, oy: number, deg: number) => void;
  measuredAngle?: number | null;
}> = ({ inst, zoom, panX, panY, onChange, onStampCircle, onStampRay, measuredAngle }) => {
  const dragMode = useRef<'move' | 'rotate' | 'radius' | null>(null);
  const startRef = useRef({ x: 0, y: 0, ix: inst.x, iy: inst.y, rot: inst.rotation, rad: inst.radius });

  const sx = inst.x * zoom + panX;
  const sy = inst.y * zoom + panY;

  const onDown = (mode: 'move' | 'rotate' | 'radius', e: React.PointerEvent) => {
    e.stopPropagation();
    dragMode.current = mode;
    startRef.current = { x: e.clientX, y: e.clientY, ix: inst.x, iy: inst.y, rot: inst.rotation, rad: inst.radius };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragMode.current) return;
    const dx = (e.clientX - startRef.current.x) / zoom;
    const dy = (e.clientY - startRef.current.y) / zoom;
    if (dragMode.current === 'move') {
      onChange({ ...inst, x: startRef.current.ix + dx, y: startRef.current.iy + dy });
    } else if (dragMode.current === 'rotate') {
      onChange({ ...inst, rotation: Math.round(startRef.current.rot + dx * 0.8) });
    } else if (dragMode.current === 'radius') {
      onChange({ ...inst, radius: Math.max(30, Math.min(320, Math.round(startRef.current.rad + dx))) });
    }
  };

  const onUp = () => {
    dragMode.current = null;
  };

  return (
    <div
      style={{
        left: sx,
        top: sy,
        transform: `rotate(${inst.rotation}deg)`,
        transformOrigin: inst.kind === 'compass' ? '0px 0px' : 'center',
      }}
      className="absolute z-25 select-none pointer-events-auto touch-none"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {inst.kind === 'ruler' && (
        <div
          onPointerDown={(e) => onDown('move', e)}
          className="w-[min(420px,calc(100vw-48px))] h-14 bg-amber-100/85 dark:bg-amber-900/75 border border-amber-500/70 rounded shadow-md cursor-move relative flex items-start px-2 touch-none"
        >
          {Array.from({ length: 21 }, (_, i) => (
            <div key={i} className="flex-1 flex flex-col items-start">
              <div className={`w-px bg-slate-800 dark:bg-amber-100 ${i % 5 === 0 ? 'h-4' : 'h-2'}`} />
              {i % 5 === 0 && <span className="text-[9px] font-mono text-slate-800 dark:text-amber-100">{i}</span>}
            </div>
          ))}
          <button
            onPointerDown={(e) => onDown('rotate', e)}
            title="Drag horizontally to rotate ruler"
            className="absolute -right-3.5 top-3 w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-blue-600 text-white text-xs sm:text-[10px] flex items-center justify-center shadow cursor-ew-resize touch-none"
          >
            ↻
          </button>
          <span className="absolute bottom-1 right-3 text-[10px] font-mono text-amber-900 dark:text-amber-200">
            {inst.rotation}° <span className="hidden sm:inline">(Edge snap active)</span>
          </span>
        </div>
      )}

      {inst.kind === 'protractor' && (
        <div
          onPointerDown={(e) => onDown('move', e)}
          className="w-[260px] h-[135px] rounded-t-full bg-sky-100/75 dark:bg-sky-900/60 border-2 border-sky-500/80 shadow-md cursor-move relative flex items-end justify-center pb-1 touch-none"
        >
          <svg viewBox="0 0 260 135" className="absolute inset-0 w-full h-full pointer-events-none">
            {Array.from({ length: 19 }, (_, i) => {
              const deg = i * 10;
              const rad = (deg * Math.PI) / 180;
              const x1 = 130 + 124 * Math.cos(Math.PI + rad);
              const y1 = 130 + 124 * Math.sin(Math.PI + rad);
              const x2 = 130 + 108 * Math.cos(Math.PI + rad);
              const y2 = 130 + 108 * Math.sin(Math.PI + rad);
              return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0369A1" strokeWidth={i % 3 === 0 ? 1.5 : 1} />;
            })}
            <circle cx="130" cy="130" r="4" fill="#0284C7" />
          </svg>
          <span className="text-xs font-mono font-semibold text-sky-900 dark:text-sky-100 z-10">{inst.rotation}°</span>
          {measuredAngle != null && (
            <span className="absolute -bottom-[52px] left-1/2 -translate-x-1/2 px-2 py-0.5 bg-sky-800 text-white rounded text-[11px] font-mono font-semibold shadow whitespace-nowrap z-10">
              Angle: {measuredAngle}°
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStampRay(inst.x + 130, inst.y + 130, inst.rotation);
            }}
            className={`absolute ${measuredAngle != null ? '-bottom-[76px]' : '-bottom-8'} left-1/2 -translate-x-1/2 px-2.5 py-1 bg-sky-600 text-white rounded text-[11px] sm:text-[10px] font-semibold shadow hover:bg-sky-700 whitespace-nowrap`}
          >
            Stamp Ray ({inst.rotation}°)
          </button>
          <button
            onPointerDown={(e) => onDown('rotate', e)}
            className="absolute -top-3.5 right-1/2 translate-x-1/2 w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-blue-600 text-white text-xs sm:text-[10px] shadow cursor-ew-resize touch-none"
          >
            ↻
          </button>
        </div>
      )}

      {inst.kind === 'compass' && (
        <div className="relative touch-none">
          <div
            onPointerDown={(e) => onDown('move', e)}
            style={{ width: inst.radius * zoom }}
            className="h-3 sm:h-2 bg-slate-700 dark:bg-slate-200 rounded-full cursor-move relative flex items-center touch-none"
          >
            <div className="w-3.5 h-3.5 rounded-full bg-red-600 -ml-1.5" />
            <div
              onPointerDown={(e) => onDown('radius', e)}
              title="Drag to adjust compass radius"
              className="w-5 h-5 sm:w-4 sm:h-4 rounded-full bg-blue-600 border-2 border-white ml-auto -mr-2 cursor-ew-resize shadow touch-none"
            />
          </div>
          <div
            style={{
              width: inst.radius * 2 * zoom,
              height: inst.radius * 2 * zoom,
              left: -inst.radius * zoom,
              top: -inst.radius * zoom,
            }}
            className="absolute border border-dashed border-blue-500/60 rounded-full pointer-events-none"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStampCircle(inst.x, inst.y, inst.radius);
            }}
            className="mt-2 px-2.5 py-1 text-[11px] font-medium bg-blue-600 text-white rounded shadow hover:bg-blue-700 whitespace-nowrap"
          >
            Draw Circle (r={inst.radius})
          </button>
        </div>
      )}

      {inst.kind === 'set_square' && (
        <div onPointerDown={(e) => onDown('move', e)} className="relative w-[180px] h-[180px] cursor-move touch-none">
          <svg viewBox="0 0 180 180" className="w-full h-full drop-shadow">
            <polygon points="0,0 0,180 180,180" fill="rgba(16,185,129,0.22)" stroke="#059669" strokeWidth="2" />
            <polygon points="32,76 32,148 104,148" fill="rgba(255,255,255,0.45)" stroke="#059669" strokeWidth="1" />
          </svg>
          <button
            onPointerDown={(e) => onDown('rotate', e)}
            className="absolute top-0 left-0 w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-blue-600 text-white text-xs sm:text-[10px] shadow cursor-ew-resize touch-none"
          >
            ↻
          </button>
          <span className="absolute bottom-2 left-2 text-[10px] font-mono text-emerald-900 dark:text-emerald-200">
            90° / 45° ({inst.rotation}°)
          </span>
        </div>
      )}
    </div>
  );
};

// Interactive Mini-Map
const MiniMapWidget: React.FC<{
  objects: BoardObject[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  panX: number;
  panY: number;
  zoom: number;
  viewportW: number;
  viewportH: number;
  onNavigate: (panX: number, panY: number) => void;
}> = ({ objects, bounds, panX, panY, zoom, viewportW, viewportH, onNavigate }) => {
  const draggingRef = useRef(false);
  const mw = 164;
  const mh = 104;
  const bw = Math.max(400, bounds.maxX - bounds.minX);
  const bh = Math.max(300, bounds.maxY - bounds.minY);
  const scale = Math.min(mw / bw, mh / bh);

  const viewWorldX = -panX / zoom;
  const viewWorldY = -panY / zoom;
  const viewWorldW = viewportW / zoom;
  const viewWorldH = viewportH / zoom;

  const moveTo = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = bounds.minX + mx / scale;
    const wy = bounds.minY + my / scale;
    onNavigate(viewportW / 2 - wx * zoom, viewportH / 2 - wy * zoom);
  };

  return (
    <div className="hidden md:block absolute bottom-3 right-3 z-20 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md p-1.5">
      <svg
        width={mw}
        height={mh}
        onPointerDown={(e) => {
          e.stopPropagation();
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          moveTo(e);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        className="cursor-pointer active:cursor-grabbing bg-slate-50 dark:bg-slate-950 rounded touch-none"
      >
        {objects.slice(0, 150).map((o) => (
          <rect
            key={o.id}
            x={(o.x - bounds.minX) * scale}
            y={(o.y - bounds.minY) * scale}
            width={Math.max(3, o.width * scale)}
            height={Math.max(3, o.height * scale)}
            fill={o.type === 'sticky' ? '#FACC15' : '#64748B'}
            opacity={0.7}
          />
        ))}
        <rect
          x={(viewWorldX - bounds.minX) * scale}
          y={(viewWorldY - bounds.minY) * scale}
          width={Math.max(10, viewWorldW * scale)}
          height={Math.max(8, viewWorldH * scale)}
          fill="rgba(37,99,235,0.14)"
          stroke="#2563EB"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
};
