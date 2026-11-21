import type { RichBlock, RichRun, StickyObject, TextAlignMode, TextObject } from '../types/smartboard';

export type FontPreset = {
  id: string;
  label: string;
  family: string;
  category: 'hand' | 'sans' | 'mono' | 'serif';
  badge: string;
};

export const FONT_PRESETS: FontPreset[] = [
  { id: 'excalifont', label: 'Caveat (Hand)', family: 'Caveat', category: 'hand', badge: '✏️' },
  { id: 'kalam', label: 'Kalam (Sketch)', family: 'Kalam', category: 'hand', badge: '✒️' },
  { id: 'jakarta', label: 'Plus Jakarta Sans', family: 'Plus Jakarta Sans', category: 'sans', badge: 'Aa' },
  { id: 'inter', label: 'Inter Clean', family: 'Inter', category: 'sans', badge: 'Aa' },
  { id: 'dmsans', label: 'DM Sans', family: 'DM Sans', category: 'sans', badge: 'Aa' },
  { id: 'mono', label: 'JetBrains Mono', family: 'JetBrains Mono', category: 'mono', badge: '</>' },
  { id: 'merriweather', label: 'Merriweather', family: 'Merriweather', category: 'serif', badge: '𝒜' },
  { id: 'georgia', label: 'Georgia Serif', family: 'Georgia', category: 'serif', badge: '𝒜' },
  { id: 'comic', label: 'Comic Neue', family: 'Comic Neue', category: 'hand', badge: '💬' },
  { id: 'devanagari', label: 'Noto Devanagari', family: 'Noto Sans Devanagari', category: 'sans', badge: 'अ' },
];

export const EXCALIDRAW_QUICK_FONTS: { category: 'hand' | 'sans' | 'mono' | 'serif'; label: string; family: string; icon: string }[] = [
  { category: 'hand', label: 'Hand-drawn', family: 'Caveat', icon: '✏️' },
  { category: 'sans', label: 'Normal Sans', family: 'Plus Jakarta Sans', icon: 'A' },
  { category: 'mono', label: 'Code Mono', family: 'JetBrains Mono', icon: '</>' },
  { category: 'serif', label: 'Editorial Serif', family: 'Merriweather', icon: '𝒜' },
];

export const SIZE_PRESETS: { key: 'S' | 'M' | 'L' | 'XL'; px: number }[] = [
  { key: 'S', px: 14 },
  { key: 'M', px: 18 },
  { key: 'L', px: 26 },
  { key: 'XL', px: 36 },
];

export const TEXT_COLOR_SWATCHES = [
  '#0F172A',
  '#DC2626',
  '#059669',
  '#2563EB',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#475569',
  '#FFFFFF',
];

export const HIGHLIGHT_SWATCHES = [
  { label: 'None', value: 'transparent' },
  { label: 'Sun Yellow', value: '#FEF08A' },
  { label: 'Mint Green', value: '#BBF7D0' },
  { label: 'Sky Blue', value: '#BAE6FD' },
  { label: 'Blush Pink', value: '#FBCFE8' },
  { label: 'Soft Lavender', value: '#DDD6FE' },
  { label: 'Apricot', value: '#FED7AA' },
  { label: 'Coral Red', value: '#FECACA' },
];

export const STICKY_NOTE_COLORS = [
  { label: 'Classic Yellow', bg: '#FEF08A', text: '#1E293B' },
  { label: 'Sky Blue', bg: '#BAE6FD', text: '#0F172A' },
  { label: 'Mint Leaf', bg: '#BBF7D0', text: '#064E3B' },
  { label: 'Rose Pink', bg: '#FECDD3', text: '#881337' },
  { label: 'Lavender', bg: '#E9D5FF', text: '#3B0764' },
  { label: 'Peach Glow', bg: '#FED7AA', text: '#7C2D12' },
  { label: 'Warm Cream', bg: '#FEF9C3', text: '#422006' },
  { label: 'Slate Dark', bg: '#1E293B', text: '#F8FAFC' },
];

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildRichBlocksFromText(text: string, align?: TextAlignMode): RichBlock[] {
  const lines = (text || '').split('\n');
  return lines.map((line) => {
    let listType: 'none' | 'bullet' | 'number' | 'check' = 'none';
    let checked = false;
    let body = line;
    let heading: 0 | 1 | 2 | 3 = 0;

    const checkMatch = line.match(/^[-*]\s*\[( |x|X)\]\s*(.*)$/);
    const unicodeCheckMatch = line.match(/^(☐|☑)\s*(.*)$/);
    const bulletMatch = line.match(/^(?:•|-|\*)\s+(.*)$/);
    const numMatch = line.match(/^\d+\.\s+(.*)$/);
    const hMatch = line.match(/^(#{1,3})\s+(.*)$/);

    if (checkMatch) {
      listType = 'check';
      checked = checkMatch[1].toLowerCase() === 'x';
      body = checkMatch[2];
    } else if (unicodeCheckMatch) {
      listType = 'check';
      checked = unicodeCheckMatch[1] === '☑';
      body = unicodeCheckMatch[2];
    } else if (bulletMatch) {
      listType = 'bullet';
      body = bulletMatch[1];
    } else if (numMatch) {
      listType = 'number';
      body = numMatch[1];
    } else if (hMatch) {
      heading = hMatch[1].length as 1 | 2 | 3;
      body = hMatch[2];
    }

    return {
      type: 'paragraph',
      align,
      indent: 0,
      listType,
      checked,
      heading,
      runs: [{ text: body }],
    };
  });
}

export function getEffectiveRichBlocks(obj: TextObject | StickyObject): RichBlock[] {
  if (obj.richBlocks && obj.richBlocks.length > 0) return obj.richBlocks;
  return buildRichBlocksFromText(obj.text || '', obj.textAlign || 'left');
}

export function richBlocksToPlainText(blocks: RichBlock[]): string {
  const lines: string[] = [];
  let numCounter = 0;
  for (const b of blocks) {
    if (b.type === 'table') {
      for (const row of b.rows) {
        lines.push(row.join(' | '));
      }
      numCounter = 0;
      continue;
    }
    const text = b.runs.map((r) => r.text).join('');
    if (b.listType === 'number') {
      numCounter += 1;
      lines.push(`${numCounter}. ${text}`);
    } else {
      numCounter = 0;
      if (b.listType === 'bullet') lines.push(`• ${text}`);
      else if (b.listType === 'check') lines.push(`${b.checked ? '☑' : '☐'} ${text}`);
      else lines.push(text);
    }
  }
  return lines.join('\n');
}

export function toggleRichCheckbox(blocks: RichBlock[], blockIndex: number): RichBlock[] {
  return blocks.map((b, idx) => {
    if (idx === blockIndex && b.type === 'paragraph' && b.listType === 'check') {
      return { ...b, checked: !b.checked };
    }
    return b;
  });
}

export function applyDefaultStyleToRichBlocks(
  blocks: RichBlock[],
  patch: Partial<RichRun> & { align?: TextAlignMode; clearAll?: boolean }
): RichBlock[] {
  return blocks.map((b) => {
    if (b.type === 'table') return b;
    if (patch.clearAll) {
      return {
        ...b,
        align: 'left',
        indent: 0,
        heading: 0,
        runs: [{ text: b.runs.map((r) => r.text).join('') }],
      };
    }
    return {
      ...b,
      align: patch.align ?? b.align,
      runs: b.runs.map((r) => ({
        ...r,
        ...(patch.bold !== undefined ? { bold: patch.bold } : {}),
        ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
        ...(patch.underline !== undefined ? { underline: patch.underline } : {}),
        ...(patch.strike !== undefined ? { strike: patch.strike } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.highlight !== undefined ? { highlight: patch.highlight } : {}),
      })),
    };
  });
}

export function richBlocksToHtml(blocks: RichBlock[], baseAlign: TextAlignMode = 'left'): string {
  if (!blocks || blocks.length === 0) return '<div data-block="p"><br></div>';

  const renderRuns = (runs: RichRun[], checked?: boolean) => {
    if (!runs || runs.length === 0 || (runs.length === 1 && !runs[0].text)) {
      return '<br>';
    }
    return runs
      .map((r) => {
        if (!r.text) return '';
        let inner = escapeHtml(r.text);
        if (r.code) inner = `<code style="background:rgba(148,163,184,0.22);padding:0 4px;border-radius:3px;font-family:'JetBrains Mono',monospace;font-size:0.9em">${inner}</code>`;
        if (r.bold) inner = `<strong>${inner}</strong>`;
        if (r.italic) inner = `<em>${inner}</em>`;
        const decos: string[] = [];
        if (r.underline) decos.push('underline');
        if (r.strike || checked) decos.push('line-through');
        const styles: string[] = [];
        if (r.color) styles.push(`color:${r.color}`);
        if (r.highlight && r.highlight !== 'transparent') {
          styles.push(`background-color:${r.highlight};border-radius:3px;padding:0 2px`);
        }
        if (decos.length > 0) styles.push(`text-decoration:${decos.join(' ')}`);
        if (checked) styles.push('opacity:0.65');
        if (styles.length > 0) {
          inner = `<span style="${styles.join(';')}">${inner}</span>`;
        }
        return inner;
      })
      .join('');
  };

  let html = '';
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === 'table') {
      const hdrBg = b.headerBg || 'rgba(37,99,235,0.12)';
      const brd = b.borderColor || '#CBD5E1';
      html += `<table data-rich-table="true" style="border-collapse:collapse;width:100%;margin:6px 0;font-size:0.9em"><tbody>`;
      b.rows.forEach((row, rIdx) => {
        html += '<tr>';
        row.forEach((cell) => {
          const tag = rIdx === 0 ? 'th' : 'td';
          html += `<${tag} style="border:1px solid ${brd};padding:4px 8px;text-align:left;${
            rIdx === 0 ? `background:${hdrBg};font-weight:700;` : ''
          }">${escapeHtml(cell || '') || '<br>'}</${tag}>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      i++;
      continue;
    }

    if (b.listType === 'bullet' || b.listType === 'number') {
      const listTag = b.listType === 'bullet' ? 'ul' : 'ol';
      const padL = 22 + (b.indent || 0) * 18;
      html += `<${listTag} style="margin:2px 0;padding-left:${padL}px;list-style-type:${
        b.listType === 'bullet' ? 'disc' : 'decimal'
      }">`;
      while (i < blocks.length) {
        const cur = blocks[i];
        if (cur.type !== 'paragraph' || cur.listType !== b.listType) break;
        const align = cur.align || baseAlign;
        html += `<li style="text-align:${align}">${renderRuns(cur.runs)}</li>`;
        i++;
      }
      html += `</${listTag}>`;
      continue;
    }

    const align = b.align || baseAlign;
    const indentPx = (b.indent || 0) * 20;
    const headingSize =
      b.heading === 1 ? '1.45em' : b.heading === 2 ? '1.25em' : b.heading === 3 ? '1.1em' : '1em';
    const headingWeight = b.heading ? 'font-weight:700;' : '';

    if (b.listType === 'check') {
      html += `<div data-block="check" data-checked="${b.checked ? '1' : '0'}" style="display:flex;align-items:flex-start;gap:6px;margin:2px 0;padding-left:${indentPx}px;text-align:${align};font-size:${headingSize};${headingWeight}">`;
      html += `<span data-check-box="true" contenteditable="false" style="cursor:pointer;user-select:none;display:inline-flex;align-items:center;justify-content:center;width:1.1em;height:1.1em;margin-top:0.15em;border-radius:3px;border:1.5px solid currentColor;font-size:0.85em;flex-shrink:0;background:${
        b.checked ? '#2563EB' : 'transparent'
      };color:${b.checked ? '#FFFFFF' : 'inherit'}">${b.checked ? '✓' : ''}</span>`;
      html += `<span data-check-text="true" style="flex:1;min-width:12px">${renderRuns(b.runs, b.checked)}</span></div>`;
    } else {
      html += `<div data-block="p" data-heading="${b.heading || 0}" data-indent="${b.indent || 0}" style="margin:1px 0;padding-left:${indentPx}px;text-align:${align};font-size:${headingSize};${headingWeight}">${renderRuns(
        b.runs
      )}</div>`;
    }
    i++;
  }

  return html;
}

function normalizeColorToCss(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'rgba(0, 0, 0, 0)') return undefined;
  return trimmed;
}

export function htmlToRichBlocks(rootEl: HTMLElement): RichBlock[] {
  const blocks: RichBlock[] = [];

  const extractRuns = (
    node: Node,
    inherited: Omit<RichRun, 'text'> = {}
  ): RichRun[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').replace(/\u00A0/g, ' ');
      if (!txt) return [];
      return [{ text: txt, ...inherited }];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as HTMLElement;
    if (el.dataset.checkBox === 'true') return [];

    const tag = el.tagName.toLowerCase();
    const style = el.style;
    const nextStyle: Omit<RichRun, 'text'> = { ...inherited };

    if (tag === 'strong' || tag === 'b' || style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) {
      nextStyle.bold = true;
    }
    if (tag === 'em' || tag === 'i' || style.fontStyle === 'italic') {
      nextStyle.italic = true;
    }
    if (tag === 'u' || style.textDecoration.includes('underline') || style.textDecorationLine.includes('underline')) {
      nextStyle.underline = true;
    }
    if (
      tag === 's' ||
      tag === 'strike' ||
      tag === 'del' ||
      style.textDecoration.includes('line-through') ||
      style.textDecorationLine.includes('line-through')
    ) {
      nextStyle.strike = true;
    }
    if (tag === 'code') nextStyle.code = true;

    const c = normalizeColorToCss(style.color) || (el.getAttribute('color') || undefined);
    if (c) nextStyle.color = c;
    const bg = normalizeColorToCss(style.backgroundColor);
    if (bg) nextStyle.highlight = bg;

    const out: RichRun[] = [];
    if (tag === 'br') {
      return [];
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      out.push(...extractRuns(el.childNodes[i], nextStyle));
    }
    return out;
  };

  const mergeAdjacentRuns = (runs: RichRun[]): RichRun[] => {
    if (runs.length === 0) return [{ text: '' }];
    const merged: RichRun[] = [];
    for (const r of runs) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        Boolean(prev.bold) === Boolean(r.bold) &&
        Boolean(prev.italic) === Boolean(r.italic) &&
        Boolean(prev.underline) === Boolean(r.underline) &&
        Boolean(prev.strike) === Boolean(r.strike) &&
        Boolean(prev.code) === Boolean(r.code) &&
        prev.color === r.color &&
        prev.highlight === r.highlight
      ) {
        prev.text += r.text;
      } else {
        merged.push({ ...r });
      }
    }
    return merged;
  };

  const getAlign = (el: HTMLElement): TextAlignMode | undefined => {
    const a = el.style.textAlign || el.getAttribute('align');
    if (a === 'left' || a === 'center' || a === 'right' || a === 'justify') return a;
    return undefined;
  };

  const getIndent = (el: HTMLElement): number => {
    if (el.dataset.indent) return Number(el.dataset.indent) || 0;
    const pl = parseInt(el.style.paddingLeft || '0', 10);
    return Number.isFinite(pl) && pl > 0 ? Math.min(6, Math.round(pl / 20)) : 0;
  };

  const getHeading = (el: HTMLElement): 0 | 1 | 2 | 3 => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1' || el.dataset.heading === '1') return 1;
    if (tag === 'h2' || el.dataset.heading === '2') return 2;
    if (tag === 'h3' || el.dataset.heading === '3') return 3;
    return 0;
  };

  const pushParagraphFromEl = (el: HTMLElement, listType: 'none' | 'bullet' | 'number' | 'check' = 'none', indentOverride?: number) => {
    const isCheck = listType === 'check' || el.dataset.block === 'check';
    const textHost = isCheck ? (el.querySelector('[data-check-text="true"]') as HTMLElement) || el : el;
    const runs = mergeAdjacentRuns(extractRuns(textHost));
    blocks.push({
      type: 'paragraph',
      align: getAlign(el),
      indent: indentOverride ?? getIndent(el),
      listType: isCheck ? 'check' : listType,
      checked: isCheck ? el.dataset.checked === '1' : undefined,
      heading: getHeading(el),
      runs,
    });
  };

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').replace(/\u00A0/g, ' ');
      if (t) {
        blocks.push({ type: 'paragraph', listType: 'none', indent: 0, runs: [{ text: t }] });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'table') {
      const rows: string[][] = [];
      el.querySelectorAll('tr').forEach((tr) => {
        const row: string[] = [];
        tr.querySelectorAll('th,td').forEach((cell) => {
          row.push((cell.textContent || '').trim());
        });
        if (row.length > 0) rows.push(row);
      });
      if (rows.length > 0) {
        blocks.push({ type: 'table', rows });
      }
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const pl = parseInt(el.style.paddingLeft || '22', 10);
      const listIndent = Math.max(0, Math.round((pl - 22) / 18));
      const lt = tag === 'ul' ? 'bullet' : 'number';
      Array.from(el.children).forEach((child) => {
        if (child.tagName.toLowerCase() === 'li') {
          pushParagraphFromEl(child as HTMLElement, lt, listIndent);
        } else {
          processNode(child);
        }
      });
      return;
    }

    if (tag === 'div' || tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'blockquote') {
      const hasBlockChildren = Array.from(el.children).some((c) =>
        ['div', 'p', 'ul', 'ol', 'table', 'h1', 'h2', 'h3'].includes(c.tagName.toLowerCase())
      );
      if (hasBlockChildren && el.dataset.block !== 'check') {
        Array.from(el.childNodes).forEach(processNode);
      } else {
        pushParagraphFromEl(el, 'none');
      }
      return;
    }

    // Inline node at root level
    const runs = mergeAdjacentRuns(extractRuns(el));
    if (runs.some((r) => r.text)) {
      blocks.push({ type: 'paragraph', listType: 'none', indent: 0, runs });
    }
  };

  if (rootEl.childNodes.length === 0) {
    return [{ type: 'paragraph', listType: 'none', indent: 0, runs: [{ text: '' }] }];
  }

  Array.from(rootEl.childNodes).forEach(processNode);

  if (blocks.length === 0) {
    return [{ type: 'paragraph', listType: 'none', indent: 0, runs: [{ text: '' }] }];
  }

  return blocks;
}
