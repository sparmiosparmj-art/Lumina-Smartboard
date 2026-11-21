import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  BookmarkPlus,
  BookMarked,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns2,
  Eye,
  FilePlus2,
  FileText,
  FolderOpen,
  FormInput,
  ImagePlus,
  Link2,
  Link2Off,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCw,
  Rows2,
  ScrollText,
  Search,
  Sun,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { PDFAnnotation } from '../../types/smartboard';
import type { LoadedPDFPage, PDFDocumentProxy, PDFFormWidget, PDFOutlineItem } from '../../utils/pdfPptx';
import { LivePDFPageCanvas, OfficialPDFTextLayer, OutlineBranch, renderAnnotationsToCanvas } from './PDFPageHelpers';

export type SidebarTabKind = 'pages' | 'outline' | 'notes' | 'forms';

/** Lazy-loaded thumbnail that only renders when scrolled into view */
const LazyThumbnail: React.FC<{
  page: LoadedPDFPage;
  isActive: boolean;
}> = ({ page, isActive }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Active page should always be visible
    if (isActive) {
      setIsVisible(true);
      wasVisibleRef.current = true;
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          wasVisibleRef.current = true;
        } else if (wasVisibleRef.current) {
          // Keep rendered once visible to avoid flicker on re-scroll
        } else {
          setIsVisible(false);
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isActive]);

  const aspectW = page.ptWidth || 595;
  const aspectH = page.ptHeight || 842;

  return (
    <div ref={ref}>
      {isVisible && page.dataUrl ? (
        <img src={page.dataUrl} alt={`Page ${page.pageNumber}`} className="w-full rounded border border-slate-200" />
      ) : (
        <div
          style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse"
        />
      )}
    </div>
  );
};

export const PDFSidebarRailAndDrawer: React.FC<{
  sidebarMode: 'expanded' | 'minimal' | 'hidden';
  setSidebarMode: (m: 'expanded' | 'minimal' | 'hidden') => void;
  sidebarWidth: number;
  onStartResize: (clientX: number) => void;
  sidebarTab: SidebarTabKind;
  setSidebarTab: (t: SidebarTabKind) => void;
  pages: LoadedPDFPage[];
  activePageNum: number;
  outline: PDFOutlineItem[];
  outlineFilter: string;
  setOutlineFilter: (val: string) => void;
  onAddCustomBookmark: (title: string) => void;
  onDeleteCustomBookmark: (title: string, pageNum: number | null) => void;
  onRenameCustomBookmark?: (oldTitle: string, pageNum: number | null, newTitle: string) => void;
  annotations: PDFAnnotation[];
  selectedAnnId: string | null;
  onSelectNote: (ann: PDFAnnotation) => void;
  onDeleteAnn: (id: string, pageNum: number) => void;
  onToggleResolveAnn: (id: string, pageNum: number) => void;
  widgetsByPage: Record<number, PDFFormWidget[]>;
  formValues: Record<string, string | boolean>;
  onChangeFormValue: (fieldName: string, value: string | boolean) => void;
  highlightFormFields?: boolean;
  onToggleHighlightFormFields?: () => void;
  onClearForms?: () => void;
  onFocusWidget?: (pageNumber: number, widgetId: string) => void;
  searchMatches: { pageNumber: number; snippet: string; count: number }[];
  activeMatchIdx: number;
  onGoToMatch: (idx: number) => void;
  onJumpToPage: (pageNum: number, recordHistory?: boolean) => void;
}> = ({
  sidebarMode,
  setSidebarMode,
  sidebarWidth,
  onStartResize,
  sidebarTab,
  setSidebarTab,
  pages,
  activePageNum,
  outline,
  outlineFilter,
  setOutlineFilter,
  onAddCustomBookmark,
  onDeleteCustomBookmark,
  onRenameCustomBookmark,
  annotations,
  selectedAnnId,
  onSelectNote,
  onDeleteAnn,
  onToggleResolveAnn,
  widgetsByPage,
  formValues,
  onChangeFormValue,
  highlightFormFields,
  onToggleHighlightFormFields,
  onClearForms,
  onFocusWidget,
  searchMatches,
  activeMatchIdx,
  onGoToMatch,
  onJumpToPage,
}) => {
  const [noteFilterKind, setNoteFilterKind] = useState<'all' | 'notes' | 'highlights' | 'shapes'>('all');
  const [noteFilterStatus, setNoteFilterStatus] = useState<'all' | 'open' | 'resolved'>('all');
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [addingBookmark, setAddingBookmark] = useState(false);
  const thumbListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sidebarMode !== 'expanded' || sidebarTab !== 'pages') return;
    const btn = thumbListRef.current?.querySelector(`[data-thumb-page="${activePageNum}"]`) as HTMLElement | null;
    if (btn) btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activePageNum, sidebarMode, sidebarTab]);

  const allWidgets = Object.entries(widgetsByPage).flatMap(([pStr, list]) =>
    list.map((w) => ({ pageNumber: Number(pStr), widget: w }))
  );

  const filteredNotes = annotations.filter((a) => {
    if (noteFilterKind === 'notes' && !['comment', 'sticky', 'text', 'callout'].includes(a.kind)) return false;
    if (noteFilterKind === 'highlights' && !['highlight', 'underline', 'strike'].includes(a.kind)) return false;
    if (noteFilterKind === 'shapes' && !['rect', 'circle', 'arrow', 'line', 'draw', 'highlighter_ink', 'measure', 'redact', 'stamp', 'image'].includes(a.kind)) return false;
    if (noteFilterStatus === 'open' && a.resolved) return false;
    if (noteFilterStatus === 'resolved' && !a.resolved) return false;
    return true;
  });

  if (sidebarMode === 'hidden') return null;

  if (sidebarMode === 'minimal') {
    return (
      <aside className="w-11 border-r border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-col items-center py-2 gap-1.5 shrink-0 z-20">
        <button
          type="button"
          onClick={() => setSidebarMode('expanded')}
          title="Expand Sidebar"
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
        <div className="w-6 h-px bg-slate-200 dark:bg-slate-800" />
        <button
          type="button"
          onClick={() => {
            setSidebarTab('pages');
            setSidebarMode('expanded');
          }}
          title="Pages"
          className={`p-2 rounded-lg transition-colors ${
            sidebarTab === 'pages' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setSidebarTab('outline');
            setSidebarMode('expanded');
          }}
          title="Outline"
          className={`p-2 rounded-lg transition-colors ${
            sidebarTab === 'outline' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BookMarked className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setSidebarTab('notes');
            setSidebarMode('expanded');
          }}
          title={`Notes (${annotations.length})`}
          className={`relative p-2 rounded-lg transition-colors ${
            sidebarTab === 'notes' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          {annotations.length > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-600" />}
        </button>
        {allWidgets.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSidebarTab('forms');
              setSidebarMode('expanded');
            }}
            title={`Forms (${allWidgets.length})`}
            className={`p-2 rounded-lg transition-colors ${
              sidebarTab === 'forms' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FormInput className="w-4 h-4" />
          </button>
        )}
        <div className="mt-auto">
          <button
            type="button"
            onClick={() => setSidebarMode('hidden')}
            title="Hide Sidebar"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <>
      <div onClick={() => setSidebarMode(window.innerWidth < 640 ? 'hidden' : 'minimal')} className="md:hidden fixed inset-0 z-30 bg-slate-950/35" />
      <aside
        style={{ width: `${sidebarWidth}px` }}
        className="fixed inset-y-0 left-0 z-40 md:static md:relative md:inset-auto md:z-auto max-w-[85vw] pb-safe md:pb-0 border-r border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex flex-col min-h-0 shrink-0 shadow-2xl md:shadow-none"
      >
        <div className="flex items-center gap-1 p-1.5 border-b border-slate-200/60 dark:border-slate-800/60 shrink-0">
          <div className={`flex-1 grid ${allWidgets.length > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-1 text-[11px] font-medium`}>
            {[
              { id: 'pages', label: 'Pages' },
              { id: 'outline', label: 'Outline' },
              { id: 'notes', label: `Notes (${annotations.length})` },
              ...(allWidgets.length > 0 ? [{ id: 'forms', label: `Forms (${allWidgets.length})` }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSidebarTab(tab.id as SidebarTabKind)}
                className={`py-1 px-1 rounded-lg transition-colors truncate ${
                  sidebarTab === tab.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSidebarMode(window.innerWidth < 640 ? 'hidden' : 'minimal')}
            title="Collapse Sidebar"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Outline Controls */}
        {sidebarTab === 'outline' && (
          <div className="px-2 pt-2 space-y-1.5 shrink-0">
            <div className="flex items-center gap-1">
              {outline.length > 4 && (
                <div className="relative flex-1">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    value={outlineFilter}
                    onChange={(e) => setOutlineFilter(e.target.value)}
                    placeholder="Filter…"
                    className="w-full pl-6 pr-5 py-1 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                  {outlineFilter && (
                    <button
                      type="button"
                      onClick={() => setOutlineFilter('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setBookmarkTitle(`Page ${activePageNum}`);
                  setAddingBookmark(true);
                }}
                title="Bookmark Current Page"
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 ml-auto shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-blue-600" />
                <span>Bookmark</span>
              </button>
            </div>

            {addingBookmark && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (bookmarkTitle.trim()) {
                    onAddCustomBookmark(bookmarkTitle.trim());
                    setAddingBookmark(false);
                    setBookmarkTitle('');
                  }
                }}
                className="flex items-center gap-1"
              >
                <input
                  autoFocus
                  value={bookmarkTitle}
                  onChange={(e) => setBookmarkTitle(e.target.value)}
                  placeholder="Bookmark title"
                  className="flex-1 px-2 py-1 text-[11px] rounded border border-blue-500 bg-slate-50 dark:bg-slate-950"
                />
                <button type="submit" className="px-2 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded">
                  Add
                </button>
              </form>
            )}
          </div>
        )}

        {/* Notes Filter Controls */}
        {sidebarTab === 'notes' && annotations.length > 0 && (
          <div className="px-2 pt-2 flex items-center gap-1 shrink-0">
            <select
              value={noteFilterKind}
              onChange={(e) => setNoteFilterKind(e.target.value as typeof noteFilterKind)}
              className="flex-1 px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="all">All Types</option>
              <option value="notes">Comments & Text</option>
              <option value="highlights">Highlights</option>
              <option value="shapes">Shapes & Ink</option>
            </select>
            <select
              value={noteFilterStatus}
              onChange={(e) => setNoteFilterStatus(e.target.value as typeof noteFilterStatus)}
              className="px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        )}

        <div ref={thumbListRef} className="flex-1 overflow-y-auto px-2 py-2.5 space-y-2 scrollbar-none">
          {sidebarTab === 'pages' && (
            <>
              {searchMatches.length > 0 && (
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] space-y-1">
                  {searchMatches.map((m, i) => (
                    <button
                      key={m.pageNumber}
                      type="button"
                      onClick={() => {
                        onGoToMatch(i);
                        if (window.innerWidth < 768) setSidebarMode(window.innerWidth < 640 ? 'hidden' : 'minimal');
                      }}
                      className={`block w-full text-left px-1.5 py-1 rounded ${
                        i === activeMatchIdx ? 'bg-amber-200/70 dark:bg-amber-900/50 font-medium' : 'hover:bg-amber-100/60'
                      }`}
                    >
                      <div className="flex justify-between font-mono text-[10px] text-amber-800 dark:text-amber-300">
                        <span>Page {m.pageNumber}</span>
                        <span>{m.count}</span>
                      </div>
                      <div className="truncate text-slate-700 dark:text-slate-200">{m.snippet}</div>
                    </button>
                  ))}
                </div>
              )}
              {pages.map((p) => {
                const pAnnCount = annotations.filter((a) => a.pageNumber === p.pageNumber).length;
                return (
                  <button
                    key={p.pageNumber}
                    data-thumb-page={p.pageNumber}
                    type="button"
                    onClick={() => {
                      onJumpToPage(p.pageNumber);
                      if (window.innerWidth < 768) setSidebarMode(window.innerWidth < 640 ? 'hidden' : 'minimal');
                    }}
                    className={`w-full p-1.5 rounded-lg border text-left transition-colors ${
                      p.pageNumber === activePageNum
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <LazyThumbnail page={p} isActive={p.pageNumber === activePageNum} />
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mt-1 text-slate-600 dark:text-slate-300 px-0.5">
                      <span>{p.pageNumber}</span>
                      {pAnnCount > 0 && <span className="text-blue-600">{pAnnCount}</span>}
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {sidebarTab === 'outline' &&
            (outline.length > 0 ? (
              <OutlineBranch
                items={outline}
                depth={0}
                activePageNum={activePageNum}
                filterQuery={outlineFilter}
                onJump={(pNum, rec) => {
                  onJumpToPage(pNum, rec);
                  if (window.innerWidth < 768) setSidebarMode(window.innerWidth < 640 ? 'hidden' : 'minimal');
                }}
                onDeleteCustom={onDeleteCustomBookmark}
                onRenameCustom={onRenameCustomBookmark}
              />
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                <BookMarked className="w-6 h-6 mx-auto mb-1.5 opacity-50" />
                No bookmarks
              </div>
            ))}

          {sidebarTab === 'notes' &&
            (filteredNotes.length > 0 ? (
              <div className="space-y-1.5">
                {filteredNotes.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => {
                      onSelectNote(a);
                      if (window.innerWidth < 768) setSidebarMode(window.innerWidth < 640 ? 'hidden' : 'minimal');
                    }}
                    className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                      selectedAnnId === a.id
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                        <span className="font-medium capitalize text-slate-700 dark:text-slate-200">
                          {a.kind.replace('_', ' ')}
                        </span>
                        {a.replies && a.replies.length > 0 && (
                          <span className="text-[10px] font-mono text-blue-600">+{a.replies.length}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono tabular-nums text-slate-400">p.{a.pageNumber}</span>
                        {(a.kind === 'comment' || a.kind === 'sticky') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleResolveAnn(a.id, a.pageNumber);
                            }}
                            title={a.resolved ? 'Reopen' : 'Resolve'}
                            className={`p-0.5 rounded ${a.resolved ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`}
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteAnn(a.id, a.pageNumber);
                          }}
                          className="p-0.5 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {a.text && !a.text.startsWith('data:image/') && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">{a.text}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">No annotations</div>
            ))}

          {sidebarTab === 'forms' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {onToggleHighlightFormFields && (
                  <button
                    type="button"
                    onClick={onToggleHighlightFormFields}
                    className={`flex-1 py-1 px-2 text-[11px] rounded-lg border ${
                      highlightFormFields
                        ? 'border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950/50 font-medium'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Highlight Fields
                  </button>
                )}
                {onClearForms && (
                  <button
                    type="button"
                    onClick={onClearForms}
                    className="py-1 px-2 text-[11px] rounded-lg border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    Reset
                  </button>
                )}
              </div>
              {allWidgets.map(({ pageNumber, widget }) => {
                const cur = formValues[widget.fieldName] !== undefined ? formValues[widget.fieldName] : widget.defaultValue;
                return (
                  <div
                    key={widget.id}
                    onClick={() => {
                      if (onFocusWidget) onFocusWidget(pageNumber, widget.id);
                      else onJumpToPage(pageNumber);
                      if (window.innerWidth < 768) setSidebarMode(window.innerWidth < 640 ? 'hidden' : 'minimal');
                    }}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1 text-xs cursor-pointer hover:border-blue-400"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium truncate text-slate-700 dark:text-slate-200">{widget.fieldName}</span>
                      <span className="font-mono text-slate-400">p.{pageNumber}</span>
                    </div>
                    {widget.fieldType === 'checkbox' ? (
                      <label className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={Boolean(cur)}
                          onChange={(e) => onChangeFormValue(widget.fieldName, e.target.checked)}
                          className="accent-blue-600"
                        />
                        <span className="text-[11px] text-slate-500">{Boolean(cur) ? 'Checked' : 'Unchecked'}</span>
                      </label>
                    ) : (
                      <input
                        type="text"
                        value={String(cur || '')}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onChangeFormValue(widget.fieldName, e.target.value)}
                        className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          onPointerDown={(e) => onStartResize(e.clientX)}
          title="Drag to resize"
          className="hidden md:block absolute top-0 bottom-0 -right-0.5 w-1.5 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-600/60 transition-colors"
        />
      </aside>
    </>
  );
};

export const PDFPageOrganizerGrid: React.FC<{
  pages: LoadedPDFPage[];
  activePageNum: number;
  selectedOrgPages: Set<number>;
  setSelectedOrgPages: React.Dispatch<React.SetStateAction<Set<number>>>;
  onManipulate: (
    action: 'rotate' | 'delete' | 'extract' | 'split' | 'duplicate' | 'insert_blank' | 'reorder',
    indicesZeroBased?: number[],
    rotateDeg?: number,
    reorderTargetIdx?: number
  ) => void;
  onInsertImagePages: (files: FileList) => void;
  onJumpToPage: (pageNum: number) => void;
  onDone: () => void;
}> = ({
  pages,
  activePageNum,
  selectedOrgPages,
  setSelectedOrgPages,
  onManipulate,
  onInsertImagePages,
  onJumpToPage,
  onDone,
}) => {
  const [dragPageIdx, setDragPageIdx] = useState<number | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100 dark:bg-slate-950">
      <input
        ref={imgInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onInsertImagePages(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 dark:text-slate-100">Pages ({pages.length})</span>
          <button
            type="button"
            onClick={() => {
              if (selectedOrgPages.size === pages.length) setSelectedOrgPages(new Set());
              else setSelectedOrgPages(new Set(pages.map((p) => p.pageNumber)));
            }}
            className="px-2 py-0.5 text-[11px] rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {selectedOrgPages.size === pages.length ? 'Clear' : 'Select All'}
          </button>
          {selectedOrgPages.size > 0 && (
            <span className="text-blue-600 font-mono tabular-nums">{selectedOrgPages.size} selected</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={selectedOrgPages.size === 0}
            onClick={() => onManipulate('rotate', Array.from(selectedOrgPages).map((n) => n - 1), -90)}
            className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            Rotate Left
          </button>
          <button
            type="button"
            disabled={selectedOrgPages.size === 0}
            onClick={() => onManipulate('rotate', Array.from(selectedOrgPages).map((n) => n - 1), 90)}
            className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            Rotate Right
          </button>
          <button
            type="button"
            disabled={selectedOrgPages.size !== 1}
            onClick={() => {
              const pNum = Array.from(selectedOrgPages)[0];
              if (pNum) onManipulate('duplicate', [pNum - 1]);
            }}
            className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => onManipulate('insert_blank', [activePageNum - 1])}
            className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FilePlus2 className="w-3.5 h-3.5" /> Blank Page
          </button>
          <button
            type="button"
            onClick={() => imgInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ImagePlus className="w-3.5 h-3.5" /> Add Image
          </button>
          <button
            type="button"
            disabled={selectedOrgPages.size === 0}
            onClick={() =>
              onManipulate(
                'extract',
                Array.from(selectedOrgPages)
                  .sort((a, b) => a - b)
                  .map((n) => n - 1)
              )
            }
            className="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            Extract
          </button>
          <button
            type="button"
            disabled={selectedOrgPages.size === 0 || selectedOrgPages.size >= pages.length}
            onClick={() => onManipulate('delete', Array.from(selectedOrgPages).map((n) => n - 1))}
            className="px-2.5 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onDone}
            className="px-3 py-1 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 scrollbar-none grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 content-start">
        {pages.map((p, idx) => {
          const isChecked = selectedOrgPages.has(p.pageNumber);
          return (
            <div
              key={p.pageNumber}
              draggable
              onDragStart={() => setDragPageIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragPageIdx !== null && dragPageIdx !== idx) {
                  onManipulate('reorder', [dragPageIdx], 90, idx);
                }
                setDragPageIdx(null);
              }}
              onClick={() => {
                setSelectedOrgPages((prev) => {
                  const next = new Set(prev);
                  if (next.has(p.pageNumber)) next.delete(p.pageNumber);
                  else next.add(p.pageNumber);
                  return next;
                });
              }}
              onDoubleClick={() => {
                onDone();
                onJumpToPage(p.pageNumber);
              }}
              className={`group relative bg-white dark:bg-slate-900 rounded-xl border p-2 cursor-pointer transition-all ${
                isChecked
                  ? 'border-blue-600 ring-2 ring-blue-500/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-blue-400'
              }`}
            >
              <div className="absolute top-3 left-3 z-10 w-5 h-5 rounded-lg border flex items-center justify-center bg-white/90 dark:bg-slate-900/90 border-slate-300">
                {isChecked && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </div>
              {p.dataUrl ? (
                <img src={p.dataUrl} alt={`Page ${p.pageNumber}`} className="w-full rounded border border-slate-200 pointer-events-none" />
              ) : (
                <div
                  style={{ aspectRatio: `${p.ptWidth || 595} / ${p.ptHeight || 842}` }}
                  className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse"
                />
              )}
              <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span>Page {p.pageNumber}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onManipulate('reorder', [idx], 90, idx - 1);
                    }}
                    title="Move Left"
                    className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === pages.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onManipulate('reorder', [idx], 90, idx + 1);
                    }}
                    title="Move Right"
                    className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onManipulate('rotate', [idx], 90);
                    }}
                    title="Rotate 90°"
                    className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SplitAnnotationOverlay: React.FC<{
  pageAnns: PDFAnnotation[];
  displayWidthPx: number;
  ptWidth: number;
  ptHeight: number;
}> = ({ pageAnns, displayWidthPx, ptWidth, ptHeight }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pageAnns.length === 0) return;
    const scale = Math.min(2, window.devicePixelRatio || 1.5);
    const cw = Math.max(100, Math.round(displayWidthPx * scale));
    const ch = Math.max(100, Math.round(displayWidthPx * (ptHeight / Math.max(1, ptWidth)) * scale));
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    void renderAnnotationsToCanvas(ctx, pageAnns, cw, ch, ptWidth, ptHeight);
  }, [pageAnns, displayWidthPx, ptWidth, ptHeight]);

  if (pageAnns.length === 0) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />;
};

export const PDFSplitComparePane: React.FC<{
  tabs: { id: string; fileName: string; doc: PDFDocumentProxy; pages: LoadedPDFPage[]; meta?: { fileId: string } | null }[];
  activeTabId: string;
  refTabId: string;
  onChangeRefTabId: (id: string) => void;
  refPageNum: number;
  onChangeRefPageNum: (n: number) => void;
  syncScroll: boolean;
  onToggleSyncScroll: () => void;
  splitOrientation: 'vertical' | 'horizontal';
  onToggleSplitOrientation: () => void;
  onSwapTabs: () => void;
  onOpenFileInSplit: (file: File) => void;
  workspacePdfs: { fileId: string; fileName: string }[];
  onOpenWorkspacePdfInSplit: (fileId: string) => void;
  getTabAnnotations: (tabId: string) => PDFAnnotation[];
  readerTheme: 'light' | 'sepia' | 'dark';
  mainViewerRef: React.RefObject<HTMLDivElement | null>;
  splitScrollElRef: React.MutableRefObject<HTMLDivElement | null>;
  syncScrollSourceRef: React.MutableRefObject<'main' | 'split' | null>;
  mainActivePageNum: number;
  onSyncMainPage: (pageNum: number) => void;
  onClose: () => void;
}> = ({
  tabs,
  activeTabId,
  refTabId,
  onChangeRefTabId,
  refPageNum,
  onChangeRefPageNum,
  syncScroll,
  onToggleSyncScroll,
  splitOrientation,
  onToggleSplitOrientation,
  onSwapTabs,
  onOpenFileInSplit,
  workspacePdfs,
  onOpenWorkspacePdfInSplit,
  getTabAnnotations,
  readerTheme,
  mainViewerRef,
  splitScrollElRef,
  syncScrollSourceRef,
  mainActivePageNum,
  onSyncMainPage,
  onClose,
}) => {
  const paneRef = useRef<HTMLDivElement>(null);
  const splitFileInputRef = useRef<HTMLInputElement>(null);
  const splitPageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const programmaticScrollUntilRef = useRef(0);
  const [paneWidth, setPaneWidth] = useState(460);
  const [zoomMul, setZoomMul] = useState(1);
  const [splitLayout, setSplitLayout] = useState<'scroll' | 'single'>('scroll');
  const [pageDraft, setPageDraft] = useState(String(refPageNum));

  const [compareMode, setCompareMode] = useState(false);
  const [similarity, setSimilarity] = useState<number | null>(null);
  const compareCanvasRef = useRef<HTMLCanvasElement>(null);

  const refTab = tabs.find((t) => t.id === refTabId) || tabs[0];
  const clampedPageNum = refTab ? Math.max(1, Math.min(refTab.pages.length || 1, refPageNum)) : 1;

  useEffect(() => {
    setPageDraft(String(clampedPageNum));
  }, [clampedPageNum]);

  useEffect(() => {
    splitScrollElRef.current = paneRef.current;
    return () => {
      splitScrollElRef.current = null;
    };
  }, [splitScrollElRef]);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const pad = entry.contentRect.width < 460 ? 20 : 36;
        const w = Math.max(200, Math.floor(entry.contentRect.width) - pad);
        setPaneWidth((prev) => (Math.abs(prev - w) >= 2 ? w : prev));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync split pane scroll position when main changes page in sync mode
  const prevSyncedMainPageRef = useRef(mainActivePageNum);
  const lastSplitScrollAtRef = useRef(0);
  const splitSyncCooldownUntilRef = useRef(0);
  useEffect(() => {
    if (!syncScroll || !refTab) {
      prevSyncedMainPageRef.current = mainActivePageNum;
      return;
    }
    if (prevSyncedMainPageRef.current !== mainActivePageNum) {
      prevSyncedMainPageRef.current = mainActivePageNum;
      if (syncScrollSourceRef.current === 'split' || Date.now() - lastSplitScrollAtRef.current < 350) return;
      const target = Math.max(1, Math.min(refTab.pages.length || 1, mainActivePageNum));
      if (target !== clampedPageNum) onChangeRefPageNum(target);
      if (splitLayout === 'scroll') {
        const paneEl = paneRef.current;
        const targetEl = splitPageRefs.current[target];
        if (paneEl && targetEl) {
          const pRect = paneEl.getBoundingClientRect();
          const tRect = targetEl.getBoundingClientRect();
          const alreadyInView = tRect.bottom > pRect.top + 24 && tRect.top < pRect.bottom - 24;
          if (!alreadyInView) {
            programmaticScrollUntilRef.current = Date.now() + 450;
            requestAnimationFrame(() => {
              splitPageRefs.current[target]?.scrollIntoView({ block: 'start', behavior: 'auto' });
            });
          }
        }
      }
    }
  }, [mainActivePageNum, syncScroll, refTab, clampedPageNum, splitLayout, onChangeRefPageNum, syncScrollSourceRef]);

  if (!refTab) return null;

  // --- Visual diff comparison logic ---
  const mainTab = tabs.find((t) => t.id === activeTabId);
  const mainPage = mainTab?.pages.find((p) => p.pageNumber === mainActivePageNum);
  const splitPage = refTab.pages.find((p) => p.pageNumber === clampedPageNum);

  const runCompare = useCallback(() => {
    if (!compareMode || !mainPage?.dataUrl || !splitPage?.dataUrl) {
      setSimilarity(null);
      return;
    }
    const canvas = compareCanvasRef.current;
    if (!canvas) return;
    const imgA = new Image();
    const imgB = new Image();
    let loaded = 0;
    const onBothLoaded = () => {
      loaded++;
      if (loaded < 2) return;
      const w = Math.max(imgA.naturalWidth, imgB.naturalWidth, 1);
      const h = Math.max(imgA.naturalHeight, imgB.naturalHeight, 1);
      canvas.width = w;
      canvas.height = h;
      const offA = document.createElement('canvas');
      offA.width = w;
      offA.height = h;
      const ctxA = offA.getContext('2d', { willReadFrequently: true })!;
      ctxA.drawImage(imgA, 0, 0, w, h);
      const offB = document.createElement('canvas');
      offB.width = w;
      offB.height = h;
      const ctxB = offB.getContext('2d', { willReadFrequently: true })!;
      ctxB.drawImage(imgB, 0, 0, w, h);
      const dataA = ctxA.getImageData(0, 0, w, h);
      const dataB = ctxB.getImageData(0, 0, w, h);
      const out = canvas.getContext('2d')!;
      const outData = out.createImageData(w, h);
      let same = 0;
      const total = w * h;
      const threshold = 30; // per-channel tolerance
      for (let i = 0; i < total; i++) {
        const idx = i * 4;
        const dr = Math.abs(dataA.data[idx] - dataB.data[idx]);
        const dg = Math.abs(dataA.data[idx + 1] - dataB.data[idx + 1]);
        const db = Math.abs(dataA.data[idx + 2] - dataB.data[idx + 2]);
        if (dr <= threshold && dg <= threshold && db <= threshold) {
          same++;
          // Show original pixel dimmed
          outData.data[idx] = dataB.data[idx];
          outData.data[idx + 1] = dataB.data[idx + 1];
          outData.data[idx + 2] = dataB.data[idx + 2];
          outData.data[idx + 3] = 40;
        } else {
          // Highlight diff in red
          outData.data[idx] = 220;
          outData.data[idx + 1] = 38;
          outData.data[idx + 2] = 38;
          outData.data[idx + 3] = 160;
        }
      }
      out.putImageData(outData, 0, 0);
      setSimilarity(total > 0 ? Math.round((same / total) * 1000) / 10 : 100);
    };
    imgA.onload = onBothLoaded;
    imgB.onload = onBothLoaded;
    imgA.src = mainPage.dataUrl;
    imgB.src = splitPage.dataUrl;
  }, [compareMode, mainPage?.dataUrl, splitPage?.dataUrl]);

  useEffect(() => {
    runCompare();
  }, [runCompare]);

  const jumpSplitToPage = (nextPage: number, userTriggered = true) => {
    const clamped = Math.max(1, Math.min(refTab.pages.length || 1, nextPage));
    onChangeRefPageNum(clamped);
    if (userTriggered && syncScroll) {
      syncScrollSourceRef.current = 'split';
      splitSyncCooldownUntilRef.current = performance.now() + 90;
      onSyncMainPage(clamped);
      window.setTimeout(() => {
        if (syncScrollSourceRef.current === 'split') syncScrollSourceRef.current = null;
      }, 90);
    }
    if (splitLayout === 'scroll') {
      programmaticScrollUntilRef.current = Date.now() + 500;
      requestAnimationFrame(() => {
        splitPageRefs.current[clamped]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    } else if (paneRef.current) {
      paneRef.current.scrollTop = 0;
    }
  };

  const handlePaneScroll = () => {
    const el = paneRef.current;
    if (!el) return;

    if (Date.now() >= programmaticScrollUntilRef.current && syncScrollSourceRef.current !== 'main') {
      lastSplitScrollAtRef.current = Date.now();
    }

    if (
      syncScroll &&
      syncScrollSourceRef.current !== 'main' &&
      performance.now() >= splitSyncCooldownUntilRef.current &&
      mainViewerRef.current
    ) {
      const mEl = mainViewerRef.current;
      const maxSplitY = Math.max(0, el.scrollHeight - el.clientHeight);
      const maxSplitX = Math.max(0, el.scrollWidth - el.clientWidth);
      const maxMainY = Math.max(0, mEl.scrollHeight - mEl.clientHeight);
      const maxMainX = Math.max(0, mEl.scrollWidth - mEl.clientWidth);
      const targetY = maxSplitY > 0 && maxMainY > 0 ? (el.scrollTop / maxSplitY) * maxMainY : mEl.scrollTop;
      const targetX = maxSplitX > 0 && maxMainX > 0 ? (el.scrollLeft / maxSplitX) * maxMainX : mEl.scrollLeft;
      if (Math.abs(targetY - mEl.scrollTop) >= 1.5 || Math.abs(targetX - mEl.scrollLeft) >= 1.5) {
        syncScrollSourceRef.current = 'split';
        if (maxSplitY > 0 && maxMainY > 0) mEl.scrollTop = targetY;
        if (maxSplitX > 0 && maxMainX > 0) mEl.scrollLeft = targetX;
        window.setTimeout(() => {
          if (syncScrollSourceRef.current === 'split') syncScrollSourceRef.current = null;
        }, 70);
      }
    }

    if (splitLayout !== 'scroll' || Date.now() < programmaticScrollUntilRef.current) return;
    const rootRect = el.getBoundingClientRect();
    const midY = rootRect.top + rootRect.height * 0.35;
    let bestPage = clampedPageNum;
    let bestDist = Infinity;
    for (const pg of refTab.pages) {
      const pEl = splitPageRefs.current[pg.pageNumber];
      if (!pEl) continue;
      const r = pEl.getBoundingClientRect();
      if (r.bottom < rootRect.top || r.top > rootRect.bottom) continue;
      const inside = r.top <= midY && r.bottom >= midY;
      const dist = inside ? 0 : Math.abs((r.top + r.bottom) / 2 - midY);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = pg.pageNumber;
        if (inside) break;
      }
    }
    if (bestPage !== clampedPageNum) {
      onChangeRefPageNum(bestPage);
    }
  };

  const imgFilter =
    readerTheme === 'dark' ? 'brightness-[0.86] contrast-[1.06]' : readerTheme === 'sepia' ? 'sepia-[.20] brightness-[0.97]' : '';
  const displayWidthPx = Math.max(200, Math.round(paneWidth * zoomMul));
  const pagesToRender =
    splitLayout === 'single'
      ? [refTab.pages.find((p) => p.pageNumber === clampedPageNum) || refTab.pages[0]].filter((x): x is LoadedPDFPage => Boolean(x))
      : refTab.pages;
  const tabAnns = getTabAnnotations(refTab.id);
  const unopenedWorkspacePdfs = workspacePdfs.filter((wf) => !tabs.some((t) => t.meta?.fileId === wf.fileId));

  return (
    <div className="flex-1 flex flex-col bg-slate-200/50 dark:bg-slate-950 min-w-0 min-h-0 overflow-hidden">
      <input
        ref={splitFileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onOpenFileInSplit(f);
        }}
      />

      <div className="h-9 px-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1.5 text-xs shrink-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 min-w-0 shrink-0">
          <select
            value={refTab.id}
            onChange={(e) => {
              const val = e.target.value;
              if (val.startsWith('__ws__:')) {
                onOpenWorkspacePdfInSplit(val.slice(7));
              } else {
                onChangeRefTabId(val);
              }
            }}
            className="max-w-[130px] sm:max-w-[155px] px-1.5 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 truncate"
          >
            {tabs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fileName}
                {t.id === activeTabId ? ' (Active)' : ''}
              </option>
            ))}
            {unopenedWorkspacePdfs.length > 0 && (
              <optgroup label="Workspace PDFs">
                {unopenedWorkspacePdfs.map((wf) => (
                  <option key={wf.fileId} value={`__ws__:${wf.fileId}`}>
                    + {wf.fileName}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            onClick={() => splitFileInputRef.current?.click()}
            title="Open PDF in Split Pane"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 font-mono tabular-nums text-[11px] shrink-0">
          <button
            type="button"
            disabled={clampedPageNum <= 1}
            onClick={() => jumpSplitToPage(clampedPageNum - 1)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              jumpSplitToPage(Number(pageDraft) || 1);
            }}
            className="flex items-center gap-1"
          >
            <input
              type="number"
              min={1}
              max={refTab.pages.length}
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value)}
              className="w-9 px-1 py-0.5 text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded text-[11px]"
            />
            <span className="text-slate-400">/ {refTab.pages.length}</span>
          </form>
          <button
            type="button"
            disabled={clampedPageNum >= refTab.pages.length}
            onClick={() => jumpSplitToPage(clampedPageNum + 1)}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setSplitLayout((l) => (l === 'scroll' ? 'single' : 'scroll'))}
            title={splitLayout === 'scroll' ? 'Continuous Scroll (Click for Single Page)' : 'Single Page (Click for Scroll)'}
            className={`p-1 rounded ${splitLayout === 'scroll' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            {splitLayout === 'scroll' ? <ScrollText className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setZoomMul((z) => Math.max(0.45, Number((z - 0.15).toFixed(2))))}
            title="Zoom Out"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setZoomMul(1)}
            title="Fit Width"
            className="px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300"
          >
            {Math.round(zoomMul * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoomMul((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
            title="Zoom In"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <Plus className="w-3 h-3" />
          </button>
          <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <button
            type="button"
            onClick={onToggleSplitOrientation}
            title={splitOrientation === 'vertical' ? 'Switch to Top / Bottom Split' : 'Switch to Side-by-Side Split'}
            className="hidden sm:inline-flex p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {splitOrientation === 'vertical' ? <Rows2 className="w-3.5 h-3.5" /> : <Columns2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onSwapTabs}
            title="Swap Left & Right Views"
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setCompareMode((v) => !v); if (compareMode) setSimilarity(null); }}
            title={compareMode ? 'Disable Visual Compare' : 'Compare pages visually (highlight differences)'}
            className={`p-1 rounded flex items-center gap-0.5 ${compareMode ? 'bg-red-50 text-red-600 dark:bg-red-950/50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <Eye className="w-3.5 h-3.5" />
            {compareMode && similarity !== null && (
              <span className="text-[10px] font-mono font-semibold">{similarity}%</span>
            )}
          </button>
          <button
            type="button"
            onClick={onToggleSyncScroll}
            title={syncScroll ? 'Sync Scroll On' : 'Sync Scroll Off'}
            className={`p-1 rounded-lg transition-colors ${syncScroll ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            {syncScroll ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={onClose} title="Close Split View" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={paneRef}
        onScroll={handlePaneScroll}
        className={`flex-1 overflow-auto p-3 sm:p-4 scrollbar-none ${
          readerTheme === 'dark' ? 'bg-slate-900' : readerTheme === 'sepia' ? 'bg-amber-50/75' : ''
        }`}
      >
        <div className="min-w-fit w-fit mx-auto flex flex-col items-center gap-4">
          {pagesToRender.map((pg) => {
            const isMountedFull = splitLayout === 'single' || Math.abs(pg.pageNumber - clampedPageNum) <= 2;
            const aspectW = pg.ptWidth || pg.width || 595;
            const aspectH = pg.ptHeight || pg.height || 842;
            const pageAnns = tabAnns.filter((a) => a.pageNumber === pg.pageNumber);
            return (
              <div
                key={pg.pageNumber}
                ref={(el) => {
                  splitPageRefs.current[pg.pageNumber] = el;
                }}
                style={{ width: `${displayWidthPx}px` }}
                className="relative shadow-lg border border-slate-300 dark:border-slate-700 bg-white shrink-0"
              >
                {isMountedFull ? (
                  <>
                    <LivePDFPageCanvas pdfDoc={refTab.doc} page={pg} displayWidthPx={displayWidthPx} className={imgFilter} />
                    <SplitAnnotationOverlay pageAnns={pageAnns} displayWidthPx={displayWidthPx} ptWidth={aspectW} ptHeight={aspectH} />
                    <OfficialPDFTextLayer pdfDoc={refTab.doc} page={pg} displayWidthPx={displayWidthPx} interactive />
                  </>
                ) : (
                  <div className="relative w-full bg-white flex items-center justify-center" style={{ aspectRatio: `${aspectW} / ${aspectH}` }}>
                    {pg.dataUrl ? (
                      <img src={pg.dataUrl} alt={`Page ${pg.pageNumber}`} className={`w-full h-full object-contain ${imgFilter}`} />
                    ) : (
                      <span className="text-xs font-mono text-slate-400">Page {pg.pageNumber}</span>
                    )}
                  </div>
                )}
                {compareMode && pg.pageNumber === clampedPageNum && (
                  <canvas
                    ref={compareCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none z-20"
                    style={{ mixBlendMode: 'multiply' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const PDFReaderModeHud: React.FC<{
  activePageNum: number;
  pages: LoadedPDFPage[];
  outline: PDFOutlineItem[];
  layoutMode: 'single' | 'scroll' | 'spread';
  setLayoutMode: (m: 'single' | 'scroll' | 'spread') => void;
  spreadCoverPage: boolean;
  readerTheme: 'light' | 'sepia' | 'dark';
  setReaderTheme: (t: 'light' | 'sepia' | 'dark') => void;
  effectiveZoomScale: number;
  stepZoom: (delta: number) => void;
  toggleFit: () => void;
  linkHistory: number[];
  onJumpBack: () => void;
  pageJumpInput: string;
  setPageJumpInput: (v: string) => void;
  onJumpToPage: (p: number, recordHistory?: boolean) => void;
  autoScrollActive: boolean;
  setAutoScrollActive: React.Dispatch<React.SetStateAction<boolean>>;
  autoScrollSpeed: number;
  setAutoScrollSpeed: (s: number) => void;
  readerHudVisible: boolean;
  readerHudPinned: boolean;
  setReaderHudPinned: (v: boolean) => void;
  pingReaderHud: () => void;
  readerOutlineOpen: boolean;
  setReaderOutlineOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  readerSpeechPlaying: boolean;
  readerSpeechProgress: { pageNumber: number; charIndex: number } | null;
  onToggleReadAloud: () => void;
  onExit: () => void;
}> = ({
  activePageNum,
  pages,
  outline,
  layoutMode,
  setLayoutMode,
  spreadCoverPage,
  readerTheme,
  setReaderTheme,
  effectiveZoomScale,
  stepZoom,
  toggleFit,
  linkHistory,
  onJumpBack,
  pageJumpInput,
  setPageJumpInput,
  onJumpToPage,
  autoScrollActive,
  setAutoScrollActive,
  autoScrollSpeed,
  setAutoScrollSpeed,
  readerHudVisible,
  readerHudPinned,
  setReaderHudPinned,
  pingReaderHud,
  readerOutlineOpen,
  setReaderOutlineOpen,
  fullscreen,
  toggleFullscreen,
  readerSpeechPlaying,
  readerSpeechProgress,
  onToggleReadAloud,
  onExit,
}) => (
  <>
    {/* Side Prev/Next Arrows */}
    {layoutMode !== 'scroll' && (
      <>
        <button
          type="button"
          disabled={activePageNum <= 1}
          onClick={() => onJumpToPage(activePageNum - (layoutMode === 'spread' ? (spreadCoverPage && activePageNum === 2 ? 1 : 2) : 1))}
          title="Previous Page"
          className={`hidden sm:flex fixed left-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full items-center justify-center bg-white/85 dark:bg-slate-900/85 glass-chrome border border-slate-200/80 dark:border-slate-700/80 shadow-lg text-slate-700 dark:text-slate-200 hover:scale-105 transition-all disabled:opacity-0 disabled:pointer-events-none ${
            readerHudVisible || readerHudPinned ? 'opacity-90' : 'opacity-25 hover:opacity-100'
          }`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          disabled={activePageNum >= pages.length}
          onClick={() => onJumpToPage(activePageNum + (layoutMode === 'spread' ? (spreadCoverPage && activePageNum === 1 ? 1 : 2) : 1))}
          title="Next Page"
          className={`hidden sm:flex fixed right-3 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full items-center justify-center bg-white/85 dark:bg-slate-900/85 glass-chrome border border-slate-200/80 dark:border-slate-700/80 shadow-lg text-slate-700 dark:text-slate-200 hover:scale-105 transition-all disabled:opacity-0 disabled:pointer-events-none ${
            readerHudVisible || readerHudPinned ? 'opacity-90' : 'opacity-25 hover:opacity-100'
          }`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </>
    )}

    {/* Slide-over Outline Drawer */}
    {readerOutlineOpen && (
      <>
        <div onClick={() => setReaderOutlineOpen(false)} className="fixed inset-0 z-40 bg-slate-950/30" />
        <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
          <div className="h-11 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-semibold">
            <span>{outline.length > 0 ? 'Outline' : 'Pages'}</span>
            <button
              type="button"
              onClick={() => setReaderOutlineOpen(false)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 scrollbar-none">
            {outline.length > 0 ? (
              <OutlineBranch
                items={outline}
                depth={0}
                activePageNum={activePageNum}
                onJump={(pNum, rec) => {
                  onJumpToPage(pNum, rec);
                  setReaderOutlineOpen(false);
                }}
              />
            ) : (
              <div className="space-y-1">
                {pages.map((p) => (
                  <button
                    key={p.pageNumber}
                    type="button"
                    onClick={() => {
                      onJumpToPage(p.pageNumber);
                      setReaderOutlineOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 rounded-lg text-left text-xs font-mono ${
                      p.pageNumber === activePageNum
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 font-semibold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Page {p.pageNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    )}

    {/* Auto-Hiding Bottom Floating HUD */}
    <div
      onMouseEnter={() => setReaderHudPinned(true)}
      onMouseLeave={() => {
        setReaderHudPinned(false);
        pingReaderHud();
      }}
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] overflow-x-auto scrollbar-none flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-white/92 dark:bg-slate-900/92 glass-chrome border border-slate-200/90 dark:border-slate-700/90 shadow-2xl text-xs transition-all duration-200 ${
        readerHudVisible || readerHudPinned || readerOutlineOpen || autoScrollActive
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-3 pointer-events-none'
      }`}
    >
      {linkHistory.length > 0 && (
        <>
          <button
            type="button"
            onClick={onJumpBack}
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] shrink-0"
            title="Back"
          >
            <ArrowLeft className="w-3 h-3" /> p.{linkHistory[linkHistory.length - 1]}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />
        </>
      )}

      <button
        type="button"
        disabled={activePageNum <= 1}
        onClick={() => onJumpToPage(activePageNum - (layoutMode === 'spread' ? (spreadCoverPage && activePageNum === 2 ? 1 : 2) : 1))}
        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 shrink-0"
        title="Previous Page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onJumpToPage(Number(pageJumpInput) || 1);
        }}
        className="flex items-center gap-1 font-mono tabular-nums shrink-0"
      >
        <input
          type="number"
          min={1}
          max={pages.length}
          value={pageJumpInput}
          onChange={(e) => setPageJumpInput(e.target.value)}
          className="w-10 px-1 py-0.5 text-center bg-slate-100 dark:bg-slate-800 rounded text-xs"
        />
        <span className="text-slate-400">/ {pages.length}</span>
      </form>
      <button
        type="button"
        disabled={activePageNum >= pages.length}
        onClick={() => onJumpToPage(activePageNum + (layoutMode === 'spread' ? (spreadCoverPage && activePageNum === 1 ? 1 : 2) : 1))}
        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 shrink-0"
        title="Next Page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

      {[
        { id: 'single', icon: BookOpen, title: 'Single' },
        { id: 'scroll', icon: ScrollText, title: 'Scroll' },
        { id: 'spread', icon: Columns2, title: 'Spread' },
      ].map((m) => {
        const Icon = m.icon;
        return (
          <button
            key={m.id}
            type="button"
            title={m.title}
            onClick={() => setLayoutMode(m.id as typeof layoutMode)}
            className={`p-1.5 rounded-lg shrink-0 ${
              layoutMode === m.id ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}

      {/* Smooth Auto-Scroll Teleprompter */}
      <button
        type="button"
        onClick={() => {
          if (layoutMode !== 'scroll') setLayoutMode('scroll');
          setAutoScrollActive((v) => !v);
        }}
        title={autoScrollActive ? 'Pause Auto-Scroll' : 'Auto-Scroll'}
        className={`flex items-center gap-0.5 p-1.5 rounded-lg shrink-0 ${
          autoScrollActive ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        {autoScrollActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      {autoScrollActive && (
        <button
          type="button"
          onClick={() => setAutoScrollSpeed(autoScrollSpeed >= 5 ? 1 : autoScrollSpeed + 1)}
          title="Auto-Scroll Speed"
          className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] shrink-0"
        >
          {autoScrollSpeed}x
        </button>
      )}

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

      <button type="button" onClick={() => stepZoom(-0.15)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0" title="Zoom Out">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={toggleFit} className="px-1.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-mono tabular-nums text-[11px] shrink-0">
        {Math.round(effectiveZoomScale * 100)}%
      </button>
      <button type="button" onClick={() => stepZoom(0.15)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0" title="Zoom In">
        <Plus className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

      <div className="flex items-center gap-1 px-1 shrink-0">
        <button
          type="button"
          onClick={() => setReaderTheme('light')}
          title="Light"
          className={`p-1 rounded-lg ${readerTheme === 'light' ? 'bg-slate-200 text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
        >
          <Sun className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setReaderTheme('sepia')}
          title="Sepia"
          className={`w-4 h-4 rounded-full bg-amber-200 border ${
            readerTheme === 'sepia' ? 'ring-2 ring-blue-600 border-white' : 'border-amber-400'
          }`}
        />
        <button
          type="button"
          onClick={() => setReaderTheme('dark')}
          title="Dark"
          className={`p-1 rounded-lg ${readerTheme === 'dark' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-700'}`}
        >
          <Moon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

      <button
        type="button"
        onClick={() => setReaderOutlineOpen((v) => !v)}
        title="Outline / Pages"
        className={`p-1.5 rounded-lg shrink-0 ${readerOutlineOpen ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
      >
        <BookMarked className="w-3.5 h-3.5" />
      </button>

      {pages.some((page) => page.text.trim()) && (
        <button
          type="button"
          onClick={onToggleReadAloud}
          title={
            readerSpeechPlaying
              ? 'Pause reading'
              : readerSpeechProgress
                ? `Continue from page ${readerSpeechProgress.pageNumber}`
                : `Read aloud from page ${activePageNum}`
          }
          aria-label={readerSpeechPlaying ? 'Pause reading' : 'Continue reading aloud'}
          className={`p-1.5 rounded-lg shrink-0 ${
            readerSpeechPlaying
              ? 'bg-emerald-600 text-white'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {readerSpeechPlaying ? <Pause className="w-3.5 h-3.5" /> : readerSpeechProgress ? <Play className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      )}
      {readerSpeechProgress && (
        <span className="text-[10px] font-mono text-slate-500 shrink-0" title="Saved read-aloud position">
          P{readerSpeechProgress.pageNumber} · {Math.round(
            (readerSpeechProgress.charIndex /
              Math.max(1, pages.find((page) => page.pageNumber === readerSpeechProgress.pageNumber)?.text.trim().length || 1)) *
              100
          )}%
        </span>
      )}

      <button
        type="button"
        onClick={toggleFullscreen}
        title={fullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
      >
        {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </button>

      <button
        type="button"
        onClick={onExit}
        title="Exit Reader Mode (Esc)"
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shrink-0"
      >
        <X className="w-3.5 h-3.5" />
        <span>Exit</span>
      </button>
    </div>
  </>
);
