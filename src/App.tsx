import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Brush,
  Calculator,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Command,
  Copy,
  Download,
  Eraser,
  FileText,
  FolderOpen,
  Frame,
  FunctionSquare,
  GitBranch,
  Grid,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Lasso,
  Layers,
  LayoutTemplate,
  LineChart,
  Lock,
  Maximize,
  MessageSquare,
  Minus,
  Monitor,
  MoreVertical,
  MousePointer2,
  Network,
  PaintBucket,
  PanelRight,
  PanelTopClose,
  PanelTopOpen,
  Pause,
  Pen,
  Pencil,
  Play,
  Plus,
  Pointer,
  Presentation,
  QrCode,
  Radio,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  Search,
  Settings,
  Shapes,
  Share2,
  SlidersHorizontal,
  Smartphone,
  SmilePlus,
  Sparkles,
  StickyNote,
  Table2,
  Timer,
  Trash2,
  Type,
  Undo2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AIQuickIntent } from './components/AIAssistantDrawer';
import type { FloatingReaction, LaserTrailPoint } from './components/CanvasStage';
import { ClassroomCollabModal } from './components/ClassroomCollabModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { ExportImportModal } from './components/ExportImportModal';
import { LayersDropdownMenu } from './components/LayersDropdownMenu';
import { MobileConnectModal } from './components/MobileConnectModal';
import { PropertiesLayersPanel } from './components/PropertiesLayersPanel';
import { SettingsShortcutsModal } from './components/SettingsShortcutsModal';
import {
  WorkspaceHubModal,
  type CustomTemplateItem,
  type WorkspaceSummary,
} from './components/WorkspaceHubModal';
import { useClassroomWebRTC } from './hooks/useClassroomWebRTC';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { TRANSLATIONS } from './i18n/translations';
import type {
  AttachedFileMeta,
  BoardObject,
  BoardPage,
  ClassroomSessionState,
  CollaborationMode,
  EraserSettings,
  GeometryInstrument,
  GraphObject,
  GridType,
  LineEndpointStyle,
  LocaleCode,
  PDFAnnotation,
  PresenceUser,
  ShapeKind,
  TextObject,
  TextStickyDefaults,
  ToolType,
  UserRole,
  WorkspaceDocument,
  WorkspaceViewMode,
} from './types/smartboard';
import { apiUrl, webSocketUrl } from './utils/api';
import { renderPageToDataUrl, renderPageToHiResDataUrl, setHighContrastMode } from './utils/canvasRenderer';
import {
  alignObjects,
  autoLayoutDiagram,
  computeSelectionBounds,
  scalePointsToBox,
  syncConnectorBounds,
  uid,
} from './utils/geometry';
import { exportBoardPagesToPDF, importPPTXToPages, renderPDFToImages } from './utils/pdfPptx';
import { applyDefaultStyleToRichBlocks } from './utils/richText';

const PDFStudio = React.lazy(() => import('./components/PDFStudio').then((m) => ({ default: m.PDFStudio })));
const PresentationStudio = React.lazy(() => import('./components/PresentationStudio').then((m) => ({ default: m.PresentationStudio })));
const CanvasStage = React.lazy(() => import('./components/CanvasStage').then((m) => ({ default: m.CanvasStage })));
const CalculatorWidget = React.lazy(() => import('./components/CalculatorWidget').then((m) => ({ default: m.CalculatorWidget })));
const MathScienceModal = React.lazy(() => import('./components/MathScienceModal').then((m) => ({ default: m.MathScienceModal })));
const AIAssistantDrawer = React.lazy(() => import('./components/AIAssistantDrawer').then((m) => ({ default: m.AIAssistantDrawer })));
import { getActiveSpeechWordIndex, getSpeechWordRanges } from './utils/speech';
import {
  adaptObjectsToTheme,
  buildLayoutObjects,
  buildSlideNumberObject,
  detectThemeForPage,
  SLIDE_THEMES,
  type SlideLayoutId,
  type SlideThemePreset,
} from './utils/slideLayouts';

const LOCAL_CACHE_KEY = 'luminaboard_offline_cache_v1';

const COLLAB_COLORS = [
  '#2563EB', '#DC2626', '#059669', '#D97706', '#7C3AED', '#DB2777',
  '#0891B2', '#4F46E5', '#EA580C', '#65A30D', '#0D9488', '#C026D3',
];

function userIdToColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[((hash % COLLAB_COLORS.length) + COLLAB_COLORS.length) % COLLAB_COLORS.length];
}

function safeSetLocalItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LOCAL_CACHE_KEY)) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(key, value);
    } catch {
      // ignore if browser storage is blocked or completely full
    }
  }
}

function safeGetLocalItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeCacheWorkspace(doc: WorkspaceDocument) {
  const key = `${LOCAL_CACHE_KEY}:${doc.id}`;
  try {
    const json = JSON.stringify(doc);
    if (json.length <= 2_500_000) {
      localStorage.setItem(key, json);
      return;
    }
  } catch {
    // Fall through to eviction / slimmed snapshot
  }

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LOCAL_CACHE_KEY) && k !== key) {
        localStorage.removeItem(k);
      }
    }
    const slim: WorkspaceDocument = {
      ...doc,
      attachedFiles: doc.attachedFiles.map((f) => ({
        ...f,
        extractedText: f.extractedText ? f.extractedText.slice(0, 4000) : undefined,
      })),
      pages: doc.pages.map((p) => ({
        ...p,
        objects: p.objects.map((o) => {
          if (
            (o.type === 'image' || o.type === 'media') &&
            typeof o.src === 'string' &&
            o.src.startsWith('data:') &&
            o.src.length > 80_000
          ) {
            return { ...o, src: '' };
          }
          return o;
        }),
      })),
    };
    localStorage.setItem(key, JSON.stringify(slim));
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

const LIVE_REACTIONS: { emoji: string; label: string }[] = [
  { emoji: '👍', label: 'Agree' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '💡', label: 'Idea' },
  { emoji: '❓', label: 'Question' },
  { emoji: '✋', label: 'Raise Hand' },
  { emoji: '🎉', label: 'Celebrate' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '✅', label: 'Done' },
  { emoji: '🔥', label: 'Awesome' },
  { emoji: '🤔', label: 'Thinking' },
  { emoji: '⚡', label: 'Urgent' },
  { emoji: '👀', label: 'Looking' },
];

function getStoredHostKey(wsId: string): string {
  try {
    return localStorage.getItem(`lumina_hostkey_${wsId}`) || '';
  } catch {
    return '';
  }
}

function storeHostKey(wsId: string, key?: string) {
  if (wsId && key) {
    safeSetLocalItem(`lumina_hostkey_${wsId}`, key);
  }
}

function parseInitialPairingParams(): {
  paired: boolean;
  room: string;
  role?: UserRole;
  hostKey: string;
  inviteTicket: string;
  camSync: boolean;
} {
  if (typeof window === 'undefined') {
    return { paired: false, room: 'default-board', hostKey: '', inviteTicket: '', camSync: false };
  }
  const url = new URL(window.location.href);
  const room = url.searchParams.get('room') || 'default-board';
  const rawPair = url.searchParams.get('pair');
  const inviteTicket = url.searchParams.get('ticket') || '';
  const camSync = url.searchParams.get('cam') === '1';
  const rawName = url.searchParams.get('name');

  const validRole: UserRole | undefined =
    rawPair === 'teacher' || rawPair === 'editor' || rawPair === 'student' || rawPair === 'viewer'
      ? rawPair
      : undefined;

  if (validRole) safeSetLocalItem('lumina_urole', validRole);
  if (rawName && rawName.trim()) safeSetLocalItem('lumina_uname', rawName.trim().slice(0, 40));

  const hasPairing = Boolean(rawPair || url.searchParams.has('hk') || inviteTicket || camSync || rawName);
  if (hasPairing) {
    url.searchParams.delete('pair');
    url.searchParams.delete('hk');
    url.searchParams.delete('ticket');
    url.searchParams.delete('cam');
    url.searchParams.delete('name');
    window.history.replaceState({}, '', url.toString());
  }

  return {
    paired: hasPairing,
    room,
    role: validRole,
    hostKey: '',
    inviteTicket,
    camSync,
  };
}

const INITIAL_PAIRING = parseInitialPairingParams();

function createInitialLocalWorkspace(): WorkspaceDocument {
  const pageId = 'page-init';
  return {
    id: 'default-board',
    name: 'LuminaBoard Studio',
    folder: 'General',
    starred: true,
    trashed: false,
    collaborationMode: 'group_collab',
    ownerId: 'teacher-host',
    allowedEditors: [],
    pages: [
      {
        id: pageId,
        name: 'Board 1',
        objects: [],
        layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
        guides: [],
        background: '#FFFFFF',
        gridType: 'dots',
        gridSize: 28,
        transition: 'fade',
        slideDurationSec: 0,
      },
    ],
    activePageId: pageId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    versions: [],
    attachedFiles: [],
    auditLogs: [],
  };
}

function splitReadAloudText(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maxLength) {
    const minEnd = Math.floor(maxLength * 0.55);
    const sentenceEnd = Math.max(
      remaining.lastIndexOf('. ', maxLength),
      remaining.lastIndexOf('? ', maxLength),
      remaining.lastIndexOf('! ', maxLength),
      remaining.lastIndexOf('।', maxLength),
      remaining.lastIndexOf('\n', maxLength)
    );
    let splitAt = sentenceEnd >= minEnd
      ? sentenceEnd + 1
      : remaining.lastIndexOf(' ', maxLength);
    if (splitAt < 1) splitAt = maxLength;
    if (splitAt > 0 && /[\uD800-\uDBFF]/.test(remaining[splitAt - 1])) splitAt -= 1;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function getSpeechLocale(text: string, fallback: LocaleCode): LocaleCode {
  if (/[\u0900-\u097F]/.test(text)) return fallback === 'ne' ? 'ne' : 'hi';
  if (/[A-Za-z]/.test(text)) return 'en';
  return fallback;
}

export default function App() {
  const isOnline = useOnlineStatus();

  // User identity for collaboration & classroom
  const [userId] = useState(() => {
    const saved = safeGetLocalItem('lumina_uid');
    if (saved) return saved;
    const id = 'user-' + Math.random().toString(36).slice(2, 8);
    safeSetLocalItem('lumina_uid', id);
    return id;
  });
  const [userName, setUserName] = useState(() => safeGetLocalItem('lumina_uname') || 'Instructor');
  const [userRole, setUserRole] = useState<UserRole>(
    () => INITIAL_PAIRING.role || (safeGetLocalItem('lumina_urole') as UserRole) || 'teacher'
  );
  const [userColor] = useState(() => userIdToColor(userId));

  // Workspace & Pages state
  const [workspace, setWorkspace] = useState<WorkspaceDocument>(createInitialLocalWorkspace);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceSummary[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateItem[]>([]);
  const [classroom, setClassroom] = useState<ClassroomSessionState>({
    active: false,
    teacherId: 'teacher-host',
    teacherName: 'Lead Instructor',
    followTeacher: true,
    teacherPageId: 'page-init',
    studentEditingLocked: false,
    allowedStudentIds: [],
    screenSharingActive: false,
    polls: [],
    quizzes: [],
    questions: [],
    submissions: [],
  });

  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('board');
  const [fullscreenPresenting, setFullscreenPresenting] = useState(false);

  // Canvas interaction state
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [activeShapeKind, setActiveShapeKind] = useState<ShapeKind>('rounded_rect');
  const [strokeColor, setStrokeColor] = useState('#0F172A');
  const [fillColor, setFillColor] = useState('#EFF6FF');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [lineStyle, setLineStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [smoothing, setSmoothing] = useState(1);
  const [stabilization, setStabilization] = useState(0.4);
  const [eraserMode, setEraserMode] = useState<'stroke' | 'object' | 'area'>('stroke');
  const [eraserSize, setEraserSize] = useState(16);
  const [eraserSettings, setEraserSettings] = useState<EraserSettings>({
    hardness: 100,
    opacity: 100,
    shape: 'circle',
    selectedLayerOnly: false,
    insideSelection: false,
  });
  const [autoSmartShape, setAutoSmartShape] = useState(false);
  const [shapeFillStyle, setShapeFillStyle] = useState<'solid' | 'hachure' | 'cross_hatch' | 'dots'>('solid');
  const [shapeCornerRadius, setShapeCornerRadius] = useState(14);
  const [shapeShadow, setShapeShadow] = useState(false);
  const [connectorRouteType, setConnectorRouteType] = useState<'straight' | 'orthogonal' | 'curved'>('curved');
  const [lineStartHead, setLineStartHead] = useState<LineEndpointStyle>('none');
  const [lineEndHead, setLineEndHead] = useState<LineEndpointStyle>('arrow');
  const [focusPropsTick, setFocusPropsTick] = useState(0);
  const [textDefaults, setTextDefaults] = useState<TextStickyDefaults>({
    fontFamily: 'Plus Jakarta Sans',
    stickyFontFamily: 'DM Sans',
    fontSize: 18,
    stickyFontSize: 15,
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    strikethrough: false,
    textAlign: 'left',
    lineHeight: 1.38,
    bgColor: 'transparent',
    highlightColor: undefined,
    noteColor: '#FEF08A',
    noteTextColor: '#1E293B',
    noteStyle: 'folded',
  });

  const selectLeftTool = useCallback((tool: ToolType) => {
    setRightPanelMenu(null);
    setActiveTool(tool);
    if (tool !== 'select') {
      setSelectedIds(new Set());
    }
    setFocusPropsTick((n) => n + 1);
    if (window.innerWidth >= 768) {
      setShowRightPanel(true);
    }
  }, []);

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [canvasLocked, setCanvasLocked] = useState(false);
  const [toolLocked, setToolLocked] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [boardCroppingId, setBoardCroppingId] = useState<string | null>(null);
  useEffect(() => {
    if (boardCroppingId && !selectedIds.has(boardCroppingId)) {
      setBoardCroppingId(null);
    }
  }, [boardCroppingId, selectedIds]);

  // Undo / Redo stacks per workspace
  const [undoStack, setUndoStack] = useState<BoardPage[][]>([]);
  const [redoStack, setRedoStack] = useState<BoardPage[][]>([]);

  // Geometry Instruments
  const [instruments, setInstruments] = useState<GeometryInstrument[]>([
    { id: 'inst-ruler', kind: 'ruler', x: 180, y: 120, rotation: 0, visible: false, radius: 120 },
    { id: 'inst-protractor', kind: 'protractor', x: 260, y: 200, rotation: 0, visible: false, radius: 120 },
    { id: 'inst-compass', kind: 'compass', x: 420, y: 260, rotation: 0, visible: false, radius: 110 },
    { id: 'inst-setsquare', kind: 'set_square', x: 300, y: 220, rotation: 0, visible: false, radius: 120 },
  ]);

  // Collaboration & Live Telemetry
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [remoteLaserPoints, setRemoteLaserPoints] = useState<LaserTrailPoint[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const offlineQueueRef = useRef<{ workspaceId: string; payload: unknown }[]>(
    (() => {
      try {
        const stored = sessionStorage.getItem('lumina_offline_queue');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    })()
  );
  const [hostKey, setHostKey] = useState<string>(() => INITIAL_PAIRING.hostKey || getStoredHostKey(INITIAL_PAIRING.room));
  const [showMobileConnect, setShowMobileConnect] = useState(false);
  const [broadcastViewport, setBroadcastViewport] = useState(() => INITIAL_PAIRING.camSync);
  const [followRemoteViewport, setFollowRemoteViewport] = useState(false);
  const [remotePdfView, setRemotePdfView] = useState<{
    fileId: string;
    scrollProgress: number;
    timestamp: number;
  } | null>(null);
  const [remoteViewportSender, setRemoteViewportSender] = useState<{
    userId: string;
    userName: string;
    ts: number;
  } | null>(null);
  const [pipMinimized, setPipMinimized] = useState(false);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // UI Panels, Modals & Accessibility
  const [isDesktopMd, setIsDesktopMd] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [showRightPanel, setShowRightPanel] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  useEffect(() => {
    let wasDesktop = window.innerWidth >= 768;
    const onResize = () => {
      const nowDesktop = window.innerWidth >= 768;
      setIsDesktopMd(nowDesktop);
      if (nowDesktop !== wasDesktop) {
        setShowRightPanel(nowDesktop);
        if (!nowDesktop) setRightPanelExpanded(false);
        wasDesktop = nowDesktop;
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [hideTopBar, setHideTopBar] = useState(false);
  const [rightPanelMenu, setRightPanelMenu] = useState<'table' | 'diagrams' | 'geometry' | 'math' | null>(null);
  const [autoOpenSignal, setAutoOpenSignal] = useState<{ sectionId?: string; tick: number } | null>(null);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [showMobileActionsMenu, setShowMobileActionsMenu] = useState(false);
  const [showMobileMoreTools, setShowMobileMoreTools] = useState(false);
  const [showMobilePageSheet, setShowMobilePageSheet] = useState(false);
  const [confirmClearPage, setConfirmClearPage] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'crossing' | 'contained'>('crossing');
  const [preciseSelection, setPreciseSelection] = useState(false);
  const [copiedStyle, setCopiedStyle] = useState<Record<string, unknown> | null>(null);
  const [formatPainterActive, setFormatPainterActive] = useState(false);

  // Board Find & Replace (Ctrl+F)
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [findMatchIdx, setFindMatchIdx] = useState(0);

  // Classroom Countdown Timer
  const [showClassTimer, setShowClassTimer] = useState(false);
  const [timerPresetSec, setTimerPresetSec] = useState(300);
  const [timerSec, setTimerSec] = useState(300);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerCustomMin, setTimerCustomMin] = useState('5');

  const [showAI, setShowAI] = useState(false);
  const [aiQuickIntent, setAiQuickIntent] = useState<AIQuickIntent | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showMathModal, setShowMathModal] = useState(false);
  const [mathModalTab, setMathModalTab] = useState<'equation' | 'graph' | 'geometry' | 'science'>('equation');
  const [editingMathGraphObj, setEditingMathGraphObj] = useState<BoardObject | null>(null);
  const [showClassroomModal, setShowClassroomModal] = useState(false);
  const [followTeacherLocal, setFollowTeacherLocal] = useState(true);
  const [hubModal, setHubModal] = useState<{ open: boolean; tab: 'workspaces' | 'templates' | 'versions' }>({
    open: false,
    tab: 'workspaces',
  });
  const [showExportImport, setShowExportImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [locale, setLocale] = useState<LocaleCode>(() => (safeGetLocalItem('lumina_locale') as LocaleCode) || 'en');
  const [darkMode, setDarkMode] = useState(() => safeGetLocalItem('lumina_dark') === '1');
  const [highContrast, setHighContrast] = useState(() => safeGetLocalItem('lumina_hc') === '1');
  const [colorblindPalette, setColorblindPalette] = useState(() => safeGetLocalItem('lumina_cb') === '1');
  const [palmRejection, setPalmRejection] = useState(() => safeGetLocalItem('lumina_palm') !== '0');
  const [uiScale, setUiScale] = useState(() => Number(safeGetLocalItem('lumina_uiscale') || '1') || 1);

  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [pageNameDraft, setPageNameDraft] = useState('');

  const [clipboardObjs, setClipboardObjs] = useState<BoardObject[]>([]);
  const pasteCountRef = useRef(0);
  const [toastMsg, setToastMsg] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const syncRichEditorFnRef = useRef<((commit?: boolean) => void) | null>(null);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const mediaUploadRef = useRef<HTMLInputElement>(null);

  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const rotationDegRef = useRef(rotationDeg);
  useEffect(() => {
    zoomRef.current = zoom;
    panXRef.current = panX;
    panYRef.current = panY;
    rotationDegRef.current = rotationDeg;
  }, [zoom, panX, panY, rotationDeg]);

  const userNameRef = useRef(userName);
  const userRoleRef = useRef(userRole);
  const followTeacherLocalRef = useRef(followTeacherLocal);
  const followRemoteViewportRef = useRef(followRemoteViewport);
  const isApplyingRemoteViewportRef = useRef(false);
  const workspaceRef = useRef(workspace);
  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);
  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);
  useEffect(() => {
    followTeacherLocalRef.current = followTeacherLocal;
  }, [followTeacherLocal]);
  useEffect(() => {
    followRemoteViewportRef.current = followRemoteViewport;
  }, [followRemoteViewport]);
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const t = TRANSLATIONS[locale] || TRANSLATIONS.en;

  const showToast = useCallback((msg: string, kind: 'info' | 'error' = 'info') => {
    const toast = { text: msg, kind };
    setToastMsg(toast);
    const duration = kind === 'error' ? 4000 : 3200;
    setTimeout(() => setToastMsg((cur) => (cur === toast ? null : cur)), duration);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState === 'saving') {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveState]);

  useEffect(() => {
    if (INITIAL_PAIRING.paired) {
      const roleLabel =
        INITIAL_PAIRING.role === 'teacher'
          ? 'Teacher Remote'
          : INITIAL_PAIRING.role === 'editor'
            ? 'Co-Editor'
            : INITIAL_PAIRING.role === 'viewer'
              ? 'Viewer'
              : 'Student';
      showToast(
        `Connected via 1-Tap QR as ${roleLabel}${INITIAL_PAIRING.camSync ? ' · Live View Sync ON' : ''}`
      );
    }
  }, [showToast]);

  // Classroom Timer Countdown + Gentle Chime
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setTimerSec((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          showToast('Class timer finished!');
          try {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              [0, 0.22].forEach((offset) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = offset === 0 ? 880 : 1174;
                gain.gain.setValueAtTime(0.08, ctx.currentTime + offset);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + offset);
                osc.stop(ctx.currentTime + offset + 0.32);
              });
              setTimeout(() => ctx.close().catch(() => {}), 900);
            }
          } catch {
            // ignore audio failure
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [showToast, timerRunning]);

  // Apply Dark Mode, High Contrast & Root UI Scale classes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    safeSetLocalItem('lumina_dark', darkMode ? '1' : '0');
  }, [darkMode]);

  useEffect(() => {
    setHighContrastMode(highContrast);
    document.documentElement.classList.toggle('high-contrast', highContrast);
    safeSetLocalItem('lumina_hc', highContrast ? '1' : '0');
  }, [highContrast]);

  useEffect(() => {
    safeSetLocalItem('lumina_cb', colorblindPalette ? '1' : '0');
  }, [colorblindPalette]);

  useEffect(() => {
    safeSetLocalItem('lumina_palm', palmRejection ? '1' : '0');
  }, [palmRejection]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.round(16 * uiScale * 100) / 100}px`;
    safeSetLocalItem('lumina_uiscale', String(uiScale));
  }, [uiScale]);

  useEffect(() => {
    safeSetLocalItem('lumina_locale', locale);
  }, [locale]);

  const activePage = useMemo(
    () => workspace.pages.find((p) => p.id === workspace.activePageId) || workspace.pages[0],
    [workspace.activePageId, workspace.pages]
  );

  // Permission enforcement on client UI
  const canEdit = useMemo(() => {
    if (userRole === 'viewer') return false;
    if (workspace.collaborationMode === 'public_readonly' && userRole !== 'teacher' && userId !== workspace.ownerId) {
      return false;
    }
    if (workspace.collaborationMode === 'private' && userRole !== 'teacher' && userId !== workspace.ownerId) {
      return false;
    }
    if (workspace.collaborationMode === 'teacher_controlled' && userRole === 'student') {
      if (classroom.studentEditingLocked && !classroom.allowedStudentIds.includes(userId)) return false;
    }
    if (workspace.collaborationMode === 'selected_students' && userRole !== 'teacher') {
      const allowed = new Set([...workspace.allowedEditors, ...classroom.allowedStudentIds]);
      if (!allowed.has(userId)) return false;
    }
    if (classroom.active && classroom.studentEditingLocked && userRole === 'student') {
      if (!classroom.allowedStudentIds.includes(userId)) return false;
    }
    return true;
  }, [classroom, userId, userRole, workspace.allowedEditors, workspace.collaborationMode, workspace.ownerId]);

  const refreshWorkspaceList = useCallback(async () => {
    if (window.location.protocol === 'file:') return;
    try {
      const res = await fetch(apiUrl('/api/workspaces'));
      if (res.ok) {
        const data = await res.json();
        setWorkspaceList(data.workspaces || []);
        setCustomTemplates(data.customTemplates || []);
      }
    } catch {
      // ignore offline
    }
  }, []);

  const loadCachedWorkspace = useCallback((wsId: string) => {
    const cached = localStorage.getItem(`${LOCAL_CACHE_KEY}:${wsId}`);
    if (!cached) return;
    let parsed: WorkspaceDocument;
    try {
      parsed = JSON.parse(cached) as WorkspaceDocument;
    } catch {
      try { localStorage.removeItem(`${LOCAL_CACHE_KEY}:${wsId}`); } catch { /* ignore */ }
      return;
    }
    workspaceRef.current = parsed;
    setWorkspace(parsed);
    const initPg =
      parsed.pages?.find((p) => p.id === parsed.activePageId) || parsed.pages?.[0];
    if (initPg?.viewport) {
      setZoom(initPg.viewport.zoom || 1);
      setPanX(initPg.viewport.panX || 0);
      setPanY(initPg.viewport.panY || 0);
      setRotationDeg(initPg.viewport.rotationDeg || 0);
    }
    setUndoStack([]);
    setRedoStack([]);
    setSelectedIds(new Set());
  }, []);

  const loadWorkspaceById = useCallback(async (wsId: string) => {
    const storedKey = getStoredHostKey(wsId);
    setHostKey(storedKey);
    if (window.location.protocol === 'file:') {
      loadCachedWorkspace(wsId);
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/workspaces/${encodeURIComponent(wsId)}`), {
        headers: storedKey ? { 'x-host-key': storedKey } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.workspace?.hostKey) {
          storeHostKey(wsId, data.workspace.hostKey);
          setHostKey(data.workspace.hostKey);
          const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
          if (isLocalHost && !INITIAL_PAIRING.paired) {
            setUserRole('teacher');
            safeSetLocalItem('lumina_urole', 'teacher');
          }
        }
        workspaceRef.current = data.workspace;
        setWorkspace(data.workspace);
        const initPg =
          data.workspace?.pages?.find((p: BoardPage) => p.id === data.workspace.activePageId) ||
          data.workspace?.pages?.[0];
        if (initPg?.viewport) {
          setZoom(initPg.viewport.zoom || 1);
          setPanX(initPg.viewport.panX || 0);
          setPanY(initPg.viewport.panY || 0);
          setRotationDeg(initPg.viewport.rotationDeg || 0);
        } else {
          setZoom(1);
          setPanX(0);
          setPanY(0);
          setRotationDeg(0);
        }
        if (data.classroom) setClassroom(data.classroom);
        setUndoStack([]);
        setRedoStack([]);
        setSelectedIds(new Set());
        safeCacheWorkspace(data.workspace);
        return;
      }
    } catch {
      loadCachedWorkspace(wsId);
    }
  }, [loadCachedWorkspace]);

  // Initial Load from URL ?room= or default-board
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || 'default-board';
    loadWorkspaceById(room);
    refreshWorkspaceList();
  }, [loadWorkspaceById, refreshWorkspaceList]);

  // WebSocket Real-Time Collaboration Connection
  const sendWS = useCallback((payload: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    } else {
      offlineQueueRef.current.push({ workspaceId: workspaceRef.current.id, payload });
      try { sessionStorage.setItem('lumina_offline_queue', JSON.stringify(offlineQueueRef.current)); } catch { /* ignore */ }
    }
  }, []);

  const handleWebRTCSignalRef = useRef<(msg: { fromUserId: string; fromRole?: UserRole; signalType: string; payload: unknown }) => Promise<void> | void>(() => {});

  const {
    localScreenStream,
    remoteScreenStream,
    iceState: webrtcIceState,
    connectionError: webrtcError,
    startBroadcast: startScreenBroadcast,
    stopBroadcast: stopScreenBroadcast,
    reconnectViewer,
    handleWebRTCSignal,
  } = useClassroomWebRTC({
    userId,
    userRole,
    presence,
    screenSharingActive: classroom.screenSharingActive,
    sendSignal: (targetUserId, signalType, payload) =>
      sendWS({ type: 'webrtc:signal', targetUserId, signalType, payload }),
    onScreenSharingStateChange: (active) => {
      setClassroom((prev) => ({ ...prev, screenSharingActive: active }));
      sendWS({ type: 'classroom:state', state: { screenSharingActive: active } });
    },
  });
  handleWebRTCSignalRef.current = handleWebRTCSignal;

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteScreenStream || null;
    }
  }, [remoteScreenStream, pipMinimized]);

  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (window.location.protocol === 'file:') {
        setRealtimeStatus('disconnected');
        return;
      }
      setRealtimeStatus('connecting');
      const currentKey = getStoredHostKey(workspace.id);
      const ticket = INITIAL_PAIRING.room === workspace.id ? INITIAL_PAIRING.inviteTicket : '';
      const url = `${webSocketUrl('/ws')}?room=${encodeURIComponent(workspace.id)}&userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userNameRef.current)}&role=${encodeURIComponent(userRoleRef.current)}&color=${encodeURIComponent(userColor)}${ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''}`;
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        if (closed) {
          socket.close();
          return;
        }
        reconnectAttemptsRef.current = 0;
        setRealtimeStatus('connected');
        setSaveState(navigator.onLine ? 'saved' : 'offline');
        if (currentKey) socket.send(JSON.stringify({ type: 'host:auth', hostKey: currentKey }));
        // Flush only queued mutations belonging to this workspace
        const remaining: { workspaceId: string; payload: unknown }[] = [];
        for (const item of offlineQueueRef.current) {
          if (item.workspaceId === workspace.id) {
            socket.send(JSON.stringify(item.payload));
          } else {
            remaining.push(item);
          }
        }
        offlineQueueRef.current = remaining;
        try {
          if (remaining.length === 0) sessionStorage.removeItem('lumina_offline_queue');
          else sessionStorage.setItem('lumina_offline_queue', JSON.stringify(remaining));
        } catch { /* ignore */ }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'init': {
              if (msg.workspace) {
                if (msg.workspace.hostKey) {
                  storeHostKey(msg.workspace.id, msg.workspace.hostKey);
                  setHostKey(msg.workspace.hostKey);
                }
                workspaceRef.current = msg.workspace;
                setWorkspace(msg.workspace);
                const initPg =
                  msg.workspace.pages?.find((p: BoardPage) => p.id === msg.workspace.activePageId) ||
                  msg.workspace.pages?.[0];
                if (initPg?.viewport) {
                  setZoom(initPg.viewport.zoom || 1);
                  setPanX(initPg.viewport.panX || 0);
                  setPanY(initPg.viewport.panY || 0);
                  setRotationDeg(initPg.viewport.rotationDeg || 0);
                }
              }
              if (msg.effectiveRole && msg.effectiveRole !== userRoleRef.current) {
                setUserRole(msg.effectiveRole);
                safeSetLocalItem('lumina_urole', msg.effectiveRole);
              }
              if (msg.classroom) setClassroom(msg.classroom);
              if (msg.presence) setPresence(msg.presence);
              break;
            }
            case 'host:granted': {
              if (msg.hostKey) {
                storeHostKey(workspaceRef.current.id, msg.hostKey);
                setHostKey(msg.hostKey);
                showToast('Teacher host privileges granted');
              }
              break;
            }
            case 'presence:update': {
              setPresence(msg.presence || []);
              break;
            }
            case 'cursor:move': {
              setPresence((prev) => {
                const exists = prev.some((p) => p.userId === msg.userId);
                if (!exists) {
                  return [
                    ...prev,
                    {
                      userId: msg.userId,
                      userName: msg.userName,
                      role: msg.role,
                      color: msg.color,
                      cursorX: msg.x,
                      cursorY: msg.y,
                      pageId: msg.pageId,
                      lastActive: Date.now(),
                    },
                  ];
                }
                return prev.map((p) =>
                  p.userId === msg.userId ? { ...p, cursorX: msg.x, cursorY: msg.y, pageId: msg.pageId } : p
                );
              });
              break;
            }
            case 'laser:point': {
              const now = Date.now();
              setRemoteLaserPoints((prev) => [
                ...prev.filter((p) => now - p.ts < 1400),
                { x: msg.x, y: msg.y, color: msg.color || '#EF4444', ts: now },
              ]);
              break;
            }
            case 'viewport:sync': {
              setRemoteViewportSender({
                userId: String(msg.userId || ''),
                userName: String(msg.userName || 'Mobile Device'),
                ts: Date.now(),
              });
              if (followRemoteViewportRef.current) {
                isApplyingRemoteViewportRef.current = true;
                if (typeof msg.zoom === 'number' && Number.isFinite(msg.zoom)) {
                  setZoom(Math.min(6, Math.max(0.1, msg.zoom)));
                }
                if (typeof msg.panX === 'number' && Number.isFinite(msg.panX)) {
                  setPanX(msg.panX);
                }
                if (typeof msg.panY === 'number' && Number.isFinite(msg.panY)) {
                  setPanY(msg.panY);
                }
                if (typeof msg.rotationDeg === 'number' && Number.isFinite(msg.rotationDeg)) {
                  setRotationDeg(msg.rotationDeg);
                }
                if (typeof msg.pageId === 'string' && msg.pageId !== workspaceRef.current.activePageId) {
                  setWorkspace((prev) => {
                    if (!prev.pages.some((p) => p.id === msg.pageId)) return prev;
                    const next = { ...prev, activePageId: msg.pageId };
                    workspaceRef.current = next;
                    return next;
                  });
                }
                setTimeout(() => {
                  isApplyingRemoteViewportRef.current = false;
                }, 0);
              }
              break;
            }
            case 'reaction:send': {
              const rId = uid('react');
              setReactions((prev) => [...prev, { id: rId, emoji: msg.emoji, userName: msg.userName, x: msg.x, y: msg.y, ts: Date.now() }]);
              setTimeout(() => {
                setReactions((prev) => prev.filter((r) => r.id !== rId));
              }, 2400);
              break;
            }
            case 'object:create': {
              setWorkspace((prev) => {
                const next = {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== msg.pageId) return p;
                    if (p.objects.some((o) => o.id === msg.object.id)) return p;
                    return { ...p, objects: [...p.objects, msg.object] };
                  }),
                };
                workspaceRef.current = next;
                return next;
              });
              break;
            }
            case 'object:update': {
              setWorkspace((prev) => {
                const next = {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== msg.pageId) return p;
                    return {
                      ...p,
                      objects: p.objects.map((o) => (o.id === msg.patch.id ? ({ ...o, ...msg.patch } as BoardObject) : o)),
                    };
                  }),
                };
                workspaceRef.current = next;
                return next;
              });
              break;
            }
            case 'objects:patch': {
              const patches = Array.isArray(msg.patches) ? (msg.patches as (Partial<BoardObject> & { id: string })[]) : [];
              const patchMap = new Map(patches.map((p) => [p.id, p]));
              setWorkspace((prev) => {
                const next = {
                  ...prev,
                  pages: prev.pages.map((p) => {
                    if (p.id !== msg.pageId) return p;
                    return {
                      ...p,
                      objects: p.objects.map((o) => {
                        const patch = patchMap.get(o.id);
                        return patch ? ({ ...o, ...patch } as BoardObject) : o;
                      }),
                    };
                  }),
                };
                workspaceRef.current = next;
                return next;
              });
              break;
            }
            case 'object:delete': {
              const delSet = new Set<string>(msg.objectIds || []);
              setWorkspace((prev) => {
                const next = {
                  ...prev,
                  pages: prev.pages.map((p) =>
                    p.id === msg.pageId ? { ...p, objects: p.objects.filter((o) => !delSet.has(o.id)) } : p
                  ),
                };
                workspaceRef.current = next;
                return next;
              });
              break;
            }
            case 'page:sync': {
              setWorkspace((prev) => {
                const exists = prev.pages.some((p) => p.id === msg.page.id);
                const next = {
                  ...prev,
                  pages: exists
                    ? prev.pages.map((p) => (p.id === msg.page.id ? msg.page : p))
                    : [...prev.pages, msg.page],
                };
                workspaceRef.current = next;
                return next;
              });
              break;
            }
            case 'workspace:sync': {
              setWorkspace((prev) => {
                const nextPages: BoardPage[] = msg.pages || prev.pages;
                const currentStillExists = nextPages.some((p) => p.id === prev.activePageId);
                const shouldFollow =
                  !currentStillExists ||
                  (userRoleRef.current === 'student' && followTeacherLocalRef.current);
                const nextActive = shouldFollow && msg.activePageId ? msg.activePageId : prev.activePageId;
                const next = {
                  ...prev,
                  pages: nextPages,
                  activePageId: nextPages.some((p) => p.id === nextActive) ? nextActive : nextPages[0]?.id || prev.activePageId,
                };
                workspaceRef.current = next;
                return next;
              });
              break;
            }
            case 'pdf:annotations': {
              if (typeof msg.fileId === 'string' && Array.isArray(msg.annotations)) {
                setWorkspace((prev) => {
                  const next = {
                    ...prev,
                    pdfAnnotations: {
                      ...(prev.pdfAnnotations || {}),
                      [msg.fileId]: msg.annotations as PDFAnnotation[],
                    },
                  };
                  workspaceRef.current = next;
                  return next;
                });
              }
              break;
            }
            case 'pdf:view': {
              if (followRemoteViewportRef.current && typeof msg.fileId === 'string' && Number.isFinite(msg.scrollProgress)) {
                setRemotePdfView({
                  fileId: msg.fileId,
                  scrollProgress: Math.max(0, Math.min(1, Number(msg.scrollProgress))),
                  timestamp: Date.now(),
                });
              }
              break;
            }
            case 'files:sync': {
              if (Array.isArray(msg.attachedFiles)) {
                setWorkspace((prev) => {
                  const removedFileIds: string[] = Array.isArray(msg.removedFileIds)
                    ? msg.removedFileIds.filter((fileId: unknown): fileId is string => typeof fileId === 'string')
                    : [];
                  const pdfAnnotations = { ...(prev.pdfAnnotations || {}) };
                  removedFileIds.forEach((fileId) => delete pdfAnnotations[fileId]);
                  const next = {
                    ...prev,
                    attachedFiles: msg.attachedFiles as AttachedFileMeta[],
                    ...(removedFileIds.length > 0 ? { pdfAnnotations } : {}),
                  };
                  workspaceRef.current = next;
                  return next;
                });
              }
              break;
            }
            case 'workspace:meta': {
              setWorkspace((prev) => {
                const next = {
                  ...prev,
                  collaborationMode: msg.collaborationMode ?? prev.collaborationMode,
                  allowedEditors: msg.allowedEditors ?? prev.allowedEditors,
                  name: msg.name ?? prev.name,
                };
                workspaceRef.current = next;
                return next;
              });
              break;
            }
            case 'classroom:state': {
              if (msg.classroom) setClassroom(msg.classroom);
              break;
            }
            case 'classroom:follow': {
              if (userRoleRef.current === 'student' && followTeacherLocalRef.current && msg.pageId) {
                setWorkspace((prev) => {
                  const targetPg = prev.pages.find((p) => p.id === msg.pageId);
                  if (targetPg?.viewport) {
                    setZoom(targetPg.viewport.zoom || 1);
                    setPanX(targetPg.viewport.panX || 0);
                    setPanY(targetPg.viewport.panY || 0);
                    setRotationDeg(targetPg.viewport.rotationDeg || 0);
                  }
                  const next = { ...prev, activePageId: msg.pageId };
                  workspaceRef.current = next;
                  return next;
                });
              }
              break;
            }
            case 'webrtc:signal': {
              void handleWebRTCSignalRef.current(msg);
              break;
            }
            case 'error': {
              if (msg.message) showToast(msg.message, 'error');
              break;
            }
          }
        } catch {
          // ignore malformed WS frames
        }
      };

      socket.onclose = () => {
        setRealtimeStatus('disconnected');
        if (!closed) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [showToast, userColor, userId, userRole, workspace.id, hostKey]);

  useEffect(() => {
    setSaveState(isOnline ? 'saved' : 'offline');
  }, [isOnline]);

  // Throttled live viewport/camera broadcast for paired mobile/tablet remote control
  const lastViewportEmitRef = useRef(0);
  useEffect(() => {
    if (!broadcastViewport || isApplyingRemoteViewportRef.current) return;
    const now = Date.now();
    const elapsed = now - lastViewportEmitRef.current;
    const delay = elapsed >= 55 ? 0 : 55 - elapsed;
    const timer = setTimeout(() => {
      if (isApplyingRemoteViewportRef.current) return;
      lastViewportEmitRef.current = Date.now();
      sendWS({
        type: 'viewport:sync',
        pageId: workspace.activePageId,
        zoom,
        panX,
        panY,
        rotationDeg,
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [broadcastViewport, panX, panY, rotationDeg, sendWS, workspace.activePageId, zoom]);

  // Autosave to offline cache + backend
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveWorkspaceNow = useCallback(
    async (docToSave: WorkspaceDocument) => {
      const enrichedPages = docToSave.pages.map((p) =>
        p.id === docToSave.activePageId
          ? {
              ...p,
              viewport: {
                zoom: zoomRef.current,
                panX: panXRef.current,
                panY: panYRef.current,
                rotationDeg: rotationDegRef.current,
              },
            }
          : p
      );
      const docWithVp = { ...docToSave, pages: enrichedPages };
      safeCacheWorkspace(docWithVp);
      if (!navigator.onLine || window.location.protocol === 'file:') {
        setSaveState('offline');
        return;
      }
      setSaveState('saving');
      try {
        const key = getStoredHostKey(docWithVp.id);
        const response = await fetch(apiUrl(`/api/workspaces/${encodeURIComponent(docWithVp.id)}`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { 'x-host-key': key } : {}),
          },
          body: JSON.stringify({
            name: docWithVp.name,
            folder: docWithVp.folder,
            starred: docWithVp.starred,
            collaborationMode: docWithVp.collaborationMode,
            allowedEditors: docWithVp.allowedEditors,
            pdfAnnotations: docWithVp.pdfAnnotations,
            activePageId: docWithVp.activePageId,
            pages: enrichedPages,
            actor: userName,
            userId,
            hostKey: key,
          }),
        });
        if (!response.ok) throw new Error(`Workspace save failed (${response.status})`);
        setSaveState('saved');
      } catch {
        setSaveState('offline');
      }
    },
    [userId, userName]
  );

  const scheduleAutosave = useCallback(
    (nextDoc: WorkspaceDocument) => {
      safeCacheWorkspace(nextDoc);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        saveWorkspaceNow(nextDoc);
      }, 900);
    },
    [saveWorkspaceNow]
  );

  // History helpers
  const MAX_UNDO_BYTES = 50 * 1024 * 1024; // 50 MB rough cap

  const estimateSnapshotSize = useCallback((snapshot: BoardPage[]): number => {
    try {
      return JSON.stringify(snapshot).length;
    } catch {
      return 0;
    }
  }, []);

  const pushUndo = useCallback((pagesSnapshot: BoardPage[]) => {
    setUndoStack((prev) => {
      const clone = structuredClone(pagesSnapshot);
      let stack = [...prev.slice(-39), clone];
      // Trim oldest entries if estimated total size exceeds cap
      let totalSize = 0;
      const sizes = stack.map((s) => estimateSnapshotSize(s));
      for (const sz of sizes) totalSize += sz;
      while (stack.length > 1 && totalSize > MAX_UNDO_BYTES) {
        totalSize -= sizes.shift()!;
        stack = stack.slice(1);
      }
      return stack;
    });
    setRedoStack([]);
  }, [estimateSnapshotSize]);

  const snapshotUndo = useCallback(() => {
    pushUndo(workspaceRef.current.pages);
  }, [pushUndo]);

  const syncPageState = useCallback(() => {
    const doc = workspaceRef.current;
    const page = doc.pages.find((p) => p.id === doc.activePageId);
    if (page) {
      sendWS({ type: 'page:sync', page });
    }
    scheduleAutosave(doc);
  }, [scheduleAutosave, sendWS]);

  const replacePageObjects = useCallback(
    (objects: BoardObject[], pushHistory = true) => {
      if (!canEdit) return;
      const cur = workspaceRef.current;
      if (pushHistory) pushUndo(cur.pages);
      const nextPages = cur.pages.map((p) =>
        p.id === activePage.id ? { ...p, objects } : p
      );
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      const updated = nextPages.find((p) => p.id === activePage.id);
      if (updated) sendWS({ type: 'page:sync', page: updated });
      scheduleAutosave(nextDoc);
    },
    [activePage.id, canEdit, pushUndo, scheduleAutosave, sendWS]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const cur = workspaceRef.current;
    const prevPages = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, structuredClone(cur.pages)]);
    setUndoStack((u) => u.slice(0, -1));
    const nextDoc = { ...cur, pages: prevPages, updatedAt: Date.now() };
    workspaceRef.current = nextDoc;
    setWorkspace(nextDoc);
    sendWS({ type: 'pages:replace', pages: prevPages, activePageId: nextDoc.activePageId });
    scheduleAutosave(nextDoc);
  }, [scheduleAutosave, sendWS, undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const cur = workspaceRef.current;
    const nextPages = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, structuredClone(cur.pages)]);
    setRedoStack((r) => r.slice(0, -1));
    const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
    workspaceRef.current = nextDoc;
    setWorkspace(nextDoc);
    sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextDoc.activePageId });
    scheduleAutosave(nextDoc);
  }, [redoStack, scheduleAutosave, sendWS]);

  // Object mutations (all read from workspaceRef.current to prevent stale closures)
  const handleCreateObject = useCallback(
    (obj: BoardObject) => {
      if (!canEdit) {
        showToast('Editing is locked by teacher/owner.', 'error');
        return;
      }
      const cur = workspaceRef.current;
      pushUndo(cur.pages);
      const targetPageId = cur.activePageId;
      const nextPages = cur.pages.map((p) =>
        p.id === targetPageId ? { ...p, objects: [...p.objects, obj] } : p
      );
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      sendWS({ type: 'object:create', pageId: targetPageId, object: obj });
      scheduleAutosave(nextDoc);
    },
    [canEdit, pushUndo, scheduleAutosave, sendWS, showToast]
  );

  const closeAllToolMenus = useCallback(() => {
    setRightPanelMenu(null);
    setShowReactionsMenu(false);
    setShowLayersMenu(false);
  }, []);

  const openRightPanelMenu = useCallback(
    (menu: 'table' | 'diagrams' | 'geometry' | 'math', sectionId: string) => {
      if (rightPanelMenu === menu && showRightPanel) {
        setRightPanelMenu(null);
        if (window.innerWidth < 768) {
          setShowRightPanel(false);
        }
        return;
      }
      setShowReactionsMenu(false);
      setShowLayersMenu(false);
      setSelectedIds(new Set());
      setRightPanelMenu(menu);
      setShowRightPanel(true);
      setAutoOpenSignal({ sectionId, tick: Date.now() });
    },
    [rightPanelMenu, showRightPanel]
  );

  const getCanvasMetrics = useCallback(() => {
    const el = canvasRef.current;
    if (el && el.clientWidth > 0 && el.clientHeight > 0) {
      return { vw: el.clientWidth, vh: el.clientHeight };
    }
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const leftOffset = isDesktopMd ? 48 : 0;
    const rightOffset = isDesktopMd && showRightPanel ? (rightPanelExpanded ? 288 : 48) : 0;
    const topOffset = (hideTopBar ? 0 : 48) + (!canEdit ? 30 : 0) + (showClassTimer ? 36 : 0);
    const bottomOffset = isDesktopMd ? 44 : 56;
    return {
      vw: Math.max(260, winW - leftOffset - rightOffset),
      vh: Math.max(260, winH - topOffset - bottomOffset),
    };
  }, [canEdit, hideTopBar, isDesktopMd, rightPanelExpanded, showClassTimer, showRightPanel]);

  const viewportCenter = useMemo(() => {
    const { vw, vh } = getCanvasMetrics();
    return {
      x: Math.round((vw / 2 - panX) / zoom),
      y: Math.round((vh / 2 - panY) / zoom),
    };
  }, [getCanvasMetrics, panX, panY, zoom]);

  const viewportBox = useMemo(() => {
    const { vw, vh } = getCanvasMetrics();
    return {
      minX: Math.round(-panX / zoom),
      minY: Math.round(-panY / zoom),
      contentW: Math.round(vw / zoom),
      contentH: Math.round(vh / zoom),
    };
  }, [getCanvasMetrics, panX, panY, zoom]);

  const lockedLayerIds = useMemo(() => {
    const set = new Set<string>();
    for (const l of activePage.layers || []) {
      if (l.locked) set.add(l.id);
    }
    return set;
  }, [activePage.layers]);

  const sendLiveReaction = useCallback(
    (emoji: string) => {
      const rx = Math.round(viewportCenter.x + (Math.random() - 0.5) * 140);
      const ry = Math.round(viewportCenter.y + (Math.random() - 0.5) * 80);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendWS({ type: 'reaction:send', emoji, x: rx, y: ry });
      } else {
        const rId = uid('react');
        setReactions((prev) => [...prev, { id: rId, emoji, userName, x: rx, y: ry, ts: Date.now() }]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== rId));
        }, 2400);
      }
      setShowReactionsMenu(false);
    },
    [sendWS, userName, viewportCenter.x, viewportCenter.y]
  );

  const insertBoardTable = useCallback(
    (rows: number, cols: number) => {
      const safeRows = Math.max(1, Math.min(12, rows));
      const safeCols = Math.max(1, Math.min(10, cols));
      const tableW = Math.max(240, safeCols * 105);
      const tableH = Math.max(120, safeRows * 38);
      const tableObj: BoardObject = {
        id: uid('table'),
        name: `Table ${safeRows}×${safeCols}`,
        type: 'table',
        x: Math.round(viewportCenter.x - tableW / 2),
        y: Math.round(viewportCenter.y - tableH / 2),
        width: tableW,
        height: tableH,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: activePage.objects.length + 1,
        rows: safeRows,
        cols: safeCols,
        cells: Array.from({ length: safeRows }, (_, r) =>
          Array.from({ length: safeCols }, (_, c) => (r === 0 ? `Header ${c + 1}` : `Cell ${r},${c + 1}`))
        ),
        headerBg: '#1E293B',
        borderColor: '#CBD5E1',
        textColor: '#0F172A',
      };
      handleCreateObject(tableObj);
      setSelectedIds(new Set([tableObj.id]));
      if (!toolLocked) setActiveTool('select');
      closeAllToolMenus();
      showToast(`Inserted ${safeRows}×${safeCols} Table`);
    },
    [activePage.objects.length, closeAllToolMenus, handleCreateObject, showToast, toolLocked, viewportCenter.x, viewportCenter.y]
  );

  const insertCodeBlock = useCallback(() => {
    const codeObj: BoardObject = {
      id: uid('code'),
      name: 'Code Block',
      type: 'text',
      codeBlock: true,
      codeLanguage: 'typescript',
      x: Math.round(viewportCenter.x - 260),
      y: Math.round(viewportCenter.y - 140),
      width: 520,
      height: 280,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: activePage.objects.length + 1,
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
      richBlocks: [{ type: 'paragraph', align: 'left', indent: 0, listType: 'none', runs: [{ text: '' }] }],
    };
    handleCreateObject(codeObj);
    setSelectedIds(new Set([codeObj.id]));
    closeAllToolMenus();
    showToast('Inserted Code Block');
  }, [activePage.objects.length, closeAllToolMenus, handleCreateObject, showToast, viewportCenter.x, viewportCenter.y]);

  const handleInsertMultipleObjects = useCallback(
    (objs: BoardObject[], mode: 'append' | 'replace' = 'append') => {
      if (!canEdit) {
        showToast('Editing is locked by teacher/owner.', 'error');
        return;
      }
      const cur = workspaceRef.current;
      pushUndo(cur.pages);
      const targetPageId = cur.activePageId;
      const nextPages = cur.pages.map((p) =>
        p.id === targetPageId
          ? { ...p, objects: mode === 'replace' ? objs : [...p.objects, ...objs] }
          : p
      );
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      const updatedPage = nextPages.find((p) => p.id === targetPageId);
      if (updatedPage) sendWS({ type: 'page:sync', page: updatedPage });
      scheduleAutosave(nextDoc);
    },
    [canEdit, pushUndo, scheduleAutosave, sendWS, showToast]
  );

  const handleUpdateObject = useCallback(
    (id: string, patch: Partial<BoardObject>, commit = true) => {
      if (!canEdit) return;
      const cur = workspaceRef.current;
      if (commit) pushUndo(cur.pages);
      const targetPageId = cur.activePageId;
      const nextPages = cur.pages.map((p) =>
        p.id === targetPageId
          ? {
              ...p,
              objects: p.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as BoardObject) : o)),
            }
          : p
      );
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      if (commit) {
        sendWS({ type: 'object:update', pageId: targetPageId, patch: { id, ...patch } });
        scheduleAutosave(nextDoc);
      }
    },
    [canEdit, pushUndo, scheduleAutosave, sendWS]
  );

  const handleBatchPatchObjects = useCallback(
    (patches: (Partial<BoardObject> & { id: string })[], pushHistory = true) => {
      if (!canEdit || patches.length === 0) return;
      const cur = workspaceRef.current;
      if (pushHistory) pushUndo(cur.pages);
      const targetPageId = cur.activePageId;
      const patchMap = new Map(patches.map((p) => [p.id, p]));
      const nextPages = cur.pages.map((p) =>
        p.id === targetPageId
          ? {
              ...p,
              objects: p.objects.map((o) => {
                const patch = patchMap.get(o.id);
                return patch ? ({ ...o, ...patch } as BoardObject) : o;
              }),
            }
          : p
      );
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      sendWS({ type: 'objects:patch', pageId: targetPageId, patches });
      scheduleAutosave(nextDoc);
    },
    [canEdit, pushUndo, scheduleAutosave, sendWS]
  );

  const handleDeleteObjects = useCallback(
    (ids: string[]) => {
      if (!canEdit || ids.length === 0) return;
      const cur = workspaceRef.current;
      pushUndo(cur.pages);
      const targetPageId = cur.activePageId;
      const delSet = new Set(ids);
      const nextPages = cur.pages.map((p) =>
        p.id === targetPageId ? { ...p, objects: p.objects.filter((o) => !delSet.has(o.id)) } : p
      );
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      setSelectedIds(new Set());
      sendWS({ type: 'object:delete', pageId: targetPageId, objectIds: ids });
      scheduleAutosave(nextDoc);
    },
    [canEdit, pushUndo, scheduleAutosave, sendWS]
  );

  const handleDuplicateSelected = useCallback(() => {
    const cur = workspaceRef.current;
    const page = cur.pages.find((p) => p.id === cur.activePageId) || cur.pages[0];
    if (!page) return;
    const sel = page.objects.filter((o) => selectedIds.has(o.id));
    if (sel.length === 0) return;
    const groupMap = new Map<string, string>();
    const idMap = new Map<string, string>();
    const clones = sel.map((o, i) => {
      const nextId = uid(o.type);
      idMap.set(o.id, nextId);
      let nextGroupId = o.groupId;
      if (o.groupId) {
        if (!groupMap.has(o.groupId)) groupMap.set(o.groupId, uid('grp'));
        nextGroupId = groupMap.get(o.groupId);
      }
      return {
        ...structuredClone(o),
        id: nextId,
        groupId: nextGroupId,
        x: o.x + 28,
        y: o.y + 28,
        zIndex: page.objects.length + i + 1,
      };
    });
    const remapped = clones.map((c) => {
      if (c.type === 'connector') {
        return {
          ...c,
          fromId: c.fromId && idMap.has(c.fromId) ? idMap.get(c.fromId) : c.fromId,
          toId: c.toId && idMap.has(c.toId) ? idMap.get(c.toId) : c.toId,
          x1: c.x1 + 28,
          y1: c.y1 + 28,
          x2: c.x2 + 28,
          y2: c.y2 + 28,
          ...(c.waypoints ? { waypoints: c.waypoints.map((wp) => ({ x: wp.x + 28, y: wp.y + 28 })) } : {}),
        };
      }
      if (c.type === 'stroke') {
        return {
          ...c,
          points: c.points.map((pt) => ({ ...pt, x: pt.x + 28, y: pt.y + 28 })),
        };
      }
      if (c.type === 'line') {
        return {
          ...c,
          points: c.points.map((pt) => ({ ...pt, x: pt.x + 28, y: pt.y + 28 })),
          ...(typeof c.cpX === 'number' ? { cpX: c.cpX + 28 } : {}),
          ...(typeof c.cpY === 'number' ? { cpY: c.cpY + 28 } : {}),
        };
      }
      return c;
    }) as BoardObject[];
    handleInsertMultipleObjects(remapped, 'append');
    setSelectedIds(new Set(remapped.map((c) => c.id)));
  }, [handleInsertMultipleObjects, selectedIds]);

  const handleGroupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const cur = workspaceRef.current;
    pushUndo(cur.pages);
    const gid = uid('grp');
    const targetPageId = cur.activePageId;
    const nextPages = cur.pages.map((p) =>
      p.id === targetPageId
        ? { ...p, objects: p.objects.map((o) => (selectedIds.has(o.id) ? { ...o, groupId: gid } : o)) }
        : p
    );
    const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
    workspaceRef.current = nextDoc;
    setWorkspace(nextDoc);
    sendWS({ type: 'page:sync', page: nextPages.find((p) => p.id === targetPageId) });
    scheduleAutosave(nextDoc);
  }, [pushUndo, scheduleAutosave, selectedIds, sendWS]);

  const handleUngroupSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const cur = workspaceRef.current;
    pushUndo(cur.pages);
    const targetPageId = cur.activePageId;
    const nextPages = cur.pages.map((p) =>
      p.id === targetPageId
        ? { ...p, objects: p.objects.map((o) => (selectedIds.has(o.id) ? { ...o, groupId: undefined } : o)) }
        : p
    );
    const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
    workspaceRef.current = nextDoc;
    setWorkspace(nextDoc);
    sendWS({ type: 'page:sync', page: nextPages.find((p) => p.id === targetPageId) });
    scheduleAutosave(nextDoc);
  }, [pushUndo, scheduleAutosave, selectedIds, sendWS]);

  const handleCopyStyle = useCallback(
    (obj?: BoardObject) => {
      const target = obj || activePage.objects.find((o) => selectedIds.has(o.id));
      if (!target) return;
      const styleSnapshot: Record<string, unknown> = { opacity: target.opacity ?? 1 };
      if ('stroke' in target) styleSnapshot.stroke = target.stroke;
      if ('strokeWidth' in target) styleSnapshot.strokeWidth = target.strokeWidth;
      if ('lineStyle' in target) styleSnapshot.lineStyle = target.lineStyle;
      if ('fill' in target) styleSnapshot.fill = target.fill;
      if ('fillStyle' in target) styleSnapshot.fillStyle = target.fillStyle;
      if ('cornerRadius' in target) styleSnapshot.cornerRadius = target.cornerRadius;
      if ('shadow' in target) styleSnapshot.shadow = target.shadow;
      if ('textColor' in target) styleSnapshot.textColor = target.textColor;
      if ('bgColor' in target) styleSnapshot.bgColor = target.bgColor;
      if ('fontFamily' in target) styleSnapshot.fontFamily = target.fontFamily;
      if ('fontSize' in target) styleSnapshot.fontSize = target.fontSize;
      if ('fontWeight' in target) styleSnapshot.fontWeight = target.fontWeight;
      if ('fontStyle' in target) styleSnapshot.fontStyle = target.fontStyle;
      if ('noteColor' in target) styleSnapshot.noteColor = target.noteColor;
      if ('noteTextColor' in target) styleSnapshot.noteTextColor = target.noteTextColor;
      if ('color' in target) styleSnapshot.color = target.color;
      setCopiedStyle(styleSnapshot);
      showToast('Style copied (Ctrl+Alt+V to paste)');
    },
    [activePage.objects, selectedIds, showToast]
  );

  const handlePasteStyle = useCallback(
    (explicitTargets?: BoardObject[]) => {
      if (!copiedStyle) return;
      const targets =
        explicitTargets && explicitTargets.length > 0
          ? explicitTargets
          : activePage.objects.filter((o) => selectedIds.has(o.id));
      if (targets.length === 0) return;
      const patches: (Partial<BoardObject> & { id: string })[] = [];
      for (const o of targets) {
        if (o.locked || (o.layerId && lockedLayerIds.has(o.layerId))) continue;
        const p: Record<string, unknown> = { id: o.id };
        if (typeof copiedStyle.opacity === 'number') p.opacity = copiedStyle.opacity;
        if (o.type === 'shape') {
          if (typeof copiedStyle.stroke === 'string') p.stroke = copiedStyle.stroke;
          if (typeof copiedStyle.strokeWidth === 'number') p.strokeWidth = copiedStyle.strokeWidth;
          if (typeof copiedStyle.lineStyle === 'string') p.lineStyle = copiedStyle.lineStyle;
          if (typeof copiedStyle.fill === 'string') p.fill = copiedStyle.fill;
          if (typeof copiedStyle.fillStyle === 'string') p.fillStyle = copiedStyle.fillStyle;
          if (typeof copiedStyle.cornerRadius === 'number') p.cornerRadius = copiedStyle.cornerRadius;
          if (typeof copiedStyle.shadow === 'boolean') p.shadow = copiedStyle.shadow;
          if (typeof copiedStyle.textColor === 'string') p.textColor = copiedStyle.textColor;
          if (typeof copiedStyle.fontFamily === 'string') p.fontFamily = copiedStyle.fontFamily;
          if (typeof copiedStyle.fontSize === 'number') p.fontSize = copiedStyle.fontSize;
        } else if (o.type === 'stroke' || o.type === 'line' || o.type === 'connector') {
          if (typeof copiedStyle.stroke === 'string') p.stroke = copiedStyle.stroke;
          if (typeof copiedStyle.strokeWidth === 'number') p.strokeWidth = copiedStyle.strokeWidth;
          if (typeof copiedStyle.lineStyle === 'string') p.lineStyle = copiedStyle.lineStyle;
        } else if (o.type === 'text') {
          const nextTextColor =
            typeof copiedStyle.textColor === 'string'
              ? copiedStyle.textColor
              : typeof copiedStyle.stroke === 'string'
                ? copiedStyle.stroke
                : undefined;
          if (nextTextColor) {
            p.textColor = nextTextColor;
            if (o.richBlocks?.length) p.richBlocks = applyDefaultStyleToRichBlocks(o.richBlocks, { color: nextTextColor });
          }
          if (typeof copiedStyle.bgColor === 'string') p.bgColor = copiedStyle.bgColor;
          else if (typeof copiedStyle.fill === 'string') p.bgColor = copiedStyle.fill;
          if (typeof copiedStyle.fontFamily === 'string') p.fontFamily = copiedStyle.fontFamily;
          if (typeof copiedStyle.fontSize === 'number') p.fontSize = copiedStyle.fontSize;
        } else if (o.type === 'sticky') {
          if (typeof copiedStyle.noteColor === 'string') p.noteColor = copiedStyle.noteColor;
          else if (typeof copiedStyle.fill === 'string') p.noteColor = copiedStyle.fill;
          const nextTextColor =
            typeof copiedStyle.textColor === 'string'
              ? copiedStyle.textColor
              : typeof copiedStyle.noteTextColor === 'string'
                ? copiedStyle.noteTextColor
                : undefined;
          if (nextTextColor) {
            p.textColor = nextTextColor;
            if (o.richBlocks?.length) p.richBlocks = applyDefaultStyleToRichBlocks(o.richBlocks, { color: nextTextColor });
          }
          if (typeof copiedStyle.fontFamily === 'string') p.fontFamily = copiedStyle.fontFamily;
          if (typeof copiedStyle.fontSize === 'number') p.fontSize = copiedStyle.fontSize;
        } else if (o.type === 'math') {
          if (typeof copiedStyle.color === 'string') p.color = copiedStyle.color;
          else if (typeof copiedStyle.stroke === 'string') p.color = copiedStyle.stroke;
          if (typeof copiedStyle.bgColor === 'string') p.bgColor = copiedStyle.bgColor;
        }
        patches.push(p as Partial<BoardObject> & { id: string });
      }
      if (patches.length > 0) {
        handleBatchPatchObjects(patches);
        showToast(`Pasted style to ${patches.length} item${patches.length > 1 ? 's' : ''}`);
      }
    },
    [activePage.objects, copiedStyle, handleBatchPatchObjects, lockedLayerIds, selectedIds, showToast]
  );

  const handleFormatPainterTarget = useCallback(
    (target: BoardObject) => {
      handlePasteStyle([target]);
    },
    [handlePasteStyle]
  );

  const handleReorderZ = useCallback(
    (id: string, dir: 'front' | 'back' | 'forward' | 'backward') => {
      const cur = workspaceRef.current;
      const targetPageId = cur.activePageId;
      const page = cur.pages.find((p) => p.id === targetPageId);
      if (!page) return;
      const sorted = [...page.objects].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((o) => o.id === id);
      if (idx === -1) return;
      const [item] = sorted.splice(idx, 1);
      if (dir === 'front') sorted.push(item);
      else if (dir === 'back') sorted.unshift(item);
      else if (dir === 'forward') sorted.splice(Math.min(sorted.length, idx + 1), 0, item);
      else sorted.splice(Math.max(0, idx - 1), 0, item);

      const reindexed = sorted.map((o, i) => ({ ...o, zIndex: i + 1 }));
      pushUndo(cur.pages);
      const nextPages = cur.pages.map((p) => (p.id === targetPageId ? { ...p, objects: reindexed } : p));
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      sendWS({ type: 'page:sync', page: nextPages.find((p) => p.id === targetPageId) });
      scheduleAutosave(nextDoc);
    },
    [pushUndo, scheduleAutosave, sendWS]
  );

  // Page operations
  const handleSelectPage = useCallback(
    (pageId: string) => {
      const cur = workspaceRef.current;
      const curVp = {
        zoom: zoomRef.current,
        panX: panXRef.current,
        panY: panYRef.current,
        rotationDeg: rotationDegRef.current,
      };
      const updatedPages = cur.pages.map((p) =>
        p.id === cur.activePageId ? { ...p, viewport: curVp } : p
      );
      const targetPg = updatedPages.find((p) => p.id === pageId);
      if (targetPg?.viewport) {
        setZoom(targetPg.viewport.zoom || 1);
        setPanX(targetPg.viewport.panX || 0);
        setPanY(targetPg.viewport.panY || 0);
        setRotationDeg(targetPg.viewport.rotationDeg || 0);
      } else {
        setZoom(1);
        setPanX(0);
        setPanY(0);
        setRotationDeg(0);
      }
      const next = { ...cur, pages: updatedPages, activePageId: pageId };
      workspaceRef.current = next;
      setWorkspace(next);
      setSelectedIds(new Set());
      if (classroom.active && userRole === 'teacher') {
        sendWS({ type: 'classroom:follow', pageId });
      }
    },
    [classroom.active, sendWS, userRole]
  );

  const handleUpdatePage = useCallback(
    (pageId: string, patch: Partial<BoardPage>, commit = true) => {
      if (!canEdit) return;
      const cur = workspaceRef.current;
      const nextPages = cur.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p));
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      const updated = nextPages.find((p) => p.id === pageId);
      if (commit) {
        if (updated) sendWS({ type: 'page:sync', page: updated });
        scheduleAutosave(nextDoc);
      }
    },
    [canEdit, scheduleAutosave, sendWS]
  );

  const handleAddPage = useCallback(
    (customPage?: BoardPage) => {
      const cur = workspaceRef.current;
      pushUndo(cur.pages);
      const newPage: BoardPage = customPage
        ? { ...customPage, id: uid('page') }
        : {
            id: uid('page'),
            name: `${viewMode === 'presentation' ? 'Slide' : 'Board'} ${cur.pages.length + 1}`,
            objects: [],
            layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
            guides: [],
            background: '#FFFFFF',
            gridType: viewMode === 'presentation' ? 'none' : 'dots',
            gridSize: 28,
            transition: 'fade',
            slideDurationSec: 0,
          };
      const nextPages = [...cur.pages, newPage];
      const nextDoc = { ...cur, pages: nextPages, activePageId: newPage.id, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setRotationDeg(0);
      sendWS({ type: 'pages:replace', pages: nextPages, activePageId: newPage.id });
      scheduleAutosave(nextDoc);
    },
    [pushUndo, scheduleAutosave, sendWS, viewMode]
  );

  const handleDuplicatePage = useCallback(
    (pageId: string) => {
      const cur = workspaceRef.current;
      const src = cur.pages.find((p) => p.id === pageId);
      if (!src) return;
      pushUndo(cur.pages);
      const idMap = new Map<string, string>();
      const groupMap = new Map<string, string>();
      const clonedObjects = src.objects.map((o) => {
        const nextId = uid(o.type);
        idMap.set(o.id, nextId);
        let nextGroupId = o.groupId;
        if (o.groupId) {
          if (!groupMap.has(o.groupId)) groupMap.set(o.groupId, uid('grp'));
          nextGroupId = groupMap.get(o.groupId);
        }
        return { ...structuredClone(o), id: nextId, groupId: nextGroupId };
      });
      const remappedObjects = clonedObjects.map((o) =>
        o.type === 'connector'
          ? {
              ...o,
              fromId: o.fromId && idMap.has(o.fromId) ? idMap.get(o.fromId) : o.fromId,
              toId: o.toId && idMap.has(o.toId) ? idMap.get(o.toId) : o.toId,
            }
          : o
      );
      const copy: BoardPage = {
        ...structuredClone(src),
        id: uid('page'),
        name: `${src.name} (Copy)`,
        objects: remappedObjects,
      };
      const idx = cur.pages.findIndex((p) => p.id === pageId);
      const nextPages = [...cur.pages];
      nextPages.splice(idx + 1, 0, copy);
      const nextDoc = { ...cur, pages: nextPages, activePageId: copy.id, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      sendWS({ type: 'pages:replace', pages: nextPages, activePageId: copy.id });
      scheduleAutosave(nextDoc);
    },
    [pushUndo, scheduleAutosave, sendWS]
  );

  const handleDeletePage = useCallback(
    (pageId: string) => {
      const cur = workspaceRef.current;
      if (cur.pages.length <= 1) return;
      pushUndo(cur.pages);
      const nextPages = cur.pages.filter((p) => p.id !== pageId);
      const nextActive = cur.activePageId === pageId ? nextPages[0].id : cur.activePageId;
      const nextDoc = { ...cur, pages: nextPages, activePageId: nextActive, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextActive });
      scheduleAutosave(nextDoc);
    },
    [pushUndo, scheduleAutosave, sendWS]
  );

  const handleReorderPage = useCallback(
    (pageId: string, dir: -1 | 1) => {
      const cur = workspaceRef.current;
      const idx = cur.pages.findIndex((p) => p.id === pageId);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= cur.pages.length) return;
      pushUndo(cur.pages);
      const nextPages = [...cur.pages];
      const [moved] = nextPages.splice(idx, 1);
      nextPages.splice(target, 0, moved);
      const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextDoc.activePageId });
      scheduleAutosave(nextDoc);
    },
    [pushUndo, scheduleAutosave, sendWS]
  );

  const handleSyncPdfAnnotations = useCallback(
    (fileId: string, anns: PDFAnnotation[]) => {
      const cur = workspaceRef.current;
      const nextDoc: WorkspaceDocument = {
        ...cur,
        pdfAnnotations: { ...(cur.pdfAnnotations || {}), [fileId]: anns },
        updatedAt: Date.now(),
      };
      workspaceRef.current = nextDoc;
      setWorkspace(nextDoc);
      sendWS({ type: 'pdf:annotations', fileId, annotations: anns });
      scheduleAutosave(nextDoc);
    },
    [scheduleAutosave, sendWS]
  );

  const handleSyncPdfView = useCallback(
    (fileId: string, scrollProgress: number) => {
      if (!broadcastViewport) return;
      sendWS({ type: 'pdf:view', fileId, scrollProgress });
    },
    [broadcastViewport, sendWS]
  );

  const ttsQuickAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsQuickCacheRef = useRef<Map<string, string>>(new Map());
  const ttsQuickCooldownUntilRef = useRef<number>(0);
  const ttsQuickSpeechTokenRef = useRef(0);
  const ttsQuickWordProgressRef = useRef<((wordIndex: number | null) => void) | null>(null);

  const handleReadAloudQuick = useCallback(
    async (textToSpeak: string, onWordChange?: (wordIndex: number | null) => void) => {
      const chunks = splitReadAloudText(textToSpeak, 2500);
      if (chunks.length === 0) {
        onWordChange?.(null);
        showToast('Select a text box, sticky note, or math block to read aloud.');
        return;
      }
      const token = ++ttsQuickSpeechTokenRef.current;
      ttsQuickWordProgressRef.current?.(null);
      ttsQuickWordProgressRef.current = onWordChange || null;
      ttsQuickAudioRef.current?.pause();
      ttsQuickAudioRef.current = null;
      showToast('Generating AI voice...');

      try {
        let wordOffset = 0;
        for (const chunk of chunks) {
          if (token !== ttsQuickSpeechTokenRef.current) return;
          const speechLocale = getSpeechLocale(chunk, locale);
          const speechWords = getSpeechWordRanges(chunk);
          const cacheKey = `${speechLocale}:${chunk}`;
          let audioDataUrl = ttsQuickCacheRef.current.get(cacheKey) || '';
          if (!audioDataUrl) {
            if (Date.now() < ttsQuickCooldownUntilRef.current) {
              const waitSec = Math.ceil((ttsQuickCooldownUntilRef.current - Date.now()) / 1000);
              showToast(`AI voice limit reached. Try again in ${waitSec} seconds.`, 'error');
              return;
            }
            const currentWorkspace = workspaceRef.current;
            const res = await fetch(apiUrl('/api/ai/tts'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Host-Key': hostKey || currentWorkspace.hostKey || '',
              },
              body: JSON.stringify({
                text: chunk,
                locale: speechLocale,
                workspaceId: currentWorkspace.id,
              }),
            });
            if (token !== ttsQuickSpeechTokenRef.current) return;
            if (!res.ok) {
              const errData = await res.json().catch(() => ({} as { error?: string; retryAfterSeconds?: number }));
              if (res.status === 429) {
                const waitSec = Number(errData.retryAfterSeconds || 30);
                ttsQuickCooldownUntilRef.current = Date.now() + waitSec * 1000;
                showToast(`AI voice limit reached. Try again in ${waitSec} seconds.`, 'error');
              } else {
                showToast(errData.error || `AI voice request failed (${res.status}).`, 'error');
              }
              return;
            }
            const data = await res.json();
            if (typeof data.audioDataUrl !== 'string' || !data.audioDataUrl) {
              showToast('AI voice did not return audio.', 'error');
              return;
            }
            audioDataUrl = data.audioDataUrl;
            if (ttsQuickCacheRef.current.size >= 20) {
              const first = ttsQuickCacheRef.current.keys().next().value;
              if (first !== undefined) ttsQuickCacheRef.current.delete(first);
            }
            ttsQuickCacheRef.current.set(cacheKey, audioDataUrl);
          }
          if (token !== ttsQuickSpeechTokenRef.current) return;
          const audio = new Audio(audioDataUrl);
          ttsQuickAudioRef.current = audio;
          const completed = await new Promise<boolean>((resolve, reject) => {
            let activeWordIndex = -1;
            const updateSpeechWord = () => {
              const wordIndex = getActiveSpeechWordIndex(speechWords, audio.currentTime, audio.duration);
              if (token !== ttsQuickSpeechTokenRef.current || wordIndex < 0 || wordIndex === activeWordIndex) return;
              activeWordIndex = wordIndex;
              onWordChange?.(wordOffset + wordIndex);
            };
            audio.onended = () => resolve(true);
            audio.onerror = () => reject(new Error('AI voice audio could not play. Check your connection and try again.'));
            audio.onloadedmetadata = updateSpeechWord;
            audio.onplaying = updateSpeechWord;
            audio.ontimeupdate = updateSpeechWord;
            audio.onpause = () => {
              if (token !== ttsQuickSpeechTokenRef.current) resolve(false);
              else updateSpeechWord();
            };
            void audio.play().catch(reject);
          });
          if (!completed || token !== ttsQuickSpeechTokenRef.current) return;
          ttsQuickAudioRef.current = null;
          wordOffset += speechWords.length;
        }
      } catch (error) {
        if (token !== ttsQuickSpeechTokenRef.current) return;
        ttsQuickAudioRef.current = null;
        const detail = error instanceof Error ? error.message : 'Network request failed.';
        showToast(`AI voice could not be played: ${detail}`, 'error');
      } finally {
        if (token === ttsQuickSpeechTokenRef.current) {
          onWordChange?.(null);
          if (ttsQuickWordProgressRef.current === onWordChange) ttsQuickWordProgressRef.current = null;
        }
      }
    },
    [hostKey, locale, showToast]
  );

  const stopReadAloudQuick = useCallback(() => {
    ttsQuickSpeechTokenRef.current += 1;
    ttsQuickAudioRef.current?.pause();
    ttsQuickAudioRef.current = null;
    ttsQuickWordProgressRef.current?.(null);
    ttsQuickWordProgressRef.current = null;
  }, []);

  const handleQuickAIAction = useCallback(
    (action: 'sketch_shape' | 'handwriting' | 'math_solve' | 'read_aloud') => {
      if (action === 'read_aloud') {
        const curPage = workspaceRef.current.pages.find((p) => p.id === workspaceRef.current.activePageId) || workspaceRef.current.pages[0];
        const sel = curPage ? curPage.objects.filter((o) => selectedIds.has(o.id)) : [];
        const txt = sel
          .map((o) => ('text' in o ? o.text : o.type === 'math' ? o.latex : o.name || ''))
          .filter(Boolean)
          .join('. ');
        void handleReadAloudQuick(txt);
        return;
      }
      setShowAI(true);
      setAiQuickIntent({
        section: action === 'math_solve' ? 'educate' : 'edit',
        sketchMode: action === 'sketch_shape' ? 'shape' : action === 'handwriting' ? 'handwriting' : undefined,
        autoRunMath: action === 'math_solve',
        nonce: Date.now(),
      });
    },
    [handleReadAloudQuick, selectedIds]
  );

  // File & Media Importer (Images, SVG, Audio, Video, PDF, PPTX, Attachments)
  const handleImportFiles = useCallback(
    async (files: FileList, dropX = 140, dropY = 120) => {
      const targetWsId = workspaceRef.current.id;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';

        if (ext === 'pptx' || ext === 'ppt') {
          const buf = await file.arrayBuffer();
          const reader = new FileReader();
          reader.onload = async () => {
            let fileMeta: AttachedFileMeta | undefined;
            try {
              const res = await fetch(apiUrl('/api/files/upload'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(hostKey ? { 'X-Host-Key': hostKey } : {}) },
                body: JSON.stringify({
                  workspaceId: targetWsId,
                  fileName: file.name,
                  mimeType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  base64Data: reader.result,
                }),
              });
              if (res.ok) {
                const data = await res.json();
                fileMeta = data.file;
              }
            } catch {
              // continue local PPTX parsing even if offline
            }
            try {
              const importedPages = await importPPTXToPages(buf, fileMeta?.fileId || uid('pptx'), file.name);
              setWorkspace((prev) => {
                const nextPages = [...prev.pages, ...importedPages];
                const nextDoc = {
                  ...prev,
                  pages: nextPages,
                  activePageId: importedPages[0]?.id || prev.activePageId,
                  attachedFiles: fileMeta
                    ? [fileMeta, ...prev.attachedFiles.filter((file) => file.fileId !== fileMeta.fileId)]
                    : prev.attachedFiles,
                  updatedAt: Date.now(),
                };
                workspaceRef.current = nextDoc;
                sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextDoc.activePageId });
                scheduleAutosave(nextDoc);
                return nextDoc;
              });
              setViewMode('presentation');
              showToast(`Imported ${importedPages.length} slides from ${file.name}`);
            } catch {
              showToast(`Could not parse ${file.name}. Ensure it is a valid .pptx presentation.`, 'error');
            }
          };
          reader.readAsDataURL(file);
          continue;
        }

        if (ext === 'pdf' || file.type === 'application/pdf') {
          try {
            const buf = await file.arrayBuffer();
            const rendered = await renderPDFToImages(buf, 2.4);
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const res = await fetch(apiUrl('/api/files/upload'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...((hostKey || workspaceRef.current.hostKey) ? { 'X-Host-Key': hostKey || workspaceRef.current.hostKey } : {}) },
                  body: JSON.stringify({
                    workspaceId: targetWsId,
                    fileName: file.name,
                    mimeType: 'application/pdf',
                    base64Data: reader.result,
                    extractedText: rendered.fullText,
                  }),
                });
                if (res.ok) {
                  const data = await res.json();
                  if (data.file) {
                    setWorkspace((prev) => {
                      const next = {
                        ...prev,
                        attachedFiles: [data.file, ...prev.attachedFiles.filter((file) => file.fileId !== data.file.fileId)],
                      };
                      workspaceRef.current = next;
                      return next;
                    });
                  }
                }
              } catch {
                showToast(`Uploaded PDF preview locally (${file.name}); cloud attachment sync skipped.`);
              }
            };
            reader.readAsDataURL(file);
            const firstPage = rendered.pages[0];
            if (firstPage) {
              handleCreateObject({
                id: uid('img'),
                name: `${file.name} (p.1)`,
                type: 'image',
                x: dropX + i * 30,
                y: dropY + i * 30,
                width: 420,
                height: Math.max(80, Math.round((420 * (firstPage.height || 595)) / (firstPage.width || 420))),
                rotation: 0,
                opacity: 1,
                locked: false,
                hidden: false,
                zIndex: activePage.objects.length + 1,
                src: firstPage.dataUrl,
                fileName: file.name,
                mask: 'none',
                filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
              });
            }
            showToast(`Loaded PDF "${file.name}" (${rendered.pageCount} pages). Open PDF Studio for full tools.`);
          } catch {
            showToast(`Could not render PDF "${file.name}". Ensure it is a valid, uncorrupted PDF.`, 'error');
          }
          continue;
        }

        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result);
          let uploadedUrl = dataUrl;
          try {
            const res = await fetch(apiUrl('/api/files/upload'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...((hostKey || workspaceRef.current.hostKey) ? { 'X-Host-Key': hostKey || workspaceRef.current.hostKey } : {}) },
              body: JSON.stringify({
                workspaceId: targetWsId,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                base64Data: dataUrl,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.file) {
                uploadedUrl = data.file.url;
                setWorkspace((prev) => {
                  const next = {
                    ...prev,
                    attachedFiles: [data.file, ...prev.attachedFiles.filter((file) => file.fileId !== data.file.fileId)],
                  };
                  workspaceRef.current = next;
                  return next;
                });
              }
            }
          } catch {
            // fallback to dataUrl if offline
          }

          if (file.type.startsWith('image/') || ext === 'svg') {
            handleCreateObject({
              id: uid('img'),
              name: file.name,
              type: 'image',
              x: dropX + i * 30,
              y: dropY + i * 30,
              width: 340,
              height: 240,
              rotation: 0,
              opacity: 1,
              locked: false,
              hidden: false,
              zIndex: activePage.objects.length + 1,
              src: uploadedUrl,
              fileName: file.name,
              mask: 'none',
              filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
            });
          } else {
            const mediaKind = file.type.startsWith('audio/')
              ? 'audio'
              : file.type.startsWith('video/')
                ? 'video'
                : 'file';
            handleCreateObject({
              id: uid('media'),
              name: file.name,
              type: 'media',
              mediaKind,
              x: dropX + i * 30,
              y: dropY + i * 30,
              width: mediaKind === 'video' ? 380 : 300,
              height: mediaKind === 'video' ? 240 : 100,
              rotation: 0,
              opacity: 1,
              locked: false,
              hidden: false,
              zIndex: activePage.objects.length + 1,
              src: uploadedUrl,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
            });
          }
        };
        reader.readAsDataURL(file);
      }
    },
    [activePage.objects.length, handleCreateObject, scheduleAutosave, sendWS, showToast]
  );

  // Zoom & Viewport Helpers
  const fitBoxInView = useCallback(
    (minX: number, minY: number, maxX: number, maxY: number, padding = 100, minZ = 0.2, maxZ = 2.0) => {
      const { vw, vh } = getCanvasMetrics();
      const z = Math.max(minZ, Math.min(maxZ, Math.min(vw / (maxX - minX + padding), vh / (maxY - minY + padding))));
      setRotationDeg(0);
      setZoom(z);
      setPanX(vw / 2 - ((minX + maxX) / 2) * z);
      setPanY(vh / 2 - ((minY + maxY) / 2) * z);
    },
    [getCanvasMetrics]
  );

  const fitToScreen = useCallback(() => {
    const objs = activePage.objects.filter((o) => !o.hidden);
    if (objs.length === 0) {
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setRotationDeg(0);
      return;
    }
    const bounds = computeSelectionBounds(objs);
    fitBoxInView(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height, 120, 0.2, 1.5);
  }, [activePage.objects, fitBoxInView]);

  const fitSelection = useCallback(() => {
    const objs = activePage.objects.filter((o) => selectedIds.has(o.id));
    if (objs.length === 0) return fitToScreen();
    const bounds = computeSelectionBounds(objs);
    fitBoxInView(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height, 100, 0.35, 2.5);
  }, [activePage.objects, fitBoxInView, fitToScreen, selectedIds]);

  const handlePresentFrame = useCallback(
    (frameObj: BoardObject) => {
      setSelectedIds(new Set());
      setHideTopBar(true);
      setRightPanelExpanded(false);
      fitBoxInView(frameObj.x, frameObj.y, frameObj.x + frameObj.width, frameObj.y + frameObj.height, 48, 0.25, 2.5);
      showToast(`Focused frame "${frameObj.name || 'Section'}" (Ctrl+\\ to restore bars)`);
    },
    [fitBoxInView, showToast]
  );

  const handleExportFrame = useCallback(
    async (frameObj: BoardObject) => {
      const fx1 = frameObj.x;
      const fy1 = frameObj.y;
      const fx2 = frameObj.x + frameObj.width;
      const fy2 = frameObj.y + frameObj.height;
      const insideIds = new Set(
        activePage.objects
          .filter((o) => {
            if (o.id === frameObj.id) return true;
            const cx = o.x + o.width / 2;
            const cy = o.y + o.height / 2;
            return cx >= fx1 && cx <= fx2 && cy >= fy1 && cy <= fy2;
          })
          .map((o) => o.id)
      );
      const dataUrl = await renderPageToHiResDataUrl(
        activePage,
        Math.max(120, Math.round(frameObj.width)),
        Math.max(120, Math.round(frameObj.height)),
        'image/png',
        0.95,
        {
          scaleMultiplier: 2,
          onlyObjectIds: insideIds,
          viewportBox: { minX: fx1, minY: fy1, contentW: frameObj.width, contentH: frameObj.height },
        }
      );
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${(frameObj.name || 'Frame').replace(/\s+/g, '_')}.png`;
      a.click();
      showToast(`Exported frame "${frameObj.name || 'Section'}" as PNG`);
    },
    [activePage, showToast]
  );

  const handleAutoLayoutDiagram = useCallback(
    (dir: 'LR' | 'TB' | 'radial' = 'TB') => {
      pushUndo(workspaceRef.current.pages);
      const laidOut = autoLayoutDiagram(
        activePage.objects,
        selectedIds,
        viewportCenter.x,
        viewportCenter.y,
        dir,
        lockedLayerIds
      );
      handleUpdatePage(activePage.id, { objects: laidOut });
      showToast(`Auto-layout (${dir === 'LR' ? 'L→R' : dir === 'TB' ? 'T→B' : 'Radial'}) applied`);
    },
    [activePage.id, activePage.objects, handleUpdatePage, lockedLayerIds, pushUndo, selectedIds, showToast, viewportCenter.x, viewportCenter.y]
  );

  // Board Find & Replace matches
  const findMatches = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return [];
    const richBlocksContain = (blocks: { type: string; runs?: { text: string }[] }[] | undefined, query: string): boolean =>
      !!blocks?.some((b) => b.type === 'paragraph' && b.runs?.some((r) => r.text.toLowerCase().includes(query)));
    return activePage.objects.filter((o) => {
      if (o.hidden) return false;
      if (o.type === 'text' || o.type === 'sticky') {
        if ((o.text || '').toLowerCase().includes(q)) return true;
        return richBlocksContain((o as { richBlocks?: { type: string; runs?: { text: string }[] }[] }).richBlocks, q);
      }
      if (o.type === 'shape') {
        return (o.text || '').toLowerCase().includes(q);
      }
      if (o.type === 'table') {
        return o.cells.some((row) => row.some((c) => c.toLowerCase().includes(q)));
      }
      return false;
    });
  }, [activePage.objects, findQuery]);

  const jumpToFindMatch = useCallback(
    (idx: number) => {
      if (findMatches.length === 0) return;
      const safeIdx = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
      setFindMatchIdx(safeIdx);
      const target = findMatches[safeIdx];
      setSelectedIds(new Set([target.id]));
      fitBoxInView(target.x, target.y, target.x + target.width, target.y + target.height, 260, 0.4, 1.4);
    },
    [findMatches, fitBoxInView]
  );

  const handleReplaceInBoard = useCallback(
    (replaceAll: boolean) => {
      const q = findQuery.trim();
      if (!q || findMatches.length === 0 || !canEdit) return;
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const targets = replaceAll ? findMatches : [findMatches[((findMatchIdx % findMatches.length) + findMatches.length) % findMatches.length]];
      const patches: (Partial<BoardObject> & { id: string })[] = [];
      for (const obj of targets) {
        if (obj.locked || (obj.layerId && lockedLayerIds.has(obj.layerId))) continue;
        if (obj.type === 'text' || obj.type === 'sticky' || obj.type === 'shape') {
          const patch: Partial<BoardObject> & { id: string } = { id: obj.id, text: (obj.text || '').replace(regex, replaceQuery) };
          if ((obj.type === 'text' || obj.type === 'sticky') && (obj as { richBlocks?: unknown[] }).richBlocks) {
            const rb = (obj as { richBlocks: { type: string; runs?: { text: string; [k: string]: unknown }[]; [k: string]: unknown }[] }).richBlocks;
            (patch as Record<string, unknown>).richBlocks = rb.map((b) =>
              b.type === 'paragraph' && b.runs
                ? { ...b, runs: b.runs.map((r) => ({ ...r, text: r.text.replace(regex, replaceQuery) })) }
                : b
            );
          }
          patches.push(patch);
        } else if (obj.type === 'table') {
          patches.push({
            id: obj.id,
            cells: obj.cells.map((row) => row.map((cell) => cell.replace(regex, replaceQuery))),
          });
        }
      }
      if (patches.length > 0) {
        handleBatchPatchObjects(patches);
        showToast(`Replaced in ${patches.length} item${patches.length > 1 ? 's' : ''}`);
      }
    },
    [canEdit, findMatchIdx, findMatches, findQuery, handleBatchPatchObjects, lockedLayerIds, replaceQuery, showToast]
  );

  // Global Keyboard Shortcuts & Clipboard Paste
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isUiControl = Boolean(target?.closest('button, select, [role="dialog"], [role="menu"], [role="tablist"]'));
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest?.('[contenteditable="true"]'))
      ) {
        if (e.key === 'Escape' && showFindReplace) {
          setShowFindReplace(false);
        }
        return;
      }
      if (isUiControl && !e.ctrlKey && !e.metaKey && e.key !== 'Escape') return;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFindReplace((v) => !v);
        return;
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        setHideTopBar((v) => !v);
        return;
      }
      if (mod && e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopyStyle();
        return;
      }
      if (mod && e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePasteStyle();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (viewMode === 'presentation' && selectedIds.size === 0) {
          handleDuplicatePage(activePage.id);
        } else {
          handleDuplicateSelected();
        }
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'm' && viewMode === 'presentation') {
        e.preventDefault();
        const theme = detectThemeForPage(activePage);
        handleAddPage({
          id: uid('page'),
          name: `Slide ${workspaceRef.current.pages.length + 1}`,
          objects: buildLayoutObjects('title_content', theme),
          layers: [{ id: 'layer-default', name: 'Slide Layer', visible: true, locked: false }],
          guides: [],
          background: theme.bg,
          slideGradient: theme.gradient,
          slideLayout: 'title_content',
          gridType: 'none',
          gridSize: 28,
          transition: activePage.transition || 'fade',
          slideDurationSec: 0,
        });
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveWorkspaceNow(workspaceRef.current);
        showToast('Workspace saved');
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(
          new Set(
            activePage.objects
              .filter((o) => !o.hidden && !o.locked && (!o.layerId || !lockedLayerIds.has(o.layerId)))
              .map((o) => o.id)
          )
        );
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        const sel = activePage.objects.filter((o) => selectedIds.has(o.id));
        if (sel.length > 0) {
          setClipboardObjs(structuredClone(sel));
          pasteCountRef.current = 0;
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'x') {
        const sel = activePage.objects.filter(
          (o) => selectedIds.has(o.id) && !o.locked && (!o.layerId || !lockedLayerIds.has(o.layerId))
        );
        if (sel.length > 0) {
          setClipboardObjs(structuredClone(sel));
          pasteCountRef.current = 0;
          handleDeleteObjects(sel.map((s) => s.id));
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        if (clipboardObjs.length > 0) {
          const bounds = computeSelectionBounds(clipboardObjs);
          const groupCx = bounds.x + bounds.width / 2;
          const groupCy = bounds.y + bounds.height / 2;
          const stagger = (pasteCountRef.current % 5) * 24;
          pasteCountRef.current += 1;
          const pasteCenter = viewMode === 'presentation' ? { x: 640, y: 360 } : viewportCenter;
          const offsetX = Math.round(pasteCenter.x - groupCx + stagger);
          const offsetY = Math.round(pasteCenter.y - groupCy + stagger);
          const idMap = new Map<string, string>();
          const groupMap = new Map<string, string>();
          const clones = clipboardObjs.map((o, i) => {
            const nextId = uid(o.type);
            idMap.set(o.id, nextId);
            let nextGroupId = o.groupId;
            if (o.groupId) {
              if (!groupMap.has(o.groupId)) groupMap.set(o.groupId, uid('grp'));
              nextGroupId = groupMap.get(o.groupId);
            }
            return {
              ...structuredClone(o),
              id: nextId,
              groupId: nextGroupId,
              x: o.x + offsetX,
              y: o.y + offsetY,
              zIndex: activePage.objects.length + i + 1,
            };
          });
          const remapped = clones.map((c) => {
            if (c.type === 'connector') {
              return {
                ...c,
                fromId: c.fromId && idMap.has(c.fromId) ? idMap.get(c.fromId) : c.fromId,
                toId: c.toId && idMap.has(c.toId) ? idMap.get(c.toId) : c.toId,
                x1: c.x1 + offsetX,
                y1: c.y1 + offsetY,
                x2: c.x2 + offsetX,
                y2: c.y2 + offsetY,
                ...(c.waypoints ? { waypoints: c.waypoints.map((wp) => ({ x: wp.x + offsetX, y: wp.y + offsetY })) } : {}),
              };
            }
            if (c.type === 'stroke') {
              return {
                ...c,
                points: c.points.map((pt) => ({ ...pt, x: pt.x + offsetX, y: pt.y + offsetY })),
              };
            }
            if (c.type === 'line') {
              return {
                ...c,
                points: c.points.map((pt) => ({ ...pt, x: pt.x + offsetX, y: pt.y + offsetY })),
                ...(typeof c.cpX === 'number' ? { cpX: c.cpX + offsetX } : {}),
                ...(typeof c.cpY === 'number' ? { cpY: c.cpY + offsetY } : {}),
              };
            }
            return c;
          }) as BoardObject[];
          handleInsertMultipleObjects(remapped, 'append');
          setSelectedIds(new Set(remapped.map((c) => c.id)));
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) handleUngroupSelected();
        else handleGroupSelected();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size > 0) {
          e.preventDefault();
          const deletable = activePage.objects
            .filter((o) => selectedIds.has(o.id) && !o.locked && (!o.layerId || !lockedLayerIds.has(o.layerId)))
            .map((o) => o.id);
          if (deletable.length > 0) handleDeleteObjects(deletable);
        }
        return;
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setMultiSelectMode(false);
        setShowFindReplace(false);
        closeAllToolMenus();
        return;
      }
      if (viewMode !== 'presentation' && !mod && e.shiftKey && (e.key === '!' || e.key === '1')) {
        e.preventDefault();
        fitToScreen();
        return;
      }
      if (viewMode !== 'presentation' && !mod && e.shiftKey && (e.key === ')' || e.key === '0')) {
        e.preventDefault();
        setZoom(1);
        setPanX(0);
        setPanY(0);
        setRotationDeg(0);
        return;
      }
      // Arrow key nudging (1px or 10px with Shift)
      if (
        !mod &&
        selectedIds.size > 0 &&
        canEdit &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const cur = workspaceRef.current;
        if (!e.repeat) pushUndo(cur.pages);
        const curPage = cur.pages.find((p) => p.id === cur.activePageId) || cur.pages[0];
        if (!curPage) return;
        const nextObjs = syncConnectorBounds(
          curPage.objects.map((o) => {
            if (!selectedIds.has(o.id) || o.locked || (o.layerId && lockedLayerIds.has(o.layerId))) return o;
            if (o.type === 'stroke') {
              return {
                ...o,
                x: o.x + dx,
                y: o.y + dy,
                points: o.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })),
              };
            }
            if (o.type === 'line') {
              return {
                ...o,
                x: o.x + dx,
                y: o.y + dy,
                cpX: typeof o.cpX === 'number' ? o.cpX + dx : o.cpX,
                cpY: typeof o.cpY === 'number' ? o.cpY + dy : o.cpY,
                points: o.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
              };
            }
            if (o.type === 'connector') {
              return {
                ...o,
                x: o.x + dx,
                y: o.y + dy,
                x1: o.fromId ? o.x1 : o.x1 + dx,
                y1: o.fromId ? o.y1 : o.y1 + dy,
                x2: o.toId ? o.x2 : o.x2 + dx,
                y2: o.toId ? o.y2 : o.y2 + dy,
              };
            }
            return { ...o, x: o.x + dx, y: o.y + dy };
          })
        );
        handleUpdatePage(curPage.id, { objects: nextObjs });
        return;
      }

      if (viewMode !== 'presentation') {
        if (e.key === '=' || e.key === '+') setZoom((z) => Math.min(4.5, z + 0.1));
        if (e.key === '-') setZoom((z) => Math.max(0.15, z - 0.1));

        // Single-letter tool shortcuts (always clear right-panel submenus & respect eraserMode)
        if (!mod && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'v') selectLeftTool('select');
          else if (k === 'h') selectLeftTool('hand');
          else if (k === 'p') selectLeftTool('pen');
          else if (k === 'b') selectLeftTool('brush');
          else if (k === 'm') selectLeftTool('marker');
          else if (k === 'k') selectLeftTool('highlighter');
          else if (k === 'q') selectLeftTool('laser');
          else if (k === 'e') {
            selectLeftTool(
              eraserMode === 'area' ? 'eraser_area' : eraserMode === 'object' ? 'eraser_object' : 'eraser_stroke'
            );
          } else if (k === 't') selectLeftTool('text');
          else if (k === 's') selectLeftTool('sticky');
          else if (k === 'r') {
            if (activeShapeKind === 'frame') setActiveShapeKind('rounded_rect');
            selectLeftTool('shape');
          } else if (k === 'f') {
            setActiveShapeKind('frame');
            selectLeftTool('shape');
          } else if (k === 'l') selectLeftTool('line');
          else if (k === 'c') selectLeftTool('connector');
        }
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest?.('[contenteditable="true"]'))
      ) {
        return;
      }
      const pasteCenter = viewMode === 'presentation' ? { x: 640, y: 360 } : viewportCenter;
      if (e.clipboardData?.files?.length) {
        handleImportFiles(e.clipboardData.files, pasteCenter.x - 160, pasteCenter.y - 120);
        return;
      }
      const txt = e.clipboardData?.getData('text/plain')?.trim();
      if (!txt || clipboardObjs.length > 0) return;
      if (txt.startsWith('<svg') && txt.includes('</svg>')) {
        const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(txt)}`;
        handleCreateObject({
          id: uid('img'),
          name: 'Pasted SVG',
          type: 'image',
          x: Math.round(pasteCenter.x - 140),
          y: Math.round(pasteCenter.y - 100),
          width: 280,
          height: 200,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: activePage.objects.length + 1,
          src: dataUrl,
          fileName: 'pasted.svg',
          mask: 'none',
          filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
        });
        showToast('Pasted SVG onto board');
      } else {
        const lines = txt.split('\n');
        const boxW = Math.min(460, Math.max(200, Math.max(...lines.map((l) => l.length)) * 10 + 36));
        const boxH = Math.min(360, Math.max(54, lines.length * 26 + 24));
        const textObj: TextObject = {
          id: uid('text'),
          name: txt.slice(0, 24),
          type: 'text',
          x: Math.round(pasteCenter.x - boxW / 2),
          y: Math.round(pasteCenter.y - boxH / 2),
          width: boxW,
          height: boxH,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: activePage.objects.length + 1,
          text: txt,
          textColor: strokeColor === '#FFFFFF' ? '#0F172A' : strokeColor,
          bgColor: 'transparent',
          fontFamily: textDefaults.fontFamily,
          fontSize: textDefaults.fontSize,
          fontWeight: textDefaults.fontWeight,
          fontStyle: textDefaults.fontStyle,
          underline: textDefaults.underline,
          textAlign: textDefaults.textAlign,
        };
        handleCreateObject(textObj);
        setSelectedIds(new Set([textObj.id]));
        showToast('Pasted text onto board');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [
    activePage.objects,
    activeShapeKind,
    canEdit,
    clipboardObjs,
    closeAllToolMenus,
    eraserMode,
    fitToScreen,
    handleCopyStyle,
    handleCreateObject,
    handleDeleteObjects,
    handleDuplicateSelected,
    handleGroupSelected,
    handleImportFiles,
    handleInsertMultipleObjects,
    handlePasteStyle,
    handleRedo,
    handleUndo,
    handleUngroupSelected,
    handleUpdatePage,
    lockedLayerIds,
    pushUndo,
    saveWorkspaceNow,
    selectLeftTool,
    selectedIds,
    showFindReplace,
    showToast,
    strokeColor,
    textDefaults.fontFamily,
    textDefaults.fontSize,
    textDefaults.fontStyle,
    textDefaults.fontWeight,
    textDefaults.textAlign,
    textDefaults.underline,
    viewMode,
    viewportCenter.x,
    viewportCenter.y,
  ]);

  const activePageIdx = Math.max(0, workspace.pages.findIndex((p) => p.id === activePage.id));
  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const showQuickToolStyleBar = viewMode === 'board' && showClassTimer;

  return (
    <div className="h-[100dvh] w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <React.Suspense fallback={<div className="flex-1 grid place-items-center text-sm text-slate-500">Loading workspace…</div>}>
      {hideTopBar && viewMode !== 'board' && viewMode !== 'presentation' && viewMode !== 'pdf' && !fullscreenPresenting && (
        <button
          onClick={() => setHideTopBar(false)}
          title="Show Top Bar (Ctrl+\)"
          aria-label="Show Top Bar"
          className="fixed top-1.5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200"
        >
          <PanelTopOpen className="w-3.5 h-3.5" />
          <span>Show Top Bar</span>
        </button>
      )}

      {/* TOP TOOLBAR */}
      {!hideTopBar && (
        <header className={`h-12 shrink-0 px-2 sm:px-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-200/40 dark:border-slate-800/40 flex items-center justify-between gap-1 sm:gap-3 ${showMobileActionsMenu ? 'z-40' : 'z-30'} relative overflow-visible`}>
        {/* Left: Brand, Workspaces, Name, Save Status */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink-0 sm:shrink">
          <button
            onClick={() => setHubModal({ open: true, tab: 'workspaces' })}
            className="flex items-center gap-1.5 p-1 sm:px-2 sm:py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            title="Workspaces & Folders"
          >
            <img src="/icon.svg" alt="LuminaBoard" className="w-5 h-5 sm:w-6 sm:h-6 rounded" />
            <span className="font-display font-bold text-sm tracking-tight hidden whitespace-nowrap">
              {t.appName}
            </span>
          </button>

          <input
            value={workspace.name}
            onChange={(e) => {
              const next = { ...workspace, name: e.target.value, updatedAt: Date.now() };
              workspaceRef.current = next;
              setWorkspace(next);
              scheduleAutosave(next);
            }}
            aria-label="Workspace name"
            className="hidden sm:block w-32 md:w-44 px-2 py-1 text-xs font-semibold bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-950 rounded border border-transparent focus:border-blue-600 focus:outline-none truncate"
          />

        </div>

        {/* Center: Mode Switcher + Undo/Redo/Zoom */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/80 p-0.5 rounded-lg">
            {[
              { id: 'board', label: t.boardMode },
              { id: 'presentation', label: t.slidesMode },
              { id: 'pdf', label: t.pdfMode },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id as WorkspaceViewMode)}
                title={m.label}
                className={`px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                  viewMode === m.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              saveWorkspaceNow(workspace);
              showToast('Workspace saved');
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 shrink-0"
            title="Manual Save (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
          </button>

          {viewMode === 'board' && (
            <div className="hidden sm:flex items-center gap-0.5 sm:ml-1">
              <button
                disabled={undoStack.length === 0}
                onClick={handleUndo}
                title={`${t.undo} (Ctrl+Z)`}
                className="p-1 sm:p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 text-slate-700 dark:text-slate-200"
              >
                <Undo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                title={`${t.redo} (Ctrl+Shift+Z)`}
                className="p-1 sm:p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 text-slate-700 dark:text-slate-200"
              >
                <Redo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions + Mobile Overflow Menu */}
        <div className="flex items-center gap-0.5 shrink-0">

          {/* --- Tool group (lg+) --- */}
          <div className="hidden lg:flex items-center gap-0.5">
            {viewMode === 'board' && (
              <button
                onClick={() => setShowFindReplace((v) => !v)}
                title="Find & Replace (Ctrl+F)"
                className={`p-2 rounded-lg transition-colors shrink-0 ${
                  showFindReplace
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowCommandPalette(true)}
              title={`${t.commandPalette} (Ctrl+K)`}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0"
            >
              <Command className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowClassTimer((v) => !v)}
              title="Classroom Timer"
              className={`p-2 rounded-lg transition-colors shrink-0 ${
                showClassTimer || timerRunning
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Timer className="w-4 h-4" />
            </button>
            {timerRunning && <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 -ml-1 mr-0.5">{formatTimer(timerSec)}</span>}
          </div>

          {/* divider */}
          <div className="hidden lg:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* --- Collaborate group --- */}
          <div className="flex items-center gap-0.5">
            {(classroom.raisedHands?.length || 0) > 0 && (
              <button
                onClick={() => setShowClassroomModal(true)}
                title="Raised Hands"
                className="hidden sm:flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-500 text-white shadow-sm animate-pulse shrink-0"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>{classroom.raisedHands?.length}</span>
              </button>
            )}
            <button
              onClick={() => setShowMobileConnect(true)}
              title="Mobile QR Connect"
              className={`${
                broadcastViewport || followRemoteViewport ? 'flex' : 'hidden lg:flex'
              } p-2 rounded-lg transition-colors shrink-0 ${
                broadcastViewport || followRemoteViewport
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <QrCode className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowClassroomModal(true)}
              title={t.share}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                classroom.active
                  ? 'bg-emerald-600 text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="font-mono text-[10px] sm:text-[11px]">({presence.length})</span>
            </button>
          </div>

          {/* divider */}
          <div className="hidden lg:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* --- Actions group (lg+) --- */}
          <div className="hidden lg:flex items-center gap-0.5">
            <button
              onClick={() => setShowExportImport(true)}
              title={t.exportImport}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setViewMode('presentation');
                setFullscreenPresenting(true);
              }}
              title={t.present}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0"
            >
              <Presentation className="w-4 h-4" />
            </button>
          </div>

          {/* divider */}
          <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* --- Primary: AI Assistant --- */}
          <button
            onClick={() => setShowAI((v) => !v)}
            title={t.aiAssistant}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
              showAI ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.aiAssistant}</span>
          </button>

          {/* --- Utility icons (lg+) --- */}
          <div className="hidden lg:flex items-center gap-0.5 ml-0.5">
            <button
              onClick={() => setShowSettings(true)}
              title={t.settings}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
            >
              <Settings className="w-4 h-4" />
            </button>
            {viewMode === 'board' && (
              <button
                onClick={() => setShowRightPanel((v) => !v)}
                title="Properties & Layers"
                className={`p-2 rounded-lg transition-colors shrink-0 ${
                  showRightPanel
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                <PanelRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setHideTopBar(true)}
              title="Hide Top Bar (Ctrl+\)"
              aria-label="Hide Top Bar"
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0"
            >
              <PanelTopClose className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Overflow Actions Menu */}
          <div className="relative lg:hidden shrink-0">
            <button
              onClick={() => {
                setShowMobileActionsMenu((v) => !v);
                setConfirmClearPage(false);
              }}
              aria-label="More actions"
              title="More actions"
              className="inline-flex min-w-9 min-h-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMobileActionsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMobileActionsMenu(false)} />
                <div className="fixed lg:hidden right-2 top-12 w-60 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-64px)] overflow-y-auto scrollbar-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 space-y-0.5 text-xs">
                  <div className="px-2 py-1.5 border-b border-slate-200 dark:border-slate-800 mb-1">
                    <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Board Name</label>
                    <input
                      value={workspace.name}
                      onChange={(e) => {
                        const next = { ...workspace, name: e.target.value, updatedAt: Date.now() };
                        workspaceRef.current = next;
                        setWorkspace(next);
                        scheduleAutosave(next);
                      }}
                      className="w-full px-2 py-1 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  {viewMode === 'board' && (
                    <div className="grid grid-cols-2 gap-1 sm:hidden">
                      <button
                        disabled={undoStack.length === 0}
                        onClick={() => {
                          setShowMobileActionsMenu(false);
                          handleUndo();
                        }}
                        className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> {t.undo}
                      </button>
                      <button
                        disabled={redoStack.length === 0}
                        onClick={() => {
                          setShowMobileActionsMenu(false);
                          handleRedo();
                        }}
                        className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Redo2 className="w-3.5 h-3.5" /> {t.redo}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setShowMobileActionsMenu(false);
                      setShowMobileConnect(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                  >
                    <QrCode className="w-3.5 h-3.5 text-blue-600" /> 1-Tap Mobile QR Connect
                  </button>
                  {viewMode === 'board' && (
                    <>
                      <button
                        onClick={() => {
                          setShowMobileActionsMenu(false);
                          setShowFindReplace((v) => !v);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                      >
                        <Search className="w-3.5 h-3.5 text-blue-600" /> Find &amp; Replace
                      </button>
                      <button
                        onClick={() => {
                          setShowMobileActionsMenu(false);
                          setShowRightPanel((v) => !v);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" /> Tool Style &amp; Properties
                      </button>
                      <button
                        onClick={() => {
                          setShowMobileActionsMenu(false);
                          setRotationDeg((r) => (r + 90) % 360);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                      >
                        <span className="flex items-center gap-2.5">
                          <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Rotate Canvas 90°
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">{rotationDeg}°</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setShowMobileActionsMenu(false);
                      setShowCommandPalette(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                  >
                    <Command className="w-3.5 h-3.5 text-blue-600" /> Command Palette
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileActionsMenu(false);
                      saveWorkspaceNow(workspace);
                      showToast('Workspace saved');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <Save className="w-3.5 h-3.5 text-emerald-600" /> Save Board
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {saveState === 'saving' ? t.saveSaving : saveState === 'offline' ? 'Offline' : 'Saved'}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileActionsMenu(false);
                      setShowClassTimer((v) => !v);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <Timer className="w-3.5 h-3.5 text-amber-600" /> Class Timer
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">{formatTimer(timerSec)}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileActionsMenu(false);
                      setShowExportImport(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" /> {t.exportImport}
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileActionsMenu(false);
                      setViewMode('presentation');
                      setFullscreenPresenting(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                  >
                    <Presentation className="w-3.5 h-3.5 text-slate-500" /> {t.present}
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileActionsMenu(false);
                      setShowSettings(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-500" /> {t.settings}
                  </button>
                  <button
                    onClick={() => {
                      setShowMobileActionsMenu(false);
                      setHideTopBar(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                  >
                    <PanelTopClose className="w-3.5 h-3.5 text-slate-500" /> Hide Top Bar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        </header>
      )}

      {/* Live Mobile Camera / Viewport Sync Bar when active */}
      {(broadcastViewport ||
        followRemoteViewport ||
        (remoteViewportSender && Date.now() - remoteViewportSender.ts < 12_000)) && (
        <div className="px-3 sm:px-4 py-1 bg-blue-50 dark:bg-blue-950/60 border-b border-blue-200 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-200 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 truncate font-medium">
            {broadcastViewport ? (
              <>
                <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse shrink-0" />
                <span>Broadcasting this device&apos;s view &amp; pages live</span>
              </>
            ) : followRemoteViewport ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  Mirroring {remoteViewportSender?.userName || 'Mobile'}&apos;s camera &amp; pages live
                </span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  {remoteViewportSender?.userName || 'Mobile'} is broadcasting live view
                </span>
              </>
            )}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {broadcastViewport && (
              <button
                onClick={() => setBroadcastViewport(false)}
                className="px-2 py-0.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
              >
                Stop Broadcast
              </button>
            )}
            {followRemoteViewport ? (
              <button
                onClick={() => setFollowRemoteViewport(false)}
                className="px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
              >
                Pause Mirror
              </button>
            ) : (
              !broadcastViewport &&
              remoteViewportSender && (
                <>
                  <button
                    onClick={() => setFollowRemoteViewport(true)}
                    className="px-2 py-0.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
                  >
                    Mirror Mobile View
                  </button>
                  <button
                    onClick={() => setRemoteViewportSender(null)}
                    className="px-1.5 py-0.5 rounded hover:bg-blue-200/60 dark:hover:bg-blue-900"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* Permission / Classroom Live Banner if locked */}
      {!canEdit && (
        <div className="px-3 sm:px-4 py-1.5 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span className="truncate">
            View-Only Mode ({workspace.collaborationMode.replace('_', ' ')}). Pan, zoom, and use Q&amp;A/Polls in Classroom Mode.
          </span>
          <button onClick={() => setShowClassroomModal(true)} className="font-semibold underline shrink-0">
            Classroom
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE BODY */}
      {viewMode === 'presentation' ? (
        <PresentationStudio
          pages={workspace.pages}
          activePageId={activePage.id}
          workspaceName={workspace.name}
          attachedFiles={workspace.attachedFiles}
          fullscreenPresenting={fullscreenPresenting}
          canEdit={canEdit}
          selectedIds={selectedIds}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          isDarkApp={darkMode}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onReorderZ={handleReorderZ}
          onDuplicateSelected={handleDuplicateSelected}
          onSelectIds={setSelectedIds}
          onExitFullscreen={() => setFullscreenPresenting(false)}
          onStartFullscreen={() => setFullscreenPresenting(true)}
          onSelectPage={handleSelectPage}
          onUpdatePage={handleUpdatePage}
          onAddSlide={() => handleAddPage()}
          onAddSlideWithLayout={(layoutId: SlideLayoutId, theme: SlideThemePreset) => {
            handleAddPage({
              id: uid('page'),
              name: `Slide ${workspace.pages.length + 1}`,
              objects: buildLayoutObjects(layoutId, theme),
              layers: [{ id: 'layer-default', name: 'Slide Layer', visible: true, locked: false }],
              guides: [],
              background: theme.bg,
              slideGradient: theme.gradient,
              slideLayout: layoutId,
              gridType: 'none',
              gridSize: 28,
              transition: 'fade',
              slideDurationSec: 0,
            });
          }}
          onDuplicateSlide={handleDuplicatePage}
          onDeleteSlide={handleDeletePage}
          onReorderSlide={handleReorderPage}
          onMoveSlide={(fromIdx: number, toIdx: number) => {
            const cur = workspaceRef.current;
            if (fromIdx < 0 || toIdx < 0 || fromIdx >= cur.pages.length || toIdx >= cur.pages.length || fromIdx === toIdx) return;
            pushUndo(cur.pages);
            const nextPages = [...cur.pages];
            const [moved] = nextPages.splice(fromIdx, 1);
            nextPages.splice(toIdx, 0, moved);
            const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
            workspaceRef.current = nextDoc;
            setWorkspace(nextDoc);
            sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextDoc.activePageId });
            scheduleAutosave(nextDoc);
          }}
          onApplyThemeToAll={(theme: SlideThemePreset) => {
            const cur = workspaceRef.current;
            pushUndo(cur.pages);
            const nextPages = cur.pages.map((p) => ({
              ...p,
              background: theme.bg,
              slideGradient: theme.gradient,
              objects: adaptObjectsToTheme(p.objects, theme),
            }));
            const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
            workspaceRef.current = nextDoc;
            setWorkspace(nextDoc);
            sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextDoc.activePageId });
            scheduleAutosave(nextDoc);
            showToast(`Applied "${theme.name}" theme to all ${nextPages.length} slides`);
          }}
          onApplyTransitionToAll={(transition) => {
            const cur = workspaceRef.current;
            pushUndo(cur.pages);
            const nextPages = cur.pages.map((p) => ({ ...p, transition }));
            const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
            workspaceRef.current = nextDoc;
            setWorkspace(nextDoc);
            sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextDoc.activePageId });
            scheduleAutosave(nextDoc);
            showToast(`Applied "${transition || 'none'}" transition to all slides`);
          }}
          onApplySlideNumbers={(footerText, includeNumbers, removeOnly) => {
            const cur = workspaceRef.current;
            pushUndo(cur.pages);
            const nextPages = cur.pages.map((p, idx) => {
              const cleaned = p.objects.filter(
                (o) => o.name !== '__slide_footer__' && o.name !== '__slide_number__'
              );
              if (removeOnly) return { ...p, objects: cleaned };
              const theme = detectThemeForPage(p);
              const added = buildSlideNumberObject(idx, cur.pages.length, footerText, theme).filter((o) =>
                o.name === '__slide_number__' ? includeNumbers : true
              );
              return { ...p, objects: [...cleaned, ...added] };
            });
            const nextDoc = { ...cur, pages: nextPages, updatedAt: Date.now() };
            workspaceRef.current = nextDoc;
            setWorkspace(nextDoc);
            sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextDoc.activePageId });
            scheduleAutosave(nextDoc);
            showToast(removeOnly ? 'Removed slide numbers & footers' : `Updated numbers & footer across ${nextPages.length} slides`);
          }}
          onOpenAISlides={() => {
            setAiQuickIntent({ section: 'generate', genType: 'presentation', nonce: Date.now() });
            setShowAI(true);
          }}
          onOpenMathOrGraph={(tab, existingObj) => {
            setMathModalTab(tab);
            setEditingMathGraphObj(existingObj || null);
            setShowMathModal(true);
          }}
          onQuickAIAction={handleQuickAIAction}
          onImportPPTXFile={(file) => {
            const dt = new DataTransfer();
            dt.items.add(file);
            handleImportFiles(dt.files);
          }}
          onInsertObjectOnSlide={handleCreateObject}
          onUpdateObject={handleUpdateObject}
          onDeleteObjects={handleDeleteObjects}
          onSnapshotUndo={snapshotUndo}
          onSyncPageState={syncPageState}
          onReplacePageObjects={replacePageObjects}
          hideTopBar={hideTopBar}
          onShowTopBar={() => setHideTopBar(false)}
        />
      ) : viewMode === 'pdf' ? (
        <PDFStudio
          workspaceId={workspace.id}
          hostKey={hostKey || workspace.hostKey || ''}
          locale={locale}
          attachedFiles={workspace.attachedFiles}
          savedAnnotationsByFile={workspace.pdfAnnotations}
          remoteView={followRemoteViewport ? remotePdfView : null}
          onSyncView={handleSyncPdfView}
          hideTopBar={hideTopBar}
          onShowTopBar={() => setHideTopBar(false)}
          onSyncAnnotations={handleSyncPdfAnnotations}
          onDeleteFiles={async (fileIds) => {
            const response = await fetch(apiUrl('/api/files/delete'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...((hostKey || workspace.hostKey) ? { 'X-Host-Key': hostKey || workspace.hostKey || '' } : {}),
              },
              body: JSON.stringify({ workspaceId: workspace.id, fileIds }),
            });
            const data = (await response.json()) as { removedFileIds?: string[]; error?: string };
            if (!response.ok) throw new Error(data.error || 'Could not remove the selected PDFs.');
            const removedFileIds = new Set(data.removedFileIds || fileIds);
            setWorkspace((prev) => {
              const pdfAnnotations = { ...(prev.pdfAnnotations || {}) };
              removedFileIds.forEach((fileId) => delete pdfAnnotations[fileId]);
              const next = {
                ...prev,
                attachedFiles: prev.attachedFiles.filter((file) => !removedFileIds.has(file.fileId)),
                pdfAnnotations,
                updatedAt: Date.now(),
              };
              workspaceRef.current = next;
              return next;
            });
          }}
          onUploadFileMeta={(meta) =>
            setWorkspace((prev) => {
              const next = {
                ...prev,
                attachedFiles: [meta, ...prev.attachedFiles.filter((file) => file.fileId !== meta.fileId)],
              };
              workspaceRef.current = next;
              return next;
            })
          }
          onUpdateFileMeta={(meta) =>
            setWorkspace((prev) => {
              const next = {
                ...prev,
                attachedFiles: prev.attachedFiles.map((f) => (f.fileId === meta.fileId ? meta : f)),
              };
              workspaceRef.current = next;
              return next;
            })
          }
          onAskAIWithPage={(promptText, pageText) => {
            setShowAI(true);
            setAiQuickIntent({
              section: 'educate',
              autoRunEducate: true,
              customPrompt: promptText,
              customContextText: pageText,
              nonce: Date.now(),
            });
          }}
          onReadAloudText={(txt, onWordChange) => {
            void handleReadAloudQuick(txt, onWordChange);
          }}
          onStopReadAloudText={stopReadAloudQuick}
          onSendPageToBoard={(dataUrl, title, pw, ph) => {
            const targetW = 540;
            const targetH = pw && ph ? Math.round((targetW * ph) / pw) : 700;
            handleCreateObject({
              id: uid('img'),
              name: title,
              type: 'image',
              x: Math.round(viewportCenter.x - targetW / 2),
              y: Math.round(viewportCenter.y - targetH / 2),
              width: targetW,
              height: targetH,
              rotation: 0,
              opacity: 1,
              locked: false,
              hidden: false,
              zIndex: activePage.objects.length + 1,
              src: dataUrl,
              fileName: title,
              mask: 'none',
              filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
            });
            setViewMode('board');
            showToast(`Placed ${title} onto SmartBoard`);
          }}
        />
      ) : (
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
          {/* LEFT TOOL RAIL (Tablet & Desktop vertical) */}
          <aside className="hidden md:flex w-12 shrink-0 bg-white/95 dark:bg-slate-900/95 glass-chrome border-r border-slate-200 dark:border-slate-800 flex-col items-center py-1.5 gap-0.5 overflow-y-auto overflow-x-hidden rail-scroll z-20">
            <input
              ref={mediaUploadRef}
              type="file"
              multiple
              accept="image/*,audio/*,video/*,.pdf,.pptx,.svg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleImportFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <button
              title={
                toolLocked
                  ? 'Tool Lock ON: tool stays active after placing any item (Click to unlock)'
                  : 'Tool Lock OFF: returns to Select after placing shapes, frames, lines, tables & text (Click to lock)'
              }
              onClick={() => setToolLocked((v) => !v)}
              className={`w-9 h-6 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                toolLocked
                  ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {toolLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-0.5 shrink-0" />

            {/* Group 1: Selection, Lasso & Navigation */}
            {[
              { id: 'select', icon: MousePointer2, label: `${t.select} (V)` },
              { id: 'lasso', icon: Lasso, label: 'Lasso Freehand Select' },
              { id: 'hand', icon: Hand, label: `${t.hand} (H)` },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  aria-label={item.label}
                  aria-pressed={activeTool === item.id}
                  title={item.label}
                  onClick={() => {
                    selectLeftTool(item.id as ToolType);
                    closeAllToolMenus();
                  }}
                  className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                    activeTool === item.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}

            {activeTool === 'select' && (
              <button
                aria-label={selectionMode === 'crossing' ? 'Selection mode: Crossing' : 'Selection mode: Contained'}
                aria-pressed={selectionMode === 'contained'}
                title={
                  selectionMode === 'crossing'
                    ? 'Crossing: selects touched items. Click for Contained.'
                    : 'Contained: selects fully inside. Click for Crossing.'
                }
                onClick={() => setSelectionMode((m) => (m === 'crossing' ? 'contained' : 'crossing'))}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                  selectionMode === 'contained'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {selectionMode === 'crossing' ? (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="8" height="8" rx="1" strokeDasharray="3 2" /><rect x="7" y="7" width="8" height="8" rx="1" /></svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="14" height="14" rx="1" strokeDasharray="3 2" /><rect x="4" y="4" width="8" height="8" rx="1" /></svg>
                )}
              </button>
            )}

            <button
              aria-label="Toggle touch multi-select"
              aria-pressed={multiSelectMode}
              title={multiSelectMode ? 'Multi-Select Active (tap items to add/remove)' : 'Toggle Touch Multi-Select'}
              onClick={() => {
                selectLeftTool('select');
                setMultiSelectMode((v) => !v);
                closeAllToolMenus();
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                multiSelectMode
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>

            <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-0.5 shrink-0" />

            {/* Group 2: Inking, Fill, Highlight, Eraser & Laser */}
            <button
              aria-label="Drawing brushes"
              title="Drawing Brushes (Pen, Pencil, Brush, Marker, Calligraphy, Fountain)"
              onClick={() => {
                const target = ['pen', 'pencil', 'brush', 'marker', 'calligraphy', 'fountain'].includes(activeTool)
                  ? activeTool
                  : 'pen';
                closeAllToolMenus();
                selectLeftTool(target);
                setShowRightPanel(true);
                setAutoOpenSignal({ sectionId: 'ink-brush', tick: Date.now() });
              }}
              className={`relative w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                ['pen', 'pencil', 'brush', 'marker', 'calligraphy', 'fountain'].includes(activeTool)
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {activeTool === 'brush' ? (
                <Brush className="w-4 h-4" />
              ) : activeTool === 'pencil' ? (
                <Pencil className="w-4 h-4" />
              ) : (
                <Pen className="w-4 h-4" />
              )}
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
            </button>

            <button
              aria-label="Paint bucket fill"
              title="Paint Bucket / Fill Object"
              onClick={() => {
                closeAllToolMenus();
                selectLeftTool('paint_bucket');
                setShowRightPanel(true);
                setAutoOpenSignal({ sectionId: 'bucket-fill', tick: Date.now() });
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                activeTool === 'paint_bucket'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <PaintBucket className="w-4 h-4" />
            </button>

            <button
              aria-label={t.highlighter}
              title={`${t.highlighter} (K — Hold Shift for straight highlight)`}
              onClick={() => {
                closeAllToolMenus();
                selectLeftTool('highlighter');
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                activeTool === 'highlighter'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Highlighter className="w-4 h-4" />
            </button>

            <button
              aria-label={`${t.eraser} modes`}
              title={`${t.eraser} Modes (E) — Stroke, Object, Area or Clear`}
              onClick={() => {
                closeAllToolMenus();
                selectLeftTool(
                  eraserMode === 'area' ? 'eraser_area' : eraserMode === 'object' ? 'eraser_object' : 'eraser_stroke'
                );
                setShowRightPanel(true);
                setAutoOpenSignal({ sectionId: 'eraser-mode', tick: Date.now() });
              }}
              className={`relative w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                activeTool.startsWith('eraser')
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Eraser className="w-4 h-4" />
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
            </button>

            <button
              aria-label={`${t.laser} pointer`}
              title={`${t.laser} Pointer`}
              onClick={() => {
                closeAllToolMenus();
                selectLeftTool('laser');
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                activeTool === 'laser'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Pointer className="w-4 h-4" />
            </button>

            <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-0.5 shrink-0" />

            {/* Group 3: Text, Notes, Shapes, Lines, Connectors, Frame, Table, Diagrams */}
            <button
              aria-label={t.text}
              title={`${t.text} (T)`}
              onClick={() => {
                closeAllToolMenus();
                selectLeftTool('text');
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                activeTool === 'text' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Type className="w-4 h-4" />
            </button>

            <button
              aria-label={t.sticky}
              title={`${t.sticky} (S)`}
              onClick={() => {
                closeAllToolMenus();
                selectLeftTool('sticky');
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                activeTool === 'sticky' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <StickyNote className="w-4 h-4" />
            </button>

            <button
              aria-label={t.shapes}
              title={`${t.shapes} (R)`}
              onClick={() => {
                closeAllToolMenus();
                if (activeShapeKind === 'frame') setActiveShapeKind('rounded_rect');
                selectLeftTool('shape');
                setShowRightPanel(true);
                setAutoOpenSignal({ sectionId: 'shape-library', tick: Date.now() });
              }}
              className={`relative w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                activeTool === 'shape' && activeShapeKind !== 'frame' && !rightPanelMenu
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Shapes className="w-4 h-4" />
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
            </button>

            <button
              aria-label={`${t.lines} and arrows`}
              title={`${t.lines} & Arrows (L)`}
              onClick={() => {
                const target = ['line', 'curved_line', 'polyline', 'arrow', 'double_arrow'].includes(activeTool)
                  ? activeTool
                  : 'arrow';
                closeAllToolMenus();
                selectLeftTool(target);
                setShowRightPanel(true);
                setAutoOpenSignal({ sectionId: 'line-type', tick: Date.now() });
              }}
              className={`relative w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                ['line', 'curved_line', 'polyline', 'arrow', 'double_arrow'].includes(activeTool) && !rightPanelMenu
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ArrowRight className="w-4 h-4" />
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
            </button>

            <button
              aria-label={t.connectors}
              title={t.connectors}
              onClick={() => {
                closeAllToolMenus();
                selectLeftTool('connector');
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                activeTool === 'connector' && !rightPanelMenu
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <GitBranch className="w-4 h-4" />
            </button>

            <button
              aria-label="Section frame"
              title="Section Frame"
              onClick={() => {
                closeAllToolMenus();
                setActiveShapeKind('frame');
                selectLeftTool('shape');
                setShowRightPanel(true);
                setAutoOpenSignal({ sectionId: 'frame-presets', tick: Date.now() });
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                activeTool === 'shape' && activeShapeKind === 'frame' && !rightPanelMenu
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Frame className="w-4 h-4" />
            </button>

            <button
              aria-label="Insert table"
              title="Insert Table"
              onClick={() => openRightPanelMenu('table', 'menu-table')}
              className={`relative w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                rightPanelMenu === 'table'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Table2 className="w-4 h-4" />
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
            </button>

            <button
              aria-label={t.diagrams}
              title={t.diagrams}
              onClick={() => openRightPanelMenu('diagrams', 'menu-diagrams')}
              className={`relative w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                rightPanelMenu === 'diagrams'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Network className="w-4 h-4" />
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
            </button>

            <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-0.5 shrink-0" />

            {/* Group 4: STEM Instruments, Math & Graph, Media, Templates */}
            <button
              aria-label="Geometry instruments"
              title="Geometry Instruments (Ruler, Protractor, Compass, Set Square)"
              onClick={() => openRightPanelMenu('geometry', 'menu-geometry')}
              className={`relative w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                rightPanelMenu === 'geometry' || instruments.some((i) => i.visible)
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Ruler className="w-4 h-4" />
              {instruments.some((i) => i.visible) && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 pointer-events-none" />
              )}
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
            </button>

            <button
              aria-label="Calculator"
              title="Calculator (Standard & Scientific)"
              onClick={() => {
                closeAllToolMenus();
                setShowCalculator((v) => !v);
              }}
              className={`w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                showCalculator
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Calculator className="w-4 h-4" />
            </button>

            <button
              aria-label={t.mathTools}
              title={`${t.mathTools} (Equations, Function Grapher, Science)`}
              onClick={() => openRightPanelMenu('math', 'menu-math')}
              className={`relative w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center shrink-0 ${
                rightPanelMenu === 'math' || showMathModal
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FunctionSquare className="w-4 h-4" />
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-60 pointer-events-none" />
            </button>

            <button
              aria-label={t.media}
              title={t.media}
              onClick={() => {
                closeAllToolMenus();
                mediaUploadRef.current?.click();
              }}
              className="w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            <button
              aria-label={t.templates}
              title={t.templates}
              onClick={() => {
                closeAllToolMenus();
                setHubModal({ open: true, tab: 'templates' });
              }}
              className="w-9 h-[26px] lg:h-7 rounded-md flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <LayoutTemplate className="w-4 h-4" />
            </button>
          </aside>

          {/* CENTER INFINITE DIGITAL CANVAS */}
          <main className="flex-1 relative min-w-0 min-h-0 flex flex-col">
            {hideTopBar && !showQuickToolStyleBar && !showRightPanel && (
              <button
                type="button"
                onClick={() => setHideTopBar(false)}
                title="Show Top Bar (Ctrl+\)"
                aria-label="Show Top Bar"
                className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-700 shadow-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <PanelTopOpen className="w-4 h-4" />
              </button>
            )}
            {/* DOCKED CLASS TIMER BAR (shapes & tool options live in Right Slim Bar) */}
            {showQuickToolStyleBar && (
              <div className="w-full shrink-0 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 px-2.5 py-1 flex items-center justify-between gap-2 z-10">
                <div className="flex-1 min-w-0 flex items-center justify-center">
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-full text-xs">
                  {showClassTimer && (
                    <>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Timer className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span
                          className={`font-mono text-xs font-bold min-w-[44px] ${
                            timerSec <= 15 && timerRunning ? 'text-red-600 animate-pulse' : ''
                          }`}
                        >
                          {formatTimer(timerSec)}
                        </span>
                        <button
                          onClick={() => setTimerRunning((r) => !r)}
                          className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                          title={timerRunning ? 'Pause Timer' : 'Start Timer'}
                        >
                          {timerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        </button>
                        {[60, 180, 300].map((sec) => (
                          <button
                            key={sec}
                            onClick={() => {
                              setTimerRunning(false);
                              setTimerPresetSec(sec);
                              setTimerSec(sec);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              timerPresetSec === sec
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {sec / 60}m
                          </button>
                        ))}
                        <div className="flex items-center gap-0.5 pl-1 border-l border-slate-200 dark:border-slate-700">
                          <input
                            type="number"
                            min={1}
                            max={120}
                            value={timerCustomMin}
                            onChange={(e) => setTimerCustomMin(e.target.value)}
                            aria-label="Custom timer minutes"
                            className="w-11 px-1 py-0.5 text-[10px] font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-center"
                          />
                          <button
                            onClick={() => {
                              const mins = Math.max(1, Math.min(120, Math.round(Number(timerCustomMin) || 5)));
                              setTimerCustomMin(String(mins));
                              setTimerRunning(false);
                              setTimerPresetSec(mins * 60);
                              setTimerSec(mins * 60);
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                          >
                            Set
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            setTimerRunning(false);
                            setTimerSec(timerPresetSec);
                          }}
                          title="Reset Timer"
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => {
                            setTimerRunning(false);
                            setShowClassTimer(false);
                          }}
                          title="Hide Timer"
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                  </div>
                </div>
                {hideTopBar && !showRightPanel && (
                  <button
                    type="button"
                    onClick={() => setHideTopBar(false)}
                    title="Show Top Bar (Ctrl+\)"
                    aria-label="Show Top Bar"
                    className="shrink-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <PanelTopOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Floating Board Find & Replace (Ctrl+F) */}
            {showFindReplace && (
              <div className="absolute top-3 left-2 right-2 sm:left-auto sm:right-3 sm:w-[320px] z-30 bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-2.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                    <Search className="w-3.5 h-3.5 text-blue-600" /> Find &amp; Replace on Board
                  </span>
                  <button
                    onClick={() => setShowFindReplace(false)}
                    className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={findQuery}
                    onChange={(e) => {
                      setFindQuery(e.target.value);
                      setFindMatchIdx(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') jumpToFindMatch(e.shiftKey ? findMatchIdx - 1 : findMatchIdx + 1);
                      else if (e.key === 'Escape') setShowFindReplace(false);
                    }}
                    placeholder="Find text, sticky, shape, or table..."
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-blue-600"
                  />
                  <span className="text-[10px] font-mono text-slate-500 min-w-[36px] text-center">
                    {findMatches.length > 0 ? `${(findMatchIdx % findMatches.length) + 1}/${findMatches.length}` : '0/0'}
                  </span>
                  <button
                    disabled={findMatches.length === 0}
                    onClick={() => jumpToFindMatch(findMatchIdx - 1)}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Previous Match"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={findMatches.length === 0}
                    onClick={() => jumpToFindMatch(findMatchIdx + 1)}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Next Match"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <input
                      value={replaceQuery}
                      onChange={(e) => setReplaceQuery(e.target.value)}
                      placeholder="Replace with..."
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-blue-600"
                    />
                    <button
                      disabled={findMatches.length === 0 || !findQuery.trim()}
                      onClick={() => handleReplaceInBoard(false)}
                      className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium"
                    >
                      Replace
                    </button>
                    <button
                      disabled={findMatches.length === 0 || !findQuery.trim()}
                      onClick={() => handleReplaceInBoard(true)}
                      className="px-2 py-1 rounded-lg bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 text-[11px] font-medium"
                    >
                      All
                    </button>
                  </div>
                )}
              </div>
            )}

            <CanvasStage
              page={activePage}
              activeTool={activeTool}
              activeShapeKind={activeShapeKind}
              strokeColor={strokeColor}
              fillColor={fillColor}
              strokeWidth={strokeWidth}
              opacity={opacity}
              lineStyle={lineStyle}
              smoothing={smoothing}
              stabilization={stabilization}
              shapeFillStyle={shapeFillStyle}
              shapeCornerRadius={shapeCornerRadius}
              shapeShadow={shapeShadow}
              connectorRouteType={connectorRouteType}
              lineStartHead={lineStartHead}
              lineEndHead={lineEndHead}
              eraserMode={eraserMode}
              eraserSize={eraserSize}
            eraserSettings={eraserSettings}
              autoSmartShape={autoSmartShape}
              palmRejection={palmRejection}
              snapToGrid={snapToGrid}
              showRulers={showRulers}
              showMinimap={showMinimap}
              canvasLocked={canvasLocked}
              canEdit={canEdit}
              zoom={zoom}
              panX={panX}
              panY={panY}
              rotationDeg={rotationDeg}
              selectedIds={selectedIds}
              multiSelectMode={multiSelectMode}
              onExitMultiSelect={() => setMultiSelectMode(false)}
              selectionMode={selectionMode}
              preciseSelection={preciseSelection}
              colorblindPalette={colorblindPalette}
              instruments={instruments}
              remoteCursors={presence.filter((u) => u.userId !== userId)}
              remoteLaserPoints={remoteLaserPoints}
              reactions={reactions}
              onZoomChange={setZoom}
              onPanChange={(x, y) => {
                setPanX(x);
                setPanY(y);
              }}
              onSelectIds={setSelectedIds}
              onCreateObject={handleCreateObject}
              onUpdateObject={handleUpdateObject}
              onBatchPatchObjects={handleBatchPatchObjects}
              onDeleteObjects={handleDeleteObjects}
              onSnapshotUndo={snapshotUndo}
              onSyncPageState={syncPageState}
              onReplacePageObjects={replacePageObjects}
              onOpenMathOrGraph={(tab, existingObj) => {
                setMathModalTab(tab);
                setEditingMathGraphObj(existingObj || null);
                setShowMathModal(true);
              }}
              onQuickAIAction={handleQuickAIAction}
              onDismissMenus={() => {
                closeAllToolMenus();
                setShowMobileActionsMenu(false);
                setShowMobileMoreTools(false);
              }}
              onCursorMove={(wx, wy) => sendWS({ type: 'cursor:move', x: wx, y: wy, pageId: activePage.id })}
              onLaserPoint={(wx, wy) => sendWS({ type: 'laser:point', x: wx, y: wy, pageId: activePage.id, color: strokeColor })}
              onUpdateInstrument={(inst) =>
                setInstruments((prev) => prev.map((i) => (i.id === inst.id ? inst : i)))
              }
              onAddGuide={(axis, position) =>
                handleUpdatePage(activePage.id, {
                  guides: [...(activePage.guides || []), { id: uid('guide'), axis, position }],
                })
              }
              onRemoveGuide={(id) =>
                handleUpdatePage(activePage.id, {
                  guides: (activePage.guides || []).filter((g) => g.id !== id),
                })
              }
              onDropFiles={(files, wx, wy) => handleImportFiles(files, wx, wy)}
              canvasRefOut={canvasRef}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onReorderZ={handleReorderZ}
              onDuplicateSelected={handleDuplicateSelected}
              onChangeStrokeColor={setStrokeColor}
              onChangeOpacity={setOpacity}
              onSetActiveTool={setActiveTool}
              onOpenTemplates={() => setHubModal({ open: true, tab: 'templates' })}
              externalCroppingId={boardCroppingId}
              onExternalCroppingIdChange={setBoardCroppingId}
              toolLocked={toolLocked}
              userName={userName}
              textDefaults={textDefaults}
              richEditorRefOut={richEditorRef}
              syncRichEditorFnRef={syncRichEditorFnRef}
              onEditingObjectIdChange={(id) => {
                setEditingObjectId(id);
                if (id && window.innerWidth >= 1024) {
                  setShowRightPanel(true);
                }
              }}
              onPresentFrame={handlePresentFrame}
              onExportFrame={handleExportFrame}
              onCopyStyle={(obj) => handleCopyStyle(obj)}
              onPasteStyle={() => handlePasteStyle()}
              hasCopiedStyle={Boolean(copiedStyle)}
              formatPainterActive={formatPainterActive}
              onFormatPainterClick={(obj) => {
                if (formatPainterActive) {
                  setFormatPainterActive(false);
                  return;
                }
                handleCopyStyle(obj);
                setActiveTool('select');
                setFormatPainterActive(true);
                showToast('Format Painter active — click multiple objects to apply this style; press Esc to finish');
              }}
              onFormatPaintTarget={handleFormatPainterTarget}
              onCancelFormatPainter={() => setFormatPainterActive(false)}
              onToggleGroup={() => {
                const sel = activePage.objects.filter((o) => selectedIds.has(o.id));
                const allGrouped = sel.length >= 2 && sel.every((o) => o.groupId && o.groupId === sel[0].groupId);
                if (allGrouped) handleUngroupSelected();
                else handleGroupSelected();
              }}
            />

            {/* Student Floating WebRTC Live Screen Share PiP */}
            {remoteScreenStream && userRole !== 'teacher' && (
              <div
                className={`fixed right-3 bottom-16 md:bottom-14 z-30 rounded-xl border border-blue-500/40 bg-slate-950/95 shadow-2xl overflow-hidden transition-all ${
                  pipMinimized ? 'w-52' : 'w-[min(88vw,360px)] sm:w-96'
                }`}
              >
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 text-[11px] text-slate-200">
                  <span className="flex items-center gap-1.5 font-medium truncate">
                    <Monitor className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    {classroom.teacherName} Screen
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPipMinimized((v) => !v)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
                    >
                      {pipMinimized ? 'Expand' : 'Minimize'}
                    </button>
                  </div>
                </div>
                {!pipMinimized && (
                  <video ref={remoteVideoRef} autoPlay playsInline muted className="w-full h-44 bg-black object-contain" />
                )}
              </div>
            )}

            {/* MOBILE BOTTOM TOOL DOCK (< md) */}
            <nav className="flex md:hidden min-h-14 shrink-0 px-1.5 py-0.5 pb-safe bg-white/95 dark:bg-slate-900/95 glass-chrome border-t border-slate-200/40 dark:border-slate-800/40 items-center justify-between gap-1 z-20">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1 py-0.5">
                {[
                  { id: 'select', icon: MousePointer2, label: 'Select' },
                  {
                    id: 'pen-group',
                    icon: Pen,
                    label: 'Draw',
                    active: ['pen', 'pencil', 'brush', 'marker', 'calligraphy', 'fountain'].includes(activeTool) && !rightPanelMenu,
                    onClick: () => {
                      const inGroup = ['pen', 'pencil', 'brush', 'marker', 'calligraphy', 'fountain'].includes(activeTool);
                      closeAllToolMenus();
                      if (!inGroup) {
                        selectLeftTool('pen');
                      } else {
                        setShowRightPanel(true);
                      }
                    },
                  },
                  {
                    id: 'paint_bucket',
                    icon: PaintBucket,
                    label: 'Fill',
                    onClick: () => {
                      closeAllToolMenus();
                      selectLeftTool('paint_bucket');
                      setShowRightPanel(true);
                      setAutoOpenSignal({ sectionId: 'bucket-fill', tick: Date.now() });
                    },
                  },
                  {
                    id: 'highlighter',
                    icon: Highlighter,
                    label: 'Hi-lite',
                  },
                  {
                    id: 'laser',
                    icon: Pointer,
                    label: 'Laser',
                  },
                  {
                    id: 'eraser-group',
                    icon: Eraser,
                    label: 'Eraser',
                    active: activeTool.startsWith('eraser') && !rightPanelMenu,
                    onClick: () => {
                      const inGroup = activeTool.startsWith('eraser');
                      closeAllToolMenus();
                      if (!inGroup) {
                        selectLeftTool(
                          eraserMode === 'area' ? 'eraser_area' : eraserMode === 'object' ? 'eraser_object' : 'eraser_stroke'
                        );
                      } else {
                        setShowRightPanel(true);
                      }
                    },
                  },
                  { id: 'sticky', icon: StickyNote, label: 'Sticky' },
                  { id: 'text', icon: Type, label: 'Text' },
                  {
                    id: 'shapes-group',
                    icon: Shapes,
                    label: 'Shapes',
                    active: activeTool === 'shape' && activeShapeKind !== 'frame' && !rightPanelMenu,
                    onClick: () => {
                      const inGroup = activeTool === 'shape' && activeShapeKind !== 'frame';
                      closeAllToolMenus();
                      if (!inGroup) {
                        if (activeShapeKind === 'frame') setActiveShapeKind('rounded_rect');
                        selectLeftTool('shape');
                      } else {
                        setShowRightPanel(true);
                      }
                    },
                  },
                  {
                    id: 'frame-btn',
                    icon: Frame,
                    label: 'Frame',
                    active: activeTool === 'shape' && activeShapeKind === 'frame' && !rightPanelMenu,
                    onClick: () => {
                      const inGroup = activeTool === 'shape' && activeShapeKind === 'frame';
                      closeAllToolMenus();
                      if (!inGroup) {
                        setActiveShapeKind('frame');
                        selectLeftTool('shape');
                      } else {
                        setShowRightPanel(true);
                      }
                    },
                  },
                  {
                    id: 'table-btn',
                    icon: Table2,
                    label: 'Table',
                    active: rightPanelMenu === 'table',
                    onClick: () => openRightPanelMenu('table', 'menu-table'),
                  },
                  {
                    id: 'line-group',
                    icon: ArrowRight,
                    label: 'Lines',
                    active: ['line', 'curved_line', 'polyline', 'arrow', 'double_arrow', 'connector'].includes(activeTool) && !rightPanelMenu,
                    onClick: () => {
                      const inGroup = ['line', 'curved_line', 'polyline', 'arrow', 'double_arrow', 'connector'].includes(activeTool);
                      closeAllToolMenus();
                      if (!inGroup) {
                        selectLeftTool('arrow');
                      } else {
                        setShowRightPanel(true);
                      }
                    },
                  },
                  {
                    id: 'diagrams-group',
                    icon: Network,
                    label: 'Diagram',
                    active: rightPanelMenu === 'diagrams',
                    onClick: () => openRightPanelMenu('diagrams', 'menu-diagrams'),
                  },
                  {
                    id: 'geometry-btn',
                    icon: Ruler,
                    label: 'Geom.',
                    active: rightPanelMenu === 'geometry' || instruments.some((i) => i.visible),
                    onClick: () => openRightPanelMenu('geometry', 'menu-geometry'),
                  },
                  {
                    id: 'calculator-btn',
                    icon: Calculator,
                    label: 'Calc.',
                    active: showCalculator,
                    onClick: () => {
                      const next = !showCalculator;
                      closeAllToolMenus();
                      setShowCalculator(next);
                    },
                  },
                  {
                    id: 'math-btn',
                    icon: FunctionSquare,
                    label: 'Math',
                    active: rightPanelMenu === 'math' || showMathModal,
                    onClick: () => openRightPanelMenu('math', 'menu-math'),
                  },
                  {
                    id: 'media-btn',
                    icon: ImageIcon,
                    label: 'Media',
                    active: false,
                    onClick: () => mediaUploadRef.current?.click(),
                  },
                  {
                    id: 'templates-btn',
                    icon: LayoutTemplate,
                    label: 'Templ.',
                    active: false,
                    onClick: () => setHubModal({ open: true, tab: 'templates' }),
                  },
                  { id: 'hand', icon: Hand, label: 'Pan' },
                  { id: 'lasso', icon: Lasso, label: 'Lasso' },
                  {
                    id: 'multi-select',
                    icon: CheckSquare,
                    label: 'Multi',
                    active: multiSelectMode,
                    onClick: () => {
                      selectLeftTool('select');
                      setMultiSelectMode((v) => !v);
                      closeAllToolMenus();
                    },
                  },
                  {
                    id: 'tool-lock',
                    icon: toolLocked ? Lock : Unlock,
                    label: toolLocked ? 'Locked' : 'Lock',
                    active: toolLocked,
                    onClick: () => setToolLocked((v) => !v),
                  },
                ].map((item, idx) => {
                  if (!showMobileMoreTools && idx >= 10) return null;
                  const Icon = item.icon;
                  const isActive = 'active' in item ? item.active : activeTool === item.id;
                  return (
                    <button
                      key={item.id}
                      title={item.label}
                      onClick={() => {
                        if ('onClick' in item && item.onClick) {
                          item.onClick();
                        } else {
                          selectLeftTool(item.id as ToolType);
                          closeAllToolMenus();
                        }
                        if (idx >= 10) setShowMobileMoreTools(false);
                      }}
                      className={`flex flex-col items-center justify-center min-w-[44px] h-11 px-1.5 rounded-lg shrink-0 transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[9px] font-medium leading-tight mt-0.5">{item.label}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowMobileMoreTools((v) => !v)}
                  className={`flex flex-col items-center justify-center min-w-[44px] h-11 px-1.5 rounded-lg shrink-0 transition-colors ${
                    showMobileMoreTools
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  aria-label="More tools"
                  title="More tools"
                >
                  <MoreVertical className="w-4 h-4" />
                  <span className="text-[9px] font-medium leading-tight mt-0.5">More</span>
                </button>
              </div>

              <button
                onClick={() => {
                  closeAllToolMenus();
                  setShowRightPanel((v) => !v);
                }}
                className={`relative shrink-0 p-2 rounded-lg border text-[11px] font-semibold ${
                  showRightPanel
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
                title="Tool Style, Colors & Properties"
                aria-label="Tool Style & Properties"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span
                  className="absolute bottom-1 right-1 w-2 h-2 rounded-full border border-white dark:border-slate-900"
                  style={{ backgroundColor: strokeColor }}
                />
              </button>

              <button
                onClick={() => {
                  const next = !showReactionsMenu;
                  closeAllToolMenus();
                  setShowReactionsMenu(next);
                }}
                className={`shrink-0 p-2 rounded-lg border text-[11px] font-semibold ${
                  showReactionsMenu
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
                title="Live Reactions"
                aria-label="Live Reactions"
              >
                <SmilePlus className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setShowMobilePageSheet(true)}
                className="shrink-0 flex items-center gap-1 px-2 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                title="Pages, Grid & Zoom"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-mono">
                  {activePageIdx + 1}/{workspace.pages.length}
                </span>
              </button>

              <button
                onClick={() => {
                  const next = !showLayersMenu;
                  closeAllToolMenus();
                  setShowLayersMenu(next);
                }}
                className={`shrink-0 flex items-center gap-1 px-2 py-2 rounded-lg border text-[11px] font-semibold ${
                  showLayersMenu
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
                title="Layers"
                aria-label="Layers"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="font-mono">{activePage.objects.length}</span>
              </button>
            </nav>

            <LayersDropdownMenu
              open={showLayersMenu}
              page={activePage}
              selectedIds={selectedIds}
              onClose={() => setShowLayersMenu(false)}
              onSelectIds={setSelectedIds}
              onUpdateObject={handleUpdateObject}
              onDeleteObjects={handleDeleteObjects}
              onReorderZ={handleReorderZ}
              onUpdatePage={handleUpdatePage}
              onReplacePageObjects={replacePageObjects}
            />

            {/* UNIFIED LIVE REACTIONS POPOVER (Desktop & Mobile) */}
            {showReactionsMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowReactionsMenu(false)} />
                <div className="absolute bottom-16 md:bottom-12 right-2 md:right-48 z-40 w-[min(92vw,310px)] bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <SmilePlus className="w-3.5 h-3.5 text-blue-600" />
                      Live Reactions
                    </span>
                    <button
                      onClick={() => setShowReactionsMenu(false)}
                      className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {LIVE_REACTIONS.map((rx) => (
                      <button
                        key={rx.label}
                        onClick={() => sendLiveReaction(rx.emoji)}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-300 dark:hover:border-blue-800 transition-colors text-left"
                      >
                        <span className="text-base leading-none shrink-0">{rx.emoji}</span>
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                          {rx.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* MOBILE SLIDE-UP PAGES, GRID, REACTIONS & ZOOM SHEET (< md) */}
            {showMobilePageSheet && (
              <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end bg-slate-950/45">
                <div className="flex-1" onClick={() => setShowMobilePageSheet(false)} />
                <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-2xl shadow-2xl p-4 pb-safe space-y-4 max-h-[78dvh] overflow-y-auto scrollbar-none">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Board Pages, Grid &amp; View</h3>
                    <button
                      onClick={() => setShowMobilePageSheet(false)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Pages List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">Pages ({workspace.pages.length})</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleAddPage()}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Page
                        </button>
                        <button
                          onClick={() => handleDuplicatePage(activePage.id)}
                          className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700"
                          title="Duplicate Page"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && activePage.objects.length > 0 && (
                          <button
                            onClick={() => {
                              replacePageObjects([], true);
                              setSelectedIds(new Set());
                              setShowMobilePageSheet(false);
                              showToast('Cleared current board page (Ctrl+Z to undo)');
                            }}
                            className="px-2 py-1 text-xs rounded-lg border border-red-300 dark:border-red-800 text-red-600"
                            title="Clear Current Page"
                          >
                            Clear
                          </button>
                        )}
                        {workspace.pages.length > 1 && (
                          <button
                            onClick={() => handleDeletePage(activePage.id)}
                            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-red-600"
                            title="Delete Page"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {workspace.pages.map((p, i) => (
                        <button
                          key={p.id}
                          onClick={() => handleSelectPage(p.id)}
                          className={`px-3 py-1.5 text-xs rounded-lg border ${
                            p.id === activePage.id
                              ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                              : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {i + 1}. {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grid, BG, Lock, Minimap */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-500">Grid Pattern</span>
                      <select
                        value={activePage.gridType}
                        onChange={(e) => handleUpdatePage(activePage.id, { gridType: e.target.value as GridType })}
                        className="w-full px-2.5 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        <option value="none">No Grid</option>
                        <option value="dots">Dot Grid</option>
                        <option value="lines">Line Grid</option>
                        <option value="graph">Graph Paper</option>
                        <option value="engineering">Engineering</option>
                        <option value="isometric">Isometric</option>
                        <option value="ruled">Ruled</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-500">Background Color</span>
                      <div className="flex items-center gap-2 h-9 px-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <input
                          type="color"
                          value={activePage.background || '#FFFFFF'}
                          onChange={(e) => handleUpdatePage(activePage.id, { background: e.target.value })}
                          className="w-6 h-6 rounded cursor-pointer border border-slate-300"
                        />
                        <span className="font-mono text-[11px]">{activePage.background || '#FFFFFF'}</span>
                      </div>
                    </label>
                  </div>

                  {/* Zoom & Toggles */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setZoom((z) => Math.max(0.15, z - 0.15))}
                        className="p-2 rounded-lg border border-slate-300 dark:border-slate-700"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={fitToScreen}
                        className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700"
                      >
                        {Math.round(zoom * 100)}% Fit
                      </button>
                      <button
                        onClick={() => setZoom((z) => Math.min(4.5, z + 0.15))}
                        className="p-2 rounded-lg border border-slate-300 dark:border-slate-700"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        onClick={() => setSnapToGrid((v) => !v)}
                        className={`px-2.5 py-1.5 rounded-lg border ${
                          snapToGrid ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        Snap
                      </button>
                      <button
                        onClick={() => setShowRulers((v) => !v)}
                        className={`px-2.5 py-1.5 rounded-lg border ${
                          showRulers ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        Rulers
                      </button>
                      <button
                        onClick={() => setCanvasLocked((l) => !l)}
                        className={`px-2.5 py-1.5 rounded-lg border ${
                          canvasLocked ? 'bg-amber-600 text-white border-amber-600' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {canvasLocked ? 'Locked' : 'Lock'}
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* DESKTOP BOTTOM TOOLBAR (md+): Pages, Zoom, Mini-map, Grid, Clear Page, Reactions */}
            <footer className="hidden md:flex h-11 shrink-0 px-2.5 bg-white/95 dark:bg-slate-900/95 glass-chrome border-t border-slate-200/40 dark:border-slate-800/40 items-center justify-between gap-2 overflow-x-auto scrollbar-none z-20">
              {/* Page Navigation */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  disabled={activePageIdx <= 0}
                  onClick={() => handleSelectPage(workspace.pages[activePageIdx - 1].id)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 max-w-[300px] lg:max-w-[440px] overflow-x-auto scrollbar-none">
                  {workspace.pages.map((p, i) =>
                    renamingPageId === p.id ? (
                      <input
                        key={p.id}
                        autoFocus
                        value={pageNameDraft}
                        onChange={(e) => setPageNameDraft(e.target.value)}
                        onBlur={() => {
                          if (pageNameDraft.trim() && pageNameDraft.trim() !== p.name) {
                            handleUpdatePage(p.id, { name: pageNameDraft.trim() });
                          }
                          setRenamingPageId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (pageNameDraft.trim() && pageNameDraft.trim() !== p.name) {
                              handleUpdatePage(p.id, { name: pageNameDraft.trim() });
                            }
                            setRenamingPageId(null);
                          } else if (e.key === 'Escape') {
                            setRenamingPageId(null);
                          }
                        }}
                        className="w-24 px-2 py-0.5 text-xs rounded border border-blue-600 bg-white dark:bg-slate-950 focus:outline-none shrink-0"
                      />
                    ) : (
                      <button
                        key={p.id}
                        onClick={() => handleSelectPage(p.id)}
                        onDoubleClick={() => {
                          setRenamingPageId(p.id);
                          setPageNameDraft(p.name);
                        }}
                        title="Double-click to rename page"
                        className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap shrink-0 ${
                          p.id === activePage.id
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {i + 1}. {p.name}
                      </button>
                    )
                  )}
                </div>
                <button
                  disabled={activePageIdx >= workspace.pages.length - 1}
                  onClick={() => handleSelectPage(workspace.pages[activePageIdx + 1].id)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAddPage()}
                  title={t.addPage}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDuplicatePage(activePage.id)}
                  title="Duplicate Page"
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {workspace.pages.length > 1 && (
                  <button
                    onClick={() => handleDeletePage(activePage.id)}
                    title="Delete Current Page"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {canEdit && activePage.objects.length > 0 && (
                  confirmClearPage ? (
                    <div className="flex items-center gap-1 ml-1 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800">
                      <button
                        onClick={() => {
                          replacePageObjects([], true);
                          setSelectedIds(new Set());
                          setConfirmClearPage(false);
                          showToast('Cleared current board page (Ctrl+Z to undo)');
                        }}
                        className="flex items-center gap-0.5 text-[11px] font-semibold text-red-600 hover:underline"
                      >
                        <Check className="w-3 h-3" /> Clear?
                      </button>
                      <button
                        onClick={() => setConfirmClearPage(false)}
                        className="text-[11px] text-slate-500 hover:text-slate-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClearPage(true)}
                      title="Clear all objects on current page"
                      className="px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-red-600 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Clear
                    </button>
                  )
                )}
              </div>

              {/* Canvas Settings, Reactions, Rulers, Mini-map, Zoom */}
              <div className="flex items-center gap-1.5 shrink-0 text-xs">
                <button
                  onClick={() => {
                    const next = !showReactionsMenu;
                    closeAllToolMenus();
                    setShowReactionsMenu(next);
                  }}
                  title="Send Live Reactions"
                  className={`p-1.5 rounded ${
                    showReactionsMenu
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <SmilePlus className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setSnapToGrid((v) => !v)}
                  title={t.snapGrid}
                  className={`p-1.5 rounded ${snapToGrid ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowRulers((v) => !v)}
                  title={t.rulers}
                  className={`p-1.5 rounded ${showRulers ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                >
                  <Ruler className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowMinimap((v) => !v)}
                  title={t.minimap}
                  className={`px-2 py-1 rounded text-[11px] ${
                    showMinimap ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Map
                </button>
                <button
                  onClick={() => setRotationDeg((r) => (r + 90) % 360)}
                  title="Rotate Canvas 90°"
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hidden lg:inline-flex"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setCanvasLocked((l) => !l)}
                  title="Lock/Unlock Canvas"
                  className={`p-1.5 rounded ${canvasLocked ? 'bg-amber-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {canvasLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>

                <div className="flex items-center gap-0.5 pl-1 border-l border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setZoom((z) => Math.max(0.15, z - 0.15))}
                    title={t.zoomOut}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={fitToScreen}
                    title={t.fitScreen}
                    className="px-1.5 py-0.5 font-mono text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.min(4.5, z + 0.15))}
                    title={t.zoomIn}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={selectedIds.size > 0 ? fitSelection : fitToScreen}
                    title="Fit Selection / Screen"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Maximize className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="pl-1.5 border-l border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => {
                      const next = !showLayersMenu;
                      closeAllToolMenus();
                      setShowLayersMenu(next);
                    }}
                    title="Board Layers & Objects"
                    className={`p-1.5 rounded ${
                      showLayersMenu
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </footer>
          </main>

          {/* RIGHT PROPERTIES SLIM RAIL & INSPECTOR */}
          {showRightPanel && (
            <>
              <div
                onClick={() => setShowRightPanel(false)}
                className={`fixed inset-0 ${hideTopBar ? 'top-0' : 'top-12'} bg-slate-950/35 ${
                  isDesktopMd ? 'z-20' : 'z-30'
                } ${rightPanelExpanded ? 'lg:hidden' : 'md:hidden'}`}
              />
              <aside
                className={`shrink-0 ${
                  isDesktopMd
                    ? `z-30 ${
                        rightPanelExpanded
                          ? `fixed lg:static right-0 ${hideTopBar ? 'top-0' : 'top-12'} lg:top-0 bottom-0 w-72 shadow-2xl lg:shadow-none`
                          : 'static w-12'
                      }`
                    : `z-40 fixed right-0 ${hideTopBar ? 'top-0' : 'top-12'} bottom-0 w-[min(86vw,300px)] shadow-2xl`
                }`}
              >
                <PropertiesLayersPanel
                  layoutMode={isDesktopMd && !rightPanelExpanded ? 'rail' : 'full'}
                  onToggleExpand={() => setRightPanelExpanded((v) => !v)}
                  onClose={() => setShowRightPanel(false)}
                  hideTopBar={hideTopBar}
                  onShowTopBar={() => setHideTopBar(false)}
                  page={activePage}
                  selectedIds={selectedIds}
                  onSelectIds={setSelectedIds}
                  preciseSelection={preciseSelection}
                  onChangePreciseSelection={setPreciseSelection}
                  activeTool={activeTool}
                  activeShapeKind={activeShapeKind}
                  textDefaults={textDefaults}
                  focusPropsTick={focusPropsTick}
                  strokeColor={strokeColor}
                  fillColor={fillColor}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  lineStyle={lineStyle}
                  smoothing={smoothing}
                  stabilization={stabilization}
                  onChangeStabilization={setStabilization}
                  eraserMode={eraserMode}
                  eraserSize={eraserSize}
            eraserSettings={eraserSettings}
                  autoSmartShape={autoSmartShape}
                  colorblindPalette={colorblindPalette}
                  userName={userName}
                  onChangeStrokeColor={setStrokeColor}
                  onChangeFillColor={setFillColor}
                  onChangeStrokeWidth={setStrokeWidth}
                  onChangeOpacity={setOpacity}
                  onChangeLineStyle={setLineStyle}
                  onChangeSmoothing={setSmoothing}
                  onChangeEraserMode={(m) => {
                    setEraserMode(m);
                    setActiveTool(
                      m === 'area' ? 'eraser_area' : m === 'object' ? 'eraser_object' : 'eraser_stroke'
                    );
                  }}
                  onChangeEraserSize={setEraserSize}
            onChangeEraserSettings={(patch) => setEraserSettings((current) => ({ ...current, ...patch }))}
                  onToggleAutoSmartShape={() => setAutoSmartShape((v) => !v)}
                  onChangeTextDefaults={(patch) => setTextDefaults((prev) => ({ ...prev, ...patch }))}
                  onSetActiveTool={selectLeftTool}
                  onSelectShapeKind={(kind) => {
                    setActiveShapeKind(kind);
                    setActiveTool('shape');
                  }}
                  onUpdateObject={handleUpdateObject}
                  onBatchPatchObjects={handleBatchPatchObjects}
                  onSnapshotUndo={snapshotUndo}
                  onSyncPageState={syncPageState}
                  onDeleteObjects={handleDeleteObjects}
                  onDuplicateSelected={handleDuplicateSelected}
                  richEditorRef={richEditorRef}
                  isEditingText={Boolean(editingObjectId)}
                  onSyncRichEditor={(commit) => syncRichEditorFnRef.current?.(commit)}
                  onGroupSelected={handleGroupSelected}
                  onUngroupSelected={handleUngroupSelected}
                  onReorderZ={handleReorderZ}
                  onAlignSelected={(mode) => {
                    pushUndo(workspace.pages);
                    const aligned = alignObjects(activePage.objects, selectedIds, mode);
                    handleUpdatePage(activePage.id, { objects: aligned });
                  }}
                  onUpdatePage={handleUpdatePage}
                  shapeFillStyle={shapeFillStyle}
                  onChangeShapeFillStyle={setShapeFillStyle}
                  shapeCornerRadius={shapeCornerRadius}
                  onChangeShapeCornerRadius={setShapeCornerRadius}
                  shapeShadow={shapeShadow}
                  onToggleShapeShadow={() => setShapeShadow((v) => !v)}
                  connectorRouteType={connectorRouteType}
                  onChangeConnectorRouteType={setConnectorRouteType}
                  lineStartHead={lineStartHead}
                  onChangeLineStartHead={setLineStartHead}
                  lineEndHead={lineEndHead}
                  onChangeLineEndHead={setLineEndHead}
                  canEdit={canEdit}
                  viewportCenter={viewportCenter}
                  onCopyStyle={(obj) => handleCopyStyle(obj)}
                  onPasteStyle={(objs) => handlePasteStyle(objs)}
                  hasCopiedStyle={Boolean(copiedStyle)}
                  onPresentFrame={handlePresentFrame}
                  onExportFrame={handleExportFrame}
                  croppingId={boardCroppingId}
                  onToggleCrop={(id) => setBoardCroppingId((prev) => (prev === id ? null : id))}
                  onClearPageInk={() => {
                    const remaining = activePage.objects.filter((o) => o.type !== 'stroke');
                    if (remaining.length === activePage.objects.length) {
                      showToast('No ink strokes on this page');
                      return;
                    }
                    replacePageObjects(remaining, true);
                    setSelectedIds(new Set());
                    showToast('Cleared all ink strokes (Ctrl+Z to undo)');
                  }}
                  onClearPageAll={() => {
                    replacePageObjects([], true);
                    setSelectedIds(new Set());
                    showToast('Cleared current page (Ctrl+Z to undo)');
                  }}
                  onInsertBoardTable={insertBoardTable}
                  onInsertCodeBlock={insertCodeBlock}
                  onInsertDiagram={(objs) => handleInsertMultipleObjects(objs, 'append')}
                  onAutoLayoutDiagram={handleAutoLayoutDiagram}
                  instruments={instruments}
                  onToggleInstrument={(kind) =>
                    setInstruments((prev) =>
                      prev.map((i) => (i.kind === kind ? { ...i, visible: !i.visible } : i))
                    )
                  }
                  onHideAllInstruments={() =>
                    setInstruments((prev) => prev.map((i) => ({ ...i, visible: false })))
                  }
                  rightPanelMenu={rightPanelMenu}
                  onClearRightPanelMenu={() => setRightPanelMenu(null)}
                  autoOpenSignal={autoOpenSignal}
                  onInsertSectionFrame={(w, h, title) => {
                    const frameId = uid('shape');
                    const frameObj: BoardObject = {
                      id: frameId,
                      name: title || 'Section',
                      type: 'shape',
                      shapeKind: 'frame',
                      x: Math.round(viewportCenter.x - w / 2),
                      y: Math.round(viewportCenter.y - h / 2),
                      width: w,
                      height: h,
                      rotation: 0,
                      opacity: 1,
                      locked: false,
                      hidden: false,
                      zIndex: activePage.objects.length + 1,
                      fill: 'rgba(248, 250, 252, 0.55)',
                      fillStyle: 'solid',
                      stroke: strokeColor,
                      strokeWidth: 2,
                      lineStyle: 'solid',
                      text: title || 'Section',
                      fontFamily: textDefaults.fontFamily,
                      fontSize: 16,
                      fontWeight: 'bold',
                      fontStyle: 'normal',
                      textAlign: 'left',
                      textColor: strokeColor,
                      cornerRadius: 12,
                      shadow: shapeShadow,
                    };
                    handleCreateObject(frameObj);
                    setSelectedIds(new Set([frameId]));
                    if (!toolLocked) setActiveTool('select');
                  }}
                  onOpenMathOrGraph={(tab, existingObj) => {
                    setMathModalTab(tab);
                    setEditingMathGraphObj(existingObj || null);
                    setShowMathModal(true);
                  }}
                  onQuickAIAction={handleQuickAIAction}
                  onCenterObjectInView={(obj) => {
                    handleUpdateObject(
                      obj.id,
                      {
                        x: Math.round(viewportCenter.x - obj.width / 2),
                        y: Math.round(viewportCenter.y - obj.height / 2),
                      },
                      true
                    );
                  }}
                />
            </aside>
            </>
          )}
        </div>
      )}

      {/* AI ASSISTANT DRAWER */}
      {showAI && <React.Suspense fallback={null}><AIAssistantDrawer
        open={showAI}
        hideTopBar={hideTopBar}
        onClose={() => setShowAI(false)}
        workspaceId={workspace.id}
        hostKey={hostKey || workspace.hostKey || ''}
        locale={locale}
        activePage={activePage}
        selectedIds={selectedIds}
        initialIntent={aiQuickIntent}
        attachedFiles={workspace.attachedFiles}
        viewportCenter={viewportCenter}
        getCanvasSnapshot={() => renderPageToDataUrl(activePage, 1100, 700, 'image/png', 0.9)}
        onApplyObjects={handleInsertMultipleObjects}
        onApplySlides={(slides) => {
          const cur = workspaceRef.current;
          pushUndo(cur.pages);
          const createdSlides: BoardPage[] = slides.map((s, idx) => {
            const isHero = idx === 0;
            const accent = s.themeColor || SLIDE_THEMES[0].accentColor;
            const objs: BoardObject[] = isHero
              ? [
                  {
                    id: uid('shape'),
                    name: 'Hero Accent',
                    type: 'shape',
                    shapeKind: 'rounded_rect',
                    x: 590,
                    y: 190,
                    width: 100,
                    height: 8,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: 1,
                    fill: accent,
                    stroke: 'transparent',
                    strokeWidth: 0,
                    cornerRadius: 4,
                    text: '',
                    textColor: '#FFFFFF',
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: 14,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    textAlign: 'center',
                  },
                  {
                    id: uid('text'),
                    name: 'Deck Title',
                    type: 'text',
                    x: 120,
                    y: 224,
                    width: 1040,
                    height: 120,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: 2,
                    text: s.title,
                    textColor: '#0F172A',
                    bgColor: 'transparent',
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: 48,
                    fontWeight: 'bold',
                    fontStyle: 'normal',
                    underline: false,
                    textAlign: 'center',
                  },
                  {
                    id: uid('text'),
                    name: 'Deck Subtitle',
                    type: 'text',
                    x: 180,
                    y: 360,
                    width: 920,
                    height: 180,
                    rotation: 0,
                    opacity: 0.9,
                    locked: false,
                    hidden: false,
                    zIndex: 3,
                    text: s.subtitle || s.bullets.slice(0, 2).join(' • '),
                    textColor: '#475569',
                    bgColor: 'transparent',
                    fontFamily: 'DM Sans',
                    fontSize: 24,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    underline: false,
                    textAlign: 'center',
                  },
                ]
              : [
                  {
                    id: uid('text'),
                    name: 'Slide Heading',
                    type: 'text',
                    x: 72,
                    y: 52,
                    width: 1136,
                    height: 76,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: 1,
                    text: s.title,
                    textColor: '#0F172A',
                    bgColor: 'transparent',
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: 36,
                    fontWeight: 'bold',
                    fontStyle: 'normal',
                    underline: false,
                    textAlign: 'left',
                  },
                  {
                    id: uid('shape'),
                    name: 'Heading Rule',
                    type: 'shape',
                    shapeKind: 'rounded_rect',
                    x: 72,
                    y: 132,
                    width: 88,
                    height: 6,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: 2,
                    fill: accent,
                    stroke: 'transparent',
                    strokeWidth: 0,
                    cornerRadius: 3,
                    text: '',
                    textColor: '#FFFFFF',
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: 12,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    textAlign: 'left',
                  },
                  {
                    id: uid('shape'),
                    name: 'Content Card',
                    type: 'shape',
                    shapeKind: 'rounded_rect',
                    x: 72,
                    y: 168,
                    width: 1136,
                    height: s.callout ? 360 : 480,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: 3,
                    fill: '#F8FAFC',
                    stroke: '#E2E8F0',
                    strokeWidth: 1.5,
                    cornerRadius: 16,
                    text: '',
                    textColor: '#0F172A',
                    fontFamily: 'DM Sans',
                    fontSize: 20,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    textAlign: 'left',
                  },
                  {
                    id: uid('text'),
                    name: 'Slide Bullets',
                    type: 'text',
                    x: 108,
                    y: 200,
                    width: 1064,
                    height: s.callout ? 300 : 420,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: 4,
                    text: s.bullets.map((b) => `• ${b}`).join('\n\n'),
                    textColor: '#1E293B',
                    bgColor: 'transparent',
                    fontFamily: 'DM Sans',
                    fontSize: 22,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    underline: false,
                    textAlign: 'left',
                  },
                  ...(s.callout
                    ? [
                        {
                          id: uid('shape'),
                          name: 'Callout Strip',
                          type: 'shape' as const,
                          shapeKind: 'rounded_rect' as const,
                          x: 72,
                          y: 556,
                          width: 1136,
                          height: 92,
                          rotation: 0,
                          opacity: 1,
                          locked: false,
                          hidden: false,
                          zIndex: 5,
                          fill: '#EFF6FF',
                          stroke: accent,
                          strokeWidth: 1.5,
                          cornerRadius: 12,
                          text: s.callout,
                          textColor: '#1E3A8A',
                          fontFamily: 'Plus Jakarta Sans',
                          fontSize: 19,
                          fontWeight: 'bold' as const,
                          fontStyle: 'normal' as const,
                          textAlign: 'center' as const,
                        },
                      ]
                    : []),
                ];

            return {
              id: uid('page'),
              name: s.title.slice(0, 28) || `Slide ${idx + 1}`,
              objects: objs,
              layers: [{ id: 'layer-default', name: 'Slide Layer', visible: true, locked: false }],
              guides: [],
              background: '#FFFFFF',
              slideLayout: isHero ? 'title_hero' : 'title_content',
              gridType: 'none',
              gridSize: 28,
              transition: 'slide',
              slideDurationSec: 0,
            };
          });
          const nextPages = [...cur.pages, ...createdSlides];
          const nextDoc = {
            ...cur,
            pages: nextPages,
            activePageId: createdSlides[0]?.id || cur.activePageId,
            updatedAt: Date.now(),
          };
          workspaceRef.current = nextDoc;
          setWorkspace(nextDoc);
          sendWS({ type: 'pages:replace', pages: nextPages, activePageId: nextDoc.activePageId });
          scheduleAutosave(nextDoc);
          setViewMode('presentation');
          showToast(`Added ${createdSlides.length} editable HD slides`);
        }}
        onLaunchQuizToClass={(title, questions) => {
          const quizId = uid('quiz');
          const newQuiz = { id: quizId, title, questions, answers: {}, active: true, createdAt: Date.now() };
          const nextQuizzes = [...(classroom.quizzes || []), newQuiz];
          setClassroom((prev) => ({ ...prev, quizzes: nextQuizzes, activeQuizId: quizId }));
          sendWS({ type: 'classroom:state', state: { quizzes: nextQuizzes, activeQuizId: quizId } });
          setShowClassroomModal(true);
          showToast(`Launched quiz "${title}" to classroom`);
        }}
        onApplyLayoutUpdates={(updates) => {
          const cur = workspaceRef.current;
          pushUndo(cur.pages);
          const curPage = cur.pages.find((p) => p.id === cur.activePageId) || cur.pages[0];
          if (!curPage) return;
          const uMap = new Map(updates.map((u) => [u.id, u]));
          const nextObjs = syncConnectorBounds(
            curPage.objects.map((o) => {
              if (o.locked || (o.layerId && lockedLayerIds.has(o.layerId))) return o;
              const u = uMap.get(o.id);
              if (!u) return o;
              const nx = Math.round(u.x);
              const ny = Math.round(u.y);
              const nw = u.width > 10 ? Math.round(u.width) : o.width;
              const nh = u.height > 10 ? Math.round(u.height) : o.height;
              if (o.type === 'stroke' || o.type === 'line') {
                const scaledPts = scalePointsToBox(
                  o.points,
                  { x: o.x, y: o.y, width: o.width, height: o.height },
                  { x: nx, y: ny, width: nw, height: nh }
                );
                return { ...o, x: nx, y: ny, width: nw, height: nh, points: scaledPts } as BoardObject;
              }
              return { ...o, x: nx, y: ny, width: nw, height: nh } as BoardObject;
            })
          );
          handleUpdatePage(curPage.id, { objects: nextObjs });
          showToast('AI rearranged board layout');
        }}
        onUndo={handleUndo}
      /></React.Suspense>}

      {/* MODALS & FLOATING TOOLS */}
      {showCalculator && <CalculatorWidget
        open={showCalculator}
        onClose={() => setShowCalculator(false)}
        onNotify={showToast}
        onInsertToBoard={(expression, result) => {
          const textLine = expression && expression !== result ? `${expression} = ${result}` : result;
          const objId = uid('math');
          const boxW = Math.max(200, Math.min(460, textLine.length * 13 + 64));
          handleCreateObject({
            id: objId,
            name: `Calc: ${result}`,
            type: 'math',
            x: Math.round(viewportCenter.x - boxW / 2),
            y: Math.round(viewportCenter.y - 40),
            width: boxW,
            height: 78,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            zIndex: activePage.objects.length + 1,
            latex: textLine.replace(/×/g, '\\times ').replace(/÷/g, '\\div ').replace(/π/g, '\\pi '),
            color: '#0F172A',
            bgColor: '#FFFFFF',
            fontSize: 20,
          });
          setSelectedIds(new Set([objId]));
          if (!toolLocked) setActiveTool('select');
          showToast(`Inserted "${textLine}" onto board`);
        }}
        onPlotExpression={(expression) => {
          const selectedGraph = activePage.objects.find((o): o is GraphObject => selectedIds.has(o.id) && o.type === 'graph');
          if (selectedGraph) {
            handleUpdateObject(selectedGraph.id, {
              expressions: [
                ...selectedGraph.expressions,
                { id: uid('expr'), expr: expression, color: '#2563EB', visible: true },
              ],
            });
            showToast(`Added "${expression}" to selected graph`);
            return;
          }
          const graphId = uid('graph');
          const graphObj: GraphObject = {
            id: graphId,
            name: `Graph: ${expression}`,
            type: 'graph',
            x: Math.round(viewportCenter.x - 240),
            y: Math.round(viewportCenter.y - 170),
            width: 480,
            height: 340,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            zIndex: activePage.objects.length + 1,
            mode: '2d',
            expressions: [{ id: uid('expr'), expr: expression, color: '#2563EB', visible: true }],
            xMin: -10,
            xMax: 10,
            yMin: -6,
            yMax: 6,
            showGrid: true,
            title: `y = ${expression}`,
          };
          handleCreateObject(graphObj);
          setSelectedIds(new Set([graphId]));
          if (!toolLocked) setActiveTool('select');
          showToast(`Plotted "${expression}" on board`);
        }}
      />}

      {showMathModal && <MathScienceModal
        open={showMathModal}
        initialTab={mathModalTab}
        editingObject={editingMathGraphObj}
        onClose={() => {
          setShowMathModal(false);
          setEditingMathGraphObj(null);
        }}
        instruments={instruments}
        onToggleInstrument={(kind) =>
          setInstruments((prev) =>
            prev.map((i) => (i.kind === kind ? { ...i, visible: !i.visible } : i))
          )
        }
        onInsertObjects={(objs) => handleInsertMultipleObjects(objs, 'append')}
        onUpdateExistingObject={(id, patch) => handleUpdateObject(id, patch, true)}
      />}

      <ClassroomCollabModal
        open={showClassroomModal}
        onClose={() => setShowClassroomModal(false)}
        workspaceId={workspace.id}
        userId={userId}
        userName={userName}
        userRole={userRole}
        hostKey={hostKey || workspace.hostKey || ''}
        allowedEditors={workspace.allowedEditors}
        onChangeAllowedEditors={(ids) => {
          setWorkspace((prev) => {
            const next = { ...prev, allowedEditors: ids };
            workspaceRef.current = next;
            return next;
          });
          sendWS({ type: 'workspace:meta', allowedEditors: ids });
        }}
        collaborationMode={workspace.collaborationMode}
        presence={presence}
        classroom={classroom}
        pages={workspace.pages}
        onJumpToPage={handleSelectPage}
        followTeacherLocal={followTeacherLocal}
        onToggleFollowTeacher={setFollowTeacherLocal}
        onChangeUserIdentity={(name, role, providedKey) => {
          setUserName(name);
          setUserRole(role);
          safeSetLocalItem('lumina_uname', name);
          safeSetLocalItem('lumina_urole', role);
          if (providedKey) {
            storeHostKey(workspace.id, providedKey);
            setHostKey(providedKey);
          }
          sendWS({ type: 'role:change', userName: name, role, hostKey: providedKey || hostKey });
        }}
        onChangeCollaborationMode={(mode: CollaborationMode) => {
          setWorkspace((prev) => {
            const next = { ...prev, collaborationMode: mode };
            workspaceRef.current = next;
            return next;
          });
          sendWS({ type: 'workspace:meta', collaborationMode: mode });
        }}
        onUpdateClassroom={(patch) => {
          const next = { ...classroom, ...patch };
          setClassroom(next);
          sendWS({ type: 'classroom:state', state: patch });
        }}
        onRaiseHand={() => sendWS({ type: 'classroom:hand_raise' })}
        onLowerHand={(targetUserId) => sendWS({ type: 'classroom:hand_lower', targetUserId })}
        onAskQuestion={(text) => sendWS({ type: 'classroom:question', text })}
        onVotePoll={(pollId, optionId) => sendWS({ type: 'classroom:poll_vote', pollId, optionId })}
        onSubmitQuiz={(quizId, answers) => sendWS({ type: 'classroom:quiz_answer', quizId, answers })}
        onSubmitWork={() => {
          const snap = renderPageToDataUrl(activePage, 800, 450, 'image/jpeg', 0.75);
          sendWS({ type: 'classroom:submission', pageName: activePage.name, snapshotDataUrl: snap });
          showToast('Submitted your board to the teacher');
        }}
        onGiveFeedback={(submissionId, feedback, grade) =>
          sendWS({ type: 'classroom:feedback', submissionId, feedback, grade })
        }
        onSendChat={(text) => sendWS({ type: 'classroom:chat', text })}
        localScreenStream={localScreenStream}
        remoteScreenStream={remoteScreenStream}
        webrtcIceState={webrtcIceState}
        webrtcError={webrtcError}
        onStartScreenBroadcast={(includeAudio) => {
          void startScreenBroadcast(includeAudio);
        }}
        onStopScreenBroadcast={stopScreenBroadcast}
        onReconnectScreenViewer={reconnectViewer}
        onOpenMobileQR={() => setShowMobileConnect(true)}
        onExportClassNotes={async () => {
          const rendered = workspace.pages.map((p) => ({
            name: p.name,
            imageDataUrl: renderPageToDataUrl(p, 1280, 720, 'image/png', 0.92),
            width: 1280,
            height: 720,
          }));
          const bytes = await exportBoardPagesToPDF(rendered, 'fit');
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
          const href = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = href;
          a.download = `${workspace.name.replace(/\s+/g, '_')}_ClassNotes.pdf`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(href), 2000);
        }}
        onInsertScreenCapture={(dataUrl) => {
          handleCreateObject({
            id: uid('img'),
            name: 'Screen Capture',
            type: 'image',
            x: Math.round(viewportCenter.x - 280),
            y: Math.round(viewportCenter.y - 170),
            width: 560,
            height: 340,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            zIndex: activePage.objects.length + 1,
            src: dataUrl,
            fileName: 'screen_capture.png',
            mask: 'rounded',
            filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
          });
          setShowClassroomModal(false);
        }}
      />

      <MobileConnectModal
        open={showMobileConnect}
        onClose={() => setShowMobileConnect(false)}
        realtimeStatus={realtimeStatus}
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        hostKey={hostKey || workspace.hostKey}
        collaborationMode={workspace.collaborationMode}
        presence={presence}
        broadcastViewport={broadcastViewport}
        onToggleBroadcastViewport={setBroadcastViewport}
        followRemoteViewport={followRemoteViewport}
        onToggleFollowRemoteViewport={setFollowRemoteViewport}
        remoteViewportSender={remoteViewportSender}
        onEnableGroupCollab={() => {
          setWorkspace((prev) => {
            const next = { ...prev, collaborationMode: 'group_collab' as CollaborationMode };
            workspaceRef.current = next;
            return next;
          });
          sendWS({ type: 'workspace:meta', collaborationMode: 'group_collab' });
          showToast('Group Collaboration enabled — Co-Editors can draw immediately');
        }}
        onNotify={showToast}
      />

      <WorkspaceHubModal
        open={hubModal.open}
        initialTab={hubModal.tab}
        onClose={() => setHubModal((prev) => ({ ...prev, open: false }))}
        workspaces={workspaceList}
        currentWorkspace={workspace}
        customTemplates={customTemplates}
        onSwitchWorkspace={(id) => {
          const url = new URL(window.location.href);
          url.searchParams.set('room', id);
          window.history.replaceState({}, '', url.toString());
          loadWorkspaceById(id);
        }}
        onCreateWorkspace={async (name, folder, initialPages) => {
          const res = await fetch(apiUrl('/api/workspaces'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, folder, pages: initialPages, ownerId: userId }),
          });
          if (res.ok) {
            const data = await res.json();
            const url = new URL(window.location.href);
            url.searchParams.set('room', data.workspace.id);
            window.history.replaceState({}, '', url.toString());
            if (data.workspace?.hostKey) {
              storeHostKey(data.workspace.id, data.workspace.hostKey);
              setHostKey(data.workspace.hostKey);
            }
            workspaceRef.current = data.workspace;
            setWorkspace(data.workspace);
            setUndoStack([]);
            setRedoStack([]);
            setSelectedIds(new Set());
            setPresence([]);
            refreshWorkspaceList();
          }
        }}
        onDuplicateWorkspace={async (id) => {
          try {
            const key = getStoredHostKey(id);
            const res = await fetch(apiUrl(`/api/workspaces/${encodeURIComponent(id)}/duplicate`), {
              method: 'POST',
              headers: { ...(key ? { 'x-host-key': key } : {}) },
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Duplicate failed');
            const data = await res.json();
            if (data.workspace?.hostKey) storeHostKey(data.workspace.id, data.workspace.hostKey);
            refreshWorkspaceList();
          } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to duplicate workspace', 'error');
          }
        }}
        onToggleStar={async (id, starred) => {
          const key = getStoredHostKey(id);
          await fetch(apiUrl(`/api/workspaces/${encodeURIComponent(id)}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(key ? { 'x-host-key': key } : {}) },
            body: JSON.stringify({ starred, userId, hostKey: key }),
          });
          refreshWorkspaceList();
        }}
        onMoveFolder={async (id, folder) => {
          try {
            const key = getStoredHostKey(id);
            const res = await fetch(apiUrl(`/api/workspaces/${encodeURIComponent(id)}`), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...(key ? { 'x-host-key': key } : {}) },
              body: JSON.stringify({ folder, userId, hostKey: key }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Move failed');
            refreshWorkspaceList();
          } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to move workspace', 'error');
          }
        }}
        onTrashWorkspace={async (id, permanent) => {
          try {
            const key = getStoredHostKey(id);
            const res = await fetch(apiUrl(`/api/workspaces/${encodeURIComponent(id)}${permanent ? '?permanent=true' : ''}`), {
              method: 'DELETE',
              headers: { ...(key ? { 'x-host-key': key } : {}) },
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Delete failed');
            if (id === workspace.id) {
              const nextActive = workspaceList.find((w) => w.id !== id && !w.trashed);
              const fallbackId = nextActive?.id || 'default-board';
              const url = new URL(window.location.href);
              url.searchParams.set('room', fallbackId);
              window.history.replaceState({}, '', url.toString());
              loadWorkspaceById(fallbackId);
            }
            refreshWorkspaceList();
          } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to delete workspace', 'error');
          }
        }}
        onRestoreWorkspace={async (id) => {
          try {
            const key = getStoredHostKey(id);
            const res = await fetch(apiUrl(`/api/workspaces/${encodeURIComponent(id)}/restore`), {
              method: 'POST',
              headers: { ...(key ? { 'x-host-key': key } : {}) },
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Restore failed');
            refreshWorkspaceList();
          } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to restore workspace', 'error');
          }
        }}
        onApplyTemplateAsNewPage={(page) => handleAddPage(page)}
        onSaveCurrentAsTemplate={async (name, category) => {
          const key = hostKey || workspace.hostKey || getStoredHostKey(workspace.id);
          const res = await fetch(apiUrl('/api/templates'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Host-Key': key } : {}) },
            body: JSON.stringify({ name, category, page: activePage, workspaceId: workspace.id }),
          });
          if (res.ok) {
            const data = await res.json();
            setCustomTemplates(data.customTemplates || []);
            showToast(`Saved template "${name}"`);
          }
        }}
        onDeleteCustomTemplate={async (id) => {
          const key = hostKey || workspace.hostKey || getStoredHostKey(workspace.id);
          const res = await fetch(apiUrl(`/api/templates/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspace.id)}`), {
            method: 'DELETE',
            headers: key ? { 'X-Host-Key': key } : {},
          });
          if (res.ok) {
            const data = await res.json();
            setCustomTemplates(data.customTemplates || customTemplates.filter((ct) => ct.id !== id));
            showToast('Deleted custom template');
          }
        }}
        onCreateVersion={async (label) => {
          const key = hostKey || workspace.hostKey;
          const res = await fetch(apiUrl(`/api/workspaces/${encodeURIComponent(workspace.id)}/versions`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(key ? { 'x-host-key': key } : {}) },
            body: JSON.stringify({ label, createdBy: userName }),
          });
          if (res.ok) {
            const data = await res.json();
            setWorkspace((prev) => ({ ...prev, versions: data.versions || [] }));
          }
        }}
        onRestoreVersion={async (versionId) => {
          const key = hostKey || getStoredHostKey(workspace.id);
          const res = await fetch(
            apiUrl(`/api/workspaces/${encodeURIComponent(workspace.id)}/versions/${encodeURIComponent(versionId)}/restore`),
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(key ? { 'x-host-key': key } : {}) },
              body: JSON.stringify({ userId, hostKey: key, actor: userName }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            const merged = { ...data.workspace, hostKey: data.workspace?.hostKey || key || workspaceRef.current.hostKey };
            workspaceRef.current = merged;
            setWorkspace(merged);
            showToast('Restored workspace snapshot');
          } else {
            showToast('Only the host or workspace owner can restore versions');
          }
        }}
      />

      <ExportImportModal
        open={showExportImport}
        onClose={() => setShowExportImport(false)}
        workspace={workspace}
        activePage={activePage}
        selectedIds={selectedIds}
        viewportBox={viewportBox}
        onImportFiles={(files) => handleImportFiles(files)}
        onImportJSONBoard={(jsonText) => {
          try {
            if (!canEdit) throw new Error('You do not have permission to import into this workspace.');
            if (jsonText.length > 10_000_000) throw new Error('Board JSON is too large.');
            const parsed = JSON.parse(jsonText);
            if (Array.isArray(parsed.pages) && parsed.pages.length > 0 && parsed.pages.every((p: unknown) =>
              !!p && typeof p === 'object' && typeof (p as BoardPage).id === 'string' &&
              Array.isArray((p as BoardPage).objects) && Array.isArray((p as BoardPage).layers)
            ) && new Set(parsed.pages.map((p: BoardPage) => p.id)).size === parsed.pages.length) {
              const cur = workspaceRef.current;
              const nextActive = parsed.pages[0]?.id || cur.activePageId;
              const nextDoc = { ...cur, pages: parsed.pages, activePageId: nextActive, updatedAt: Date.now() };
              workspaceRef.current = nextDoc;
              setWorkspace(nextDoc);
              sendWS({ type: 'pages:replace', pages: parsed.pages, activePageId: nextActive });
              scheduleAutosave(nextDoc);
            } else if (Array.isArray(parsed.objects) && parsed.objects.every((o: unknown) => !!o && typeof o === 'object' && typeof (o as BoardObject).id === 'string')) {
              handleAddPage(parsed);
            } else {
              throw new Error('Unsupported or invalid LuminaBoard JSON structure.');
            }
            showToast('Imported JSON board');
          } catch {
            showToast('Invalid JSON board file');
          }
        }}
        onInsertCapturedImage={(dataUrl, title) => {
          handleCreateObject({
            id: uid('img'),
            name: title,
            type: 'image',
            x: Math.round(viewportCenter.x - 260),
            y: Math.round(viewportCenter.y - 160),
            width: 520,
            height: 320,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            zIndex: activePage.objects.length + 1,
            src: dataUrl,
            fileName: `${title}.png`,
            mask: 'rounded',
            filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
          });
        }}
      />

      <SettingsShortcutsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        workspaceId={workspace.id}
        hostKey={hostKey || workspace.hostKey || ''}
        locale={locale}
        onChangeLocale={setLocale}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        highContrast={highContrast}
        onToggleHighContrast={() => setHighContrast((h) => !h)}
        colorblindPalette={colorblindPalette}
        onToggleColorblindPalette={() => setColorblindPalette((c) => !c)}
        palmRejection={palmRejection}
        onTogglePalmRejection={() => setPalmRejection((p) => !p)}
        uiScale={uiScale}
        onChangeUiScale={setUiScale}
        storageFiles={workspace.attachedFiles.map((f) => ({
          fileId: f.fileId,
          fileName: f.fileName,
          size: f.size,
          kind: f.kind,
        }))}
        workspacePageCount={workspace.pages.length}
        workspaceVersionCount={workspace.versions?.length || 0}
        onDeleteFiles={async (fileIds) => {
          const key = hostKey || workspace.hostKey || getStoredHostKey(workspace.id);
          const res = await fetch(apiUrl('/api/files/delete'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Host-Key': key } : {}) },
            body: JSON.stringify({ workspaceId: workspace.id, fileIds }),
          });
          if (!res.ok) throw new Error('Failed to delete files');
          setWorkspace((prev) => {
            const next = {
              ...prev,
              attachedFiles: prev.attachedFiles.filter((f) => !fileIds.includes(f.fileId)),
            };
            workspaceRef.current = next;
            return next;
          });
        }}
      />

      <CommandPaletteModal
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        pages={workspace.pages}
        darkMode={darkMode}
        onSelectTool={selectLeftTool}
        onSetViewMode={setViewMode}
        onSelectPage={handleSelectPage}
        onAddPage={() => handleAddPage()}
        onFitScreen={fitToScreen}
        onZoom100={() => {
          setZoom(1);
          setPanX(0);
          setPanY(0);
          setRotationDeg(0);
        }}
        onToggleSnapGrid={() => setSnapToGrid((v) => !v)}
        onToggleRulers={() => setShowRulers((v) => !v)}
        onToggleMinimap={() => setShowMinimap((v) => !v)}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onOpenAI={(intent) => {
          if (!intent) {
            setShowAI(true);
          } else if (intent === 'chat') {
            setShowAI(true);
            setAiQuickIntent({ section: 'chat', nonce: Date.now() });
          } else {
            handleQuickAIAction(intent);
          }
        }}
        onOpenMath={() => {
          setMathModalTab('equation');
          setEditingMathGraphObj(null);
          setShowMathModal(true);
        }}
        onOpenCalculator={() => setShowCalculator(true)}
        onOpenClassroom={() => setShowClassroomModal(true)}
        onOpenExportImport={() => setShowExportImport(true)}
        onOpenTemplates={() => setHubModal({ open: true, tab: 'templates' })}
        onOpenSettings={() => setShowSettings(true)}
        onOpenFindReplace={() => setShowFindReplace(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDuplicateSelected={handleDuplicateSelected}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        onCopyStyle={() => handleCopyStyle()}
        onPasteStyle={() => handlePasteStyle()}
        onAutoLayout={() => handleAutoLayoutDiagram('TB')}
        onClearInk={() => {
          const remaining = activePage.objects.filter((o) => o.type !== 'stroke');
          if (remaining.length === activePage.objects.length) {
            showToast('No ink strokes on this page');
            return;
          }
          replacePageObjects(remaining, true);
          setSelectedIds(new Set());
          showToast('Cleared all ink strokes (Ctrl+Z to undo)');
        }}
        onStartPresent={() => {
          setViewMode('presentation');
          setFullscreenPresenting(true);
        }}
      />

      {/* Toast Notification */}
      {toastMsg !== null && (
        <div
          role={toastMsg.kind === 'error' ? 'alert' : 'status'}
          onClick={() => setToastMsg(null)}
          className={`fixed bottom-16 md:bottom-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-xs font-medium shadow-lg max-w-[90vw] text-center cursor-pointer flex items-center gap-2 ${
            toastMsg.kind === 'error'
              ? 'bg-red-600 text-white dark:bg-red-500'
              : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          }`}
        >
          <span>{toastMsg.text}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setToastMsg(null); }}
            className="ml-1 opacity-70 hover:opacity-100 font-bold text-sm leading-none"
            aria-label="Dismiss notification"
          >
            x
          </button>
        </div>
      )}
      </React.Suspense>
    </div>
  );
}
