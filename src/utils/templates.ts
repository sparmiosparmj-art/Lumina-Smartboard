import type {
  BoardObject,
  BoardPage,
  DiagramType,
  ShapeKind,
  ShapeObject,
} from '../types/smartboard';
import { uid } from './geometry';

export type TemplateDefinition = {
  id: string;
  name: string;
  category: 'Education' | 'Diagrams' | 'Business' | 'Planners' | 'Engineering';
  description: string;
  buildPage: () => BoardPage;
};

function makeShape(
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  shapeKind: ShapeKind = 'rounded_rect',
  fill = '#EFF6FF',
  stroke = '#2563EB',
  textColor = '#0F172A'
): ShapeObject {
  return {
    id: uid('shape'),
    name: text || shapeKind,
    type: 'shape',
    shapeKind,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    zIndex: 2,
    fill,
    stroke,
    strokeWidth: 2,
    text,
    textColor,
    fontFamily: 'Plus Jakarta Sans',
    fontSize: 14,
    fontWeight: 'bold',
    fontStyle: 'normal',
    textAlign: 'center',
  };
}

function connect(from: BoardObject, to: BoardObject, label = '', routeType: 'straight' | 'orthogonal' | 'curved' = 'curved'): BoardObject {
  return {
    id: uid('conn'),
    name: label || 'Connector',
    type: 'connector',
    x: from.x + from.width,
    y: from.y + from.height / 2,
    width: Math.abs(to.x - (from.x + from.width)),
    height: Math.abs(to.y - from.y),
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    zIndex: 1,
    fromId: from.id,
    toId: to.id,
    fromPort: 'right',
    toPort: 'left',
    x1: from.x + from.width,
    y1: from.y + from.height / 2,
    x2: to.x,
    y2: to.y + to.height / 2,
    routeType,
    stroke: '#475569',
    strokeWidth: 2,
    lineStyle: 'solid',
    startHead: 'none',
    endHead: 'arrow',
    label,
  };
}

export const DIAGRAM_TYPES: { id: DiagramType; label: string; group: string }[] = [
  { id: 'flowchart', label: 'Flowchart', group: 'Process' },
  { id: 'mind_map', label: 'Mind Map', group: 'Ideation' },
  { id: 'concept_map', label: 'Concept Map', group: 'Ideation' },
  { id: 'org_chart', label: 'Organizational Chart', group: 'Hierarchy' },
  { id: 'uml_diagram', label: 'UML Diagram', group: 'Software' },
  { id: 'er_diagram', label: 'ER Diagram', group: 'Database' },
  { id: 'database_diagram', label: 'Database Schema', group: 'Database' },
  { id: 'network_diagram', label: 'Network Topology', group: 'Systems' },
  { id: 'system_architecture', label: 'System Architecture', group: 'Systems' },
  { id: 'workflow_diagram', label: 'Workflow Diagram', group: 'Process' },
  { id: 'process_diagram', label: 'Process Diagram', group: 'Process' },
  { id: 'decision_tree', label: 'Decision Tree', group: 'Logic' },
  { id: 'timeline_diagram', label: 'Timeline Diagram', group: 'Planning' },
  { id: 'gantt_chart', label: 'Gantt Chart', group: 'Planning' },
  { id: 'venn_diagram', label: 'Venn Diagram', group: 'Analysis' },
  { id: 'fishbone_diagram', label: 'Fishbone (Ishikawa)', group: 'Analysis' },
  { id: 'block_diagram', label: 'Block Diagram', group: 'Engineering' },
  { id: 'circuit_diagram', label: 'Circuit Diagram', group: 'Engineering' },
  { id: 'family_tree', label: 'Family Tree', group: 'Hierarchy' },
  { id: 'tree_diagram', label: 'Tree Diagram', group: 'Hierarchy' },
  { id: 'sequence_diagram', label: 'Sequence Diagram', group: 'Software' },
  { id: 'class_diagram', label: 'Class Diagram', group: 'Software' },
  { id: 'state_diagram', label: 'State Diagram', group: 'Software' },
  { id: 'business_process', label: 'Business Process', group: 'Process' },
];

// Deterministic starter builder for every one of the 24 diagram types
export function buildDiagramStarter(type: DiagramType, originX = 120, originY = 120): BoardObject[] {
  const objs: BoardObject[] = [];
  if (type === 'mind_map' || type === 'concept_map') {
    const center = makeShape(originX + 260, originY + 150, 190, 76, type === 'mind_map' ? 'Central Topic' : 'Core Concept', 'ellipse', '#EEF2FF', '#4F46E5', '#1E1B4B');
    const b1 = makeShape(originX, originY + 30, 170, 62, 'Branch 1: Theory', 'rounded_rect', '#ECFDF5', '#059669');
    const b2 = makeShape(originX, originY + 260, 170, 62, 'Branch 2: Examples', 'rounded_rect', '#FEF3C7', '#D97706');
    const b3 = makeShape(originX + 540, originY + 30, 170, 62, 'Branch 3: Practice', 'rounded_rect', '#EFF6FF', '#2563EB');
    const b4 = makeShape(originX + 540, originY + 260, 170, 62, 'Branch 4: Summary', 'rounded_rect', '#FFF1F2', '#E11D48');
    objs.push(center, b1, b2, b3, b4, connect(b1, center, 'supports'), connect(b2, center, 'illustrates'), connect(center, b3, 'applies'), connect(center, b4, 'concludes'));
    return objs;
  }
  if (type === 'venn_diagram') {
    const c1 = makeShape(originX + 40, originY + 40, 240, 240, 'Set A', 'circle', 'rgba(37,99,235,0.16)', '#2563EB');
    const c2 = makeShape(originX + 190, originY + 40, 240, 240, 'Set B', 'circle', 'rgba(5,150,105,0.16)', '#059669');
    const c3 = makeShape(originX + 115, originY + 165, 240, 240, 'Set C', 'circle', 'rgba(217,119,6,0.16)', '#D97706');
    objs.push(c1, c2, c3);
    return objs;
  }
  if (type === 'timeline_diagram' || type === 'gantt_chart') {
    const steps = ['Phase 1: Discovery', 'Phase 2: Design', 'Phase 3: Build', 'Phase 4: Review'];
    let prev: ShapeObject | null = null;
    steps.forEach((label, i) => {
      const box = makeShape(originX + i * 210, originY + (type === 'gantt_chart' ? i * 75 : 80), 175, 58, label, 'rounded_rect', '#EFF6FF', '#2563EB');
      objs.push(box);
      if (prev && type === 'timeline_diagram') objs.push(connect(prev, box, `T+${i}`, 'straight'));
      prev = box;
    });
    return objs;
  }
  if (type === 'er_diagram' || type === 'database_diagram' || type === 'class_diagram' || type === 'uml_diagram') {
    const e1 = makeShape(originX, originY + 60, 210, 120, 'Users\n──────\nid : UUID (PK)\nname : TEXT\nrole : ENUM', 'rectangle', '#F8FAFC', '#0F172A');
    const e2 = makeShape(originX + 310, originY + 60, 220, 120, 'Workspaces\n──────\nid : UUID (PK)\nowner_id : FK\ntitle : TEXT', 'flow_database', '#EFF6FF', '#2563EB');
    const e3 = makeShape(originX + 630, originY + 60, 210, 120, 'Pages\n──────\nid : UUID (PK)\nws_id : FK\nobjects : JSON', 'rectangle', '#ECFDF5', '#059669');
    objs.push(e1, e2, e3, connect(e1, e2, '1 : N', 'orthogonal'), connect(e2, e3, '1 : N', 'orthogonal'));
    return objs;
  }
  if (type === 'circuit_diagram') {
    const bat = makeShape(originX, originY + 120, 90, 60, '9V DC', 'circuit_battery', '#FFFBEB', '#D97706');
    const sw = makeShape(originX + 170, originY + 40, 100, 56, 'Switch', 'circuit_switch', '#F8FAFC', '#0F172A');
    const res = makeShape(originX + 360, originY + 40, 110, 56, '220 Ω', 'circuit_resistor', '#EFF6FF', '#2563EB');
    const led = makeShape(originX + 550, originY + 120, 90, 60, 'LED', 'circuit_led', '#ECFDF5', '#059669');
    const gnd = makeShape(originX + 270, originY + 230, 80, 54, 'GND', 'circuit_ground', '#F8FAFC', '#475569');
    objs.push(bat, sw, res, led, gnd, connect(bat, sw, '', 'orthogonal'), connect(sw, res, '', 'orthogonal'), connect(res, led, '', 'orthogonal'), connect(led, gnd, '', 'orthogonal'));
    return objs;
  }
  if (type === 'fishbone_diagram') {
    const head = makeShape(originX + 620, originY + 140, 170, 74, 'Root Problem', 'flow_terminator', '#FFF1F2', '#E11D48');
    const c1 = makeShape(originX + 80, originY + 20, 160, 56, 'People', 'rounded_rect', '#EFF6FF', '#2563EB');
    const c2 = makeShape(originX + 320, originY + 20, 160, 56, 'Process', 'rounded_rect', '#ECFDF5', '#059669');
    const c3 = makeShape(originX + 80, originY + 260, 160, 56, 'Technology', 'rounded_rect', '#FEF3C7', '#D97706');
    const c4 = makeShape(originX + 320, originY + 260, 160, 56, 'Materials', 'rounded_rect', '#F5F3FF', '#7C3AED');
    objs.push(head, c1, c2, c3, c4, connect(c1, head, '', 'straight'), connect(c2, head, '', 'straight'), connect(c3, head, '', 'straight'), connect(c4, head, '', 'straight'));
    return objs;
  }
  if (type === 'org_chart' || type === 'family_tree' || type === 'tree_diagram' || type === 'decision_tree') {
    const root = makeShape(originX + 240, originY, 190, 64, type === 'decision_tree' ? 'Condition?' : 'Root / Director', type === 'decision_tree' ? 'flow_decision' : 'rounded_rect', '#EEF2FF', '#4F46E5');
    const left = makeShape(originX + 60, originY + 150, 180, 62, type === 'decision_tree' ? 'Option A' : 'Division A', 'rounded_rect', '#ECFDF5', '#059669');
    const right = makeShape(originX + 420, originY + 150, 180, 62, type === 'decision_tree' ? 'Option B' : 'Division B', 'rounded_rect', '#EFF6FF', '#2563EB');
    objs.push(root, left, right, connect(root, left, type === 'decision_tree' ? 'Yes' : '', 'orthogonal'), connect(root, right, type === 'decision_tree' ? 'No' : '', 'orthogonal'));
    return objs;
  }
  // Flowchart, workflow, process, network, system architecture, sequence, state, business process, block
  const start = makeShape(originX, originY + 100, 150, 60, 'Start / Input', 'flow_terminator', '#ECFDF5', '#059669');
  const proc = makeShape(originX + 220, originY + 100, 180, 64, `${type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`, 'flow_process', '#EFF6FF', '#2563EB');
  const dec = makeShape(originX + 470, originY + 90, 150, 84, 'Check?', 'flow_decision', '#FEF3C7', '#D97706');
  const end = makeShape(originX + 690, originY + 100, 150, 60, 'Output / End', 'flow_terminator', '#F5F3FF', '#7C3AED');
  objs.push(start, proc, dec, end, connect(start, proc, '', 'orthogonal'), connect(proc, dec, '', 'orthogonal'), connect(dec, end, 'Pass', 'orthogonal'));
  return objs;
}

export const BOARD_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'blank',
    name: 'Blank Whiteboard',
    category: 'Education',
    description: 'Clean infinite canvas with subtle dot grid.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Blank Board',
      objects: [],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'dots',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'classroom',
    name: 'Classroom Board',
    category: 'Education',
    description: 'Chalkboard slate layout with agenda, objectives, and Q&A zone.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Classroom Session',
      objects: [
        makeShape(60, 50, 860, 70, 'Today’s Lesson Objectives & Agenda', 'rounded_rect', '#1E293B', '#38BDF8', '#F8FAFC'),
        makeShape(60, 150, 410, 340, 'Key Concepts & Worked Examples', 'rounded_rect', '#0F172A', '#334155', '#E2E8F0'),
        makeShape(500, 150, 420, 340, 'Class Practice & Student Questions', 'rounded_rect', '#0F172A', '#334155', '#E2E8F0'),
      ],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#0F172A',
      gridType: 'dots',
      gridSize: 32,
      transition: 'fade',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'mathematics',
    name: 'Mathematics Board',
    category: 'Education',
    description: 'Coordinate graph paper with sample function plot and equation block.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Mathematics Board',
      objects: [
        {
          id: uid('math'),
          name: 'Quadratic Formula',
          type: 'math',
          x: 80,
          y: 60,
          width: 340,
          height: 90,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 2,
          latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
          color: '#0F172A',
          bgColor: '#FFFFFF',
          fontSize: 22,
        },
        {
          id: uid('graph'),
          name: 'Function Plotter',
          type: 'graph',
          x: 80,
          y: 180,
          width: 480,
          height: 360,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 3,
          mode: '2d',
          expressions: [
            { id: 'e1', expr: 'x^2 - 3', color: '#2563EB', visible: true },
            { id: 'e2', expr: '2*x + 1', color: '#059669', visible: true },
          ],
          xMin: -6,
          xMax: 6,
          yMin: -6,
          yMax: 8,
          showGrid: true,
          title: 'Parabola & Tangent',
        },
      ],
      layers: [{ id: 'layer-default', name: 'Math Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'graph',
      gridSize: 24,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'science',
    name: 'Science Board',
    category: 'Education',
    description: 'Lab hypothesis, circuit/experiment area, and observations.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Science Lab Board',
      objects: [
        makeShape(60, 50, 280, 160, 'Hypothesis\nWhat do we predict?', 'rounded_rect', '#ECFDF5', '#059669'),
        makeShape(370, 50, 280, 160, 'Method & Apparatus', 'rounded_rect', '#EFF6FF', '#2563EB'),
        makeShape(680, 50, 280, 160, 'Observations & Conclusion', 'rounded_rect', '#FEF3C7', '#D97706'),
        ...buildDiagramStarter('circuit_diagram', 140, 250),
      ],
      layers: [{ id: 'layer-default', name: 'Science Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'engineering',
      gridSize: 24,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'business',
    name: 'Business Strategy Board',
    category: 'Business',
    description: 'SWOT / Value Proposition quadrants with KPI chart.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Business Strategy',
      objects: [
        makeShape(60, 60, 320, 190, 'Strengths', 'rounded_rect', '#ECFDF5', '#059669'),
        makeShape(400, 60, 320, 190, 'Weaknesses', 'rounded_rect', '#FFF1F2', '#E11D48'),
        makeShape(60, 270, 320, 190, 'Opportunities', 'rounded_rect', '#EFF6FF', '#2563EB'),
        makeShape(400, 270, 320, 190, 'Threats', 'rounded_rect', '#FEF3C7', '#D97706'),
      ],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'dots',
      gridSize: 28,
      transition: 'fade',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'mind_map_tpl',
    name: 'Mind Map Template',
    category: 'Diagrams',
    description: 'Radial editable concept branches with smart connectors.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Mind Map',
      objects: buildDiagramStarter('mind_map', 110, 110),
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'dots',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'flowchart_tpl',
    name: 'Flowchart Template',
    category: 'Diagrams',
    description: 'Process, decision, and terminator blocks with orthogonal arrows.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Flowchart',
      objects: buildDiagramStarter('flowchart', 90, 160),
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'lines',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'presentation_tpl',
    name: 'Presentation Deck Starter',
    category: 'Business',
    description: 'Clean 16:9 slide template with title and 2-column layout.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Presentation Slide',
      objects: [
        makeShape(80, 60, 820, 80, 'Presentation Title Goes Here', 'rounded_rect', '#0F172A', '#0F172A', '#FFFFFF'),
        makeShape(80, 170, 390, 310, 'Key Argument 1\n• Supporting evidence\n• Real-world impact', 'rounded_rect', '#F8FAFC', '#CBD5E1', '#0F172A'),
        makeShape(510, 170, 390, 310, 'Key Argument 2\n• Quantitative result\n• Next steps', 'rounded_rect', '#EFF6FF', '#2563EB', '#1E3A8A'),
      ],
      layers: [{ id: 'layer-default', name: 'Slide Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'none',
      gridSize: 28,
      transition: 'slide',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'lesson_plan',
    name: 'Lesson Plan Template',
    category: 'Education',
    description: 'Structured teaching table: Time, Activity, Materials, Assessment.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Lesson Plan',
      objects: [
        {
          id: uid('table'),
          name: 'Lesson Plan Table',
          type: 'table',
          x: 80,
          y: 80,
          width: 820,
          height: 360,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 2,
          rows: 5,
          cols: 4,
          cells: [
            ['Time', 'Stage', 'Teaching Activity', 'Assessment'],
            ['0–10m', 'Warm-up', 'Prior knowledge prompt', 'Quick poll'],
            ['10–25m', 'Direct Instruction', 'Visual board modeling', 'Concept check'],
            ['25–40m', 'Guided Practice', 'Group collaborative problem', 'Board submission'],
            ['40–50m', 'Wrap-up', 'Exit ticket & summary', 'Quick quiz'],
          ],
          headerBg: '#1E293B',
          borderColor: '#CBD5E1',
          textColor: '#0F172A',
        },
      ],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'none',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'project_plan',
    name: 'Project Planning Board',
    category: 'Business',
    description: 'Kanban columns for Backlog, In Progress, Review, and Done.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Project Plan',
      objects: [
        makeShape(60, 60, 210, 420, 'Backlog', 'rounded_rect', '#F8FAFC', '#94A3B8'),
        makeShape(290, 60, 210, 420, 'In Progress', 'rounded_rect', '#EFF6FF', '#2563EB'),
        makeShape(520, 60, 210, 420, 'Review', 'rounded_rect', '#FEF3C7', '#D97706'),
        makeShape(750, 60, 210, 420, 'Completed', 'rounded_rect', '#ECFDF5', '#059669'),
      ],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'dots',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'brainstorm',
    name: 'Brainstorming Board',
    category: 'Business',
    description: 'Sticky note cluster zones for rapid ideation.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Brainstorm',
      objects: [
        {
          id: uid('sticky'),
          name: 'Idea 1',
          type: 'sticky',
          x: 100,
          y: 100,
          width: 220,
          height: 170,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 2,
          text: 'What problem are we solving?',
          noteColor: '#FEF08A',
          textColor: '#1E293B',
          author: 'Facilitator',
          fontSize: 15,
          reactions: {},
        },
        {
          id: uid('sticky'),
          name: 'Idea 2',
          type: 'sticky',
          x: 360,
          y: 100,
          width: 220,
          height: 170,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 3,
          text: 'Bold / unconstrained ideas here',
          noteColor: '#BAE6FD',
          textColor: '#0F172A',
          author: 'Facilitator',
          fontSize: 15,
          reactions: {},
        },
        {
          id: uid('sticky'),
          name: 'Idea 3',
          type: 'sticky',
          x: 620,
          y: 100,
          width: 220,
          height: 170,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 4,
          text: 'Top action items & owners',
          noteColor: '#BBF7D0',
          textColor: '#0F172A',
          author: 'Facilitator',
          fontSize: 15,
          reactions: {},
        },
      ],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'dots',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'timeline',
    name: 'Timeline Template',
    category: 'Planners',
    description: 'Milestone roadmap across connected phases.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Timeline',
      objects: buildDiagramStarter('timeline_diagram', 80, 160),
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'dots',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'weekly_planner',
    name: 'Weekly Planner',
    category: 'Planners',
    description: '7-day structured planning grid.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Weekly Planner',
      objects: [
        {
          id: uid('table'),
          name: 'Weekly Grid',
          type: 'table',
          x: 60,
          y: 70,
          width: 900,
          height: 360,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 2,
          rows: 4,
          cols: 7,
          cells: [
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            ['Morning Focus', '', '', '', '', '', ''],
            ['Afternoon Tasks', '', '', '', '', '', ''],
            ['Review / Notes', '', '', '', '', '', ''],
          ],
          headerBg: '#2563EB',
          borderColor: '#CBD5E1',
          textColor: '#0F172A',
        },
      ],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'none',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'monthly_planner',
    name: 'Monthly Planner',
    category: 'Planners',
    description: '4-week monthly overview calendar matrix.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Monthly Planner',
      objects: [
        {
          id: uid('table'),
          name: 'Monthly Grid',
          type: 'table',
          x: 60,
          y: 70,
          width: 900,
          height: 400,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          zIndex: 2,
          rows: 5,
          cols: 7,
          cells: [
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            ['1', '2', '3', '4', '5', '6', '7'],
            ['8', '9', '10', '11', '12', '13', '14'],
            ['15', '16', '17', '18', '19', '20', '21'],
            ['22', '23', '24', '25', '26', '27', '28'],
          ],
          headerBg: '#0F172A',
          borderColor: '#CBD5E1',
          textColor: '#0F172A',
        },
      ],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'none',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'cornell_notes',
    name: 'Cornell Notes Template',
    category: 'Education',
    description: 'Ruled study page with Cue column, Notes area, and Summary footer.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Cornell Notes',
      objects: [
        makeShape(60, 50, 220, 360, 'Cues & Questions', 'rectangle', '#F8FAFC', '#94A3B8'),
        makeShape(290, 50, 620, 360, 'Detailed Lecture Notes', 'rectangle', '#FFFFFF', '#94A3B8'),
        makeShape(60, 425, 850, 110, 'Key Summary & Actionable Takeaways', 'rectangle', '#EFF6FF', '#2563EB'),
      ],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'ruled',
      gridSize: 28,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'graph_paper',
    name: 'Graph Paper',
    category: 'Engineering',
    description: 'Precision Cartesian grid paper for plotting and geometry.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Graph Paper',
      objects: [],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#FFFFFF',
      gridType: 'graph',
      gridSize: 24,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
  {
    id: 'engineering_grid',
    name: 'Engineering Grid',
    category: 'Engineering',
    description: 'Blueprint engineering grid with major/minor subdivision lines.',
    buildPage: () => ({
      id: uid('page'),
      name: 'Engineering Grid',
      objects: [],
      layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
      guides: [],
      background: '#F8FAFC',
      gridType: 'engineering',
      gridSize: 20,
      transition: 'none',
      slideDurationSec: 0,
    }),
  },
];
