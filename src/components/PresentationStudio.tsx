import QRCode from 'qrcode';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  BarChart3,
  Bold,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Columns,
  Copy,
  Crop,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileUp,
  FlipHorizontal2,
  FlipVertical2,
  FunctionSquare,
  GitBranch,
  GripVertical,
  Hand,
  Hash,
  Heading1,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  LineChart,
  Lock,
  Maximize2,
  Minus,
  MonitorPlay,
  MousePointer2,
  NotebookPen,
  Palette,
  PanelTopOpen,
  Pause,
  Pen,
  Play,
  Plus,
  Pointer,
  QrCode,
  Redo2,
  RotateCcw,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Spline,
  StickyNote,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Type,
  Underline,
  Undo2,
  Unlock,
  Video,
  VideoOff,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AttachedFileMeta,
  BoardObject,
  BoardPage,
  ChartObject,
  GraphObject,
  ImageObject,
  LineEndpointStyle,
  ShapeKind,
  TableObject,
  ToolType,
} from '../types/smartboard';
import { getCachedImage, renderPageToContext, renderPageToDataUrl, renderPageToHiResDataUrl } from '../utils/canvasRenderer';
import { alignObjects, computeAspectPresetCrop, loadImageNaturalSize, scalePointsToBox, scalePointToBox, uid } from '../utils/geometry';
import { exportBoardPagesToPDF, exportPagesToPPTX } from '../utils/pdfPptx';
import { applyDefaultStyleToRichBlocks } from '../utils/richText';
import {
  adaptObjectsToTheme,
  buildLayoutObjects,
  detectThemeForPage,
  distributeSlideObjects,
  matchSizeSlideObjects,
  SLIDE_HEIGHT,
  SLIDE_LAYOUTS,
  SLIDE_THEMES,
  SLIDE_WIDTH,
  type SlideLayoutId,
  type SlideThemePreset,
} from '../utils/slideLayouts';
import { CanvasStage } from './CanvasStage';

type PresentationStudioProps = {
  pages: BoardPage[];
  activePageId: string;
  workspaceName: string;
  attachedFiles: AttachedFileMeta[];
  fullscreenPresenting: boolean;
  canEdit: boolean;
  selectedIds: Set<string>;
  onSelectIds: (ids: Set<string>) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isDarkApp?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onReorderZ?: (id: string, dir: 'front' | 'back' | 'forward' | 'backward') => void;
  onDuplicateSelected?: () => void;
  onExitFullscreen: () => void;
  onStartFullscreen: () => void;
  onSelectPage: (id: string) => void;
  onUpdatePage: (id: string, patch: Partial<BoardPage>) => void;
  onAddSlide: () => void;
  onAddSlideWithLayout?: (layoutId: SlideLayoutId, theme: SlideThemePreset) => void;
  onDuplicateSlide: (id: string) => void;
  onDeleteSlide: (id: string) => void;
  onReorderSlide: (id: string, dir: -1 | 1) => void;
  onMoveSlide?: (fromIdx: number, toIdx: number) => void;
  onApplyThemeToAll?: (theme: SlideThemePreset) => void;
  onApplyTransitionToAll?: (transition: BoardPage['transition']) => void;
  onApplySlideNumbers?: (footerText: string, includeNumbers: boolean, removeOnly?: boolean) => void;
  onOpenAISlides?: () => void;
  onOpenMathOrGraph?: (tab: 'equation' | 'graph', existingObj?: BoardObject) => void;
  onQuickAIAction?: (action: 'sketch_shape' | 'handwriting' | 'math_solve' | 'read_aloud') => void;
  onImportPPTXFile: (file: File) => void;
  onInsertObjectOnSlide: (obj: BoardObject) => void;
  onUpdateObject: (id: string, patch: Partial<BoardObject>, commitHistory?: boolean) => void;
  onDeleteObjects: (ids: string[]) => void;
  onSnapshotUndo?: () => void;
  onSyncPageState?: () => void;
  onReplacePageObjects?: (objects: BoardObject[], pushHistory?: boolean) => void;
  hideTopBar?: boolean;
  onShowTopBar?: () => void;
  /** Called when the presenter starts/stops broadcasting. Passes the broadcast room ID (or null to stop). */
  onBroadcast?: (broadcastId: string | null) => void;
  /** Called each time the presenter changes slides while broadcasting. */
  onBroadcastSlideChange?: (broadcastId: string, slideIndex: number) => void;
  /** Current broadcast room ID (non-null when actively broadcasting). */
  broadcastId?: string | null;
};

type LiveInkStroke = {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  isHighlighter: boolean;
};

type LaserDot = { x: number; y: number; ts: number };

type PopoverMenuId = 'shape' | 'lines' | 'color' | 'table' | 'chart' | 'layouts' | 'export';

const SHAPE_GALLERY: { kind: ShapeKind; label: string; iconSvg: React.ReactNode }[] = [
  {
    kind: 'rounded_rect',
    label: 'Card',
    iconSvg: <rect x="4" y="6" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.75" fill="none" />,
  },
  {
    kind: 'rectangle',
    label: 'Rectangle',
    iconSvg: <rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="1.75" fill="none" />,
  },
  {
    kind: 'circle',
    label: 'Circle',
    iconSvg: <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.75" fill="none" />,
  },
  {
    kind: 'flow_terminator',
    label: 'Pill',
    iconSvg: <rect x="3" y="7" width="18" height="10" rx="5" stroke="currentColor" strokeWidth="1.75" fill="none" />,
  },
  {
    kind: 'diamond',
    label: 'Diamond',
    iconSvg: <polygon points="12,4 20,12 12,20 4,12" stroke="currentColor" strokeWidth="1.75" fill="none" />,
  },
  {
    kind: 'triangle',
    label: 'Triangle',
    iconSvg: <polygon points="12,5 20,19 4,19" stroke="currentColor" strokeWidth="1.75" fill="none" />,
  },
  {
    kind: 'hexagon',
    label: 'Hexagon',
    iconSvg: <polygon points="7,5 17,5 21,12 17,19 7,19 3,12" stroke="currentColor" strokeWidth="1.75" fill="none" />,
  },
  {
    kind: 'block_arrow_right',
    label: 'Block Arrow',
    iconSvg: <polygon points="3,9 13,9 13,5 21,12 13,19 13,15 3,15" stroke="currentColor" strokeWidth="1.75" fill="none" />,
  },
  {
    kind: 'star',
    label: 'Star',
    iconSvg: (
      <polygon
        points="12,3.5 14.5,9 20.5,9.5 16,13.5 17.5,19.5 12,16.2 6.5,19.5 8,13.5 3.5,9.5 9.5,9"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
    ),
  },
  {
    kind: 'speech_bubble',
    label: 'Callout',
    iconSvg: (
      <path
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4v-4H6a2 2 0 0 1-2-2V6z"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
      />
    ),
  },
  {
    kind: 'flow_database',
    label: 'Cylinder',
    iconSvg: (
      <>
        <ellipse cx="12" cy="7" rx="7" ry="2.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M5 7v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </>
    ),
  },
  {
    kind: 'frame',
    label: 'Frame',
    iconSvg: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2" fill="none" />
        <line x1="4" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
  },
];

const QUICK_SWATCHES = ['#0F172A', '#FFFFFF', '#2563EB', '#0284C7', '#059669', '#D97706', '#DC2626', '#7C3AED'];

const FONT_OPTIONS = ['Plus Jakarta Sans', 'DM Sans', 'Inter', 'Merriweather', 'JetBrains Mono', 'Caveat', 'Kalam'];

const CHART_PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Cobalt Tech', colors: ['#2563EB', '#0EA5E9', '#059669', '#6366F1', '#D97706'] },
  { name: 'EmeraldMint', colors: ['#059669', '#10B981', '#14B8A6', '#0284C7', '#6366F1'] },
  { name: 'Sunset Warm', colors: ['#EA580C', '#D97706', '#DC2626', '#E11D48', '#7C3AED'] },
  { name: 'Violet Neon', colors: ['#7C3AED', '#A855F7', '#EC4899', '#2563EB', '#06B6D4'] },
  { name: 'Slate Mono', colors: ['#0F172A', '#334155', '#64748B', '#94A3B8', '#CBD5E1'] },
];

const IMAGE_MASKS: { id: ImageObject['mask']; label: string }[] = [
  { id: 'none', label: 'Full' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'circle', label: 'Circle' },
  { id: 'hex', label: 'Hexagon' },
  { id: 'star', label: 'Star' },
];

function normalizeSlideAnim(anim: BoardObject['slideAnim']): { effect: 'none' | 'fade' | 'slide-up' | 'zoom'; step: number } {
  if (!anim || anim === 'none') return { effect: 'none', step: 0 };
  if (typeof anim === 'string') return { effect: anim, step: 1 };
  return { effect: anim.effect || 'none', step: anim.step ?? 1 };
}

function getTransitionStyle(transition: BoardPage['transition'], entered: boolean): React.CSSProperties {
  if (!transition || transition === 'none') return {};
  if (transition === 'fade') {
    return { opacity: entered ? 1 : 0, transition: 'opacity 280ms ease-out' };
  }
  if (transition === 'slide') {
    return {
      opacity: entered ? 1 : 0.25,
      transform: entered ? 'translateX(0px)' : 'translateX(42px)',
      transition: 'opacity 280ms ease-out, transform 300ms cubic-bezier(0.22, 1, 0.36, 1)',
    };
  }
  if (transition === 'zoom') {
    return {
      opacity: entered ? 1 : 0.2,
      transform: entered ? 'scale(1)' : 'scale(0.95)',
      transition: 'opacity 280ms ease-out, transform 300ms cubic-bezier(0.22, 1, 0.36, 1)',
    };
  }
  if (transition === 'morph') {
    return {
      opacity: entered ? 1 : 0,
      transform: entered ? 'scale(1) translateY(0px)' : 'scale(1.04) translateY(-12px)',
      filter: entered ? 'blur(0px)' : 'blur(4px)',
      transition: 'opacity 380ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1), filter 350ms ease-out',
    };
  }
  return {};
}

function getBuildAnimStyle(effect: 'none' | 'fade' | 'slide-up' | 'zoom', entered: boolean): React.CSSProperties {
  if (effect === 'none') return {};
  if (effect === 'fade') {
    return {
      opacity: entered ? 1 : 0,
      transition: 'opacity 260ms ease-out',
    };
  }
  if (effect === 'slide-up') {
    return {
      opacity: entered ? 1 : 0,
      transform: entered ? 'translateY(0px)' : 'translateY(26px)',
      transition: 'opacity 260ms ease-out, transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
    };
  }
  return {
    opacity: entered ? 1 : 0,
    transform: entered ? 'scale(1)' : 'scale(0.92)',
    transition: 'opacity 240ms ease-out, transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
  };
}

const LayoutMiniPreview: React.FC<{ id: SlideLayoutId; accent: string }> = ({ id, accent }) => {
  switch (id) {
    case 'title_hero':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="8" y="10" width="16" height="4" rx="2" fill={accent} />
          <rect x="8" y="18" width="50" height="6" rx="1.5" fill="currentColor" opacity="0.82" />
          <rect x="8" y="27" width="38" height="3.5" rx="1" fill="currentColor" opacity="0.35" />
          <circle cx="67" cy="22" r="8" fill={accent} opacity="0.2" />
        </svg>
      );
    case 'section_divider':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="8" y="12" width="12" height="8" rx="1" fill={accent} opacity="0.28" />
          <rect x="8" y="23" width="48" height="5" rx="1.5" fill="currentColor" opacity="0.85" />
          <rect x="8" y="31" width="18" height="2" rx="1" fill={accent} />
        </svg>
      );
    case 'agenda_outline':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="6" y="6" width="34" height="4" rx="1" fill="currentColor" opacity="0.8" />
          {[14, 21, 28, 35].map((y) => (
            <g key={y}>
              <rect x="6" y={y} width="6" height="4" rx="1" fill={accent} />
              <rect x="15" y={y} width="56" height="4" rx="1" fill="currentColor" opacity="0.16" />
            </g>
          ))}
        </svg>
      );
    case 'two_column':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="6" y="6" width="38" height="4" rx="1" fill="currentColor" opacity="0.8" />
          <rect x="6" y="13" width="32" height="26" rx="2" fill="currentColor" opacity="0.12" stroke={accent} strokeWidth="0.6" />
          <rect x="42" y="13" width="32" height="26" rx="2" fill="currentColor" opacity="0.12" stroke={accent} strokeWidth="0.6" />
        </svg>
      );
    case 'kpi_cards':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="6" y="6" width="40" height="4" rx="1" fill="currentColor" opacity="0.8" />
          {[6, 29, 52].map((x) => (
            <g key={x}>
              <rect x={x} y="14" width="21" height="24" rx="2" fill="currentColor" opacity="0.1" stroke={accent} strokeWidth="0.6" />
              <rect x={x + 3} y="18" width="11" height="5" rx="1" fill={accent} />
              <rect x={x + 3} y="26" width="15" height="2.5" rx="0.5" fill="currentColor" opacity="0.35" />
            </g>
          ))}
        </svg>
      );
    case 'timeline_roadmap':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="6" y="6" width="36" height="4" rx="1" fill="currentColor" opacity="0.8" />
          <line x1="12" y1="24" x2="68" y2="24" stroke={accent} strokeWidth="1.5" />
          {[14, 31, 49, 66].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="24" r="3" fill={accent} />
              <rect x={cx - 6} y="29" width="12" height="8" rx="1" fill="currentColor" opacity="0.14" />
            </g>
          ))}
        </svg>
      );
    case 'comparison_table':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="6" y="6" width="34" height="4" rx="1" fill="currentColor" opacity="0.8" />
          <rect x="6" y="13" width="68" height="5" rx="1" fill={accent} />
          <rect x="6" y="19" width="68" height="19" rx="1" fill="currentColor" opacity="0.1" />
          <line x1="28" y1="13" x2="28" y2="38" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.8" />
          <line x1="51" y1="13" x2="51" y2="38" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.8" />
        </svg>
      );
    case 'visual_split':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="6" y="6" width="36" height="4" rx="1" fill="currentColor" opacity="0.8" />
          <rect x="6" y="15" width="30" height="4" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="6" y="22" width="26" height="4" rx="1" fill="currentColor" opacity="0.25" />
          <rect x="42" y="13" width="32" height="25" rx="2" fill="currentColor" opacity="0.1" stroke={accent} strokeWidth="0.6" />
          <rect x="47" y="26" width="4" height="9" fill={accent} />
          <rect x="54" y="20" width="4" height="15" fill={accent} />
          <rect x="61" y="17" width="4" height="18" fill={accent} />
        </svg>
      );
    case 'media_spotlight':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="6" y="7" width="34" height="31" rx="2.5" fill={accent} opacity="0.18" stroke={accent} strokeWidth="0.8" />
          <polygon points="17,27 23,19 29,27" fill={accent} opacity="0.7" />
          <rect x="45" y="10" width="27" height="5" rx="1" fill="currentColor" opacity="0.8" />
          <rect x="45" y="18" width="25" height="3" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="45" y="24" width="22" height="3" rx="1" fill="currentColor" opacity="0.25" />
        </svg>
      );
    case 'quote_spotlight':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="14" y="14" width="52" height="4" rx="1" fill="currentColor" opacity="0.8" />
          <rect x="20" y="21" width="40" height="4" rx="1" fill="currentColor" opacity="0.7" />
          <rect x="30" y="30" width="20" height="3" rx="1" fill={accent} />
        </svg>
      );
    case 'blank':
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
      );
    default: // title_content
      return (
        <svg viewBox="0 0 80 45" className="w-full aspect-video rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <rect x="6" y="6" width="42" height="4.5" rx="1" fill="currentColor" opacity="0.82" />
          <rect x="6" y="12" width="12" height="1.5" rx="0.7" fill={accent} />
          <rect x="6" y="16" width="68" height="22" rx="2" fill="currentColor" opacity="0.1" />
        </svg>
      );
  }
};

export const PresentationStudio: React.FC<PresentationStudioProps> = ({
  pages,
  activePageId,
  workspaceName,
  fullscreenPresenting,
  canEdit,
  selectedIds,
  onSelectIds,
  canUndo = false,
  canRedo = false,
  isDarkApp = false,
  onUndo,
  onRedo,
  onReorderZ,
  onDuplicateSelected,
  onExitFullscreen,
  onStartFullscreen,
  onSelectPage,
  onUpdatePage,
  onAddSlide,
  onAddSlideWithLayout,
  onDuplicateSlide,
  onDeleteSlide,
  onReorderSlide,
  onMoveSlide,
  onApplyThemeToAll,
  onApplyTransitionToAll,
  onApplySlideNumbers,
  onOpenAISlides,
  onOpenMathOrGraph,
  onQuickAIAction,
  onImportPPTXFile,
  onInsertObjectOnSlide,
  onUpdateObject,
  onDeleteObjects,
  onSnapshotUndo,
  onSyncPageState,
  onReplacePageObjects,
  hideTopBar = false,
  onShowTopBar,
  onBroadcast,
  onBroadcastSlideChange,
  broadcastId,
}) => {
  const activeIdx = Math.max(0, pages.findIndex((p) => p.id === activePageId));
  const activeSlide = pages[activeIdx] || pages[0];
  const nextSlide = pages[activeIdx + 1];
  const activeTheme = useMemo(() => (activeSlide ? detectThemeForPage(activeSlide) : SLIDE_THEMES[0]), [activeSlide]);

  // Editor Studio state
  const [slideTool, setSlideTool] = useState<ToolType>('select');
  const [slideShapeKind, setSlideShapeKind] = useState<ShapeKind>('rounded_rect');
  const [strokeColor, setStrokeColor] = useState('#2563EB');
  const [fillColor, setFillColor] = useState('#FFFFFF');
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.68);
  const [panX, setPanX] = useState(60);
  const [panY, setPanY] = useState(32);
  const [manualViewport, setManualViewport] = useState(false);
  const [showSafeMargins, setShowSafeMargins] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'design' | 'element' | 'animate'>('design');
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [filmstripOpen, setFilmstripOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024
  );
  const [inspectorOpen, setInspectorOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024
  );
  useEffect(() => {
    let compact = window.innerWidth < 1024;
    const onResize = () => {
      const nextCompact = window.innerWidth < 1024;
      if (nextCompact === compact) return;
      compact = nextCompact;
      setFilmstripOpen(!nextCompact);
      setInspectorOpen(!nextCompact);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [footerLabelInput, setFooterLabelInput] = useState(workspaceName);
  // Slide Master
  const [slideMaster, setSlideMaster] = useState<{ bgColor: string; fontFamily: string; accentColor: string }>({
    bgColor: '#ffffff',
    fontFamily: 'DM Sans',
    accentColor: '#2563EB',
  });

  // Anchored Popover menus
  const [openMenu, setOpenMenu] = useState<PopoverMenuId | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 160, top: 96 });
  const [tableHover, setTableHover] = useState<{ r: number; c: number }>({ r: 3, c: 4 });
  const [applyLayoutMode, setApplyLayoutMode] = useState<'current' | 'new'>('current');
  const [dragSlideIdx, setDragSlideIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const [transitionPreview, setTransitionPreview] = useState<BoardPage['transition'] | null>(null);
  const [transitionPreviewEntered, setTransitionPreviewEntered] = useState(false);
  const transitionPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modals / Views
  const [showGridOverview, setShowGridOverview] = useState(false);
  const [showQRJoin, setShowQRJoin] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Live Presentation / Presenter View state
  const [presenterView, setPresenterView] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [notesFontSize, setNotesFontSize] = useState(16);
  const [liveTool, setLiveTool] = useState<'laser' | 'spotlight' | 'pen' | 'highlighter' | 'eraser'>('laser');
  const [liveColor, setLiveColor] = useState('#EF4444');
  const [liveStrokes, setLiveStrokes] = useState<Record<string, LiveInkStroke[]>>({});
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [laserTrail, setLaserTrail] = useState<LaserDot[]>([]);
  const [screenCover, setScreenCover] = useState<'none' | 'black' | 'white'>('none');
  const [buildStep, setBuildStep] = useState(0);
  const [buildStepEntered, setBuildStepEntered] = useState(true);
  const [liveBaseTick, setLiveBaseTick] = useState(0);
  const [slideEntered, setSlideEntered] = useState(true);
  const [webcamOn, setWebcamOn] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pptxInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<LiveInkStroke | null>(null);
  const liveErasingRef = useRef(false);
  const liveBaseCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveBuildCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveInkCanvasRef = useRef<HTMLCanvasElement>(null);
  const thumbCacheRef = useRef<Map<string, { sig: string; url: string }>>(new Map());
  const prevFullscreenRef = useRef(false);
  const liveStrokesRef = useRef(liveStrokes);

  useEffect(() => { liveStrokesRef.current = liveStrokes; }, [liveStrokes]);

  const selectedObjects = useMemo(
    () => (activeSlide ? activeSlide.objects.filter((o) => selectedIds.has(o.id)) : []),
    [activeSlide, selectedIds]
  );
  const primarySelected = selectedObjects.length === 1 ? selectedObjects[0] : null;

  // Clear inline crop handle if selection moves away
  useEffect(() => {
    if (croppingId && !selectedIds.has(croppingId)) {
      setCroppingId(null);
    }
  }, [croppingId, selectedIds]);

  const applyImageCropPreset = useCallback(
    async (obj: ImageObject, aspectRatio: number | null) => {
      const cached = getCachedImage(obj.src);
      const dims =
        cached && cached.naturalWidth > 0
          ? { w: cached.naturalWidth, h: cached.naturalHeight }
          : await loadImageNaturalSize(obj.src);
      onUpdateObject(obj.id, computeAspectPresetCrop(obj, dims.w, dims.h, aspectRatio), true);
    },
    [onUpdateObject]
  );

  // Automatically switch Inspector to Element tab when user selects an object on canvas
  useEffect(() => {
    if (selectedObjects.length > 0 && inspectorTab === 'design') {
      setInspectorTab('element');
    }
  }, [selectedObjects.length, inspectorTab]);

  // Open an anchored popover aligned cleanly underneath its trigger button
  const toggleAnchoredMenu = useCallback(
    (menu: PopoverMenuId, el: HTMLElement, widthPx = 280) => {
      if (openMenu === menu) {
        setOpenMenu(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const effectiveW = Math.min(widthPx, Math.max(200, vw - 16));
      const clampedLeft = Math.max(8, Math.min(Math.max(8, vw - effectiveW - 8), rect.left));
      const clampedTop = Math.max(8, Math.min(Math.max(8, vh - 180), rect.bottom + 6));
      setMenuPos({ left: Math.round(clampedLeft), top: Math.round(clampedTop) });
      setOpenMenu(menu);
    },
    [openMenu]
  );

  // Auto-fit 1280x720 artboard cleanly into the stage container
  const fitArtboardToStage = useCallback(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) return;
    const padX = 56;
    const padY = 48;
    const nextZoom = Math.max(
      0.24,
      Math.min(1.35, Math.min((rect.width - padX) / SLIDE_WIDTH, (rect.height - padY) / SLIDE_HEIGHT))
    );
    const nextPanX = Math.round((rect.width - SLIDE_WIDTH * nextZoom) / 2);
    const nextPanY = Math.round((rect.height - SLIDE_HEIGHT * nextZoom) / 2);
    setZoom(Number(nextZoom.toFixed(3)));
    setPanX(nextPanX);
    setPanY(nextPanY);
  }, []);

  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el || fullscreenPresenting) return;
    if (!manualViewport) fitArtboardToStage();
    const ro = new ResizeObserver(() => {
      if (!manualViewport) fitArtboardToStage();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitArtboardToStage, fullscreenPresenting, manualViewport, filmstripOpen, inspectorOpen, showNotesDrawer]);

  // Refit whenever switching slides unless manually zoomed
  useEffect(() => {
    if (!manualViewport && !fullscreenPresenting) {
      fitArtboardToStage();
    }
  }, [activePageId, fitArtboardToStage, fullscreenPresenting, manualViewport]);

  // Studio Keyboard Shortcuts (Editor Mode only; Escape also closes menus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setCroppingId(null);
        if (!fullscreenPresenting) setShowGridOverview(false);
        return;
      }
      if (fullscreenPresenting) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest?.('[contenteditable="true"]'))
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'PageDown') {
        if (activeIdx < pages.length - 1) {
          e.preventDefault();
          onSelectPage(pages[activeIdx + 1].id);
        }
        return;
      }
      if (e.key === 'PageUp') {
        if (activeIdx > 0) {
          e.preventDefault();
          onSelectPage(pages[activeIdx - 1].id);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'v') setSlideTool('select');
      else if (k === 'h') setSlideTool('hand');
      else if (k === 'p') setSlideTool('pen');
      else if (k === 'k') setSlideTool('highlighter');
      else if (k === 'e') setSlideTool('eraser_stroke');
      else if (k === 'l') setSlideTool('arrow');
      else if (k === 'c') setSlideTool('connector');
      else if (k === 't') setSlideTool('text');
      else if (k === '=' || k === '+') {
        setManualViewport(true);
        setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))));
      } else if (k === '-') {
        setManualViewport(true);
        setZoom((z) => Math.max(0.2, Number((z - 0.1).toFixed(2))));
      } else if (k === '0') {
        setManualViewport(false);
        fitArtboardToStage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, fitArtboardToStage, fullscreenPresenting, onSelectPage, pages]);

  // Acquire & release real webcam MediaStream for Presenter Webcam PiP
  useEffect(() => {
    const stopStream = () => {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        webcamStreamRef.current = null;
      }
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = null;
      }
    };

    if (!webcamOn || !fullscreenPresenting) {
      stopStream();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamOn(false);
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        webcamStreamRef.current = stream;
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          void webcamVideoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setWebcamOn(false);
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [webcamOn, fullscreenPresenting]);

  // Generate real QR code data URL when Audience QR modal opens
  useEffect(() => {
    if (!showQRJoin) return;
    const joinUrl = typeof window !== 'undefined' ? window.location.href : 'https://luminaboard.app';
    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [showQRJoin]);

  // Cached 16:9 (1280x720) thumbnail renderer for filmstrip, overview, presenter preview
  const renderSlideCached = useCallback((slide: BoardPage, w: number, h: number) => {
    const objSig = (o: BoardObject): string => {
      const base = `${o.id}:${o.type}:${Math.round(o.x)}:${Math.round(o.y)}:${Math.round(o.width)}:${Math.round(o.height)}:${Math.round(o.rotation)}:${o.opacity}:${o.hidden ? 1 : 0}:${o.zIndex}:${o.flipX ? 1 : 0}:${o.flipY ? 1 : 0}`;
      switch (o.type) {
        case 'text':
          return `${base}:${o.text}:${o.textColor}:${o.bgColor}:${o.highlightColor || ''}:${o.borderColor || ''}:${o.borderWidth || 0}:${o.borderRadius || 0}:${o.fontFamily}:${o.fontSize}:${o.fontWeight}:${o.fontStyle}:${o.underline ? 1 : 0}:${o.strikethrough ? 1 : 0}:${o.textAlign}:${o.lineHeight || ''}:${o.padding ?? ''}:${o.richBlocks ? JSON.stringify(o.richBlocks) : ''}`;
        case 'shape':
          return `${base}:${o.shapeKind}:${o.fill}:${o.fillStyle || ''}:${o.fillGradient?.from || ''}-${o.fillGradient?.to || ''}-${o.fillGradient?.angle ?? 45}:${o.stroke}:${o.strokeWidth}:${o.lineStyle || ''}:${o.cornerRadius ?? ''}:${o.shadow ? 1 : 0}:${o.text}:${o.textColor}:${o.fontFamily}:${o.fontSize}:${o.fontWeight}:${o.fontStyle}:${o.textAlign}:${o.verticalAlign || ''}`;
        case 'sticky':
          return `${base}:${o.text}:${o.noteColor}:${o.textColor}:${o.noteStyle || ''}:${o.fontFamily}:${o.fontSize}:${o.fontWeight || ''}:${o.fontStyle || ''}:${o.underline ? 1 : 0}:${o.strikethrough ? 1 : 0}:${o.textAlign || ''}:${o.author}:${o.richBlocks ? JSON.stringify(o.richBlocks) : ''}`;
        case 'image':
          return `${base}:${o.src.length}:${o.src.slice(0, 24)}:${o.src.slice(-24)}:${o.mask}:${JSON.stringify(o.filters)}:${o.crop ? `${o.crop.sx},${o.crop.sy},${o.crop.sw},${o.crop.sh}` : ''}`;
        case 'table':
          return `${base}:${o.rows}x${o.cols}:${o.headerBg}:${o.borderColor}:${o.textColor}:${JSON.stringify(o.cells)}:${JSON.stringify(o.colWidths || '')}:${JSON.stringify(o.rowHeights || '')}:${JSON.stringify(o.cellAlign || '')}`;
        case 'chart':
          return `${base}:${o.chartType}:${o.title}:${o.labels.join(',')}:${o.values.join(',')}:${o.colors.join(',')}`;
        case 'math':
          return `${base}:${o.latex}:${o.color}:${o.bgColor}:${o.fontSize}`;
        case 'graph':
          return `${base}:${o.mode}:${o.title || ''}:${o.xMin}:${o.xMax}:${o.yMin}:${o.yMax}:${o.showGrid ? 1 : 0}:${o.showDerivative ? 1 : 0}:${JSON.stringify(o.expressions)}`;
        case 'line':
          return `${base}:${o.stroke}:${o.strokeWidth}:${o.lineStyle}:${o.startHead}:${o.endHead}:${o.curved ? 1 : 0}:${o.cpX ?? ''}:${o.cpY ?? ''}:${o.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';')}`;
        case 'connector':
          return `${base}:${o.routeType}:${o.stroke}:${o.strokeWidth}:${o.lineStyle}:${o.startHead}:${o.endHead}:${o.label || ''}:${Math.round(o.x1)},${Math.round(o.y1)}-${Math.round(o.x2)},${Math.round(o.y2)}:${o.waypoints ? JSON.stringify(o.waypoints) : ''}`;
        case 'stroke': {
          const midPt = o.points[Math.floor(o.points.length / 2)];
          return `${base}:${o.brushKind}:${o.stroke}:${o.strokeWidth}:${o.lineStyle}:${o.points.length}:${Math.round(o.points[0]?.x ?? 0)},${Math.round(o.points[0]?.y ?? 0)}:${Math.round(midPt?.x ?? 0)},${Math.round(midPt?.y ?? 0)}:${Math.round(o.points[o.points.length - 1]?.x ?? 0)},${Math.round(o.points[o.points.length - 1]?.y ?? 0)}`;
        }
        default:
          return base;
      }
    };
    const sig = `${slide.id}:${w}:${h}:${slide.background}:${slide.slideGradient?.from || ''}:${slide.slideGradient?.to || ''}:${slide.slideGradient?.angle || 135}:${slide.gridType}:${slide.objects.length}:${slide.objects.map(objSig).join('|')}`;
    const cacheKey = `${slide.id}-${w}`;
    const existing = thumbCacheRef.current.get(cacheKey);
    if (existing && existing.sig === sig) return existing.url;
    const url = renderPageToDataUrl(slide, w, h, 'image/png', 0.9, undefined, {
      viewportBox: {
        minX: 0,
        minY: 0,
        contentW: SLIDE_WIDTH,
        contentH: SLIDE_HEIGHT,
        scale: w / SLIDE_WIDTH,
      },
    });
    if (thumbCacheRef.current.size >= 120) {
      const oldestKey = thumbCacheRef.current.keys().next().value;
      if (oldestKey) thumbCacheRef.current.delete(oldestKey);
    }
    thumbCacheRef.current.set(cacheKey, { sig, url });
    return url;
  }, []);

  // Active sorted build steps on current slide (avoids dead clicks if steps have gaps)
  const buildSteps = useMemo(() => {
    if (!activeSlide) return [];
    const set = new Set<number>();
    for (const o of activeSlide.objects) {
      const { effect, step } = normalizeSlideAnim(o.slideAnim);
      if (effect !== 'none' && step > 0) set.add(step);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [activeSlide]);

  const maxBuildStep = buildSteps.length > 0 ? buildSteps[buildSteps.length - 1] : 0;

  const currentStepEffect = useMemo<'none' | 'fade' | 'slide-up' | 'zoom'>(() => {
    if (!activeSlide || buildStep <= 0) return 'none';
    for (const o of activeSlide.objects) {
      const { effect, step } = normalizeSlideAnim(o.slideAnim);
      if (effect !== 'none' && step === buildStep) return effect;
    }
    return 'fade';
  }, [activeSlide, buildStep]);

  useEffect(() => {
    setBuildStep(0);
    setBuildStepEntered(true);
    setScreenCover('none');
    setSlideEntered(false);
    const raf = requestAnimationFrame(() => setSlideEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [activePageId, fullscreenPresenting]);

  useEffect(() => {
    if (buildStep <= 0) {
      setBuildStepEntered(true);
      return;
    }
    setBuildStepEntered(false);
    const raf = requestAnimationFrame(() => setBuildStepEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [buildStep]);

  // Fade laser trail dots automatically
  useEffect(() => {
    if (!fullscreenPresenting || laserTrail.length === 0) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 650;
      setLaserTrail((prev) => prev.filter((pt) => pt.ts > cutoff));
    }, 50);
    return () => window.clearInterval(timer);
  }, [fullscreenPresenting, laserTrail.length]);

  // Broadcast current slide index to audience viewers when slide changes
  useEffect(() => {
    if (!fullscreenPresenting || !broadcastId || !onBroadcastSlideChange) return;
    onBroadcastSlideChange(broadcastId, activeIdx);
  }, [fullscreenPresenting, broadcastId, activeIdx, onBroadcastSlideChange]);

  // Auto-save live ink strokes when exiting fullscreen presentation
  useEffect(() => {
    const wasFullscreen = prevFullscreenRef.current;
    prevFullscreenRef.current = fullscreenPresenting;
    if (wasFullscreen && !fullscreenPresenting && canEdit) {
      const allStrokes = liveStrokesRef.current;
      for (const [slideId, strokes] of Object.entries(allStrokes)) {
        if (!strokes || strokes.length === 0) continue;
        const slide = pages.find((p) => p.id === slideId);
        if (!slide) continue;
        const baseZ = slide.objects.reduce((m, o) => Math.max(m, o.zIndex), slide.objects.length);
        const created: BoardObject[] = [];
        for (const s of strokes) {
          if (!s || !Array.isArray(s.points) || s.points.length < 2) continue;
          const pts = s.points.map((p) => ({
            x: Math.round(p.x * SLIDE_WIDTH),
            y: Math.round(p.y * SLIDE_HEIGHT),
            p: 0.7,
          }));
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          created.push({
            id: uid('stroke'),
            name: s.isHighlighter ? 'Slide Highlight' : 'Slide Annotation',
            type: 'stroke',
            x: minX,
            y: minY,
            width: Math.max(8, maxX - minX),
            height: Math.max(8, maxY - minY),
            rotation: 0,
            opacity: s.isHighlighter ? 0.42 : 1,
            locked: false,
            hidden: false,
            zIndex: baseZ + created.length + 1,
            points: pts,
            brushKind: s.isHighlighter ? 'highlighter' : 'pen',
            stroke: s.color,
            strokeWidth: s.width,
            lineStyle: 'solid',
            smoothing: 0.5,
            stabilization: 0.4,
          });
        }
        for (const obj of created) onInsertObjectOnSlide(obj);
      }
      setLiveStrokes({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreenPresenting]);

  // Presentation elapsed timer + live wall clock
  useEffect(() => {
    if (!fullscreenPresenting) {
      setElapsedSec(0);
      setTimerPaused(false);
      return;
    }
    const timer = window.setInterval(() => {
      if (!timerPaused) setElapsedSec((s) => s + 1);
      setClockText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [fullscreenPresenting, timerPaused]);

  const handleNextStepOrSlide = useCallback(() => {
    const nextStep = buildSteps.find((s) => s > buildStep);
    if (nextStep !== undefined) {
      setBuildStep(nextStep);
    } else if (activeIdx < pages.length - 1) {
      onSelectPage(pages[activeIdx + 1].id);
    }
  }, [buildStep, buildSteps, activeIdx, pages, onSelectPage]);

  const handlePrevSlide = useCallback(() => {
    if (buildStep > 0) {
      const prevSteps = buildSteps.filter((s) => s < buildStep);
      setBuildStep(prevSteps.length > 0 ? prevSteps[prevSteps.length - 1] : 0);
    } else if (activeIdx > 0) {
      onSelectPage(pages[activeIdx - 1].id);
    }
  }, [buildStep, buildSteps, activeIdx, pages, onSelectPage]);

  // Auto-advance timer if slideDurationSec > 0 (respects pause & build steps)
  useEffect(() => {
    if (!fullscreenPresenting || timerPaused || !activeSlide?.slideDurationSec || activeSlide.slideDurationSec <= 0) return;
    if (buildStep >= maxBuildStep && activeIdx >= pages.length - 1) return;
    const t = window.setTimeout(() => {
      handleNextStepOrSlide();
    }, activeSlide.slideDurationSec * 1000);
    return () => window.clearTimeout(t);
  }, [fullscreenPresenting, timerPaused, activeSlide, activeIdx, pages.length, buildStep, maxBuildStep, handleNextStepOrSlide]);

  // Presentation Keyboard Controls
  useEffect(() => {
    if (!fullscreenPresenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        if (activeSlide?.slideDurationSec && activeSlide.slideDurationSec > 0) {
          setTimerPaused((p) => !p);
        } else {
          setScreenCover('none');
          handleNextStepOrSlide();
        }
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setScreenCover('none');
        handleNextStepOrSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setScreenCover('none');
        handlePrevSlide();
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (pages[0]) onSelectPage(pages[0].id);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (pages[pages.length - 1]) onSelectPage(pages[pages.length - 1].id);
      } else if (e.key === 'Escape') {
        if (showGridOverview) setShowGridOverview(false);
        else if (screenCover !== 'none') setScreenCover('none');
        else onExitFullscreen();
      } else if (e.key === 'g' || e.key === 'G') {
        setShowGridOverview((v) => !v);
      } else if (e.key === 'b' || e.key === 'B') {
        setScreenCover((c) => (c === 'black' ? 'none' : 'black'));
      } else if (e.key === 'w' || e.key === 'W') {
        setScreenCover((c) => (c === 'white' ? 'none' : 'white'));
      } else if (e.key === '1') {
        setLiveTool('laser');
      } else if (e.key === '2') {
        setLiveTool('spotlight');
      } else if (e.key === '3') {
        setLiveTool('pen');
      } else if (e.key === '4') {
        setLiveTool('highlighter');
      } else if (e.key === '5') {
        setLiveTool('eraser');
      } else if (e.key === 'n' || e.key === 'N') {
        setPresenterView((v) => !v);
      } else if ((e.key === 'c' || e.key === 'C') && activeSlide) {
        setLiveStrokes((prev) => ({ ...prev, [activeSlide.id]: [] }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSlide, fullscreenPresenting, handleNextStepOrSlide, handlePrevSlide, onExitFullscreen, onSelectPage, pages, screenCover, showGridOverview]);

  // Synchronous flicker-free Live Mode base + build-step renderer
  useEffect(() => {
    if (!fullscreenPresenting || !activeSlide || !liveBaseCanvasRef.current) return;
    const baseCanvas = liveBaseCanvasRef.current;
    const baseCtx = baseCanvas.getContext('2d');
    if (!baseCtx) return;

    const baseVisibleIds = new Set<string>();
    const stepVisibleIds = new Set<string>();
    for (const o of activeSlide.objects) {
      const { effect, step } = normalizeSlideAnim(o.slideAnim);
      if (effect === 'none') {
        baseVisibleIds.add(o.id);
      } else if (buildStep > 0 && step === buildStep) {
        stepVisibleIds.add(o.id);
      } else if (step < buildStep || (buildStep === 0 && step === 0)) {
        baseVisibleIds.add(o.id);
      }
    }

    const viewportBox = {
      minX: 0,
      minY: 0,
      contentW: SLIDE_WIDTH,
      contentH: SLIDE_HEIGHT,
      scale: 1,
    };

    renderPageToContext(baseCtx, activeSlide, SLIDE_WIDTH, SLIDE_HEIGHT, undefined, {
      visibleIds: baseVisibleIds,
      viewportBox,
      onImageLoaded: () => setLiveBaseTick((t) => t + 1),
    });

    const buildCanvas = liveBuildCanvasRef.current;
    if (buildCanvas) {
      const buildCtx = buildCanvas.getContext('2d');
      if (buildCtx) {
        if (stepVisibleIds.size > 0) {
          renderPageToContext(buildCtx, activeSlide, SLIDE_WIDTH, SLIDE_HEIGHT, undefined, {
            visibleIds: stepVisibleIds,
            transparentBg: true,
            viewportBox,
            onImageLoaded: () => setLiveBaseTick((t) => t + 1),
          });
        } else {
          buildCtx.clearRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
        }
      }
    }
  }, [fullscreenPresenting, activeSlide, buildStep, liveBaseTick]);

  // Instant zero-flicker Live Ink overlay renderer (decoupled from slide canvas)
  useEffect(() => {
    if (!fullscreenPresenting || !activeSlide || !liveInkCanvasRef.current) return;
    const canvas = liveInkCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const strokes = liveStrokes[activeSlide.id] || [];
    for (const s of strokes) {
      if (!s || !Array.isArray(s.points) || s.points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = s.isHighlighter ? 0.35 : 0.92;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x * canvas.width, s.points[0].y * canvas.height);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x * canvas.width, s.points[i].y * canvas.height);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [fullscreenPresenting, activeSlide, liveStrokes]);

  const eraseLiveStrokesAt = useCallback((slideId: string, nx: number, ny: number) => {
    const thresholdSq = 0.025 * 0.025;
    setLiveStrokes((prev) => {
      const list = prev[slideId];
      if (!list || list.length === 0) return prev;
      const filtered = list.filter(
        (s) =>
          !Array.isArray(s?.points) ||
          !s.points.some((pt) => (pt.x - nx) * (pt.x - nx) + (pt.y - ny) * (pt.y - ny) <= thresholdSq)
      );
      if (filtered.length === list.length) return prev;
      return { ...prev, [slideId]: filtered };
    });
  }, []);

  const handleSaveLiveInkToSlide = () => {
    if (!activeSlide || !canEdit) return;
    const strokes = liveStrokes[activeSlide.id] || [];
    if (strokes.length === 0) return;
    const baseZ = activeSlide.objects.reduce((m, o) => Math.max(m, o.zIndex), activeSlide.objects.length);
    const created: BoardObject[] = [];
    for (const s of strokes) {
      if (!s || !Array.isArray(s.points) || s.points.length < 2) continue;
      const pts = s.points.map((p) => ({
        x: Math.round(p.x * SLIDE_WIDTH),
        y: Math.round(p.y * SLIDE_HEIGHT),
        p: 0.7,
      }));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      created.push({
        id: uid('stroke'),
        name: s.isHighlighter ? 'Slide Highlight' : 'Slide Annotation',
        type: 'stroke',
        x: minX,
        y: minY,
        width: Math.max(8, maxX - minX),
        height: Math.max(8, maxY - minY),
        rotation: 0,
        opacity: s.isHighlighter ? 0.42 : 1,
        locked: false,
        hidden: false,
        zIndex: baseZ + created.length + 1,
        points: pts,
        brushKind: s.isHighlighter ? 'highlighter' : 'pen',
        stroke: s.color,
        strokeWidth: s.width,
        lineStyle: 'solid',
        smoothing: 0.5,
        stabilization: 0.4,
      });
    }
    if (created.length > 0) {
      if (onReplacePageObjects) {
        onReplacePageObjects([...activeSlide.objects, ...created], true);
      } else {
        for (const obj of created) onInsertObjectOnSlide(obj);
      }
    }
    setLiveStrokes((prev) => ({ ...prev, [activeSlide.id]: [] }));
  };

  const updateTextOrStickyStyle = useCallback(
    (obj: BoardObject, patch: Record<string, unknown>, recordUndo = true) => {
      const nextPatch: Record<string, unknown> = { ...patch };
      if ((obj.type === 'text' || obj.type === 'sticky') && obj.richBlocks && obj.richBlocks.length > 0) {
        const richStyle: {
          color?: string;
          highlight?: string;
          bold?: boolean;
          italic?: boolean;
          underline?: boolean;
          strike?: boolean;
          align?: 'left' | 'center' | 'right' | 'justify';
        } = {};
        if (typeof patch.textColor === 'string') richStyle.color = patch.textColor;
        if (typeof patch.highlightColor === 'string') richStyle.highlight = patch.highlightColor;
        if (typeof patch.fontWeight === 'string') richStyle.bold = patch.fontWeight === 'bold';
        if (typeof patch.fontStyle === 'string') richStyle.italic = patch.fontStyle === 'italic';
        if (typeof patch.underline === 'boolean') richStyle.underline = patch.underline;
        if (typeof patch.strikethrough === 'boolean') richStyle.strike = patch.strikethrough;
        if (typeof patch.textAlign === 'string') {
          richStyle.align = patch.textAlign as 'left' | 'center' | 'right' | 'justify';
        }
        if (Object.keys(richStyle).length > 0) {
          nextPatch.richBlocks = applyDefaultStyleToRichBlocks(obj.richBlocks, richStyle);
        }
      }
      onUpdateObject(obj.id, nextPatch as Partial<BoardObject>, recordUndo);
    },
    [onUpdateObject]
  );

  // --- Recolor Selected Object(s) + Active Stroke Color ---
  const handleSelectColorSwatch = useCallback(
    (hex: string) => {
      setStrokeColor(hex);
      if (!canEdit || selectedObjects.length === 0) return;
      onSnapshotUndo?.();
      for (const obj of selectedObjects) {
        if (obj.locked) continue;
        if (obj.type === 'text' || obj.type === 'sticky') updateTextOrStickyStyle(obj, { textColor: hex }, false);
        else if (obj.type === 'shape' || obj.type === 'stroke' || obj.type === 'line' || obj.type === 'connector') {
          onUpdateObject(obj.id, { stroke: hex }, false);
        } else if (obj.type === 'math') {
          onUpdateObject(obj.id, { color: hex }, false);
        }
      }
      onSyncPageState?.();
    },
    [canEdit, onSnapshotUndo, onSyncPageState, onUpdateObject, selectedObjects, updateTextOrStickyStyle]
  );

  // --- Insert Helpers (Positioned neatly inside the 1280x720 Artboard) ---
  const cascadeOffset = (activeSlide?.objects.length || 0) % 5;

  const handleQuickInsertText = (variant: 'heading' | 'body') => {
    if (!canEdit || !activeSlide) return;
    const isHeading = variant === 'heading';
    const obj: BoardObject = {
      id: uid('text'),
      name: isHeading ? 'Slide Heading' : 'Text Block',
      type: 'text',
      x: 120 + cascadeOffset * 20,
      y: (isHeading ? 88 : 220) + cascadeOffset * 24,
      width: isHeading ? 880 : 620,
      height: isHeading ? 80 : 120,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: activeSlide.objects.length + 1,
      text: isHeading ? 'Section Headline' : 'Double-click to edit text content cleanly',
      textColor: activeTheme.isDark ? '#F8FAFC' : '#0F172A',
      bgColor: 'transparent',
      fontFamily: isHeading ? 'Plus Jakarta Sans' : 'DM Sans',
      fontSize: isHeading ? 42 : 22,
      fontWeight: isHeading ? 'bold' : 'normal',
      fontStyle: 'normal',
      underline: false,
      textAlign: 'left',
      lineHeight: 1.35,
      padding: 10,
    };
    onInsertObjectOnSlide(obj);
    onSelectIds(new Set([obj.id]));
    setSlideTool('select');
    setOpenMenu(null);
  };

  const handleQuickInsertShape = (kind: ShapeKind) => {
    if (!canEdit || !activeSlide) return;
    const obj: BoardObject = {
      id: uid('shape'),
      name: kind.replace(/_/g, ' '),
      type: 'shape',
      shapeKind: kind,
      x: 420 + cascadeOffset * 24,
      y: 220 + cascadeOffset * 24,
      width: kind === 'circle' ? 220 : kind === 'frame' ? 520 : 320,
      height: kind === 'circle' ? 220 : kind === 'frame' ? 320 : 170,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: activeSlide.objects.length + 1,
      fill: kind === 'frame' ? 'transparent' : activeTheme.cardBg,
      stroke: activeTheme.accentColor,
      strokeWidth: 2,
      cornerRadius: kind === 'rounded_rect' ? 16 : 0,
      text: kind === 'frame' ? 'Group Frame' : '',
      textColor: activeTheme.titleColor,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 18,
      fontWeight: 'bold',
      fontStyle: 'normal',
      textAlign: 'center',
    };
    onInsertObjectOnSlide(obj);
    onSelectIds(new Set([obj.id]));
    setSlideShapeKind(kind);
    setSlideTool('select');
    setOpenMenu(null);
  };

  const handleQuickInsertTable = (rows: number, cols: number) => {
    if (!canEdit || !activeSlide) return;
    const cells = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => (r === 0 ? `Header ${c + 1}` : `Item ${r}.${c + 1}`))
    );
    const obj: TableObject = {
      id: uid('table'),
      name: `Table ${rows}×${cols}`,
      type: 'table',
      x: 180 + cascadeOffset * 20,
      y: 180 + cascadeOffset * 20,
      width: Math.min(960, Math.max(460, cols * 180)),
      height: Math.min(480, Math.max(200, rows * 56)),
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: activeSlide.objects.length + 1,
      rows,
      cols,
      cells,
      headerBg: activeTheme.accentColor,
      borderColor: activeTheme.cardBorder,
      textColor: activeTheme.titleColor,
    };
    onInsertObjectOnSlide(obj);
    onSelectIds(new Set([obj.id]));
    setSlideTool('select');
    setOpenMenu(null);
  };

  const handleQuickInsertChart = (chartType: ChartObject['chartType'] = 'bar') => {
    if (!canEdit || !activeSlide) return;
    const obj: ChartObject = {
      id: uid('chart'),
      name: `${chartType.toUpperCase()} Chart`,
      type: 'chart',
      x: 320 + cascadeOffset * 20,
      y: 160 + cascadeOffset * 20,
      width: 600,
      height: 380,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: activeSlide.objects.length + 1,
      chartType,
      title: 'Performance Overview',
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      values: [45, 72, 66, 94],
      colors: [activeTheme.accentColor, '#059669', '#D97706', '#6366F1'],
    };
    onInsertObjectOnSlide(obj);
    onSelectIds(new Set([obj.id]));
    setSlideTool('select');
    setOpenMenu(null);
  };

  const handleQuickInsertMath = () => {
    if (!canEdit || !activeSlide) return;
    const obj: BoardObject = {
      id: uid('math'),
      name: 'Formula',
      type: 'math',
      x: 420 + cascadeOffset * 20,
      y: 260 + cascadeOffset * 20,
      width: 420,
      height: 120,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: activeSlide.objects.length + 1,
      latex: 'E = mc^2 \\quad \\text{or} \\quad x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
      color: activeTheme.titleColor,
      bgColor: 'transparent',
      fontSize: 28,
    };
    onInsertObjectOnSlide(obj);
    onSelectIds(new Set([obj.id]));
    setSlideTool('select');
    setOpenMenu(null);
  };

  const handleQuickInsertSticky = () => {
    if (!canEdit || !activeSlide) return;
    const obj: BoardObject = {
      id: uid('sticky'),
      name: 'Callout Note',
      type: 'sticky',
      x: 480 + cascadeOffset * 24,
      y: 220 + cascadeOffset * 24,
      width: 260,
      height: 220,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: activeSlide.objects.length + 1,
      text: 'Key takeaway or reminder note',
      noteColor: '#FEF08A',
      textColor: '#1E293B',
      author: 'Presenter',
      fontFamily: 'DM Sans',
      fontSize: 18,
      noteStyle: 'card',
      reactions: {},
    };
    onInsertObjectOnSlide(obj);
    onSelectIds(new Set([obj.id]));
    setSlideTool('select');
    setOpenMenu(null);
  };

  const handleInsertImageFile = (file: File, replaceObjId?: string) => {
    if (!canEdit || !activeSlide) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      const probe = new Image();
      probe.onload = () => {
        if (replaceObjId) {
          onUpdateObject(replaceObjId, { src: dataUrl, fileName: file.name, crop: undefined }, true);
          return;
        }
        const aspect = probe.naturalWidth / Math.max(1, probe.naturalHeight);
        const targetW = Math.min(680, Math.max(240, probe.naturalWidth));
        const targetH = Math.round(targetW / aspect);
        const obj: BoardObject = {
          id: uid('img'),
          name: file.name,
          type: 'image',
          x: Math.round((SLIDE_WIDTH - targetW) / 2),
          y: Math.round((SLIDE_HEIGHT - targetH) / 2),
          width: targetW,
          height: targetH,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: activeSlide.objects.length + 1,
          src: dataUrl,
          fileName: file.name,
          mask: 'none',
          filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
        };
        onInsertObjectOnSlide(obj);
        onSelectIds(new Set([obj.id]));
        setSlideTool('select');
      };
      probe.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // --- Theme & Layout Actions ---
  const applyThemeToSlide = (theme: SlideThemePreset, allSlides = false) => {
    if (!canEdit || !activeSlide) return;
    if (allSlides && onApplyThemeToAll) {
      onApplyThemeToAll(theme);
      return;
    }
    onSnapshotUndo?.();
    const adaptedObjects = adaptObjectsToTheme(activeSlide.objects, theme);
    onUpdatePage(activeSlide.id, {
      background: theme.bg,
      slideGradient: theme.gradient,
      objects: adaptedObjects,
    });
  };

  const applyMasterToAll = useCallback(() => {
    if (!canEdit) return;
    onSnapshotUndo?.();
    pages.forEach((page) => {
      const updatedObjects = page.objects.map((obj) => {
        if (obj.type === 'text') {
          return { ...obj, fontFamily: slideMaster.fontFamily, textColor: slideMaster.accentColor };
        }
        if (obj.type === 'shape') {
          return { ...obj, fontFamily: slideMaster.fontFamily, textColor: slideMaster.accentColor };
        }
        if (obj.type === 'sticky') {
          return { ...obj, fontFamily: slideMaster.fontFamily };
        }
        return obj;
      }) as BoardObject[];
      onUpdatePage(page.id, {
        background: slideMaster.bgColor,
        slideGradient: undefined,
        objects: updatedObjects,
      });
    });
  }, [canEdit, onSnapshotUndo, onUpdatePage, pages, slideMaster]);

  const handleApplyLayout = (layoutId: SlideLayoutId, forceNew = false) => {
    if (!canEdit || !activeSlide) return;
    if (forceNew || applyLayoutMode === 'new') {
      if (onAddSlideWithLayout) {
        onAddSlideWithLayout(layoutId, activeTheme);
      } else {
        onAddSlide();
      }
      setOpenMenu(null);
      return;
    }
    const objs = buildLayoutObjects(layoutId, activeTheme);
    if (onReplacePageObjects) {
      onReplacePageObjects(objs, true);
    } else {
      onSnapshotUndo?.();
      onUpdatePage(activeSlide.id, { objects: objs, slideLayout: layoutId });
    }
    onUpdatePage(activeSlide.id, { slideLayout: layoutId });
    onSelectIds(new Set());
    setOpenMenu(null);
  };

  // --- Alignment to 1280x720 Slide or Multi-Selection ---
  const handleAlignSelected = (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!canEdit || !activeSlide || selectedObjects.length === 0) return;
    if (selectedObjects.length >= 2) {
      const aligned = alignObjects(activeSlide.objects, selectedIds, mode);
      if (onReplacePageObjects) onReplacePageObjects(aligned, true);
      else onUpdatePage(activeSlide.id, { objects: aligned });
      return;
    }
    const target = selectedObjects[0];
    if (target.locked) return;
    let nx = target.x;
    let ny = target.y;
    if (mode === 'left') nx = 48;
    else if (mode === 'center') nx = Math.round((SLIDE_WIDTH - target.width) / 2);
    else if (mode === 'right') nx = Math.round(SLIDE_WIDTH - target.width - 48);
    else if (mode === 'top') ny = 48;
    else if (mode === 'middle') ny = Math.round((SLIDE_HEIGHT - target.height) / 2);
    else if (mode === 'bottom') ny = Math.round(SLIDE_HEIGHT - target.height - 48);
    const dx = nx - target.x;
    const dy = ny - target.y;
    if (dx === 0 && dy === 0) return;

    if (target.type === 'stroke') {
      onUpdateObject(
        target.id,
        {
          x: nx,
          y: ny,
          points: target.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })),
        },
        true
      );
      return;
    }
    if (target.type === 'line') {
      onUpdateObject(
        target.id,
        {
          x: nx,
          y: ny,
          cpX: typeof target.cpX === 'number' ? target.cpX + dx : target.cpX,
          cpY: typeof target.cpY === 'number' ? target.cpY + dy : target.cpY,
          points: target.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
        },
        true
      );
      return;
    }
    if (target.type === 'connector') {
      onUpdateObject(
        target.id,
        {
          x: nx,
          y: ny,
          x1: target.x1 + dx,
          y1: target.y1 + dy,
          x2: target.x2 + dx,
          y2: target.y2 + dy,
          ...(target.waypoints ? { waypoints: target.waypoints.map((wp) => ({ x: wp.x + dx, y: wp.y + dy })) } : {}),
        },
        true
      );
      return;
    }
    onUpdateObject(target.id, { x: nx, y: ny }, true);
  };

  // --- Exports (.pptx, .pdf, .png) ---
  const showExportFailure = (msg: string) => {
    setExportError(msg);
    window.setTimeout(() => setExportError((cur) => (cur === msg ? null : cur)), 4500);
  };

  const handleExportPPTX = async () => {
    setOpenMenu(null);
    setExportError(null);
    setExportStatus('Building PowerPoint (.pptx)...');
    try {
      const blob = await exportPagesToPPTX(pages, workspaceName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workspaceName.replace(/[^a-z0-9]/gi, '_')}_slides.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showExportFailure('PowerPoint (.pptx) export failed. Please check slide media and try again.');
    } finally {
      setExportStatus(null);
    }
  };

  const handleExportPDF = async () => {
    setOpenMenu(null);
    setExportError(null);
    setExportStatus('Rendering HD PDF...');
    try {
      const pdfPages: { name: string; imageDataUrl: string; width: number; height: number; speakerNotes?: string }[] = [];
      for (const p of pages) {
        const imageDataUrl = await renderPageToHiResDataUrl(p, SLIDE_WIDTH, SLIDE_HEIGHT, 'image/png', 0.96, {
          viewportBox: {
            minX: 0,
            minY: 0,
            contentW: SLIDE_WIDTH,
            contentH: SLIDE_HEIGHT,
            scale: 1.5,
          },
        });
        pdfPages.push({
          name: p.name,
          imageDataUrl,
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          speakerNotes: p.speakerNotes,
        });
      }
      const pdfBytes = await exportBoardPagesToPDF(pdfPages, 'fit', { includeNotes: true });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workspaceName.replace(/[^a-z0-9]/gi, '_')}_slides.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showExportFailure('PDF export failed. Please try again.');
    } finally {
      setExportStatus(null);
    }
  };

  const handleExportSlidePNG = async () => {
    if (!activeSlide) return;
    setOpenMenu(null);
    setExportError(null);
    setExportStatus('Exporting 16:9 PNG...');
    try {
      const url = await renderPageToHiResDataUrl(activeSlide, SLIDE_WIDTH, SLIDE_HEIGHT, 'image/png', 1, {
        viewportBox: {
          minX: 0,
          minY: 0,
          contentW: SLIDE_WIDTH,
          contentH: SLIDE_HEIGHT,
          scale: 1.5,
        },
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(activeSlide.name || 'slide').replace(/[^a-z0-9]/gi, '_')}.png`;
      a.click();
    } catch {
      showExportFailure('PNG export failed. Please try again.');
    } finally {
      setExportStatus(null);
    }
  };

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const isLineOrConnectorTool = ['line', 'arrow', 'double_arrow', 'curved_line', 'connector', 'polyline'].includes(slideTool);

  // =========================================================================
  // FULLSCREEN & PRESENTER VIEW
  // =========================================================================
  if (fullscreenPresenting && activeSlide) {
    const activeInk = liveStrokes[activeSlide.id] || [];

    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 text-white flex flex-col select-none">
        {/* Top Presentation Bar */}
        <div className="h-12 px-2 sm:px-4 border-b border-slate-800/90 bg-slate-900/95 flex items-center justify-between gap-1.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0 sm:shrink">
            <span className="font-mono text-xs font-semibold tabular-nums text-blue-400 whitespace-nowrap shrink-0">
              {String(activeIdx + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}
            </span>
            <span className="hidden md:inline font-semibold text-sm truncate text-slate-100">{activeSlide.name}</span>
            {buildSteps.length > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                Build {buildStep > 0 ? buildSteps.indexOf(buildStep) + 1 : 0}/{buildSteps.length}
              </span>
            )}
          </div>

          {/* Live Laser / Spotlight / Ink / Eraser Tools */}
          <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700/80 rounded-lg p-1 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setLiveTool('laser')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                liveTool === 'laser' ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
              title="Laser Pointer"
            >
              <Pointer className="w-3.5 h-3.5" />
              <span>Laser</span>
            </button>
            <button
              onClick={() => setLiveTool('spotlight')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                liveTool === 'spotlight' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:bg-slate-700'
              }`}
              title="Spotlight Beam"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Spotlight</span>
            </button>
            <button
              onClick={() => setLiveTool('pen')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                liveTool === 'pen' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Pen className="w-3.5 h-3.5" />
              <span>Ink</span>
            </button>
            <button
              onClick={() => setLiveTool('highlighter')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                liveTool === 'highlighter' ? 'bg-yellow-400 text-slate-950' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span>Highlight</span>
            </button>
            <button
              onClick={() => setLiveTool('eraser')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                liveTool === 'eraser' ? 'bg-rose-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
              title="Erase Live Ink Stroke"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Erase</span>
            </button>
            <div className="flex items-center gap-1 px-1.5 border-l border-slate-700">
              {['#EF4444', '#38BDF8', '#FACC15', '#22C55E', '#FFFFFF'].map((c) => (
                <button
                  key={c}
                  onClick={() => setLiveColor(c)}
                  className={`w-4 h-4 rounded-md border shrink-0 transition-transform ${
                    liveColor === c ? 'border-white scale-115 ring-1 ring-white/50' : 'border-slate-600'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            {activeInk.length > 0 && (
              <>
                <button
                  onClick={() =>
                    setLiveStrokes((prev) => ({
                      ...prev,
                      [activeSlide.id]: (prev[activeSlide.id] || []).slice(0, -1),
                    }))
                  }
                  className="px-2 py-1 rounded-md text-xs text-slate-300 hover:bg-slate-700 whitespace-nowrap shrink-0"
                  title="Undo last live stroke"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setLiveStrokes((prev) => ({ ...prev, [activeSlide.id]: [] }))}
                  className="px-2 py-1 rounded-md text-xs text-rose-300 hover:bg-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="Clear all live ink on this slide"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {canEdit && (
                  <button
                    onClick={handleSaveLiveInkToSlide}
                    className="px-2.5 py-1 rounded-md text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium whitespace-nowrap shrink-0"
                  >
                    Save Ink
                  </button>
                )}
              </>
            )}
          </div>

          {/* Right Live Actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              onClick={() => setScreenCover((c) => (c === 'black' ? 'none' : 'black'))}
              className={`hidden sm:inline-flex px-2 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap shrink-0 ${
                screenCover === 'black'
                  ? 'bg-white text-slate-950 border-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Blackout screen (B)"
            >
              Black (B)
            </button>
            <button
              onClick={() => setScreenCover((c) => (c === 'white' ? 'none' : 'white'))}
              className={`hidden sm:inline-flex px-2 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap shrink-0 ${
                screenCover === 'white'
                  ? 'bg-white text-slate-950 border-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Whiteboard screen (W)"
            >
              White (W)
            </button>
            <button
              onClick={() => setShowGridOverview(true)}
              className="px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 border border-slate-700 hover:bg-slate-700 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="All Slides Grid (G)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setPresenterView((v) => !v)}
              className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                presenterView
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <MonitorPlay className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Presenter</span>
            </button>
            <button
              onClick={() => setWebcamOn((v) => !v)}
              className={`hidden sm:inline-flex p-1.5 rounded-md border shrink-0 ${
                webcamOn ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Toggle Webcam PiP"
            >
              {webcamOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setShowQRJoin(true)}
              className="hidden sm:inline-flex p-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 shrink-0"
              title="Audience Join QR Code"
            >
              <QrCode className="w-3.5 h-3.5" />
            </button>
            {onBroadcast && (
              <button
                onClick={() => {
                  if (broadcastId) {
                    onBroadcast(null);
                  } else {
                    const newId = uid('bcast');
                    onBroadcast(newId);
                  }
                }}
                className={`hidden sm:inline-flex px-2.5 py-1.5 rounded-md text-xs font-medium border flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  broadcastId
                    ? 'bg-emerald-600 border-emerald-500 text-white animate-pulse'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
                title={broadcastId ? 'Stop Broadcasting' : 'Start Broadcast for Audience'}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" /><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" /></svg>
                <span>{broadcastId ? 'Live' : 'Broadcast'}</span>
              </button>
            )}
            {broadcastId && (
              <span className="hidden md:inline text-[11px] font-mono text-emerald-400 truncate max-w-32" title={`Broadcast ID: ${broadcastId}`}>
                {broadcastId.slice(0, 12)}
              </span>
            )}
            <button
              onClick={onExitFullscreen}
              className="px-2.5 sm:px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>End</span>
            </button>
          </div>
        </div>

        {/* Main Stage + Optional Presenter View */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row relative overflow-hidden">
          <div className="flex-1 min-h-0 flex items-center justify-center p-2 sm:p-4 md:p-8 relative overflow-hidden bg-slate-950">
            <div
              style={getTransitionStyle(activeSlide.transition, slideEntered)}
              className="relative w-full max-w-[1280px] aspect-video rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.65)] ring-1 ring-slate-800 overflow-hidden bg-white"
            >
              {/* Auto-advance countdown progress bar */}
              {activeSlide.slideDurationSec > 0 && !timerPaused && (
                <>
                  <style>{`@keyframes pres-progress{from{width:100%}to{width:0%}}`}</style>
                  <div className="absolute top-0 left-0 right-0 h-1 z-30 bg-white/20">
                    <div
                      key={`progress-${activeSlide.id}-${buildStep}`}
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
                      style={{ animation: `pres-progress ${activeSlide.slideDurationSec}s linear forwards` }}
                    />
                  </div>
                </>
              )}
              <canvas
                ref={liveBaseCanvasRef}
                width={SLIDE_WIDTH}
                height={SLIDE_HEIGHT}
                className="w-full h-full object-contain block pointer-events-none"
              />
              <canvas
                ref={liveBuildCanvasRef}
                width={SLIDE_WIDTH}
                height={SLIDE_HEIGHT}
                style={getBuildAnimStyle(currentStepEffect, buildStepEntered)}
                className="absolute inset-0 w-full h-full object-contain block pointer-events-none"
              />
              <canvas
                ref={liveInkCanvasRef}
                width={SLIDE_WIDTH}
                height={SLIDE_HEIGHT}
                className={`absolute inset-0 w-full h-full object-contain block touch-none ${
                  liveTool === 'eraser' ? 'cursor-cell' : liveTool === 'laser' ? 'cursor-none' : 'cursor-crosshair'
                }`}
                onPointerMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const nx = (e.clientX - rect.left) / rect.width;
                  const ny = (e.clientY - rect.top) / rect.height;
                  setLaserPos({ x: nx, y: ny });
                  if (liveTool === 'laser') {
                    setLaserTrail((prev) => [...prev.slice(-18), { x: nx, y: ny, ts: Date.now() }]);
                  }
                  if (liveTool === 'eraser' && liveErasingRef.current) {
                    eraseLiveStrokesAt(activeSlide.id, nx, ny);
                  }
                  const activeStroke = drawingRef.current;
                  if (activeStroke && (liveTool === 'pen' || liveTool === 'highlighter')) {
                    activeStroke.points.push({ x: nx, y: ny });
                    const snapshotStroke: LiveInkStroke = {
                      ...activeStroke,
                      points: [...activeStroke.points],
                    };
                    const slideId = activeSlide.id;
                    setLiveStrokes((prev) => ({
                      ...prev,
                      [slideId]: [...(prev[slideId] || []).slice(0, -1), snapshotStroke],
                    }));
                  }
                }}
                onPointerLeave={() => {
                  setLaserPos(null);
                  drawingRef.current = null;
                  liveErasingRef.current = false;
                }}
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const nx = (e.clientX - rect.left) / rect.width;
                  const ny = (e.clientY - rect.top) / rect.height;
                  if (liveTool === 'eraser') {
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    liveErasingRef.current = true;
                    eraseLiveStrokesAt(activeSlide.id, nx, ny);
                  } else if (liveTool === 'pen' || liveTool === 'highlighter') {
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    const stroke: LiveInkStroke = {
                      points: [{ x: nx, y: ny }],
                      color: liveTool === 'highlighter' ? '#FACC15' : liveColor,
                      width: liveTool === 'highlighter' ? 24 : 4,
                      isHighlighter: liveTool === 'highlighter',
                    };
                    drawingRef.current = stroke;
                    const slideId = activeSlide.id;
                    const initialSnapshot: LiveInkStroke = { ...stroke, points: [...stroke.points] };
                    setLiveStrokes((prev) => ({
                      ...prev,
                      [slideId]: [...(prev[slideId] || []), initialSnapshot],
                    }));
                  } else if (liveTool === 'laser') {
                    // Check if a linked object was clicked
                    const clickedLink = activeSlide.objects.find((obj) => {
                      if (!obj.linkToSlide) return false;
                      const ox = obj.x / SLIDE_WIDTH;
                      const oy = obj.y / SLIDE_HEIGHT;
                      const ow = obj.width / SLIDE_WIDTH;
                      const oh = obj.height / SLIDE_HEIGHT;
                      return nx >= ox && nx <= ox + ow && ny >= oy && ny <= oy + oh;
                    });
                    if (clickedLink?.linkToSlide) {
                      onSelectPage(clickedLink.linkToSlide);
                    } else {
                      handleNextStepOrSlide();
                    }
                  }
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                  drawingRef.current = null;
                  liveErasingRef.current = false;
                }}
                onPointerCancel={() => {
                  drawingRef.current = null;
                  liveErasingRef.current = false;
                }}
              />

              {/* Laser Fading Trail + Dot */}
              {liveTool === 'laser' && laserTrail.length > 1 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="0.45"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity="0.55"
                    points={laserTrail.map((pt) => `${pt.x * 100},${pt.y * 100}`).join(' ')}
                  />
                </svg>
              )}
              {liveTool === 'laser' && laserPos && (
                <div
                  className="pointer-events-none absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-red-500 shadow-[0_0_20px_7px_rgba(239,68,68,0.8)] ring-2 ring-white/80"
                  style={{ left: `${laserPos.x * 100}%`, top: `${laserPos.y * 100}%` }}
                />
              )}

              {/* Spotlight Overlay */}
              {liveTool === 'spotlight' && laserPos && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `radial-gradient(circle 160px at ${laserPos.x * 100}% ${laserPos.y * 100}%, transparent 0%, rgba(2,6,23,0.78) 100%)`,
                  }}
                />
              )}

              {/* Black / White Screen Cover */}
              {screenCover !== 'none' && (
                <div
                  onClick={() => setScreenCover('none')}
                  className={`absolute inset-0 z-20 flex flex-col items-center justify-center cursor-pointer ${
                    screenCover === 'black' ? 'bg-black text-slate-400' : 'bg-white text-slate-500'
                  }`}
                >
                  <p className="text-xs font-mono uppercase tracking-wider">Click or press {screenCover === 'black' ? 'B' : 'W'} to resume</p>
                </div>
              )}

              {/* Webcam PiP */}
              {webcamOn && (
                <video
                  ref={webcamVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 w-24 h-18 sm:w-44 sm:h-32 rounded-xl object-cover border border-slate-700 shadow-2xl z-10"
                />
              )}
            </div>

            {/* Bottom Navigation Dock */}
            <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg px-3 py-1.5 shadow-xl pb-safe">
              <button
                onClick={handlePrevSlide}
                disabled={activeIdx === 0 && buildStep === 0}
                className="p-1.5 rounded-md hover:bg-slate-800 disabled:opacity-35 transition-colors"
                title="Previous (Left Arrow)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs tabular-nums px-2 text-slate-200">
                {activeIdx + 1} / {pages.length}
              </span>
              <button
                onClick={handleNextStepOrSlide}
                disabled={activeIdx >= pages.length - 1 && buildStep >= maxBuildStep}
                className="p-1.5 rounded-md hover:bg-slate-800 disabled:opacity-35 transition-colors"
                title="Next (Right Arrow / Space)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Presenter View Side Panel */}
          {presenterView && (
            <div className="w-full max-h-[46dvh] md:max-h-none md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-900 p-3 sm:p-4 flex flex-col gap-3 sm:gap-4 shrink-0 overflow-y-auto">
              {/* Elapsed Timer + Current Clock */}
              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Elapsed Time</div>
                  <div className="font-mono text-2xl font-bold tabular-nums text-emerald-400 mt-0.5">{formatTimer(elapsedSec)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" /> Clock
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-slate-200 mt-0.5">{clockText}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTimerPaused((p) => !p)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                    title={timerPaused ? 'Resume timer' : 'Pause timer'}
                  >
                    {timerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setElapsedSec(0)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                    title="Reset timer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Next Slide Preview */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Next Slide</div>
                {nextSlide ? (
                  <button
                    onClick={() => onSelectPage(nextSlide.id)}
                    className="w-full text-left group rounded-xl border border-slate-800 bg-slate-950 overflow-hidden hover:border-blue-500 transition-colors"
                  >
                    <img src={renderSlideCached(nextSlide, 320, 180)} alt={nextSlide.name} className="w-full aspect-video object-cover" />
                    <div className="px-2.5 py-1.5 text-xs font-medium text-slate-300 truncate">{nextSlide.name}</div>
                  </button>
                ) : (
                  <div className="aspect-video rounded-xl border border-dashed border-slate-800 flex items-center justify-center text-xs text-slate-500">
                    End of Presentation
                  </div>
                )}
              </div>

              {/* Speaker Notes */}
              <div className="flex-1 min-h-[160px] flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Speaker Notes</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setNotesFontSize((s) => Math.max(12, s - 2))}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono"
                    >
                      A-
                    </button>
                    <button
                      onClick={() => setNotesFontSize((s) => Math.min(26, s + 2))}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono"
                    >
                      A+
                    </button>
                  </div>
                </div>
                <div
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-200 leading-relaxed overflow-y-auto whitespace-pre-wrap"
                  style={{ fontSize: `${notesFontSize}px` }}
                >
                  {activeSlide.speakerNotes?.trim() ? (
                    activeSlide.speakerNotes
                  ) : (
                    <span className="text-slate-500 text-sm">
                      No speaker notes on this slide. Add notes in Studio Mode to read them here during delivery.
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Jump */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Jump to Slide</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {pages.map((p, idx) => (
                    <button
                      key={p.id}
                      onClick={() => onSelectPage(p.id)}
                      className={`py-1.5 rounded-md text-xs font-mono font-semibold border transition-colors ${
                        p.id === activeSlide.id
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Overview Grid in Live Mode */}
        {showGridOverview && (
          <div className="fixed inset-0 z-[110] bg-slate-950/95 backdrop-blur p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">All Slides ({pages.length})</h3>
                <button
                  onClick={() => setShowGridOverview(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium"
                >
                  Close (Esc)
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {pages.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectPage(p.id);
                      setShowGridOverview(false);
                    }}
                    className={`rounded-xl overflow-hidden border text-left transition-all ${
                      p.id === activeSlide.id ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <img src={renderSlideCached(p, 320, 180)} alt={p.name} className="w-full aspect-video object-cover bg-white" />
                    <div className="px-3 py-2 bg-slate-900 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-slate-100">{p.name}</span>
                      <span className="font-mono text-slate-400 tabular-nums shrink-0">{idx + 1}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Audience QR Modal */}
        {showQRJoin && (
          <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 text-center shadow-2xl">
              <h4 className="font-bold text-base mb-1">Follow Along on Mobile</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Scan to join “{workspaceName}” live</p>
              <div className="w-52 h-52 mx-auto bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-center mb-4">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Session Join QR" className="w-full h-full object-contain" />
                ) : (
                  <QrCode className="w-16 h-16 text-slate-400" />
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-500 truncate mb-4">{window.location.href}</div>
              <button
                onClick={() => setShowQRJoin(false)}
                className="w-full py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // SLIDES STUDIO EDITOR MODE
  // =========================================================================
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden select-none">
      {/* Hidden File Inputs */}
      <input
        ref={pptxInputRef}
        type="file"
        accept=".pptx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportPPTXFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleInsertImageFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={replaceImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && primarySelected?.type === 'image') handleInsertImageFile(f, primarySelected.id);
          e.target.value = '';
        }}
      />

      {/* TOP SLIDE STUDIO COMMAND RIBBON */}
      <div className="h-12 px-2 lg:px-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1.5 lg:gap-2 shrink-0 z-20 overflow-x-auto scrollbar-none lg:overflow-visible">
        {/* Left: Slide Index + Title + History */}
        <div className="flex items-center gap-1.5 lg:gap-2 min-w-0 shrink-0">
          <button
            onClick={() => setFilmstripOpen((v) => !v)}
            className={`p-1.5 rounded-lg border text-xs transition-colors shrink-0 ${
              filmstripOpen
                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                : 'border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Toggle Slide Filmstrip"
          >
            <Columns className="w-4 h-4" />
          </button>

          <span className="font-mono text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            {String(activeIdx + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}
          </span>

          {activeSlide && (
            <input
              value={activeSlide.name}
              onChange={(e) => canEdit && onUpdatePage(activeSlide.id, { name: e.target.value })}
              readOnly={!canEdit}
              aria-label="Slide Title"
              className="hidden md:block w-28 sm:w-36 h-8 px-2 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 bg-transparent focus:bg-slate-50 dark:focus:bg-slate-950 text-xs font-semibold outline-none truncate transition-colors"
            />
          )}

          <div className="hidden sm:flex items-center gap-0.5 pl-1 border-l border-slate-200 dark:border-slate-800">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 transition-colors shrink-0"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 transition-colors shrink-0"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center: Complete Insert & Authoring Tools */}
        <div className="flex items-center gap-0.5 bg-slate-100/90 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-lg p-1 shrink-0 lg:shrink lg:overflow-x-auto scrollbar-none lg:min-w-0">
          <button
            onClick={() => {
              setSlideTool('select');
              setOpenMenu(null);
            }}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
              slideTool === 'select'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
            }`}
            title="Select & Move (V)"
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Select</span>
          </button>

          <button
            onClick={() => {
              setSlideTool('hand');
              setOpenMenu(null);
            }}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
              slideTool === 'hand'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
            }`}
            title="Pan Stage (H)"
          >
            <Hand className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

          <button
            onClick={() => handleQuickInsertText('heading')}
            disabled={!canEdit}
            className="px-2 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40"
            title="Insert Heading"
          >
            <Heading1 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Heading</span>
          </button>

          <button
            onClick={() => handleQuickInsertText('body')}
            disabled={!canEdit}
            className="px-2 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40"
            title="Insert Text Box (T)"
          >
            <Type className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Text</span>
          </button>

          {/* Shape Popover Trigger */}
          <button
            onClick={(e) => toggleAnchoredMenu('shape', e.currentTarget, 310)}
            disabled={!canEdit}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 ${
              openMenu === 'shape' || slideTool === 'shape'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900'
            }`}
            title="Insert or Draw Shape"
          >
            <Shapes className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Shape</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {/* Lines & Connectors Popover Trigger */}
          <button
            onClick={(e) => toggleAnchoredMenu('lines', e.currentTarget, 236)}
            disabled={!canEdit}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 ${
              openMenu === 'lines' || isLineOrConnectorTool
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900'
            }`}
            title="Lines, Arrows & Connectors (L / C)"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Line</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          <button
            onClick={() => {
              setSlideTool((t) => (t === 'pen' ? 'select' : 'pen'));
              setOpenMenu(null);
            }}
            disabled={!canEdit}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 ${
              slideTool === 'pen'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900'
            }`}
            title="Freehand Pen (P)"
          >
            <Pen className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Pen</span>
          </button>

          <button
            onClick={() => {
              setSlideTool((t) => (t === 'highlighter' ? 'select' : 'highlighter'));
              setOpenMenu(null);
            }}
            disabled={!canEdit}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 ${
              slideTool === 'highlighter'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900'
            }`}
            title="Highlighter (K)"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              setSlideTool((t) => (t === 'eraser_stroke' ? 'select' : 'eraser_stroke'));
              setOpenMenu(null);
            }}
            disabled={!canEdit}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 ${
              slideTool === 'eraser_stroke'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900'
            }`}
            title="Ink Eraser (E)"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>

          {/* Active Stroke Color Swatch Picker */}
          <button
            onClick={(e) => toggleAnchoredMenu('color', e.currentTarget, 224)}
            disabled={!canEdit}
            className="px-1.5 py-1 rounded-md hover:bg-white dark:hover:bg-slate-900 flex items-center gap-1 shrink-0 disabled:opacity-40"
            title="Stroke & Ink Color"
          >
            <span
              className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 shrink-0"
              style={{ backgroundColor: strokeColor }}
            />
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

          <button
            onClick={() => {
              setOpenMenu(null);
              imageInputRef.current?.click();
            }}
            disabled={!canEdit}
            className="px-2 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40"
            title="Insert Image"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Image</span>
          </button>

          <button
            onClick={(e) => toggleAnchoredMenu('table', e.currentTarget, 212)}
            disabled={!canEdit}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 ${
              openMenu === 'table'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900'
            }`}
            title="Insert Table"
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Table</span>
          </button>

          <button
            onClick={(e) => toggleAnchoredMenu('chart', e.currentTarget, 240)}
            disabled={!canEdit}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 ${
              openMenu === 'chart'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900'
            }`}
            title="Insert Live Chart"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Chart</span>
          </button>

          <button
            onClick={() => (onOpenMathOrGraph ? onOpenMathOrGraph('equation') : handleQuickInsertMath())}
            disabled={!canEdit}
            className="px-2 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40"
            title="Insert Equation (LaTeX)"
          >
            <FunctionSquare className="w-3.5 h-3.5" />
          </button>

          {onOpenMathOrGraph && (
            <button
              onClick={() => onOpenMathOrGraph('graph')}
              disabled={!canEdit}
              className="px-2 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40"
              title="Plot 2D / 3D Function Graph"
            >
              <LineChart className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleQuickInsertSticky}
            disabled={!canEdit}
            className="px-2 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40"
            title="Insert Callout Note"
          >
            <StickyNote className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Layouts, AI, Import/Export, Present */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => toggleAnchoredMenu('layouts', e.currentTarget, 372)}
            disabled={!canEdit}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40 ${
              openMenu === 'layouts'
                ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-600 dark:text-blue-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            title="Choose from 12 visual slide layouts"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Layouts</span>
          </button>

          {onOpenAISlides && (
            <button
              onClick={() => {
                setOpenMenu(null);
                onOpenAISlides();
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="Generate Deck with AI"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden lg:inline">AI Slides</span>
            </button>
          )}

          <button
            onClick={() => {
              setOpenMenu(null);
              pptxInputRef.current?.click();
            }}
            className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Import PowerPoint (.pptx)"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Import</span>
          </button>

          <button
            onClick={(e) => toggleAnchoredMenu('export', e.currentTarget, 240)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Export Slides"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{exportStatus ? 'Exporting...' : 'Export'}</span>
          </button>

          <button
            onClick={() => {
              setOpenMenu(null);
              setPresenterView(true);
              onStartFullscreen();
            }}
            className="hidden sm:flex px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Open Presenter View with Speaker Notes"
          >
            <MonitorPlay className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Presenter</span>
          </button>

          <button
            onClick={() => {
              setOpenMenu(null);
              setPresenterView(false);
              onStartFullscreen();
            }}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Present</span>
          </button>

          <button
            onClick={() => setInspectorOpen((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
              inspectorOpen
                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                : 'border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Toggle Inspector Panel"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {hideTopBar && onShowTopBar && (
            <button
              type="button"
              onClick={onShowTopBar}
              title="Show Top Bar (Ctrl+\)"
              aria-label="Show Top Bar"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shrink-0"
            >
              <PanelTopOpen className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* PRECISION FIXED-ANCHORED POPOVER MENUS */}
      {openMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />

          {openMenu === 'shape' && (
            <div
              style={{ left: menuPos.left, top: menuPos.top }}
              className="fixed w-[310px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-110px)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 z-50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Insert Shape</span>
                <button
                  onClick={() => {
                    setSlideTool('shape');
                    setOpenMenu(null);
                  }}
                  className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Draw on Slide
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {SHAPE_GALLERY.map((item) => (
                  <button
                    key={item.kind}
                    onClick={() => handleQuickInsertShape(item.kind)}
                    className="px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 text-[11px] font-medium flex flex-col items-center gap-1 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-600 dark:text-blue-400">
                      {item.iconSvg}
                    </svg>
                    <span className="truncate w-full text-center">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {openMenu === 'lines' && (
            <div
              style={{ left: menuPos.left, top: menuPos.top }}
              className="fixed w-[236px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-110px)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 space-y-1"
            >
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lines &amp; Flow Connectors</div>
              {(
                [
                  { tool: 'line' as ToolType, label: 'Straight Line', icon: Minus },
                  { tool: 'arrow' as ToolType, label: 'Single Arrow (L)', icon: ArrowRight },
                  { tool: 'double_arrow' as ToolType, label: 'Double Arrow', icon: ArrowLeftRight },
                  { tool: 'curved_line' as ToolType, label: 'Curved Bezier Arc', icon: Spline },
                  { tool: 'connector' as ToolType, label: 'Smart Snap Connector (C)', icon: GitBranch },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.tool}
                    onClick={() => {
                      setSlideTool(item.tool);
                      setOpenMenu(null);
                    }}
                    className={`w-full px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
                      slideTool === item.tool
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {openMenu === 'color' && (
            <div
              style={{ left: menuPos.left, top: menuPos.top }}
              className="fixed w-[224px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-110px)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 z-50 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ink &amp; Stroke</span>
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => handleSelectColorSwatch(e.target.value)}
                  className="w-7 h-5 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      handleSelectColorSwatch(c);
                      setOpenMenu(null);
                    }}
                    className={`h-7 rounded-md border transition-transform ${
                      strokeColor.toLowerCase() === c.toLowerCase()
                        ? 'border-blue-600 scale-105 ring-1 ring-blue-500'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          )}

          {openMenu === 'table' && (
            <div
              style={{ left: menuPos.left, top: menuPos.top }}
              className="fixed w-[212px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-110px)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 z-50"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Insert Table</span>
                <span className="font-mono text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                  {tableHover.r} × {tableHover.c}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 5 }, (_, rIdx) =>
                  Array.from({ length: 6 }, (_, cIdx) => {
                    const active = rIdx + 1 <= tableHover.r && cIdx + 1 <= tableHover.c;
                    return (
                      <button
                        key={`${rIdx}-${cIdx}`}
                        onMouseEnter={() => setTableHover({ r: rIdx + 1, c: cIdx + 1 })}
                        onClick={() => handleQuickInsertTable(rIdx + 1, cIdx + 1)}
                        className={`w-6 h-5 rounded border transition-colors ${
                          active ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}

          {openMenu === 'chart' && (
            <div
              style={{ left: menuPos.left, top: menuPos.top }}
              className="fixed w-[240px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-110px)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 z-50"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Insert Live Chart</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(['bar', 'line', 'doughnut', 'pie', 'area', 'horizontalBar'] as const).map((ct) => (
                  <button
                    key={ct}
                    onClick={() => handleQuickInsertChart(ct)}
                    className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 text-xs font-medium capitalize text-left transition-colors"
                  >
                    {ct === 'horizontalBar' ? 'H-Bar' : `${ct}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {openMenu === 'layouts' && (
            <div
              style={{ left: menuPos.left, top: menuPos.top }}
              className="fixed w-[372px] max-w-[calc(100vw-16px)] max-h-[72dvh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 z-50"
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">12 Pro Slide Layouts</span>
                <div className="flex items-center rounded-md border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
                  <button
                    onClick={() => setApplyLayoutMode('current')}
                    className={`px-2 py-0.5 rounded font-medium ${
                      applyLayoutMode === 'current' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Current
                  </button>
                  <button
                    onClick={() => setApplyLayoutMode('new')}
                    className={`px-2 py-0.5 rounded font-medium ${
                      applyLayoutMode === 'new' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    + New Slide
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SLIDE_LAYOUTS.map((layout) => (
                  <button
                    key={layout.id}
                    onClick={() => handleApplyLayout(layout.id)}
                    className={`p-2 rounded-lg border text-left transition-colors ${
                      activeSlide?.slideLayout === layout.id
                        ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-950/20'
                    }`}
                  >
                    <LayoutMiniPreview id={layout.id} accent={activeTheme.accentColor} />
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 mt-1.5">{layout.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug truncate">{layout.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {openMenu === 'export' && (
            <div
              style={{ left: menuPos.left, top: menuPos.top }}
              className="fixed w-[240px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-110px)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50 space-y-1"
            >
              <button
                onClick={handleExportPPTX}
                className="w-full px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left flex items-center justify-between text-xs font-medium"
              >
                <span>PowerPoint (.pptx)</span>
                <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">16:9</span>
              </button>
              <button
                onClick={handleExportPDF}
                className="w-full px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left flex items-center justify-between text-xs font-medium"
              >
                <span>Widescreen PDF (.pdf)</span>
                <span className="font-mono text-[11px] text-slate-500">HD</span>
              </button>
              <button
                onClick={handleExportSlidePNG}
                className="w-full px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left flex items-center justify-between text-xs font-medium"
              >
                <span>Current Slide Image (.png)</span>
                <span className="font-mono text-[11px] text-slate-500">1920px</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* MAIN STUDIO BODY: FILMSTRIP + CANVAS DESK + INSPECTOR */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* LEFT FILMSTRIP */}
        {filmstripOpen && (
          <>
            <div
              onClick={() => setFilmstripOpen(false)}
              className="lg:hidden fixed inset-0 z-30 bg-slate-950/35"
            />
            <aside className="fixed inset-y-0 left-0 z-40 w-[min(78vw,240px)] shadow-2xl pb-safe lg:static lg:inset-auto lg:z-auto lg:w-56 lg:shadow-none lg:pb-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Slides ({pages.length})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowGridOverview(true)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                    title="Slide Sorter Grid"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setFilmstripOpen(false)}
                    className="lg:hidden p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                    aria-label="Close slides panel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                {pages.map((p, idx) => {
                  const isActive = p.id === activeSlide?.id;
                  const isDropTarget = dropTargetIdx === idx && dragSlideIdx !== idx;
                  const showDropLineAbove = isDropTarget && dragSlideIdx !== null && dragSlideIdx > idx;
                  const showDropLineBelow = isDropTarget && dragSlideIdx !== null && dragSlideIdx < idx;
                  return (
                    <div
                      key={p.id}
                      draggable={canEdit}
                      onDragStart={() => setDragSlideIdx(idx)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropTargetIdx(idx);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragSlideIdx !== null && dragSlideIdx !== idx) {
                          if (onMoveSlide) {
                            onMoveSlide(dragSlideIdx, idx);
                          } else {
                            const dir = idx > dragSlideIdx ? 1 : -1;
                            onReorderSlide(pages[dragSlideIdx].id, dir);
                          }
                        }
                        setDragSlideIdx(null);
                        setDropTargetIdx(null);
                      }}
                      onDragEnd={() => {
                        setDragSlideIdx(null);
                        setDropTargetIdx(null);
                      }}
                      onClick={() => {
                        onSelectPage(p.id);
                        if (window.innerWidth < 1024) setFilmstripOpen(false);
                      }}
                      className={`group relative rounded-xl p-1.5 border cursor-pointer transition-all ${
                        isActive
                          ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30 ring-1 ring-blue-600/30'
                          : isDropTarget
                            ? 'border-blue-400 bg-blue-50/20'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/60 dark:bg-slate-950/40'
                      }`}
                    >
                      {showDropLineAbove && (
                        <div className="absolute -top-1.5 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10 pointer-events-none shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
                      )}
                      {showDropLineBelow && (
                        <div className="absolute -bottom-1.5 left-2 right-2 h-0.5 bg-blue-500 rounded-full z-10 pointer-events-none shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
                      )}
                      <div className="flex items-center justify-between px-1 mb-1">
                        <div className="flex items-center gap-1 min-w-0">
                          {canEdit && <GripVertical className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0 cursor-grab" />}
                          <span
                            className={`font-mono text-[11px] font-semibold tabular-nums ${
                              isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'
                            }`}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="text-[11px] font-medium truncate text-slate-700 dark:text-slate-300">{p.name}</span>
                        </div>
                        {p.speakerNotes?.trim() && (
                          <span title="Has speaker notes" className="shrink-0">
                            <NotebookPen className="w-3 h-3 text-slate-400" />
                          </span>
                        )}
                      </div>

                      <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-white aspect-video">
                        <img src={renderSlideCached(p, 256, 144)} alt={p.name} className="w-full h-full object-cover" />
                      </div>

                      {canEdit && (
                        <div
                          className="absolute bottom-2.5 right-2.5 flex items-center gap-0.5 opacity-90 lg:opacity-0 lg:group-hover:opacity-100 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-md p-0.5 shadow-sm transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                        <button
                          onClick={() => onReorderSlide(p.id, -1)}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                          title="Move up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onReorderSlide(p.id, 1)}
                          disabled={idx === pages.length - 1}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                          title="Move down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDuplicateSlide(p.id)}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Duplicate slide"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {pages.length > 1 && (
                          <button
                            onClick={() => onDeleteSlide(p.id)}
                            className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600"
                            title="Delete slide"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {canEdit && (
              <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
                <button
                  onClick={() => (onAddSlideWithLayout ? onAddSlideWithLayout('title_content', activeTheme) : onAddSlide())}
                  className="flex-1 py-2 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Slide</span>
                </button>
                <button
                  onClick={(e) => {
                    setApplyLayoutMode('new');
                    toggleAnchoredMenu('layouts', e.currentTarget, 372);
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  title="New Slide from Layout"
                >
                  <LayoutTemplate className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            </aside>
          </>
        )}

        {/* CENTER SLIDE ARTBOARD DESK + CONTEXTUAL BAR + SPEAKER NOTES */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          {/* Unified Contextual Selection Bar */}
          {selectedObjects.length > 0 && canEdit && (
            <div className="h-10 px-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none shrink-0 z-10">
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] font-mono tabular-nums text-slate-500 pr-1.5 whitespace-nowrap">
                  {selectedObjects.length} selected
                </span>

                {/* Align to Slide / Selection */}
                <button onClick={() => handleAlignSelected('left')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Align Left">
                  <AlignHorizontalJustifyStart className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleAlignSelected('center')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Align Center Horizontally">
                  <AlignHorizontalJustifyCenter className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleAlignSelected('right')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Align Right">
                  <AlignHorizontalJustifyEnd className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleAlignSelected('top')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Align Top">
                  <AlignVerticalJustifyStart className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleAlignSelected('middle')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Align Middle Vertically">
                  <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleAlignSelected('bottom')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Align Bottom">
                  <AlignVerticalJustifyEnd className="w-3.5 h-3.5" />
                </button>

                {/* Distribute & Match Size when 2+ objects selected */}
                {selectedObjects.length >= 2 && activeSlide && (
                  <div className="flex items-center gap-0.5 pl-1.5 ml-1 border-l border-slate-200 dark:border-slate-800">
                    {selectedObjects.length >= 3 && (
                      <>
                        <button
                          onClick={() => {
                            const nextObjs = distributeSlideObjects(activeSlide.objects, selectedIds, 'horizontal');
                            if (onReplacePageObjects) onReplacePageObjects(nextObjs, true);
                            else onUpdatePage(activeSlide.id, { objects: nextObjs });
                          }}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Distribute Horizontally"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const nextObjs = distributeSlideObjects(activeSlide.objects, selectedIds, 'vertical');
                            if (onReplacePageObjects) onReplacePageObjects(nextObjs, true);
                            else onUpdatePage(activeSlide.id, { objects: nextObjs });
                          }}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Distribute Vertically"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        const nextObjs = matchSizeSlideObjects(activeSlide.objects, selectedIds);
                        if (onReplacePageObjects) onReplacePageObjects(nextObjs, true);
                        else onUpdatePage(activeSlide.id, { objects: nextObjs });
                      }}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Match Size to First Selected"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Z-Order & Flip */}
                {primarySelected && (
                  <div className="flex items-center gap-0.5 pl-1.5 ml-1 border-l border-slate-200 dark:border-slate-800">
                    {onReorderZ && (
                      <>
                        <button onClick={() => onReorderZ(primarySelected.id, 'front')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Bring to Front">
                          <ArrowUpToLine className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onReorderZ(primarySelected.id, 'forward')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Bring Forward">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onReorderZ(primarySelected.id, 'backward')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Send Backward">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onReorderZ(primarySelected.id, 'back')} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Send to Back">
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => onUpdateObject(primarySelected.id, { flipX: !primarySelected.flipX }, true)}
                      className={`p-1.5 rounded ${primarySelected.flipX ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      title="Flip Horizontal"
                    >
                      <FlipHorizontal2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onUpdateObject(primarySelected.id, { flipY: !primarySelected.flipY }, true)}
                      className={`p-1.5 rounded ${primarySelected.flipY ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      title="Flip Vertical"
                    >
                      <FlipVertical2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Typography Quick Controls */}
                {primarySelected &&
                  (primarySelected.type === 'text' || primarySelected.type === 'shape' || primarySelected.type === 'sticky') && (
                    <div className="flex items-center gap-1 pl-2 ml-1 border-l border-slate-200 dark:border-slate-800">
                      <select
                        value={primarySelected.fontFamily}
                        onChange={(e) => onUpdateObject(primarySelected.id, { fontFamily: e.target.value }, true)}
                        className="h-6 rounded border border-transparent hover:border-slate-200 dark:hover:border-slate-700 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-950 px-1.5 text-[11px] outline-none max-w-[110px]"
                      >
                        {FONT_OPTIONS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onUpdateObject(primarySelected.id, { fontSize: Math.max(10, primarySelected.fontSize - 2) }, true)}
                        title="Decrease Font Size"
                        className="px-1.5 py-0.5 rounded border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        A-
                      </button>
                      <span className="font-mono text-[11px] tabular-nums w-7 text-center">{primarySelected.fontSize}</span>
                      <button
                        onClick={() => onUpdateObject(primarySelected.id, { fontSize: Math.min(120, primarySelected.fontSize + 2) }, true)}
                        title="Increase Font Size"
                        className="px-1.5 py-0.5 rounded border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        A+
                      </button>
                      <button
                        onClick={() =>
                          updateTextOrStickyStyle(
                            primarySelected,
                            { fontWeight: primarySelected.fontWeight === 'bold' ? 'normal' : 'bold' },
                            true
                          )
                        }
                        title="Bold"
                        className={`p-1.5 rounded ${primarySelected.fontWeight === 'bold' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          updateTextOrStickyStyle(
                            primarySelected,
                            { fontStyle: primarySelected.fontStyle === 'italic' ? 'normal' : 'italic' },
                            true
                          )
                        }
                        title="Italic"
                        className={`p-1.5 rounded ${primarySelected.fontStyle === 'italic' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      {primarySelected.type === 'text' && (
                        <button
                          onClick={() =>
                            updateTextOrStickyStyle(primarySelected, { underline: !primarySelected.underline }, true)
                          }
                          title="Underline"
                          className={`p-1.5 rounded ${primarySelected.underline ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                          <Underline className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => updateTextOrStickyStyle(primarySelected, { textAlign: 'left' }, true)}
                        title="Align Left"
                        className={`p-1.5 rounded ${primarySelected.textAlign === 'left' ? 'bg-slate-200 dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => updateTextOrStickyStyle(primarySelected, { textAlign: 'center' }, true)}
                        title="Align Center"
                        className={`p-1.5 rounded ${primarySelected.textAlign === 'center' ? 'bg-slate-200 dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => updateTextOrStickyStyle(primarySelected, { textAlign: 'right' }, true)}
                        title="Align Right"
                        className={`p-1.5 rounded ${primarySelected.textAlign === 'right' ? 'bg-slate-200 dark:bg-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                {/* Image Inline Crop Button & Presets */}
                {primarySelected?.type === 'image' && (
                  <div className="flex items-center gap-1 pl-2 ml-1 border-l border-slate-200 dark:border-slate-800">
                    <button
                      onClick={() => setCroppingId((prev) => (prev === primarySelected.id ? null : primarySelected.id))}
                      className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 whitespace-nowrap ${
                        croppingId === primarySelected.id
                          ? 'bg-emerald-600 text-white'
                          : 'border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Toggle inline crop handles (or double-click image)"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>{croppingId === primarySelected.id ? 'Done Crop' : 'Crop'}</span>
                    </button>
                    {(croppingId === primarySelected.id || primarySelected.crop) && (
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
                            onClick={() => applyImageCropPreset(primarySelected, preset.ratio)}
                            className="hidden sm:inline-flex px-1.5 py-1 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium tabular-nums whitespace-nowrap"
                            title={`Crop image to ${preset.label}`}
                          >
                            {preset.label}
                          </button>
                        ))}
                        {primarySelected.crop && (
                          <button
                            onClick={() => applyImageCropPreset(primarySelected, null)}
                            className="px-2 py-1 rounded-md border border-amber-300 dark:border-amber-700/70 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[11px] font-medium whitespace-nowrap"
                            title="Reset crop to full image"
                          >
                            Reset
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Open Equation / Graph Studio directly from selected element */}
                {primarySelected && (primarySelected.type === 'math' || primarySelected.type === 'graph') && onOpenMathOrGraph && (
                  <div className="flex items-center gap-1 pl-2 ml-1 border-l border-slate-200 dark:border-slate-800">
                    <button
                      onClick={() => onOpenMathOrGraph(primarySelected.type === 'math' ? 'equation' : 'graph', primarySelected)}
                      className="px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1 whitespace-nowrap"
                    >
                      {primarySelected.type === 'math' ? <FunctionSquare className="w-3.5 h-3.5" /> : <LineChart className="w-3.5 h-3.5" />}
                      <span>Open Studio</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Duplicate / Lock / Delete */}
              <div className="flex items-center gap-1 shrink-0">
                {onDuplicateSelected && (
                  <button
                    onClick={onDuplicateSelected}
                    title="Duplicate (Ctrl+D)"
                    className="px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1 whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Duplicate</span>
                  </button>
                )}
                {primarySelected && (
                  <button
                    onClick={() => onUpdateObject(primarySelected.id, { locked: !primarySelected.locked }, true)}
                    className={`p-1.5 rounded-md ${primarySelected.locked ? 'bg-amber-500/20 text-amber-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title={primarySelected.locked ? 'Unlock' : 'Lock'}
                  >
                    {primarySelected.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  onClick={() => onDeleteObjects(Array.from(selectedIds))}
                  className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-600"
                  title="Delete selected (Del)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 1280x720 Studio Artboard Stage */}
          <div ref={stageWrapRef} className="flex-1 min-h-0 relative overflow-hidden">
            {activeSlide && (
              <CanvasStage
                page={activeSlide}
                activeTool={slideTool}
                activeShapeKind={slideShapeKind}
                strokeColor={strokeColor}
                fillColor={fillColor}
                strokeWidth={3}
                opacity={1}
                lineStyle="solid"
                smoothing={0.5}
                stabilization={0.4}
                eraserMode="stroke"
                eraserSize={22}
                autoSmartShape={false}
                palmRejection={false}
                snapToGrid={true}
                showRulers={false}
                showMinimap={false}
                canvasLocked={!canEdit}
                canEdit={canEdit}
                zoom={zoom}
                panX={panX}
                panY={panY}
                rotationDeg={0}
                selectedIds={selectedIds}
                instruments={[]}
                remoteCursors={[]}
                remoteLaserPoints={[]}
                reactions={[]}
                onZoomChange={(z) => {
                  setManualViewport(true);
                  setZoom(z);
                }}
                onPanChange={(x, y) => {
                  setManualViewport(true);
                  setPanX(x);
                  setPanY(y);
                }}
                onSelectIds={onSelectIds}
                onCreateObject={onInsertObjectOnSlide}
                onUpdateObject={onUpdateObject}
                onDeleteObjects={onDeleteObjects}
                onSnapshotUndo={onSnapshotUndo}
                onSyncPageState={onSyncPageState}
                onReplacePageObjects={onReplacePageObjects}
                onOpenMathOrGraph={onOpenMathOrGraph}
                onQuickAIAction={onQuickAIAction}
                onReorderZ={onReorderZ}
                onDuplicateSelected={onDuplicateSelected}
                onChangeStrokeColor={handleSelectColorSwatch}
                onSetActiveTool={setSlideTool}
                onCursorMove={() => {}}
                onLaserPoint={() => {}}
                onUpdateInstrument={() => {}}
                onAddGuide={() => {}}
                onRemoveGuide={() => {}}
                onDropFiles={(files) => {
                  const first = files[0];
                  if (first?.name.toLowerCase().endsWith('.pptx')) onImportPPTXFile(first);
                  else if (first?.type.startsWith('image/')) handleInsertImageFile(first);
                }}
                canvasRefOut={stageCanvasRef}
                hideSelectionOverlayBar
                externalCroppingId={croppingId}
                onExternalCroppingIdChange={setCroppingId}
                slideArtboard={{
                  width: SLIDE_WIDTH,
                  height: SLIDE_HEIGHT,
                  showSafeMargins,
                  isDarkDesk: isDarkApp,
                }}
              />
            )}

            {/* Link-to-Slide icon overlays on the editing canvas */}
            {activeSlide && !fullscreenPresenting && activeSlide.objects.filter((o) => o.linkToSlide).length > 0 && (
              <div className="absolute inset-0 pointer-events-none z-[5]">
                {activeSlide.objects
                  .filter((o) => o.linkToSlide)
                  .map((o) => {
                    const sx = (o.x * zoom + panX);
                    const sy = (o.y * zoom + panY);
                    return (
                      <div
                        key={`link-${o.id}`}
                        className="absolute flex items-center justify-center"
                        style={{ left: sx, top: sy, width: 18 * zoom, height: 18 * zoom }}
                        title={`Links to: ${pages.find((pg) => pg.id === o.linkToSlide)?.name || 'Slide'}`}
                      >
                        <svg className="w-full h-full drop-shadow" viewBox="0 0 24 24" fill="rgba(37,99,235,0.85)" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Non-Blocking Empty Slide Quick-Start Dock */}
            {activeSlide && activeSlide.objects.length === 0 && canEdit && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 shadow-xl max-w-[92%] overflow-x-auto scrollbar-none">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 pr-1 whitespace-nowrap">Quick Start</span>
                {(
                  [
                    ['title_hero', 'Title Hero'],
                    ['two_column', '2 Columns'],
                    ['kpi_cards', 'KPI Metrics'],
                    ['timeline_roadmap', 'Roadmap'],
                  ] as [SlideLayoutId, string][]
                ).map(([lid, label]) => (
                  <button
                    key={lid}
                    onClick={() => handleApplyLayout(lid, false)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
                  >
                    {label}
                  </button>
                ))}
                {onOpenAISlides && (
                  <button
                    onClick={onOpenAISlides}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3 h-3" /> AI Deck
                  </button>
                )}
                <button
                  onClick={() => pptxInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium whitespace-nowrap shrink-0"
                >
                  Import .pptx
                </button>
              </div>
            )}

          </div>

          {/* BOTTOM COLLAPSIBLE SPEAKER NOTES & VIEWPORT STATUS BAR */}
          <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 pb-safe">
            <div className="min-h-9 px-2 sm:px-3 py-1 flex items-center justify-between gap-1.5 sm:gap-3 text-xs text-slate-600 dark:text-slate-300">
              <button
                type="button"
                onClick={() => setShowNotesDrawer((v) => !v)}
                className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 py-1 px-1.5 -ml-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left"
              >
                <NotebookPen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium truncate">Speaker Notes</span>
                {activeSlide?.speakerNotes?.trim() && (() => {
                  const wc = activeSlide.speakerNotes.trim().split(/\s+/).length;
                  return (
                    <span className="hidden sm:inline font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
                      ({wc} {wc === 1 ? 'word' : 'words'})
                    </span>
                  );
                })()}
                <span className="hidden sm:inline text-[11px] text-slate-400 ml-1 shrink-0">
                  · {showNotesDrawer ? 'Hide' : 'Expand'}
                </span>
              </button>

              <div className="flex items-center gap-1 shrink-0 pl-2 border-l border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSafeMargins((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                    showSafeMargins
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Toggle 48px Safe Margin Guides"
                >
                  Guides
                </button>
                <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700" />
                <button
                  type="button"
                  onClick={() => {
                    setManualViewport(true);
                    setZoom((z) => Math.max(0.2, Number((z - 0.1).toFixed(2))));
                  }}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => {
                    setManualViewport(true);
                    setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))));
                  }}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualViewport(false);
                    fitArtboardToStage();
                  }}
                  className="px-2 py-0.5 rounded text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                  title="Fit Slide (0)"
                >
                  Fit
                </button>
              </div>
            </div>
            {showNotesDrawer && activeSlide && (
              <div className="px-4 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <textarea
                  value={activeSlide.speakerNotes || ''}
                  onChange={(e) => canEdit && onUpdatePage(activeSlide.id, { speakerNotes: e.target.value })}
                  readOnly={!canEdit}
                  rows={3}
                  placeholder="Write talking points, cues, or formulas to read in Presenter View (automatically saved and exported to PowerPoint notes)..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs leading-relaxed outline-none focus:border-blue-500 resize-none"
                />
              </div>
            )}
          </div>
        </main>

        {/* RIGHT SLEEK INSPECTOR (DESIGN / ELEMENT / ANIMATE) */}
        {inspectorOpen && activeSlide && (
          <>
            <div
              onClick={() => setInspectorOpen(false)}
              className="lg:hidden fixed inset-0 z-30 bg-slate-950/35"
            />
            <aside
              data-properties-panel="true"
              className="fixed inset-y-0 right-0 z-40 w-[min(88vw,300px)] shadow-2xl pb-safe lg:static lg:inset-auto lg:z-auto lg:w-72 lg:shadow-none lg:pb-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0"
            >
              {/* Segmented Tab Switcher */}
              <div className="p-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5">
                <div className="flex-1 grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg">
                  {(['design', 'element', 'animate'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setInspectorTab(tab)}
                      className={`py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                        inspectorTab === tab
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setInspectorOpen(false)}
                  className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0"
                  aria-label="Close inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
              {/* DESIGN TAB */}
              {inspectorTab === 'design' && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Theme Presets</span>
                      {canEdit && onApplyThemeToAll && (
                        <button
                          onClick={() => applyThemeToSlide(activeTheme, true)}
                          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Apply to All
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {SLIDE_THEMES.map((t) => {
                        const selected =
                          activeSlide.background.toLowerCase() === t.bg.toLowerCase() &&
                          (activeSlide.slideGradient?.from || '') === (t.gradient?.from || '');
                        return (
                          <button
                            key={t.id}
                            disabled={!canEdit}
                            onClick={() => applyThemeToSlide(t, false)}
                            className={`rounded-lg border p-2 text-left transition-all disabled:opacity-50 ${
                              selected ? 'border-blue-600 ring-1 ring-blue-600/30' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                            }`}
                          >
                            <div
                              className="h-9 rounded-md border border-black/10 p-1.5 flex flex-col justify-between mb-1.5"
                              style={{
                                background: t.gradient
                                  ? `linear-gradient(${t.gradient.angle}deg, ${t.gradient.from}, ${t.gradient.to})`
                                  : t.bg,
                              }}
                            >
                              <div className="w-7 h-1.5 rounded-sm" style={{ backgroundColor: t.accentColor }} />
                              <div className="text-[10px] font-bold leading-none" style={{ color: t.titleColor }}>
                                Aa
                              </div>
                            </div>
                            <div className="text-[11px] font-medium truncate">{t.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Background & Gradient */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Slide Canvas</div>
                    <div className="flex items-center justify-between text-xs">
                      <span>Background Color</span>
                      <input
                        type="color"
                        disabled={!canEdit}
                        value={activeSlide.background}
                        onChange={(e) => onUpdatePage(activeSlide.id, { background: e.target.value, slideGradient: undefined })}
                        className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span>Gradient Fill</span>
                      <button
                        disabled={!canEdit}
                        onClick={() =>
                          onUpdatePage(activeSlide.id, {
                            slideGradient: activeSlide.slideGradient
                              ? undefined
                              : { from: activeTheme.bg, to: activeTheme.cardBg, angle: 135 },
                          })
                        }
                        className={`px-2 py-1 rounded text-[11px] font-medium border ${
                          activeSlide.slideGradient
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {activeSlide.slideGradient ? 'Enabled' : 'Solid'}
                      </button>
                    </div>

                    {activeSlide.slideGradient && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[11px] text-slate-500 flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
                            <span>Start</span>
                            <input
                              type="color"
                              value={activeSlide.slideGradient.from}
                              onChange={(e) =>
                                onUpdatePage(activeSlide.id, {
                                  slideGradient: { ...activeSlide.slideGradient!, from: e.target.value },
                                })
                              }
                              className="w-5 h-5 border-0 bg-transparent cursor-pointer"
                            />
                          </label>
                          <label className="text-[11px] text-slate-500 flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
                            <span>End</span>
                            <input
                              type="color"
                              value={activeSlide.slideGradient.to}
                              onChange={(e) =>
                                onUpdatePage(activeSlide.id, {
                                  slideGradient: { ...activeSlide.slideGradient!, to: e.target.value },
                                })
                              }
                              className="w-5 h-5 border-0 bg-transparent cursor-pointer"
                            />
                          </label>
                        </div>
                        <label className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>Angle ({activeSlide.slideGradient.angle ?? 135}°)</span>
                          <input
                            type="range"
                            min={0}
                            max={360}
                            step={15}
                            value={activeSlide.slideGradient.angle ?? 135}
                            onChange={(e) =>
                              onUpdatePage(activeSlide.id, {
                                slideGradient: { ...activeSlide.slideGradient!, angle: Number(e.target.value) },
                              })
                            }
                            className="w-28"
                          />
                        </label>
                      </div>
                    )}

                    <div>
                      <div className="text-[11px] text-slate-500 mb-1.5">Slide Grid Overlay</div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['none', 'dots', 'lines'] as const).map((g) => (
                          <button
                            key={g}
                            disabled={!canEdit}
                            onClick={() => onUpdatePage(activeSlide.id, { gridType: g })}
                            className={`py-1.5 rounded-md text-xs font-medium capitalize border ${
                              activeSlide.gridType === g
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Master Slide */}
                  {canEdit && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <Layers className="w-3.5 h-3.5" />
                        <span>Master Slide</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>Background</span>
                        <input
                          type="color"
                          value={slideMaster.bgColor}
                          onChange={(e) => setSlideMaster((m) => ({ ...m, bgColor: e.target.value }))}
                          className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>Accent Color</span>
                        <input
                          type="color"
                          value={slideMaster.accentColor}
                          onChange={(e) => setSlideMaster((m) => ({ ...m, accentColor: e.target.value }))}
                          className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>Font Family</span>
                        <select
                          value={slideMaster.fontFamily}
                          onChange={(e) => setSlideMaster((m) => ({ ...m, fontFamily: e.target.value }))}
                          className="px-2 py-1 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                          {FONT_OPTIONS.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={applyMasterToAll}
                        className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                      >
                        Apply to All Slides
                      </button>
                    </div>
                  )}

                  {/* Slide Numbers & Deck Footer Batch Utility */}
                  {onApplySlideNumbers && canEdit && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <Hash className="w-3.5 h-3.5" />
                        <span>Slide Numbers &amp; Footer</span>
                      </div>
                      <input
                        value={footerLabelInput}
                        onChange={(e) => setFooterLabelInput(e.target.value)}
                        placeholder="Deck footer title..."
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => onApplySlideNumbers(footerLabelInput, true, false)}
                          className="py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                        >
                          Apply to All
                        </button>
                        <button
                          onClick={() => onApplySlideNumbers('', false, true)}
                          className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visual Layout Wireframe Picker */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Apply Layout</div>
                    <div className="grid grid-cols-2 gap-2">
                      {SLIDE_LAYOUTS.map((l) => (
                        <button
                          key={l.id}
                          disabled={!canEdit}
                          onClick={() => {
                            setApplyLayoutMode('current');
                            handleApplyLayout(l.id, false);
                          }}
                          className={`p-1.5 rounded-lg border text-left transition-colors disabled:opacity-40 ${
                            activeSlide.slideLayout === l.id
                              ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                          }`}
                        >
                          <LayoutMiniPreview id={l.id} accent={activeTheme.accentColor} />
                          <div className="text-[11px] font-semibold truncate mt-1">{l.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ELEMENT TAB — Covers EVERY BoardObject Type + Slide Elements Layers List */}
              {inspectorTab === 'element' && (
                <>
                  {/* Collapsible Slide Elements / Layers Organizer */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 overflow-hidden">
                    <button
                      onClick={() => setLayersOpen((v) => !v)}
                      className="w-full px-2.5 py-2 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        <span>Slide Elements ({activeSlide.objects.length})</span>
                      </span>
                      {layersOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                    {layersOpen && (
                      <div className="border-t border-slate-200 dark:border-slate-800 max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                        {activeSlide.objects.length === 0 ? (
                          <div className="p-3 text-[11px] text-slate-500 text-center">No elements on this slide yet.</div>
                        ) : (
                          [...activeSlide.objects]
                            .sort((a, b) => b.zIndex - a.zIndex)
                            .map((el) => {
                              const isSel = selectedIds.has(el.id);
                              const label =
                                el.name ||
                                ('text' in el && typeof el.text === 'string' && el.text.trim()
                                  ? el.text.split('\n')[0].slice(0, 22)
                                  : el.type);
                              return (
                                <div
                                  key={el.id}
                                  onClick={() => onSelectIds(new Set([el.id]))}
                                  className={`px-2 py-1.5 flex items-center justify-between gap-1.5 text-[11px] cursor-pointer ${
                                    isSel
                                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold'
                                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <span className="truncate flex-1">{label}</span>
                                  {canEdit && (
                                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      {onReorderZ && (
                                        <>
                                          <button
                                            onClick={() => onReorderZ(el.id, 'forward')}
                                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
                                            title="Move Forward"
                                          >
                                            <ArrowUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => onReorderZ(el.id, 'backward')}
                                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
                                            title="Move Backward"
                                          >
                                            <ArrowDown className="w-3 h-3" />
                                          </button>
                                        </>
                                      )}
                                      <button
                                        onClick={() => onUpdateObject(el.id, { hidden: !el.hidden }, true)}
                                        className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
                                          el.hidden ? 'text-amber-600' : 'text-slate-500'
                                        }`}
                                        title={el.hidden ? 'Show' : 'Hide'}
                                      >
                                        {el.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                      </button>
                                      <button
                                        onClick={() => onUpdateObject(el.id, { locked: !el.locked }, true)}
                                        className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
                                          el.locked ? 'text-amber-600' : 'text-slate-500'
                                        }`}
                                        title={el.locked ? 'Unlock' : 'Lock'}
                                      >
                                        {el.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                        )}
                      </div>
                    )}
                  </div>

                  {!primarySelected ? (
                    <div className="py-10 text-center text-xs text-slate-500 space-y-2">
                      <MousePointer2 className="w-6 h-6 mx-auto opacity-40" />
                      <p>
                        {selectedObjects.length > 1
                          ? `${selectedObjects.length} elements selected. Use the alignment & distribute bar above to arrange them.`
                          : 'Click any element on the 16:9 slide or in Slide Elements above to edit typography, fills, images, lines, charts, tables, equations, or graphs.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Geometry & Coordinates */}
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Position &amp; Size</div>
                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              ['X', 'x', Math.round(primarySelected.x)],
                              ['Y', 'y', Math.round(primarySelected.y)],
                              ['W', 'width', Math.round(primarySelected.width)],
                              ['H', 'height', Math.round(primarySelected.height)],
                            ] as const
                          ).map(([label, key, val]) => (
                            <label
                              key={key}
                              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs"
                            >
                              <span className="font-mono text-slate-400">{label}</span>
                              <input
                                type="number"
                                disabled={!canEdit}
                                value={val}
                                onChange={(e) => {
                                  const num = Number(e.target.value);
                                  if (!Number.isNaN(num)) {
                                    const safeVal = key === 'width' || key === 'height' ? Math.max(16, num) : num;
                                    if (primarySelected.type === 'stroke' || primarySelected.type === 'line') {
                                      const oldBox = {
                                        x: primarySelected.x,
                                        y: primarySelected.y,
                                        width: primarySelected.width,
                                        height: primarySelected.height,
                                      };
                                      const nextBox = { ...oldBox, [key]: safeVal };
                                      if (primarySelected.type === 'stroke') {
                                        onUpdateObject(
                                          primarySelected.id,
                                          { ...nextBox, points: scalePointsToBox(primarySelected.points, oldBox, nextBox) },
                                          true
                                        );
                                      } else {
                                        const scaledCp =
                                          typeof primarySelected.cpX === 'number' && typeof primarySelected.cpY === 'number'
                                            ? scalePointToBox({ x: primarySelected.cpX, y: primarySelected.cpY }, oldBox, nextBox)
                                            : null;
                                        onUpdateObject(
                                          primarySelected.id,
                                          {
                                            ...nextBox,
                                            points: scalePointsToBox(primarySelected.points, oldBox, nextBox),
                                            ...(scaledCp ? { cpX: Math.round(scaledCp.x), cpY: Math.round(scaledCp.y) } : {}),
                                          },
                                          true
                                        );
                                      }
                                    } else {
                                      onUpdateObject(primarySelected.id, { [key]: safeVal }, true);
                                    }
                                  }
                                }}
                                className="w-16 text-right font-mono tabular-nums bg-transparent outline-none"
                              />
                            </label>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs">
                            <span className="text-slate-400">Rot°</span>
                            <input
                              type="number"
                              disabled={!canEdit}
                              value={Math.round(primarySelected.rotation)}
                              onChange={(e) => onUpdateObject(primarySelected.id, { rotation: Number(e.target.value) || 0 }, true)}
                              className="w-14 text-right font-mono tabular-nums bg-transparent outline-none"
                            />
                          </label>
                          <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs">
                            <span className="text-slate-400">Alpha</span>
                            <input
                              type="number"
                              min={10}
                              max={100}
                              disabled={!canEdit}
                              value={Math.round((primarySelected.opacity ?? 1) * 100)}
                              onChange={(e) =>
                                onUpdateObject(
                                  primarySelected.id,
                                  { opacity: Math.max(0.1, Math.min(1, (Number(e.target.value) || 100) / 100)) },
                                  true
                                )
                              }
                              className="w-14 text-right font-mono tabular-nums bg-transparent outline-none"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Text Editor */}
                      {primarySelected.type === 'text' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Typography</div>
                          <textarea
                            rows={3}
                            disabled={!canEdit}
                            value={primarySelected.text}
                            onChange={(e) => onUpdateObject(primarySelected.id, { text: e.target.value, richBlocks: undefined }, true)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 text-xs outline-none focus:border-blue-500"
                          />
                          <div className="flex items-center gap-1.5">
                            <select
                              disabled={!canEdit}
                              value={primarySelected.fontFamily}
                              onChange={(e) => onUpdateObject(primarySelected.id, { fontFamily: e.target.value }, true)}
                              className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-xs outline-none"
                            >
                              {FONT_OPTIONS.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={10}
                              max={120}
                              disabled={!canEdit}
                              value={primarySelected.fontSize}
                              onChange={(e) =>
                                onUpdateObject(
                                  primarySelected.id,
                                  { fontSize: Math.max(10, Math.min(120, Number(e.target.value) || 18)) },
                                  true
                                )
                              }
                              className="w-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-1.5 text-xs font-mono tabular-nums text-right outline-none"
                              title="Font Size (px)"
                            />
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            <button
                              onClick={() =>
                                updateTextOrStickyStyle(
                                  primarySelected,
                                  { fontWeight: primarySelected.fontWeight === 'bold' ? 'normal' : 'bold' },
                                  true
                                )
                              }
                              className={`py-1.5 rounded-md border text-xs flex justify-center ${
                                primarySelected.fontWeight === 'bold'
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <Bold className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                updateTextOrStickyStyle(
                                  primarySelected,
                                  { fontStyle: primarySelected.fontStyle === 'italic' ? 'normal' : 'italic' },
                                  true
                                )
                              }
                              className={`py-1.5 rounded-md border text-xs flex justify-center ${
                                primarySelected.fontStyle === 'italic'
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <Italic className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                updateTextOrStickyStyle(primarySelected, { underline: !primarySelected.underline }, true)
                              }
                              className={`py-1.5 rounded-md border text-xs flex justify-center ${
                                primarySelected.underline
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <Underline className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                updateTextOrStickyStyle(
                                  primarySelected,
                                  { strikethrough: !primarySelected.strikethrough },
                                  true
                                )
                              }
                              className={`py-1.5 rounded-md border text-xs flex justify-center ${
                                primarySelected.strikethrough
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <Strikethrough className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-4 gap-1">
                            {(
                              [
                                ['left', AlignLeft],
                                ['center', AlignCenter],
                                ['right', AlignRight],
                                ['justify', AlignJustify],
                              ] as const
                            ).map(([al, Icon]) => (
                              <button
                                key={al}
                                onClick={() => updateTextOrStickyStyle(primarySelected, { textAlign: al }, true)}
                                className={`py-1.5 rounded-md border flex justify-center ${
                                  primarySelected.textAlign === al
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                                title={`Align ${al}`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Text Color</span>
                            <input
                              type="color"
                              value={primarySelected.textColor}
                              onChange={(e) => updateTextOrStickyStyle(primarySelected, { textColor: e.target.value }, true)}
                              className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                            />
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {QUICK_SWATCHES.map((c) => (
                              <button
                                key={c}
                                onClick={() => updateTextOrStickyStyle(primarySelected, { textColor: c }, true)}
                                className="w-5 h-5 rounded-md border border-slate-300 dark:border-slate-700"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Highlight</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => updateTextOrStickyStyle(primarySelected, { highlightColor: 'transparent' }, true)}
                                className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                              >
                                Clear
                              </button>
                              <input
                                type="color"
                                value={
                                  !primarySelected.highlightColor || primarySelected.highlightColor === 'transparent'
                                    ? '#FEF08A'
                                    : primarySelected.highlightColor
                                }
                                onChange={(e) =>
                                  updateTextOrStickyStyle(primarySelected, { highlightColor: e.target.value }, true)
                                }
                                className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Box Fill</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onUpdateObject(primarySelected.id, { bgColor: 'transparent' }, true)}
                                className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                              >
                                Clear
                              </button>
                              <input
                                type="color"
                                value={primarySelected.bgColor === 'transparent' ? '#FFFFFF' : primarySelected.bgColor}
                                onChange={(e) => onUpdateObject(primarySelected.id, { bgColor: e.target.value }, true)}
                                className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span>Box Border</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  onUpdateObject(primarySelected.id, { borderColor: 'transparent', borderWidth: 0 }, true)
                                }
                                className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                              >
                                None
                              </button>
                              <input
                                type="color"
                                value={
                                  !primarySelected.borderColor || primarySelected.borderColor === 'transparent'
                                    ? '#CBD5E1'
                                    : primarySelected.borderColor
                                }
                                onChange={(e) =>
                                  onUpdateObject(
                                    primarySelected.id,
                                    { borderColor: e.target.value, borderWidth: primarySelected.borderWidth || 1.5 },
                                    true
                                  )
                                }
                                className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                          </div>

                          <label className="flex items-center justify-between text-xs">
                            <span>Corner Radius ({primarySelected.borderRadius ?? 0}px)</span>
                            <input
                              type="range"
                              min={0}
                              max={32}
                              value={primarySelected.borderRadius ?? 0}
                              onChange={(e) => onUpdateObject(primarySelected.id, { borderRadius: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>

                          <label className="flex items-center justify-between text-xs">
                            <span>Line Height ({(primarySelected.lineHeight || 1.38).toFixed(2)})</span>
                            <input
                              type="range"
                              min={1}
                              max={2.2}
                              step={0.05}
                              value={primarySelected.lineHeight || 1.38}
                              onChange={(e) => onUpdateObject(primarySelected.id, { lineHeight: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>
                          <label className="flex items-center justify-between text-xs">
                            <span>Padding ({primarySelected.padding ?? 10}px)</span>
                            <input
                              type="range"
                              min={0}
                              max={40}
                              value={primarySelected.padding ?? 10}
                              onChange={(e) => onUpdateObject(primarySelected.id, { padding: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>
                        </div>
                      )}

                      {/* Shape Editor */}
                      {primarySelected.type === 'shape' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Shape Style</div>
                          <select
                            value={primarySelected.shapeKind}
                            onChange={(e) => onUpdateObject(primarySelected.id, { shapeKind: e.target.value as ShapeKind }, true)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs outline-none"
                          >
                            {SHAPE_GALLERY.map((sg) => (
                              <option key={sg.kind} value={sg.kind}>
                                {sg.label}
                              </option>
                            ))}
                          </select>
                          <textarea
                            rows={2}
                            value={primarySelected.text}
                            placeholder="Shape label text..."
                            onChange={(e) => onUpdateObject(primarySelected.id, { text: e.target.value }, true)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 resize-y"
                          />
                          <div className="flex items-center justify-between text-xs">
                            <span>Fill Color</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onUpdateObject(primarySelected.id, { fill: 'transparent', fillGradient: undefined }, true)}
                                className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                              >
                                None
                              </button>
                              <input
                                type="color"
                                value={primarySelected.fill === 'transparent' ? '#FFFFFF' : primarySelected.fill}
                                onChange={(e) => onUpdateObject(primarySelected.id, { fill: e.target.value, fillGradient: undefined }, true)}
                                className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Gradient Fill</span>
                            <button
                              onClick={() =>
                                onUpdateObject(
                                  primarySelected.id,
                                  {
                                    fillGradient: primarySelected.fillGradient
                                      ? undefined
                                      : { from: activeTheme.accentColor, to: '#7C3AED', angle: 135 },
                                  },
                                  true
                                )
                              }
                              className={`px-2 py-1 rounded text-[11px] font-medium border ${
                                primarySelected.fillGradient ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {primarySelected.fillGradient ? 'On' : 'Off'}
                            </button>
                          </div>
                          {primarySelected.fillGradient && (
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-[11px] flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded px-2 py-1">
                                <span>From</span>
                                <input
                                  type="color"
                                  value={primarySelected.fillGradient.from}
                                  onChange={(e) =>
                                    onUpdateObject(
                                      primarySelected.id,
                                      { fillGradient: { ...primarySelected.fillGradient!, from: e.target.value } },
                                      true
                                    )
                                  }
                                  className="w-5 h-5 border-0 bg-transparent"
                                />
                              </label>
                              <label className="text-[11px] flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded px-2 py-1">
                                <span>To</span>
                                <input
                                  type="color"
                                  value={primarySelected.fillGradient.to}
                                  onChange={(e) =>
                                    onUpdateObject(
                                      primarySelected.id,
                                      { fillGradient: { ...primarySelected.fillGradient!, to: e.target.value } },
                                      true
                                    )
                                  }
                                  className="w-5 h-5 border-0 bg-transparent"
                                />
                              </label>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs">
                            <span>Border Color</span>
                            <input
                              type="color"
                              value={primarySelected.stroke === 'transparent' ? '#2563EB' : primarySelected.stroke}
                              onChange={(e) => onUpdateObject(primarySelected.id, { stroke: e.target.value }, true)}
                              className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Text Color</span>
                            <input
                              type="color"
                              value={primarySelected.textColor || '#0F172A'}
                              onChange={(e) => onUpdateObject(primarySelected.id, { textColor: e.target.value }, true)}
                              className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                            />
                          </div>
                          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={primarySelected.fontFamily}
                                onChange={(e) => onUpdateObject(primarySelected.id, { fontFamily: e.target.value }, true)}
                                className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs outline-none"
                              >
                                {FONT_OPTIONS.map((f) => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min={10}
                                max={96}
                                value={primarySelected.fontSize}
                                onChange={(e) =>
                                  onUpdateObject(
                                    primarySelected.id,
                                    { fontSize: Math.max(10, Math.min(96, Number(e.target.value) || 16)) },
                                    true
                                  )
                                }
                                className="w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-1 text-xs font-mono tabular-nums text-right outline-none"
                                title="Label Font Size"
                              />
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              <button
                                onClick={() =>
                                  onUpdateObject(
                                    primarySelected.id,
                                    { fontWeight: primarySelected.fontWeight === 'bold' ? 'normal' : 'bold' },
                                    true
                                  )
                                }
                                className={`py-1 rounded border flex justify-center ${
                                  primarySelected.fontWeight === 'bold'
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                                title="Bold"
                              >
                                <Bold className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() =>
                                  onUpdateObject(
                                    primarySelected.id,
                                    { fontStyle: primarySelected.fontStyle === 'italic' ? 'normal' : 'italic' },
                                    true
                                  )
                                }
                                className={`py-1 rounded border flex justify-center ${
                                  primarySelected.fontStyle === 'italic'
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                                title="Italic"
                              >
                                <Italic className="w-3 h-3" />
                              </button>
                              {(['left', 'center', 'right'] as const).map((al) => {
                                const Icon = al === 'left' ? AlignLeft : al === 'center' ? AlignCenter : AlignRight;
                                return (
                                  <button
                                    key={al}
                                    onClick={() => onUpdateObject(primarySelected.id, { textAlign: al }, true)}
                                    className={`py-1 rounded border flex justify-center ${
                                      primarySelected.textAlign === al
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'border-slate-200 dark:border-slate-700'
                                    }`}
                                    title={`Align ${al}`}
                                  >
                                    <Icon className="w-3 h-3" />
                                  </button>
                                );
                              })}
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              {(['top', 'middle', 'bottom'] as const).map((va) => (
                                <button
                                  key={va}
                                  onClick={() => onUpdateObject(primarySelected.id, { verticalAlign: va }, true)}
                                  className={`py-1 rounded text-[11px] capitalize border ${
                                    (primarySelected.verticalAlign || 'middle') === va
                                      ? 'bg-blue-600 border-blue-600 text-white'
                                      : 'border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  {va}
                                </button>
                              ))}
                            </div>
                          </div>
                          <label className="flex items-center justify-between text-xs">
                            <span>Border Width ({primarySelected.strokeWidth}px)</span>
                            <input
                              type="range"
                              min={0}
                              max={12}
                              value={primarySelected.strokeWidth}
                              onChange={(e) => onUpdateObject(primarySelected.id, { strokeWidth: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>
                          <div className="grid grid-cols-3 gap-1">
                            {(['solid', 'dashed', 'dotted'] as const).map((ls) => (
                              <button
                                key={ls}
                                onClick={() => onUpdateObject(primarySelected.id, { lineStyle: ls }, true)}
                                className={`py-1 rounded text-[11px] capitalize border ${
                                  (primarySelected.lineStyle || 'solid') === ls
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {ls}
                              </button>
                            ))}
                          </div>
                          <label className="flex items-center justify-between text-xs">
                            <span>Radius ({primarySelected.cornerRadius ?? 0}px)</span>
                            <input
                              type="range"
                              min={0}
                              max={48}
                              value={primarySelected.cornerRadius ?? 0}
                              onChange={(e) => onUpdateObject(primarySelected.id, { cornerRadius: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>
                          <div className="flex items-center justify-between text-xs">
                            <span>Elevation Shadow</span>
                            <button
                              onClick={() => onUpdateObject(primarySelected.id, { shadow: !primarySelected.shadow }, true)}
                              className={`px-2 py-1 rounded text-[11px] font-medium border ${
                                primarySelected.shadow ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {primarySelected.shadow ? 'On' : 'Off'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Image Editor */}
                      {primarySelected.type === 'image' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Image &amp; Crop</div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => setCroppingId((prev) => (prev === primarySelected.id ? null : primarySelected.id))}
                              className={`py-1.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1 ${
                                croppingId === primarySelected.id
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <Crop className="w-3.5 h-3.5" />
                              <span>{croppingId === primarySelected.id ? 'Done Crop' : 'Crop'}</span>
                            </button>
                            <button
                              onClick={() => replaceImageInputRef.current?.click()}
                              className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
                            >
                              Replace
                            </button>
                          </div>
                          {croppingId === primarySelected.id && (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-md px-2 py-1">
                              Drag handles to trim or expand • Drag inside to pan • Enter to apply
                            </p>
                          )}
                          <div>
                            <div className="text-[11px] text-slate-500 mb-1">Crop Aspect Ratio</div>
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
                                  onClick={() => applyImageCropPreset(primarySelected, preset.ratio)}
                                  className="py-1 rounded text-[11px] font-medium tabular-nums border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {primarySelected.crop && (
                            <button
                              onClick={() => applyImageCropPreset(primarySelected, null)}
                              className="w-full py-1.5 rounded-lg border border-amber-300 dark:border-amber-700/70 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                            >
                              Reset Crop Frame
                            </button>
                          )}

                          <div>
                            <div className="text-[11px] text-slate-500 mb-1">Mask Frame</div>
                            <div className="grid grid-cols-3 gap-1">
                              {IMAGE_MASKS.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => onUpdateObject(primarySelected.id, { mask: m.id }, true)}
                                  className={`py-1 rounded text-[11px] border ${
                                    primarySelected.mask === m.id
                                      ? 'bg-blue-600 border-blue-600 text-white'
                                      : 'border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>Color Adjustments</span>
                              <button
                                onClick={() =>
                                  onUpdateObject(
                                    primarySelected.id,
                                    { filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 } },
                                    true
                                  )
                                }
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Reset
                              </button>
                            </div>
                            {(
                              [
                                ['Brightness', 'brightness', 40, 180],
                                ['Contrast', 'contrast', 40, 180],
                                ['Grayscale', 'grayscale', 0, 100],
                                ['Sepia', 'sepia', 0, 100],
                                ['Blur', 'blur', 0, 10],
                              ] as const
                            ).map(([label, key, minV, maxV]) => (
                              <label key={key} className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">{label}</span>
                                <input
                                  type="range"
                                  min={minV}
                                  max={maxV}
                                  value={primarySelected.filters?.[key] ?? (key === 'brightness' || key === 'contrast' ? 100 : 0)}
                                  onChange={(e) =>
                                    onUpdateObject(
                                      primarySelected.id,
                                      {
                                        filters: {
                                          ...(primarySelected.filters ?? {
                                            brightness: 100,
                                            contrast: 100,
                                            grayscale: 0,
                                            sepia: 0,
                                            blur: 0,
                                          }),
                                          [key]: Number(e.target.value),
                                        },
                                      },
                                      true
                                    )
                                  }
                                  className="w-28"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Line & Connector Editor */}
                      {(primarySelected.type === 'line' || primarySelected.type === 'connector') && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            {primarySelected.type === 'connector' ? 'Smart Connector' : 'Line / Arrow'}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Stroke Color</span>
                            <input
                              type="color"
                              value={primarySelected.stroke}
                              onChange={(e) => onUpdateObject(primarySelected.id, { stroke: e.target.value }, true)}
                              className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                            />
                          </div>
                          <label className="flex items-center justify-between text-xs">
                            <span>Thickness ({primarySelected.strokeWidth}px)</span>
                            <input
                              type="range"
                              min={1}
                              max={14}
                              value={primarySelected.strokeWidth}
                              onChange={(e) => onUpdateObject(primarySelected.id, { strokeWidth: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>
                          <div className="grid grid-cols-3 gap-1">
                            {(['solid', 'dashed', 'dotted'] as const).map((ls) => (
                              <button
                                key={ls}
                                onClick={() => onUpdateObject(primarySelected.id, { lineStyle: ls }, true)}
                                className={`py-1 rounded text-[11px] capitalize border ${
                                  primarySelected.lineStyle === ls
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {ls}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[11px] space-y-1">
                              <span className="text-slate-500">Start Head</span>
                              <select
                                value={primarySelected.startHead}
                                onChange={(e) =>
                                  onUpdateObject(primarySelected.id, { startHead: e.target.value as LineEndpointStyle }, true)
                                }
                                className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-1 text-xs"
                              >
                                {(['none', 'arrow', 'dot', 'diamond'] as const).map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-[11px] space-y-1">
                              <span className="text-slate-500">End Head</span>
                              <select
                                value={primarySelected.endHead}
                                onChange={(e) =>
                                  onUpdateObject(primarySelected.id, { endHead: e.target.value as LineEndpointStyle }, true)
                                }
                                className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-1 text-xs"
                              >
                                {(['none', 'arrow', 'dot', 'diamond'] as const).map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {primarySelected.type === 'line' && primarySelected.points.length === 2 && (
                            <div className="flex items-center justify-between text-xs">
                              <span>Curved Bezier Arc</span>
                              <button
                                onClick={() => onUpdateObject(primarySelected.id, { curved: !primarySelected.curved }, true)}
                                className={`px-2 py-1 rounded text-[11px] font-medium border ${
                                  primarySelected.curved ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {primarySelected.curved ? 'Curved' : 'Straight'}
                              </button>
                            </div>
                          )}
                          {primarySelected.type === 'connector' && (
                            <>
                              <div className="grid grid-cols-3 gap-1">
                                {(['straight', 'orthogonal', 'curved'] as const).map((rt) => (
                                  <button
                                    key={rt}
                                    onClick={() => onUpdateObject(primarySelected.id, { routeType: rt }, true)}
                                    className={`py-1 rounded text-[11px] capitalize border ${
                                      primarySelected.routeType === rt
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'border-slate-200 dark:border-slate-700'
                                    }`}
                                  >
                                    {rt}
                                  </button>
                                ))}
                              </div>
                              <input
                                value={primarySelected.label || ''}
                                onChange={(e) => onUpdateObject(primarySelected.id, { label: e.target.value }, true)}
                                placeholder="Connector label..."
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs outline-none"
                              />
                            </>
                          )}
                        </div>
                      )}

                      {/* Live Chart Data Editor */}
                      {primarySelected.type === 'chart' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Live Chart Data</div>
                          <input
                            value={primarySelected.title}
                            onChange={(e) => onUpdateObject(primarySelected.id, { title: e.target.value }, true)}
                            placeholder="Chart Title"
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs outline-none"
                          />
                          <div className="grid grid-cols-3 gap-1">
                            {(['bar', 'line', 'doughnut', 'pie', 'area', 'horizontalBar'] as const).map((ct) => (
                              <button
                                key={ct}
                                onClick={() => onUpdateObject(primarySelected.id, { chartType: ct }, true)}
                                className={`py-1 rounded text-[11px] capitalize border ${
                                  primarySelected.chartType === ct
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {ct === 'horizontalBar' ? 'H-Bar' : ct}
                              </button>
                            ))}
                          </div>

                          {/* Row-by-Row Chart Data Rows */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>Series Rows</span>
                              <button
                                onClick={() =>
                                  onUpdateObject(
                                    primarySelected.id,
                                    {
                                      labels: [...primarySelected.labels, `Item ${primarySelected.labels.length + 1}`],
                                      values: [...primarySelected.values, 50],
                                    },
                                    true
                                  )
                                }
                                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                              >
                                + Add Row
                              </button>
                            </div>
                            <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                              {primarySelected.labels.map((lbl, rIdx) => (
                                <div key={rIdx} className="flex items-center gap-1">
                                  <input
                                    value={lbl}
                                    onChange={(e) => {
                                      const nextLabels = [...primarySelected.labels];
                                      nextLabels[rIdx] = e.target.value;
                                      onUpdateObject(primarySelected.id, { labels: nextLabels }, true);
                                    }}
                                    className="flex-1 min-w-0 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs outline-none"
                                  />
                                  <input
                                    type="number"
                                    value={primarySelected.values[rIdx] ?? 0}
                                    onChange={(e) => {
                                      const nextValues = [...primarySelected.values];
                                      nextValues[rIdx] = Number(e.target.value) || 0;
                                      onUpdateObject(primarySelected.id, { values: nextValues }, true);
                                    }}
                                    className="w-16 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-1 text-xs font-mono text-right outline-none"
                                  />
                                  {primarySelected.labels.length > 2 && (
                                    <button
                                      onClick={() =>
                                        onUpdateObject(
                                          primarySelected.id,
                                          {
                                            labels: primarySelected.labels.filter((_, i) => i !== rIdx),
                                            values: primarySelected.values.filter((_, i) => i !== rIdx),
                                            colors:
                                              primarySelected.colors.length > 2
                                                ? primarySelected.colors.filter((_, i) => i !== rIdx)
                                                : primarySelected.colors,
                                          },
                                          true
                                        )
                                      }
                                      className="p-1 text-slate-400 hover:text-rose-600"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Color Palettes */}
                          <div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1.5">
                              <Palette className="w-3 h-3" />
                              <span>Chart Palette</span>
                            </div>
                            <div className="space-y-1">
                              {CHART_PALETTES.map((pal) => (
                                <button
                                  key={pal.name}
                                  onClick={() => onUpdateObject(primarySelected.id, { colors: pal.colors }, true)}
                                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex items-center justify-between text-[11px]"
                                >
                                  <span>{pal.name}</span>
                                  <span className="flex items-center gap-0.5">
                                    {pal.colors.slice(0, 4).map((c) => (
                                      <span key={c} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
                                    ))}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Live Table Style, Structure & Cell Editor */}
                      {primarySelected.type === 'table' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Table Structure</div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => {
                                const nextRow = Array.from({ length: primarySelected.cols }, () => 'Cell');
                                const nextRowHeights =
                                  primarySelected.rowHeights && primarySelected.rowHeights.length === primarySelected.rows
                                    ? [
                                        ...primarySelected.rowHeights,
                                        Math.round(primarySelected.height / Math.max(1, primarySelected.rows)),
                                      ]
                                    : undefined;
                                onUpdateObject(
                                  primarySelected.id,
                                  {
                                    rows: primarySelected.rows + 1,
                                    cells: [...primarySelected.cells, nextRow],
                                    height: Math.min(SLIDE_HEIGHT - primarySelected.y, primarySelected.height + 36),
                                    ...(nextRowHeights ? { rowHeights: nextRowHeights } : {}),
                                  },
                                  true
                                );
                              }}
                              className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              + Row
                            </button>
                            <button
                              disabled={primarySelected.rows <= 1}
                              onClick={() => {
                                const nextRowHeights =
                                  primarySelected.rowHeights && primarySelected.rowHeights.length === primarySelected.rows
                                    ? primarySelected.rowHeights.slice(0, -1)
                                    : undefined;
                                onUpdateObject(
                                  primarySelected.id,
                                  {
                                    rows: primarySelected.rows - 1,
                                    cells: primarySelected.cells.slice(0, -1),
                                    height: Math.max(72, primarySelected.height - 36),
                                    ...(nextRowHeights ? { rowHeights: nextRowHeights } : {}),
                                  },
                                  true
                                );
                              }}
                              className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                            >
                              - Row
                            </button>
                            <button
                              onClick={() => {
                                const nextCells = primarySelected.cells.map((r, i) => [...r, i === 0 ? `Col ${r.length + 1}` : 'Cell']);
                                const nextColWidths =
                                  primarySelected.colWidths && primarySelected.colWidths.length === primarySelected.cols
                                    ? [
                                        ...primarySelected.colWidths,
                                        Math.round(primarySelected.width / Math.max(1, primarySelected.cols)),
                                      ]
                                    : undefined;
                                onUpdateObject(
                                  primarySelected.id,
                                  {
                                    cols: primarySelected.cols + 1,
                                    cells: nextCells,
                                    width: Math.min(SLIDE_WIDTH - primarySelected.x, primarySelected.width + 90),
                                    ...(nextColWidths ? { colWidths: nextColWidths } : {}),
                                  },
                                  true
                                );
                              }}
                              className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              + Col
                            </button>
                            <button
                              disabled={primarySelected.cols <= 1}
                              onClick={() => {
                                const nextColWidths =
                                  primarySelected.colWidths && primarySelected.colWidths.length === primarySelected.cols
                                    ? primarySelected.colWidths.slice(0, -1)
                                    : undefined;
                                onUpdateObject(
                                  primarySelected.id,
                                  {
                                    cols: primarySelected.cols - 1,
                                    cells: primarySelected.cells.map((r) => r.slice(0, -1)),
                                    width: Math.max(120, primarySelected.width - 90),
                                    ...(nextColWidths ? { colWidths: nextColWidths } : {}),
                                  },
                                  true
                                );
                              }}
                              className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                            >
                              - Col
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                            <label className="flex flex-col items-center gap-1 border border-slate-200 dark:border-slate-800 rounded p-1">
                              <span>Header</span>
                              <input
                                type="color"
                                value={primarySelected.headerBg}
                                onChange={(e) => onUpdateObject(primarySelected.id, { headerBg: e.target.value }, true)}
                                className="w-6 h-5 border-0 bg-transparent cursor-pointer"
                              />
                            </label>
                            <label className="flex flex-col items-center gap-1 border border-slate-200 dark:border-slate-800 rounded p-1">
                              <span>Border</span>
                              <input
                                type="color"
                                value={primarySelected.borderColor}
                                onChange={(e) => onUpdateObject(primarySelected.id, { borderColor: e.target.value }, true)}
                                className="w-6 h-5 border-0 bg-transparent cursor-pointer"
                              />
                            </label>
                            <label className="flex flex-col items-center gap-1 border border-slate-200 dark:border-slate-800 rounded p-1">
                              <span>Text</span>
                              <input
                                type="color"
                                value={primarySelected.textColor}
                                onChange={(e) => onUpdateObject(primarySelected.id, { textColor: e.target.value }, true)}
                                className="w-6 h-5 border-0 bg-transparent cursor-pointer"
                              />
                            </label>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] text-slate-500">Cell Matrix (or double-click on slide)</div>
                            <div className="max-h-40 overflow-auto space-y-1">
                              {primarySelected.cells.map((row, ri) => (
                                <div key={ri} className="flex gap-1">
                                  {row.map((val, ci) => (
                                    <input
                                      key={ci}
                                      value={val}
                                      onChange={(e) => {
                                        const nextCells = primarySelected.cells.map((r, rIdx) =>
                                          rIdx === ri ? r.map((c, cIdx) => (cIdx === ci ? e.target.value : c)) : r
                                        );
                                        onUpdateObject(primarySelected.id, { cells: nextCells }, true);
                                      }}
                                      className={`flex-1 min-w-[44px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-1 text-[11px] outline-none ${
                                        ri === 0 ? 'font-semibold' : ''
                                      }`}
                                    />
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Math LaTeX */}
                      {primarySelected.type === 'math' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">LaTeX Equation</div>
                          <textarea
                            rows={3}
                            value={primarySelected.latex}
                            onChange={(e) => onUpdateObject(primarySelected.id, { latex: e.target.value }, true)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 text-xs font-mono outline-none"
                          />
                          <label className="flex items-center justify-between text-xs">
                            <span>Font Size ({primarySelected.fontSize}px)</span>
                            <input
                              type="range"
                              min={12}
                              max={56}
                              value={primarySelected.fontSize}
                              onChange={(e) => onUpdateObject(primarySelected.id, { fontSize: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>
                          <div className="flex items-center justify-between text-xs">
                            <span>Ink Color</span>
                            <input
                              type="color"
                              value={primarySelected.color}
                              onChange={(e) => onUpdateObject(primarySelected.id, { color: e.target.value }, true)}
                              className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Backdrop</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onUpdateObject(primarySelected.id, { bgColor: 'transparent' }, true)}
                                className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                              >
                                Clear
                              </button>
                              <input
                                type="color"
                                value={primarySelected.bgColor === 'transparent' ? '#FFFFFF' : primarySelected.bgColor}
                                onChange={(e) => onUpdateObject(primarySelected.id, { bgColor: e.target.value }, true)}
                                className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                          </div>
                          {onOpenMathOrGraph && (
                            <button
                              onClick={() => onOpenMathOrGraph('equation', primarySelected)}
                              className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                            >
                              Open Equation Studio
                            </button>
                          )}
                        </div>
                      )}

                      {/* Graph Plot Editor */}
                      {primarySelected.type === 'graph' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Function Graph</div>
                          <input
                            value={primarySelected.title || ''}
                            placeholder="Graph Title"
                            onChange={(e) => onUpdateObject(primarySelected.id, { title: e.target.value }, true)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs outline-none"
                          />
                          <div className="grid grid-cols-4 gap-1">
                            {(['2d', 'polar', 'parametric', '3d'] as const).map((gm) => (
                              <button
                                key={gm}
                                onClick={() => onUpdateObject(primarySelected.id, { mode: gm }, true)}
                                className={`py-1 rounded text-[11px] uppercase border ${
                                  primarySelected.mode === gm
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {gm}
                              </button>
                            ))}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>Expressions</span>
                              <button
                                onClick={() =>
                                  onUpdateObject(
                                    primarySelected.id,
                                    {
                                      expressions: [
                                        ...(primarySelected as GraphObject).expressions,
                                        { id: uid('expr'), expr: 'cos(x)', color: '#059669', visible: true },
                                      ],
                                    },
                                    true
                                  )
                                }
                                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                              >
                                + Add f(x)
                              </button>
                            </div>
                            {primarySelected.expressions.map((ex, ei) => (
                              <div key={ex.id} className="flex items-center gap-1">
                                <input
                                  type="color"
                                  value={ex.color}
                                  onChange={(e) => {
                                    const nextExprs = primarySelected.expressions.map((it, idx) =>
                                      idx === ei ? { ...it, color: e.target.value } : it
                                    );
                                    onUpdateObject(primarySelected.id, { expressions: nextExprs }, true);
                                  }}
                                  className="w-5 h-5 border-0 bg-transparent shrink-0"
                                />
                                <input
                                  value={ex.expr}
                                  onChange={(e) => {
                                    const nextExprs = primarySelected.expressions.map((it, idx) =>
                                      idx === ei ? { ...it, expr: e.target.value } : it
                                    );
                                    onUpdateObject(primarySelected.id, { expressions: nextExprs }, true);
                                  }}
                                  className="flex-1 min-w-0 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs font-mono outline-none"
                                />
                                <button
                                  onClick={() => {
                                    const nextExprs = primarySelected.expressions.map((it, idx) =>
                                      idx === ei ? { ...it, visible: !it.visible } : it
                                    );
                                    onUpdateObject(primarySelected.id, { expressions: nextExprs }, true);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                  title={ex.visible ? 'Hide expression' : 'Show expression'}
                                >
                                  {ex.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                </button>
                                {primarySelected.expressions.length > 1 && (
                                  <button
                                    onClick={() => {
                                      const nextExprs = primarySelected.expressions.filter((_, idx) => idx !== ei);
                                      onUpdateObject(primarySelected.id, { expressions: nextExprs }, true);
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600"
                                    title="Remove expression"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            {(
                              [
                                ['X min', 'xMin', primarySelected.xMin],
                                ['X max', 'xMax', primarySelected.xMax],
                                ['Y min', 'yMin', primarySelected.yMin],
                                ['Y max', 'yMax', primarySelected.yMax],
                              ] as const
                            ).map(([lbl, key, val]) => (
                              <label
                                key={key}
                                className="flex items-center justify-between gap-1 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 bg-slate-50 dark:bg-slate-950"
                              >
                                <span className="text-slate-500">{lbl}</span>
                                <input
                                  type="number"
                                  value={val}
                                  onChange={(e) => {
                                    const num = Number(e.target.value);
                                    if (!Number.isFinite(num)) return;
                                    if (key === 'xMin' && num >= primarySelected.xMax) {
                                      onUpdateObject(primarySelected.id, { xMin: num, xMax: num + 1 }, true);
                                    } else if (key === 'xMax' && num <= primarySelected.xMin) {
                                      onUpdateObject(primarySelected.id, { xMax: num, xMin: num - 1 }, true);
                                    } else if (key === 'yMin' && num >= primarySelected.yMax) {
                                      onUpdateObject(primarySelected.id, { yMin: num, yMax: num + 1 }, true);
                                    } else if (key === 'yMax' && num <= primarySelected.yMin) {
                                      onUpdateObject(primarySelected.id, { yMax: num, yMin: num - 1 }, true);
                                    } else {
                                      onUpdateObject(primarySelected.id, { [key]: num }, true);
                                    }
                                  }}
                                  className="w-12 text-right font-mono tabular-nums bg-transparent outline-none"
                                />
                              </label>
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Coordinate Grid</span>
                            <button
                              onClick={() => onUpdateObject(primarySelected.id, { showGrid: !primarySelected.showGrid }, true)}
                              className={`px-2 py-1 rounded text-[11px] border ${
                                primarySelected.showGrid ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {primarySelected.showGrid ? 'Visible' : 'Hidden'}
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Derivative f&apos;(x)</span>
                            <button
                              onClick={() => onUpdateObject(primarySelected.id, { showDerivative: !primarySelected.showDerivative }, true)}
                              className={`px-2 py-1 rounded text-[11px] border ${
                                primarySelected.showDerivative ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {primarySelected.showDerivative ? 'On' : 'Off'}
                            </button>
                          </div>
                          {onOpenMathOrGraph && (
                            <button
                              onClick={() => onOpenMathOrGraph('graph', primarySelected)}
                              className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                            >
                              Open Graph Studio
                            </button>
                          )}
                        </div>
                      )}

                      {/* Sticky Note */}
                      {primarySelected.type === 'sticky' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Callout Note</div>
                          <textarea
                            rows={3}
                            value={primarySelected.text}
                            onChange={(e) => onUpdateObject(primarySelected.id, { text: e.target.value, richBlocks: undefined }, true)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 text-xs outline-none"
                          />
                          <div className="grid grid-cols-4 gap-1">
                            {(['classic', 'folded', 'lined', 'card'] as const).map((ns) => (
                              <button
                                key={ns}
                                onClick={() => onUpdateObject(primarySelected.id, { noteStyle: ns }, true)}
                                className={`py-1 rounded text-[11px] capitalize border ${
                                  (primarySelected.noteStyle || 'classic') === ns
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {ns}
                              </button>
                            ))}
                          </div>
                          <label className="flex items-center justify-between text-xs">
                            <span>Font Size ({primarySelected.fontSize}px)</span>
                            <input
                              type="range"
                              min={11}
                              max={32}
                              value={primarySelected.fontSize}
                              onChange={(e) => onUpdateObject(primarySelected.id, { fontSize: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>
                          <div className="flex items-center justify-between text-xs">
                            <span>Text Color</span>
                            <input
                              type="color"
                              value={primarySelected.textColor}
                              onChange={(e) => updateTextOrStickyStyle(primarySelected, { textColor: e.target.value }, true)}
                              className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                            />
                          </div>
                          <input
                            value={primarySelected.author || ''}
                            placeholder="Author label..."
                            onChange={(e) => onUpdateObject(primarySelected.id, { author: e.target.value }, true)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs outline-none"
                          />
                          <div className="flex items-center gap-1 flex-wrap">
                            {['#FEF08A', '#BFDBFE', '#BBF7D0', '#FBCFE8', '#FED7AA', '#E9D5FF'].map((nc) => (
                              <button
                                key={nc}
                                onClick={() => onUpdateObject(primarySelected.id, { noteColor: nc }, true)}
                                className="w-5 h-5 rounded-md border border-slate-300 dark:border-slate-700"
                                style={{ backgroundColor: nc }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Link to Slide */}
                      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                          Link to Slide
                        </div>
                        <select
                          disabled={!canEdit}
                          value={primarySelected.linkToSlide || ''}
                          onChange={(e) => onUpdateObject(primarySelected.id, { linkToSlide: e.target.value || undefined }, true)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs outline-none"
                        >
                          <option value="">None</option>
                          {pages.map((pg, pi) => (
                            <option key={pg.id} value={pg.id}>
                              Slide {pi + 1}: {pg.name}
                            </option>
                          ))}
                        </select>
                        {primarySelected.linkToSlide && (
                          <p className="text-[11px] text-slate-400">Clicking this element in presentation mode navigates to the linked slide.</p>
                        )}
                      </div>

                      {/* Freehand Stroke */}
                      {primarySelected.type === 'stroke' && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ink Stroke</div>
                          <div className="flex items-center justify-between text-xs">
                            <span>Stroke Color</span>
                            <input
                              type="color"
                              value={primarySelected.stroke}
                              onChange={(e) => onUpdateObject(primarySelected.id, { stroke: e.target.value }, true)}
                              className="w-8 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                            />
                          </div>
                          <label className="flex items-center justify-between text-xs">
                            <span>Width ({primarySelected.strokeWidth}px)</span>
                            <input
                              type="range"
                              min={1}
                              max={28}
                              value={primarySelected.strokeWidth}
                              onChange={(e) => onUpdateObject(primarySelected.id, { strokeWidth: Number(e.target.value) }, true)}
                              className="w-24"
                            />
                          </label>
                          <div className="grid grid-cols-3 gap-1">
                            {(['solid', 'dashed', 'dotted'] as const).map((ls) => (
                              <button
                                key={ls}
                                onClick={() => onUpdateObject(primarySelected.id, { lineStyle: ls }, true)}
                                className={`py-1 rounded text-[11px] capitalize border ${
                                  primarySelected.lineStyle === ls
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {ls}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ANIMATE TAB */}
              {inspectorTab === 'animate' && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Slide Transition</span>
                      {canEdit && onApplyTransitionToAll && (
                        <button
                          onClick={() => onApplyTransitionToAll(activeSlide.transition || 'none')}
                          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Apply to All
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['none', 'fade', 'slide', 'zoom', 'morph'] as const).map((tr) => (
                        <button
                          key={tr}
                          disabled={!canEdit}
                          onClick={() => onUpdatePage(activeSlide.id, { transition: tr })}
                          onMouseEnter={() => {
                            if (tr === 'none') return;
                            setTransitionPreview(tr);
                            setTransitionPreviewEntered(false);
                            if (transitionPreviewTimerRef.current) clearTimeout(transitionPreviewTimerRef.current);
                            transitionPreviewTimerRef.current = setTimeout(() => setTransitionPreviewEntered(true), 50);
                          }}
                          onMouseLeave={() => {
                            setTransitionPreview(null);
                            setTransitionPreviewEntered(false);
                            if (transitionPreviewTimerRef.current) clearTimeout(transitionPreviewTimerRef.current);
                          }}
                          className={`py-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                            (activeSlide.transition || 'none') === tr
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {tr}
                        </button>
                      ))}
                    </div>

                    {/* Transition Preview Popup */}
                    {transitionPreview && transitionPreview !== 'none' && activeSlide && (
                      <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-2 overflow-hidden">
                        <div className="text-[11px] text-slate-500 mb-1.5 font-medium capitalize">{transitionPreview} Preview</div>
                        <div className="relative w-full aspect-video rounded-md overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <img
                            src={renderSlideCached(activeSlide, 256, 144)}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            style={getTransitionStyle(transitionPreview, transitionPreviewEntered)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Auto-Advance Timer</div>
                    <div className="flex items-center justify-between text-xs">
                      <span>Duration (seconds)</span>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        disabled={!canEdit}
                        value={activeSlide.slideDurationSec || 0}
                        onChange={(e) => onUpdatePage(activeSlide.id, { slideDurationSec: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-right font-mono tabular-nums text-xs outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Set 0 for manual click / keyboard advance.</p>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Element Build Order</div>
                    {!primarySelected ? (
                      <p className="text-xs text-slate-500">Select an element on the slide to configure step-by-step click reveal.</p>
                    ) : (
                      (() => {
                        const { effect, step } = normalizeSlideAnim(primarySelected.slideAnim);
                        return (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-1.5">
                              {(['none', 'fade', 'slide-up', 'zoom'] as const).map((ef) => (
                                <button
                                  key={ef}
                                  disabled={!canEdit}
                                  onClick={() =>
                                    onUpdateObject(
                                      primarySelected.id,
                                      { slideAnim: ef === 'none' ? 'none' : { effect: ef, step: Math.max(1, step) } },
                                      true
                                    )
                                  }
                                  className={`py-1.5 rounded-md border text-xs capitalize ${
                                    effect === ef
                                      ? 'bg-blue-600 border-blue-600 text-white'
                                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {ef}
                                </button>
                              ))}
                            </div>
                            {effect !== 'none' && (
                              <label className="flex items-center justify-between text-xs">
                                <span>Click Step Order</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={Math.max(1, step)}
                                  onChange={(e) =>
                                    onUpdateObject(
                                      primarySelected.id,
                                      { slideAnim: { effect, step: Math.max(1, Number(e.target.value) || 1) } },
                                      true
                                    )
                                  }
                                  className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-right font-mono tabular-nums"
                                />
                              </label>
                            )}
                          </div>
                        );
                      })()
                    )}

                    {/* Overview of Active Build Steps on Current Slide */}
                    {activeSlide.objects.some((o) => normalizeSlideAnim(o.slideAnim).effect !== 'none') && (
                      <div className="pt-2 space-y-1">
                        <div className="text-[11px] text-slate-500">Click Sequence</div>
                        {activeSlide.objects
                          .filter((o) => normalizeSlideAnim(o.slideAnim).effect !== 'none')
                          .sort((a, b) => normalizeSlideAnim(a.slideAnim).step - normalizeSlideAnim(b.slideAnim).step)
                          .map((o) => {
                            const meta = normalizeSlideAnim(o.slideAnim);
                            return (
                              <button
                                key={o.id}
                                onClick={() => onSelectIds(new Set([o.id]))}
                                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex items-center justify-between text-[11px] text-left"
                              >
                                <span className="truncate font-medium">{o.name || o.type}</span>
                                <span className="font-mono text-blue-600 dark:text-blue-400 shrink-0">
                                  #{meta.step} · {meta.effect}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>
          </>
        )}
      </div>

      {/* EXPORT ERROR TOAST */}
      {exportError && (
        <div className="fixed bottom-14 right-6 z-[95] flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-medium shadow-xl">
          <span>{exportError}</span>
          <button onClick={() => setExportError(null)} className="p-0.5 rounded hover:bg-rose-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STUDIO SLIDE SORTER GRID MODAL */}
      {showGridOverview && (
        <div
          onClick={() => setShowGridOverview(false)}
          className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-sm p-6 overflow-y-auto"
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6 text-white">
              <div>
                <h3 className="text-lg font-bold">Slide Overview ({pages.length})</h3>
                <p className="text-xs text-slate-400">Click any slide to jump, reorder, duplicate, or insert a new slide</p>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    onClick={() => {
                      if (onAddSlideWithLayout) onAddSlideWithLayout('title_content', activeTheme);
                      else onAddSlide();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Slide</span>
                  </button>
                )}
                <button
                  onClick={() => setShowGridOverview(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close (Esc)</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  onClick={() => {
                    onSelectPage(p.id);
                    setShowGridOverview(false);
                  }}
                  className={`group rounded-xl overflow-hidden border cursor-pointer bg-slate-900 transition-all ${
                    p.id === activeSlide?.id ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <img src={renderSlideCached(p, 320, 180)} alt={p.name} className="w-full aspect-video object-cover bg-white" />
                  <div className="px-3 py-2 flex items-center justify-between gap-2 text-xs text-white">
                    <span className="truncate font-medium">
                      <span className="font-mono text-slate-400 mr-1.5">{idx + 1}.</span>
                      {p.name}
                    </span>
                    {canEdit && (
                      <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          disabled={idx === 0}
                          onClick={() => onReorderSlide(p.id, -1)}
                          className="p-1 rounded hover:bg-slate-800 disabled:opacity-30"
                          title="Move earlier"
                        >
                          <ArrowLeft className="w-3 h-3" />
                        </button>
                        <button
                          disabled={idx === pages.length - 1}
                          onClick={() => onReorderSlide(p.id, 1)}
                          className="p-1 rounded hover:bg-slate-800 disabled:opacity-30"
                          title="Move later"
                        >
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDuplicateSlide(p.id)}
                          className="p-1 rounded hover:bg-slate-800"
                          title="Duplicate slide"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {pages.length > 1 && (
                          <button
                            onClick={() => onDeleteSlide(p.id)}
                            className="p-1 rounded hover:bg-rose-950 text-rose-400"
                            title="Delete slide"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
