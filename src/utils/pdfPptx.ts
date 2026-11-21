import JSZip from 'jszip';
import katex from 'katex';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PasswordResponses, TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import type {
  BoardObject,
  BoardPage,
  ImageObject,
  RichBlock,
  RichRun,
  ShapeKind,
  TableObject,
  TextAlignMode,
} from '../types/smartboard';
import { uid } from './geometry';
import { getEffectiveRichBlocks } from './richText';
import { drawBoardObject } from './canvasRenderer';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export type { PDFDocumentProxy, RenderTask };

export type PDFTextWord = {
  str: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // normalized 0..1
  h: number; // normalized 0..1
};

export type PDFOutlineItem = {
  title: string;
  pageNumber: number | null;
  url?: string | null;
  custom?: boolean;
  items: PDFOutlineItem[];
};

export type PDFPageLink = {
  id: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // normalized 0..1
  h: number; // normalized 0..1
  targetPage?: number;
  url?: string;
};

export type PDFFormWidget = {
  id: string;
  fieldName: string;
  fieldType: 'text' | 'checkbox' | 'radio' | 'select';
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // normalized 0..1
  h: number; // normalized 0..1
  defaultValue: string | boolean;
  buttonValue?: string;
  options?: { exportValue: string; displayValue: string }[];
  multiline?: boolean;
  readOnly?: boolean;
};

export type LoadedPDFPage = {
  pageNumber: number;
  width: number;
  height: number;
  ptWidth?: number;
  ptHeight?: number;
  dataUrl: string;
  text: string;
  textItems?: PDFTextWord[];
  thumbLoaded?: boolean;
  textLoaded?: boolean;
};

export async function openPDFDocument(
  arrayBuffer: ArrayBuffer,
  onPasswordPrompt?: (reason: 'need_password' | 'incorrect_password') => Promise<string | null>
): Promise<PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer.slice(0),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    useSystemFonts: true,
  });
  if (onPasswordPrompt) {
    loadingTask.onPassword = (updatePassword: (pw: string) => void, reason: number) => {
      const mode = reason === PasswordResponses.INCORRECT_PASSWORD ? 'incorrect_password' : 'need_password';
      void onPasswordPrompt(mode).then((pw) => {
        if (pw !== null) updatePassword(pw);
        else loadingTask.destroy();
      });
    };
  }
  return loadingTask.promise;
}

async function resolvePdfDestinationPage(pdfDoc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    let resolved: unknown = dest;
    if (typeof dest === 'string') {
      resolved = await pdfDoc.getDestination(dest);
    }
    if (Array.isArray(resolved) && resolved.length > 0) {
      const ref = resolved[0];
      if (typeof ref === 'number') return ref + 1;
      if (ref && typeof ref === 'object') {
        const idx = await pdfDoc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
        return idx + 1;
      }
    }
  } catch {
    // ignore unresolved destinations
  }
  return null;
}

export async function extractPDFOutline(pdfDoc: PDFDocumentProxy): Promise<PDFOutlineItem[]> {
  try {
    const raw = await pdfDoc.getOutline();
    if (!raw || raw.length === 0) return [];
    const convert = async (nodes: typeof raw): Promise<PDFOutlineItem[]> => {
      const out: PDFOutlineItem[] = [];
      for (const n of nodes) {
        const pageNumber = n.dest ? await resolvePdfDestinationPage(pdfDoc, n.dest) : null;
        const children = n.items?.length ? await convert(n.items) : [];
        out.push({
          title: (n.title || 'Section').trim(),
          pageNumber,
          url: n.url || null,
          items: children,
        });
      }
      return out;
    };
    return await convert(raw);
  } catch {
    return [];
  }
}

export async function extractPDFPageLinks(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number
): Promise<PDFPageLink[]> {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const annots = await page.getAnnotations({ intent: 'display' });
    const links: PDFPageLink[] = [];
    for (let i = 0; i < annots.length; i++) {
      const a = annots[i] as {
        subtype?: string;
        rect?: number[];
        dest?: unknown;
        url?: string;
        unsafeUrl?: string;
      };
      if (a.subtype !== 'Link' || !Array.isArray(a.rect) || a.rect.length < 4) continue;
      const p1 = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
      const p2 = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
      const x1 = Math.min(p1[0], p2[0]);
      const y1 = Math.min(p1[1], p2[1]);
      const x2 = Math.max(p1[0], p2[0]);
      const y2 = Math.max(p1[1], p2[1]);
      const nx = Math.max(0, Math.min(1, x1 / Math.max(1, viewport.width)));
      const ny = Math.max(0, Math.min(1, y1 / Math.max(1, viewport.height)));
      const nw = Math.max(0, Math.min(1 - nx, (x2 - x1) / Math.max(1, viewport.width)));
      const nh = Math.max(0, Math.min(1 - ny, (y2 - y1) / Math.max(1, viewport.height)));
      if (nw < 0.004 || nh < 0.004) continue;
      const url = a.url || a.unsafeUrl;
      const targetPage = !url && a.dest ? (await resolvePdfDestinationPage(pdfDoc, a.dest)) ?? undefined : undefined;
      if (url || targetPage) {
        links.push({
          id: `lnk-${pageNumber}-${i}`,
          x: nx,
          y: ny,
          w: nw,
          h: nh,
          targetPage,
          url,
        });
      }
    }
    return links;
  } catch {
    return [];
  }
}

async function extractPageTextAndItems(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
  viewportScale: number
): Promise<{ pageText: string; textItems: PDFTextWord[] }> {
  const viewport = page.getViewport({ scale: viewportScale });
  const textContent = await page.getTextContent();
  const textItems: PDFTextWord[] = [];
  const strParts: string[] = [];
  for (const item of textContent.items) {
    if (!('str' in item) || !item.str) continue;
    const trimmed = item.str.trim();
    if (!trimmed) {
      if ('hasEOL' in item && item.hasEOL) strParts.push('\n');
      continue;
    }
    strParts.push(item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' '));
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;
    const itemW = Math.max(4, (item.width || 8) * viewportScale);
    const nx = Math.max(0, Math.min(1, tx[4] / Math.max(1, viewport.width)));
    const ny = Math.max(0, Math.min(1, (tx[5] - fontHeight * 0.88) / Math.max(1, viewport.height)));
    const nw = Math.min(1 - nx, itemW / Math.max(1, viewport.width));
    const nh = Math.min(1 - ny, (fontHeight * 1.18) / Math.max(1, viewport.height));
    textItems.push({ str: item.str, x: nx, y: ny, w: nw, h: nh });
  }
  const pageText = strParts.join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { pageText, textItems };
}

export type PDFDocMetadata = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  pdfVersion?: string;
  pageCount: number;
  pageSizeLabel?: string;
};

export async function extractPDFMetadata(pdfDoc: PDFDocumentProxy): Promise<PDFDocMetadata> {
  const pageCount = pdfDoc.numPages;
  let title: string | undefined;
  let author: string | undefined;
  let subject: string | undefined;
  let keywords: string | undefined;
  let creator: string | undefined;
  let producer: string | undefined;
  let pdfVersion: string | undefined;
  let pageSizeLabel: string | undefined;
  try {
    const meta = await pdfDoc.getMetadata();
    const info = (meta?.info || {}) as Record<string, unknown>;
    if (typeof info.Title === 'string' && info.Title.trim()) title = info.Title.trim();
    if (typeof info.Author === 'string' && info.Author.trim()) author = info.Author.trim();
    if (typeof info.Subject === 'string' && info.Subject.trim()) subject = info.Subject.trim();
    if (typeof info.Keywords === 'string' && info.Keywords.trim()) keywords = info.Keywords.trim();
    if (typeof info.Creator === 'string' && info.Creator.trim()) creator = info.Creator.trim();
    if (typeof info.Producer === 'string' && info.Producer.trim()) producer = info.Producer.trim();
    if (typeof info.PDFFormatVersion === 'string' && info.PDFFormatVersion.trim()) {
      pdfVersion = info.PDFFormatVersion.trim();
    }
  } catch {
    // ignore metadata read failure
  }
  try {
    if (pageCount > 0) {
      const p1 = await pdfDoc.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      const mmW = Math.round((vp.width * 25.4) / 72);
      const mmH = Math.round((vp.height * 25.4) / 72);
      pageSizeLabel = `${mmW} × ${mmH} mm (${Math.round(vp.width)} × ${Math.round(vp.height)} pt)`;
    }
  } catch {
    // ignore page size failure
  }
  return { title, author, subject, keywords, creator, producer, pdfVersion, pageCount, pageSizeLabel };
}

export async function extractPDFPageWidgets(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number
): Promise<PDFFormWidget[]> {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const annots = await page.getAnnotations({ intent: 'display' });
    const widgets: PDFFormWidget[] = [];
    for (let i = 0; i < annots.length; i++) {
      const a = annots[i] as {
        subtype?: string;
        rect?: number[];
        fieldName?: string;
        fieldType?: string;
        fieldValue?: unknown;
        defaultFieldValue?: unknown;
        checkBox?: boolean;
        radioButton?: boolean;
        buttonValue?: string;
        exportValue?: string;
        options?: { exportValue?: string; displayValue?: string }[];
        multiLine?: boolean;
        readOnly?: boolean;
        fieldFlags?: number;
      };
      if (a.subtype !== 'Widget' || !Array.isArray(a.rect) || a.rect.length < 4 || !a.fieldName) continue;
      if (a.fieldType === 'Btn' && !a.checkBox && !a.radioButton) continue;
      const p1 = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
      const p2 = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
      const x1 = Math.min(p1[0], p2[0]);
      const y1 = Math.min(p1[1], p2[1]);
      const x2 = Math.max(p1[0], p2[0]);
      const y2 = Math.max(p1[1], p2[1]);
      const nx = Math.max(0, Math.min(1, x1 / Math.max(1, viewport.width)));
      const ny = Math.max(0, Math.min(1, y1 / Math.max(1, viewport.height)));
      const nw = Math.max(0.012, Math.min(1 - nx, (x2 - x1) / Math.max(1, viewport.width)));
      const nh = Math.max(0.012, Math.min(1 - ny, (y2 - y1) / Math.max(1, viewport.height)));

      let fType: PDFFormWidget['fieldType'] = 'text';
      let defaultValue: string | boolean = '';
      if (a.fieldType === 'Btn') {
        if (a.radioButton) {
          fType = 'radio';
          defaultValue = a.fieldValue ? String(a.fieldValue) : '';
        } else {
          fType = 'checkbox';
          defaultValue = Boolean(a.fieldValue && String(a.fieldValue).toLowerCase() !== 'off');
        }
      } else if (a.fieldType === 'Ch') {
        fType = 'select';
        defaultValue = Array.isArray(a.fieldValue) ? String(a.fieldValue[0] || '') : String(a.fieldValue || '');
      } else {
        fType = 'text';
        defaultValue = String(a.fieldValue ?? a.defaultFieldValue ?? '');
      }

      widgets.push({
        id: `fld-${pageNumber}-${i}-${a.fieldName}`,
        fieldName: a.fieldName,
        fieldType: fType,
        x: nx,
        y: ny,
        w: nw,
        h: nh,
        defaultValue,
        buttonValue: a.buttonValue || a.exportValue,
        options: Array.isArray(a.options)
          ? a.options.map((o) => ({
              exportValue: String(o.exportValue ?? o.displayValue ?? ''),
              displayValue: String(o.displayValue ?? o.exportValue ?? ''),
            }))
          : undefined,
        multiline: Boolean(a.multiLine),
        readOnly: Boolean(a.readOnly),
      });
    }
    return widgets;
  } catch {
    return [];
  }
}

export async function renderOfficialPDFTextLayer(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  container: HTMLElement,
  displayWidthPx: number
): Promise<TextLayer | null> {
  const page = await pdfDoc.getPage(pageNumber);
  const baseVp = page.getViewport({ scale: 1 });
  const scale = displayWidthPx / Math.max(1, baseVp.width);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();
  container.innerHTML = '';
  container.style.setProperty('--total-scale-factor', String(scale));
  const layer = new TextLayer({
    textContentSource: textContent,
    container,
    viewport,
  });
  await layer.render();
  return layer;
}

export async function extractSinglePageText(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number
): Promise<{ pageText: string; textItems: PDFTextWord[] }> {
  const page = await pdfDoc.getPage(pageNumber);
  return extractPageTextAndItems(page, 1);
}

export async function renderSinglePageThumbnail(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  thumbScale = 0.34
): Promise<{ dataUrl: string; width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNumber);
  const thumbViewport = page.getViewport({ scale: thumbScale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(thumbViewport.width));
  canvas.height = Math.max(1, Math.round(thumbViewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport: thumbViewport, background: '#ffffff' }).promise;
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), width: canvas.width, height: canvas.height };
}

export async function loadPDFDocumentAndThumbnails(
  arrayBuffer: ArrayBuffer,
  thumbScale = 0.34,
  onPasswordPrompt?: (reason: 'need_password' | 'incorrect_password') => Promise<string | null>
): Promise<{ pdfDoc: PDFDocumentProxy; pages: LoadedPDFPage[]; fullText: string; pageCount: number }> {
  const pdfDoc = await openPDFDocument(arrayBuffer, onPasswordPrompt);
  const pages: LoadedPDFPage[] = [];
  const textChunks: string[] = [];
  const eagerLimit = Math.min(pdfDoc.numPages, 12);

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    if (i <= eagerLimit) {
      const thumbViewport = page.getViewport({ scale: thumbScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(thumbViewport.width));
      canvas.height = Math.max(1, Math.round(thumbViewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, canvas, viewport: thumbViewport, background: '#ffffff' }).promise;
      }
      const { pageText, textItems } = await extractPageTextAndItems(page, 1);
      textChunks.push(`[Page ${i}] ${pageText}`);
      pages.push({
        pageNumber: i,
        width: canvas.width,
        height: canvas.height,
        ptWidth: baseViewport.width,
        ptHeight: baseViewport.height,
        dataUrl: canvas.toDataURL('image/jpeg', 0.82),
        text: pageText,
        textItems,
        thumbLoaded: true,
        textLoaded: true,
      });
      if (i % 4 === 0 && i < eagerLimit) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    } else {
      // Lightweight placeholder shell for instant open on 100+ page documents; progressively hydrated in background
      pages.push({
        pageNumber: i,
        width: Math.max(1, Math.round(baseViewport.width * thumbScale)),
        height: Math.max(1, Math.round(baseViewport.height * thumbScale)),
        ptWidth: baseViewport.width,
        ptHeight: baseViewport.height,
        dataUrl: '',
        text: '',
        textItems: [],
        thumbLoaded: false,
        textLoaded: false,
      });
    }
  }

  return {
    pdfDoc,
    pages,
    fullText: textChunks.join('\n\n'),
    pageCount: pdfDoc.numPages,
  };
}

export function startPDFPageCanvasRender(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  targetCanvas: HTMLCanvasElement,
  targetCssWidthPx: number
): { cancel: () => void; promise: Promise<void> } {
  let cancelled = false;
  let activeTask: RenderTask | null = null;

  const promise = (async () => {
    const page = await pdfDoc.getPage(pageNumber);
    if (cancelled) return;

    const baseViewport = page.getViewport({ scale: 1 });
    // Supersample at >= 2x (and up to 3x on Retina/mobile) while capping max bitmap side to 3800px
    const dpr = Math.min(Math.max(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2, 2), 3);
    const desiredPxW = Math.max(320, Math.round(targetCssWidthPx * dpr));
    const maxScaleByDim = Math.min(3800 / Math.max(1, baseViewport.width), 3800 / Math.max(1, baseViewport.height));
    const renderScale = Math.max(0.5, Math.min(maxScaleByDim, desiredPxW / Math.max(1, baseViewport.width)));
    const viewport = page.getViewport({ scale: renderScale });

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.round(viewport.width));
    offscreen.height = Math.max(1, Math.round(viewport.height));
    const offCtx = offscreen.getContext('2d', { alpha: false });
    if (!offCtx) return;

    offCtx.fillStyle = '#FFFFFF';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';

    activeTask = page.render({ canvasContext: offCtx, canvas: offscreen, viewport, background: '#ffffff' });
    await activeTask.promise;
    if (cancelled) return;

    targetCanvas.width = offscreen.width;
    targetCanvas.height = offscreen.height;
    const targetCtx = targetCanvas.getContext('2d', { alpha: false });
    if (targetCtx) {
      targetCtx.drawImage(offscreen, 0, 0);
    }
  })();

  return {
    cancel: () => {
      cancelled = true;
      try {
        activeTask?.cancel();
      } catch {
        // ignore cancellation errors
      }
    },
    promise,
  };
}

export async function renderPDFPageHighResDataUrl(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  targetWidthPx = 1900
): Promise<{ dataUrl: string; width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const maxScaleByDim = Math.min(3400 / Math.max(1, baseViewport.width), 3400 / Math.max(1, baseViewport.height));
  const scale = Math.max(1.5, Math.min(maxScaleByDim, targetWidthPx / Math.max(1, baseViewport.width)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    await page.render({ canvasContext: ctx, canvas, viewport, background: '#ffffff' }).promise;
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

export async function renderPDFToImages(
  arrayBuffer: ArrayBuffer,
  scale = 2.2
): Promise<{ pages: LoadedPDFPage[]; fullText: string; pageCount: number }> {
  const pdf = await openPDFDocument(arrayBuffer);
  const pages: LoadedPDFPage[] = [];
  const textChunks: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      await page.render({ canvasContext: ctx, canvas, viewport, background: '#ffffff' }).promise;
    }
    const { pageText, textItems } = await extractPageTextAndItems(page, scale);
    textChunks.push(`[Page ${i}] ${pageText}`);
    pages.push({
      pageNumber: i,
      width: canvas.width,
      height: canvas.height,
      ptWidth: baseViewport.width,
      ptHeight: baseViewport.height,
      dataUrl: canvas.toDataURL('image/png'),
      text: pageText,
      textItems,
    });
  }

  return {
    pages,
    fullText: textChunks.join('\n\n'),
    pageCount: pdf.numPages,
  };
}

export async function exportBoardPagesToPDF(
  pages: { name: string; imageDataUrl: string; width: number; height: number; speakerNotes?: string }[],
  pageSize: 'fit' | 'a4' | 'letter' = 'fit',
  options: { includeNotes?: boolean } = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  for (const p of pages) {
    const pngBytes = await fetch(p.imageDataUrl).then((r) => r.arrayBuffer());
    const embedded = await pdfDoc.embedPng(pngBytes);
    let pw = p.width;
    let ph = p.height;
    if (pageSize === 'a4') {
      pw = 841.89;
      ph = 595.28;
    } else if (pageSize === 'letter') {
      pw = 792;
      ph = 612;
    }
    const page = pdfDoc.addPage([pw, ph]);
    const scale = Math.min(pw / embedded.width, ph / embedded.height);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;
    page.drawImage(embedded, {
      x: (pw - drawW) / 2,
      y: (ph - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }
  if (options.includeNotes) {
    const notes = pages
      .map((page, index) => page.speakerNotes?.trim() ? `Slide ${index + 1}: ${page.name}\n${page.speakerNotes.trim()}` : '')
      .filter(Boolean)
      .join('\n\n');
    if (notes) {
      await pdfDoc.attach(new TextEncoder().encode(notes), 'speaker-notes.txt', {
        mimeType: 'text/plain',
        description: 'Speaker notes for exported slides',
      });
    }
  }
  return pdfDoc.save();
}

function toWinAnsiSafe(input: string): string {
  // Replace characters outside WinAnsi (0x20..0xFF) cleanly if StandardFonts fallback is ever used
  return input.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

export type PDFExportOptions = {
  formValues?: Record<string, string | boolean>;
  flattenForms?: boolean;
  watermark?: {
    text: string;
    opacity?: number;
    angle?: number;
    color?: string;
    fontSize?: number;
    position?: 'center' | 'top' | 'bottom';
    scope?: 'all' | 'current' | 'range';
    rangeExpr?: string;
    currentPageNum?: number;
  };
  headerFooter?: {
    headerLeft?: string;
    headerRight?: string;
    footerCenter?: string;
    pageNumbers?: boolean;
    batesPrefix?: string;
    batesStart?: number;
    scope?: 'all' | 'current' | 'range';
    rangeExpr?: string;
    currentPageNum?: number;
  };
  metadata?: { title?: string; author?: string; subject?: string; keywords?: string };
};

export function resolveHeaderFooterTokens(
  raw: string,
  pageNum: number,
  totalPages: number,
  batesPrefix?: string,
  batesStart = 1
): string {
  const batesNum = String((batesStart || 1) + (pageNum - 1)).padStart(4, '0');
  const today = new Date().toLocaleDateString();
  return raw
    .replace(/\{page\}/gi, String(pageNum))
    .replace(/\{total\}/gi, String(totalPages))
    .replace(/\{date\}/gi, today)
    .replace(/\{bates\}/gi, `${batesPrefix || ''}${batesNum}`);
}

export async function renderWatermarkFooterOverlayPng(
  widthPt: number,
  heightPt: number,
  pageNum: number,
  totalPages: number,
  wm: PDFExportOptions['watermark'] | undefined,
  hf: PDFExportOptions['headerFooter'] | undefined,
  applyWm: boolean,
  applyHf: boolean
): Promise<string | null> {
  if ((!applyWm || !wm?.text?.trim()) && !applyHf) return null;
  const scale = 2;
  const cw = Math.max(100, Math.round(widthPt * scale));
  const ch = Math.max(100, Math.round(heightPt * scale));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  if (applyWm && wm?.text?.trim()) {
    const resolvedWm = resolveHeaderFooterTokens(wm.text.trim(), pageNum, totalPages, hf?.batesPrefix, hf?.batesStart);
    const wmSize = (wm.fontSize || Math.max(28, Math.min(64, widthPt * 0.085))) * scale;
    ctx.save();
    ctx.globalAlpha = Math.max(0.06, Math.min(0.85, wm.opacity ?? 0.22));
    ctx.fillStyle = wm.color || '#DC2626';
    ctx.font = `700 ${wmSize}px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pos = wm.position || 'center';
    const cy = pos === 'top' ? ch * 0.2 : pos === 'bottom' ? ch * 0.8 : ch * 0.5;
    ctx.translate(cw / 2, cy);
    ctx.rotate((-(wm.angle ?? 35) * Math.PI) / 180);
    ctx.fillText(resolvedWm, 0, 0);
    ctx.restore();
  }

  if (applyHf && hf) {
    ctx.save();
    ctx.fillStyle = '#475569';
    ctx.font = `500 ${9.5 * scale}px "DM Sans", "Noto Sans Devanagari", sans-serif`;
    if (hf.headerLeft?.trim()) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(
        resolveHeaderFooterTokens(hf.headerLeft.trim(), pageNum, totalPages, hf.batesPrefix, hf.batesStart),
        24 * scale,
        14 * scale
      );
    }
    if (hf.headerRight?.trim()) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(
        resolveHeaderFooterTokens(hf.headerRight.trim(), pageNum, totalPages, hf.batesPrefix, hf.batesStart),
        cw - 24 * scale,
        14 * scale
      );
    }
    const batesLabel = hf.batesPrefix?.trim()
      ? `${hf.batesPrefix.trim()}${String((hf.batesStart || 1) + (pageNum - 1)).padStart(4, '0')}`
      : '';
    const footerStr = [
      hf.footerCenter?.trim() ? resolveHeaderFooterTokens(hf.footerCenter.trim(), pageNum, totalPages, hf.batesPrefix, hf.batesStart) : '',
      hf.pageNumbers ? `Page ${pageNum} of ${totalPages}` : '',
      batesLabel,
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (footerStr) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(footerStr, cw / 2, ch - 12 * scale);
    }
    ctx.restore();
  }

  return c.toDataURL('image/png');
}

export async function exportAnnotatedOriginalPDF(
  originalPdfBytes: ArrayBuffer,
  annotationsByPage: Record<
    number,
    { overlayPngDataUrl?: string; textNotes?: { x?: number; y?: number; nx?: number; ny?: number; text: string; kind?: string }[] }
  >,
  rotationsByPage: Record<number, number> = {},
  options: PDFExportOptions = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes.slice(0), { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  if (options.metadata?.title !== undefined) pdfDoc.setTitle(options.metadata.title);
  if (options.metadata?.author !== undefined) pdfDoc.setAuthor(options.metadata.author);
  if (options.metadata?.subject !== undefined) pdfDoc.setSubject(options.metadata.subject);
  if (options.metadata?.keywords !== undefined) {
    pdfDoc.setKeywords(options.metadata.keywords.split(',').map((k) => k.trim()).filter(Boolean));
  }

  // Write AcroForm values if present
  if (options.formValues && Object.keys(options.formValues).length > 0) {
    try {
      const form = pdfDoc.getForm();
      for (const [fieldName, val] of Object.entries(options.formValues)) {
        try {
          const field = form.getField(fieldName);
          const ctorName = field.constructor?.name || '';
          if (typeof val === 'boolean') {
            const cb = form.getCheckBox(fieldName);
            if (val) cb.check();
            else cb.uncheck();
          } else if (ctorName.includes('Dropdown')) {
            form.getDropdown(fieldName).select(String(val));
          } else if (ctorName.includes('RadioGroup')) {
            form.getRadioGroup(fieldName).select(String(val));
          } else {
            form.getTextField(fieldName).setText(String(val));
          }
        } catch {
          // ignore field type mismatches
        }
      }
      if (options.flattenForms) {
        try {
          form.flatten();
        } catch {
          // ignore flatten issues on custom fonts
        }
      }
    } catch {
      // PDF has no form dictionary
    }
  } else if (options.flattenForms) {
    try {
      pdfDoc.getForm().flatten();
    } catch {
      // ignore
    }
  }

  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  const wmScope = options.watermark?.scope || 'all';
  const wmRangeSet =
    wmScope === 'range' && options.watermark?.rangeExpr
      ? new Set(parsePageRangeExpression(options.watermark.rangeExpr, totalPages))
      : null;

  const hfScope = options.headerFooter?.scope || options.watermark?.scope || 'all';
  const hfRangeSet =
    hfScope === 'range' && (options.headerFooter?.rangeExpr || options.watermark?.rangeExpr)
      ? new Set(parsePageRangeExpression(options.headerFooter?.rangeExpr || options.watermark?.rangeExpr || '', totalPages))
      : null;

  const drawVisualOverlayRotated = (
    page: ReturnType<PDFDocument['getPages']>[number],
    embedded: Awaited<ReturnType<PDFDocument['embedPng']>>,
    box: { x: number; y: number; width: number; height: number },
    pageAngle: number
  ) => {
    if (pageAngle === 90) {
      page.drawImage(embedded, {
        x: box.x + box.width,
        y: box.y,
        width: box.height,
        height: box.width,
        rotate: degrees(90),
      });
    } else if (pageAngle === 180) {
      page.drawImage(embedded, {
        x: box.x + box.width,
        y: box.y + box.height,
        width: box.width,
        height: box.height,
        rotate: degrees(180),
      });
    } else if (pageAngle === 270) {
      page.drawImage(embedded, {
        x: box.x,
        y: box.y + box.height,
        width: box.height,
        height: box.width,
        rotate: degrees(270),
      });
    } else {
      page.drawImage(embedded, {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      });
    }
  };

  for (let idx = 0; idx < pages.length; idx++) {
    const pageNum = idx + 1;
    const page = pages[idx];
    const rot = rotationsByPage[pageNum] || 0;
    if (rot) {
      page.setRotation(degrees((page.getRotation().angle + rot) % 360));
    }
    const { width, height } = page.getSize();
    const box = page.getCropBox() || page.getMediaBox();
    const pageAngle = ((page.getRotation().angle % 360) + 360) % 360;
    const visualW = pageAngle === 90 || pageAngle === 270 ? box.height : box.width;
    const visualH = pageAngle === 90 || pageAngle === 270 ? box.width : box.height;

    const ann = annotationsByPage[pageNum];
    if (ann?.overlayPngDataUrl) {
      const pngBytes = await fetch(ann.overlayPngDataUrl).then((r) => r.arrayBuffer());
      const embedded = await pdfDoc.embedPng(pngBytes);
      drawVisualOverlayRotated(page, embedded, box, pageAngle);
    }

    if (ann?.textNotes) {
      for (const note of ann.textNotes) {
        const px = note.nx !== undefined ? note.nx * width : note.x || 24;
        const py = note.ny !== undefined ? (1 - note.ny) * height - 18 : height - (note.y || 24);
        const text = toWinAnsiSafe((note.text || '').slice(0, 160));
        const boxW = Math.min(200, Math.max(72, text.length * 5.6 + 14));
        const boxH = 22;
        const clampedX = Math.max(10, Math.min(width - boxW - 10, px));
        const clampedY = Math.max(10, Math.min(height - boxH - 10, py));
        page.drawRectangle({
          x: clampedX,
          y: clampedY,
          width: boxW,
          height: boxH,
          color: note.kind === 'sticky' ? rgb(0.99, 0.9, 0.54) : rgb(0.15, 0.39, 0.92),
          borderWidth: 0.75,
          borderColor: note.kind === 'sticky' ? rgb(0.85, 0.65, 0.13) : rgb(0.12, 0.25, 0.69),
        });
        page.drawText(text, {
          x: clampedX + 6,
          y: clampedY + 7,
          size: 9.5,
          font,
          color: note.kind === 'sticky' ? rgb(0.06, 0.09, 0.16) : rgb(1, 1, 1),
        });
      }
    }

    const applyWm =
      Boolean(options.watermark?.text?.trim()) &&
      (wmScope === 'all' ||
        (wmScope === 'current' && pageNum === (options.watermark?.currentPageNum || 1)) ||
        (wmScope === 'range' && Boolean(wmRangeSet?.has(pageNum))));

    const hasHf = Boolean(
      options.headerFooter &&
        (options.headerFooter.headerLeft?.trim() ||
          options.headerFooter.headerRight?.trim() ||
          options.headerFooter.footerCenter?.trim() ||
          options.headerFooter.pageNumbers ||
          options.headerFooter.batesPrefix?.trim())
    );
    const applyHf =
      hasHf &&
      (hfScope === 'all' ||
        (hfScope === 'current' && pageNum === (options.headerFooter?.currentPageNum || options.watermark?.currentPageNum || 1)) ||
        (hfScope === 'range' && Boolean(hfRangeSet?.has(pageNum))));

    if (applyWm || applyHf) {
      const wmPng = await renderWatermarkFooterOverlayPng(
        visualW,
        visualH,
        pageNum,
        totalPages,
        options.watermark,
        options.headerFooter,
        applyWm,
        applyHf
      );
      if (wmPng) {
        const pngBytes = await fetch(wmPng).then((r) => r.arrayBuffer());
        const embedded = await pdfDoc.embedPng(pngBytes);
        drawVisualOverlayRotated(page, embedded, box, pageAngle);
      }
    }
  }

  return pdfDoc.save({ useObjectStreams: true });
}

export async function manipulatePDFPages(
  pdfBytes: ArrayBuffer,
  action: 'rotate' | 'delete' | 'extract' | 'split' | 'duplicate' | 'insert_blank' | 'reorder',
  pageIndicesZeroBased: number[],
  rotateDeg = 90,
  reorderTargetIndex?: number
): Promise<{ primary: Uint8Array; secondary?: Uint8Array }> {
  const srcDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
  const total = srcDoc.getPageCount();

  if (action === 'rotate') {
    for (const idx of pageIndicesZeroBased) {
      if (idx >= 0 && idx < total) {
        const p = srcDoc.getPage(idx);
        p.setRotation(degrees((((p.getRotation().angle + rotateDeg) % 360) + 360) % 360));
      }
    }
    return { primary: await srcDoc.save() };
  }

  if (action === 'delete') {
    const toDelete = [...pageIndicesZeroBased].sort((a, b) => b - a);
    for (const idx of toDelete) {
      if (srcDoc.getPageCount() > 1 && idx >= 0 && idx < srcDoc.getPageCount()) {
        srcDoc.removePage(idx);
      }
    }
    return { primary: await srcDoc.save() };
  }

  if (action === 'duplicate') {
    const idx = Math.max(0, Math.min(total - 1, pageIndicesZeroBased[0] || 0));
    const [copied] = await srcDoc.copyPages(srcDoc, [idx]);
    srcDoc.insertPage(idx + 1, copied);
    return { primary: await srcDoc.save() };
  }

  if (action === 'insert_blank') {
    const idx = Math.max(0, Math.min(total - 1, pageIndicesZeroBased[0] || 0));
    const refPage = srcDoc.getPage(idx);
    const { width, height } = refPage.getSize();
    srcDoc.insertPage(idx + 1, [width, height]);
    return { primary: await srcDoc.save() };
  }

  if (action === 'reorder' && typeof reorderTargetIndex === 'number') {
    const fromIdx = pageIndicesZeroBased[0];
    if (
      typeof fromIdx === 'number' &&
      fromIdx >= 0 &&
      fromIdx < total &&
      reorderTargetIndex >= 0 &&
      reorderTargetIndex < total &&
      fromIdx !== reorderTargetIndex
    ) {
      const order = Array.from({ length: total }, (_, i) => i);
      const [moved] = order.splice(fromIdx, 1);
      order.splice(reorderTargetIndex, 0, moved);
      const out = await PDFDocument.create();
      const copied = await out.copyPages(srcDoc, order);
      for (const p of copied) out.addPage(p);
      return { primary: await out.save() };
    }
    return { primary: await srcDoc.save() };
  }

  if (action === 'extract') {
    const out = await PDFDocument.create();
    const valid = pageIndicesZeroBased.filter((i) => i >= 0 && i < total);
    const copied = await out.copyPages(srcDoc, valid.length > 0 ? valid : [0]);
    for (const p of copied) out.addPage(p);
    return { primary: await out.save() };
  }

  if (total <= 1) {
    throw new Error('Need at least 2 pages to split PDF');
  }
  const splitAt = Math.max(1, Math.min(total - 1, (pageIndicesZeroBased[0] ?? 0) + 1));
  const partA = await PDFDocument.create();
  const partB = await PDFDocument.create();
  const firstIndices = Array.from({ length: splitAt }, (_, i) => i);
  const secondIndices = Array.from({ length: total - splitAt }, (_, i) => i + splitAt);
  for (const p of await partA.copyPages(srcDoc, firstIndices)) partA.addPage(p);
  for (const p of await partB.copyPages(srcDoc, secondIndices)) partB.addPage(p);
  return { primary: await partA.save(), secondary: await partB.save() };
}

export async function mergeTwoPDFs(firstBytes: ArrayBuffer, secondBytes: ArrayBuffer): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  const docA = await PDFDocument.load(firstBytes.slice(0), { ignoreEncryption: true });
  const docB = await PDFDocument.load(secondBytes.slice(0), { ignoreEncryption: true });
  for (const p of await merged.copyPages(docA, docA.getPageIndices())) merged.addPage(p);
  for (const p of await merged.copyPages(docB, docB.getPageIndices())) merged.addPage(p);
  return merged.save({ useObjectStreams: true });
}

export async function mergeMultipleBuffersAndImages(
  items: { kind: 'pdf' | 'image'; name: string; bytes: ArrayBuffer; mimeType?: string }[]
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const item of items) {
    if (item.kind === 'pdf') {
      const doc = await PDFDocument.load(item.bytes.slice(0), { ignoreEncryption: true });
      const copied = await merged.copyPages(doc, doc.getPageIndices());
      for (const p of copied) merged.addPage(p);
    } else {
      const isJpg = item.mimeType?.includes('jpeg') || /\.jpe?g$/i.test(item.name);
      const embedded = isJpg ? await merged.embedJpg(item.bytes) : await merged.embedPng(item.bytes);
      const pw = Math.max(320, Math.min(1200, embedded.width));
      const ph = Math.round((embedded.height / Math.max(1, embedded.width)) * pw);
      const pg = merged.addPage([pw, ph]);
      pg.drawImage(embedded, { x: 0, y: 0, width: pw, height: ph });
    }
  }
  return merged.save({ useObjectStreams: true });
}

export async function cropPDFPages(
  pdfBytes: ArrayBuffer,
  pageIndicesZeroBased: number[],
  marginsNorm: { left: number; top: number; right: number; bottom: number },
  resetToMediaBox = false
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
  const total = doc.getPageCount();
  for (const idx of pageIndicesZeroBased) {
    if (idx < 0 || idx >= total) continue;
    const page = doc.getPage(idx);
    const media = page.getMediaBox();
    if (resetToMediaBox) {
      page.setCropBox(media.x, media.y, media.width, media.height);
      continue;
    }
    const box = page.getCropBox() || media;
    const angle = ((page.getRotation().angle % 360) + 360) % 360;
    const visL = Math.max(0, Math.min(0.45, marginsNorm.left));
    const visT = Math.max(0, Math.min(0.45, marginsNorm.top));
    const visR = Math.max(0, Math.min(0.45, marginsNorm.right));
    const visB = Math.max(0, Math.min(0.45, marginsNorm.bottom));
    let pdfL = visL;
    let pdfT = visT;
    let pdfR = visR;
    let pdfB = visB;
    if (angle === 90) {
      pdfL = visT;
      pdfT = visR;
      pdfR = visB;
      pdfB = visL;
    } else if (angle === 180) {
      pdfL = visR;
      pdfT = visB;
      pdfR = visL;
      pdfB = visT;
    } else if (angle === 270) {
      pdfL = visB;
      pdfT = visL;
      pdfR = visT;
      pdfB = visR;
    }
    const l = pdfL * box.width;
    const r = pdfR * box.width;
    const t = pdfT * box.height;
    const b = pdfB * box.height;
    const nw = Math.max(40, box.width - l - r);
    const nh = Math.max(40, box.height - t - b);
    page.setCropBox(box.x + l, box.y + b, nw, nh);
  }
  return doc.save({ useObjectStreams: true });
}

export async function replacePDFPages(
  targetBytes: ArrayBuffer,
  sourceBytes: ArrayBuffer,
  replaceStartZeroBased: number
): Promise<Uint8Array> {
  const targetDoc = await PDFDocument.load(targetBytes.slice(0), { ignoreEncryption: true });
  const sourceDoc = await PDFDocument.load(sourceBytes.slice(0), { ignoreEncryption: true });
  const srcIndices = sourceDoc.getPageIndices();
  const copied = await targetDoc.copyPages(sourceDoc, srcIndices);
  for (let i = 0; i < copied.length; i++) {
    const targetIdx = replaceStartZeroBased + i;
    if (targetIdx < targetDoc.getPageCount()) {
      targetDoc.removePage(targetIdx);
      targetDoc.insertPage(targetIdx, copied[i]);
    } else {
      targetDoc.addPage(copied[i]);
    }
  }
  return targetDoc.save({ useObjectStreams: true });
}

export async function applyRedactionsToPDF(
  originalBytes: ArrayBuffer,
  pdfJsDoc: PDFDocumentProxy,
  redactionsByPage: Record<number, { x: number; y: number; w: number; h: number }[]>
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.load(originalBytes.slice(0), { ignoreEncryption: true });
  for (const [pStr, rects] of Object.entries(redactionsByPage)) {
    const pageNum = Number(pStr);
    if (!rects || rects.length === 0 || pageNum < 1 || pageNum > outDoc.getPageCount()) continue;
    // Sanitize redacted pages by baking high-DPI flattened pixels + solid black bars (destroying underlying redacted text)
    const page = await pdfJsDoc.getPage(pageNum);
    const baseVp = page.getViewport({ scale: 1 });
    const renderVp = page.getViewport({ scale: 2.2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(renderVp.width));
    canvas.height = Math.max(1, Math.round(renderVp.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport: renderVp, background: '#ffffff' }).promise;
      ctx.fillStyle = '#000000';
      for (const r of rects) {
        ctx.fillRect(r.x * canvas.width, r.y * canvas.height, r.w * canvas.width, r.h * canvas.height);
      }
      const pngBytes = await fetch(canvas.toDataURL('image/png')).then((res) => res.arrayBuffer());
      const embedded = await outDoc.embedPng(pngBytes);
      outDoc.removePage(pageNum - 1);
      const freshPage = outDoc.insertPage(pageNum - 1, [baseVp.width, baseVp.height]);
      freshPage.drawImage(embedded, { x: 0, y: 0, width: baseVp.width, height: baseVp.height });
    }
  }
  return outDoc.save({ useObjectStreams: true });
}

export async function splitPDFByChunkSize(pdfBytes: ArrayBuffer, pagesPerChunk: number): Promise<Uint8Array[]> {
  const srcDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
  const total = srcDoc.getPageCount();
  const size = Math.max(1, Math.min(total, pagesPerChunk));
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < total; start += size) {
    const end = Math.min(total, start + size);
    const out = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, k) => start + k);
    const copied = await out.copyPages(srcDoc, indices);
    for (const p of copied) out.addPage(p);
    chunks.push(await out.save({ useObjectStreams: true }));
  }
  return chunks;
}

export async function exportPDFPagesToImagesZip(
  pdfJsDoc: PDFDocumentProxy,
  pageNumbers: number[],
  format: 'png' | 'jpeg' = 'png',
  baseName = 'document'
): Promise<Blob> {
  const zip = new JSZip();
  for (const pNum of pageNumbers) {
    const page = await pdfJsDoc.getPage(pNum);
    const vp = page.getViewport({ scale: 2.0 });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(vp.width));
    c.height = Math.max(1, Math.round(vp.height));
    const ctx = c.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, canvas: c, viewport: vp, background: '#ffffff' }).promise;
      const dataUrl = c.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
      const b64 = dataUrl.split(',')[1] || '';
      zip.file(`${baseName}_page_${String(pNum).padStart(3, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`, b64, {
        base64: true,
      });
    }
  }
  return zip.generateAsync({ type: 'blob' });
}

export async function updatePDFDocumentMetadata(
  pdfBytes: ArrayBuffer,
  meta: { title?: string; author?: string; subject?: string; keywords?: string }
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
  if (meta.title !== undefined) doc.setTitle(meta.title);
  if (meta.author !== undefined) doc.setAuthor(meta.author);
  if (meta.subject !== undefined) doc.setSubject(meta.subject);
  if (meta.keywords !== undefined) {
    doc.setKeywords(meta.keywords.split(',').map((k) => k.trim()).filter(Boolean));
  }
  return doc.save({ useObjectStreams: true });
}

export function parsePageRangeExpression(expr: string, maxPage: number): number[] {
  const result = new Set<number>();
  const parts = expr.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const a = Math.max(1, Math.min(maxPage, Number(range[1])));
      const b = Math.max(1, Math.min(maxPage, Number(range[2])));
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) result.add(i);
    } else if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n >= 1 && n <= maxPage) result.add(n);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

function mapPptPrstToShapeKind(prst: string | null): ShapeKind {
  switch (prst) {
    case 'ellipse':
      return 'ellipse';
    case 'roundRect':
      return 'rounded_rect';
    case 'triangle':
      return 'triangle';
    case 'rtTriangle':
      return 'right_triangle';
    case 'diamond':
      return 'diamond';
    case 'pentagon':
      return 'pentagon';
    case 'hexagon':
      return 'hexagon';
    case 'star5':
      return 'star';
    case 'heart':
      return 'heart';
    case 'cloud':
      return 'cloud';
    case 'rightArrow':
      return 'block_arrow_right';
    case 'leftArrow':
      return 'block_arrow_left';
    case 'upArrow':
      return 'block_arrow_up';
    case 'downArrow':
      return 'block_arrow_down';
    case 'parallelogram':
      return 'parallelogram';
    case 'trapezoid':
      return 'trapezoid';
    case 'wedgeRoundRectCallout':
    case 'wedgeRectCallout':
      return 'speech_bubble';
    default:
      return 'rectangle';
  }
}

function applyLumTint(hex: string, lumMod?: number | null, lumOff?: number | null): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  if (lumMod == null && lumOff == null) return `#${clean.toUpperCase()}`;
  const mod = lumMod != null ? lumMod / 100000 : 1;
  const off = lumOff != null ? lumOff / 100000 : 0;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c * mod + 255 * off)));
  return (
    '#' +
    [adj(r), adj(g), adj(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function extractColorFromXmlNode(
  parent: Element | null | undefined,
  themeColors?: Record<string, string>
): string | null {
  if (!parent) return null;
  const srgb = parent.getElementsByTagNameNS('*', 'srgbClr')[0];
  if (srgb) {
    const val = srgb.getAttribute('val');
    if (val && /^[0-9a-fA-F]{6}$/.test(val)) {
      const lumMod = srgb.getElementsByTagNameNS('*', 'lumMod')[0]?.getAttribute('val');
      const lumOff = srgb.getElementsByTagNameNS('*', 'lumOff')[0]?.getAttribute('val');
      return applyLumTint(`#${val}`, lumMod ? Number(lumMod) : null, lumOff ? Number(lumOff) : null);
    }
  }
  const scheme = parent.getElementsByTagNameNS('*', 'schemeClr')[0];
  if (scheme && themeColors) {
    const rawKey = scheme.getAttribute('val') || '';
    const aliasMap: Record<string, string> = {
      tx1: 'dk1',
      tx2: 'dk2',
      bg1: 'lt1',
      bg2: 'lt2',
    };
    const key = aliasMap[rawKey] || rawKey;
    const baseHex = themeColors[key];
    if (baseHex) {
      const lumMod = scheme.getElementsByTagNameNS('*', 'lumMod')[0]?.getAttribute('val');
      const lumOff = scheme.getElementsByTagNameNS('*', 'lumOff')[0]?.getAttribute('val');
      return applyLumTint(baseHex, lumMod ? Number(lumMod) : null, lumOff ? Number(lumOff) : null);
    }
  }
  return null;
}

function isHexDarkForPptx(hex?: string): boolean {
  if (!hex || hex === 'transparent') return false;
  const clean = hex.trim().replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}

type PlaceholderTemplate = {
  offX?: number;
  offY?: number;
  cx?: number;
  cy?: number;
  fontSizePt100?: number;
  bold?: boolean;
  textColor?: string;
  align?: TextAlignMode;
};

function collectPlaceholdersFromDoc(
  doc: Document | null,
  themeColors: Record<string, string>
): Map<string, PlaceholderTemplate> {
  const map = new Map<string, PlaceholderTemplate>();
  if (!doc) return map;
  const sps = Array.from(doc.getElementsByTagNameNS('*', 'sp'));
  for (const sp of sps) {
    const ph = sp.getElementsByTagNameNS('*', 'ph')[0];
    if (!ph) continue;
    const phType = ph.getAttribute('type') || 'body';
    const phIdx = ph.getAttribute('idx') || '';
    const spPr = sp.getElementsByTagNameNS('*', 'spPr')[0];
    const xfrm = spPr?.getElementsByTagNameNS('*', 'xfrm')[0];
    const offEl = xfrm?.getElementsByTagNameNS('*', 'off')[0];
    const extEl = xfrm?.getElementsByTagNameNS('*', 'ext')[0];
    const defRPr = sp.getElementsByTagNameNS('*', 'defRPr')[0] || sp.getElementsByTagNameNS('*', 'rPr')[0];
    const pPr = sp.getElementsByTagNameNS('*', 'pPr')[0];
    const algn = pPr?.getAttribute('algn');
    const tpl: PlaceholderTemplate = {
      offX: offEl ? Number(offEl.getAttribute('x')) : undefined,
      offY: offEl ? Number(offEl.getAttribute('y')) : undefined,
      cx: extEl ? Number(extEl.getAttribute('cx')) : undefined,
      cy: extEl ? Number(extEl.getAttribute('cy')) : undefined,
      fontSizePt100: defRPr?.getAttribute('sz') ? Number(defRPr.getAttribute('sz')) : undefined,
      bold: defRPr?.getAttribute('b') === '1' ? true : undefined,
      textColor: extractColorFromXmlNode(defRPr, themeColors) || undefined,
      align: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : algn === 'l' ? 'left' : undefined,
    };
    if (phIdx) map.set(`${phType}:${phIdx}`, tpl);
    if (!map.has(phType)) map.set(phType, tpl);
  }
  return map;
}

// PPTX Importer using JSZip — parses theme palette, slide size, gradients, transitions, speaker notes, painter-order shapes/connectors/tables/media
export async function importPPTXToPages(
  arrayBuffer: ArrayBuffer,
  fileId: string,
  fileName: string
): Promise<BoardPage[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    return [
      {
        id: uid('page'),
        name: fileName.replace(/\.(pptx|ppt)$/i, ''),
        objects: [
          {
            id: uid('text'),
            type: 'text',
            x: 120,
            y: 120,
            width: 820,
            height: 140,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            zIndex: 1,
            text: `Imported Presentation: ${fileName}\n(Original file preserved in Workspace Attachments. Binary .ppt legacy files require conversion to .pptx for XML slide parsing.)`,
            textColor: '#0F172A',
            bgColor: '#F8FAFC',
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 18,
            fontWeight: 'normal',
            fontStyle: 'normal',
            underline: false,
            textAlign: 'left',
          },
        ],
        layers: [{ id: 'layer-default', name: 'Slide Layer', visible: true, locked: false }],
        guides: [],
        background: '#FFFFFF',
        gridType: 'none',
        gridSize: 28,
        transition: 'fade',
        slideDurationSec: 0,
        importedSource: { kind: 'pptx', fileId, fileName, pageNumber: 1, readOnlyOverlay: false },
      },
    ];
  }

  const parser = new DOMParser();

  // Read <p:sldSz> from ppt/presentation.xml for exact 1280x720 scaling
  let sldCx = 12192000;
  let sldCy = 6858000;
  const presXmlFile = zip.file('ppt/presentation.xml');
  if (presXmlFile) {
    const presDoc = parser.parseFromString(await presXmlFile.async('string'), 'application/xml');
    const sldSz = presDoc.getElementsByTagNameNS('*', 'sldSz')[0];
    const cx = Number(sldSz?.getAttribute('cx') || 0);
    const cy = Number(sldSz?.getAttribute('cy') || 0);
    if (cx > 0 && cy > 0) {
      sldCx = cx;
      sldCy = cy;
    }
  }
  const scaleX = 1280 / sldCx;
  const scaleY = 720 / sldCy;

  // Read OOXML theme color scheme from ppt/theme/theme1.xml
  const themeColors: Record<string, string> = {
    dk1: '#0F172A',
    lt1: '#FFFFFF',
    dk2: '#1E293B',
    lt2: '#F1F5F9',
    accent1: '#2563EB',
    accent2: '#EA580C',
    accent3: '#64748B',
    accent4: '#D97706',
    accent5: '#0284C7',
    accent6: '#16A34A',
  };
  const themeFile = zip.file('ppt/theme/theme1.xml');
  if (themeFile) {
    try {
      const themeDoc = parser.parseFromString(await themeFile.async('string'), 'application/xml');
      const clrScheme = themeDoc.getElementsByTagNameNS('*', 'clrScheme')[0];
      if (clrScheme) {
        for (const child of Array.from(clrScheme.children)) {
          const srgb = child.getElementsByTagNameNS('*', 'srgbClr')[0]?.getAttribute('val');
          const sys = child.getElementsByTagNameNS('*', 'sysClr')[0]?.getAttribute('lastClr');
          const hex = srgb || sys;
          if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) {
            themeColors[child.localName] = `#${hex.toUpperCase()}`;
          }
        }
      }
    } catch {
      // ignore malformed theme XML
    }
  }

  let masterDoc: Document | null = null;
  const masterFile = zip.file('ppt/slideMasters/slideMaster1.xml');
  if (masterFile) {
    try {
      masterDoc = parser.parseFromString(await masterFile.async('string'), 'application/xml');
    } catch {
      masterDoc = null;
    }
  }
  const masterPlaceholders = collectPlaceholdersFromDoc(masterDoc, themeColors);
  const layoutCache = new Map<string, { doc: Document; placeholders: Map<string, PlaceholderTemplate> }>();

  const extractBgFromDoc = (targetDoc: Document | null): { hex?: string; grad?: { from: string; to: string; angle?: number } } => {
    if (!targetDoc) return {};
    const bgEl = targetDoc.getElementsByTagNameNS('*', 'bg')[0];
    if (!bgEl) return {};
    const gradFill = bgEl.getElementsByTagNameNS('*', 'gradFill')[0];
    if (gradFill) {
      const gsList = Array.from(gradFill.getElementsByTagNameNS('*', 'gs'));
      const c1 = extractColorFromXmlNode(gsList[0], themeColors);
      const c2 = extractColorFromXmlNode(gsList[gsList.length - 1], themeColors);
      if (c1 && c2) {
        const linAng = Number(gradFill.getElementsByTagNameNS('*', 'lin')[0]?.getAttribute('ang') || 0);
        return { hex: c1, grad: { from: c1, to: c2, angle: linAng ? Math.round(linAng / 60000) : 135 } };
      }
    }
    const extracted = extractColorFromXmlNode(bgEl, themeColors);
    return extracted ? { hex: extracted } : {};
  };

  const masterBg = extractBgFromDoc(masterDoc);

  const pages: BoardPage[] = [];

  for (let idx = 0; idx < slideFiles.length; idx++) {
    const slidePath = slideFiles[idx];
    const slideNumMatch = slidePath.match(/slide(\d+)\.xml/i);
    const slideNum = slideNumMatch ? Number(slideNumMatch[1]) : idx + 1;
    const xmlStr = await zip.file(slidePath)!.async('string');
    const doc = parser.parseFromString(xmlStr, 'application/xml');

    // Slide relationships map (images + speaker notes + slideLayout)
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const relTargetById = new Map<string, string>();
    let notesTarget: string | null = null;
    let layoutTarget: string | null = null;
    if (zip.file(relsPath)) {
      const relsXml = await zip.file(relsPath)!.async('string');
      const relsDoc = parser.parseFromString(relsXml, 'application/xml');
      for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
        const id = rel.getAttribute('Id') || '';
        const target = rel.getAttribute('Target') || '';
        const rType = rel.getAttribute('Type') || '';
        if (id && target) relTargetById.set(id, target);
        if (rType.includes('notesSlide') && target) {
          notesTarget = 'ppt/' + target.replace(/^(\.\.\/)+/, '');
        }
        if (rType.includes('slideLayout') && target) {
          layoutTarget = 'ppt/' + target.replace(/^(\.\.\/)+/, '');
        }
      }
    }

    let layoutDoc: Document | null = null;
    let layoutPlaceholders = new Map<string, PlaceholderTemplate>();
    if (layoutTarget && zip.file(layoutTarget)) {
      const cached = layoutCache.get(layoutTarget);
      if (cached) {
        layoutDoc = cached.doc;
        layoutPlaceholders = cached.placeholders;
      } else {
        try {
          layoutDoc = parser.parseFromString(await zip.file(layoutTarget)!.async('string'), 'application/xml');
          layoutPlaceholders = collectPlaceholdersFromDoc(layoutDoc, themeColors);
          layoutCache.set(layoutTarget, { doc: layoutDoc, placeholders: layoutPlaceholders });
        } catch {
          layoutDoc = null;
        }
      }
    }

    // Slide background color or gradient (slide -> slideLayout -> slideMaster fallback)
    let bgHex = '#FFFFFF';
    let slideGradient: { from: string; to: string; angle?: number } | undefined;
    const ownBg = extractBgFromDoc(doc);
    if (ownBg.hex) {
      bgHex = ownBg.hex;
      slideGradient = ownBg.grad;
    } else {
      const layBg = extractBgFromDoc(layoutDoc);
      if (layBg.hex) {
        bgHex = layBg.hex;
        slideGradient = layBg.grad;
      } else if (masterBg.hex) {
        bgHex = masterBg.hex;
        slideGradient = masterBg.grad;
      }
    }
    const bgIsDark = isHexDarkForPptx(bgHex);

    // Slide transition
    let transition: BoardPage['transition'] = 'fade';
    const transEl = doc.getElementsByTagNameNS('*', 'transition')[0];
    if (transEl) {
      if (transEl.getElementsByTagNameNS('*', 'push').length > 0 || transEl.getElementsByTagNameNS('*', 'wipe').length > 0) {
        transition = 'slide';
      } else if (transEl.getElementsByTagNameNS('*', 'zoom').length > 0) {
        transition = 'zoom';
      } else if (transEl.getElementsByTagNameNS('*', 'fade').length > 0) {
        transition = 'fade';
      }
    }

    // Extract speaker notes
    let speakerNotes = '';
    if (notesTarget && zip.file(notesTarget)) {
      try {
        const notesXml = await zip.file(notesTarget)!.async('string');
        const notesDoc = parser.parseFromString(notesXml, 'application/xml');
        const noteParas = Array.from(notesDoc.getElementsByTagNameNS('*', 'sp'))
          .filter((sp) => {
            const ph = sp.getElementsByTagNameNS('*', 'ph')[0];
            return ph?.getAttribute('type') === 'body';
          })
          .flatMap((sp) => Array.from(sp.getElementsByTagNameNS('*', 'p')));
        const noteLines = noteParas
          .map((p) =>
            Array.from(p.getElementsByTagNameNS('*', 't'))
              .map((t) => t.textContent || '')
              .join('')
              .trim()
          )
          .filter(Boolean);
        speakerNotes = noteLines.join('\n');
      } catch {
        // ignore notes parse failure
      }
    }

    // Walk <p:spTree> in exact XML painter order, filtering out <mc:Fallback> when <mc:Choice> exists, and collecting nested <p:grpSp> transforms
    type GroupMatrix = { offX: number; offY: number; sx: number; sy: number };
    type OrderedPptElement = { kind: 'sp' | 'cxnSp' | 'pic' | 'graphicFrame'; el: Element; mat: GroupMatrix };
    const orderedElements: OrderedPptElement[] = [];
    const spTree = doc.getElementsByTagNameNS('*', 'spTree')[0];

    const collectOrderedElements = (container: Element | undefined, mat: GroupMatrix) => {
      if (!container) return;
      for (const child of Array.from(container.children)) {
        const tag = child.localName;
        if (tag === 'AlternateContent') {
          const choice = Array.from(child.children).find((c) => c.localName === 'Choice');
          const fallback = Array.from(child.children).find((c) => c.localName === 'Fallback');
          collectOrderedElements(choice || fallback, mat);
        } else if (tag === 'grpSp') {
          const grpXfrm = child.getElementsByTagNameNS('*', 'grpSpPr')[0]?.getElementsByTagNameNS('*', 'xfrm')[0];
          const off = grpXfrm?.getElementsByTagNameNS('*', 'off')[0];
          const ext = grpXfrm?.getElementsByTagNameNS('*', 'ext')[0];
          const chOff = grpXfrm?.getElementsByTagNameNS('*', 'chOff')[0];
          const chExt = grpXfrm?.getElementsByTagNameNS('*', 'chExt')[0];
          const ox = Number(off?.getAttribute('x') || 0);
          const oy = Number(off?.getAttribute('y') || 0);
          const ex = Number(ext?.getAttribute('cx') || 0);
          const ey = Number(ext?.getAttribute('cy') || 0);
          const cox = Number(chOff?.getAttribute('x') || 0);
          const coy = Number(chOff?.getAttribute('y') || 0);
          const cex = Number(chExt?.getAttribute('cx') || 0);
          const cey = Number(chExt?.getAttribute('cy') || 0);
          const lsx = ex > 0 && cex > 0 ? ex / cex : 1;
          const lsy = ey > 0 && cey > 0 ? ey / cey : 1;
          const nextMat: GroupMatrix = {
            offX: mat.offX + (ox - cox * lsx) * mat.sx,
            offY: mat.offY + (oy - coy * lsy) * mat.sy,
            sx: mat.sx * lsx,
            sy: mat.sy * lsy,
          };
          collectOrderedElements(child, nextMat);
        } else if (tag === 'sp' || tag === 'cxnSp' || tag === 'pic' || tag === 'graphicFrame') {
          orderedElements.push({ kind: tag, el: child, mat });
        }
      }
    };
    collectOrderedElements(spTree, { offX: 0, offY: 0, sx: 1, sy: 1 });

    const transformEmuBox = (m: GroupMatrix, ox: number, oy: number, cx: number, cy: number) => {
      const finalOx = m.offX + ox * m.sx;
      const finalOy = m.offY + oy * m.sy;
      const finalCx = cx * m.sx;
      const finalCy = cy * m.sy;
      return {
        x: Math.round(finalOx * scaleX),
        y: Math.round(finalOy * scaleY),
        w: Math.max(4, Math.round(finalCx * scaleX)),
        h: Math.max(4, Math.round(finalCy * scaleY)),
      };
    };

    const objects: BoardObject[] = [];
    const embeddedRIds = new Set<string>();
    let yCursor = 90;

    for (let eIdx = 0; eIdx < orderedElements.length; eIdx++) {
      const item = orderedElements[eIdx];

      if (item.kind === 'sp') {
        const sp = item.el;
        const phEl = sp.getElementsByTagNameNS('*', 'ph')[0];
        const phType = phEl?.getAttribute('type') || '';
        const phIdx = phEl?.getAttribute('idx') || '';
        const phTpl =
          (phType && phIdx ? layoutPlaceholders.get(`${phType}:${phIdx}`) || masterPlaceholders.get(`${phType}:${phIdx}`) : undefined) ||
          (phType ? layoutPlaceholders.get(phType) || masterPlaceholders.get(phType) : undefined);

        const paragraphs = Array.from(sp.getElementsByTagNameNS('*', 'p'));
        const richBlocks: RichBlock[] = [];
        const lines: string[] = [];
        let numSeq = 0;

        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const p = paragraphs[pIdx];
          const pPr = Array.from(p.children).find((c) => c.localName === 'pPr');
          const hasBullet = Boolean(pPr?.getElementsByTagNameNS('*', 'buChar')[0]);
          const hasNum = Boolean(pPr?.getElementsByTagNameNS('*', 'buAutoNum')[0]);
          const algnAttr = pPr?.getAttribute('algn');
          const pAlign: TextAlignMode | undefined =
            algnAttr === 'ctr'
              ? 'center'
              : algnAttr === 'r'
                ? 'right'
                : algnAttr === 'just'
                  ? 'justify'
                  : algnAttr === 'l'
                    ? 'left'
                    : phTpl?.align;

          const rEls = Array.from(p.children).filter((c) => c.localName === 'r' || c.localName === 'fld');
          const runs: RichRun[] = [];
          for (const rEl of rEls) {
            const tText = Array.from(rEl.getElementsByTagNameNS('*', 't'))
              .map((t) => t.textContent || '')
              .join('');
            if (!tText) continue;
            const rPr = Array.from(rEl.children).find((c) => c.localName === 'rPr');
            const runColor = extractColorFromXmlNode(rPr, themeColors) || undefined;
            const hlEl = rPr?.getElementsByTagNameNS('*', 'highlight')[0];
            const runHighlight = extractColorFromXmlNode(hlEl, themeColors) || undefined;
            const uVal = rPr?.getAttribute('u');
            const strikeVal = rPr?.getAttribute('strike');
            runs.push({
              text: tText,
              bold: rPr?.getAttribute('b') === '1' ? true : undefined,
              italic: rPr?.getAttribute('i') === '1' ? true : undefined,
              underline: uVal && uVal !== 'none' ? true : undefined,
              strike: strikeVal && strikeVal !== 'noStrike' ? true : undefined,
              color: runColor,
              highlight: runHighlight,
            });
          }
          const plainPara = runs.map((r) => r.text).join('').trim();
          if (!plainPara) {
            numSeq = 0;
            continue;
          }
          if (hasNum) {
            numSeq += 1;
            lines.push(`${numSeq}. ${plainPara}`);
          } else {
            numSeq = 0;
            lines.push(hasBullet ? `• ${plainPara}` : plainPara);
          }
          richBlocks.push({
            type: 'paragraph',
            align: pAlign,
            indent: pPr?.getAttribute('lvl') ? Number(pPr.getAttribute('lvl')) || 0 : 0,
            listType: hasBullet ? 'bullet' : hasNum ? 'number' : 'none',
            runs: runs.length > 0 ? runs : [{ text: plainPara }],
          });
        }

        const spPr = sp.getElementsByTagNameNS('*', 'spPr')[0];
        const xfrm = spPr?.getElementsByTagNameNS('*', 'xfrm')[0];
        const offEl = xfrm?.getElementsByTagNameNS('*', 'off')[0] || sp.getElementsByTagNameNS('*', 'off')[0];
        const extEl = xfrm?.getElementsByTagNameNS('*', 'ext')[0] || sp.getElementsByTagNameNS('*', 'ext')[0];
        let x = 96;
        let y = yCursor;
        let w = 1088;
        let h = Math.max(58, lines.length * 32 + 24);
        if (offEl && extEl) {
          const ox = Number(offEl.getAttribute('x'));
          const oy = Number(offEl.getAttribute('y'));
          const cx = Number(extEl.getAttribute('cx'));
          const cy = Number(extEl.getAttribute('cy'));
          if (cx > 0 && cy > 0) {
            const box = transformEmuBox(item.mat, ox, oy, cx, cy);
            x = box.x;
            y = box.y;
            w = Math.max(28, box.w);
            h = Math.max(24, box.h);
          }
        } else if (phTpl && phTpl.cx && phTpl.cy && phTpl.offX != null && phTpl.offY != null) {
          const box = transformEmuBox(item.mat, phTpl.offX, phTpl.offY, phTpl.cx, phTpl.cy);
          x = box.x;
          y = box.y;
          w = Math.max(28, box.w);
          h = Math.max(24, box.h);
        } else {
          yCursor += h + 24;
        }

        const rotRaw = Number(xfrm?.getAttribute('rot') || 0);
        const rotation = rotRaw ? Math.round(rotRaw / 60000) : 0;
        const flipX = xfrm?.getAttribute('flipH') === '1';
        const flipY = xfrm?.getAttribute('flipV') === '1';

        const prstGeomEl = spPr?.getElementsByTagNameNS('*', 'prstGeom')[0];
        const prstGeom = prstGeomEl?.getAttribute('prst') || null;
        const adjGd = prstGeomEl?.getElementsByTagNameNS('*', 'gd')[0];
        const adjFmla = adjGd?.getAttribute('fmla') || '';
        const adjMatch = /^val\s+(\d+)$/.exec(adjFmla);
        const roundRadius =
          prstGeom === 'roundRect'
            ? adjMatch
              ? Math.max(4, Math.min(48, Math.round((Number(adjMatch[1]) / 100000) * Math.min(w, h))))
              : 14
            : undefined;

        const solidFill = spPr ? Array.from(spPr.children).find((c) => c.localName === 'solidFill') : undefined;
        const noFill = spPr ? Array.from(spPr.children).find((c) => c.localName === 'noFill') : undefined;
        const shapeGradEl = spPr ? Array.from(spPr.children).find((c) => c.localName === 'gradFill') : undefined;
        const styleEl = Array.from(sp.children).find((c) => c.localName === 'style');
        const fillRefEl = styleEl ? Array.from(styleEl.children).find((c) => c.localName === 'fillRef') : undefined;
        const lnRefEl = styleEl ? Array.from(styleEl.children).find((c) => c.localName === 'lnRef') : undefined;

        let fillColor = noFill
          ? 'transparent'
          : extractColorFromXmlNode(solidFill, themeColors) ||
            (fillRefEl && fillRefEl.getAttribute('idx') !== '0' ? extractColorFromXmlNode(fillRefEl, themeColors) : null) ||
            'transparent';
        let fillGradient: { from: string; to: string; angle: number } | undefined;
        if (shapeGradEl) {
          const gsList = Array.from(shapeGradEl.getElementsByTagNameNS('*', 'gs'));
          const gc1 = extractColorFromXmlNode(gsList[0], themeColors);
          const gc2 = extractColorFromXmlNode(gsList[gsList.length - 1], themeColors);
          if (gc1 && gc2) {
            fillColor = gc1;
            const linAng = Number(shapeGradEl.getElementsByTagNameNS('*', 'lin')[0]?.getAttribute('ang') || 0);
            fillGradient = { from: gc1, to: gc2, angle: linAng ? Math.round(linAng / 60000) : 135 };
          }
        }
        const alphaEl = (solidFill || spPr)?.getElementsByTagNameNS('*', 'alpha')[0];
        const alphaVal = alphaEl?.getAttribute('val');
        const objOpacity = alphaVal ? Math.max(0.1, Math.min(1, Number(alphaVal) / 100000)) : 1;

        const lnEl = spPr?.getElementsByTagNameNS('*', 'ln')[0];
        const noLine = lnEl?.getElementsByTagNameNS('*', 'noFill').length;
        const strokeColor = noLine
          ? 'transparent'
          : extractColorFromXmlNode(lnEl, themeColors) ||
            (!lnEl && lnRefEl && lnRefEl.getAttribute('idx') !== '0' ? extractColorFromXmlNode(lnRefEl, themeColors) : null) ||
            'transparent';
        const strokeWidth = lnEl?.getAttribute('w') ? Math.max(1, Math.round(Number(lnEl.getAttribute('w')) / 12700)) : 2;
        const dashVal = lnEl?.getElementsByTagNameNS('*', 'prstDash')[0]?.getAttribute('val') || '';
        const lineStyle: 'solid' | 'dashed' | 'dotted' =
          dashVal === 'sysDot' || dashVal === 'dot' ? 'dotted' : dashVal.includes('dash') || dashVal.includes('Dash') ? 'dashed' : 'solid';

        const firstRPr = sp.getElementsByTagNameNS('*', 'rPr')[0];
        const defRPr = sp.getElementsByTagNameNS('*', 'defRPr')[0];
        const szAttr = firstRPr?.getAttribute('sz') || defRPr?.getAttribute('sz');
        const pt100 = szAttr ? Number(szAttr) : phTpl?.fontSizePt100;
        const rawSz = pt100
          ? Math.round((pt100 / 100) * (1280 / 960) * 0.88)
          : phType === 'title' || phType === 'ctrTitle' || eIdx === 0
            ? 34
            : 18;
        const sz = Math.max(11, Math.min(96, rawSz));
        const boldAttr = firstRPr?.getAttribute('b') ?? defRPr?.getAttribute('b');
        const isBold = boldAttr === '1' || (boldAttr == null && (phTpl?.bold || phType === 'title' || phType === 'ctrTitle' || eIdx === 0));
        const isItalic = (firstRPr?.getAttribute('i') ?? defRPr?.getAttribute('i')) === '1';
        const uAttr = firstRPr?.getAttribute('u') ?? defRPr?.getAttribute('u');
        const isUnderline = Boolean(uAttr && uAttr !== 'none');
        const strikeAttr = firstRPr?.getAttribute('strike') ?? defRPr?.getAttribute('strike');
        const isStrike = Boolean(strikeAttr && strikeAttr !== 'noStrike');
        const latinFont =
          firstRPr?.getElementsByTagNameNS('*', 'latin')[0]?.getAttribute('typeface') ||
          defRPr?.getElementsByTagNameNS('*', 'latin')[0]?.getAttribute('typeface');
        const defaultAutoText = fillColor !== 'transparent' ? (isHexDarkForPptx(fillColor) ? '#F8FAFC' : '#0F172A') : bgIsDark ? '#F8FAFC' : '#0F172A';
        const textColor =
          extractColorFromXmlNode(firstRPr, themeColors) ||
          extractColorFromXmlNode(defRPr, themeColors) ||
          phTpl?.textColor ||
          defaultAutoText;
        const pPrFirst = sp.getElementsByTagNameNS('*', 'pPr')[0];
        const algn = pPrFirst?.getAttribute('algn');
        const textAlign: TextAlignMode =
          algn === 'ctr'
            ? 'center'
            : algn === 'r'
              ? 'right'
              : algn === 'just'
                ? 'justify'
                : algn === 'l'
                  ? 'left'
                  : phTpl?.align || 'left';
        const bodyPr = sp.getElementsByTagNameNS('*', 'bodyPr')[0];
        const anchorAttr = bodyPr?.getAttribute('anchor');
        const verticalAlign: 'top' | 'middle' | 'bottom' =
          anchorAttr === 't' ? 'top' : anchorAttr === 'b' ? 'bottom' : 'middle';

        const nvSpPr = sp.getElementsByTagNameNS('*', 'cNvSpPr')[0];
        const isTxBox = nvSpPr?.getAttribute('txBox') === '1';

        if (prstGeom === 'line') {
          const x1 = flipX ? x + w : x;
          const y1 = flipY ? y + h : y;
          const x2 = flipX ? x : x + w;
          const y2 = flipY ? y : y + h;
          const headType = lnEl?.getElementsByTagNameNS('*', 'headEnd')[0]?.getAttribute('type');
          const tailType = lnEl?.getElementsByTagNameNS('*', 'tailEnd')[0]?.getAttribute('type');
          objects.push({
            id: uid('line'),
            name: `Line ${objects.length + 1}`,
            type: 'line',
            x,
            y,
            width: w,
            height: h,
            rotation: 0,
            opacity: objOpacity,
            locked: false,
            hidden: false,
            zIndex: objects.length + 1,
            points: [
              { x: x1, y: y1 },
              { x: x2, y: y2 },
            ],
            stroke: strokeColor === 'transparent' ? (bgIsDark ? '#F8FAFC' : '#0F172A') : strokeColor,
            strokeWidth,
            lineStyle,
            startHead: headType === 'triangle' ? 'arrow' : headType === 'oval' ? 'dot' : headType === 'diamond' ? 'diamond' : 'none',
            endHead: tailType === 'triangle' ? 'arrow' : tailType === 'oval' ? 'dot' : tailType === 'diamond' ? 'diamond' : 'none',
          });
          continue;
        }

        if (lines.length === 0 && fillColor === 'transparent' && strokeColor === 'transparent' && !fillGradient) continue;

        if (!isTxBox && ((prstGeom && prstGeom !== 'rect') || fillColor !== 'transparent' || strokeColor !== 'transparent' || fillGradient)) {
          const hasShadow = Boolean(spPr?.getElementsByTagNameNS('*', 'outerShdw')[0]);
          objects.push({
            id: uid('shape'),
            name: lines[0]?.slice(0, 28) || `Shape ${objects.length + 1}`,
            type: 'shape',
            shapeKind: mapPptPrstToShapeKind(prstGeom),
            x,
            y,
            width: w,
            height: h,
            rotation,
            flipX,
            flipY,
            opacity: objOpacity,
            locked: false,
            hidden: false,
            zIndex: objects.length + 1,
            fill: fillColor,
            fillGradient,
            stroke: strokeColor === 'transparent' && fillColor === 'transparent' && !fillGradient ? '#64748B' : strokeColor,
            strokeWidth,
            lineStyle,
            cornerRadius: roundRadius,
            shadow: hasShadow,
            text: lines.join('\n'),
            textColor,
            fontFamily: latinFont || 'Plus Jakarta Sans',
            fontSize: sz,
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
            textAlign,
            verticalAlign,
          });
        } else {
          objects.push({
            id: uid('text'),
            name: phType === 'title' || phType === 'ctrTitle' || eIdx === 0 ? `Slide ${slideNum} Title` : `Text Block ${objects.length + 1}`,
            type: 'text',
            x,
            y,
            width: w,
            height: h,
            rotation,
            flipX,
            flipY,
            opacity: objOpacity,
            locked: false,
            hidden: false,
            zIndex: objects.length + 1,
            text: lines.join('\n'),
            richBlocks: richBlocks.length > 0 ? richBlocks : undefined,
            textColor,
            bgColor: fillColor,
            borderColor: strokeColor !== 'transparent' ? strokeColor : undefined,
            borderWidth: strokeColor !== 'transparent' ? strokeWidth : undefined,
            borderRadius: roundRadius,
            fontFamily: latinFont || 'Plus Jakarta Sans',
            fontSize: sz,
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
            underline: isUnderline,
            strikethrough: isStrike,
            textAlign,
          });
        }
      } else if (item.kind === 'cxnSp') {
        const cxn = item.el;
        const spPr = cxn.getElementsByTagNameNS('*', 'spPr')[0];
        const xfrm = spPr?.getElementsByTagNameNS('*', 'xfrm')[0];
        const offEl = xfrm?.getElementsByTagNameNS('*', 'off')[0];
        const extEl = xfrm?.getElementsByTagNameNS('*', 'ext')[0];
        if (!offEl || !extEl) continue;
        const box = transformEmuBox(
          item.mat,
          Number(offEl.getAttribute('x') || 0),
          Number(offEl.getAttribute('y') || 0),
          Number(extEl.getAttribute('cx') || 0),
          Number(extEl.getAttribute('cy') || 0)
        );
        const flipH = xfrm?.getAttribute('flipH') === '1';
        const flipV = xfrm?.getAttribute('flipV') === '1';
        const x1 = flipH ? box.x + box.w : box.x;
        const y1 = flipV ? box.y + box.h : box.y;
        const x2 = flipH ? box.x : box.x + box.w;
        const y2 = flipV ? box.y : box.y + box.h;
        const lnEl = spPr?.getElementsByTagNameNS('*', 'ln')[0];
        const strokeColor = extractColorFromXmlNode(lnEl, themeColors) || (bgIsDark ? '#F8FAFC' : '#0F172A');
        const strokeWidth = lnEl?.getAttribute('w') ? Math.max(1, Math.round(Number(lnEl.getAttribute('w')) / 12700)) : 2;
        const dashVal = lnEl?.getElementsByTagNameNS('*', 'prstDash')[0]?.getAttribute('val') || '';
        const lineStyle: 'solid' | 'dashed' | 'dotted' =
          dashVal === 'sysDot' || dashVal === 'dot' ? 'dotted' : dashVal.includes('dash') || dashVal.includes('Dash') ? 'dashed' : 'solid';
        const headType = lnEl?.getElementsByTagNameNS('*', 'headEnd')[0]?.getAttribute('type');
        const tailType = lnEl?.getElementsByTagNameNS('*', 'tailEnd')[0]?.getAttribute('type');
        objects.push({
          id: uid('line'),
          name: `Arrow ${objects.length + 1}`,
          type: 'line',
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: objects.length + 1,
          points: [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
          ],
          stroke: strokeColor,
          strokeWidth,
          lineStyle,
          startHead: headType === 'triangle' ? 'arrow' : headType === 'oval' ? 'dot' : headType === 'diamond' ? 'diamond' : 'none',
          endHead: tailType === 'triangle' ? 'arrow' : tailType === 'oval' ? 'dot' : tailType === 'diamond' ? 'diamond' : 'none',
        });
      } else if (item.kind === 'graphicFrame') {
        const gf = item.el;
        const tbl = gf.getElementsByTagNameNS('*', 'tbl')[0];
        if (!tbl) continue;
        const offEl = gf.getElementsByTagNameNS('*', 'off')[0];
        const extEl = gf.getElementsByTagNameNS('*', 'ext')[0];
        const box =
          offEl && extEl
            ? transformEmuBox(
                item.mat,
                Number(offEl.getAttribute('x') || 0),
                Number(offEl.getAttribute('y') || 0),
                Number(extEl.getAttribute('cx') || 0),
                Number(extEl.getAttribute('cy') || 0)
              )
            : { x: 80, y: 140, w: 640, h: 260 };

        const gridCols = Array.from(tbl.getElementsByTagNameNS('*', 'gridCol')).map((g) => Number(g.getAttribute('w') || 0));
        const totalGridW = gridCols.reduce((a, b) => a + b, 0);
        const colWidths =
          gridCols.length > 0 && totalGridW > 0 ? gridCols.map((w) => Number((w / totalGridW).toFixed(4))) : undefined;

        const trList = Array.from(tbl.getElementsByTagNameNS('*', 'tr'));
        const rowHeightsRaw = trList.map((tr) => Number(tr.getAttribute('h') || 0));
        const totalRowH = rowHeightsRaw.reduce((a, b) => a + b, 0);
        const rowHeights =
          rowHeightsRaw.length > 0 && totalRowH > 0 ? rowHeightsRaw.map((h) => Number((h / totalRowH).toFixed(4))) : undefined;

        const cellAlignMap: Record<string, TextAlignMode> = {};
        const cells = trList.map((tr, rIdx) =>
          Array.from(tr.getElementsByTagNameNS('*', 'tc')).map((tc, cIdx) => {
            const pPrTc = tc.getElementsByTagNameNS('*', 'pPr')[0];
            const algn = pPrTc?.getAttribute('algn');
            if (algn === 'ctr') cellAlignMap[`${rIdx}:${cIdx}`] = 'center';
            else if (algn === 'r') cellAlignMap[`${rIdx}:${cIdx}`] = 'right';
            else if (algn === 'just') cellAlignMap[`${rIdx}:${cIdx}`] = 'justify';
            return Array.from(tc.getElementsByTagNameNS('*', 't'))
              .map((t) => t.textContent || '')
              .join('')
              .trim();
          })
        );
        if (cells.length > 0 && cells[0].length > 0) {
          const firstTcPr = tbl.getElementsByTagNameNS('*', 'tcPr')[0];
          const headerColor = extractColorFromXmlNode(firstTcPr, themeColors) || '#1E293B';
          const bodyTc = trList[1]?.getElementsByTagNameNS('*', 'tc')[0];
          const bodyRPr = bodyTc?.getElementsByTagNameNS('*', 'rPr')[0];
          const bodyTcFill = extractColorFromXmlNode(bodyTc?.getElementsByTagNameNS('*', 'tcPr')[0], themeColors);
          const bodyTextColor =
            extractColorFromXmlNode(bodyRPr, themeColors) ||
            (bodyTcFill ? (isHexDarkForPptx(bodyTcFill) ? '#F8FAFC' : '#0F172A') : bgIsDark ? '#F8FAFC' : '#0F172A');
          const tableObj: TableObject = {
            id: uid('table'),
            name: 'Imported Table',
            type: 'table',
            x: box.x,
            y: box.y,
            width: Math.max(220, box.w),
            height: Math.max(100, box.h),
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            zIndex: objects.length + 1,
            rows: cells.length,
            cols: Math.max(...cells.map((r) => r.length)),
            cells,
            colWidths,
            rowHeights,
            cellAlign: Object.keys(cellAlignMap).length > 0 ? cellAlignMap : undefined,
            headerBg: headerColor,
            borderColor: bgIsDark ? '#475569' : '#CBD5E1',
            textColor: bodyTextColor,
          };
          objects.push(tableObj);
        }
      } else if (item.kind === 'pic') {
        const pic = item.el;
        const blip = pic.getElementsByTagNameNS('*', 'blip')[0];
        const rId =
          blip?.getAttribute('r:embed') ||
          blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
          '';
        const target = relTargetById.get(rId);
        if (!target || !target.includes('media/')) continue;
        embeddedRIds.add(rId);
        const mediaKey = 'ppt/' + target.replace(/^(\.\.\/)+/, '');
        const mediaFile = zip.file(mediaKey);
        if (!mediaFile) continue;
        const b64 = await mediaFile.async('base64');
        const ext = mediaKey.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
        const dataSrc = `data:${mime};base64,${b64}`;

        const spPr = pic.getElementsByTagNameNS('*', 'spPr')[0];
        const xfrm = spPr?.getElementsByTagNameNS('*', 'xfrm')[0];
        const offEl = xfrm?.getElementsByTagNameNS('*', 'off')[0] || pic.getElementsByTagNameNS('*', 'off')[0];
        const extEl = xfrm?.getElementsByTagNameNS('*', 'ext')[0] || pic.getElementsByTagNameNS('*', 'ext')[0];
        const box =
          offEl && extEl
            ? transformEmuBox(
                item.mat,
                Number(offEl.getAttribute('x') || 0),
                Number(offEl.getAttribute('y') || 0),
                Number(extEl.getAttribute('cx') || 0),
                Number(extEl.getAttribute('cy') || 0)
              )
            : { x: 520, y: 160, w: 360, h: 240 };

        const rotRaw = Number(xfrm?.getAttribute('rot') || 0);
        const rotation = rotRaw ? Math.round(rotRaw / 60000) : 0;
        const flipX = xfrm?.getAttribute('flipH') === '1';
        const flipY = xfrm?.getAttribute('flipV') === '1';
        const alphaAmt = blip?.getElementsByTagNameNS('*', 'alphaModFix')[0]?.getAttribute('amt');
        const imgOpacity = alphaAmt ? Math.max(0.1, Math.min(1, Number(alphaAmt) / 100000)) : 1;

        let cropRect: ImageObject['crop'];
        const srcRectEl = pic.getElementsByTagNameNS('*', 'srcRect')[0];
        if (srcRectEl) {
          const cl = Math.max(0, Number(srcRectEl.getAttribute('l') || 0) / 100000);
          const ct = Math.max(0, Number(srcRectEl.getAttribute('t') || 0) / 100000);
          const cr = Math.max(0, Number(srcRectEl.getAttribute('r') || 0) / 100000);
          const cb = Math.max(0, Number(srcRectEl.getAttribute('b') || 0) / 100000);
          if (cl + cr < 0.98 && ct + cb < 0.98 && (cl > 0.005 || ct > 0.005 || cr > 0.005 || cb > 0.005)) {
            const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
              const probe = new Image();
              probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight });
              probe.onerror = () => resolve(null);
              probe.src = dataSrc;
            });
            if (dims && dims.w > 0 && dims.h > 0) {
              cropRect = {
                sx: Math.round(cl * dims.w),
                sy: Math.round(ct * dims.h),
                sw: Math.max(8, Math.round((1 - cl - cr) * dims.w)),
                sh: Math.max(8, Math.round((1 - ct - cb) * dims.h)),
              };
            }
          }
        }

        objects.push({
          id: uid('img'),
          name: 'Slide Image',
          type: 'image',
          x: box.x,
          y: box.y,
          width: Math.max(40, box.w),
          height: Math.max(40, box.h),
          rotation,
          flipX,
          flipY,
          opacity: imgOpacity,
          locked: false,
          hidden: false,
          zIndex: objects.length + 1,
          src: dataSrc,
          mask: 'none',
          crop: cropRect,
          filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
        });
      }
    }

    // Fallback for any media relationship not directly mapped to a <p:pic>
    let fallbackOffset = 0;
    for (const [rId, target] of relTargetById.entries()) {
      if (embeddedRIds.has(rId) || !target.includes('media/')) continue;
      const mediaKey = 'ppt/' + target.replace(/^(\.\.\/)+/, '');
      const mediaFile = zip.file(mediaKey);
      if (!mediaFile) continue;
      const b64 = await mediaFile.async('base64');
      const ext = mediaKey.split('.').pop()?.toLowerCase() || 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
      objects.push({
        id: uid('img'),
        name: 'Slide Media',
        type: 'image',
        x: Math.round(740 + fallbackOffset * 36),
        y: 160 + fallbackOffset * 36,
        width: 360,
        height: 240,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: objects.length + 1,
        src: `data:${mime};base64,${b64}`,
        mask: 'none',
        filters: { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 },
      });
      fallbackOffset++;
    }

    const firstHeading = objects.find((o) => o.type === 'text' && 'text' in o && o.text.trim()) as
      | { text: string }
      | undefined;

    pages.push({
      id: uid('page'),
      name: firstHeading?.text.split('\n')[0].slice(0, 32) || `Slide ${slideNum}`,
      objects,
      layers: [{ id: 'layer-default', name: 'Slide Layer', visible: true, locked: false }],
      guides: [],
      background: bgHex,
      slideGradient,
      gridType: 'none',
      gridSize: 28,
      transition,
      slideDurationSec: 0,
      speakerNotes,
      importedSource: {
        kind: 'pptx',
        fileId,
        fileName,
        pageNumber: slideNum,
        readOnlyOverlay: false,
      },
    });
  }

  return pages;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hex6(color?: string, fallback = 'FFFFFF'): string {
  if (!color) return fallback;
  const clean = color.trim().replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return clean.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return clean
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase();
  }
  return fallback;
}

function mapShapeKindToPptPrst(kind: string): string {
  if (kind === 'circle' || kind === 'ellipse') return 'ellipse';
  if (kind === 'rounded_rect' || kind === 'flow_terminator') return 'roundRect';
  if (kind === 'triangle') return 'triangle';
  if (kind === 'right_triangle') return 'rtTriangle';
  if (kind === 'diamond' || kind === 'flow_decision') return 'diamond';
  if (kind === 'pentagon') return 'pentagon';
  if (kind === 'hexagon') return 'hexagon';
  if (kind === 'star') return 'star5';
  if (kind === 'heart') return 'heart';
  if (kind === 'cloud') return 'cloud';
  if (kind === 'block_arrow_right') return 'rightArrow';
  if (kind === 'block_arrow_left') return 'leftArrow';
  if (kind === 'block_arrow_up') return 'upArrow';
  if (kind === 'block_arrow_down') return 'downArrow';
  if (kind === 'parallelogram') return 'parallelogram';
  if (kind === 'trapezoid') return 'trapezoid';
  if (kind === 'speech_bubble' || kind === 'callout') return 'wedgeRoundRectCallout';
  return 'rect';
}

async function resolveExportImageBase64(obj: ImageObject): Promise<{ ext: 'png' | 'jpg'; base64: string } | null> {
  try {
    const f = obj.filters || { brightness: 100, contrast: 100, grayscale: 0, sepia: 0, blur: 0 };
    const hasFilter = f.brightness !== 100 || f.contrast !== 100 || f.grayscale > 0 || f.sepia > 0 || f.blur > 0;
    const needsBake = Boolean(obj.crop) || obj.mask !== 'none' || hasFilter;

    if (!needsBake) {
      const direct = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(obj.src);
      if (direct) {
        return { ext: direct[1].toLowerCase() === 'png' ? 'png' : 'jpg', base64: direct[2] };
      }
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = obj.src;
    });

    const natW = Math.max(1, img.naturalWidth || Math.round(obj.width));
    const natH = Math.max(1, img.naturalHeight || Math.round(obj.height));
    const sx = obj.crop ? Math.max(0, Math.min(natW - 1, obj.crop.sx)) : 0;
    const sy = obj.crop ? Math.max(0, Math.min(natH - 1, obj.crop.sy)) : 0;
    const sw = obj.crop ? Math.max(1, Math.min(natW - sx, obj.crop.sw)) : natW;
    const sh = obj.crop ? Math.max(1, Math.min(natH - sy, obj.crop.sh)) : natH;

    const outW = Math.max(8, Math.round(obj.mask !== 'none' ? obj.width * 2 : sw));
    const outH = Math.max(8, Math.round(obj.mask !== 'none' ? obj.height * 2 : sh));

    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    if (obj.mask !== 'none') {
      ctx.beginPath();
      if (obj.mask === 'circle') {
        ctx.ellipse(outW / 2, outH / 2, outW / 2, outH / 2, 0, 0, Math.PI * 2);
      } else if (obj.mask === 'rounded') {
        const r = Math.min(outW, outH) * 0.12;
        ctx.roundRect(0, 0, outW, outH, r);
      } else if (obj.mask === 'hex') {
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i - Math.PI / 6;
          const px = outW / 2 + (outW / 2) * Math.cos(ang);
          const py = outH / 2 + (outH / 2) * Math.sin(ang);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else if (obj.mask === 'star') {
        for (let i = 0; i < 10; i++) {
          const rad = i % 2 === 0 ? 0.5 : 0.22;
          const ang = (Math.PI / 5) * i - Math.PI / 2;
          const px = outW / 2 + outW * rad * Math.cos(ang);
          const py = outH / 2 + outH * rad * Math.sin(ang);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.clip();
    }

    if (hasFilter) {
      ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) blur(${f.blur}px)`;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    const pngUrl = c.toDataURL('image/png');
    const b64 = pngUrl.split(',')[1];
    return b64 ? { ext: 'png', base64: b64 } : null;
  } catch {
    return null;
  }
}

async function rasterizeSingleObjectToPngBase64(page: BoardPage, obj: BoardObject): Promise<string | null> {
  try {
    const rad = Math.abs(((obj.rotation || 0) * Math.PI) / 180);
    const rotExtraW = Math.ceil((Math.abs(obj.width * Math.cos(rad)) + Math.abs(obj.height * Math.sin(rad)) - obj.width) / 2);
    const rotExtraH = Math.ceil((Math.abs(obj.width * Math.sin(rad)) + Math.abs(obj.height * Math.cos(rad)) - obj.height) / 2);
    const padX = Math.max(18, rotExtraW + 18);
    const padY = Math.max(18, rotExtraH + 18);
    const w = Math.max(60, Math.round(obj.width + padX * 2));
    const h = Math.max(60, Math.round(obj.height + padY * 2));
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(2, 2);
    ctx.translate(padX - obj.x, padY - obj.y);
    const byId = new Map(page.objects.map((o) => [o.id, o]));
    drawBoardObject(ctx, obj, byId, undefined, { hideMathText: obj.type === 'math' });
    if (obj.type === 'math') {
      ctx.save();
      ctx.globalAlpha = obj.opacity ?? 1;
      if (obj.rotation) {
        const mcx = obj.x + obj.width / 2;
        const mcy = obj.y + obj.height / 2;
        ctx.translate(mcx, mcy);
        ctx.rotate((obj.rotation * Math.PI) / 180);
        ctx.translate(-mcx, -mcy);
      }
      try {
        const html = katex.renderToString(obj.latex || 'x', { throwOnError: false, displayMode: true });
        const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(40, Math.round(obj.width))}" height="${Math.max(24, Math.round(obj.height))}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${obj.fontSize || 20}px;color:${obj.color || '#0F172A'};font-family:KaTeX_Main,Times New Roman,serif;">${html}</div></foreignObject></svg>`;
        const kImg = await new Promise<HTMLImageElement | null>((resolve) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => resolve(null);
          el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
        });
        if (kImg) {
          ctx.drawImage(kImg, obj.x, obj.y, obj.width, obj.height);
        } else {
          drawBoardObject(ctx, obj, byId);
        }
      } catch {
        drawBoardObject(ctx, obj, byId);
      }
      ctx.restore();
    }
    return canvas.toDataURL('image/png').split(',')[1] || null;
  } catch {
    return null;
  }
}

// High-Fidelity PPTX Exporter creating MS PowerPoint 16:9 (1280x720 = 12192000x6858000 EMU) OOXML archive with speaker notes, gradients, rich text, and transitions
export async function exportPagesToPPTX(pages: BoardPage[], deckTitle: string): Promise<Blob> {
  const zip = new JSZip();
  const EMU_PER_PX = 9525; // 1280 * 9525 = 12192000 EMU (13.333 in), 720 * 9525 = 6858000 EMU (7.5 in)

  const slideOverrides = pages
    .map(
      (p, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
        (p.speakerNotes?.trim()
          ? `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
          : '')
    )
    .join('');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  ${slideOverrides}
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  const slideIds = pages.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );

  const slideRelsEntries = pages
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
    )
    .join('');

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRelsEntries}
</Relationships>`
  );

  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`
  );

  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
  );

  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`
  );

  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  let mediaCounter = 1;

  for (let idx = 0; idx < pages.length; idx++) {
    const page = pages[idx];
    const slideNum = idx + 1;
    const shapeXmls: string[] = [];
    const slideExtraRels: string[] = [];
    let nextRelNum = 2;
    let spId = 2;

    const visibleObjs = page.objects.filter((o) => !o.hidden).sort((a, b) => a.zIndex - b.zIndex);
    for (const obj of visibleObjs) {
      const xEmu = Math.max(0, Math.round(obj.x * EMU_PER_PX));
      const yEmu = Math.max(0, Math.round(obj.y * EMU_PER_PX));
      const wEmu = Math.max(152400, Math.round(obj.width * EMU_PER_PX));
      const hEmu = Math.max(152400, Math.round(obj.height * EMU_PER_PX));
      const rotAttr = obj.rotation ? ` rot="${Math.round(obj.rotation * 60000)}"` : '';
      const flipHAttr = obj.flipX ? ' flipH="1"' : '';
      const flipVAttr = obj.flipY ? ' flipV="1"' : '';

      if (obj.type === 'image') {
        const resolved = await resolveExportImageBase64(obj);
        if (resolved) {
          const mediaName = `img_${mediaCounter++}.${resolved.ext}`;
          zip.file(`ppt/media/${mediaName}`, resolved.base64, { base64: true });
          const rId = `rId${nextRelNum++}`;
          slideExtraRels.push(
            `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`
          );
          const blipOpacityXml =
            (obj.opacity ?? 1) < 0.99 ? `<a:alphaModFix amt="${Math.round((obj.opacity ?? 1) * 100000)}"/>` : '';
          shapeXmls.push(`
      <p:pic>
        <p:nvPicPr><p:cNvPr id="${spId++}" name="${escapeXml(obj.fileName || mediaName)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="${rId}">${blipOpacityXml}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm${rotAttr}${flipHAttr}${flipVAttr}><a:off x="${xEmu}" y="${yEmu}"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>`);
          continue;
        }
      }

      if (obj.type === 'table') {
        const totalCols = Math.max(1, obj.cols);
        const totalRows = Math.max(1, obj.rows);
        const colWidthsFrac =
          obj.colWidths && obj.colWidths.length === totalCols
            ? obj.colWidths
            : Array.from({ length: totalCols }, () => 1 / totalCols);
        const rowHeightsFrac =
          obj.rowHeights && obj.rowHeights.length === totalRows
            ? obj.rowHeights
            : Array.from({ length: totalRows }, () => 1 / totalRows);
        const gridCols = colWidthsFrac.map((f) => `<a:gridCol w="${Math.max(152400, Math.round(wEmu * f))}"/>`).join('');

        const bodyIsDark = !isHexDarkForPptx(obj.textColor);
        const bodyRowFill = bodyIsDark ? '1E293B' : 'FFFFFF';
        const bodyAltFill = bodyIsDark ? '243247' : 'F8FAFC';
        const headerTextHex = isHexDarkForPptx(obj.headerBg) ? 'FFFFFF' : '0F172A';

        const trXml = obj.cells
          .map((row, rIdx) => {
            const rH = Math.max(152400, Math.round(hEmu * (rowHeightsFrac[rIdx] ?? 1 / totalRows)));
            return `<a:tr h="${rH}">${row
              .map((cell, cIdx) => {
                const cellAlign =
                  typeof obj.cellAlign === 'string'
                    ? obj.cellAlign
                    : obj.cellAlign?.[`${rIdx}:${cIdx}`] || 'left';
                const algnAttr =
                  cellAlign === 'center'
                    ? ' algn="ctr"'
                    : cellAlign === 'right'
                      ? ' algn="r"'
                      : cellAlign === 'justify'
                        ? ' algn="just"'
                        : '';
                const cellFill =
                  rIdx === 0 ? hex6(obj.headerBg, '1E293B') : rIdx % 2 === 0 ? bodyAltFill : bodyRowFill;
                return `<a:tc><a:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr${algnAttr}/><a:r><a:rPr lang="en-US" sz="1200"${rIdx === 0 ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${rIdx === 0 ? headerTextHex : hex6(obj.textColor, '0F172A')}"/></a:solidFill></a:rPr><a:t>${escapeXml(cell || '')}</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="${cellFill}"/></a:solidFill></a:tcPr></a:tc>`;
              })
              .join('')}</a:tr>`;
          })
          .join('');
        shapeXmls.push(`
      <p:graphicFrame>
        <p:nvGraphicFramePr><p:cNvPr id="${spId++}" name="${escapeXml(obj.name || 'Table')}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>
        <p:xfrm><a:off x="${xEmu}" y="${yEmu}"/><a:ext cx="${wEmu}" cy="${hEmu}"/></p:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${gridCols}</a:tblGrid>${trXml}</a:tbl></a:graphicData></a:graphic>
      </p:graphicFrame>`);
        continue;
      }

      // Native MS Office Vector Lines & Straight Arrows (<p:cxnSp>)
      if (
        (obj.type === 'line' && !obj.curved && obj.points.length === 2) ||
        (obj.type === 'connector' && obj.routeType === 'straight' && !obj.label)
      ) {
        const p1 = obj.type === 'line' ? obj.points[0] : { x: obj.x1, y: obj.y1 };
        const p2 = obj.type === 'line' ? obj.points[1] : { x: obj.x2, y: obj.y2 };
        const minX = Math.min(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const lxEmu = Math.max(0, Math.round(minX * EMU_PER_PX));
        const lyEmu = Math.max(0, Math.round(minY * EMU_PER_PX));
        const lwEmu = Math.max(0, Math.round(Math.abs(p2.x - p1.x) * EMU_PER_PX));
        const lhEmu = Math.max(0, Math.round(Math.abs(p2.y - p1.y) * EMU_PER_PX));
        const lFlipH = p2.x < p1.x ? ' flipH="1"' : '';
        const lFlipV = p2.y < p1.y ? ' flipV="1"' : '';
        const dashTag =
          obj.lineStyle === 'dashed'
            ? '<a:prstDash val="dash"/>'
            : obj.lineStyle === 'dotted'
              ? '<a:prstDash val="sysDot"/>'
              : '<a:prstDash val="solid"/>';
        const mapEnd = (style: string) =>
          style === 'arrow' ? 'triangle' : style === 'dot' ? 'oval' : style === 'diamond' ? 'diamond' : 'none';
        const hType = mapEnd(obj.startHead);
        const tType = mapEnd(obj.endHead);
        const alphaXml =
          (obj.opacity ?? 1) < 0.99 ? `<a:alpha val="${Math.round((obj.opacity ?? 1) * 100000)}"/>` : '';
        shapeXmls.push(`
      <p:cxnSp>
        <p:nvCxnSpPr><p:cNvPr id="${spId++}" name="${escapeXml(obj.name || 'Line')}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>
        <p:spPr>
          <a:xfrm${lFlipH}${lFlipV}><a:off x="${lxEmu}" y="${lyEmu}"/><a:ext cx="${lwEmu}" cy="${lhEmu}"/></a:xfrm>
          <a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>
          <a:ln w="${Math.round((obj.strokeWidth || 2) * 12700)}" cap="rnd">
            <a:solidFill><a:srgbClr val="${hex6(obj.stroke, '0F172A')}">${alphaXml}</a:srgbClr></a:solidFill>
            ${dashTag}
            ${hType !== 'none' ? `<a:headEnd type="${hType}" w="med" len="med"/>` : ''}
            ${tType !== 'none' ? `<a:tailEnd type="${tType}" w="med" len="med"/>` : ''}
          </a:ln>
        </p:spPr>
      </p:cxnSp>`);
        continue;
      }

      if (obj.type === 'stroke' || obj.type === 'chart' || obj.type === 'graph' || obj.type === 'line' || obj.type === 'connector' || obj.type === 'math') {
        const b64 = await rasterizeSingleObjectToPngBase64(page, obj);
        if (b64) {
          const rad = Math.abs(((obj.rotation || 0) * Math.PI) / 180);
          const rotExtraW = Math.ceil((Math.abs(obj.width * Math.cos(rad)) + Math.abs(obj.height * Math.sin(rad)) - obj.width) / 2);
          const rotExtraH = Math.ceil((Math.abs(obj.width * Math.sin(rad)) + Math.abs(obj.height * Math.cos(rad)) - obj.height) / 2);
          const padX = Math.max(18, rotExtraW + 18);
          const padY = Math.max(18, rotExtraH + 18);
          const rxEmu = Math.max(0, Math.round((obj.x - padX) * EMU_PER_PX));
          const ryEmu = Math.max(0, Math.round((obj.y - padY) * EMU_PER_PX));
          const rwEmu = Math.max(152400, Math.round((obj.width + padX * 2) * EMU_PER_PX));
          const rhEmu = Math.max(152400, Math.round((obj.height + padY * 2) * EMU_PER_PX));
          const mediaName = `obj_${mediaCounter++}.png`;
          zip.file(`ppt/media/${mediaName}`, b64, { base64: true });
          const rId = `rId${nextRelNum++}`;
          slideExtraRels.push(
            `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`
          );
          shapeXmls.push(`
      <p:pic>
        <p:nvPicPr><p:cNvPr id="${spId++}" name="${escapeXml(obj.name || mediaName)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
        <p:spPr><a:xfrm><a:off x="${rxEmu}" y="${ryEmu}"/><a:ext cx="${rwEmu}" cy="${rhEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      </p:pic>`);
          continue;
        }
      }

      if (obj.type === 'text' || obj.type === 'shape' || obj.type === 'sticky') {
        const content = 'text' in obj ? obj.text || '' : '';
        const textHex = hex6(obj.textColor, '0F172A');
        const fillColor =
          obj.type === 'shape' ? obj.fill : obj.type === 'sticky' ? obj.noteColor : obj.bgColor;
        const alphaXml =
          (obj.opacity ?? 1) < 0.99 ? `<a:alpha val="${Math.round((obj.opacity ?? 1) * 100000)}"/>` : '';
        const fillXml =
          obj.type === 'shape' && obj.fillGradient
            ? `<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="${hex6(obj.fillGradient.from)}">${alphaXml}</a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="${hex6(obj.fillGradient.to)}">${alphaXml}</a:srgbClr></a:gs></a:gsLst><a:lin ang="${Math.round((obj.fillGradient.angle ?? 45) * 60000)}" scaled="1"/></a:gradFill>`
            : fillColor && fillColor !== 'transparent'
              ? `<a:solidFill><a:srgbClr val="${hex6(fillColor)}">${alphaXml}</a:srgbClr></a:solidFill>`
              : '<a:noFill/>';
        const dashTag =
          obj.type === 'shape' && obj.lineStyle === 'dashed'
            ? '<a:prstDash val="dash"/>'
            : obj.type === 'shape' && obj.lineStyle === 'dotted'
              ? '<a:prstDash val="sysDot"/>'
              : '';
        const lnXml =
          obj.type === 'shape' && obj.stroke && obj.stroke !== 'transparent'
            ? `<a:ln w="${Math.round((obj.strokeWidth || 2) * 12700)}"><a:solidFill><a:srgbClr val="${hex6(obj.stroke)}">${alphaXml}</a:srgbClr></a:solidFill>${dashTag}</a:ln>`
            : obj.type === 'text' && obj.borderColor && obj.borderColor !== 'transparent'
              ? `<a:ln w="${Math.round((obj.borderWidth || 1.5) * 12700)}"><a:solidFill><a:srgbClr val="${hex6(obj.borderColor)}">${alphaXml}</a:srgbClr></a:solidFill></a:ln>`
              : '<a:ln><a:noFill/></a:ln>';
        const prst = obj.type === 'shape' ? mapShapeKindToPptPrst(obj.shapeKind) : obj.type === 'text' && (obj.borderRadius || 0) > 4 ? 'roundRect' : 'rect';
        const avLstXml =
          prst === 'roundRect'
            ? `<a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.max(2000, Math.round(((obj.type === 'shape' ? obj.cornerRadius || 14 : obj.type === 'text' ? obj.borderRadius || 8 : 8) / Math.max(1, Math.min(obj.width, obj.height))) * 100000)))}"/></a:avLst>`
            : '<a:avLst/>';
        const shadowXml =
          obj.type === 'shape' && obj.shadow
            ? '<a:effectLst><a:outerShdw blurRad="152400" dist="50800" dir="5400000" algn="ctr"><a:srgbClr val="0F172A"><a:alpha val="20000"/></a:srgbClr></a:outerShdw></a:effectLst>'
            : '';
        const baseFontPt100 = Math.round((('fontSize' in obj ? obj.fontSize : 16) || 16) * 0.85 * 100);
        const boldDefault = 'fontWeight' in obj && obj.fontWeight === 'bold';
        const italicDefault = 'fontStyle' in obj && obj.fontStyle === 'italic';
        const underlineDefault = 'underline' in obj && Boolean(obj.underline);
        const strikeDefault = 'strikethrough' in obj && Boolean(obj.strikethrough);
        const fontName = escapeXml(('fontFamily' in obj && obj.fontFamily) || 'Plus Jakarta Sans');
        const defaultAlign = 'textAlign' in obj ? obj.textAlign || 'left' : 'left';
        const anchorAttr =
          obj.type === 'shape'
            ? obj.verticalAlign === 'top'
              ? ' anchor="t"'
              : obj.verticalAlign === 'bottom'
                ? ' anchor="b"'
                : ' anchor="ctr"'
            : ' anchor="t"';

        let paragraphs = '';
        if (obj.type === 'text' || obj.type === 'sticky') {
          const blocks = getEffectiveRichBlocks(obj);
          paragraphs = blocks
            .map((blk) => {
              if (blk.type === 'table') {
                return blk.rows
                  .map(
                    (r) =>
                      `<a:p><a:r><a:rPr lang="en-US" sz="${baseFontPt100}"><a:solidFill><a:srgbClr val="${textHex}">${alphaXml}</a:srgbClr></a:solidFill><a:latin typeface="${fontName}"/></a:rPr><a:t>${escapeXml(r.join(' | '))}</a:t></a:r></a:p>`
                  )
                  .join('');
              }
              const blkAlign = blk.align || defaultAlign;
              const blkAlgnAttr =
                blkAlign === 'center'
                  ? ' algn="ctr"'
                  : blkAlign === 'right'
                    ? ' algn="r"'
                    : blkAlign === 'justify'
                      ? ' algn="just"'
                      : '';
              const lvlAttr = blk.indent ? ` lvl="${Math.min(4, blk.indent)}"` : '';
              const bulletXml =
                blk.listType === 'bullet'
                  ? '<a:buChar char="•"/>'
                  : blk.listType === 'number'
                    ? '<a:buAutoNum type="arabicPeriod"/>'
                    : '';
              const scaleMult = blk.heading === 1 ? 1.35 : blk.heading === 2 ? 1.2 : blk.heading === 3 ? 1.1 : 1;
              const szVal = Math.round(baseFontPt100 * scaleMult);
              const runsXml = (blk.runs.length > 0 ? blk.runs : [{ text: '' }])
                .map((r, rI) => {
                  const prefix = rI === 0 && blk.listType === 'check' ? `${blk.checked ? '☑' : '☐'} ` : '';
                  const rBold = (r.bold ?? boldDefault) || Boolean(blk.heading) ? ' b="1"' : '';
                  const rItalic = r.italic ?? italicDefault ? ' i="1"' : '';
                  const rUnderline = r.underline ?? underlineDefault ? ' u="sng"' : '';
                  const rStrike = r.strike ?? strikeDefault ? ' strike="sngStrike"' : '';
                  const rColorHex = r.color ? hex6(r.color, textHex) : textHex;
                  const rHlXml =
                    r.highlight && r.highlight !== 'transparent'
                      ? `<a:highlight><a:srgbClr val="${hex6(r.highlight)}"/></a:highlight>`
                      : '';
                  return `<a:r><a:rPr lang="en-US" sz="${szVal}"${rBold}${rItalic}${rUnderline}${rStrike}><a:solidFill><a:srgbClr val="${rColorHex}">${alphaXml}</a:srgbClr></a:solidFill>${rHlXml}<a:latin typeface="${r.code ? 'JetBrains Mono' : fontName}"/></a:rPr><a:t>${escapeXml(prefix + r.text)}</a:t></a:r>`;
                })
                .join('');
              return `<a:p><a:pPr${blkAlgnAttr}${lvlAttr}>${bulletXml}</a:pPr>${runsXml}</a:p>`;
            })
            .join('');
        } else {
          const boldAttr = boldDefault ? ' b="1"' : '';
          const italicAttr = italicDefault ? ' i="1"' : '';
          const alignAttr =
            defaultAlign === 'center' ? ' algn="ctr"' : defaultAlign === 'right' ? ' algn="r"' : '';
          paragraphs = content
            .split('\n')
            .map(
              (line) =>
                `<a:p><a:pPr${alignAttr}/><a:r><a:rPr lang="en-US" sz="${baseFontPt100}"${boldAttr}${italicAttr}><a:solidFill><a:srgbClr val="${textHex}">${alphaXml}</a:srgbClr></a:solidFill><a:latin typeface="${fontName}"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
            )
            .join('');
        }

        shapeXmls.push(`
      <p:sp>
        <p:nvSpPr><p:cNvPr id="${spId++}" name="${escapeXml(obj.name || `Obj${spId}`)}"/><p:cNvSpPr${obj.type === 'text' ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm${rotAttr}${flipHAttr}${flipVAttr}><a:off x="${xEmu}" y="${yEmu}"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="${prst}">${avLstXml}</a:prstGeom>${fillXml}${lnXml}${shadowXml}</p:spPr>
        <p:txBody><a:bodyPr wrap="square"${anchorAttr}/><a:lstStyle/>${paragraphs || '<a:p><a:r><a:t></a:t></a:r></a:p>'}</p:txBody>
      </p:sp>`);
      }
    }

    if (shapeXmls.length === 0) {
      shapeXmls.push(`
      <p:sp>
        <p:nvSpPr><p:cNvPr id="${spId++}" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="762000" y="609600"/><a:ext cx="10668000" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200" b="1"/><a:t>${escapeXml(page.name || deckTitle)}</a:t></a:r></a:p></p:txBody>
      </p:sp>`);
    }

    // Speaker Notes XML if present
    if (page.speakerNotes?.trim()) {
      const notesRId = `rId${nextRelNum++}`;
      slideExtraRels.push(
        `<Relationship Id="${notesRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${slideNum}.xml"/>`
      );
      const noteParas = page.speakerNotes
        .split('\n')
        .map((line) => `<a:p><a:r><a:rPr lang="en-US" sz="1200"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`)
        .join('');
      zip.file(
        `ppt/notesSlides/notesSlide${slideNum}.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/>${noteParas}</p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:notes>`
      );
      zip.file(
        `ppt/notesSlides/_rels/notesSlide${slideNum}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideNum}.xml"/>
</Relationships>`
      );
    }

    const bgHex = hex6(page.background, 'FFFFFF');
    const bgXml =
      page.slideGradient?.from && page.slideGradient?.to
        ? `<p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="${hex6(page.slideGradient.from)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${hex6(page.slideGradient.to)}"/></a:gs></a:gsLst><a:lin ang="${Math.round((page.slideGradient.angle ?? 135) * 60000)}" scaled="1"/></a:gradFill></p:bgPr></p:bg>`
        : `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgHex}"/></a:solidFill></p:bgPr></p:bg>`;

    const transitionXml =
      page.transition === 'fade'
        ? '<p:transition spd="med"><p:fade/></p:transition>'
        : page.transition === 'slide'
          ? '<p:transition spd="med"><p:push dir="r"/></p:transition>'
          : page.transition === 'zoom' || page.transition === 'morph'
            ? '<p:transition spd="med"><p:zoom dir="in"/></p:transition>'
            : '';

    zip.file(
      `ppt/slides/slide${slideNum}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    ${bgXml}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapeXmls.join('')}
    </p:spTree>
  </p:cSld>
  ${transitionXml}
</p:sld>`
    );

    zip.file(
      `ppt/slides/_rels/slide${slideNum}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  ${slideExtraRels.join('\n  ')}
</Relationships>`
    );
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}
