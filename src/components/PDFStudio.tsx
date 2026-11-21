import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  ArrowUpToLine,
  Bold,
  BookmarkPlus,
  BookOpen,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Columns2,
  Copy,
  Crop,
  Download,
  Droplets,
  Eraser,
  FileArchive,
  FileCheck2,
  FileCode2,
  FileDown,
  FileLock2,
  FilePlus2,
  FileSearch,
  FileText,
  FolderOpen,
  FormInput,
  Hand,
  Hash,
  HelpCircle,
  Highlighter,
  ImagePlus,
  Italic,
  LayoutGrid,
  Link2,
  ListChecks,
  Lock,
  Maximize2,
  Merge,
  MessageSquare,
  MessageSquareText,
  Minimize2,
  Minus,
  MoreHorizontal,
  MousePointer2,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeft,
  PanelRightOpen,
  PanelTopOpen,
  Pen,
  Pencil,
  PenTool,
  Plus,
  Printer,
  Redo2,
  Replace,
  RotateCcw,
  RotateCw,
  Ruler,
  ScanText,
  Scissors,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Stamp,
  StickyNote,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Wand2,
  Undo2,
  Unlock,
  Upload,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AttachedFileMeta, LocaleCode, PDFAnnotation } from '../types/smartboard';
import { apiUrl, resourceUrl } from '../utils/api';
import { uid } from '../utils/geometry';
import { getActiveSpeechWordIndex, getSpeechWordRanges } from '../utils/speech';
import {
  applyRedactionsToPDF,
  cropPDFPages,
  exportAnnotatedOriginalPDF,
  exportPDFPagesToImagesZip,
  extractPDFMetadata,
  extractPDFOutline,
  extractPDFPageLinks,
  extractPDFPageWidgets,
  extractSinglePageText,
  loadPDFDocumentAndThumbnails,
  manipulatePDFPages,
  mergeMultipleBuffersAndImages,
  parsePageRangeExpression,
  renderPDFPageHighResDataUrl,
  renderSinglePageThumbnail,
  renderWatermarkFooterOverlayPng,
  replacePDFPages,
  splitPDFByChunkSize,
  updatePDFDocumentMetadata,
  type LoadedPDFPage,
  type PDFDocMetadata,
  type PDFDocumentProxy,
  type PDFFormWidget,
  type PDFOutlineItem,
  type PDFPageLink,
  type PDFTextWord,
} from '../utils/pdfPptx';
import {
  distToSegment,
  formatMeasureDistance,
  renderAnnotationsToCanvas,
  renderFormValuesToCanvas,
  rotateAnnotationCoords,
  type MeasureUnit,
} from './pdf/PDFPageHelpers';
import {
  PDFPageSurface,
  type DrawSessionRef,
  type PageToolMode,
  type PendingNoteState,
  type TextSelMenuState,
} from './pdf/PDFPageSurface';
import { PDFPropertiesPanel, type PDFToolDefaults } from './pdf/PDFPropertiesPanel';
import {
  PDFPageOrganizerGrid,
  PDFReaderModeHud,
  PDFSidebarRailAndDrawer,
  PDFSplitComparePane,
  type SidebarTabKind,
} from './pdf/PDFReaderAndSidebar';
import {
  PDFCombineModal,
  PDFCropModal,
  PDFMetadataModal,
  PDFPasswordModal,
  PDFPrintModal,
  PDFShortcutsModal,
  PDFSignatureModal,
  PDFSplitModal,
  PDFWatermarkModal,
  type CombineQueueItem,
  type WatermarkConfig,
} from './pdf/PDFToolModals';

const SAVED_SIG_KEY = 'lumina_pdf_saved_signature_v1';
const VIEW_MEMORY_KEY = 'lumina_pdf_view_state_v1';
const READER_PROGRESS_KEY = 'lumina_pdf_reader_progress_v1';
const COLOR_PRESETS = ['#FACC15', '#EF4444', '#2563EB', '#10B981', '#0F172A'];
const STAMP_PRESETS = [
  'APPROVED', 'REVIEWED', 'IMPORTANT', 'CONFIDENTIAL', 'DRAFT',
  'COPY', 'ORIGINAL', 'VOID', 'FINAL', 'NOT APPROVED',
  'PRELIMINARY', 'FOR REVIEW', 'URGENT', 'RECEIVED', 'COMPLETED',
];
const STAMP_DATE_PRESETS = ['Received [DATE]', 'Approved [DATE]'];
const STAMP_STYLES: { value: 'filled' | 'border' | 'diagonal'; label: string }[] = [
  { value: 'filled', label: 'Filled' },
  { value: 'border', label: 'Border Only' },
  { value: 'diagonal', label: 'Diagonal Watermark' },
];

type ShapeChoice = 'arrow' | 'line' | 'rect' | 'circle';

type OpenDocSession = {
  id: string;
  fileName: string;
  meta: AttachedFileMeta | null;
  docMeta?: PDFDocMetadata | null;
  bytes: ArrayBuffer;
  doc: PDFDocumentProxy;
  pages: LoadedPDFPage[];
  outline: PDFOutlineItem[];
  activePageNum: number;
};

type PDFStudioProps = {
  workspaceId: string;
  hostKey: string;
  locale: LocaleCode;
  attachedFiles: AttachedFileMeta[];
  savedAnnotationsByFile?: Record<string, PDFAnnotation[]>;
  onSyncAnnotations?: (fileId: string, anns: PDFAnnotation[]) => void;
  remoteView?: { fileId: string; scrollProgress: number; timestamp: number } | null;
  onSyncView?: (fileId: string, scrollProgress: number) => void;
  onUploadFileMeta: (meta: AttachedFileMeta) => void;
  onUpdateFileMeta?: (meta: AttachedFileMeta) => void;
  onDeleteFiles: (fileIds: string[]) => Promise<void>;
  onSendPageToBoard: (pageDataUrl: string, title: string, pageWidth?: number, pageHeight?: number) => void;
  onAskAIWithPage?: (prompt: string, pageText: string) => void;
  onReadAloudText?: (text: string, onWordChange?: (wordIndex: number | null) => void) => void;
  onStopReadAloudText?: () => void;
  hideTopBar?: boolean;
  onShowTopBar?: () => void;
};

type ViewMemoryEntry = {
  page?: number;
  zoomMode?: 'fit_width' | 'fit_page' | 'custom';
  zoomScale?: number;
  readerTheme?: 'light' | 'sepia' | 'dark';
  lastAccessed?: number;
};

type ReaderSpeechProgress = {
  pageNumber: number;
  charIndex: number;
  charEndIndex?: number;
};

type SpeechHighlightRect = { x: number; y: number; w: number; h: number };

type SelectedSpeechHighlight = {
  pageNumber: number;
  wordRects: SpeechHighlightRect[][];
  activeWordIndex: number;
};

function getSelectionWordRects(range: Range, pageRect: DOMRect, selectedText: string): SpeechHighlightRect[][] {
  const wordRects = getSpeechWordRanges(selectedText).map(() => [] as SpeechHighlightRect[]);
  if (wordRects.length === 0 || pageRect.width <= 0 || pageRect.height <= 0) return wordRects;
  const root = range.commonAncestorContainer;
  const textNodes: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) {
    textNodes.push(root as Text);
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node as Text);
      node = walker.nextNode();
    }
  }

  let wordIndex = 0;
  for (const textNode of textNodes) {
    if (!range.intersectsNode(textNode)) continue;
    const startOffset = range.startContainer === textNode ? range.startOffset : 0;
    const endOffset = range.endContainer === textNode ? range.endOffset : textNode.data.length;
    const selectedNodeText = textNode.data.slice(startOffset, endOffset);
    for (const word of getSpeechWordRanges(selectedNodeText)) {
      if (wordIndex >= wordRects.length) break;
      const wordRange = document.createRange();
      wordRange.setStart(textNode, startOffset + word.start);
      wordRange.setEnd(textNode, startOffset + word.end);
      wordRects[wordIndex] = Array.from(wordRange.getClientRects())
        .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
        .map((rect) => ({
          x: (rect.left - pageRect.left) / pageRect.width,
          y: (rect.top - pageRect.top) / pageRect.height,
          w: rect.width / pageRect.width,
          h: rect.height / pageRect.height,
        }));
      wordIndex += 1;
    }
  }
  return wordRects;
}

function nextSpeechChunkEnd(text: string, start: number) {
  const maxEnd = Math.min(text.length, start + 1200);
  if (maxEnd === text.length) return maxEnd;
  const minEnd = start + 600;
  const sentenceEnd = Math.max(
    text.lastIndexOf('. ', maxEnd),
    text.lastIndexOf('? ', maxEnd),
    text.lastIndexOf('! ', maxEnd),
    text.lastIndexOf('।', maxEnd),
    text.lastIndexOf('\n', maxEnd)
  );
  if (sentenceEnd >= minEnd) return sentenceEnd + 1;
  const wordEnd = text.lastIndexOf(' ', maxEnd);
  return wordEnd > start ? wordEnd : maxEnd;
}

const VIEW_MEMORY_MAX = 100;
const VIEW_MEMORY_PRUNE_TO = 80;

function readViewMemory(fileKey: string): ViewMemoryEntry | null {
  try {
    const raw = localStorage.getItem(VIEW_MEMORY_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, ViewMemoryEntry>;
    const entry = map[fileKey];
    if (!entry) return null;
    // Update lastAccessed on read
    entry.lastAccessed = Date.now();
    map[fileKey] = entry;
    try {
      localStorage.setItem(VIEW_MEMORY_KEY, JSON.stringify(map));
    } catch {
      // ignore write errors on read-access update
    }
    return entry;
  } catch {
    return null;
  }
}

function writeViewMemory(fileKey: string, data: { page: number; zoomMode: 'fit_width' | 'fit_page' | 'custom'; zoomScale: number; readerTheme?: 'light' | 'sepia' | 'dark' }) {
  try {
    const raw = localStorage.getItem(VIEW_MEMORY_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, ViewMemoryEntry>) : {};
    map[fileKey] = { ...data, lastAccessed: Date.now() };
    // Prune oldest entries if over limit
    const keys = Object.keys(map);
    if (keys.length > VIEW_MEMORY_MAX) {
      const sorted = keys.sort((a, b) => (map[a].lastAccessed || 0) - (map[b].lastAccessed || 0));
      const toRemove = sorted.slice(0, keys.length - VIEW_MEMORY_PRUNE_TO);
      for (const k of toRemove) {
        delete map[k];
      }
    }
    localStorage.setItem(VIEW_MEMORY_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export const PDFStudio: React.FC<PDFStudioProps> = ({
  workspaceId,
  hostKey,
  locale,
  attachedFiles,
  savedAnnotationsByFile,
  onSyncAnnotations,
  remoteView,
  onSyncView,
  onUploadFileMeta,
  onUpdateFileMeta,
  onDeleteFiles,
  onSendPageToBoard,
  onAskAIWithPage,
  onReadAloudText,
  onStopReadAloudText,
  hideTopBar = false,
  onShowTopBar,
}) => {
  const [openTabs, setOpenTabs] = useState<OpenDocSession[]>([]);
  const openTabsRef = useRef<OpenDocSession[]>([]);
  openTabsRef.current = openTabs;
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const activeTab = useMemo(
    () => openTabs.find((t) => t.id === activeTabId) || openTabs[0] || null,
    [openTabs, activeTabId]
  );
  const activeTabIdRef = useRef<string | null>(null);
  activeTabIdRef.current = activeTab?.id || null;

  const pdfMeta = activeTab?.meta || null;
  const pdfBytes = activeTab?.bytes || null;
  const pdfDoc = activeTab?.doc || null;
  const pages = activeTab?.pages || [];
  const outline = activeTab?.outline || [];
  const activePageNum = activeTab?.activePageNum || 1;
  const readerProgressStorageKey = `${READER_PROGRESS_KEY}:${workspaceId}:${pdfMeta?.fileId || activeTab?.id || ''}`;

  const setActivePageNum = useCallback(
    (updater: number | ((prev: number) => number)) => {
      if (!activeTab) return;
      setOpenTabs((tabs) =>
        tabs.map((t) => {
          if (t.id !== activeTab.id) return t;
          const next = typeof updater === 'function' ? updater(t.activePageNum) : updater;
          const clamped = Math.max(1, Math.min(t.pages.length || 1, next));
          return { ...t, activePageNum: clamped };
        })
      );
    },
    [activeTab]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const autoLoadedRef = useRef<Set<string>>(new Set());
  const [zoomMode, setZoomMode] = useState<'fit_width' | 'fit_page' | 'custom'>('fit_width');
  const [zoomScale, setZoomScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [readerMode, setReaderMode] = useState(false);
  const [readerHudVisible, setReaderHudVisible] = useState(true);
  const readerHudVisibleRef = useRef(true);
  const [readerHudPinned, setReaderHudPinned] = useState(false);
  const [readerOutlineOpen, setReaderOutlineOpen] = useState(false);
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(1);
  const [readerSpeechPlaying, setReaderSpeechPlaying] = useState(false);
  const [readerSpeechProgress, setReaderSpeechProgress] = useState<ReaderSpeechProgress | null>(null);
  const readerHudTimerRef = useRef<number | null>(null);
  const readerSpeechProgressRef = useRef<ReaderSpeechProgress | null>(null);
  const readerSpeechTokenRef = useRef(0);
  const readerAudioRef = useRef<HTMLAudioElement | null>(null);
  const readerFollowScrollAtRef = useRef(0);
  const speakReaderFromRef = useRef<(pageNumber: number, charIndex: number, token: number) => Promise<void>>(async () => {});

  useEffect(() => {
    readerSpeechTokenRef.current += 1;
    readerAudioRef.current?.pause();
    readerAudioRef.current = null;
    setReaderSpeechPlaying(false);
    try {
      const saved = localStorage.getItem(readerProgressStorageKey);
      const progress = saved ? (JSON.parse(saved) as ReaderSpeechProgress) : null;
      if (progress && Number.isInteger(progress.pageNumber) && Number.isInteger(progress.charIndex)) {
        readerSpeechProgressRef.current = progress;
        setReaderSpeechProgress(progress);
      } else {
        readerSpeechProgressRef.current = null;
        setReaderSpeechProgress(null);
      }
    } catch {
      readerSpeechProgressRef.current = null;
      setReaderSpeechProgress(null);
    }
    return () => {
      readerSpeechTokenRef.current += 1;
      readerAudioRef.current?.pause();
      readerAudioRef.current = null;
    };
  }, [readerProgressStorageKey]);

  const [layoutMode, setLayoutMode] = useState<'single' | 'scroll' | 'spread'>('single');
  const [spreadCoverPage, setSpreadCoverPage] = useState(true);
  const [readerTheme, setReaderTheme] = useState<'light' | 'sepia' | 'dark'>('light');
  const [sidebarMode, setSidebarMode] = useState<'expanded' | 'minimal' | 'hidden'>(() =>
    typeof window !== 'undefined' ? (window.innerWidth < 640 ? 'hidden' : window.innerWidth < 1024 ? 'minimal' : 'expanded') : 'expanded'
  );
  useEffect(() => {
    let mode: 'expanded' | 'minimal' | 'hidden' =
      window.innerWidth < 640 ? 'hidden' : window.innerWidth < 1024 ? 'minimal' : 'expanded';
    const onResize = () => {
      const nextMode =
        window.innerWidth < 640 ? 'hidden' : window.innerWidth < 1024 ? 'minimal' : 'expanded';
      if (nextMode === mode) return;
      mode = nextMode;
      setSidebarMode(nextMode);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(264);
  const resizingSidebarRef = useRef<{ active: boolean; startX: number; startW: number }>({
    active: false,
    startX: 0,
    startW: 264,
  });
  const [sidebarTab, setSidebarTab] = useState<SidebarTabKind>('pages');
  const [outlineFilter, setOutlineFilter] = useState('');
  const [deletingPdfs, setDeletingPdfs] = useState(false);
  const [linkHistory, setLinkHistory] = useState<number[]>([]);
  const linkHistoryRef = useRef<number[]>([]);
  linkHistoryRef.current = linkHistory;
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [selectedOrgPages, setSelectedOrgPages] = useState<Set<number>>(new Set());

  // Split Reference Pane
  const [splitView, setSplitView] = useState(false);
  const [splitRefTabId, setSplitRefTabId] = useState<string>('');
  const [splitRefPageNum, setSplitRefPageNum] = useState(1);
  const [splitSyncScroll, setSplitSyncScroll] = useState(false);
  const [splitOrientation, setSplitOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [splitRatio, setSplitRatio] = useState(50);
  // Visual Compare / Diff
  const [compareMode, setCompareMode] = useState(false);
  const [diffResultUrl, setDiffResultUrl] = useState<string | null>(null);
  const [diffSimilarity, setDiffSimilarity] = useState<number>(0);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const splitWrapRef = useRef<HTMLDivElement>(null);
  const splitScrollElRef = useRef<HTMLDivElement | null>(null);
  const syncScrollSourceRef = useRef<'main' | 'split' | null>(null);
  const splitResizingRef = useRef<{ active: boolean }>({ active: false });

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchCase, setSearchMatchCase] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  // Tools & Annotations
  const [annTool, setAnnTool] = useState<PageToolMode>('select');
  const [shapeChoice, setShapeChoice] = useState<ShapeChoice>('rect');
  const [shapesMenuPos, setShapesMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showProperties, setShowProperties] = useState(false);
  const [toolDefaults, setToolDefaults] = useState<PDFToolDefaults>({
    color: '#FACC15',
    fillColor: 'transparent',
    strokeWidth: 2.5,
    strokeStyle: 'solid',
    borderRadius: 0,
    opacity: 1,
    fontFamily: 'DM Sans',
    fontSize: 13,
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    textAlign: 'left',
    rotation: 0,
    measureUnit: 'mm',
    measureScale: 1,
    stampText: 'APPROVED',
    stampStyle: 'filled',
    authorName: 'Reviewer',
  });
  const annColor = toolDefaults.color;
  const strokeWidth = toolDefaults.strokeWidth;
  const stampText = toolDefaults.stampText;
  const measureUnit = toolDefaults.measureUnit;
  const setAnnColor = (color: string) => setToolDefaults((d) => ({ ...d, color }));
  const setStrokeWidth = (sw: number) => setToolDefaults((d) => ({ ...d, strokeWidth: sw }));
  const setStampText = (st: string) => setToolDefaults((d) => ({ ...d, stampText: st }));
  const setMeasureUnit = (u: MeasureUnit) => setToolDefaults((d) => ({ ...d, measureUnit: u }));

  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const [annotations, setAnnotations] = useState<PDFAnnotation[]>([]);
  const annotationsRef = useRef<PDFAnnotation[]>([]);
  annotationsRef.current = annotations;
  const copiedAnnRef = useRef<PDFAnnotation | null>(null);
  const tabAnnotationsRef = useRef<Record<string, PDFAnnotation[]>>({});
  const tabUndoRef = useRef<Record<string, Record<number, PDFAnnotation[][]>>>({});
  const tabRedoRef = useRef<Record<string, Record<number, PDFAnnotation[][]>>>({});
  const tabLinksRef = useRef<Record<string, Record<number, PDFPageLink[]>>>({});
  const tabWidgetsRef = useRef<Record<string, Record<number, PDFFormWidget[]>>>({});
  const tabFormValuesRef = useRef<Record<string, Record<string, string | boolean>>>({});
  const tabLinkHistoryRef = useRef<Record<string, number[]>>({});
  const tabZoomRef = useRef<Record<string, { zoomMode: 'fit_width' | 'fit_page' | 'custom'; zoomScale: number }>>({});
  const splitSyncCooldownUntilRef = useRef<number>(0);
  const fetchedLinksPagesRef = useRef<Set<number>>(new Set());
  const fetchedWidgetsPagesRef = useRef<Set<number>>(new Set());
  const programmaticScrollUntilRef = useRef<number>(0);
  const selectionStartPageRef = useRef<number | null>(null);

  const [undoByPage, setUndoByPage] = useState<Record<number, PDFAnnotation[][]>>({});
  const undoByPageRef = useRef<Record<number, PDFAnnotation[][]>>({});
  undoByPageRef.current = undoByPage;
  const [redoByPage, setRedoByPage] = useState<Record<number, PDFAnnotation[][]>>({});
  const redoByPageRef = useRef<Record<number, PDFAnnotation[][]>>({});
  redoByPageRef.current = redoByPage;

  // Links, AcroForms, OCR & Export Settings
  const [pageLinksByPage, setPageLinksByPage] = useState<Record<number, PDFPageLink[]>>({});
  const pageLinksByPageRef = useRef<Record<number, PDFPageLink[]>>({});
  pageLinksByPageRef.current = pageLinksByPage;
  const [widgetsByPage, setWidgetsByPage] = useState<Record<number, PDFFormWidget[]>>({});
  const widgetsByPageRef = useRef<Record<number, PDFFormWidget[]>>({});
  widgetsByPageRef.current = widgetsByPage;
  const [formsEnabled, setFormsEnabled] = useState(true);
  const [highlightFormFields, setHighlightFormFields] = useState(false);
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const formValuesRef = useRef<Record<string, string | boolean>>({});
  formValuesRef.current = formValues;
  const zoomModeRef = useRef<'fit_width' | 'fit_page' | 'custom'>(zoomMode);
  zoomModeRef.current = zoomMode;
  const zoomScaleRef = useRef<number>(zoomScale);
  zoomScaleRef.current = zoomScale;
  const [watermarkCfg, setWatermarkCfg] = useState<WatermarkConfig>({
    text: '',
    opacity: 0.22,
    angle: 35,
    color: '#DC2626',
    fontSize: 44,
    position: 'center',
    scope: 'all',
    rangeExpr: '',
    headerLeft: '',
    headerRight: '',
    footerCenter: '',
    pageNumbers: false,
    batesPrefix: '',
    batesStart: 1,
  });

  // Modals & Popovers
  const [passwordReq, setPasswordReq] = useState<{
    reason: 'need_password' | 'incorrect_password';
    resolve: (pw: string | null) => void;
  } | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showWatermarkModal, setShowWatermarkModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showPageText, setShowPageText] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showA11yPanel, setShowA11yPanel] = useState(false);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [showAutoFormDetect, setShowAutoFormDetect] = useState(false);
  const [showSanitizeModal, setShowSanitizeModal] = useState(false);
  const [showHeaderFooterModal, setShowHeaderFooterModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const [zoomMenuPos, setZoomMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [exportMenuPos, setExportMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [moreMenuPos, setMoreMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [workspaceMenuPos, setWorkspaceMenuPos] = useState<{ bottom: number; right: number } | null>(null);
  const [hideBottomBar, setHideBottomBar] = useState<boolean>(() => {
    try {
      return localStorage.getItem('lumina_pdf_hide_bottom_bar_v1') === '1';
    } catch {
      return false;
    }
  });
  const toggleBottomBar = useCallback((next?: boolean) => {
    setHideBottomBar((prev) => {
      const val = typeof next === 'boolean' ? next : !prev;
      if (val) setWorkspaceMenuPos(null);
      try {
        localStorage.setItem('lumina_pdf_hide_bottom_bar_v1', val ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return val;
    });
  }, []);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    pageNumber: number;
    normX?: number;
    normY?: number;
    annId?: string;
  } | null>(null);
  const [pageJumpInput, setPageJumpInput] = useState('1');

  const [loading, setLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pendingNote, setPendingNote] = useState<PendingNoteState | null>(null);
  const [textSelMenu, setTextSelMenu] = useState<TextSelMenuState | null>(null);
  const [selectedSpeechHighlight, setSelectedSpeechHighlight] = useState<SelectedSpeechHighlight | null>(null);
  const [snipRect, setSnipRect] = useState<{ pageNumber: number; x: number; y: number; w: number; h: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);

  const [savedSigUrl, setSavedSigUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SAVED_SIG_KEY);
    } catch {
      return null;
    }
  });

  const [viewerSize, setViewerSize] = useState({ width: 900, height: 700 });
  const viewerRef = useRef<HTMLDivElement>(null);
  const remoteScrollUntilRef = useRef(0);
  const lastViewSyncRef = useRef(0);
  const bottomTabsRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const insertImagePageInputRef = useRef<HTMLInputElement>(null);
  const pendingImgPosRef = useRef<{ pageNumber: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!activeTab?.id || !bottomTabsRef.current) return;
    const activeEl = bottomTabsRef.current.querySelector(
      `[data-pdf-tab-id="${CSS.escape(activeTab.id)}"]`
    ) as HTMLElement | null;
    activeEl?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeTab?.id]);

  const drawRef: DrawSessionRef = useRef({
    active: false,
    mode: 'draw',
    pageNumber: 1,
    startX: 0,
    startY: 0,
  });

  const requestPasswordAsync = useCallback((reason: 'need_password' | 'incorrect_password') => {
    return new Promise<string | null>((resolve) => {
      setPasswordReq({ reason, resolve });
    });
  }, []);

  // Fullscreen sync
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (fullscreen || document.fullscreenElement) {
      setFullscreen(false);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // ignore
        }
      }
    } else {
      setFullscreen(true);
      try {
        if (containerRef.current?.requestFullscreen) await containerRef.current.requestFullscreen();
      } catch {
        // CSS fallback active
      }
    }
  }, [fullscreen]);

  // Reader HUD auto-hide & Auto-scroll
  const pingReaderHud = useCallback(() => {
    if (!readerHudVisibleRef.current) {
      readerHudVisibleRef.current = true;
      setReaderHudVisible(true);
    }
    if (readerHudTimerRef.current) window.clearTimeout(readerHudTimerRef.current);
    readerHudTimerRef.current = window.setTimeout(() => {
      readerHudVisibleRef.current = false;
      setReaderHudVisible(false);
    }, 3200);
  }, []);

  useEffect(() => {
    if (!readerMode) {
      if (readerHudTimerRef.current) window.clearTimeout(readerHudTimerRef.current);
      setReaderOutlineOpen(false);
      setAutoScrollActive(false);
      return;
    }
    pingReaderHud();
    return () => {
      if (readerHudTimerRef.current) window.clearTimeout(readerHudTimerRef.current);
    };
  }, [readerMode, pingReaderHud]);

  useEffect(() => {
    if (!readerMode || !autoScrollActive || layoutMode !== 'scroll') return;
    let rafId = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const viewer = viewerRef.current;
      if (viewer) {
        const maxScroll = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        const nextTop = Math.min(
          maxScroll,
          viewer.scrollTop + (autoScrollSpeed * 55 * dt) / 1000
        );
        viewer.scrollTop = nextTop;
        if (maxScroll > 0 && nextTop >= maxScroll) {
          setAutoScrollActive(false);
          return;
        }
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [readerMode, autoScrollActive, autoScrollSpeed, layoutMode]);

  // Sidebar resize listener
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizingSidebarRef.current.active) return;
      const delta = e.clientX - resizingSidebarRef.current.startX;
      setSidebarWidth(Math.max(210, Math.min(420, resizingSidebarRef.current.startW + delta)));
    };
    const onUp = () => {
      resizingSidebarRef.current.active = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // Responsive breakpoint & split divider resize listener
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsNarrowViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!splitResizingRef.current.active || !splitWrapRef.current) return;
      const rect = splitWrapRef.current.getBoundingClientRect();
      const effHorizontal = isNarrowViewport || splitOrientation === 'horizontal';
      if (effHorizontal) {
        if (rect.height <= 0) return;
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        setSplitRatio(Math.max(25, Math.min(75, pct)));
      } else {
        if (rect.width <= 0) return;
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setSplitRatio(Math.max(25, Math.min(75, pct)));
      }
    };
    const onUp = () => {
      splitResizingRef.current.active = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isNarrowViewport, splitOrientation]);

  const handleMainViewerScroll = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer && onSyncView && pdfMeta?.fileId && Date.now() >= remoteScrollUntilRef.current) {
      const now = Date.now();
      if (now - lastViewSyncRef.current >= 80) {
        lastViewSyncRef.current = now;
        const maxScroll = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        onSyncView(pdfMeta.fileId, maxScroll > 0 ? viewer.scrollTop / maxScroll : 0);
      }
    }
    if (!splitView || !splitSyncScroll) return;
    if (syncScrollSourceRef.current === 'split' || Date.now() < splitSyncCooldownUntilRef.current) return;
    const mEl = viewerRef.current;
    const sEl = splitScrollElRef.current;
    if (!mEl || !sEl) return;
    const maxMainY = Math.max(0, mEl.scrollHeight - mEl.clientHeight);
    const maxMainX = Math.max(0, mEl.scrollWidth - mEl.clientWidth);
    const maxSplitY = Math.max(0, sEl.scrollHeight - sEl.clientHeight);
    const maxSplitX = Math.max(0, sEl.scrollWidth - sEl.clientWidth);
    const nextTop = maxMainY > 0 && maxSplitY > 0 ? (mEl.scrollTop / maxMainY) * maxSplitY : sEl.scrollTop;
    const nextLeft = maxMainX > 0 && maxSplitX > 0 ? (mEl.scrollLeft / maxMainX) * maxSplitX : sEl.scrollLeft;
    if (Math.abs(sEl.scrollTop - nextTop) < 1.5 && Math.abs(sEl.scrollLeft - nextLeft) < 1.5) return;
    syncScrollSourceRef.current = 'main';
    splitSyncCooldownUntilRef.current = Date.now() + 70;
    if (maxMainY > 0 && maxSplitY > 0) sEl.scrollTop = nextTop;
    if (maxMainX > 0 && maxSplitX > 0) sEl.scrollLeft = nextLeft;
    requestAnimationFrame(() => {
      if (syncScrollSourceRef.current === 'main') syncScrollSourceRef.current = null;
    });
  }, [onSyncView, pdfMeta?.fileId, splitSyncScroll, splitView]);

  useEffect(() => {
    if (!remoteView || remoteView.fileId !== pdfMeta?.fileId || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const maxScroll = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
    remoteScrollUntilRef.current = Date.now() + 180;
    viewer.scrollTop = maxScroll * Math.max(0, Math.min(1, remoteView.scrollProgress));
  }, [activeTab?.id, layoutMode, pages.length, pdfMeta?.fileId, remoteView, viewerSize.height, viewerSize.width]);

  // Viewport ResizeObserver
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const pad = entry.contentRect.width < 640 ? 20 : 48;
        const nextW = Math.max(240, Math.floor(entry.contentRect.width) - pad);
        const nextH = Math.max(280, Math.floor(entry.contentRect.height) - 48);
        setViewerSize((prev) =>
          Math.abs(prev.width - nextW) < 2 && Math.abs(prev.height - nextH) < 2
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pages.length, sidebarMode, sidebarWidth, organizerOpen, showPageText, showProperties, readerMode, fullscreen, splitView, splitOrientation]);

  // Flush any in-progress drawing stroke and sync annotations before teardown
  const flushActiveStrokeAndSync = useCallback(() => {
    if (drawRef.current.active) {
      drawRef.current.active = false;
    }
    const curTabId = activeTabIdRef.current;
    const curTab = openTabsRef.current.find((t) => t.id === curTabId);
    const fileId = curTab?.meta?.fileId;
    if (fileId && onSyncAnnotations) {
      const anns = annotationsRef.current;
      onSyncAnnotations(fileId, anns);
    }
  }, [onSyncAnnotations]);

  // Cleanup docs on unmount + flush annotations
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushActiveStrokeAndSync();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushActiveStrokeAndSync();
      openTabsRef.current.forEach((t) => {
        void t.doc.cleanup().catch(() => {});
      });
    };
  }, [flushActiveStrokeAndSync]);

  // Persist view memory (last page & zoom) per document
  useEffect(() => {
    if (!activeTab) return;
    const key = activeTab.meta?.fileId || activeTab.fileName;
    writeViewMemory(key, { page: activePageNum, zoomMode, zoomScale, readerTheme });
  }, [activeTab, activePageNum, zoomMode, zoomScale, readerTheme]);

  // Progressive background hydration prioritizing pages near activePageNum (batched updates)
  useEffect(() => {
    if (!activeTab || !activeTab.doc) return;
    const pendingPages = activeTab.pages
      .filter((p) => !p.thumbLoaded || !p.textLoaded)
      .sort((a, b) => Math.abs(a.pageNumber - activePageNum) - Math.abs(b.pageNumber - activePageNum));
    if (pendingPages.length === 0) return;

    let cancelled = false;
    const tabId = activeTab.id;
    const doc = activeTab.doc;
    const batch: Record<number, { dataUrl: string; width: number; height: number; text: string; textItems: PDFTextWord[] }> = {};

    const flushBatch = () => {
      const keys = Object.keys(batch);
      if (keys.length === 0) return;
      const snapshot = { ...batch };
      keys.forEach((k) => delete batch[Number(k)]);
      setOpenTabs((tabs) =>
        tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                pages: t.pages.map((pg) => {
                  const hit = snapshot[pg.pageNumber];
                  if (!hit) return pg;
                  return {
                    ...pg,
                    dataUrl: pg.dataUrl || hit.dataUrl,
                    width: hit.width,
                    height: hit.height,
                    text: pg.text || hit.text,
                    textItems: pg.textItems?.length ? pg.textItems : hit.textItems,
                    thumbLoaded: true,
                    textLoaded: true,
                  };
                }),
              }
            : t
        )
      );
    };

    (async () => {
      for (let i = 0; i < pendingPages.length; i++) {
        if (cancelled) return;
        const pNum = pendingPages[i].pageNumber;
        try {
          const [thumb, txt] = await Promise.all([
            renderSinglePageThumbnail(doc, pNum, 0.36),
            extractSinglePageText(doc, pNum),
          ]);
          if (cancelled) return;
          batch[pNum] = {
            dataUrl: thumb.dataUrl,
            width: thumb.width,
            height: thumb.height,
            text: txt.pageText,
            textItems: txt.textItems,
          };
          const isNearActive = Math.abs(pNum - activePageNum) <= 2;
          if (isNearActive || Object.keys(batch).length >= 4 || i === pendingPages.length - 1) {
            flushBatch();
          }
        } catch {
          // skip page on cancellation
        }
        await new Promise<void>((r) => setTimeout(r, 15));
      }
      flushBatch();
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab?.id, activeTab?.doc, activeTab?.pages.length, activePageNum]);

  const snapshotPageUndo = useCallback((pageNum: number) => {
    setUndoByPage((u) => ({
      ...u,
      [pageNum]: [...(u[pageNum] || []).slice(-29), annotationsRef.current.filter((a) => a.pageNumber === pageNum)],
    }));
    setRedoByPage((r) => ({ ...r, [pageNum]: [] }));
  }, []);

  const updateAnnotations = useCallback(
    (updater: PDFAnnotation[] | ((prev: PDFAnnotation[]) => PDFAnnotation[]), recordPageNum?: number) => {
      const prev = annotationsRef.current;
      if (recordPageNum) {
        const prevPageAnns = prev.filter((a) => a.pageNumber === recordPageNum);
        setUndoByPage((u) => ({
          ...u,
          [recordPageNum]: [...(u[recordPageNum] || []).slice(-29), prevPageAnns],
        }));
        setRedoByPage((r) => ({ ...r, [recordPageNum]: [] }));
      }
      const next = typeof updater === 'function' ? updater(prev) : updater;
      annotationsRef.current = next;
      if (activeTab?.id) tabAnnotationsRef.current[activeTab.id] = next;
      setAnnotations(next);
      if (pdfMeta?.fileId && onSyncAnnotations && !drawRef.current.active) {
        onSyncAnnotations(pdfMeta.fileId, next);
      }
    },
    [activeTab?.id, onSyncAnnotations, pdfMeta?.fileId]
  );

  const handlePageUndo = useCallback(() => {
    const stack = undoByPage[activePageNum] || [];
    if (stack.length === 0) return;
    const prevPage = stack[stack.length - 1];
    const curPage = annotationsRef.current.filter((a) => a.pageNumber === activePageNum);
    setUndoByPage((u) => ({ ...u, [activePageNum]: stack.slice(0, -1) }));
    setRedoByPage((r) => ({ ...r, [activePageNum]: [...(r[activePageNum] || []), curPage] }));
    const nextAll = [...annotationsRef.current.filter((a) => a.pageNumber !== activePageNum), ...prevPage];
    setAnnotations(nextAll);
    annotationsRef.current = nextAll;
    if (activeTab?.id) tabAnnotationsRef.current[activeTab.id] = nextAll;
    if (pdfMeta?.fileId && onSyncAnnotations) onSyncAnnotations(pdfMeta.fileId, nextAll);
  }, [activePageNum, activeTab?.id, onSyncAnnotations, pdfMeta?.fileId, undoByPage]);

  const handlePageRedo = useCallback(() => {
    const stack = redoByPage[activePageNum] || [];
    if (stack.length === 0) return;
    const nextPage = stack[stack.length - 1];
    const curPage = annotationsRef.current.filter((a) => a.pageNumber === activePageNum);
    setRedoByPage((r) => ({ ...r, [activePageNum]: stack.slice(0, -1) }));
    setUndoByPage((u) => ({ ...u, [activePageNum]: [...(u[activePageNum] || []), curPage] }));
    const nextAll = [...annotationsRef.current.filter((a) => a.pageNumber !== activePageNum), ...nextPage];
    setAnnotations(nextAll);
    annotationsRef.current = nextAll;
    if (activeTab?.id) tabAnnotationsRef.current[activeTab.id] = nextAll;
    if (pdfMeta?.fileId && onSyncAnnotations) onSyncAnnotations(pdfMeta.fileId, nextAll);
  }, [activePageNum, activeTab?.id, onSyncAnnotations, pdfMeta?.fileId, redoByPage]);

  useEffect(() => {
    if (!pdfMeta?.fileId || !savedAnnotationsByFile || drawRef.current.active) return;
    const remote = savedAnnotationsByFile[pdfMeta.fileId];
    if (Array.isArray(remote) && remote !== annotationsRef.current) {
      setAnnotations(remote);
      annotationsRef.current = remote;
      if (activeTab?.id) tabAnnotationsRef.current[activeTab.id] = remote;
    }
  }, [activeTab?.id, pdfMeta?.fileId, savedAnnotationsByFile]);

  useEffect(() => {
    setPageJumpInput(String(activePageNum));
  }, [activePageNum]);

  useEffect(() => {
    if (!statusMsg) return;
    if (readerSpeechPlaying && statusMsg.startsWith('Reading with ')) return;
    const t = setTimeout(() => setStatusMsg(null), 3600);
    return () => clearTimeout(t);
  }, [readerSpeechPlaying, statusMsg]);

  const bytesToBase64 = (bytes: Uint8Array): Promise<string> =>
    new Promise<string>((resolve) => {
      const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });

  const saveCurrentTabSnapshot = useCallback((tabId: string | null) => {
    if (!tabId) return;
    tabAnnotationsRef.current[tabId] = annotationsRef.current;
    tabUndoRef.current[tabId] = undoByPageRef.current;
    tabRedoRef.current[tabId] = redoByPageRef.current;
    tabLinksRef.current[tabId] = pageLinksByPageRef.current;
    tabWidgetsRef.current[tabId] = widgetsByPageRef.current;
    tabFormValuesRef.current[tabId] = formValuesRef.current;
    tabLinkHistoryRef.current[tabId] = linkHistoryRef.current;
    tabZoomRef.current[tabId] = { zoomMode: zoomModeRef.current, zoomScale: zoomScaleRef.current };
  }, []);

  const switchActiveTab = useCallback(
    (nextTab: OpenDocSession | null, opts?: { initialAnns?: PDFAnnotation[]; skipSavePrev?: boolean }) => {
      const prevId = activeTabIdRef.current;
      if (!opts?.skipSavePrev && prevId && prevId !== nextTab?.id) {
        saveCurrentTabSnapshot(prevId);
      }
      setSelectedAnnId(null);
      setOpenThreadId(null);
      setPendingNote(null);
      setTextSelMenu(null);
      setSnipRect(null);
      setSelectedOrgPages(new Set());
      setActiveWidgetId(null);
      setContextMenu(null);

      if (!nextTab) {
        activeTabIdRef.current = null;
        setActiveTabId(null);
        annotationsRef.current = [];
        setAnnotations([]);
        setUndoByPage({});
        setRedoByPage({});
        setPageLinksByPage({});
        setWidgetsByPage({});
        setFormValues({});
        linkHistoryRef.current = [];
        setLinkHistory([]);
        return;
      }

      const restoredAnns =
        opts?.initialAnns ??
        tabAnnotationsRef.current[nextTab.id] ??
        (nextTab.meta?.fileId ? savedAnnotationsByFile?.[nextTab.meta.fileId] || [] : []);
      tabAnnotationsRef.current[nextTab.id] = restoredAnns;
      annotationsRef.current = restoredAnns;
      setAnnotations(restoredAnns);

      const restoredUndo = tabUndoRef.current[nextTab.id] || {};
      const restoredRedo = tabRedoRef.current[nextTab.id] || {};
      const restoredLinks = tabLinksRef.current[nextTab.id] || {};
      const restoredWidgets = tabWidgetsRef.current[nextTab.id] || {};
      const restoredForms = tabFormValuesRef.current[nextTab.id] || {};
      const restoredHist = tabLinkHistoryRef.current[nextTab.id] || [];
      const restoredZoom = tabZoomRef.current[nextTab.id];

      undoByPageRef.current = restoredUndo;
      redoByPageRef.current = restoredRedo;
      pageLinksByPageRef.current = restoredLinks;
      widgetsByPageRef.current = restoredWidgets;
      formValuesRef.current = restoredForms;
      linkHistoryRef.current = restoredHist;

      setUndoByPage(restoredUndo);
      setRedoByPage(restoredRedo);
      setPageLinksByPage(restoredLinks);
      setWidgetsByPage(restoredWidgets);
      setFormValues(restoredForms);
      setLinkHistory(restoredHist);
      if (restoredZoom) {
        setZoomMode(restoredZoom.zoomMode);
        setZoomScale(restoredZoom.zoomScale);
      }

      fetchedLinksPagesRef.current = new Set(Object.keys(restoredLinks).map(Number));
      fetchedWidgetsPagesRef.current = new Set(Object.keys(restoredWidgets).map(Number));
      activeTabIdRef.current = nextTab.id;
      setActiveTabId(nextTab.id);
    },
    [savedAnnotationsByFile, saveCurrentTabSnapshot]
  );

  const cloneAnnotationOffset = useCallback(
    (source: PDFAnnotation, targetPage: number, dx = 0.025, dy = 0.025): PDFAnnotation => {
      const maxZ = annotationsRef.current
        .filter((a) => a.pageNumber === targetPage)
        .reduce((m, a) => Math.max(m, a.zIndex ?? 0), 0);
      const nextX = Math.max(0, Math.min(0.96, source.x + dx));
      const nextY = Math.max(0, Math.min(0.96, source.y + dy));
      const effDx = nextX - source.x;
      const effDy = nextY - source.y;
      const cloned = structuredClone(source);
      return {
        ...cloned,
        id: uid('ann'),
        pageNumber: targetPage,
        x: nextX,
        y: nextY,
        ...(typeof cloned.x2 === 'number' ? { x2: Math.max(0, Math.min(1, cloned.x2 + effDx)) } : {}),
        ...(typeof cloned.y2 === 'number' ? { y2: Math.max(0, Math.min(1, cloned.y2 + effDy)) } : {}),
        ...(cloned.points
          ? {
              points: cloned.points.map((pt) => ({
                x: Math.max(0, Math.min(1, pt.x + effDx)),
                y: Math.max(0, Math.min(1, pt.y + effDy)),
              })),
            }
          : {}),
        locked: false,
        zIndex: maxZ + 1,
        createdAt: Date.now(),
      };
    },
    []
  );

  const uploadBytesToWorkspace = async (
    bytes: Uint8Array,
    fileName: string,
    extractedText: string
  ): Promise<AttachedFileMeta | null> => {
    const base64Data = await bytesToBase64(bytes);
    const res = await fetch(apiUrl('/api/files/upload'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(hostKey ? { 'X-Host-Key': hostKey } : {}) },
      body: JSON.stringify({ workspaceId, fileName, mimeType: 'application/pdf', base64Data, extractedText }),
    });
    const data = await res.json();
    if (res.ok && data.file) {
      onUploadFileMeta(data.file);
      return data.file as AttachedFileMeta;
    }
    throw new Error(data.error || `PDF upload failed (${res.status})`);
  };

  const replaceBytesInWorkspace = async (
    bytes: Uint8Array,
    existingFileId: string,
    extractedText: string
  ): Promise<AttachedFileMeta | null> => {
    const base64Data = await bytesToBase64(bytes);
    const res = await fetch(apiUrl('/api/files/replace'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(hostKey ? { 'X-Host-Key': hostKey } : {}) },
      body: JSON.stringify({ workspaceId, fileId: existingFileId, base64Data, extractedText }),
    });
    const data = await res.json();
    if (res.ok && data.file) {
      onUpdateFileMeta?.(data.file as AttachedFileMeta);
      return data.file as AttachedFileMeta;
    }
    return null;
  };

  const openDocumentBuffer = async (
    buf: ArrayBuffer,
    fileName: string,
    meta: AttachedFileMeta | null,
    options?: { openInSplitOnly?: boolean }
  ) => {
    const openInSplitOnly = Boolean(options?.openInSplitOnly);
    setLoading(true);
    setStatusMsg(null);
    try {
      if (meta?.fileId) {
        const existing = openTabsRef.current.find((t) => t.meta?.fileId === meta.fileId);
        if (existing) {
          if (openInSplitOnly) {
            setSplitRefTabId(existing.id);
            setSplitRefPageNum(existing.activePageNum || 1);
            setSplitView(true);
            setLoading(false);
            return;
          }
          switchActiveTab(existing);
          setLoading(false);
          return;
        }
      }
      const rendered = await loadPDFDocumentAndThumbnails(buf, 0.36, requestPasswordAsync);
      const [outlineItems, docMeta] = await Promise.all([
        extractPDFOutline(rendered.pdfDoc),
        extractPDFMetadata(rendered.pdfDoc),
      ]);
      const tabId = uid('pdf_tab');
      const mem = readViewMemory(meta?.fileId || fileName);
      const restoredPage = mem?.page ? Math.max(1, Math.min(rendered.pages.length || 1, mem.page)) : 1;

      const newTab: OpenDocSession = {
        id: tabId,
        fileName: meta?.fileName || fileName,
        meta,
        docMeta,
        bytes: buf,
        doc: rendered.pdfDoc,
        pages: rendered.pages,
        outline: outlineItems,
        activePageNum: restoredPage,
      };
      setOpenTabs((prev) => [...prev.filter((t) => t.id !== tabId), newTab]);
      const initialAnns = meta?.fileId ? savedAnnotationsByFile?.[meta.fileId] || [] : [];
      tabAnnotationsRef.current[tabId] = initialAnns;
      tabUndoRef.current[tabId] = {};
      tabRedoRef.current[tabId] = {};
      tabLinksRef.current[tabId] = {};
      tabWidgetsRef.current[tabId] = {};
      tabFormValuesRef.current[tabId] = {};
      tabLinkHistoryRef.current[tabId] = [];
      if (mem?.zoomMode || typeof mem?.zoomScale === 'number') {
        tabZoomRef.current[tabId] = {
          zoomMode: mem?.zoomMode || 'fit_width',
          zoomScale: typeof mem?.zoomScale === 'number' ? mem.zoomScale : 1,
        };
      }
      if (mem?.readerTheme) {
        setReaderTheme(mem.readerTheme);
      }
      if (openInSplitOnly) {
        setSplitRefTabId(tabId);
        setSplitRefPageNum(restoredPage);
        setSplitView(true);
      } else {
        switchActiveTab(newTab, { initialAnns });
      }
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to parse PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPDF = async (file: File, openInSplitOnly = false) => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const rendered = await loadPDFDocumentAndThumbnails(buf, 0.36, requestPasswordAsync);
      const [outlineItems, docMeta] = await Promise.all([
        extractPDFOutline(rendered.pdfDoc),
        extractPDFMetadata(rendered.pdfDoc),
      ]);
      let meta: AttachedFileMeta | null = null;
      try {
        meta = await uploadBytesToWorkspace(new Uint8Array(buf), file.name, rendered.fullText);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'Upload failed';
        setStatusMsg(`PDF opened on this device only; mobile co-editing is unavailable. ${reason}`);
      }
      const tabId = uid('pdf_tab');
      const newTab: OpenDocSession = {
        id: tabId,
        fileName: file.name,
        meta,
        docMeta,
        bytes: buf,
        doc: rendered.pdfDoc,
        pages: rendered.pages,
        outline: outlineItems,
        activePageNum: 1,
      };
      setOpenTabs((prev) => [...prev.filter((t) => t.id !== tabId), newTab]);
      tabAnnotationsRef.current[tabId] = [];
      tabUndoRef.current[tabId] = {};
      tabRedoRef.current[tabId] = {};
      tabLinksRef.current[tabId] = {};
      tabWidgetsRef.current[tabId] = {};
      tabFormValuesRef.current[tabId] = {};
      tabLinkHistoryRef.current[tabId] = [];
      if (openInSplitOnly) {
        setSplitRefTabId(tabId);
        setSplitRefPageNum(1);
        setSplitView(true);
      } else {
        switchActiveTab(newTab, { initialAnns: [] });
      }
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to open PDF');
    } finally {
      setLoading(false);
    }
  };

  const loadExistingAttachedPDF = async (meta: AttachedFileMeta, openInSplitOnly = false) => {
    const existing = openTabsRef.current.find((t) => t.meta?.fileId === meta.fileId);
    if (existing) {
      if (openInSplitOnly) {
        setSplitRefTabId(existing.id);
        setSplitRefPageNum(existing.activePageNum || 1);
        setSplitView(true);
        return;
      }
      switchActiveTab(existing);
      return;
    }
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch(resourceUrl(meta.url));
      if (!res.ok) throw new Error('Could not load PDF');
      const buf = await res.arrayBuffer();
      await openDocumentBuffer(buf, meta.fileName, meta, { openInSplitOnly });
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to load PDF');
      setLoading(false);
    }
  };

  const closeTab = (tabId: string) => {
    const prev = openTabsRef.current;
    const target = prev.find((t) => t.id === tabId);
    if (target) void target.doc.cleanup().catch(() => {});
    const remaining = prev.filter((t) => t.id !== tabId);
    openTabsRef.current = remaining;
    setOpenTabs(remaining);
    delete tabAnnotationsRef.current[tabId];
    delete tabUndoRef.current[tabId];
    delete tabRedoRef.current[tabId];
    delete tabLinksRef.current[tabId];
    delete tabWidgetsRef.current[tabId];
    delete tabFormValuesRef.current[tabId];
    delete tabLinkHistoryRef.current[tabId];
    delete tabZoomRef.current[tabId];
    if (remaining.length === 0) {
      setReaderMode(false);
      setReaderOutlineOpen(false);
      setSplitView(false);
      setSplitRefTabId('');
    } else if (splitRefTabId === tabId) {
      setSplitRefTabId(remaining[remaining.length - 1].id);
    }
    if (activeTabId === tabId || activeTab?.id === tabId) {
      const nextTab = remaining[remaining.length - 1] || null;
      switchActiveTab(nextTab, { skipSavePrev: true });
    }
  };

  useEffect(() => {
    const attachedFileIds = new Set(attachedFiles.map((file) => file.fileId));
    for (const tab of [...openTabsRef.current]) {
      if (tab.meta && !attachedFileIds.has(tab.meta.fileId)) closeTab(tab.id);
    }
  }, [attachedFiles]);

  useEffect(() => {
    if (loading) return;
    const firstUnloaded = attachedFiles.find(
      (f) => f.kind === 'pdf' && !autoLoadedRef.current.has(f.fileId)
    );
    if (firstUnloaded) {
      // Only auto-open if no tabs are open yet (first load scenario)
      if (openTabs.length > 0) {
        autoLoadedRef.current.add(firstUnloaded.fileId);
        return;
      }
      autoLoadedRef.current.add(firstUnloaded.fileId);
      void loadExistingAttachedPDF(firstUnloaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedFiles]);

  const currentPage = pages.find((p) => p.pageNumber === activePageNum) || pages[0];
  const currentAnnotations = annotations.filter((a) => a.pageNumber === activePageNum);
  const redactionCount = annotations.filter((a) => a.kind === 'redact').length;

  const visiblePages = useMemo(() => {
    if (layoutMode === 'scroll') return pages;
    if (layoutMode === 'spread') {
      if (spreadCoverPage && activePageNum === 1) {
        return currentPage ? [currentPage] : [];
      }
      const leftNum = spreadCoverPage
        ? activePageNum % 2 === 0
          ? activePageNum
          : activePageNum - 1
        : activePageNum % 2 === 1
          ? activePageNum
          : activePageNum - 1;
      const first = pages.find((p) => p.pageNumber === Math.max(1, leftNum));
      const second = pages.find((p) => p.pageNumber === Math.max(1, leftNum) + 1);
      return [first, second].filter((x): x is LoadedPDFPage => Boolean(x));
    }
    return currentPage ? [currentPage] : [];
  }, [activePageNum, currentPage, layoutMode, pages, spreadCoverPage]);

  useEffect(() => {
    const curId = activeTabIdRef.current;
    fetchedLinksPagesRef.current = new Set(Object.keys((curId && tabLinksRef.current[curId]) || {}).map(Number));
    fetchedWidgetsPagesRef.current = new Set(Object.keys((curId && tabWidgetsRef.current[curId]) || {}).map(Number));
  }, [pdfDoc]);

  // Lazy-extract hyperlinks and AcroForm widgets for visible pages
  useEffect(() => {
    if (!pdfDoc || visiblePages.length === 0) return;
    let cancelled = false;
    const curTabId = activeTabIdRef.current;
    (async () => {
      const pagesToInspect =
        layoutMode === 'scroll'
          ? visiblePages.filter((p) => Math.abs(p.pageNumber - activePageNum) <= 2)
          : visiblePages;
      for (const pg of pagesToInspect) {
        if (!fetchedLinksPagesRef.current.has(pg.pageNumber)) {
          fetchedLinksPagesRef.current.add(pg.pageNumber);
          const links = await extractPDFPageLinks(pdfDoc, pg.pageNumber);
          if (!cancelled) {
            if (curTabId) {
              tabLinksRef.current[curTabId] = { ...(tabLinksRef.current[curTabId] || {}), [pg.pageNumber]: links };
            }
            setPageLinksByPage((prev) => ({ ...prev, [pg.pageNumber]: links }));
          }
        }
        if (!fetchedWidgetsPagesRef.current.has(pg.pageNumber)) {
          fetchedWidgetsPagesRef.current.add(pg.pageNumber);
          const widgets = await extractPDFPageWidgets(pdfDoc, pg.pageNumber);
          if (!cancelled) {
            if (curTabId) {
              tabWidgetsRef.current[curTabId] = { ...(tabWidgetsRef.current[curTabId] || {}), [pg.pageNumber]: widgets };
            }
            setWidgetsByPage((prev) => ({ ...prev, [pg.pageNumber]: widgets }));
            if (widgets.length > 0) {
              setFormValues((prev) => {
                const copy = { ...prev };
                let changed = false;
                for (const w of widgets) {
                  if (copy[w.fieldName] === undefined) {
                    copy[w.fieldName] = w.defaultValue;
                    changed = true;
                  }
                }
                if (changed && curTabId) tabFormValuesRef.current[curTabId] = copy;
                return changed ? copy : prev;
              });
            }
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, visiblePages, layoutMode, activePageNum]);

  // Scroll viewport-center sync for activePageNum (works reliably at any zoom level)
  useEffect(() => {
    const root = viewerRef.current;
    if (layoutMode !== 'scroll' || !root || pages.length === 0) return;
    let rafId = 0;
    const syncClosestPage = () => {
      if (Date.now() < programmaticScrollUntilRef.current) return;
      const rootRect = root.getBoundingClientRect();
      const midY = rootRect.top + rootRect.height * 0.42;
      let bestPage: number | null = null;
      let bestDist = Infinity;
      for (const pg of pages) {
        const el = pageRefs.current[pg.pageNumber];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom < rootRect.top || r.top > rootRect.bottom) continue;
        const centerDist = Math.abs((r.top + r.bottom) / 2 - midY);
        const inside = r.top <= midY && r.bottom >= midY;
        const score = inside ? 0 : centerDist;
        if (score < bestDist) {
          bestDist = score;
          bestPage = pg.pageNumber;
          if (inside) break;
        }
      }
      if (bestPage && bestPage !== activePageNum) {
        setActivePageNum(bestPage);
      }
    };
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        syncClosestPage();
      });
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [layoutMode, pages, activePageNum, setActivePageNum]);

  const jumpToPage = useCallback(
    (pageNum: number, recordHistory = false) => {
      const clamped = Math.max(1, Math.min(pages.length || 1, pageNum));
      if (recordHistory && clamped !== activePageNum) {
        setLinkHistory((prev) => [...prev.slice(-14), activePageNum]);
      }
      setActivePageNum(clamped);
      if (layoutMode === 'scroll') {
        programmaticScrollUntilRef.current = Date.now() + 650;
        requestAnimationFrame(() => {
          pageRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else {
        requestAnimationFrame(() => {
          if (viewerRef.current) viewerRef.current.scrollTop = 0;
        });
      }
    },
    [activePageNum, layoutMode, pages.length, setActivePageNum]
  );

  const jumpBackHistory = useCallback(() => {
    const hist = linkHistoryRef.current;
    if (hist.length === 0) return;
    const target = hist[hist.length - 1];
    const nextHist = hist.slice(0, -1);
    linkHistoryRef.current = nextHist;
    setLinkHistory(nextHist);
    setActivePageNum(Math.max(1, Math.min(pages.length || 1, target)));
    if (layoutMode === 'scroll') {
      programmaticScrollUntilRef.current = Date.now() + 650;
      requestAnimationFrame(() => pageRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else {
      requestAnimationFrame(() => {
        if (viewerRef.current) viewerRef.current.scrollTop = 0;
      });
    }
  }, [layoutMode, pages.length, setActivePageNum]);

  const saveReaderSpeechProgress = useCallback(
    (progress: ReaderSpeechProgress | null, updateUI = true) => {
      readerSpeechProgressRef.current = progress;
      if (updateUI) setReaderSpeechProgress(progress);
      try {
        if (progress) localStorage.setItem(readerProgressStorageKey, JSON.stringify(progress));
        else localStorage.removeItem(readerProgressStorageKey);
      } catch {
        // Keep playback working if browser storage is unavailable.
      }
    },
    [readerProgressStorageKey]
  );

  const speakReaderFrom = useCallback(
    async (pageNumber: number, charIndex: number, token: number) => {
      if (token !== readerSpeechTokenRef.current) return;
      const page = pages.find((candidate) => candidate.pageNumber === pageNumber);
      const text = page?.text.trim() || '';
      if (!page || charIndex >= text.length) {
        readerAudioRef.current = null;
        setReaderSpeechPlaying(false);
        saveReaderSpeechProgress(null);
        return;
      }

      const start = Math.max(0, Math.min(text.length, charIndex));
      const end = nextSpeechChunkEnd(text, start);
      const chunkText = text.slice(start, end);
      const speechLocale = /[\u0900-\u097F]/.test(chunkText)
        ? locale === 'ne'
          ? 'ne'
          : 'hi'
        : /[A-Za-z]/.test(chunkText)
          ? 'en'
          : locale;
      saveReaderSpeechProgress({ pageNumber, charIndex: start });

      let response: Response;
      try {
        setStatusMsg('Generating AI voice…');
        response = await fetch(apiUrl('/api/ai/tts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Host-Key': hostKey },
          body: JSON.stringify({ text: chunkText, locale: speechLocale, workspaceId }),
        });
      } catch (error) {
        if (token !== readerSpeechTokenRef.current) return;
        setReaderSpeechPlaying(false);
        const detail = error instanceof Error ? error.message : 'Network request failed.';
        setStatusMsg(`AI voice could not be reached: ${detail}`);
        return;
      }
      if (token !== readerSpeechTokenRef.current) return;

      let payload: {
        audioDataUrl?: unknown;
        audioBase64?: unknown;
        mimeType?: unknown;
        provider?: unknown;
        model?: unknown;
        error?: unknown;
        retryAfterSeconds?: unknown;
      } = {};
      try {
        payload = await response.json();
      } catch {
        if (response.ok) {
          setReaderSpeechPlaying(false);
          setStatusMsg('AI voice returned an unreadable response. Press Play to retry.');
          return;
        }
      }
      if (token !== readerSpeechTokenRef.current) return;
      if (!response.ok) {
        setReaderSpeechPlaying(false);
        const errorText = typeof payload.error === 'string' ? payload.error : `AI voice request failed (${response.status}).`;
        const retryAfter = Number(payload.retryAfterSeconds);
        setStatusMsg(
          response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
            ? `AI voice limit reached. Try again in ${Math.ceil(retryAfter)} seconds.`
            : errorText
        );
        return;
      }

      const audioUrl =
        typeof payload.audioDataUrl === 'string'
          ? payload.audioDataUrl
          : typeof payload.audioBase64 === 'string'
            ? `data:${typeof payload.mimeType === 'string' ? payload.mimeType : 'audio/wav'};base64,${payload.audioBase64}`
            : '';
      if (!audioUrl) {
        setReaderSpeechPlaying(false);
        setStatusMsg('AI voice did not return audio. Press Play to retry.');
        return;
      }
      if (typeof payload.provider === 'string') {
        const model = typeof payload.model === 'string' ? ` ${payload.model}` : '';
        setStatusMsg(`Reading with ${payload.provider}${model}…`);
      }

      const audio = new Audio(audioUrl);
      readerAudioRef.current = audio;
      const speechWords = getSpeechWordRanges(chunkText);
      let activeWordStart = -1;
      const updateSpeechWord = () => {
        if (token !== readerSpeechTokenRef.current) return;
        const wordIndex = getActiveSpeechWordIndex(speechWords, audio.currentTime, audio.duration);
        const word = speechWords[wordIndex];
        if (!word || word.start === activeWordStart) return;
        activeWordStart = word.start;
        saveReaderSpeechProgress({
          pageNumber,
          charIndex: start + word.start,
          charEndIndex: start + word.end,
        });
      };
      const updateAudioProgress = () => {
        if (token !== readerSpeechTokenRef.current) return;
        const now = Date.now();
        if (readerMode && layoutMode === 'scroll' && now - readerFollowScrollAtRef.current >= 120) {
          const viewer = viewerRef.current;
          const pageElement = pageRefs.current[pageNumber];
          const speechHighlight = pageElement?.querySelector<HTMLElement>('[data-speech-highlight="true"]');
          if (viewer && speechHighlight) {
            const viewerRect = viewer.getBoundingClientRect();
            const highlightRect = speechHighlight.getBoundingClientRect();
            const comfortableTop = viewerRect.top + viewer.clientHeight * 0.2;
            const comfortableBottom = viewerRect.top + viewer.clientHeight * 0.75;
            if (highlightRect.top < comfortableTop || highlightRect.bottom > comfortableBottom) {
              const targetTop =
                viewer.scrollTop + highlightRect.top - viewerRect.top - viewer.clientHeight * 0.35;
              viewer.scrollTop = Math.max(0, Math.min(viewer.scrollHeight - viewer.clientHeight, targetTop));
              readerFollowScrollAtRef.current = now;
            }
          }
        }
      };
      audio.onloadedmetadata = updateSpeechWord;
      audio.onplaying = updateSpeechWord;
      audio.ontimeupdate = () => {
        updateSpeechWord();
        updateAudioProgress();
      };
      audio.onpause = () => {
        updateSpeechWord();
        updateAudioProgress();
      };
      audio.onended = () => {
        if (token !== readerSpeechTokenRef.current) return;
        readerAudioRef.current = null;
        if (end < text.length) {
          saveReaderSpeechProgress({ pageNumber, charIndex: end });
          window.setTimeout(() => void speakReaderFromRef.current(pageNumber, end, token), 0);
        } else {
          const nextPage = pages.find((candidate) => candidate.pageNumber > pageNumber && candidate.text.trim());
          if (nextPage) {
            saveReaderSpeechProgress({ pageNumber: nextPage.pageNumber, charIndex: 0 });
            jumpToPage(nextPage.pageNumber);
            window.setTimeout(() => void speakReaderFromRef.current(nextPage.pageNumber, 0, token), 180);
          } else {
            setReaderSpeechPlaying(false);
            saveReaderSpeechProgress(null);
          }
        }
      };
      audio.onerror = () => {
        if (token !== readerSpeechTokenRef.current) return;
        readerAudioRef.current = null;
        setReaderSpeechPlaying(false);
        setStatusMsg('AI voice audio could not play. Check your connection, then press Play to retry.');
      };
      try {
        await audio.play();
      } catch (error) {
        if (token !== readerSpeechTokenRef.current) return;
        setReaderSpeechPlaying(false);
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          setStatusMsg('AI voice is ready. Tap Play once more to start the audio.');
          return;
        }
        readerAudioRef.current = null;
        const detail = error instanceof Error ? error.message : 'Audio playback was blocked.';
        setStatusMsg(`AI audio could not start: ${detail}. Tap Play to retry.`);
      }
    },
    [jumpToPage, layoutMode, locale, pages, readerMode, saveReaderSpeechProgress]
  );
  speakReaderFromRef.current = speakReaderFrom;

  const startReaderSpeech = useCallback(
    (pageNumber: number, charIndex: number) => {
      onStopReadAloudText?.();
      const startPage = pages.find((page) => page.pageNumber >= pageNumber && page.text.trim());
      if (!startPage) {
        const requestedPage = pages.find((page) => page.pageNumber === pageNumber);
        setStatusMsg(
          requestedPage && !requestedPage.textLoaded
            ? 'PDF text is still loading. Please wait a moment, then press Play again.'
            : 'No selectable text found in this PDF. Scanned pages need OCR before they can be read aloud.'
        );
        return;
      }
      const token = ++readerSpeechTokenRef.current;
      readerAudioRef.current?.pause();
      readerAudioRef.current = null;
      setReaderMode(true);
      setLayoutMode('scroll');
      setAutoScrollActive(false);
      setReaderSpeechPlaying(true);
      setActivePageNum(startPage.pageNumber);
      const startIndex = startPage.pageNumber === pageNumber ? charIndex : 0;
      saveReaderSpeechProgress({ pageNumber: startPage.pageNumber, charIndex: startIndex });
      window.setTimeout(() => {
        pageRefs.current[startPage.pageNumber]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => void speakReaderFromRef.current(startPage.pageNumber, startIndex, token), 180);
      }, 0);
    },
    [onStopReadAloudText, pages, saveReaderSpeechProgress, setActivePageNum]
  );

  const readSelectedText = useCallback(
    (text: string) => {
      const selectedText = text.trim();
      if (!selectedText || !onReadAloudText) return false;
      let selectionHighlight: SelectedSpeechHighlight | null = null;
      if (textSelMenu?.selectedText.trim() === selectedText) {
        selectionHighlight = {
          pageNumber: textSelMenu.pageNumber,
          wordRects: textSelMenu.wordRects,
          activeWordIndex: -1,
        };
      } else {
        const selection = window.getSelection();
        if (selection?.rangeCount) {
          const range = selection.getRangeAt(0);
          const anchor = selection.anchorNode;
          if (anchor) {
            for (const [pageNumber, pageElement] of Object.entries(pageRefs.current)) {
              if (!pageElement?.contains(anchor)) continue;
              selectionHighlight = {
                pageNumber: Number(pageNumber),
                wordRects: getSelectionWordRects(range, pageElement.getBoundingClientRect(), selectedText),
                activeWordIndex: -1,
              };
              break;
            }
          }
        }
      }
      readerSpeechTokenRef.current += 1;
      readerAudioRef.current?.pause();
      readerAudioRef.current = null;
      setReaderSpeechPlaying(false);
      setReaderSpeechProgress(null);
      setStatusMsg(null);
      onStopReadAloudText?.();
      window.getSelection()?.removeAllRanges();
      setSelectedSpeechHighlight(selectionHighlight);
      onReadAloudText(selectedText, (wordIndex) => {
        if (wordIndex === null) {
          setSelectedSpeechHighlight(null);
          return;
        }
        setSelectedSpeechHighlight((current) =>
          current ? { ...current, activeWordIndex: wordIndex } : current
        );
      });
      setTextSelMenu(null);
      return true;
    },
    [onReadAloudText, onStopReadAloudText, textSelMenu]
  );

  const toggleReaderSpeech = useCallback(() => {
    const selectedText = textSelMenu?.selectedText.trim() || window.getSelection()?.toString().trim() || '';
    if (selectedText && readSelectedText(selectedText)) return;
    const audio = readerAudioRef.current;
    if (audio && !audio.ended) {
      if (audio.paused) {
        void audio.play().then(
          () => {
            setReaderSpeechPlaying(true);
            setStatusMsg('');
          },
          (error: unknown) => {
            const detail = error instanceof Error ? error.message : 'Audio playback was blocked.';
            setReaderSpeechPlaying(false);
            setStatusMsg(`AI audio could not resume: ${detail}. Tap Play to retry.`);
          }
        );
      } else {
        audio.pause();
        setReaderSpeechPlaying(false);
      }
      return;
    }
    if (readerSpeechPlaying) {
      readerSpeechTokenRef.current += 1;
      setReaderSpeechPlaying(false);
      return;
    }
    const saved = readerSpeechProgressRef.current;
    startReaderSpeech(saved?.pageNumber || activePageNum, saved?.charIndex || 0);
  }, [activePageNum, readSelectedText, readerSpeechPlaying, startReaderSpeech, textSelMenu?.selectedText]);

  const pauseReaderSpeech = useCallback(() => {
    const audio = readerAudioRef.current;
    if (audio && !audio.paused) audio.pause();
    else if (!audio && readerSpeechPlaying) readerSpeechTokenRef.current += 1;
    setReaderSpeechPlaying(false);
  }, [readerSpeechPlaying]);

  const getTabAnnotations = useCallback(
    (tabId: string): PDFAnnotation[] => {
      if (tabId === activeTab?.id) return annotations;
      const cached = tabAnnotationsRef.current[tabId];
      if (cached) return cached;
      const t = openTabs.find((x) => x.id === tabId);
      return t?.meta?.fileId ? savedAnnotationsByFile?.[t.meta.fileId] || [] : [];
    },
    [activeTab?.id, annotations, openTabs, savedAnnotationsByFile]
  );

  const handleSwapSplitTabs = useCallback(() => {
    if (!activeTab) return;
    const targetRefId = splitRefTabId || activeTab.id;
    if (targetRefId === activeTab.id) {
      const prevMain = activePageNum;
      const prevRef = splitRefPageNum;
      setSplitRefPageNum(prevMain);
      jumpToPage(prevRef);
      return;
    }
    const nextActiveTab = openTabs.find((t) => t.id === targetRefId);
    if (!nextActiveTab) return;
    const prevMainId = activeTab.id;
    const prevMainPage = activePageNum;
    const prevRefPage = Math.max(1, Math.min(nextActiveTab.pages.length || 1, splitRefPageNum));

    switchActiveTab(nextActiveTab);
    setSplitRefTabId(prevMainId);
    setSplitRefPageNum(prevMainPage);
    setOpenTabs((tabs) =>
      tabs.map((t) => (t.id === nextActiveTab.id ? { ...t, activePageNum: prevRefPage } : t))
    );
    if (layoutMode === 'scroll') {
      programmaticScrollUntilRef.current = Date.now() + 500;
      requestAnimationFrame(() => {
        pageRefs.current[prevRefPage]?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }
  }, [activePageNum, activeTab, jumpToPage, layoutMode, openTabs, splitRefPageNum, splitRefTabId, switchActiveTab]);

  const handleComparePages = useCallback(async () => {
    if (!pdfDoc || !activeTab) return;
    const effectiveRefTabId = splitRefTabId || activeTab.id;
    const refTab = openTabs.find((t) => t.id === effectiveRefTabId);
    if (!refTab) return;
    setCompareMode(true);
    try {
      const [leftResult, rightResult] = await Promise.all([
        renderPDFPageHighResDataUrl(pdfDoc, activePageNum, 1200),
        renderPDFPageHighResDataUrl(refTab.doc, splitRefPageNum, 1200),
      ]);

      const loadImg = (url: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = url;
        });

      const [imgA, imgB] = await Promise.all([loadImg(leftResult.dataUrl), loadImg(rightResult.dataUrl)]);
      const W = imgA.naturalWidth;
      const H = imgA.naturalHeight;

      const toData = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, W, H);
        return ctx.getImageData(0, 0, W, H);
      };

      const dataA = toData(imgA);
      const dataB = toData(imgB);

      const diffCanvas = document.createElement('canvas');
      diffCanvas.width = W;
      diffCanvas.height = H;
      const diffCtx = diffCanvas.getContext('2d')!;
      const diffData = diffCtx.createImageData(W, H);

      let identical = 0;
      const total = W * H;
      for (let i = 0; i < total; i++) {
        const off = i * 4;
        const dr = Math.abs(dataA.data[off] - dataB.data[off]);
        const dg = Math.abs(dataA.data[off + 1] - dataB.data[off + 1]);
        const db = Math.abs(dataA.data[off + 2] - dataB.data[off + 2]);
        if (dr > 15 || dg > 15 || db > 15) {
          diffData.data[off] = 255;
          diffData.data[off + 1] = 0;
          diffData.data[off + 2] = 0;
          diffData.data[off + 3] = 153;
        } else {
          diffData.data[off] = dataA.data[off];
          diffData.data[off + 1] = dataA.data[off + 1];
          diffData.data[off + 2] = dataA.data[off + 2];
          diffData.data[off + 3] = dataA.data[off + 3];
          identical++;
        }
      }

      diffCtx.putImageData(diffData, 0, 0);
      setDiffSimilarity(Math.round((identical / total) * 100));
      setDiffResultUrl(diffCanvas.toDataURL('image/png'));
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Compare failed');
      setCompareMode(false);
    }
  }, [activePageNum, activeTab, openTabs, pdfDoc, splitRefPageNum, splitRefTabId]);

  const computedPageWidthPx = useMemo(() => {
    const isTwoPageVisible = layoutMode === 'spread' && !(spreadCoverPage && activePageNum === 1) && pages.length > 1;
    const availW = isTwoPageVisible ? Math.floor((viewerSize.width - 24) / 2) : viewerSize.width;
    const basePtW = currentPage?.ptWidth || currentPage?.width || 595;
    const basePtH = currentPage?.ptHeight || currentPage?.height || 842;
    if (zoomMode === 'fit_width') {
      return Math.max(200, Math.min(1300, availW));
    }
    if (zoomMode === 'fit_page') {
      const aspect = basePtW / (basePtH || 1);
      return Math.max(200, Math.min(availW, Math.round(viewerSize.height * aspect)));
    }
    return Math.max(180, Math.round(basePtW * 1.3333 * zoomScale));
  }, [activePageNum, currentPage, layoutMode, pages.length, spreadCoverPage, viewerSize.height, viewerSize.width, zoomMode, zoomScale]);

  const effectiveZoomScale = useMemo(() => {
    const basePtW = currentPage?.ptWidth || currentPage?.width || 595;
    return Number((computedPageWidthPx / (basePtW * 1.3333)).toFixed(2));
  }, [computedPageWidthPx, currentPage]);

  const stepZoom = useCallback(
    (delta: number) => {
      const base = zoomMode === 'custom' ? zoomScale : effectiveZoomScale;
      const next = Math.max(0.35, Math.min(4.0, Number((base + delta).toFixed(2))));
      setZoomMode('custom');
      setZoomScale(next);
    },
    [effectiveZoomScale, zoomMode, zoomScale]
  );

  // Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 30);
        return;
      }
      if (isTyping) return;

      if (e.code === 'Space' && !e.repeat) {
        setSpacePressed(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handlePageRedo();
        else handlePageUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handlePageRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedAnnId) {
        const hasTxtSel = Boolean(window.getSelection()?.toString().trim());
        if (!hasTxtSel) {
          const hit = annotationsRef.current.find((a) => a.id === selectedAnnId);
          if (hit) {
            e.preventDefault();
            copiedAnnRef.current = structuredClone(hit);
            setStatusMsg('Copied markup');
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && copiedAnnRef.current && pages.length > 0) {
        e.preventDefault();
        const clone = cloneAnnotationOffset(copiedAnnRef.current, activePageNum, 0.025, 0.025);
        updateAnnotations((prev) => [...prev, clone], activePageNum);
        setSelectedAnnId(clone.id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnId) {
        e.preventDefault();
        const hit = annotationsRef.current.find((a) => a.id === selectedAnnId);
        if (hit?.locked) {
          setStatusMsg('Locked markup cannot be deleted');
          return;
        }
        updateAnnotations((prev) => prev.filter((a) => a.id !== selectedAnnId), activePageNum);
        setSelectedAnnId(null);
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (layoutMode !== 'scroll') {
          e.preventDefault();
          jumpToPage(activePageNum + (layoutMode === 'spread' ? (spreadCoverPage && activePageNum === 1 ? 1 : 2) : 1));
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (layoutMode !== 'scroll') {
          e.preventDefault();
          jumpToPage(activePageNum - (layoutMode === 'spread' ? 2 : 1));
        }
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && pages.length > 0) {
        e.preventDefault();
        setReaderMode((v) => !v);
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && pages.length > 0) {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && pages.length > 0) {
        e.preventDefault();
        setSplitView((v) => !v);
      } else if (e.key === '?' && pages.length > 0) {
        e.preventDefault();
        setShowShortcutsModal((v) => !v);
      } else if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey && !e.altKey && pages.length > 0) {
        e.preventDefault();
        stepZoom(0.15);
      } else if (e.key === '-' && !e.ctrlKey && !e.metaKey && !e.altKey && pages.length > 0) {
        e.preventDefault();
        stepZoom(-0.15);
      } else if (e.key === '0' && !e.ctrlKey && !e.metaKey && !e.altKey && pages.length > 0) {
        e.preventDefault();
        setZoomMode('fit_width');
        setZoomScale(1);
      } else if (e.key === 'Escape') {
        setPendingNote(null);
        setSelectedAnnId(null);
        setOpenThreadId(null);
        setTextSelMenu(null);
        setExportMenuPos(null);
        setMoreMenuPos(null);
        setZoomMenuPos(null);
        setShapesMenuPos(null);

        setContextMenu(null);
        setShowShortcutsModal(false);
        setShowCompressModal(false);
        setShowPasswordModal(false);
        setShowA11yPanel(false);
        setShowLinkEditor(false);
        setShowAutoFormDetect(false);
        setShowSanitizeModal(false);
        setShowHeaderFooterModal(false);
        setShowCompareModal(false);
        setShowSigModal(false);
        setShowCropModal(false);
        setShowWatermarkModal(false);
        setShowPrintModal(false);
        setShowCombineModal(false);
        setShowSplitModal(false);
        setShowMetaModal(false);
        if (organizerOpen) setOrganizerOpen(false);
        else if (searchOpen) setSearchOpen(false);
        else if (readerOutlineOpen) setReaderOutlineOpen(false);
        else if (readerMode) setReaderMode(false);
        else if (fullscreen) void toggleFullscreen();
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
  }, [
    activePageNum,
    cloneAnnotationOffset,
    fullscreen,
    handlePageRedo,
    handlePageUndo,
    jumpToPage,
    layoutMode,
    organizerOpen,
    pages.length,
    readerMode,
    readerOutlineOpen,
    searchOpen,
    selectedAnnId,
    showCombineModal,
    showCropModal,
    showMetaModal,
    showPrintModal,
    showSigModal,
    showSplitModal,
    showWatermarkModal,
    spreadCoverPage,
    stepZoom,
    toggleFullscreen,
    updateAnnotations,
  ]);

  // Search
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return [];
    const needle = searchMatchCase ? q : q.toLowerCase();
    const results: { pageNumber: number; snippet: string; count: number }[] = [];
    for (const p of pages) {
      const hay = searchMatchCase ? p.text : p.text.toLowerCase();
      let idx = hay.indexOf(needle);
      if (idx === -1) continue;
      let count = 0;
      const firstIdx = idx;
      while (idx !== -1) {
        count++;
        idx = hay.indexOf(needle, idx + needle.length);
      }
      const start = Math.max(0, firstIdx - 28);
      const end = Math.min(p.text.length, firstIdx + needle.length + 36);
      const snippet = (start > 0 ? '…' : '') + p.text.slice(start, end) + (end < p.text.length ? '…' : '');
      results.push({ pageNumber: p.pageNumber, snippet, count });
    }
    return results;
  }, [pages, searchQuery, searchMatchCase]);

  useEffect(() => {
    setActiveMatchIdx(0);
  }, [searchQuery, searchMatchCase]);

  // Eagerly hydrate textItems for pages with search matches so highlights can render
  useEffect(() => {
    if (!pdfDoc || searchMatches.length === 0 || !activeTab) return;
    let cancelled = false;
    const tabId = activeTab.id;
    const matchPageNums = searchMatches.map((m) => m.pageNumber);
    const needsHydration = matchPageNums.filter((pNum) => {
      const pg = pages.find((p) => p.pageNumber === pNum);
      return pg && (!pg.textItems || pg.textItems.length === 0) && !pg.textLoaded;
    });
    if (needsHydration.length === 0) return;
    (async () => {
      for (const pNum of needsHydration) {
        if (cancelled) return;
        try {
          const extracted = await extractSinglePageText(pdfDoc, pNum);
          if (cancelled) return;
          if (extracted.textItems.length > 0) {
            setOpenTabs((tabs) =>
              tabs.map((t) =>
                t.id === tabId
                  ? {
                      ...t,
                      pages: t.pages.map((pg) =>
                        pg.pageNumber === pNum
                          ? { ...pg, text: pg.text || extracted.pageText, textItems: extracted.textItems, textLoaded: true }
                          : pg
                      ),
                    }
                  : t
              )
            );
          }
        } catch {
          // ignore extraction errors
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMatches, pdfDoc, activeTab?.id]);

  const goToMatch = (idx: number) => {
    if (searchMatches.length === 0) return;
    const wrapped = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length;
    setActiveMatchIdx(wrapped);
    jumpToPage(searchMatches[wrapped].pageNumber);
  };

  // Helper to reload active tab after PDF byte mutation
  const commitMutatedPdfBytes = async (
    nextBytes: Uint8Array,
    nextAnns?: PDFAnnotation[],
    msg?: string,
    resetUndo = true
  ) => {
    if (!activeTab) return;
    const targetTabId = activeTab.id;
    const targetFileId = pdfMeta?.fileId;
    const nextBuf = nextBytes.slice().buffer;
    const rendered = await loadPDFDocumentAndThumbnails(nextBuf, 0.36, requestPasswordAsync);
    const [outlineItems, docMeta] = await Promise.all([
      extractPDFOutline(rendered.pdfDoc),
      extractPDFMetadata(rendered.pdfDoc),
    ]);
    void activeTab.doc.cleanup().catch(() => {});
    setOpenTabs((tabs) =>
      tabs.map((t) =>
        t.id === targetTabId
          ? {
              ...t,
              docMeta,
              bytes: nextBuf,
              doc: rendered.pdfDoc,
              pages: rendered.pages,
              outline: outlineItems.length > 0 ? outlineItems : t.outline.filter((o) => o.custom),
              activePageNum: Math.min(t.activePageNum, rendered.pages.length || 1),
            }
          : t
      )
    );
    if (nextAnns) {
      tabAnnotationsRef.current[targetTabId] = nextAnns;
      if (activeTabIdRef.current === targetTabId) {
        setAnnotations(nextAnns);
        annotationsRef.current = nextAnns;
      }
    }
    tabLinksRef.current[targetTabId] = {};
    tabWidgetsRef.current[targetTabId] = {};
    if (resetUndo) {
      tabUndoRef.current[targetTabId] = {};
      tabRedoRef.current[targetTabId] = {};
    }
    if (activeTabIdRef.current === targetTabId) {
      fetchedLinksPagesRef.current.clear();
      fetchedWidgetsPagesRef.current.clear();
      setPageLinksByPage({});
      setWidgetsByPage({});
      setSelectedOrgPages(new Set());
      if (resetUndo) {
        setUndoByPage({});
        setRedoByPage({});
      }
    }
    if (targetFileId) {
      await replaceBytesInWorkspace(nextBytes, targetFileId, rendered.fullText);
      if (nextAnns) onSyncAnnotations?.(targetFileId, nextAnns);
    }
    if (msg) setStatusMsg(msg);
  };

  // Page manipulations
  const handleManipulate = async (
    action: 'rotate' | 'delete' | 'extract' | 'split' | 'duplicate' | 'insert_blank' | 'reorder',
    indicesZeroBased?: number[],
    rotateDeg = 90,
    reorderTargetIdx?: number
  ) => {
    if (!pdfBytes || !activeTab) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      const targetIndices = indicesZeroBased && indicesZeroBased.length > 0 ? indicesZeroBased : [activePageNum - 1];
      const result = await manipulatePDFPages(pdfBytes, action, targetIndices, rotateDeg, reorderTargetIdx);

      if (action === 'extract' || action === 'split') {
        const dl = (bytes: Uint8Array, suffix: string) => {
          const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(pdfMeta?.fileName || activeTab.fileName).replace(/\.pdf$/i, '')}_${suffix}.pdf`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        };
        dl(result.primary, action === 'extract' ? 'pages' : 'part1');
        if (result.secondary) dl(result.secondary, 'part2');
        setStatusMsg(action === 'extract' ? 'Extracted PDF downloaded' : 'Split into 2 PDFs');
      } else {
        let nextAnns = annotationsRef.current;
        if (action === 'rotate') {
          const targetSet = new Set(targetIndices.map((i) => i + 1));
          const rotStep: 90 | -90 = rotateDeg < 0 ? -90 : 90;
          nextAnns = nextAnns.map((a) => (targetSet.has(a.pageNumber) ? rotateAnnotationCoords(a, rotStep) : a));
        } else if (action === 'delete') {
          const delSet = new Set(targetIndices.map((i) => i + 1));
          nextAnns = nextAnns
            .filter((a) => !delSet.has(a.pageNumber))
            .map((a) => {
              const delBefore = Array.from(delSet).filter((d) => d < a.pageNumber).length;
              return delBefore > 0 ? { ...a, pageNumber: a.pageNumber - delBefore } : a;
            });
        } else if (action === 'duplicate' || action === 'insert_blank') {
          const afterPage = targetIndices[0] + 1;
          nextAnns = nextAnns.map((a) => (a.pageNumber > afterPage ? { ...a, pageNumber: a.pageNumber + 1 } : a));
        } else if (action === 'reorder' && typeof reorderTargetIdx === 'number') {
          const fromPage = targetIndices[0] + 1;
          const toPage = reorderTargetIdx + 1;
          nextAnns = nextAnns.map((a) => {
            if (a.pageNumber === fromPage) return { ...a, pageNumber: toPage };
            if (fromPage < toPage && a.pageNumber > fromPage && a.pageNumber <= toPage) return { ...a, pageNumber: a.pageNumber - 1 };
            if (fromPage > toPage && a.pageNumber >= toPage && a.pageNumber < fromPage) return { ...a, pageNumber: a.pageNumber + 1 };
            return a;
          });
        }
        await commitMutatedPdfBytes(result.primary, nextAnns);
      }
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'PDF operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInsertImagePages = async (files: FileList) => {
    if (!pdfBytes || !activeTab) return;
    setLoading(true);
    try {
      const queue: { kind: 'pdf' | 'image'; name: string; bytes: ArrayBuffer; mimeType?: string }[] = [
        { kind: 'pdf', name: activeTab.fileName, bytes: pdfBytes },
      ];
      for (const f of Array.from(files)) {
        queue.push({ kind: 'image', name: f.name, bytes: await f.arrayBuffer(), mimeType: f.type });
      }
      const merged = await mergeMultipleBuffersAndImages(queue);
      await commitMutatedPdfBytes(merged, undefined, `Added ${files.length} image page(s)`);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Insert image failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyRedactions = async () => {
    if (!pdfBytes || !pdfDoc || redactionCount === 0) return;
    setLoading(true);
    try {
      const byPage: Record<number, { x: number; y: number; w: number; h: number }[]> = {};
      for (const a of annotationsRef.current) {
        if (a.kind !== 'redact') continue;
        byPage[a.pageNumber] = byPage[a.pageNumber] || [];
        byPage[a.pageNumber].push({ x: a.x, y: a.y, w: a.w || 0.14, h: a.h || 0.03 });
      }
      const sanitized = await applyRedactionsToPDF(pdfBytes, pdfDoc, byPage);
      const nextAnns = annotationsRef.current.filter((a) => a.kind !== 'redact');
      await commitMutatedPdfBytes(sanitized, nextAnns, `Applied ${redactionCount} redaction(s) permanently`);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Redaction failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRunOCRPages = async (targetPageNums: number[]) => {
    if (!pdfDoc || !activeTab) return;
    const targetTabId = activeTab.id;
    const targetDoc = activeTab.doc;
    setLoading(true);
    let updatedCount = 0;
    try {
      for (let i = 0; i < targetPageNums.length; i++) {
        const pNum = targetPageNums[i];
        setOcrProgress(targetPageNums.length > 1 ? `OCR ${i + 1}/${targetPageNums.length}…` : `OCR Page ${pNum}…`);
        const hi = await renderPDFPageHighResDataUrl(targetDoc, pNum, 1600);
        const res = await fetch(apiUrl('/api/ai/pdf-ocr'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: hi.dataUrl }),
        });
        const data = (await res.json()) as { text?: string; blocks?: { text: string; x: number; y: number; w: number; h: number }[]; error?: string };
        if (!res.ok) throw new Error(data.error || 'OCR request failed');
        const ocrWords: PDFTextWord[] = (data.blocks || []).map((b) => ({
          str: b.text,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
        }));
        const ocrText = (data.text || ocrWords.map((w) => w.str).join(' ')).trim();
        if (ocrText) {
          updatedCount++;
          setOpenTabs((tabs) =>
            tabs.map((t) =>
              t.id === targetTabId
                ? {
                    ...t,
                    pages: t.pages.map((pg) =>
                      pg.pageNumber === pNum
                        ? { ...pg, text: ocrText, textItems: ocrWords.length > 0 ? ocrWords : pg.textItems, textLoaded: true }
                        : pg
                    ),
                  }
                : t
            )
          );
        }
      }
      setStatusMsg(updatedCount > 0 ? `OCR completed (${updatedCount} page${updatedCount > 1 ? 's' : ''})` : 'No text detected');
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setOcrProgress(null);
      setLoading(false);
    }
  };

  const handleInsertImageAnnotation = (file: File, targetPage = activePageNum, x = 0.25, y = 0.24) => {
    const pg = pages.find((p) => p.pageNumber === targetPage) || currentPage;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const pageAspect = (pg?.ptWidth || 595) / (pg?.ptHeight || 842);
        const w = 0.26;
        const h = Math.max(0.05, Math.min(0.45, (w * pageAspect) / (img.width / Math.max(1, img.height))));
        const maxZ = annotationsRef.current
          .filter((a) => a.pageNumber === targetPage)
          .reduce((m, a) => Math.max(m, a.zIndex ?? 0), 0);
        const newId = uid('ann');
        updateAnnotations(
          (prev) => [
            ...prev,
            {
              id: newId,
              pageNumber: targetPage,
              kind: 'image',
              x: Math.min(0.7, Math.max(0.03, x)),
              y: Math.min(0.7, Math.max(0.03, y)),
              w,
              h,
              color: '#0F172A',
              opacity: toolDefaults.opacity,
              rotation: toolDefaults.rotation,
              zIndex: maxZ + 1,
              text: dataUrl,
              createdAt: Date.now(),
            },
          ],
          targetPage
        );
        setSelectedAnnId(newId);
        setAnnTool('select');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleArrangeAnnotation = (annId: string, pageNum: number, dir: 'front' | 'forward' | 'backward' | 'back') => {
    const pageOrdered = annotationsRef.current
      .filter((a) => a.pageNumber === pageNum)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const idx = pageOrdered.findIndex((a) => a.id === annId);
    if (idx === -1) return;
    const reordered = [...pageOrdered];
    const [picked] = reordered.splice(idx, 1);
    if (dir === 'front') reordered.push(picked);
    else if (dir === 'back') reordered.unshift(picked);
    else if (dir === 'forward') reordered.splice(Math.min(reordered.length, idx + 1), 0, picked);
    else reordered.splice(Math.max(0, idx - 1), 0, picked);
    const zMap = new Map<string, number>();
    reordered.forEach((item, i) => zMap.set(item.id, i + 1));
    updateAnnotations((prev) => prev.map((a) => (zMap.has(a.id) ? { ...a, zIndex: zMap.get(a.id) } : a)), pageNum);
  };

  const handleSearchAndRedactAll = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    const needle = searchMatchCase ? q : q.toLowerCase();
    const added: PDFAnnotation[] = [];
    const targetTabId = activeTab?.id;
    const hydratedUpdates: Record<number, { pageText: string; textItems: PDFTextWord[] }> = {};
    for (const pg of pages) {
      let items = pg.textItems || [];
      if ((!pg.textLoaded || items.length === 0) && pdfDoc) {
        try {
          const extracted = await extractSinglePageText(pdfDoc, pg.pageNumber);
          if (extracted.textItems.length > 0) {
            items = extracted.textItems;
            hydratedUpdates[pg.pageNumber] = extracted;
          }
        } catch {
          // ignore
        }
      }
      const matchedIndices = new Set<number>();
      for (let i = 0; i < items.length; i++) {
        const hay = searchMatchCase ? items[i].str : items[i].str.toLowerCase();
        if (hay.includes(needle)) {
          matchedIndices.add(i);
          continue;
        }
        // Check sliding phrase across adjacent words on the same horizontal band
        let joined = hay;
        for (let j = i + 1; j < Math.min(items.length, i + 10); j++) {
          if (Math.abs(items[j].y - items[i].y) > 0.02) break;
          const nextStr = searchMatchCase ? items[j].str : items[j].str.toLowerCase();
          joined = `${joined} ${nextStr}`;
          if (joined.includes(needle)) {
            for (let k = i; k <= j; k++) matchedIndices.add(k);
            break;
          }
          if (joined.length > needle.length + 24) break;
        }
      }
      matchedIndices.forEach((idx) => {
        const word = items[idx];
        added.push({
          id: uid('ann'),
          pageNumber: pg.pageNumber,
          kind: 'redact',
          x: word.x,
          y: word.y,
          w: Math.max(0.02, word.w),
          h: Math.max(0.014, word.h),
          color: '#DC2626',
          strokeWidth: 2,
          createdAt: Date.now(),
        });
      });
    }
    if (targetTabId && Object.keys(hydratedUpdates).length > 0) {
      setOpenTabs((tabs) =>
        tabs.map((t) =>
          t.id === targetTabId
            ? {
                ...t,
                pages: t.pages.map((pg) =>
                  hydratedUpdates[pg.pageNumber]
                    ? {
                        ...pg,
                        text: pg.text || hydratedUpdates[pg.pageNumber].pageText,
                        textItems: hydratedUpdates[pg.pageNumber].textItems,
                        textLoaded: true,
                      }
                    : pg
                ),
              }
            : t
        )
      );
    }
    if (added.length === 0) {
      setStatusMsg('No matching text coordinates found for redaction');
      return;
    }
    const touchedPages = Array.from(new Set(added.map((a) => a.pageNumber)));
    touchedPages.forEach((pNum) => snapshotPageUndo(pNum));
    updateAnnotations((prev) => [...prev, ...added]);
    setStatusMsg(`Marked ${added.length} redaction box(es) — click Apply (${redactionCount + added.length}) to sanitize`);
  };

  const handleBurnWatermarkIntoPDF = async (cfg: WatermarkConfig) => {
    if (!pdfBytes) return;
    setLoading(true);
    try {
      const hasWm = Boolean(cfg.text.trim());
      const hasHf = Boolean(cfg.headerLeft || cfg.headerRight || cfg.footerCenter || cfg.pageNumbers || cfg.batesPrefix);
      if (!hasWm && !hasHf) {
        setWatermarkCfg(cfg);
        return;
      }
      const burned = await exportAnnotatedOriginalPDF(pdfBytes, {}, {}, {
        watermark: hasWm ? { ...cfg, currentPageNum: activePageNum } : undefined,
        headerFooter: hasHf ? { ...cfg, currentPageNum: activePageNum } : undefined,
      });
      await commitMutatedPdfBytes(burned, undefined, 'Watermark & headers burned into PDF', false);
      setWatermarkCfg({
        text: '',
        opacity: 0.22,
        angle: 35,
        color: '#DC2626',
        fontSize: 44,
        position: 'center',
        scope: 'all',
        rangeExpr: '',
        headerLeft: '',
        headerRight: '',
        footerCenter: '',
        pageNumbers: false,
        batesPrefix: '',
        batesStart: 1,
      });
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Watermark burn failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async (flatten: boolean) => {
    if (!pdfBytes || !currentPage || !activeTab) return;
    setLoading(true);
    try {
      const annMap: Record<number, { overlayPngDataUrl?: string }> = {};
      for (const p of pages) {
        const pageAnns = annotations.filter((a) => a.pageNumber === p.pageNumber);
        if (pageAnns.length === 0) continue;
        const outW = Math.round((p.ptWidth || p.width) * 2.6);
        const outH = Math.round((p.ptHeight || p.height) * 2.6);
        const c = document.createElement('canvas');
        c.width = outW;
        c.height = outH;
        const ctx = c.getContext('2d')!;
        await renderAnnotationsToCanvas(ctx, pageAnns, outW, outH, p.ptWidth || 595, p.ptHeight || 842);
        annMap[p.pageNumber] = { overlayPngDataUrl: c.toDataURL('image/png') };
      }

      const outBytes = await exportAnnotatedOriginalPDF(pdfBytes, annMap, {}, {
        formValues,
        flattenForms: flatten,
        watermark: watermarkCfg.text.trim() ? { ...watermarkCfg, currentPageNum: activePageNum } : undefined,
        headerFooter:
          watermarkCfg.headerLeft || watermarkCfg.headerRight || watermarkCfg.footerCenter || watermarkCfg.pageNumbers || watermarkCfg.batesPrefix
            ? { ...watermarkCfg, currentPageNum: activePageNum }
            : undefined,
      });
      const blob = new Blob([outBytes.slice().buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${flatten ? 'flattened_' : 'annotated_'}${activeTab.fileName || 'document.pdf'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatusMsg(flatten ? 'Exported Flattened PDF' : 'Exported Annotated PDF');
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportFlattenedAnnotations = async () => {
    if (!pdfBytes || !activeTab) return;
    setLoading(true);
    try {
      const annMap: Record<number, { overlayPngDataUrl?: string }> = {};
      for (const p of pages) {
        const pageAnns = annotations.filter((a) => a.pageNumber === p.pageNumber);
        if (pageAnns.length === 0) continue;
        const outW = Math.round((p.ptWidth || p.width) * 2.6);
        const outH = Math.round((p.ptHeight || p.height) * 2.6);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const context = canvas.getContext('2d');
        if (!context) continue;
        await renderAnnotationsToCanvas(context, pageAnns, outW, outH, p.ptWidth || 595, p.ptHeight || 842);
        annMap[p.pageNumber] = { overlayPngDataUrl: canvas.toDataURL('image/png') };
      }
      const outBytes = await exportAnnotatedOriginalPDF(pdfBytes, annMap, {}, {
        formValues,
        flattenForms: true,
        watermark: watermarkCfg.text.trim() ? { ...watermarkCfg, currentPageNum: activePageNum } : undefined,
        headerFooter:
          watermarkCfg.headerLeft || watermarkCfg.headerRight || watermarkCfg.footerCenter || watermarkCfg.pageNumbers || watermarkCfg.batesPrefix
            ? { ...watermarkCfg, currentPageNum: activePageNum }
            : undefined,
      });
      const blob = new Blob([outBytes.slice().buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flat_annotations_${activeTab.fileName || 'document.pdf'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatusMsg('Exported PDF with flattened annotations');
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportAnnotationReport = () => {
    if (!activeTab) return;
    const grouped: Record<number, PDFAnnotation[]> = {};
    for (const ann of annotations) {
      if (!grouped[ann.pageNumber]) grouped[ann.pageNumber] = [];
      grouped[ann.pageNumber].push(ann);
    }
    const pageNums = Object.keys(grouped).map(Number).sort((a, b) => a - b);
    const rows = pageNums.map((pNum) => {
      const anns = grouped[pNum];
      const items = anns.map((a) => {
        const date = a.createdAt ? new Date(a.createdAt).toLocaleString() : '';
        const textContent = a.text && !a.text.startsWith('data:') ? a.text : '';
        return `<tr>
          <td style="padding:4px 8px;border:1px solid #ddd">${a.kind}</td>
          <td style="padding:4px 8px;border:1px solid #ddd">${textContent}</td>
          <td style="padding:4px 8px;border:1px solid #ddd">${a.author || ''}</td>
          <td style="padding:4px 8px;border:1px solid #ddd">${date}</td>
          <td style="padding:4px 8px;border:1px solid #ddd">${a.color || ''}</td>
        </tr>`;
      }).join('');
      return `<h3 style="margin:16px 0 4px">Page ${pNum}</h3>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <thead><tr style="background:#f1f5f9">
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Type</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Content</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Author</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Date</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Color</th>
          </tr></thead>
          <tbody>${items}</tbody>
        </table>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Annotation Report - ${activeTab.fileName}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}h1{font-size:20px}h3{font-size:15px}table{margin-bottom:16px}</style>
      </head><body>
      <h1>Annotation Report</h1>
      <p><strong>Document:</strong> ${activeTab.fileName}<br><strong>Total annotations:</strong> ${annotations.length}<br><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      ${pageNums.length > 0 ? rows : '<p>No annotations found.</p>'}
      </body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotation_report_${activeTab.fileName.replace(/\.pdf$/i, '')}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setStatusMsg('Exported annotation report');
  };

  const handleExportTextFormat = (ext: 'txt' | 'md') => {
    if (!activeTab) return;
    const body = pages
      .map((p) => (ext === 'md' ? `## Page ${p.pageNumber}\n\n${p.text || ''}` : `--- Page ${p.pageNumber} ---\n${p.text || ''}`))
      .join('\n\n');
    const blob = new Blob([body], { type: ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab.fileName.replace(/\.pdf$/i, '')}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleExportXFDF = () => {
    const fields = Object.entries(formValues).map(([name, val]) => {
      const strVal = typeof val === 'boolean' ? (val ? 'Yes' : 'Off') : String(val);
      return `<field name="${name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"><value>${strVal.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</value></field>`;
    }).join('');
    const xfdf = `<?xml version="1.0" encoding="UTF-8"?><xfdf xmlns="http://ns.adobe.com/xfdf/"><fields>${fields}</fields></xfdf>`;
    const blob = new Blob([xfdf], { type: 'application/vnd.adobe.xfdf+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (pdfMeta?.fileName || 'form').replace(/\.pdf$/i, '') + '.xfdf';
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('Exported XFDF form data');
  };

  const handleImportXFDF = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xfdf,.xml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/xml');
          const fieldEls = doc.querySelectorAll('field');
          const imported: Record<string, string | boolean> = {};
          fieldEls.forEach((el) => {
            const name = el.getAttribute('name');
            const valEl = el.querySelector('value');
            if (name && valEl) {
              const val = valEl.textContent || '';
              imported[name] = val === 'Yes' ? true : val === 'Off' ? false : val;
            }
          });
          setFormValues((prev) => ({ ...prev, ...imported }));
          setStatusMsg(`Imported ${Object.keys(imported).length} form field(s) from XFDF`);
        } catch {
          setStatusMsg('Failed to parse XFDF file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExportZipImages = async () => {
    if (!pdfDoc || !activeTab) return;
    setLoading(true);
    try {
      const nums = pages.map((p) => p.pageNumber);
      const blob = await exportPDFPagesToImagesZip(pdfDoc, nums, 'png', activeTab.fileName.replace(/\.pdf$/i, ''));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab.fileName.replace(/\.pdf$/i, '')}_pages_png.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatusMsg(`Exported ${nums.length} PNG pages`);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'ZIP export failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintWithOptions = async (opts: {
    scope: 'all' | 'current' | 'range';
    rangeExpr: string;
    subset: 'all' | 'odd' | 'even';
    orientation: 'auto' | 'portrait' | 'landscape';
    includeAnnotations: boolean;
  }) => {
    if (!pdfDoc || !currentPage) return;
    setShowPrintModal(false);
    setLoading(true);
    try {
      const rawNums =
        opts.scope === 'current'
          ? [activePageNum]
          : opts.scope === 'range'
            ? parsePageRangeExpression(opts.rangeExpr, pages.length)
            : pages.map((p) => p.pageNumber);
      const subsetFiltered = rawNums.filter((n) =>
        opts.subset === 'odd' ? n % 2 === 1 : opts.subset === 'even' ? n % 2 === 0 : true
      );
      const validNums = subsetFiltered.length > 0 ? subsetFiltered : [activePageNum];
      const hasWm = Boolean(watermarkCfg.text.trim());
      const hasHf = Boolean(
        watermarkCfg.headerLeft || watermarkCfg.headerRight || watermarkCfg.footerCenter || watermarkCfg.pageNumbers || watermarkCfg.batesPrefix
      );
      const wmScope = watermarkCfg.scope || 'all';
      const wmRangeSet =
        wmScope === 'range' && watermarkCfg.rangeExpr
          ? new Set(parsePageRangeExpression(watermarkCfg.rangeExpr, pages.length))
          : null;

      const imgs: string[] = [];
      for (const pNum of validNums) {
        const pg = pages.find((x) => x.pageNumber === pNum);
        const hi = await renderPDFPageHighResDataUrl(pdfDoc, pNum, 1300);
        const pageAnns = opts.includeAnnotations ? annotations.filter((a) => a.pageNumber === pNum) : [];
        const applyOverlay =
          opts.includeAnnotations &&
          (hasWm || hasHf) &&
          (wmScope === 'all' || (wmScope === 'current' && pNum === activePageNum) || Boolean(wmRangeSet?.has(pNum)));
        const wmDataUrl = applyOverlay
          ? await renderWatermarkFooterOverlayPng(
              pg?.ptWidth || 595,
              pg?.ptHeight || 842,
              pNum,
              pages.length,
              hasWm ? watermarkCfg : undefined,
              hasHf ? watermarkCfg : undefined,
              hasWm,
              hasHf
            )
          : null;

        const pageWidgets = opts.includeAnnotations
          ? widgetsByPage[pNum] || (await extractPDFPageWidgets(pdfDoc, pNum).catch(() => [] as PDFFormWidget[]))
          : [];
        const hasFilledWidgets = pageWidgets.length > 0;

        if (pageAnns.length > 0 || wmDataUrl || hasFilledWidgets) {
          const baseImg = new Image();
          await new Promise<void>((res) => {
            baseImg.onload = () => res();
            baseImg.onerror = () => res();
            baseImg.src = hi.dataUrl;
          });
          const c = document.createElement('canvas');
          c.width = hi.width;
          c.height = hi.height;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(baseImg, 0, 0);
          if (hasFilledWidgets) {
            renderFormValuesToCanvas(ctx, pageWidgets, formValues, hi.width, hi.height);
          }
          if (pageAnns.length > 0) {
            await renderAnnotationsToCanvas(ctx, pageAnns, hi.width, hi.height, pg?.ptWidth || 595, pg?.ptHeight || 842);
          }
          if (wmDataUrl) {
            const wmImg = new Image();
            await new Promise<void>((res) => {
              wmImg.onload = () => res();
              wmImg.onerror = () => res();
              wmImg.src = wmDataUrl;
            });
            if (wmImg.naturalWidth > 0) ctx.drawImage(wmImg, 0, 0, hi.width, hi.height);
          }
          imgs.push(c.toDataURL('image/png'));
        } else {
          imgs.push(hi.dataUrl);
        }
      }
      const orientCss = opts.orientation !== 'auto' ? `size:${opts.orientation};` : '';
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(iframe);
      const printWin = iframe.contentWindow;
      const doc = printWin?.document;
      if (doc && printWin) {
        doc.open();
        doc.write(
          `<html><head><style>@page{margin:0;${orientCss}}body{margin:0}img{width:100%;display:block;page-break-after:always}</style></head><body>${imgs
            .map((src) => `<img src="${src}"/>`)
            .join('')}</body></html>`
        );
        doc.close();
        const imgEls = Array.from(doc.querySelectorAll('img'));
        await Promise.all(
          imgEls.map((el) =>
            el.complete
              ? Promise.resolve()
              : new Promise<void>((res) => {
                  el.onload = () => res();
                  el.onerror = () => res();
                })
          )
        );
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          iframe.remove();
        };
        printWin.addEventListener('afterprint', cleanup, { once: true });
        printWin.focus();
        printWin.print();
        setTimeout(cleanup, 60000);
      } else {
        iframe.remove();
      }
    } finally {
      setLoading(false);
    }
  };

  const renderCompositedPageToBoard = async (page: LoadedPDFPage, rect?: { x: number; y: number; w: number; h: number }) => {
    const hi = pdfDoc
      ? await renderPDFPageHighResDataUrl(pdfDoc, page.pageNumber, 1900)
      : { dataUrl: page.dataUrl, width: page.width, height: page.height };
    const baseImg = new Image();
    await new Promise<void>((res) => {
      baseImg.onload = () => res();
      baseImg.onerror = () => res();
      baseImg.src = hi.dataUrl;
    });
    const outW = baseImg.naturalWidth || hi.width || 1200;
    const outH = baseImg.naturalHeight || hi.height || 1600;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = outW;
    fullCanvas.height = outH;
    const fCtx = fullCanvas.getContext('2d')!;
    if (baseImg.naturalWidth > 0) fCtx.drawImage(baseImg, 0, 0, outW, outH);

    const pageWidgets = widgetsByPage[page.pageNumber] || [];
    if (pageWidgets.length > 0) {
      renderFormValuesToCanvas(fCtx, pageWidgets, formValues, outW, outH);
    }

    const pageAnns = annotations.filter((a) => a.pageNumber === page.pageNumber);
    if (pageAnns.length > 0) {
      await renderAnnotationsToCanvas(fCtx, pageAnns, outW, outH, page.ptWidth || 595, page.ptHeight || 842);
    }

    if (rect) {
      const sx = Math.round(rect.x * fullCanvas.width);
      const sy = Math.round(rect.y * fullCanvas.height);
      const sw = Math.max(24, Math.round(rect.w * fullCanvas.width));
      const sh = Math.max(24, Math.round(rect.h * fullCanvas.height));
      const crop = document.createElement('canvas');
      crop.width = sw;
      crop.height = sh;
      crop.getContext('2d')!.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      onSendPageToBoard(crop.toDataURL('image/png'), `${activeTab?.fileName || 'PDF'} Snip (p.${page.pageNumber})`, sw, sh);
    } else {
      onSendPageToBoard(
        fullCanvas.toDataURL('image/png'),
        `${activeTab?.fileName || 'PDF'} p.${page.pageNumber}`,
        fullCanvas.width,
        fullCanvas.height
      );
    }
  };

  const handleInsertSignatureDataUrl = (dataUrl: string) => {
    try {
      localStorage.setItem(SAVED_SIG_KEY, dataUrl);
      setSavedSigUrl(dataUrl);
    } catch {
      // ignore storage quota
    }
    const newId = uid('ann');
    updateAnnotations(
      (prev) => [
        ...prev,
        {
          id: newId,
          pageNumber: activePageNum,
          kind: 'stamp',
          x: 0.56,
          y: 0.74,
          w: 0.24,
          h: 0.09,
          color: '#0F172A',
          text: dataUrl,
          createdAt: Date.now(),
        },
      ],
      activePageNum
    );
    setSelectedAnnId(newId);
    setAnnTool('select');
    setShowSigModal(false);
  };

  const applySelectionMarkup = (kind: 'highlight' | 'underline' | 'strike') => {
    if (!textSelMenu) return;
    // Merge adjacent horizontal span rects on the same visual line into clean single rects
    const sorted = [...textSelMenu.rects].sort((a, b) => (Math.abs(a.y - b.y) < 0.008 ? a.x - b.x : a.y - b.y));
    const merged: { x: number; y: number; w: number; h: number }[] = [];
    for (const r of sorted) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(r.y - last.y) < 0.008 && Math.abs(r.h - last.h) < 0.012 && r.x <= last.x + last.w + 0.018) {
        const right = Math.max(last.x + last.w, r.x + r.w);
        const bottom = Math.max(last.y + last.h, r.y + r.h);
        last.x = Math.min(last.x, r.x);
        last.y = Math.min(last.y, r.y);
        last.w = right - last.x;
        last.h = bottom - last.y;
      } else {
        merged.push({ ...r });
      }
    }
    const snippet = textSelMenu.selectedText.slice(0, 120);
    const newAnns: PDFAnnotation[] = merged.map((r, idx) => ({
      id: uid('ann'),
      pageNumber: textSelMenu.pageNumber,
      kind,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      color: kind === 'highlight' ? '#FACC15' : kind === 'underline' ? '#2563EB' : '#EF4444',
      strokeWidth: 2,
      opacity: kind === 'highlight' ? 0.36 : 1,
      text: idx === 0 ? snippet : undefined,
      createdAt: Date.now(),
    }));
    updateAnnotations((prev) => [...prev, ...newAnns], textSelMenu.pageNumber);
    window.getSelection()?.removeAllRanges();
    setTextSelMenu(null);
  };

  const eraseAtPoint = (pageNumber: number, x: number, y: number, recordUndo: boolean): boolean => {
    const threshold = 0.024;
    const hitFn = (a: PDFAnnotation): boolean => {
      if (a.pageNumber !== pageNumber || a.locked) return false;
      if ((a.kind === 'draw' || a.kind === 'highlighter_ink') && a.points?.length) {
        if (a.points.length === 1) return Math.hypot(a.points[0].x - x, a.points[0].y - y) < threshold;
        for (let i = 0; i < a.points.length - 1; i++) {
          if (distToSegment(x, y, a.points[i].x, a.points[i].y, a.points[i + 1].x, a.points[i + 1].y) < threshold) return true;
        }
        return false;
      }
      if ((a.kind === 'line' || a.kind === 'arrow' || a.kind === 'measure') && typeof a.x2 === 'number' && typeof a.y2 === 'number') {
        return distToSegment(x, y, a.x, a.y, a.x2, a.y2) < threshold;
      }
      const aw = a.w || (a.kind === 'stamp' ? 0.16 : 0.14);
      const ah = a.h || (a.kind === 'underline' || a.kind === 'strike' ? 0.03 : 0.05);
      return x >= a.x - 0.015 && x <= a.x + aw + 0.015 && y >= a.y - 0.015 && y <= a.y + ah + 0.015;
    };
    const erasedIds = new Set(annotationsRef.current.filter(hitFn).map((a) => a.id));
    if (erasedIds.size === 0) return false;
    if (selectedAnnId && erasedIds.has(selectedAnnId)) setSelectedAnnId(null);
    if (openThreadId && erasedIds.has(openThreadId)) setOpenThreadId(null);
    if (recordUndo) {
      updateAnnotations((prev) => prev.filter((a) => !erasedIds.has(a.id)), pageNumber);
    } else {
      setAnnotations((prev) => {
        const next = prev.filter((a) => !erasedIds.has(a.id));
        annotationsRef.current = next;
        return next;
      });
    }
    return true;
  };

  const effectiveTool: PageToolMode = spacePressed ? 'pan' : readerMode ? 'select' : annTool;

  const onPointerDownPage = (e: React.PointerEvent<HTMLDivElement>, pageNumber: number) => {
    if (e.button !== 0) return;
    setExportMenuPos(null);
    setMoreMenuPos(null);
    setZoomMenuPos(null);
    setShapesMenuPos(null);
    setContextMenu(null);
    setTextSelMenu(null);

    if (effectiveTool !== 'pan' && activePageNum !== pageNumber) {
      setActivePageNum(pageNumber);
    }

    if (effectiveTool === 'pan') {
      if (!viewerRef.current) return;
      drawRef.current = {
        active: true,
        mode: 'pan_drag',
        pageNumber,
        startX: 0,
        startY: 0,
        panClientX: e.clientX,
        panClientY: e.clientY,
        scrollLeft: viewerRef.current.scrollLeft,
        scrollTop: viewerRef.current.scrollTop,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (effectiveTool === 'select') {
      selectionStartPageRef.current = pageNumber;
      if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.pdf-text-layer')) {
        setSelectedAnnId(null);
        setOpenThreadId(null);
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (effectiveTool === 'snip') {
      drawRef.current = { active: true, mode: 'draw', pageNumber, startX: x, startY: y, startClientX: e.clientX, startClientY: e.clientY, moved: false };
      setSnipRect({ pageNumber, x, y, w: 0.005, h: 0.005 });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (effectiveTool === 'erase') {
      drawRef.current = { active: true, mode: 'draw', pageNumber, startX: x, startY: y, eraseSnapshotted: false };
      if (eraseAtPoint(pageNumber, x, y, true)) {
        drawRef.current.eraseSnapshotted = true;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (effectiveTool === 'comment' || effectiveTool === 'sticky' || effectiveTool === 'text' || effectiveTool === 'callout') {
      setPendingNote({
        kind: effectiveTool,
        pageNumber,
        x,
        y,
        x2: effectiveTool === 'callout' ? Math.max(0.05, x - 0.08) : undefined,
        y2: effectiveTool === 'callout' ? Math.max(0.05, y - 0.06) : undefined,
        text: '',
      });
      return;
    }

    if (effectiveTool === 'stamp') {
      const todayStr = new Date().toLocaleDateString();
      const label = stampText === 'TODAY DATE'
        ? todayStr
        : stampText.includes('[DATE]')
          ? stampText.replace('[DATE]', todayStr)
          : stampText;
      const style = toolDefaults.stampStyle;
      const newId = uid('ann');
      const maxZ = annotationsRef.current.filter((a) => a.pageNumber === pageNumber).reduce((m, a) => Math.max(m, a.zIndex ?? 0), 0);
      updateAnnotations(
        (prev) => [
          ...prev,
          {
            id: newId,
            pageNumber,
            kind: 'stamp',
            x,
            y,
            w: style === 'diagonal' ? 0.5 : 0.18,
            h: style === 'diagonal' ? 0.5 : 0.045,
            color: annColor === '#FACC15' ? '#DC2626' : annColor,
            fillColor: style === 'border' ? 'transparent' : toolDefaults.fillColor !== 'transparent' ? toolDefaults.fillColor : undefined,
            strokeWidth: toolDefaults.strokeWidth,
            strokeStyle: toolDefaults.strokeStyle,
            borderRadius: toolDefaults.borderRadius,
            opacity: style === 'diagonal' ? 0.15 : toolDefaults.opacity,
            rotation: style === 'diagonal' ? -35 : toolDefaults.rotation,
            fontFamily: toolDefaults.fontFamily,
            fontSize: style === 'diagonal' ? 48 : toolDefaults.fontSize,
            fontWeight: toolDefaults.fontWeight,
            fontStyle: toolDefaults.fontStyle,
            underline: toolDefaults.underline,
            stampStyle: style,
            zIndex: maxZ + 1,
            text: label,
            createdAt: Date.now(),
          },
        ],
        pageNumber
      );
      setSelectedAnnId(newId);
      setAnnTool('select');
      return;
    }

    snapshotPageUndo(pageNumber);
    const newId = uid('ann');
    const maxZ = annotationsRef.current.filter((a) => a.pageNumber === pageNumber).reduce((m, a) => Math.max(m, a.zIndex ?? 0), 0);
    drawRef.current = {
      active: true,
      mode: 'draw',
      annId: newId,
      pageNumber,
      startX: x,
      startY: y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);

    const isPointStroke = effectiveTool === 'draw' || effectiveTool === 'highlighter_ink';
    const isLineLike = effectiveTool === 'line' || effectiveTool === 'arrow' || effectiveTool === 'measure';
    setAnnotations((prev) => {
      const next: PDFAnnotation[] = [
        ...prev,
        {
          id: newId,
          pageNumber,
          kind: effectiveTool,
          x,
          y,
          w: isLineLike ? undefined : 0.005,
          h: isLineLike ? undefined : 0.005,
          x2: isLineLike ? x : undefined,
          y2: isLineLike ? y : undefined,
          points: isPointStroke ? [{ x, y }] : undefined,
          color: effectiveTool === 'redact' ? '#DC2626' : effectiveTool === 'measure' && annColor === '#FACC15' ? '#2563EB' : annColor,
          fillColor:
            (effectiveTool === 'rect' || effectiveTool === 'circle') && toolDefaults.fillColor !== 'transparent'
              ? toolDefaults.fillColor
              : undefined,
          strokeWidth,
          strokeStyle: toolDefaults.strokeStyle,
          borderRadius: effectiveTool === 'rect' ? toolDefaults.borderRadius : undefined,
          opacity: effectiveTool === 'highlight' || effectiveTool === 'highlighter_ink' ? 0.36 : toolDefaults.opacity,
          measureUnit: effectiveTool === 'measure' ? toolDefaults.measureUnit : undefined,
          measureScale: effectiveTool === 'measure' ? toolDefaults.measureScale : undefined,
          zIndex: maxZ + 1,
          createdAt: Date.now(),
        },
      ];
      annotationsRef.current = next;
      return next;
    });
  };

  const onPointerMovePage = (e: React.PointerEvent<HTMLDivElement>, pageNumber: number) => {
    if (!drawRef.current.active || drawRef.current.pageNumber !== pageNumber) return;
    if (drawRef.current.mode === 'pan_drag' && viewerRef.current) {
      viewerRef.current.scrollLeft = (drawRef.current.scrollLeft || 0) - (e.clientX - (drawRef.current.panClientX || 0));
      viewerRef.current.scrollTop = (drawRef.current.scrollTop || 0) - (e.clientY - (drawRef.current.panClientY || 0));
      return;
    }
    if (
      !drawRef.current.moved &&
      typeof drawRef.current.startClientX === 'number' &&
      typeof drawRef.current.startClientY === 'number' &&
      Math.hypot(e.clientX - drawRef.current.startClientX, e.clientY - drawRef.current.startClientY) > 4
    ) {
      drawRef.current.moved = true;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const id = drawRef.current.annId;

    if (drawRef.current.mode === 'move' && id) {
      const dx = x - drawRef.current.startX;
      const dy = y - drawRef.current.startY;
      setAnnotations((prev) => {
        const next = prev.map((a) => {
          if (a.id !== id) return a;
          const origX = drawRef.current.origX ?? a.x;
          const origY = drawRef.current.origY ?? a.y;
          const nextX = Math.max(0, Math.min(0.96, origX + dx));
          const nextY = Math.max(0, Math.min(0.96, origY + dy));
          const appliedDx = nextX - origX;
          const appliedDy = nextY - origY;
          return {
            ...a,
            x: nextX,
            y: nextY,
            ...(typeof drawRef.current.origX2 === 'number'
              ? { x2: Math.max(0, Math.min(1, drawRef.current.origX2 + appliedDx)) }
              : {}),
            ...(typeof drawRef.current.origY2 === 'number'
              ? { y2: Math.max(0, Math.min(1, drawRef.current.origY2 + appliedDy)) }
              : {}),
            ...(drawRef.current.origPoints
              ? {
                  points: drawRef.current.origPoints.map((pt) => ({
                    x: Math.max(0, Math.min(1, pt.x + appliedDx)),
                    y: Math.max(0, Math.min(1, pt.y + appliedDy)),
                  })),
                }
              : {}),
          };
        });
        annotationsRef.current = next;
        return next;
      });
      return;
    }

    if (drawRef.current.mode === 'resize' && id) {
      const dx = x - drawRef.current.startX;
      const dy = y - drawRef.current.startY;
      setAnnotations((prev) => {
        const next = prev.map((a) =>
          a.id === id
            ? {
                ...a,
                w: Math.min(1 - a.x, Math.max(0.02, (drawRef.current.origW ?? 0.12) + dx)),
                h: Math.min(1 - a.y, Math.max(0.015, (drawRef.current.origH ?? 0.05) + dy)),
              }
            : a
        );
        annotationsRef.current = next;
        return next;
      });
      return;
    }

    if (drawRef.current.mode === 'endpoint_start' && id) {
      const pg = pages.find((p) => p.pageNumber === pageNumber);
      setAnnotations((prev) => {
        const next = prev.map((a) => {
          if (a.id !== id) return a;
          const lbl =
            a.kind === 'measure'
              ? formatMeasureDistance(
                  x,
                  y,
                  a.x2 ?? x,
                  a.y2 ?? y,
                  pg?.ptWidth || 595,
                  pg?.ptHeight || 842,
                  a.measureUnit || measureUnit,
                  a.measureScale || toolDefaults.measureScale
                )
              : a.text;
          return { ...a, x, y, text: lbl };
        });
        annotationsRef.current = next;
        return next;
      });
      return;
    }

    if (drawRef.current.mode === 'endpoint_end' && id) {
      const pg = pages.find((p) => p.pageNumber === pageNumber);
      setAnnotations((prev) => {
        const next = prev.map((a) => {
          if (a.id !== id) return a;
          const lbl =
            a.kind === 'measure'
              ? formatMeasureDistance(
                  a.x,
                  a.y,
                  x,
                  y,
                  pg?.ptWidth || 595,
                  pg?.ptHeight || 842,
                  a.measureUnit || measureUnit,
                  a.measureScale || toolDefaults.measureScale
                )
              : a.text;
          return { ...a, x2: x, y2: y, text: lbl };
        });
        annotationsRef.current = next;
        return next;
      });
      return;
    }

    if (effectiveTool === 'snip') {
      setSnipRect({
        pageNumber,
        x: Math.min(drawRef.current.startX, x),
        y: Math.min(drawRef.current.startY, y),
        w: Math.abs(x - drawRef.current.startX),
        h: Math.abs(y - drawRef.current.startY),
      });
      return;
    }

    if (effectiveTool === 'erase') {
      const shouldRecordUndo = !drawRef.current.eraseSnapshotted;
      if (eraseAtPoint(pageNumber, x, y, shouldRecordUndo) && shouldRecordUndo) {
        drawRef.current.eraseSnapshotted = true;
      }
      return;
    }

    if (!id) return;
    setAnnotations((prev) => {
      const next = prev.map((a) => {
        if (a.id !== id) return a;
        if (a.kind === 'draw' || a.kind === 'highlighter_ink') {
          return { ...a, points: [...(a.points || []), { x, y }] };
        }
        if (a.kind === 'line' || a.kind === 'arrow' || a.kind === 'measure') {
          const pg = pages.find((p) => p.pageNumber === pageNumber);
          const lbl =
            a.kind === 'measure'
              ? formatMeasureDistance(
                  a.x,
                  a.y,
                  x,
                  y,
                  pg?.ptWidth || 595,
                  pg?.ptHeight || 842,
                  a.measureUnit || measureUnit,
                  a.measureScale || toolDefaults.measureScale
                )
              : a.text;
          return { ...a, x2: x, y2: y, text: lbl };
        }
        return {
          ...a,
          x: Math.min(drawRef.current.startX, x),
          y: Math.min(drawRef.current.startY, y),
          w: Math.max(0.01, Math.abs(x - drawRef.current.startX)),
          h: Math.max(0.01, Math.abs(y - drawRef.current.startY)),
        };
      });
      annotationsRef.current = next;
      return next;
    });
  };

  const onPointerUpPage = (e: React.PointerEvent<HTMLDivElement>, pageNumber: number) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drawRef.current.active) {
      const prevMode = drawRef.current.mode;
      const annId = drawRef.current.annId;
      const moved = drawRef.current.moved;
      drawRef.current.active = false;
      if (prevMode === 'draw' && effectiveTool === 'snip' && snipRect && snipRect.pageNumber === pageNumber) {
        const pg = pages.find((p) => p.pageNumber === pageNumber);
        if (pg && snipRect.w >= 0.02 && snipRect.h >= 0.02) {
          void renderCompositedPageToBoard(pg, snipRect).then(() => setStatusMsg('Snipped to Board'));
        }
        setSnipRect(null);
        return;
      }
      if (prevMode === 'draw' && annId) {
        const created = annotationsRef.current.find((a) => a.id === annId);
        if (created) {
          if ((created.kind === 'draw' || created.kind === 'highlighter_ink') && created.points?.length === 1) {
            const p0 = created.points[0];
            const dotted = annotationsRef.current.map((a) =>
              a.id === annId
                ? { ...a, points: [p0, { x: Math.min(1, p0.x + 0.0005), y: Math.min(1, p0.y + 0.0005) }] }
                : a
            );
            annotationsRef.current = dotted;
            setAnnotations(dotted);
          } else if (created.kind !== 'draw' && created.kind !== 'highlighter_ink') {
            const isTinyLine =
              (created.kind === 'line' || created.kind === 'arrow' || created.kind === 'measure') &&
              Math.hypot((created.x2 ?? created.x) - created.x, (created.y2 ?? created.y) - created.y) < 0.01;
            const isTinyBox =
              created.kind !== 'line' &&
              created.kind !== 'arrow' &&
              created.kind !== 'measure' &&
              (created.w || 0) < 0.012 &&
              (created.h || 0) < 0.012;
            if (!moved && (isTinyLine || isTinyBox)) {
              const filtered = annotationsRef.current.filter((a) => a.id !== annId);
              annotationsRef.current = filtered;
              setAnnotations(filtered);
              setUndoByPage((u) => {
                const s = u[pageNumber] || [];
                return s.length > 0 ? { ...u, [pageNumber]: s.slice(0, -1) } : u;
              });
            }
          }
        }
      }
      if (activeTab?.id) tabAnnotationsRef.current[activeTab.id] = annotationsRef.current;
      if (pdfMeta?.fileId && onSyncAnnotations) {
        onSyncAnnotations(pdfMeta.fileId, annotationsRef.current);
      }
    }
  };

  const resolveSelectionToolbarForPage = useCallback((pageNumber: number) => {
    const pageEl = pageRefs.current[pageNumber];
    if (!pageEl) return;
    const sel = window.getSelection();
    const txt = sel?.toString().trim() || '';
    if (!sel || sel.rangeCount === 0 || !txt) {
      setTextSelMenu(null);
      return;
    }
    const pageRect = pageEl.getBoundingClientRect();
    const range = sel.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 2 && r.height > 2);
    if (clientRects.length === 0) return;

    const normRects = clientRects.map((r) => ({
      x: Math.max(0, (r.left - pageRect.left) / pageRect.width),
      y: Math.max(0, (r.top - pageRect.top) / pageRect.height),
      w: Math.min(1, r.width / pageRect.width),
      h: Math.min(1, r.height / pageRect.height),
    }));
    const wordRects = getSelectionWordRects(range, pageRect, txt);
    const first = clientRects[0];
    const rawTop = first.top - pageRect.top;
    const topPx = rawTop < 50 ? Math.min(pageRect.height - 46, first.bottom - pageRect.top + 8) : rawTop - 42;
    setTextSelMenu({
      pageNumber,
      leftPx: Math.max(12, Math.min(pageRect.width - 230, first.left - pageRect.left)),
      topPx: Math.max(8, topPx),
      selectedText: txt,
      rects: normRects,
      wordRects,
    });
  }, []);

  useEffect(() => {
    const onWinMouseUp = () => {
      const pNum = selectionStartPageRef.current;
      if (!pNum) return;
      selectionStartPageRef.current = null;
      requestAnimationFrame(() => resolveSelectionToolbarForPage(pNum));
    };
    let selTimer = 0;
    const onSelectionChange = () => {
      if (effectiveTool !== 'select' || drawRef.current.active) return;
      window.clearTimeout(selTimer);
      selTimer = window.setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) return;
        const anchor = sel.anchorNode;
        if (!anchor) return;
        for (const [pStr, el] of Object.entries(pageRefs.current)) {
          if (el && el.contains(anchor)) {
            resolveSelectionToolbarForPage(Number(pStr));
            break;
          }
        }
      }, 160);
    };
    window.addEventListener('mouseup', onWinMouseUp);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      window.clearTimeout(selTimer);
      window.removeEventListener('mouseup', onWinMouseUp);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [effectiveTool, resolveSelectionToolbarForPage]);

  const onMouseUpPage = (_e: React.MouseEvent<HTMLDivElement>, pageNumber: number) => {
    if (effectiveTool !== 'select' || drawRef.current.active) return;
    selectionStartPageRef.current = null;
    resolveSelectionToolbarForPage(pageNumber);
  };

  const storedPdfs = Array.from(
    new Map(attachedFiles.filter((file) => file.kind === 'pdf').map((file) => [file.fileId, file])).values()
  );
  const handleDeleteWorkspacePdfs = async (fileIds: string[]) => {
    const uniqueFileIds = Array.from(new Set(fileIds));
    const filesToDelete = storedPdfs.filter((file) => uniqueFileIds.includes(file.fileId));
    if (filesToDelete.length === 0 || deletingPdfs) return;

    const confirmation =
      filesToDelete.length === 1
        ? `Remove "${filesToDelete[0].fileName}" from this workspace?`
        : `Remove all ${filesToDelete.length} PDFs from this workspace?`;
    if (!window.confirm(`${confirmation}\n\nThe PDF and its saved annotations will be removed. Board content already using the file will be kept.`)) {
      return;
    }

    setDeletingPdfs(true);
    try {
      await onDeleteFiles(filesToDelete.map((file) => file.fileId));
      for (const file of filesToDelete) {
        try {
          localStorage.removeItem(`${READER_PROGRESS_KEY}:${workspaceId}:${file.fileId}`);
        } catch {
          // Local storage may be unavailable.
        }
      }
      setWorkspaceMenuPos(null);
      setStatusMsg(filesToDelete.length === 1 ? 'PDF removed from workspace.' : `${filesToDelete.length} PDFs removed from workspace.`);
    } catch (error: unknown) {
      setStatusMsg(error instanceof Error ? error.message : 'Could not remove the selected PDFs.');
    } finally {
      setDeletingPdfs(false);
    }
  };
  const currentUndoCount = (undoByPage[activePageNum] || []).length;
  const currentRedoCount = (redoByPage[activePageNum] || []).length;
  const selectedAnn = selectedAnnId ? annotations.find((a) => a.id === selectedAnnId) || null : null;

  const ShapeIcon = shapeChoice === 'arrow' ? ArrowUpRight : shapeChoice === 'line' ? Minus : shapeChoice === 'circle' ? Circle : Square;

  const renderMarkupBtn = (id: PageToolMode, Icon: React.ComponentType<{ className?: string }>, title: string) => (
    <button
      key={id}
      type="button"
      title={title}
      onClick={() => {
        setAnnTool(id);
        setTextSelMenu(null);
        if (id !== 'select') setSelectedAnnId(null);
      }}
      className={`p-1.5 rounded-lg transition-colors shrink-0 ${
        annTool === id ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <div
      ref={containerRef}
      onPointerMove={() => {
        if (readerMode) pingReaderHud();
      }}
      onTouchStart={() => {
        if (readerMode) pingReaderHud();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) void handleUploadPDF(f);
      }}
      className={`${fullscreen || readerMode ? 'fixed inset-0 z-50' : 'flex-1'} flex flex-col min-h-0 bg-slate-100 dark:bg-slate-950 relative`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUploadPDF(f);
          e.target.value = '';
        }}
      />
      <input
        ref={insertImagePageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const pos = pendingImgPosRef.current;
          pendingImgPosRef.current = null;
          if (f) handleInsertImageAnnotation(f, pos?.pageNumber ?? activePageNum, pos?.x ?? 0.25, pos?.y ?? 0.24);
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f || !pdfBytes) return;
          setLoading(true);
          try {
            const nextBytes = await replacePDFPages(pdfBytes, await f.arrayBuffer(), activePageNum - 1);
            await commitMutatedPdfBytes(nextBytes, undefined, `Replaced page ${activePageNum}`);
          } catch (err: unknown) {
            setStatusMsg(err instanceof Error ? err.message : 'Replace failed');
          } finally {
            setLoading(false);
          }
        }}
      />

      {/* Primary Header Bar */}
      {!readerMode && (
        <div className="h-11 px-2 sm:px-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl flex items-center justify-between gap-1.5 sm:gap-2 overflow-hidden shrink-0">
          {pages.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSidebarMode((m) =>
                  m === 'expanded' ? (window.innerWidth < 640 ? 'hidden' : 'minimal') : 'expanded'
                )
              }
              title={sidebarMode === 'expanded' ? 'Minimal Sidebar' : 'Expand Sidebar'}
              className={`p-2 rounded-lg shrink-0 transition-colors ${
                sidebarMode === 'expanded'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex min-w-0 flex-1 items-center justify-start xl:justify-center gap-1.5 sm:gap-4 lg:gap-6 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 lg:min-w-0">
            {pages.length > 0 && (
              <div className="flex items-center gap-0.5 sm:gap-1 pl-1 sm:pl-1.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  disabled={activePageNum <= 1}
                  onClick={() => jumpToPage(activePageNum - (layoutMode === 'spread' ? (spreadCoverPage && activePageNum === 2 ? 1 : 2) : 1))}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    jumpToPage(Number(pageJumpInput) || 1);
                  }}
                  className="flex items-center gap-1 text-xs font-mono tabular-nums"
                >
                  <input
                    type="number"
                    min={1}
                    max={pages.length}
                    value={pageJumpInput}
                    onChange={(e) => setPageJumpInput(e.target.value)}
                    className="w-9 sm:w-11 px-1 py-0.5 text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded text-xs"
                  />
                  <span className="text-slate-400">/ {pages.length}</span>
                </form>
                <button
                  type="button"
                  disabled={activePageNum >= pages.length}
                  onClick={() =>
                    jumpToPage(activePageNum + (layoutMode === 'spread' ? (spreadCoverPage && activePageNum === 1 ? 1 : 2) : 1))
                  }
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {linkHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={jumpBackHistory}
                    title={`Back to page ${linkHistory[linkHistory.length - 1]}`}
                    className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 ml-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-mono tabular-nums"
                  >
                    <ArrowLeft className="w-3 h-3" /> p.{linkHistory[linkHistory.length - 1]}
                  </button>
                )}
              </div>
            )}
          </div>

          {pages.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg shrink-0">
                {[
                  { id: 'single', icon: BookOpen, title: 'Single Page' },
                  { id: 'scroll', icon: ScrollText, title: 'Continuous Scroll' },
                  { id: 'spread', icon: Columns2, title: 'Two-Page Spread' },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      title={m.title}
                      onClick={() => setLayoutMode(m.id as typeof layoutMode)}
                      className={`p-1 rounded-md transition-colors ${
                        layoutMode === m.id ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
                {layoutMode === 'spread' && (
                  <button
                    type="button"
                    onClick={() => setSpreadCoverPage((v) => !v)}
                    title={spreadCoverPage ? 'Cover Page Separate (On)' : 'Cover Page Separate (Off)'}
                    className={`px-1.5 py-0.5 ml-0.5 text-[10px] font-mono rounded ${
                      spreadCoverPage ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    1+2
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSplitView((v) => !v)}
                title="Split View (S)"
                className={`p-2 rounded-lg shrink-0 transition-colors ${
                  splitView ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>

              {splitView && openTabs.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleComparePages()}
                  disabled={compareMode && !diffResultUrl}
                  title="Visual diff — compare current pages side by side"
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 shrink-0 disabled:opacity-50"
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  Compare
                </button>
              )}

              <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/80 rounded-lg shrink-0">
                <button type="button" onClick={() => stepZoom(-0.15)} title="Zoom Out" className="px-1.5 py-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-l-lg text-slate-500 dark:text-slate-400">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    if (zoomMenuPos) {
                      setZoomMenuPos(null);
                      return;
                    }
                    const r = e.currentTarget.getBoundingClientRect();
                    setExportMenuPos(null);
                    setMoreMenuPos(null);
                    setShapesMenuPos(null);
            
                    setZoomMenuPos({ top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - 168, r.left + r.width / 2 - 80)) });
                  }}
                  className="flex items-center gap-1 px-1.5 sm:px-2 py-1 text-xs font-mono tabular-nums hover:bg-slate-200/50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <span>
                    {zoomMode === 'fit_width'
                      ? `Fit · ${Math.round(effectiveZoomScale * 100)}%`
                      : zoomMode === 'fit_page'
                        ? `Page · ${Math.round(effectiveZoomScale * 100)}%`
                        : `${Math.round(zoomScale * 100)}%`}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                <button type="button" onClick={() => stepZoom(0.15)} title="Zoom In" className="px-1.5 py-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded-r-lg text-slate-500 dark:text-slate-400">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <select
                value={readerTheme}
                onChange={(e) => setReaderTheme(e.target.value as typeof readerTheme)}
                title="Paper Theme"
                className="hidden md:block px-2 py-1.5 text-xs bg-slate-100/80 dark:bg-slate-800/80 rounded-lg shrink-0 text-slate-600 dark:text-slate-300"
              >
                <option value="light">Light</option>
                <option value="sepia">Sepia</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          )}

          {(pages.length > 0 || (hideTopBar && onShowTopBar)) && (
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {pages.length > 0 && (
                <>
                  {/* --- PDF Edit Tools --- */}
                  <div className="hidden md:flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => void handleRunOCRPages([activePageNum])}
                      title="OCR Current Page"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <ScanText className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleManipulate('rotate', [activePageNum - 1], -90)}
                      title="Rotate Left (-90°)"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCropModal(true)}
                      title="Crop Margins"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Crop className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSplitModal(true)}
                      title="Split & Extract"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Scissors className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCombineModal(true)}
                      title="Combine PDFs & Images"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Merge className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowWatermarkModal(true)}
                      title="Watermark & Page Numbers"
                      className="hidden lg:flex p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Droplets className="w-4 h-4" />
                    </button>
                  </div>

                  {/* divider */}
                  <div className="hidden md:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

                  {/* --- Pro Tools --- */}
                  <div className="hidden lg:flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => void handleExportPDF(true)}
                      title="Flatten PDF (Burn Annotations)"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <FileDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCompressModal(true)}
                      title="Compress / Optimize PDF"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <FileArchive className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(true)}
                      title="Password Protect / Encrypt"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <FileLock2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowA11yPanel(true)}
                      title="Accessibility Check"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <FileCheck2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* divider */}
                  <div className="hidden lg:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

                  {/* --- View Tools group --- */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen((v) => !v);
                        setTimeout(() => searchInputRef.current?.focus(), 40);
                      }}
                      title="Search (Ctrl+F)"
                      className={`p-2 rounded-lg transition-colors shrink-0 ${
                        searchOpen || searchQuery ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Search className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setReaderMode(true)}
                      title="Reader Mode (R)"
                      className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <BookOpenCheck className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrganizerOpen((v) => !v)}
                      title="Organize Pages"
                      className={`hidden sm:flex p-2 rounded-lg transition-colors shrink-0 ${
                        organizerOpen ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>

                  {/* divider */}
                  <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

                  {/* --- Action group --- */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentPage) void renderCompositedPageToBoard(currentPage);
                      }}
                      title="Send to Board"
                      className="hidden md:flex p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>

                    {onAskAIWithPage && currentPage && (
                      <button
                        type="button"
                        onClick={() =>
                          onAskAIWithPage(
                            `Explain and generate 3 key study points + 2 practice questions from page ${activePageNum} of "${activeTab?.fileName || 'this PDF'}".`,
                            currentPage.text || ''
                          )
                        }
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap shrink-0"
                        title="AI Explain Page"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">AI Page</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        if (exportMenuPos) {
                          setExportMenuPos(null);
                          return;
                        }
                        const r = e.currentTarget.getBoundingClientRect();
                        setZoomMenuPos(null);
                        setMoreMenuPos(null);
                        setShapesMenuPos(null);
                
                        setExportMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
                      }}
                      title="Export / Save"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg hover:opacity-90 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Export</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>
                  </div>

                  {/* divider */}
                  <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

                  {/* --- Utility group --- */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setShowShortcutsModal(true)}
                      title="Shortcuts (?)"
                      className="hidden lg:flex p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}

              {hideTopBar && onShowTopBar && (
                <button
                  type="button"
                  onClick={onShowTopBar}
                  title="Show Top Bar (Ctrl+\)"
                  aria-label="Show Top Bar"
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0 transition-colors"
                >
                  <PanelTopOpen className="w-3.5 h-3.5" />
                </button>
              )}

            </div>
          )}
          </div>
          {/* Fullscreen — always last */}
          {pages.length > 0 && (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              title={fullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
              className={`p-2 rounded-lg transition-colors shrink-0 ${
                fullscreen ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}

      {/* Markup Ribbon */}
      {!readerMode && pages.length > 0 && !organizerOpen && (
        <div className="h-8 px-1.5 bg-white/95 dark:bg-slate-900/95 flex items-center justify-between gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shrink-0"
              title="Open PDF"
            >
              <Upload className="w-3 h-3" />
            </button>
            <div className="w-px h-3.5 bg-slate-200/60 dark:bg-slate-700/40 mx-0.5" />
            {renderMarkupBtn('select', MousePointer2, 'Smart Cursor (Select Text & Move Annotations)')}
            {renderMarkupBtn('pan', Hand, 'Hand Pan (Space + Drag)')}

            <div className="w-px h-3.5 bg-slate-200/60 dark:bg-slate-700/40 mx-0.5" />

            {renderMarkupBtn('highlight', Highlighter, 'Highlight Area')}
            {renderMarkupBtn('underline', Underline, 'Underline')}
            {renderMarkupBtn('strike', Strikethrough, 'Strikethrough')}

            <div className="w-px h-3.5 bg-slate-200/60 dark:bg-slate-700/40 mx-0.5" />

            {renderMarkupBtn('draw', Pen, 'Pen Ink')}
            {renderMarkupBtn('highlighter_ink', Highlighter, 'Marker Ink')}
            {renderMarkupBtn('text', Type, 'Text Box')}
            {renderMarkupBtn('callout', MessageSquareText, 'Callout')}
            {renderMarkupBtn('comment', MessageSquare, 'Comment Pin')}
            {renderMarkupBtn('sticky', StickyNote, 'Sticky Note')}

            <div className="w-px h-3.5 bg-slate-200/60 dark:bg-slate-700/40 mx-0.5" />

            {/* Grouped Shapes Selector */}
            <button
              type="button"
              title="Shapes (Rect / Circle / Arrow / Line)"
              onClick={(e) => {
                setAnnTool(shapeChoice);
                const r = e.currentTarget.getBoundingClientRect();
                setShapesMenuPos((prev) => (prev ? null : { top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - 152, r.left)) }));
              }}
              className={`flex items-center gap-0.5 px-1.5 py-1 rounded-lg transition-colors shrink-0 ${
                annTool === 'rect' || annTool === 'circle' || annTool === 'arrow' || annTool === 'line'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ShapeIcon className="w-3.5 h-3.5" />
              <ChevronDown className="w-2.5 h-2.5 opacity-80" />
            </button>

            {renderMarkupBtn('stamp', Stamp, 'Stamp')}
            <button
              type="button"
              onClick={() => setShowSigModal(true)}
              title="Signature"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                pendingImgPosRef.current = null;
                insertImagePageInputRef.current?.click();
              }}
              title="Insert Image"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <ImagePlus className="w-3.5 h-3.5" />
            </button>
            {renderMarkupBtn('redact', ShieldAlert, 'Redact Area')}
            {redactionCount > 0 && (
              <button
                type="button"
                onClick={() => void handleApplyRedactions()}
                className="px-2 py-0.5 ml-0.5 rounded bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700 shrink-0"
              >
                Apply ({redactionCount})
              </button>
            )}
            {renderMarkupBtn('measure', Ruler, 'Measure Distance')}

            <div className="w-px h-3.5 bg-slate-200/60 dark:bg-slate-700/40 mx-0.5" />

            {renderMarkupBtn('snip', Crop, 'Snip to Board')}
            {renderMarkupBtn('erase', Eraser, 'Eraser')}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {annTool === 'stamp' && (
              <>
                <select
                  value={STAMP_PRESETS.includes(stampText) || STAMP_DATE_PRESETS.includes(stampText) || stampText === 'TODAY DATE' ? stampText : '__custom__'}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      const custom = prompt('Enter custom stamp text:');
                      if (custom?.trim()) setStampText(custom.trim());
                    } else {
                      setStampText(e.target.value);
                    }
                  }}
                  className="px-1.5 py-0.5 text-[11px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                >
                  {STAMP_PRESETS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="TODAY DATE">Today Date</option>
                  {STAMP_DATE_PRESETS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__custom__">Custom...</option>
                </select>
                <select
                  value={toolDefaults.stampStyle}
                  onChange={(e) => setToolDefaults((d) => ({ ...d, stampStyle: e.target.value as 'filled' | 'border' | 'diagonal' }))}
                  className="px-1.5 py-0.5 text-[11px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                >
                  {STAMP_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </>
            )}

            {annTool === 'measure' && (
              <select
                value={measureUnit}
                onChange={(e) => setMeasureUnit(e.target.value as MeasureUnit)}
                className="px-1.5 py-0.5 text-[11px] font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="in">in</option>
                <option value="ft">ft</option>
                <option value="pt">pt</option>
              </select>
            )}

            <div className="hidden lg:flex items-center gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAnnColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-4 h-4 rounded-full border ${
                    annColor.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-blue-600 ring-offset-1 border-white' : 'border-slate-300'
                  }`}
                />
              ))}
            </div>
            <input
              type="color"
              value={annColor}
              onChange={(e) => setAnnColor(e.target.value)}
              title="Color"
              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            />

            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded overflow-hidden text-[10px] font-mono">
              {[2, 4, 7].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setStrokeWidth(w)}
                  title={`Thickness ${w}px`}
                  className={`px-1.5 py-0.5 ${strokeWidth === w ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-950 text-slate-600'}`}
                >
                  {w}
                </button>
              ))}
            </div>

            <div className="w-px h-3.5 bg-slate-200/60 dark:bg-slate-700/40" />

            <button
              type="button"
              disabled={currentUndoCount === 0}
              onClick={handlePageUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-35"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={currentRedoCount === 0}
              onClick={handlePageRedo}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-35"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleManipulate('rotate', [activePageNum - 1], 90)}
              title="Rotate Page 90°"
              className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setShowProperties((v) => !v)}
              title="Properties Inspector"
              className={`p-1.5 rounded transition-colors ${
                showProperties ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                if (moreMenuPos) {
                  setMoreMenuPos(null);
                  return;
                }
                const r = e.currentTarget.getBoundingClientRect();
                setZoomMenuPos(null);
                setExportMenuPos(null);
                setShapesMenuPos(null);
        
                setMoreMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
              }}
              title="Document Tools"
              className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

          </div>
        </div>
      )}

      {/* Anchored Popovers: Shapes | Zoom | Export | More Tools */}
      {shapesMenuPos && (
        <div onClick={() => setShapesMenuPos(null)} className="fixed inset-0 z-50">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: `${shapesMenuPos.top}px`, left: `${shapesMenuPos.left}px` }}
            className="fixed w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 text-xs"
          >
            {[
              { id: 'rect' as ShapeChoice, label: 'Rectangle', icon: Square },
              { id: 'circle' as ShapeChoice, label: 'Circle', icon: Circle },
              { id: 'arrow' as ShapeChoice, label: 'Arrow', icon: ArrowUpRight },
              { id: 'line' as ShapeChoice, label: 'Line', icon: Minus },
            ].map((s) => {
              const Ico = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setShapeChoice(s.id);
                    setAnnTool(s.id);
                    setShapesMenuPos(null);
                  }}
                  className={`w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    annTool === s.id ? 'text-blue-600 font-semibold' : ''
                  }`}
                >
                  <Ico className="w-3.5 h-3.5" /> {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {zoomMenuPos && (
        <div onClick={() => setZoomMenuPos(null)} className="fixed inset-0 z-50">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: `${zoomMenuPos.top}px`, left: `${zoomMenuPos.left}px` }}
            className="fixed w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 text-xs"
          >
            {[
              { label: 'Fit Width', fn: () => { setZoomMode('fit_width'); setZoomScale(1); } },
              { label: 'Fit Page', fn: () => { setZoomMode('fit_page'); setZoomScale(0.8); } },
              { label: '100% Actual', fn: () => { setZoomMode('custom'); setZoomScale(1); } },
              { label: '125%', fn: () => { setZoomMode('custom'); setZoomScale(1.25); } },
              { label: '150%', fn: () => { setZoomMode('custom'); setZoomScale(1.5); } },
              { label: '200%', fn: () => { setZoomMode('custom'); setZoomScale(2); } },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.fn();
                  setZoomMenuPos(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 font-mono"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {exportMenuPos && (
        <div onClick={() => setExportMenuPos(null)} className="fixed inset-0 z-50">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: `${exportMenuPos.top}px`, right: `${exportMenuPos.right}px` }}
            className="fixed w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 text-xs"
          >
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); void handleExportPDF(false); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Annotated PDF</span>
            </button>
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); void handleExportPDF(true); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Flattened PDF</span>
            </button>
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); void handleExportFlattenedAnnotations(); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Merge className="w-3.5 h-3.5 text-violet-600" />
              <span>Flatten Annotations</span>
            </button>
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); handleExportAnnotationReport(); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ScrollText className="w-3.5 h-3.5 text-amber-600" />
              <span>Annotation Report</span>
            </button>
            {pdfMeta && (
              <a
                href={`${pdfMeta.url}${pdfMeta.url.includes('?') ? '&' : '?'}download=1`}
                download={pdfMeta.fileName}
                onClick={() => setExportMenuPos(null)}
                className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Original PDF</span>
              </a>
            )}
            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); void handleExportZipImages(); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FileArchive className="w-3.5 h-3.5 text-slate-500" />
              <span>Pages as PNG (ZIP)</span>
            </button>
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); handleExportTextFormat('txt'); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Text (.txt)</span>
            </button>
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); handleExportTextFormat('md'); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FileCode2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Markdown (.md)</span>
            </button>
            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); handleExportXFDF(); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FormInput className="w-3.5 h-3.5 text-orange-600" />
              <span>Export Form Data (XFDF)</span>
            </button>
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); handleImportXFDF(); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Upload className="w-3.5 h-3.5 text-orange-600" />
              <span>Import Form Data (XFDF)</span>
            </button>
            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
            <button
              type="button"
              onClick={() => { setExportMenuPos(null); setShowPrintModal(true); }}
              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print…</span>
            </button>
          </div>
        </div>
      )}

      {moreMenuPos && (
        <div onClick={() => setMoreMenuPos(null)} className="fixed inset-0 z-50">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: `${moreMenuPos.top}px`, right: `${moreMenuPos.right}px` }}
            className="fixed w-56 max-h-[75dvh] overflow-y-auto scrollbar-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 text-xs"
          >
            {/* Mobile-only layout & theme quick switches */}
            <div className="px-3 py-1.5 md:hidden border-b border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1">
                {(['single', 'scroll', 'spread'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setLayoutMode(m); setMoreMenuPos(null); }}
                    className={`flex-1 py-1 rounded text-[11px] capitalize ${layoutMode === m ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {(['light', 'sepia', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setReaderTheme(t); setMoreMenuPos(null); }}
                    className={`flex-1 py-1 rounded text-[11px] capitalize ${
                      readerTheme === t ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); void handleRunOCRPages([activePageNum]); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-blue-600"
            >
              <ScanText className="w-3.5 h-3.5" /> OCR Current Page
            </button>
            {pages.length > 1 && (
              <button
                type="button"
                onClick={() => { setMoreMenuPos(null); void handleRunOCRPages(pages.map((p) => p.pageNumber)); }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ScanText className="w-3.5 h-3.5 text-blue-600" /> OCR All Pages ({pages.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); setFormsEnabled((v) => !v); }}
              className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-2"><FormInput className="w-3.5 h-3.5" /> Interactive Forms</span>
              <span className="font-mono text-[10px] text-slate-400">{formsEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); setHighlightFormFields((v) => !v); }}
              className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-2"><Highlighter className="w-3.5 h-3.5" /> Highlight Form Fields</span>
              <span className="font-mono text-[10px] text-slate-400">{highlightFormFields ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); setShowCropModal(true); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Crop className="w-3.5 h-3.5" /> Crop Margins…
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); setShowWatermarkModal(true); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Droplets className="w-3.5 h-3.5" /> Watermark &amp; Page #…
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); setShowSplitModal(true); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Scissors className="w-3.5 h-3.5" /> Split &amp; Extract…
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); setShowCombineModal(true); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Merge className="w-3.5 h-3.5" /> Combine PDFs &amp; Images…
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); replaceInputRef.current?.click(); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Replace className="w-3.5 h-3.5" /> Replace Page…
            </button>

            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); void handleManipulate('rotate', [activePageNum - 1], -90); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Rotate Left (-90°)
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); void handleManipulate('duplicate', [activePageNum - 1]); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Copy className="w-3.5 h-3.5" /> Duplicate Page
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); void handleManipulate('insert_blank', [activePageNum - 1]); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FilePlus2 className="w-3.5 h-3.5" /> Insert Blank Page
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); setShowPageText((v) => !v); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FileText className="w-3.5 h-3.5" /> {showPageText ? 'Hide Page Text' : 'Page Text'}
            </button>
            {onReadAloudText && currentPage?.text && (
              <button
                type="button"
                onClick={() => { setMoreMenuPos(null); startReaderSpeech(activePageNum, 0); }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Volume2 className="w-3.5 h-3.5" /> Read Page Aloud
              </button>
            )}
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); toggleBottomBar(); }}
              className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="flex items-center gap-2">
                {hideBottomBar ? <PanelBottomOpen className="w-3.5 h-3.5" /> : <PanelBottomClose className="w-3.5 h-3.5" />}
                {hideBottomBar ? 'Show Bottom Tabs Bar' : 'Hide Bottom Tabs Bar'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setMoreMenuPos(null); setShowMetaModal(true); }}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FileText className="w-3.5 h-3.5" /> Document Properties…
            </button>

            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
            <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Pro Tools</div>
            <button type="button" onClick={() => { setMoreMenuPos(null); void handleExportPDF(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <FileDown className="w-3.5 h-3.5" /> Flatten PDF
            </button>
            <button type="button" onClick={() => { setMoreMenuPos(null); setShowCompressModal(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <FileArchive className="w-3.5 h-3.5" /> Compress / Optimize…
            </button>
            <button type="button" onClick={() => { setMoreMenuPos(null); setShowPasswordModal(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <FileLock2 className="w-3.5 h-3.5" /> Password Protect…
            </button>
            <button type="button" onClick={() => { setMoreMenuPos(null); setShowSanitizeModal(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <ShieldCheck className="w-3.5 h-3.5" /> Sanitize Document…
            </button>
            <button type="button" onClick={() => { setMoreMenuPos(null); setShowA11yPanel(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <FileCheck2 className="w-3.5 h-3.5" /> Accessibility Check…
            </button>
            <button type="button" onClick={() => { setMoreMenuPos(null); setShowHeaderFooterModal(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Hash className="w-3.5 h-3.5" /> Headers & Footers…
            </button>
            <button type="button" onClick={() => { setMoreMenuPos(null); setShowCompareModal(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <FileSearch className="w-3.5 h-3.5" /> Compare Documents…
            </button>
            <button type="button" onClick={() => { setMoreMenuPos(null); setShowLinkEditor(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Link2 className="w-3.5 h-3.5" /> Edit Links…
            </button>
            <button type="button" onClick={() => { setMoreMenuPos(null); setShowAutoFormDetect(true); }} className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Wand2 className="w-3.5 h-3.5" /> Auto-Detect Form Fields
            </button>

            {currentAnnotations.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMoreMenuPos(null);
                  updateAnnotations((prev) => prev.filter((a) => a.pageNumber !== activePageNum), activePageNum);
                }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear Page Markups
              </button>
            )}
            {pages.length > 1 && (
              <button
                type="button"
                onClick={() => { setMoreMenuPos(null); void handleManipulate('delete', [activePageNum - 1]); }}
                className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Page {activePageNum}
              </button>
            )}
          </div>
        </div>
      )}


      {/* Search Bar */}
      {searchOpen && pages.length > 0 && (
        <div className="px-3 py-1.5 bg-white dark:bg-slate-900 flex items-center gap-2 text-xs shrink-0 z-20">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                goToMatch(e.shiftKey ? activeMatchIdx - 1 : activeMatchIdx + 1);
              }
            }}
            placeholder="Find in PDF…"
            className="flex-1 max-w-xs px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded text-xs"
          />
          <button
            type="button"
            onClick={() => setSearchMatchCase((v) => !v)}
            title="Match Case"
            className={`px-2 py-0.5 rounded border font-mono text-[11px] ${
              searchMatchCase ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-200 dark:border-slate-700 text-slate-500'
            }`}
          >
            Aa
          </button>
          {searchQuery.trim().length >= 2 && (
            <span className="font-mono tabular-nums text-slate-500">
              {searchMatches.length > 0 ? `${activeMatchIdx + 1}/${searchMatches.length}` : '0'}
            </span>
          )}
          <button type="button" disabled={searchMatches.length === 0} onClick={() => goToMatch(activeMatchIdx - 1)} title="Previous Match" className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button type="button" disabled={searchMatches.length === 0} onClick={() => goToMatch(activeMatchIdx + 1)} title="Next Match" className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {searchMatches.length > 0 && (
            <button
              type="button"
              onClick={handleSearchAndRedactAll}
              className="flex items-center gap-1 px-2 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 shrink-0"
              title="Mark Search Matches for Redaction"
            >
              <ShieldAlert className="w-3 h-3" /> Redact Hits
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
            title="Close Search"
            className="p-1 rounded text-slate-400 hover:text-slate-700 ml-auto"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {(ocrProgress || statusMsg) && (
        <div className="px-3 py-1 text-xs bg-blue-600 text-white flex items-center justify-between shrink-0 z-20">
          <span>{ocrProgress || statusMsg}</span>
          {!ocrProgress && (
            <button type="button" onClick={() => setStatusMsg(null)} title="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Main Content */}
      {pages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center mb-3">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">PDF Studio</h3>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {loading ? 'Opening…' : 'Open PDF'}
          </button>
          {storedPdfs.length > 0 && (
            <div className="mt-6 w-full max-w-sm space-y-1.5 text-left">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-semibold text-slate-500">Workspace PDFs ({storedPdfs.length})</span>
                <button
                  type="button"
                  disabled={deletingPdfs}
                  onClick={() => void handleDeleteWorkspacePdfs(storedPdfs.map((file) => file.fileId))}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:text-white hover:bg-red-600 rounded-md transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  {deletingPdfs ? 'Removing…' : 'Clear all'}
                </button>
              </div>
              {storedPdfs.map((f) => (
                <div
                  key={f.fileId}
                  className="group w-full flex items-center gap-2 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-500 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => void loadExistingAttachedPDF(f)}
                    className="min-w-0 flex-1 flex items-center justify-between gap-2 py-0.5 text-left"
                  >
                    <span className="truncate font-medium">{f.fileName}</span>
                    <span className="text-slate-400 font-mono tabular-nums shrink-0">{Math.round(f.size / 1024)} KB</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${f.fileName} from workspace`}
                    title="Remove PDF from workspace"
                    disabled={deletingPdfs}
                    onClick={(e) => { e.stopPropagation(); void handleDeleteWorkspacePdfs([f.fileId]); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 opacity-60 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden group-hover:inline text-[11px] font-medium">Remove</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : organizerOpen ? (
        <PDFPageOrganizerGrid
          pages={pages}
          activePageNum={activePageNum}
          selectedOrgPages={selectedOrgPages}
          setSelectedOrgPages={setSelectedOrgPages}
          onManipulate={(a, idxs, deg, target) => void handleManipulate(a, idxs, deg, target)}
          onInsertImagePages={(files) => void handleInsertImagePages(files)}
          onJumpToPage={(n) => jumpToPage(n)}
          onDone={() => setOrganizerOpen(false)}
        />
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {readerMode && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-300/40 dark:bg-slate-800/60 z-30 pointer-events-none">
              <div className="h-full bg-blue-600 transition-all duration-200" style={{ width: `${Math.round((activePageNum / Math.max(1, pages.length)) * 100)}%` }} />
            </div>
          )}

          {!readerMode && (
            <PDFSidebarRailAndDrawer
              sidebarMode={sidebarMode}
              setSidebarMode={setSidebarMode}
              sidebarWidth={sidebarWidth}
              onStartResize={(x) => {
                resizingSidebarRef.current = { active: true, startX: x, startW: sidebarWidth };
              }}
              sidebarTab={sidebarTab}
              setSidebarTab={setSidebarTab}
              pages={pages}
              activePageNum={activePageNum}
              outline={outline}
              outlineFilter={outlineFilter}
              setOutlineFilter={setOutlineFilter}
              onAddCustomBookmark={(title) => {
                if (!activeTab) return;
                setOpenTabs((tabs) =>
                  tabs.map((t) =>
                    t.id === activeTab.id
                      ? { ...t, outline: [...t.outline, { title, pageNumber: activePageNum, custom: true, items: [] }] }
                      : t
                  )
                );
              }}
              onDeleteCustomBookmark={(title, pNum) => {
                if (!activeTab) return;
                setOpenTabs((tabs) =>
                  tabs.map((t) =>
                    t.id === activeTab.id
                      ? { ...t, outline: t.outline.filter((o) => !(o.custom && o.title === title && o.pageNumber === pNum)) }
                      : t
                  )
                );
              }}
              onRenameCustomBookmark={(oldTitle, pNum, newTitle) => {
                if (!activeTab) return;
                setOpenTabs((tabs) =>
                  tabs.map((t) =>
                    t.id === activeTab.id
                      ? {
                          ...t,
                          outline: t.outline.map((o) =>
                            o.custom && o.title === oldTitle && o.pageNumber === pNum
                              ? { ...o, title: newTitle }
                              : o
                          ),
                        }
                      : t
                  )
                );
              }}
              annotations={annotations}
              selectedAnnId={selectedAnnId}
              onSelectNote={(ann) => {
                jumpToPage(ann.pageNumber, true);
                setSelectedAnnId(ann.id);
                if (ann.kind === 'comment' || ann.kind === 'sticky') setOpenThreadId(ann.id);
              }}
              onDeleteAnn={(id, pNum) => updateAnnotations((prev) => prev.filter((item) => item.id !== id), pNum)}
              onToggleResolveAnn={(id, pNum) =>
                updateAnnotations((prev) => prev.map((item) => (item.id === id ? { ...item, resolved: !item.resolved } : item)), pNum)
              }
              widgetsByPage={widgetsByPage}
              formValues={formValues}
              onChangeFormValue={(name, val) => setFormValues((prev) => ({ ...prev, [name]: val }))}
              highlightFormFields={highlightFormFields}
              onToggleHighlightFormFields={() => setHighlightFormFields((v) => !v)}
              onClearForms={() => {
                const defaults: Record<string, string | boolean> = {};
                Object.values(widgetsByPage).forEach((list) => {
                  list.forEach((w) => {
                    defaults[w.fieldName] = typeof w.defaultValue === 'boolean' ? false : '';
                  });
                });
                setFormValues(defaults);
                setStatusMsg('Form fields reset');
              }}
              onFocusWidget={(pNum, wid) => {
                jumpToPage(pNum);
                setActiveWidgetId(wid);
                setTimeout(() => {
                  document.getElementById(`pdf-widget-${wid}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }, 140);
              }}
              searchMatches={searchMatches}
              activeMatchIdx={activeMatchIdx}
              onGoToMatch={goToMatch}
              onJumpToPage={(p, rec) => jumpToPage(p, rec)}
            />
          )}

          {/* Center PDF Stage Column + Bottom Document & Viewport Bar */}
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
            <div className="flex-1 min-h-0 flex relative overflow-hidden">
          {/* Split-Ready Viewport Container */}
          {(() => {
            const splitActive = !readerMode && splitView && openTabs.length > 0;
            const effectiveSplitOrientation: 'vertical' | 'horizontal' = isNarrowViewport ? 'horizontal' : splitOrientation;
            return (
              <div
                ref={splitWrapRef}
                className={`flex-1 flex min-w-0 min-h-0 overflow-hidden ${
                  splitActive && effectiveSplitOrientation === 'horizontal' ? 'flex-col' : 'flex-row'
                }`}
              >
                {/* Main Interactive Viewport */}
                <div
                  ref={viewerRef}
                  onScroll={handleMainViewerScroll}
                  onWheel={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      stepZoom(e.deltaY < 0 ? 0.15 : -0.15);
                    }
                  }}
                  style={
                    splitActive
                      ? effectiveSplitOrientation === 'horizontal'
                        ? { height: `${splitRatio}%`, flex: 'none' }
                        : { width: `${splitRatio}%`, flex: 'none' }
                      : undefined
                  }
                  className={`${splitActive ? '' : 'flex-1 '}min-w-0 min-h-0 overflow-auto ${readerMode ? 'p-3 sm:p-8' : 'p-3 sm:p-6'} scrollbar-none relative ${
                    readerTheme === 'dark' ? 'bg-slate-900' : readerTheme === 'sepia' ? 'bg-amber-50/75' : 'bg-slate-200/70 dark:bg-slate-950'
                  }`}
                >
                  <div className={`w-fit mx-auto flex ${layoutMode === 'spread' ? 'flex-row justify-center gap-5' : 'flex-col items-center gap-5'} ${readerMode ? 'pb-16' : ''}`}>
                    {visiblePages.map((pg) => {
                      const isMountedFull =
                        layoutMode !== 'scroll' || Math.abs(pg.pageNumber - activePageNum) <= 2;
                      return (
                        <PDFPageSurface
                          key={pg.pageNumber}
                          pdfDoc={pdfDoc}
                          page={pg}
                          totalPages={pages.length}
                          activePageNum={activePageNum}
                          isMountedFull={isMountedFull}
                          layoutMode={layoutMode}
                          readerMode={readerMode}
                          readerTheme={readerTheme}
                          displayWidthPx={computedPageWidthPx}
                          speechCharRange={
                            readerSpeechPlaying &&
                            readerSpeechProgress?.pageNumber === pg.pageNumber &&
                            readerSpeechProgress.charEndIndex !== undefined
                              ? {
                                  start: readerSpeechProgress.charIndex,
                                  end: readerSpeechProgress.charEndIndex,
                                }
                              : null
                          }
                          selectedSpeechWordRects={
                                selectedSpeechHighlight?.pageNumber === pg.pageNumber
                                  ? selectedSpeechHighlight.wordRects[selectedSpeechHighlight.activeWordIndex] || []
                                  : undefined
                          }
                          effectiveTool={effectiveTool}
                          annColor={annColor}
                          measureUnit={measureUnit}
                          pageAnns={annotations.filter((a) => a.pageNumber === pg.pageNumber)}
                          pageLinks={pageLinksByPage[pg.pageNumber] || []}
                          pageWidgets={widgetsByPage[pg.pageNumber] || []}
                          formsEnabled={formsEnabled}
                          highlightFormFields={highlightFormFields}
                          activeWidgetId={activeWidgetId}
                          formValues={formValues}
                          onChangeFormValue={(name, val) => setFormValues((prev) => ({ ...prev, [name]: val }))}
                          watermarkPreview={watermarkCfg}
                          toolDefaults={toolDefaults}
                          searchQuery={searchQuery}
                          searchMatchCase={searchMatchCase}
                          selectedAnnId={selectedAnnId}
                          openThreadId={openThreadId}
                          setOpenThreadId={setOpenThreadId}
                          replyDraft={replyDraft}
                          setReplyDraft={setReplyDraft}
                          onAddReply={(annId, pageNumber, text) =>
                            updateAnnotations(
                              (prev) =>
                                prev.map((item) =>
                                  item.id === annId
                                    ? {
                                        ...item,
                                        replies: [
                                          ...(item.replies || []),
                                          { id: uid('rep'), author: toolDefaults.authorName || 'You', text, createdAt: Date.now() },
                                        ],
                                      }
                                    : item
                                ),
                              pageNumber
                            )
                          }
                          onDeleteReply={(annId, pageNumber, replyId) =>
                            updateAnnotations(
                              (prev) =>
                                prev.map((item) =>
                                  item.id === annId ? { ...item, replies: (item.replies || []).filter((r) => r.id !== replyId) } : item
                                ),
                              pageNumber
                            )
                          }
                          onToggleResolve={(annId, pageNumber) =>
                            updateAnnotations(
                              (prev) => prev.map((item) => (item.id === annId ? { ...item, resolved: !item.resolved } : item)),
                              pageNumber
                            )
                          }
                          snipRect={snipRect}
                          pendingNote={pendingNote}
                          setPendingNote={setPendingNote}
                          textSelMenu={textSelMenu}
                          setTextSelMenu={setTextSelMenu}
                          applySelectionMarkup={applySelectionMarkup}
                          onAskAIWithPage={onAskAIWithPage}
                          onReadAloudText={readSelectedText}
                          onJumpPage={(pNum, rec) => jumpToPage(pNum, rec)}
                          onSetActivePage={(pNum) => setActivePageNum(pNum)}
                          onSelectAnn={(id) => setSelectedAnnId(id)}
                          onSwitchToSelect={() => setAnnTool('select')}
                          updateAnnotations={updateAnnotations}
                          snapshotPageUndo={snapshotPageUndo}
                          setPageRef={(pNum, el) => {
                            pageRefs.current[pNum] = el;
                          }}
                          drawRef={drawRef}
                          onPointerDownPage={onPointerDownPage}
                          onPointerMovePage={onPointerMovePage}
                          onPointerUpPage={onPointerUpPage}
                          onMouseUpPage={onMouseUpPage}
                          onContextMenuPage={(e, pNum, normX, normY, hitAnnId) => {
                            e.preventDefault();
                            if (hitAnnId) setSelectedAnnId(hitAnnId);
                            setContextMenu({
                              x: Math.max(8, Math.min(window.innerWidth - 216, e.clientX)),
                              y: Math.max(8, Math.min(window.innerHeight - 290, e.clientY)),
                              pageNumber: pNum,
                              normX,
                              normY,
                              annId: hitAnnId,
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Draggable Split Divider */}
                {splitActive && (
                  <div
                    role="separator"
                    aria-orientation={effectiveSplitOrientation === 'horizontal' ? 'horizontal' : 'vertical'}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      splitResizingRef.current.active = true;
                    }}
                    onDoubleClick={() => setSplitRatio(50)}
                    title="Drag to resize • Double-click to reset 50/50"
                    className={`group shrink-0 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500/80 transition-colors flex items-center justify-center select-none touch-none ${
                      effectiveSplitOrientation === 'horizontal'
                        ? 'h-1.5 w-full cursor-row-resize border-y border-slate-300/70 dark:border-slate-700/70'
                        : 'w-1.5 h-full cursor-col-resize border-x border-slate-300/70 dark:border-slate-700/70'
                    }`}
                  >
                    <div
                      className={`rounded-full bg-slate-400/80 group-hover:bg-white ${
                        effectiveSplitOrientation === 'horizontal' ? 'w-8 h-0.5' : 'h-8 w-0.5'
                      }`}
                    />
                  </div>
                )}

                {/* Split View Reference Pane */}
                {splitActive && (
                  <PDFSplitComparePane
                    tabs={openTabs}
                    activeTabId={activeTab?.id || ''}
                    refTabId={splitRefTabId || activeTab?.id || ''}
                    onChangeRefTabId={setSplitRefTabId}
                    refPageNum={splitRefPageNum}
                    onChangeRefPageNum={setSplitRefPageNum}
                    syncScroll={splitSyncScroll}
                    onToggleSyncScroll={() => setSplitSyncScroll((v) => !v)}
                    splitOrientation={effectiveSplitOrientation}
                    onToggleSplitOrientation={() =>
                      setSplitOrientation((o) => (o === 'vertical' ? 'horizontal' : 'vertical'))
                    }
                    onSwapTabs={handleSwapSplitTabs}
                    onOpenFileInSplit={(f) => void handleUploadPDF(f, true)}
                    workspacePdfs={storedPdfs}
                    onOpenWorkspacePdfInSplit={(fid) => {
                      const found = storedPdfs.find((x) => x.fileId === fid);
                      if (found) void loadExistingAttachedPDF(found, true);
                    }}
                    getTabAnnotations={getTabAnnotations}
                    readerTheme={readerTheme}
                    mainViewerRef={viewerRef}
                    splitScrollElRef={splitScrollElRef}
                    syncScrollSourceRef={syncScrollSourceRef}
                    mainActivePageNum={activePageNum}
                    onSyncMainPage={(p) => jumpToPage(p)}
                    onClose={() => setSplitView(false)}
                  />
                )}
              </div>
            );
          })()}

          {/* Selected Annotation Quick Action Bar */}
          {!readerMode && selectedAnn && annTool === 'select' && !pendingNote && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl text-xs max-w-[calc(100%-16px)] overflow-x-auto scrollbar-none">
              <span className="text-[11px] font-medium capitalize text-slate-500 px-1 whitespace-nowrap shrink-0">
                {selectedAnn.kind.replace('_', ' ')}
                {selectedAnn.locked ? ' · Locked' : ''}
              </span>
              {selectedAnn.kind !== 'image' && selectedAnn.kind !== 'redact' && (
                <>
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="flex items-center gap-1 shrink-0">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={Boolean(selectedAnn.locked)}
                        onClick={() => updateAnnotations((prev) => prev.map((a) => (a.id === selectedAnn.id ? { ...a, color: c } : a)), selectedAnn.pageNumber)}
                        style={{ backgroundColor: c }}
                        className={`w-3.5 h-3.5 rounded-full border disabled:opacity-40 ${
                          selectedAnn.color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-blue-600 ring-offset-1 border-white' : 'border-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
              {(selectedAnn.kind === 'text' || selectedAnn.kind === 'callout') && (
                <>
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                  <button
                    type="button"
                    disabled={Boolean(selectedAnn.locked)}
                    onClick={() =>
                      updateAnnotations(
                        (prev) =>
                          prev.map((a) =>
                            a.id === selectedAnn.id ? { ...a, fontWeight: a.fontWeight === 'bold' ? 'normal' : 'bold' } : a
                          ),
                        selectedAnn.pageNumber
                      )
                    }
                    className={`p-1 rounded disabled:opacity-40 ${selectedAnn.fontWeight === 'bold' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(selectedAnn.locked)}
                    onClick={() =>
                      updateAnnotations(
                        (prev) =>
                          prev.map((a) =>
                            a.id === selectedAnn.id ? { ...a, fontStyle: a.fontStyle === 'italic' ? 'normal' : 'italic' } : a
                          ),
                        selectedAnn.pageNumber
                      )
                    }
                    className={`p-1 rounded disabled:opacity-40 ${selectedAnn.fontStyle === 'italic' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(selectedAnn.locked)}
                    onClick={() =>
                      updateAnnotations(
                        (prev) => prev.map((a) => (a.id === selectedAnn.id ? { ...a, fontSize: Math.max(9, (a.fontSize || 13) - 2) } : a)),
                        selectedAnn.pageNumber
                      )
                    }
                    className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[11px] disabled:opacity-40"
                    title="Decrease Font"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(selectedAnn.locked)}
                    onClick={() =>
                      updateAnnotations(
                        (prev) => prev.map((a) => (a.id === selectedAnn.id ? { ...a, fontSize: Math.min(36, (a.fontSize || 13) + 2) } : a)),
                        selectedAnn.pageNumber
                      )
                    }
                    className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[11px] disabled:opacity-40"
                    title="Increase Font"
                  >
                    A+
                  </button>
                </>
              )}
              {(selectedAnn.kind === 'rect' ||
                selectedAnn.kind === 'circle' ||
                selectedAnn.kind === 'arrow' ||
                selectedAnn.kind === 'line' ||
                selectedAnn.kind === 'draw' ||
                selectedAnn.kind === 'highlighter_ink' ||
                selectedAnn.kind === 'measure' ||
                selectedAnn.kind === 'underline' ||
                selectedAnn.kind === 'strike') && (
                <>
                  <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                  <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded overflow-hidden text-[10px] font-mono">
                    {[2, 4, 7].map((w) => (
                      <button
                        key={w}
                        type="button"
                        disabled={Boolean(selectedAnn.locked)}
                        onClick={() =>
                          updateAnnotations(
                            (prev) => prev.map((a) => (a.id === selectedAnn.id ? { ...a, strokeWidth: w } : a)),
                            selectedAnn.pageNumber
                          )
                        }
                        title={`Thickness ${w}px`}
                        className={`px-1.5 py-0.5 disabled:opacity-40 ${(selectedAnn.strokeWidth || 2.5) === w ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-950 text-slate-600'}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {(selectedAnn.kind === 'text' || selectedAnn.kind === 'callout' || selectedAnn.kind === 'comment' || selectedAnn.kind === 'sticky') && (
                <button
                  type="button"
                  disabled={Boolean(selectedAnn.locked)}
                  onClick={() =>
                    setPendingNote({
                      kind: selectedAnn.kind as 'text' | 'callout' | 'comment' | 'sticky',
                      pageNumber: selectedAnn.pageNumber,
                      x: selectedAnn.x,
                      y: selectedAnn.y,
                      x2: selectedAnn.x2,
                      y2: selectedAnn.y2,
                      editId: selectedAnn.id,
                      text: selectedAnn.text || '',
                    })
                  }
                  className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
              <button
                type="button"
                onClick={() => setShowProperties((v) => !v)}
                title="Properties Inspector"
                className={`p-1 rounded-md ${showProperties ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  updateAnnotations(
                    (prev) => prev.map((a) => (a.id === selectedAnn.id ? { ...a, locked: !a.locked } : a)),
                    selectedAnn.pageNumber
                  )
                }
                title={selectedAnn.locked ? 'Unlock' : 'Lock'}
                className={`p-1 rounded-md ${selectedAnn.locked ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {selectedAnn.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  const clone = cloneAnnotationOffset(selectedAnn, selectedAnn.pageNumber, 0.03, 0.03);
                  updateAnnotations((prev) => [...prev, clone], selectedAnn.pageNumber);
                  setSelectedAnnId(clone.id);
                }}
                title="Duplicate"
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={Boolean(selectedAnn.locked)}
                onClick={() => {
                  updateAnnotations((prev) => prev.filter((a) => a.id !== selectedAnn.id), selectedAnn.pageNumber);
                  setSelectedAnnId(null);
                }}
                title="Delete"
                className="p-1 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setSelectedAnnId(null)} className="p-1 rounded-md text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Reader Mode HUD */}
          {readerMode && (
            <PDFReaderModeHud
              activePageNum={activePageNum}
              pages={pages}
              outline={outline}
              layoutMode={layoutMode}
              setLayoutMode={setLayoutMode}
              spreadCoverPage={spreadCoverPage}
              readerTheme={readerTheme}
              setReaderTheme={setReaderTheme}
              effectiveZoomScale={effectiveZoomScale}
              stepZoom={stepZoom}
              toggleFit={() => {
                setZoomMode((z) => (z === 'fit_width' ? 'fit_page' : 'fit_width'));
                setZoomScale(1);
              }}
              linkHistory={linkHistory}
              onJumpBack={jumpBackHistory}
              pageJumpInput={pageJumpInput}
              setPageJumpInput={setPageJumpInput}
              onJumpToPage={(p, rec) => jumpToPage(p, rec)}
              autoScrollActive={autoScrollActive}
              setAutoScrollActive={setAutoScrollActive}
              autoScrollSpeed={autoScrollSpeed}
              setAutoScrollSpeed={setAutoScrollSpeed}
              readerHudVisible={readerHudVisible}
              readerHudPinned={readerHudPinned}
              setReaderHudPinned={setReaderHudPinned}
              pingReaderHud={pingReaderHud}
              readerOutlineOpen={readerOutlineOpen}
              setReaderOutlineOpen={setReaderOutlineOpen}
              fullscreen={fullscreen}
              toggleFullscreen={() => void toggleFullscreen()}
              readerSpeechPlaying={readerSpeechPlaying}
              readerSpeechProgress={readerSpeechProgress}
              onToggleReadAloud={toggleReaderSpeech}
              onExit={() => {
                pauseReaderSpeech();
                setAutoScrollActive(false);
                setReaderMode(false);
              }}
            />
          )}
            </div>

            {/* Bottom Document Tabs & Viewport Bar (matches Slides Studio center-bounded bar) */}
            {!readerMode && openTabs.length > 0 && (() => {
              return (
                <>
                  {hideBottomBar && (
                    <button
                      type="button"
                      onClick={() => toggleBottomBar(false)}
                      title="Show Bottom Bar"
                      aria-label="Show Bottom Bar"
                      className="absolute bottom-2.5 right-3 z-30 h-7 px-2.5 rounded-full bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200/90 dark:border-slate-700/80 shadow-md hover:shadow-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5 transition-all duration-150"
                    >
                      <PanelBottomOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span className="truncate max-w-[110px] hidden sm:inline">
                        {activeTab?.fileName || 'PDFs'}
                      </span>
                      {openTabs.length > 1 && (
                        <span className="px-1 py-px rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 text-[10px] font-mono tabular-nums">
                          {openTabs.length}
                        </span>
                      )}
                    </button>
                  )}

                  <footer
                    aria-hidden={hideBottomBar}
                    className={`bg-white dark:bg-slate-900 shrink-0 z-20 transition-[height,opacity] duration-200 ease-out ${
                      hideBottomBar
                        ? 'h-0 overflow-hidden border-t-0 opacity-0 pointer-events-none'
                        : 'min-h-9 px-2 sm:px-3 py-1 pb-safe md:pb-1 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1.5 sm:gap-2 text-xs text-slate-600 dark:text-slate-300 opacity-100'
                    }`}
                  >
                    <div
                      ref={bottomTabsRef}
                      className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none scroll-smooth"
                    >
                      {openTabs.map((tab) => {
                        const isCur = tab.id === activeTab?.id;
                        return (
                          <div
                            key={tab.id}
                            data-pdf-tab-id={tab.id}
                            role="tab"
                            aria-selected={isCur}
                            title={tab.fileName}
                            onClick={() => switchActiveTab(tab)}
                            onMouseDown={(e) => {
                              if (e.button === 1) {
                                e.preventDefault();
                                closeTab(tab.id);
                              }
                            }}
                            className={`group flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] cursor-pointer border transition-all duration-150 shrink-0 max-w-[125px] sm:max-w-[220px] select-none ${
                              isCur
                                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-medium'
                                : 'bg-transparent border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            <FileText
                              className={`w-3 h-3 shrink-0 transition-colors ${
                                isCur ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 group-hover:text-blue-500'
                              }`}
                            />
                            <span className="truncate">{tab.fileName}</span>
                            <span
                              className={`hidden sm:inline text-[10px] font-mono tabular-nums shrink-0 ${
                                isCur ? 'text-slate-400 dark:text-slate-400' : 'text-slate-400/80'
                              }`}
                            >
                              {tab.activePageNum}/{tab.pages.length}
                            </span>
                            <button
                              type="button"
                              aria-label={`Close ${tab.fileName}`}
                              title="Close PDF"
                              onClick={(e) => {
                                e.stopPropagation();
                                closeTab(tab.id);
                              }}
                              className={`p-0.5 rounded transition-colors shrink-0 ${
                                isCur
                                  ? 'text-slate-400 hover:text-red-600 hover:bg-slate-200/70 dark:hover:text-red-400 dark:hover:bg-slate-700'
                                  : 'text-slate-400 opacity-70 sm:opacity-50 sm:group-hover:opacity-100 hover:text-red-600 hover:bg-slate-200/70 dark:hover:text-red-400 dark:hover:bg-slate-700/80'
                              }`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Open Another PDF"
                        aria-label="Open Another PDF"
                        className="flex items-center justify-center w-6 h-6 rounded-md text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 pl-1.5 sm:pl-2 border-l border-slate-200 dark:border-slate-800">
                      {storedPdfs.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              if (workspaceMenuPos) {
                                setWorkspaceMenuPos(null);
                                return;
                              }
                              const r = e.currentTarget.getBoundingClientRect();
                              setZoomMenuPos(null);
                              setExportMenuPos(null);
                              setMoreMenuPos(null);
                              setShapesMenuPos(null);
                              setWorkspaceMenuPos({
                                bottom: window.innerHeight - r.top + 6,
                                right: Math.max(8, window.innerWidth - r.right),
                              });
                            }}
                            title="Manage Workspace PDFs"
                            aria-label="Manage Workspace PDFs"
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors shrink-0 ${
                              workspaceMenuPos
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <FolderOpen className="w-3 h-3" />
                            <span className="hidden md:inline">Files</span>
                            <span className="px-1 rounded bg-slate-200/70 dark:bg-slate-700 text-[9px] font-mono tabular-nums">
                              {storedPdfs.length}
                            </span>
                          </button>
                          <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700" />
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => stepZoom(-0.15)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono text-[11px] tabular-nums w-9 sm:w-10 text-center">
                        {Math.round(effectiveZoomScale * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => stepZoom(0.15)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setZoomMode((z) => (z === 'fit_width' ? 'fit_page' : 'fit_width'));
                          setZoomScale(1);
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                          zoomMode !== 'custom'
                            ? 'text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        title={zoomMode === 'fit_width' ? 'Fit Page' : 'Fit Width'}
                      >
                        Fit
                      </button>

                      <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700" />
                      <button
                        type="button"
                        onClick={() => toggleBottomBar(true)}
                        title="Hide Bottom Bar"
                        aria-label="Hide Bottom Bar"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                      >
                        <PanelBottomClose className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </footer>
                </>
              );
            })()}
          </main>

          {/* Right Properties Inspector */}
          {!readerMode && showProperties && (
            <PDFPropertiesPanel
              selectedAnn={selectedAnn}
              activeTool={annTool}
              defaults={toolDefaults}
              onChangeDefaults={(patch) => setToolDefaults((d) => ({ ...d, ...patch }))}
              onUpdateSelected={(patch) => {
                if (!selectedAnn) return;
                updateAnnotations(
                  (prev) =>
                    prev.map((a) => {
                      if (a.id !== selectedAnn.id) return a;
                      const merged = { ...a, ...patch };
                      if (a.kind === 'measure' && (patch.measureUnit !== undefined || patch.measureScale !== undefined)) {
                        const pg = pages.find((p) => p.pageNumber === a.pageNumber);
                        merged.text = formatMeasureDistance(
                          a.x,
                          a.y,
                          a.x2 ?? a.x,
                          a.y2 ?? a.y,
                          pg?.ptWidth || 595,
                          pg?.ptHeight || 842,
                          merged.measureUnit || measureUnit,
                          merged.measureScale || 1
                        );
                      }
                      return merged;
                    }),
                  selectedAnn.pageNumber
                );
              }}
              onArrangeSelected={(dir) => {
                if (selectedAnn) handleArrangeAnnotation(selectedAnn.id, selectedAnn.pageNumber, dir);
              }}
              onDuplicateSelected={() => {
                if (!selectedAnn) return;
                const clone = cloneAnnotationOffset(selectedAnn, selectedAnn.pageNumber, 0.03, 0.03);
                updateAnnotations((prev) => [...prev, clone], selectedAnn.pageNumber);
                setSelectedAnnId(clone.id);
              }}
              onDeleteSelected={() => {
                if (!selectedAnn || selectedAnn.locked) return;
                updateAnnotations((prev) => prev.filter((a) => a.id !== selectedAnn.id), selectedAnn.pageNumber);
                setSelectedAnnId(null);
              }}
              onEditSelectedText={
                selectedAnn && (selectedAnn.kind === 'text' || selectedAnn.kind === 'callout' || selectedAnn.kind === 'comment' || selectedAnn.kind === 'sticky')
                  ? () =>
                      setPendingNote({
                        kind: selectedAnn.kind as 'text' | 'callout' | 'comment' | 'sticky',
                        pageNumber: selectedAnn.pageNumber,
                        x: selectedAnn.x,
                        y: selectedAnn.y,
                        x2: selectedAnn.x2,
                        y2: selectedAnn.y2,
                        editId: selectedAnn.id,
                        text: selectedAnn.text || '',
                      })
                  : undefined
              }
              onClose={() => setShowProperties(false)}
            />
          )}

          {/* Page Text Panel */}
          {!readerMode && showPageText && currentPage && (
            <>
              <div onClick={() => setShowPageText(false)} className="md:hidden fixed inset-0 z-30 bg-slate-950/35" />
              <div className="fixed inset-y-0 right-0 z-40 w-[min(88vw,300px)] md:static md:inset-auto md:z-auto md:w-72 shadow-xl md:shadow-none border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col p-3 pb-safe md:pb-3 gap-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Page {activePageNum} Text</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(currentPage.text || '')}
                      className="px-2 py-0.5 text-[11px] bg-blue-600 text-white rounded"
                    >
                      Copy
                    </button>
                    <button type="button" onClick={() => setShowPageText(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <textarea
                  readOnly
                  value={currentPage.text || ''}
                  className="flex-1 w-full p-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded resize-none scrollbar-none"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Workspace PDF manager (opens upward from bottom bar) */}
      {workspaceMenuPos && (
        <div onClick={() => setWorkspaceMenuPos(null)} className="fixed inset-0 z-50">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ bottom: `${workspaceMenuPos.bottom}px`, right: `${workspaceMenuPos.right}px` }}
            className="fixed w-72 max-w-[90vw] max-h-64 overflow-y-auto scrollbar-none bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-1.5 text-xs space-y-0.5"
          >
            <div className="flex items-center justify-between gap-2 px-2 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Workspace PDFs ({storedPdfs.length})
              </span>
              <button
                type="button"
                disabled={deletingPdfs || storedPdfs.length === 0}
                onClick={() => void handleDeleteWorkspacePdfs(storedPdfs.map((file) => file.fileId))}
                className="text-[10px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {deletingPdfs ? 'Removing…' : 'Clear all'}
              </button>
            </div>
            {storedPdfs.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-slate-400">No stored PDFs.</div>
            ) : (
              storedPdfs.map((f) => (
                <div
                  key={f.fileId}
                  className="flex items-center gap-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors pr-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMenuPos(null);
                      void loadExistingAttachedPDF(f);
                    }}
                    className="flex-1 min-w-0 px-2 py-1.5 text-left flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{f.fileName}</span>
                    <span className="ml-auto text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                      {Math.max(1, Math.round(f.size / 1024))} KB
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Open in Split View"
                    onClick={() => {
                      setWorkspaceMenuPos(null);
                      void loadExistingAttachedPDF(f, true);
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 shrink-0"
                  >
                    <PanelRightOpen className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Remove PDF from workspace"
                    aria-label={`Remove ${f.fileName} from workspace`}
                    disabled={deletingPdfs}
                    onClick={() => void handleDeleteWorkspacePdfs([f.fileId])}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div onClick={() => setContextMenu(null)} className="fixed inset-0 z-50">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
            className="fixed w-52 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-24px)] overflow-y-auto bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-1 text-xs"
          >
            {textSelMenu ? (
              <>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard.writeText(textSelMenu.selectedText); setTextSelMenu(null); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy Text
                </button>
                <button
                  type="button"
                  onClick={() => { applySelectionMarkup('highlight'); setContextMenu(null); }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Highlighter className="w-3.5 h-3.5 text-yellow-500" /> Highlight
                </button>
                {onAskAIWithPage && (
                  <button
                    type="button"
                    onClick={() => {
                      onAskAIWithPage(`Explain this excerpt:\n"${textSelMenu.selectedText.slice(0, 600)}"`, textSelMenu.selectedText);
                      setTextSelMenu(null);
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> AI Explain
                  </button>
                )}
              </>
            ) : contextMenu.annId && annotations.find((a) => a.id === contextMenu.annId) ? (
              (() => {
                const ctxAnn = annotations.find((a) => a.id === contextMenu.annId)!;
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAnnId(ctxAnn.id);
                        setShowProperties(true);
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-blue-600"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" /> Properties…
                    </button>
                    {(ctxAnn.kind === 'text' || ctxAnn.kind === 'callout' || ctxAnn.kind === 'sticky' || ctxAnn.kind === 'comment') && (
                      <button
                        type="button"
                        disabled={Boolean(ctxAnn.locked)}
                        onClick={() => {
                          setContextMenu(null);
                          setPendingNote({
                            kind: ctxAnn.kind as 'text' | 'callout' | 'comment' | 'sticky',
                            pageNumber: ctxAnn.pageNumber,
                            x: ctxAnn.x,
                            y: ctxAnn.y,
                            x2: ctxAnn.x2,
                            y2: ctxAnn.y2,
                            editId: ctxAnn.id,
                            text: ctxAnn.text || '',
                          });
                        }}
                        className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit Text
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        const clone = cloneAnnotationOffset(ctxAnn, ctxAnn.pageNumber, 0.03, 0.03);
                        updateAnnotations((prev) => [...prev, clone], ctxAnn.pageNumber);
                        setSelectedAnnId(clone.id);
                      }}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Copy className="w-3.5 h-3.5" /> Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => { setContextMenu(null); handleArrangeAnnotation(ctxAnn.id, ctxAnn.pageNumber, 'front'); }}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ArrowUpToLine className="w-3.5 h-3.5" /> Bring to Front
                    </button>
                    <button
                      type="button"
                      onClick={() => { setContextMenu(null); handleArrangeAnnotation(ctxAnn.id, ctxAnn.pageNumber, 'back'); }}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" /> Send to Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenu(null);
                        updateAnnotations(
                          (prev) => prev.map((a) => (a.id === ctxAnn.id ? { ...a, locked: !a.locked } : a)),
                          ctxAnn.pageNumber
                        );
                      }}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {ctxAnn.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      {ctxAnn.locked ? 'Unlock' : 'Lock'}
                    </button>
                    <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                    <button
                      type="button"
                      disabled={Boolean(ctxAnn.locked)}
                      onClick={() => {
                        setContextMenu(null);
                        updateAnnotations((prev) => prev.filter((a) => a.id !== ctxAnn.id), ctxAnn.pageNumber);
                        if (selectedAnnId === ctxAnn.id) setSelectedAnnId(null);
                      }}
                      className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </>
                );
              })()
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    setPendingNote({
                      kind: 'sticky',
                      pageNumber: contextMenu.pageNumber,
                      x: contextMenu.normX ?? 0.25,
                      y: contextMenu.normY ?? 0.25,
                      text: '',
                    });
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <StickyNote className="w-3.5 h-3.5 text-amber-500" /> Add Sticky Note
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    setPendingNote({
                      kind: 'text',
                      pageNumber: contextMenu.pageNumber,
                      x: contextMenu.normX ?? 0.25,
                      y: contextMenu.normY ?? 0.25,
                      text: '',
                    });
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Type className="w-3.5 h-3.5 text-blue-600" /> Add Text Here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pendingImgPosRef.current = {
                      pageNumber: contextMenu.pageNumber,
                      x: contextMenu.normX ?? 0.25,
                      y: contextMenu.normY ?? 0.25,
                    };
                    setContextMenu(null);
                    insertImagePageInputRef.current?.click();
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-blue-600" /> Insert Image Here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    if (activeTab) {
                      setOpenTabs((tabs) =>
                        tabs.map((t) =>
                          t.id === activeTab.id
                            ? {
                                ...t,
                                outline: [
                                  ...t.outline,
                                  { title: `Page ${contextMenu.pageNumber}`, pageNumber: contextMenu.pageNumber, custom: true, items: [] },
                                ],
                              }
                            : t
                        )
                      );
                      setStatusMsg(`Bookmarked page ${contextMenu.pageNumber}`);
                    }
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-blue-600" /> Bookmark Page
                </button>
                <button
                  type="button"
                  onClick={() => { setContextMenu(null); void handleRunOCRPages([contextMenu.pageNumber]); }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ScanText className="w-3.5 h-3.5 text-blue-600" /> Run OCR Page
                </button>
                <button
                  type="button"
                  onClick={() => { setContextMenu(null); void handleManipulate('rotate', [contextMenu.pageNumber - 1], 90); }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    setZoomMode('fit_width');
                    setZoomScale(1);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Fit Width
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Visual Diff Result Modal */}
      {diffResultUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm">Visual Diff</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                  {diffSimilarity}% identical
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setDiffResultUrl(null); setCompareMode(false); }}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 min-h-0">
              <img src={diffResultUrl} alt="Visual diff" className="max-w-full h-auto mx-auto rounded-lg shadow" />
            </div>
            <div className="px-5 py-2.5 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              Red pixels indicate differences &gt; 15/255 in any RGB channel.
            </div>
          </div>
        </div>
      )}

      {/* Drag & Drop PDF Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-blue-600/15 backdrop-blur-xs border-2 border-dashed border-blue-600 flex items-center justify-center pointer-events-none">
          <div className="px-5 py-3 rounded-xl bg-white dark:bg-slate-900 shadow-xl text-sm font-semibold text-blue-600 flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> Drop PDF to Open
          </div>
        </div>
      )}

      {/* Pro Tool Modals */}
      {passwordReq && (
        <PDFPasswordModal
          reason={passwordReq.reason}
          onSubmit={(pw) => {
            const res = passwordReq.resolve;
            setPasswordReq(null);
            res(pw);
          }}
          onCancel={() => {
            const res = passwordReq.resolve;
            setPasswordReq(null);
            res(null);
          }}
        />
      )}

      {showSigModal && (
        <PDFSignatureModal
          savedSigUrl={savedSigUrl}
          onPlaceDataUrl={handleInsertSignatureDataUrl}
          onClose={() => setShowSigModal(false)}
        />
      )}

      {showCropModal && (
        <PDFCropModal
          activePageNum={activePageNum}
          totalPages={pages.length}
          previewDataUrl={currentPage?.dataUrl}
          onClose={() => setShowCropModal(false)}
          onApply={async (margins, scope, rangeExpr, resetCrop) => {
            if (!pdfBytes) return;
            setShowCropModal(false);
            setLoading(true);
            try {
              const target =
                scope === 'all'
                  ? pages.map((_, i) => i)
                  : scope === 'range' && rangeExpr
                    ? parsePageRangeExpression(rangeExpr, pages.length).map((n) => n - 1)
                    : [activePageNum - 1];
              const finalTargets = target.length > 0 ? target : [activePageNum - 1];
              const cropped = await cropPDFPages(pdfBytes, finalTargets, margins, Boolean(resetCrop));
              let nextAnns: PDFAnnotation[] | undefined;
              if (!resetCrop) {
                const targetPageSet = new Set(finalTargets.map((i) => i + 1));
                const effW = Math.max(0.05, 1 - margins.left - margins.right);
                const effH = Math.max(0.05, 1 - margins.top - margins.bottom);
                const mapX = (vx: number) => Math.max(0, Math.min(0.98, (vx - margins.left) / effW));
                const mapY = (vy: number) => Math.max(0, Math.min(0.98, (vy - margins.top) / effH));
                nextAnns = annotationsRef.current.map((a) => {
                  if (!targetPageSet.has(a.pageNumber)) return a;
                  return {
                    ...a,
                    x: mapX(a.x),
                    y: mapY(a.y),
                    ...(typeof a.w === 'number' ? { w: Math.min(1, Math.max(0.015, a.w / effW)) } : {}),
                    ...(typeof a.h === 'number' ? { h: Math.min(1, Math.max(0.015, a.h / effH)) } : {}),
                    ...(typeof a.x2 === 'number' ? { x2: Math.max(0, Math.min(1, (a.x2 - margins.left) / effW)) } : {}),
                    ...(typeof a.y2 === 'number' ? { y2: Math.max(0, Math.min(1, (a.y2 - margins.top) / effH)) } : {}),
                    ...(a.points
                      ? {
                          points: a.points.map((pt) => ({
                            x: Math.max(0, Math.min(1, (pt.x - margins.left) / effW)),
                            y: Math.max(0, Math.min(1, (pt.y - margins.top) / effH)),
                          })),
                        }
                      : {}),
                  };
                });
              }
              await commitMutatedPdfBytes(cropped, nextAnns, resetCrop ? 'Crop margins reset' : 'Applied crop margins');
            } catch (err: unknown) {
              setStatusMsg(err instanceof Error ? err.message : 'Crop failed');
            } finally {
              setLoading(false);
            }
          }}
        />
      )}

      {showWatermarkModal && (
        <PDFWatermarkModal
          initial={watermarkCfg}
          activePageNum={activePageNum}
          totalPages={pages.length}
          onSave={(cfg, burnPermanently) => {
            setShowWatermarkModal(false);
            if (burnPermanently) {
              void handleBurnWatermarkIntoPDF(cfg);
            } else {
              setWatermarkCfg(cfg);
              setStatusMsg('Live Watermark & Bates preview updated');
            }
          }}
          onClose={() => setShowWatermarkModal(false)}
        />
      )}

      {showPrintModal && (
        <PDFPrintModal
          activePageNum={activePageNum}
          totalPages={pages.length}
          onPrint={(opts) => void handlePrintWithOptions(opts)}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {showCombineModal && activeTab && (
        <PDFCombineModal
          initialItems={[
            { id: activeTab.id, kind: 'pdf', name: activeTab.fileName, bytes: activeTab.bytes },
          ]}
          onClose={() => setShowCombineModal(false)}
          onMerge={async (items: CombineQueueItem[]) => {
            setShowCombineModal(false);
            setLoading(true);
            try {
              const merged = await mergeMultipleBuffersAndImages(items);
              await commitMutatedPdfBytes(merged, undefined, `Merged ${items.length} files`);
            } catch (err: unknown) {
              setStatusMsg(err instanceof Error ? err.message : 'Combine failed');
            } finally {
              setLoading(false);
            }
          }}
        />
      )}

      {showSplitModal && (
        <PDFSplitModal
          activePageNum={activePageNum}
          totalPages={pages.length}
          onClose={() => setShowSplitModal(false)}
          onSplitAfterPage={() => {
            setShowSplitModal(false);
            void handleManipulate('split', [activePageNum - 1]);
          }}
          onSplitEveryN={async (n) => {
            if (!pdfBytes || !activeTab) return;
            setShowSplitModal(false);
            setLoading(true);
            try {
              const chunks = await splitPDFByChunkSize(pdfBytes, n);
              chunks.forEach((bytes, idx) => {
                const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${activeTab.fileName.replace(/\.pdf$/i, '')}_part${idx + 1}.pdf`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              });
              setStatusMsg(`Split into ${chunks.length} PDFs`);
            } catch (err: unknown) {
              setStatusMsg(err instanceof Error ? err.message : 'Split failed');
            } finally {
              setLoading(false);
            }
          }}
          onExtractRange={(expr) => {
            setShowSplitModal(false);
            const nums = parsePageRangeExpression(expr, pages.length);
            if (nums.length > 0) void handleManipulate('extract', nums.map((n) => n - 1));
          }}
        />
      )}

      {showMetaModal && activeTab && (
        <PDFMetadataModal
          fileName={activeTab.fileName}
          docMeta={activeTab.docMeta}
          pageCount={pages.length}
          byteLength={activeTab.bytes.byteLength}
          annotationCount={annotations.length}
          onClose={() => setShowMetaModal(false)}
          onSaveMeta={async (meta) => {
            if (!pdfBytes) return;
            setShowMetaModal(false);
            setLoading(true);
            try {
              const updated = await updatePDFDocumentMetadata(pdfBytes, meta);
              await commitMutatedPdfBytes(updated, undefined, 'Metadata updated', false);
            } catch (err: unknown) {
              setStatusMsg(err instanceof Error ? err.message : 'Metadata update failed');
            } finally {
              setLoading(false);
            }
          }}
        />
      )}

      {showShortcutsModal && <PDFShortcutsModal onClose={() => setShowShortcutsModal(false)} />}

      {/* Pro Feature Modals */}
      {(showCompressModal || showPasswordModal || showA11yPanel || showLinkEditor || showAutoFormDetect || showSanitizeModal || showHeaderFooterModal || showCompareModal) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowCompressModal(false); setShowPasswordModal(false); setShowA11yPanel(false); setShowLinkEditor(false); setShowAutoFormDetect(false); setShowSanitizeModal(false); setShowHeaderFooterModal(false); setShowCompareModal(false); }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {showCompressModal && 'Compress / Optimize PDF'}
                {showPasswordModal && 'Password Protection'}
                {showA11yPanel && 'Accessibility Check'}
                {showLinkEditor && 'Edit Links'}
                {showAutoFormDetect && 'Auto-Detect Form Fields'}
                {showSanitizeModal && 'Sanitize Document'}
                {showHeaderFooterModal && 'Headers & Footers'}
                {showCompareModal && 'Compare Documents'}
              </h3>
              <button type="button" onClick={() => { setShowCompressModal(false); setShowPasswordModal(false); setShowA11yPanel(false); setShowLinkEditor(false); setShowAutoFormDetect(false); setShowSanitizeModal(false); setShowHeaderFooterModal(false); setShowCompareModal(false); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                {showCompressModal && <FileArchive className="w-6 h-6 text-blue-600" />}
                {showPasswordModal && <FileLock2 className="w-6 h-6 text-blue-600" />}
                {showA11yPanel && <FileCheck2 className="w-6 h-6 text-blue-600" />}
                {showLinkEditor && <Link2 className="w-6 h-6 text-blue-600" />}
                {showAutoFormDetect && <Wand2 className="w-6 h-6 text-blue-600" />}
                {showSanitizeModal && <ShieldCheck className="w-6 h-6 text-blue-600" />}
                {showHeaderFooterModal && <Hash className="w-6 h-6 text-blue-600" />}
                {showCompareModal && <FileSearch className="w-6 h-6 text-blue-600" />}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">This pro feature is coming soon.</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {showCompressModal && 'Reduce PDF file size by optimizing images, fonts, and structure.'}
                {showPasswordModal && 'Set open password and permissions password to protect your document.'}
                {showA11yPanel && 'Check document for PDF/UA compliance and accessibility issues.'}
                {showLinkEditor && 'Add, edit, or remove hyperlinks within your PDF pages.'}
                {showAutoFormDetect && 'Automatically detect and create interactive form fields from static content.'}
                {showSanitizeModal && 'Remove hidden metadata, comments, attachments, and sensitive information.'}
                {showHeaderFooterModal && 'Add page numbers, dates, and custom text to headers and footers.'}
                {showCompareModal && 'Compare two PDF documents side-by-side and highlight differences.'}
              </p>
            </div>
            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button type="button" onClick={() => { setShowCompressModal(false); setShowPasswordModal(false); setShowA11yPanel(false); setShowLinkEditor(false); setShowAutoFormDetect(false); setShowSanitizeModal(false); setShowHeaderFooterModal(false); setShowCompareModal(false); }} className="px-4 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
