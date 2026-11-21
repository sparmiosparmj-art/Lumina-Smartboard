import type { BoardObject, BoardPage } from '../types/smartboard';
import { uid } from './geometry';

export type SlideThemePreset = {
  id: string;
  name: string;
  bg: string;
  gradient?: { from: string; to: string; angle: number };
  titleColor: string;
  bodyColor: string;
  accentColor: string;
  cardBg: string;
  cardBorder: string;
  isDark: boolean;
};

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

export const SLIDE_THEMES: SlideThemePreset[] = [
  {
    id: 'swiss-light',
    name: 'Swiss Light',
    bg: '#FFFFFF',
    titleColor: '#0F172A',
    bodyColor: '#475569',
    accentColor: '#2563EB',
    cardBg: '#F8FAFC',
    cardBorder: '#E2E8F0',
    isDark: false,
  },
  {
    id: 'obsidian-pro',
    name: 'Obsidian Pro',
    bg: '#0F172A',
    gradient: { from: '#0B1120', to: '#1E293B', angle: 135 },
    titleColor: '#F8FAFC',
    bodyColor: '#CBD5E1',
    accentColor: '#38BDF8',
    cardBg: '#1E293B',
    cardBorder: '#334155',
    isDark: true,
  },
  {
    id: 'nordic-slate',
    name: 'Nordic Slate',
    bg: '#F1F5F9',
    titleColor: '#0F172A',
    bodyColor: '#334155',
    accentColor: '#0284C7',
    cardBg: '#FFFFFF',
    cardBorder: '#CBD5E1',
    isDark: false,
  },
  {
    id: 'warm-editorial',
    name: 'Warm Paper',
    bg: '#FFFBEB',
    titleColor: '#292524',
    bodyColor: '#57534E',
    accentColor: '#D97706',
    cardBg: '#FEF3C7',
    cardBorder: '#FDE68A',
    isDark: false,
  },
  {
    id: 'blueprint-tech',
    name: 'Blueprint',
    bg: '#EFF6FF',
    gradient: { from: '#EFF6FF', to: '#DBEAFE', angle: 135 },
    titleColor: '#1E3A8A',
    bodyColor: '#1E40AF',
    accentColor: '#2563EB',
    cardBg: '#FFFFFF',
    cardBorder: '#BFDBFE',
    isDark: false,
  },
  {
    id: 'midnight-indigo',
    name: 'Midnight Studio',
    bg: '#111827',
    gradient: { from: '#0F172A', to: '#1E1B4B', angle: 135 },
    titleColor: '#F9FAFB',
    bodyColor: '#D1D5DB',
    accentColor: '#818CF8',
    cardBg: '#1F2937',
    cardBorder: '#374151',
    isDark: true,
  },
  {
    id: 'forest-sage',
    name: 'Forest Sage',
    bg: '#ECFDF5',
    titleColor: '#064E3B',
    bodyColor: '#047857',
    accentColor: '#059669',
    cardBg: '#FFFFFF',
    cardBorder: '#A7F3D0',
    isDark: false,
  },
  {
    id: 'carbon-mono',
    name: 'Carbon Mono',
    bg: '#18181B',
    titleColor: '#FAFAFA',
    bodyColor: '#A1A1AA',
    accentColor: '#F43F5E',
    cardBg: '#27272A',
    cardBorder: '#3F3F46',
    isDark: true,
  },
];

export type SlideLayoutId =
  | 'blank'
  | 'title_hero'
  | 'section_divider'
  | 'agenda_outline'
  | 'title_content'
  | 'two_column'
  | 'kpi_cards'
  | 'timeline_roadmap'
  | 'comparison_table'
  | 'visual_split'
  | 'media_spotlight'
  | 'quote_spotlight';

export type SlideLayoutPreset = {
  id: SlideLayoutId;
  name: string;
  description: string;
};

export const SLIDE_LAYOUTS: SlideLayoutPreset[] = [
  { id: 'title_hero', name: 'Title Hero', description: 'Cover slide with headline & subtitle' },
  { id: 'section_divider', name: 'Section Break', description: 'Numbered chapter divider slide' },
  { id: 'agenda_outline', name: 'Agenda Outline', description: 'Four structured topic blocks' },
  { id: 'title_content', name: 'Title + Content', description: 'Header with structured key points' },
  { id: 'two_column', name: 'Two Columns', description: 'Side-by-side comparison cards' },
  { id: 'kpi_cards', name: 'Metric Cards', description: 'Three key stats & takeaways' },
  { id: 'timeline_roadmap', name: '4-Step Roadmap', description: 'Horizontal milestone flow' },
  { id: 'comparison_table', name: 'Comparison Table', description: 'Editable feature matrix table' },
  { id: 'visual_split', name: 'Data & Narrative', description: 'Left narrative + right live chart' },
  { id: 'media_spotlight', name: 'Media Spotlight', description: 'Visual frame + structured bullets' },
  { id: 'quote_spotlight', name: 'Quote Spotlight', description: 'High-impact quote & attribution' },
  { id: 'blank', name: 'Blank Slide', description: 'Clean 16:9 open canvas' },
];

export function isColorDark(hex?: string): boolean {
  if (!hex || hex === 'transparent') return false;
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 132;
}

export function detectThemeForPage(page: BoardPage): SlideThemePreset {
  const bg = (page.background || '#FFFFFF').toLowerCase();
  const match = SLIDE_THEMES.find((t) => t.bg.toLowerCase() === bg);
  if (match) return match;
  if (isColorDark(bg) || (page.slideGradient?.from && isColorDark(page.slideGradient.from))) {
    return SLIDE_THEMES[1];
  }
  return SLIDE_THEMES[0];
}

export function buildSlideNumberObject(
  slideIndex: number,
  totalSlides: number,
  footerLabel: string,
  theme: SlideThemePreset
): BoardObject[] {
  const objs: BoardObject[] = [];
  if (footerLabel.trim()) {
    objs.push({
      id: uid('text'),
      name: '__slide_footer__',
      type: 'text',
      x: 64,
      y: 668,
      width: 640,
      height: 32,
      rotation: 0,
      opacity: 0.7,
      locked: false,
      hidden: false,
      zIndex: 990,
      text: footerLabel.trim(),
      textColor: theme.bodyColor,
      bgColor: 'transparent',
      fontFamily: 'DM Sans',
      fontSize: 13,
      fontWeight: 'normal',
      fontStyle: 'normal',
      underline: false,
      textAlign: 'left',
    });
  }
  objs.push({
    id: uid('text'),
    name: '__slide_number__',
    type: 'text',
    x: 1080,
    y: 668,
    width: 136,
    height: 32,
    rotation: 0,
    opacity: 0.78,
    locked: false,
    hidden: false,
    zIndex: 991,
    text: `${slideIndex + 1} / ${totalSlides}`,
    textColor: theme.bodyColor,
    bgColor: 'transparent',
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
    fontWeight: 'bold',
    fontStyle: 'normal',
    underline: false,
    textAlign: 'right',
  });
  return objs;
}

export function buildLayoutObjects(layoutId: SlideLayoutId, theme: SlideThemePreset): BoardObject[] {
  if (layoutId === 'blank') return [];

  if (layoutId === 'title_hero') {
    return [
      {
        id: uid('shape'),
        name: 'Accent Bar',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 590,
        y: 210,
        width: 100,
        height: 8,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        fill: theme.accentColor,
        stroke: 'transparent',
        strokeWidth: 0,
        cornerRadius: 4,
        text: '',
        textColor: '#FFFFFF',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 14,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'center',
      },
      {
        id: uid('text'),
        name: 'Main Title',
        type: 'text',
        x: 140,
        y: 245,
        width: 1000,
        height: 110,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        text: 'Presentation Title Goes Here',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 52,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'center',
      },
      {
        id: uid('text'),
        name: 'Subtitle',
        type: 'text',
        x: 220,
        y: 375,
        width: 840,
        height: 80,
        rotation: 0,
        opacity: 0.88,
        locked: false,
        hidden: false,
        zIndex: 3,
        text: 'Subtitle, presenter name, or key session takeaway',
        textColor: theme.bodyColor,
        bgColor: 'transparent',
        fontFamily: 'DM Sans',
        fontSize: 24,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'center',
      },
    ];
  }

  if (layoutId === 'section_divider') {
    return [
      {
        id: uid('text'),
        name: 'Chapter Number',
        type: 'text',
        x: 96,
        y: 168,
        width: 220,
        height: 88,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: '01',
        textColor: theme.accentColor,
        bgColor: 'transparent',
        fontFamily: 'JetBrains Mono',
        fontSize: 64,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('shape'),
        name: 'Section Rule',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 96,
        y: 274,
        width: 140,
        height: 6,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        fill: theme.accentColor,
        stroke: 'transparent',
        strokeWidth: 0,
        cornerRadius: 3,
        text: '',
        textColor: '#FFFFFF',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Section Title',
        type: 'text',
        x: 96,
        y: 310,
        width: 1020,
        height: 112,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 3,
        text: 'Core Architecture & Strategy',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 50,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Section Summary',
        type: 'text',
        x: 96,
        y: 440,
        width: 820,
        height: 84,
        rotation: 0,
        opacity: 0.9,
        locked: false,
        hidden: false,
        zIndex: 4,
        text: 'Brief context introducing what this chapter covers and why it matters.',
        textColor: theme.bodyColor,
        bgColor: 'transparent',
        fontFamily: 'DM Sans',
        fontSize: 22,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
    ];
  }

  if (layoutId === 'agenda_outline') {
    const items = [
      { num: '01', title: 'Context & Objectives', desc: 'Aligning on goals, scope, and core audience outcomes' },
      { num: '02', title: 'Architecture & Flow', desc: 'System breakdown and interactive delivery model' },
      { num: '03', title: 'Key Metrics & Proof', desc: 'Performance benchmarks and measurable results' },
      { num: '04', title: 'Execution Roadmap', desc: 'Upcoming milestones, owners, and next steps' },
    ];
    const objs: BoardObject[] = [
      {
        id: uid('text'),
        name: 'Agenda Heading',
        type: 'text',
        x: 72,
        y: 54,
        width: 1136,
        height: 70,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: 'Session Agenda',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 40,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
    ];
    items.forEach((it, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = 72 + col * 584;
      const cy = 160 + row * 252;
      objs.push(
        {
          id: uid('shape'),
          name: `Agenda Card ${idx + 1}`,
          type: 'shape',
          shapeKind: 'rounded_rect',
          x: cx,
          y: cy,
          width: 552,
          height: 220,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 2 + idx * 4,
          fill: theme.cardBg,
          stroke: theme.cardBorder,
          strokeWidth: 1.5,
          cornerRadius: 16,
          text: '',
          textColor: theme.titleColor,
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 16,
          fontWeight: 'normal',
          fontStyle: 'normal',
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `Agenda Index ${idx + 1}`,
          type: 'text',
          x: cx + 28,
          y: cy + 26,
          width: 80,
          height: 44,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 3 + idx * 4,
          text: it.num,
          textColor: theme.accentColor,
          bgColor: 'transparent',
          fontFamily: 'JetBrains Mono',
          fontSize: 28,
          fontWeight: 'bold',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `Agenda Title ${idx + 1}`,
          type: 'text',
          x: cx + 28,
          y: cy + 78,
          width: 496,
          height: 44,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 4 + idx * 4,
          text: it.title,
          textColor: theme.titleColor,
          bgColor: 'transparent',
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 24,
          fontWeight: 'bold',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `Agenda Desc ${idx + 1}`,
          type: 'text',
          x: cx + 28,
          y: cy + 128,
          width: 496,
          height: 70,
          rotation: 0,
          opacity: 0.9,
          locked: false,
          hidden: false,
          zIndex: 5 + idx * 4,
          text: it.desc,
          textColor: theme.bodyColor,
          bgColor: 'transparent',
          fontFamily: 'DM Sans',
          fontSize: 18,
          fontWeight: 'normal',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        }
      );
    });
    return objs;
  }

  if (layoutId === 'title_content') {
    return [
      {
        id: uid('text'),
        name: 'Slide Heading',
        type: 'text',
        x: 72,
        y: 56,
        width: 1136,
        height: 76,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: 'Key Concept & Overview',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 38,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('shape'),
        name: 'Divider Line',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 72,
        y: 138,
        width: 96,
        height: 6,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        fill: theme.accentColor,
        stroke: 'transparent',
        strokeWidth: 0,
        cornerRadius: 3,
        text: '',
        textColor: '#FFFFFF',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
      },
      {
        id: uid('shape'),
        name: 'Content Surface',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 72,
        y: 176,
        width: 1136,
        height: 472,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 3,
        fill: theme.cardBg,
        stroke: theme.cardBorder,
        strokeWidth: 1.5,
        cornerRadius: 16,
        text: '',
        textColor: theme.bodyColor,
        fontFamily: 'DM Sans',
        fontSize: 20,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Bullet Points',
        type: 'text',
        x: 108,
        y: 210,
        width: 1064,
        height: 410,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 4,
        text: '• First core point with clear supporting explanation\n\n• Second strategic insight or classroom takeaway\n\n• Third measurable action item or summary milestone',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'DM Sans',
        fontSize: 24,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
    ];
  }

  if (layoutId === 'two_column') {
    return [
      {
        id: uid('text'),
        name: 'Comparison Heading',
        type: 'text',
        x: 72,
        y: 52,
        width: 1136,
        height: 72,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: 'Side-by-Side Comparison',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 36,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('shape'),
        name: 'Left Card',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 72,
        y: 152,
        width: 548,
        height: 500,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        fill: theme.cardBg,
        stroke: theme.cardBorder,
        strokeWidth: 1.5,
        cornerRadius: 16,
        text: '',
        textColor: theme.titleColor,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 18,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Left Column Title',
        type: 'text',
        x: 104,
        y: 182,
        width: 484,
        height: 48,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 3,
        text: '01. Current Approach',
        textColor: theme.accentColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 24,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Left Column Body',
        type: 'text',
        x: 104,
        y: 246,
        width: 484,
        height: 370,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 4,
        text: '• Manual workflow steps\n\n• Higher turnaround time\n\n• Limited live visibility',
        textColor: theme.bodyColor,
        bgColor: 'transparent',
        fontFamily: 'DM Sans',
        fontSize: 20,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('shape'),
        name: 'Right Card',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 660,
        y: 152,
        width: 548,
        height: 500,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 5,
        fill: theme.cardBg,
        stroke: theme.accentColor,
        strokeWidth: 2,
        cornerRadius: 16,
        text: '',
        textColor: theme.titleColor,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 18,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Right Column Title',
        type: 'text',
        x: 692,
        y: 182,
        width: 484,
        height: 48,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 6,
        text: '02. Proposed Architecture',
        textColor: theme.accentColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 24,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Right Column Body',
        type: 'text',
        x: 692,
        y: 246,
        width: 484,
        height: 370,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 7,
        text: '• Real-time automated sync\n\n• 3x faster execution speed\n\n• Interactive shared workspace',
        textColor: theme.bodyColor,
        bgColor: 'transparent',
        fontFamily: 'DM Sans',
        fontSize: 20,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
    ];
  }

  if (layoutId === 'kpi_cards') {
    const metrics = [
      { value: '94%', label: 'Completion Rate', desc: 'Across all active cohorts this quarter' },
      { value: '3.4×', label: 'Faster Review', desc: 'Compared to legacy slide workflows' },
      { value: '128', label: 'Active Modules', desc: 'Synced cleanly across devices' },
    ];
    const objs: BoardObject[] = [
      {
        id: uid('text'),
        name: 'Metrics Heading',
        type: 'text',
        x: 72,
        y: 56,
        width: 1136,
        height: 76,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: 'Key Performance Highlights',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 38,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
    ];
    metrics.forEach((m, i) => {
      const cardX = 72 + i * 392;
      objs.push(
        {
          id: uid('shape'),
          name: `KPI Card ${i + 1}`,
          type: 'shape',
          shapeKind: 'rounded_rect',
          x: cardX,
          y: 180,
          width: 352,
          height: 430,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 2 + i * 4,
          fill: theme.cardBg,
          stroke: theme.cardBorder,
          strokeWidth: 1.5,
          cornerRadius: 18,
          text: '',
          textColor: theme.titleColor,
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 16,
          fontWeight: 'normal',
          fontStyle: 'normal',
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `KPI Value ${i + 1}`,
          type: 'text',
          x: cardX + 28,
          y: 230,
          width: 296,
          height: 88,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 3 + i * 4,
          text: m.value,
          textColor: theme.accentColor,
          bgColor: 'transparent',
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 60,
          fontWeight: 'bold',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `KPI Label ${i + 1}`,
          type: 'text',
          x: cardX + 28,
          y: 340,
          width: 296,
          height: 48,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 4 + i * 4,
          text: m.label,
          textColor: theme.titleColor,
          bgColor: 'transparent',
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 24,
          fontWeight: 'bold',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `KPI Detail ${i + 1}`,
          type: 'text',
          x: cardX + 28,
          y: 404,
          width: 296,
          height: 150,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 5 + i * 4,
          text: m.desc,
          textColor: theme.bodyColor,
          bgColor: 'transparent',
          fontFamily: 'DM Sans',
          fontSize: 18,
          fontWeight: 'normal',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        }
      );
    });
    return objs;
  }

  if (layoutId === 'timeline_roadmap') {
    const steps = [
      { phase: 'Phase 01', title: 'Discovery', detail: 'Requirements, scope, & baseline benchmarks' },
      { phase: 'Phase 02', title: 'Architecture', detail: 'Core workflows, data models, & UI system' },
      { phase: 'Phase 03', title: 'Validation', detail: 'Live pilot testing with early adopters' },
      { phase: 'Phase 04', title: 'Rollout', detail: 'Full launch, monitoring, & optimization' },
    ];
    const objs: BoardObject[] = [
      {
        id: uid('text'),
        name: 'Roadmap Heading',
        type: 'text',
        x: 72,
        y: 54,
        width: 1136,
        height: 70,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: 'Execution Roadmap',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 38,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('line'),
        name: 'Timeline Spine',
        type: 'line',
        x: 132,
        y: 236,
        width: 1016,
        height: 6,
        rotation: 0,
        opacity: 0.7,
        locked: false,
        hidden: false,
        zIndex: 2,
        points: [
          { x: 132, y: 238 },
          { x: 1148, y: 238 },
        ],
        stroke: theme.accentColor,
        strokeWidth: 3,
        lineStyle: 'solid',
        startHead: 'dot',
        endHead: 'arrow',
      },
    ];
    steps.forEach((st, i) => {
      const cardX = 72 + i * 290;
      objs.push(
        {
          id: uid('shape'),
          name: `Step Node ${i + 1}`,
          type: 'shape',
          shapeKind: 'circle',
          x: cardX + 114,
          y: 214,
          width: 48,
          height: 48,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 3 + i * 4,
          fill: theme.accentColor,
          stroke: theme.bg,
          strokeWidth: 4,
          text: String(i + 1),
          textColor: '#FFFFFF',
          fontFamily: 'JetBrains Mono',
          fontSize: 18,
          fontWeight: 'bold',
          fontStyle: 'normal',
          textAlign: 'center',
        },
        {
          id: uid('shape'),
          name: `Roadmap Card ${i + 1}`,
          type: 'shape',
          shapeKind: 'rounded_rect',
          x: cardX,
          y: 292,
          width: 266,
          height: 316,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 4 + i * 4,
          fill: theme.cardBg,
          stroke: theme.cardBorder,
          strokeWidth: 1.5,
          cornerRadius: 16,
          text: '',
          textColor: theme.titleColor,
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 16,
          fontWeight: 'normal',
          fontStyle: 'normal',
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `Phase ${i + 1}`,
          type: 'text',
          x: cardX + 20,
          y: 318,
          width: 226,
          height: 36,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 5 + i * 4,
          text: st.phase,
          textColor: theme.accentColor,
          bgColor: 'transparent',
          fontFamily: 'JetBrains Mono',
          fontSize: 15,
          fontWeight: 'bold',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `Title ${i + 1}`,
          type: 'text',
          x: cardX + 20,
          y: 360,
          width: 226,
          height: 44,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 6 + i * 4,
          text: st.title,
          textColor: theme.titleColor,
          bgColor: 'transparent',
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 22,
          fontWeight: 'bold',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        },
        {
          id: uid('text'),
          name: `Detail ${i + 1}`,
          type: 'text',
          x: cardX + 20,
          y: 418,
          width: 226,
          height: 150,
          rotation: 0,
          opacity: 0.9,
          locked: false,
          hidden: false,
          zIndex: 7 + i * 4,
          text: st.detail,
          textColor: theme.bodyColor,
          bgColor: 'transparent',
          fontFamily: 'DM Sans',
          fontSize: 17,
          fontWeight: 'normal',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'left',
        }
      );
    });
    return objs;
  }

  if (layoutId === 'comparison_table') {
    return [
      {
        id: uid('text'),
        name: 'Table Heading',
        type: 'text',
        x: 72,
        y: 52,
        width: 1136,
        height: 70,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: 'Feature & Tier Comparison Matrix',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 36,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('table'),
        name: 'Comparison Table',
        type: 'table',
        x: 72,
        y: 154,
        width: 1136,
        height: 468,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        rows: 5,
        cols: 4,
        cells: [
          ['Capability', 'Starter', 'Professional', 'Enterprise'],
          ['Interactive Canvas', 'Included', 'Unlimited Boards', 'Unlimited + Governance'],
          ['Live Charts & Math', 'Basic', 'Full LaTeX + 3D', 'Custom Templates'],
          ['PowerPoint (.pptx)', 'Import Only', 'Import & HD Export', 'Full Brand Kit'],
          ['Classroom Collaboration', 'Up to 10', 'Up to 100', 'Unlimited + SSO'],
        ],
        headerBg: theme.accentColor,
        borderColor: theme.cardBorder,
        textColor: theme.titleColor,
      },
    ];
  }

  if (layoutId === 'visual_split') {
    return [
      {
        id: uid('text'),
        name: 'Split Heading',
        type: 'text',
        x: 72,
        y: 68,
        width: 520,
        height: 110,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: 'Quarterly Growth Trajectory',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 38,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Split Narrative',
        type: 'text',
        x: 72,
        y: 210,
        width: 500,
        height: 420,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        text: '• Consistent upward trend across every release milestone\n\n• Higher engagement driven by streamlined onboarding\n\n• Select the chart on the right to edit live data rows directly',
        textColor: theme.bodyColor,
        bgColor: 'transparent',
        fontFamily: 'DM Sans',
        fontSize: 21,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('chart'),
        name: 'Slide Chart',
        type: 'chart',
        x: 620,
        y: 120,
        width: 588,
        height: 490,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 3,
        chartType: 'bar',
        title: 'Quarterly Performance',
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        values: [42, 68, 84, 96],
        colors: [theme.accentColor, '#059669', '#D97706', '#6366F1'],
      },
    ];
  }

  if (layoutId === 'media_spotlight') {
    return [
      {
        id: uid('shape'),
        name: 'Media Frame',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 72,
        y: 96,
        width: 540,
        height: 528,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        fill: theme.cardBg,
        stroke: theme.accentColor,
        strokeWidth: 2,
        cornerRadius: 20,
        text: 'Drop or Insert Image Here',
        textColor: theme.bodyColor,
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 18,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      },
      {
        id: uid('text'),
        name: 'Spotlight Kicker',
        type: 'text',
        x: 668,
        y: 118,
        width: 530,
        height: 40,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        text: 'FEATURED SPOTLIGHT',
        textColor: theme.accentColor,
        bgColor: 'transparent',
        fontFamily: 'JetBrains Mono',
        fontSize: 15,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Spotlight Heading',
        type: 'text',
        x: 668,
        y: 168,
        width: 540,
        height: 112,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 3,
        text: 'Visual Storytelling & Key Takeaways',
        textColor: theme.titleColor,
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 38,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: uid('text'),
        name: 'Spotlight Body',
        type: 'text',
        x: 668,
        y: 304,
        width: 540,
        height: 300,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 4,
        text: '• Anchor visual evidence beside your core narrative\n\n• Replace the left frame with any diagram, screenshot, or photo\n\n• Customize masks, filters, and shadows in the Element tab',
        textColor: theme.bodyColor,
        bgColor: 'transparent',
        fontFamily: 'DM Sans',
        fontSize: 20,
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
    ];
  }

  // quote_spotlight
  return [
    {
      id: uid('shape'),
      name: 'Quote Card',
      type: 'shape',
      shapeKind: 'rounded_rect',
      x: 110,
      y: 130,
      width: 1060,
      height: 460,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 1,
      fill: theme.cardBg,
      stroke: theme.cardBorder,
      strokeWidth: 1.5,
      cornerRadius: 24,
      text: '',
      textColor: theme.titleColor,
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 18,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'center',
    },
    {
      id: uid('text'),
      name: 'Quote Text',
      type: 'text',
      x: 170,
      y: 205,
      width: 940,
      height: 220,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 2,
      text: '“Simplicity is about subtracting the obvious and adding the meaningful.”',
      textColor: theme.titleColor,
      bgColor: 'transparent',
      fontFamily: 'Merriweather',
      fontSize: 34,
      fontWeight: 'bold',
      fontStyle: 'italic',
      underline: false,
      textAlign: 'center',
    },
    {
      id: uid('text'),
      name: 'Attribution',
      type: 'text',
      x: 240,
      y: 470,
      width: 800,
      height: 54,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      zIndex: 3,
      text: '— John Maeda, The Laws of Simplicity',
      textColor: theme.accentColor,
      bgColor: 'transparent',
      fontFamily: 'Plus Jakarta Sans',
      fontSize: 20,
      fontWeight: 'bold',
      fontStyle: 'normal',
      underline: false,
      textAlign: 'center',
    },
  ];
}

const KNOWN_CARD_BGS = new Set(SLIDE_THEMES.map((t) => t.cardBg.toLowerCase()).concat(['#ffffff', '#f8fafc', '#f1f5f9', '#0f172a', '#1e293b']));
const KNOWN_CARD_BORDERS = new Set(SLIDE_THEMES.map((t) => t.cardBorder.toLowerCase()).concat(['#e2e8f0', '#cbd5e1', '#334155', '#475569']));
const KNOWN_TEXT_INK = new Set(
  SLIDE_THEMES.flatMap((t) => [t.titleColor.toLowerCase(), t.bodyColor.toLowerCase()]).concat([
    '#0f172a',
    '#1e293b',
    '#334155',
    '#475569',
    '#64748b',
    '#ffffff',
    '#f8fafc',
    '#e2e8f0',
    '#cbd5e1',
    '#000000',
  ])
);
const KNOWN_ACCENTS = new Set(SLIDE_THEMES.map((t) => t.accentColor.toLowerCase()));

export function adaptObjectsToTheme(objects: BoardObject[], theme: SlideThemePreset): BoardObject[] {
  return objects.map((o) => {
    if (o.type === 'text') {
      const lowerInk = (o.textColor || '').toLowerCase();
      const isAccentTag =
        KNOWN_ACCENTS.has(lowerInk) || (o.fontFamily === 'JetBrains Mono' && o.fontSize <= 18 && o.text === o.text.toUpperCase());
      const nextColor = isAccentTag
        ? theme.accentColor
        : o.fontWeight === 'bold' || o.fontSize >= 24
          ? theme.titleColor
          : theme.bodyColor;
      const nextBg = o.bgColor && o.bgColor !== 'transparent' && KNOWN_CARD_BGS.has(o.bgColor.toLowerCase()) ? theme.cardBg : o.bgColor;
      const nextBorderColor =
        o.borderColor && o.borderColor !== 'transparent' && KNOWN_CARD_BORDERS.has(o.borderColor.toLowerCase())
          ? theme.cardBorder
          : o.borderColor;
      const nextRichBlocks = o.richBlocks?.map((blk) =>
        blk.type === 'paragraph'
          ? {
              ...blk,
              runs: blk.runs.map((r) => ({
                ...r,
                color: r.color && KNOWN_TEXT_INK.has(r.color.toLowerCase()) ? nextColor : r.color,
              })),
            }
          : blk
      );
      return {
        ...o,
        textColor: nextColor,
        bgColor: nextBg,
        borderColor: nextBorderColor,
        richBlocks: nextRichBlocks,
      };
    }

    if (o.type === 'shape') {
      const lowerFill = (o.fill || '').toLowerCase();
      const lowerStroke = (o.stroke || '').toLowerCase();
      const isRuleOrAccent =
        (o.width <= 140 && o.height <= 12) ||
        (o.width <= 12 && o.height <= 140) ||
        (KNOWN_ACCENTS.has(lowerFill) && !o.text);
      const isCardFill = KNOWN_CARD_BGS.has(lowerFill);
      const nextFill = isRuleOrAccent ? theme.accentColor : isCardFill ? theme.cardBg : o.fill;
      const nextStroke =
        o.stroke && o.stroke !== 'transparent'
          ? KNOWN_CARD_BORDERS.has(lowerStroke)
            ? theme.cardBorder
            : KNOWN_ACCENTS.has(lowerStroke)
              ? theme.accentColor
              : isCardFill
                ? theme.cardBorder
                : theme.accentColor
          : o.stroke;
      const nextTextColor =
        nextFill && nextFill !== 'transparent'
          ? isColorDark(nextFill)
            ? '#F8FAFC'
            : '#0F172A'
          : theme.titleColor;
      return {
        ...o,
        fill: nextFill,
        stroke: nextStroke,
        textColor: nextTextColor,
      };
    }

    if (o.type === 'table') {
      return {
        ...o,
        headerBg: KNOWN_ACCENTS.has((o.headerBg || '').toLowerCase()) || KNOWN_CARD_BGS.has((o.headerBg || '').toLowerCase())
          ? theme.accentColor
          : o.headerBg,
        borderColor: theme.cardBorder,
        textColor: theme.titleColor,
      };
    }

    if (o.type === 'math') {
      return {
        ...o,
        color: theme.titleColor,
        bgColor: o.bgColor && o.bgColor !== 'transparent' ? theme.cardBg : o.bgColor,
      };
    }

    if (o.type === 'line' || o.type === 'connector') {
      const ls = (o.stroke || '').toLowerCase();
      if (KNOWN_TEXT_INK.has(ls)) {
        return { ...o, stroke: theme.bodyColor };
      }
      if (KNOWN_ACCENTS.has(ls)) {
        return { ...o, stroke: theme.accentColor };
      }
      return o;
    }

    return o;
  });
}

export function distributeSlideObjects(
  objects: BoardObject[],
  selectedIds: Set<string>,
  axis: 'horizontal' | 'vertical'
): BoardObject[] {
  const selected = objects
    .filter((o) => selectedIds.has(o.id) && !o.locked)
    .sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y));
  if (selected.length < 3) return objects;

  const first = selected[0];
  const last = selected[selected.length - 1];
  const updates = new Map<string, { dx: number; dy: number }>();

  if (axis === 'horizontal') {
    const totalW = selected.reduce((sum, o) => sum + o.width, 0);
    const span = last.x + last.width - first.x;
    const gap = (span - totalW) / (selected.length - 1);
    let cursor = first.x;
    for (const o of selected) {
      updates.set(o.id, { dx: Math.round(cursor - o.x), dy: 0 });
      cursor += o.width + gap;
    }
  } else {
    const totalH = selected.reduce((sum, o) => sum + o.height, 0);
    const span = last.y + last.height - first.y;
    const gap = (span - totalH) / (selected.length - 1);
    let cursor = first.y;
    for (const o of selected) {
      updates.set(o.id, { dx: 0, dy: Math.round(cursor - o.y) });
      cursor += o.height + gap;
    }
  }

  return objects.map((o) => {
    const delta = updates.get(o.id);
    if (!delta || (delta.dx === 0 && delta.dy === 0)) return o;
    if (o.type === 'stroke') {
      return {
        ...o,
        x: o.x + delta.dx,
        y: o.y + delta.dy,
        points: o.points.map((pt) => ({ ...pt, x: pt.x + delta.dx, y: pt.y + delta.dy })),
      };
    }
    if (o.type === 'line') {
      return {
        ...o,
        x: o.x + delta.dx,
        y: o.y + delta.dy,
        cpX: typeof o.cpX === 'number' ? o.cpX + delta.dx : o.cpX,
        cpY: typeof o.cpY === 'number' ? o.cpY + delta.dy : o.cpY,
        points: o.points.map((pt) => ({ x: pt.x + delta.dx, y: pt.y + delta.dy })),
      };
    }
    if (o.type === 'connector') {
      return {
        ...o,
        x: o.x + delta.dx,
        y: o.y + delta.dy,
        x1: o.x1 + delta.dx,
        y1: o.y1 + delta.dy,
        x2: o.x2 + delta.dx,
        y2: o.y2 + delta.dy,
        ...(o.waypoints ? { waypoints: o.waypoints.map((wp) => ({ x: wp.x + delta.dx, y: wp.y + delta.dy })) } : {}),
      };
    }
    return { ...o, x: o.x + delta.dx, y: o.y + delta.dy };
  });
}

export function matchSizeSlideObjects(objects: BoardObject[], selectedIds: Set<string>): BoardObject[] {
  const selected = objects.filter((o) => selectedIds.has(o.id) && !o.locked && o.type !== 'connector' && o.type !== 'line' && o.type !== 'stroke');
  if (selected.length < 2) return objects;
  const ref = selected[0];
  return objects.map((o) => {
    if (!selectedIds.has(o.id) || o.locked || o.type === 'connector' || o.type === 'line' || o.type === 'stroke') return o;
    return { ...o, width: ref.width, height: ref.height };
  });
}


