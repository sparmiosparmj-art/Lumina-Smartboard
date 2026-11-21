import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Command,
  FileText,
  Maximize,
  Pen,
  Presentation,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { BoardPage, ToolType, WorkspaceViewMode } from '../types/smartboard';

export type PaletteAction = {
  id: string;
  title: string;
  category: 'Tool' | 'View' | 'Page' | 'AI' | 'Workspace' | 'Canvas';
  shortcut?: string;
  keywords?: string;
  run: () => void;
};

type CommandPaletteModalProps = {
  open: boolean;
  onClose: () => void;
  pages: BoardPage[];
  darkMode: boolean;
  onSelectTool: (tool: ToolType) => void;
  onSetViewMode: (mode: WorkspaceViewMode) => void;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onFitScreen: () => void;
  onZoom100?: () => void;
  onToggleSnapGrid: () => void;
  onToggleRulers: () => void;
  onToggleMinimap: () => void;
  onToggleDarkMode: () => void;
  onOpenAI: (intent?: 'sketch_shape' | 'handwriting' | 'math_solve' | 'chat') => void;
  onOpenMath: () => void;
  onOpenCalculator?: () => void;
  onOpenClassroom: () => void;
  onOpenExportImport: () => void;
  onOpenTemplates: () => void;
  onOpenSettings: () => void;
  onOpenFindReplace?: () => void;
  onStartPresent: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDuplicateSelected?: () => void;
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  onCopyStyle?: () => void;
  onPasteStyle?: () => void;
  onClearInk?: () => void;
  onAutoLayout?: () => void;
};

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  onClose,
  pages,
  darkMode,
  onSelectTool,
  onSetViewMode,
  onSelectPage,
  onAddPage,
  onFitScreen,
  onZoom100,
  onToggleSnapGrid,
  onToggleRulers,
  onToggleMinimap,
  onToggleDarkMode,
  onOpenAI,
  onOpenMath,
  onOpenCalculator,
  onOpenClassroom,
  onOpenExportImport,
  onOpenTemplates,
  onOpenSettings,
  onOpenFindReplace,
  onStartPresent,
  onUndo,
  onRedo,
  onDuplicateSelected,
  onGroupSelected,
  onUngroupSelected,
  onCopyStyle,
  onPasteStyle,
  onClearInk,
  onAutoLayout,
}) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const actions = useMemo<PaletteAction[]>(() => {
    const toolCmd = (id: string, title: string, tool: ToolType, shortcut?: string, keywords?: string): PaletteAction => ({
      id,
      title,
      category: 'Tool',
      shortcut,
      keywords,
      run: () => {
        onSetViewMode('board');
        onSelectTool(tool);
      },
    });

    const base: PaletteAction[] = [
      { id: 'ai-open', title: 'Open AI SmartBoard Assistant', category: 'AI', keywords: 'diagram mindmap prompt', run: () => onOpenAI() },
      { id: 'ai-chat', title: 'AI: Open Copilot Chat', category: 'AI', keywords: 'copilot chat ask assistant', run: () => onOpenAI('chat') },
      { id: 'ai-sketch', title: 'AI: Convert Sketch Ink to Clean Shapes', category: 'AI', keywords: 'draw cleanup vector', run: () => onOpenAI('sketch_shape') },
      { id: 'ai-handwriting', title: 'AI: Transcribe Handwriting to Text', category: 'AI', keywords: 'ocr ink text', run: () => onOpenAI('handwriting') },
      { id: 'ai-math', title: 'AI: Read & Solve Drawn Math', category: 'AI', keywords: 'equation calculus solve', run: () => onOpenAI('math_solve') },
      toolCmd('tool-select', 'Select / Marquee Tool', 'select', 'V', 'pointer cursor box'),
      toolCmd('tool-lasso', 'Freehand Lasso Select', 'lasso', undefined, 'lasso select loop'),
      toolCmd('tool-hand', 'Hand / Pan Tool', 'hand', 'H', 'pan move canvas'),
      toolCmd('tool-pen', 'Pen Drawing Tool', 'pen', 'P', 'draw ink'),
      toolCmd('tool-pencil', 'Pencil Tool', 'pencil', undefined, 'sketch pencil'),
      toolCmd('tool-brush', 'Soft Brush Tool', 'brush', 'B', 'paint brush'),
      toolCmd('tool-marker', 'Chisel Marker Tool', 'marker', 'M', 'marker chisel'),
      toolCmd('tool-highlighter', 'Highlighter Tool', 'highlighter', 'K', 'highlight straight'),
      toolCmd('tool-calligraphy', 'Calligraphy Nib Tool', 'calligraphy', undefined, 'ribbon nib'),
      toolCmd('tool-fountain', 'Fountain Pen Tool', 'fountain', undefined, 'fountain ink'),
      toolCmd('tool-bucket', 'Paint Bucket / Flood Fill', 'paint_bucket', undefined, 'fill color bucket'),
      toolCmd('tool-code', 'Code Block', 'code', undefined, 'snippet source programming code'),
      toolCmd('tool-eraser-stroke', 'Stroke Eraser', 'eraser_stroke', 'E', 'erase ink'),
      toolCmd('tool-eraser-object', 'Object Eraser', 'eraser_object', undefined, 'erase delete object'),
      toolCmd('tool-eraser-area', 'Area / Partial Stroke Eraser', 'eraser_area', undefined, 'slice cut stroke'),
      toolCmd('tool-laser', 'Laser Pointer', 'laser', 'Q', 'pointer spotlight'),
      toolCmd('tool-text', 'Rich Text Box Tool', 'text', 'T', 'type font rich text'),
      toolCmd('tool-sticky', 'Sticky Note / Task Card Tool', 'sticky', 'S', 'note card'),
      toolCmd('tool-shape', 'Shapes Tool', 'shape', 'R', 'rectangle circle frame'),
      toolCmd('tool-line', 'Straight Line Tool', 'line', 'L', 'line segment'),
      toolCmd('tool-curved', 'Curved Bezier Line Tool', 'curved_line', undefined, 'curve bezier'),
      toolCmd('tool-polyline', 'Polyline Multi-Point Tool', 'polyline', undefined, 'polyline path'),
      toolCmd('tool-arrow', 'Single Arrow Tool', 'arrow', undefined, 'arrow vector'),
      toolCmd('tool-darrow', 'Double Arrow Tool', 'double_arrow', undefined, 'bidirectional arrow'),
      toolCmd('tool-connector', 'Smart Diagram Connector', 'connector', 'C', 'link port elbow'),
      { id: 'view-board', title: 'Switch to Board Canvas', category: 'View', run: () => onSetViewMode('board') },
      { id: 'view-slides', title: 'Switch to Presentation Studio', category: 'View', run: () => onSetViewMode('presentation') },
      { id: 'view-pdf', title: 'Switch to PDF Studio', category: 'View', run: () => onSetViewMode('pdf') },
      { id: 'present-now', title: 'Start Fullscreen Presentation', category: 'View', run: () => onStartPresent() },
      { id: 'ws-add-page', title: 'Add New Board / Slide Page', category: 'Page', run: () => onAddPage() },
      ...pages.map((p, idx) => ({
        id: `page-${p.id}`,
        title: `Jump to Page ${idx + 1}: ${p.name}`,
        category: 'Page' as const,
        run: () => onSelectPage(p.id),
      })),
      { id: 'canvas-fit', title: 'Fit Canvas to Screen', category: 'Canvas', shortcut: 'Shift+1', run: () => onFitScreen() },
      ...(onZoom100 ? [{ id: 'canvas-100', title: 'Reset Zoom to 100%', category: 'Canvas' as const, shortcut: 'Shift+0', run: () => onZoom100() }] : []),
      ...(onOpenFindReplace ? [{ id: 'canvas-find', title: 'Find & Replace on Board', category: 'Canvas' as const, shortcut: 'Ctrl+F', keywords: 'search text replace', run: () => onOpenFindReplace() }] : []),
      { id: 'canvas-grid', title: 'Toggle Snap to Grid', category: 'Canvas', run: () => onToggleSnapGrid() },
      { id: 'canvas-rulers', title: 'Toggle Rulers', category: 'Canvas', run: () => onToggleRulers() },
      { id: 'canvas-minimap', title: 'Toggle Mini-map', category: 'Canvas', run: () => onToggleMinimap() },
      ...(onUndo ? [{ id: 'act-undo', title: 'Undo Last Action', category: 'Canvas' as const, shortcut: 'Ctrl+Z', run: () => onUndo() }] : []),
      ...(onRedo ? [{ id: 'act-redo', title: 'Redo Last Action', category: 'Canvas' as const, shortcut: 'Ctrl+Y', run: () => onRedo() }] : []),
      ...(onDuplicateSelected ? [{ id: 'act-dup', title: 'Duplicate Selected Objects', category: 'Canvas' as const, shortcut: 'Ctrl+D', run: () => onDuplicateSelected() }] : []),
      ...(onGroupSelected ? [{ id: 'act-grp', title: 'Group Selected Objects', category: 'Canvas' as const, shortcut: 'Ctrl+G', run: () => onGroupSelected() }] : []),
      ...(onUngroupSelected ? [{ id: 'act-ungrp', title: 'Ungroup Selected Objects', category: 'Canvas' as const, shortcut: 'Ctrl+Shift+G', run: () => onUngroupSelected() }] : []),
      ...(onCopyStyle ? [{ id: 'act-cpstyle', title: 'Copy Style from Selected Object', category: 'Canvas' as const, shortcut: 'Ctrl+Alt+C', run: () => onCopyStyle() }] : []),
      ...(onPasteStyle ? [{ id: 'act-ptstyle', title: 'Paste Style onto Selected Objects', category: 'Canvas' as const, shortcut: 'Ctrl+Alt+V', run: () => onPasteStyle() }] : []),
      ...(onAutoLayout ? [{ id: 'act-autolayout', title: 'Auto-Layout Diagram Nodes', category: 'Canvas' as const, run: () => onAutoLayout() }] : []),
      ...(onClearInk ? [{ id: 'act-clearink', title: 'Clear All Unlocked Ink Strokes on Page', category: 'Canvas' as const, run: () => onClearInk() }] : []),
      { id: 'canvas-theme', title: darkMode ? 'Switch to Light Studio Theme' : 'Switch to Dark Slate Theme', category: 'Workspace', run: () => onToggleDarkMode() },
      { id: 'modal-math', title: 'Open Math, Graphing & Science Lab', category: 'Workspace', run: () => onOpenMath() },
      ...(onOpenCalculator ? [{ id: 'modal-calc', title: 'Open Floating Scientific Calculator', category: 'Workspace' as const, run: () => onOpenCalculator() }] : []),
      { id: 'modal-class', title: 'Open Classroom & Real-Time Collaboration', category: 'Workspace', run: () => onOpenClassroom() },
      { id: 'modal-templates', title: 'Browse Templates & Workspaces', category: 'Workspace', run: () => onOpenTemplates() },
      { id: 'modal-export', title: 'Open Export, Import & Camera Capture', category: 'Workspace', run: () => onOpenExportImport() },
      { id: 'modal-settings', title: 'Open Settings, Language & Shortcuts', category: 'Workspace', run: () => onOpenSettings() },
    ];
    return base;
  }, [
    darkMode,
    onAddPage,
    onAutoLayout,
    onClearInk,
    onCopyStyle,
    onDuplicateSelected,
    onFitScreen,
    onGroupSelected,
    onOpenAI,
    onOpenCalculator,
    onOpenClassroom,
    onOpenExportImport,
    onOpenFindReplace,
    onOpenMath,
    onOpenSettings,
    onOpenTemplates,
    onPasteStyle,
    onRedo,
    onSelectPage,
    onSelectTool,
    onSetViewMode,
    onStartPresent,
    onToggleDarkMode,
    onToggleMinimap,
    onToggleRulers,
    onToggleSnapGrid,
    onUndo,
    onUngroupSelected,
    onZoom100,
    pages,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions.slice(0, 16);
    return actions
      .filter((a) => `${a.title} ${a.category} ${a.keywords || ''} ${a.shortcut || ''}`.toLowerCase().includes(q))
      .slice(0, 18);
  }, [actions, query]);

  if (!open) return null;

  const iconForCategory = (cat: PaletteAction['category']) => {
    switch (cat) {
      case 'AI':
        return <Sparkles className="w-3.5 h-3.5 text-blue-500" />;
      case 'Tool':
        return <Pen className="w-3.5 h-3.5 text-emerald-500" />;
      case 'View':
        return <Presentation className="w-3.5 h-3.5 text-amber-500" />;
      case 'Page':
        return <FileText className="w-3.5 h-3.5 text-sky-500" />;
      case 'Canvas':
        return <Maximize className="w-3.5 h-3.5 text-slate-500" />;
      default:
        return <Command className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-slate-950/50 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => (filtered.length ? (i + 1) % filtered.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
              } else if (e.key === 'Enter' && filtered[activeIdx]) {
                e.preventDefault();
                filtered[activeIdx].run();
                onClose();
              }
            }}
            placeholder="Type a command, tool, AI action, or page name..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5 studio-scroll">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-4 py-2 text-left text-xs transition-colors ${
                  idx === activeIdx
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={idx === activeIdx ? 'brightness-200' : ''}>{iconForCategory(item.category)}</span>
                  <span className="font-medium truncate">{item.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {item.shortcut && (
                    <kbd
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                        idx === activeIdx
                          ? 'bg-blue-700 border-blue-400 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
                  <span
                    className={`text-[10px] uppercase tracking-wider font-mono ${
                      idx === activeIdx ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    {item.category}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Run Command</span>
            <span>Esc Close</span>
          </div>
          <span className="font-mono">Ctrl/Cmd + K</span>
        </div>
      </div>
    </div>
  );
};
