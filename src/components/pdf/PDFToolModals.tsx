import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Crop,
  Droplets,
  FileText,
  Image as ImageIcon,
  Keyboard,
  Lock,
  Merge,
  PenTool,
  Plus,
  Printer,
  Scissors,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import type { PDFDocMetadata } from '../../utils/pdfPptx';

export type WatermarkConfig = {
  text: string;
  opacity: number;
  angle: number;
  color: string;
  fontSize?: number;
  position?: 'center' | 'top' | 'bottom';
  scope?: 'all' | 'current' | 'range';
  rangeExpr?: string;
  headerLeft: string;
  headerRight: string;
  footerCenter: string;
  pageNumbers: boolean;
  batesPrefix?: string;
  batesStart?: number;
};

/* 1. Encrypted PDF Password Prompt */
export const PDFPasswordModal: React.FC<{
  reason: 'need_password' | 'incorrect_password';
  onSubmit: (pw: string) => void;
  onCancel: () => void;
}> = ({ reason, onSubmit, onCancel }) => {
  const [pw, setPw] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw) onSubmit(pw);
        }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 w-full max-w-xs shadow-2xl space-y-3 text-xs"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-slate-100">
            <Lock className="w-4 h-4 text-blue-600" />
            <span>Protected PDF</span>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={reason === 'incorrect_password' ? 'Incorrect password — retry' : 'Enter password'}
          className={`w-full px-3 py-2 rounded-lg border bg-slate-50 dark:bg-slate-950 text-xs ${
            reason === 'incorrect_password' ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
          }`}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button type="submit" className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
};

/* 2. Signature Modal: Draw | Type | Upload */
const SIG_FONTS = [
  { id: 'Caveat', label: 'Script' },
  { id: 'Kalam', label: 'Brush' },
  { id: 'Merriweather', label: 'Serif' },
];

export const PDFSignatureModal: React.FC<{
  savedSigUrl: string | null;
  onPlaceDataUrl: (dataUrl: string) => void;
  onClose: () => void;
}> = ({ savedSigUrl, onPlaceDataUrl, onClose }) => {
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedName, setTypedName] = useState('');
  const [sigColor, setSigColor] = useState('#0F172A');
  const [sigFont, setSigFont] = useState(SIG_FONTS[0].id);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const generateTypedSignaturePng = (): string | null => {
    const txt = typedName.trim();
    if (!txt) return null;
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 140;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = sigColor;
    ctx.font = `italic 600 54px "${sigFont}", cursive, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, c.width / 2, c.height / 2);
    return c.toDataURL('image/png');
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full max-w-md shadow-2xl space-y-3 text-xs max-h-[92dvh] overflow-y-auto scrollbar-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <PenTool className="w-4 h-4 text-blue-600" />
            <span>Signature</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {savedSigUrl && (
          <div className="flex items-center justify-between p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <img src={savedSigUrl} alt="Saved Signature" className="h-9 w-auto" />
            <button
              type="button"
              onClick={() => onPlaceDataUrl(savedSigUrl)}
              className="px-3 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              Use Saved
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg flex-1">
            {[
              { id: 'draw', label: 'Draw', icon: PenTool },
              { id: 'type', label: 'Type', icon: Type },
              { id: 'upload', label: 'Image', icon: ImageIcon },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id as typeof tab)}
                  className={`flex items-center justify-center gap-1 py-1 rounded-md font-medium ${
                    tab === t.id ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  <Icon className="w-3 h-3" /> {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            {['#0F172A', '#1D4ED8', '#DC2626'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSigColor(c)}
                style={{ backgroundColor: c }}
                className={`w-4 h-4 rounded-full border ${
                  sigColor === c ? 'ring-2 ring-blue-600 ring-offset-1 border-white' : 'border-slate-300'
                }`}
              />
            ))}
          </div>
        </div>

        {tab === 'draw' && (
          <>
            <canvas
              ref={sigCanvasRef}
              width={420}
              height={150}
              className="w-full h-36 bg-slate-50 border border-slate-300 dark:border-slate-700 rounded-xl cursor-crosshair touch-none"
              onPointerDown={(e) => {
                const c = sigCanvasRef.current;
                if (!c) return;
                c.setPointerCapture?.(e.pointerId);
                const ctx = c.getContext('2d')!;
                const rect = c.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * c.width;
                const y = ((e.clientY - rect.top) / rect.height) * c.height;
                drawingRef.current = true;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.strokeStyle = sigColor;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
              }}
              onPointerMove={(e) => {
                if (!drawingRef.current || !sigCanvasRef.current) return;
                const c = sigCanvasRef.current;
                const ctx = c.getContext('2d')!;
                const rect = c.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * c.width;
                const y = ((e.clientY - rect.top) / rect.height) * c.height;
                ctx.lineTo(x, y);
                ctx.stroke();
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                drawingRef.current = false;
              }}
              onPointerCancel={() => {
                drawingRef.current = false;
              }}
            />
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => {
                  const c = sigCanvasRef.current;
                  if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
                }}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const c = sigCanvasRef.current;
                  if (c) onPlaceDataUrl(c.toDataURL('image/png'));
                }}
                className="px-4 py-1.5 font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Place Signature
              </button>
            </div>
          </>
        )}

        {tab === 'type' && (
          <div className="space-y-3">
            <input
              autoFocus
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Type your name"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
            <div className="grid grid-cols-3 gap-1.5">
              {SIG_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSigFont(f.id)}
                  style={{ fontFamily: `"${f.id}", cursive`, color: sigColor }}
                  className={`py-2 px-2 rounded-lg border text-base truncate bg-slate-50 ${
                    sigFont === f.id ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200'
                  }`}
                >
                  {typedName.trim() || f.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!typedName.trim()}
                onClick={() => {
                  const url = generateTypedSignaturePng();
                  if (url) onPlaceDataUrl(url);
                }}
                className="px-4 py-1.5 font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                Place Signature
              </button>
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl gap-2">
            <input
              ref={imgInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') onPlaceDataUrl(reader.result);
                };
                reader.readAsDataURL(file);
              }}
            />
            <button
              type="button"
              onClick={() => imgInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
            >
              <Upload className="w-3.5 h-3.5" /> Choose PNG / JPG
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* 3. Crop Margins Modal */
export const PDFCropModal: React.FC<{
  activePageNum: number;
  totalPages: number;
  previewDataUrl?: string;
  onApply: (margins: { left: number; top: number; right: number; bottom: number }, scope: 'current' | 'all' | 'range', rangeExpr?: string, resetCrop?: boolean) => void;
  onClose: () => void;
}> = ({ activePageNum, totalPages, previewDataUrl, onApply, onClose }) => {
  const [top, setTop] = useState(5);
  const [bottom, setBottom] = useState(5);
  const [left, setLeft] = useState(5);
  const [right, setRight] = useState(5);
  const [scope, setScope] = useState<'current' | 'all' | 'range'>('current');
  const [rangeExpr, setRangeExpr] = useState(`1-${Math.min(5, totalPages)}`);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full max-w-md shadow-2xl space-y-3 text-xs max-h-[92dvh] overflow-y-auto scrollbar-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Crop className="w-4 h-4 text-blue-600" />
            <span>Crop Margins</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {previewDataUrl && (
          <div className="relative mx-auto w-40 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white">
            <img src={previewDataUrl} alt="Crop Preview" className="w-full block" />
            <div
              style={{
                top: `${top}%`,
                bottom: `${bottom}%`,
                left: `${left}%`,
                right: `${right}%`,
              }}
              className="absolute border-2 border-blue-600 bg-blue-500/10 pointer-events-none"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Top', val: top, set: setTop },
            { label: 'Bottom', val: bottom, set: setBottom },
            { label: 'Left', val: left, set: setLeft },
            { label: 'Right', val: right, set: setRight },
          ].map((s) => (
            <label key={s.label} className="space-y-1">
              <div className="flex justify-between font-mono tabular-nums">
                <span className="text-slate-500">{s.label}</span>
                <span>{s.val}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={35}
                value={s.val}
                onChange={(e) => s.set(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['current', 'all', 'range'] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => setScope(sc)}
                className={`px-2 py-1 rounded-md capitalize ${scope === sc ? 'bg-white dark:bg-slate-900 font-semibold shadow-xs' : 'text-slate-500'}`}
              >
                {sc === 'current' ? `p.${activePageNum}` : sc === 'all' ? `All (${totalPages})` : 'Range'}
              </button>
            ))}
          </div>
          {scope === 'range' && (
            <input
              value={rangeExpr}
              onChange={(e) => setRangeExpr(e.target.value)}
              placeholder="1-3, 5"
              className="flex-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => onApply({ left: 0, top: 0, right: 0, bottom: 0 }, scope, rangeExpr, true)}
            className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Reset Crop
          </button>
          <button
            type="button"
            onClick={() => onApply({ left: left / 100, top: top / 100, right: right / 100, bottom: bottom / 100 }, scope, rangeExpr, false)}
            className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
};

/* 4. Watermark, Header, Footer & Bates Numbers Modal */
export const PDFWatermarkModal: React.FC<{
  initial: WatermarkConfig;
  activePageNum: number;
  totalPages: number;
  onSave: (cfg: WatermarkConfig, burnPermanently: boolean) => void;
  onClose: () => void;
}> = ({ initial, activePageNum, totalPages, onSave, onClose }) => {
  const [cfg, setCfg] = useState<WatermarkConfig>({
    position: 'center',
    scope: 'all',
    rangeExpr: `1-${totalPages}`,
    fontSize: 44,
    batesPrefix: '',
    batesStart: 1,
    ...initial,
  });

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full max-w-md shadow-2xl space-y-3 text-xs max-h-[90dvh] overflow-y-auto scrollbar-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Droplets className="w-4 h-4 text-blue-600" />
            <span>Watermark, Header &amp; Bates</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <input
            value={cfg.text}
            onChange={(e) => setCfg({ ...cfg, text: e.target.value })}
            placeholder="Watermark text (e.g. CONFIDENTIAL)"
            className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-slate-500">Opacity {Math.round(cfg.opacity * 100)}%</span>
              <input
                type="range"
                min={10}
                max={65}
                value={Math.round(cfg.opacity * 100)}
                onChange={(e) => setCfg({ ...cfg, opacity: Number(e.target.value) / 100 })}
                className="w-full accent-blue-600"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">Size {cfg.fontSize || 44}pt</span>
              <input
                type="range"
                min={18}
                max={96}
                value={cfg.fontSize || 44}
                onChange={(e) => setCfg({ ...cfg, fontSize: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2 items-center">
            <label className="space-y-1">
              <span className="text-slate-500">Angle {cfg.angle}°</span>
              <input
                type="range"
                min={-60}
                max={60}
                value={cfg.angle}
                onChange={(e) => setCfg({ ...cfg, angle: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </label>
            <select
              value={cfg.position || 'center'}
              onChange={(e) => setCfg({ ...cfg, position: e.target.value as 'center' | 'top' | 'bottom' })}
              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="center">Center</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
            <label className="flex items-center justify-between px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500">Color</span>
              <input type="color" value={cfg.color} onChange={(e) => setCfg({ ...cfg, color: e.target.value })} className="w-6 h-5 bg-transparent border-0" />
            </label>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-2.5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={cfg.headerLeft}
              onChange={(e) => setCfg({ ...cfg, headerLeft: e.target.value })}
              placeholder="Header Left ({date})"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
            <input
              value={cfg.headerRight}
              onChange={(e) => setCfg({ ...cfg, headerRight: e.target.value })}
              placeholder="Header Right ({page}/{total})"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <input
            value={cfg.footerCenter}
            onChange={(e) => setCfg({ ...cfg, footerCenter: e.target.value })}
            placeholder="Footer Center"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={cfg.batesPrefix || ''}
              onChange={(e) => setCfg({ ...cfg, batesPrefix: e.target.value })}
              placeholder="Bates Prefix (DOC-)"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
            <input
              type="number"
              min={1}
              value={cfg.batesStart || 1}
              onChange={(e) => setCfg({ ...cfg, batesStart: Math.max(1, Number(e.target.value) || 1) })}
              placeholder="Start #"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cfg.pageNumbers}
                onChange={(e) => setCfg({ ...cfg, pageNumbers: e.target.checked })}
                className="accent-blue-600 rounded"
              />
              <span>Page Numbers</span>
            </label>
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
              {(['all', 'current', 'range'] as const).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setCfg({ ...cfg, scope: sc })}
                  className={`px-2 py-0.5 rounded capitalize ${
                    (cfg.scope || 'all') === sc ? 'bg-white dark:bg-slate-900 font-semibold shadow-xs' : 'text-slate-500'
                  }`}
                >
                  {sc === 'current' ? `p.${activePageNum}` : sc}
                </button>
              ))}
            </div>
          </div>

          {cfg.scope === 'range' && (
            <input
              value={cfg.rangeExpr || ''}
              onChange={(e) => setCfg({ ...cfg, rangeExpr: e.target.value })}
              placeholder="e.g. 1-4, 7"
              className="w-full px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-1.5 pt-1">
          <button
            type="button"
            onClick={() =>
              onSave(
                {
                  text: '',
                  opacity: 0.22,
                  angle: 35,
                  color: '#DC2626',
                  fontSize: 44,
                  position: 'center',
                  scope: 'all',
                  rangeExpr: `1-${totalPages}`,
                  headerLeft: '',
                  headerRight: '',
                  footerCenter: '',
                  pageNumbers: false,
                  batesPrefix: '',
                  batesStart: 1,
                },
                false
              )
            }
            className="px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300"
          >
            Clear
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSave(cfg, false)}
              className="px-3 py-1.5 border border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => onSave(cfg, true)}
              className="px-3 py-1.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
            >
              Burn to PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* 5. Print Options Modal */
export const PDFPrintModal: React.FC<{
  activePageNum: number;
  totalPages: number;
  onPrint: (opts: {
    scope: 'all' | 'current' | 'range';
    rangeExpr: string;
    subset: 'all' | 'odd' | 'even';
    orientation: 'auto' | 'portrait' | 'landscape';
    includeAnnotations: boolean;
  }) => void;
  onClose: () => void;
}> = ({ activePageNum, totalPages, onPrint, onClose }) => {
  const [scope, setScope] = useState<'all' | 'current' | 'range'>('all');
  const [rangeExpr, setRangeExpr] = useState(`1-${Math.min(5, totalPages)}`);
  const [subset, setSubset] = useState<'all' | 'odd' | 'even'>('all');
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onPrint({ scope, rangeExpr, subset, orientation, includeAnnotations });
        }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full max-w-xs shadow-2xl space-y-3 text-xs max-h-[92dvh] overflow-y-auto scrollbar-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Printer className="w-4 h-4 text-blue-600" />
            <span>Print PDF</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          {[
            { id: 'all', label: `All Pages (1–${totalPages})` },
            { id: 'current', label: `Current Page (${activePageNum})` },
            { id: 'range', label: 'Page Range' },
          ].map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="printScope"
                checked={scope === opt.id}
                onChange={() => setScope(opt.id as typeof scope)}
                className="accent-blue-600"
              />
              <span>{opt.label}</span>
            </label>
          ))}
          {scope === 'range' && (
            <input
              value={rangeExpr}
              onChange={(e) => setRangeExpr(e.target.value)}
              placeholder="e.g. 1-4, 7, 10-12"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
          <select
            value={subset}
            onChange={(e) => setSubset(e.target.value as typeof subset)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          >
            <option value="all">All Pages</option>
            <option value="odd">Odd Only</option>
            <option value="even">Even Only</option>
          </select>
          <select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as typeof orientation)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          >
            <option value="auto">Auto Orient</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeAnnotations}
            onChange={(e) => setIncludeAnnotations(e.target.checked)}
            className="accent-blue-600"
          />
          <span>Include Markups &amp; Watermark</span>
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg">
            Cancel
          </button>
          <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
            Print
          </button>
        </div>
      </form>
    </div>
  );
};

/* 6. Multi-File Combine Builder Modal (PDFs + Images) */
export type CombineQueueItem = {
  id: string;
  kind: 'pdf' | 'image';
  name: string;
  bytes: ArrayBuffer;
  mimeType?: string;
};

export const PDFCombineModal: React.FC<{
  initialItems: CombineQueueItem[];
  onMerge: (items: CombineQueueItem[]) => void;
  onClose: () => void;
}> = ({ initialItems, onMerge, onClose }) => {
  const [items, setItems] = useState<CombineQueueItem[]>(initialItems);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: CombineQueueItem[] = [];
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: isPdf ? 'pdf' : 'image',
        name: file.name,
        bytes: buf,
        mimeType: file.type,
      });
    }
    setItems((prev) => [...prev, ...next]);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      copy.splice(target, 0, removed);
      return copy;
    });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full max-w-md shadow-2xl space-y-3 text-xs max-h-[92dvh] overflow-y-auto scrollbar-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Merge className="w-4 h-4 text-blue-600" />
            <span>Combine PDFs & Images</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            void handleAddFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="max-h-56 overflow-y-auto scrollbar-none divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2 px-2.5 py-2">
              {item.kind === 'pdf' ? <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" /> : <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
              <span className="flex-1 truncate font-medium">{item.name}</span>
              <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30">
                <ArrowUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30">
                <ArrowDown className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))} className="p-1 text-slate-400 hover:text-red-600">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" /> Add Files
          </button>
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => onMerge(items)}
            className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            Merge ({items.length})
          </button>
        </div>
      </div>
    </div>
  );
};

/* 7. Advanced Split / Extract Range Modal */
export const PDFSplitModal: React.FC<{
  activePageNum: number;
  totalPages: number;
  onSplitAfterPage: () => void;
  onSplitEveryN: (n: number) => void;
  onExtractRange: (expr: string) => void;
  onClose: () => void;
}> = ({ activePageNum, totalPages, onSplitAfterPage, onSplitEveryN, onExtractRange, onClose }) => {
  const [mode, setMode] = useState<'after' | 'every' | 'range'>('after');
  const [everyN, setEveryN] = useState(Math.max(1, Math.min(5, Math.ceil(totalPages / 2))));
  const [rangeExpr, setRangeExpr] = useState(`1-${Math.min(3, totalPages)}`);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full max-w-xs shadow-2xl space-y-3 text-xs max-h-[92dvh] overflow-y-auto scrollbar-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Scissors className="w-4 h-4 text-blue-600" />
            <span>Split & Extract</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === 'after'} onChange={() => setMode('after')} className="accent-blue-600" />
            <span>Split After Page {activePageNum} (2 PDFs)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === 'every'} onChange={() => setMode('every')} className="accent-blue-600" />
            <span>Split Every</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={everyN}
              onChange={(e) => setEveryN(Math.max(1, Number(e.target.value) || 1))}
              className="w-12 px-1.5 py-0.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 font-mono text-center"
            />
            <span>Pages</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} className="accent-blue-600" />
            <span>Extract Pages</span>
          </label>
          {mode === 'range' && (
            <input
              value={rangeExpr}
              onChange={(e) => setRangeExpr(e.target.value)}
              placeholder="e.g. 1-4, 7, 10-12"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (mode === 'after') onSplitAfterPage();
              else if (mode === 'every') onSplitEveryN(everyN);
              else onExtractRange(rangeExpr);
            }}
            className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
          >
            Run
          </button>
        </div>
      </div>
    </div>
  );
};

/* 8. Document Info & Metadata Editor Modal */
export const PDFMetadataModal: React.FC<{
  fileName: string;
  docMeta?: PDFDocMetadata | null;
  pageCount: number;
  byteLength: number;
  annotationCount: number;
  onSaveMeta: (meta: { title: string; author: string; subject: string; keywords: string }) => void;
  onClose: () => void;
}> = ({ fileName, docMeta, pageCount, byteLength, annotationCount, onSaveMeta, onClose }) => {
  const [title, setTitle] = useState(docMeta?.title || '');
  const [author, setAuthor] = useState(docMeta?.author || '');
  const [subject, setSubject] = useState(docMeta?.subject || '');
  const [keywords, setKeywords] = useState(docMeta?.keywords || '');

  useEffect(() => {
    setTitle(docMeta?.title || '');
    setAuthor(docMeta?.author || '');
    setSubject(docMeta?.subject || '');
    setKeywords(docMeta?.keywords || '');
  }, [docMeta]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4">
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSaveMeta({ title, author, subject, keywords });
        }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full max-w-sm shadow-2xl space-y-3 text-xs max-h-[92dvh] overflow-y-auto scrollbar-none"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Document Properties</span>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {[
            { k: 'File', v: fileName },
            { k: 'Pages', v: String(pageCount) },
            { k: 'Page Size', v: docMeta?.pageSizeLabel || '—' },
            { k: 'Size', v: `${Math.max(1, Math.round(byteLength / 1024))} KB` },
            { k: 'PDF Version', v: docMeta?.pdfVersion || '—' },
            { k: 'Creator', v: docMeta?.creator || docMeta?.producer || '—' },
            { k: 'Annotations', v: String(annotationCount) },
          ].map((r) => (
            <div key={r.k} className="py-1.5 flex items-center justify-between gap-3">
              <span className="text-slate-500">{r.k}</span>
              <span className="font-mono text-right truncate text-slate-800 dark:text-slate-200">{r.v}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Keywords (comma separated)"
            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSaveMeta({ title: '', author: '', subject: '', keywords: '' })}
            className="px-3 py-1.5 border border-red-200 dark:border-red-900 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Clear All
          </button>
          <button type="submit" className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
            <Check className="w-3.5 h-3.5" /> Save Metadata
          </button>
        </div>
      </form>
    </div>
  );
};

/* 9. Keyboard Shortcuts Modal */
export const PDFShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4">
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full max-w-md shadow-2xl space-y-3 text-xs max-h-[92dvh] overflow-y-auto scrollbar-none"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Keyboard className="w-4 h-4 text-blue-600" />
          <span>Shortcuts</span>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { k: 'Ctrl / ⌘ + F', v: 'Search PDF' },
          { k: 'Ctrl / ⌘ + C/V', v: 'Copy / Paste Markup' },
          { k: 'R', v: 'Reader Mode' },
          { k: 'F', v: 'Fullscreen' },
          { k: 'S', v: 'Split View' },
          { k: '+ / - / 0', v: 'Zoom / Fit Width' },
          { k: 'Space + Drag', v: 'Pan Page' },
          { k: 'Ctrl + Z / Y', v: 'Undo / Redo' },
          { k: '← / →', v: 'Prev / Next Page' },
          { k: 'Del / Backspace', v: 'Delete Selected' },
          { k: 'Right Click', v: 'Context Menu' },
        ].map((row) => (
          <div key={row.k} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-300">{row.v}</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700">
              {row.k}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  </div>
);
