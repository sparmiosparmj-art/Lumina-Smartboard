import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { PDFAnnotation } from '../../types/smartboard';
import { openSafeExternalLink } from '../../utils/externalLinks';
import type {
  LoadedPDFPage,
  PDFDocumentProxy,
  PDFFormWidget,
  PDFOutlineItem,
} from '../../utils/pdfPptx';
import {
  renderOfficialPDFTextLayer,
  startPDFPageCanvasRender,
} from '../../utils/pdfPptx';

export type MeasureUnit = 'mm' | 'cm' | 'in' | 'pt' | 'ft';

export function formatMeasureDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ptW: number,
  ptH: number,
  unit: MeasureUnit = 'mm',
  scaleRatio = 1
): string {
  const dxPt = (x2 - x1) * ptW;
  const dyPt = (y2 - y1) * ptH;
  const distPt = Math.hypot(dxPt, dyPt) * (scaleRatio > 0 ? scaleRatio : 1);
  if (unit === 'cm') return `${((distPt * 2.54) / 72).toFixed(2)} cm`;
  if (unit === 'in') return `${(distPt / 72).toFixed(2)} in`;
  if (unit === 'ft') return `${(distPt / (72 * 12)).toFixed(2)} ft`;
  if (unit === 'pt') return `${Math.round(distPt)} pt`;
  return `${((distPt * 25.4) / 72).toFixed(1)} mm`;
}

export function getSvgDashArray(style: 'solid' | 'dashed' | 'dotted' | undefined, sw: number, isSel: boolean): string | undefined {
  if (style === 'dashed') return `${Math.max(4, sw * 3)} ${Math.max(3, sw * 2)}`;
  if (style === 'dotted') return `${Math.max(1.5, sw)} ${Math.max(2.5, sw * 1.8)}`;
  if (isSel) return '4 2';
  return undefined;
}

export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function rotateNormPoint(x: number, y: number, deg: 90 | -90): { x: number; y: number } {
  if (deg === 90) return { x: 1 - y, y: x };
  return { x: y, y: 1 - x };
}

export function rotateAnnotationCoords(a: PDFAnnotation, deg: 90 | -90): PDFAnnotation {
  if (a.points && a.points.length > 0) {
    return {
      ...a,
      points: a.points.map((pt) => rotateNormPoint(pt.x, pt.y, deg)),
    };
  }
  if (typeof a.x2 === 'number' && typeof a.y2 === 'number') {
    const p1 = rotateNormPoint(a.x, a.y, deg);
    const p2 = rotateNormPoint(a.x2, a.y2, deg);
    return { ...a, x: p1.x, y: p1.y, x2: p2.x, y2: p2.y };
  }
  const w = a.w ?? 0.12;
  const h = a.h ?? 0.05;
  const c1 = rotateNormPoint(a.x, a.y, deg);
  const c2 = rotateNormPoint(a.x + w, a.y + h, deg);
  return {
    ...a,
    x: Math.min(c1.x, c2.x),
    y: Math.min(c1.y, c2.y),
    w: Math.abs(c2.x - c1.x),
    h: Math.abs(c2.y - c1.y),
  };
}

function drawRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function applyCanvasDash(ctx: CanvasRenderingContext2D, style: PDFAnnotation['strokeStyle'], strokeW: number) {
  if (style === 'dashed') ctx.setLineDash([Math.max(6, strokeW * 3), Math.max(4, strokeW * 2)]);
  else if (style === 'dotted') ctx.setLineDash([Math.max(2, strokeW * 0.9), Math.max(4, strokeW * 1.8)]);
  else ctx.setLineDash([]);
}

export function isHexColorDark(hex?: string): boolean {
  if (!hex || hex === 'transparent') return false;
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}

export function renderFormValuesToCanvas(
  ctx: CanvasRenderingContext2D,
  pageWidgets: PDFFormWidget[],
  formValues: Record<string, string | boolean>,
  outW: number,
  outH: number
) {
  if (!pageWidgets.length) return;
  const scaleFactor = outW / 700;
  for (const w of pageWidgets) {
    const val = formValues[w.fieldName] !== undefined ? formValues[w.fieldName] : w.defaultValue;
    const fx = w.x * outW;
    const fy = w.y * outH;
    const fw = w.w * outW;
    const fh = w.h * outH;
    ctx.save();
    if (w.fieldType === 'checkbox') {
      if (Boolean(val)) {
        ctx.strokeStyle = '#1D4ED8';
        ctx.lineWidth = Math.max(1.5, 2 * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(fx + fw * 0.22, fy + fh * 0.52);
        ctx.lineTo(fx + fw * 0.44, fy + fh * 0.76);
        ctx.lineTo(fx + fw * 0.8, fy + fh * 0.26);
        ctx.stroke();
      }
    } else if (w.fieldType === 'radio') {
      const targetVal = w.buttonValue || w.id;
      if (String(val) === targetVal) {
        ctx.fillStyle = '#1D4ED8';
        ctx.beginPath();
        ctx.arc(fx + fw / 2, fy + fh / 2, Math.max(2, Math.min(fw, fh) * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const str = String(val || '').trim();
      if (str) {
        const fontSize = Math.max(8, Math.min(13 * scaleFactor, fh * 0.7));
        ctx.fillStyle = '#0F172A';
        ctx.font = `500 ${fontSize}px "DM Sans", sans-serif`;
        ctx.textBaseline = w.multiline ? 'top' : 'middle';
        ctx.beginPath();
        ctx.rect(fx, fy, fw, fh);
        ctx.clip();
        if (w.multiline) {
          const lines = str.split('\n');
          lines.forEach((ln, idx) => ctx.fillText(ln, fx + 3 * scaleFactor, fy + 3 * scaleFactor + idx * fontSize * 1.2));
        } else {
          ctx.fillText(str, fx + 3 * scaleFactor, fy + fh / 2);
        }
      }
    }
    ctx.restore();
  }
}

export async function renderAnnotationsToCanvas(
  ctx: CanvasRenderingContext2D,
  pageAnns: PDFAnnotation[],
  outW: number,
  outH: number,
  ptW = 595,
  ptH = 842
) {
  const scaleFactor = outW / 700;
  const ordered = [...pageAnns].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  for (const a of ordered) {
    ctx.save();
    const baseStroke = (a.strokeWidth || 2.5) * scaleFactor;
    const alpha = a.opacity ?? 1;

    if (a.kind === 'highlight') {
      ctx.fillStyle = a.color;
      ctx.globalAlpha = a.opacity ?? 0.36;
      ctx.fillRect(a.x * outW, a.y * outH, (a.w || 0.1) * outW, (a.h || 0.025) * outH);
    } else if (a.kind === 'redact') {
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = 1;
      ctx.fillRect(a.x * outW, a.y * outH, (a.w || 0.14) * outW, (a.h || 0.03) * outH);
    } else if (a.kind === 'underline') {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = Math.max(2, baseStroke);
      ctx.globalAlpha = alpha;
      applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
      const yPos = (a.y + (a.h || 0.02)) * outH;
      ctx.beginPath();
      ctx.moveTo(a.x * outW, yPos);
      ctx.lineTo((a.x + (a.w || 0.12)) * outW, yPos);
      ctx.stroke();
    } else if (a.kind === 'strike') {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = Math.max(2, baseStroke);
      ctx.globalAlpha = alpha;
      applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
      const yPos = (a.y + (a.h || 0.02) / 2) * outH;
      ctx.beginPath();
      ctx.moveTo(a.x * outW, yPos);
      ctx.lineTo((a.x + (a.w || 0.12)) * outW, yPos);
      ctx.stroke();
    } else if (a.kind === 'rect') {
      ctx.globalAlpha = alpha;
      const rx = a.x * outW;
      const ry = a.y * outH;
      const rw = (a.w || 0.12) * outW;
      const rh = (a.h || 0.08) * outH;
      const rad = (a.borderRadius || 0) * scaleFactor;
      if (rad > 0) drawRoundedRectPath(ctx, rx, ry, rw, rh, rad);
      else {
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
      }
      if (a.fillColor && a.fillColor !== 'transparent') {
        ctx.fillStyle = a.fillColor;
        ctx.fill();
      }
      if (baseStroke > 0) {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = Math.max(1.5, baseStroke);
        applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
        ctx.stroke();
      }
    } else if (a.kind === 'circle') {
      ctx.globalAlpha = alpha;
      const rx = ((a.w || 0.1) * outW) / 2;
      const ry = ((a.h || 0.08) * outH) / 2;
      ctx.beginPath();
      ctx.ellipse(a.x * outW + rx, a.y * outH + ry, Math.max(2, rx), Math.max(2, ry), 0, 0, Math.PI * 2);
      if (a.fillColor && a.fillColor !== 'transparent') {
        ctx.fillStyle = a.fillColor;
        ctx.fill();
      }
      ctx.strokeStyle = a.color;
      ctx.lineWidth = Math.max(1.5, baseStroke);
      applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
      ctx.stroke();
    } else if (a.kind === 'line' || a.kind === 'arrow' || a.kind === 'measure') {
      const x1 = a.x * outW;
      const y1 = a.y * outH;
      const x2 = (a.x2 ?? a.x + (a.w || 0.12)) * outW;
      const y2 = (a.y2 ?? a.y + (a.h || 0.04)) * outH;
      ctx.strokeStyle = a.color || '#2563EB';
      ctx.fillStyle = a.color || '#2563EB';
      ctx.lineWidth = Math.max(2, baseStroke);
      ctx.lineCap = 'round';
      ctx.globalAlpha = alpha;
      applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      if (a.kind === 'arrow') {
        const headLen = Math.max(10, baseStroke * 4);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (a.kind === 'measure') {
        const tick = 7 * scaleFactor;
        const perp = angle + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(x1 - tick * Math.cos(perp), y1 - tick * Math.sin(perp));
        ctx.lineTo(x1 + tick * Math.cos(perp), y1 + tick * Math.sin(perp));
        ctx.moveTo(x2 - tick * Math.cos(perp), y2 - tick * Math.sin(perp));
        ctx.lineTo(x2 + tick * Math.cos(perp), y2 + tick * Math.sin(perp));
        ctx.stroke();

        const label =
          a.text ||
          formatMeasureDistance(
            a.x,
            a.y,
            a.x2 ?? a.x,
            a.y2 ?? a.y,
            ptW,
            ptH,
            a.measureUnit || 'mm',
            a.measureScale || 1
          );
        const fontSize = Math.round(11 * scaleFactor);
        ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
        const tw = ctx.measureText(label).width;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const bw = tw + 12 * scaleFactor;
        const bh = 20 * scaleFactor;
        ctx.fillStyle = a.color || '#2563EB';
        drawRoundedRectPath(ctx, mx - bw / 2, my - bh / 2, bw, bh, 4 * scaleFactor);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
      }
    } else if ((a.kind === 'draw' || a.kind === 'highlighter_ink') && a.points?.length) {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.kind === 'highlighter_ink' ? Math.max(10, baseStroke * 4.5) : Math.max(2, baseStroke);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = a.kind === 'highlighter_ink' ? a.opacity ?? 0.35 : alpha;
      if (a.kind === 'draw') applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
      ctx.beginPath();
      a.points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x * outW, pt.y * outH);
        else ctx.lineTo(pt.x * outW, pt.y * outH);
      });
      ctx.stroke();
    } else if ((a.kind === 'stamp' || a.kind === 'image') && a.text) {
      ctx.globalAlpha = alpha;
      if (a.text.startsWith('data:image/')) {
        const sigImg = new Image();
        sigImg.src = a.text;
        await new Promise<void>((res) => {
          sigImg.onload = () => res();
          sigImg.onerror = () => res();
        });
        const sx = a.x * outW;
        const sy = a.y * outH;
        const sw = (a.w || 0.24) * outW;
        const sh = (a.h || 0.14) * outH;
        if (sigImg.naturalWidth > 0) {
          if (a.rotation) {
            ctx.translate(sx + sw / 2, sy + sh / 2);
            ctx.rotate((a.rotation * Math.PI) / 180);
            ctx.drawImage(sigImg, -sw / 2, -sh / 2, sw, sh);
          } else {
            ctx.drawImage(sigImg, sx, sy, sw, sh);
          }
        }
      } else {
        const fontSize = Math.round((a.fontSize || 13) * scaleFactor);
        const weight = a.fontWeight === 'normal' ? '500' : '700';
        const style = a.fontStyle === 'italic' ? 'italic ' : '';
        ctx.font = `${style}${weight} ${fontSize}px "${a.fontFamily || 'Plus Jakarta Sans'}", "Noto Sans Devanagari", sans-serif`;
        const metrics = ctx.measureText(a.text);
        const bw = Math.max(96 * scaleFactor, metrics.width + 22 * scaleFactor);
        const bh = fontSize + 16 * scaleFactor;
        const sx = a.x * outW;
        const sy = a.y * outH;
        if (a.rotation) {
          ctx.translate(sx + bw / 2, sy + bh / 2);
          ctx.rotate((a.rotation * Math.PI) / 180);
          ctx.translate(-(sx + bw / 2), -(sy + bh / 2));
        }
        ctx.fillStyle = a.fillColor || a.bgColor || 'rgba(255,255,255,0.94)';
        ctx.strokeStyle = a.color;
        ctx.lineWidth = Math.max(1.5 * scaleFactor, baseStroke);
        applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
        drawRoundedRectPath(ctx, sx, sy, bw, bh, (a.borderRadius ?? 4) * scaleFactor);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = a.color;
        ctx.textBaseline = 'middle';
        ctx.fillText(a.text, sx + 11 * scaleFactor, sy + bh / 2);
        if (a.underline) {
          ctx.strokeStyle = a.color;
          ctx.lineWidth = Math.max(1, fontSize * 0.08);
          ctx.beginPath();
          ctx.moveTo(sx + 11 * scaleFactor, sy + bh / 2 + fontSize * 0.55);
          ctx.lineTo(sx + 11 * scaleFactor + metrics.width, sy + bh / 2 + fontSize * 0.55);
          ctx.stroke();
        }
      }
    } else if ((a.kind === 'text' || a.kind === 'callout' || a.kind === 'sticky' || a.kind === 'comment') && a.text) {
      ctx.globalAlpha = alpha;
      const fSize = Math.round((a.fontSize || 13) * scaleFactor);
      const weight = a.fontWeight === 'bold' ? '700' : '500';
      const style = a.fontStyle === 'italic' ? 'italic ' : '';
      ctx.font = `${style}${weight} ${fSize}px "${a.fontFamily || 'DM Sans'}", "Noto Sans Devanagari", sans-serif`;
      const padX = 8 * scaleFactor;
      const padY = 6 * scaleFactor;
      const targetBoxW = a.w ? Math.max(80 * scaleFactor, a.w * outW) : outW * 0.42;
      const maxTextW = Math.max(60 * scaleFactor, targetBoxW - padX * 2);
      const lines: string[] = [];
      for (const para of a.text.split('\n')) {
        if (!para) {
          lines.push('');
          continue;
        }
        const words = para.split(/\s+/);
        let cur = '';
        for (const word of words) {
          const test = cur ? `${cur} ${word}` : word;
          if (ctx.measureText(test).width <= maxTextW) {
            cur = test;
          } else {
            if (cur) lines.push(cur);
            if (ctx.measureText(word).width <= maxTextW) {
              cur = word;
            } else {
              let chunk = '';
              for (const ch of word) {
                if (ctx.measureText(chunk + ch).width > maxTextW && chunk) {
                  lines.push(chunk);
                  chunk = ch;
                } else {
                  chunk += ch;
                }
              }
              cur = chunk;
            }
          }
        }
        if (cur) lines.push(cur);
      }
      if (lines.length === 0) lines.push('');
      const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 40 * scaleFactor);
      const lineH = fSize * 1.3;
      const bw = a.w ? Math.max(maxLineW + padX * 2, targetBoxW) : Math.min(outW * 0.45, maxLineW + padX * 2);
      const bh = lines.length * lineH + padY * 2;
      const bx = a.x * outW;
      const by = a.y * outH;
      const align = a.textAlign || 'left';
      const radius = (a.borderRadius ?? (a.kind === 'text' ? 4 : 5)) * scaleFactor;

      const drawAlignedLines = (textColor: string, leftInset: number, topBaseY: number) => {
        ctx.fillStyle = textColor;
        ctx.textAlign = align;
        lines.forEach((l, i) => {
          const ly = topBaseY + i * lineH;
          const lx = align === 'center' ? bx + bw / 2 : align === 'right' ? bx + bw - leftInset : bx + leftInset;
          ctx.fillText(l, lx, ly);
          if (a.underline) {
            const lw = ctx.measureText(l).width;
            const ux = align === 'center' ? lx - lw / 2 : align === 'right' ? lx - lw : lx;
            ctx.strokeStyle = textColor;
            ctx.lineWidth = Math.max(1, fSize * 0.08);
            ctx.beginPath();
            ctx.moveTo(ux, ly + 2 * scaleFactor);
            ctx.lineTo(ux + lw, ly + 2 * scaleFactor);
            ctx.stroke();
          }
        });
      };

      if (a.kind === 'text') {
        if (a.rotation) {
          ctx.translate(bx + bw / 2, by + bh / 2);
          ctx.rotate((a.rotation * Math.PI) / 180);
          ctx.translate(-(bx + bw / 2), -(by + bh / 2));
        }
        const bg = a.fillColor || a.bgColor;
        if (bg && bg !== 'transparent') {
          ctx.fillStyle = bg;
          drawRoundedRectPath(ctx, bx, by, bw, bh, radius);
          ctx.fill();
        }
        drawAlignedLines(a.color || '#0F172A', bg ? padX : 2 * scaleFactor, by + padY * 0.5 + fSize);
      } else {
        if (a.kind === 'callout' && typeof a.x2 === 'number' && typeof a.y2 === 'number') {
          ctx.strokeStyle = a.color || '#DC2626';
          ctx.lineWidth = Math.max(1.5 * scaleFactor, baseStroke * 0.8);
          applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
          ctx.beginPath();
          ctx.moveTo(bx + bw / 2, by + bh / 2);
          ctx.lineTo(a.x2 * outW, a.y2 * outH);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = a.color || '#DC2626';
          ctx.beginPath();
          ctx.arc(a.x2 * outW, a.y2 * outH, 3.5 * scaleFactor, 0, Math.PI * 2);
          ctx.fill();
        }
        if (a.rotation) {
          ctx.translate(bx + bw / 2, by + bh / 2);
          ctx.rotate((a.rotation * Math.PI) / 180);
          ctx.translate(-(bx + bw / 2), -(by + bh / 2));
        }
        const fillCol =
          a.fillColor || a.bgColor || (a.kind === 'sticky' ? '#FEF08A' : a.kind === 'callout' ? '#FFFFFF' : '#2563EB');
        ctx.fillStyle = fillCol;
        ctx.strokeStyle = a.kind === 'sticky' ? a.color || '#EAB308' : a.kind === 'callout' ? a.color || '#DC2626' : '#1D4ED8';
        ctx.lineWidth = Math.max(1.5 * scaleFactor, baseStroke * 0.75);
        applyCanvasDash(ctx, a.strokeStyle, ctx.lineWidth);
        drawRoundedRectPath(ctx, bx, by, bw, bh, radius);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        const textCol =
          a.kind === 'comment'
            ? isHexColorDark(fillCol) || !a.fillColor ? '#FFFFFF' : '#0F172A'
            : isHexColorDark(fillCol) ? '#FFFFFF' : '#0F172A';
        drawAlignedLines(textCol, padX, by + padY + fSize * 0.9);
      }
    }
    ctx.restore();
  }
}

export const LivePDFPageCanvas: React.FC<{
  pdfDoc: PDFDocumentProxy | null;
  page: LoadedPDFPage;
  displayWidthPx: number;
  className: string;
}> = ({ pdfDoc, page, displayWidthPx, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderedOnce, setRenderedOnce] = useState(false);
  const renderedOnceRef = useRef(false);

  useEffect(() => {
    renderedOnceRef.current = false;
    setRenderedOnce(false);
  }, [pdfDoc, page.pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdfDoc || !canvas) return;
    let activeTask: { cancel: () => void; promise: Promise<void> } | null = null;
    const timer = window.setTimeout(() => {
      activeTask = startPDFPageCanvasRender(pdfDoc, page.pageNumber, canvas, displayWidthPx);
      activeTask.promise
        .then(() => {
          renderedOnceRef.current = true;
          setRenderedOnce(true);
        })
        .catch(() => {
          // ignore cancelled render tasks during rapid zoom/page switch
        });
    }, renderedOnceRef.current ? 55 : 0);

    return () => {
      window.clearTimeout(timer);
      activeTask?.cancel();
    };
  }, [pdfDoc, page.pageNumber, displayWidthPx]);

  const aspectW = page.ptWidth || page.width || 595;
  const aspectH = page.ptHeight || page.height || 842;

  return (
    <div className="relative w-full bg-white" style={{ aspectRatio: `${aspectW} / ${aspectH}` }}>
      {!renderedOnce && !page.dataUrl && (
        <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
      )}
      {(!pdfDoc || !renderedOnce) && page.dataUrl && (
        <img
          src={page.dataUrl}
          alt={`Page ${page.pageNumber}`}
          className={`w-full h-full block object-contain pointer-events-none ${className}`}
        />
      )}
      {pdfDoc && (
        <canvas
          ref={canvasRef}
          className={`w-full h-full block pointer-events-none ${renderedOnce ? 'opacity-100' : 'opacity-0 absolute inset-0'} ${className}`}
        />
      )}
    </div>
  );
};

export const OfficialPDFTextLayer: React.FC<{
  pdfDoc: PDFDocumentProxy | null;
  page: LoadedPDFPage;
  displayWidthPx: number;
  interactive: boolean;
}> = ({ pdfDoc, page, displayWidthPx, interactive }) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const [hasNativeSpans, setHasNativeSpans] = useState(true);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    const onUp = () => setSelecting(false);
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  }, []);

  useEffect(() => {
    const el = layerRef.current;
    if (!pdfDoc || !el) return;
    let cancelled = false;
    let instance: { cancel?: () => void } | null = null;
    const timer = window.setTimeout(() => {
      void renderOfficialPDFTextLayer(pdfDoc, page.pageNumber, el, displayWidthPx)
        .then((layer) => {
          if (cancelled) {
            layer?.cancel();
            return;
          }
          instance = layer;
          const hasText = Array.from(el.querySelectorAll('span')).some((s) => (s.textContent || '').trim().length > 0);
          setHasNativeSpans(hasText);
        })
        .catch(() => {
          if (!cancelled) setHasNativeSpans(false);
        });
    }, 30);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      try {
        instance?.cancel?.();
      } catch {
        // ignore cancel errors
      }
    };
  }, [pdfDoc, page.pageNumber, displayWidthPx]);

  return (
    <>
      <div
        ref={layerRef}
        onPointerDown={() => setSelecting(true)}
        className={`pdf-text-layer ${selecting ? 'selecting' : ''} ${
          interactive ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      />
      {/* OCR Fallback Text Overlay for scanned image-only PDFs */}
      {!hasNativeSpans && page.textItems && page.textItems.length > 0 && (() => {
        const aspectW = page.ptWidth || page.width || 595;
        const aspectH = page.ptHeight || page.height || 842;
        const displayHeightPx = displayWidthPx * (aspectH / (aspectW || 1));
        return (
          <div
            className={`absolute inset-0 ${interactive ? 'pointer-events-auto select-text' : 'pointer-events-none'}`}
          >
            {page.textItems.map((item, idx) => (
              <span
                key={idx}
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: `${item.w * 100}%`,
                  height: `${item.h * 100}%`,
                  fontSize: `${Math.max(8, item.h * displayHeightPx * 0.92)}px`,
                }}
                className="absolute leading-none whitespace-pre overflow-hidden text-transparent selection:bg-blue-500/30 cursor-text"
              >
                {item.str + ' '}
              </span>
            ))}
          </div>
        );
      })()}
    </>
  );
};

function outlineMatchesFilter(item: PDFOutlineItem, q: string): boolean {
  if (!q) return true;
  if (item.title.toLowerCase().includes(q)) return true;
  return item.items.some((child) => outlineMatchesFilter(child, q));
}

export const OutlineBranch: React.FC<{
  items: PDFOutlineItem[];
  depth: number;
  activePageNum: number;
  filterQuery?: string;
  onJump: (pageNum: number, recordHistory?: boolean) => void;
  onDeleteCustom?: (title: string, pageNum: number | null) => void;
  onRenameCustom?: (oldTitle: string, pageNum: number | null, newTitle: string) => void;
}> = ({ items, depth, activePageNum, filterQuery = '', onJump, onDeleteCustom, onRenameCustom }) => {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const q = filterQuery.trim().toLowerCase();
  return (
    <div className="space-y-0.5">
      {items.map((item, idx) => {
        if (q && !outlineMatchesFilter(item, q)) return null;
        const hasChildren = item.items.length > 0;
        const isCollapsed = q ? false : Boolean(collapsed[idx]);
        const isCurrent = item.pageNumber === activePageNum;
        return (
          <div key={`${item.title}-${idx}`}>
            <div
              style={{ paddingLeft: `${depth * 10 + 4}px` }}
              className={`group flex items-start gap-1 py-1.5 pr-1.5 rounded-md text-xs transition-colors ${
                isCurrent
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [idx]: !c[idx] }))}
                  className="p-0.5 mt-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
                >
                  <ChevronRight className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => {
                  if (item.pageNumber) onJump(item.pageNumber, true);
                  else if (item.url) openSafeExternalLink(item.url);
                }}
                className="flex-1 text-left line-clamp-2 leading-snug break-words"
                title={item.title}
              >
                {item.title}
              </button>
              {item.custom && onRenameCustom && (
                <button
                  type="button"
                  onClick={() => {
                    const nextTitle = window.prompt('Rename bookmark', item.title)?.trim();
                    if (nextTitle && nextTitle !== item.title) onRenameCustom(item.title, item.pageNumber, nextTitle);
                  }}
                  title="Rename Bookmark"
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-blue-600 shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              {item.custom && onDeleteCustom && (
                <button
                  type="button"
                  onClick={() => onDeleteCustom(item.title, item.pageNumber)}
                  title="Remove Bookmark"
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {item.pageNumber && (
                <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0 pt-0.5">{item.pageNumber}</span>
              )}
            </div>
            {hasChildren && !isCollapsed && (
              <OutlineBranch
                items={item.items}
                depth={depth + 1}
                activePageNum={activePageNum}
                filterQuery={filterQuery}
                onJump={onJump}
                onDeleteCustom={onDeleteCustom}
                onRenameCustom={onRenameCustom}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
