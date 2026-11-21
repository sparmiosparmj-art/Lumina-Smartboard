import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { BoardObject, DiagramType, ShapeKind } from '../types/smartboard';
import { computeSelectionBounds } from '../utils/geometry';
import { buildDiagramStarter, DIAGRAM_TYPES } from '../utils/templates';

type ShapeDiagramMenuProps = {
  mode: 'shapes' | 'diagrams' | null;
  activeShapeKind: ShapeKind;
  viewportCenter?: { x: number; y: number };
  onSelectShape: (kind: ShapeKind) => void;
  onInsertDiagram: (objs: BoardObject[]) => void;
  onAutoLayout: (direction?: 'LR' | 'TB' | 'radial') => void;
  onClose: () => void;
};

export type ShapeCategory = 'basic' | 'arrows' | 'flow' | 'math' | 'circuit';

export const SHAPE_CATALOG: { id: ShapeKind; label: string; category: ShapeCategory }[] = [
  // Basic & Geometry
  { id: 'rectangle', label: 'Rectangle', category: 'basic' },
  { id: 'rounded_rect', label: 'Rounded Rectangle', category: 'basic' },
  { id: 'square', label: 'Square', category: 'basic' },
  { id: 'circle', label: 'Circle', category: 'basic' },
  { id: 'ellipse', label: 'Ellipse', category: 'basic' },
  { id: 'triangle', label: 'Triangle', category: 'basic' },
  { id: 'right_triangle', label: 'Right Triangle', category: 'basic' },
  { id: 'diamond', label: 'Diamond', category: 'basic' },
  { id: 'parallelogram', label: 'Parallelogram', category: 'basic' },
  { id: 'trapezoid', label: 'Trapezoid', category: 'basic' },
  { id: 'pentagon', label: 'Pentagon', category: 'basic' },
  { id: 'hexagon', label: 'Hexagon', category: 'basic' },
  { id: 'polygon', label: 'Octagon / Polygon', category: 'basic' },
  { id: 'star', label: 'Star', category: 'basic' },
  { id: 'cross', label: 'Plus / Cross', category: 'basic' },
  { id: 'ring', label: 'Ring / Donut', category: 'basic' },
  { id: 'semi_circle', label: 'Semi-Circle', category: 'basic' },
  { id: 'heart', label: 'Heart', category: 'basic' },
  { id: 'cloud', label: 'Cloud', category: 'basic' },
  { id: 'frame', label: 'Section Frame', category: 'basic' },

  // Callouts, Arrows & Braces
  { id: 'speech_bubble', label: 'Speech Bubble', category: 'arrows' },
  { id: 'callout', label: 'Callout', category: 'arrows' },
  { id: 'block_arrow_right', label: 'Right Arrow', category: 'arrows' },
  { id: 'block_arrow_left', label: 'Left Arrow', category: 'arrows' },
  { id: 'block_arrow_up', label: 'Up Arrow', category: 'arrows' },
  { id: 'block_arrow_down', label: 'Down Arrow', category: 'arrows' },
  { id: 'bracket_left', label: 'Left Brace', category: 'arrows' },
  { id: 'bracket_right', label: 'Right Brace', category: 'arrows' },

  // Flowchart
  { id: 'flow_process', label: 'Flow Process', category: 'flow' },
  { id: 'flow_decision', label: 'Flow Decision', category: 'flow' },
  { id: 'flow_terminator', label: 'Terminator', category: 'flow' },
  { id: 'flow_data', label: 'Data I/O', category: 'flow' },
  { id: 'flow_database', label: 'Database', category: 'flow' },
  { id: 'flow_document', label: 'Document', category: 'flow' },

  // 3D & Math
  { id: 'math_cube', label: '3D Cube', category: 'math' },
  { id: 'math_cylinder', label: 'Cylinder', category: 'math' },
  { id: 'math_cone', label: 'Cone', category: 'math' },
  { id: 'math_axes', label: 'Axes', category: 'math' },

  // Circuits
  { id: 'circuit_resistor', label: 'Resistor', category: 'circuit' },
  { id: 'circuit_capacitor', label: 'Capacitor', category: 'circuit' },
  { id: 'circuit_battery', label: 'Battery', category: 'circuit' },
  { id: 'circuit_ground', label: 'Ground', category: 'circuit' },
  { id: 'circuit_switch', label: 'Switch', category: 'circuit' },
  { id: 'circuit_led', label: 'LED / Lamp', category: 'circuit' },
];

export const ShapeGlyph: React.FC<{ kind: ShapeKind; className?: string }> = ({
  kind,
  className = 'w-4 h-4',
}) => {
  const renderShape = () => {
    switch (kind) {
      case 'rectangle':
        return <rect x="3.5" y="5.5" width="17" height="13" />;
      case 'rounded_rect':
        return <rect x="3.5" y="5.5" width="17" height="13" rx="3.5" />;
      case 'square':
        return <rect x="5" y="5" width="14" height="14" />;
      case 'circle':
        return <circle cx="12" cy="12" r="7.5" />;
      case 'ellipse':
        return <ellipse cx="12" cy="12" rx="8.5" ry="5.5" />;
      case 'ring':
        return (
          <g>
            <circle cx="12" cy="12" r="7.8" />
            <circle cx="12" cy="12" r="3.6" />
          </g>
        );
      case 'semi_circle':
        return <path d="M4.5 16.5a7.5 7.5 0 0 1 15 0z" />;
      case 'triangle':
        return <polygon points="12,4 20.5,19 3.5,19" />;
      case 'right_triangle':
        return <polygon points="5,4.5 5,19.5 19.5,19.5" />;
      case 'parallelogram':
        return <polygon points="7.5,5.5 20.5,5.5 16.5,18.5 3.5,18.5" />;
      case 'trapezoid':
        return <polygon points="7,5.5 17,5.5 20.5,18.5 3.5,18.5" />;
      case 'diamond':
        return <polygon points="12,3.5 20.5,12 12,20.5 3.5,12" />;
      case 'cross':
        return <polygon points="9.5,4 14.5,4 14.5,9.5 20,9.5 20,14.5 14.5,14.5 14.5,20 9.5,20 9.5,14.5 4,14.5 4,9.5 9.5,9.5" />;
      case 'pentagon':
        return <polygon points="12,3.5 20,9.5 17,19.5 7,19.5 4,9.5" />;
      case 'hexagon':
        return <polygon points="12,3.5 19.5,7.8 19.5,16.2 12,20.5 4.5,16.2 4.5,7.8" />;
      case 'polygon':
        return <polygon points="8.5,3.5 15.5,3.5 20.5,8.5 20.5,15.5 15.5,20.5 8.5,20.5 3.5,15.5 3.5,8.5" />;
      case 'star':
        return (
          <polygon points="12,3.5 14.6,8.8 20.5,9.6 16.2,13.8 17.2,19.6 12,16.8 6.8,19.6 7.8,13.8 3.5,9.6 9.4,8.8" />
        );
      case 'heart':
        return (
          <path d="M12 19.5s-6.5-4.2-8-8.5a4.3 4.3 0 0 1 8-2.8A4.3 4.3 0 0 1 20 11c-1.5 4.3-8 8.5-8 8.5z" />
        );
      case 'cloud':
        return <path d="M7.2 18h9.8a3.8 3.8 0 0 0 .5-7.55 5.2 5.2 0 0 0-9.95-1.3A3.9 3.9 0 0 0 7.2 18z" />;
      case 'frame':
        return (
          <g>
            <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
            <line x1="3.5" y1="9" x2="20.5" y2="9" />
          </g>
        );
      case 'speech_bubble':
        return <path d="M4.5 5.5h15a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H9l-3.5 3.5V16h-1a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" />;
      case 'callout':
        return <path d="M4 5.5h16v9.5h-5l-3 4-3-4H4z" />;
      case 'block_arrow_right':
        return <path d="M3.5 9.5h9.5V6l7.5 6-7.5 6v-3.5H3.5z" />;
      case 'block_arrow_left':
        return <path d="M20.5 9.5H11V6l-7.5 6 7.5 6v-3.5h9.5z" />;
      case 'block_arrow_up':
        return <path d="M9.5 20.5V11H6l6-7.5 6 7.5h-3.5v9.5z" />;
      case 'block_arrow_down':
        return <path d="M9.5 3.5V13H6l6 7.5 6-7.5h-3.5V3.5z" />;
      case 'bracket_left':
        return <path d="M15 4.5c-2 0-3 1-3 2.8v2.7c0 1.2-.9 2-2 2 1.1 0 2 .8 2 2v2.7c0 1.8 1 2.8 3 2.8" />;
      case 'bracket_right':
        return <path d="M9 4.5c2 0 3 1 3 2.8v2.7c0 1.2.9 2 2 2-1.1 0-2 .8-2 2v2.7c0 1.8-1 2.8-3 2.8" />;
      case 'flow_process':
        return <rect x="3.5" y="6.5" width="17" height="11" rx="1.5" />;
      case 'flow_decision':
        return (
          <g>
            <polygon points="12,4 20,12 12,20 4,12" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          </g>
        );
      case 'flow_terminator':
        return <rect x="3.5" y="7.5" width="17" height="9" rx="4.5" />;
      case 'flow_data':
        return <polygon points="7,6 20.5,6 17,18 3.5,18" />;
      case 'flow_database':
      case 'math_cylinder':
        return (
          <g>
            <ellipse cx="12" cy="6.5" rx="6.5" ry="2.2" />
            <path d="M5.5 6.5v11c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2v-11" />
            <path d="M5.5 12c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2" />
          </g>
        );
      case 'flow_document':
        return <path d="M4.5 5.5h15v11.5c-2.5-1.8-5 1.8-7.5 0s-5-1.8-7.5 0V5.5z" />;
      case 'math_cube':
        return (
          <g>
            <rect x="4.5" y="8" width="11" height="11" />
            <path d="M4.5 8l4-4h11v11l-4 4M15.5 8l4-4" />
          </g>
        );
      case 'math_cone':
        return (
          <g>
            <ellipse cx="12" cy="17.5" rx="6.5" ry="2.2" />
            <path d="M12 4.5l6.5 13M12 4.5l-6.5 13" />
          </g>
        );
      case 'math_axes':
        return <path d="M12 3.5v17M3.5 12h17" />;
      case 'circuit_resistor':
        return <path d="M3 12h3l1.5-4 2.5 8 2.5-8 2.5 8 1.5-4H21" />;
      case 'circuit_capacitor':
        return <path d="M3 12h7M10 6v12M14 6v12M14 12h7" />;
      case 'circuit_battery':
        return <path d="M3 12h7M10 5v14M14 8.5v7M14 12h7" />;
      case 'circuit_ground':
        return <path d="M12 4v8M5.5 12h13M8 15.5h8M10.5 19h3" />;
      case 'circuit_switch':
        return <path d="M3 14h5l7-6M15 14h6" />;
      case 'circuit_led':
        return (
          <g>
            <circle cx="12" cy="12" r="5" />
            <path d="M3 12h4M17 12h4" />
          </g>
        );
      default:
        return <rect x="4" y="5" width="16" height="14" rx="2" />;
    }
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {renderShape()}
    </svg>
  );
};

export function centerDiagramObjectsAt(objs: BoardObject[], center?: { x: number; y: number }): BoardObject[] {
  if (!center || objs.length === 0) return objs;
  const b = computeSelectionBounds(objs);
  if (!b) return objs;
  const dx = Math.round(center.x - (b.x + b.width / 2));
  const dy = Math.round(center.y - (b.y + b.height / 2));
  return objs.map((o) => {
    if (o.type === 'stroke') {
      return { ...o, x: o.x + dx, y: o.y + dy, points: o.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
    }
    if (o.type === 'line') {
      return {
        ...o,
        x: o.x + dx,
        y: o.y + dy,
        points: o.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        ...(o.cpX !== undefined ? { cpX: o.cpX + dx } : {}),
        ...(o.cpY !== undefined ? { cpY: o.cpY + dy } : {}),
      };
    }
    return { ...o, x: o.x + dx, y: o.y + dy };
  });
}

export const ShapeDiagramMenu: React.FC<ShapeDiagramMenuProps> = ({
  mode,
  activeShapeKind,
  viewportCenter,
  onSelectShape,
  onInsertDiagram,
  onAutoLayout,
  onClose,
}) => {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [shapeCategory, setShapeCategory] = useState<'all' | ShapeCategory>('all');
  const [diagramSearch, setDiagramSearch] = useState('');

  if (!mode) return null;

  const activeLabel = SHAPE_CATALOG.find((s) => s.id === activeShapeKind)?.label || 'Shapes';
  const filteredShapes =
    shapeCategory === 'all' ? SHAPE_CATALOG : SHAPE_CATALOG.filter((s) => s.category === shapeCategory);
  const filteredDiagrams = DIAGRAM_TYPES.filter(
    (d) =>
      !diagramSearch.trim() ||
      d.label.toLowerCase().includes(diagramSearch.toLowerCase()) ||
      d.group.toLowerCase().includes(diagramSearch.toLowerCase())
  );

  return (
    <div
      className={`fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-16 z-40 bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden ${
        mode === 'shapes'
          ? 'left-1/2 -translate-x-1/2 w-[min(92vw,300px)] md:translate-x-0 md:bottom-auto md:left-14 md:top-16 md:w-[276px] max-h-[65dvh]'
          : 'left-2 right-2 md:bottom-auto md:left-14 md:right-auto md:top-16 md:w-80 max-h-[65dvh] md:max-h-[75vh]'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/60 dark:border-slate-800/60 shrink-0">
        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
          {mode === 'shapes' ? hoveredLabel || activeLabel : 'Diagram Studio (24 Types)'}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0 transition-colors"
          aria-label="Close"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {mode === 'shapes' ? (
        <div className="flex flex-col min-h-0">
          <div className="px-2 pt-2 pb-1 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-slate-200/40 dark:border-slate-800/40 shrink-0">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'basic', label: 'Basic' },
                { id: 'arrows', label: 'Arrows' },
                { id: 'flow', label: 'Flow' },
                { id: 'math', label: '3D' },
                { id: 'circuit', label: 'Circuit' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setShapeCategory(cat.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                  shapeCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="p-2 grid grid-cols-6 gap-1 overflow-y-auto scrollbar-none">
            {filteredShapes.map((s) => {
              const isSelected = activeShapeKind === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    onSelectShape(s.id);
                    onClose();
                  }}
                  onMouseEnter={() => setHoveredLabel(s.label)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  title={s.label}
                  aria-label={s.label}
                  className={`h-9 w-full rounded-lg flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-blue-600/12 text-blue-600 dark:text-blue-400 ring-1 ring-blue-600'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <ShapeGlyph kind={s.id} className="w-[18px] h-[18px]" />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 scrollbar-none space-y-2.5">
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => {
                onAutoLayout('LR');
                onClose();
              }}
              className="py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Auto L→R
            </button>
            <button
              onClick={() => {
                onAutoLayout('TB');
                onClose();
              }}
              className="py-1.5 text-[11px] font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Auto T→B
            </button>
            <button
              onClick={() => {
                onAutoLayout('radial');
                onClose();
              }}
              className="py-1.5 text-[11px] font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700"
            >
              Radial
            </button>
          </div>
          <input
            value={diagramSearch}
            onChange={(e) => setDiagramSearch(e.target.value)}
            placeholder="Filter diagrams..."
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-1.5">
            {filteredDiagrams.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  onInsertDiagram(centerDiagramObjectsAt(buildDiagramStarter(d.id as DiagramType), viewportCenter));
                  onClose();
                }}
                className="px-2.5 py-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60 hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 text-left text-xs transition-colors"
              >
                <div className="font-medium truncate">{d.label}</div>
                <div className="text-[10px] text-slate-400">{d.group}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
