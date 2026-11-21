import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Copy,
  Italic,
  Lock,
  Pencil,
  RotateCw,
  Trash2,
  Underline,
  Unlock,
  X,
} from 'lucide-react';
import type { PDFAnnotation } from '../../types/smartboard';
import type { MeasureUnit } from './PDFPageHelpers';
import type { PageToolMode } from './PDFPageSurface';

const STROKE_SWATCHES = ['#0F172A', '#DC2626', '#2563EB', '#10B981', '#FACC15', '#7C3AED', '#EA580C', '#FFFFFF'];
const FILL_SWATCHES = ['transparent', '#FFFFFF', '#FEF08A', '#DBEAFE', '#DCFCE7', '#FEE2E2', '#F3E8FF', '#0F172A'];
const FONT_FAMILIES = [
  { id: 'DM Sans', label: 'DM Sans' },
  { id: 'Plus Jakarta Sans', label: 'Jakarta Sans' },
  { id: 'Merriweather', label: 'Merriweather' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono' },
  { id: 'Caveat', label: 'Caveat' },
];
const STAMP_CHIPS = ['APPROVED', 'REVIEWED', 'CONFIDENTIAL', 'DRAFT', 'PAID', 'FINAL'];

export type PDFToolDefaults = {
  color: string;
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
  measureUnit: MeasureUnit;
  measureScale: number;
  stampText: string;
  stampStyle: 'filled' | 'border' | 'diagonal';
  authorName: string;
};

type PDFPropertiesPanelProps = {
  selectedAnn: PDFAnnotation | null;
  activeTool: PageToolMode;
  defaults: PDFToolDefaults;
  onChangeDefaults: (patch: Partial<PDFToolDefaults>) => void;
  onUpdateSelected: (patch: Partial<PDFAnnotation>) => void;
  onArrangeSelected: (dir: 'front' | 'forward' | 'backward' | 'back') => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onEditSelectedText?: () => void;
  onClose: () => void;
};

export const PDFPropertiesPanel: React.FC<PDFPropertiesPanelProps> = ({
  selectedAnn,
  activeTool,
  defaults,
  onChangeDefaults,
  onUpdateSelected,
  onArrangeSelected,
  onDuplicateSelected,
  onDeleteSelected,
  onEditSelectedText,
  onClose,
}) => {
  const targetKind = selectedAnn?.kind || activeTool;
  const isEditing = Boolean(selectedAnn);
  const isLocked = Boolean(selectedAnn?.locked);

  const color = selectedAnn ? selectedAnn.color : defaults.color;
  const fillColor = selectedAnn ? selectedAnn.fillColor ?? selectedAnn.bgColor ?? 'transparent' : defaults.fillColor;
  const strokeWidth = selectedAnn ? selectedAnn.strokeWidth ?? 2.5 : defaults.strokeWidth;
  const strokeStyle = selectedAnn ? selectedAnn.strokeStyle ?? 'solid' : defaults.strokeStyle;
  const borderRadius = selectedAnn ? selectedAnn.borderRadius ?? 0 : defaults.borderRadius;
  const opacity = selectedAnn
    ? selectedAnn.opacity ?? (selectedAnn.kind === 'highlight' || selectedAnn.kind === 'highlighter_ink' ? 0.36 : 1)
    : defaults.opacity;
  const fontFamily = selectedAnn ? selectedAnn.fontFamily || 'DM Sans' : defaults.fontFamily;
  const fontSize = selectedAnn ? selectedAnn.fontSize || 13 : defaults.fontSize;
  const fontWeight = selectedAnn ? selectedAnn.fontWeight || 'normal' : defaults.fontWeight;
  const fontStyle = selectedAnn ? selectedAnn.fontStyle || 'normal' : defaults.fontStyle;
  const underline = selectedAnn ? Boolean(selectedAnn.underline) : defaults.underline;
  const textAlign = selectedAnn ? selectedAnn.textAlign || 'left' : defaults.textAlign;
  const rotation = selectedAnn ? selectedAnn.rotation || 0 : defaults.rotation;
  const measureUnit = selectedAnn?.measureUnit || defaults.measureUnit;
  const measureScale = selectedAnn?.measureScale || defaults.measureScale;

  const setColor = (c: string) => {
    if (isLocked) return;
    if (selectedAnn) onUpdateSelected({ color: c });
    else onChangeDefaults({ color: c });
  };
  const setFill = (f: string) => {
    if (isLocked) return;
    const val = f === 'transparent' ? undefined : f;
    if (selectedAnn) onUpdateSelected({ fillColor: val, bgColor: val });
    else onChangeDefaults({ fillColor: f });
  };
  const setStrokeW = (w: number) => {
    if (isLocked) return;
    if (selectedAnn) onUpdateSelected({ strokeWidth: w });
    else onChangeDefaults({ strokeWidth: w });
  };
  const setStrokeStyle = (s: 'solid' | 'dashed' | 'dotted') => {
    if (isLocked) return;
    if (selectedAnn) onUpdateSelected({ strokeStyle: s });
    else onChangeDefaults({ strokeStyle: s });
  };
  const setRadius = (r: number) => {
    if (isLocked) return;
    if (selectedAnn) onUpdateSelected({ borderRadius: r });
    else onChangeDefaults({ borderRadius: r });
  };
  const setOpacity = (op: number) => {
    if (isLocked) return;
    if (selectedAnn) onUpdateSelected({ opacity: op });
    else onChangeDefaults({ opacity: op });
  };

  const hasStroke = ['rect', 'circle', 'line', 'arrow', 'draw', 'highlighter_ink', 'measure', 'underline', 'strike', 'callout', 'stamp'].includes(targetKind);
  const hasFill = ['rect', 'circle', 'text', 'callout', 'sticky', 'stamp'].includes(targetKind);
  const hasRadius = ['rect', 'text', 'callout', 'stamp'].includes(targetKind);
  const hasTypography = ['text', 'callout', 'sticky', 'comment', 'stamp'].includes(targetKind);
  const isStamp = targetKind === 'stamp';
  const isImage = targetKind === 'image';
  const isMeasure = targetKind === 'measure';
  const isPin = targetKind === 'comment' || targetKind === 'sticky';

  return (
    <>
      <div onClick={onClose} className="md:hidden fixed inset-0 z-30 bg-slate-950/35" />
      <aside className="fixed inset-y-0 right-0 z-40 w-[min(86vw,268px)] pb-safe md:static md:inset-auto md:z-auto md:w-64 md:pb-0 shadow-2xl md:shadow-none border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col min-h-0 shrink-0 text-xs">
      <div className="h-10 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate capitalize">
            {isEditing ? `${selectedAnn?.kind.replace('_', ' ')}` : activeTool === 'select' ? 'Properties' : `${activeTool.replace('_', ' ')}`}
          </span>
          {selectedAnn?.locked && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close Properties"
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto studio-scroll divide-y divide-slate-200 dark:divide-slate-800">
        {isLocked && (
          <div className="px-3 py-2 bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[11px] flex items-center justify-between gap-2">
            <span>Markup is locked</span>
            <button
              type="button"
              onClick={() => onUpdateSelected({ locked: false })}
              className="px-2 py-0.5 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
            >
              Unlock
            </button>
          </div>
        )}
        {/* Stroke / Text Color & Opacity */}
        {targetKind !== 'redact' && !isImage && (
          <div className={`p-3 space-y-2.5 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">
                {targetKind === 'text' ? 'Text Color' : hasStroke ? 'Stroke Color' : 'Color'}
              </span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-6 h-5 rounded cursor-pointer border border-slate-300 dark:border-slate-700 bg-transparent p-0"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {STROKE_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                    color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-blue-600 ring-offset-1 border-white' : 'border-slate-300 dark:border-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Fill Color */}
        {hasFill && (
          <div className={`p-3 space-y-2 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Fill Color</span>
              {fillColor !== 'transparent' && (
                <input
                  type="color"
                  value={fillColor.startsWith('#') ? fillColor : '#FFFFFF'}
                  onChange={(e) => setFill(e.target.value)}
                  className="w-6 h-5 rounded cursor-pointer border border-slate-300 dark:border-slate-700 bg-transparent p-0"
                />
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILL_SWATCHES.map((f) => (
                <button
                  key={f}
                  type="button"
                  title={f === 'transparent' ? 'No Fill' : f}
                  onClick={() => setFill(f)}
                  style={f === 'transparent' ? undefined : { backgroundColor: f }}
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-transform hover:scale-110 ${
                    fillColor.toLowerCase() === f.toLowerCase() ? 'ring-2 ring-blue-600 ring-offset-1 border-white' : 'border-slate-300 dark:border-slate-600'
                  } ${f === 'transparent' ? 'bg-white dark:bg-slate-950 relative overflow-hidden' : ''}`}
                >
                  {f === 'transparent' && <span className="w-6 h-px bg-red-500 rotate-45 block" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Opacity */}
        {targetKind !== 'redact' && (
          <div className={`p-3 space-y-2 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-slate-500">Opacity</span>
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              className="w-full accent-blue-600"
            />
          </div>
        )}

        {/* Border Width, Style & Corner Radius */}
        {(hasStroke || hasRadius) && (
          <div className={`p-3 space-y-2.5 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            {hasStroke && (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-500">Stroke Width</span>
                  <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={0.5}
                  value={strokeWidth}
                  onChange={(e) => setStrokeW(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="grid grid-cols-3 gap-1">
                  {(['solid', 'dashed', 'dotted'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStrokeStyle(st)}
                      className={`py-1 px-2 rounded-md border text-[11px] capitalize ${
                        strokeStyle === st
                          ? 'border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950/50 font-medium'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </>
            )}

            {hasRadius && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-500">Corner Radius</span>
                  <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{borderRadius}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={borderRadius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            )}
          </div>
        )}

        {/* Typography Controls */}
        {hasTypography && (
          <div className={`p-3 space-y-2.5 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="block text-[11px] font-medium text-slate-500">Typography</span>
            <select
              value={fontFamily}
              onChange={(e) => {
                if (selectedAnn) onUpdateSelected({ fontFamily: e.target.value });
                else onChangeDefaults({ fontFamily: e.target.value });
              }}
              className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(9, fontSize - 1);
                    if (selectedAnn) onUpdateSelected({ fontSize: next });
                    else onChangeDefaults({ fontSize: next });
                  }}
                  className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono"
                >
                  -
                </button>
                <span className="px-2 py-1 font-mono tabular-nums text-[11px] min-w-[34px] text-center">{fontSize}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(48, fontSize + 1);
                    if (selectedAnn) onUpdateSelected({ fontSize: next });
                    else onChangeDefaults({ fontSize: next });
                  }}
                  className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono"
                >
                  +
                </button>
              </div>

              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden ml-auto">
                <button
                  type="button"
                  title="Bold"
                  onClick={() => {
                    const next = fontWeight === 'bold' ? 'normal' : 'bold';
                    if (selectedAnn) onUpdateSelected({ fontWeight: next });
                    else onChangeDefaults({ fontWeight: next });
                  }}
                  className={`p-1.5 ${fontWeight === 'bold' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Italic"
                  onClick={() => {
                    const next = fontStyle === 'italic' ? 'normal' : 'italic';
                    if (selectedAnn) onUpdateSelected({ fontStyle: next });
                    else onChangeDefaults({ fontStyle: next });
                  }}
                  className={`p-1.5 ${fontStyle === 'italic' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Underline"
                  onClick={() => {
                    const next = !underline;
                    if (selectedAnn) onUpdateSelected({ underline: next });
                    else onChangeDefaults({ underline: next });
                  }}
                  className={`p-1.5 ${underline ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {!isStamp && (
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: 'left', icon: AlignLeft },
                    { id: 'center', icon: AlignCenter },
                    { id: 'right', icon: AlignRight },
                  ] as const
                ).map((al) => {
                  const Ico = al.icon;
                  return (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => {
                        if (selectedAnn) onUpdateSelected({ textAlign: al.id });
                        else onChangeDefaults({ textAlign: al.id });
                      }}
                      className={`py-1 flex items-center justify-center rounded-md border ${
                        textAlign === al.id
                          ? 'border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-950/50'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <Ico className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Stamp Customization */}
        {isStamp && (!selectedAnn || !selectedAnn.text?.startsWith('data:image/')) && (
          <div className={`p-3 space-y-2 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="block text-[11px] font-medium text-slate-500">Stamp Text</span>
            <input
              value={selectedAnn ? selectedAnn.text || '' : defaults.stampText}
              onChange={(e) => {
                if (selectedAnn) onUpdateSelected({ text: e.target.value });
                else onChangeDefaults({ stampText: e.target.value });
              }}
              placeholder="Custom stamp…"
              className="w-full px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold"
            />
            <div className="grid grid-cols-2 gap-1">
              {STAMP_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    if (selectedAnn) onUpdateSelected({ text: chip });
                    else onChangeDefaults({ stampText: chip });
                  }}
                  className="px-2 py-1 text-[10px] font-bold tracking-wide rounded border border-slate-200 dark:border-slate-700 hover:border-blue-500 truncate"
                >
                  {chip}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const stampStr = `${defaults.authorName || 'Reviewed'} · ${new Date().toLocaleDateString()}`;
                if (selectedAnn) onUpdateSelected({ text: stampStr });
                else onChangeDefaults({ stampText: stampStr });
              }}
              className="w-full py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-medium"
            >
              Insert Author &amp; Date Stamp
            </button>
          </div>
        )}

        {/* Rotation for Stamps & Images */}
        {(isStamp || isImage) && (
          <div className={`p-3 space-y-2 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-slate-500 flex items-center gap-1">
                <RotateCw className="w-3 h-3" /> Rotation
              </span>
              <span className="font-mono tabular-nums">{rotation}°</span>
            </div>
            <input
              type="range"
              min={-45}
              max={45}
              step={5}
              value={rotation}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (selectedAnn) onUpdateSelected({ rotation: next });
                else onChangeDefaults({ rotation: next });
              }}
              className="w-full accent-blue-600"
            />
          </div>
        )}

        {/* Measurement Unit & Calibration Scale */}
        {isMeasure && (
          <div className={`p-3 space-y-2 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="block text-[11px] font-medium text-slate-500">Measurement Scale</span>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={measureUnit}
                onChange={(e) => {
                  const u = e.target.value as MeasureUnit;
                  if (selectedAnn) onUpdateSelected({ measureUnit: u });
                  else onChangeDefaults({ measureUnit: u });
                }}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="in">in</option>
                <option value="ft">ft</option>
                <option value="pt">pt</option>
              </select>
              <select
                value={measureScale}
                onChange={(e) => {
                  const sc = Number(e.target.value);
                  if (selectedAnn) onUpdateSelected({ measureScale: sc });
                  else onChangeDefaults({ measureScale: sc });
                }}
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              >
                <option value={1}>1:1</option>
                <option value={2}>1:2</option>
                <option value={10}>1:10</option>
                <option value={50}>1:50</option>
                <option value={100}>1:100</option>
              </select>
            </div>
          </div>
        )}

        {/* Reviewer Author */}
        {(isPin || !selectedAnn) && (
          <div className={`p-3 space-y-1.5 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="block text-[11px] font-medium text-slate-500">Reviewer Name</span>
            <input
              value={selectedAnn?.author ?? defaults.authorName}
              onChange={(e) => {
                if (selectedAnn) onUpdateSelected({ author: e.target.value });
                else onChangeDefaults({ authorName: e.target.value });
              }}
              placeholder="Your Name"
              className="w-full px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
        )}

        {/* Arrange, Lock & Actions when selected */}
        {selectedAnn && (
          <div className="p-3 space-y-2.5">
            <span className="block text-[11px] font-medium text-slate-500">Arrange &amp; State</span>
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: 'front', icon: ArrowUpToLine, title: 'Bring to Front' },
                { id: 'forward', icon: ArrowUp, title: 'Bring Forward' },
                { id: 'backward', icon: ArrowDown, title: 'Send Backward' },
                { id: 'back', icon: ArrowDownToLine, title: 'Send to Back' },
              ].map((b) => {
                const Ico = b.icon;
                return (
                  <button
                    key={b.id}
                    type="button"
                    title={b.title}
                    onClick={() => onArrangeSelected(b.id as 'front' | 'forward' | 'backward' | 'back')}
                    className="py-1.5 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Ico className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateSelected({ locked: !selectedAnn.locked })}
                className={`flex items-center justify-center gap-1 py-1.5 rounded-md border font-medium ${
                  selectedAnn.locked
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {selectedAnn.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                <span>{selectedAnn.locked ? 'Locked' : 'Lock'}</span>
              </button>
              <button
                type="button"
                onClick={onDuplicateSelected}
                className="flex items-center justify-center gap-1 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicate</span>
              </button>
            </div>

            {(selectedAnn.kind === 'text' || selectedAnn.kind === 'callout' || selectedAnn.kind === 'sticky' || selectedAnn.kind === 'comment') &&
              onEditSelectedText && (
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={onEditSelectedText}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-blue-200 dark:border-blue-800 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-medium disabled:opacity-40"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Text</span>
                </button>
              )}

            <button
              type="button"
              disabled={Boolean(selectedAnn.locked)}
              onClick={onDeleteSelected}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-red-50 dark:bg-red-950/40 text-red-600 border border-red-200 dark:border-red-900 hover:bg-red-100 disabled:opacity-40 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </aside>
    </>
  );
};
