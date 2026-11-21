import katex from 'katex';
import { compile as compileMath } from 'mathjs';
import React, { useEffect, useMemo, useState } from 'react';
import { Atom, Calculator, Compass, FlaskConical, FunctionSquare, LineChart, Ruler, Sliders, Sparkles, X } from 'lucide-react';
import type { BoardObject, GeometryInstrument, GraphObject, ShapeKind } from '../types/smartboard';
import { uid } from '../utils/geometry';

type MathScienceModalProps = {
  open: boolean;
  initialTab?: 'equation' | 'graph' | 'geometry' | 'science' | 'periodic' | 'simulator';
  editingObject?: BoardObject | null;
  onClose: () => void;
  instruments: GeometryInstrument[];
  onToggleInstrument: (kind: GeometryInstrument['kind']) => void;
  onInsertObjects: (objs: BoardObject[]) => void;
  onUpdateExistingObject?: (id: string, patch: Partial<BoardObject>) => void;
};

const EQUATION_GROUPS: { label: string; items: { label: string; latex: string }[] }[] = [
  {
    label: 'Fractions & Powers',
    items: [
      { label: 'a/b', latex: '\\frac{a}{b}' },
      { label: 'x²', latex: 'x^{2}' },
      { label: 'xₙ', latex: 'x_{n}' },
      { label: '√x', latex: '\\sqrt{x}' },
      { label: 'ⁿ√x', latex: '\\sqrt[n]{x}' },
      { label: 'Quadratic', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    ],
  },
  {
    label: 'Calculus & Limits',
    items: [
      { label: '∫', latex: '\\int_{a}^{b} f(x)\\,dx' },
      { label: 'd/dx', latex: '\\frac{d}{dx} f(x)' },
      { label: '∂/∂x', latex: '\\frac{\\partial f}{\\partial x}' },
      { label: '∑', latex: '\\sum_{i=1}^{n} a_i' },
      { label: 'lim', latex: '\\lim_{x \\to \\infty} \\frac{1}{x} = 0' },
      { label: '∏', latex: '\\prod_{i=1}^{n} x_i' },
    ],
  },
  {
    label: 'Matrices & Vectors',
    items: [
      { label: '2×2 Matrix', latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}' },
      { label: '3×3 Matrix', latex: '\\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & 1 & 0 \\\\ 0 & 0 & 1 \\end{bmatrix}' },
      { label: 'Vector v⃗', latex: '\\vec{v} = \\langle x, y, z \\rangle' },
      { label: '|v|', latex: '\\|\\vec{v}\\| = \\sqrt{x^2 + y^2}' },
    ],
  },
  {
    label: 'Greek & Sets',
    items: [
      { label: 'α β γ θ', latex: '\\alpha, \\beta, \\gamma, \\theta' },
      { label: 'π σ ω λ', latex: '\\pi, \\sigma, \\omega, \\lambda' },
      { label: 'Δ Ω Σ', latex: '\\Delta, \\Omega, \\Sigma' },
      { label: '≤ ≥ ≠ ≈', latex: 'a \\le b \\ge c \\neq d \\approx e' },
      { label: '∈ ⊂ ∪ ∩', latex: 'x \\in A \\cup B, \\quad A \\cap B \\subset U' },
      { label: '∀ ∃ ⇒ ⇔', latex: '\\forall x \\in \\mathbb{R}, \\exists y : x \\Rightarrow y' },
    ],
  },
];

const SCIENCE_PRESETS: {
  category: 'Physics' | 'Chemistry' | 'Circuits' | 'Biology';
  title: string;
  build: () => BoardObject[];
}[] = [
  {
    category: 'Physics',
    title: 'Newton’s Laws & Kinematics',
    build: () => [
      {
        id: uid('math'),
        name: 'Newton 2nd Law',
        type: 'math',
        x: 160,
        y: 140,
        width: 280,
        height: 80,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 5,
        latex: '\\vec{F}_{net} = m\\vec{a}, \\quad E_k = \\frac{1}{2}mv^2',
        color: '#0F172A',
        bgColor: '#EFF6FF',
        fontSize: 20,
      },
    ],
  },
  {
    category: 'Physics',
    title: 'Wave & Optics Formula',
    build: () => [
      {
        id: uid('math'),
        name: 'Wave Optics',
        type: 'math',
        x: 160,
        y: 160,
        width: 300,
        height: 80,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 5,
        latex: 'v = f\\lambda, \\quad n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2',
        color: '#0F172A',
        bgColor: '#ECFDF5',
        fontSize: 20,
      },
    ],
  },
  {
    category: 'Circuits',
    title: 'Ohm’s Law & Electric Power',
    build: () => [
      {
        id: uid('math'),
        name: 'Ohms Law',
        type: 'math',
        x: 160,
        y: 150,
        width: 320,
        height: 82,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 5,
        latex: 'V = I R, \\quad P = V I = I^2 R = \\frac{V^2}{R}',
        color: '#0F172A',
        bgColor: '#FEF3C7',
        fontSize: 20,
      },
    ],
  },
  {
    category: 'Circuits',
    title: 'Series & Parallel Resistors + RC',
    build: () => [
      {
        id: uid('math'),
        name: 'Resistors & RC Circuit',
        type: 'math',
        x: 160,
        y: 160,
        width: 360,
        height: 92,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 5,
        latex: 'R_s = \\sum R_i, \\quad \\frac{1}{R_p} = \\sum \\frac{1}{R_i}, \\quad \\tau = RC',
        color: '#0F172A',
        bgColor: '#EFF6FF',
        fontSize: 18,
      },
    ],
  },
  {
    category: 'Chemistry',
    title: 'Benzene Ring Structure',
    build: () => [
      {
        id: uid('shape'),
        name: 'Benzene Ring (C₆H₆)',
        type: 'shape',
        shapeKind: 'hexagon',
        x: 200,
        y: 150,
        width: 140,
        height: 140,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 4,
        fill: '#FEF3C7',
        stroke: '#D97706',
        strokeWidth: 3,
        text: 'C₆H₆',
        textColor: '#78350F',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 18,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      },
      {
        id: uid('shape'),
        name: 'Aromatic Core',
        type: 'shape',
        shapeKind: 'circle',
        x: 235,
        y: 185,
        width: 70,
        height: 70,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 5,
        fill: 'transparent',
        stroke: '#D97706',
        strokeWidth: 2,
        lineStyle: 'dashed',
        text: '',
        textColor: '#0F172A',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'center',
      },
    ],
  },
  {
    category: 'Chemistry',
    title: 'Equilibrium & Ideal Gas',
    build: () => [
      {
        id: uid('math'),
        name: 'Ideal Gas & Equilibrium',
        type: 'math',
        x: 160,
        y: 160,
        width: 320,
        height: 82,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 5,
        latex: 'PV = nRT, \\quad K_c = \\frac{[C]^c[D]^d}{[A]^a[B]^b}',
        color: '#0F172A',
        bgColor: '#FEF3C7',
        fontSize: 19,
      },
    ],
  },
  {
    category: 'Biology',
    title: 'Cellular Respiration Diagram',
    build: () => [
      {
        id: uid('shape'),
        name: 'Glycolysis',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 120,
        y: 160,
        width: 170,
        height: 76,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        fill: '#ECFDF5',
        stroke: '#059669',
        strokeWidth: 2,
        text: 'Glycolysis\n(Cytoplasm · 2 ATP)',
        textColor: '#065F46',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 13,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      },
      {
        id: uid('shape'),
        name: 'Krebs Cycle',
        type: 'shape',
        shapeKind: 'circle',
        x: 340,
        y: 145,
        width: 130,
        height: 110,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 3,
        fill: '#EFF6FF',
        stroke: '#2563EB',
        strokeWidth: 2,
        text: 'Krebs Cycle\n(2 ATP)',
        textColor: '#1E3A8A',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 13,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      },
      {
        id: uid('shape'),
        name: 'Electron Transport',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 520,
        y: 160,
        width: 185,
        height: 76,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 4,
        fill: '#FEF3C7',
        stroke: '#D97706',
        strokeWidth: 2,
        text: 'Electron Transport\n(~34 ATP + H₂O)',
        textColor: '#78350F',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 13,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      },
    ],
  },
];

// Full 118-element Periodic Table (Z, Symbol, Name, Atomic Mass, Group Category, Period, Col 1..18, Row 1..10)
const PERIODIC_CATEGORIES: Record<string, { label: string; bg: string; border: string }> = {
  nonmetal: { label: 'Nonmetal', bg: '#ECFDF5', border: '#10B981' },
  noble: { label: 'Noble Gas', bg: '#EFF6FF', border: '#3B82F6' },
  alkali: { label: 'Alkali Metal', bg: '#FFF1F2', border: '#F43F5E' },
  alkaline: { label: 'Alkaline Earth', bg: '#FFF7ED', border: '#F97316' },
  metalloid: { label: 'Metalloid', bg: '#FEFCE8', border: '#EAB308' },
  halogen: { label: 'Halogen', bg: '#F0FDF4', border: '#22C55E' },
  transition: { label: 'Transition Metal', bg: '#F5F3FF', border: '#8B5CF6' },
  post: { label: 'Post-Transition', bg: '#F1F5F9', border: '#64748B' },
  lanth: { label: 'Lanthanide', bg: '#FDF4FF', border: '#D946EF' },
  act: { label: 'Actinide', bg: '#FEF2F2', border: '#DC2626' },
};

const ELEMENTS_RAW: [number, string, string, string, keyof typeof PERIODIC_CATEGORIES, number, number][] = [
  [1,'H','Hydrogen','1.008','nonmetal',1,1],[2,'He','Helium','4.0026','noble',1,18],
  [3,'Li','Lithium','6.94','alkali',2,1],[4,'Be','Beryllium','9.0122','alkaline',2,2],[5,'B','Boron','10.81','metalloid',2,13],[6,'C','Carbon','12.011','nonmetal',2,14],[7,'N','Nitrogen','14.007','nonmetal',2,15],[8,'O','Oxygen','15.999','nonmetal',2,16],[9,'F','Fluorine','18.998','halogen',2,17],[10,'Ne','Neon','20.180','noble',2,18],
  [11,'Na','Sodium','22.990','alkali',3,1],[12,'Mg','Magnesium','24.305','alkaline',3,2],[13,'Al','Aluminium','26.982','post',3,13],[14,'Si','Silicon','28.085','metalloid',3,14],[15,'P','Phosphorus','30.974','nonmetal',3,15],[16,'S','Sulfur','32.06','nonmetal',3,16],[17,'Cl','Chlorine','35.45','halogen',3,17],[18,'Ar','Argon','39.948','noble',3,18],
  [19,'K','Potassium','39.098','alkali',4,1],[20,'Ca','Calcium','40.078','alkaline',4,2],[21,'Sc','Scandium','44.956','transition',4,3],[22,'Ti','Titanium','47.867','transition',4,4],[23,'V','Vanadium','50.942','transition',4,5],[24,'Cr','Chromium','51.996','transition',4,6],[25,'Mn','Manganese','54.938','transition',4,7],[26,'Fe','Iron','55.845','transition',4,8],[27,'Co','Cobalt','58.933','transition',4,9],[28,'Ni','Nickel','58.693','transition',4,10],[29,'Cu','Copper','63.546','transition',4,11],[30,'Zn','Zinc','65.38','transition',4,12],[31,'Ga','Gallium','69.723','post',4,13],[32,'Ge','Germanium','72.630','metalloid',4,14],[33,'As','Arsenic','74.922','metalloid',4,15],[34,'Se','Selenium','78.971','nonmetal',4,16],[35,'Br','Bromine','79.904','halogen',4,17],[36,'Kr','Krypton','83.798','noble',4,18],
  [37,'Rb','Rubidium','85.468','alkali',5,1],[38,'Sr','Strontium','87.62','alkaline',5,2],[39,'Y','Yttrium','88.906','transition',5,3],[40,'Zr','Zirconium','91.224','transition',5,4],[41,'Nb','Niobium','92.906','transition',5,5],[42,'Mo','Molybdenum','95.95','transition',5,6],[43,'Tc','Technetium','98','transition',5,7],[44,'Ru','Ruthenium','101.07','transition',5,8],[45,'Rh','Rhodium','102.91','transition',5,9],[46,'Pd','Palladium','106.42','transition',5,10],[47,'Ag','Silver','107.87','transition',5,11],[48,'Cd','Cadmium','112.41','transition',5,12],[49,'In','Indium','114.82','post',5,13],[50,'Sn','Tin','118.71','post',5,14],[51,'Sb','Antimony','121.76','metalloid',5,15],[52,'Te','Tellurium','127.60','metalloid',5,16],[53,'I','Iodine','126.90','halogen',5,17],[54,'Xe','Xenon','131.29','noble',5,18],
  [55,'Cs','Cesium','132.91','alkali',6,1],[56,'Ba','Barium','137.33','alkaline',6,2],[57,'La','Lanthanum','138.91','lanth',9,4],[58,'Ce','Cerium','140.12','lanth',9,5],[59,'Pr','Praseodymium','140.91','lanth',9,6],[60,'Nd','Neodymium','144.24','lanth',9,7],[61,'Pm','Promethium','145','lanth',9,8],[62,'Sm','Samarium','150.36','lanth',9,9],[63,'Eu','Europium','151.96','lanth',9,10],[64,'Gd','Gadolinium','157.25','lanth',9,11],[65,'Tb','Terbium','158.93','lanth',9,12],[66,'Dy','Dysprosium','162.50','lanth',9,13],[67,'Ho','Holmium','164.93','lanth',9,14],[68,'Er','Erbium','167.26','lanth',9,15],[69,'Tm','Thulium','168.93','lanth',9,16],[70,'Yb','Ytterbium','173.05','lanth',9,17],[71,'Lu','Lutetium','174.97','lanth',9,18],
  [72,'Hf','Hafnium','178.49','transition',6,4],[73,'Ta','Tantalum','180.95','transition',6,5],[74,'W','Tungsten','183.84','transition',6,6],[75,'Re','Rhenium','186.21','transition',6,7],[76,'Os','Osmium','190.23','transition',6,8],[77,'Ir','Iridium','192.22','transition',6,9],[78,'Pt','Platinum','195.08','transition',6,10],[79,'Au','Gold','196.97','transition',6,11],[80,'Hg','Mercury','200.59','transition',6,12],[81,'Tl','Thallium','204.38','post',6,13],[82,'Pb','Lead','207.2','post',6,14],[83,'Bi','Bismuth','208.98','post',6,15],[84,'Po','Polonium','209','metalloid',6,16],[85,'At','Astatine','210','halogen',6,17],[86,'Rn','Radon','222','noble',6,18],
  [87,'Fr','Francium','223','alkali',7,1],[88,'Ra','Radium','226','alkaline',7,2],[89,'Ac','Actinium','227','act',10,4],[90,'Th','Thorium','232.04','act',10,5],[91,'Pa','Protactinium','231.04','act',10,6],[92,'U','Uranium','238.03','act',10,7],[93,'Np','Neptunium','237','act',10,8],[94,'Pu','Plutonium','244','act',10,9],[95,'Am','Americium','243','act',10,10],[96,'Cm','Curium','247','act',10,11],[97,'Bk','Berkelium','247','act',10,12],[98,'Cf','Californium','251','act',10,13],[99,'Es','Einsteinium','252','act',10,14],[100,'Fm','Fermium','257','act',10,15],[101,'Md','Mendelevium','258','act',10,16],[102,'No','Nobelium','259','act',10,17],[103,'Lr','Lawrencium','266','act',10,18],
  [104,'Rf','Rutherfordium','267','transition',7,4],[105,'Db','Dubnium','268','transition',7,5],[106,'Sg','Seaborgium','269','transition',7,6],[107,'Bh','Bohrium','270','transition',7,7],[108,'Hs','Hassium','277','transition',7,8],[109,'Mt','Meitnerium','278','transition',7,9],[110,'Ds','Darmstadtium','281','transition',7,10],[111,'Rg','Roentgenium','282','transition',7,11],[112,'Cn','Copernicium','285','transition',7,12],[113,'Nh','Nihonium','286','post',7,13],[114,'Fl','Flerovium','289','post',7,14],[115,'Mc','Moscovium','290','post',7,15],[116,'Lv','Livermorium','293','post',7,16],[117,'Ts','Tennessine','294','halogen',7,17],[118,'Og','Oganesson','294','noble',7,18],
];

export const MathScienceModal: React.FC<MathScienceModalProps> = ({
  open,
  initialTab,
  editingObject,
  onClose,
  instruments,
  onToggleInstrument,
  onInsertObjects,
  onUpdateExistingObject,
}) => {
  const [tab, setTab] = useState<'equation' | 'graph' | 'geometry' | 'science' | 'periodic' | 'simulator'>(
    initialTab || 'equation'
  );
  const [latex, setLatex] = useState('\\int_{0}^{\\pi} \\sin(x)\\,dx = 2');

  const [graphMode, setGraphMode] = useState<'2d' | 'polar' | 'parametric' | '3d'>('2d');
  const [exprList, setExprList] = useState([
    { id: '1', expr: 'a * sin(b * x) + k', color: '#2563EB', visible: true },
    { id: '2', expr: '0.25 * x^2 - 1', color: '#059669', visible: true },
  ]);
  const [surfaceExpr, setSurfaceExpr] = useState('sin(sqrt(x^2 + y^2))');
  const [paramA, setParamA] = useState(2);
  const [paramB, setParamB] = useState(1);
  const [paramK, setParamK] = useState(0);
  const [showDerivative, setShowDerivative] = useState(false);
  const [shadeInequality, setShadeInequality] = useState<'none' | 'above' | 'below'>('none');
  const [hoverTrace, setHoverTrace] = useState<{ x: number; y: number } | null>(null);
  const [xMin, setXMin] = useState(-8);
  const [xMax, setXMax] = useState(8);
  const [yMin, setYMin] = useState(-6);
  const [yMax, setYMax] = useState(6);

  // Periodic table state
  const [selectedEl, setSelectedEl] = useState<(typeof ELEMENTS_RAW)[number]>(ELEMENTS_RAW[5]);

  // Interactive Simulator state
  const [simType, setSimType] = useState<'projectile' | 'optics' | 'circuit'>('projectile');
  const [projSpeed, setProjSpeed] = useState(28);
  const [projAngle, setProjAngle] = useState(45);
  const [opticsN1, setOpticsN1] = useState(1.0);
  const [opticsN2, setOpticsN2] = useState(1.5);
  const [opticsAngle, setOpticsAngle] = useState(38);
  const [circuitV, setCircuitV] = useState(12);
  const [circuitR1, setCircuitR1] = useState(100);
  const [circuitR2, setCircuitR2] = useState(220);

  useEffect(() => {
    if (!open) return;
    if (initialTab) {
      setTab(initialTab);
    } else if (editingObject?.type === 'graph') {
      setTab('graph');
    } else if (editingObject?.type === 'math') {
      setTab('equation');
    }

    if (editingObject?.type === 'math') {
      setLatex(editingObject.latex);
    } else if (editingObject?.type === 'graph') {
      setGraphMode(editingObject.mode);
      setXMin(editingObject.xMin);
      setXMax(editingObject.xMax);
      setYMin(editingObject.yMin);
      setYMax(editingObject.yMax);
      setShowDerivative(Boolean(editingObject.showDerivative));
      setShadeInequality(editingObject.shadeInequality || 'none');
      if (editingObject.params) {
        setParamA(editingObject.params.a ?? 2);
        setParamB(editingObject.params.b ?? 1);
        setParamK(editingObject.params.k ?? 0);
      }
      if (editingObject.mode === '3d') {
        setSurfaceExpr(editingObject.expressions[0]?.expr || 'sin(sqrt(x^2 + y^2))');
      } else if (editingObject.expressions.length > 0) {
        setExprList(editingObject.expressions);
      }
    }
  }, [editingObject, initialTab, open]);

  const { previewHtml, latexError } = useMemo(() => {
    try {
      const html = katex.renderToString(latex || 'x', { throwOnError: true, displayMode: true });
      return { previewHtml: html, latexError: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid LaTeX syntax';
      const fallback = katex.renderToString(latex || 'x', { throwOnError: false, displayMode: true });
      return { previewHtml: fallback, latexError: msg };
    }
  }, [latex]);

  // Graph preview computation & syntax verification
  const graphEval = useMemo(() => {
    const errors: string[] = [];
    const w = 440;
    const h = 230;
    const safeXMin = Number.isFinite(xMin) ? xMin : -10;
    const safeXMax = Number.isFinite(xMax) && xMax > safeXMin ? xMax : safeXMin + 0.5;
    const safeYMin = Number.isFinite(yMin) ? yMin : -6;
    const safeYMax = Number.isFinite(yMax) && yMax > safeYMin ? yMax : safeYMin + 0.5;
    const spanX = Math.max(0.05, safeXMax - safeXMin);
    const spanY = Math.max(0.05, safeYMax - safeYMin);
    const toPx = (x: number, y: number) => ({
      px: ((x - safeXMin) / spanX) * w,
      py: h - ((y - safeYMin) / spanY) * h,
    });
    const curves: {
      id: string;
      color: string;
      path: string;
      shadePaths: string[];
      derivPath?: string;
      roots: { x: number; y: number }[];
      compiled?: { evaluate: (scope?: Record<string, number>) => unknown };
    }[] = [];

    if (graphMode === '3d') {
      try {
        compileMath(surfaceExpr || 'sin(x)*cos(y)');
      } catch (e) {
        errors.push(`z = ${surfaceExpr}: ${e instanceof Error ? e.message : 'Invalid syntax'}`);
      }
      return { w, h, safeXMin, safeXMax, safeYMin, safeYMax, curves, errors, toPx };
    }

    for (const item of exprList) {
      if (!item.visible || !item.expr.trim()) continue;
      try {
        if (graphMode === 'parametric') {
          const [exStr, eyStr = 'sin(t)'] = item.expr.split(';');
          const fx = compileMath(exStr.trim());
          const fy = compileMath(eyStr.trim());
          const pts: string[] = [];
          let penUp = true;
          let prevX: number | null = null;
          let prevY: number | null = null;
          for (let i = 0; i <= 200; i++) {
            const t = (i / 200) * Math.PI * 2;
            const xv = Number(fx.evaluate({ t, a: paramA, b: paramB, k: paramK }));
            const yv = Number(fy.evaluate({ t, a: paramA, b: paramB, k: paramK }));
            if (!Number.isFinite(xv) || !Number.isFinite(yv) || Math.abs(xv) > 1e5 || Math.abs(yv) > 1e5) {
              penUp = true;
              prevX = null;
              prevY = null;
              continue;
            }
            if (prevX !== null && prevY !== null && (Math.abs(xv - prevX) > spanX * 1.4 || Math.abs(yv - prevY) > spanY * 1.4)) {
              penUp = true;
            }
            const { px, py } = toPx(xv, yv);
            pts.push(`${penUp ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
            penUp = false;
            prevX = xv;
            prevY = yv;
          }
          curves.push({ id: item.id, color: item.color, path: pts.join(' '), shadePaths: [], roots: [] });
          continue;
        }

        const compiled = compileMath(item.expr);
        const pts: string[] = [];
        const dPts: string[] = [];
        const shadePaths: string[] = [];
        const roots: { x: number; y: number }[] = [];
        let penUp = true;
        let dPenUp = true;
        let prevY: number | null = null;
        let prevX: number | null = null;
        let prevDy: number | null = null;
        let shadeSeg: { px: number; py: number }[] = [];

        const flushShadeSeg = () => {
          if (shadeSeg.length >= 2 && shadeInequality !== 'none') {
            const baseY = shadeInequality === 'above' ? 0 : h;
            const d = [
              `M ${shadeSeg[0].px.toFixed(1)} ${baseY}`,
              ...shadeSeg.map((p) => `L ${p.px.toFixed(1)} ${p.py.toFixed(1)}`),
              `L ${shadeSeg[shadeSeg.length - 1].px.toFixed(1)} ${baseY} Z`,
            ].join(' ');
            shadePaths.push(d);
          }
          shadeSeg = [];
        };

        if (graphMode === 'polar') {
          for (let i = 0; i <= 240; i++) {
            const theta = (i / 240) * Math.PI * 2;
            const r = Number(compiled.evaluate({ theta, t: theta, x: theta, a: paramA, b: paramB, k: paramK }));
            if (!Number.isFinite(r) || Math.abs(r) > spanX * 4) {
              penUp = true;
              continue;
            }
            const xv = r * Math.cos(theta);
            const yv = r * Math.sin(theta);
            const { px, py } = toPx(xv, yv);
            pts.push(`${penUp ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
            penUp = false;
          }
          curves.push({ id: item.id, color: item.color, path: pts.join(' '), shadePaths: [], roots: [] });
        } else {
          const steps = 180;
          const dx = spanX / steps;
          for (let i = 0; i <= steps; i++) {
            const xv = safeXMin + i * dx;
            const yv = Number(compiled.evaluate({ x: xv, a: paramA, b: paramB, k: paramK }));
            if (!Number.isFinite(yv) || Math.abs(yv) > 1e5) {
              penUp = true;
              prevY = null;
              flushShadeSeg();
              continue;
            }
            // Asymptote break detection
            if (prevY !== null && Math.abs(yv - prevY) > spanY * 1.4) {
              penUp = true;
              flushShadeSeg();
            }
            const { px, py } = toPx(xv, yv);
            pts.push(`${penUp ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
            shadeSeg.push({ px, py });
            penUp = false;

            if (prevY !== null && prevX !== null && ((prevY <= 0 && yv >= 0) || (prevY >= 0 && yv <= 0)) && Math.abs(yv - prevY) < spanY) {
              const rx = prevX + (xv - prevX) * (Math.abs(prevY) / (Math.abs(prevY) + Math.abs(yv) || 1));
              if (roots.length < 6) roots.push({ x: Number(rx.toFixed(2)), y: 0 });
            }

            if (showDerivative) {
              const hStep = dx * 0.25;
              const yPlus = Number(compiled.evaluate({ x: xv + hStep, a: paramA, b: paramB, k: paramK }));
              const yMinus = Number(compiled.evaluate({ x: xv - hStep, a: paramA, b: paramB, k: paramK }));
              const dy = (yPlus - yMinus) / (2 * hStep);
              if (Number.isFinite(dy) && Math.abs(dy) < spanY * 4) {
                if (prevDy !== null && Math.abs(dy - prevDy) > spanY * 1.4) {
                  dPenUp = true;
                }
                const dp = toPx(xv, dy);
                dPts.push(`${dPenUp ? 'M' : 'L'} ${dp.px.toFixed(1)} ${dp.py.toFixed(1)}`);
                dPenUp = false;
                prevDy = dy;
              } else {
                dPenUp = true;
                prevDy = null;
              }
            }
            prevY = yv;
            prevX = xv;
          }
          flushShadeSeg();
          curves.push({
            id: item.id,
            color: item.color,
            path: pts.join(' '),
            shadePaths,
            derivPath: dPts.join(' '),
            roots,
            compiled,
          });
        }
      } catch (e) {
        errors.push(`"${item.expr}": ${e instanceof Error ? e.message : 'Syntax error'}`);
      }
    }
    return { w, h, safeXMin, safeXMax, safeYMin, safeYMax, curves, errors, toPx };
  }, [exprList, graphMode, paramA, paramB, paramK, shadeInequality, showDerivative, surfaceExpr, xMax, xMin, yMax, yMin]);

  if (!open) return null;

  const isEditingMath = editingObject?.type === 'math';
  const isEditingGraph = editingObject?.type === 'graph';

  const insertEquation = () => {
    if (isEditingMath && onUpdateExistingObject) {
      onUpdateExistingObject(editingObject.id, {
        latex,
        width: Math.max(editingObject.width, Math.min(540, latex.length * 10 + 80)),
      });
      onClose();
      return;
    }
    onInsertObjects([
      {
        id: uid('math'),
        name: 'Equation',
        type: 'math',
        x: 160,
        y: 140,
        width: Math.max(240, Math.min(540, latex.length * 10 + 80)),
        height: 88,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 20,
        latex,
        color: '#0F172A',
        bgColor: '#FFFFFF',
        fontSize: 22,
      },
    ]);
    onClose();
  };

  const insertGraph = () => {
    const expressions =
      graphMode === '3d'
        ? [{ id: 's1', expr: surfaceExpr, color: '#2563EB', visible: true }]
        : exprList;
    const title = graphMode === '3d' ? `z = ${surfaceExpr}` : exprList.map((e) => e.expr).join(' , ');
    const params = { a: paramA, b: paramB, k: paramK };

    const finalXMin = graphEval.safeXMin;
    const finalXMax = graphEval.safeXMax;
    const finalYMin = graphEval.safeYMin;
    const finalYMax = graphEval.safeYMax;

    if (isEditingGraph && onUpdateExistingObject) {
      onUpdateExistingObject(editingObject.id, {
        mode: graphMode,
        expressions,
        xMin: finalXMin,
        xMax: finalXMax,
        yMin: finalYMin,
        yMax: finalYMax,
        title,
        params,
        showDerivative,
        shadeInequality,
      });
      onClose();
      return;
    }

    const graphObj: GraphObject = {
      id: uid('graph'),
      name: graphMode === '3d' ? '3D Surface Plot' : graphMode === 'polar' ? 'Polar Plot' : graphMode === 'parametric' ? 'Parametric Plot' : '2D Function Plot',
      type: 'graph',
      x: 140,
      y: 120,
      width: 480,
      height: 360,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 20,
      mode: graphMode,
      expressions,
      xMin: finalXMin,
      xMax: finalXMax,
      yMin: finalYMin,
      yMax: finalYMax,
      showGrid: true,
      title,
      params,
      showDerivative,
      shadeInequality,
    };
    onInsertObjects([graphObj]);
    onClose();
  };

  const insertCircuitComponent = (shapeKind: ShapeKind, label: string) => {
    onInsertObjects([
      {
        id: uid('shape'),
        name: label,
        type: 'shape',
        shapeKind,
        x: 200,
        y: 180,
        width: 110,
        height: 64,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 20,
        fill: '#FFFFFF',
        stroke: '#0F172A',
        strokeWidth: 2,
        text: label,
        textColor: '#0F172A',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 12,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      },
    ]);
  };

  // Simulator calculations
  const g = 9.81;
  const radProj = (projAngle * Math.PI) / 180;
  const projTime = (2 * projSpeed * Math.sin(radProj)) / g;
  const projRange = (projSpeed * projSpeed * Math.sin(2 * radProj)) / g;
  const projMaxH = (projSpeed * projSpeed * Math.sin(radProj) ** 2) / (2 * g);

  const sinTheta2 = (opticsN1 / Math.max(0.01, opticsN2)) * Math.sin((opticsAngle * Math.PI) / 180);
  const totalInternalReflection = Math.abs(sinTheta2) > 1;
  const refractedDeg = totalInternalReflection ? 90 : (Math.asin(sinTheta2) * 180) / Math.PI;

  const rTotalSeries = circuitR1 + circuitR2;
  const rTotalParallel = (circuitR1 * circuitR2) / Math.max(1e-9, circuitR1 + circuitR2);
  const iSeries = circuitV / Math.max(1e-9, rTotalSeries);
  const iParallel = circuitV / Math.max(1e-9, rTotalParallel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-6">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Calculator className="w-5 h-5 text-blue-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              Mathematics, Graphing &amp; Science Studio
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 sm:px-5 pt-2.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar shrink-0">
          {[
            { id: 'equation', label: 'Equation Editor', icon: FunctionSquare },
            { id: 'graph', label: '2D / 3D Graph Plotter', icon: LineChart },
            { id: 'geometry', label: 'Geometry', icon: Ruler },
            { id: 'science', label: 'Science Presets', icon: Atom },
            { id: 'periodic', label: 'Periodic Table (118)', icon: FlaskConical },
            { id: 'simulator', label: 'STEM Simulators', icon: Sliders },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 studio-scroll">
          {tab === 'equation' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 min-h-[84px] flex items-center justify-center text-slate-900 dark:text-slate-100 overflow-x-auto">
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>

              {latexError && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-mono">
                  LaTeX syntax warning: {latexError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  LaTeX Expression
                </label>
                <textarea
                  value={latex}
                  onChange={(e) => setLatex(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EQUATION_GROUPS.map((grp) => (
                  <div key={grp.label} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">{grp.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {grp.items.map((item) => (
                        <button
                          key={item.label}
                          onClick={() => setLatex((prev) => (prev ? `${prev} ${item.latex}` : item.latex))}
                          className="px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-slate-800 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setLatex('')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Clear
                </button>
                <button
                  onClick={insertEquation}
                  className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {isEditingMath ? 'Update Equation on Board' : 'Insert Equation on Board'}
                </button>
              </div>
            </div>
          )}

          {tab === 'graph' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: '2d', label: '2D y = f(x)' },
                  { id: 'polar', label: 'Polar r = f(θ)' },
                  { id: 'parametric', label: 'Parametric (x(t); y(t))' },
                  { id: '3d', label: '3D z = f(x, y)' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setGraphMode(m.id as typeof graphMode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      graphMode === m.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Live SVG Graph Preview with Numeric Ticks, Hover Trace & Roots */}
              {graphMode !== '3d' && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2 relative">
                  <svg
                    viewBox={`0 0 ${graphEval.w} ${graphEval.h}`}
                    className="w-full h-48 cursor-crosshair"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                      const wx = graphEval.safeXMin + rx * (graphEval.safeXMax - graphEval.safeXMin);
                      let wy = graphEval.safeYMax - ry * (graphEval.safeYMax - graphEval.safeYMin);
                      const firstCurve = graphEval.curves.find((c) => c.compiled);
                      if (graphMode === '2d' && firstCurve?.compiled) {
                        try {
                          const fxVal = Number(
                            firstCurve.compiled.evaluate({ x: wx, a: paramA, b: paramB, k: paramK })
                          );
                          if (Number.isFinite(fxVal)) wy = fxVal;
                        } catch {
                          // fallback to cursor y
                        }
                      }
                      setHoverTrace({ x: Number(wx.toFixed(2)), y: Number(wy.toFixed(2)) });
                    }}
                    onMouseLeave={() => setHoverTrace(null)}
                  >
                    {/* Axis lines */}
                    {(() => {
                      const origin = graphEval.toPx(0, 0);
                      return (
                        <>
                          <line x1={0} y1={origin.py} x2={graphEval.w} y2={origin.py} stroke="#94A3B8" strokeWidth={1} />
                          <line x1={origin.px} y1={0} x2={origin.px} y2={graphEval.h} stroke="#94A3B8" strokeWidth={1} />
                        </>
                      );
                    })()}
                    {graphEval.curves.map((c) => (
                      <g key={c.id}>
                        {c.shadePaths.map((sp, sIdx) => (
                          <path key={sIdx} d={sp} fill={c.color} fillOpacity={0.14} stroke="none" />
                        ))}
                        <path d={c.path} fill="none" stroke={c.color} strokeWidth={2.2} />
                        {c.derivPath && (
                          <path d={c.derivPath} fill="none" stroke={c.color} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.7} />
                        )}
                        {c.roots.map((rt, rIdx) => {
                          const p = graphEval.toPx(rt.x, rt.y);
                          return (
                            <g key={rIdx}>
                              <circle cx={p.px} cy={p.py} r={4} fill="#F59E0B" stroke="#FFFFFF" strokeWidth={1} />
                              <text x={p.px + 5} y={p.py - 5} fontSize="9" fill="#B45309">
                                ({rt.x}, 0)
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    ))}
                    {hoverTrace && (() => {
                      const hp = graphEval.toPx(hoverTrace.x, hoverTrace.y);
                      return (
                        <g pointerEvents="none">
                          <line x1={hp.px} y1={0} x2={hp.px} y2={graphEval.h} stroke="#64748B" strokeWidth={0.75} strokeDasharray="3 3" />
                          {hp.py >= 0 && hp.py <= graphEval.h && (
                            <circle cx={hp.px} cy={hp.py} r={3.5} fill="#2563EB" stroke="#FFFFFF" strokeWidth={1.2} />
                          )}
                        </g>
                      );
                    })()}
                  </svg>
                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500 px-1 pt-1">
                    <span>
                      X: [{graphEval.safeXMin}, {graphEval.safeXMax}] · Y: [{graphEval.safeYMin}, {graphEval.safeYMax}]
                    </span>
                    <span>
                      {hoverTrace ? `${graphMode === '2d' ? 'f(x)' : 'Trace'}: (${hoverTrace.x}, ${hoverTrace.y})` : 'Hover plot to trace (x, y) · Amber dots = roots'}
                    </span>
                  </div>
                </div>
              )}

              {graphEval.errors.length > 0 && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-mono">
                  {graphEval.errors.join(' | ')}
                </div>
              )}

              {/* Parameter Sliders (a, b, k) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                {[
                  { name: 'a', val: paramA, set: setParamA, min: -5, max: 5 },
                  { name: 'b', val: paramB, set: setParamB, min: -5, max: 5 },
                  { name: 'k', val: paramK, set: setParamK, min: -5, max: 5 },
                ].map((s) => (
                  <label key={s.name} className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>{s.name}</span>
                      <span>{s.val.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={0.1}
                      value={s.val}
                      onChange={(e) => s.set(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </label>
                ))}
              </div>

              {graphMode === '3d' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    3D Surface Expression z = f(x, y)
                  </label>
                  <input
                    value={surfaceExpr}
                    onChange={(e) => setSurfaceExpr(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                    placeholder="sin(sqrt(x^2 + y^2))"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  {exprList.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={item.color}
                        onChange={(e) =>
                          setExprList((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, color: e.target.value } : p))
                          )
                        }
                        className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                      />
                      <span className="text-xs font-mono text-slate-500 w-12">
                        {graphMode === 'polar' ? 'r =' : graphMode === 'parametric' ? 'x;y =' : 'y ='}
                      </span>
                      <input
                        value={item.expr}
                        onChange={(e) =>
                          setExprList((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, expr: e.target.value } : p))
                          )
                        }
                        className="flex-1 px-3 py-1.5 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                      {exprList.length > 1 && (
                        <button
                          onClick={() => setExprList((prev) => prev.filter((_, i) => i !== idx))}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() =>
                        setExprList((prev) => [
                          ...prev,
                          {
                            id: uid('ex'),
                            expr:
                              graphMode === 'polar'
                                ? '2 * cos(3 * theta)'
                                : graphMode === 'parametric'
                                  ? '3*cos(t); 2*sin(t)'
                                  : 'cos(x)',
                            color: '#D97706',
                            visible: true,
                          },
                        ])
                      }
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      + Add Equation Curve
                    </button>

                    {graphMode === '2d' && (
                      <div className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={showDerivative}
                            onChange={(e) => setShowDerivative(e.target.checked)}
                          />
                          <span>Show f&apos;(x) Derivative</span>
                        </label>
                        <select
                          value={shadeInequality}
                          onChange={(e) => setShadeInequality(e.target.value as typeof shadeInequality)}
                          className="px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                        >
                          <option value="none">No Inequality Shade</option>
                          <option value="below">Shade y ≤ f(x)</option>
                          <option value="above">Shade y ≥ f(x)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'X Min', val: xMin, set: setXMin },
                  { label: 'X Max', val: xMax, set: setXMax },
                  { label: 'Y Min', val: yMin, set: setYMin },
                  { label: 'Y Max', val: yMax, set: setYMax },
                ].map((b) => (
                  <div key={b.label}>
                    <label className="block text-[11px] text-slate-500 mb-1">{b.label}</label>
                    <input
                      type="number"
                      value={b.val}
                      onChange={(e) => b.set(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={insertGraph}
                  className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {isEditingGraph ? 'Update Graph on Board' : 'Insert Interactive Graph on Board'}
                </button>
              </div>
            </div>
          )}

          {tab === 'geometry' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Toggle physical geometry instruments directly onto the canvas. Drag to position, rotate via the handle, snap pen strokes along the ruler/set-square edge, draw exact protractor rays, or stamp compass circles/arcs.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['ruler', 'protractor', 'compass', 'set_square'] as const).map((kind) => {
                  const active = instruments.some((i) => i.kind === kind && i.visible);
                  return (
                    <button
                      key={kind}
                      onClick={() => onToggleInstrument(kind)}
                      className={`p-3.5 rounded-lg border text-left transition-colors ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-600 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Compass className="w-5 h-5 mb-2" />
                      <div className="text-xs font-semibold capitalize">{kind.replace('_', ' ')}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{active ? 'Active on Board' : 'Click to Show'}</div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Quick Geometric Constructions
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Coordinate Axes', kind: 'math_axes' as ShapeKind, w: 260, h: 260 },
                    { label: '3D Cube', kind: 'math_cube' as ShapeKind, w: 140, h: 140 },
                    { label: 'Cylinder', kind: 'math_cylinder' as ShapeKind, w: 110, h: 150 },
                    { label: 'Cone', kind: 'math_cone' as ShapeKind, w: 120, h: 150 },
                    { label: 'Right Triangle', kind: 'right_triangle' as ShapeKind, w: 160, h: 130 },
                    { label: 'Regular Hexagon', kind: 'hexagon' as ShapeKind, w: 140, h: 140 },
                  ].map((gItem) => (
                    <button
                      key={gItem.label}
                      onClick={() => {
                        onInsertObjects([
                          {
                            id: uid('shape'),
                            name: gItem.label,
                            type: 'shape',
                            shapeKind: gItem.kind,
                            x: 180,
                            y: 160,
                            width: gItem.w,
                            height: gItem.h,
                            rotation: 0,
                            opacity: 1,
                            locked: false,
                            hidden: false,
                            zIndex: 20,
                            fill: 'rgba(37,99,235,0.08)',
                            stroke: '#2563EB',
                            strokeWidth: 2,
                            text: '',
                            textColor: '#0F172A',
                            fontFamily: 'Plus Jakarta Sans',
                            fontSize: 13,
                            fontWeight: 'normal',
                            fontStyle: 'normal',
                            textAlign: 'center',
                          },
                        ]);
                        onClose();
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      + {gItem.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'science' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Electric Circuit Components
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { kind: 'circuit_resistor' as ShapeKind, label: 'Resistor (R)' },
                    { kind: 'circuit_capacitor' as ShapeKind, label: 'Capacitor (C)' },
                    { kind: 'circuit_battery' as ShapeKind, label: 'Battery (V)' },
                    { kind: 'circuit_switch' as ShapeKind, label: 'Switch' },
                    { kind: 'circuit_ground' as ShapeKind, label: 'Ground' },
                    { kind: 'circuit_led' as ShapeKind, label: 'LED / Bulb' },
                  ].map((c) => (
                    <button
                      key={c.kind}
                      onClick={() => {
                        insertCircuitComponent(c.kind, c.label);
                        onClose();
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800"
                    >
                      + {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Physics, Chemistry, Circuits &amp; Biology Modules
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SCIENCE_PRESETS.map((sp) => (
                    <button
                      key={sp.title}
                      onClick={() => {
                        onInsertObjects(sp.build());
                        onClose();
                      }}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-left"
                    >
                      <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400">{sp.category}</div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{sp.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'periodic' && (
            <div className="space-y-3">
              {/* Selected Element Card + Insert */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      backgroundColor: PERIODIC_CATEGORIES[selectedEl[4]].bg,
                      borderColor: PERIODIC_CATEGORIES[selectedEl[4]].border,
                    }}
                    className="w-14 h-14 rounded-lg border-2 flex flex-col items-center justify-center text-slate-900"
                  >
                    <span className="text-[10px] font-mono leading-none">{selectedEl[0]}</span>
                    <span className="text-lg font-bold leading-tight">{selectedEl[1]}</span>
                    <span className="text-[8px] font-mono leading-none">{selectedEl[3]}</span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {selectedEl[2]} ({selectedEl[1]})
                    </div>
                    <div className="text-xs text-slate-500">
                      Atomic #{selectedEl[0]} · Mass {selectedEl[3]} u · {PERIODIC_CATEGORIES[selectedEl[4]].label}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const cat = PERIODIC_CATEGORIES[selectedEl[4]];
                    onInsertObjects([
                      {
                        id: uid('shape'),
                        name: `${selectedEl[2]} (${selectedEl[1]})`,
                        type: 'shape',
                        shapeKind: 'rounded_rect',
                        x: 200,
                        y: 160,
                        width: 130,
                        height: 130,
                        rotation: 0,
                        opacity: 1,
                        locked: false,
                        hidden: false,
                        zIndex: 20,
                        fill: cat.bg,
                        stroke: cat.border,
                        strokeWidth: 2.5,
                        text: `${selectedEl[0]}   ${selectedEl[3]}\n${selectedEl[1]}\n${selectedEl[2]}`,
                        textColor: '#0F172A',
                        fontFamily: 'Plus Jakarta Sans',
                        fontSize: 15,
                        fontWeight: 'bold',
                        fontStyle: 'normal',
                        textAlign: 'center',
                      },
                    ]);
                    onClose();
                  }}
                  className="px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  Insert Element Card to Board
                </button>
              </div>

              {/* 18-Column Grid */}
              <div className="overflow-x-auto pb-1">
                <div
                  className="grid gap-1 min-w-[680px]"
                  style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}
                >
                  {ELEMENTS_RAW.map((el) => {
                    const cat = PERIODIC_CATEGORIES[el[4]];
                    const isSel = selectedEl[0] === el[0];
                    return (
                      <button
                        key={el[0]}
                        onClick={() => setSelectedEl(el)}
                        style={{
                          gridColumn: el[6],
                          gridRow: el[5],
                          backgroundColor: cat.bg,
                          borderColor: isSel ? '#2563EB' : cat.border,
                        }}
                        className={`p-1 rounded border text-center text-slate-900 transition-transform ${
                          isSel ? 'ring-2 ring-blue-500 scale-105 z-10' : 'hover:scale-105'
                        }`}
                        title={`${el[0]} ${el[2]} (${el[3]})`}
                      >
                        <div className="text-[8px] font-mono leading-none opacity-75">{el[0]}</div>
                        <div className="text-[11px] font-bold leading-tight">{el[1]}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'simulator' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'projectile', label: 'Projectile Motion' },
                  { id: 'optics', label: "Snell's Law Optics" },
                  { id: 'circuit', label: 'DC Resistor Lab' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSimType(s.id as typeof simType)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                      simType === s.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {simType === 'projectile' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs">
                      Initial Speed v₀: <strong>{projSpeed} m/s</strong>
                      <input type="range" min={5} max={60} value={projSpeed} onChange={(e) => setProjSpeed(Number(e.target.value))} className="w-full accent-blue-600" />
                    </label>
                    <label className="text-xs">
                      Launch Angle θ: <strong>{projAngle}°</strong>
                      <input type="range" min={5} max={85} value={projAngle} onChange={(e) => setProjAngle(Number(e.target.value))} className="w-full accent-blue-600" />
                    </label>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    <svg viewBox="0 0 420 150" className="w-full h-36">
                      <line x1={20} y1={130} x2={400} y2={130} stroke="#64748B" strokeWidth={1.5} />
                      {(() => {
                        const scaleX = 360 / Math.max(40, projRange * 1.15);
                        const scaleY = 100 / Math.max(15, projMaxH * 1.25);
                        const pts: string[] = [];
                        for (let i = 0; i <= 40; i++) {
                          const t = (i / 40) * projTime;
                          const x = projSpeed * Math.cos(radProj) * t;
                          const y = Math.max(0, projSpeed * Math.sin(radProj) * t - 0.5 * g * t * t);
                          pts.push(`${i === 0 ? 'M' : 'L'} ${(20 + x * scaleX).toFixed(1)} ${(130 - y * scaleY).toFixed(1)}`);
                        }
                        return <path d={pts.join(' ')} fill="none" stroke="#2563EB" strokeWidth={2.5} />;
                      })()}
                    </svg>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1 text-center">
                      <div>Range: <strong>{projRange.toFixed(1)} m</strong></div>
                      <div>Max H: <strong>{projMaxH.toFixed(1)} m</strong></div>
                      <div>Flight: <strong>{projTime.toFixed(2)} s</strong></div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onInsertObjects([
                        {
                          id: uid('math'),
                          name: 'Projectile Results',
                          type: 'math',
                          x: 180,
                          y: 160,
                          width: 340,
                          height: 92,
                          rotation: 0,
                          opacity: 1,
                          locked: false,
                          hidden: false,
                          zIndex: 20,
                          latex: `v_0=${projSpeed}\\text{ m/s},\\ \\theta=${projAngle}^\\circ \\Rightarrow R=${projRange.toFixed(1)}\\text{m},\\ H=${projMaxH.toFixed(1)}\\text{m}`,
                          color: '#0F172A',
                          bgColor: '#EFF6FF',
                          fontSize: 17,
                        },
                      ]);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                    Stamp Simulation to Board
                  </button>
                </div>
              )}

              {simType === 'optics' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="text-xs">
                      n₁: <strong>{opticsN1.toFixed(2)}</strong>
                      <input type="range" min={1.0} max={2.4} step={0.05} value={opticsN1} onChange={(e) => setOpticsN1(Number(e.target.value))} className="w-full accent-blue-600" />
                    </label>
                    <label className="text-xs">
                      n₂: <strong>{opticsN2.toFixed(2)}</strong>
                      <input type="range" min={1.0} max={2.4} step={0.05} value={opticsN2} onChange={(e) => setOpticsN2(Number(e.target.value))} className="w-full accent-blue-600" />
                    </label>
                    <label className="text-xs">
                      Incident θ₁: <strong>{opticsAngle}°</strong>
                      <input type="range" min={5} max={85} value={opticsAngle} onChange={(e) => setOpticsAngle(Number(e.target.value))} className="w-full accent-blue-600" />
                    </label>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    <svg viewBox="0 0 360 160" className="w-full h-36">
                      <rect x={0} y={80} width={360} height={80} fill="rgba(59,130,246,0.12)" />
                      <line x1={0} y1={80} x2={360} y2={80} stroke="#0F172A" strokeWidth={1.5} />
                      <line x1={180} y1={10} x2={180} y2={150} stroke="#94A3B8" strokeDasharray="4 4" />
                      {(() => {
                        const r1 = (opticsAngle * Math.PI) / 180;
                        const ix = 180 - Math.sin(r1) * 70;
                        const iy = 80 - Math.cos(r1) * 70;
                        const r2 = (refractedDeg * Math.PI) / 180;
                        const rx = totalInternalReflection ? 180 + Math.sin(r1) * 70 : 180 + Math.sin(r2) * 70;
                        const ry = totalInternalReflection ? 80 - Math.cos(r1) * 70 : 80 + Math.cos(r2) * 70;
                        return (
                          <>
                            <line x1={ix} y1={iy} x2={180} y2={80} stroke="#EF4444" strokeWidth={2.5} />
                            <line x1={180} y1={80} x2={rx} y2={ry} stroke={totalInternalReflection ? '#F59E0B' : '#2563EB'} strokeWidth={2.5} />
                          </>
                        );
                      })()}
                    </svg>
                    <div className="text-xs font-mono text-center">
                      {totalInternalReflection
                        ? 'Total Internal Reflection!'
                        : `Refracted θ₂ = ${refractedDeg.toFixed(1)}°`}
                    </div>
                  </div>
                </div>
              )}

              {simType === 'circuit' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="text-xs">
                      Voltage V: <strong>{circuitV} V</strong>
                      <input type="range" min={1} max={24} value={circuitV} onChange={(e) => setCircuitV(Number(e.target.value))} className="w-full accent-blue-600" />
                    </label>
                    <label className="text-xs">
                      R₁: <strong>{circuitR1} Ω</strong>
                      <input type="range" min={10} max={1000} step={10} value={circuitR1} onChange={(e) => setCircuitR1(Number(e.target.value))} className="w-full accent-blue-600" />
                    </label>
                    <label className="text-xs">
                      R₂: <strong>{circuitR2} Ω</strong>
                      <input type="range" min={10} max={1000} step={10} value={circuitR2} onChange={(e) => setCircuitR2(Number(e.target.value))} className="w-full accent-blue-600" />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <div className="font-semibold mb-1">Series (R₁ + R₂)</div>
                      <div>R_eq = {rTotalSeries} Ω</div>
                      <div>Current I = {(iSeries * 1000).toFixed(2)} mA</div>
                      <div>Power P = {(circuitV * iSeries).toFixed(3)} W</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <div className="font-semibold mb-1">Parallel (R₁ || R₂)</div>
                      <div>R_eq = {rTotalParallel.toFixed(1)} Ω</div>
                      <div>Current I = {(iParallel * 1000).toFixed(2)} mA</div>
                      <div>Power P = {(circuitV * iParallel).toFixed(3)} W</div>
                    </div>
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
