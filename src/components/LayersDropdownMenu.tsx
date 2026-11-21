import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Lock,
  Plus,
  Search,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type { BoardLayer, BoardObject, BoardPage } from '../types/smartboard';
import { uid } from '../utils/geometry';

const LAYER_TAG_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#06B6D4', '#64748B'];

type LayersDropdownMenuProps = {
  open: boolean;
  page: BoardPage;
  selectedIds: Set<string>;
  onClose: () => void;
  onSelectIds: (ids: Set<string>) => void;
  onUpdateObject: (id: string, patch: Partial<BoardObject>, commit?: boolean) => void;
  onDeleteObjects: (ids: string[]) => void;
  onReorderZ: (id: string, dir: 'front' | 'back' | 'forward' | 'backward') => void;
  onUpdatePage?: (pageId: string, patch: Partial<BoardPage>) => void;
  onReplacePageObjects?: (objects: BoardObject[], pushHistory?: boolean) => void;
};

export const LayersDropdownMenu: React.FC<LayersDropdownMenuProps> = ({
  open,
  page,
  selectedIds,
  onClose,
  onSelectIds,
  onUpdateObject,
  onDeleteObjects,
  onReorderZ,
  onUpdatePage,
  onReplacePageObjects,
}) => {
  const [layerSearch, setLayerSearch] = useState('');
  const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(() => new Set(['layer-default']));
  const [renamingObjId, setRenamingObjId] = useState<string | null>(null);
  const [renameObjDraft, setRenameObjDraft] = useState('');
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const boardLayers: BoardLayer[] = useMemo(
    () =>
      page.layers && page.layers.length > 0
        ? page.layers
        : [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false, color: '#3B82F6', opacity: 1 }],
    [page.layers]
  );

  const defaultLayerId = boardLayers[0]?.id || 'layer-default';

  const objectsByLayer = useMemo(() => {
    const q = layerSearch.toLowerCase().trim();
    const map = new Map<string, BoardObject[]>();
    boardLayers.forEach((l) => map.set(l.id, []));

    const sorted = [...page.objects].sort((a, b) => b.zIndex - a.zIndex);
    sorted.forEach((o) => {
      if (q) {
        const label = (o.name || o.type + ('text' in o ? ' ' + o.text : '')).toLowerCase();
        if (!label.includes(q)) return;
      }
      const targetLayerId = o.layerId && map.has(o.layerId) ? o.layerId : defaultLayerId;
      const list = map.get(targetLayerId) || [];
      list.push(o);
      map.set(targetLayerId, list);
    });
    return map;
  }, [boardLayers, defaultLayerId, layerSearch, page.objects]);

  if (!open) return null;

  const reorderLayer = (fromIdx: number, toIdx: number) => {
    if (!onUpdatePage || fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= boardLayers.length || toIdx >= boardLayers.length) return;
    const next = [...boardLayers];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onUpdatePage(page.id, { layers: next });
  };

  const toggleExpandLayer = (id: string) => {
    setExpandedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commitRenameObj = (obj: BoardObject) => {
    const trimmed = renameObjDraft.trim();
    if (trimmed && trimmed !== obj.name) {
      onUpdateObject(obj.id, { name: trimmed }, true);
    }
    setRenamingObjId(null);
  };

  const cycleLayerColor = (layer: BoardLayer) => {
    if (!onUpdatePage) return;
    const idx = LAYER_TAG_COLORS.indexOf(layer.color || '#3B82F6');
    const nextColor = LAYER_TAG_COLORS[(idx + 1) % LAYER_TAG_COLORS.length];
    onUpdatePage(page.id, {
      layers: boardLayers.map((l) => (l.id === layer.id ? { ...l, color: nextColor } : l)),
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:bottom-12 right-2 z-40 w-[min(94vw,340px)] max-h-[min(calc(100%-78px),540px)] bg-white/95 dark:bg-slate-900/95 glass-chrome border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/60 dark:border-slate-800/60 shrink-0">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            Layers Tree ({boardLayers.length} · {page.objects.length} objs)
          </span>
          <div className="flex items-center gap-1">
            {onUpdatePage && (
              <button
                onClick={() => {
                  const newId = uid('layer');
                  const color = LAYER_TAG_COLORS[boardLayers.length % LAYER_TAG_COLORS.length];
                  onUpdatePage(page.id, {
                    layers: [
                      ...boardLayers,
                      { id: newId, name: `Layer ${boardLayers.length + 1}`, visible: true, locked: false, color, opacity: 1 },
                    ],
                  });
                  setExpandedLayerIds((prev) => new Set([...prev, newId]));
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3 h-3" /> Layer
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close Layers"
              className="p-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 p-2.5 space-y-2 overflow-hidden">
          <div className="relative shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              value={layerSearch}
              onChange={(e) => setLayerSearch(e.target.value)}
              placeholder="Search objects or layers..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-none min-h-[120px] pr-0.5">
            {boardLayers.map((layer, layerIdx) => {
              const objs = objectsByLayer.get(layer.id) || [];
              const isExpanded = Boolean(layerSearch.trim()) || expandedLayerIds.has(layer.id);
              const layerColor = layer.color || LAYER_TAG_COLORS[layerIdx % LAYER_TAG_COLORS.length];
              const layerOpacity = layer.opacity ?? 1;

              return (
                <div
                  key={layer.id}
                  draggable={Boolean(onUpdatePage)}
                  onDragStart={() => setDragLayerIdx(layerIdx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragLayerIdx !== null && dragLayerIdx !== layerIdx) {
                      setDragOverIdx(layerIdx);
                    }
                  }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={() => {
                    if (dragLayerIdx !== null) reorderLayer(dragLayerIdx, layerIdx);
                    setDragLayerIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragLayerIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={`rounded-lg border transition-colors ${
                    dragOverIdx === layerIdx
                      ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/40 dark:bg-blue-950/30'
                      : 'border-slate-200/60 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-950/80'
                  }`}
                >
                  {/* Layer Header */}
                  <div className="flex items-center gap-1 px-1.5 py-1.5 text-[11px]">
                    <span
                      title="Drag to reorder layer"
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <GripVertical className="w-3 h-3" />
                    </span>
                    <button
                      onClick={() => toggleExpandLayer(layer.id)}
                      className="p-0.5 text-slate-500 hover:text-blue-600"
                      title={isExpanded ? 'Collapse Layer' : 'Expand Layer'}
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => cycleLayerColor(layer)}
                      title="Click to cycle layer color tag"
                      style={{ backgroundColor: layerColor }}
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-white dark:border-slate-900 shadow-xs"
                    />
                    <input
                      value={layer.name}
                      onChange={(e) =>
                        onUpdatePage?.(page.id, {
                          layers: boardLayers.map((l) => (l.id === layer.id ? { ...l, name: e.target.value } : l)),
                        })
                      }
                      className="flex-1 min-w-0 bg-transparent font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 px-1 rounded"
                    />
                    <span className="text-[9px] font-mono text-slate-400 px-1">{objs.length}</span>
                    {onUpdatePage && boardLayers.length > 1 && (
                      <>
                        <button
                          onClick={() => reorderLayer(layerIdx, layerIdx - 1)}
                          disabled={layerIdx === 0}
                          title="Move Layer Up"
                          className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => reorderLayer(layerIdx, layerIdx + 1)}
                          disabled={layerIdx === boardLayers.length - 1}
                          title="Move Layer Down"
                          className="p-0.5 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() =>
                        onUpdatePage?.(page.id, {
                          layers: boardLayers.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l)),
                        })
                      }
                      title="Toggle Layer Visibility"
                      className="p-0.5 text-slate-500 hover:text-blue-600"
                    >
                      {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-slate-400" />}
                    </button>
                    <button
                      onClick={() =>
                        onUpdatePage?.(page.id, {
                          layers: boardLayers.map((l) => (l.id === layer.id ? { ...l, locked: !l.locked } : l)),
                        })
                      }
                      title="Toggle Layer Lock"
                      className="p-0.5 text-slate-500 hover:text-amber-600"
                    >
                      {layer.locked ? <Lock className="w-3 h-3 text-amber-600" /> : <Unlock className="w-3 h-3" />}
                    </button>
                    {boardLayers.length > 1 && onUpdatePage && (
                      <button
                        onClick={() => {
                          const remaining = boardLayers.filter((l) => l.id !== layer.id);
                          const fallbackId = remaining[0].id;
                          onUpdatePage(page.id, { layers: remaining });
                          if (onReplacePageObjects) {
                            onReplacePageObjects(
                              page.objects.map((o) => (o.layerId === layer.id ? { ...o, layerId: fallbackId } : o)),
                              true
                            );
                          }
                        }}
                        title="Delete Layer"
                        className="p-0.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Layer Opacity Slider + Nested Objects */}
                  {isExpanded && (
                    <div className="px-2 pb-2 pt-1 border-t border-slate-200/70 dark:border-slate-800/80 space-y-1.5">
                      {onUpdatePage && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 px-1">
                          <span>Layer Opacity</span>
                          <input
                            type="range"
                            min={0.1}
                            max={1}
                            step={0.05}
                            value={layerOpacity}
                            onChange={(e) => {
                              const op = Number(e.target.value);
                              onUpdatePage(page.id, {
                                layers: boardLayers.map((l) => (l.id === layer.id ? { ...l, opacity: op } : l)),
                              });
                            }}
                            className="flex-1 h-1"
                          />
                          <span className="font-mono w-7 text-right">{Math.round(layerOpacity * 100)}%</span>
                        </div>
                      )}

                      {objs.length === 0 ? (
                        <div className="text-[10px] text-slate-400 italic px-2 py-1">Empty layer</div>
                      ) : (
                        <div className="space-y-1">
                          {objs.map((obj) => {
                            const isSel = selectedIds.has(obj.id);
                            const label =
                              obj.name ||
                              ('text' in obj && obj.text ? `${obj.type}: ${obj.text.slice(0, 18)}` : obj.type);
                            const isRenaming = renamingObjId === obj.id;
                            return (
                              <div
                                key={obj.id}
                                onClick={() => onSelectIds(new Set([obj.id]))}
                                className={`flex items-center justify-between pl-2.5 pr-1.5 py-1 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                                  isSel
                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                                    : 'border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                              >
                                {isRenaming ? (
                                  <input
                                    autoFocus
                                    value={renameObjDraft}
                                    onChange={(e) => setRenameObjDraft(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={() => commitRenameObj(obj)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitRenameObj(obj);
                                      if (e.key === 'Escape') setRenamingObjId(null);
                                    }}
                                    className="flex-1 min-w-0 px-1 py-0.5 text-[11px] bg-white dark:bg-slate-950 border border-blue-500 rounded focus:outline-none mr-1"
                                  />
                                ) : (
                                  <span
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      setRenamingObjId(obj.id);
                                      setRenameObjDraft(obj.name || obj.type);
                                    }}
                                    className="truncate flex-1 pr-1.5 font-medium"
                                    title="Double-click to rename"
                                  >
                                    {label}
                                  </span>
                                )}
                                <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => {
                                      setRenamingObjId(obj.id);
                                      setRenameObjDraft(obj.name || obj.type);
                                    }}
                                    title="Rename"
                                    className="p-0.5 text-slate-400 hover:text-blue-600"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    onClick={() => onReorderZ(obj.id, 'forward')}
                                    title="Bring Forward"
                                    className="p-0.5 text-slate-500 hover:text-blue-600"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => onUpdateObject(obj.id, { hidden: !obj.hidden }, true)}
                                    title="Show/Hide"
                                    className="p-0.5 text-slate-500 hover:text-blue-600"
                                  >
                                    {obj.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  </button>
                                  <button
                                    onClick={() => onUpdateObject(obj.id, { locked: !obj.locked }, true)}
                                    title="Lock/Unlock"
                                    className="p-0.5 text-slate-500 hover:text-amber-600"
                                  >
                                    {obj.locked ? <Lock className="w-3 h-3 text-amber-600" /> : <Unlock className="w-3 h-3" />}
                                  </button>
                                  <button
                                    onClick={() => onDeleteObjects([obj.id])}
                                    title="Delete"
                                    className="p-0.5 text-slate-500 hover:text-red-600"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};
