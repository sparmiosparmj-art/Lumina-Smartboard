import React from 'react';
import {
  Check,
  Copy,
  Highlighter,
  Lock,
  MessageSquare,
  Send,
  Sparkles,
  StickyNote,
  Strikethrough,
  Trash2,
  Underline,
  Volume2,
  X,
} from 'lucide-react';
import type { PDFAnnotation } from '../../types/smartboard';
import { openSafeExternalLink } from '../../utils/externalLinks';
import {
  parsePageRangeExpression,
  resolveHeaderFooterTokens,
  type LoadedPDFPage,
  type PDFDocumentProxy,
  type PDFFormWidget,
  type PDFPageLink,
} from '../../utils/pdfPptx';
import {
  formatMeasureDistance,
  getSvgDashArray,
  isHexColorDark,
  LivePDFPageCanvas,
  OfficialPDFTextLayer,
  type MeasureUnit,
} from './PDFPageHelpers';
import type { WatermarkConfig } from './PDFToolModals';

export type PageToolMode =
  | PDFAnnotation['kind']
  | 'select'
  | 'pan'
  | 'snip'
  | 'erase';

export type PendingNoteState = {
  kind: 'comment' | 'sticky' | 'text' | 'callout';
  pageNumber: number;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  editId?: string;
  text: string;
};

export type TextSelMenuState = {
  pageNumber: number;
  leftPx: number;
  topPx: number;
  selectedText: string;
  rects: { x: number; y: number; w: number; h: number }[];
  wordRects: SpeechHighlightRect[][];
};

type SpeechHighlightRect = { x: number; y: number; w: number; h: number };

export type DrawSessionRef = React.MutableRefObject<{
  active: boolean;
  mode: 'draw' | 'move' | 'resize' | 'endpoint_start' | 'endpoint_end' | 'pan_drag';
  annId?: string;
  pageNumber: number;
  startX: number;
  startY: number;
  moved?: boolean;
  startClientX?: number;
  startClientY?: number;
  eraseSnapshotted?: boolean;
  origX?: number;
  origY?: number;
  origW?: number;
  origH?: number;
  origX2?: number;
  origY2?: number;
  origPoints?: { x: number; y: number }[];
  panClientX?: number;
  panClientY?: number;
  scrollLeft?: number;
  scrollTop?: number;
}>;

type PDFPageSurfaceProps = {
  pdfDoc: PDFDocumentProxy | null;
  page: LoadedPDFPage;
  totalPages: number;
  activePageNum: number;
  isMountedFull: boolean;
  layoutMode: 'single' | 'scroll' | 'spread';
  readerMode: boolean;
  readerTheme: 'light' | 'sepia' | 'dark';
  displayWidthPx: number;
  speechCharRange: { start: number; end: number } | null;
  effectiveTool: PageToolMode;
  annColor: string;
  measureUnit: MeasureUnit;
  pageAnns: PDFAnnotation[];
  pageLinks: PDFPageLink[];
  pageWidgets: PDFFormWidget[];
  formsEnabled: boolean;
  highlightFormFields?: boolean;
  activeWidgetId?: string | null;
  formValues: Record<string, string | boolean>;
  onChangeFormValue: (fieldName: string, value: string | boolean) => void;
  watermarkPreview?: WatermarkConfig;
  toolDefaults?: {
    fillColor: string;
    strokeWidth: number;
    strokeStyle: 'solid' | 'dashed' | 'dotted';
    borderRadius: number;
    opacity: number;
    fontFamily: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    underline: boolean;
    textAlign: 'left' | 'center' | 'right';
    rotation: number;
    authorName: string;
  };
  searchQuery: string;
  searchMatchCase: boolean;
  selectedAnnId: string | null;
  openThreadId: string | null;
  setOpenThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  replyDraft: string;
  setReplyDraft: (val: string) => void;
  onAddReply: (annId: string, pageNumber: number, text: string) => void;
  onDeleteReply?: (annId: string, pageNumber: number, replyId: string) => void;
  onToggleResolve: (annId: string, pageNumber: number) => void;
  snipRect: { pageNumber: number; x: number; y: number; w: number; h: number } | null;
  pendingNote: PendingNoteState | null;
  setPendingNote: React.Dispatch<React.SetStateAction<PendingNoteState | null>>;
  textSelMenu: TextSelMenuState | null;
  setTextSelMenu: React.Dispatch<React.SetStateAction<TextSelMenuState | null>>;
  applySelectionMarkup: (kind: 'highlight' | 'underline' | 'strike') => void;
  onAskAIWithPage?: (prompt: string, pageText: string) => void;
  onReadAloudText?: (text: string, onWordChange?: (wordIndex: number | null) => void) => void;
  selectedSpeechWordRects?: SpeechHighlightRect[];
  onJumpPage: (pageNum: number, recordHistory?: boolean) => void;
  onSetActivePage: (pageNum: number) => void;
  onSelectAnn: (id: string | null) => void;
  onSwitchToSelect?: () => void;
  updateAnnotations: (updater: PDFAnnotation[] | ((prev: PDFAnnotation[]) => PDFAnnotation[]), pageNum?: number) => void;
  snapshotPageUndo: (pageNum: number) => void;
  setPageRef: (pageNum: number, el: HTMLDivElement | null) => void;
  drawRef: DrawSessionRef;
  onPointerDownPage: (e: React.PointerEvent<HTMLDivElement>, pageNum: number) => void;
  onPointerMovePage: (e: React.PointerEvent<HTMLDivElement>, pageNum: number) => void;
  onPointerUpPage: (e: React.PointerEvent<HTMLDivElement>, pageNum: number) => void;
  onMouseUpPage: (e: React.MouseEvent<HTMLDivElement>, pageNum: number) => void;
  onContextMenuPage: (e: React.MouseEvent<HTMLDivElement>, pageNum: number, normX?: number, normY?: number, hitAnnId?: string) => void;
};

function getSpeechWordRects(
  root: HTMLElement,
  page: LoadedPDFPage,
  speechRange: { start: number; end: number }
): SpeechHighlightRect[] {
  const items = page.textItems || [];
  if (items.length === 0) return [];
  const text = page.text || items.map((item) => item.str.trim()).join(' ');
  const spans = Array.from(root.querySelectorAll<HTMLElement>('.pdf-text-layer span, [data-pdf-text-item]'));
  const rootRect = root.getBoundingClientRect();
  const rects: SpeechHighlightRect[] = [];
  let spanIndex = 0;
  let searchFrom = 0;

  for (const item of items) {
    const itemText = item.str.trim();
    if (!itemText) continue;
    const itemStart = text.indexOf(itemText, searchFrom);
    if (itemStart < 0) continue;
    const itemEnd = itemStart + itemText.length;
    let matchingSpan: HTMLElement | null = null;
    while (spanIndex < spans.length) {
      const candidate = spans[spanIndex++];
      if ((candidate.textContent || '').trim() === itemText) {
        matchingSpan = candidate;
        break;
      }
    }

    if (itemEnd > speechRange.start && itemStart < speechRange.end) {
      const rectCountBefore = rects.length;
      const localStart = Math.max(0, speechRange.start - itemStart);
      const localEnd = Math.min(itemText.length, speechRange.end - itemStart);
      const rawSpanText = matchingSpan?.textContent || '';
      const spanTextStart = rawSpanText.indexOf(itemText);
      if (matchingSpan && spanTextStart >= 0) {
        const findTextBoundary = (offset: number): { node: Text; offset: number } | null => {
          const walker = document.createTreeWalker(matchingSpan, NodeFilter.SHOW_TEXT);
          let consumed = 0;
          let node = walker.nextNode();
          while (node) {
            const textNode = node as Text;
            const nodeLength = textNode.data.length;
            if (offset <= consumed + nodeLength) return { node: textNode, offset: offset - consumed };
            consumed += nodeLength;
            node = walker.nextNode();
          }
          return null;
        };
        const startBoundary = findTextBoundary(spanTextStart + localStart);
        const endBoundary = findTextBoundary(spanTextStart + localEnd);
        if (startBoundary && endBoundary) {
          const wordRange = document.createRange();
          wordRange.setStart(startBoundary.node, startBoundary.offset);
          wordRange.setEnd(endBoundary.node, endBoundary.offset);
          for (const rect of Array.from(wordRange.getClientRects())) {
            if (rect.width <= 0.5 || rect.height <= 0.5 || rootRect.width <= 0 || rootRect.height <= 0) continue;
            rects.push({
              x: (rect.left - rootRect.left) / rootRect.width,
              y: (rect.top - rootRect.top) / rootRect.height,
              w: rect.width / rootRect.width,
              h: rect.height / rootRect.height,
            });
          }
        }
      }
      if (rects.length === rectCountBefore) {
        rects.push({
          x: item.x + (item.w * localStart) / itemText.length,
          y: item.y,
          w: Math.max(0.002, (item.w * (localEnd - localStart)) / itemText.length),
          h: item.h,
        });
      }
    }
    searchFrom = itemEnd;
  }
  return rects;
}

export const PDFPageSurface: React.FC<PDFPageSurfaceProps> = ({
  pdfDoc,
  page,
  totalPages,
  activePageNum,
  isMountedFull,
  layoutMode,
  readerMode,
  readerTheme,
  displayWidthPx,
  speechCharRange,
  effectiveTool,
  annColor,
  measureUnit,
  pageAnns,
  pageLinks,
  pageWidgets,
  formsEnabled,
  highlightFormFields,
  activeWidgetId,
  formValues,
  onChangeFormValue,
  watermarkPreview,
  toolDefaults,
  searchQuery,
  searchMatchCase,
  selectedAnnId,
  openThreadId,
  setOpenThreadId,
  replyDraft,
  setReplyDraft,
  onAddReply,
  onDeleteReply,
  onToggleResolve,
  snipRect,
  pendingNote,
  setPendingNote,
  textSelMenu,
  setTextSelMenu,
  applySelectionMarkup,
  onAskAIWithPage,
  onReadAloudText,
  selectedSpeechWordRects,
  onJumpPage,
  onSetActivePage,
  onSelectAnn,
  onSwitchToSelect,
  updateAnnotations,
  snapshotPageUndo,
  setPageRef,
  drawRef,
  onPointerDownPage,
  onPointerMovePage,
  onPointerUpPage,
  onMouseUpPage,
  onContextMenuPage,
}) => {
  const aspectW = page.ptWidth || page.width || 595;
  const aspectH = page.ptHeight || page.height || 842;
  const ptW = page.ptWidth || 595;
  const ptH = page.ptHeight || 842;
  const queryLower = searchQuery.trim().toLowerCase();
  const orderedAnns = [...pageAnns].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const pageSurfaceRef = React.useRef<HTMLDivElement>(null);
  const [speechWordRects, setSpeechWordRects] = React.useState<SpeechHighlightRect[]>([]);

  React.useEffect(() => {
    if (!speechCharRange) {
      setSpeechWordRects([]);
      return;
    }
    const root = pageSurfaceRef.current;
    if (!root) return;
    let active = true;
    const updateSpeechWordRects = () => {
      const rects = getSpeechWordRects(root, page, speechCharRange);
      if (active) setSpeechWordRects(rects);
    };
    updateSpeechWordRects();
    const textLayer = root.querySelector('.pdf-text-layer');
    const observer = textLayer ? new MutationObserver(updateSpeechWordRects) : null;
    observer?.observe(textLayer as Node, { childList: true, subtree: true });
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [displayWidthPx, page, speechCharRange?.end, speechCharRange?.start]);

  // Dark mode uses CSS inversion for night reading; sepia uses gentle tinting
  const imgFilterClass =
    readerTheme === 'dark'
      ? '[filter:invert(0.88)_hue-rotate(180deg)]'
      : readerTheme === 'sepia'
        ? 'sepia-[.20] brightness-[0.97] contrast-[1.02]'
        : '';
  // Note: annotations are sibling elements of the filtered canvas, so they retain
  // their original colors automatically -- no counter-inversion needed.

  const searchMatchIndices = new Set<number>();
  if (queryLower.length >= 2 && page.textItems?.length) {
    const items = page.textItems;
    let joined = '';
    const spans: { idx: number; start: number; end: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const s = searchMatchCase ? items[i].str : items[i].str.toLowerCase();
      const start = joined.length;
      joined += s;
      spans.push({ idx: i, start, end: joined.length });
      joined += ' ';
    }
    const needle = searchMatchCase ? searchQuery.trim() : queryLower;
    let pos = joined.indexOf(needle);
    while (pos !== -1) {
      const endPos = pos + needle.length;
      for (const sp of spans) {
        if (sp.end > pos && sp.start < endPos) searchMatchIndices.add(sp.idx);
      }
      pos = joined.indexOf(needle, pos + 1);
    }
  }

  const startMoveAnn = (e: React.PointerEvent, a: PDFAnnotation) => {
    e.stopPropagation();
    onSelectAnn(a.id);
    if (a.locked) return;
    const el = (e.currentTarget as Element).closest('[data-page-num]') as HTMLElement | null;
    if (!el) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore unsupported capture
    }
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    snapshotPageUndo(page.pageNumber);
    drawRef.current = {
      active: true,
      mode: 'move',
      annId: a.id,
      pageNumber: page.pageNumber,
      startX: nx,
      startY: ny,
      moved: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: a.x,
      origY: a.y,
      origX2: a.x2,
      origY2: a.y2,
      origPoints: a.points ? a.points.map((pt) => ({ ...pt })) : undefined,
    };
  };

  const startHandleDrag = (
    e: React.PointerEvent,
    a: PDFAnnotation,
    mode: 'resize' | 'endpoint_start' | 'endpoint_end'
  ) => {
    e.stopPropagation();
    if (a.locked) return;
    const el = (e.currentTarget as Element).closest('[data-page-num]') as HTMLElement | null;
    if (!el) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // ignore unsupported capture
    }
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    snapshotPageUndo(page.pageNumber);
    drawRef.current = {
      active: true,
      mode,
      annId: a.id,
      pageNumber: page.pageNumber,
      startX: nx,
      startY: ny,
      moved: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: a.x,
      origY: a.y,
      origW: a.w || 0.14,
      origH: a.h || 0.05,
      origX2: a.x2 ?? a.x + (a.w || 0.12),
      origY2: a.y2 ?? a.y + (a.h || 0.04),
    };
  };

  const selectedAnn = selectedAnnId ? orderedAnns.find((a) => a.id === selectedAnnId) || null : null;

  const wmActive = (() => {
    if (!watermarkPreview) return false;
    const sc = watermarkPreview.scope || 'all';
    if (sc === 'current') return page.pageNumber === activePageNum;
    if (sc === 'range' && watermarkPreview.rangeExpr) {
      return parsePageRangeExpression(watermarkPreview.rangeExpr, totalPages).includes(page.pageNumber);
    }
    return true;
  })();

  return (
    <div
      ref={(el) => {
        pageSurfaceRef.current = el;
        setPageRef(page.pageNumber, el);
      }}
      data-page-num={page.pageNumber}
      style={{ width: `${displayWidthPx}px` }}
      onClick={() => {
        if (activePageNum !== page.pageNumber) onSetActivePage(page.pageNumber);
      }}
      onContextMenu={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const nx = Math.max(0, Math.min(0.95, (e.clientX - r.left) / r.width));
        const ny = Math.max(0, Math.min(0.95, (e.clientY - r.top) / r.height));
        onContextMenuPage(e, page.pageNumber, nx, ny);
      }}
      className={`relative bg-white shadow-lg border transition-shadow shrink-0 ${
        page.pageNumber === activePageNum && layoutMode !== 'single' && !readerMode
          ? 'border-blue-500 ring-2 ring-blue-500/25'
          : readerTheme === 'dark'
            ? 'border-slate-700'
            : 'border-slate-300 dark:border-slate-700'
      } ${
        effectiveTool === 'pan'
          ? 'cursor-grab active:cursor-grabbing touch-none select-none'
          : effectiveTool === 'select'
            ? 'cursor-default'
            : 'cursor-crosshair touch-none select-none'
      }`}
      onPointerDown={(e) => onPointerDownPage(e, page.pageNumber)}
      onPointerMove={(e) => onPointerMovePage(e, page.pageNumber)}
      onPointerUp={(e) => onPointerUpPage(e, page.pageNumber)}
      onPointerCancel={(e) => onPointerUpPage(e, page.pageNumber)}
      onMouseUp={(e) => onMouseUpPage(e, page.pageNumber)}
    >
      {isMountedFull ? (
        <LivePDFPageCanvas pdfDoc={pdfDoc} page={page} displayWidthPx={displayWidthPx} className={imgFilterClass} />
      ) : (
        <div className="relative w-full bg-white" style={{ aspectRatio: `${aspectW} / ${aspectH}` }}>
          {page.dataUrl && (
            <img
              src={page.dataUrl}
              alt={`Page ${page.pageNumber}`}
              className={`w-full h-full block object-contain pointer-events-none ${imgFilterClass}`}
            />
          )}
        </div>
      )}

      {/* Official Mozilla PDF.js TextLayer + Scanned OCR fallback */}
      {isMountedFull && (
        <OfficialPDFTextLayer
          pdfDoc={pdfDoc}
          page={page}
          displayWidthPx={displayWidthPx}
          interactive={effectiveTool === 'select'}
        />
      )}

      {/* Search Hit Highlights */}
      {queryLower.length >= 2 && page.textItems && searchMatchIndices.size > 0 && (
        <div className="absolute inset-0 pointer-events-none z-[2]">
          {page.textItems.map((item, idx) =>
            searchMatchIndices.has(idx) ? (
              <span
                key={idx}
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: `${item.w * 100}%`,
                  height: `${item.h * 100}%`,
                }}
                className="absolute bg-amber-300/60 ring-1 ring-amber-500 rounded-xs"
              />
            ) : null
          )}
        </div>
      )}

      {(selectedSpeechWordRects?.length || (speechCharRange && speechWordRects.length > 0)) && (
        <div className="absolute inset-0 pointer-events-none z-[3]" aria-hidden="true">
          {(selectedSpeechWordRects?.length ? selectedSpeechWordRects : speechWordRects).map((rect, index) => (
            <span
              key={index}
              data-speech-highlight="true"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
              className="absolute rounded-sm bg-yellow-300/70 outline outline-2 outline-amber-500/90 shadow-[0_0_8px_rgba(245,158,11,0.65)]"
            />
          ))}
        </div>
      )}

      {/* Clickable PDF Hyperlinks */}
      {effectiveTool !== 'draw' && effectiveTool !== 'highlighter_ink' && pageLinks.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-[3]">
          {pageLinks.map((lnk) => (
            <button
              key={lnk.id}
              type="button"
              title={lnk.targetPage ? `Go to page ${lnk.targetPage}` : lnk.url}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (lnk.targetPage) onJumpPage(lnk.targetPage, true);
                else if (lnk.url) openSafeExternalLink(lnk.url);
              }}
              style={{
                left: `${lnk.x * 100}%`,
                top: `${lnk.y * 100}%`,
                width: `${lnk.w * 100}%`,
                height: `${lnk.h * 100}%`,
              }}
              className="absolute pointer-events-auto cursor-pointer rounded-xs hover:bg-blue-500/15 hover:ring-1 hover:ring-blue-500/45 transition-colors"
            />
          ))}
        </div>
      )}

      {/* Interactive Fillable AcroForm Fields */}
      {isMountedFull && formsEnabled && pageWidgets.length > 0 && !readerMode && (
        <div className="absolute inset-0 pointer-events-none z-[4]">
          {pageWidgets.map((w) => {
            const val = formValues[w.fieldName] !== undefined ? formValues[w.fieldName] : w.defaultValue;
            const isActiveWidget = activeWidgetId === w.id;
            const fieldRing = isActiveWidget
              ? 'ring-2 ring-blue-600 bg-blue-100/85 border-blue-600'
              : highlightFormFields
                ? 'ring-1 ring-indigo-500/70 bg-indigo-50/70 border-indigo-400'
                : 'border-blue-400/75 bg-blue-50/55';
            const style: React.CSSProperties = {
              left: `${w.x * 100}%`,
              top: `${w.y * 100}%`,
              width: `${w.w * 100}%`,
              height: `${w.h * 100}%`,
            };
            if (w.fieldType === 'checkbox') {
              return (
                <label
                  key={w.id}
                  id={`pdf-widget-${w.id}`}
                  style={style}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`absolute pointer-events-auto flex items-center justify-center border rounded-xs cursor-pointer hover:bg-blue-100/60 ${fieldRing}`}
                >
                  <input
                    type="checkbox"
                    disabled={w.readOnly}
                    checked={Boolean(val)}
                    onChange={(e) => onChangeFormValue(w.fieldName, e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                  />
                </label>
              );
            }
            if (w.fieldType === 'radio') {
              const targetVal = w.buttonValue || w.id;
              return (
                <label
                  key={w.id}
                  id={`pdf-widget-${w.id}`}
                  style={style}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`absolute pointer-events-auto flex items-center justify-center rounded-full border cursor-pointer ${fieldRing}`}
                >
                  <input
                    type="radio"
                    name={`pdf-radio-${w.fieldName}`}
                    disabled={w.readOnly}
                    checked={String(val) === targetVal}
                    onChange={() => onChangeFormValue(w.fieldName, targetVal)}
                    className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                  />
                </label>
              );
            }
            if (w.fieldType === 'select') {
              return (
                <select
                  key={w.id}
                  id={`pdf-widget-${w.id}`}
                  style={style}
                  disabled={w.readOnly}
                  value={String(val || '')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => onChangeFormValue(w.fieldName, e.target.value)}
                  className={`absolute pointer-events-auto border rounded-xs text-[11px] text-slate-900 px-1 focus:bg-white focus:outline-blue-600 ${fieldRing}`}
                >
                  {(w.options || []).map((opt) => (
                    <option key={opt.exportValue} value={opt.exportValue}>
                      {opt.displayValue}
                    </option>
                  ))}
                </select>
              );
            }
            return w.multiline ? (
              <textarea
                key={w.id}
                id={`pdf-widget-${w.id}`}
                style={style}
                readOnly={w.readOnly}
                value={String(val || '')}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => onChangeFormValue(w.fieldName, e.target.value)}
                className={`absolute pointer-events-auto border rounded-xs text-[11px] leading-tight text-slate-900 px-1 py-0.5 resize-none focus:bg-white/95 focus:outline-blue-600 ${fieldRing}`}
              />
            ) : (
              <input
                key={w.id}
                id={`pdf-widget-${w.id}`}
                type="text"
                style={style}
                readOnly={w.readOnly}
                value={String(val || '')}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => onChangeFormValue(w.fieldName, e.target.value)}
                className={`absolute pointer-events-auto border rounded-xs text-[11px] text-slate-900 px-1 focus:bg-white/95 focus:outline-blue-600 ${fieldRing}`}
              />
            );
          })}
        </div>
      )}

      {/* Geometrically Accurate SVG Vector Overlay */}
      <svg viewBox={`0 0 ${aspectW} ${aspectH}`} className="absolute inset-0 w-full h-full pointer-events-none z-[5]">
        <defs>
          {orderedAnns
            .filter((a) => a.kind === 'arrow')
            .map((a) => (
              <marker
                key={`m-${a.id}`}
                id={`arrow-${a.id}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill={a.color} />
              </marker>
            ))}
        </defs>
        {orderedAnns.map((a) => {
          const sw = (a.strokeWidth || 2.5) * (aspectW / 700);
          const isSel = selectedAnnId === a.id;
          const dashArr = getSvgDashArray(a.strokeStyle, sw, isSel);
          const annFill = a.fillColor && a.fillColor !== 'transparent' ? a.fillColor : 'none';
          const clickableProps =
            effectiveTool === 'select'
              ? {
                  style: { pointerEvents: 'auto' as const, cursor: a.locked ? 'not-allowed' : 'move' },
                  onPointerDown: (e: React.PointerEvent) => startMoveAnn(e, a),
                  onContextMenu: (e: React.MouseEvent<SVGElement>) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectAnn(a.id);
                    onContextMenuPage(e as unknown as React.MouseEvent<HTMLDivElement>, page.pageNumber, a.x, a.y, a.id);
                  },
                }
              : {};

          if (a.kind === 'highlight') {
            return (
              <rect
                key={a.id}
                x={a.x * aspectW}
                y={a.y * aspectH}
                width={(a.w || 0.1) * aspectW}
                height={(a.h || 0.025) * aspectH}
                fill={a.color}
                opacity={a.opacity ?? 0.36}
                stroke={isSel ? '#2563EB' : 'none'}
                strokeWidth={isSel ? 1.5 : 0}
                {...clickableProps}
              />
            );
          }
          if (a.kind === 'redact') {
            return (
              <g key={a.id} {...clickableProps}>
                <rect
                  x={a.x * aspectW}
                  y={a.y * aspectH}
                  width={(a.w || 0.12) * aspectW}
                  height={(a.h || 0.03) * aspectH}
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke="#DC2626"
                  strokeWidth={isSel ? 2 : 1.25}
                  strokeDasharray={isSel ? undefined : '4 2'}
                />
              </g>
            );
          }
          if (a.kind === 'underline') {
            const yLine = (a.y + (a.h || 0.02)) * aspectH;
            return (
              <g key={a.id} opacity={a.opacity ?? 1} {...clickableProps}>
                <line x1={a.x * aspectW} y1={yLine} x2={(a.x + (a.w || 0.12)) * aspectW} y2={yLine} stroke="transparent" strokeWidth={12} />
                <line
                  x1={a.x * aspectW}
                  y1={yLine}
                  x2={(a.x + (a.w || 0.12)) * aspectW}
                  y2={yLine}
                  stroke={a.color}
                  strokeWidth={Math.max(1.5, sw)}
                  strokeDasharray={dashArr}
                />
              </g>
            );
          }
          if (a.kind === 'strike') {
            const yLine = (a.y + (a.h || 0.02) / 2) * aspectH;
            return (
              <g key={a.id} opacity={a.opacity ?? 1} {...clickableProps}>
                <line x1={a.x * aspectW} y1={yLine} x2={(a.x + (a.w || 0.12)) * aspectW} y2={yLine} stroke="transparent" strokeWidth={12} />
                <line
                  x1={a.x * aspectW}
                  y1={yLine}
                  x2={(a.x + (a.w || 0.12)) * aspectW}
                  y2={yLine}
                  stroke={a.color}
                  strokeWidth={Math.max(1.5, sw)}
                  strokeDasharray={dashArr}
                />
              </g>
            );
          }
          if (a.kind === 'rect') {
            const rad = (a.borderRadius || 0) * (aspectW / 700);
            return (
              <rect
                key={a.id}
                x={a.x * aspectW}
                y={a.y * aspectH}
                width={(a.w || 0.1) * aspectW}
                height={(a.h || 0.06) * aspectH}
                rx={rad}
                ry={rad}
                fill={annFill}
                opacity={a.opacity ?? 1}
                stroke={a.color}
                strokeWidth={sw}
                strokeDasharray={dashArr}
                {...clickableProps}
              />
            );
          }
          if (a.kind === 'circle') {
            const rx = ((a.w || 0.1) * aspectW) / 2;
            const ry = ((a.h || 0.08) * aspectH) / 2;
            return (
              <ellipse
                key={a.id}
                cx={a.x * aspectW + rx}
                cy={a.y * aspectH + ry}
                rx={Math.max(1, rx)}
                ry={Math.max(1, ry)}
                fill={annFill}
                opacity={a.opacity ?? 1}
                stroke={a.color}
                strokeWidth={sw}
                strokeDasharray={dashArr}
                {...clickableProps}
              />
            );
          }
          if (a.kind === 'line' || a.kind === 'arrow' || a.kind === 'measure') {
            const x1 = a.x * aspectW;
            const y1 = a.y * aspectH;
            const x2 = (a.x2 ?? a.x + (a.w || 0.12)) * aspectW;
            const y2 = (a.y2 ?? a.y + (a.h || 0.04)) * aspectH;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const perp = angle + Math.PI / 2;
            const tick = 5.5 * (aspectW / 700);
            const label =
              a.kind === 'measure'
                ? formatMeasureDistance(a.x, a.y, a.x2 ?? a.x, a.y2 ?? a.y, ptW, ptH, a.measureUnit || measureUnit, a.measureScale || 1)
                : '';
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            return (
              <g key={a.id} opacity={a.opacity ?? 1} {...clickableProps}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={Math.max(12, sw + 10)} strokeLinecap="round" />
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={a.color || '#2563EB'}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  strokeDasharray={dashArr}
                  markerEnd={a.kind === 'arrow' ? `url(#arrow-${a.id})` : undefined}
                />
                {a.kind === 'measure' && (() => {
                  const pillW = Math.max(52, label.length * 5.8 + 14) * (aspectW / 700);
                  const pillH = 18 * (aspectW / 700);
                  return (
                    <>
                      <line
                        x1={x1 - tick * Math.cos(perp)}
                        y1={y1 - tick * Math.sin(perp)}
                        x2={x1 + tick * Math.cos(perp)}
                        y2={y1 + tick * Math.sin(perp)}
                        stroke={a.color || '#2563EB'}
                        strokeWidth={Math.max(1.5, sw)}
                      />
                      <line
                        x1={x2 - tick * Math.cos(perp)}
                        y1={y2 - tick * Math.sin(perp)}
                        x2={x2 + tick * Math.cos(perp)}
                        y2={y2 + tick * Math.sin(perp)}
                        stroke={a.color || '#2563EB'}
                        strokeWidth={Math.max(1.5, sw)}
                      />
                      <rect
                        x={mx - pillW / 2}
                        y={my - pillH / 2}
                        width={pillW}
                        height={pillH}
                        rx={4 * (aspectW / 700)}
                        fill={a.color || '#2563EB'}
                      />
                      <text
                        x={mx}
                        y={my + 3 * (aspectW / 700)}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize={9 * (aspectW / 700)}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="600"
                      >
                        {label}
                      </text>
                    </>
                  );
                })()}
              </g>
            );
          }
          if ((a.kind === 'draw' || a.kind === 'highlighter_ink') && a.points?.length) {
            const ptsStr = a.points.map((pt) => `${pt.x * aspectW},${pt.y * aspectH}`).join(' ');
            const strokeW = a.kind === 'highlighter_ink' ? Math.max(8, sw * 4.2) : sw;
            return (
              <g key={a.id} {...clickableProps}>
                <polyline fill="none" stroke="transparent" strokeWidth={Math.max(14, strokeW + 10)} strokeLinecap="round" strokeLinejoin="round" points={ptsStr} />
                <polyline
                  fill="none"
                  stroke={a.color}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={a.kind === 'draw' ? dashArr : isSel ? '4 2' : undefined}
                  opacity={a.kind === 'highlighter_ink' ? a.opacity ?? 0.35 : a.opacity ?? 1}
                  points={ptsStr}
                />
              </g>
            );
          }
          if (a.kind === 'callout' && typeof a.x2 === 'number' && typeof a.y2 === 'number') {
            const cx = (a.x + (a.w || 0.14) / 2) * aspectW;
            const cy = (a.y + (a.h || 0.045) / 2) * aspectH;
            return (
              <g key={`cl-${a.id}`} opacity={a.opacity ?? 1}>
                <line
                  x1={cx}
                  y1={cy}
                  x2={a.x2 * aspectW}
                  y2={a.y2 * aspectH}
                  stroke={a.color || '#DC2626'}
                  strokeWidth={Math.max(1.5, sw)}
                  strokeDasharray={dashArr}
                />
                <circle cx={a.x2 * aspectW} cy={a.y2 * aspectH} r={3.5} fill={a.color || '#DC2626'} />
              </g>
            );
          }
          return null;
        })}
        {snipRect && snipRect.pageNumber === page.pageNumber && (
          <rect
            x={snipRect.x * aspectW}
            y={snipRect.y * aspectH}
            width={snipRect.w * aspectW}
            height={snipRect.h * aspectH}
            fill="rgba(37,99,235,0.16)"
            stroke="#2563EB"
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
        )}
      </svg>

      {/* Live Watermark, Header, Footer & Bates Overlay Preview */}
      {wmActive && watermarkPreview && (watermarkPreview.text || watermarkPreview.headerLeft || watermarkPreview.headerRight || watermarkPreview.footerCenter || watermarkPreview.pageNumbers || watermarkPreview.batesPrefix) && (
        <div className="absolute inset-0 pointer-events-none z-[18] overflow-hidden select-none">
          {watermarkPreview.headerLeft && (
            <span className="absolute top-2.5 left-4 text-[10px] font-medium text-slate-600/80">
              {resolveHeaderFooterTokens(watermarkPreview.headerLeft, page.pageNumber, totalPages, watermarkPreview.batesPrefix, watermarkPreview.batesStart)}
            </span>
          )}
          {watermarkPreview.headerRight && (
            <span className="absolute top-2.5 right-4 text-[10px] font-medium text-slate-600/80">
              {resolveHeaderFooterTokens(watermarkPreview.headerRight, page.pageNumber, totalPages, watermarkPreview.batesPrefix, watermarkPreview.batesStart)}
            </span>
          )}
          {watermarkPreview.text && (
            <div
              style={{
                top: watermarkPreview.position === 'top' ? '20%' : watermarkPreview.position === 'bottom' ? '80%' : '50%',
                opacity: watermarkPreview.opacity,
                color: watermarkPreview.color,
                fontSize: `${Math.max(14, Math.round(((watermarkPreview.fontSize || 44) * displayWidthPx) / ptW))}px`,
                transform: `translate(-50%, -50%) rotate(${-watermarkPreview.angle}deg)`,
              }}
              className="absolute left-1/2 font-bold tracking-wider whitespace-nowrap"
            >
              {resolveHeaderFooterTokens(watermarkPreview.text, page.pageNumber, totalPages, watermarkPreview.batesPrefix, watermarkPreview.batesStart)}
            </div>
          )}
          {(watermarkPreview.footerCenter || watermarkPreview.pageNumbers || watermarkPreview.batesPrefix) && (
            <div className="absolute bottom-2 inset-x-4 text-center text-[10px] font-medium text-slate-600/80 truncate">
              {[
                watermarkPreview.footerCenter
                  ? resolveHeaderFooterTokens(watermarkPreview.footerCenter, page.pageNumber, totalPages, watermarkPreview.batesPrefix, watermarkPreview.batesStart)
                  : '',
                watermarkPreview.pageNumbers ? `Page ${page.pageNumber} of ${totalPages}` : '',
                watermarkPreview.batesPrefix
                  ? `${watermarkPreview.batesPrefix}${String((watermarkPreview.batesStart || 1) + (page.pageNumber - 1)).padStart(4, '0')}`
                  : '',
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </div>
          )}
        </div>
      )}

      {/* Resize & Endpoint Drag Handles for Selected Vector Annotations */}
      {effectiveTool === 'select' &&
        selectedAnn &&
        !selectedAnn.locked &&
        (selectedAnn.kind === 'rect' ||
          selectedAnn.kind === 'circle' ||
          selectedAnn.kind === 'highlight' ||
          selectedAnn.kind === 'underline' ||
          selectedAnn.kind === 'strike' ||
          selectedAnn.kind === 'redact') && (
          <div
            onPointerDown={(e) => startHandleDrag(e, selectedAnn, 'resize')}
            style={{
              left: `${(selectedAnn.x + (selectedAnn.w || 0.12)) * 100}%`,
              top: `${(selectedAnn.y + (selectedAnn.h || 0.05)) * 100}%`,
            }}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow cursor-nwse-resize"
          />
        )}

      {effectiveTool === 'select' &&
        selectedAnn &&
        !selectedAnn.locked &&
        (selectedAnn.kind === 'line' ||
          selectedAnn.kind === 'arrow' ||
          selectedAnn.kind === 'measure' ||
          selectedAnn.kind === 'callout') && (
          <>
            {selectedAnn.kind !== 'callout' && (
              <div
                onPointerDown={(e) => startHandleDrag(e, selectedAnn, 'endpoint_start')}
                style={{ left: `${selectedAnn.x * 100}%`, top: `${selectedAnn.y * 100}%` }}
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow cursor-grab"
              />
            )}
            <div
              onPointerDown={(e) => startHandleDrag(e, selectedAnn, 'endpoint_end')}
              style={{
                left: `${(selectedAnn.x2 ?? selectedAnn.x + (selectedAnn.w || 0.12)) * 100}%`,
                top: `${(selectedAnn.y2 ?? selectedAnn.y + (selectedAnn.h || 0.04)) * 100}%`,
              }}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow cursor-grab"
            />
          </>
        )}

      {/* Interactive Overlay Elements: Collapsible Sticky/Comment Pins, Text Boxes, Callouts, Stamps, Signatures, Images */}
      {orderedAnns
        .filter(
          (a) =>
            a.kind === 'comment' ||
            a.kind === 'sticky' ||
            a.kind === 'stamp' ||
            a.kind === 'image' ||
            a.kind === 'text' ||
            a.kind === 'callout'
        )
        .map((a) => {
          const isDataImg = (a.kind === 'stamp' || a.kind === 'image') && a.text?.startsWith('data:image/');
          const isSel = selectedAnnId === a.id;
          const isPin = a.kind === 'comment' || a.kind === 'sticky';
          const isThreadOpen = openThreadId === a.id;
          const fSize = Math.max(10, Math.round((a.fontSize || 13) * (displayWidthPx / 700)));
          const pinOpacity = a.opacity ?? 1;

          if (isPin) {
            return (
              <div
                key={a.id}
                style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, opacity: pinOpacity }}
                className="absolute z-20"
              >
                <button
                  type="button"
                  onPointerDown={(e) => {
                    if (effectiveTool === 'select') startMoveAnn(e, a);
                    else e.stopPropagation();
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectAnn(a.id);
                    onContextMenuPage(e as unknown as React.MouseEvent<HTMLDivElement>, page.pageNumber, a.x, a.y, a.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (drawRef.current.moved) {
                      drawRef.current.moved = false;
                      return;
                    }
                    onSelectAnn(a.id);
                    setOpenThreadId((prev) => (prev === a.id ? null : a.id));
                  }}
                  title={a.text || 'Note'}
                  style={{ backgroundColor: a.kind === 'sticky' ? a.color || '#FACC15' : a.color || '#2563EB' }}
                  className={`relative w-7 h-7 rounded-full flex items-center justify-center shadow-md border-2 border-white transition-transform hover:scale-105 ${
                    isSel ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  } ${a.kind === 'sticky' && (!a.color || a.color.toUpperCase() === '#FACC15') ? 'text-slate-900' : 'text-white'}`}
                >
                  {a.kind === 'sticky' ? <StickyNote className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  {a.resolved && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center border border-white">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {isSel && a.locked && (
                    <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center border border-white">
                      <Lock className="w-2 h-2" />
                    </span>
                  )}
                </button>

                {isThreadOpen && (
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute ${a.x > 0.58 ? 'right-0' : 'left-0'} ${a.y > 0.65 ? 'bottom-9' : 'top-9'} w-64 max-w-[calc(100vw-24px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-2.5 text-xs space-y-2 z-30`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="min-w-0">
                        <span className="font-semibold capitalize text-slate-800 dark:text-slate-100">
                          {a.author || a.kind} {a.resolved ? '· Resolved' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onToggleResolve(a.id, page.pageNumber)}
                          title={a.resolved ? 'Reopen' : 'Resolve'}
                          className={`p-1 rounded ${
                            a.resolved ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50' : 'text-slate-400 hover:text-emerald-600'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        {!a.locked && (
                          <button
                            type="button"
                            onClick={() => {
                              updateAnnotations((prev) => prev.filter((item) => item.id !== a.id), page.pageNumber);
                              setOpenThreadId(null);
                            }}
                            title="Delete"
                            className="p-1 rounded text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenThreadId(null)}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div
                      onDoubleClick={() => {
                        if (a.locked) return;
                        setPendingNote({
                          kind: a.kind as 'comment' | 'sticky',
                          pageNumber: page.pageNumber,
                          x: a.x,
                          y: a.y,
                          editId: a.id,
                          text: a.text || '',
                        });
                      }}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-snug"
                    >
                      {a.text}
                    </div>

                    {a.replies && a.replies.length > 0 && (
                      <div className="space-y-1 max-h-28 overflow-y-auto scrollbar-none pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                        {a.replies.map((r) => (
                          <div key={r.id} className="group/rep flex items-start justify-between gap-1 text-[11px] bg-slate-50 dark:bg-slate-800/60 px-2 py-1 rounded">
                            <div className="min-w-0">
                              <span className="font-semibold text-blue-600 mr-1">{r.author}:</span>
                              <span className="text-slate-700 dark:text-slate-200 break-words">{r.text}</span>
                            </div>
                            {onDeleteReply && (
                              <button
                                type="button"
                                onClick={() => onDeleteReply(a.id, page.pageNumber, r.id)}
                                className="opacity-75 md:opacity-0 md:group-hover/rep:opacity-100 text-slate-400 hover:text-red-600 shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = replyDraft.trim();
                        if (!val) return;
                        onAddReply(a.id, page.pageNumber, val);
                        setReplyDraft('');
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder="Reply…"
                        className="flex-1 px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      />
                      <button
                        type="submit"
                        disabled={!replyDraft.trim()}
                        className="p-1.5 rounded bg-blue-600 text-white disabled:opacity-40"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          }

          const boxFill = a.fillColor || a.bgColor;
          const borderRadiusPx = typeof a.borderRadius === 'number' ? `${a.borderRadius}px` : undefined;
          const canResizeOverlay =
            isSel && !a.locked && (isDataImg || a.kind === 'text' || a.kind === 'callout');

          return (
            <div
              key={a.id}
              onPointerDown={(e) => {
                if (effectiveTool !== 'select') return;
                startMoveAnn(e, a);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectAnn(a.id);
                onContextMenuPage(e as unknown as React.MouseEvent<HTMLDivElement>, page.pageNumber, a.x, a.y, a.id);
              }}
              onDoubleClick={(e) => {
                if (isDataImg || a.kind === 'stamp' || a.locked) return;
                e.stopPropagation();
                setPendingNote({
                  kind: a.kind as 'text' | 'callout',
                  pageNumber: page.pageNumber,
                  x: a.x,
                  y: a.y,
                  x2: a.x2,
                  y2: a.y2,
                  editId: a.id,
                  text: a.text || '',
                });
              }}
              style={{
                left: `${a.x * 100}%`,
                top: `${a.y * 100}%`,
                ...(a.w ? { width: `${a.w * 100}%` } : {}),
                ...(isDataImg && a.h ? { height: `${a.h * 100}%` } : {}),
                borderColor: a.color,
                borderStyle: a.strokeStyle || 'solid',
                ...((a.kind === 'callout' || (a.kind === 'stamp' && !isDataImg))
                  ? { borderWidth: `${Math.max(1, Math.round(a.strokeWidth ?? 2))}px` }
                  : {}),
                borderRadius: borderRadiusPx,
                opacity: a.opacity ?? 1,
                fontSize: `${fSize}px`,
                fontFamily: a.fontFamily ? `"${a.fontFamily}", "Noto Sans Devanagari", sans-serif` : undefined,
                fontWeight: a.fontWeight || (a.kind === 'stamp' ? 'bold' : 'normal'),
                fontStyle: a.fontStyle || 'normal',
                textDecoration: a.underline ? 'underline' : undefined,
                textAlign: a.textAlign || 'left',
                transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined,
                ...(boxFill ? { backgroundColor: boxFill } : {}),
                ...(a.kind === 'callout' && boxFill ? { color: isHexColorDark(boxFill) ? '#FFFFFF' : '#0F172A' } : {}),
                ...(a.kind === 'stamp' && !isDataImg ? { color: a.color } : {}),
                ...(a.kind === 'text' ? { color: a.color || '#0F172A' } : {}),
              }}
              className={`group absolute rounded z-[15] ${a.w ? '' : 'max-w-[280px]'} ${
                effectiveTool === 'select' ? (a.locked ? 'cursor-not-allowed' : 'cursor-move') : ''
              } ${isSel ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${
                isDataImg
                  ? 'p-0.5 bg-transparent'
                  : a.kind === 'text'
                    ? 'px-1.5 py-0.5 pr-4 hover:bg-white/65 whitespace-pre-wrap'
                    : a.kind === 'callout'
                      ? 'px-2.5 py-1 pr-5 bg-white text-slate-900 shadow-sm whitespace-pre-wrap'
                      : 'px-2 py-0.5 pr-5 font-bold tracking-wider bg-white/95 shadow-sm'
              }`}
            >
              {isDataImg ? (
                <img src={a.text} alt={a.kind === 'image' ? 'Image' : 'Signature'} className="w-full h-full object-contain pointer-events-none" />
              ) : (
                <span>{a.text}</span>
              )}
              {isSel && a.locked && (
                <span className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow">
                  <Lock className="w-2.5 h-2.5" />
                </span>
              )}
              {!a.locked && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateAnnotations((prev) => prev.filter((item) => item.id !== a.id), page.pageNumber);
                    if (selectedAnnId === a.id) onSelectAnn(null);
                  }}
                  title="Remove"
                  className="absolute right-1 top-1 opacity-75 md:opacity-0 md:group-hover:opacity-90 hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              {canResizeOverlay && (
                <div
                  onPointerDown={(e) => startHandleDrag(e, a, 'resize')}
                  className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white cursor-nwse-resize"
                />
              )}
            </div>
          );
        })}

      {/* Floating Text Selection Action Popover */}
      {textSelMenu && textSelMenu.pageNumber === page.pageNumber && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ left: `${textSelMenu.leftPx}px`, top: `${textSelMenu.topPx}px` }}
          className="absolute z-30 flex items-center gap-0.5 px-1.5 py-1 bg-slate-900 text-white rounded-lg shadow-xl border border-slate-700 text-[11px] whitespace-nowrap max-w-[calc(100%-16px)] overflow-x-auto scrollbar-none"
        >
          <button
            type="button"
            onClick={() => applySelectionMarkup('highlight')}
            title="Highlight"
            className="p-1.5 rounded hover:bg-slate-800 text-yellow-300"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applySelectionMarkup('underline')}
            title="Underline"
            className="p-1.5 rounded hover:bg-slate-800 text-sky-300"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applySelectionMarkup('strike')}
            title="Strikethrough"
            className="p-1.5 rounded hover:bg-slate-800 text-rose-300"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-slate-700 mx-0.5" />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(textSelMenu.selectedText);
              setTextSelMenu(null);
            }}
            title="Copy"
            className="p-1.5 rounded hover:bg-slate-800"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          {onReadAloudText && (
            <button
              type="button"
              onClick={() => {
                onReadAloudText(textSelMenu.selectedText);
                setTextSelMenu(null);
              }}
              title="Read Aloud"
              className="p-1.5 rounded hover:bg-slate-800"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onAskAIWithPage && (
            <button
              type="button"
              onClick={() => {
                onAskAIWithPage(
                  `Explain this excerpt clearly:\n"${textSelMenu.selectedText.slice(0, 600)}"`,
                  textSelMenu.selectedText
                );
                setTextSelMenu(null);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 font-medium"
            >
              <Sparkles className="w-3 h-3" /> AI
            </button>
          )}
        </div>
      )}

      {/* Inline Note / Text Box / Callout Editor */}
      {pendingNote && pendingNote.pageNumber === page.pageNumber && (
        <form
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            const val = pendingNote.text.trim();
            if (val) {
              if (pendingNote.editId) {
                updateAnnotations(
                  (prev) => prev.map((a) => (a.id === pendingNote.editId ? { ...a, text: val } : a)),
                  page.pageNumber
                );
              } else {
                const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const fillVal = toolDefaults?.fillColor && toolDefaults.fillColor !== 'transparent' ? toolDefaults.fillColor : undefined;
                updateAnnotations(
                  (prev) => [
                    ...prev,
                    {
                      id: newId,
                      pageNumber: page.pageNumber,
                      kind: pendingNote.kind,
                      x: pendingNote.x,
                      y: pendingNote.y,
                      x2: pendingNote.x2,
                      y2: pendingNote.y2,
                      color:
                        pendingNote.kind === 'text'
                          ? annColor === '#FACC15'
                            ? '#0F172A'
                            : annColor
                          : annColor === '#FACC15' && pendingNote.kind !== 'sticky'
                            ? '#2563EB'
                            : annColor,
                      fillColor: fillVal,
                      bgColor: fillVal,
                      strokeWidth: toolDefaults?.strokeWidth ?? 2,
                      strokeStyle: toolDefaults?.strokeStyle ?? 'solid',
                      borderRadius: toolDefaults?.borderRadius ?? 4,
                      opacity: toolDefaults?.opacity ?? 1,
                      fontSize: toolDefaults?.fontSize ?? 13,
                      fontFamily: toolDefaults?.fontFamily ?? 'DM Sans',
                      fontWeight: toolDefaults?.fontWeight ?? 'normal',
                      fontStyle: toolDefaults?.fontStyle ?? 'normal',
                      underline: toolDefaults?.underline ?? false,
                      textAlign: toolDefaults?.textAlign ?? 'left',
                      author: toolDefaults?.authorName || 'You',
                      text: val,
                      createdAt: Date.now(),
                    },
                  ],
                  page.pageNumber
                );
                onSelectAnn(newId);
                if (pendingNote.kind === 'text' || pendingNote.kind === 'callout') {
                  onSwitchToSelect?.();
                }
              }
            }
            setPendingNote(null);
          }}
          style={{
            left: `max(8px, min(${(pendingNote.x * 100).toFixed(1)}%, calc(100% - 248px)))`,
            top: `${Math.min(78, pendingNote.y * 100)}%`,
          }}
          className="absolute z-30 p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl flex flex-col gap-1.5 w-[min(240px,calc(100%-16px))]"
        >
          <textarea
            autoFocus
            rows={2}
            value={pendingNote.text}
            onChange={(e) => setPendingNote({ ...pendingNote, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              pendingNote.kind === 'sticky'
                ? 'Sticky note…'
                : pendingNote.kind === 'text'
                  ? 'Type text…'
                  : pendingNote.kind === 'callout'
                    ? 'Callout…'
                    : 'Comment…'
            }
            className="px-2 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 resize-none"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setPendingNote(null)}
              className="px-2.5 py-1 text-[11px] border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button type="submit" className="px-3 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
