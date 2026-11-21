import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  FolderOpen,
  History,
  LayoutTemplate,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { BoardPage, WorkspaceDocument } from '../types/smartboard';
import { BOARD_TEMPLATES } from '../utils/templates';

export type WorkspaceSummary = {
  id: string;
  name: string;
  folder: string;
  starred: boolean;
  trashed: boolean;
  collaborationMode: string;
  pageCount: number;
  updatedAt: number;
  createdAt: number;
};

export type CustomTemplateItem = {
  id: string;
  name: string;
  category: string;
  page: BoardPage;
  createdAt: number;
};

type WorkspaceHubModalProps = {
  open: boolean;
  initialTab?: 'workspaces' | 'templates' | 'versions';
  onClose: () => void;
  workspaces: WorkspaceSummary[];
  currentWorkspace: WorkspaceDocument;
  customTemplates: CustomTemplateItem[];
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string, folder: string, initialPages?: BoardPage[]) => void;
  onDuplicateWorkspace: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
  onMoveFolder: (id: string, folder: string) => void;
  onTrashWorkspace: (id: string, permanent?: boolean) => void;
  onRestoreWorkspace: (id: string) => void;
  onApplyTemplateAsNewPage: (page: BoardPage) => void;
  onSaveCurrentAsTemplate: (name: string, category: string) => void;
  onDeleteCustomTemplate?: (id: string) => void;
  onCreateVersion: (label: string) => void;
  onRestoreVersion: (versionId: string) => void;
};

export const WorkspaceHubModal: React.FC<WorkspaceHubModalProps> = ({
  open,
  initialTab = 'workspaces',
  onClose,
  workspaces,
  currentWorkspace,
  customTemplates,
  onSwitchWorkspace,
  onCreateWorkspace,
  onDuplicateWorkspace,
  onToggleStar,
  onMoveFolder,
  onTrashWorkspace,
  onRestoreWorkspace,
  onApplyTemplateAsNewPage,
  onSaveCurrentAsTemplate,
  onDeleteCustomTemplate,
  onCreateVersion,
  onRestoreVersion,
}) => {
  const [tab, setTab] = useState<'workspaces' | 'templates' | 'versions'>(initialTab);
  const [wsFilter, setWsFilter] = useState<'all' | 'starred' | 'recent' | 'trash'>('all');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newFolder, setNewFolder] = useState('General');
  const [tplCategory, setTplCategory] = useState<string>('All');
  const [tplSearch, setTplSearch] = useState('');
  const [tplSaveName, setTplSaveName] = useState('');
  const [verLabel, setVerLabel] = useState('');
  const [movingWsId, setMovingWsId] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState('');

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [initialTab, open]);

  const filteredWorkspaces = useMemo(() => {
    const q = search.toLowerCase();
    const list = workspaces.filter((w) => {
      if (wsFilter === 'trash') {
        if (!w.trashed) return false;
      } else {
        if (w.trashed) return false;
        if (wsFilter === 'starred' && !w.starred) return false;
      }
      if (q && !w.name.toLowerCase().includes(q) && !w.folder.toLowerCase().includes(q)) return false;
      return true;
    });
    if (wsFilter === 'recent') {
      return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return list;
  }, [search, workspaces, wsFilter]);

  const filteredTemplates = useMemo(() => {
    const q = tplSearch.trim().toLowerCase();
    return BOARD_TEMPLATES.filter((t) => {
      if (tplCategory !== 'All' && t.category !== tplCategory) return false;
      if (q && !`${t.name} ${t.category} ${t.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tplCategory, tplSearch]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-6">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderOpen className="w-5 h-5 text-blue-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              Workspaces, Templates &amp; Version History
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 sm:px-5 pt-2.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
          {[
            { id: 'workspaces', label: 'Workspaces & Folders', icon: FolderOpen },
            { id: 'templates', label: 'Template Library', icon: LayoutTemplate },
            { id: 'versions', label: `Version History (${currentWorkspace.versions?.length || 0})`, icon: History },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 studio-scroll">
          {tab === 'workspaces' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New workspace name..."
                  className="flex-1 min-w-[180px] px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="Folder"
                  className="w-32 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button
                  onClick={() => {
                    onCreateWorkspace(newName.trim() || 'Untitled SmartBoard', newFolder.trim() || 'General');
                    setNewName('');
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Board
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'starred', label: 'Starred' },
                    { id: 'recent', label: 'Recent' },
                    { id: 'trash', label: 'Trash' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setWsFilter(f.id as typeof wsFilter)}
                      className={`px-3 py-1 text-xs font-medium rounded-md ${
                        wsFilter === f.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search workspaces or folders..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredWorkspaces.map((w) => (
                  <div
                    key={w.id}
                    className={`p-3.5 rounded-lg border flex flex-col justify-between gap-2 ${
                      w.id === currentWorkspace.id
                        ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => {
                          if (!w.trashed) {
                            onSwitchWorkspace(w.id);
                            onClose();
                          }
                        }}
                        className="text-left flex-1 min-w-0"
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{w.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {w.folder} · {w.pageCount} pages · Updated {new Date(w.updatedAt).toLocaleDateString()}
                        </div>
                      </button>
                      <button
                        onClick={() => onToggleStar(w.id, !w.starred)}
                        className={`p-1 rounded ${w.starred ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
                      >
                        <Star className="w-4 h-4" fill={w.starred ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                      {w.trashed ? (
                        <>
                          <button
                            onClick={() => onRestoreWorkspace(w.id)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </button>
                          <button
                            onClick={() => onTrashWorkspace(w.id, true)}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded"
                          >
                            Delete Permanently
                          </button>
                        </>
                      ) : (
                        <>
                          {movingWsId === w.id ? (
                            <div className="flex items-center gap-1 flex-1">
                              <input
                                autoFocus
                                type="text"
                                value={folderDraft}
                                onChange={(e) => setFolderDraft(e.target.value)}
                                className="w-28 px-2 py-0.5 text-[11px] border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                              />
                              <button
                                onClick={() => {
                                  if (folderDraft.trim()) onMoveFolder(w.id, folderDraft.trim());
                                  setMovingWsId(null);
                                }}
                                className="px-2 py-0.5 text-[11px] font-semibold bg-blue-600 text-white rounded"
                              >
                                Move
                              </button>
                              <button
                                onClick={() => setMovingWsId(null)}
                                className="px-1.5 py-0.5 text-[11px] border border-slate-300 dark:border-slate-700 rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setMovingWsId(w.id);
                                setFolderDraft(w.folder);
                              }}
                              className="px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            >
                              Move Folder
                            </button>
                          )}
                          <button
                            onClick={() => onDuplicateWorkspace(w.id)}
                            className="p-1 text-slate-500 hover:text-blue-600"
                            title="Duplicate Workspace"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onTrashWorkspace(w.id, false)}
                            className="p-1 text-slate-500 hover:text-red-600"
                            title="Move to Trash"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'templates' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <input
                  value={tplSaveName}
                  onChange={(e) => setTplSaveName(e.target.value)}
                  placeholder="Save current board page as custom template..."
                  className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button
                  onClick={() => {
                    onSaveCurrentAsTemplate(tplSaveName.trim() || 'Custom Board Template', 'Custom');
                    setTplSaveName('');
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save as Template
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {['All', 'Education', 'Diagrams', 'Business', 'Planners', 'Engineering'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setTplCategory(cat)}
                      className={`px-3 py-1 text-xs font-medium rounded-lg border ${
                        tplCategory === cat
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                  <input
                    value={tplSearch}
                    onChange={(e) => setTplSearch(e.target.value)}
                    placeholder="Search templates..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {customTemplates.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Your Custom Templates</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {customTemplates.map((ct) => (
                      <div
                        key={ct.id}
                        className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 hover:border-blue-600 flex items-start justify-between gap-2"
                      >
                        <button
                          onClick={() => {
                            onApplyTemplateAsNewPage(structuredClone(ct.page));
                            onClose();
                          }}
                          className="text-left flex-1 min-w-0"
                        >
                          <div className="text-xs font-semibold truncate">{ct.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {ct.category} · {ct.page.objects.length} items · Insert as Page
                          </div>
                        </button>
                        {onDeleteCustomTemplate && (
                          <button
                            onClick={() => onDeleteCustomTemplate(ct.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Delete Custom Template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {filteredTemplates.map((tpl) => (
                  <div key={tpl.id} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2 hover:border-blue-400 transition-colors">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-medium text-blue-600">{tpl.category}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">Template</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">{tpl.name}</div>
                      <p className="text-[11px] text-slate-500 mt-1">{tpl.description}</p>
                    </div>
                    <div className="flex gap-1.5 pt-2">
                      <button
                        onClick={() => {
                          onApplyTemplateAsNewPage(tpl.buildPage());
                          onClose();
                        }}
                        className="flex-1 py-1.5 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Add Page
                      </button>
                      <button
                        onClick={() => {
                          onCreateWorkspace(tpl.name, tpl.category, [tpl.buildPage()]);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        New Board
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'versions' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={verLabel}
                  onChange={(e) => setVerLabel(e.target.value)}
                  placeholder="Checkpoint label (e.g. Before Algebra Review)..."
                  className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button
                  onClick={() => {
                    onCreateVersion(verLabel.trim() || `Checkpoint ${new Date().toLocaleTimeString()}`);
                    setVerLabel('');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save Snapshot
                </button>
              </div>

              <div className="space-y-2">
                {(currentWorkspace.versions || []).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{v.label}</div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(v.createdAt).toLocaleString()} · By {v.createdBy} · {v.pages.length} pages
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onRestoreVersion(v.id);
                        onClose();
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg"
                    >
                      Restore Version
                    </button>
                  </div>
                ))}
              </div>

              {currentWorkspace.auditLogs?.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Security &amp; Activity Audit Log</div>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-[11px] text-slate-500 font-mono">
                    {currentWorkspace.auditLogs.slice(0, 20).map((a) => (
                      <div key={a.id}>
                        {new Date(a.timestamp).toLocaleTimeString()} · {a.actor} · {a.action}
                      </div>
                    ))}
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
