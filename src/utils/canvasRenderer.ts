import katex from 'katex';
import { compile, type EvalFunction } from 'mathjs';
import type {
  BoardObject,
  BoardPage,
  ChartObject,
  ConnectorObject,
  GraphObject,
  GridType,
  ImageObject,
  LineEndpointStyle,
  RichBlock,
  RichRun,
  ShapeObject,
  StrokeObject,
  StickyObject,
  TableObject,
  TextAlignMode,
  TextObject,
} from '../types/smartboard';
import { resourceUrl } from './api';
import { computeSelectionBounds, computeSmartOrthogonalPath, resolveConnectorEndpoints, toObjectLocalPoint } from './geometry';
import { getEffectiveRichBlocks } from './richText';

export { resolveConnectorEndpoints };

/** High-contrast rendering flag -- set by the app when the user toggles HC mode */
let _highContrastMode = false;
export function setHighContrastMode(enabled: boolean) {
  _highContrastMode = enabled;
}
export function isHighContrastMode(): boolean {
  return _highContrastMode;
}

/** Colorblind-safe palette remapping */
let _colorblindMode = false;
export function setColorblindMode(enabled: boolean) {
  _colorblindMode = enabled;
}
export function isColorblindMode(): boolean {
  return _colorblindMode;
}

const COLORBLIND_REMAP: Record<string, string> = {
  '#DC2626': '#2563EB',
  '#dc2626': '#2563EB',
  '#059669': '#D97706',
  '#EF4444': '#3B82F6',
  '#ef4444': '#3B82F6',
  '#10B981': '#F59E0B',
  '#10b981': '#F59E0B',
};

function cbRemap(color: string | undefined): string | undefined {
  if (!_colorblindMode || !color) return color;
  return COLORBLIND_REMAP[color] || COLORBLIND_REMAP[color.toLowerCase()] || color;
}

/** Compute relative luminance of a hex color (sRGB, 0-1 range) */
function hexLuminance(hex: string): number {
  const c = hex.replace('#', '');
  if (c.length < 6) return 0.5;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Adjust a hex color for high contrast: darken light colors, lighten dark colors */
function hcAdjustColor(hex: string): string {
  if (!hex || hex === 'transparent') return hex;
  const c = hex.replace('#', '');
  if (c.length < 6) return hex;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.7) {
    // Darken light colors
    const f = 0.55;
    return `#${Math.round(r * f).toString(16).padStart(2, '0')}${Math.round(g * f).toString(16).padStart(2, '0')}${Math.round(b * f).toString(16).padStart(2, '0')}`;
  }
  if (lum < 0.3) {
    // Lighten dark colors
    const f = 0.45;
    return `#${Math.round(r + (255 - r) * f).toString(16).padStart(2, '0')}${Math.round(g + (255 - g) * f).toString(16).padStart(2, '0')}${Math.round(b + (255 - b) * f).toString(16).padStart(2, '0')}`;
  }
  return hex;
}

/** Pick black or white text based on background luminance */
function hcTextColor(bgHex: string): string {
  if (!bgHex || bgHex === 'transparent') return '#000000';
  return hexLuminance(bgHex) > 0.5 ? '#000000' : '#FFFFFF';
}

export type RenderDrawOptions = {
  hideMathText?: boolean;
  visibleIds?: Set<string>;
};

const imageCache = new Map<string, HTMLImageElement>();
const imageCacheOrder: string[] = [];
const IMAGE_CACHE_MAX = 100;
const IMAGE_CACHE_EVICT_COUNT = 20;

function touchCacheOrder(src: string) {
  const idx = imageCacheOrder.indexOf(src);
  if (idx !== -1) imageCacheOrder.splice(idx, 1);
  imageCacheOrder.push(src);
}

function evictOldestEntries() {
  if (imageCacheOrder.length <= IMAGE_CACHE_MAX) return;
  const toEvict = imageCacheOrder.splice(0, IMAGE_CACHE_EVICT_COUNT);
  for (const key of toEvict) {
    imageCache.delete(key);
  }
}

export function getCachedImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  if (!src) return null;
  const existing = imageCache.get(src);
  if (existing) {
    touchCacheOrder(src);
    return existing.complete && existing.naturalWidth > 0 ? existing : null;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (onLoad) onLoad();
  };
  img.onerror = () => {
    imageCache.delete(src);
    const idx = imageCacheOrder.indexOf(src);
    if (idx !== -1) imageCacheOrder.splice(idx, 1);
  };
  img.src = src;
  imageCache.set(src, img);
  touchCacheOrder(src);
  evictOldestEntries();
  return null;
}

/** Clear image cache entries that have not been accessed recently. */
export function evictImageCache() {
  const recentCount = Math.min(imageCacheOrder.length, 40);
  const recentKeys = new Set(imageCacheOrder.slice(-recentCount));
  for (const key of [...imageCache.keys()]) {
    if (!recentKeys.has(key)) {
      imageCache.delete(key);
    }
  }
  // Rebuild order to only contain surviving keys
  const surviving = imageCacheOrder.filter((k) => imageCache.has(k));
  imageCacheOrder.length = 0;
  imageCacheOrder.push(...surviving);
}

export function drawGridBackground(
  ctx: CanvasRenderingContext2D,
  gridType: GridType,
  gridSize: number,
  bgColor: string,
  viewLeft: number,
  viewTop: number,
  viewRight: number,
  viewBottom: number
) {
  if (gridType === 'none') return;
  const isDarkBg =
    bgColor.toLowerCase() === '#0f172a' ||
    bgColor.toLowerCase() === '#1e293b' ||
    bgColor.toLowerCase() === '#000000';
  const step = Math.max(12, gridSize || 28);
  const startX = Math.floor(viewLeft / step) * step;
  const startY = Math.floor(viewTop / step) * step;

  ctx.save();
  if (gridType === 'dots') {
    ctx.fillStyle = isDarkBg ? 'rgba(148,163,184,0.28)' : 'rgba(100,116,139,0.32)';
    for (let x = startX; x <= viewRight; x += step) {
      for (let y = startY; y <= viewBottom; y += step) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  } else if (gridType === 'lines' || gridType === 'graph' || gridType === 'engineering') {
    ctx.lineWidth = 1;
    for (let x = startX, i = Math.round(startX / step); x <= viewRight; x += step, i++) {
      const major = i % 5 === 0;
      ctx.strokeStyle =
        gridType === 'engineering'
          ? major
            ? 'rgba(37,99,235,0.22)'
            : 'rgba(37,99,235,0.09)'
          : gridType === 'graph'
            ? major
              ? 'rgba(15,23,42,0.16)'
              : 'rgba(15,23,42,0.06)'
            : isDarkBg
              ? 'rgba(148,163,184,0.12)'
              : 'rgba(148,163,184,0.18)';
      ctx.beginPath();
      ctx.moveTo(x, viewTop);
      ctx.lineTo(x, viewBottom);
      ctx.stroke();
    }
    for (let y = startY, j = Math.round(startY / step); y <= viewBottom; y += step, j++) {
      const major = j % 5 === 0;
      ctx.strokeStyle =
        gridType === 'engineering'
          ? major
            ? 'rgba(37,99,235,0.22)'
            : 'rgba(37,99,235,0.09)'
          : gridType === 'graph'
            ? major
              ? 'rgba(15,23,42,0.16)'
              : 'rgba(15,23,42,0.06)'
            : isDarkBg
              ? 'rgba(148,163,184,0.12)'
              : 'rgba(148,163,184,0.18)';
      ctx.beginPath();
      ctx.moveTo(viewLeft, y);
      ctx.lineTo(viewRight, y);
      ctx.stroke();
    }
  } else if (gridType === 'ruled') {
    ctx.strokeStyle = isDarkBg ? 'rgba(148,163,184,0.18)' : 'rgba(59,130,246,0.2)';
    ctx.lineWidth = 1;
    for (let y = startY; y <= viewBottom; y += step) {
      ctx.beginPath();
      ctx.moveTo(viewLeft, y);
      ctx.lineTo(viewRight, y);
      ctx.stroke();
    }
  } else if (gridType === 'isometric') {
    ctx.strokeStyle = isDarkBg ? 'rgba(148,163,184,0.14)' : 'rgba(100,116,139,0.18)';
    ctx.lineWidth = 1;
    const dx = step * Math.sqrt(3);
    for (let x = startX - (viewBottom - viewTop); x <= viewRight + (viewBottom - viewTop); x += dx) {
      ctx.beginPath();
      ctx.moveTo(x, viewTop);
      ctx.lineTo(x + (viewBottom - viewTop) * Math.sqrt(3), viewBottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, viewTop);
      ctx.lineTo(x - (viewBottom - viewTop) * Math.sqrt(3), viewBottom);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawEndpointHead(
  ctx: CanvasRenderingContext2D,
  style: LineEndpointStyle,
  x: number,
  y: number,
  angle: number,
  size: number,
  color: string
) {
  if (style === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const s = Math.max(8, size * 3.4);
  if (style === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s, -s * 0.48);
    ctx.lineTo(-s * 0.78, 0);
    ctx.lineTo(-s, s * 0.48);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'dot') {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s * 0.55, -s * 0.38);
    ctx.lineTo(-s * 1.1, 0);
    ctx.lineTo(-s * 0.55, s * 0.38);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-s, -s * 0.55);
    ctx.lineTo(-s, s * 0.55);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'open_arrow') {
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-s, s * 0.5);
    ctx.lineWidth = Math.max(1.5, size * 0.65);
    ctx.stroke();
  } else if (style === 'bar') {
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, -s * 0.55);
    ctx.lineTo(-s * 0.12, s * 0.55);
    ctx.lineWidth = Math.max(2, size * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string,
  color: string,
  align: TextAlignMode,
  underline = false,
  verticalAlign: 'top' | 'middle' | 'bottom' = 'middle',
  padding = 10
) {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = color;
  if (_highContrastMode) {
    ctx.fillStyle = hcAdjustColor(color);
  }
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", system-ui, sans-serif`;
  ctx.textBaseline = 'top';

  const pad = Math.max(4, padding);
  const paragraphs = text.split('\n');
  const wrappedLines: { text: string; isLastInPara: boolean }[] = [];
  const availW = Math.max(24, maxWidth - pad * 2);
  for (const para of paragraphs) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > availW) {
        if (line) {
          wrappedLines.push({ text: line, isLastInPara: false });
          line = '';
        }
        if (ctx.measureText(w).width > availW) {
          let chunk = '';
          for (const ch of w) {
            if (ctx.measureText(chunk + ch).width > availW && chunk) {
              wrappedLines.push({ text: chunk, isLastInPara: false });
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = w;
        }
      } else {
        line = test;
      }
    }
    wrappedLines.push({ text: line, isLastInPara: true });
  }

  const lineHeight = fontSize * 1.35;
  const totalH = wrappedLines.length * lineHeight;
  let startY =
    verticalAlign === 'top'
      ? y + pad
      : verticalAlign === 'bottom'
        ? y + Math.max(pad, maxHeight - totalH - pad)
        : y + Math.max(pad, (maxHeight - totalH) / 2);
  const leftX = x + pad;

  for (const item of wrappedLines) {
    if (startY + lineHeight > y + maxHeight + 8) break;
    const line = item.text;
    const words = line.split(' ');
    if (align === 'justify' && !item.isLastInPara && words.length > 1) {
      ctx.textAlign = 'left';
      const wordsWidth = words.reduce((acc, w) => acc + ctx.measureText(w).width, 0);
      const gap = Math.max(2, (availW - wordsWidth) / (words.length - 1));
      let wx = leftX;
      for (const w of words) {
        ctx.fillText(w, wx, startY);
        wx += ctx.measureText(w).width + gap;
      }
      if (underline) {
        ctx.fillRect(leftX, startY + fontSize + 1, availW, 1.5);
      }
    } else {
      ctx.textAlign = align === 'justify' ? 'left' : align;
      const anchorX =
        align === 'left' || align === 'justify'
          ? leftX
          : align === 'right'
            ? x + maxWidth - pad
            : x + maxWidth / 2;
      ctx.fillText(line, anchorX, startY);
      if (underline) {
        const w = ctx.measureText(line).width;
        const ux = align === 'left' || align === 'justify' ? anchorX : align === 'right' ? anchorX - w : anchorX - w / 2;
        ctx.fillRect(ux, startY + fontSize + 1, w, 1.5);
      }
    }
    startY += lineHeight;
  }
  ctx.restore();
}

type StyledSegment = {
  text: string;
  isSpace: boolean;
  run: RichRun;
  fontStr: string;
  fontSizePx: number;
  width: number;
};

type RichCheckboxRect = {
  blockIndex: number;
  x: number;
  y: number;
  size: number;
};

function buildRunFont(
  baseFamily: string,
  baseSize: number,
  baseWeight: 'normal' | 'bold',
  baseStyle: 'normal' | 'italic',
  run: RichRun,
  heading: 0 | 1 | 2 | 3 = 0
): { fontStr: string; fontSizePx: number } {
  const scale = heading === 1 ? 1.45 : heading === 2 ? 1.25 : heading === 3 ? 1.1 : 1;
  const fontSizePx = Math.round(baseSize * scale);
  const weight = heading > 0 || baseWeight === 'bold' || run.bold ? 'bold' : 'normal';
  const style = baseStyle === 'italic' || run.italic ? 'italic' : 'normal';
  const family = run.code ? 'JetBrains Mono' : baseFamily || 'Plus Jakarta Sans';
  return {
    fontStr: `${style} ${weight} ${fontSizePx}px "${family}", system-ui, sans-serif`,
    fontSizePx,
  };
}

function getRichDefaults(obj: TextObject | StickyObject) {
  const isSticky = obj.type === 'sticky';
  const padding = obj.type === 'text' ? obj.padding ?? 10 : 12;
  const bottomReserve = isSticky ? 28 : padding;
  return {
    padding,
    bottomReserve,
    fontFamily: obj.type === 'text' && obj.codeBlock ? 'JetBrains Mono' : obj.fontFamily || (isSticky ? 'DM Sans' : 'Plus Jakarta Sans'),
    fontSize: obj.fontSize || (isSticky ? 15 : 18),
    fontWeight: obj.fontWeight || 'normal',
    fontStyle: obj.fontStyle || 'normal',
    textColor: obj.textColor || (isSticky ? '#1E293B' : '#0F172A'),
    highlightColor: obj.highlightColor,
    underline: Boolean(obj.underline),
    strikethrough: Boolean(obj.strikethrough),
    textAlign: (obj.textAlign || 'left') as TextAlignMode,
    lineHeight: obj.lineHeight || 1.38,
  };
}

function drawRichBlocksOnCanvas(
  ctx: CanvasRenderingContext2D,
  obj: TextObject | StickyObject,
  collectCheckboxes?: RichCheckboxRect[]
) {
  const defs = getRichDefaults(obj);
  const blocks: RichBlock[] = getEffectiveRichBlocks(obj);
  const leftEdge = obj.x + defs.padding;
  const maxBottom = obj.y + obj.height - defs.bottomReserve + 4;
  let curY = obj.y + (obj.type === 'text' && obj.codeBlock ? 38 : defs.padding);
  let numCounter = 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(obj.x + 2, obj.y + 2, Math.max(4, obj.width - 4), Math.max(4, obj.height - (obj.type === 'sticky' ? 24 : 4)));
  ctx.clip();

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];
    if (curY > maxBottom) break;

    if (block.type === 'table') {
      numCounter = 0;
      const rows = block.rows || [];
      if (rows.length === 0) continue;
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const tblW = Math.max(40, obj.width - defs.padding * 2);
      const cellW = tblW / cols;
      const rowH = Math.max(22, Math.round(defs.fontSize * 1.55));
      const tblH = rows.length * rowH;

      ctx.save();
      ctx.fillStyle = block.headerBg || 'rgba(37, 99, 235, 0.12)';
      ctx.fillRect(leftEdge, curY, tblW, rowH);
      ctx.strokeStyle = block.borderColor || '#CBD5E1';
      ctx.lineWidth = 1;
      for (let r = 0; r <= rows.length; r++) {
        ctx.beginPath();
        ctx.moveTo(leftEdge, curY + r * rowH);
        ctx.lineTo(leftEdge + tblW, curY + r * rowH);
        ctx.stroke();
      }
      for (let c = 0; c <= cols; c++) {
        ctx.beginPath();
        ctx.moveTo(leftEdge + c * cellW, curY);
        ctx.lineTo(leftEdge + c * cellW, curY + tblH);
        ctx.stroke();
      }

      const cellFontSize = Math.max(10, Math.round(defs.fontSize * 0.85));
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < cols; c++) {
          const val = rows[r]?.[c] || '';
          if (!val) continue;
          ctx.font = `${r === 0 ? 'bold' : 'normal'} ${cellFontSize}px "${defs.fontFamily}", system-ui, sans-serif`;
          ctx.fillStyle = defs.textColor;
          ctx.fillText(val, leftEdge + c * cellW + 6, curY + r * rowH + rowH / 2, Math.max(8, cellW - 10));
        }
      }
      ctx.restore();
      curY += tblH + 6;
      continue;
    }

    // Paragraph block
    const heading = block.heading || 0;
    const indentPx = (block.indent || 0) * 20;
    const listType = block.listType || 'none';
    if (listType === 'number') {
      numCounter += 1;
    } else {
      numCounter = 0;
    }

    const prefixW = listType === 'none' ? 0 : listType === 'number' ? Math.max(22, defs.fontSize * 1.45) : Math.max(20, defs.fontSize * 1.3);
    const startX = leftEdge + indentPx + prefixW;
    const availW = Math.max(28, obj.width - defs.padding * 2 - indentPx - prefixW);
    const align: TextAlignMode = block.align || defs.textAlign;

    // Tokenize runs into words + spaces preserving style
    const tokens: StyledSegment[] = [];
    for (const run of block.runs) {
      if (!run.text) continue;
      const { fontStr, fontSizePx } = buildRunFont(
        defs.fontFamily,
        defs.fontSize,
        defs.fontWeight,
        defs.fontStyle,
        run,
        heading
      );
      ctx.font = fontStr;
      const parts = run.text.split(/( +)/);
      for (const part of parts) {
        if (!part) continue;
        const isSpace = /^ +$/.test(part);
        const w = ctx.measureText(part).width;
        if (!isSpace && w > availW) {
          // Break oversized word into fit chunks
          let chunk = '';
          for (const ch of part) {
            if (ctx.measureText(chunk + ch).width > availW && chunk) {
              tokens.push({
                text: chunk,
                isSpace: false,
                run,
                fontStr,
                fontSizePx,
                width: ctx.measureText(chunk).width,
              });
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          if (chunk) {
            tokens.push({
              text: chunk,
              isSpace: false,
              run,
              fontStr,
              fontSizePx,
              width: ctx.measureText(chunk).width,
            });
          }
        } else {
          tokens.push({ text: part, isSpace, run, fontStr, fontSizePx, width: w });
        }
      }
    }

    // Wrap tokens into visual lines
    const wrappedLines: StyledSegment[][] = [];
    let curLine: StyledSegment[] = [];
    let curLineW = 0;
    for (const tok of tokens) {
      if (tok.isSpace && curLine.length === 0) continue;
      if (curLine.length > 0 && curLineW + tok.width > availW) {
        while (curLine.length > 0 && curLine[curLine.length - 1].isSpace) {
          curLine.pop();
        }
        wrappedLines.push(curLine);
        curLine = tok.isSpace ? [] : [tok];
        curLineW = tok.isSpace ? 0 : tok.width;
      } else {
        curLine.push(tok);
        curLineW += tok.width;
      }
    }
    while (curLine.length > 0 && curLine[curLine.length - 1].isSpace) {
      curLine.pop();
    }
    wrappedLines.push(curLine);

    const headingScale = heading === 1 ? 1.45 : heading === 2 ? 1.25 : heading === 3 ? 1.1 : 1;
    const blockFontSize = Math.round(defs.fontSize * headingScale);
    const lineHeightPx = blockFontSize * defs.lineHeight;

    // Draw list marker or interactive checkbox on first line
    if (listType !== 'none' && curY <= maxBottom) {
      const markerX = leftEdge + indentPx;
      if (listType === 'check') {
        const boxSize = Math.max(12, Math.min(18, Math.round(blockFontSize * 0.82)));
        const boxY = curY + Math.max(1, (lineHeightPx - boxSize) / 2 - 1);
        if (collectCheckboxes) {
          collectCheckboxes.push({ blockIndex: bIdx, x: markerX, y: boxY, size: boxSize });
        }
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(markerX, boxY, boxSize, boxSize, 3);
        if (block.checked) {
          ctx.fillStyle = '#2563EB';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(markerX + boxSize * 0.24, boxY + boxSize * 0.52);
          ctx.lineTo(markerX + boxSize * 0.44, boxY + boxSize * 0.72);
          ctx.lineTo(markerX + boxSize * 0.78, boxY + boxSize * 0.3);
          ctx.stroke();
        } else {
          ctx.strokeStyle = defs.textColor;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      } else if (listType === 'bullet') {
        const glyphs = ['•', '◦', '▪'];
        const glyph = glyphs[(block.indent || 0) % 3];
        ctx.save();
        ctx.font = `bold ${blockFontSize}px "${defs.fontFamily}", system-ui, sans-serif`;
        ctx.fillStyle = defs.textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(glyph, markerX + 2, curY + Math.max(0, (lineHeightPx - blockFontSize) / 2 - 1));
        ctx.restore();
      } else if (listType === 'number') {
        ctx.save();
        ctx.font = `600 ${Math.round(blockFontSize * 0.92)}px "${defs.fontFamily}", system-ui, sans-serif`;
        ctx.fillStyle = defs.textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${numCounter}.`, markerX, curY + Math.max(0, (lineHeightPx - blockFontSize) / 2));
        ctx.restore();
      }
    }

    // Render each line
    for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
      if (curY > maxBottom) break;
      const lineSegs = wrappedLines[lIdx];
      const isLastLine = lIdx === wrappedLines.length - 1;
      const rawLineW = lineSegs.reduce((sum, s) => sum + s.width, 0);
      const spaceCount = lineSegs.filter((s) => s.isSpace).length;
      const extraJustifyGap =
        align === 'justify' && !isLastLine && spaceCount > 0 ? Math.max(0, availW - rawLineW) / spaceCount : 0;

      let drawX = startX;
      if (align === 'center') drawX = startX + Math.max(0, (availW - rawLineW) / 2);
      else if (align === 'right') drawX = startX + Math.max(0, availW - rawLineW);

      const baselineTop = curY + Math.max(0, (lineHeightPx - blockFontSize) / 2);

      for (const seg of lineSegs) {
        const segW = seg.width + (seg.isSpace ? extraJustifyGap : 0);
        const hl = seg.run.highlight || defs.highlightColor;
        if (hl && hl !== 'transparent' && !seg.isSpace) {
          ctx.save();
          ctx.fillStyle = hl;
          ctx.beginPath();
          ctx.roundRect(drawX - 1.5, baselineTop - 1, seg.width + 3, seg.fontSizePx + 3, 3);
          ctx.fill();
          ctx.restore();
        }
        if (seg.run.code && !seg.isSpace) {
          ctx.save();
          ctx.fillStyle = 'rgba(148, 163, 184, 0.24)';
          ctx.beginPath();
          ctx.roundRect(drawX - 2, baselineTop - 1, seg.width + 4, seg.fontSizePx + 2, 3);
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        ctx.font = seg.fontStr;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = seg.run.color || defs.textColor;
        if (_highContrastMode) {
          ctx.fillStyle = hcAdjustColor(ctx.fillStyle as string);
        }
        if (block.checked) {
          ctx.globalAlpha *= 0.58;
        }
        ctx.fillText(seg.text, drawX, baselineTop);

        if ((seg.run.underline || defs.underline) && !seg.isSpace) {
          ctx.fillRect(drawX, baselineTop + seg.fontSizePx + 0.5, seg.width, Math.max(1, seg.fontSizePx * 0.07));
        }
        if ((seg.run.strike || defs.strikethrough || block.checked) && !seg.isSpace) {
          ctx.fillRect(drawX, baselineTop + seg.fontSizePx * 0.52, seg.width, Math.max(1.2, seg.fontSizePx * 0.075));
        }
        ctx.restore();

        drawX += segW;
      }

      curY += lineHeightPx;
    }
  }

  ctx.restore();
}

let cachedCheckboxCtx: CanvasRenderingContext2D | null = null;

export function hitTestRichCheckbox(obj: BoardObject, wx: number, wy: number): number | null {
  if (obj.type !== 'text' && obj.type !== 'sticky') return null;
  const local = toObjectLocalPoint(obj, wx, wy, false);
  if (local.x < obj.x || local.x > obj.x + obj.width || local.y < obj.y || local.y > obj.y + obj.height) return null;
  if (typeof document === 'undefined') return null;
  if (!cachedCheckboxCtx) {
    const offscreen = document.createElement('canvas');
    cachedCheckboxCtx = offscreen.getContext('2d');
  }
  if (!cachedCheckboxCtx) return null;
  const rects: RichCheckboxRect[] = [];
  drawRichBlocksOnCanvas(cachedCheckboxCtx, obj, rects);
  for (const r of rects) {
    if (local.x >= r.x - 5 && local.x <= r.x + r.size + 5 && local.y >= r.y - 5 && local.y <= r.y + r.size + 5) {
      return r.blockIndex;
    }
  }
  return null;
}

function drawPolygonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, sides: number, offsetRad = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = offsetRad + (i * Math.PI * 2) / sides;
    const px = cx + rx * Math.cos(a);
    const py = cy + ry * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const SHAPE_PATTERN_CACHE = new Map<string, CanvasPattern>();

function getShapePattern(
  ctx: CanvasRenderingContext2D,
  color: string,
  style: 'hachure' | 'cross_hatch' | 'dots' | 'paper' | 'grain' | 'canvas'
): CanvasPattern | string {
  const key = `${color}:${style}`;
  const cached = SHAPE_PATTERN_CACHE.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return color;
  const tile = document.createElement('canvas');
  const size = style === 'dots' || style === 'grain' ? 12 : style === 'canvas' ? 8 : 10;
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  if (!tctx) return color;
  tctx.strokeStyle = color;
  tctx.fillStyle = color;
  tctx.lineWidth = 1.6;
  if (style === 'paper' || style === 'grain' || style === 'canvas') {
    tctx.globalAlpha = style === 'grain' ? 0.22 : 0.12;
    tctx.lineWidth = style === 'canvas' ? 0.8 : 0.6;
    for (let i = 0; i < (style === 'grain' ? 18 : 8); i++) {
      const px = (i * 7) % size;
      const py = (i * 11) % size;
      tctx.beginPath();
      if (style === 'canvas') {
        tctx.moveTo(px, 0);
        tctx.lineTo(px, size);
        tctx.moveTo(0, py);
        tctx.lineTo(size, py);
      } else {
        tctx.arc(px, py, style === 'grain' ? 0.7 : 0.45, 0, Math.PI * 2);
      }
      style === 'canvas' ? tctx.stroke() : tctx.fill();
    }
  }
  if (style === 'hachure' || style === 'cross_hatch') {
    tctx.beginPath();
    tctx.moveTo(-2, size + 2);
    tctx.lineTo(size + 2, -2);
    tctx.moveTo(-2, 2);
    tctx.lineTo(2, -2);
    tctx.moveTo(size - 2, size + 2);
    tctx.lineTo(size + 2, size - 2);
    tctx.stroke();
  }
  if (style === 'cross_hatch') {
    tctx.beginPath();
    tctx.moveTo(-2, -2);
    tctx.lineTo(size + 2, size + 2);
    tctx.moveTo(size - 2, -2);
    tctx.lineTo(size + 2, 2);
    tctx.moveTo(-2, size - 2);
    tctx.lineTo(2, size + 2);
    tctx.stroke();
  }
  if (style === 'dots') {
    tctx.beginPath();
    tctx.arc(3, 3, 1.5, 0, Math.PI * 2);
    tctx.arc(9, 9, 1.5, 0, Math.PI * 2);
    tctx.fill();
  }
  const pattern = ctx.createPattern(tile, 'repeat');
  if (pattern) {
    if (SHAPE_PATTERN_CACHE.size > 80) SHAPE_PATTERN_CACHE.clear();
    SHAPE_PATTERN_CACHE.set(key, pattern);
    return pattern;
  }
  return color;
}

function measureShapeTextHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string,
  padding: number
): number {
  if (!text) return 0;
  ctx.save();
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", system-ui, sans-serif`;
  const pad = Math.max(4, padding);
  const availW = Math.max(24, maxWidth - pad * 2);
  const paragraphs = text.split('\n');
  let lineCount = 0;
  for (const para of paragraphs) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > availW) {
        if (line) {
          lineCount++;
          line = '';
        }
        if (ctx.measureText(w).width > availW) {
          let chunk = '';
          for (const ch of w) {
            if (ctx.measureText(chunk + ch).width > availW && chunk) {
              lineCount++;
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = w;
        }
      } else {
        line = test;
      }
    }
    lineCount++;
  }
  ctx.restore();
  const lineHeight = fontSize * 1.35;
  return lineCount * lineHeight + pad * 2;
}

function drawShapeObject(ctx: CanvasRenderingContext2D, obj: ShapeObject) {
  // autoGrow: expand height to fit text content if needed
  let { x, y, width: w, height: h, shapeKind } = obj;
  if (obj.autoGrow && obj.text) {
    const textH = measureShapeTextHeight(
      ctx,
      obj.text,
      w,
      obj.fontSize || 14,
      obj.fontFamily || 'Plus Jakarta Sans',
      obj.fontWeight || 'normal',
      obj.fontStyle || 'normal',
      obj.padding ?? 10
    );
    if (textH > h) {
      h = textH;
      obj.height = h;
    }
  }
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();
  if (obj.flipX || obj.flipY) {
    ctx.translate(cx, cy);
    ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);
    ctx.translate(-cx, -cy);
  }
  if (obj.lineStyle === 'dashed') ctx.setLineDash([8, 6]);
  else if (obj.lineStyle === 'dotted') ctx.setLineDash([2, 5]);

  if (obj.shadow) {
    ctx.shadowColor = obj.shadowColor || 'rgba(15, 23, 42, 0.22)';
    ctx.shadowBlur = (obj.shadowBlur ?? 14) + (obj.shadowSpread ?? 0);
    ctx.shadowOffsetX = obj.shadowOffsetX ?? 0;
    ctx.shadowOffsetY = obj.shadowOffsetY ?? 6;
  }
  if (obj.blendMode) ctx.globalCompositeOperation = obj.blendMode;

  const hasFill = Boolean(obj.fill && obj.fill !== 'transparent');
  if (obj.fillGradient) {
    const rad = (obj.fillGradient.angle * Math.PI) / 180;
    const gx = Math.cos(rad) * (w / 2);
    const gy = Math.sin(rad) * (h / 2);
    const grad = obj.fillGradient.type === 'radial'
      ? ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 2)
      : ctx.createLinearGradient(cx - gx, cy - gy, cx + gx, cy + gy);
    const stops = obj.fillGradient.stops?.length ? obj.fillGradient.stops : [
      { color: obj.fillGradient.from, position: 0 },
      { color: obj.fillGradient.to, position: 1 },
    ];
    stops.forEach((stop) => grad.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color));
    ctx.fillStyle = grad;
  } else if (hasFill && obj.fillStyle && obj.fillStyle !== 'solid') {
    ctx.fillStyle = getShapePattern(ctx, obj.fill, obj.fillStyle);
  } else {
    ctx.fillStyle = obj.fill || 'transparent';
  }
  ctx.strokeStyle = cbRemap(obj.stroke) || '#0F172A';
  ctx.lineWidth = obj.strokeWidth || 2;
  if (_colorblindMode && obj.fill && obj.fill !== 'transparent' && !obj.fillGradient) {
    ctx.fillStyle = cbRemap(obj.fill) || ctx.fillStyle;
  }
  if (_highContrastMode) {
    ctx.lineWidth = (obj.strokeWidth || 2) * 1.5;
    if (obj.stroke) ctx.strokeStyle = hcAdjustColor(ctx.strokeStyle as string);
    if (obj.fill && obj.fill !== 'transparent' && !obj.fillGradient) ctx.fillStyle = hcAdjustColor(ctx.fillStyle as string);
  }

  const paint = () => {
    if (obj.borderPosition === 'outside' && (hasFill || obj.fillGradient) && obj.stroke && obj.strokeWidth > 0) {
      ctx.save();
      ctx.lineWidth *= 2;
      ctx.stroke();
      ctx.restore();
    }
    if (hasFill || obj.fillGradient) ctx.fill();
    if (hasFill && obj.fillTexture && obj.fillTexture !== 'none') {
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = getShapePattern(ctx, obj.fill, obj.fillTexture);
      ctx.fill();
      ctx.restore();
    }
    if (obj.stroke && obj.strokeWidth > 0 && obj.borderPosition === 'inside') {
      ctx.save();
      ctx.clip();
      ctx.lineWidth *= 2;
      ctx.stroke();
      ctx.restore();
    } else if (obj.stroke && obj.strokeWidth > 0 && obj.borderPosition !== 'outside') {
      ctx.stroke();
    } else if (obj.stroke && obj.strokeWidth > 0 && !(hasFill || obj.fillGradient)) {
      ctx.stroke();
    }
  };

  switch (shapeKind) {
    case 'custom': {
      if (obj.customPath && typeof Path2D !== 'undefined') {
        const paths = obj.booleanPaths?.length ? obj.booleanPaths : [{ d: obj.customPath, viewBox: obj.customPathViewBox || [0, 0, 100, 100] as [number, number, number, number] }];
        if (obj.booleanOperation && paths.length > 1 && typeof document !== 'undefined') {
          const scale = Math.max(1, Math.min(3, Math.hypot(ctx.getTransform().a, ctx.getTransform().b)));
          const scratch = document.createElement('canvas');
          scratch.width = Math.max(1, Math.ceil(w * scale));
          scratch.height = Math.max(1, Math.ceil(h * scale));
          const sctx = scratch.getContext('2d');
          if (sctx) {
            paths.forEach((item, index) => {
              const [vx, vy, vw, vh] = item.viewBox;
              sctx.globalCompositeOperation = index === 0 || obj.booleanOperation === 'union'
                ? 'source-over'
                : obj.booleanOperation === 'subtract' ? 'destination-out'
                  : obj.booleanOperation === 'intersect' ? 'destination-in' : 'xor';
              sctx.fillStyle = obj.fill || '#0F172A';
              let path: Path2D;
              try { path = new Path2D(item.d); } catch { return; }
              sctx.save();
              sctx.scale(scratch.width / Math.max(1, vw), scratch.height / Math.max(1, vh));
              sctx.translate(-vx, -vy);
              sctx.fill(path);
              sctx.restore();
            });
            ctx.drawImage(scratch, x, y, w, h);
          }
        } else {
          const [vx, vy, vw, vh] = obj.customPathViewBox || [0, 0, 100, 100];
          let path: Path2D;
          try { path = new Path2D(obj.customPath); } catch { break; }
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(w / Math.max(1, vw), h / Math.max(1, vh));
          ctx.translate(-vx, -vy);
          if (hasFill || obj.fillGradient) ctx.fill(path);
          ctx.restore();
        }
        if (obj.stroke && obj.strokeWidth > 0) {
          paths.forEach((item) => {
            const [vx, vy, vw, vh] = item.viewBox;
            let path: Path2D;
            try { path = new Path2D(item.d); } catch { return; }
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(w / Math.max(1, vw), h / Math.max(1, vh));
            ctx.translate(-vx, -vy);
            ctx.stroke(path);
            ctx.restore();
          });
        }
      }
      break;
    }
    case 'rectangle':
    case 'square':
    case 'flow_process': {
      const r = Math.max(0, Math.min(obj.cornerRadius ?? 0, w / 2, h / 2));
      ctx.beginPath();
      if (obj.cornerRadii) {
        const cap = Math.min(w / 2, h / 2);
        const radii = [obj.cornerRadii.topLeft, obj.cornerRadii.topRight, obj.cornerRadii.bottomRight, obj.cornerRadii.bottomLeft].map((v) => Math.max(0, Math.min(cap, v)));
        ctx.roundRect(x, y, w, h, radii);
      } else if (r > 0) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
      paint();
      break;
    }
    case 'rounded_rect': {
      const r = Math.max(0, Math.min(obj.cornerRadius ?? 14, w / 2, h / 2));
      ctx.beginPath();
      const cap = Math.min(w / 2, h / 2);
      const radii = obj.cornerRadii
        ? [obj.cornerRadii.topLeft, obj.cornerRadii.topRight, obj.cornerRadii.bottomRight, obj.cornerRadii.bottomLeft].map((v) => Math.max(0, Math.min(cap, v)))
        : r;
      ctx.roundRect(x, y, w, h, radii);
      paint();
      break;
    }
    case 'frame': {
      const r = Math.max(0, Math.min(obj.cornerRadius ?? 10, w / 2, h / 2));
      ctx.beginPath();
      const cap = Math.min(w / 2, h / 2);
      const radii = obj.cornerRadii
        ? [obj.cornerRadii.topLeft, obj.cornerRadii.topRight, obj.cornerRadii.bottomRight, obj.cornerRadii.bottomLeft].map((v) => Math.max(0, Math.min(cap, v)))
        : r;
      ctx.roundRect(x, y, w, h, radii);
      paint();
      // Header bar divider for wireframe/section frame
      ctx.beginPath();
      ctx.moveTo(x, y + Math.min(28, h * 0.25));
      ctx.lineTo(x + w, y + Math.min(28, h * 0.25));
      ctx.stroke();
      break;
    }
    case 'flow_terminator': {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
      paint();
      break;
    }
    case 'circle':
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      paint();
      break;
    }
    case 'ring': {
      const outerRx = Math.max(4, w / 2);
      const outerRy = Math.max(4, h / 2);
      const innerRx = outerRx * 0.52;
      const innerRy = outerRy * 0.52;
      ctx.beginPath();
      ctx.ellipse(cx, cy, outerRx, outerRy, 0, 0, Math.PI * 2);
      ctx.ellipse(cx, cy, innerRx, innerRy, 0, 0, Math.PI * 2, true);
      if (hasFill || obj.fillGradient) ctx.fill('evenodd');
      if (obj.stroke && obj.strokeWidth > 0) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, outerRx, outerRy, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx, cy, innerRx, innerRy, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'semi_circle': {
      ctx.beginPath();
      ctx.ellipse(cx, y + h, Math.max(1, w / 2), Math.max(1, h), 0, Math.PI, 0);
      ctx.closePath();
      paint();
      break;
    }
    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      paint();
      break;
    }
    case 'right_triangle': {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      paint();
      break;
    }
    case 'parallelogram': {
      const skew = Math.min(28, w * 0.22);
      ctx.beginPath();
      ctx.moveTo(x + skew, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - skew, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      paint();
      break;
    }
    case 'trapezoid': {
      const inset = Math.min(28, w * 0.2);
      ctx.beginPath();
      ctx.moveTo(x + inset, y);
      ctx.lineTo(x + w - inset, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      paint();
      break;
    }
    case 'diamond':
    case 'flow_decision': {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      paint();
      break;
    }
    case 'cross': {
      const armX = w * 0.34;
      const armY = h * 0.34;
      ctx.beginPath();
      ctx.moveTo(x + armX, y);
      ctx.lineTo(x + w - armX, y);
      ctx.lineTo(x + w - armX, y + armY);
      ctx.lineTo(x + w, y + armY);
      ctx.lineTo(x + w, y + h - armY);
      ctx.lineTo(x + w - armX, y + h - armY);
      ctx.lineTo(x + w - armX, y + h);
      ctx.lineTo(x + armX, y + h);
      ctx.lineTo(x + armX, y + h - armY);
      ctx.lineTo(x, y + h - armY);
      ctx.lineTo(x, y + armY);
      ctx.lineTo(x + armX, y + armY);
      ctx.closePath();
      paint();
      break;
    }
    case 'pentagon':
      drawPolygonPath(ctx, cx, cy, w / 2, h / 2, 5);
      paint();
      break;
    case 'hexagon':
      drawPolygonPath(ctx, cx, cy, w / 2, h / 2, 6, 0);
      paint();
      break;
    case 'polygon':
      if (obj.polygonVertices && obj.polygonVertices.length >= 3) {
        ctx.beginPath();
        obj.polygonVertices.forEach((vertex, index) => {
          const px = x + (vertex.x / 100) * w;
          const py = y + (vertex.y / 100) * h;
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      } else {
        drawPolygonPath(ctx, cx, cy, w / 2, h / 2, Math.max(3, Math.min(12, obj.polygonSides || 8)));
      }
      paint();
      break;
    case 'star': {
      ctx.beginPath();
      const spikes = Math.max(4, Math.min(12, obj.polygonSides || 5));
      const outerRx = w / 2;
      const outerRy = h / 2;
      const innerRx = outerRx * 0.44;
      const innerRy = outerRy * 0.44;
      for (let i = 0; i < spikes * 2; i++) {
        const rx = i % 2 === 0 ? outerRx : innerRx;
        const ry = i % 2 === 0 ? outerRy : innerRy;
        const a = -Math.PI / 2 + (i * Math.PI) / spikes;
        const px = cx + rx * Math.cos(a);
        const py = cy + ry * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      paint();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(cx, y + h * 0.88);
      ctx.bezierCurveTo(x - w * 0.1, y + h * 0.55, x + w * 0.05, y + h * 0.05, cx, y + h * 0.3);
      ctx.bezierCurveTo(x + w * 0.95, y + h * 0.05, x + w * 1.1, y + h * 0.55, cx, y + h * 0.88);
      ctx.closePath();
      paint();
      break;
    }
    case 'cloud': {
      ctx.beginPath();
      ctx.arc(x + w * 0.28, y + h * 0.58, w * 0.18, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(x + w * 0.45, y + h * 0.36, w * 0.2, Math.PI * 1.0, Math.PI * 1.9);
      ctx.arc(x + w * 0.72, y + h * 0.48, w * 0.19, Math.PI * 1.3, Math.PI * 0.4);
      ctx.lineTo(x + w * 0.28, y + h * 0.76);
      ctx.closePath();
      paint();
      break;
    }
    case 'speech_bubble':
    case 'callout': {
      const bh = h * 0.8;
      const r = Math.max(0, Math.min(obj.cornerRadius ?? 12, w / 2, bh / 2));
      ctx.beginPath();
      ctx.roundRect(x, y, w, bh, r);
      paint();
      ctx.beginPath();
      if (shapeKind === 'callout') {
        ctx.moveTo(x + w * 0.42, y + bh - 1);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(x + w * 0.58, y + bh - 1);
      } else {
        ctx.moveTo(x + w * 0.25, y + bh - 1);
        ctx.lineTo(x + w * 0.18, y + h);
        ctx.lineTo(x + w * 0.42, y + bh - 1);
      }
      ctx.closePath();
      paint();
      break;
    }
    case 'flow_data': {
      const skew = Math.min(24, w * 0.16);
      ctx.beginPath();
      ctx.moveTo(x + skew, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - skew, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      paint();
      break;
    }
    case 'flow_database':
    case 'math_cylinder': {
      const ry = Math.min(18, h * 0.16);
      ctx.beginPath();
      ctx.ellipse(cx, y + ry, w / 2, ry, 0, Math.PI, 0);
      ctx.lineTo(x + w, y + h - ry);
      ctx.ellipse(cx, y + h - ry, w / 2, ry, 0, 0, Math.PI);
      ctx.closePath();
      paint();
      ctx.beginPath();
      ctx.ellipse(cx, y + ry, w / 2, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'flow_document': {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h * 0.85);
      ctx.quadraticCurveTo(x + w * 0.75, y + h * 0.7, cx, y + h * 0.88);
      ctx.quadraticCurveTo(x + w * 0.25, y + h * 1.04, x, y + h * 0.88);
      ctx.closePath();
      paint();
      break;
    }
    case 'block_arrow_right': {
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.28);
      ctx.lineTo(x + w * 0.65, y + h * 0.28);
      ctx.lineTo(x + w * 0.65, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(x + w * 0.65, y + h);
      ctx.lineTo(x + w * 0.65, y + h * 0.72);
      ctx.lineTo(x, y + h * 0.72);
      ctx.closePath();
      paint();
      break;
    }
    case 'block_arrow_left': {
      ctx.beginPath();
      ctx.moveTo(x + w, y + h * 0.28);
      ctx.lineTo(x + w * 0.35, y + h * 0.28);
      ctx.lineTo(x + w * 0.35, y);
      ctx.lineTo(x, cy);
      ctx.lineTo(x + w * 0.35, y + h);
      ctx.lineTo(x + w * 0.35, y + h * 0.72);
      ctx.lineTo(x + w, y + h * 0.72);
      ctx.closePath();
      paint();
      break;
    }
    case 'block_arrow_up': {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y + h);
      ctx.lineTo(x + w * 0.28, y + h * 0.35);
      ctx.lineTo(x, y + h * 0.35);
      ctx.lineTo(cx, y);
      ctx.lineTo(x + w, y + h * 0.35);
      ctx.lineTo(x + w * 0.72, y + h * 0.35);
      ctx.lineTo(x + w * 0.72, y + h);
      ctx.closePath();
      paint();
      break;
    }
    case 'block_arrow_down': {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y);
      ctx.lineTo(x + w * 0.28, y + h * 0.65);
      ctx.lineTo(x, y + h * 0.65);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x + w, y + h * 0.65);
      ctx.lineTo(x + w * 0.72, y + h * 0.65);
      ctx.lineTo(x + w * 0.72, y);
      ctx.closePath();
      paint();
      break;
    }
    case 'bracket_left': {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.8, y);
      ctx.quadraticCurveTo(x + w * 0.2, y, x + w * 0.35, cy);
      ctx.quadraticCurveTo(x + w * 0.2, y + h, x + w * 0.8, y + h);
      ctx.stroke();
      break;
    }
    case 'bracket_right': {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y);
      ctx.quadraticCurveTo(x + w * 0.8, y, x + w * 0.65, cy);
      ctx.quadraticCurveTo(x + w * 0.8, y + h, x + w * 0.2, y + h);
      ctx.stroke();
      break;
    }
    case 'math_cube': {
      const d = Math.min(w, h) * 0.25;
      ctx.beginPath();
      ctx.rect(x, y + d, w - d, h - d);
      paint();
      ctx.beginPath();
      ctx.moveTo(x, y + d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h - d);
      ctx.lineTo(x + w - d, y + h);
      ctx.moveTo(x + w - d, y + d);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      break;
    }
    case 'math_cone': {
      const ry = Math.min(16, h * 0.16);
      ctx.beginPath();
      ctx.ellipse(cx, y + h - ry, w / 2, ry, 0, 0, Math.PI * 2);
      paint();
      ctx.beginPath();
      ctx.moveTo(x, y + h - ry);
      ctx.lineTo(cx, y);
      ctx.lineTo(x + w, y + h - ry);
      ctx.stroke();
      break;
    }
    case 'math_axes': {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx, y + h);
      ctx.moveTo(x, cy);
      ctx.lineTo(x + w, cy);
      ctx.stroke();
      break;
    }
    case 'circuit_resistor': {
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + w * 0.2, cy);
      const zigW = w * 0.6;
      for (let i = 0; i <= 5; i++) {
        const px = x + w * 0.2 + (zigW * i) / 5;
        const py = i === 0 || i === 5 ? cy : i % 2 === 1 ? y + h * 0.2 : y + h * 0.8;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(x + w, cy);
      ctx.stroke();
      break;
    }
    case 'circuit_capacitor': {
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + w * 0.42, cy);
      ctx.moveTo(x + w * 0.42, y + h * 0.15);
      ctx.lineTo(x + w * 0.42, y + h * 0.85);
      ctx.moveTo(x + w * 0.58, y + h * 0.15);
      ctx.lineTo(x + w * 0.58, y + h * 0.85);
      ctx.moveTo(x + w * 0.58, cy);
      ctx.lineTo(x + w, cy);
      ctx.stroke();
      break;
    }
    case 'circuit_battery': {
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + w * 0.42, cy);
      ctx.moveTo(x + w * 0.42, y + h * 0.12);
      ctx.lineTo(x + w * 0.42, y + h * 0.88);
      ctx.moveTo(x + w * 0.58, y + h * 0.3);
      ctx.lineTo(x + w * 0.58, y + h * 0.7);
      ctx.moveTo(x + w * 0.58, cy);
      ctx.lineTo(x + w, cy);
      ctx.stroke();
      break;
    }
    case 'circuit_ground': {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx, cy);
      ctx.moveTo(x + w * 0.18, cy);
      ctx.lineTo(x + w * 0.82, cy);
      ctx.moveTo(x + w * 0.3, cy + h * 0.2);
      ctx.lineTo(x + w * 0.7, cy + h * 0.2);
      ctx.moveTo(x + w * 0.42, cy + h * 0.4);
      ctx.lineTo(x + w * 0.58, cy + h * 0.4);
      ctx.stroke();
      break;
    }
    case 'circuit_switch': {
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + w * 0.3, cy);
      ctx.lineTo(x + w * 0.7, y + h * 0.2);
      ctx.moveTo(x + w * 0.7, cy);
      ctx.lineTo(x + w, cy);
      ctx.stroke();
      break;
    }
    case 'circuit_led': {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.35, 0, Math.PI * 2);
      paint();
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(cx - Math.min(w, h) * 0.35, cy);
      ctx.moveTo(cx + Math.min(w, h) * 0.35, cy);
      ctx.lineTo(x + w, cy);
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      paint();
    }
  }

  if (obj.shadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.restore();

  if (obj.text) {
    drawWrappedText(
      ctx,
      obj.text,
      x,
      y,
      w,
      h,
      obj.fontSize || 14,
      obj.fontFamily || 'Plus Jakarta Sans',
      obj.fontWeight || 'normal',
      obj.fontStyle || 'normal',
      obj.textColor || '#0F172A',
      obj.textAlign || 'center',
      false,
      obj.shapeKind === 'frame' ? 'top' : obj.verticalAlign || 'middle',
      obj.padding ?? 10
    );
  }
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { row: parseInt(m[2], 10) - 1, col: col - 1 };
}

export function evaluateTableCell(raw: string, cells: string[][], depth = 0): string {
  if (!raw || !raw.startsWith('=') || depth > 5) return raw;
  const expr = raw.slice(1).trim();
  if (!expr) return raw;
  const getNum = (r: number, c: number): number => {
    const cellVal = cells?.[r]?.[c] ?? '';
    const resolved = cellVal.startsWith('=') ? evaluateTableCell(cellVal, cells, depth + 1) : cellVal;
    const n = parseFloat(String(resolved).replace(/[^0-9eE.+-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const collectRange = (a: string, b: string): number[] => {
    const start = parseCellRef(a);
    const end = parseCellRef(b);
    if (!start || !end) return [];
    const r0 = Math.max(0, Math.min(start.row, end.row));
    const r1 = Math.min((cells?.length || 1) - 1, Math.max(start.row, end.row));
    const c0 = Math.max(0, Math.min(start.col, end.col));
    const c1 = Math.min((cells?.[0]?.length || 1) - 1, Math.max(start.col, end.col));
    const nums: number[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        nums.push(getNum(r, c));
      }
    }
    return nums;
  };

  try {
    let normalized = expr.replace(/(SUM|AVG|AVERAGE|COUNT|MIN|MAX)\(([^)]+)\)/gi, (_, fn: string, args: string) => {
      const fnUpper = fn.toUpperCase();
      const parts = args.split(',').map((s) => s.trim());
      const vals: number[] = [];
      for (const p of parts) {
        if (p.includes(':')) {
          const [a, b] = p.split(':');
          vals.push(...collectRange(a, b));
        } else {
          const ref = parseCellRef(p);
          if (ref) vals.push(getNum(ref.row, ref.col));
          else {
            const n = Number(p);
            if (Number.isFinite(n)) vals.push(n);
          }
        }
      }
      if (vals.length === 0) return '0';
      if (fnUpper === 'SUM') return String(vals.reduce((s, v) => s + v, 0));
      if (fnUpper === 'AVG' || fnUpper === 'AVERAGE') return String(vals.reduce((s, v) => s + v, 0) / vals.length);
      if (fnUpper === 'COUNT') return String(vals.length);
      if (fnUpper === 'MIN') return String(Math.min(...vals));
      if (fnUpper === 'MAX') return String(Math.max(...vals));
      return '0';
    });
    normalized = normalized.replace(/\b([A-Z]{1,2}\d+)\b/g, (token) => {
      const ref = parseCellRef(token);
      if (!ref) return token;
      return String(getNum(ref.row, ref.col));
    });
    const out = compile(normalized).evaluate({});
    if (typeof out === 'number' && Number.isFinite(out)) {
      return Number.isInteger(out) ? String(out) : out.toFixed(2).replace(/\.?0+$/, '');
    }
    return String(out);
  } catch {
    return '#ERR';
  }
}

function getTableColumnBounds(obj: TableObject): { colXs: number[]; colWs: number[]; rowYs: number[]; rowHs: number[] } {
  const rCount = Math.max(1, obj.rows);
  const cCount = Math.max(1, obj.cols);
  const rawCols = obj.colWidths && obj.colWidths.length === cCount ? obj.colWidths : Array(cCount).fill(obj.width / cCount);
  const sumCols = rawCols.reduce((a, b) => a + Math.max(24, b), 0) || obj.width;
  const colWs = rawCols.map((w) => (Math.max(24, w) / sumCols) * obj.width);
  const colXs: number[] = [];
  let cx = obj.x;
  for (const w of colWs) {
    colXs.push(cx);
    cx += w;
  }

  const rawRows = obj.rowHeights && obj.rowHeights.length === rCount ? obj.rowHeights : Array(rCount).fill(obj.height / rCount);
  const sumRows = rawRows.reduce((a, b) => a + Math.max(20, b), 0) || obj.height;
  const rowHs = rawRows.map((h) => (Math.max(20, h) / sumRows) * obj.height);
  const rowYs: number[] = [];
  let cy = obj.y;
  for (const h of rowHs) {
    rowYs.push(cy);
    cy += h;
  }
  return { colXs, colWs, rowYs, rowHs };
}

function isHexLightColor(hex?: string): boolean {
  if (!hex || !hex.startsWith('#')) return false;
  const clean = hex.slice(1);
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 155;
}

function drawTableObject(ctx: CanvasRenderingContext2D, obj: TableObject) {
  const { x, y, width, height, rows, cols, cells, headerBg, borderColor, textColor } = obj;
  const rCount = Math.max(1, rows);
  const cCount = Math.max(1, cols);
  const { colXs, colWs, rowYs, rowHs } = getTableColumnBounds(obj);

  const isDarkTable = isHexLightColor(textColor);
  const bodyBg = isDarkTable ? '#1E293B' : '#FFFFFF';
  const zebraBg = isDarkTable ? '#243247' : '#F8FAFC';
  const headerTextHex = isHexLightColor(headerBg) ? '#0F172A' : '#FFFFFF';

  ctx.save();
  ctx.fillStyle = bodyBg;
  ctx.fillRect(x, y, width, height);
  for (let r = 1; r < rCount; r++) {
    if (r % 2 === 0) {
      ctx.fillStyle = zebraBg;
      ctx.fillRect(x, rowYs[r], width, rowHs[r]);
    }
  }
  ctx.fillStyle = headerBg || '#1E293B';
  ctx.fillRect(x, y, width, rowHs[0]);

  const merges = obj.mergedCells || [];
  const covered = new Set<string>();
  const anchorMap = new Map<string, { rowSpan: number; colSpan: number }>();
  for (const m of merges) {
    anchorMap.set(`${m.r}:${m.c}`, { rowSpan: m.rowSpan, colSpan: m.colSpan });
    for (let rr = m.r; rr < Math.min(rCount, m.r + m.rowSpan); rr++) {
      for (let cc = m.c; cc < Math.min(cCount, m.c + m.colSpan); cc++) {
        if (rr !== m.r || cc !== m.c) covered.add(`${rr}:${cc}`);
      }
    }
  }

  ctx.strokeStyle = borderColor || (isDarkTable ? '#334155' : '#CBD5E1');
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  ctx.font = '13px "DM Sans", sans-serif';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < rCount; r++) {
    for (let c = 0; c < cCount; c++) {
      const key = `${r}:${c}`;
      if (covered.has(key)) continue;
      const span = anchorMap.get(key) || { rowSpan: 1, colSpan: 1 };
      const cellX = colXs[c];
      const cellY = rowYs[r];
      let cellW = 0;
      for (let cc = c; cc < Math.min(cCount, c + span.colSpan); cc++) cellW += colWs[cc];
      let cellH = 0;
      for (let rr = r; rr < Math.min(rCount, r + span.rowSpan); rr++) cellH += rowHs[rr];

      if (r === 0) {
        ctx.fillStyle = headerBg || '#1E293B';
        ctx.fillRect(cellX, cellY, cellW, cellH);
      }
      ctx.strokeStyle = borderColor || (isDarkTable ? '#334155' : '#CBD5E1');
      ctx.strokeRect(cellX, cellY, cellW, cellH);

      const raw = cells?.[r]?.[c] || '';
      if (!raw) continue;
      const displayVal = raw.startsWith('=') ? evaluateTableCell(raw, cells) : raw;
      const rawAlign = typeof obj.cellAlign === 'string' ? obj.cellAlign : obj.cellAlign?.[key] || 'left';
      const align: CanvasTextAlign = rawAlign === 'justify' ? 'left' : rawAlign;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cellX + 4, cellY + 2, Math.max(4, cellW - 8), Math.max(4, cellH - 4));
      ctx.clip();
      ctx.fillStyle = r === 0 ? headerTextHex : textColor || '#0F172A';
      ctx.font = `${r === 0 ? 'bold' : 'normal'} 13px "DM Sans", sans-serif`;
      ctx.textAlign = align;
      const tx = align === 'center' ? cellX + cellW / 2 : align === 'right' ? cellX + cellW - 8 : cellX + 8;
      ctx.fillText(displayVal, tx, cellY + cellH / 2, Math.max(8, cellW - 14));
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawChartObject(ctx: CanvasRenderingContext2D, obj: ChartObject) {
  const { x, y, width: w, height: h, chartType, title, labels, values, colors } = obj;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title || 'Chart', x + 16, y + 24);

  const padX = chartType === 'horizontalBar' ? 68 : 42;
  const padTop = 44;
  const padBottom = 34;
  const plotW = Math.max(40, w - padX - 24);
  const plotH = Math.max(40, h - padTop - padBottom);
  const safeValues = values.map((v) => (Number.isFinite(v) ? v : 0));
  const posMaxVal = Math.max(1e-6, ...safeValues.map((v) => Math.max(0, v)));
  const minVal = Math.min(0, ...safeValues);
  const maxVal = Math.max(0, ...safeValues);
  const valSpan = Math.max(1e-6, maxVal - minVal);
  const zeroY = y + padTop + (maxVal / valSpan) * plotH;
  const zeroX = x + padX + (-minVal / valSpan) * plotW;

  if (chartType === 'pie' || chartType === 'doughnut') {
    const total = Math.max(1e-6, safeValues.reduce((a, b) => a + Math.max(0, b), 0));
    const cx = x + w / 2;
    const cy = y + padTop + plotH / 2;
    const r = Math.min(plotW, plotH) * 0.42;
    let angle = -Math.PI / 2;
    safeValues.forEach((v, i) => {
      const posV = Math.max(0, v);
      const slice = (posV / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length] || '#2563EB';
      ctx.fill();
      if (slice > 0.25) {
        const mid = angle + slice / 2;
        const lr = chartType === 'doughnut' ? r * 0.76 : r * 0.62;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round((posV / total) * 100)}%`, cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr);
      }
      angle += slice;
    });
    if (chartType === 'doughnut') {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(total)), cx, cy);
    }
    // Compact bottom legend strip for pie/doughnut slices
    if (labels.length > 0 && w >= 180) {
      const legCount = Math.min(labels.length, 4);
      const slotW = (w - 24) / legCount;
      ctx.font = '10px "DM Sans", sans-serif';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < legCount; i++) {
        const lx = x + 12 + i * slotW;
        const ly = y + h - 14;
        ctx.fillStyle = colors[i % colors.length] || '#2563EB';
        ctx.fillRect(lx, ly - 4, 8, 8);
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'left';
        ctx.fillText((labels[i] || '').slice(0, 9), lx + 11, ly, Math.max(12, slotW - 14));
      }
    }
  } else if (chartType === 'radar') {
    const count = Math.max(3, safeValues.length);
    const cx = x + w / 2;
    const cy = y + padTop + plotH / 2;
    const r = Math.min(plotW, plotH) * 0.39;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring++) {
      const rr = (r * ring) / 4;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / count;
        const px = cx + rr * Math.cos(a);
        const py = cy + rr * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / count;
      const v = Math.max(0, safeValues[i] ?? 0);
      const rr = (v / posMaxVal) * r;
      const px = cx + rr * Math.cos(a);
      const py = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `${colors[0] || '#2563EB'}33`;
    ctx.fill();
    ctx.strokeStyle = colors[0] || '#2563EB';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / count;
      ctx.fillStyle = '#475569';
      ctx.font = '10px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((labels[i] || `P${i + 1}`).slice(0, 8), cx + (r + 14) * Math.cos(a), cy + (r + 12) * Math.sin(a));
    }
  } else if (chartType === 'horizontalBar') {
    const slotH = plotH / Math.max(1, safeValues.length);
    const bh = Math.max(10, slotH - 10);
    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(zeroX, y + padTop);
    ctx.lineTo(zeroX, y + padTop + plotH);
    ctx.stroke();
    safeValues.forEach((v, i) => {
      const bw = (Math.abs(v) / valSpan) * plotW;
      const bx = v >= 0 ? zeroX : zeroX - bw;
      const by = y + padTop + i * slotH + 4;
      ctx.fillStyle = '#475569';
      ctx.font = '11px "DM Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText((labels[i] || '').slice(0, 9), x + padX - 8, by + bh / 2);
      ctx.fillStyle = colors[i % colors.length] || '#2563EB';
      ctx.beginPath();
      ctx.roundRect(bx, by, Math.max(2, bw), bh, 4);
      ctx.fill();
    });
  } else if (chartType === 'scatter') {
    ctx.strokeStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.moveTo(x + padX, zeroY);
    ctx.lineTo(x + padX + plotW, zeroY);
    ctx.moveTo(x + padX, y + padTop);
    ctx.lineTo(x + padX, y + padTop + plotH);
    ctx.stroke();
    safeValues.forEach((v, i) => {
      const px = x + padX + (safeValues.length > 1 ? (i * plotW) / (safeValues.length - 1) : plotW / 2);
      const py = y + padTop + ((maxVal - v) / valSpan) * plotH;
      ctx.fillStyle = colors[i % colors.length] || '#2563EB';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#475569';
      ctx.font = '10px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((labels[i] || '').slice(0, 8), px, y + padTop + plotH + 15);
    });
  } else if (chartType === 'line' || chartType === 'area') {
    // Y-axis line and tick labels
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + padX, y + padTop);
    ctx.lineTo(x + padX, y + padTop + plotH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + padX, zeroY);
    ctx.lineTo(x + padX + plotW, zeroY);
    ctx.stroke();
    {
      const tickCount = Math.max(2, Math.min(6, Math.floor(plotH / 36)));
      ctx.fillStyle = '#94A3B8';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let t = 0; t <= tickCount; t++) {
        const v = minVal + (t / tickCount) * valSpan;
        const ty = y + padTop + ((maxVal - v) / valSpan) * plotH;
        ctx.fillText(Number.isInteger(v) ? String(v) : v.toFixed(1), x + padX - 6, ty);
      }
    }

    const pts = safeValues.map((v, i) => ({
      px: x + padX + (safeValues.length > 1 ? (i * plotW) / (safeValues.length - 1) : plotW / 2),
      py: y + padTop + ((maxVal - v) / valSpan) * plotH,
      v,
    }));
    if (chartType === 'area' && pts.length > 0) {
      ctx.beginPath();
      ctx.moveTo(pts[0].px, zeroY);
      pts.forEach((p) => ctx.lineTo(p.px, p.py));
      ctx.lineTo(pts[pts.length - 1].px, zeroY);
      ctx.closePath();
      ctx.fillStyle = `${colors[0] || '#2563EB'}28`;
      ctx.fill();
    }
    ctx.strokeStyle = colors[0] || '#2563EB';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    ctx.stroke();
    pts.forEach((p, i) => {
      ctx.fillStyle = colors[i % colors.length] || '#2563EB';
      ctx.beginPath();
      ctx.arc(p.px, p.py, 4, 0, Math.PI * 2);
      ctx.fill();
      // Data value label above the point
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(Number.isInteger(p.v) ? String(p.v) : p.v.toFixed(1), p.px, p.py - 6);
      // X-axis label
      ctx.fillStyle = '#475569';
      ctx.font = '11px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText((labels[i] || '').slice(0, 8), p.px, y + padTop + plotH + 16);
    });
    // Legend strip for line/area charts
    if (labels.length > 0 && w >= 200) {
      const legY = y + h - 12;
      const legCount = Math.min(labels.length, 5);
      const slotW = (w - 24) / legCount;
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < legCount; i++) {
        const lx = x + 12 + i * slotW;
        ctx.fillStyle = colors[i % colors.length] || '#2563EB';
        ctx.fillRect(lx, legY - 3, 8, 6);
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'left';
        ctx.fillText((labels[i] || '').slice(0, 9), lx + 11, legY, Math.max(12, slotW - 14));
      }
    }
  } else {
    // Bar chart (supports positive & negative values anchored at zeroY)
    // Y-axis line and tick labels
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + padX, y + padTop);
    ctx.lineTo(x + padX, y + padTop + plotH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + padX, zeroY);
    ctx.lineTo(x + padX + plotW, zeroY);
    ctx.stroke();
    {
      const tickCount = Math.max(2, Math.min(6, Math.floor(plotH / 36)));
      ctx.fillStyle = '#94A3B8';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let t = 0; t <= tickCount; t++) {
        const v = minVal + (t / tickCount) * valSpan;
        const ty = y + padTop + ((maxVal - v) / valSpan) * plotH;
        ctx.fillText(Number.isInteger(v) ? String(v) : v.toFixed(1), x + padX - 6, ty);
      }
    }
    const bw = Math.max(12, plotW / Math.max(1, safeValues.length) - 12);
    safeValues.forEach((v, i) => {
      const bh = (Math.abs(v) / valSpan) * plotH;
      const bx = x + padX + i * (plotW / Math.max(1, safeValues.length)) + 6;
      const by = v >= 0 ? zeroY - bh : zeroY;
      ctx.fillStyle = colors[i % colors.length] || '#2563EB';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, Math.max(1, bh), v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]);
      ctx.fill();
      // Data value label above/below the bar
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      if (v >= 0) {
        ctx.textBaseline = 'bottom';
        ctx.fillText(Number.isInteger(v) ? String(v) : v.toFixed(1), bx + bw / 2, by - 3);
      } else {
        ctx.textBaseline = 'top';
        ctx.fillText(Number.isInteger(v) ? String(v) : v.toFixed(1), bx + bw / 2, by + bh + 3);
      }
      // X-axis label
      ctx.fillStyle = '#475569';
      ctx.font = '11px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText((labels[i] || '').slice(0, 8), bx + bw / 2, y + padTop + plotH + 16);
    });
    // Legend strip for bar charts
    if (labels.length > 0 && w >= 200) {
      const legY = y + h - 12;
      const legCount = Math.min(labels.length, 5);
      const slotW = (w - 24) / legCount;
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < legCount; i++) {
        const lx = x + 12 + i * slotW;
        ctx.fillStyle = colors[i % colors.length] || '#2563EB';
        ctx.fillRect(lx, legY - 3, 8, 6);
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'left';
        ctx.fillText((labels[i] || '').slice(0, 9), lx + 11, legY, Math.max(12, slotW - 14));
      }
    }
  }
  ctx.restore();
}

export function drawGraphPlot(ctx: CanvasRenderingContext2D, obj: GraphObject) {
  const { x, y, width: w, height: h, mode, expressions, xMin, xMax, yMin, yMax, showGrid, title, params, showDerivative, shadeInequality } = obj;
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 8);
  ctx.clip();

  const scopeBase: Record<string, number> = {
    a: params?.a ?? 1,
    b: params?.b ?? 0,
    k: params?.k ?? 1,
  };

  const sXMin = Number.isFinite(xMin) ? xMin : -10;
  const sXMax = Number.isFinite(xMax) && xMax > sXMin ? xMax : sXMin + 0.5;
  const sYMin = Number.isFinite(yMin) ? yMin : -6;
  const sYMax = Number.isFinite(yMax) && yMax > sYMin ? yMax : sYMin + 0.5;
  const spanX = sXMax - sXMin;
  const spanY = sYMax - sYMin;

  // Isometric 3D Surface Projection inside canvas renderer (for exports & presentation thumbnails)
  if (mode === '3d') {
    const activeExpr = expressions.find((e) => e.visible && e.expr.trim())?.expr || 'sin(x) * cos(y)';
    let compiled: EvalFunction | null = null;
    try {
      compiled = compile(activeExpr);
    } catch {
      compiled = null;
    }
    const cx = x + w / 2;
    const cy = y + h * 0.56;
    const scaleX = (w * 0.34) / Math.max(1e-4, spanX / 2);
    const scaleY = (h * 0.18) / Math.max(1e-4, spanY / 2);
    const scaleZ = h * 0.14;
    const proj = (gx: number, gy: number, gz: number) => {
      const nx = gx - (sXMin + sXMax) / 2;
      const ny = gy - (sYMin + sYMax) / 2;
      const sx = cx + (nx * 0.85 - ny * 0.65) * scaleX * 0.8;
      const sy = cy + (nx * 0.35 + ny * 0.45) * scaleY * 1.4 - gz * scaleZ;
      return { sx, sy };
    };
    const steps = 16;
    ctx.strokeStyle = 'rgba(37,99,235,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= steps; i++) {
      ctx.beginPath();
      let started = false;
      for (let j = 0; j <= steps; j++) {
        const gx = sXMin + (i / steps) * spanX;
        const gy = sYMin + (j / steps) * spanY;
        let gz = 0;
        if (compiled) {
          try {
            gz = Number(compiled.evaluate({ ...scopeBase, x: gx, y: gy }));
          } catch {
            gz = 0;
          }
        }
        if (!Number.isFinite(gz)) {
          started = false;
          continue;
        }
        const p = proj(gx, gy, Math.max(-4, Math.min(4, gz)));
        if (!started) {
          ctx.moveTo(p.sx, p.sy);
          started = true;
        } else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }
    for (let j = 0; j <= steps; j++) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= steps; i++) {
        const gx = sXMin + (i / steps) * spanX;
        const gy = sYMin + (j / steps) * spanY;
        let gz = 0;
        if (compiled) {
          try {
            gz = Number(compiled.evaluate({ ...scopeBase, x: gx, y: gy }));
          } catch {
            gz = 0;
          }
        }
        if (!Number.isFinite(gz)) {
          started = false;
          continue;
        }
        const p = proj(gx, gy, Math.max(-4, Math.min(4, gz)));
        if (!started) {
          ctx.moveTo(p.sx, p.sy);
          started = true;
        } else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }
    if (title) {
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`3D: ${title}`, x + 12, y + 18);
    }
    ctx.restore();
    return;
  }

  const pad = 28;
  const pw = Math.max(40, w - pad * 2);
  const ph = Math.max(40, h - pad * 2);
  const ox = x + pad;
  const oy = y + pad;

  const toScreenX = (gx: number) => ox + ((gx - sXMin) / spanX) * pw;
  const toScreenY = (gy: number) => oy + ph - ((gy - sYMin) / spanY) * ph;

  const niceStep = (span: number, targetDivs: number) => {
    const raw = span / Math.max(1, targetDivs);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    const mult = norm <= 1.2 ? 1 : norm <= 2.5 ? 2 : norm <= 5.5 ? 5 : 10;
    return mult * pow;
  };
  const fmtTick = (val: number) => (Math.abs(val) < 1e-9 ? '0' : Number(val.toPrecision(3)).toString());

  if (showGrid) {
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    const stepX = niceStep(spanX, 10);
    const stepY = niceStep(spanY, 10);
    const startGX = Math.ceil(sXMin / stepX) * stepX;
    const startGY = Math.ceil(sYMin / stepY) * stepY;
    for (let gx = startGX; gx <= sXMax + stepX * 0.01; gx += stepX) {
      const sx = toScreenX(gx);
      ctx.beginPath();
      ctx.moveTo(sx, oy);
      ctx.lineTo(sx, oy + ph);
      ctx.stroke();
    }
    for (let gy = startGY; gy <= sYMax + stepY * 0.01; gy += stepY) {
      const sy = toScreenY(gy);
      ctx.beginPath();
      ctx.moveTo(ox, sy);
      ctx.lineTo(ox + pw, sy);
      ctx.stroke();
    }
  }

  // Axes + tick labels (X and Y axes)
  const axX = Math.max(ox, Math.min(ox + pw, toScreenX(0)));
  const axY = Math.max(oy, Math.min(oy + ph, toScreenY(0)));
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox, axY);
  ctx.lineTo(ox + pw, axY);
  ctx.moveTo(axX, oy);
  ctx.lineTo(axX, oy + ph);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const stepTickX = niceStep(spanX, 5);
  const startTickX = Math.ceil(sXMin / stepTickX) * stepTickX;
  for (let gx = startTickX; gx <= sXMax + stepTickX * 0.01; gx += stepTickX) {
    if (Math.abs(gx) < stepTickX * 0.05) continue;
    ctx.fillText(fmtTick(gx), toScreenX(gx), Math.min(oy + ph - 4, axY + 11));
  }

  const stepTickY = niceStep(spanY, 5);
  const startTickY = Math.ceil(sYMin / stepTickY) * stepTickY;
  const yLabelRight = axX < ox + pw - 26;
  ctx.textAlign = yLabelRight ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  for (let gy = startTickY; gy <= sYMax + stepTickY * 0.01; gy += stepTickY) {
    if (Math.abs(gy) < stepTickY * 0.05) continue;
    const sy = toScreenY(gy);
    ctx.fillText(fmtTick(gy), yLabelRight ? axX + 4 : axX - 4, sy);
  }
  ctx.textBaseline = 'alphabetic';

  // Plot expressions
  for (const item of expressions) {
    if (!item.visible || !item.expr.trim()) continue;
    try {
      if (mode === 'parametric' || item.expr.includes(';')) {
        const [xExpr, yExpr] = item.expr.split(';').map((s) => s.trim());
        const cx = compile(xExpr || 'cos(t)*3');
        const cy = compile(yExpr || 'sin(t)*3');
        ctx.strokeStyle = item.color || '#2563EB';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        let started = false;
        let prevPx: number | null = null;
        let prevPy: number | null = null;
        const steps = 220;
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          const px = Number(cx.evaluate({ ...scopeBase, t, theta: t }));
          const py = Number(cy.evaluate({ ...scopeBase, t, theta: t }));
          if (
            !Number.isFinite(px) ||
            !Number.isFinite(py) ||
            (prevPx !== null && prevPy !== null && (Math.abs(px - prevPx) > spanX * 1.4 || Math.abs(py - prevPy) > spanY * 1.4))
          ) {
            started = false;
            prevPx = Number.isFinite(px) ? px : null;
            prevPy = Number.isFinite(py) ? py : null;
            continue;
          }
          prevPx = px;
          prevPy = py;
          const sx = toScreenX(px);
          const sy = toScreenY(py);
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        continue;
      }

      const compiled = compile(item.expr);
      if (mode === 'polar') {
        ctx.strokeStyle = item.color || '#2563EB';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        let started = false;
        let prevX: number | null = null;
        let prevY: number | null = null;
        const steps = 240;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2;
          const r = Number(compiled.evaluate({ ...scopeBase, theta, t: theta, x: theta }));
          const px = r * Math.cos(theta);
          const py = r * Math.sin(theta);
          if (
            !Number.isFinite(r) ||
            (prevX !== null && prevY !== null && (Math.abs(px - prevX) > spanX * 1.4 || Math.abs(py - prevY) > spanY * 1.4))
          ) {
            started = false;
            prevX = Number.isFinite(px) ? px : null;
            prevY = Number.isFinite(py) ? py : null;
            continue;
          }
          prevX = px;
          prevY = py;
          const sx = toScreenX(px);
          const sy = toScreenY(py);
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      } else {
        const steps = 180;
        const pts: { sx: number; sy: number; gy: number; valid: boolean }[] = [];
        for (let i = 0; i <= steps; i++) {
          const gx = sXMin + (i / steps) * spanX;
          const gy = Number(compiled.evaluate({ ...scopeBase, x: gx, t: gx }));
          const valid = Number.isFinite(gy) && gy >= sYMin - spanY * 2 && gy <= sYMax + spanY * 2;
          pts.push({ sx: toScreenX(gx), sy: toScreenY(gy), gy, valid });
        }

        // Split into contiguous segments breaking across vertical asymptotes
        const segments: { sx: number; sy: number }[][] = [];
        let currentSeg: { sx: number; sy: number }[] = [];
        let prevGy: number | null = null;
        for (const p of pts) {
          const jump = prevGy !== null && Math.abs(p.gy - prevGy) > spanY * 1.4;
          if (!p.valid || jump) {
            if (currentSeg.length > 0) {
              segments.push(currentSeg);
              currentSeg = [];
            }
            prevGy = p.valid ? p.gy : null;
            if (!p.valid) continue;
          }
          currentSeg.push({ sx: p.sx, sy: p.sy });
          prevGy = p.gy;
        }
        if (currentSeg.length > 0) segments.push(currentSeg);

        if (shadeInequality && shadeInequality !== 'none') {
          ctx.save();
          ctx.fillStyle = `${item.color || '#2563EB'}22`;
          const baseY = shadeInequality === 'above' ? oy : oy + ph;
          for (const seg of segments) {
            if (seg.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(seg[0].sx, baseY);
            for (const p of seg) ctx.lineTo(p.sx, p.sy);
            ctx.lineTo(seg[seg.length - 1].sx, baseY);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }

        ctx.strokeStyle = item.color || '#2563EB';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (const seg of segments) {
          seg.forEach((p, idx) => {
            if (idx === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          });
        }
        ctx.stroke();

        if (showDerivative) {
          ctx.save();
          ctx.strokeStyle = item.color || '#F59E0B';
          ctx.globalAlpha = 0.65;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          let dStart = false;
          let prevDy: number | null = null;
          const hDiff = Math.max(1e-4, spanX * 0.0005);
          for (let i = 0; i <= steps; i++) {
            const gx = sXMin + (i / steps) * spanX;
            const fPlus = Number(compiled.evaluate({ ...scopeBase, x: gx + hDiff, t: gx + hDiff }));
            const fMinus = Number(compiled.evaluate({ ...scopeBase, x: gx - hDiff, t: gx - hDiff }));
            const dy = (fPlus - fMinus) / (2 * hDiff);
            const jump = prevDy !== null && Math.abs(dy - prevDy) > spanY * 1.4;
            if (!Number.isFinite(dy) || dy < sYMin - spanY * 2 || dy > sYMax + spanY * 2 || jump) {
              dStart = false;
              prevDy = Number.isFinite(dy) ? dy : null;
              continue;
            }
            prevDy = dy;
            const sx = toScreenX(gx);
            const sy = toScreenY(dy);
            if (!dStart) {
              ctx.moveTo(sx, sy);
              dStart = true;
            } else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    } catch {
      // ignore invalid math expression while typing
    }
  }

  if (title) {
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + 12, y + 18);
  }
  ctx.restore();
}

function drawImageObject(ctx: CanvasRenderingContext2D, obj: ImageObject, onImageLoaded?: () => void) {
  const img = getCachedImage(obj.src, onImageLoaded);
  ctx.save();
  if (obj.mask === 'circle') {
    ctx.beginPath();
    ctx.ellipse(obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width / 2, obj.height / 2, 0, 0, Math.PI * 2);
    ctx.clip();
  } else if (obj.mask === 'rounded') {
    ctx.beginPath();
    ctx.roundRect(obj.x, obj.y, obj.width, obj.height, 14);
    ctx.clip();
  } else if (obj.mask === 'hex') {
    drawPolygonPath(ctx, obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width / 2, obj.height / 2, 6, 0);
    ctx.clip();
  } else if (obj.mask === 'star') {
    ctx.beginPath();
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const outerR = Math.min(obj.width, obj.height) / 2;
    const innerR = outerR * 0.45;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.clip();
  }

  if (obj.filters) {
    const f = obj.filters;
    ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) blur(${f.blur}px)`;
  }

  if (img) {
    if (obj.crop) {
      const nw = Math.max(1, img.naturalWidth || 1);
      const nh = Math.max(1, img.naturalHeight || 1);
      const sx = Math.max(0, Math.min(nw - 1, obj.crop.sx));
      const sy = Math.max(0, Math.min(nh - 1, obj.crop.sy));
      const sw = Math.max(1, Math.min(nw - sx, obj.crop.sw));
      const sh = Math.max(1, Math.min(nh - sy, obj.crop.sh));
      ctx.drawImage(img, sx, sy, sw, sh, obj.x, obj.y, obj.width, obj.height);
    } else {
      ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
    }
  } else {
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
    ctx.fillStyle = '#64748B';
    ctx.font = '12px "DM Sans", sans-serif';
    ctx.fillText(obj.fileName || 'Loading image...', obj.x + 12, obj.y + obj.height / 2);
  }
  ctx.restore();
}

function getStrokeDynamics(obj: StrokeObject, index: number, pointCount: number) {
  const point = obj.points[index];
  const raw = Math.max(0, Math.min(1, point?.p ?? 1));
  const pressure = obj.pressureCurve === 'soft' ? Math.sqrt(raw) : obj.pressureCurve === 'firm' ? raw * raw : raw;
  const t = pointCount <= 1 ? 0.5 : index / (pointCount - 1);
  const start = Math.max(0, Math.min(0.45, obj.taperStart || 0));
  const end = Math.max(0, Math.min(0.45, obj.taperEnd || 0));
  const taper = Math.min(start > 0 ? Math.min(1, t / start) : 1, end > 0 ? Math.min(1, (1 - t) / end) : 1);
  const tilt = Math.min(1, Math.hypot(point?.tiltX || 0, point?.tiltY || 0) / 90);
  const tiltFactor = 1 + tilt * Math.max(0, Math.min(1, obj.tiltSensitivity || 0)) * 0.7;
  return { pressure: Math.max(0.08, pressure), taper: Math.max(0.08, taper), tiltFactor };
}

function getStrokePoint(obj: StrokeObject, index: number) {
  const point = obj.points[index];
  const scatter = Math.max(0, Math.min(1, obj.scatter || 0)) * Math.min(12, obj.strokeWidth * 1.5);
  if (!scatter) return point;
  const seed = (index + 1) * 127.1 + obj.id.length * 311.7;
  const angle = Math.sin(seed) * Math.PI;
  const radius = (Math.sin(seed * 1.37) * 0.5 + 0.5) * scatter;
  return { ...point, x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
}

export function drawBoardObject(
  ctx: CanvasRenderingContext2D,
  obj: BoardObject,
  objectsById: Map<string, BoardObject>,
  onImageLoaded?: () => void,
  options?: RenderDrawOptions
) {
  if (obj.hidden) return;
  if (options?.visibleIds && !options.visibleIds.has(obj.id)) return;
  ctx.save();
  ctx.globalAlpha = obj.opacity ?? 1;

  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const allowOuterFlip = obj.type === 'stroke' || obj.type === 'line' || obj.type === 'image';
  if (obj.rotation || (allowOuterFlip && (obj.flipX || obj.flipY))) {
    ctx.translate(cx, cy);
    if (obj.rotation) ctx.rotate((obj.rotation * Math.PI) / 180);
    if (allowOuterFlip && (obj.flipX || obj.flipY)) ctx.scale(obj.flipX ? -1 : 1, obj.flipY ? -1 : 1);
    ctx.translate(-cx, -cy);
  }

  switch (obj.type) {
    case 'stroke': {
      if (obj.strokeWidth <= 0) break;
      ctx.globalCompositeOperation = obj.blendMode || 'source-over';
      if (obj.wetness) ctx.filter = `blur(${Math.min(1.5, obj.wetness / 70)}px)`;
      const pts = obj.points.map((_point, index) => getStrokePoint(obj, index));
      if (pts.length === 0) break;
      const strokeColor = cbRemap(_highContrastMode ? hcAdjustColor(obj.stroke) : obj.stroke) || obj.stroke;
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.lineCap = obj.brushKind === 'marker' ? 'square' : 'round';
      ctx.lineJoin = 'round';
      // High-contrast stroke width boost (applied via effective width)
      const hcStrokeW = _highContrastMode ? obj.strokeWidth * 1.5 : obj.strokeWidth;
      if (obj.brushKind === 'dashed_ink' || obj.lineStyle === 'dashed') {
        ctx.setLineDash([hcStrokeW * 2.8, hcStrokeW * 2]);
      } else if (obj.lineStyle === 'dotted') {
        ctx.setLineDash([1, hcStrokeW * 2]);
      }

      if (obj.brushKind === 'highlighter') {
        ctx.globalAlpha = Math.min(obj.opacity, 0.36);
      } else if (obj.brushKind === 'marker') {
        ctx.globalAlpha = Math.min(obj.opacity, 0.72);
      } else if (obj.brushKind === 'pencil') {
        ctx.globalAlpha = Math.min(obj.opacity, 0.78);
      }
      if (obj.spacing) ctx.setLineDash([Math.max(0.75, obj.strokeWidth * 0.75), Math.max(1, obj.spacing * obj.strokeWidth * 4)]);

      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, obj.strokeWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (obj.brushKind === 'calligraphy') {
        // Variable-width flat-nib calligraphic ribbon polygon
        const nibAngle = -Math.PI / 5;
        const leftPts: { x: number; y: number }[] = [];
        const rightPts: { x: number; y: number }[] = [];
        for (let i = 0; i < pts.length; i++) {
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(pts.length - 1, i + 1)];
          const segAngle = Math.atan2(next.y - prev.y, next.x - prev.x);
          const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
          const velFactor = Math.max(0.55, Math.min(1.15, 1.1 - dist * 0.012));
          const dynamics = getStrokeDynamics(obj, i, pts.length);
          const tiltAngle = Math.atan2(pts[i].tiltY || 0, pts[i].tiltX || 1);
          const effectiveNib = nibAngle + tiltAngle * (obj.tiltSensitivity || 0) + (obj.rotationDynamics ? segAngle : 0);
          const nibRatio = 0.28 + 0.72 * Math.abs(Math.sin(segAngle - effectiveNib));
          const pressure = obj.pressureSize ? dynamics.pressure : 1;
          const pFactor = Math.max(0.4, Math.min(1.3, pressure * 1.4)) * dynamics.taper * dynamics.tiltFactor;
          const halfW = Math.max(0.75, obj.strokeWidth * 0.55 * nibRatio * velFactor * pFactor);
          const nx = Math.cos(effectiveNib + Math.PI / 2) * halfW;
          const ny = Math.sin(effectiveNib + Math.PI / 2) * halfW;
          leftPts.push({ x: pts[i].x + nx, y: pts[i].y + ny });
          rightPts.push({ x: pts[i].x - nx, y: pts[i].y - ny });
        }
        ctx.beginPath();
        ctx.moveTo(leftPts[0].x, leftPts[0].y);
        for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
        for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i].x, rightPts[i].y);
        ctx.closePath();
        if (obj.pressureOpacity) {
          const avgPressure = pts.reduce((sum, _point, i) => sum + getStrokeDynamics(obj, i, pts.length).pressure, 0) / pts.length;
          ctx.globalAlpha *= avgPressure;
        }
        if (obj.texture) {
          const textureFactor = pts.reduce((sum, _point, i) => {
            const noise = Math.abs(Math.sin((i + 1) * 12.9898 + obj.id.length * 78.233));
            return sum + (obj.texture === 'grain' ? 0.55 + noise * 0.45 : 0.78 + noise * 0.22);
          }, 0) / pts.length;
          ctx.globalAlpha *= textureFactor;
        }
        ctx.fill();
      } else if (obj.brushKind === 'brush' || obj.brushKind === 'fountain') {
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const dynamics = getStrokeDynamics(obj, i, pts.length);
          const pressure = obj.pressureSize ? dynamics.pressure : 1;
          const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const fountainTaper = obj.brushKind === 'fountain'
            ? Math.max(0.4, Math.min(1.35, 1.25 - dist * 0.02)) * (obj.pressureSize ? pressure : 1)
            : obj.pressureSize ? 0.6 + pressure * 0.9 : 1.05;
          const previousAlpha = ctx.globalAlpha;
          if (obj.pressureOpacity) ctx.globalAlpha = previousAlpha * dynamics.pressure;
          if (obj.texture) {
            const textureSeed = Math.abs(Math.sin((i + 1) * 12.9898 + obj.id.length * 78.233));
            ctx.globalAlpha *= obj.texture === 'grain' ? 0.55 + textureSeed * 0.45 : 0.78 + textureSeed * 0.22;
          }
          ctx.lineWidth = Math.max(1, obj.strokeWidth * fountainTaper * dynamics.taper * dynamics.tiltFactor);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
          ctx.globalAlpha = previousAlpha;
        }
      } else {
        if (obj.pressureSize || obj.pressureOpacity || obj.taperStart || obj.taperEnd || obj.tiltSensitivity) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (let i = 0; i < pts.length - 1; i++) {
            const dynamics = getStrokeDynamics(obj, i, pts.length);
            const previousAlpha = ctx.globalAlpha;
            if (obj.pressureOpacity) ctx.globalAlpha = previousAlpha * dynamics.pressure;
            if (obj.texture) {
              const textureSeed = Math.abs(Math.sin((i + 1) * 12.9898 + obj.id.length * 78.233));
              ctx.globalAlpha *= obj.texture === 'grain' ? 0.55 + textureSeed * 0.45 : 0.78 + textureSeed * 0.22;
            }
            const pressure = obj.pressureSize ? dynamics.pressure : 1;
            ctx.lineWidth = Math.max(0.75, obj.strokeWidth * pressure * dynamics.taper * dynamics.tiltFactor);
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
            ctx.stroke();
            ctx.globalAlpha = previousAlpha;
          }
        } else {
          ctx.lineWidth = obj.strokeWidth;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) {
            const midX = (pts[i].x + pts[i + 1].x) / 2;
            const midY = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
          }
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
          ctx.stroke();
        }
      }
      break;
    }

    case 'line': {
      if (obj.strokeWidth <= 0) break;
      const pts = obj.points;
      if (pts.length < 2) break;
      ctx.strokeStyle = _highContrastMode ? hcAdjustColor(obj.stroke) : obj.stroke;
      ctx.lineWidth = _highContrastMode ? obj.strokeWidth * 1.5 : obj.strokeWidth;
      ctx.lineCap = obj.lineCap || 'round';
      ctx.lineJoin = obj.lineJoin || 'round';
      if (obj.dashPattern?.length) ctx.setLineDash(obj.dashPattern);
      else if (obj.lineStyle === 'dashed') ctx.setLineDash([10, 6]);
      else if (obj.lineStyle === 'dotted') ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      let startAngle = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x);
      let endAngle = Math.atan2(pts[pts.length - 1].y - pts[pts.length - 2].y, pts[pts.length - 1].x - pts[pts.length - 2].x);
      if (obj.curved && pts.length === 2) {
        const mx = obj.cpX ?? (pts[0].x + pts[1].x) / 2;
        const my = obj.cpY ?? (pts[0].y + pts[1].y) / 2 - 48;
        ctx.quadraticCurveTo(mx, my, pts[1].x, pts[1].y);
        startAngle = Math.atan2(pts[0].y - my, pts[0].x - mx);
        endAngle = Math.atan2(pts[1].y - my, pts[1].x - mx);
      } else {
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      const first = pts[0];
      const last = pts[pts.length - 1];
      drawEndpointHead(ctx, obj.startHead, first.x, first.y, startAngle, obj.strokeWidth, obj.stroke);
      drawEndpointHead(ctx, obj.endHead, last.x, last.y, endAngle, obj.strokeWidth, obj.stroke);
      break;
    }

    case 'connector': {
      if (obj.strokeWidth <= 0) break;
      const { x1, y1, x2, y2 } = resolveConnectorEndpoints(obj as ConnectorObject, objectsById);
      ctx.strokeStyle = _highContrastMode ? hcAdjustColor(obj.stroke) : obj.stroke;
      ctx.lineWidth = _highContrastMode ? obj.strokeWidth * 1.5 : obj.strokeWidth;
      ctx.lineCap = obj.lineCap || 'round';
      ctx.lineJoin = obj.lineJoin || 'round';
      if (obj.dashPattern?.length) ctx.setLineDash(obj.dashPattern);
      else if (obj.lineStyle === 'dashed') ctx.setLineDash([8, 6]);
      else if (obj.lineStyle === 'dotted') ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      let startAngle = Math.atan2(y1 - y2, x1 - x2);
      let endAngle = Math.atan2(y2 - y1, x2 - x1);
      let labelX = (x1 + x2) / 2;
      let labelY = (y1 + y2) / 2;
      if (obj.waypoints && obj.waypoints.length > 0) {
        const pts = [{ x: x1, y: y1 }, ...obj.waypoints, { x: x2, y: y2 }];
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        startAngle = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x);
        endAngle = Math.atan2(pts[pts.length - 1].y - pts[pts.length - 2].y, pts[pts.length - 1].x - pts[pts.length - 2].x);
        const midPt = obj.waypoints[Math.floor(obj.waypoints.length / 2)];
        labelX = midPt.x;
        labelY = midPt.y;
      } else if (obj.routeType === 'orthogonal') {
        const others = Array.from(objectsById.values()).filter((other) => other.id !== obj.id && other.id !== obj.fromId && other.id !== obj.toId);
        const obstacles = others
          .filter((other) => other.type !== 'connector' && other.type !== 'line')
          .map((other) => ({ x: other.x, y: other.y, width: other.width, height: other.height }));
        others.filter((other): other is ConnectorObject => other.type === 'connector').forEach((other) => {
          const endpoints = resolveConnectorEndpoints(other, objectsById);
          const clearance = Math.max(4, other.strokeWidth / 2);
          obstacles.push({
            x: Math.min(endpoints.x1, endpoints.x2) - clearance,
            y: Math.min(endpoints.y1, endpoints.y2) - clearance,
            width: Math.max(clearance * 2, Math.abs(endpoints.x2 - endpoints.x1) + clearance * 2),
            height: Math.max(clearance * 2, Math.abs(endpoints.y2 - endpoints.y1) + clearance * 2),
          });
        });
        const route = computeSmartOrthogonalPath(x1, y1, x2, y2, obstacles, obj.fromPort, obj.toPort);
        route.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        startAngle = Math.atan2(route[0].y - route[1].y, route[0].x - route[1].x);
        const last = route[route.length - 1];
        const prev = route[route.length - 2];
        endAngle = Math.atan2(last.y - prev.y, last.x - prev.x);
        const mid = route[Math.floor(route.length / 2)];
        labelX = mid.x;
        labelY = mid.y;
      } else if (obj.routeType === 'curved') {
        const distSpan = Math.max(48, Math.hypot(x2 - x1, y2 - y1) * 0.42);
        const portOffset = (side: ConnectorObject['fromPort'], sign: number): [number, number] => {
          if (side === 'left') return [-distSpan, 0];
          if (side === 'right') return [distSpan, 0];
          if (side === 'top') return [0, -distSpan];
          if (side === 'bottom') return [0, distSpan];
          return [sign * distSpan, 0];
        };
        const [ox1, oy1] = obj.fromId ? portOffset(obj.fromPort, 1) : [distSpan * (x2 >= x1 ? 1 : -1), 0];
        const [ox2, oy2] = obj.toId ? portOffset(obj.toPort, -1) : [-distSpan * (x2 >= x1 ? 1 : -1), 0];
        const cp1x = x1 + ox1;
        const cp1y = y1 + oy1;
        const cp2x = x2 + ox2;
        const cp2y = y2 + oy2;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
        startAngle = Math.atan2(y1 - cp1y, x1 - cp1x);
        endAngle = Math.atan2(y2 - cp2y, x2 - cp2x);
        labelX = 0.125 * x1 + 0.375 * cp1x + 0.375 * cp2x + 0.125 * x2;
        labelY = 0.125 * y1 + 0.375 * cp1y + 0.375 * cp2y + 0.125 * y2;
      } else {
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      drawEndpointHead(ctx, obj.startHead, x1, y1, startAngle, obj.strokeWidth, obj.stroke);
      drawEndpointHead(ctx, obj.endHead, x2, y2, endAngle, obj.strokeWidth, obj.stroke);
      const labels = obj.labels?.length
        ? obj.labels
        : obj.label
          ? [{ id: 'primary', text: obj.label, position: obj.labelPosition ?? 0.5 }]
          : [];
      labels.forEach((item) => {
        const t = Math.max(0, Math.min(1, item.position ?? 0.5));
        const lx = labelX + (x2 - x1) * (t - 0.5);
        const ly = labelY + (y2 - y1) * (t - 0.5);
        ctx.font = '12px "DM Sans", sans-serif';
        const tw = ctx.measureText(item.text).width + 12;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(lx - tw / 2, ly - 11, tw, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text, lx, ly);
      });
      if (obj.relationshipLabel) {
        ctx.font = '10px "DM Sans", sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(obj.relationshipLabel, labelX, labelY + 13);
      }
      break;
    }

    case 'shape':
      drawShapeObject(ctx, obj);
      break;

    case 'text': {
      const rad = obj.borderRadius ?? 8;
      if (obj.bgColor && obj.bgColor !== 'transparent') {
        ctx.fillStyle = obj.bgColor;
        ctx.beginPath();
        ctx.roundRect(obj.x, obj.y, obj.width, obj.height, rad);
        ctx.fill();
      }
      if (obj.codeBlock) {
        ctx.save();
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.roundRect(obj.x, obj.y, obj.width, 34, rad);
        ctx.fill();
        ctx.fillStyle = '#FB7185';
        ctx.beginPath();
        ctx.arc(obj.x + 14, obj.y + 17, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.arc(obj.x + 26, obj.y + 17, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#34D399';
        ctx.beginPath();
        ctx.arc(obj.x + 38, obj.y + 17, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#CBD5E1';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText((obj.codeLanguage || 'typescript').toUpperCase(), obj.x + obj.width - 12, obj.y + 17);
        ctx.restore();
      }
      if (obj.borderColor && obj.borderWidth && obj.borderWidth > 0) {
        ctx.strokeStyle = obj.borderColor;
        ctx.lineWidth = obj.borderWidth;
        ctx.beginPath();
        ctx.roundRect(obj.x, obj.y, obj.width, obj.height, rad);
        ctx.stroke();
      }
      drawRichBlocksOnCanvas(ctx, obj);
      break;
    }

    case 'sticky': {
      const noteStyle = obj.noteStyle || 'classic';
      const noteBg = cbRemap(obj.noteColor || '#FEF08A') || obj.noteColor || '#FEF08A';
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;

      if (noteStyle === 'folded') {
        const fold = Math.min(24, obj.width * 0.14, obj.height * 0.18);
        ctx.fillStyle = noteBg;
        ctx.beginPath();
        ctx.moveTo(obj.x + 8, obj.y);
        ctx.lineTo(obj.x + obj.width - 8, obj.y);
        ctx.quadraticCurveTo(obj.x + obj.width, obj.y, obj.x + obj.width, obj.y + 8);
        ctx.lineTo(obj.x + obj.width, obj.y + obj.height - fold);
        ctx.lineTo(obj.x + obj.width - fold, obj.y + obj.height);
        ctx.lineTo(obj.x + 8, obj.y + obj.height);
        ctx.quadraticCurveTo(obj.x, obj.y + obj.height, obj.x, obj.y + obj.height - 8);
        ctx.lineTo(obj.x, obj.y + 8);
        ctx.quadraticCurveTo(obj.x, obj.y, obj.x + 8, obj.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Folded corner flap
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
        ctx.beginPath();
        ctx.moveTo(obj.x + obj.width - fold, obj.y + obj.height);
        ctx.lineTo(obj.x + obj.width - fold, obj.y + obj.height - fold);
        ctx.lineTo(obj.x + obj.width, obj.y + obj.height - fold);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (noteStyle === 'card') {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(obj.x, obj.y, obj.width, obj.height, 10);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(obj.x, obj.y, obj.width, obj.height, 10);
        ctx.stroke();
        // Top accent bar
        ctx.fillStyle = noteBg;
        ctx.beginPath();
        ctx.roundRect(obj.x, obj.y, obj.width, 8, [10, 10, 0, 0]);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = noteBg;
        ctx.beginPath();
        ctx.roundRect(obj.x, obj.y, obj.width, obj.height, 8);
        ctx.fill();
        ctx.restore();

        if (noteStyle === 'lined') {
          ctx.save();
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)';
          ctx.lineWidth = 1;
          const step = Math.max(18, (obj.fontSize || 15) * (obj.lineHeight || 1.38));
          for (let ly = obj.y + 12 + step; ly < obj.y + obj.height - 28; ly += step) {
            ctx.beginPath();
            ctx.moveTo(obj.x + 12, ly);
            ctx.lineTo(obj.x + obj.width - 12, ly);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      drawRichBlocksOnCanvas(ctx, obj);

      const isDarkNote = noteStyle !== 'card' && (noteBg.toLowerCase() === '#1e293b' || noteBg.toLowerCase() === '#0f172a');
      ctx.fillStyle = isDarkNote ? 'rgba(248, 250, 252, 0.6)' : 'rgba(15, 23, 42, 0.55)';
      ctx.font = '11px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(obj.author || 'Note', obj.x + 12, obj.y + obj.height - 10);
      const reactionEntries = Object.entries(obj.reactions || {}).filter(([, count]) => count > 0);
      if (reactionEntries.length > 0) {
        let rx = obj.x + obj.width - 10;
        const ry = obj.y + obj.height - 15;
        ctx.font = '11px "DM Sans", sans-serif';
        for (let i = reactionEntries.length - 1; i >= 0; i--) {
          const [emoji, count] = reactionEntries[i];
          const label = `${emoji} ${count}`;
          const badgeW = Math.ceil(ctx.measureText(label).width + 10);
          rx -= badgeW;
          if (rx < obj.x + 68) break;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.roundRect(rx, ry - 9, badgeW, 18, 9);
          ctx.fill();
          ctx.fillStyle = '#0F172A';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, rx + badgeW / 2, ry);
          rx -= 4;
        }
      }
      break;
    }

    case 'math': {
      ctx.fillStyle = obj.bgColor || '#FFFFFF';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(obj.x, obj.y, obj.width, obj.height, 8);
      ctx.fill();
      ctx.stroke();
      if (!options?.hideMathText) {
        ctx.fillStyle = obj.color || '#0F172A';
        ctx.font = `italic ${Math.min(22, obj.fontSize || 18)}px "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.latex, obj.x + obj.width / 2, obj.y + obj.height / 2, obj.width - 16);
      }
      break;
    }

    case 'graph':
      drawGraphPlot(ctx, obj);
      break;

    case 'image':
      drawImageObject(ctx, obj, onImageLoaded);
      break;

    case 'media': {
      ctx.fillStyle = '#F8FAFC';
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(obj.x, obj.y, obj.width, obj.height, 10);
      ctx.fill();
      ctx.stroke();

      const kindLabel = obj.mediaKind === 'video' ? 'VIDEO' : obj.mediaKind === 'audio' ? 'AUDIO' : obj.mediaKind === 'embed' ? 'EMBED' : 'FILE';
      const kindColor = obj.mediaKind === 'video' ? '#DC2626' : obj.mediaKind === 'audio' ? '#7C3AED' : obj.mediaKind === 'embed' ? '#0891B2' : '#2563EB';

      ctx.fillStyle = kindColor;
      ctx.font = 'bold 10px "DM Sans", sans-serif';
      ctx.fillText(kindLabel, obj.x + 14, obj.y + 20);
      ctx.fillStyle = '#0F172A';
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(obj.fileName || 'Media Item', obj.x + 14, obj.y + 38, obj.width - 28);

      if (obj.mediaKind === 'video' || obj.mediaKind === 'audio') {
        const cx = obj.x + obj.width / 2;
        const cy = obj.y + obj.height / 2 + 10;
        const r = Math.min(28, obj.width / 6, obj.height / 6);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.3, cy - r * 0.4);
        ctx.lineTo(cx - r * 0.3, cy + r * 0.4);
        ctx.lineTo(cx + r * 0.45, cy);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      if (obj.mediaKind === 'audio') {
        const barY = obj.y + obj.height - 30;
        ctx.fillStyle = '#94A3B8';
        for (let bx = obj.x + 16, idx = 0; bx < obj.x + obj.width - 16; bx += 7, idx++) {
          const bh = 6 + ((idx * 17) % 14);
          ctx.fillRect(bx, barY - bh / 2, 4, bh);
        }
      }

      if (obj.fileSize > 0) {
        const sizeStr = obj.fileSize > 1048576 ? `${(obj.fileSize / 1048576).toFixed(1)} MB` : `${(obj.fileSize / 1024).toFixed(0)} KB`;
        ctx.fillStyle = '#94A3B8';
        ctx.font = '11px "DM Sans", sans-serif';
        ctx.fillText(sizeStr, obj.x + 14, obj.y + obj.height - 10);
      }
      break;
    }

    case 'table':
      drawTableObject(ctx, obj);
      break;

    case 'chart':
      drawChartObject(ctx, obj);
      break;
  }

  ctx.restore();
}

export function computePageRenderBox(
  page: BoardPage,
  width = 1280,
  height = 720,
  onlyObjectIds?: Set<string>
): { minX: number; minY: number; contentW: number; contentH: number; scale: number } {
  const objs = onlyObjectIds ? page.objects.filter((o) => onlyObjectIds.has(o.id)) : page.objects;
  let minX = 0,
    minY = 0,
    maxX = width,
    maxY = height;
  if (objs.length > 0) {
    const byId = new Map(page.objects.map((o) => [o.id, o]));
    const bounds = computeSelectionBounds(objs, byId);
    minX = bounds.x - 40;
    minY = bounds.y - 40;
    maxX = bounds.x + bounds.width + 40;
    maxY = bounds.y + bounds.height + 40;
  }
  const contentW = Math.max(width, maxX - minX);
  const contentH = Math.max(height, maxY - minY);
  const scale = Math.min(2, Math.max(1, width / contentW));
  return { minX, minY, contentW, contentH, scale };
}

export function renderPageToContext(
  ctx: CanvasRenderingContext2D,
  page: BoardPage,
  canvasWidth: number,
  canvasHeight: number,
  onlyObjectIds?: Set<string>,
  options?: {
    hideMathText?: boolean;
    visibleIds?: Set<string>;
    transparentBg?: boolean;
    viewportBox?: { minX: number; minY: number; contentW: number; contentH: number; scale?: number };
    onImageLoaded?: () => void;
  }
) {
  const objs = onlyObjectIds ? page.objects.filter((o) => onlyObjectIds.has(o.id)) : page.objects;
  const computed = options?.viewportBox
    ? {
        minX: options.viewportBox.minX,
        minY: options.viewportBox.minY,
        contentW: options.viewportBox.contentW,
        contentH: options.viewportBox.contentH,
        scale: options.viewportBox.scale ?? 1,
      }
    : computePageRenderBox(page, canvasWidth, canvasHeight, onlyObjectIds);
  const { minX, minY, contentW, contentH, scale } = computed;
  ctx.save();
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!options?.transparentBg) {
    if (page.slideGradient?.from && page.slideGradient?.to) {
      const angle = ((page.slideGradient.angle ?? 135) * Math.PI) / 180;
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const half = Math.hypot(canvasWidth, canvasHeight) / 2;
      const grad = ctx.createLinearGradient(
        cx - Math.cos(angle) * half,
        cy - Math.sin(angle) * half,
        cx + Math.cos(angle) * half,
        cy + Math.sin(angle) * half
      );
      grad.addColorStop(0, page.slideGradient.from);
      grad.addColorStop(1, page.slideGradient.to);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = page.background || '#FFFFFF';
    }
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  ctx.scale(scale, scale);
  ctx.translate(-minX, -minY);
  if (!options?.transparentBg) {
    drawGridBackground(ctx, page.gridType, page.gridSize, page.background, minX, minY, minX + contentW, minY + contentH);
  }

  const byId = new Map(page.objects.map((o) => [o.id, o]));
  const sorted = [...objs].sort((a, b) => a.zIndex - b.zIndex);
  for (const obj of sorted) {
    drawBoardObject(ctx, obj, byId, options?.onImageLoaded, {
      hideMathText: options?.hideMathText,
      visibleIds: options?.visibleIds,
    });
  }
  ctx.restore();
}

export function renderPageToDataUrl(
  page: BoardPage,
  width = 1280,
  height = 720,
  format: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.95,
  onlyObjectIds?: Set<string>,
  options?: {
    hideMathText?: boolean;
    visibleIds?: Set<string>;
    transparentBg?: boolean;
    viewportBox?: { minX: number; minY: number; contentW: number; contentH: number; scale?: number };
  }
): string {
  const computed = options?.viewportBox
    ? {
        minX: options.viewportBox.minX,
        minY: options.viewportBox.minY,
        contentW: options.viewportBox.contentW,
        contentH: options.viewportBox.contentH,
        scale: options.viewportBox.scale ?? 1,
      }
    : computePageRenderBox(page, width, height, onlyObjectIds);
  const { contentW, contentH, scale } = computed;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(contentW * scale));
  canvas.height = Math.max(1, Math.round(contentH * scale));
  const ctx = canvas.getContext('2d')!;
  renderPageToContext(ctx, page, canvas.width, canvas.height, onlyObjectIds, {
    ...options,
    transparentBg: Boolean(options?.transparentBg && format === 'image/png'),
  });
  return canvas.toDataURL(format, quality);
}

export async function renderPageToHiResDataUrl(
  page: BoardPage,
  width = 1280,
  height = 720,
  format: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.95,
  options?: {
    onlyObjectIds?: Set<string>;
    scaleMultiplier?: number;
    transparentBg?: boolean;
    viewportBox?: { minX: number; minY: number; contentW: number; contentH: number; scale?: number };
  }
): Promise<string> {
  const objs = options?.onlyObjectIds ? page.objects.filter((o) => options.onlyObjectIds!.has(o.id)) : page.objects;
  // Preload all image objects before drawing
  await Promise.all(
    objs
      .filter((o): o is ImageObject => o.type === 'image' && Boolean(o.src))
      .map(
        (imgObj) =>
          new Promise<void>((resolve) => {
            if (getCachedImage(imgObj.src)) {
              resolve();
              return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              imageCache.set(imgObj.src, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = imgObj.src;
          })
      )
  );

  const base = options?.viewportBox
    ? { ...options.viewportBox, scale: options.viewportBox.scale ?? 1 }
    : computePageRenderBox(page, width, height, options?.onlyObjectIds);
  const scale = base.scale * (options?.scaleMultiplier ?? 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(base.contentW * scale));
  canvas.height = Math.max(1, Math.round(base.contentH * scale));
  const ctx = canvas.getContext('2d')!;
  if (!options?.transparentBg || format !== 'image/png') {
    if (page.slideGradient?.from && page.slideGradient?.to) {
      const angle = ((page.slideGradient.angle ?? 135) * Math.PI) / 180;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const half = Math.hypot(canvas.width, canvas.height) / 2;
      const grad = ctx.createLinearGradient(
        cx - Math.cos(angle) * half,
        cy - Math.sin(angle) * half,
        cx + Math.cos(angle) * half,
        cy + Math.sin(angle) * half
      );
      grad.addColorStop(0, page.slideGradient.from);
      grad.addColorStop(1, page.slideGradient.to);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = page.background || '#FFFFFF';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.scale(scale, scale);
  ctx.translate(-base.minX, -base.minY);
  if (!options?.transparentBg) {
    drawGridBackground(ctx, page.gridType, page.gridSize, page.background, base.minX, base.minY, base.minX + base.contentW, base.minY + base.contentH);
  }

  const byId = new Map(page.objects.map((o) => [o.id, o]));
  const sorted = [...objs].sort((a, b) => a.zIndex - b.zIndex);
  const mathObjs = sorted.filter((o) => o.type === 'math' && !o.hidden);

  for (const obj of sorted) {
    drawBoardObject(ctx, obj, byId, undefined, { hideMathText: obj.type === 'math' });
  }

  // Render crisp KaTeX math snapshots into canvas
  for (const m of mathObjs) {
    if (m.type !== 'math') continue;
    ctx.save();
    ctx.globalAlpha = m.opacity ?? 1;
    if (m.rotation) {
      const mcx = m.x + m.width / 2;
      const mcy = m.y + m.height / 2;
      ctx.translate(mcx, mcy);
      ctx.rotate((m.rotation * Math.PI) / 180);
      ctx.translate(-mcx, -mcy);
    }
    try {
      const html = katex.renderToString(m.latex || 'x', { throwOnError: false, displayMode: true });
      const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(40, Math.round(m.width))}" height="${Math.max(24, Math.round(m.height))}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${m.fontSize || 20}px;color:${m.color || '#0F172A'};font-family:KaTeX_Main,Times New Roman,serif;">${html}</div></foreignObject></svg>`;
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => resolve(null);
        el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
      });
      if (img) {
        ctx.drawImage(img, m.x, m.y, m.width, m.height);
      } else {
        ctx.fillStyle = m.color || '#0F172A';
        ctx.font = `italic ${Math.min(22, m.fontSize || 18)}px "Times New Roman", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.latex, m.x + m.width / 2, m.y + m.height / 2, m.width - 16);
      }
    } catch {
      ctx.fillStyle = m.color || '#0F172A';
      ctx.fillText(m.latex, m.x + m.width / 2, m.y + m.height / 2);
    }
    ctx.restore();
  }

  return canvas.toDataURL(format, quality);
}

export function exportPageToSVG(page: BoardPage, onlyObjectIds?: Set<string>): string {
  const objs = (onlyObjectIds ? page.objects.filter((o) => onlyObjectIds.has(o.id)) : page.objects)
    .filter((o) => !o.hidden)
    .sort((a, b) => a.zIndex - b.zIndex);
  const byId = new Map(page.objects.map((o) => [o.id, o]));
  const selBounds = objs.length ? computeSelectionBounds(objs, byId) : null;
  const minX = selBounds ? Math.min(0, selBounds.x) - 40 : 0;
  const minY = selBounds ? Math.min(0, selBounds.y) - 40 : 0;
  const maxX = selBounds ? Math.max(1200, selBounds.x + selBounds.width) + 40 : 1200;
  const maxY = selBounds ? Math.max(800, selBounds.y + selBounds.height) + 40 : 800;

  const esc = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const defs: string[] = [];
  const markerIds = new Map<string, string>();

  const ensureMarker = (head: 'arrow' | 'dot' | 'diamond', color: string, isStart: boolean): string => {
    if (!color) return '';
    const key = `${head}-${color}-${isStart ? 's' : 'e'}`;
    if (markerIds.has(key)) return markerIds.get(key)!;
    const id = `mk-${markerIds.size + 1}`;
    markerIds.set(key, id);
    if (head === 'arrow') {
      const refX = isStart ? 2 : 8;
      const d = isStart ? 'M 8 2 L 2 5 L 8 8 Z' : 'M 2 2 L 8 5 L 2 8 Z';
      defs.push(
        `<marker id="${id}" viewBox="0 0 10 10" refX="${refX}" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="${d}" fill="${esc(color)}"/></marker>`
      );
    } else if (head === 'dot') {
      defs.push(
        `<marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><circle cx="5" cy="5" r="3.5" fill="${esc(color)}"/></marker>`
      );
    } else {
      defs.push(
        `<marker id="${id}" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="7" markerHeight="7" orient="auto"><path d="M 6 1 L 11 6 L 6 11 L 1 6 Z" fill="${esc(color)}"/></marker>`
      );
    }
    return id;
  };

  const dashAttr = (lineStyle?: 'solid' | 'dashed' | 'dotted', sw = 2) => {
    if (lineStyle === 'dashed') return ` stroke-dasharray="${Math.max(6, sw * 2.5)} ${Math.max(4, sw * 2)}"`;
    if (lineStyle === 'dotted') return ` stroke-dasharray="2 ${Math.max(4, sw * 2)}"`;
    return '';
  };

  const wrapLinesSvg = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fontSize: number,
    fontFamily: string,
    fontWeight: string,
    fontStyle: string,
    color: string,
    align: 'left' | 'center' | 'right' | 'justify' = 'center',
    topAlign = false
  ): string => {
    if (!text) return '';
    const charsPerLine = Math.max(6, Math.floor((w - 20) / (fontSize * 0.54)));
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      const words = para.split(' ');
      let cur = '';
      for (const word of words) {
        const test = cur ? `${cur} ${word}` : word;
        if (test.length > charsPerLine && cur) {
          lines.push(cur);
          cur = word;
        } else {
          cur = test;
        }
      }
      lines.push(cur);
    }
    const lineH = fontSize * 1.35;
    const totalH = lines.length * lineH;
    const startY = topAlign ? y + 14 + fontSize * 0.85 : y + Math.max(fontSize, (h - totalH) / 2 + fontSize * 0.82);
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w - 12 : x + 12;
    const tspans = lines
      .map((l, idx) => `<tspan x="${tx.toFixed(1)}" y="${(startY + idx * lineH).toFixed(1)}">${esc(l)}</tspan>`)
      .join('');
    return `<text text-anchor="${anchor}" fill="${esc(color)}" font-family="${esc(fontFamily)}, system-ui, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}">${tspans}</text>`;
  };

  const shapeSvgPath = (obj: ShapeObject): string => {
    const { x, y, width: w, height: h, shapeKind } = obj;
    const cx = x + w / 2;
    const cy = y + h / 2;
    let fillVal = obj.fill || 'transparent';
    if (obj.fillGradient) {
      const gid = `grad-${defs.length + 1}`;
      const rad = ((obj.fillGradient.angle ?? 45) * Math.PI) / 180;
      const x1 = (50 - 50 * Math.cos(rad)).toFixed(1);
      const y1 = (50 - 50 * Math.sin(rad)).toFixed(1);
      const x2 = (50 + 50 * Math.cos(rad)).toFixed(1);
      const y2 = (50 + 50 * Math.sin(rad)).toFixed(1);
      defs.push(
        `<linearGradient id="${gid}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop offset="0%" stop-color="${esc(obj.fillGradient.from)}"/><stop offset="100%" stop-color="${esc(obj.fillGradient.to)}"/></linearGradient>`
      );
      fillVal = `url(#${gid})`;
    } else if (fillVal !== 'transparent' && obj.fillStyle && obj.fillStyle !== 'solid') {
      const pid = `pat-${defs.length + 1}`;
      if (obj.fillStyle === 'dots') {
        defs.push(
          `<pattern id="${pid}" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.5" fill="${esc(fillVal)}"/><circle cx="9" cy="9" r="1.5" fill="${esc(fillVal)}"/></pattern>`
        );
      } else if (obj.fillStyle === 'cross_hatch') {
        defs.push(
          `<pattern id="${pid}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0M0 0L10 10" stroke="${esc(fillVal)}" stroke-width="1.5"/></pattern>`
        );
      } else {
        defs.push(
          `<pattern id="${pid}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0" stroke="${esc(fillVal)}" stroke-width="1.5"/></pattern>`
        );
      }
      fillVal = `url(#${pid})`;
    }
    let filterAttr = '';
    if (obj.shadow) {
      const fid = 'lumina-shape-shadow';
      if (!defs.some((d) => d.includes(`id="${fid}"`))) {
        defs.push(
          `<filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#0F172A" flood-opacity="0.22"/></filter>`
        );
      }
      filterAttr = ` filter="url(#${fid})"`;
    }
  const common = `fill="${esc(fillVal)}" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth ?? 2}"${dashAttr(obj.lineStyle, obj.strokeWidth)}${filterAttr}`;
    const poly = (sides: number, offset = -Math.PI / 2) => {
      const pts: string[] = [];
      for (let i = 0; i < sides; i++) {
        const a = offset + (i * Math.PI * 2) / sides;
        pts.push(`${(cx + (w / 2) * Math.cos(a)).toFixed(1)},${(cy + (h / 2) * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(' ')}" ${common}/>`;
    };

    switch (shapeKind) {
      case 'custom': {
        if (!obj.customPath) return '';
        const [vx, vy, vw, vh] = obj.customPathViewBox || [0, 0, 100, 100];
        const paths = obj.booleanPaths?.length ? obj.booleanPaths : [{ d: obj.customPath, viewBox: [vx, vy, vw, vh] as [number, number, number, number] }];
        return paths.map((item) => {
          const [bx, by, bw, bh] = item.viewBox;
          return `<path d="${esc(item.d)}" transform="translate(${x} ${y}) scale(${w / Math.max(1, bw)} ${h / Math.max(1, bh)}) translate(${-bx} ${-by})" ${common}/>`;
        }).join('');
      }
      case 'rectangle':
      case 'square':
      case 'flow_process': {
        const r = Math.max(0, Math.min(obj.cornerRadius ?? 0, w / 2, h / 2));
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${r > 0 ? ` rx="${r}"` : ''} ${common}/>`;
      }
      case 'rounded_rect': {
        const r = Math.max(0, Math.min(obj.cornerRadius ?? 14, w / 2, h / 2));
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${common}/>`;
      }
      case 'frame': {
        const r = Math.max(0, Math.min(obj.cornerRadius ?? 10, w / 2, h / 2));
        const hy = y + Math.min(28, h * 0.25);
        return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${common}/><line x1="${x}" y1="${hy}" x2="${x + w}" y2="${hy}" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/></g>`;
      }
      case 'flow_terminator':
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" ${common}/>`;
      case 'circle':
      case 'ellipse':
        return `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" ${common}/>`;
      case 'ring':
        return `<g><ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" ${common}/><ellipse cx="${cx}" cy="${cy}" rx="${(w * 0.26).toFixed(1)}" ry="${(h * 0.26).toFixed(1)}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/></g>`;
      case 'semi_circle':
        return `<path d="M ${x} ${y + h} A ${w / 2} ${h} 0 0 1 ${x + w} ${y + h} Z" ${common}/>`;
      case 'triangle':
        return `<polygon points="${cx},${y} ${x + w},${y + h} ${x},${y + h}" ${common}/>`;
      case 'right_triangle':
        return `<polygon points="${x},${y} ${x + w},${y + h} ${x},${y + h}" ${common}/>`;
      case 'parallelogram': {
        const skew = Math.min(28, w * 0.22);
        return `<polygon points="${x + skew},${y} ${x + w},${y} ${x + w - skew},${y + h} ${x},${y + h}" ${common}/>`;
      }
      case 'trapezoid': {
        const inset = Math.min(28, w * 0.2);
        return `<polygon points="${x + inset},${y} ${x + w - inset},${y} ${x + w},${y + h} ${x},${y + h}" ${common}/>`;
      }
      case 'diamond':
      case 'flow_decision':
        return `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" ${common}/>`;
      case 'cross': {
        const ax = w * 0.34;
        const ay = h * 0.34;
        return `<polygon points="${x + ax},${y} ${x + w - ax},${y} ${x + w - ax},${y + ay} ${x + w},${y + ay} ${x + w},${y + h - ay} ${x + w - ax},${y + h - ay} ${x + w - ax},${y + h} ${x + ax},${y + h} ${x + ax},${y + h - ay} ${x},${y + h - ay} ${x},${y + ay} ${x + ax},${y + ay}" ${common}/>`;
      }
      case 'pentagon':
        return poly(5);
      case 'hexagon':
        return poly(6, 0);
      case 'polygon':
        if (obj.polygonVertices && obj.polygonVertices.length >= 3) {
          return `<polygon points="${obj.polygonVertices.map((v) => `${(x + (v.x / 100) * w).toFixed(1)},${(y + (v.y / 100) * h).toFixed(1)}`).join(' ')}" ${common}/>`;
        }
        return poly(Math.max(3, Math.min(12, obj.polygonSides || 8)));
      case 'star': {
        const spikes = Math.max(4, Math.min(12, obj.polygonSides || 5));
        const outerRx = w / 2;
        const outerRy = h / 2;
        const innerRx = outerRx * 0.44;
        const innerRy = outerRy * 0.44;
        const pts: string[] = [];
        for (let i = 0; i < spikes * 2; i++) {
          const rx = i % 2 === 0 ? outerRx : innerRx;
          const ry = i % 2 === 0 ? outerRy : innerRy;
          const a = -Math.PI / 2 + (i * Math.PI) / spikes;
          pts.push(`${(cx + rx * Math.cos(a)).toFixed(1)},${(cy + ry * Math.sin(a)).toFixed(1)}`);
        }
        return `<polygon points="${pts.join(' ')}" ${common}/>`;
      }
      case 'heart':
        return `<path d="M ${cx} ${y + h * 0.88} C ${x - w * 0.1} ${y + h * 0.55}, ${x + w * 0.05} ${y + h * 0.05}, ${cx} ${y + h * 0.3} C ${x + w * 0.95} ${y + h * 0.05}, ${x + w * 1.1} ${y + h * 0.55}, ${cx} ${y + h * 0.88} Z" ${common}/>`;
      case 'speech_bubble':
      case 'callout': {
        const bh = h * 0.8;
        const r = Math.max(0, Math.min(obj.cornerRadius ?? 12, w / 2, bh / 2));
        const tail =
          shapeKind === 'callout'
            ? `${x + w * 0.42},${y + bh - 1} ${cx},${y + h} ${x + w * 0.58},${y + bh - 1}`
            : `${x + w * 0.25},${y + bh - 1} ${x + w * 0.18},${y + h} ${x + w * 0.42},${y + bh - 1}`;
        return `<g><rect x="${x}" y="${y}" width="${w}" height="${bh}" rx="${r}" ${common}/><polygon points="${tail}" ${common}/></g>`;
      }
      case 'flow_data': {
        const skew = Math.min(24, w * 0.16);
        return `<polygon points="${x + skew},${y} ${x + w},${y} ${x + w - skew},${y + h} ${x},${y + h}" ${common}/>`;
      }
      case 'flow_database':
      case 'math_cylinder': {
        const ry = Math.min(18, h * 0.16);
        return `<g><path d="M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} L ${x + w} ${y + h - ry} A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z" ${common}/><ellipse cx="${cx}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/></g>`;
      }
      case 'flow_document':
        return `<path d="M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h * 0.85} Q ${x + w * 0.75} ${y + h * 0.7} ${cx} ${y + h * 0.88} Q ${x + w * 0.25} ${y + h * 1.04} ${x} ${y + h * 0.88} Z" ${common}/>`;
      case 'block_arrow_right':
        return `<polygon points="${x},${y + h * 0.28} ${x + w * 0.65},${y + h * 0.28} ${x + w * 0.65},${y} ${x + w},${cy} ${x + w * 0.65},${y + h} ${x + w * 0.65},${y + h * 0.72} ${x},${y + h * 0.72}" ${common}/>`;
      case 'block_arrow_left':
        return `<polygon points="${x + w},${y + h * 0.28} ${x + w * 0.35},${y + h * 0.28} ${x + w * 0.35},${y} ${x},${cy} ${x + w * 0.35},${y + h} ${x + w * 0.35},${y + h * 0.72} ${x + w},${y + h * 0.72}" ${common}/>`;
      case 'block_arrow_up':
        return `<polygon points="${x + w * 0.28},${y + h} ${x + w * 0.28},${y + h * 0.35} ${x},${y + h * 0.35} ${cx},${y} ${x + w},${y + h * 0.35} ${x + w * 0.72},${y + h * 0.35} ${x + w * 0.72},${y + h}" ${common}/>`;
      case 'block_arrow_down':
        return `<polygon points="${x + w * 0.28},${y} ${x + w * 0.28},${y + h * 0.65} ${x},${y + h * 0.65} ${cx},${y + h} ${x + w},${y + h * 0.65} ${x + w * 0.72},${y + h * 0.65} ${x + w * 0.72},${y}" ${common}/>`;
      case 'bracket_left':
        return `<path d="M ${x + w * 0.8} ${y} Q ${x + w * 0.2} ${y} ${x + w * 0.35} ${cy} Q ${x + w * 0.2} ${y + h} ${x + w * 0.8} ${y + h}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/>`;
      case 'bracket_right':
        return `<path d="M ${x + w * 0.2} ${y} Q ${x + w * 0.8} ${y} ${x + w * 0.65} ${cy} Q ${x + w * 0.8} ${y + h} ${x + w * 0.2} ${y + h}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/>`;
      case 'math_axes':
        return `<path d="M ${cx} ${y} L ${cx} ${y + h} M ${x} ${cy} L ${x + w} ${cy}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/>`;
      case 'math_cube': {
        const d = Math.min(w, h) * 0.25;
        return `<g><rect x="${x}" y="${y + d}" width="${w - d}" height="${h - d}" ${common}/><path d="M ${x} ${y + d} L ${x + d} ${y} L ${x + w} ${y} L ${x + w} ${y + h - d} L ${x + w - d} ${y + h} M ${x + w - d} ${y + d} L ${x + w} ${y}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/></g>`;
      }
      case 'math_cone': {
        const ry = Math.min(16, h * 0.16);
        return `<g><ellipse cx="${cx}" cy="${y + h - ry}" rx="${w / 2}" ry="${ry}" ${common}/><path d="M ${cx} ${y} L ${x + w} ${y + h - ry} M ${cx} ${y} L ${x} ${y + h - ry}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/></g>`;
      }
      case 'circuit_resistor': {
        const pts: string[] = [`M ${x} ${cy}`, `L ${x + w * 0.2} ${cy}`];
        const zigW = w * 0.6;
        for (let i = 0; i <= 5; i++) {
          const px = x + w * 0.2 + (zigW * i) / 5;
          const py = i === 0 || i === 5 ? cy : i % 2 === 1 ? y + h * 0.2 : y + h * 0.8;
          pts.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`);
        }
        pts.push(`L ${x + w} ${cy}`);
        return `<path d="${pts.join(' ')}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/>`;
      }
      case 'circuit_capacitor':
        return `<path d="M ${x} ${cy} L ${x + w * 0.42} ${cy} M ${x + w * 0.42} ${y + h * 0.15} L ${x + w * 0.42} ${y + h * 0.85} M ${x + w * 0.58} ${y + h * 0.15} L ${x + w * 0.58} ${y + h * 0.85} M ${x + w * 0.58} ${cy} L ${x + w} ${cy}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/>`;
      case 'circuit_battery':
        return `<path d="M ${x} ${cy} L ${x + w * 0.42} ${cy} M ${x + w * 0.42} ${y + h * 0.12} L ${x + w * 0.42} ${y + h * 0.88} M ${x + w * 0.58} ${y + h * 0.3} L ${x + w * 0.58} ${y + h * 0.7} M ${x + w * 0.58} ${cy} L ${x + w} ${cy}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/>`;
      case 'circuit_ground':
        return `<path d="M ${cx} ${y} L ${cx} ${cy} M ${x + w * 0.18} ${cy} L ${x + w * 0.82} ${cy} M ${x + w * 0.3} ${cy + h * 0.2} L ${x + w * 0.7} ${cy + h * 0.2} M ${x + w * 0.42} ${cy + h * 0.4} L ${x + w * 0.58} ${cy + h * 0.4}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/>`;
      case 'circuit_switch':
        return `<path d="M ${x} ${cy} L ${x + w * 0.3} ${cy} L ${x + w * 0.7} ${y + h * 0.2} M ${x + w * 0.7} ${cy} L ${x + w} ${cy}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/>`;
      case 'circuit_led': {
        const r = Math.min(w, h) * 0.35;
        return `<g><circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" ${common}/><path d="M ${x} ${cy} L ${(cx - r).toFixed(1)} ${cy} M ${(cx + r).toFixed(1)} ${cy} L ${x + w} ${cy}" fill="none" stroke="${esc(obj.stroke || '#0F172A')}" stroke-width="${obj.strokeWidth || 2}"/></g>`;
      }
      default:
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ${common}/>`;
    }
  };

  const wrapTransform = (obj: BoardObject, inner: string, includeFlip = false, opacityOverride?: number): string => {
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.height / 2;
    const ops: string[] = [];
    if (obj.rotation) ops.push(`rotate(${obj.rotation} ${cx} ${cy})`);
    if (includeFlip && (obj.flipX || obj.flipY)) {
      ops.push(`translate(${cx} ${cy}) scale(${obj.flipX ? -1 : 1} ${obj.flipY ? -1 : 1}) translate(${-cx} ${-cy})`);
    }
    const tAttr = ops.length > 0 ? ` transform="${ops.join(' ')}"` : '';
    return `<g opacity="${opacityOverride ?? obj.opacity ?? 1}"${tAttr}>${inner}</g>`;
  };

  const elements = objs.map((obj) => {
    if (obj.type === 'stroke') {
      const op = obj.brushKind === 'highlighter' ? Math.min(obj.opacity, 0.36) : obj.brushKind === 'marker' ? Math.min(obj.opacity, 0.72) : obj.brushKind === 'pencil' ? Math.min(obj.opacity, 0.78) : obj.opacity;
      if (obj.brushKind === 'calligraphy' && obj.points.length >= 2) {
        const nibAngle = -Math.PI / 5;
        const leftPts: string[] = [];
        const rightPts: string[] = [];
        for (let i = 0; i < obj.points.length; i++) {
          const prev = obj.points[Math.max(0, i - 1)];
          const next = obj.points[Math.min(obj.points.length - 1, i + 1)];
          const segAngle = Math.atan2(next.y - prev.y, next.x - prev.x);
          const nibRatio = 0.28 + 0.72 * Math.abs(Math.sin(segAngle - nibAngle));
          const halfW = Math.max(0.8, obj.strokeWidth * 0.55 * nibRatio);
          const nx = Math.cos(nibAngle + Math.PI / 2) * halfW;
          const ny = Math.sin(nibAngle + Math.PI / 2) * halfW;
          leftPts.push(`${(obj.points[i].x + nx).toFixed(1)},${(obj.points[i].y + ny).toFixed(1)}`);
          rightPts.unshift(`${(obj.points[i].x - nx).toFixed(1)},${(obj.points[i].y - ny).toFixed(1)}`);
        }
        return wrapTransform(obj, `<polygon points="${[...leftPts, ...rightPts].join(' ')}" fill="${esc(obj.stroke)}"/>`, true, op);
      }
      const d = obj.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const dash = obj.brushKind === 'dashed_ink' ? dashAttr('dashed', obj.strokeWidth) : dashAttr(obj.lineStyle, obj.strokeWidth);
      return wrapTransform(
        obj,
        `<path d="${d}" fill="none" stroke="${esc(obj.stroke)}" stroke-width="${obj.strokeWidth}" stroke-linecap="${obj.brushKind === 'marker' ? 'square' : 'round'}" stroke-linejoin="round"${dash}/>`,
        true,
        op
      );
    }
    if (obj.type === 'line') {
      const pts = obj.points;
      if (pts.length < 2) return '';
      let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      if (obj.curved && pts.length === 2) {
        const mx = obj.cpX ?? (pts[0].x + pts[1].x) / 2;
        const my = obj.cpY ?? (pts[0].y + pts[1].y) / 2 - 48;
        d += ` Q${mx.toFixed(1)},${my.toFixed(1)} ${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
      } else {
        d += ' ' + pts.slice(1).map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      }
      const sm = obj.startHead !== 'none' ? ` marker-start="url(#${ensureMarker(obj.startHead, obj.stroke, true)})"` : '';
      const em = obj.endHead !== 'none' ? ` marker-end="url(#${ensureMarker(obj.endHead, obj.stroke, false)})"` : '';
      return wrapTransform(
        obj,
        `<path d="${d}" fill="none" stroke="${esc(obj.stroke)}" stroke-width="${obj.strokeWidth}" stroke-linecap="round"${dashAttr(obj.lineStyle, obj.strokeWidth)}${sm}${em}/>`,
        true
      );
    }
    if (obj.type === 'connector') {
      const { x1, y1, x2, y2 } = resolveConnectorEndpoints(obj, byId);
      let d = `M${x1.toFixed(1)},${y1.toFixed(1)}`;
      let lx = (x1 + x2) / 2;
      let ly = (y1 + y2) / 2;
      if (obj.waypoints && obj.waypoints.length > 0) {
        d += ' ' + [...obj.waypoints, { x: x2, y: y2 }].map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const midPt = obj.waypoints[Math.floor(obj.waypoints.length / 2)];
        lx = midPt.x;
        ly = midPt.y;
      } else if (obj.routeType === 'orthogonal') {
        const mx = (x1 + x2) / 2;
        d += ` L${mx.toFixed(1)},${y1.toFixed(1)} L${mx.toFixed(1)},${y2.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
        lx = mx;
      } else if (obj.routeType === 'curved') {
        const distSpan = Math.max(48, Math.hypot(x2 - x1, y2 - y1) * 0.42);
        const portOff = (side: ConnectorObject['fromPort'], sign: number): [number, number] =>
          side === 'left' ? [-distSpan, 0] : side === 'right' ? [distSpan, 0] : side === 'top' ? [0, -distSpan] : side === 'bottom' ? [0, distSpan] : [sign * distSpan, 0];
        const [ox1, oy1] = obj.fromId ? portOff(obj.fromPort, 1) : [distSpan * (x2 >= x1 ? 1 : -1), 0];
        const [ox2, oy2] = obj.toId ? portOff(obj.toPort, -1) : [-distSpan * (x2 >= x1 ? 1 : -1), 0];
        const cp1x = x1 + ox1;
        const cp1y = y1 + oy1;
        const cp2x = x2 + ox2;
        const cp2y = y2 + oy2;
        d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
        lx = 0.125 * x1 + 0.375 * cp1x + 0.375 * cp2x + 0.125 * x2;
        ly = 0.125 * y1 + 0.375 * cp1y + 0.375 * cp2y + 0.125 * y2;
      } else {
        d += ` L${x2.toFixed(1)},${y2.toFixed(1)}`;
      }
      const sm = obj.startHead !== 'none' ? ` marker-start="url(#${ensureMarker(obj.startHead, obj.stroke, true)})"` : '';
      const em = obj.endHead !== 'none' ? ` marker-end="url(#${ensureMarker(obj.endHead, obj.stroke, false)})"` : '';
      const labelTag = obj.label
        ? `<rect x="${lx - obj.label.length * 4 - 8}" y="${ly - 11}" width="${obj.label.length * 8 + 16}" height="22" rx="6" fill="#FFFFFF" stroke="#E2E8F0"/><text x="${lx}" y="${ly + 4}" text-anchor="middle" fill="#334155" font-size="12" font-family="DM Sans, sans-serif">${esc(obj.label)}</text>`
        : '';
      return wrapTransform(
        obj,
        `<path d="${d}" fill="none" stroke="${esc(obj.stroke)}" stroke-width="${obj.strokeWidth}"${dashAttr(obj.lineStyle, obj.strokeWidth)}${sm}${em}/>${labelTag}`
      );
    }
    if (obj.type === 'shape') {
      const rawShapeTag = shapeSvgPath(obj);
      const scx = obj.x + obj.width / 2;
      const scy = obj.y + obj.height / 2;
      const shapeTag =
        obj.flipX || obj.flipY
          ? `<g transform="translate(${scx} ${scy}) scale(${obj.flipX ? -1 : 1} ${obj.flipY ? -1 : 1}) translate(${-scx} ${-scy})">${rawShapeTag}</g>`
          : rawShapeTag;
      const textTag = wrapLinesSvg(
        obj.text,
        obj.x,
        obj.y,
        obj.width,
        obj.height,
        obj.fontSize || 14,
        obj.fontFamily || 'Plus Jakarta Sans',
        obj.fontWeight || 'normal',
        obj.fontStyle || 'normal',
        obj.textColor || '#0F172A',
        obj.textAlign || 'center',
        obj.shapeKind === 'frame' || obj.verticalAlign === 'top'
      );
      return wrapTransform(obj, `${shapeTag}${textTag}`, false);
    }
    if (obj.type === 'sticky') {
      const noteBg = obj.noteColor || '#FEF08A';
      const isCard = obj.noteStyle === 'card';
      let rect = `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="10" fill="${esc(noteBg)}"/>`;
      if (isCard) {
        rect = `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="10" fill="#FFFFFF" stroke="#E2E8F0"/><rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="8" rx="4" fill="${esc(noteBg)}"/>`;
      } else if (obj.noteStyle === 'folded') {
        const fold = Math.min(24, obj.width * 0.14, obj.height * 0.18);
        rect = `<polygon points="${obj.x},${obj.y} ${obj.x + obj.width},${obj.y} ${obj.x + obj.width},${obj.y + obj.height - fold} ${obj.x + obj.width - fold},${obj.y + obj.height} ${obj.x},${obj.y + obj.height}" fill="${esc(noteBg)}"/><polygon points="${obj.x + obj.width - fold},${obj.y + obj.height} ${obj.x + obj.width - fold},${obj.y + obj.height - fold} ${obj.x + obj.width},${obj.y + obj.height - fold}" fill="rgba(15,23,42,0.14)"/>`;
      }
      const textTag = wrapLinesSvg(
        obj.text,
        obj.x,
        obj.y + (isCard ? 6 : 0),
        obj.width,
        obj.height - 28,
        obj.fontSize || 15,
        obj.fontFamily || 'DM Sans',
        obj.fontWeight || 'normal',
        obj.fontStyle || 'normal',
        obj.textColor || '#1E293B',
        obj.textAlign || 'left',
        true
      );
      const authorTag = obj.author
        ? `<text x="${obj.x + 12}" y="${obj.y + obj.height - 10}" fill="#475569" font-size="11" font-family="DM Sans, sans-serif">${esc(obj.author)}</text>`
        : '';
      return wrapTransform(obj, `${rect}${textTag}${authorTag}`);
    }
    if (obj.type === 'text') {
      const bg =
        obj.bgColor && obj.bgColor !== 'transparent'
          ? `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="${obj.borderRadius ?? 8}" fill="${esc(obj.bgColor)}"${obj.borderColor ? ` stroke="${esc(obj.borderColor)}" stroke-width="${obj.borderWidth || 1}"` : ''}/>`
          : '';
      const codeHeader = obj.codeBlock
        ? `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="34" rx="${obj.borderRadius ?? 8}" fill="#1E293B"/><circle cx="${obj.x + 14}" cy="${obj.y + 17}" r="3.5" fill="#FB7185"/><circle cx="${obj.x + 26}" cy="${obj.y + 17}" r="3.5" fill="#FBBF24"/><circle cx="${obj.x + 38}" cy="${obj.y + 17}" r="3.5" fill="#34D399"/><text x="${obj.x + obj.width - 12}" y="${obj.y + 20}" text-anchor="end" fill="#CBD5E1" font-family="JetBrains Mono, monospace" font-size="10">${esc((obj.codeLanguage || 'typescript').toUpperCase())}</text>`
        : '';
      const textTag = wrapLinesSvg(
        obj.text,
        obj.x,
        obj.y + (obj.codeBlock ? 34 : 0),
        obj.width,
        obj.height - (obj.codeBlock ? 34 : 0),
        obj.fontSize || 18,
        obj.codeBlock ? 'JetBrains Mono' : obj.fontFamily || 'Plus Jakarta Sans',
        obj.fontWeight || 'normal',
        obj.fontStyle || 'normal',
        obj.textColor || '#0F172A',
        obj.textAlign || 'left',
        true
      );
      return wrapTransform(obj, `${bg}${codeHeader}${textTag}`);
    }
    if (obj.type === 'image') {
      let clipAttr = '';
      if (obj.mask && obj.mask !== 'none') {
        const cid = `clip-${defs.length + 1}`;
        if (obj.mask === 'circle') {
          defs.push(`<clipPath id="${cid}"><ellipse cx="${obj.x + obj.width / 2}" cy="${obj.y + obj.height / 2}" rx="${obj.width / 2}" ry="${obj.height / 2}"/></clipPath>`);
        } else if (obj.mask === 'rounded') {
          defs.push(`<clipPath id="${cid}"><rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="14"/></clipPath>`);
        } else if (obj.mask === 'hex') {
          const hcx = obj.x + obj.width / 2, hcy = obj.y + obj.height / 2;
          const pts = Array.from({ length: 6 }, (_, i) => `${(hcx + (obj.width / 2) * Math.cos((i * Math.PI) / 3)).toFixed(1)},${(hcy + (obj.height / 2) * Math.sin((i * Math.PI) / 3)).toFixed(1)}`).join(' ');
          defs.push(`<clipPath id="${cid}"><polygon points="${pts}"/></clipPath>`);
        } else if (obj.mask === 'star') {
          const scx = obj.x + obj.width / 2, scy = obj.y + obj.height / 2;
          const outer = Math.min(obj.width, obj.height) / 2, inner = outer * 0.45;
          const pts = Array.from({ length: 10 }, (_, i) => {
            const r = i % 2 === 0 ? outer : inner;
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            return `${(scx + r * Math.cos(a)).toFixed(1)},${(scy + r * Math.sin(a)).toFixed(1)}`;
          }).join(' ');
          defs.push(`<clipPath id="${cid}"><polygon points="${pts}"/></clipPath>`);
        }
        clipAttr = ` clip-path="url(#${cid})"`;
      }
      const styleFilter = obj.filters
        ? ` style="filter: brightness(${obj.filters.brightness}%) contrast(${obj.filters.contrast}%) grayscale(${obj.filters.grayscale}%) sepia(${obj.filters.sepia}%) blur(${obj.filters.blur}px);"`
        : '';
      return wrapTransform(
        obj,
        `<image href="${esc(obj.src)}" x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" preserveAspectRatio="none"${clipAttr}${styleFilter}/>`
      );
    }
    if (obj.type === 'table') {
      const rCount = Math.max(1, obj.rows);
      const cCount = Math.max(1, obj.cols);
      const { colXs, colWs, rowYs, rowHs } = getTableColumnBounds(obj);
      const border = obj.borderColor || '#CBD5E1';
      let out = `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" fill="#FFFFFF" stroke="${esc(border)}"/>`;
      out += `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${rowHs[0]}" fill="${esc(obj.headerBg || '#1E293B')}"/>`;
      for (let r = 1; r < rCount; r++) {
        out += `<line x1="${obj.x}" y1="${rowYs[r].toFixed(1)}" x2="${obj.x + obj.width}" y2="${rowYs[r].toFixed(1)}" stroke="${esc(border)}"/>`;
      }
      for (let c = 1; c < cCount; c++) {
        out += `<line x1="${colXs[c].toFixed(1)}" y1="${obj.y}" x2="${colXs[c].toFixed(1)}" y2="${obj.y + obj.height}" stroke="${esc(border)}"/>`;
      }
      for (let r = 0; r < rCount; r++) {
        for (let c = 0; c < cCount; c++) {
          const raw = obj.cells?.[r]?.[c] || '';
          if (!raw) continue;
          const val = raw.startsWith('=') ? evaluateTableCell(raw, obj.cells) : raw;
          out += `<text x="${(colXs[c] + 8).toFixed(1)}" y="${(rowYs[r] + rowHs[r] / 2 + 4).toFixed(1)}" fill="${r === 0 ? '#FFFFFF' : esc(obj.textColor || '#0F172A')}" font-size="12" font-family="DM Sans, sans-serif">${esc(val)}</text>`;
        }
      }
      return wrapTransform(obj, out);
    }
    if (obj.type === 'chart') {
      const { x, y, width: w, height: h, chartType, title, labels, values, colors } = obj;
      const padX = chartType === 'horizontalBar' ? 68 : 42,
        padTop = 44,
        padBottom = 34;
      const plotW = Math.max(40, w - padX - 24);
      const plotH = Math.max(40, h - padTop - padBottom);
      const safeValues = values.map((v) => (Number.isFinite(v) ? v : 0));
      const posMaxVal = Math.max(1e-6, ...safeValues.map((v) => Math.max(0, v)));
      const minVal = Math.min(0, ...safeValues);
      const maxVal = Math.max(0, ...safeValues);
      const valSpan = Math.max(1e-6, maxVal - minVal);
      const zeroY = y + padTop + (maxVal / valSpan) * plotH;
      const zeroX = x + padX + (-minVal / valSpan) * plotW;

      let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>`;
      out += `<text x="${x + 16}" y="${y + 24}" fill="#0F172A" font-size="14" font-weight="bold" font-family="Plus Jakarta Sans, sans-serif">${esc(title || 'Chart')}</text>`;
      if (chartType === 'line' || chartType === 'area') {
        const pts = safeValues.map((v, i) => {
          const px = x + padX + (safeValues.length > 1 ? (i * plotW) / (safeValues.length - 1) : plotW / 2);
          const py = y + padTop + ((maxVal - v) / valSpan) * plotH;
          return `${px.toFixed(1)},${py.toFixed(1)}`;
        });
        out += `<line x1="${(x + padX).toFixed(1)}" y1="${zeroY.toFixed(1)}" x2="${(x + padX + plotW).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#E2E8F0"/>`;
        if (chartType === 'area' && pts.length > 0) {
          out += `<polygon points="${(x + padX).toFixed(1)},${zeroY.toFixed(1)} ${pts.join(' ')} ${(x + padX + plotW).toFixed(1)},${zeroY.toFixed(1)}" fill="${esc(colors[0] || '#2563EB')}" fill-opacity="0.18"/>`;
        }
        out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${esc(colors[0] || '#2563EB')}" stroke-width="2.5"/>`;
      } else if (chartType === 'pie' || chartType === 'doughnut') {
        const total = Math.max(1e-6, safeValues.reduce((a, b) => a + Math.max(0, b), 0));
        const cx = x + w / 2,
          cy = y + padTop + plotH / 2,
          r = Math.min(plotW, plotH) * 0.42;
        let angle = -Math.PI / 2;
        safeValues.forEach((v, i) => {
          const slice = (Math.max(0, v) / total) * Math.PI * 2;
          const x1 = cx + r * Math.cos(angle);
          const y1 = cy + r * Math.sin(angle);
          const x2 = cx + r * Math.cos(angle + slice);
          const y2 = cy + r * Math.sin(angle + slice);
          out += `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${slice > Math.PI ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${esc(colors[i % colors.length] || '#2563EB')}"/>`;
          angle += slice;
        });
        if (chartType === 'doughnut') {
          out += `<circle cx="${cx}" cy="${cy}" r="${(r * 0.52).toFixed(1)}" fill="#FFFFFF"/>`;
        }
      } else if (chartType === 'horizontalBar') {
        const slotH = plotH / Math.max(1, safeValues.length);
        const bh = Math.max(10, slotH - 10);
        out += `<line x1="${zeroX.toFixed(1)}" y1="${y + padTop}" x2="${zeroX.toFixed(1)}" y2="${y + padTop + plotH}" stroke="#E2E8F0"/>`;
        safeValues.forEach((v, i) => {
          const bw = (Math.abs(v) / valSpan) * plotW;
          const bx = v >= 0 ? zeroX : zeroX - bw;
          const by = y + padTop + i * slotH + 4;
          out += `<text x="${x + padX - 8}" y="${by + bh / 2 + 4}" text-anchor="end" fill="#475569" font-size="11">${esc((labels[i] || '').slice(0, 9))}</text>`;
          out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${Math.max(2, bw).toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${esc(colors[i % colors.length] || '#2563EB')}"/>`;
        });
      } else if (chartType === 'scatter') {
        out += `<line x1="${(x + padX).toFixed(1)}" y1="${zeroY.toFixed(1)}" x2="${(x + padX + plotW).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#E2E8F0"/>`;
        safeValues.forEach((v, i) => {
          const px = x + padX + (safeValues.length > 1 ? (i * plotW) / (safeValues.length - 1) : plotW / 2);
          const py = y + padTop + ((maxVal - v) / valSpan) * plotH;
          out += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5" fill="${esc(colors[i % colors.length] || '#2563EB')}"/>`;
        });
      } else if (chartType === 'radar') {
        const count = Math.max(3, safeValues.length);
        const cx = x + w / 2, cy = y + padTop + plotH / 2, r = Math.min(plotW, plotH) * 0.39;
        const pts = Array.from({ length: count }, (_, i) => {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / count;
          const rr = (Math.max(0, safeValues[i] ?? 0) / posMaxVal) * r;
          return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
        }).join(' ');
        out += `<polygon points="${pts}" fill="${esc(colors[0] || '#2563EB')}" fill-opacity="0.2" stroke="${esc(colors[0] || '#2563EB')}" stroke-width="2"/>`;
      } else {
        out += `<line x1="${(x + padX).toFixed(1)}" y1="${zeroY.toFixed(1)}" x2="${(x + padX + plotW).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#E2E8F0"/>`;
        const bw = Math.max(12, plotW / Math.max(1, safeValues.length) - 12);
        safeValues.forEach((v, i) => {
          const bh = (Math.abs(v) / valSpan) * plotH;
          const bx = x + padX + i * (plotW / Math.max(1, safeValues.length)) + 6;
          const by = v >= 0 ? zeroY - bh : zeroY;
          out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" fill="${esc(colors[i % colors.length] || '#2563EB')}"/>`;
          out += `<text x="${(bx + bw / 2).toFixed(1)}" y="${y + padTop + plotH + 16}" text-anchor="middle" fill="#475569" font-size="11">${esc((labels[i] || '').slice(0, 8))}</text>`;
        });
      }
      return wrapTransform(obj, out);
    }
    if (obj.type === 'graph') {
      const { x, y, width: w, height: h, expressions, xMin, xMax, yMin, yMax, title } = obj;
      const sXMin = Number.isFinite(xMin) ? xMin : -10;
      const sXMax = Number.isFinite(xMax) && xMax > sXMin ? xMax : sXMin + 0.5;
      const sYMin = Number.isFinite(yMin) ? yMin : -6;
      const sYMax = Number.isFinite(yMax) && yMax > sYMin ? yMax : sYMin + 0.5;
      const spanX = sXMax - sXMin;
      const spanY = sYMax - sYMin;
      const pad = 28;
      const pw = Math.max(40, w - pad * 2);
      const ph = Math.max(40, h - pad * 2);
      const ox = x + pad;
      const oy = y + pad;
      const sxFn = (gx: number) => ox + ((gx - sXMin) / spanX) * pw;
      const syFn = (gy: number) => oy + ph - ((gy - sYMin) / spanY) * ph;
      const axX = Math.max(ox, Math.min(ox + pw, sxFn(0)));
      const axY = Math.max(oy, Math.min(oy + ph, syFn(0)));
      let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>`;
      out += `<line x1="${ox}" y1="${axY}" x2="${ox + pw}" y2="${axY}" stroke="#64748B" stroke-width="1.5"/>`;
      out += `<line x1="${axX}" y1="${oy}" x2="${axX}" y2="${oy + ph}" stroke="#64748B" stroke-width="1.5"/>`;
      for (const item of expressions) {
        if (!item.visible || !item.expr.trim()) continue;
        try {
          const compiled = compile(item.expr);
          let d = '';
          let started = false;
          let prevGy: number | null = null;
          for (let i = 0; i <= 150; i++) {
            const gx = sXMin + (i / 150) * spanX;
            const gy = Number(compiled.evaluate({ x: gx, a: obj.params?.a ?? 1, b: obj.params?.b ?? 0, k: obj.params?.k ?? 1 }));
            const jump = prevGy !== null && Math.abs(gy - prevGy) > spanY * 1.4;
            if (!Number.isFinite(gy) || gy < sYMin - spanY * 2 || gy > sYMax + spanY * 2 || jump) {
              started = false;
              prevGy = Number.isFinite(gy) ? gy : null;
              continue;
            }
            prevGy = gy;
            const px = sxFn(gx);
            const py = syFn(gy);
            d += `${started ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)} `;
            started = true;
          }
          if (d) out += `<path d="${d}" fill="none" stroke="${esc(item.color || '#2563EB')}" stroke-width="2.2"/>`;
        } catch {
          // ignore invalid expression during SVG export
        }
      }
      if (title) out += `<text x="${x + 12}" y="${y + 18}" fill="#0F172A" font-size="12" font-weight="bold">${esc(title)}</text>`;
      return wrapTransform(obj, out);
    }
    if (obj.type === 'math') {
      return wrapTransform(
        obj,
        `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="8" fill="${esc(obj.bgColor || '#FFFFFF')}" stroke="#CBD5E1"/><text x="${obj.x + obj.width / 2}" y="${obj.y + obj.height / 2 + 5}" text-anchor="middle" fill="${esc(obj.color || '#0F172A')}" font-family="Times New Roman, serif" font-style="italic" font-size="${Math.min(22, obj.fontSize || 18)}">${esc(obj.latex)}</text>`
      );
    }
    return wrapTransform(
      obj,
      `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" rx="8" fill="#F8FAFC" stroke="#CBD5E1"/>`
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}">
  <defs>${defs.join('\n    ')}</defs>
  <rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="${esc(page.background || '#FFFFFF')}"/>
  ${elements.join('\n  ')}
</svg>`;
}

export async function exportPageToSelfContainedSVG(page: BoardPage, onlyObjectIds?: Set<string>): Promise<string> {
  const cloned: BoardPage = {
    ...page,
    objects: await Promise.all(
      page.objects.map(async (o) => {
        if (o.type !== 'image' || !o.src || o.src.startsWith('data:')) return o;
        try {
          const resp = await fetch(resourceUrl(o.src));
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || o.src));
            reader.onerror = () => resolve(o.src);
            reader.readAsDataURL(blob);
          });
          return { ...o, src: dataUrl };
        } catch {
          return o;
        }
      })
    ),
  };
  return exportPageToSVG(cloned, onlyObjectIds);
}
