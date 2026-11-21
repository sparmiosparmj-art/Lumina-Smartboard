import React, { useEffect, useMemo, useState } from 'react';
import {
  Accessibility,
  Database,
  Download,
  Globe,
  Keyboard,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { LocaleCode } from '../types/smartboard';
import { apiUrl } from '../utils/api';

type StorageFileInfo = {
  fileId: string;
  fileName: string;
  size: number;
  kind: string;
};

type SettingsShortcutsModalProps = {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  hostKey: string;
  locale: LocaleCode;
  onChangeLocale: (loc: LocaleCode) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  colorblindPalette: boolean;
  onToggleColorblindPalette: () => void;
  palmRejection: boolean;
  onTogglePalmRejection: () => void;
  uiScale: number;
  onChangeUiScale: (scale: number) => void;
  storageFiles?: StorageFileInfo[];
  workspacePageCount?: number;
  workspaceVersionCount?: number;
  onDeleteFiles?: (fileIds: string[]) => Promise<void>;
};

type ProviderSettings = {
  geminiKeyConfigured: boolean;
  geminiKeySource: 'app' | 'environment' | 'missing';
  preferredTtsQuality: 'full' | 'lite';
  ttsVoiceCharacter: 'auto' | 'feminine' | 'masculine';
  ttsVoiceStyle: 'natural' | 'warm' | 'calm' | 'energetic' | 'narrator';
  ttsVoiceSpeed: 'slow' | 'normal' | 'brisk';
  ttsPauseStyle: 'brief' | 'natural' | 'relaxed';
  ttsProviderMode: 'auto' | 'gemini' | 'polly';
  chatProviderMode: 'auto' | 'gemini' | 'bedrock';
  awsCredentialMode: 'profile' | 'access_keys';
  awsCredentialsConfigured: boolean;
  awsSessionTokenConfigured: boolean;
  awsProfileName: string;
  awsRegion: string;
};

const SHORTCUTS = [
  { keys: 'V', desc: 'Selection tool' },
  { keys: 'H', desc: 'Hand / Pan tool' },
  { keys: 'P', desc: 'Freehand Pen tool' },
  { keys: 'B', desc: 'Brush tool' },
  { keys: 'M', desc: 'Chisel Marker tool' },
  { keys: 'K', desc: 'Highlighter tool' },
  { keys: 'Q', desc: 'Laser Pointer tool' },
  { keys: 'E', desc: 'Eraser (uses active eraser mode)' },
  { keys: 'T', desc: 'Text Box tool' },
  { keys: 'S', desc: 'Sticky Note tool' },
  { keys: 'R', desc: 'Shapes tool' },
  { keys: 'F', desc: 'Section Frame tool' },
  { keys: 'L', desc: 'Line / Arrow tool' },
  { keys: 'C', desc: 'Smart Connector tool' },
  { keys: 'Arrow Keys', desc: 'Nudge selected unlocked objects 1px (Shift: 10px)' },
  { keys: 'Ctrl/Cmd + Z', desc: 'Undo' },
  { keys: 'Ctrl/Cmd + Shift + Z / Ctrl+Y', desc: 'Redo' },
  { keys: 'Ctrl/Cmd + C / V / X', desc: 'Copy / Paste (or OS text/SVG/image) / Cut' },
  { keys: 'Ctrl/Cmd + Alt + C / V', desc: 'Copy Style / Paste Style' },
  { keys: 'Ctrl/Cmd + A', desc: 'Select all unlocked visible objects on page' },
  { keys: 'Ctrl/Cmd + G / Shift+G', desc: 'Group / Ungroup selected objects' },
  { keys: 'Ctrl/Cmd + F', desc: 'Board Find & Replace' },
  { keys: 'Ctrl/Cmd + K', desc: 'Open Futuristic Command Palette' },
  { keys: 'Ctrl/Cmd + D', desc: 'Duplicate selected objects' },
  { keys: 'Ctrl/Cmd + S', desc: 'Save workspace immediately' },
  { keys: 'Shift + 1 / Shift + 0', desc: 'Fit Screen / Reset Zoom 100%' },
  { keys: 'Delete / Backspace', desc: 'Delete selected unlocked objects' },
  { keys: 'Space + Drag', desc: 'Pan infinite canvas' },
  { keys: '+ / -', desc: 'Zoom in / Zoom out' },
  { keys: 'Escape', desc: 'Cancel selection, drawing, or close modal' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const StoragePanel: React.FC<{
  files: StorageFileInfo[];
  pageCount: number;
  versionCount: number;
  onDeleteFiles?: (fileIds: string[]) => Promise<void>;
}> = ({ files, pageCount, versionCount, onDeleteFiles }) => {
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const byKind = files.reduce<Record<string, { count: number; size: number }>>((acc, f) => {
    if (!acc[f.kind]) acc[f.kind] = { count: 0, size: 0 };
    acc[f.kind].count++;
    acc[f.kind].size += f.size;
    return acc;
  }, {});
  const sortedFiles = [...files].sort((a, b) => b.size - a.size);

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0 || !onDeleteFiles) return;
    const ids = Array.from(selectedIds);
    const names = ids.map((id) => files.find((f) => f.fileId === id)?.fileName || id).join(', ');
    if (!window.confirm(`Remove ${ids.length} file(s) from workspace?\n\n${names}`)) return;
    setDeleting(true);
    try {
      await onDeleteFiles(ids);
      setSelectedIds(new Set());
    } catch {
      // error handled by parent
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const kindColors: Record<string, string> = {
    pdf: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    image: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    pptx: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    audio: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    video: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    other: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatBytes(totalSize)}</div>
          <div className="text-[11px] text-slate-500">Total Files Size</div>
        </div>
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{files.length}</div>
          <div className="text-[11px] text-slate-500">Attached Files</div>
        </div>
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{pageCount}</div>
          <div className="text-[11px] text-slate-500">Board Pages</div>
        </div>
        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{versionCount}</div>
          <div className="text-[11px] text-slate-500">Saved Versions</div>
        </div>
      </div>

      {Object.keys(byKind).length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Storage Breakdown</div>
          <div className="space-y-1.5">
            {Object.entries(byKind)
              .sort(([, a], [, b]) => b.size - a.size)
              .map(([kind, info]) => {
                const pct = totalSize > 0 ? Math.round((info.size / totalSize) * 100) : 0;
                return (
                  <div key={kind} className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${kindColors[kind] || kindColors.other}`}>
                      {kind}
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums w-20 text-right">
                      {formatBytes(info.size)} ({info.count})
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Files ({files.length}) — sorted by size
            </div>
            {selectedIds.size > 0 && onDeleteFiles && (
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteSelected()}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                {deleting ? 'Removing…' : `Remove ${selectedIds.size} selected`}
              </button>
            )}
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-none">
            {sortedFiles.map((f) => (
              <label
                key={f.fileId}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
              >
                {onDeleteFiles && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(f.fileId)}
                    onChange={() => toggleSelect(f.fileId)}
                    className="rounded border-slate-300"
                  />
                )}
                <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${kindColors[f.kind] || kindColors.other}`}>
                  {f.kind}
                </span>
                <span className="flex-1 text-xs truncate">{f.fileName}</span>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatBytes(f.size)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          No attached files in this workspace.
        </div>
      )}
    </div>
  );
};

export const SettingsShortcutsModal: React.FC<SettingsShortcutsModalProps> = ({
  open,
  onClose,
  workspaceId,
  hostKey,
  locale,
  onChangeLocale,
  darkMode,
  onToggleDarkMode,
  highContrast,
  onToggleHighContrast,
  colorblindPalette,
  onToggleColorblindPalette,
  palmRejection,
  onTogglePalmRejection,
  uiScale,
  onChangeUiScale,
  storageFiles = [],
  workspacePageCount = 0,
  workspaceVersionCount = 0,
  onDeleteFiles,
}) => {
  const [tab, setTab] = useState<'general' | 'shortcuts' | 'providers' | 'storage'>('general');
  const [shortcutSearch, setShortcutSearch] = useState('');
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>({
    geminiKeyConfigured: false,
    geminiKeySource: 'missing',
    preferredTtsQuality: 'full',
    ttsVoiceCharacter: 'auto',
    ttsVoiceStyle: 'natural',
    ttsVoiceSpeed: 'normal',
    ttsPauseStyle: 'natural',
    ttsProviderMode: 'auto',
    chatProviderMode: 'auto',
    awsCredentialMode: 'profile',
    awsCredentialsConfigured: false,
    awsSessionTokenConfigured: false,
    awsProfileName: 'luminaboard',
    awsRegion: 'ap-southeast-2',
  });
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('');
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('');
  const [awsSessionToken, setAwsSessionToken] = useState('');
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerMessage, setProviderMessage] = useState('');
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState('');
  const [voicePreviewInfo, setVoicePreviewInfo] = useState('');
  const isLocalSettingsHost =
    typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
  const canManageProviderSettings = Boolean(workspaceId && (hostKey || isLocalSettingsHost));
  const speechProviderLabel =
    providerSettings.ttsProviderMode === 'auto'
      ? 'Auto (Gemini → AWS Polly)'
      : providerSettings.ttsProviderMode === 'gemini'
        ? 'Google Gemini only'
        : 'AWS Polly only';
  const chatProviderLabel =
    providerSettings.chatProviderMode === 'auto'
      ? 'Auto (Gemini → AWS Bedrock)'
      : providerSettings.chatProviderMode === 'gemini'
        ? 'Google Gemini only'
        : 'AWS Bedrock only';
  const awsServices = [
    ...(providerSettings.ttsProviderMode === 'auto' || providerSettings.ttsProviderMode === 'polly' ? ['AWS Polly'] : []),
    ...(providerSettings.chatProviderMode === 'auto' || providerSettings.chatProviderMode === 'bedrock'
      ? ['AWS Bedrock']
      : []),
  ];
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  useEffect(() => {
    if (!open || !workspaceId || (!hostKey && !isLocalSettingsHost)) return;
    let active = true;
    setProviderLoading(true);
    setProviderMessage('');
    fetch(`${apiUrl('/api/ai/provider-settings')}?workspaceId=${encodeURIComponent(workspaceId)}`, {
      headers: hostKey ? { 'X-Host-Key': hostKey } : {},
    })
      .then(async (response) => {
        const data = (await response.json()) as ProviderSettings & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Could not load AI provider settings.');
        if (active) setProviderSettings(data);
      })
      .catch((error: unknown) => {
        if (active) setProviderMessage(error instanceof Error ? error.message : 'Could not load AI provider settings.');
      })
      .finally(() => {
        if (active) setProviderLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, workspaceId, hostKey, isLocalSettingsHost]);

  useEffect(() => {
    setVoicePreviewUrl('');
    setVoicePreviewInfo('');
  }, [
    providerSettings.ttsVoiceCharacter,
    providerSettings.ttsVoiceStyle,
    providerSettings.ttsVoiceSpeed,
    providerSettings.ttsPauseStyle,
  ]);

  const saveProviderSettings = async (removeGeminiKey = false, removeAwsCredentials = false) => {
    if (!workspaceId || (!hostKey && !isLocalSettingsHost)) {
      setProviderMessage('Open Settings on the host computer or provide host authorization.');
      return false;
    }
    setProviderSaving(true);
    setProviderMessage('');
    const body: Record<string, unknown> = {
      workspaceId,
      preferredTtsQuality: providerSettings.preferredTtsQuality,
      ttsVoiceCharacter: providerSettings.ttsVoiceCharacter,
      ttsVoiceStyle: providerSettings.ttsVoiceStyle,
      ttsVoiceSpeed: providerSettings.ttsVoiceSpeed,
      ttsPauseStyle: providerSettings.ttsPauseStyle,
      ttsProviderMode: providerSettings.ttsProviderMode,
      chatProviderMode: providerSettings.chatProviderMode,
      awsCredentialMode: removeAwsCredentials ? 'profile' : providerSettings.awsCredentialMode,
      awsProfileName: providerSettings.awsProfileName,
    };
    if (removeGeminiKey) body.geminiApiKey = null;
    else if (geminiApiKey.trim()) body.geminiApiKey = geminiApiKey.trim();
    if (removeAwsCredentials) {
      body.awsAccessKeyId = null;
      body.awsSecretAccessKey = null;
      body.awsSessionToken = null;
    } else {
      if (awsAccessKeyId.trim()) body.awsAccessKeyId = awsAccessKeyId.trim();
      if (awsSecretAccessKey.trim()) body.awsSecretAccessKey = awsSecretAccessKey.trim();
      if (awsSessionToken.trim()) body.awsSessionToken = awsSessionToken.trim();
    }

    try {
      const response = await fetch(apiUrl('/api/ai/provider-settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hostKey ? { 'X-Host-Key': hostKey } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ProviderSettings & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not save AI provider settings.');
      setProviderSettings(data);
      setGeminiApiKey('');
      setAwsAccessKeyId('');
      setAwsSecretAccessKey('');
      setAwsSessionToken('');
      setProviderMessage('AI provider settings saved.');
      return true;
    } catch (error: unknown) {
      setProviderMessage(error instanceof Error ? error.message : 'Could not save AI provider settings.');
      return false;
    } finally {
      setProviderSaving(false);
    }
  };

  const generateVoicePreview = async () => {
    if (!(await saveProviderSettings())) return;
    setVoicePreviewLoading(true);
    setVoicePreviewInfo('');
    setVoicePreviewUrl('');
    try {
      const sampleText =
        locale === 'hi'
          ? 'नमस्ते! यह आपकी चुनी हुई आवाज़ का छोटा परीक्षण है।'
          : locale === 'ne'
            ? 'नमस्ते! यो तपाईंले छान्नुभएको आवाजको छोटो परीक्षण हो।'
            : 'Hello! This is a short preview of your selected voice.';
      const response = await fetch(apiUrl('/api/ai/tts'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hostKey ? { 'X-Host-Key': hostKey } : {}),
        },
        body: JSON.stringify({ workspaceId, text: sampleText, locale }),
      });
      const data = (await response.json()) as {
        audioDataUrl?: string;
        provider?: string;
        model?: string;
        error?: string;
      };
      if (!response.ok || !data.audioDataUrl) {
        throw new Error(data.error || 'Could not generate the voice preview.');
      }
      setVoicePreviewUrl(data.audioDataUrl);
      setVoicePreviewInfo(`Preview ready: ${data.provider || 'AI'}${data.model ? ` ${data.model}` : ''}.`);
    } catch (error: unknown) {
      setVoicePreviewInfo(error instanceof Error ? error.message : 'Could not generate the voice preview.');
    } finally {
      setVoicePreviewLoading(false);
    }
  };

  const filteredShortcuts = useMemo(() => {
    const q = shortcutSearch.toLowerCase();
    return SHORTCUTS.filter((s) => s.keys.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q));
  }, [shortcutSearch]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-6">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Settings className="w-5 h-5 text-blue-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              Settings, Accessibility &amp; Shortcuts
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 sm:px-5 pt-2.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setTab('general')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
              tab === 'general' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 dark:text-slate-400'
            }`}
          >
            <Accessibility className="w-3.5 h-3.5" /> Preferences &amp; Accessibility
          </button>
          <button
            onClick={() => setTab('shortcuts')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
              tab === 'shortcuts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 dark:text-slate-400'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" /> Keyboard Shortcuts
          </button>
          <button
            onClick={() => setTab('providers')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
              tab === 'providers' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" /> AI Providers
          </button>
          <button
            onClick={() => setTab('storage')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
              tab === 'storage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 dark:text-slate-400'
            }`}
          >
            <Database className="w-3.5 h-3.5" /> Storage
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-none">
          {tab === 'providers' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-xs">
                <div className="font-semibold text-amber-900 dark:text-amber-200">Provider routing</div>
                <div className="mt-1 text-amber-800 dark:text-amber-300">
                  PDF speech: {speechProviderLabel}. AI chat: {chatProviderLabel}.
                  {awsServices.length > 0 &&
                    ` ${awsServices.join(' and ')} may incur charges; check AWS Settings > Billing and your spend limit before use.`}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <div>
                  <div className="text-xs font-semibold">Gemini API key</div>
                  <div className="text-[11px] text-slate-500">
                    {providerSettings.geminiKeyConfigured
                      ? providerSettings.geminiKeySource === 'environment'
                        ? 'Using the server environment key.'
                        : 'A key is saved securely on this server.'
                      : 'No key is configured.'}
                  </div>
                </div>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Paste Gemini API key"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <div className="text-[11px] text-slate-500">
                  Saved encrypted on the server; never returned to the browser. Saving requires localhost or HTTPS.
                </div>
                {providerSettings.geminiKeySource === 'app' && (
                  <button
                    onClick={() => void saveProviderSettings(true)}
                    disabled={providerSaving}
                    className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-50"
                  >
                    Remove saved key
                  </button>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold">PDF speech provider</span>
                  <select
                    value={providerSettings.ttsProviderMode}
                    onChange={(event) =>
                      setProviderSettings((current) => ({
                        ...current,
                        ttsProviderMode: event.target.value as ProviderSettings['ttsProviderMode'],
                      }))
                    }
                    className="max-w-[65%] px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="auto">Auto: Gemini → AWS Polly</option>
                    <option value="gemini">Google Gemini only</option>
                    <option value="polly">AWS Polly only</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold">AI chat provider</span>
                  <select
                    value={providerSettings.chatProviderMode}
                    onChange={(event) =>
                      setProviderSettings((current) => ({
                        ...current,
                        chatProviderMode: event.target.value as ProviderSettings['chatProviderMode'],
                      }))
                    }
                    className="max-w-[65%] px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="auto">Auto: Gemini → AWS Bedrock</option>
                    <option value="gemini">Google Gemini only</option>
                    <option value="bedrock">AWS Bedrock only</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span>
                    <span className="block font-semibold">Preferred Gemini TTS model</span>
                    <span className="text-[11px] text-slate-500">The selected Gemini model will not silently switch to the other quality.</span>
                  </span>
                  <select
                    value={providerSettings.preferredTtsQuality}
                    disabled={providerSettings.ttsProviderMode === 'polly'}
                    onChange={(event) =>
                      setProviderSettings((current) => ({
                        ...current,
                        preferredTtsQuality: event.target.value as 'full' | 'lite',
                      }))
                    }
                    className="px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="full">Gemini Full</option>
                    <option value="lite">Gemini Lite</option>
                  </select>
                </label>
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-3">
                  <div>
                    <div className="text-xs font-semibold">Gemini voice tuning</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      These controls guide Gemini only. The voice character is a model-guided sound, not a guarantee, and may vary by language.
                      AWS Polly keeps its own voice; Auto may use Polly if Gemini is unavailable.
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold">Voice character</span>
                      <select
                        value={providerSettings.ttsVoiceCharacter}
                        disabled={providerSettings.ttsProviderMode === 'polly'}
                        onChange={(event) =>
                          setProviderSettings((current) => ({
                            ...current,
                            ttsVoiceCharacter: event.target.value as ProviderSettings['ttsVoiceCharacter'],
                          }))
                        }
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="auto">Auto (language matched)</option>
                        <option value="feminine">Feminine-sounding (Kore)</option>
                        <option value="masculine">Masculine-sounding (Puck)</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold">Delivery style</span>
                      <select
                        value={providerSettings.ttsVoiceStyle}
                        disabled={providerSettings.ttsProviderMode === 'polly'}
                        onChange={(event) =>
                          setProviderSettings((current) => ({
                            ...current,
                            ttsVoiceStyle: event.target.value as ProviderSettings['ttsVoiceStyle'],
                          }))
                        }
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="natural">Natural audiobook</option>
                        <option value="warm">Warm &amp; friendly</option>
                        <option value="calm">Calm &amp; gentle</option>
                        <option value="energetic">Lively &amp; upbeat</option>
                        <option value="narrator">Clear narrator</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold">Speaking pace</span>
                      <select
                        value={providerSettings.ttsVoiceSpeed}
                        disabled={providerSettings.ttsProviderMode === 'polly'}
                        onChange={(event) =>
                          setProviderSettings((current) => ({
                            ...current,
                            ttsVoiceSpeed: event.target.value as ProviderSettings['ttsVoiceSpeed'],
                          }))
                        }
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="slow">Slow</option>
                        <option value="normal">Normal</option>
                        <option value="brisk">Brisk</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold">Pauses</span>
                      <select
                        value={providerSettings.ttsPauseStyle}
                        disabled={providerSettings.ttsProviderMode === 'polly'}
                        onChange={(event) =>
                          setProviderSettings((current) => ({
                            ...current,
                            ttsPauseStyle: event.target.value as ProviderSettings['ttsPauseStyle'],
                          }))
                        }
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="brief">Brief</option>
                        <option value="natural">Natural</option>
                        <option value="relaxed">Relaxed</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => void generateVoicePreview()}
                      disabled={voicePreviewLoading || providerSaving || providerLoading || !canManageProviderSettings}
                      className="px-3 py-1.5 text-xs font-semibold border border-blue-600 text-blue-700 dark:text-blue-300 rounded-lg disabled:opacity-50"
                    >
                      {voicePreviewLoading ? 'Generating preview…' : 'Save & generate preview'}
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Preview uses the selected provider and may consume Gemini quota or incur AWS charges.
                    </span>
                  </div>
                  {voicePreviewUrl && <audio controls src={voicePreviewUrl} className="w-full" />}
                  {voicePreviewInfo && <div role="status" className="text-[11px] text-slate-500">{voicePreviewInfo}</div>}
                </div>
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-3">
                  <label className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold">AWS authentication</span>
                    <select
                      value={providerSettings.awsCredentialMode}
                      onChange={(event) =>
                        setProviderSettings((current) => ({
                          ...current,
                          awsCredentialMode: event.target.value as ProviderSettings['awsCredentialMode'],
                        }))
                      }
                      className="px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      <option value="profile">AWS CLI profile</option>
                      <option value="access_keys">AWS access keys</option>
                    </select>
                  </label>
                  {providerSettings.awsCredentialMode === 'profile' ? (
                    <label className="flex items-center justify-between gap-3 text-xs">
                      <span>
                        <span className="block font-semibold">AWS CLI profile name</span>
                        <span className="text-[11px] text-slate-500">Credentials are read from this server.</span>
                      </span>
                      <input
                        value={providerSettings.awsProfileName}
                        onChange={(event) =>
                          setProviderSettings((current) => ({ ...current, awsProfileName: event.target.value }))
                        }
                        maxLength={64}
                        className="w-36 px-2 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </label>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] text-slate-500">
                        {providerSettings.awsCredentialsConfigured
                          ? 'AWS access keys are saved encrypted on this server.'
                          : 'Enter an AWS access key ID and secret key.'}
                      </div>
                      <input
                        type="password"
                        value={awsAccessKeyId}
                        onChange={(event) => setAwsAccessKeyId(event.target.value)}
                        autoComplete="new-password"
                        placeholder="AWS Access Key ID"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                      <input
                        type="password"
                        value={awsSecretAccessKey}
                        onChange={(event) => setAwsSecretAccessKey(event.target.value)}
                        autoComplete="new-password"
                        placeholder="AWS Secret Access Key"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                      <input
                        type="password"
                        value={awsSessionToken}
                        onChange={(event) => setAwsSessionToken(event.target.value)}
                        autoComplete="new-password"
                        placeholder="Session Token (temporary keys only)"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                      <div className="text-[11px] text-amber-700 dark:text-amber-300">
                        Prefer temporary credentials or an AWS profile; never use root keys. AWS use may be billed.
                      </div>
                      {providerSettings.awsCredentialsConfigured && (
                        <button
                          onClick={() => void saveProviderSettings(false, true)}
                          disabled={providerSaving}
                          className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-50"
                        >
                          Remove saved AWS keys
                        </button>
                      )}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500">Selected AWS Region: {providerSettings.awsRegion}</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => void saveProviderSettings()}
                  disabled={providerSaving || providerLoading || !canManageProviderSettings}
                  className="px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {providerSaving ? 'Saving…' : 'Save provider settings'}
                </button>
                <div role="status" className="text-[11px] text-slate-500">
                  {providerLoading
                    ? 'Loading…'
                    : providerMessage || (!canManageProviderSettings ? 'Open on localhost or provide host authorization.' : '')}
                </div>
              </div>
            </div>
          ) : tab === 'storage' ? (
            <StoragePanel
              files={storageFiles}
              pageCount={workspacePageCount}
              versionCount={workspaceVersionCount}
              onDeleteFiles={onDeleteFiles}
            />
          ) : tab === 'general' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <div>
                    <div className="text-xs font-semibold">Language / भाषा</div>
                    <div className="text-[11px] text-slate-500">English, Nepali (नेपाली), Hindi (हिन्दी)</div>
                  </div>
                </div>
                <select
                  value={locale}
                  onChange={(e) => onChangeLocale(e.target.value as LocaleCode)}
                  className="px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="en">English</option>
                  <option value="ne">नेपाली (Nepali)</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  {darkMode ? <Moon className="w-4 h-4 text-blue-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
                  <div>
                    <div className="text-xs font-semibold">Workspace Theme</div>
                    <div className="text-[11px] text-slate-500">Switch between Light Studio and Dark Slate</div>
                  </div>
                </div>
                <button
                  onClick={onToggleDarkMode}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  {darkMode ? 'Dark Mode' : 'Light Mode'}
                </button>
              </div>

              <div className="space-y-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>High Contrast Mode</span>
                  <input type="checkbox" checked={highContrast} onChange={onToggleHighContrast} />
                </label>
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>Colorblind-Friendly Swatch Palette (Okabe-Ito)</span>
                  <input type="checkbox" checked={colorblindPalette} onChange={onToggleColorblindPalette} />
                </label>
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span>Stylus / Apple Pencil Palm Rejection</span>
                  <input type="checkbox" checked={palmRejection} onChange={onTogglePalmRejection} />
                </label>
                <div className="pt-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Interface Scaling</span>
                    <span className="font-mono">{Math.round(uiScale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.9}
                    max={1.2}
                    step={0.05}
                    value={uiScale}
                    onChange={(e) => onChangeUiScale(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              {!isInstalled && (isInstallable || isIOS) && (
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold">Install LuminaBoard PWA</div>
                    <div className="text-[11px] text-slate-500">Use fullscreen offline on Android, iPad, Windows, or macOS.</div>
                  </div>
                  {isInstallable ? (
                    <button
                      onClick={install}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" /> Install App
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowIOSGuide((v) => !v)}
                      className="px-3 py-1.5 text-xs font-medium border border-blue-600 text-blue-600 rounded-lg"
                    >
                      iOS Guide
                    </button>
                  )}
                </div>
              )}

              {showIOSGuide && (
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                  1. Tap the <strong>Share</strong> icon in Safari.<br />
                  2. Scroll down and select <strong>Add to Home Screen</strong>.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={shortcutSearch}
                  onChange={(e) => setShortcutSearch(e.target.value)}
                  placeholder="Search keyboard shortcuts..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {filteredShortcuts.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">{s.desc}</span>
                    <kbd className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
