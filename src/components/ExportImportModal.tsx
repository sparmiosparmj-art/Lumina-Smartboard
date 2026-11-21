import React, { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Camera,
  Download,
  FileJson,
  Image as ImageIcon,
  Monitor,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { BoardPage, WorkspaceDocument } from '../types/smartboard';
import { exportPageToSelfContainedSVG, renderPageToHiResDataUrl } from '../utils/canvasRenderer';
import { exportBoardPagesToPDF, exportPagesToPPTX } from '../utils/pdfPptx';

type ExportImportModalProps = {
  open: boolean;
  onClose: () => void;
  workspace: WorkspaceDocument;
  activePage: BoardPage;
  selectedIds: Set<string>;
  viewportBox?: { minX: number; minY: number; contentW: number; contentH: number };
  onImportFiles: (files: FileList) => void;
  onImportJSONBoard: (jsonText: string) => void;
  onInsertCapturedImage: (dataUrl: string, title: string) => void;
};

export const ExportImportModal: React.FC<ExportImportModalProps> = ({
  open,
  onClose,
  workspace,
  activePage,
  selectedIds,
  viewportBox,
  onImportFiles,
  onImportJSONBoard,
  onInsertCapturedImage,
}) => {
  const [tab, setTab] = useState<'export' | 'import' | 'capture'>('export');
  const [format, setFormat] = useState<'pdf' | 'png' | 'jpg' | 'svg' | 'pptx' | 'zip' | 'json'>('pdf');
  const [scope, setScope] = useState<'page' | 'viewport' | 'selected' | 'workspace'>('page');
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('fit');
  const [resolution, setResolution] = useState<1 | 2 | 3>(2);
  const [quality, setQuality] = useState(0.94);
  const [transparentBg, setTransparentBg] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    if (!open && cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    return () => {
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, cameraStream]);

  useEffect(() => {
    if (cameraStream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  if (!open) return null;

  const triggerDownload = (href: string, fileName: string, revokeAfter = false) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.click();
    if (revokeAfter) {
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const baseName = workspace.name.replace(/\s+/g, '_');
      const onlyIds = scope === 'selected' && selectedIds.size > 0 ? selectedIds : undefined;
      const useViewport = scope === 'viewport' ? viewportBox : undefined;
      const targetPages = scope === 'workspace' ? workspace.pages : [activePage];
      const w = 1280 * resolution;
      const h = 720 * resolution;

      if (format === 'json') {
        const { hostKey: _privateHostKey, ...safeWorkspace } = workspace;
        const payload = scope === 'workspace' ? safeWorkspace : activePage;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        triggerDownload(URL.createObjectURL(blob), `${baseName}.lumina.json`, true);
      } else if (format === 'svg') {
        let svg = await exportPageToSelfContainedSVG(activePage, onlyIds);
        if (transparentBg) {
          svg = svg.replace(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+" fill="[^"]+"\/>/, '');
        }
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        triggerDownload(URL.createObjectURL(blob), `${baseName}_${activePage.name}.svg`, true);
      } else if (format === 'png' || format === 'jpg') {
        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        for (let idx = 0; idx < targetPages.length; idx++) {
          const p = targetPages[idx];
          const url = await renderPageToHiResDataUrl(p, w, h, mime, quality, {
            onlyObjectIds: onlyIds,
            scaleMultiplier: useViewport ? resolution : 1,
            transparentBg: format === 'png' && transparentBg,
            viewportBox: useViewport,
          });
          triggerDownload(url, `${baseName}_${idx + 1}_${p.name}.${format}`);
        }
      } else if (format === 'zip') {
        const zip = new JSZip();
        const pagesToZip = scope === 'workspace' ? workspace.pages : [activePage];
        for (let idx = 0; idx < pagesToZip.length; idx++) {
          const p = pagesToZip[idx];
          const dataUrl = await renderPageToHiResDataUrl(p, w, h, 'image/png', quality, {
            onlyObjectIds: onlyIds,
            scaleMultiplier: useViewport ? resolution : 1,
            transparentBg,
            viewportBox: useViewport,
          });
          const b64 = dataUrl.split(',')[1] || '';
          const safePageName = p.name.replace(/[^a-zA-Z0-9_-]+/g, '_');
          zip.file(`${String(idx + 1).padStart(2, '0')}_${safePageName}.png`, b64, { base64: true });
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(URL.createObjectURL(zipBlob), `${baseName}_pages.zip`, true);
      } else if (format === 'pdf') {
        const rendered = await Promise.all(
          targetPages.map(async (p) => ({
            name: p.name,
            imageDataUrl: await renderPageToHiResDataUrl(p, w, h, 'image/png', quality, {
              onlyObjectIds: onlyIds,
              scaleMultiplier: useViewport ? resolution : 1,
              viewportBox: useViewport,
            }),
            width: w,
            height: h,
          }))
        );
        const bytes = await exportBoardPagesToPDF(rendered, pageSize);
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        triggerDownload(URL.createObjectURL(blob), `${baseName}.pdf`, true);
      } else if (format === 'pptx') {
        const blob = await exportPagesToPPTX(targetPages, workspace.name);
        triggerDownload(URL.createObjectURL(blob), `${baseName}.pptx`, true);
      }
    } catch (err) {
      setExportError(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const startCamera = async () => {
    setCaptureError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCaptureError('Camera capture is not supported in this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera permission was denied or unavailable.';
      setCaptureError(msg);
    }
  };

  const snapCamera = () => {
    if (!cameraVideoRef.current) return;
    const v = cameraVideoRef.current;
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    onInsertCapturedImage(c.toDataURL('image/png'), 'Camera Capture');
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    onClose();
  };

  const captureScreenOnce = async () => {
    setCaptureError(null);
    let stream: MediaStream | null = null;
    const video = document.createElement('video');
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setCaptureError('Screen capture is not supported in this browser.');
        return;
      }
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1 && video.videoWidth > 0) {
          resolve();
          return;
        }
        const onMeta = () => {
          video.removeEventListener('loadedmetadata', onMeta);
          resolve();
        };
        video.addEventListener('loadedmetadata', onMeta);
        setTimeout(resolve, 1200);
      });
      await video.play();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const c = document.createElement('canvas');
      c.width = video.videoWidth || 1280;
      c.height = video.videoHeight || 720;
      c.getContext('2d')?.drawImage(video, 0, 0, c.width, c.height);
      onInsertCapturedImage(c.toDataURL('image/png'), 'Screen Capture');
      onClose();
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        setCaptureError(err.message);
      }
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-6">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
            Export, Import &amp; Media Capture Center
          </h2>
          <button
            onClick={() => {
              cameraStream?.getTracks().forEach((t) => t.stop());
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 sm:px-5 pt-2.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
          {[
            { id: 'export', label: 'Export Workspace', icon: Download },
            { id: 'import', label: 'Import Files & Media', icon: Upload },
            { id: 'capture', label: 'Camera & Screen Capture', icon: Camera },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 studio-scroll">
          {tab === 'export' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Format</label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[
                    { id: 'pdf', label: 'PDF' },
                    { id: 'png', label: 'PNG' },
                    { id: 'jpg', label: 'JPG' },
                    { id: 'svg', label: 'SVG' },
                    { id: 'pptx', label: 'PPTX' },
                    { id: 'zip', label: 'ZIP' },
                    { id: 'json', label: 'JSON' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFormat(f.id as typeof format)}
                      className={`py-2 text-xs font-semibold rounded-lg border ${
                        format === f.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Export Scope</label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as typeof scope)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="page">Current Page / Slide</option>
                    {viewportBox && <option value="viewport">Current Viewport Camera</option>}
                    <option value="workspace">Complete Workspace ({workspace.pages.length} pages)</option>
                    <option value="selected" disabled={selectedIds.size === 0}>
                      Selected Objects ({selectedIds.size})
                    </option>
                  </select>
                </div>

                {format === 'pdf' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Page Size</label>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value as typeof pageSize)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      <option value="fit">Fit Content Aspect</option>
                      <option value="a4">A4 Landscape</option>
                      <option value="letter">US Letter Landscape</option>
                    </select>
                  </div>
                )}

                {(format === 'png' || format === 'jpg' || format === 'pdf' || format === 'zip') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Resolution</label>
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(Number(e.target.value) as 1 | 2 | 3)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      <option value={1}>1x Standard (1280×720)</option>
                      <option value={2}>2x High-DPI (2560×1440)</option>
                      <option value={3}>3x Ultra Print (3840×2160)</option>
                    </select>
                  </div>
                )}

                {format === 'jpg' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Quality ({Math.round(quality * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.05}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              {(format === 'png' || format === 'svg' || format === 'zip') && (
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transparentBg}
                    onChange={(e) => setTransparentBg(e.target.checked)}
                  />
                  Transparent background (no solid backdrop or grid)
                </label>
              )}

              {exportError && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{exportError}</div>}

              <button
                disabled={exporting}
                onClick={handleExport}
                className="w-full py-2.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {exporting ? 'Preparing Hi-Res Export...' : `Download ${format === 'zip' ? 'ZIP (PNG Pack)' : format.toUpperCase()} Export`}
              </button>
            </div>
          )}

          {tab === 'import' && (
            <div className="space-y-3">
              {importError && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{importError}</div>}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.pptx,.ppt,.png,.jpg,.jpeg,.svg,.mp3,.wav,.ogg,.mp4,.webm,image/*,audio/*,video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    onImportFiles(e.target.files);
                    onClose();
                  }
                  e.target.value = '';
                }}
              />
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setImportError(null);
                    f.text().then((txt) => {
                      onImportJSONBoard(txt);
                      onClose();
                    }).catch((err: unknown) => {
                      setImportError(err instanceof Error ? `Could not read this file: ${err.message}` : 'Could not read this file.');
                    });
                  }
                  e.target.value = '';
                }}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl hover:border-blue-500 text-center space-y-2"
              >
                <ImageIcon className="w-8 h-8 mx-auto text-blue-600" />
                <div className="text-xs font-semibold">Upload PDF, PPTX, PNG, JPG, SVG, Audio, Video or File Attachment</div>
                <div className="text-[11px] text-slate-500">Original files are preserved securely on the server with signed URLs.</div>
              </button>

              <button
                onClick={() => jsonInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FileJson className="w-4 h-4 text-emerald-600" /> Import Native LuminaBoard JSON Document
              </button>
            </div>
          )}

          {tab === 'capture' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={startCamera}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-left space-y-1"
                >
                  <Camera className="w-5 h-5 text-blue-600" />
                  <div className="text-xs font-semibold">Camera Photo Capture</div>
                  <div className="text-[11px] text-slate-500">Snap whiteboard notes, textbook pages, or homework directly onto the board.</div>
                </button>
                <button
                  onClick={captureScreenOnce}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-left space-y-1"
                >
                  <Monitor className="w-5 h-5 text-emerald-600" />
                  <div className="text-xs font-semibold">Screen / Window Capture</div>
                  <div className="text-[11px] text-slate-500">Capture a frame from any application or browser tab directly onto the canvas.</div>
                </button>
              </div>

              {captureError && (
                <div className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300">
                  {captureError}
                </div>
              )}

              {cameraStream && (
                <div className="space-y-2">
                  <video ref={cameraVideoRef} autoPlay playsInline className="w-full max-h-64 rounded-lg bg-black object-contain" />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        cameraStream.getTracks().forEach((t) => t.stop());
                        setCameraStream(null);
                      }}
                      className="px-3 py-1.5 text-xs border rounded-lg"
                    >
                      Cancel
                    </button>
                    <button onClick={snapCamera} className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg flex items-center gap-1">
                      <Video className="w-3.5 h-3.5" /> Snap &amp; Place on Board
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
