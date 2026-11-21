import type { CodeLanguage, RichBlock, RichRun } from '../types/smartboard';

const KEYWORDS: Record<CodeLanguage, Set<string>> = {
  typescript: new Set('as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function if implements import in instanceof interface let namespace new null of package private protected public readonly return static super switch this throw true try type typeof undefined var void while yield'.split(' ')),
  javascript: new Set('as async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null of return super switch this throw true try typeof undefined var void while yield'.split(' ')),
  python: new Set('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield'.split(' ')),
  json: new Set(['true', 'false', 'null']),
  html: new Set(),
  css: new Set(),
  bash: new Set('case do done elif else esac fi for function if in select then time until while'.split(' ')),
  sql: new Set('add all alter as asc begin by case cast column create database delete desc distinct drop else end exists from full group having in index inner insert into join left limit not null offset on or order outer primary references right select set table then union unique update values view when where with'.split(' ')),
};

const COLORS = {
  keyword: '#C4B5FD',
  string: '#86EFAC',
  number: '#FDBA74',
  comment: '#94A3B8',
  function: '#7DD3FC',
  tag: '#F9A8D4',
  punctuation: '#CBD5E1',
};

function colorToken(token: string, language: CodeLanguage): string | undefined {
  if ((language === 'html' || language === 'css') && /^<\/?[A-Za-z][^>]*>$/.test(token)) return COLORS.tag;
  if (/^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)$/.test(token)) return COLORS.string;
  if (/^(?:\/\/|#|--)/.test(token)) return COLORS.comment;
  if (/^(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?n?)$/i.test(token)) return COLORS.number;
  if (KEYWORDS[language].has(token)) return COLORS.keyword;
  if (/^[A-Za-z_$][\w$]*$/.test(token) && /\($/.test(token)) return COLORS.function;
  return undefined;
}

export function highlightCodeToRichBlocks(source: string, language: CodeLanguage): RichBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const tokenPattern = /(?:\/\/[^\n]*|#[^\n]*|--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<\/?[A-Za-z][^>]*>|\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?n?)\b|\b[A-Za-z_$][\w$]*\b|[^\w\s]+|\s+)/gi;
  return lines.map((line) => {
    const runs: RichRun[] = [];
    for (const token of line.match(tokenPattern) || []) {
      const color = colorToken(token, language);
      const previous = runs[runs.length - 1];
      if (previous?.color === color) previous.text += token;
      else runs.push({ text: token, ...(color ? { color } : {}) });
    }
    if (runs.length === 0) runs.push({ text: '' });
    return { type: 'paragraph', align: 'left', indent: 0, listType: 'none', runs };
  });
}
