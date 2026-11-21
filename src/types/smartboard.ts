export type LocaleCode = 'en' | 'ne' | 'hi';

export type WorkspaceViewMode = 'board' | 'presentation' | 'pdf';

export type CodeLanguage = 'typescript' | 'javascript' | 'python' | 'json' | 'html' | 'css' | 'bash' | 'sql';

export type EraserSettings = {
  hardness: number;
  opacity: number;
  shape: 'circle' | 'square';
  selectedLayerOnly: boolean;
  insideSelection: boolean;
};

export type ToolType =
  | 'select'
  | 'hand'
  | 'pen'
  | 'pencil'
  | 'brush'
  | 'marker'
  | 'highlighter'
  | 'calligraphy'
  | 'fountain'
  | 'paint_bucket'
  | 'lasso'
  | 'laser'
  | 'line'
  | 'curved_line'
  | 'polyline'
  | 'arrow'
  | 'double_arrow'
  | 'connector'
  | 'eraser_stroke'
  | 'eraser_object'
  | 'eraser_area'
  | 'text'
  | 'code'
  | 'sticky'
  | 'shape'
  | 'math'
  | 'graph';

export type ShapeKind =
  | 'rectangle'
  | 'rounded_rect'
  | 'square'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'right_triangle'
  | 'parallelogram'
  | 'trapezoid'
  | 'pentagon'
  | 'hexagon'
  | 'polygon'
  | 'star'
  | 'diamond'
  | 'cross'
  | 'ring'
  | 'semi_circle'
  | 'heart'
  | 'cloud'
  | 'frame'
  | 'custom'
  | 'speech_bubble'
  | 'callout'
  | 'bracket_left'
  | 'bracket_right'
  | 'block_arrow_right'
  | 'block_arrow_left'
  | 'block_arrow_up'
  | 'block_arrow_down'
  | 'flow_process'
  | 'flow_decision'
  | 'flow_terminator'
  | 'flow_data'
  | 'flow_database'
  | 'flow_document'
  | 'math_cube'
  | 'math_cylinder'
  | 'math_cone'
  | 'math_axes'
  | 'circuit_resistor'
  | 'circuit_capacitor'
  | 'circuit_battery'
  | 'circuit_ground'
  | 'circuit_switch'
  | 'circuit_led';

export type DiagramType =
  | 'flowchart'
  | 'mind_map'
  | 'concept_map'
  | 'org_chart'
  | 'uml_diagram'
  | 'er_diagram'
  | 'database_diagram'
  | 'network_diagram'
  | 'system_architecture'
  | 'workflow_diagram'
  | 'process_diagram'
  | 'decision_tree'
  | 'timeline_diagram'
  | 'gantt_chart'
  | 'venn_diagram'
  | 'fishbone_diagram'
  | 'block_diagram'
  | 'circuit_diagram'
  | 'family_tree'
  | 'tree_diagram'
  | 'sequence_diagram'
  | 'class_diagram'
  | 'state_diagram'
  | 'business_process';

export type GridType =
  | 'none'
  | 'dots'
  | 'lines'
  | 'graph'
  | 'engineering'
  | 'isometric'
  | 'ruled';

export type CollaborationMode =
  | 'private'
  | 'teacher_controlled'
  | 'selected_students'
  | 'group_collab'
  | 'public_readonly';

export type UserRole = 'teacher' | 'student' | 'editor' | 'viewer';

export type PortSide = 'top' | 'right' | 'bottom' | 'left' | 'center';

export type StrokePoint = {
  x: number;
  y: number;
  p: number; // pressure 0..1
  tiltX?: number;
  tiltY?: number;
};

export type LineEndpointStyle = 'none' | 'arrow' | 'dot' | 'diamond' | 'triangle' | 'bar' | 'open_arrow';

export type ObjectComment = {
  id: string;
  author: string;
  text: string;
  createdAt: number;
};

export type BaseBoardObject = {
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  groupId?: string;
  layerId?: string;
  zIndex: number;
  flipX?: boolean;
  flipY?: boolean;
  comments?: ObjectComment[];
  slideAnim?: 'none' | 'fade' | 'slide-up' | 'zoom' | { effect?: 'none' | 'fade' | 'slide-up' | 'zoom'; step?: number };
  /** Target slide ID for inter-slide hyperlink navigation during presentation. */
  linkToSlide?: string;
};

export type StrokeObject = BaseBoardObject & {
  type: 'stroke';
  points: StrokePoint[];
  brushKind: 'pen' | 'pencil' | 'brush' | 'marker' | 'highlighter' | 'calligraphy' | 'fountain' | 'dashed_ink' | 'custom';
  stroke: string;
  strokeWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  smoothing: number;
  stabilization: number;
  pressureSize?: boolean;
  pressureOpacity?: boolean;
  pressureCurve?: 'linear' | 'soft' | 'firm';
  tiltSensitivity?: number;
  taperStart?: number;
  taperEnd?: number;
  wetness?: number;
  blendMode?: 'source-over' | 'multiply' | 'screen' | 'overlay';
  texture?: 'none' | 'paper' | 'grain';
  spacing?: number;
  scatter?: number;
  rotationDynamics?: boolean;
};

export type LineObject = BaseBoardObject & {
  type: 'line';
  points: { x: number; y: number }[];
  curved?: boolean;
  cpX?: number;
  cpY?: number;
  stroke: string;
  strokeWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  startHead: LineEndpointStyle;
  endHead: LineEndpointStyle;
  dashPattern?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
};

export type ConnectorObject = BaseBoardObject & {
  type: 'connector';
  fromId?: string;
  toId?: string;
  fromPort: PortSide;
  toPort: PortSide;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  routeType: 'straight' | 'orthogonal' | 'curved';
  waypoints?: { x: number; y: number }[];
  stroke: string;
  strokeWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  startHead: LineEndpointStyle;
  endHead: LineEndpointStyle;
  label?: string;
  labels?: { id: string; text: string; position: number }[];
  labelPosition?: number;
  relationshipLabel?: string;
  dashPattern?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  anchorPreset?: 'auto' | 'cardinal' | 'anywhere';
};

export type RichRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  highlight?: string;
  code?: boolean;
};

export type RichBlock =
  | {
      type: 'paragraph';
      align?: 'left' | 'center' | 'right' | 'justify';
      indent?: number;
      listType?: 'none' | 'bullet' | 'number' | 'check';
      checked?: boolean;
      heading?: 0 | 1 | 2 | 3;
      runs: RichRun[];
    }
  | {
      type: 'table';
      rows: string[][];
      headerBg?: string;
      borderColor?: string;
    };

export type TextAlignMode = 'left' | 'center' | 'right' | 'justify';

export type ShapeObject = BaseBoardObject & {
  type: 'shape';
  shapeKind: ShapeKind;
  fill: string;
  fillStyle?: 'solid' | 'hachure' | 'cross_hatch' | 'dots';
  fillGradient?: { from: string; to: string; angle: number; type?: 'linear' | 'radial' | 'mesh'; stops?: { color: string; position: number }[] };
  stroke: string;
  strokeWidth: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  cornerRadius?: number;
  cornerRadii?: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  borderPosition?: 'inside' | 'center' | 'outside';
  shadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowSpread?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  fillTexture?: 'none' | 'paper' | 'grain' | 'canvas';
  blendMode?: GlobalCompositeOperation;
  customPath?: string;
  customPathViewBox?: [number, number, number, number];
  booleanOperation?: 'union' | 'subtract' | 'intersect' | 'exclude';
  booleanPaths?: { d: string; viewBox: [number, number, number, number] }[];
  polygonSides?: number;
  polygonVertices?: { x: number; y: number }[];
  text: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: TextAlignMode;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  padding?: number;
  autoGrow?: boolean;
  diagramTag?: string;
};

export type TextObject = BaseBoardObject & {
  type: 'text';
  codeBlock?: boolean;
  codeLanguage?: CodeLanguage;
  text: string;
  textColor: string;
  bgColor: string;
  highlightColor?: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  underline: boolean;
  strikethrough?: boolean;
  textAlign: TextAlignMode;
  lineHeight?: number;
  padding?: number;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  autoFit?: boolean;
  richBlocks?: RichBlock[];
};

export type StickyObject = BaseBoardObject & {
  type: 'sticky';
  text: string;
  noteColor: string;
  textColor: string;
  highlightColor?: string;
  author: string;
  fontFamily?: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  strikethrough?: boolean;
  textAlign?: TextAlignMode;
  lineHeight?: number;
  noteStyle?: 'classic' | 'folded' | 'lined' | 'card';
  isTaskCard?: boolean;
  completed?: boolean;
  richBlocks?: RichBlock[];
  reactions: Record<string, number>;
};

export type TextStickyDefaults = {
  fontFamily: string;
  stickyFontFamily: string;
  fontSize: number;
  stickyFontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  underline: boolean;
  strikethrough: boolean;
  textAlign: TextAlignMode;
  lineHeight: number;
  bgColor: string;
  highlightColor?: string;
  padding?: number;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  noteColor: string;
  noteTextColor: string;
  noteStyle: 'classic' | 'folded' | 'lined' | 'card';
};

export type MathObject = BaseBoardObject & {
  type: 'math';
  latex: string;
  color: string;
  bgColor: string;
  fontSize: number;
};

export type GraphExpression = {
  id: string;
  expr: string;
  color: string;
  visible: boolean;
};

export type GraphObject = BaseBoardObject & {
  type: 'graph';
  mode: '2d' | 'polar' | 'parametric' | '3d';
  expressions: GraphExpression[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  showGrid: boolean;
  title?: string;
  params?: Record<string, number>;
  showDerivative?: boolean;
  shadeInequality?: 'none' | 'above' | 'below';
};

export type ImageObject = BaseBoardObject & {
  type: 'image';
  src: string;
  fileName?: string;
  mask: 'none' | 'circle' | 'rounded' | 'star' | 'hex';
  filters: {
    brightness: number; // 100 default
    contrast: number; // 100 default
    grayscale: number; // 0..100
    sepia: number; // 0..100
    blur: number; // 0..10
  };
  crop?: { sx: number; sy: number; sw: number; sh: number };
  svgContent?: string;
};

export type MediaObject = BaseBoardObject & {
  type: 'media';
  mediaKind: 'audio' | 'video' | 'file' | 'embed';
  src: string;
  embedUrl?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  playbackRate?: number;
};

export type TableObject = BaseBoardObject & {
  type: 'table';
  rows: number;
  cols: number;
  cells: string[][];
  colWidths?: number[];
  rowHeights?: number[];
  mergedCells?: { r: number; c: number; rowSpan: number; colSpan: number }[];
  cellAlign?: TextAlignMode | Record<string, TextAlignMode>;
  headerBg: string;
  borderColor: string;
  textColor: string;
};

export type ChartObject = BaseBoardObject & {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'scatter' | 'horizontalBar' | 'radar';
  title: string;
  labels: string[];
  values: number[];
  colors: string[];
};

export type BoardObject =
  | StrokeObject
  | LineObject
  | ConnectorObject
  | ShapeObject
  | TextObject
  | StickyObject
  | MathObject
  | GraphObject
  | ImageObject
  | MediaObject
  | TableObject
  | ChartObject;

export type BoardLayer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color?: string;
  opacity?: number;
};

export type GuideLine = {
  id: string;
  axis: 'x' | 'y';
  position: number;
};

export type BoardPage = {
  id: string;
  name: string;
  objects: BoardObject[];
  layers: BoardLayer[];
  guides: GuideLine[];
  background: string;
  gridType: GridType;
  gridSize: number;
  transition: 'none' | 'fade' | 'slide' | 'zoom' | 'morph';
  slideDurationSec: number;
  speakerNotes?: string;
  slideLayout?: string;
  slideGradient?: { from: string; to: string; angle?: number };
  viewport?: {
    zoom: number;
    panX: number;
    panY: number;
    rotationDeg: number;
  };
  templateId?: string;
  importedSource?: {
    kind: 'pptx' | 'pdf';
    fileId: string;
    fileName: string;
    pageNumber: number;
    readOnlyOverlay?: boolean;
  };
};

export type BoardVersion = {
  id: string;
  label: string;
  createdAt: number;
  createdBy: string;
  pages: BoardPage[];
  attachedFiles?: AttachedFileMeta[];
  pdfAnnotations?: Record<string, PDFAnnotation[]>;
};

export type AttachedFileMeta = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: 'pdf' | 'pptx' | 'image' | 'audio' | 'video' | 'other';
  url: string;
  uploadedAt: number;
  extractedText?: string;
};

export type PDFAnnotationKind =
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'draw'
  | 'highlighter_ink'
  | 'text'
  | 'comment'
  | 'sticky'
  | 'rect'
  | 'circle'
  | 'arrow'
  | 'line'
  | 'callout'
  | 'stamp'
  | 'image'
  | 'redact'
  | 'measure';

export type PDFAnnotationReply = {
  id: string;
  author: string;
  text: string;
  createdAt: number;
};

export type PDFAnnotation = {
  id: string;
  pageNumber: number;
  kind: PDFAnnotationKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  points?: { x: number; y: number }[];
  color: string;
  fillColor?: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  borderRadius?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  underline?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  bgColor?: string;
  rotation?: number;
  locked?: boolean;
  zIndex?: number;
  measureUnit?: 'mm' | 'cm' | 'in' | 'pt' | 'ft';
  measureScale?: number;
  stampStyle?: 'filled' | 'border' | 'diagonal';
  text?: string;
  author?: string;
  resolved?: boolean;
  replies?: PDFAnnotationReply[];
  createdAt?: number;
};

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  timestamp: number;
};

export type WorkspaceDocument = {
  id: string;
  name: string;
  folder: string;
  starred: boolean;
  trashed: boolean;
  collaborationMode: CollaborationMode;
  ownerId: string;
  ownerClaimed?: boolean;
  hostKey?: string;
  allowedEditors: string[];
  pages: BoardPage[];
  activePageId: string;
  createdAt: number;
  updatedAt: number;
  versions: BoardVersion[];
  attachedFiles: AttachedFileMeta[];
  pdfAnnotations?: Record<string, PDFAnnotation[]>;
  auditLogs: AuditEntry[];
};

export type GeometryInstrument = {
  id: string;
  kind: 'ruler' | 'protractor' | 'compass' | 'set_square';
  x: number;
  y: number;
  rotation: number;
  visible: boolean;
  radius: number;
};

export type PresenceUser = {
  userId: string;
  userName: string;
  role: UserRole;
  color: string;
  cursorX: number;
  cursorY: number;
  pageId: string;
  lastActive: number;
  activeTool?: ToolType;
};

export type ClassroomPoll = {
  id: string;
  question: string;
  options: { id: string; text: string; votes: string[] }[];
  active: boolean;
  createdAt: number;
};

export type ClassroomQuiz = {
  id: string;
  title: string;
  questions: {
    id: string;
    prompt: string;
    options: string[];
    correctIndex: number;
  }[];
  answers: Record<string, number[]>; // userId -> selected indices
  active: boolean;
  lockOnSubmit?: boolean;
  durationSec?: number;
  startedAt?: number;
  createdAt: number;
};

export type StudentQuestion = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  resolved: boolean;
  createdAt: number;
};

export type ClassroomChatMessage = {
  id: string;
  userId: string;
  userName: string;
  role: UserRole;
  text: string;
  createdAt: number;
};

export type StudentSubmission = {
  id: string;
  userId: string;
  userName: string;
  pageName: string;
  snapshotDataUrl: string;
  feedback?: string;
  grade?: string;
  submittedAt: number;
};

export type ClassroomSessionState = {
  active: boolean;
  teacherId: string;
  teacherName: string;
  followTeacher: boolean;
  followSpotlight?: boolean;
  teacherPageId: string;
  studentEditingLocked: boolean;
  allowedStudentIds: string[];
  screenSharingActive: boolean;
  polls: ClassroomPoll[];
  quizzes: ClassroomQuiz[];
  questions: StudentQuestion[];
  submissions: StudentSubmission[];
  chat?: ClassroomChatMessage[];
  raisedHands?: { userId: string; userName: string; raisedAt: number }[];
  breakoutRooms?: { id: string; name: string; pageId: string; memberIds: string[] }[];
};

