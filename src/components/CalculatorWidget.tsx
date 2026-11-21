import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  Copy,
  Delete,
  History,
  LineChart,
  RotateCcw,
  Calculator as CalculatorIcon,
  X,
} from 'lucide-react';
import { evaluate, format } from 'mathjs';

type CalculatorWidgetProps = {
  open: boolean;
  onClose: () => void;
  onInsertToBoard: (expression: string, result: string) => void;
  onPlotExpression?: (expression: string) => void;
  onNotify?: (msg: string) => void;
};

type CalcHistoryItem = {
  id: string;
  expr: string;
  result: string;
};

function normalizePlotExpr(raw: string): string {
  return raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\(/g, 'sqrt(')
    .trim();
}

function expandPercentNotation(raw: string): string {
  // Handle contextual binary +/- percentages even inside longer chains like "100 + 20% + 5"
  let s = raw.trim();
  const chainRegex = /^(.+?)\s*([+\-])\s*(\d+(?:\.\d+)?)%(?=\s*(?:[+\-*/)]|$))/;
  let guard = 0;
  while (guard < 8) {
    const m = chainRegex.exec(s);
    if (!m) break;
    const prefix = m[1].trim();
    const op = m[2];
    const pct = m[3];
    const rest = s.slice(m[0].length);
    s = `((${prefix}) ${op} ((${prefix}) * (${pct} / 100)))${rest}`;
    guard++;
  }
  return s.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
}

function formatBaseInt(n: number, radix: number, prefix: string): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  return `${sign}${prefix}${Math.abs(Math.trunc(n)).toString(radix).toUpperCase()}`;
}

function evalMathExpr(rawExpr: string, angleUnit: 'DEG' | 'RAD', lastAns: string): string {
  const normalized = normalizePlotExpr(rawExpr);

  if (!normalized) return '0';
  const cleaned = expandPercentNotation(normalized);

  const toRad = (v: number) => (angleUnit === 'DEG' ? (v * Math.PI) / 180 : v);
  const fromRad = (v: number) => (angleUnit === 'DEG' ? (v * 180) / Math.PI : v);

  const scope = {
    ans: Number(lastAns) || 0,
    Ans: Number(lastAns) || 0,
    sin: (x: number) => Math.sin(toRad(x)),
    cos: (x: number) => Math.cos(toRad(x)),
    tan: (x: number) => {
      const r = toRad(x);
      if (Math.abs(Math.cos(r)) < 1e-12) throw new Error('Undefined');
      return Math.tan(r);
    },
    asin: (x: number) => fromRad(Math.asin(x)),
    acos: (x: number) => fromRad(Math.acos(x)),
    atan: (x: number) => fromRad(Math.atan(x)),
    ln: (x: number) => Math.log(x),
    log: (x: number) => Math.log10(x),
  };

  const val = evaluate(cleaned, scope);
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) throw new Error('Math Error');
    const snapped = Math.abs(val) < 1e-12 ? 0 : val;
    return format(snapped, { precision: 12 });
  }
  return format(val, { precision: 12 });
}

const UNIT_GROUPS: Record<string, { label: string; factorToBase: number; offset?: number }[]> = {
  Length: [
    { label: 'm', factorToBase: 1 },
    { label: 'km', factorToBase: 1000 },
    { label: 'cm', factorToBase: 0.01 },
    { label: 'mm', factorToBase: 0.001 },
    { label: 'ft', factorToBase: 0.3048 },
    { label: 'in', factorToBase: 0.0254 },
    { label: 'mi', factorToBase: 1609.344 },
  ],
  Mass: [
    { label: 'kg', factorToBase: 1 },
    { label: 'g', factorToBase: 0.001 },
    { label: 'lb', factorToBase: 0.45359237 },
    { label: 'oz', factorToBase: 0.0283495 },
  ],
  Temp: [
    { label: '°C', factorToBase: 1, offset: 0 },
    { label: '°F', factorToBase: 1, offset: 32 },
    { label: 'K', factorToBase: 1, offset: 273.15 },
  ],
  Energy: [
    { label: 'J', factorToBase: 1 },
    { label: 'kJ', factorToBase: 1000 },
    { label: 'cal', factorToBase: 4.184 },
    { label: 'kWh', factorToBase: 3_600_000 },
  ],
};

export const CalculatorWidget: React.FC<CalculatorWidgetProps> = ({
  open,
  onClose,
  onInsertToBoard,
  onPlotExpression,
  onNotify,
}) => {
  const [mode, setMode] = useState<'calc' | 'solve' | 'base' | 'units' | 'stats'>('calc');
  const [expr, setExpr] = useState('');
  const [lastExpression, setLastExpression] = useState('');
  const [result, setResult] = useState('0');
  const [memory, setMemory] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scientific, setScientific] = useState(true);
  const [angleUnit, setAngleUnit] = useState<'DEG' | 'RAD'>('DEG');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<CalcHistoryItem[]>([]);
  const [copied, setCopied] = useState(false);

  // Equation solver state (ax^2 + bx + c = 0)
  const [coefA, setCoefA] = useState('1');
  const [coefB, setCoefB] = useState('-5');
  const [coefC, setCoefC] = useState('6');

  // Base-N converter state
  const [baseDec, setBaseDec] = useState('42');
  const [baseError, setBaseError] = useState<string | null>(null);

  // Unit converter state
  const [unitGroup, setUnitGroup] = useState<keyof typeof UNIT_GROUPS>('Length');
  const [unitFrom, setUnitFrom] = useState(0);
  const [unitTo, setUnitTo] = useState(1);
  const [unitVal, setUnitVal] = useState('10');

  // Stats state
  const [statsInput, setStatsInput] = useState('12, 15, 18, 22, 22, 29');

  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? (window.innerWidth >= 768 ? 64 : Math.max(8, Math.round((window.innerWidth - Math.min(326, window.innerWidth - 16)) / 2))) : 16,
    y: typeof window !== 'undefined' ? Math.max(54, Math.min(window.innerHeight - 440, 72)) : 72,
  }));

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const clampPos = () => {
      const cardW = Math.min(326, window.innerWidth - 16);
      setPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - cardW - 8, prev.x)),
        y: Math.max(52, Math.min(window.innerHeight - 260, prev.y)),
      }));
    };
    clampPos();
    window.addEventListener('resize', clampPos);
    return () => window.removeEventListener('resize', clampPos);
  }, [open]);

  const handleCompute = useCallback(() => {
    const target = expr.trim() || result;
    if (!target) return;
    try {
      const out = evalMathExpr(target, angleUnit, result);
      setResult(out);
      setLastExpression(expr.trim() || lastExpression || out);
      setErrorMsg(null);
      if (expr.trim()) {
        setHistory((prev) => [{ id: `${Date.now()}`, expr: expr.trim(), result: out }, ...prev].slice(0, 15));
        setExpr(out);
      }
    } catch {
      setErrorMsg('Syntax / Math Error');
    }
  }, [angleUnit, expr, lastExpression, result]);

  const appendToken = useCallback((token: string) => {
    setErrorMsg(null);
    setExpr((prev) => prev + token);
  }, []);

  const handleBackspace = useCallback(() => {
    setErrorMsg(null);
    setExpr((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setExpr('');
    setLastExpression('');
    setResult('0');
    setErrorMsg(null);
  }, []);

  const handleToggleSign = useCallback(() => {
    setErrorMsg(null);
    if (!expr) {
      if (result !== '0') {
        setResult((r) => (r.startsWith('-') ? r.slice(1) : `-${r}`));
      }
      return;
    }
    setExpr((prev) => (prev.startsWith('-') ? prev.slice(1) : `-(${prev})`));
  }, [expr, result]);

  const handleCopy = async () => {
    const text = result || expr || '0';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onNotify?.(`Copied ${text}`);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      onNotify?.('Copy unavailable');
    }
  };

  const handleDropToBoard = () => {
    const cleanExpr = expr.trim();
    if (cleanExpr && cleanExpr !== result) {
      try {
        const computed = evalMathExpr(cleanExpr, angleUnit, result);
        onInsertToBoard(cleanExpr, computed);
      } catch {
        onInsertToBoard(cleanExpr, result);
      }
    } else if (lastExpression) {
      onInsertToBoard(lastExpression, result);
    } else {
      onInsertToBoard(result, result);
    }
  };

  const solveQuadratic = () => {
    const readCoefficient = (raw: string) => (raw.trim() === '' ? 0 : Number(raw));
    const a = readCoefficient(coefA);
    const b = readCoefficient(coefB);
    const c = readCoefficient(coefC);
    if (![a, b, c].every(Number.isFinite)) {
      return { label: 'Enter finite numeric coefficients', roots: [] as string[] };
    }
    if (a === 0) {
      if (b === 0) return { label: c === 0 ? 'Infinite solutions' : 'No solution', roots: [] as string[] };
      const x = -c / b;
      return { label: `Linear: x = ${Number(x.toFixed(6))}`, roots: [`x = ${Number(x.toFixed(6))}`] };
    }
    const disc = b * b - 4 * a * c;
    if (disc > 0) {
      const r1 = (-b + Math.sqrt(disc)) / (2 * a);
      const r2 = (-b - Math.sqrt(disc)) / (2 * a);
      return {
        label: `x₁ = ${Number(r1.toFixed(5))}, x₂ = ${Number(r2.toFixed(5))}`,
        roots: [`x₁ = ${Number(r1.toFixed(5))}`, `x₂ = ${Number(r2.toFixed(5))}`],
      };
    }
    if (disc === 0) {
      const r = -b / (2 * a);
      return { label: `Double root: x = ${Number(r.toFixed(5))}`, roots: [`x = ${Number(r.toFixed(5))}`] };
    }
    const real = -b / (2 * a);
    const imag = Math.sqrt(-disc) / Math.abs(2 * a);
    return {
      label: `x = ${Number(real.toFixed(4))} ± ${Number(imag.toFixed(4))}i`,
      roots: [`${Number(real.toFixed(4))} + ${Number(imag.toFixed(4))}i`, `${Number(real.toFixed(4))} - ${Number(imag.toFixed(4))}i`],
    };
  };

  const computeUnit = () => {
    const v = Number(unitVal);
    if (!Number.isFinite(v)) return '—';
    const items = UNIT_GROUPS[unitGroup];
    const f = items[unitFrom] || items[0];
    const t = items[unitTo] || items[0];
    if (unitGroup === 'Temp') {
      const celsius = f.label === '°C' ? v : f.label === '°F' ? (v - 32) * (5 / 9) : v - 273.15;
      const out = t.label === '°C' ? celsius : t.label === '°F' ? celsius * (9 / 5) + 32 : celsius + 273.15;
      return Number(out.toFixed(6)).toString();
    }
    const base = v * f.factorToBase;
    return Number((base / t.factorToBase).toFixed(6)).toString();
  };

  const computeStats = () => {
    const nums = statsInput
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const n = nums.length;
    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const mid = Math.floor(n / 2);
    const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const sqSum = nums.reduce((acc, x) => acc + (x - mean) ** 2, 0);
    const popStdDev = Math.sqrt(sqSum / n);
    const sampleStdDev = n > 1 ? Math.sqrt(sqSum / (n - 1)) : 0;
    const freq = new Map<number, number>();
    let maxFreq = 0;
    for (const v of nums) {
      const f = (freq.get(v) || 0) + 1;
      freq.set(v, f);
      if (f > maxFreq) maxFreq = f;
    }
    const modes = maxFreq > 1 ? Array.from(freq.entries()).filter(([, f]) => f === maxFreq).map(([v]) => v) : [];
    const range = sorted[n - 1] - sorted[0];
    return {
      n,
      sum: Number(sum.toFixed(4)),
      mean: Number(mean.toFixed(4)),
      median: Number(median.toFixed(4)),
      modeLabel: modes.length > 0 ? modes.slice(0, 3).join(', ') : 'None',
      popStdDev: Number(popStdDev.toFixed(4)),
      sampleStdDev: Number(sampleStdDev.toFixed(4)),
      range: Number(range.toFixed(4)),
      min: sorted[0],
      max: sorted[n - 1],
    };
  };

  if (!open) return null;

  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const cardW = Math.min(326, window.innerWidth - 16);
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - cardW - 8, dragRef.current.origX + dx)),
      y: Math.max(48, Math.min(window.innerHeight - 220, dragRef.current.origY + dy)),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const sciButtons: { label: string; token?: string; action?: () => void }[] = [
    { label: 'sin', token: 'sin(' },
    { label: 'cos', token: 'cos(' },
    { label: 'tan', token: 'tan(' },
    { label: 'π', token: 'π' },
    { label: 'e', token: 'e' },
    { label: 'asin', token: 'asin(' },
    { label: 'acos', token: 'acos(' },
    { label: 'atan', token: 'atan(' },
    { label: 'ln', token: 'ln(' },
    { label: 'log', token: 'log(' },
    { label: '√', token: '√(' },
    { label: 'x²', token: '^2' },
    { label: 'xʸ', token: '^' },
    { label: 'n!', token: '!' },
    { label: 'Ans', token: 'Ans' },
  ];

  const mainButtons: {
    label: React.ReactNode;
    onClick: () => void;
    variant?: 'op' | 'accent' | 'muted' | 'num';
  }[] = [
    { label: 'AC', onClick: handleClear, variant: 'muted' },
    { label: '(', onClick: () => appendToken('('), variant: 'muted' },
    { label: ')', onClick: () => appendToken(')'), variant: 'muted' },
    { label: '÷', onClick: () => appendToken('÷'), variant: 'op' },

    { label: '7', onClick: () => appendToken('7'), variant: 'num' },
    { label: '8', onClick: () => appendToken('8'), variant: 'num' },
    { label: '9', onClick: () => appendToken('9'), variant: 'num' },
    { label: '×', onClick: () => appendToken('×'), variant: 'op' },

    { label: '4', onClick: () => appendToken('4'), variant: 'num' },
    { label: '5', onClick: () => appendToken('5'), variant: 'num' },
    { label: '6', onClick: () => appendToken('6'), variant: 'num' },
    { label: '−', onClick: () => appendToken('−'), variant: 'op' },

    { label: '1', onClick: () => appendToken('1'), variant: 'num' },
    { label: '2', onClick: () => appendToken('2'), variant: 'num' },
    { label: '3', onClick: () => appendToken('3'), variant: 'num' },
    { label: '+', onClick: () => appendToken('+'), variant: 'op' },

    { label: '+/-', onClick: handleToggleSign, variant: 'num' },
    { label: '0', onClick: () => appendToken('0'), variant: 'num' },
    { label: '.', onClick: () => appendToken('.'), variant: 'num' },
    { label: '=', onClick: handleCompute, variant: 'accent' },
  ];

  const parsedDec = Number(baseDec);
  const decInt = Number.isFinite(parsedDec) ? Math.trunc(parsedDec) : 0;
  const quadSolution = solveQuadratic();
  const unitOutput = computeUnit();
  const statsSummary = computeStats();

  const updateFromBaseInput = (raw: string, radix: 16 | 8 | 2) => {
    const trimmed = raw.trim().replace(/^(-?)(0x|0o|0b)/i, '$1');
    if (!trimmed || trimmed === '-') {
      setBaseDec('0');
      setBaseError(null);
      return;
    }
    const validRe =
      radix === 16 ? /^-?[0-9a-f]+$/i : radix === 8 ? /^-?[0-7]+$/ : /^-?[01]+$/;
    if (!validRe.test(trimmed)) {
      setBaseError(`Invalid Base-${radix} digit`);
      return;
    }
    const val = parseInt(trimmed, radix);
    if (!Number.isSafeInteger(val)) {
      setBaseError('Integer out of safe range');
      return;
    }
    setBaseError(null);
    setBaseDec(String(val));
  };

  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-40 w-[326px] max-w-[calc(100vw-16px)] max-h-[calc(100dvh-116px)] flex flex-col rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden select-none"
      onKeyDown={(e) => {
        if (mode === 'calc' && e.key === 'Enter') {
          e.preventDefault();
          handleCompute();
        } else if (e.key === 'Escape') {
          onClose();
        }
      }}
    >
      {/* Draggable Header */}
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 cursor-grab active:cursor-grabbing touch-none shrink-0"
      >
        <div className="flex items-center gap-1.5">
          <CalculatorIcon className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">Smart Calculator</span>
        </div>

        <div className="flex items-center gap-1">
          {mode === 'calc' && (
            <>
              <button
                onClick={() => setScientific((s) => !s)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                  scientific
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                    : 'text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Toggle Scientific Keys"
              >
                {scientific ? 'Sci' : 'Std'}
              </button>
              <button
                onClick={() => setAngleUnit((u) => (u === 'DEG' ? 'RAD' : 'DEG'))}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                title="Toggle Degrees / Radians"
              >
                {angleUnit}
              </button>
              <button
                onClick={() => setShowHistory((h) => !h)}
                className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 ${
                  showHistory ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' : 'text-slate-500'
                }`}
                title="Calculation History"
              >
                <History className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
            title="Close Calculator"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar shrink-0">
        {[
          { id: 'calc', label: 'Calc' },
          { id: 'solve', label: 'Solve' },
          { id: 'base', label: 'Base-N' },
          { id: 'units', label: 'Units' },
          { id: 'stats', label: 'Stats' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id as typeof mode)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors whitespace-nowrap ${
              mode === m.id
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto studio-scroll">

      {mode === 'calc' && (
        <>
          {/* Display Screen */}
          <div className="px-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={expr}
                onChange={(e) => {
                  setErrorMsg(null);
                  setExpr(e.target.value);
                }}
                placeholder="0"
                aria-label="Calculator expression"
                className="w-full bg-transparent text-right text-sm font-mono text-slate-700 dark:text-slate-200 focus:outline-none placeholder:text-slate-400"
              />
              <button
                onClick={handleBackspace}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 shrink-0"
                title="Backspace"
              >
                <Delete className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-[10px] text-rose-500 font-medium truncate">
                {errorMsg || (memory !== 0 ? `M = ${Number(memory.toFixed(6))}` : '')}
              </span>
              <div className="text-right text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
                {result}
              </div>
            </div>

            {/* Memory + Actions Row */}
            <div className="flex items-center justify-between gap-1 mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMemory(0)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  title="Memory Clear"
                >
                  MC
                </button>
                <button
                  onClick={() => appendToken(String(memory))}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  title="Memory Recall"
                >
                  MR
                </button>
                <button
                  onClick={() => setMemory((m) => m + (Number(result) || 0))}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  title="Memory Add"
                >
                  M+
                </button>
                <button
                  onClick={() => setMemory((m) => m - (Number(result) || 0))}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  title="Memory Subtract"
                >
                  M-
                </button>
                <button
                  onClick={() => appendToken('%')}
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  title="Percent"
                >
                  %
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="p-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  title="Copy Result"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
                {onPlotExpression && (
                  <button
                    onClick={() => {
                      const raw = (expr.trim() || lastExpression).trim();
                      const normalized = normalizePlotExpr(raw);
                      if (normalized) onPlotExpression(normalized);
                    }}
                    className="p-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                    title="Plot on Board (for expressions with x)"
                  >
                    <LineChart className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={handleDropToBoard}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-blue-600 text-white hover:bg-blue-700"
                  title="Insert calculation onto board"
                >
                  <ArrowDownToLine className="w-3 h-3" />
                  <span>Board</span>
                </button>
              </div>
            </div>
          </div>

          {showHistory && (
            <div className="max-h-32 overflow-y-auto px-3 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-1 studio-scroll">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Recent History</span>
                {history.length > 0 && (
                  <button
                    onClick={() => setHistory([])}
                    className="flex items-center gap-0.5 text-slate-500 hover:text-rose-500"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Clear
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <div className="text-[11px] text-slate-400 py-1">No calculations yet.</div>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setExpr(item.expr);
                      setLastExpression(item.expr);
                      setResult(item.result);
                      setShowHistory(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-800 text-left text-[11px]"
                  >
                    <span className="font-mono text-slate-500 truncate">{item.expr}</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                      = {item.result}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Keypad */}
          <div className="p-2.5 space-y-1.5">
            {scientific && (
              <div className="grid grid-cols-5 gap-1">
                {sciButtons.map((sb) => (
                  <button
                    key={sb.label}
                    onClick={() => (sb.action ? sb.action() : appendToken(sb.token || ''))}
                    className="h-7 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    {sb.label}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-4 gap-1.5">
              {mainButtons.map((btn, i) => {
                const cls =
                  btn.variant === 'accent'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white font-semibold'
                    : btn.variant === 'op'
                    ? 'bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold'
                    : btn.variant === 'muted'
                    ? 'bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-medium';
                return (
                  <button
                    key={i}
                    onClick={btn.onClick}
                    className={`h-9 rounded-lg text-sm transition-colors flex items-center justify-center ${cls}`}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {mode === 'solve' && (
        <div className="p-3.5 space-y-3 select-text">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Quadratic / Linear Equation: ax² + bx + c = 0
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'a', val: coefA, set: setCoefA },
              { label: 'b', val: coefB, set: setCoefB },
              { label: 'c', val: coefC, set: setCoefC },
            ].map((item) => (
              <div key={item.label}>
                <label className="block text-[10px] text-slate-500 mb-0.5">{item.label}</label>
                <input
                  type="number"
                  value={item.val}
                  onChange={(e) => item.set(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono border rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"
                />
              </div>
            ))}
          </div>
          <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-xs font-mono text-blue-900 dark:text-blue-200">
            {quadSolution.label}
          </div>
          <div className="flex gap-2">
            {onPlotExpression && (
              <button
                onClick={() => onPlotExpression(`${coefA}*x^2 + (${coefB})*x + (${coefC})`)}
                className="flex-1 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
              >
                Plot Curve
              </button>
            )}
            <button
              onClick={() =>
                onInsertToBoard(`${coefA}x² + ${coefB}x + ${coefC} = 0`, quadSolution.label)
              }
              className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
            >
              Insert to Board
            </button>
          </div>
        </div>
      )}

      {mode === 'base' && (
        <div className="p-3.5 space-y-2.5 select-text">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Base-N Programmer Converter</div>
            {baseError && <span className="text-[10px] text-rose-500 font-medium">{baseError}</span>}
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-0.5">Decimal (Base 10)</label>
            <input
              type="number"
              value={baseDec}
              onChange={(e) => {
                setBaseError(null);
                setBaseDec(e.target.value);
              }}
              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"
            />
          </div>
          {(
            [
              { label: 'HEX (16)', radix: 16 as const, prefix: '0x', val: formatBaseInt(decInt, 16, '0x') },
              { label: 'OCT (8)', radix: 8 as const, prefix: '0o', val: formatBaseInt(decInt, 8, '0o') },
              { label: 'BIN (2)', radix: 2 as const, prefix: '0b', val: formatBaseInt(decInt, 2, '0b') },
            ]
          ).map((row) => (
            <div key={row.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono">
              <span className="text-[10px] text-slate-500 shrink-0 w-14">{row.label}</span>
              <input
                type="text"
                value={row.val}
                onChange={(e) => updateFromBaseInput(e.target.value, row.radix)}
                aria-label={row.label}
                className="flex-1 min-w-0 bg-transparent text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(row.val).catch(() => {});
                  onNotify?.(`Copied ${row.val}`);
                }}
                title={`Copy ${row.label}`}
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 shrink-0"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              onInsertToBoard(
                `DEC ${decInt}`,
                `HEX ${formatBaseInt(decInt, 16, '0x')} | BIN ${formatBaseInt(decInt, 2, '0b')}`
              )
            }
            className="w-full py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
          >
            Insert Conversion to Board
          </button>
        </div>
      )}

      {mode === 'units' && (
        <div className="p-3.5 space-y-2.5 select-text">
          <div className="flex items-center gap-1 flex-wrap">
            {(Object.keys(UNIT_GROUPS) as (keyof typeof UNIT_GROUPS)[]).map((g) => (
              <button
                key={g}
                onClick={() => {
                  setUnitGroup(g);
                  setUnitFrom(0);
                  setUnitTo(1);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  unitGroup === g
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="flex items-stretch gap-1.5">
            <div className="flex-1 min-w-0">
              <input
                type="number"
                value={unitVal}
                onChange={(e) => setUnitVal(e.target.value)}
                className="w-full px-2 py-1.5 text-xs font-mono tabular-nums border rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 mb-1"
              />
              <select
                value={unitFrom}
                onChange={(e) => setUnitFrom(Number(e.target.value))}
                className="w-full px-2 py-1 text-xs border rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              >
                {UNIT_GROUPS[unitGroup].map((u, idx) => (
                  <option key={u.label} value={idx}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setUnitFrom(unitTo);
                setUnitTo(unitFrom);
              }}
              title="Swap From & To units"
              className="self-center px-1.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-200 shrink-0"
            >
              ⇄
            </button>
            <div className="flex-1 min-w-0">
              <div className="w-full px-2 py-1.5 text-xs font-mono tabular-nums border rounded-lg bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 mb-1 truncate font-semibold">
                {unitOutput}
              </div>
              <select
                value={unitTo}
                onChange={(e) => setUnitTo(Number(e.target.value))}
                className="w-full px-2 py-1 text-xs border rounded-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              >
                {UNIT_GROUPS[unitGroup].map((u, idx) => (
                  <option key={u.label} value={idx}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() =>
              onInsertToBoard(
                `${unitVal} ${UNIT_GROUPS[unitGroup][unitFrom]?.label}`,
                `${unitOutput} ${UNIT_GROUPS[unitGroup][unitTo]?.label}`
              )
            }
            className="w-full py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
          >
            Insert to Board
          </button>
        </div>
      )}

      {mode === 'stats' && (
        <div className="p-3.5 space-y-2.5 select-text">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Dataset Statistics</div>
          <textarea
            value={statsInput}
            onChange={(e) => setStatsInput(e.target.value)}
            rows={2}
            placeholder="Comma or space separated numbers..."
            className="w-full px-2.5 py-1.5 text-xs font-mono border rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"
          />
          {statsSummary ? (
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono tabular-nums">
              <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800">n = {statsSummary.n}</div>
              <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800">Sum = {statsSummary.sum}</div>
              <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800">Mean = {statsSummary.mean}</div>
              <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800">Med = {statsSummary.median}</div>
              <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800">σ (pop) = {statsSummary.popStdDev}</div>
              <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800">s (samp) = {statsSummary.sampleStdDev}</div>
              <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 truncate" title={statsSummary.modeLabel}>
                Mode = {statsSummary.modeLabel}
              </div>
              <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-800">
                Rng {statsSummary.range} [{statsSummary.min}, {statsSummary.max}]
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">Enter valid numbers above.</div>
          )}
          {statsSummary && (
            <button
              onClick={() =>
                onInsertToBoard(
                  `Stats (n=${statsSummary.n})`,
                  `Mean=${statsSummary.mean}, Med=${statsSummary.median}, σ=${statsSummary.popStdDev}, s=${statsSummary.sampleStdDev}`
                )
              }
              className="w-full py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
            >
              Insert Summary to Board
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
};
