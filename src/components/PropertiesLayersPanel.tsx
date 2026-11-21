import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  BarChart3,
  Bot,
  Brush,
  Calculator,
  Check,
  CheckSquare,
  Compass,
  Copy,
  Crop,
  Eraser,
  Eye,
  EyeOff,
  FileAudio,
  FileVideo,
  FlipHorizontal,
  FlipVertical,
  Frame,
  FunctionSquare,
  GitBranch,
  Grid,
  Group,
  Hand,
  Highlighter,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Layers,
  LineChart,
  List,
  ListOrdered,
  Lock,
  Maximize,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  Network,
  PaintBucket,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  PanelTopOpen,
  Pen,
  Pencil,
  Plus,
  Pointer,
  RemoveFormatting,
  RotateCcw,
  Ruler,
  Search,
  Shapes,
  Sliders,
  Sparkles,
  StickyNote,
  Table2,
  Trash2,
  Triangle,
  Type,
  Ungroup,
  Unlock,
  Wand2,
  X,
} from 'lucide-react';
import { COLORBLIND_PALETTE, STANDARD_PALETTE } from '../i18n/translations';
import { centerDiagramObjectsAt, SHAPE_CATALOG, type ShapeCategory, ShapeGlyph } from './ShapeDiagramMenu';
import type {
  BoardLayer,
  BoardObject,
  BoardPage,
  EraserSettings,
  CodeLanguage,
  ChartObject,
  DiagramType,
  GeometryInstrument,
  GridType,
  ImageObject,
  LineEndpointStyle,
  PortSide,
  ShapeKind,
  StrokeObject,
  StrokePoint,
  TextAlignMode,
  TextStickyDefaults,
  ToolType,
} from '../types/smartboard';
import { resourceUrl } from '../utils/api';
import { getCachedImage } from '../utils/canvasRenderer';
import { computeAspectPresetCrop, loadImageNaturalSize, scalePointsToBox, scalePointToBox, uid } from '../utils/geometry';
import { buildDiagramStarter, DIAGRAM_TYPES } from '../utils/templates';
import { highlightCodeToRichBlocks } from '../utils/codeHighlight';
import {
  EXCALIDRAW_QUICK_FONTS,
  FONT_PRESETS,
  HIGHLIGHT_SWATCHES,
  SIZE_PRESETS,
  STICKY_NOTE_COLORS,
  applyDefaultStyleToRichBlocks,
  getEffectiveRichBlocks,
  htmlToRichBlocks,
  richBlocksToHtml,
  richBlocksToPlainText,
} from '../utils/richText';

type PropertiesLayersPanelProps = {
  page: BoardPage;
  selectedIds: Set<string>;
  onSelectIds?: (ids: Set<string>) => void;
  preciseSelection?: boolean;
  onChangePreciseSelection?: (enabled: boolean) => void;
  activeTool: ToolType;
  activeShapeKind: ShapeKind;
  textDefaults: TextStickyDefaults;
  focusPropsTick?: number;
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
  colorblindPalette: boolean;
  userName: string;
  onChangeStrokeColor: (c: string) => void;
  onChangeFillColor: (c: string) => void;
  onChangeStrokeWidth: (w: number) => void;
  onChangeOpacity: (o: number) => void;
  onChangeLineStyle: (ls: 'solid' | 'dashed' | 'dotted') => void;
  onChangeSmoothing: (s: number) => void;
  onChangeStabilization: (value: number) => void;
  onChangeEraserMode: (m: 'stroke' | 'object' | 'area') => void;
  onChangeEraserSize: (s: number) => void;
  onChangeEraserSettings: (patch: Partial<EraserSettings>) => void;
  onToggleAutoSmartShape: () => void;
  onChangeTextDefaults: (patch: Partial<TextStickyDefaults>) => void;
  onSetActiveTool: (tool: ToolType) => void;
  onSelectShapeKind: (kind: ShapeKind) => void;
  onUpdateObject: (id: string, patch: Partial<BoardObject>, commit?: boolean) => void;
  onBatchPatchObjects?: (patches: (Partial<BoardObject> & { id: string })[]) => void;
  onSnapshotUndo?: () => void;
  onSyncPageState?: () => void;
  onDeleteObjects: (ids: string[]) => void;
  onDuplicateSelected: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onReorderZ: (id: string, dir: 'front' | 'back' | 'forward' | 'backward') => void;
  onAlignSelected: (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute_h' | 'distribute_v') => void;
  onUpdatePage?: (pageId: string, patch: Partial<BoardPage>, commit?: boolean) => void;
  richEditorRef?: React.RefObject<HTMLDivElement | null>;
  isEditingText?: boolean;
  onSyncRichEditor?: (commit?: boolean) => void;
  shapeFillStyle?: 'solid' | 'hachure' | 'cross_hatch' | 'dots';
  onChangeShapeFillStyle?: (fs: 'solid' | 'hachure' | 'cross_hatch' | 'dots') => void;
  shapeCornerRadius?: number;
  onChangeShapeCornerRadius?: (r: number) => void;
  shapeShadow?: boolean;
  onToggleShapeShadow?: () => void;
  connectorRouteType?: 'straight' | 'orthogonal' | 'curved';
  onChangeConnectorRouteType?: (rt: 'straight' | 'orthogonal' | 'curved') => void;
  lineStartHead?: LineEndpointStyle;
  onChangeLineStartHead?: (h: LineEndpointStyle) => void;
  lineEndHead?: LineEndpointStyle;
  onChangeLineEndHead?: (h: LineEndpointStyle) => void;
  onClearPageInk?: () => void;
  onClearPageAll?: () => void;
  canEdit?: boolean;
  onInsertSectionFrame?: (w: number, h: number, title: string) => void;
  onInsertBoardTable?: (rows: number, cols: number) => void;
  onInsertCodeBlock?: () => void;
  onInsertDiagram?: (objs: BoardObject[]) => void;
  onAutoLayoutDiagram?: (dir?: 'LR' | 'TB' | 'radial') => void;
  instruments?: GeometryInstrument[];
  onToggleInstrument?: (kind: GeometryInstrument['kind']) => void;
  onHideAllInstruments?: () => void;
  onOpenMathOrGraph?: (tab: 'equation' | 'graph' | 'science', existingObj?: BoardObject) => void;
  onQuickAIAction?: (action: 'sketch_shape' | 'handwriting' | 'math_solve') => void;
  onCenterObjectInView?: (obj: BoardObject) => void;
  onClose?: () => void;
  layoutMode?: 'rail' | 'full';
  onToggleExpand?: () => void;
  hideTopBar?: boolean;
  onShowTopBar?: () => void;
  rightPanelMenu?: 'table' | 'diagrams' | 'geometry' | 'math' | null;
  onClearRightPanelMenu?: () => void;
  autoOpenSignal?: { sectionId?: string; tick: number } | null;
  viewportCenter?: { x: number; y: number };
  onCopyStyle?: (obj: BoardObject) => void;
  onPasteStyle?: (objs: BoardObject[]) => void;
  hasCopiedStyle?: boolean;
  onPresentFrame?: (frame: BoardObject) => void;
  onExportFrame?: (frame: BoardObject) => void;
  croppingId?: string | null;
  onToggleCrop?: (id: string) => void;
};

type BrushPreset = Pick<StrokeObject,
  'brushKind' | 'strokeWidth' | 'lineStyle' | 'smoothing' | 'stabilization' | 'pressureSize' |
  'pressureOpacity' | 'pressureCurve' | 'tiltSensitivity' | 'taperStart' | 'taperEnd' |
  'wetness' | 'blendMode' | 'texture' | 'spacing' | 'scatter' | 'rotationDynamics'
> & { id: string; name: string };

type ShapePreset = Partial<Extract<BoardObject, { type: 'shape' }>> & { id: string; name: string };

const PEN_TOOLS: ToolType[] = ['pen', 'pencil', 'brush', 'marker', 'highlighter', 'calligraphy', 'fountain', 'laser'];
const LINE_TOOLS: ToolType[] = ['line', 'curved_line', 'polyline', 'arrow', 'double_arrow'];

const QUICK_SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: 'rectangle', label: 'Rect' },
  { kind: 'rounded_rect', label: 'Rounded' },
  { kind: 'square', label: 'Square' },
  { kind: 'circle', label: 'Circle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'parallelogram', label: 'Parallelogram' },
  { kind: 'pentagon', label: 'Pentagon' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'star', label: 'Star' },
  { kind: 'cross', label: 'Cross' },
  { kind: 'cloud', label: 'Cloud' },
  { kind: 'speech_bubble', label: 'Bubble' },
  { kind: 'block_arrow_right', label: 'Arrow' },
];

const BOX_BG_SWATCHES = ['#FEF08A', '#BAE6FD', '#BBF7D0', '#FECDD3', '#E9D5FF', '#FED7AA'];

function hexToRgbString(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '15, 23, 42';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return '15, 23, 42';
  return `${r}, ${g}, ${b}`;
}

function rgbStringToHex(rgb: string): string | null {
  const parts = rgb.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return (
    '#' +
    parts
      .map((n) => Math.round(n).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export const PropertiesLayersPanel: React.FC<PropertiesLayersPanelProps> = ({
  page,
  selectedIds,
  onSelectIds,
  preciseSelection = false,
  onChangePreciseSelection,
  activeTool,
  activeShapeKind,
  textDefaults,
  focusPropsTick,
  strokeColor,
  fillColor,
  strokeWidth,
  opacity,
  lineStyle,
  smoothing,
  stabilization,
  eraserMode,
  eraserSize,
  eraserSettings,
  autoSmartShape,
  colorblindPalette,
  userName,
  onChangeStrokeColor,
  onChangeFillColor,
  onChangeStrokeWidth,
  onChangeOpacity,
  onChangeLineStyle,
  onChangeSmoothing,
  onChangeStabilization,
  onChangeEraserMode,
  onChangeEraserSize,
  onChangeEraserSettings,
  onToggleAutoSmartShape,
  onChangeTextDefaults,
  onSetActiveTool,
  onSelectShapeKind,
  onUpdateObject,
  onBatchPatchObjects,
  onSnapshotUndo,
  onSyncPageState,
  onDeleteObjects,
  onDuplicateSelected,
  onGroupSelected,
  onUngroupSelected,
  onReorderZ,
  onAlignSelected,
  onUpdatePage,
  richEditorRef,
  isEditingText = false,
  onSyncRichEditor,
  shapeFillStyle = 'solid',
  onChangeShapeFillStyle,
  shapeCornerRadius = 14,
  onChangeShapeCornerRadius,
  shapeShadow = false,
  onToggleShapeShadow,
  connectorRouteType = 'curved',
  onChangeConnectorRouteType,
  lineStartHead = 'none',
  onChangeLineStartHead,
  lineEndHead = 'arrow',
  onChangeLineEndHead,
  onClearPageInk,
  onClearPageAll,
  canEdit = true,
  onInsertSectionFrame,
  onInsertBoardTable,
  onInsertCodeBlock,
  onInsertDiagram,
  onAutoLayoutDiagram,
  instruments = [],
  onToggleInstrument,
  onHideAllInstruments,
  onOpenMathOrGraph,
  onQuickAIAction,
  onCenterObjectInView,
  onClose,
  layoutMode = 'full',
  onToggleExpand,
  hideTopBar = false,
  onShowTopBar,
  rightPanelMenu = null,
  onClearRightPanelMenu,
  autoOpenSignal = null,
  viewportCenter,
  onCopyStyle,
  onPasteStyle,
  hasCopiedStyle = false,
  onPresentFrame,
  onExportFrame,
  croppingId = null,
  onToggleCrop,
}) => {
  const [commentInput, setCommentInput] = useState('');
  const [removingBg, setRemovingBg] = useState(false);
  const [cutoutTolerance, setCutoutTolerance] = useState(36);
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const [popoverTop, setPopoverTop] = useState(80);
  const [shapeCategory, setShapeCategory] = useState<'all' | ShapeCategory>('all');
  const [tableHoverSize, setTableHoverSize] = useState<{ r: number; c: number }>({ r: 3, c: 3 });
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvDraft, setCsvDraft] = useState('');
  const [brushPresets, setBrushPresets] = useState<BrushPreset[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(window.localStorage.getItem('lumina_board_brush_presets') || '[]') as BrushPreset[];
    } catch {
      return [];
    }
  });
  const [shapePresets, setShapePresets] = useState<ShapePreset[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(window.localStorage.getItem('lumina_board_shape_presets') || '[]') as ShapePreset[]; } catch { return []; }
  });
  const [selectionHistoryCount, setSelectionHistoryCount] = useState(0);
  const railButtonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const previousSelectionRef = useRef(new Set(selectedIds));
  const selectionHistoryRef = useRef<Set<string>[]>([]);

  useEffect(() => {
    try { window.localStorage.setItem('lumina_board_shape_presets', JSON.stringify(shapePresets)); } catch { /* storage can be unavailable */ }
  }, [shapePresets]);

  useEffect(() => {
    const previous = previousSelectionRef.current;
    const same = previous.size === selectedIds.size && [...previous].every((id) => selectedIds.has(id));
    if (!same && previous.size > 0) {
      const valid = new Set([...previous].filter((id) => page.objects.some((obj) => obj.id === id)));
      if (valid.size > 0) {
        selectionHistoryRef.current = [...selectionHistoryRef.current.slice(-19), valid];
        setSelectionHistoryCount(selectionHistoryRef.current.length);
      }
    }
    previousSelectionRef.current = new Set(selectedIds);
  }, [page.objects, selectedIds]);

  const palette = colorblindPalette ? COLORBLIND_PALETTE : STANDARD_PALETTE;
  const selectedObjects = useMemo(
    () => page.objects.filter((o) => selectedIds.has(o.id)),
    [page.objects, selectedIds]
  );
  const primary = selectedObjects.length === 1 ? selectedObjects[0] : null;

  const selectSimilar = () => {
    if (!primary || !onSelectIds) return;
    const similar = page.objects.filter((obj) => {
      if (obj.type !== primary.type) return false;
      if (obj.type === 'shape' && primary.type === 'shape') return obj.shapeKind === primary.shapeKind;
      if (obj.type === 'text' && primary.type === 'text') {
        return obj.codeBlock === primary.codeBlock && obj.fontFamily === primary.fontFamily && obj.fontSize === primary.fontSize;
      }
      if (obj.type === 'sticky' && primary.type === 'sticky') return obj.noteColor === primary.noteColor;
      if (obj.type === 'stroke' && primary.type === 'stroke') return obj.brushKind === primary.brushKind && obj.stroke === primary.stroke;
      if (obj.type === 'line' && primary.type === 'line') return obj.stroke === primary.stroke && obj.lineStyle === primary.lineStyle;
      if (obj.type === 'connector' && primary.type === 'connector') return obj.stroke === primary.stroke && obj.routeType === primary.routeType;
      return true;
    });
    onSelectIds(new Set(similar.map((obj) => obj.id)));
  };

  const selectAllOfType = () => {
    if (!primary || !onSelectIds) return;
    onSelectIds(new Set(page.objects.filter((obj) => obj.type === primary.type).map((obj) => obj.id)));
  };

  const boardLayers: BoardLayer[] = useMemo(
    () =>
      page.layers && page.layers.length > 0
        ? page.layers
        : [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
    [page.layers]
  );

  const activeColor =
    primary && 'stroke' in primary
      ? primary.stroke
      : primary && 'textColor' in primary
        ? primary.textColor
        : primary && primary.type === 'math'
          ? primary.color
          : strokeColor;
  const [rgbDraft, setRgbDraft] = useState(hexToRgbString(activeColor));

  useEffect(() => {
    setRgbDraft(hexToRgbString(activeColor));
  }, [activeColor]);

  const hasHighlightedRangeInEditor = () => {
    const editor = richEditorRef?.current;
    const sel = window.getSelection();
    if (!isEditingText || !editor || !sel || sel.rangeCount === 0) return false;
    return editor.contains(sel.anchorNode) && !sel.isCollapsed;
  };

  const getActiveBlockInEditor = (editor: HTMLDivElement): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.anchorNode;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (
          el.dataset.block === 'p' ||
          el.dataset.block === 'check' ||
          tag === 'div' ||
          tag === 'p' ||
          tag === 'li' ||
          tag === 'h1' ||
          tag === 'h2' ||
          tag === 'h3'
        ) {
          if (
            el.parentElement === editor ||
            el.parentElement?.tagName.toLowerCase() === 'ul' ||
            el.parentElement?.tagName.toLowerCase() === 'ol'
          ) {
            return el;
          }
        }
      }
      node = node.parentNode;
    }
    return null;
  };

  const batchPatch = (patches: (Partial<BoardObject> & { id: string })[], commit = true) => {
    if (patches.length === 0) return;
    if (commit && onBatchPatchObjects) {
      onBatchPatchObjects(patches);
    } else {
      patches.forEach((p, idx) => {
        const { id, ...rest } = p;
        onUpdateObject(id, rest as Partial<BoardObject>, commit && idx === 0);
      });
    }
  };

  const applyColorToSelected = (c: string, commit = true) => {
    if (isEditingText && richEditorRef?.current && hasHighlightedRangeInEditor()) {
      richEditorRef.current.focus();
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('foreColor', false, c);
      onSyncRichEditor?.(commit);
      return;
    }
    const patches: (Partial<BoardObject> & { id: string })[] = [];
    selectedObjects.forEach((o) => {
      if ('stroke' in o) patches.push({ id: o.id, stroke: c });
      else if (o.type === 'text' || o.type === 'sticky') {
        const blocks = applyDefaultStyleToRichBlocks(getEffectiveRichBlocks(o), { color: c });
        patches.push({ id: o.id, textColor: c, richBlocks: blocks });
        if (isEditingText && richEditorRef?.current && primary?.id === o.id) {
          richEditorRef.current.innerHTML = richBlocksToHtml(blocks, o.textAlign || 'left');
        }
      } else if ('textColor' in o) {
        patches.push({ id: o.id, textColor: c });
      } else if (o.type === 'math') {
        patches.push({ id: o.id, color: c });
      }
    });
    batchPatch(patches, commit);
  };

  // Edge-flood-fill background cutout (preserves interior white eyes/shirts/highlights)
  const handleRemoveBackground = (imgObj: ImageObject) => {
    setRemovingBg(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || 400;
      const h = img.naturalHeight || 400;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) {
        setRemovingBg(false);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      const total = w * h;
      const visited = new Uint8Array(total);
      const bgMask = new Uint8Array(total);

      // Sample border colors (4 corners + edge midpoints)
      const sampleCoords: [number, number][] = [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
        [Math.floor(w / 2), 0],
        [Math.floor(w / 2), h - 1],
        [0, Math.floor(h / 2)],
        [w - 1, Math.floor(h / 2)],
      ];
      let bgR = 0,
        bgG = 0,
        bgB = 0;
      for (const [sx, sy] of sampleCoords) {
        const idx = (sy * w + sx) * 4;
        bgR += px[idx];
        bgG += px[idx + 1];
        bgB += px[idx + 2];
      }
      bgR /= sampleCoords.length;
      bgG /= sampleCoords.length;
      bgB /= sampleCoords.length;

      const tol = cutoutTolerance;
      const featherTol = tol + 16;
      const queue = new Int32Array(total);
      let head = 0;
      let tail = 0;

      const tryEnqueueBorder = (x: number, y: number) => {
        const pIdx = y * w + x;
        if (visited[pIdx]) return;
        const off = pIdx * 4;
        if (px[off + 3] === 0) {
          visited[pIdx] = 1;
          bgMask[pIdx] = 1;
          queue[tail++] = pIdx;
          return;
        }
        const d = Math.hypot(px[off] - bgR, px[off + 1] - bgG, px[off + 2] - bgB);
        if (d <= tol * 1.25) {
          visited[pIdx] = 1;
          bgMask[pIdx] = 1;
          queue[tail++] = pIdx;
        }
      };

      for (let x = 0; x < w; x++) {
        tryEnqueueBorder(x, 0);
        tryEnqueueBorder(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        tryEnqueueBorder(0, y);
        tryEnqueueBorder(w - 1, y);
      }

      const dirs = [-1, 1, -w, w];
      while (head < tail) {
        const cur = queue[head++];
        const curOff = cur * 4;
        const cx = cur % w;
        const cy = (cur - cx) / w;

        for (let k = 0; k < 4; k++) {
          if (k === 0 && cx === 0) continue;
          if (k === 1 && cx === w - 1) continue;
          if (k === 2 && cy === 0) continue;
          if (k === 3 && cy === h - 1) continue;
          const nxt = cur + dirs[k];
          if (visited[nxt]) continue;
          visited[nxt] = 1;
          const nOff = nxt * 4;
          const dCenter = Math.hypot(px[nOff] - bgR, px[nOff + 1] - bgG, px[nOff + 2] - bgB);
          const dNeighbor = Math.hypot(px[nOff] - px[curOff], px[nOff + 1] - px[curOff + 1], px[nOff + 2] - px[curOff + 2]);
          if (px[nOff + 3] === 0 || (dCenter <= tol && dNeighbor <= tol * 0.9)) {
            bgMask[nxt] = 1;
            queue[tail++] = nxt;
          } else if (dCenter < featherTol) {
            const alphaFactor = Math.max(0, Math.min(1, (dCenter - tol) / (featherTol - tol)));
            px[nOff + 3] = Math.round(px[nOff + 3] * alphaFactor);
          }
        }
      }

      for (let i = 0; i < total; i++) {
        if (bgMask[i]) {
          px[i * 4 + 3] = 0;
        }
      }

      ctx.putImageData(data, 0, 0);
      onUpdateObject(imgObj.id, { src: c.toDataURL('image/png') }, true);
      setRemovingBg(false);
    };
    img.onerror = () => setRemovingBg(false);
    img.src = imgObj.src;
  };

  // Contextual classification for single right card
  const isPenTool = PEN_TOOLS.includes(activeTool);
  const isEraserTool = activeTool.startsWith('eraser');
  const isLineTool = LINE_TOOLS.includes(activeTool);
  const hasSelection = selectedObjects.length > 0;

  const contextMeta = useMemo(() => {
    if (selectedObjects.length > 1) {
      return { title: `Multi-Selection (${selectedObjects.length})`, icon: MousePointer2 };
    }
    if (primary) {
      const map: Record<BoardObject['type'], { title: string; icon: React.ComponentType<{ className?: string }> }> = {
        text: { title: 'Text Box', icon: Type },
        sticky: { title: 'Sticky Note', icon: StickyNote },
        shape: { title: `${primary.type === 'shape' ? primary.shapeKind.replace(/_/g, ' ') : 'Shape'}`, icon: Shapes },
        stroke: { title: 'Drawing Stroke', icon: Pen },
        line: { title: 'Line / Arrow', icon: Minus },
        connector: { title: 'Connector', icon: GitBranch },
        table: { title: 'Table', icon: Grid },
        chart: { title: 'Chart', icon: Sliders },
        graph: { title: 'Graph Plotter', icon: Sliders },
        image: { title: 'Image', icon: Layers },
        math: { title: 'Math Formula', icon: Sliders },
        media: { title: 'Media', icon: Layers },
      };
      return map[primary.type];
    }
    if (rightPanelMenu === 'table') return { title: 'Insert Table', icon: Table2 };
    if (rightPanelMenu === 'diagrams') return { title: 'Diagrams', icon: Network };
    if (rightPanelMenu === 'geometry') return { title: 'Geometry', icon: Ruler };
    if (rightPanelMenu === 'math') return { title: 'Math & Science', icon: FunctionSquare };
    if (activeTool === 'select') return { title: 'Select / Page', icon: MousePointer2 };
    if (activeTool === 'hand') return { title: 'Hand / Pan', icon: Hand };
    if (activeTool === 'paint_bucket') return { title: 'Fill Tool', icon: PaintBucket };
    if (activeTool === 'highlighter') return { title: 'Highlighter', icon: Highlighter };
    if (activeTool === 'laser') return { title: 'Laser Pointer', icon: Pointer };
    if (isPenTool) return { title: activeTool.charAt(0).toUpperCase() + activeTool.slice(1), icon: activeTool === 'brush' ? Brush : activeTool === 'pencil' ? Pencil : Pen };
    if (isEraserTool) return { title: 'Eraser', icon: Eraser };
    if (activeTool === 'text') return { title: 'Text Tool', icon: Type };
    if (activeTool === 'sticky') return { title: 'Sticky Note', icon: StickyNote };
    if (activeTool === 'shape' && activeShapeKind === 'frame') return { title: 'Section Frame', icon: Frame };
    if (activeTool === 'shape') return { title: 'Shape Tool', icon: Shapes };
    if (isLineTool) return { title: 'Lines & Arrows', icon: Minus };
    if (activeTool === 'connector') return { title: 'Connector', icon: GitBranch };
    return { title: 'Properties', icon: Sliders };
  }, [activeTool, activeShapeKind, isEraserTool, isLineTool, isPenTool, primary, rightPanelMenu, selectedObjects.length]);

  const ContextIcon = contextMeta.icon;

  // Shared color picker block helper
  const renderColorSection = (label: string, extraReset?: () => void) => (
    <div className="space-y-2">
      {(layoutMode === 'full' || extraReset) && (
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
          {extraReset && (
            <button onClick={extraReset} className="text-[11px] text-slate-500 hover:text-blue-600">
              Reset
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-5 gap-1.5">
        {palette.map((c) => (
          <button
            key={c}
            onClick={() => {
              onChangeStrokeColor(c);
              setRgbDraft(hexToRgbString(c));
              applyColorToSelected(c);
            }}
            style={{ backgroundColor: c }}
            className={`h-6 rounded-lg border transition-colors ${
              activeColor.toUpperCase() === c.toUpperCase()
                ? 'ring-2 ring-blue-600 border-white'
                : 'border-slate-200/60 dark:border-slate-700/60 hover:scale-110'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={activeColor.startsWith('#') ? activeColor : '#0F172A'}
          onFocus={() => onSnapshotUndo?.()}
          onChange={(e) => {
            const val = e.target.value.toUpperCase();
            onChangeStrokeColor(val);
            setRgbDraft(hexToRgbString(val));
            applyColorToSelected(val, !onSnapshotUndo);
          }}
          onBlur={() => onSyncPageState?.()}
          className="w-8 h-7 rounded-lg cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
        />
        <input
          value={activeColor}
          onChange={(e) => {
            const val = e.target.value;
            onChangeStrokeColor(val);
            if (/^#[0-9a-fA-F]{6}$/.test(val)) {
              setRgbDraft(hexToRgbString(val));
              applyColorToSelected(val, true);
            }
          }}
          placeholder="#HEX"
          className="w-20 px-2 py-1 font-mono text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
        />
        <input
          value={rgbDraft}
          onChange={(e) => {
            setRgbDraft(e.target.value);
            const hex = rgbStringToHex(e.target.value);
            if (hex) {
              onChangeStrokeColor(hex);
              applyColorToSelected(hex, true);
            }
          }}
          placeholder="R, G, B"
          className="flex-1 min-w-0 px-2 py-1 font-mono text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
        />
      </div>
    </div>
  );

  const renderOpacityControl = () => {
    const curOpacity = primary
      ? primary.opacity
      : selectedObjects.length > 0
        ? selectedObjects[0].opacity
        : opacity;
    return (
      <div>
        <div className="flex justify-between mb-1">
          <span>Opacity</span>
          <span className="font-mono">{Math.round(curOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={curOpacity}
          onFocus={() => {
            if (selectedObjects.length > 0) onSnapshotUndo?.();
          }}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChangeOpacity(v);
            batchPatch(
              selectedObjects.map((o) => ({ id: o.id, opacity: v })),
              !onSnapshotUndo
            );
          }}
          onPointerUp={() => {
            if (selectedObjects.length > 0) onSyncPageState?.();
          }}
          className="w-full"
        />
      </div>
    );
  };

  const renderStrokeStyleControls = (showWidth = true, showLineStyle = true, allowNoBorder = false) => (
    <div className="space-y-2.5">
      {showWidth && (
        <div>
          <div className="flex justify-between mb-1">
            <span>Stroke Width</span>
            <span className="font-mono">
              {(primary && 'strokeWidth' in primary ? primary.strokeWidth : strokeWidth) === 0
                ? 'None'
                : `${primary && 'strokeWidth' in primary ? primary.strokeWidth : strokeWidth}px`}
            </span>
          </div>
          <input
            type="range"
            min={allowNoBorder ? 0 : 1}
            max={32}
            value={primary && 'strokeWidth' in primary ? primary.strokeWidth : strokeWidth}
              onFocus={() => {
              if (selectedObjects.length > 0) onSnapshotUndo?.();
            }}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChangeStrokeWidth(v);
              batchPatch(
                selectedObjects.filter((o) => 'strokeWidth' in o).map((o) => ({ id: o.id, strokeWidth: v })),
                !onSnapshotUndo
              );
            }}
            onPointerUp={() => {
              if (selectedObjects.length > 0) onSyncPageState?.();
            }}
            className="w-full"
          />
          <div className={`grid ${allowNoBorder ? 'grid-cols-5' : 'grid-cols-4'} gap-1 mt-1.5`}>
            {(allowNoBorder ? [0, 2, 4, 8, 16] : [2, 4, 8, 16]).map((w) => {
              const curW = primary && 'strokeWidth' in primary ? primary.strokeWidth : strokeWidth;
              return (
                <button
                  key={w}
                  onClick={() => {
                    onChangeStrokeWidth(w);
                    batchPatch(
                      selectedObjects.filter((o) => 'strokeWidth' in o).map((o) => ({ id: o.id, strokeWidth: w })),
                      true
                    );
                  }}
                  className={`py-1 text-[11px] rounded border ${
                    curW === w ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {w === 0 ? 'No Border' : `${w}px`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {renderOpacityControl()}

      {showLineStyle && (
        <div className="flex items-center justify-between">
          <span>Line Style</span>
          <div className="flex gap-1">
            {(['solid', 'dashed', 'dotted'] as const).map((ls) => {
              const activeLs = primary && 'lineStyle' in primary && primary.lineStyle ? primary.lineStyle : lineStyle;
              return (
                <button
                  key={ls}
                  onClick={() => {
                    onChangeLineStyle(ls);
                    batchPatch(
                      selectedObjects.filter((o) => 'lineStyle' in o).map((o) => ({ id: o.id, lineStyle: ls })),
                      true
                    );
                  }}
                  className={`px-2 py-1 text-[11px] rounded border capitalize ${
                    activeLs === ls ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
                  }`}
                >
                  {ls}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderFillSection = (allowGradient = true) => {
    const firstShape = selectedObjects.find((o) => o.type === 'shape');
    const curFill = firstShape ? firstShape.fill : fillColor;
    const isTransparent = !curFill || curFill === 'transparent';
    const curFillStyle = firstShape ? firstShape.fillStyle || 'solid' : 'solid';
    const fillSwatches = colorblindPalette
      ? ['#EFF6FF', '#E2E8F0', '#FEF3C7', '#FCE7F3', '#F5F3FF', '#FFFFFF', ...palette.slice(0, 6)]
      : ['#EFF6FF', '#ECFDF5', '#FEF3C7', '#FFF1F2', '#F5F3FF', '#FFFFFF', '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#7C3AED', '#0F172A'];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Fill</span>
          <button
            onClick={() => {
              onChangeFillColor('transparent');
              batchPatch(
                selectedObjects.filter((o) => o.type === 'shape').map((o) => ({ id: o.id, fill: 'transparent', fillGradient: undefined })),
                true
              );
            }}
            className={`text-[11px] ${isTransparent && !(primary?.type === 'shape' && primary.fillGradient) ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-blue-600'}`}
          >
            Transparent
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {fillSwatches.map((fc) => (
            <button
              key={fc}
              onClick={() => {
                onChangeFillColor(fc);
                batchPatch(
                  selectedObjects.filter((o) => o.type === 'shape').map((o) => ({ id: o.id, fill: fc, fillGradient: undefined })),
                  true
                );
              }}
              style={{ backgroundColor: fc }}
              title={`Fill ${fc}`}
              className={`h-6 rounded border ${
                curFill === fc && !(primary?.type === 'shape' && primary.fillGradient)
                  ? 'ring-2 ring-blue-600 border-white'
                  : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            aria-label="Custom fill color"
            value={isTransparent || !curFill.startsWith('#') ? '#EFF6FF' : curFill}
              onFocus={() => {
              if (selectedObjects.some((o) => o.type === 'shape')) onSnapshotUndo?.();
            }}
            onChange={(e) => {
              const fc = e.target.value.toUpperCase();
              onChangeFillColor(fc);
              batchPatch(
                selectedObjects.filter((o) => o.type === 'shape').map((o) => ({ id: o.id, fill: fc, fillGradient: undefined })),
                !onSnapshotUndo
              );
            }}
            onBlur={() => {
              if (selectedObjects.some((o) => o.type === 'shape')) onSyncPageState?.();
            }}
            className="w-7 h-7 rounded border border-slate-200/60 dark:border-slate-700/60 cursor-pointer shrink-0"
          />
          <input
            value={isTransparent ? 'transparent' : curFill.toUpperCase()}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9a-fA-F]{6}$/.test(v) || v === 'transparent') {
                onChangeFillColor(v);
                batchPatch(
                  selectedObjects.filter((o) => o.type === 'shape').map((o) => ({ id: o.id, fill: v, fillGradient: undefined })),
                  true
                );
              }
            }}
            className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
          />
          {allowGradient && primary?.type === 'shape' && (
            <button
              onClick={() =>
                onUpdateObject(
                  primary.id,
                  {
                    fillGradient: primary.fillGradient
                      ? undefined
                      : { from: !isTransparent && curFill.startsWith('#') ? curFill : '#3B82F6', to: '#1D4ED8', angle: 135 },
                  },
                  true
                )
              }
              className={`px-2 py-1 text-[11px] rounded border shrink-0 ${
                primary.fillGradient ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              Gradient
            </button>
          )}
        </div>

        {!(primary?.type === 'shape' && primary.fillGradient) && !isTransparent && (firstShape || selectedObjects.length === 0) && (
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] text-slate-500">Fill Pattern</span>
            <div className="flex gap-1">
              {(
                [
                  { id: 'solid', label: 'Solid' },
                  { id: 'hachure', label: 'Hatch' },
                  { id: 'cross_hatch', label: 'Cross' },
                  { id: 'dots', label: 'Dots' },
                ] as const
              ).map((fp) => {
                const activePat = firstShape ? curFillStyle : shapeFillStyle;
                return (
                  <button
                    key={fp.id}
                    onClick={() => {
                      onChangeShapeFillStyle?.(fp.id);
                      batchPatch(
                        selectedObjects.filter((o) => o.type === 'shape').map((o) => ({ id: o.id, fillStyle: fp.id })),
                        true
                      );
                    }}
                    className={`px-1.5 py-0.5 text-[10px] rounded border ${
                      activePat === fp.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {fp.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {allowGradient && primary?.type === 'shape' && primary.fillGradient && (
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="grid grid-cols-5 gap-1">
              {[
                ['#38BDF8', '#8B5CF6'], ['#F59E0B', '#EF4444'], ['#34D399', '#0EA5E9'], ['#F472B6', '#A78BFA'], ['#64748B', '#E2E8F0'],
              ].map(([from, to], index) => (
                <button key={index} aria-label={`Gradient preset ${index + 1}`} onClick={() => onUpdateObject(primary.id, { fillGradient: { from, to, angle: 45, type: 'linear' } }, true)} className="h-5 rounded border border-slate-300/70 dark:border-slate-700" style={{ background: `linear-gradient(90deg, ${from}, ${to})` }} />
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <label className="flex items-center gap-1">
                <span className="text-slate-500">From</span>
                <input
                  type="color"
                  value={primary.fillGradient.from}
                  onFocus={() => onSnapshotUndo?.()}
                  onChange={(e) =>
                    onUpdateObject(
                      primary.id,
                      { fillGradient: { ...primary.fillGradient!, from: e.target.value } },
                      !onSnapshotUndo
                    )
                  }
                  onBlur={() => onSyncPageState?.()}
                  className="w-6 h-5 rounded border border-slate-200/60 dark:border-slate-700/60 cursor-pointer"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-slate-500">To</span>
                <input
                  type="color"
                  value={primary.fillGradient.to}
                  onFocus={() => onSnapshotUndo?.()}
                  onChange={(e) =>
                    onUpdateObject(
                      primary.id,
                      { fillGradient: { ...primary.fillGradient!, to: e.target.value } },
                      !onSnapshotUndo
                    )
                  }
                  onBlur={() => onSyncPageState?.()}
                  className="w-6 h-5 rounded border border-slate-200/60 dark:border-slate-700/60 cursor-pointer"
                />
              </label>
              <select aria-label="Gradient type" value={primary.fillGradient.type || 'linear'} onChange={(e) => onUpdateObject(primary.id, { fillGradient: { ...primary.fillGradient!, type: e.target.value as 'linear' | 'radial' } }, true)} className="rounded border px-1 py-0.5 text-[10px] dark:bg-slate-900">
                <option value="linear">Linear</option><option value="radial">Radial</option>
              </select>
              <span className="font-mono text-[10px] text-slate-500">{primary.fillGradient.angle}°</span>
            </div>
            {(primary.fillGradient.stops || [
              { color: primary.fillGradient.from, position: 0 },
              { color: primary.fillGradient.to, position: 1 },
            ]).map((stop, index, stops) => (
              <div key={index} className="grid grid-cols-[28px_1fr_24px] items-center gap-1">
                <input aria-label={`Gradient stop ${index + 1} color`} type="color" value={stop.color} onChange={(e) => {
                  const next = stops.map((item, i) => i === index ? { ...item, color: e.target.value } : item);
                  onUpdateObject(primary.id, { fillGradient: { ...primary.fillGradient!, stops: next } }, false);
                }} onBlur={() => onSyncPageState?.()} />
                <input aria-label={`Gradient stop ${index + 1} position`} type="range" min={0} max={100} value={stop.position * 100} onChange={(e) => {
                  const next = stops.map((item, i) => i === index ? { ...item, position: Number(e.target.value) / 100 } : item);
                  onUpdateObject(primary.id, { fillGradient: { ...primary.fillGradient!, stops: next } }, false);
                }} onPointerUp={() => onSyncPageState?.()} />
                {index > 1 && index < stops.length - 1 && <button aria-label={`Remove gradient stop ${index + 1}`} onClick={() => onUpdateObject(primary.id, { fillGradient: { ...primary.fillGradient!, stops: stops.filter((_, i) => i !== index) } }, true)} className="text-slate-500">−</button>}
              </div>
            ))}
            <button onClick={() => {
              const stops = primary.fillGradient!.stops || [{ color: primary.fillGradient!.from, position: 0 }, { color: primary.fillGradient!.to, position: 1 }];
              onUpdateObject(primary.id, { fillGradient: { ...primary.fillGradient!, stops: [...stops, { color: primary.fillGradient!.from, position: 0.5 }].sort((a, b) => a.position - b.position) } }, true);
            }} className="rounded border px-2 py-1 text-[10px]">+ Stop</button>
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={primary.fillGradient.angle}
              onFocus={() => onSnapshotUndo?.()}
              onChange={(e) =>
                onUpdateObject(
                  primary.id,
                  { fillGradient: { ...primary.fillGradient!, angle: Number(e.target.value) } },
                  !onSnapshotUndo
                )
              }
              onPointerUp={() => onSyncPageState?.()}
              className="w-full"
            />
            <div className="flex gap-1">
              {[0, 45, 90, 135, 180].map((ang) => (
                <button
                  key={ang}
                  onClick={() =>
                    onUpdateObject(
                      primary.id,
                      { fillGradient: { ...primary.fillGradient!, angle: ang } },
                      true
                    )
                  }
                  className={`flex-1 py-0.5 text-[10px] font-mono rounded border ${
                    primary.fillGradient!.angle === ang
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200/60 dark:border-slate-700/60'
                  }`}
                >
                  {ang}°
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Unified Typography & Sticky Controls (works both for pre-creation defaults AND selected Text/Sticky)
  const renderRichTypographyControls = (
    mode: 'text-default' | 'sticky-default' | 'selected',
    part: 'all' | 'color' | 'font' | 'box' = 'all'
  ) => {
    const isSticky =
      mode === 'sticky-default' || (mode === 'selected' && primary?.type === 'sticky');

    const curFont =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? primary.fontFamily || (isSticky ? 'DM Sans' : 'Plus Jakarta Sans')
        : isSticky
          ? textDefaults.stickyFontFamily
          : textDefaults.fontFamily;

    const curSize =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? primary.fontSize
        : isSticky
          ? textDefaults.stickyFontSize
          : textDefaults.fontSize;

    const curWeight =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? primary.fontWeight || 'normal'
        : textDefaults.fontWeight;

    const curStyle =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? primary.fontStyle || 'normal'
        : textDefaults.fontStyle;

    const curUnderline =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? Boolean(primary.underline)
        : textDefaults.underline;

    const curStrike =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? Boolean(primary.strikethrough)
        : textDefaults.strikethrough;

    const curAlign: TextAlignMode =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? primary.textAlign || 'left'
        : textDefaults.textAlign;

    const curLineHeight =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? primary.lineHeight || 1.38
        : textDefaults.lineHeight;

    const curHighlight =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? primary.highlightColor
        : textDefaults.highlightColor;

    const curBgColor =
      mode === 'selected' && primary?.type === 'text'
        ? primary.bgColor
        : textDefaults.bgColor;

    const curNoteColor =
      mode === 'selected' && primary?.type === 'sticky'
        ? primary.noteColor
        : textDefaults.noteColor;

    const curNoteStyle =
      mode === 'selected' && primary?.type === 'sticky'
        ? primary.noteStyle || 'folded'
        : textDefaults.noteStyle;

    const updateTypography = (
      patch: Partial<{
        fontFamily: string;
        fontSize: number;
        fontWeight: 'normal' | 'bold';
        fontStyle: 'normal' | 'italic';
        underline: boolean;
        strikethrough: boolean;
        textAlign: TextAlignMode;
        lineHeight: number;
        bgColor: string;
        highlightColor: string | undefined;
        noteColor: string;
        textColor: string;
        noteStyle: 'classic' | 'folded' | 'lined' | 'card';
      }>
    ) => {
      if (mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')) {
        const objPatch: Record<string, unknown> = { ...patch };
        if ('fontWeight' in patch || 'fontStyle' in patch || 'underline' in patch || 'strikethrough' in patch || 'textAlign' in patch || 'highlightColor' in patch) {
          objPatch.richBlocks = applyDefaultStyleToRichBlocks(getEffectiveRichBlocks(primary), {
            ...(patch.fontWeight !== undefined ? { bold: patch.fontWeight === 'bold' } : {}),
            ...(patch.fontStyle !== undefined ? { italic: patch.fontStyle === 'italic' } : {}),
            ...(patch.underline !== undefined ? { underline: patch.underline } : {}),
            ...(patch.strikethrough !== undefined ? { strike: patch.strikethrough } : {}),
            ...(patch.textAlign !== undefined ? { align: patch.textAlign } : {}),
            ...( 'highlightColor' in patch ? { highlight: patch.highlightColor } : {}),
          });
          objPatch.text = richBlocksToPlainText(objPatch.richBlocks as ReturnType<typeof getEffectiveRichBlocks>);
        }
        onUpdateObject(primary.id, objPatch as Partial<BoardObject>, true);
      } else {
        const defPatch: Partial<TextStickyDefaults> = {};
        if (patch.fontFamily !== undefined) {
          if (isSticky) defPatch.stickyFontFamily = patch.fontFamily;
          else defPatch.fontFamily = patch.fontFamily;
        }
        if (patch.fontSize !== undefined) {
          if (isSticky) defPatch.stickyFontSize = patch.fontSize;
          else defPatch.fontSize = patch.fontSize;
        }
        if (patch.fontWeight !== undefined) defPatch.fontWeight = patch.fontWeight;
        if (patch.fontStyle !== undefined) defPatch.fontStyle = patch.fontStyle;
        if (patch.underline !== undefined) defPatch.underline = patch.underline;
        if (patch.strikethrough !== undefined) defPatch.strikethrough = patch.strikethrough;
        if (patch.textAlign !== undefined) defPatch.textAlign = patch.textAlign;
        if (patch.lineHeight !== undefined) defPatch.lineHeight = patch.lineHeight;
        if (patch.bgColor !== undefined) defPatch.bgColor = patch.bgColor;
        if ('highlightColor' in patch) defPatch.highlightColor = patch.highlightColor;
        if (patch.noteColor !== undefined) defPatch.noteColor = patch.noteColor;
        if (patch.textColor !== undefined) defPatch.noteTextColor = patch.textColor;
        if (patch.noteStyle !== undefined) defPatch.noteStyle = patch.noteStyle;
        onChangeTextDefaults(defPatch);
      }
    };

    const currentListType =
      mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky')
        ? (() => {
            const firstPara = getEffectiveRichBlocks(primary).find((b) => b.type === 'paragraph');
            return firstPara?.type === 'paragraph' ? firstPara.listType || 'none' : 'none';
          })()
        : 'none';

    const showColorPart = part === 'all' || part === 'color';
    const showFontPart = part === 'all' || part === 'font';
    const showBoxPart = part === 'all' || part === 'box';

    return (
      <div className="space-y-3.5">
        {showColorPart && renderColorSection(isSticky ? 'Note Text Color' : 'Text Color')}

        {/* Box Background for Text OR Sticky Note Palette & Style */}
        {showColorPart && (!isSticky ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Box Background</span>
              <button
                onClick={() => updateTypography({ bgColor: 'transparent' })}
                className={`text-[11px] ${curBgColor === 'transparent' ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-blue-600'}`}
              >
                Clear
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {BOX_BG_SWATCHES.map((bg) => (
                <button
                  key={bg}
                  onClick={() => updateTypography({ bgColor: bg })}
                  style={{ backgroundColor: bg }}
                  className={`h-6 rounded border ${
                    curBgColor === bg ? 'ring-2 ring-blue-600 border-white' : 'border-slate-200/60 dark:border-slate-700/60'
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="font-semibold text-slate-700 dark:text-slate-300">Sticky Note Color &amp; Style</div>
            <div className="grid grid-cols-4 gap-1">
              {(['classic', 'folded', 'lined', 'card'] as const).map((ns) => (
                <button
                  key={ns}
                  onClick={() => updateTypography({ noteStyle: ns })}
                  className={`py-1 rounded text-[10px] capitalize border ${
                    curNoteStyle === ns
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-900 border-slate-200/60 dark:border-slate-700/60'
                  }`}
                >
                  {ns}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {STICKY_NOTE_COLORS.map((sc) => (
                <button
                  key={sc.bg}
                  title={sc.label}
                  onClick={() => updateTypography({ noteColor: sc.bg, textColor: sc.text })}
                  style={{ backgroundColor: sc.bg }}
                  className={`h-6 rounded border ${
                    curNoteColor === sc.bg ? 'ring-2 ring-blue-600 border-white' : 'border-slate-200/60 dark:border-slate-700/60'
                  }`}
                />
              ))}
            </div>
            {mode === 'selected' && primary?.type === 'sticky' && (
              <>
                <div className="flex items-center justify-between text-[11px] pt-0.5">
                  <span className="text-slate-600 dark:text-slate-300">Task Card Mode</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        onUpdateObject(primary.id, { isTaskCard: !primary.isTaskCard }, true)
                      }
                      className={`px-2 py-0.5 text-[10px] rounded border ${
                        primary.isTaskCard
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      {primary.isTaskCard ? 'Task On' : 'Off'}
                    </button>
                    {primary.isTaskCard && (
                      <button
                        onClick={() =>
                          onUpdateObject(primary.id, { completed: !primary.completed }, true)
                        }
                        className={`px-2 py-0.5 text-[10px] rounded border ${
                          primary.completed
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'border-slate-200/60 dark:border-slate-700/60'
                        }`}
                      >
                        {primary.completed ? 'Done ✓' : 'Mark Done'}
                      </button>
                    )}
                  </div>
                </div>
                <input
                  value={primary.author || ''}
                  onFocus={() => onSnapshotUndo?.()}
                  onChange={(e) => onUpdateObject(primary.id, { author: e.target.value }, !onSnapshotUndo)}
                  onBlur={() => onSyncPageState?.()}
                  placeholder="Author name..."
                  className="w-full px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
                />
                <div className="flex items-center gap-1 flex-wrap">
                  {['👍', '👏', '💡', '❓'].map((emoji) => {
                    const count = primary.reactions?.[emoji] || 0;
                    return (
                      <button
                        key={emoji}
                        onClick={() =>
                          onUpdateObject(
                            primary.id,
                            { reactions: { ...(primary.reactions || {}), [emoji]: count + 1 } },
                            true
                          )
                        }
                        className="px-2 py-0.5 text-[11px] rounded border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:bg-blue-50"
                      >
                        {emoji} {count > 0 ? count : ''}
                      </button>
                    );
                  })}
                  {Object.keys(primary.reactions || {}).length > 0 && (
                    <button
                      onClick={() => onUpdateObject(primary.id, { reactions: {} }, true)}
                      className="px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-red-600 ml-auto"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {/* Font Family (Excalidraw 4 quick styles + Full 10 Fonts dropdown) */}
        {showFontPart && (
          <>
        <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="font-semibold text-slate-700 dark:text-slate-300">Font Family</div>
          <div className="grid grid-cols-4 gap-1">
            {EXCALIDRAW_QUICK_FONTS.map((qf) => (
              <button
                key={qf.category}
                title={qf.label}
                onClick={() => updateTypography({ fontFamily: qf.family })}
                style={{ fontFamily: qf.family }}
                className={`py-1.5 rounded-lg border text-xs font-semibold ${
                  curFont === qf.family
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100'
                }`}
              >
                {qf.icon}
              </button>
            ))}
          </div>
          <select
            value={curFont}
            onChange={(e) => updateTypography({ fontFamily: e.target.value })}
            className="w-full px-2 py-1.5 text-[11px] bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded-lg"
          >
            {FONT_PRESETS.map((fp) => (
              <option key={fp.id} value={fp.family}>
                {fp.label}
              </option>
            ))}
          </select>
        </div>

        {/* Font Size (S / M / L / XL + Custom) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Font Size</span>
            <span className="font-mono text-[11px] text-slate-500">{curSize}px</span>
          </div>
          <div className="flex items-center gap-1">
            {SIZE_PRESETS.map((sp) => (
              <button
                key={sp.key}
                onClick={() => updateTypography({ fontSize: sp.px })}
                className={`flex-1 py-1 rounded border text-[11px] font-semibold ${
                  curSize === sp.px
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {sp.key}
              </button>
            ))}
            <input
              type="number"
              min={10}
              max={96}
              value={curSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n) && n >= 8) updateTypography({ fontSize: n });
              }}
              className="w-12 px-1.5 py-1 font-mono text-[11px] bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
            />
          </div>
        </div>

        {/* Block Headings (P / H1 / H2 / H3) */}
        {mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky') && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Block Style</div>
            <div className="grid grid-cols-4 gap-1">
              {[
                { h: 0 as const, label: 'P' },
                { h: 1 as const, label: 'H1' },
                { h: 2 as const, label: 'H2' },
                { h: 3 as const, label: 'H3' },
              ].map((item) => {
                const firstPara = getEffectiveRichBlocks(primary).find((b) => b.type === 'paragraph');
                const activeHeading = firstPara?.type === 'paragraph' ? firstPara.heading || 0 : 0;
                return (
                  <button
                    key={item.h}
                    onClick={() => {
                      if (isEditingText && richEditorRef?.current) {
                        richEditorRef.current.focus();
                        const blk = getActiveBlockInEditor(richEditorRef.current);
                        if (blk) {
                          blk.dataset.heading = String(item.h);
                          blk.style.fontSize = item.h === 1 ? '1.45em' : item.h === 2 ? '1.25em' : item.h === 3 ? '1.1em' : '1em';
                          blk.style.fontWeight = item.h > 0 ? '700' : 'normal';
                          onSyncRichEditor?.(true);
                          return;
                        }
                      }
                      const blocks = getEffectiveRichBlocks(primary).map((b) =>
                        b.type === 'paragraph' ? { ...b, heading: item.h } : b
                      );
                      onUpdateObject(primary.id, { richBlocks: blocks }, true);
                      if (isEditingText && richEditorRef?.current) {
                        richEditorRef.current.innerHTML = richBlocksToHtml(blocks, curAlign);
                      }
                    }}
                    className={`py-1 rounded border text-[11px] font-bold ${
                      activeHeading === item.h
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Style (B / I / U / S / Clear Formatting) & Text Align + Indent */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => {
                if (mode === 'selected' && isEditingText && richEditorRef?.current && hasHighlightedRangeInEditor()) {
                  richEditorRef.current.focus();
                  document.execCommand('bold', false);
                  onSyncRichEditor?.(true);
                  return;
                }
                const next = curWeight === 'bold' ? 'normal' : 'bold';
                updateTypography({ fontWeight: next });
                if (mode === 'selected' && isEditingText && richEditorRef?.current && primary && (primary.type === 'text' || primary.type === 'sticky')) {
                  const blocks = applyDefaultStyleToRichBlocks(getEffectiveRichBlocks(primary), { bold: next === 'bold' });
                  richEditorRef.current.innerHTML = richBlocksToHtml(blocks, curAlign);
                }
              }}
              title="Bold (Ctrl+B)"
              className={`px-2.5 py-1 rounded border font-bold ${
                curWeight === 'bold' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              B
            </button>
            <button
              onClick={() => {
                if (mode === 'selected' && isEditingText && richEditorRef?.current && hasHighlightedRangeInEditor()) {
                  richEditorRef.current.focus();
                  document.execCommand('italic', false);
                  onSyncRichEditor?.(true);
                  return;
                }
                const next = curStyle === 'italic' ? 'normal' : 'italic';
                updateTypography({ fontStyle: next });
                if (mode === 'selected' && isEditingText && richEditorRef?.current && primary && (primary.type === 'text' || primary.type === 'sticky')) {
                  const blocks = applyDefaultStyleToRichBlocks(getEffectiveRichBlocks(primary), { italic: next === 'italic' });
                  richEditorRef.current.innerHTML = richBlocksToHtml(blocks, curAlign);
                }
              }}
              title="Italic (Ctrl+I)"
              className={`px-2.5 py-1 rounded border italic ${
                curStyle === 'italic' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              I
            </button>
            <button
              onClick={() => {
                if (mode === 'selected' && isEditingText && richEditorRef?.current && hasHighlightedRangeInEditor()) {
                  richEditorRef.current.focus();
                  document.execCommand('underline', false);
                  onSyncRichEditor?.(true);
                  return;
                }
                const next = !curUnderline;
                updateTypography({ underline: next });
                if (mode === 'selected' && isEditingText && richEditorRef?.current && primary && (primary.type === 'text' || primary.type === 'sticky')) {
                  const blocks = applyDefaultStyleToRichBlocks(getEffectiveRichBlocks(primary), { underline: next });
                  richEditorRef.current.innerHTML = richBlocksToHtml(blocks, curAlign);
                }
              }}
              title="Underline (Ctrl+U)"
              className={`px-2.5 py-1 rounded border underline ${
                curUnderline ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              U
            </button>
            <button
              onClick={() => {
                if (mode === 'selected' && isEditingText && richEditorRef?.current && hasHighlightedRangeInEditor()) {
                  richEditorRef.current.focus();
                  document.execCommand('strikeThrough', false);
                  onSyncRichEditor?.(true);
                  return;
                }
                const next = !curStrike;
                updateTypography({ strikethrough: next });
                if (mode === 'selected' && isEditingText && richEditorRef?.current && primary && (primary.type === 'text' || primary.type === 'sticky')) {
                  const blocks = applyDefaultStyleToRichBlocks(getEffectiveRichBlocks(primary), { strike: next });
                  richEditorRef.current.innerHTML = richBlocksToHtml(blocks, curAlign);
                }
              }}
              title="Strikethrough"
              className={`px-2.5 py-1 rounded border line-through ${
                curStrike ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              S
            </button>
            {mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky') && (
              <button
                onClick={() => {
                  if (isEditingText && richEditorRef?.current && hasHighlightedRangeInEditor()) {
                    richEditorRef.current.focus();
                    document.execCommand('removeFormat', false);
                    onSyncRichEditor?.(true);
                    return;
                  }
                  const cleared = applyDefaultStyleToRichBlocks(getEffectiveRichBlocks(primary), { clearAll: true });
                  if (isEditingText && richEditorRef?.current) {
                    richEditorRef.current.innerHTML = richBlocksToHtml(cleared, 'left');
                  }
                  onUpdateObject(
                    primary.id,
                    {
                      fontWeight: 'normal',
                      fontStyle: 'normal',
                      underline: false,
                      strikethrough: false,
                      highlightColor: undefined,
                      textAlign: 'left',
                      richBlocks: cleared,
                      text: richBlocksToPlainText(cleared),
                    },
                    true
                  );
                }}
                title="Clear Formatting"
                className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800 ml-auto"
              >
                <RemoveFormatting className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <div className="grid grid-cols-4 gap-1 flex-1">
              {(
                [
                  { id: 'left', icon: AlignLeft, label: 'Left' },
                  { id: 'center', icon: AlignCenter, label: 'Center' },
                  { id: 'right', icon: AlignRight, label: 'Right' },
                  { id: 'justify', icon: AlignJustify, label: 'Justify' },
                ] as const
              ).map((al) => {
                const Icon = al.icon;
                return (
                  <button
                    key={al.id}
                    onClick={() => {
                      if (mode === 'selected' && isEditingText && richEditorRef?.current) {
                        richEditorRef.current.focus();
                        const blk = getActiveBlockInEditor(richEditorRef.current);
                        if (blk) {
                          blk.style.textAlign = al.id;
                          onSyncRichEditor?.(false);
                        }
                      }
                      updateTypography({ textAlign: al.id });
                    }}
                    title={`Align ${al.label}`}
                    className={`py-1.5 flex items-center justify-center rounded border ${
                      curAlign === al.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
            {mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky') && (
              <>
                <button
                  onClick={() => {
                    if (isEditingText && richEditorRef?.current) {
                      richEditorRef.current.focus();
                      const blk = getActiveBlockInEditor(richEditorRef.current);
                      if (blk) {
                        const cur = Number(blk.dataset.indent || 0);
                        const next = Math.max(0, cur - 1);
                        blk.dataset.indent = String(next);
                        blk.style.paddingLeft = `${next * 20}px`;
                        onSyncRichEditor?.(true);
                        return;
                      }
                    }
                    const blocks = getEffectiveRichBlocks(primary).map((b) =>
                      b.type === 'paragraph' ? { ...b, indent: Math.max(0, (b.indent || 0) - 1) } : b
                    );
                    onUpdateObject(primary.id, { richBlocks: blocks, text: richBlocksToPlainText(blocks) }, true);
                  }}
                  title="Decrease Indent"
                  className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <IndentDecrease className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (isEditingText && richEditorRef?.current) {
                      richEditorRef.current.focus();
                      const blk = getActiveBlockInEditor(richEditorRef.current);
                      if (blk) {
                        const cur = Number(blk.dataset.indent || 0);
                        const next = Math.min(5, cur + 1);
                        blk.dataset.indent = String(next);
                        blk.style.paddingLeft = `${next * 20}px`;
                        onSyncRichEditor?.(true);
                        return;
                      }
                    }
                    const blocks = getEffectiveRichBlocks(primary).map((b) =>
                      b.type === 'paragraph' ? { ...b, indent: Math.min(5, (b.indent || 0) + 1) } : b
                    );
                    onUpdateObject(primary.id, { richBlocks: blocks, text: richBlocksToPlainText(blocks) }, true);
                  }}
                  title="Increase Indent"
                  className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <IndentIncrease className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* List Formatting & Table Insertion when selected */}
        {mode === 'selected' && primary && (primary.type === 'text' || primary.type === 'sticky') && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">List Format</div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: 'none' as const, label: 'Text', icon: Type },
                  { id: 'bullet' as const, label: 'Bullets', icon: List },
                  { id: 'number' as const, label: '1,2,3', icon: ListOrdered },
                  { id: 'check' as const, label: 'Tasks', icon: CheckSquare },
                ].map((lt) => {
                  const Icon = lt.icon;
                  return (
                    <button
                      key={lt.id}
                      onClick={() => {
                        const editor = richEditorRef?.current;
                        const currentBlocks =
                          isEditingText && editor ? htmlToRichBlocks(editor) : getEffectiveRichBlocks(primary);
                        const activeBlk = isEditingText && editor ? getActiveBlockInEditor(editor) : null;
                        const activeIdx = activeBlk && editor ? Array.from(editor.children).indexOf(activeBlk) : -1;
                        const allMatch = currentBlocks.every((b) => b.type !== 'paragraph' || b.listType === lt.id);
                        const nextListType: 'none' | 'bullet' | 'number' | 'check' =
                          lt.id === 'none' ? 'none' : allMatch && activeIdx === -1 ? 'none' : lt.id;

                        const nextBlocks = currentBlocks.map((b, idx) => {
                          if (b.type !== 'paragraph') return b;
                          if (activeIdx === -1 || activeIdx === idx) {
                            const toggled: 'none' | 'bullet' | 'number' | 'check' =
                              b.listType === lt.id ? 'none' : nextListType;
                            return {
                              ...b,
                              listType: toggled,
                              checked: toggled === 'check' ? Boolean(b.checked) : undefined,
                            };
                          }
                          return b;
                        });
                        if (isEditingText && editor) {
                          editor.innerHTML = richBlocksToHtml(nextBlocks, curAlign);
                          editor.focus();
                        }
                        onUpdateObject(
                          primary.id,
                          { richBlocks: nextBlocks, text: richBlocksToPlainText(nextBlocks) },
                          true
                        );
                      }}
                      className={`py-1 flex items-center justify-center gap-1 rounded border text-[10px] ${
                        currentListType === lt.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{lt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Line Spacing */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Line Spacing</span>
          <div className="flex gap-1">
            {[
              { label: 'Tight', val: 1.15 },
              { label: 'Normal', val: 1.38 },
              { label: 'Loose', val: 1.7 },
            ].map((lh) => (
              <button
                key={lh.label}
                onClick={() => updateTypography({ lineHeight: lh.val })}
                className={`px-2 py-0.5 rounded border text-[10px] ${
                  Math.abs(curLineHeight - lh.val) < 0.05
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-200/60 dark:border-slate-700/60'
                }`}
              >
                {lh.label}
              </button>
            ))}
          </div>
        </div>

        {/* Highlight Color */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-600 dark:text-slate-400">Highlight Color</div>
          <div className="flex items-center gap-1 flex-wrap">
            {HIGHLIGHT_SWATCHES.map((h) => (
              <button
                key={h.label}
                title={h.label}
                onClick={() => {
                  if (mode === 'selected' && isEditingText && richEditorRef?.current && hasHighlightedRangeInEditor()) {
                    richEditorRef.current.focus();
                    document.execCommand('styleWithCSS', false, 'true');
                    document.execCommand('hiliteColor', false, h.value === 'transparent' ? 'rgba(0,0,0,0)' : h.value);
                    onSyncRichEditor?.(true);
                    return;
                  }
                  const hl = h.value === 'transparent' ? undefined : h.value;
                  updateTypography({ highlightColor: hl });
                  if (mode === 'selected' && isEditingText && richEditorRef?.current && primary && (primary.type === 'text' || primary.type === 'sticky')) {
                    const blocks = applyDefaultStyleToRichBlocks(getEffectiveRichBlocks(primary), { highlight: hl });
                    richEditorRef.current.innerHTML = richBlocksToHtml(blocks, curAlign);
                  }
                }}
                style={{ backgroundColor: h.value === 'transparent' ? '#FFFFFF' : h.value }}
                className={`w-5 h-5 rounded border text-[10px] flex items-center justify-center ${
                  (h.value === 'transparent' ? !curHighlight : curHighlight === h.value)
                    ? 'ring-2 ring-blue-600 border-white'
                    : 'border-slate-200/60 dark:border-slate-700/60'
                }`}
              >
                {h.value === 'transparent' ? '×' : ''}
              </button>
            ))}
          </div>
        </div>
          </>
        )}

        {/* Text Box Frame, Border, Corner Radius & Padding */}
        {showBoxPart && !isSticky && (
          <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="font-semibold text-slate-700 dark:text-slate-300">Box Border &amp; Padding</div>
            {(() => {
              const curBorderW =
                mode === 'selected' && primary?.type === 'text'
                  ? primary.borderWidth || 0
                  : textDefaults.borderWidth || 0;
              const curBorderColor =
                mode === 'selected' && primary?.type === 'text'
                  ? primary.borderColor || '#CBD5E1'
                  : textDefaults.borderColor || '#CBD5E1';
              const curRadius =
                mode === 'selected' && primary?.type === 'text'
                  ? primary.borderRadius ?? 8
                  : textDefaults.borderRadius ?? 8;
              const curPad =
                mode === 'selected' && primary?.type === 'text'
                  ? primary.padding ?? 10
                  : textDefaults.padding ?? 10;
              const patchBox = (p: Partial<{ borderWidth: number; borderColor: string; borderRadius: number; padding: number }>) => {
                if (mode === 'selected' && primary?.type === 'text') {
                  onUpdateObject(primary.id, p, true);
                } else {
                  onChangeTextDefaults(p);
                }
              };
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-slate-500">Border</span>
                      <input
                        type="color"
                        value={curBorderColor}
                        onChange={(e) => patchBox({ borderColor: e.target.value, borderWidth: curBorderW || 2 })}
                        className="w-6 h-5 rounded border border-slate-200/60 dark:border-slate-700/60 cursor-pointer"
                      />
                    </label>
                    <div className="flex items-center gap-1">
                      {[0, 1, 2, 4].map((bw) => (
                        <button
                          key={bw}
                          onClick={() => patchBox({ borderWidth: bw, borderColor: curBorderColor })}
                          className={`px-1.5 py-0.5 text-[10px] rounded border font-mono ${
                            curBorderW === bw
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-slate-200/60 dark:border-slate-700/60'
                          }`}
                        >
                          {bw === 0 ? 'None' : `${bw}px`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Radius</span>
                        <span className="font-mono">{curRadius}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={32}
                        value={curRadius}
                        onChange={(e) => patchBox({ borderRadius: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Padding</span>
                        <span className="font-mono">{curPad}px</span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={28}
                        value={curPad}
                        onChange={(e) => patchBox({ padding: Number(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {(part === 'all' || part === 'box' || (isSticky && part === 'font')) && (
          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60">{renderOpacityControl()}</div>
        )}
      </div>
    );
  };

  const renderPageGridSection = () => (
    <div className="space-y-2.5">
      {activeTool === 'select' && onChangePreciseSelection && (
        <label className="flex items-center justify-between gap-2 text-[11px]">
          <span>Precise selection</span>
          <input
            type="checkbox"
            checked={preciseSelection}
            onChange={(e) => onChangePreciseSelection(e.target.checked)}
          />
        </label>
      )}
      {onUpdatePage ? (
        <>
          {layoutMode === 'full' && (
            <div className="font-semibold text-slate-700 dark:text-slate-300">Page &amp; Grid Style</div>
          )}
          <input
            value={page.name}
            disabled={!canEdit}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) => onUpdatePage(page.id, { name: e.target.value }, !onSnapshotUndo)}
            onBlur={() => onSyncPageState?.()}
            placeholder="Page name"
            className="w-full px-2 py-1 text-[11px] bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
          />
          <div className="flex items-center gap-1.5">
            {['#FFFFFF', '#F8FAFC', '#FEFCE8', '#EFF6FF', '#0F172A'].map((bg) => (
              <button
                key={bg}
                type="button"
                disabled={!canEdit}
                aria-label={`Set page background ${bg}`}
                onClick={() => onUpdatePage(page.id, { background: bg })}
                style={{ backgroundColor: bg }}
                className={`w-6 h-6 rounded border ${
                  page.background === bg ? 'ring-2 ring-blue-600 border-white' : 'border-slate-200/60 dark:border-slate-700/60'
                }`}
              />
            ))}
            <input
              type="color"
              value={page.background || '#FFFFFF'}
              disabled={!canEdit}
              aria-label="Custom page background"
              onChange={(e) => onUpdatePage(page.id, { background: e.target.value })}
              className="w-7 h-6 rounded cursor-pointer border border-slate-300 ml-auto"
            />
          </div>

          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { id: 'none', label: 'Plain' },
                { id: 'dots', label: 'Dots' },
                { id: 'lines', label: 'Lines' },
                { id: 'graph', label: 'Graph' },
                { id: 'engineering', label: 'Eng' },
                { id: 'isometric', label: 'Iso' },
                { id: 'ruled', label: 'Ruled' },
              ] as { id: GridType; label: string }[]
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={!canEdit}
                onClick={() => onUpdatePage(page.id, { gridType: g.id })}
                className={`py-1 rounded border text-[10px] ${
                  page.gridType === g.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {page.gridType !== 'none' && (
            <div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Grid Spacing</span>
                <span className="font-mono">{page.gridSize || 28}px</span>
              </div>
              <input
                type="range"
                disabled={!canEdit}
                min={12}
                max={64}
                step={2}
                value={page.gridSize || 28}
                onChange={(e) => onUpdatePage(page.id, { gridSize: Number(e.target.value) })}
                className="w-full"
              />
              {primary.shapeKind === 'polygon' && (
                <>
                  <button onClick={() => {
                    const current = primary.polygonVertices || Array.from({ length: primary.polygonSides || 8 }, (_, i) => ({ x: 50 + 46 * Math.cos((i / (primary.polygonSides || 8)) * Math.PI * 2 - Math.PI / 2), y: 50 + 46 * Math.sin((i / (primary.polygonSides || 8)) * Math.PI * 2 - Math.PI / 2) }));
                    onUpdateObject(primary.id, { polygonVertices: [...current, { x: 50, y: 50 }] }, true);
                  }} className="rounded border px-2 py-1 text-[10px]">+ Vertex</button>
                  {primary.polygonVertices?.map((vertex, index) => (
                    <div key={index} className="grid grid-cols-[24px_1fr_1fr_24px] items-center gap-1">
                      <span className="text-[9px] text-slate-500">{index + 1}</span>
                      <input aria-label={`Vertex ${index + 1} X`} type="number" min={0} max={100} value={Math.round(vertex.x)} onChange={(e) => onUpdateObject(primary.id, { polygonVertices: primary.polygonVertices!.map((point, i) => i === index ? { ...point, x: Number(e.target.value) } : point) }, false)} className="w-full rounded border px-1 py-0.5 text-[10px] dark:bg-slate-900" />
                      <input aria-label={`Vertex ${index + 1} Y`} type="number" min={0} max={100} value={Math.round(vertex.y)} onChange={(e) => onUpdateObject(primary.id, { polygonVertices: primary.polygonVertices!.map((point, i) => i === index ? { ...point, y: Number(e.target.value) } : point) }, false)} className="w-full rounded border px-1 py-0.5 text-[10px] dark:bg-slate-900" />
                      <button aria-label={`Remove vertex ${index + 1}`} onClick={() => onUpdateObject(primary.id, { polygonVertices: primary.polygonVertices!.filter((_, i) => i !== index) }, true)} className="text-xs text-slate-500">−</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-[11px] text-slate-500">Page properties unavailable.</div>
      )}
    </div>
  );

  const renderPenBrushTypeSection = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="font-semibold text-slate-700 dark:text-slate-300">Brush Type</div>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              { id: 'pen', label: 'Pen' },
              { id: 'pencil', label: 'Pencil' },
              { id: 'brush', label: 'Brush' },
              { id: 'marker', label: 'Marker' },
              { id: 'calligraphy', label: 'Calligraphy' },
              { id: 'fountain', label: 'Fountain' },
            ] as const
          ).map((bt) => (
            <button
              key={bt.id}
              onClick={() => onSetActiveTool(bt.id)}
              className={`py-1.5 px-2 rounded border text-[11px] font-medium ${
                activeTool === bt.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {bt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="font-semibold text-slate-700 dark:text-slate-300">Tip Presets</div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: 'Fine', w: 2 },
            { label: 'Med', w: 4 },
            { label: 'Bold', w: 8 },
            { label: 'Thick', w: 16 },
          ].map((pr) => (
            <button
              key={pr.w}
              onClick={() => onChangeStrokeWidth(pr.w)}
              className={`py-1 rounded border text-[10px] font-medium ${
                strokeWidth === pr.w
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {pr.label} · {pr.w}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderLineTypeSection = () => (
    <div className="space-y-2">
      {layoutMode === 'full' && (
        <div className="font-semibold text-slate-700 dark:text-slate-300">Line &amp; Arrow Type</div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            { id: 'line', label: 'Straight Line' },
            { id: 'curved_line', label: 'Curved Line' },
            { id: 'polyline', label: 'Polyline' },
            { id: 'arrow', label: 'Arrow' },
            { id: 'double_arrow', label: 'Double Arrow' },
          ] as const
        ).map((lt) => (
          <button
            key={lt.id}
            onClick={() => onSetActiveTool(lt.id)}
            className={`py-1.5 px-2 rounded border text-[11px] font-medium text-left ${
              activeTool === lt.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {lt.label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderTableMenuSection = () => (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-700 dark:text-slate-300">Size</span>
        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
          {tableHoverSize.r} × {tableHoverSize.c}
        </span>
      </div>
      <div
        className="grid grid-cols-6 gap-1"
        onMouseLeave={() => setTableHoverSize({ r: 3, c: 3 })}
      >
        {Array.from({ length: 6 }, (_, rIdx) =>
          Array.from({ length: 6 }, (_, cIdx) => {
            const r = rIdx + 1;
            const c = cIdx + 1;
            const highlighted = r <= tableHoverSize.r && c <= tableHoverSize.c;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                aria-label={`Insert ${r} by ${c} table`}
                onMouseEnter={() => setTableHoverSize({ r, c })}
                onClick={() => {
                  onInsertBoardTable?.(r, c);
                  setActivePopoverId(null);
                  onClearRightPanelMenu?.();
                }}
                className={`h-6 rounded border transition-colors ${
                  highlighted
                    ? 'bg-blue-500/25 border-blue-600 dark:bg-blue-500/35 dark:border-blue-400'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                }`}
              />
            );
          })
        )}
      </div>
      <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
        {[
          [2, 2],
          [3, 3],
          [4, 4],
          [5, 4],
        ].map(([r, c]) => (
          <button
            key={`${r}x${c}`}
            type="button"
            onClick={() => {
              onInsertBoardTable?.(r, c);
              setActivePopoverId(null);
              onClearRightPanelMenu?.();
            }}
            className="py-1 text-[10px] font-mono rounded border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
          >
            {r}×{c}
          </button>
        ))}
      </div>
    </div>
  );

  const renderDiagramsMenuSection = () => (
    <div className="space-y-2.5">
      {onAutoLayoutDiagram && (
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => {
              onAutoLayoutDiagram('LR');
              setActivePopoverId(null);
              onClearRightPanelMenu?.();
            }}
            className="py-1.5 text-[10px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Auto L→R
          </button>
          <button
            onClick={() => {
              onAutoLayoutDiagram('TB');
              setActivePopoverId(null);
              onClearRightPanelMenu?.();
            }}
            className="py-1.5 text-[10px] font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Auto T→B
          </button>
          <button
            onClick={() => {
              onAutoLayoutDiagram('radial');
              setActivePopoverId(null);
              onClearRightPanelMenu?.();
            }}
            className="py-1.5 text-[10px] font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700"
          >
            Radial
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto scrollbar-none pr-0.5">
        {DIAGRAM_TYPES.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              onInsertDiagram?.(centerDiagramObjectsAt(buildDiagramStarter(d.id as DiagramType), viewportCenter));
              setActivePopoverId(null);
              onClearRightPanelMenu?.();
            }}
            className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left text-[11px]"
          >
            <div className="font-medium truncate">{d.label}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderGeometryMenuSection = () => (
    <div className="space-y-2">
      {layoutMode === 'full' && (
        <div className="font-semibold text-slate-700 dark:text-slate-300">Geometry Instruments</div>
      )}
      <div className="space-y-1">
        {[
          { kind: 'ruler' as const, label: 'Ruler', icon: Ruler },
          { kind: 'protractor' as const, label: 'Protractor', icon: Compass },
          { kind: 'compass' as const, label: 'Compass', icon: Compass },
          { kind: 'set_square' as const, label: 'Set Square', icon: Triangle },
        ].map((gi) => {
          const GIcon = gi.icon;
          const active = instruments.some((i) => i.kind === gi.kind && i.visible);
          return (
            <button
              key={gi.kind}
              onClick={() => onToggleInstrument?.(gi.kind)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] rounded-lg border ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <GIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{gi.label}</span>
              </span>
              {active && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          );
        })}
      </div>
      {instruments.some((i) => i.visible) && onHideAllInstruments && (
        <button
          onClick={onHideAllInstruments}
          className="w-full py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Hide All
        </button>
      )}
    </div>
  );

  const renderMathMenuSection = () => (
    <div className="space-y-1.5">
      <button
        onClick={() => {
          onOpenMathOrGraph?.('equation');
          setActivePopoverId(null);
          onClearRightPanelMenu?.();
        }}
        className="w-full flex items-center gap-2 text-left px-2.5 py-2 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <FunctionSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span>Equation (LaTeX)</span>
      </button>
      <button
        onClick={() => {
          onOpenMathOrGraph?.('graph');
          setActivePopoverId(null);
          onClearRightPanelMenu?.();
        }}
        className="w-full flex items-center gap-2 text-left px-2.5 py-2 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <LineChart className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Function Grapher f(x)</span>
      </button>
      <button
        onClick={() => {
          onOpenMathOrGraph?.('science');
          setActivePopoverId(null);
          onClearRightPanelMenu?.();
        }}
        className="w-full flex items-center gap-2 text-left px-2.5 py-2 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Sparkles className="w-3.5 h-3.5 text-violet-600 shrink-0" />
        <span>Physics &amp; Chem Presets</span>
      </button>
      {onQuickAIAction && (
        <button
          onClick={() => {
            onQuickAIAction('math_solve');
            setActivePopoverId(null);
            onClearRightPanelMenu?.();
          }}
          className="w-full flex items-center gap-2 text-left px-2.5 py-2 text-[11px] font-medium rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/50"
        >
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>AI Solve Drawn Math</span>
        </button>
      )}
    </div>
  );

  const renderHighlighterColorSection = () => (
    <div className="space-y-2.5">
      <div className="grid grid-cols-6 gap-1.5">
        {['#FACC15', '#4ADE80', '#38BDF8', '#F472B6', '#FB923C', '#C084FC'].map((hc) => (
          <button
            key={hc}
            onClick={() => onChangeStrokeColor(hc)}
            style={{ backgroundColor: hc }}
            className={`h-7 rounded-lg border ${
              strokeColor.toUpperCase() === hc ? 'ring-2 ring-blue-600 border-white' : 'border-slate-200/60 dark:border-slate-700/60'
            }`}
          />
        ))}
      </div>
      {renderColorSection('Custom')}
    </div>
  );

  const renderHighlighterWidthSection = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Tip Width</span>
          <span className="font-mono">{strokeWidth}px</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[10, 16, 24, 32].map((w) => (
            <button
              key={w}
              onClick={() => onChangeStrokeWidth(w)}
              className={`py-1 text-[11px] rounded border ${
                strokeWidth === w ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>
        <input
          type="range"
          min={6}
          max={40}
          value={strokeWidth}
          onChange={(e) => onChangeStrokeWidth(Number(e.target.value))}
          className="w-full"
        />
      </div>
      {renderOpacityControl()}
    </div>
  );

  const renderLaserSection = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="font-semibold text-slate-700 dark:text-slate-300">Beam Color</div>
        <div className="grid grid-cols-5 gap-1.5">
          {['#EF4444', '#2563EB', '#10B981', '#8B5CF6', '#F59E0B'].map((lc) => (
            <button
              key={lc}
              onClick={() => onChangeStrokeColor(lc)}
              style={{ backgroundColor: lc }}
              className={`h-7 rounded-lg border ${
                strokeColor.toUpperCase() === lc ? 'ring-2 ring-slate-900 dark:ring-white' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span>Dot Size</span>
          <span className="font-mono">{strokeWidth}px</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[4, 8, 14, 20].map((w) => (
            <button
              key={w}
              onClick={() => onChangeStrokeWidth(w)}
              className={`py-1 text-[11px] rounded border ${
                strokeWidth === w ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPenSmoothingSection = () => (
    <div className="space-y-2.5">
      <div>
        <div className="flex justify-between mb-1">
          <span>Smoothing</span>
          <span className="font-mono">{smoothing}</span>
        </div>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={smoothing}
          onChange={(e) => onChangeSmoothing(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[11px]">Stabilization</span>
          <select
            aria-label="Stabilization mode"
            value={stabilization <= 0.05 ? 'off' : stabilization < 0.4 ? 'basic' : stabilization < 0.75 ? 'weighted' : 'stabilizer'}
            onChange={(e) => onChangeStabilization(({ off: 0, basic: 0.3, weighted: 0.6, stabilizer: 1 } as const)[e.target.value as 'off' | 'basic' | 'weighted' | 'stabilizer'])}
            className="px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-900"
          >
            <option value="off">Off</option>
            <option value="basic">Basic</option>
            <option value="weighted">Weighted</option>
            <option value="stabilizer">Stabilizer</option>
          </select>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={stabilization}
          onChange={(e) => onChangeStabilization(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <label className="flex items-center justify-between cursor-pointer">
        <span>Auto Smart Shape</span>
        <input type="checkbox" checked={autoSmartShape} onChange={onToggleAutoSmartShape} />
      </label>
    </div>
  );

  const renderEraserModeSection = () => (
    <div className="space-y-2">
      <div className="font-semibold text-slate-700 dark:text-slate-300">Mode</div>
      <div className="grid grid-cols-3 gap-1">
        {(
          [
            { id: 'stroke', title: 'Stroke' },
            { id: 'object', title: 'Object' },
            { id: 'area', title: 'Area' },
          ] as const
        ).map((em) => (
          <button
            key={em.id}
            onClick={() => onChangeEraserMode(em.id)}
            className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium ${
              eraserMode === em.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {em.title}
          </button>
        ))}
      </div>
      {canEdit && page.objects.length > 0 && (onClearPageInk || onClearPageAll) && (
        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
          {onClearPageInk && (
            <button
              onClick={onClearPageInk}
              className="py-1.5 px-2 text-[11px] font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              Clear Ink
            </button>
          )}
          {onClearPageAll && (
            <button
              onClick={onClearPageAll}
              className="py-1.5 px-2 text-[11px] font-medium text-rose-600 border border-rose-300 dark:border-rose-800 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              Clear Page
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderEraserSizeSection = () => (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="font-semibold text-slate-700 dark:text-slate-300">Size</span>
        <span className="font-mono">{eraserSize}px</span>
      </div>
      <input
        type="range"
        min={6}
        max={48}
        value={eraserSize}
        onChange={(e) => onChangeEraserSize(Number(e.target.value))}
        className="w-full"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <select value={eraserSettings.shape} onChange={(e) => onChangeEraserSettings({ shape: e.target.value as EraserSettings['shape'] })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-900">
          <option value="circle">Circle</option><option value="square">Square</option>
        </select>
        <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-[11px] dark:border-slate-700">
          <input type="checkbox" checked={eraserSettings.selectedLayerOnly} onChange={(e) => onChangeEraserSettings({ selectedLayerOnly: e.target.checked })} />
          Layer only
        </label>
        <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-[11px] dark:border-slate-700">
          <input type="checkbox" checked={eraserSettings.insideSelection} onChange={(e) => onChangeEraserSettings({ insideSelection: e.target.checked })} />
          Selection only
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-slate-500">Hardness
          <input aria-label="Eraser hardness" type="range" min={0} max={100} value={eraserSettings.hardness} onChange={(e) => onChangeEraserSettings({ hardness: Number(e.target.value) })} className="w-full" />
        </label>
        <label className="text-[10px] text-slate-500">Opacity
          <input aria-label="Eraser opacity" type="range" min={0} max={100} value={eraserSettings.opacity} onChange={(e) => onChangeEraserSettings({ opacity: Number(e.target.value) })} className="w-full" />
        </label>
      </div>
      <div className="flex items-center justify-center py-2.5 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
        <div
          style={{ width: eraserSize, height: eraserSize, opacity: eraserSettings.opacity / 100 }}
          className={`${eraserSettings.shape === 'circle' ? 'rounded-full' : 'rounded-sm'} border-2 border-blue-600 bg-blue-600/15`}
        />
      </div>
    </div>
  );

  const renderFramePresetsSection = () => (
    <div className="space-y-2">
      {layoutMode === 'full' && (
        <div className="font-semibold text-slate-700 dark:text-slate-300">Frame Presets</div>
      )}
      {onInsertSectionFrame && (
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: '16:9 Slide', w: 640, h: 360, title: 'Slide Section' },
            { label: '4:3 Board', w: 480, h: 360, title: 'Board Group' },
            { label: 'Square', w: 360, h: 360, title: 'Topic Area' },
            { label: 'Banner', w: 720, h: 200, title: 'Header Section' },
          ].map((fp) => (
            <button
              key={fp.label}
              onClick={() => onInsertSectionFrame(fp.w, fp.h, fp.title)}
              className="py-1.5 px-2 rounded border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:border-blue-600 text-[10px] font-medium text-left truncate"
            >
              {fp.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderShapeCatalogPicker = (
    selectedKind: ShapeKind,
    onPick: (kind: ShapeKind) => void
  ) => {
    const filtered =
      shapeCategory === 'all'
        ? SHAPE_CATALOG
        : SHAPE_CATALOG.filter((s) => s.category === shapeCategory);
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'basic', label: 'Basic' },
              { id: 'arrows', label: 'Arrows' },
              { id: 'flow', label: 'Flow' },
              { id: 'math', label: '3D' },
              { id: 'circuit', label: 'Circuit' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setShapeCategory(cat.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shrink-0 ${
                shapeCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1 max-h-44 overflow-y-auto scrollbar-none pr-0.5">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              title={s.label}
              aria-label={s.label}
              className={`h-8 rounded-lg border flex items-center justify-center transition-colors ${
                selectedKind === s.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <ShapeGlyph kind={s.id} className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderShapeToolLibraryDefaultsSection = () => (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <ShapeGlyph kind={activeShapeKind} className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-[11px] font-medium capitalize truncate">{activeShapeKind.replace(/_/g, ' ')}</span>
      </div>
      {renderShapeCatalogPicker(activeShapeKind, onSelectShapeKind)}
      {(onChangeShapeCornerRadius || onToggleShapeShadow) && (
        <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
          {onChangeShapeCornerRadius && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span>Corner Radius</span>
                <span className="font-mono">{shapeCornerRadius}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                value={shapeCornerRadius}
                onChange={(e) => onChangeShapeCornerRadius(Number(e.target.value))}
                className="w-full"
              />
            </div>
          )}
          {onToggleShapeShadow && (
            <div className="flex items-center justify-between">
              <span>Drop Shadow</span>
              <button
                onClick={onToggleShapeShadow}
                className={`px-2.5 py-1 text-[11px] rounded border ${
                  shapeShadow ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
                }`}
              >
                {shapeShadow ? 'On' : 'Off'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderDefaultLineCapsSection = () => (
    <div className="space-y-2">
      {layoutMode === 'full' && (
        <div className="font-semibold text-slate-700 dark:text-slate-300">Arrowheads</div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-0.5">
          <span className="text-[10px] text-slate-500">Start</span>
          <select
            value={lineStartHead}
            onChange={(e) => onChangeLineStartHead?.(e.target.value as LineEndpointStyle)}
            className="w-full px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-950"
          >
            <option value="none">None</option>
            <option value="arrow">Arrow</option>
            <option value="dot">Dot</option>
            <option value="diamond">Diamond</option>
            <option value="triangle">Triangle</option>
            <option value="open_arrow">Open arrow</option>
            <option value="bar">Bar</option>
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[10px] text-slate-500">End</span>
          <select
            value={lineEndHead}
            onChange={(e) => onChangeLineEndHead?.(e.target.value as LineEndpointStyle)}
            className="w-full px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-950"
          >
            <option value="none">None</option>
            <option value="arrow">Arrow</option>
            <option value="dot">Dot</option>
            <option value="diamond">Diamond</option>
            <option value="triangle">Triangle</option>
            <option value="open_arrow">Open arrow</option>
            <option value="bar">Bar</option>
          </select>
        </label>
      </div>
    </div>
  );

  const renderDefaultConnectorSection = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="font-semibold text-slate-700 dark:text-slate-300">Default Route Style</div>
        <div className="grid grid-cols-3 gap-1">
          {(['curved', 'orthogonal', 'straight'] as const).map((rt) => (
            <button
              key={rt}
              onClick={() => onChangeConnectorRouteType?.(rt)}
              className={`py-1.5 rounded border text-[11px] capitalize ${
                connectorRouteType === rt
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {rt}
            </button>
          ))}
        </div>
      </div>
      {(onChangeLineStartHead || onChangeLineEndHead) && renderDefaultLineCapsSection()}
    </div>
  );

  const renderSelectedShapeTypeAndGeomSection = () => {
    if (!primary || primary.type !== 'shape') return null;
    const booleanSources = selectedObjects.filter((o): o is Extract<BoardObject, { type: 'shape' }> => o.type === 'shape' && Boolean(o.customPath));
    const applyBoolean = (operation: 'union' | 'subtract' | 'intersect' | 'exclude') => {
      if (booleanSources.length < 2) return;
      const source = booleanSources[0];
      const paths = booleanSources.flatMap((shape) => shape.booleanPaths?.length
        ? shape.booleanPaths
        : [{ d: shape.customPath || '', viewBox: shape.customPathViewBox || [0, 0, 100, 100] as [number, number, number, number] }]);
      onUpdateObject(source.id, { shapeKind: 'custom', booleanOperation: operation, booleanPaths: paths }, true);
      onDeleteObjects(booleanSources.slice(1).map((shape) => shape.id));
    };
    return (
      <div className="space-y-3">
        {booleanSources.length > 1 && (
          <div className="grid grid-cols-4 gap-1">
            {(['union', 'subtract', 'intersect', 'exclude'] as const).map((operation) => (
              <button key={operation} onClick={() => applyBoolean(operation)} className="rounded border border-slate-200 px-1 py-1 text-[9px] capitalize hover:border-blue-400 dark:border-slate-700">{operation}</button>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          {layoutMode === 'full' && (
            <div className="font-semibold text-slate-700 dark:text-slate-300">Shape Type</div>
          )}
          {renderShapeCatalogPicker(primary.shapeKind, (kind) => {
            onUpdateObject(primary.id, { shapeKind: kind, name: kind.replace(/_/g, ' ') }, true);
            onSelectShapeKind(kind);
          })}
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:text-slate-300">
            Import SVG shape
            <input type="file" accept="image/svg+xml,.svg" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const xml = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
              if (xml.querySelector('parsererror')) return;
              const path = xml.querySelector('path[d]');
              if (!path) return;
              const rawBox = (xml.documentElement.getAttribute('viewBox') || '0 0 100 100').trim().split(/[ ,]+/).map(Number);
              const viewBox: [number, number, number, number] = rawBox.length === 4 && rawBox.every(Number.isFinite) ? [rawBox[0], rawBox[1], Math.max(1, rawBox[2]), Math.max(1, rawBox[3])] : [0, 0, 100, 100];
              onUpdateObject(primary.id, { shapeKind: 'custom', customPath: path.getAttribute('d') || '', customPathViewBox: viewBox, name: file.name.replace(/\.svg$/i, '') }, true);
            }} />
          </label>
          {primary.customPath && (
            <textarea aria-label="Editable SVG path" value={primary.customPath} onChange={(e) => onUpdateObject(primary.id, { customPath: e.target.value }, false)} onBlur={() => onSyncPageState?.()} rows={2} className="w-full resize-y rounded border px-2 py-1 font-mono text-[9px] dark:bg-slate-900" />
          )}
          <div className="grid grid-cols-[1fr_auto] gap-1.5">
            <select aria-label="Saved shape presets" defaultValue="" onChange={(e) => {
              const preset = shapePresets.find((item) => item.id === e.target.value);
              if (!preset) return;
              const { id: _id, name: _name, ...style } = preset;
              onUpdateObject(primary.id, style, true);
              e.target.value = '';
            }} className="min-w-0 rounded border px-2 py-1 text-[10px] dark:bg-slate-900">
              <option value="">Shape presets</option>{shapePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
            <button onClick={() => setShapePresets((items) => [...items.slice(-19), { id: `shape-${Date.now()}`, name: `Shape ${items.length + 1}`, shapeKind: primary.shapeKind, fill: primary.fill, fillStyle: primary.fillStyle, fillGradient: primary.fillGradient, stroke: primary.stroke, strokeWidth: primary.strokeWidth, lineStyle: primary.lineStyle, cornerRadius: primary.cornerRadius, cornerRadii: primary.cornerRadii, borderPosition: primary.borderPosition, shadow: primary.shadow, shadowColor: primary.shadowColor, shadowBlur: primary.shadowBlur, shadowSpread: primary.shadowSpread, shadowOffsetX: primary.shadowOffsetX, shadowOffsetY: primary.shadowOffsetY, fillTexture: primary.fillTexture, blendMode: primary.blendMode, polygonSides: primary.polygonSides, polygonVertices: primary.polygonVertices, customPath: primary.customPath, customPathViewBox: primary.customPathViewBox, booleanOperation: primary.booleanOperation, booleanPaths: primary.booleanPaths }])} className="rounded border px-2 py-1 text-[10px]">Save</button>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
          {['rectangle', 'rounded_rect', 'square', 'flow_process', 'speech_bubble', 'callout', 'frame'].includes(
            primary.shapeKind
          ) && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span>Corner Radius</span>
                <span className="font-mono">
                  {primary.cornerRadius ?? (primary.shapeKind === 'rounded_rect' ? 14 : primary.shapeKind === 'frame' ? 10 : 0)}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={48}
                value={primary.cornerRadius ?? (primary.shapeKind === 'rounded_rect' ? 14 : primary.shapeKind === 'frame' ? 10 : 0)}
                onFocus={() => onSnapshotUndo?.()}
                onChange={(e) => onUpdateObject(primary.id, { cornerRadius: Number(e.target.value) }, !onSnapshotUndo)}
                onPointerUp={() => onSyncPageState?.()}
                className="w-full"
              />
            </div>
          )}

          {(primary.shapeKind === 'polygon' || primary.shapeKind === 'star') && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span>{primary.shapeKind === 'star' ? 'Star Points' : 'Polygon Sides'}</span>
                <span className="font-mono">{primary.polygonSides || (primary.shapeKind === 'star' ? 5 : 8)}</span>
              </div>
              <input
                type="range"
                min={primary.shapeKind === 'star' ? 4 : 3}
                max={12}
                value={primary.polygonSides || (primary.shapeKind === 'star' ? 5 : 8)}
                onFocus={() => onSnapshotUndo?.()}
                onChange={(e) => onUpdateObject(primary.id, { polygonSides: Number(e.target.value) }, !onSnapshotUndo)}
                onPointerUp={() => onSyncPageState?.()}
                className="w-full"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-0.5">
            <span>Drop Shadow</span>
            <button
              onClick={() => onUpdateObject(primary.id, { shadow: !primary.shadow }, true)}
              className={`px-2.5 py-1 text-[11px] rounded border ${
                primary.shadow ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              {primary.shadow ? 'On' : 'Off'}
            </button>
          </div>
          <select aria-label="Border position" value={primary.borderPosition || 'center'} onChange={(e) => onUpdateObject(primary.id, { borderPosition: e.target.value as 'inside' | 'center' | 'outside' }, true)} className="w-full rounded border px-2 py-1 text-[10px] dark:bg-slate-900">
            <option value="inside">Border: Inside</option><option value="center">Border: Center</option><option value="outside">Border: Outside</option>
          </select>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {(['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const).map((corner) => (
              <label key={corner} className="grid grid-cols-[24px_1fr] items-center gap-1 text-[9px] text-slate-500">
                <span>{corner === 'topLeft' ? 'TL' : corner === 'topRight' ? 'TR' : corner === 'bottomRight' ? 'BR' : 'BL'}</span>
                <input aria-label={`${corner} radius`} type="range" min={0} max={48} value={primary.cornerRadii?.[corner] ?? primary.cornerRadius ?? 0} onChange={(e) => onUpdateObject(primary.id, { cornerRadii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0, ...primary.cornerRadii, [corner]: Number(e.target.value) } }, false)} onPointerUp={() => onSyncPageState?.()} />
              </label>
            ))}
          </div>
          {primary.shadow && (
            <div className="grid grid-cols-[28px_1fr_1fr] items-center gap-1.5 rounded border border-slate-200 p-1.5 dark:border-slate-700">
              <input aria-label="Shadow color" type="color" value={primary.shadowColor || '#0f172a'} onChange={(e) => onUpdateObject(primary.id, { shadowColor: e.target.value }, false)} onBlur={() => onSyncPageState?.()} />
              <label className="text-[9px] text-slate-500">Blur<input aria-label="Shadow blur" type="range" min={0} max={48} value={primary.shadowBlur ?? 14} onChange={(e) => onUpdateObject(primary.id, { shadowBlur: Number(e.target.value) }, false)} onPointerUp={() => onSyncPageState?.()} className="w-full" /></label>
              <label className="text-[9px] text-slate-500">Spread<input aria-label="Shadow spread" type="range" min={0} max={24} value={primary.shadowSpread ?? 0} onChange={(e) => onUpdateObject(primary.id, { shadowSpread: Number(e.target.value) }, false)} onPointerUp={() => onSyncPageState?.()} className="w-full" /></label>
              <label className="text-[9px] text-slate-500">X<input aria-label="Shadow X offset" type="range" min={-32} max={32} value={primary.shadowOffsetX ?? 0} onChange={(e) => onUpdateObject(primary.id, { shadowOffsetX: Number(e.target.value) }, false)} onPointerUp={() => onSyncPageState?.()} className="w-full" /></label>
              <label className="text-[9px] text-slate-500">Y<input aria-label="Shadow Y offset" type="range" min={-32} max={32} value={primary.shadowOffsetY ?? 6} onChange={(e) => onUpdateObject(primary.id, { shadowOffsetY: Number(e.target.value) }, false)} onPointerUp={() => onSyncPageState?.()} className="w-full" /></label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <select aria-label="Fill texture" value={primary.fillTexture || 'none'} onChange={(e) => onUpdateObject(primary.id, { fillTexture: e.target.value as 'none' | 'paper' | 'grain' | 'canvas' }, true)} className="rounded border px-1.5 py-1 text-[10px] dark:bg-slate-900">
              <option value="none">No texture</option><option value="paper">Paper</option><option value="grain">Grain</option><option value="canvas">Canvas</option>
            </select>
            <select aria-label="Shape blend mode" value={primary.blendMode || 'source-over'} onChange={(e) => onUpdateObject(primary.id, { blendMode: e.target.value as GlobalCompositeOperation }, true)} className="rounded border px-1.5 py-1 text-[10px] dark:bg-slate-900">
              <option value="source-over">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option>
            </select>
          </div>
          {primary.shapeKind === 'frame' && (onPresentFrame || onExportFrame) && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {onPresentFrame && (
                <button
                  onClick={() => onPresentFrame(primary)}
                  className="py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Present Frame
                </button>
              )}
              {onExportFrame && (
                <button
                  onClick={() => onExportFrame(primary)}
                  className="py-1.5 text-[11px] font-semibold border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
                >
                  Export Frame
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSelectedShapeLabelSection = () => {
    if (!primary || primary.type !== 'shape') return null;
    return (
      <div className="space-y-2">
        {layoutMode === 'full' && (
          <div className="font-semibold text-slate-700 dark:text-slate-300">Shape Label &amp; Typography</div>
        )}
        <input
          value={primary.text || ''}
          onFocus={() => onSnapshotUndo?.()}
          onChange={(e) => onUpdateObject(primary.id, { text: e.target.value }, !onSnapshotUndo)}
          onBlur={() => onSyncPageState?.()}
          placeholder="Label..."
          className="w-full px-2 py-1.5 text-[11px] bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
        />
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-slate-500 mr-1">Text:</span>
          {['#0F172A', '#FFFFFF', '#2563EB', '#DC2626', '#059669'].map((tc) => (
            <button
              key={tc}
              onClick={() => onUpdateObject(primary.id, { textColor: tc }, true)}
              style={{ backgroundColor: tc }}
              className={`w-5 h-5 rounded border ${
                primary.textColor === tc ? 'ring-2 ring-blue-600 border-white' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            />
          ))}
          <input
            type="color"
            aria-label="Shape text color"
            value={primary.textColor || '#0F172A'}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) => onUpdateObject(primary.id, { textColor: e.target.value }, !onSnapshotUndo)}
            onBlur={() => onSyncPageState?.()}
            className="w-6 h-5 rounded border border-slate-200/60 dark:border-slate-700/60 cursor-pointer ml-auto"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={primary.fontFamily || 'Plus Jakarta Sans'}
            onChange={(e) => onUpdateObject(primary.id, { fontFamily: e.target.value }, true)}
            className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
          >
            {FONT_PRESETS.map((fp) => (
              <option key={fp.id} value={fp.family}>
                {fp.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={10}
            max={72}
            value={primary.fontSize}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) => onUpdateObject(primary.id, { fontSize: Number(e.target.value) }, !onSnapshotUndo)}
            onBlur={() => onSyncPageState?.()}
            className="w-14 px-2 py-1 font-mono text-[11px] bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              onUpdateObject(primary.id, { fontWeight: primary.fontWeight === 'bold' ? 'normal' : 'bold' }, true)
            }
            className={`px-2 py-1 rounded border font-bold ${
              primary.fontWeight === 'bold' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
            }`}
          >
            B
          </button>
          <button
            onClick={() =>
              onUpdateObject(primary.id, { fontStyle: primary.fontStyle === 'italic' ? 'normal' : 'italic' }, true)
            }
            className={`px-2 py-1 rounded border italic ${
              primary.fontStyle === 'italic' ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
            }`}
          >
            I
          </button>
          {(['left', 'center', 'right'] as const).map((al) => (
            <button
              key={al}
              onClick={() => onUpdateObject(primary.id, { textAlign: al }, true)}
              className={`p-1 rounded border ${
                primary.textAlign === al ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200/60 dark:border-slate-700/60'
              }`}
            >
              {al === 'left' ? <AlignLeft className="w-3.5 h-3.5" /> : al === 'center' ? <AlignCenter className="w-3.5 h-3.5" /> : <AlignRight className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
        {primary.shapeKind !== 'frame' && (
          <div className="space-y-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Vertical Align</span>
              <div className="flex gap-1">
                {(['top', 'middle', 'bottom'] as const).map((va) => (
                  <button
                    key={va}
                    onClick={() => onUpdateObject(primary.id, { verticalAlign: va }, true)}
                    className={`px-2 py-0.5 text-[10px] rounded border capitalize ${
                      (primary.verticalAlign || 'middle') === va
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-slate-200/60 dark:border-slate-700/60'
                    }`}
                  >
                    {va}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500">Padding ({primary.padding ?? 12}px)</span>
              <input
                type="range"
                min={2}
                max={32}
                value={primary.padding ?? 12}
                onFocus={() => onSnapshotUndo?.()}
                onChange={(e) => onUpdateObject(primary.id, { padding: Number(e.target.value) }, !onSnapshotUndo)}
                onPointerUp={() => onSyncPageState?.()}
                className="w-28"
              />
            </div>
            <label className="flex items-center justify-between text-[11px] cursor-pointer">
              <span className="text-slate-500">Auto-grow Label Box</span>
              <input
                type="checkbox"
                checked={Boolean(primary.autoGrow)}
                onChange={(e) => onUpdateObject(primary.id, { autoGrow: e.target.checked }, true)}
              />
            </label>
          </div>
        )}
      </div>
    );
  };

  const renderSelectedStrokeBrushSection = () => {
    if (!primary || primary.type !== 'stroke') return null;
    const saveBrushPresets = (next: BrushPreset[]) => {
      setBrushPresets(next);
      try { window.localStorage.setItem('lumina_board_brush_presets', JSON.stringify(next)); } catch { /* storage may be unavailable */ }
    };
    const applyBrushPreset = (preset: BrushPreset) => onUpdateObject(primary.id, {
      brushKind: preset.brushKind,
      strokeWidth: preset.strokeWidth,
      lineStyle: preset.lineStyle,
      smoothing: preset.smoothing,
      stabilization: preset.stabilization,
      pressureSize: preset.pressureSize,
      pressureOpacity: preset.pressureOpacity,
      pressureCurve: preset.pressureCurve,
      tiltSensitivity: preset.tiltSensitivity,
      taperStart: preset.taperStart,
      taperEnd: preset.taperEnd,
      wetness: preset.wetness,
      blendMode: preset.blendMode,
      texture: preset.texture,
      spacing: preset.spacing,
      scatter: preset.scatter,
      rotationDynamics: preset.rotationDynamics,
    }, true);
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          {layoutMode === 'full' && (
            <div className="font-semibold text-slate-700 dark:text-slate-300">Brush Style</div>
          )}
          <div className="grid grid-cols-3 gap-1">
            {(['pen', 'pencil', 'brush', 'marker', 'highlighter', 'calligraphy', 'fountain', 'dashed_ink'] as const).map((bk) => (
              <button
                key={bk}
                onClick={() => onUpdateObject(primary.id, { brushKind: bk }, true)}
                className={`py-1 rounded border text-[10px] capitalize ${
                  primary.brushKind === bk
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {bk.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Brush preset library"
            value=""
            onChange={(e) => {
              const preset = brushPresets.find((item) => item.id === e.target.value);
              if (preset) applyBrushPreset(preset);
            }}
            className="min-w-0 flex-1 px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-900"
          >
            <option value="" disabled>Brush presets</option>
            {brushPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
          <button
            type="button"
            title="Save current brush preset"
            onClick={() => {
              const name = window.prompt('Brush preset name');
              if (!name?.trim()) return;
              const { id: _objectId, name: _objectName, type: _type, ...settings } = primary;
              const preset = { ...settings, id: uid('brush-preset'), name: name.trim() } as BrushPreset;
              saveBrushPresets([...brushPresets, preset]);
            }}
            className="px-2 py-1 text-[10px] border rounded hover:bg-slate-50 dark:hover:bg-slate-800"
          >Save</button>
          <label className="px-2 py-1 text-[10px] border rounded cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
            Import
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void file.text().then((content) => {
                  try {
                    const imported = JSON.parse(content) as unknown;
                    if (!Array.isArray(imported)) return;
                    const safe = imported.filter((item): item is BrushPreset => Boolean(item && typeof item === 'object' && 'name' in item && typeof item.name === 'string' && 'brushKind' in item));
                    saveBrushPresets([...brushPresets, ...safe]);
                  } catch { /* ignore invalid preset files */ }
                });
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            disabled={brushPresets.length === 0}
            title="Export brush presets"
            onClick={() => {
              const blob = new Blob([JSON.stringify(brushPresets, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'lumina-brush-presets.json';
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2 py-1 text-[10px] border rounded disabled:opacity-40"
          >Export</button>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span>Smoothing</span>
            <span className="font-mono">{primary.smoothing ?? 1}</span>
          </div>
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={primary.smoothing ?? 1}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) => onUpdateObject(primary.id, { smoothing: Number(e.target.value) }, !onSnapshotUndo)}
            onPointerUp={() => onSyncPageState?.()}
            className="w-full"
          />
        </div>
        <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(primary.pressureSize)}
                onChange={(e) => onUpdateObject(primary.id, { pressureSize: e.target.checked }, true)}
              />
              Pressure size
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={Boolean(primary.pressureOpacity)}
                onChange={(e) => onUpdateObject(primary.id, { pressureOpacity: e.target.checked }, true)}
              />
              Pressure opacity
            </label>
          </div>
          <label className="flex items-center justify-between gap-2 text-[10px]">
            <span>Pressure curve</span>
            <select
              value={primary.pressureCurve || 'linear'}
              onChange={(e) => onUpdateObject(primary.id, { pressureCurve: e.target.value as 'linear' | 'soft' | 'firm' }, true)}
              className="px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-900"
            >
              <option value="linear">Linear</option>
              <option value="soft">Soft</option>
              <option value="firm">Firm</option>
            </select>
          </label>
          {(['taperStart', 'taperEnd'] as const).map((key) => (
            <label key={key} className="grid grid-cols-[72px_1fr_30px] items-center gap-2 text-[10px]">
              <span>{key === 'taperStart' ? 'Taper start' : 'Taper end'}</span>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.05}
                value={primary[key] || 0}
                onChange={(e) => onUpdateObject(primary.id, { [key]: Number(e.target.value) }, false)}
                onPointerUp={() => onSyncPageState?.()}
                className="w-full"
              />
              <span className="font-mono">{Math.round((primary[key] || 0) * 100)}%</span>
            </label>
          ))}
          <label className="grid grid-cols-[72px_1fr_30px] items-center gap-2 text-[10px]">
            <span>Tilt</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={primary.tiltSensitivity || 0}
              onChange={(e) => onUpdateObject(primary.id, { tiltSensitivity: Number(e.target.value) }, false)}
              onPointerUp={() => onSyncPageState?.()}
              className="w-full"
            />
            <span className="font-mono">{Math.round((primary.tiltSensitivity || 0) * 100)}%</span>
          </label>
          <label className="grid grid-cols-[72px_1fr_30px] items-center gap-2 text-[10px]">
            <span>Wet ink</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={primary.wetness || 0}
              onChange={(e) => onUpdateObject(primary.id, { wetness: Number(e.target.value) }, false)}
              onPointerUp={() => onSyncPageState?.()}
              className="w-full"
            />
            <span className="font-mono">{primary.wetness || 0}</span>
          </label>
          <label className="flex items-center justify-between gap-2 text-[10px]">
            <span>Blend mode</span>
            <select
              value={primary.blendMode || 'source-over'}
              onChange={(e) => onUpdateObject(primary.id, { blendMode: e.target.value as StrokeObject['blendMode'] }, true)}
              className="px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-900"
            >
              <option value="source-over">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-[10px]">
            <span>Texture</span>
            <select
              value={primary.texture || 'none'}
              onChange={(e) => onUpdateObject(primary.id, { texture: e.target.value as StrokeObject['texture'] }, true)}
              className="px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-900"
            >
              <option value="none">Smooth</option>
              <option value="paper">Paper</option>
              <option value="grain">Grain</option>
            </select>
          </label>
          {(['spacing', 'scatter'] as const).map((key) => (
            <label key={key} className="grid grid-cols-[72px_1fr_30px] items-center gap-2 text-[10px]">
              <span>{key === 'spacing' ? 'Spacing' : 'Scatter'}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={primary[key] || 0}
                onChange={(e) => onUpdateObject(primary.id, { [key]: Number(e.target.value) }, false)}
                onPointerUp={() => onSyncPageState?.()}
                className="w-full"
              />
              <span className="font-mono">{Math.round((primary[key] || 0) * 100)}%</span>
            </label>
          ))}
          <label className="flex items-center gap-1.5 text-[10px]">
            <input
              type="checkbox"
              checked={Boolean(primary.rotationDynamics)}
              onChange={(e) => onUpdateObject(primary.id, { rotationDynamics: e.target.checked }, true)}
            />
            Direction rotation
          </label>
        </div>
      </div>
    );
  };

  const renderSelectedLineConnectorSection = () => {
    if (!primary || (primary.type !== 'line' && primary.type !== 'connector')) return null;
    const connectorLabels = primary.type === 'connector'
      ? primary.labels?.length
        ? primary.labels
        : [{ id: 'primary', text: primary.label || '', position: primary.labelPosition ?? 0.5 }]
      : [];
    return (
      <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            {primary.type === 'connector' ? 'Connector Options' : 'Line & Arrowheads'}
          </span>
          <button
            onClick={() =>
              onUpdateObject(
                primary.id,
                { startHead: primary.endHead, endHead: primary.startHead },
                true
              )
            }
            title="Swap Start & End Arrowheads"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:border-blue-600"
          >
            <ArrowLeftRight className="w-3 h-3" /> Swap
          </button>
        </div>
        {primary.type === 'connector' && (
          <>
            <div className="flex items-center justify-between">
              <span>Route Style</span>
              <select
                value={primary.routeType}
                onChange={(e) =>
                  onUpdateObject(primary.id, { routeType: e.target.value as 'straight' | 'orthogonal' | 'curved' }, true)
                }
                className="px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
              >
                <option value="curved">Curved</option>
                <option value="orthogonal">Orthogonal</option>
                <option value="straight">Straight</option>
              </select>
            </div>
            <div className="space-y-1">
              {(primary.waypoints || []).map((point, index) => (
                <div key={index} className="grid grid-cols-[20px_1fr_1fr_24px] items-center gap-1">
                  <span className="text-[9px] text-slate-500">P{index + 1}</span>
                  <input aria-label={`Control point ${index + 1} X`} type="number" value={Math.round(point.x)} onChange={(e) => onUpdateObject(primary.id, { waypoints: primary.waypoints!.map((p, i) => i === index ? { ...p, x: Number(e.target.value) } : p) }, false)} onBlur={() => onSyncPageState?.()} className="w-full rounded border px-1 py-0.5 text-[10px] dark:bg-slate-900" />
                  <input aria-label={`Control point ${index + 1} Y`} type="number" value={Math.round(point.y)} onChange={(e) => onUpdateObject(primary.id, { waypoints: primary.waypoints!.map((p, i) => i === index ? { ...p, y: Number(e.target.value) } : p) }, false)} onBlur={() => onSyncPageState?.()} className="w-full rounded border px-1 py-0.5 text-[10px] dark:bg-slate-900" />
                  <button aria-label={`Remove control point ${index + 1}`} onClick={() => onUpdateObject(primary.id, { waypoints: primary.waypoints!.filter((_, i) => i !== index) }, true)} className="text-slate-500">−</button>
                </div>
              ))}
              <button onClick={() => onUpdateObject(primary.id, { waypoints: [...(primary.waypoints || []), { x: (primary.x1 + primary.x2) / 2, y: (primary.y1 + primary.y2) / 2 }] }, true)} className="rounded border px-2 py-1 text-[10px]">+ Control point</button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-500">From Port</span>
                <select
                  value={primary.fromPort}
                  onChange={(e) =>
                    onUpdateObject(primary.id, { fromPort: e.target.value as PortSide }, true)
                  }
                  className="w-full px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
                >
                  <option value="top">Top</option>
                  <option value="right">Right</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                </select>
              </label>
              <label className="space-y-0.5">
                <span className="text-[10px] text-slate-500">To Port</span>
                <select
                  value={primary.toPort}
                  onChange={(e) =>
                    onUpdateObject(primary.id, { toPort: e.target.value as PortSide }, true)
                  }
                  className="w-full px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
                >
                  <option value="top">Top</option>
                  <option value="right">Right</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                </select>
              </label>
            </div>
            {connectorLabels.map((item, index) => (
              <div key={item.id} className="grid grid-cols-[1fr_68px] gap-1.5">
                <input
                  value={item.text}
                  onFocus={() => onSnapshotUndo?.()}
                  onChange={(e) => {
                    const next = connectorLabels.map((entry, i) => i === index ? { ...entry, text: e.target.value } : entry);
                    onUpdateObject(primary.id, { labels: next, label: next[0]?.text || '' }, !onSnapshotUndo);
                  }}
                  onBlur={() => onSyncPageState?.()}
                  placeholder={`Label ${index + 1}`}
                  className="w-full px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
                />
                <input aria-label="Label position" type="range" min={0} max={100} value={item.position * 100} onChange={(e) => {
                  const next = connectorLabels.map((entry, i) => i === index ? { ...entry, position: Number(e.target.value) / 100 } : entry);
                  onUpdateObject(primary.id, { labels: next, labelPosition: next[0]?.position }, false);
                }} onPointerUp={() => onSyncPageState?.()} className="w-full" />
              </div>
            ))}
            <div className="flex gap-1.5">
              <button onClick={() => onUpdateObject(primary.id, { labels: [...connectorLabels, { id: `label-${Date.now()}`, text: '', position: 0.75 }] }, true)} className="rounded border px-2 py-1 text-[10px]">+ Label</button>
              <input value={primary.relationshipLabel || ''} onChange={(e) => onUpdateObject(primary.id, { relationshipLabel: e.target.value }, false)} onBlur={() => onSyncPageState?.()} placeholder="Relationship" className="min-w-0 flex-1 rounded border px-2 py-1 text-[10px] dark:bg-slate-900" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <select aria-label="Line cap" value={primary.lineCap || 'round'} onChange={(e) => onUpdateObject(primary.id, { lineCap: e.target.value as 'butt' | 'round' | 'square' }, true)} className="rounded border px-1.5 py-1 text-[10px] dark:bg-slate-900">
                <option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option>
              </select>
              <select aria-label="Line join" value={primary.lineJoin || 'round'} onChange={(e) => onUpdateObject(primary.id, { lineJoin: e.target.value as 'miter' | 'round' | 'bevel' }, true)} className="rounded border px-1.5 py-1 text-[10px] dark:bg-slate-900">
                <option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option>
              </select>
              <select aria-label="Anchor preset" value={primary.anchorPreset || 'auto'} onChange={(e) => onUpdateObject(primary.id, { anchorPreset: e.target.value as 'auto' | 'cardinal' | 'anywhere' }, true)} className="rounded border px-1.5 py-1 text-[10px] dark:bg-slate-900">
                <option value="auto">Auto anchor</option><option value="cardinal">Cardinal</option><option value="anywhere">Free anchor</option>
              </select>
            </div>
            <select aria-label="Dash pattern" value={(primary.dashPattern || []).join(',')} onChange={(e) => onUpdateObject(primary.id, { dashPattern: e.target.value ? e.target.value.split(',').map(Number) : undefined }, true)} className="w-full rounded border px-2 py-1 text-[10px] dark:bg-slate-900">
              <option value="">Default dash</option><option value="12,4">Long dash</option><option value="4,3">Short dash</option><option value="1,4">Fine dot</option><option value="12,4,2,4">Dash dot</option>
            </select>
          </>
        )}
        {primary.type === 'line' && (
          <div className="space-y-1.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span>Curved Arc</span>
              <input type="checkbox" checked={!!primary.curved} onChange={(e) => onUpdateObject(primary.id, { curved: e.target.checked }, true)} />
            </label>
            <div className="grid grid-cols-3 gap-1">
              <select aria-label="Line cap" value={primary.lineCap || 'round'} onChange={(e) => onUpdateObject(primary.id, { lineCap: e.target.value as 'butt' | 'round' | 'square' }, true)} className="rounded border px-1 py-1 text-[10px] dark:bg-slate-900"><option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option></select>
              <select aria-label="Line join" value={primary.lineJoin || 'round'} onChange={(e) => onUpdateObject(primary.id, { lineJoin: e.target.value as 'miter' | 'round' | 'bevel' }, true)} className="rounded border px-1 py-1 text-[10px] dark:bg-slate-900"><option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option></select>
              <select aria-label="Dash pattern" value={(primary.dashPattern || []).join(',')} onChange={(e) => onUpdateObject(primary.id, { dashPattern: e.target.value ? e.target.value.split(',').map(Number) : undefined }, true)} className="rounded border px-1 py-1 text-[10px] dark:bg-slate-900"><option value="">Default</option><option value="12,4">Long</option><option value="4,3">Short</option><option value="1,4">Dot</option><option value="12,4,2,4">Dash dot</option></select>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {([0, primary.points.length - 1] as const).map((pointIndex, endpointIndex) => (
                <label key={endpointIndex} className="grid grid-cols-[20px_1fr_1fr] gap-1 text-[9px] text-slate-500">
                  <span>{endpointIndex ? 'End' : 'Start'}</span>
                  <input aria-label={`${endpointIndex ? 'End' : 'Start'} X`} type="number" value={Math.round(primary.points[pointIndex]?.x || 0)} onChange={(e) => onUpdateObject(primary.id, { points: primary.points.map((p, i) => i === pointIndex ? { ...p, x: Number(e.target.value) } : p) }, false)} onBlur={() => onSyncPageState?.()} className="w-full rounded border px-1 py-0.5 text-[10px] dark:bg-slate-900" />
                  <input aria-label={`${endpointIndex ? 'End' : 'Start'} Y`} type="number" value={Math.round(primary.points[pointIndex]?.y || 0)} onChange={(e) => onUpdateObject(primary.id, { points: primary.points.map((p, i) => i === pointIndex ? { ...p, y: Number(e.target.value) } : p) }, false)} onBlur={() => onSyncPageState?.()} className="w-full rounded border px-1 py-0.5 text-[10px] dark:bg-slate-900" />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-0.5">
            <span className="text-[10px] text-slate-500">Start Cap</span>
            <select
              value={primary.startHead}
              onChange={(e) =>
                onUpdateObject(primary.id, { startHead: e.target.value as LineEndpointStyle }, true)
              }
              className="w-full px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="dot">Dot</option>
              <option value="diamond">Diamond</option>
              <option value="triangle">Triangle</option>
              <option value="open_arrow">Open arrow</option>
              <option value="bar">Bar</option>
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] text-slate-500">End Cap</span>
            <select
              value={primary.endHead}
              onChange={(e) =>
                onUpdateObject(primary.id, { endHead: e.target.value as LineEndpointStyle }, true)
              }
              className="w-full px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="dot">Dot</option>
              <option value="diamond">Diamond</option>
              <option value="triangle">Triangle</option>
              <option value="open_arrow">Open arrow</option>
              <option value="bar">Bar</option>
            </select>
          </label>
        </div>
      </div>
    );
  };

  const renderCodeBlockSection = () => {
    if (!primary || primary.type !== 'text' || !primary.codeBlock) return null;
    const languages: { id: CodeLanguage; label: string }[] = [
      { id: 'typescript', label: 'TypeScript' },
      { id: 'javascript', label: 'JavaScript' },
      { id: 'python', label: 'Python' },
      { id: 'json', label: 'JSON' },
      { id: 'html', label: 'HTML' },
      { id: 'css', label: 'CSS' },
      { id: 'bash', label: 'Bash' },
      { id: 'sql', label: 'SQL' },
    ];
    return (
      <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <select
            aria-label="Code language"
            value={primary.codeLanguage || 'typescript'}
            disabled={!canEdit}
            onChange={(e) => {
              const language = e.target.value as CodeLanguage;
              onUpdateObject(primary.id, {
                codeLanguage: language,
                richBlocks: highlightCodeToRichBlocks(primary.text || '', language),
              }, true);
            }}
            className="min-w-0 flex-1 px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
          >
            {languages.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}
          </select>
          <button
            type="button"
            disabled={!primary.text}
            title="Copy code"
            aria-label="Copy code"
            onClick={() => { void navigator.clipboard?.writeText(primary.text || ''); }}
            className="p-1.5 rounded border bg-white dark:bg-slate-900 disabled:opacity-40"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderTableSection = () => {
    if (!primary || primary.type !== 'table') return null;
    return (
      <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <span className="font-semibold font-mono">{primary.rows}×{primary.cols}</span>
          <div className="flex items-center gap-1">
            <button
              disabled={primary.rows >= 12}
              onClick={() => {
                const newRow = Array.from({ length: primary.cols }, (_, c) => `Cell ${primary.rows + 1},${c + 1}`);
                const nextRowHeights =
                  primary.rowHeights && primary.rowHeights.length === primary.rows
                    ? [...primary.rowHeights, Math.round(primary.height / Math.max(1, primary.rows))]
                    : undefined;
                onUpdateObject(
                  primary.id,
                  {
                    rows: primary.rows + 1,
                    cells: [...primary.cells, newRow],
                    height: primary.height + 36,
                    ...(nextRowHeights ? { rowHeights: nextRowHeights } : {}),
                  },
                  true
                );
              }}
              className="px-1.5 py-0.5 text-[10px] border rounded bg-white dark:bg-slate-900 hover:border-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +Row
            </button>
            {primary.rows > 1 && (
              <button
                onClick={() => {
                  const nextRowHeights =
                    primary.rowHeights && primary.rowHeights.length === primary.rows
                      ? primary.rowHeights.slice(0, -1)
                      : undefined;
                  onUpdateObject(
                    primary.id,
                    {
                      rows: primary.rows - 1,
                      cells: primary.cells.slice(0, -1),
                      height: Math.max(72, primary.height - 36),
                      ...(nextRowHeights ? { rowHeights: nextRowHeights } : {}),
                    },
                    true
                  );
                }}
                className="px-1.5 py-0.5 text-[10px] border rounded bg-white dark:bg-slate-900 hover:border-red-600"
              >
                -Row
              </button>
            )}
            <button
              disabled={primary.cols >= 10}
              onClick={() => {
                const nextColWidths =
                  primary.colWidths && primary.colWidths.length === primary.cols
                    ? [...primary.colWidths, Math.round(primary.width / Math.max(1, primary.cols))]
                    : undefined;
                onUpdateObject(
                  primary.id,
                  {
                    cols: primary.cols + 1,
                    cells: primary.cells.map((row, rIdx) => [...row, rIdx === 0 ? `Col ${primary.cols + 1}` : '-']),
                    width: primary.width + 90,
                    ...(nextColWidths ? { colWidths: nextColWidths } : {}),
                  },
                  true
                );
              }}
              className="px-1.5 py-0.5 text-[10px] border rounded bg-white dark:bg-slate-900 hover:border-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +Col
            </button>
            {primary.cols > 1 && (
              <button
                onClick={() => {
                  const nextColWidths =
                    primary.colWidths && primary.colWidths.length === primary.cols
                      ? primary.colWidths.slice(0, -1)
                      : undefined;
                  onUpdateObject(
                    primary.id,
                    {
                      cols: primary.cols - 1,
                      cells: primary.cells.map((row) => row.slice(0, -1)),
                      width: Math.max(120, primary.width - 90),
                      ...(nextColWidths ? { colWidths: nextColWidths } : {}),
                    },
                    true
                  );
                }}
                className="px-1.5 py-0.5 text-[10px] border rounded bg-white dark:bg-slate-900 hover:border-red-600"
              >
                -Col
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <label className="flex items-center gap-1">
            <span>Header</span>
            <input
              type="color"
              value={primary.headerBg || '#1E293B'}
              onChange={(e) => onUpdateObject(primary.id, { headerBg: e.target.value }, true)}
              className="w-6 h-5 rounded border"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>Border</span>
            <input
              type="color"
              value={primary.borderColor || '#CBD5E1'}
              onChange={(e) => onUpdateObject(primary.id, { borderColor: e.target.value }, true)}
              className="w-6 h-5 rounded border"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>Text</span>
            <input
              type="color"
              value={primary.textColor || '#0F172A'}
              onChange={(e) => onUpdateObject(primary.id, { textColor: e.target.value }, true)}
              className="w-6 h-5 rounded border"
            />
          </label>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: 'Slate', h: '#1E293B', b: '#CBD5E1', t: '#0F172A' },
            { label: 'Blue', h: '#2563EB', b: '#BFDBFE', t: '#0F172A' },
            { label: 'Green', h: '#059669', b: '#A7F3D0', t: '#064E3B' },
            { label: 'Soft', h: '#E2E8F0', b: '#CBD5E1', t: '#0F172A' },
          ].map((th) => (
            <button
              key={th.label}
              onClick={() =>
                onUpdateObject(primary.id, { headerBg: th.h, borderColor: th.b, textColor: th.t }, true)
              }
              className="py-0.5 text-[10px] rounded border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:border-blue-600"
            >
              {th.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-1 text-[10px]">
          <span className="text-slate-500">Align:</span>
          {(['left', 'center', 'right'] as const).map((ca) => (
            <button
              key={ca}
              onClick={() => onUpdateObject(primary.id, { cellAlign: ca }, true)}
              className={`px-2 py-0.5 rounded border capitalize ${
                (typeof primary.cellAlign === 'string' ? primary.cellAlign : 'left') === ca
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900'
              }`}
            >
              {ca}
            </button>
          ))}
          <button
            onClick={() => setCsvImportOpen((v) => !v)}
            className="ml-auto px-2 py-0.5 rounded border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:border-blue-600"
          >
            CSV
          </button>
          {primary.rows > 2 && (
            <button
              onClick={() => {
                const header = primary.cells[0];
                const body = [...primary.cells.slice(1)].sort((a, b) => (a[0] || '').localeCompare(b[0] || '', undefined, { numeric: true }));
                onUpdateObject(primary.id, { cells: [header, ...body] }, true);
              }}
              title="Sort Rows by Column A"
              className="px-2 py-0.5 rounded border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 hover:border-blue-600"
            >
              Sort A–Z
            </button>
          )}
        </div>
        {csvImportOpen && (
          <div className="space-y-1 p-1.5 rounded bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800">
            <textarea
              rows={3}
              value={csvDraft}
              onChange={(e) => setCsvDraft(e.target.value)}
              placeholder="Paste CSV lines (e.g. Name,Score)..."
              className="w-full px-1.5 py-1 text-[10px] font-mono border rounded bg-slate-50 dark:bg-slate-950"
            />
            <button
              onClick={() => {
                const parseCSVLine = (line: string): string[] => {
                  const cells: string[] = [];
                  let cur = '';
                  let inQuotes = false;
                  for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (inQuotes) {
                      if (ch === '"' && line[i + 1] === '"') {
                        cur += '"';
                        i++;
                      } else if (ch === '"') {
                        inQuotes = false;
                      } else {
                        cur += ch;
                      }
                    } else if (ch === '"') {
                      inQuotes = true;
                    } else if (ch === ',') {
                      cells.push(cur.trim());
                      cur = '';
                    } else {
                      cur += ch;
                    }
                  }
                  cells.push(cur.trim());
                  return cells;
                };
                const parsed = csvDraft
                  .trim()
                  .split(/\r?\n/)
                  .filter((line) => line.trim().length > 0)
                  .map(parseCSVLine);
                if (parsed.length > 0 && parsed[0].length > 0) {
                  const maxC = Math.max(...parsed.map((r) => r.length));
                  const normalized = parsed.map((r) => Array.from({ length: maxC }, (_, i) => r[i] ?? ''));
                  onUpdateObject(
                    primary.id,
                    {
                      rows: normalized.length,
                      cols: maxC,
                      cells: normalized,
                      colWidths: undefined,
                      rowHeights: undefined,
                      width: Math.max(primary.width, maxC * 90),
                      height: Math.max(primary.height, normalized.length * 36),
                    },
                    true
                  );
                  setCsvImportOpen(false);
                  setCsvDraft('');
                }
              }}
              className="w-full py-1 text-[10px] font-semibold bg-blue-600 text-white rounded"
            >
              Apply CSV
            </button>
          </div>
        )}
        <div className="text-[9px] text-slate-400">Supports formulas: =SUM(B2:B4), =AVG(A2:C2)</div>
        <div className="overflow-x-auto max-h-44 space-y-1">
          {primary.cells.map((row, r) => (
            <div key={r} className="flex gap-1">
              {row.map((val, c) => (
                <input
                  key={c}
                  value={val}
                  onFocus={() => onSnapshotUndo?.()}
                  onChange={(e) => {
                    const nextCells = primary.cells.map((rw, ri) =>
                      ri === r ? rw.map((cell, ci) => (ci === c ? e.target.value : cell)) : rw
                    );
                    onUpdateObject(primary.id, { cells: nextCells }, !onSnapshotUndo);
                  }}
                  onBlur={() => onSyncPageState?.()}
                  className={`w-20 shrink-0 px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-900 ${
                    r === 0 ? 'font-bold' : ''
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderChartSection = () => {
    if (!primary || primary.type !== 'chart') return null;
    return (
      <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <select
            value={primary.chartType}
            onChange={(e) =>
              onUpdateObject(primary.id, { chartType: e.target.value as ChartObject['chartType'] }, true)
            }
            className="w-full px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
          >
            <option value="bar">Bar Chart</option>
            <option value="horizontalBar">Horizontal Bar</option>
            <option value="line">Line Chart</option>
            <option value="area">Area Chart</option>
            <option value="pie">Pie Chart</option>
            <option value="doughnut">Doughnut Chart</option>
            <option value="scatter">Scatter Plot</option>
            <option value="radar">Radar Chart</option>
          </select>
        </div>
        <input
          value={primary.title}
          onFocus={() => onSnapshotUndo?.()}
          onChange={(e) => onUpdateObject(primary.id, { title: e.target.value }, !onSnapshotUndo)}
          onBlur={() => onSyncPageState?.()}
          placeholder="Chart Title..."
          className="w-full px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
        />
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {primary.labels.map((lbl, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <input
                type="color"
                value={primary.colors[idx] || '#2563EB'}
                onChange={(e) => {
                  const nextColors = [...primary.colors];
                  nextColors[idx] = e.target.value;
                  onUpdateObject(primary.id, { colors: nextColors }, true);
                }}
                className="w-6 h-6 rounded border shrink-0"
              />
              <input
                value={lbl}
                onFocus={() => onSnapshotUndo?.()}
                onChange={(e) => {
                  const nextLabels = [...primary.labels];
                  nextLabels[idx] = e.target.value;
                  onUpdateObject(primary.id, { labels: nextLabels }, !onSnapshotUndo);
                }}
                onBlur={() => onSyncPageState?.()}
                className="flex-1 min-w-0 px-1.5 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
              />
              <input
                type="number"
                value={primary.values[idx] ?? 0}
                onFocus={() => onSnapshotUndo?.()}
                onChange={(e) => {
                  const nextVals = [...primary.values];
                  nextVals[idx] = Number(e.target.value);
                  onUpdateObject(primary.id, { values: nextVals }, !onSnapshotUndo);
                }}
                onBlur={() => onSyncPageState?.()}
                className="w-14 px-1.5 py-1 font-mono text-[11px] border rounded bg-white dark:bg-slate-900"
              />
              {primary.labels.length > 1 && (
                <button
                  onClick={() =>
                    onUpdateObject(
                      primary.id,
                      {
                        labels: primary.labels.filter((_, i) => i !== idx),
                        values: primary.values.filter((_, i) => i !== idx),
                        colors: primary.colors.filter((_, i) => i !== idx),
                      },
                      true
                    )
                  }
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            onUpdateObject(
              primary.id,
              {
                labels: [...primary.labels, `Item ${primary.labels.length + 1}`],
                values: [...primary.values, 25],
                colors: [...primary.colors, palette[primary.labels.length % palette.length]],
              },
              true
            )
          }
          className="w-full py-1 text-[11px] font-medium border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
        >
          + Add Data Series
        </button>
      </div>
    );
  };

  const renderGraphSection = () => {
    if (!primary || primary.type !== 'graph') return null;
    return (
      <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <select
            value={primary.mode}
            onChange={(e) =>
              onUpdateObject(primary.id, { mode: e.target.value as '2d' | 'polar' | '3d' }, true)
            }
            className="px-2 py-0.5 text-[11px] border rounded bg-white dark:bg-slate-900"
          >
            <option value="2d">2D Cartesian</option>
            <option value="polar">Polar r(θ)</option>
            <option value="3d">3D Surface</option>
          </select>
        </div>
        <input
          value={primary.title || ''}
          onFocus={() => onSnapshotUndo?.()}
          onChange={(e) => onUpdateObject(primary.id, { title: e.target.value }, !onSnapshotUndo)}
          onBlur={() => onSyncPageState?.()}
          placeholder="Graph title..."
          className="w-full px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
        />
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {primary.expressions.map((ex, i) => (
            <div key={ex.id} className="flex items-center gap-1">
              <input
                type="color"
                value={ex.color}
                onChange={(e) => {
                  const next = primary.expressions.map((item, idx) =>
                    idx === i ? { ...item, color: e.target.value } : item
                  );
                  onUpdateObject(primary.id, { expressions: next }, true);
                }}
                className="w-6 h-6 rounded border shrink-0"
              />
              <input
                value={ex.expr}
                onFocus={() => onSnapshotUndo?.()}
                onChange={(e) => {
                  const next = primary.expressions.map((item, idx) =>
                    idx === i ? { ...item, expr: e.target.value } : item
                  );
                  onUpdateObject(primary.id, { expressions: next }, !onSnapshotUndo);
                }}
                onBlur={() => onSyncPageState?.()}
                className="flex-1 min-w-0 px-1.5 py-1 font-mono text-[11px] border rounded bg-white dark:bg-slate-900"
              />
              <input
                type="checkbox"
                checked={ex.visible}
                onChange={(e) => {
                  const next = primary.expressions.map((item, idx) =>
                    idx === i ? { ...item, visible: e.target.checked } : item
                  );
                  onUpdateObject(primary.id, { expressions: next }, true);
                }}
              />
              {primary.expressions.length > 1 && (
                <button
                  onClick={() =>
                    onUpdateObject(
                      primary.id,
                      { expressions: primary.expressions.filter((_, idx) => idx !== i) },
                      true
                    )
                  }
                  className="p-0.5 text-red-500 hover:bg-red-50 rounded"
                  title="Remove expression"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <label className="flex items-center gap-1 border rounded px-1.5 py-0.5 bg-white dark:bg-slate-900">
            <span>xMin</span>
            <input
              type="number"
              value={primary.xMin}
              onFocus={() => onSnapshotUndo?.()}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                onUpdateObject(primary.id, v >= primary.xMax ? { xMin: v, xMax: v + 1 } : { xMin: v }, !onSnapshotUndo);
              }}
              onBlur={() => onSyncPageState?.()}
              className="w-full bg-transparent font-mono tabular-nums"
            />
          </label>
          <label className="flex items-center gap-1 border rounded px-1.5 py-0.5 bg-white dark:bg-slate-900">
            <span>xMax</span>
            <input
              type="number"
              value={primary.xMax}
              onFocus={() => onSnapshotUndo?.()}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                onUpdateObject(primary.id, v <= primary.xMin ? { xMax: v, xMin: v - 1 } : { xMax: v }, !onSnapshotUndo);
              }}
              onBlur={() => onSyncPageState?.()}
              className="w-full bg-transparent font-mono tabular-nums"
            />
          </label>
          <label className="flex items-center gap-1 border rounded px-1.5 py-0.5 bg-white dark:bg-slate-900">
            <span>yMin</span>
            <input
              type="number"
              value={primary.yMin}
              onFocus={() => onSnapshotUndo?.()}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                onUpdateObject(primary.id, v >= primary.yMax ? { yMin: v, yMax: v + 1 } : { yMin: v }, !onSnapshotUndo);
              }}
              onBlur={() => onSyncPageState?.()}
              className="w-full bg-transparent font-mono tabular-nums"
            />
          </label>
          <label className="flex items-center gap-1 border rounded px-1.5 py-0.5 bg-white dark:bg-slate-900">
            <span>yMax</span>
            <input
              type="number"
              value={primary.yMax}
              onFocus={() => onSnapshotUndo?.()}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                onUpdateObject(primary.id, v <= primary.yMin ? { yMax: v, yMin: v - 1 } : { yMax: v }, !onSnapshotUndo);
              }}
              onBlur={() => onSyncPageState?.()}
              className="w-full bg-transparent font-mono tabular-nums"
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-1">
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
            <input
              type="checkbox"
              checked={primary.showGrid}
              onChange={(e) => onUpdateObject(primary.id, { showGrid: e.target.checked }, true)}
            />
            Show Grid
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                onUpdateObject(primary.id, { xMin: -10, xMax: 10, yMin: -6, yMax: 6 }, true)
              }
              className="px-1.5 py-0.5 text-[10px] border border-slate-200/60 dark:border-slate-700/60 rounded hover:bg-slate-100"
            >
              Reset View
            </button>
            <button
              onClick={() =>
                onUpdateObject(
                  primary.id,
                  {
                    expressions: [
                      ...primary.expressions,
                      { id: uid('expr'), expr: 'cos(x)', color: '#10B981', visible: true },
                    ],
                  },
                  true
                )
              }
              className="px-2 py-0.5 text-[11px] border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
            >
              + Expr
            </button>
          </div>
        </div>
        {onOpenMathOrGraph && (
          <button
            onClick={() => onOpenMathOrGraph('graph', primary)}
            className="w-full py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Graph Studio
          </button>
        )}
      </div>
    );
  };

  const renderImageSection = () => {
    if (!primary || primary.type !== 'image') return null;
    return (
      <div className="space-y-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
        {layoutMode === 'full' && (
          <div className="font-semibold">Image Mask, Filters &amp; Crop</div>
        )}
        <select
          value={primary.mask}
          onChange={(e) => onUpdateObject(primary.id, { mask: e.target.value as ImageObject['mask'] }, true)}
          className="w-full px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-900"
        >
          <option value="none">No Mask</option>
          <option value="rounded">Rounded Mask</option>
          <option value="circle">Circle Mask</option>
          <option value="hex">Hexagon Mask</option>
          <option value="star">Star Mask</option>
        </select>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span>Brightness ({primary.filters.brightness}%)</span>
          </div>
          <input
            type="range"
            min={50}
            max={160}
            value={primary.filters.brightness}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) =>
              onUpdateObject(primary.id, { filters: { ...primary.filters, brightness: Number(e.target.value) } }, !onSnapshotUndo)
            }
            onPointerUp={() => onSyncPageState?.()}
            className="w-full"
          />
          <div className="flex justify-between text-[11px]">
            <span>Contrast ({primary.filters.contrast}%)</span>
          </div>
          <input
            type="range"
            min={50}
            max={180}
            value={primary.filters.contrast}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) =>
              onUpdateObject(primary.id, { filters: { ...primary.filters, contrast: Number(e.target.value) } }, !onSnapshotUndo)
            }
            onPointerUp={() => onSyncPageState?.()}
            className="w-full"
          />
          <div className="flex justify-between text-[11px]">
            <span>Grayscale ({primary.filters.grayscale}%)</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={primary.filters.grayscale}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) =>
              onUpdateObject(primary.id, { filters: { ...primary.filters, grayscale: Number(e.target.value) } }, !onSnapshotUndo)
            }
            onPointerUp={() => onSyncPageState?.()}
            className="w-full"
          />
          <div className="flex justify-between text-[11px]">
            <span>Sepia ({primary.filters.sepia}%)</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={primary.filters.sepia}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) =>
              onUpdateObject(primary.id, { filters: { ...primary.filters, sepia: Number(e.target.value) } }, !onSnapshotUndo)
            }
            onPointerUp={() => onSyncPageState?.()}
            className="w-full"
          />
          <div className="flex justify-between text-[11px]">
            <span>Blur ({primary.filters.blur}px)</span>
            <button
              onClick={() =>
                onUpdateObject(
                  primary.id,
                  { filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 } },
                  true
                )
              }
              className="text-[10px] text-blue-600 hover:underline"
            >
              Reset Filters
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            value={primary.filters.blur}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) =>
              onUpdateObject(primary.id, { filters: { ...primary.filters, blur: Number(e.target.value) } }, !onSnapshotUndo)
            }
            onPointerUp={() => onSyncPageState?.()}
            className="w-full"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            {onToggleCrop && (
              <button
                onClick={() => onToggleCrop(primary.id)}
                className={`flex-1 py-1.5 text-[11px] font-medium rounded border flex items-center justify-center gap-1 ${
                  croppingId === primary.id
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-slate-200/60 dark:border-slate-700/60 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                <span>{croppingId === primary.id ? 'Done Crop' : 'Crop Frame'}</span>
              </button>
            )}
            {primary.crop && (
              <button
                onClick={async () => {
                  const cached = getCachedImage(primary.src);
                  const dims =
                    cached && cached.naturalWidth > 0
                      ? { w: cached.naturalWidth, h: cached.naturalHeight }
                      : await loadImageNaturalSize(primary.src);
                  onUpdateObject(primary.id, computeAspectPresetCrop(primary, dims.w, dims.h, null), true);
                }}
                className="px-2.5 py-1.5 text-[11px] font-medium border border-amber-300 dark:border-amber-700/70 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40"
              >
                Reset
              </button>
            )}
          </div>
          {croppingId === primary.id && (
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded px-2 py-1">
              Drag handles to trim • Drag inside to pan • Enter to apply
            </p>
          )}
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                { label: '1:1', ratio: 1 },
                { label: '16:9', ratio: 16 / 9 },
                { label: '4:3', ratio: 4 / 3 },
                { label: '3:2', ratio: 3 / 2 },
              ] as const
            ).map((preset) => (
              <button
                key={preset.label}
                onClick={async () => {
                  const cached = getCachedImage(primary.src);
                  const dims =
                    cached && cached.naturalWidth > 0
                      ? { w: cached.naturalWidth, h: cached.naturalHeight }
                      : await loadImageNaturalSize(primary.src);
                  onUpdateObject(primary.id, computeAspectPresetCrop(primary, dims.w, dims.h, preset.ratio), true);
                }}
                className="py-1 text-[10px] font-medium tabular-nums border border-slate-200/60 dark:border-slate-700/60 rounded hover:bg-white dark:hover:bg-slate-800"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
            <span>Cutout Tolerance</span>
            <span className="font-mono tabular-nums">{cutoutTolerance}</span>
          </div>
          <input
            type="range"
            min={10}
            max={80}
            value={cutoutTolerance}
            onChange={(e) => setCutoutTolerance(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <button
          disabled={removingBg}
          onClick={() => handleRemoveBackground(primary)}
          className="w-full py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {removingBg ? 'Removing...' : 'Remove Background'}
        </button>
      </div>
    );
  };

  const renderMathLatexSection = () => {
    if (!primary || primary.type !== 'math') return null;
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          {layoutMode === 'full' && (
            <div className="font-semibold text-slate-700 dark:text-slate-300">LaTeX Expression</div>
          )}
          <textarea
            rows={2}
            value={primary.latex}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) => onUpdateObject(primary.id, { latex: e.target.value }, !onSnapshotUndo)}
            onBlur={() => onSyncPageState?.()}
            placeholder="LaTeX..."
            className="w-full px-2 py-1.5 font-mono text-[11px] bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-700/60 rounded"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Card Background</span>
            <button
              onClick={() => onUpdateObject(primary.id, { bgColor: 'transparent' }, true)}
              className="text-[11px] text-slate-500 hover:text-blue-600"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {['#FFFFFF', '#EFF6FF', '#ECFDF5', '#FEF3C7', '#F5F3FF', '#0F172A'].map((bg) => (
              <button
                key={bg}
                onClick={() => onUpdateObject(primary.id, { bgColor: bg }, true)}
                style={{ backgroundColor: bg }}
                className={`w-6 h-6 rounded border ${
                  primary.bgColor === bg ? 'ring-2 ring-blue-600 border-white' : 'border-slate-200/60 dark:border-slate-700/60'
                }`}
              />
            ))}
            <input
              type="color"
              value={primary.bgColor && primary.bgColor.startsWith('#') ? primary.bgColor : '#FFFFFF'}
              onChange={(e) => onUpdateObject(primary.id, { bgColor: e.target.value }, true)}
              className="w-7 h-6 rounded border border-slate-200/60 dark:border-slate-700/60 cursor-pointer ml-auto"
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-1">
            <span>Formula Size</span>
            <span className="font-mono">{primary.fontSize || 20}px</span>
          </div>
          <input
            type="range"
            min={12}
            max={48}
            value={primary.fontSize || 20}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) => onUpdateObject(primary.id, { fontSize: Number(e.target.value) }, !onSnapshotUndo)}
            onPointerUp={() => onSyncPageState?.()}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {onOpenMathOrGraph && (
            <button
              onClick={() => onOpenMathOrGraph('equation', primary)}
              className="py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Equation Studio
            </button>
          )}
          {onQuickAIAction && (
            <button
              onClick={() => onQuickAIAction('math_solve')}
              className="py-1.5 text-[11px] font-semibold border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
            >
              AI Solve
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderMediaSection = () => {
    if (!primary || primary.type !== 'media') return null;
    return (
      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center gap-2">
          {primary.mediaKind === 'audio' ? (
            <FileAudio className="w-4 h-4 text-blue-600 shrink-0" />
          ) : (
            <FileVideo className="w-4 h-4 text-indigo-600 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{primary.fileName}</div>
            <div className="text-[10px] text-slate-500">
              {primary.mediaKind.toUpperCase()} • {Math.max(1, Math.round(primary.fileSize / 1024))} KB
            </div>
          </div>
        </div>
        {(primary.mediaKind === 'audio' || primary.mediaKind === 'video') && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 shrink-0">Speed</span>
            <select
              aria-label="Media playback speed"
              title="Playback speed"
              value={primary.playbackRate || 1}
              onChange={(e) => onUpdateObject(primary.id, { playbackRate: Number(e.target.value) }, true)}
              className="min-w-0 px-1.5 py-1 text-[10px] border rounded bg-white dark:bg-slate-900"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <option key={rate} value={rate}>{rate}×</option>
              ))}
            </select>
            {primary.mediaKind === 'audio' ? (
              <audio
                controls
                src={resourceUrl(primary.src)}
                ref={(node) => { if (node) node.playbackRate = primary.playbackRate || 1; }}
                className="w-full h-8"
              />
            ) : (
              <video
                controls
                src={resourceUrl(primary.src)}
                ref={(node) => { if (node) node.playbackRate = primary.playbackRate || 1; }}
                className="w-full max-h-36 rounded bg-black"
              />
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMultiSizeAndAlignSection = () => (
    <div className="space-y-3">
      {selectedObjects.some((o) => o.type === 'shape') && (
        <div className="flex items-center justify-between pt-0.5">
          <span>Drop Shadow</span>
          <div className="flex gap-1">
            <button
              onClick={() =>
                batchPatch(
                  selectedObjects.filter((o) => o.type === 'shape').map((o) => ({ id: o.id, shadow: true })),
                  true
                )
              }
              className="px-2 py-0.5 text-[11px] rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              All On
            </button>
            <button
              onClick={() =>
                batchPatch(
                  selectedObjects.filter((o) => o.type === 'shape').map((o) => ({ id: o.id, shadow: false })),
                  true
                )
              }
              className="px-2 py-0.5 text-[11px] rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              All Off
            </button>
          </div>
        </div>
      )}
      {selectedObjects.some((o) => o.type === 'text' || o.type === 'sticky' || o.type === 'shape') && (
        <div className="flex items-center justify-between pt-0.5">
          <span>Shared Font Size</span>
          <div className="flex gap-1">
            {[14, 18, 24, 32].map((fs) => (
              <button
                key={fs}
                onClick={() =>
                  batchPatch(
                    selectedObjects
                      .filter((o) => o.type === 'text' || o.type === 'sticky' || o.type === 'shape')
                      .map((o) => ({ id: o.id, fontSize: fs })),
                    true
                  )
                }
                className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {fs}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <span className="font-semibold text-slate-700 dark:text-slate-300">Match Size</span>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ['Same W', 'w'],
              ['Same H', 'h'],
              ['Same Size', 'both'],
            ] as const
          ).map(([label, mode]) => (
            <button
              key={mode}
              onClick={() => {
                const ref = selectedObjects[0];
                batchPatch(
                  selectedObjects.slice(1).map((o) => {
                    const nextW = mode === 'w' || mode === 'both' ? ref.width : o.width;
                    const nextH = mode === 'h' || mode === 'both' ? ref.height : o.height;
                    const oldBox = { x: o.x, y: o.y, width: o.width, height: o.height };
                    const nextBox = { x: o.x, y: o.y, width: nextW, height: nextH };
                    if (o.type === 'stroke') {
                      return { id: o.id, width: nextW, height: nextH, points: scalePointsToBox(o.points, oldBox, nextBox) };
                    }
                    if (o.type === 'line') {
                      const scaledCp =
                        typeof o.cpX === 'number' && typeof o.cpY === 'number'
                          ? scalePointToBox({ x: o.cpX, y: o.cpY }, oldBox, nextBox)
                          : null;
                      return {
                        id: o.id,
                        width: nextW,
                        height: nextH,
                        points: scalePointsToBox(o.points, oldBox, nextBox),
                        ...(scaledCp ? { cpX: Math.round(scaledCp.x), cpY: Math.round(scaledCp.y) } : {}),
                      };
                    }
                    return { id: o.id, width: nextW, height: nextH };
                  }),
                  true
                );
              }}
              className="py-1 text-[10px] font-medium rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {selectedObjects.length >= 2 && (
        <div className="space-y-1 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Align &amp; Distribute</div>
          <div className="grid grid-cols-4 gap-1">
            {[
              { id: 'left', label: 'Left' },
              { id: 'center', label: 'Center' },
              { id: 'right', label: 'Right' },
              { id: 'distribute_h', label: 'Dist H' },
              { id: 'top', label: 'Top' },
              { id: 'middle', label: 'Mid' },
              { id: 'bottom', label: 'Bot' },
              { id: 'distribute_v', label: 'Dist V' },
            ].map((a) => (
              <button
                key={a.id}
                onClick={() => onAlignSelected(a.id as never)}
                className="py-1 text-[10px] border border-slate-200/60 dark:border-slate-700/60 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderTransformSection = () => {
    if (!primary) return null;
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
          <input
            value={primary.name || ''}
            onFocus={() => onSnapshotUndo?.()}
            onChange={(e) => onUpdateObject(primary.id, { name: e.target.value }, !onSnapshotUndo)}
            onBlur={() => onSyncPageState?.()}
            placeholder="Name..."
            className="w-full px-2 py-1 text-[11px] font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded"
          />
          <select
            value={typeof primary.slideAnim === 'object' ? primary.slideAnim?.effect || 'none' : primary.slideAnim || 'none'}
            onChange={(e) => {
              const nextEff = e.target.value as 'none' | 'fade' | 'slide-up' | 'zoom';
              const curStep = typeof primary.slideAnim === 'object' ? primary.slideAnim?.step ?? 0 : 0;
              onUpdateObject(
                primary.id,
                { slideAnim: curStep > 0 ? { effect: nextEff, step: curStep } : nextEff },
                true
              );
            }}
            title="Presentation Slide Animation"
            className="px-1.5 py-1 text-[10px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded"
          >
            <option value="none">Anim: None</option>
            <option value="fade">Fade In</option>
            <option value="slide-up">Slide Up</option>
            <option value="zoom">Zoom In</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Position &amp; Size</span>
          <div className="flex items-center gap-1">
            {(primary.rotation || 0) !== 0 && (
              <button
                onClick={() => onUpdateObject(primary.id, { rotation: 0 }, true)}
                className="px-1.5 py-0.5 text-[10px] border border-slate-200/60 dark:border-slate-700/60 rounded hover:bg-slate-50"
              >
                0° Rot
              </button>
            )}
            {onCenterObjectInView && (
              <button
                onClick={() => onCenterObjectInView(primary)}
                className="px-1.5 py-0.5 text-[10px] border border-slate-200/60 dark:border-slate-700/60 rounded hover:bg-slate-50"
              >
                Center
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'X', val: Math.round(primary.x), key: 'x' as const },
            { label: 'Y', val: Math.round(primary.y), key: 'y' as const },
            { label: 'W', val: Math.round(primary.width), key: 'width' as const },
            { label: 'H', val: Math.round(primary.height), key: 'height' as const },
            { label: 'Rot °', val: Math.round(primary.rotation || 0), key: 'rotation' as const },
          ].map((f) => (
            <label
              key={f.key}
              className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1"
            >
              <span className="text-[10px] text-slate-500 w-6">{f.label}</span>
              <input
                type="number"
                value={f.val}
                onFocus={() => onSnapshotUndo?.()}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  if (Number.isNaN(num)) return;
                  const safeNum = f.key === 'width' || f.key === 'height' ? Math.max(8, num) : num;
                  if (f.key !== 'rotation' && (primary.type === 'stroke' || primary.type === 'line')) {
                    const oldBox = { x: primary.x, y: primary.y, width: primary.width, height: primary.height };
                    const nextBox = { ...oldBox, [f.key]: safeNum };
                    if (primary.type === 'stroke') {
                      onUpdateObject(
                        primary.id,
                        {
                          ...nextBox,
                          points: scalePointsToBox(primary.points as StrokePoint[], oldBox, nextBox),
                        },
                        !onSnapshotUndo
                      );
                    } else {
                      const scaledCp =
                        typeof primary.cpX === 'number' && typeof primary.cpY === 'number'
                          ? scalePointToBox({ x: primary.cpX, y: primary.cpY }, oldBox, nextBox)
                          : null;
                      onUpdateObject(
                        primary.id,
                        {
                          ...nextBox,
                          points: scalePointsToBox(primary.points, oldBox, nextBox),
                          ...(scaledCp ? { cpX: Math.round(scaledCp.x), cpY: Math.round(scaledCp.y) } : {}),
                        },
                        !onSnapshotUndo
                      );
                    }
                  } else {
                    onUpdateObject(primary.id, { [f.key]: safeNum }, !onSnapshotUndo);
                  }
                }}
                onBlur={() => onSyncPageState?.()}
                className="w-full bg-transparent font-mono text-[11px] focus:outline-none"
              />
            </label>
          ))}
        </div>
        {boardLayers.length > 0 && (
          <label className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500">Assigned Layer</span>
            <select
              value={primary.layerId || boardLayers[0].id}
              onChange={(e) => onUpdateObject(primary.id, { layerId: e.target.value }, true)}
              className="flex-1 px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-950"
            >
              {boardLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  };

  const renderArrangeActionsSection = () => (
    <div className="space-y-2">
      {layoutMode === 'full' && (
        <div className="font-semibold text-slate-700 dark:text-slate-300">Layers &amp; Actions</div>
      )}
      <div className="flex flex-wrap gap-1">
        {primary && onSelectIds && (
          <>
            <button
              type="button"
              onClick={selectSimilar}
              title="Select similar objects"
              aria-label="Select similar objects"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={selectAllOfType}
              title={`Select all ${primary.type} objects`}
              aria-label={`Select all ${primary.type} objects`}
              className="px-2 py-1 text-[10px] font-medium rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              All {primary.type}
            </button>
            {primary.groupId && (
              <button
                type="button"
                onClick={() => onSelectIds(new Set(page.objects.filter((obj) => obj.groupId === primary.groupId).map((obj) => obj.id)))}
                title="Select saved group"
                aria-label="Select saved group"
                className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Group className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
        {onSelectIds && selectionHistoryCount > 0 && (
          <button
            type="button"
            onClick={() => {
              const previous = selectionHistoryRef.current.pop();
              setSelectionHistoryCount(selectionHistoryRef.current.length);
              if (previous) onSelectIds(new Set([...previous].filter((id) => page.objects.some((obj) => obj.id === id))));
            }}
            title="Restore previous selection"
            aria-label="Restore previous selection"
            className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onDuplicateSelected}
          title="Duplicate"
          className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        {primary && onCopyStyle && (
          <button
            onClick={() => onCopyStyle(primary)}
            title="Copy Style"
            className="px-2 py-1 text-[10px] font-medium rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Copy Style
          </button>
        )}
        {hasCopiedStyle && onPasteStyle && (
          <button
            onClick={() => onPasteStyle(selectedObjects)}
            title="Paste Style"
            className="px-2 py-1 text-[10px] font-medium rounded border border-blue-400 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
          >
            Paste Style
          </button>
        )}
        {selectedObjects.length > 1 && (
          <>
            <button
              onClick={onGroupSelected}
              title="Group (Ctrl+G)"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50"
            >
              <Group className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onUngroupSelected}
              title="Ungroup"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50"
            >
              <Ungroup className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                const anyUnlocked = selectedObjects.some((o) => !o.locked);
                batchPatch(
                  selectedObjects.map((o) => ({ id: o.id, locked: anyUnlocked })),
                  true
                );
              }}
              title="Lock / Unlock All Selected"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50"
            >
              {selectedObjects.every((o) => o.locked) ? (
                <Unlock className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
            </button>
          </>
        )}
        {primary && (
          <>
            <button
              onClick={() => onUpdateObject(primary.id, { flipX: !primary.flipX }, true)}
              title="Flip Horizontal"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onUpdateObject(primary.id, { flipY: !primary.flipY }, true)}
              title="Flip Vertical"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60"
            >
              <FlipVertical className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onReorderZ(primary.id, 'back')}
              title="Send to Back"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onReorderZ(primary.id, 'backward')}
              title="Send Backward"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onReorderZ(primary.id, 'forward')}
              title="Bring Forward"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onReorderZ(primary.id, 'front')}
              title="Bring to Front"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60"
            >
              <ArrowUpToLine className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onUpdateObject(primary.id, { locked: !primary.locked }, true)}
              title="Lock/Unlock"
              className="p-1.5 rounded border border-slate-200/60 dark:border-slate-700/60"
            >
              {primary.locked ? <Unlock className="w-3.5 h-3.5 text-amber-600" /> : <Lock className="w-3.5 h-3.5" />}
            </button>
          </>
        )}
        <button
          onClick={() => onDeleteObjects(Array.from(selectedIds))}
          title="Delete Selected"
          className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const renderCommentsSection = () => {
    if (!primary) return null;
    return (
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold">Comments ({primary.comments?.length || 0})</div>
        {(primary.comments || []).map((c) => (
          <div key={c.id} className="p-1.5 rounded bg-slate-50 dark:bg-slate-950 text-[11px]">
            <strong>{c.author}:</strong> {c.text}
          </div>
        ))}
        <div className="flex gap-1">
          <input
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="Add comment..."
            className="flex-1 px-2 py-1 text-[11px] border rounded bg-white dark:bg-slate-950"
          />
          <button
            onClick={() => {
              if (!commentInput.trim()) return;
              const next = [
                ...(primary.comments || []),
                { id: uid('cm'), author: userName, text: commentInput.trim(), createdAt: Date.now() },
              ];
              onUpdateObject(primary.id, { comments: next }, true);
              setCommentInput('');
            }}
            className="p-1.5 bg-blue-600 text-white rounded"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  type RailSection = {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    swatchColor?: string;
    badgeText?: string;
    activeDot?: boolean;
    render: () => React.ReactNode;
  };

  const sections: RailSection[] = [];

  if (!hasSelection) {
    if (rightPanelMenu === 'table') {
      sections.push({
        id: 'menu-table',
        label: 'Insert Table',
        icon: Table2,
        render: renderTableMenuSection,
      });
      sections.push({
        id: 'menu-code-block',
        label: 'Code Block',
        icon: Copy,
        render: () => (
          <button
            type="button"
            onClick={onInsertCodeBlock}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-left text-[11px] font-medium hover:border-blue-400"
          >
            <Copy className="w-3.5 h-3.5 text-blue-500" />
            Insert Code Block
          </button>
        ),
      });
    } else if (rightPanelMenu === 'diagrams') {
      sections.push({
        id: 'menu-diagrams',
        label: 'Diagram Studio',
        icon: Network,
        render: renderDiagramsMenuSection,
      });
    } else if (rightPanelMenu === 'geometry') {
      sections.push({
        id: 'menu-geometry',
        label: 'Geometry Instruments',
        icon: Ruler,
        activeDot: instruments.some((i) => i.visible),
        render: renderGeometryMenuSection,
      });
    } else if (rightPanelMenu === 'math') {
      sections.push({
        id: 'menu-math',
        label: 'Math & Science',
        icon: FunctionSquare,
        render: renderMathMenuSection,
      });
    } else if (activeTool === 'select' || activeTool === 'hand') {
      sections.push({
        id: 'page-grid',
        label: 'Page & Grid Style',
        icon: Grid,
        swatchColor: page.background,
        render: renderPageGridSection,
      });
    } else if (activeTool === 'highlighter') {
      sections.push(
        {
          id: 'hl-color',
          label: 'Highlight Color',
          icon: Highlighter,
          swatchColor: strokeColor,
          render: renderHighlighterColorSection,
        },
        {
          id: 'hl-width',
          label: 'Tip Width & Opacity',
          icon: Sliders,
          badgeText: `${strokeWidth}`,
          render: renderHighlighterWidthSection,
        }
      );
    } else if (activeTool === 'paint_bucket') {
      sections.push({
        id: 'bucket-fill',
        label: 'Fill Color',
        icon: PaintBucket,
        swatchColor: fillColor !== 'transparent' ? fillColor : undefined,
        render: () => renderFillSection(false),
      });
    } else if (activeTool === 'laser') {
      sections.push({
        id: 'laser-beam',
        label: 'Laser Beam',
        icon: Pointer,
        swatchColor: strokeColor,
        badgeText: `${strokeWidth}`,
        render: renderLaserSection,
      });
    } else if (isPenTool) {
      sections.push(
        {
          id: 'ink-brush',
          label: 'Brush Type & Presets',
          icon: activeTool === 'brush' ? Brush : activeTool === 'pencil' ? Pencil : Pen,
          render: renderPenBrushTypeSection,
        },
        {
          id: 'ink-color',
          label: 'Ink Color',
          icon: Palette,
          swatchColor: activeColor,
          render: () => renderColorSection('Ink Color'),
        },
        {
          id: 'ink-style',
          label: 'Width, Opacity & Style',
          icon: Sliders,
          badgeText: `${strokeWidth}`,
          render: () => renderStrokeStyleControls(true, true),
        },
        {
          id: 'ink-smooth',
          label: 'Smoothing & Smart Shape',
          icon: Wand2,
          render: renderPenSmoothingSection,
        }
      );
    } else if (isEraserTool) {
      sections.push(
        {
          id: 'eraser-mode',
          label: 'Eraser Mode & Clear',
          icon: Eraser,
          render: renderEraserModeSection,
        },
        {
          id: 'eraser-size',
          label: 'Eraser Size',
          icon: Sliders,
          badgeText: `${eraserSize}`,
          render: renderEraserSizeSection,
        }
      );
    } else if (activeTool === 'text') {
      sections.push(
        {
          id: 'text-color',
          label: 'Text & Box Color',
          icon: Palette,
          swatchColor: activeColor,
          render: () => renderRichTypographyControls('text-default', 'color'),
        },
        {
          id: 'text-font',
          label: 'Typography',
          icon: Type,
          badgeText: `${textDefaults.fontSize}`,
          render: () => renderRichTypographyControls('text-default', 'font'),
        },
        {
          id: 'text-box',
          label: 'Box Border & Opacity',
          icon: Frame,
          render: () => renderRichTypographyControls('text-default', 'box'),
        }
      );
    } else if (activeTool === 'sticky') {
      sections.push(
        {
          id: 'sticky-theme',
          label: 'Sticky Color & Style',
          icon: StickyNote,
          swatchColor: textDefaults.noteColor,
          render: () => renderRichTypographyControls('sticky-default', 'color'),
        },
        {
          id: 'sticky-font',
          label: 'Typography',
          icon: Type,
          badgeText: `${textDefaults.stickyFontSize}`,
          render: () => renderRichTypographyControls('sticky-default', 'font'),
        }
      );
    } else if (activeTool === 'shape') {
      if (activeShapeKind === 'frame' && onInsertSectionFrame) {
        sections.push({
          id: 'frame-presets',
          label: 'Frame Presets',
          icon: Frame,
          render: renderFramePresetsSection,
        });
      } else {
        sections.push({
          id: 'shape-library',
          label: 'Shapes & Geometry',
          icon: Shapes,
          render: renderShapeToolLibraryDefaultsSection,
        });
      }
      sections.push(
        {
          id: 'shape-border',
          label: 'Border Color',
          icon: Palette,
          swatchColor: activeColor,
          render: () => renderColorSection('Border Color'),
        },
        {
          id: 'shape-fill',
          label: 'Fill & Pattern',
          icon: PaintBucket,
          swatchColor: fillColor !== 'transparent' ? fillColor : undefined,
          render: () => renderFillSection(false),
        },
        {
          id: 'shape-stroke',
          label: 'Width, Opacity & Style',
          icon: Sliders,
          badgeText: `${strokeWidth}`,
          render: () => renderStrokeStyleControls(true, true, true),
        }
      );
    } else if (isLineTool) {
      sections.push(
        {
          id: 'line-type',
          label: 'Line / Arrow Type',
          icon: ArrowRight,
          render: renderLineTypeSection,
        },
        {
          id: 'line-color',
          label: 'Line Color',
          icon: Palette,
          swatchColor: activeColor,
          render: () => renderColorSection('Line Color'),
        },
        {
          id: 'line-style',
          label: 'Width, Opacity & Style',
          icon: Sliders,
          badgeText: `${strokeWidth}`,
          render: () => renderStrokeStyleControls(true, true),
        },
        {
          id: 'line-caps',
          label: 'Arrowheads',
          icon: ArrowLeftRight,
          render: renderDefaultLineCapsSection,
        }
      );
    } else if (activeTool === 'connector') {
      sections.push(
        {
          id: 'conn-route',
          label: 'Route & Arrowheads',
          icon: GitBranch,
          render: renderDefaultConnectorSection,
        },
        {
          id: 'conn-color',
          label: 'Connector Color',
          icon: Palette,
          swatchColor: activeColor,
          render: () => renderColorSection('Connector Color'),
        },
        {
          id: 'conn-style',
          label: 'Width, Opacity & Style',
          icon: Sliders,
          badgeText: `${strokeWidth}`,
          render: () => renderStrokeStyleControls(true, true),
        }
      );
    } else {
      sections.push({
        id: 'page-grid',
        label: 'Page & Grid Style',
        icon: Grid,
        swatchColor: page.background,
        render: renderPageGridSection,
      });
    }
  } else {
    // Object(s) Selected
    if (primary) {
      if (primary.type === 'text') {
        if (primary.codeBlock) {
          sections.push({
            id: 'sel-code-block',
            label: 'Code Block',
            icon: Copy,
            render: renderCodeBlockSection,
          });
        }
        sections.push(
          {
            id: 'sel-text-color',
            label: 'Text & Box Color',
            icon: Palette,
            swatchColor: primary.textColor,
            render: () => renderRichTypographyControls('selected', 'color'),
          },
          {
            id: 'sel-text-font',
            label: 'Font, Size & Lists',
            icon: Type,
            render: () => renderRichTypographyControls('selected', 'font'),
          },
          {
            id: 'sel-text-box',
            label: 'Box Border, Padding & Opacity',
            icon: Frame,
            render: () => renderRichTypographyControls('selected', 'box'),
          }
        );
      } else if (primary.type === 'sticky') {
        sections.push(
          {
            id: 'sel-sticky-theme',
            label: 'Sticky Color, Style & Reactions',
            icon: StickyNote,
            swatchColor: primary.noteColor,
            render: () => renderRichTypographyControls('selected', 'color'),
          },
          {
            id: 'sel-sticky-font',
            label: 'Font, Formatting & Opacity',
            icon: Type,
            render: () => renderRichTypographyControls('selected', 'font'),
          }
        );
      } else if (primary.type === 'shape') {
        sections.push(
          {
            id: 'sel-shape-type',
            label: 'Shape Type & Effects',
            icon: Shapes,
            render: renderSelectedShapeTypeAndGeomSection,
          },
          {
            id: 'sel-shape-border',
            label: 'Border Color',
            icon: Palette,
            swatchColor: primary.stroke,
            render: () => renderColorSection('Border Color'),
          },
          {
            id: 'sel-shape-fill',
            label: 'Fill, Gradient & Pattern',
            icon: PaintBucket,
            swatchColor: primary.fill !== 'transparent' ? primary.fill : undefined,
            render: () => renderFillSection(true),
          },
          {
            id: 'sel-shape-stroke',
            label: 'Stroke Width, Opacity & Style',
            icon: Sliders,
            render: () => renderStrokeStyleControls(true, true, true),
          },
          {
            id: 'sel-shape-label',
            label: 'Shape Label & Typography',
            icon: Type,
            render: renderSelectedShapeLabelSection,
          }
        );
      } else if (primary.type === 'stroke') {
        sections.push(
          {
            id: 'sel-brush-kind',
            label: 'Brush Style & Smoothing',
            icon: Brush,
            render: renderSelectedStrokeBrushSection,
          },
          {
            id: 'sel-stroke-color',
            label: 'Stroke Color',
            icon: Palette,
            swatchColor: primary.stroke,
            render: () => renderColorSection('Stroke Color'),
          },
          {
            id: 'sel-stroke-style',
            label: 'Width, Opacity & Style',
            icon: Sliders,
            render: () => renderStrokeStyleControls(true, true),
          }
        );
      } else if (primary.type === 'line' || primary.type === 'connector') {
        sections.push(
          {
            id: 'sel-line-color',
            label: 'Line Color',
            icon: Palette,
            swatchColor: primary.stroke,
            render: () => renderColorSection('Line Color'),
          },
          {
            id: 'sel-line-style',
            label: 'Width, Opacity & Style',
            icon: Sliders,
            render: () => renderStrokeStyleControls(true, true),
          },
          {
            id: 'sel-line-opts',
            label: primary.type === 'connector' ? 'Connector Route & Caps' : 'Arrowheads & Curve',
            icon: primary.type === 'connector' ? GitBranch : ArrowLeftRight,
            render: renderSelectedLineConnectorSection,
          }
        );
      } else if (primary.type === 'table') {
        sections.push(
          {
            id: 'sel-table',
            label: `Table Editor (${primary.rows}×${primary.cols})`,
            icon: Table2,
            render: renderTableSection,
          },
          {
            id: 'sel-opacity',
            label: 'Opacity',
            icon: Sliders,
            render: renderOpacityControl,
          }
        );
      } else if (primary.type === 'chart') {
        sections.push(
          {
            id: 'sel-chart',
            label: 'Chart Type & Data Series',
            icon: BarChart3,
            render: renderChartSection,
          },
          {
            id: 'sel-opacity',
            label: 'Opacity',
            icon: Sliders,
            render: renderOpacityControl,
          }
        );
      } else if (primary.type === 'graph') {
        sections.push(
          {
            id: 'sel-graph',
            label: 'Graph Equations & Bounds',
            icon: LineChart,
            render: renderGraphSection,
          },
          {
            id: 'sel-opacity',
            label: 'Opacity',
            icon: Sliders,
            render: renderOpacityControl,
          }
        );
      } else if (primary.type === 'image') {
        sections.push(
          {
            id: 'sel-image',
            label: 'Mask, Filters, Crop & Cutout',
            icon: ImageIcon,
            render: renderImageSection,
          },
          {
            id: 'sel-opacity',
            label: 'Opacity',
            icon: Sliders,
            render: renderOpacityControl,
          }
        );
      } else if (primary.type === 'math') {
        sections.push(
          {
            id: 'sel-math',
            label: 'LaTeX & Card Style',
            icon: FunctionSquare,
            render: renderMathLatexSection,
          },
          {
            id: 'sel-math-color',
            label: 'Formula Color',
            icon: Palette,
            swatchColor: primary.color,
            render: () => renderColorSection('Formula Color'),
          },
          {
            id: 'sel-opacity',
            label: 'Opacity',
            icon: Sliders,
            render: renderOpacityControl,
          }
        );
      } else if (primary.type === 'media') {
        sections.push(
          {
            id: 'sel-media',
            label: 'Media Player',
            icon: FileVideo,
            render: renderMediaSection,
          },
          {
            id: 'sel-opacity',
            label: 'Opacity',
            icon: Sliders,
            render: renderOpacityControl,
          }
        );
      }

      sections.push(
        {
          id: 'sel-transform',
          label: 'Name, Position & Size',
          icon: Maximize,
          render: renderTransformSection,
        },
        {
          id: 'sel-arrange',
          label: 'Z-Order, Flip, Lock & Delete',
          icon: Layers,
          render: renderArrangeActionsSection,
        },
        {
          id: 'sel-comments',
          label: `Comments (${primary.comments?.length || 0})`,
          icon: MessageSquarePlus,
          render: renderCommentsSection,
        }
      );
    } else {
      // Multi-Selection
      sections.push({
        id: 'multi-color',
        label: 'Shared Border / Text Color',
        icon: Palette,
        swatchColor: activeColor,
        render: () => renderColorSection('Shared Border / Text Color'),
      });
      if (selectedObjects.some((o) => o.type === 'shape')) {
        sections.push({
          id: 'multi-fill',
          label: 'Shared Fill Color',
          icon: PaintBucket,
          swatchColor: fillColor !== 'transparent' ? fillColor : undefined,
          render: () => renderFillSection(false),
        });
      }
      sections.push(
        {
          id: 'multi-stroke',
          label: 'Shared Width, Style & Opacity',
          icon: Sliders,
            render: () =>
            selectedObjects.some((o) => 'strokeWidth' in o)
              ? renderStrokeStyleControls(true, selectedObjects.some((o) => 'lineStyle' in o), selectedObjects.every((o) => o.type === 'shape'))
              : renderOpacityControl(),
        },
        {
          id: 'multi-align',
          label: 'Match Size & Align',
          icon: AlignLeft,
          render: renderMultiSizeAndAlignSection,
        },
        {
          id: 'multi-arrange',
          label: 'Group, Lock & Delete',
          icon: Layers,
          render: renderArrangeActionsSection,
        }
      );
    }
  }

  useEffect(() => {
    setActivePopoverId(null);
  }, [focusPropsTick, activeTool, activeShapeKind, primary?.id, selectedIds.size, rightPanelMenu]);

  useEffect(() => {
    if (!autoOpenSignal?.tick || layoutMode !== 'rail') return;
    const targetId = autoOpenSignal.sectionId || sections[0]?.id;
    if (!targetId) return;
    const exists = sections.some((s) => s.id === targetId);
    const finalId = exists ? targetId : sections[0]?.id;
    if (!finalId) return;
    requestAnimationFrame(() => {
      const btn = railButtonRefs.current[finalId];
      const minTop = hideTopBar ? 8 : 54;
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setPopoverTop(Math.max(minTop, Math.min(Math.max(minTop, window.innerHeight - 360), Math.round(rect.top))));
      } else {
        setPopoverTop(minTop + 44);
      }
      setActivePopoverId(finalId);
    });
  }, [autoOpenSignal?.tick]);

  useEffect(() => {
    if (!activePopoverId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePopoverId(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-properties-panel="true"]')) return;
      setActivePopoverId(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [activePopoverId]);

  const activePopoverSection = sections.find((s) => s.id === activePopoverId) || null;

  if (layoutMode === 'rail') {
    const ActivePopoverIcon = activePopoverSection?.icon;
    return (
      <div
        data-properties-panel="true"
        onMouseDown={(e) => {
          if (!isEditingText) return;
          const tag = (e.target as HTMLElement).tagName;
          if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
            e.preventDefault();
          }
        }}
        className="w-12 h-full bg-white/95 dark:bg-slate-900/95 glass-chrome border-l border-slate-200/60 dark:border-slate-800/60 flex flex-col items-center py-1.5 gap-0.5 overflow-y-auto overflow-x-visible rail-scroll relative"
      >
        {hideTopBar && onShowTopBar && (
          <button
            title="Show Top Bar (Ctrl+\)"
            aria-label="Show Top Bar"
            onClick={() => {
              setActivePopoverId(null);
              onShowTopBar();
            }}
            className="w-9 h-7 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/70 dark:border-blue-800/60 shrink-0 transition-colors"
          >
            <PanelTopOpen className="w-3.5 h-3.5" />
          </button>
        )}
        {onToggleExpand && (
          <button
            title="Expand Properties"
            onClick={() => {
              setActivePopoverId(null);
              onToggleExpand();
            }}
            className="w-9 h-6 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
          </button>
        )}
        {((hideTopBar && onShowTopBar) || onToggleExpand) && (
          <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-0.5 shrink-0" />
        )}

        {/* Active Tool / Selection Context Indicator */}
        <div
          title={contextMeta.title}
          className="w-9 h-6 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/50 shrink-0 mb-0.5"
        >
          <ContextIcon className="w-3.5 h-3.5" />
        </div>

        {/* Dynamic Property Icons matched to Left Tool / Selection */}
        {sections.map((sec) => {
          const SecIcon = sec.icon;
          const isOpen = activePopoverId === sec.id;
          return (
            <button
              aria-label={sec.label}
              key={sec.id}
              ref={(el) => {
                railButtonRefs.current[sec.id] = el;
              }}
              title={sec.label}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const minTop = hideTopBar ? 8 : 54;
                setPopoverTop(Math.max(minTop, Math.min(Math.max(minTop, window.innerHeight - 360), Math.round(rect.top))));
                setActivePopoverId((prev) => (prev === sec.id ? null : sec.id));
              }}
              className={`relative w-9 h-[26px] lg:h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                isOpen
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <SecIcon className="w-4 h-4" />
              {sec.swatchColor && (
                <span
                  style={{ backgroundColor: sec.swatchColor }}
                  className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full border border-white dark:border-slate-900 shadow-xs pointer-events-none"
                />
              )}
              {sec.activeDot && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-slate-900 pointer-events-none" />
              )}
              {sec.badgeText ? (
                <span
                  className={`absolute -bottom-0.5 right-0 px-0.5 rounded text-[8px] font-mono font-bold leading-tight pointer-events-none ${
                    isOpen
                      ? 'bg-white text-blue-600'
                      : 'bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {sec.badgeText}
                </span>
              ) : (
                <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
              )}
            </button>
          );
        })}

        {hasSelection && (
          <>
            <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-0.5 shrink-0" />
            <button
              title="Duplicate Selected"
              aria-label="Duplicate selected"
              disabled={!canEdit}
              onClick={onDuplicateSelected}
              className="w-9 h-7 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              title="Delete Selected"
              aria-label="Delete selected"
              disabled={!canEdit}
              onClick={() => {
                setActivePopoverId(null);
                onDeleteObjects(Array.from(selectedIds));
              }}
              className="w-9 h-7 rounded-lg flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* Floating Popover to the left of the Right Rail (portaled outside glass-chrome + overflow-y-auto so never clipped) */}
        {activePopoverSection &&
          createPortal(
            <div
              data-properties-panel="true"
              onMouseDown={(e) => {
                if (!isEditingText) return;
                const tag = (e.target as HTMLElement).tagName;
                if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
                  e.preventDefault();
                }
              }}
              style={{ top: popoverTop, maxHeight: `calc(100dvh - ${popoverTop + 12}px)` }}
              className="fixed right-14 z-50 w-[304px] max-w-[calc(100vw-68px)] overflow-y-auto scrollbar-none bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 text-xs space-y-3"
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
                <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {ActivePopoverIcon && <ActivePopoverIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  <span className="truncate">{activePopoverSection.label}</span>
                </span>
                <button
                  onClick={() => setActivePopoverId(null)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {hasSelection ? (
                <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0 m-0 disabled:opacity-65">
                  {activePopoverSection.render()}
                </fieldset>
              ) : activePopoverSection.render()}
            </div>,
            document.body
          )}
      </div>
    );
  }

  return (
    <div
      data-properties-panel="true"
      onMouseDown={(e) => {
        if (!isEditingText) return;
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
          e.preventDefault();
        }
      }}
      className="w-full h-full bg-white dark:bg-slate-900 border-l border-slate-200/60 dark:border-slate-800/60 flex flex-col overflow-hidden pb-safe"
    >
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200/60 dark:border-slate-800/60 shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
          <Sliders className="w-3.5 h-3.5" /> Properties
        </span>
        <div className="flex items-center gap-1">
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              title="Collapse to Slim Icon Rail"
              className="hidden md:flex p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Close Inspector"
              className="lg:hidden flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
              <span className="md:hidden">Done</span>
            </button>
          )}
          {hideTopBar && onShowTopBar && (
            <button
              type="button"
              onClick={onShowTopBar}
              title="Show Top Bar (Ctrl+\)"
              aria-label="Show Top Bar"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0 transition-colors"
            >
              <PanelTopOpen className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 scrollbar-none text-xs">
        {/* Compact Active Context Header */}
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="w-7 h-7 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <ContextIcon className="w-3.5 h-3.5" />
          </div>
          <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">{contextMeta.title}</div>
        </div>

        {sections.map((sec, idx) => (
          <div
            key={sec.id}
            className={idx > 0 ? 'pt-3 border-t border-slate-200/60 dark:border-slate-800/60' : ''}
          >
            {hasSelection ? (
              <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0 m-0 disabled:opacity-65">
                {sec.render()}
              </fieldset>
            ) : sec.render()}
          </div>
        ))}
      </div>
    </div>
  );
};
