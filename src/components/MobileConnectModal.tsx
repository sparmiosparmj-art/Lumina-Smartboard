import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Eye,
  KeyRound,
  Link2,
  Monitor,
  QrCode,
  Radio,
  Share2,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import type { CollaborationMode, PresenceUser } from '../types/smartboard';
import { apiUrl } from '../utils/api';

type PairPreset = 'teacher' | 'editor' | 'student';

type MobileConnectModalProps = {
  open: boolean;
  realtimeStatus?: 'connected' | 'connecting' | 'disconnected';
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  hostKey?: string;
  collaborationMode: CollaborationMode;
  presence: PresenceUser[];
  broadcastViewport: boolean;
  onToggleBroadcastViewport: (next: boolean) => void;
  followRemoteViewport: boolean;
  onToggleFollowRemoteViewport: (next: boolean) => void;
  remoteViewportSender: { userId: string; userName: string; ts: number } | null;
  onEnableGroupCollab: () => void;
  onNotify?: (msg: string) => void;
};

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({
  open,
  realtimeStatus = 'disconnected',
  onClose,
  workspaceId,
  workspaceName,
  hostKey,
  collaborationMode,
  presence,
  broadcastViewport,
  onToggleBroadcastViewport,
  followRemoteViewport,
  onToggleFollowRemoteViewport,
  remoteViewportSender,
  onEnableGroupCollab,
  onNotify,
}) => {
  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const isLoopbackHost = typeof window !== 'undefined' && /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(window.location.hostname);
  const hasDevPreviewHost = typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-');
  const sharedOrigin = hasDevPreviewHost ? defaultOrigin.replace('://ais-dev-', '://ais-pre-') : defaultOrigin;

  const [preset, setPreset] = useState<PairPreset>(hostKey ? 'teacher' : 'editor');
  const [inviteTicket, setInviteTicket] = useState('');
  const [syncCameraOnScan, setSyncCameraOnScan] = useState(true);
  const [originMode, setOriginMode] = useState<'current' | 'shared' | 'custom'>('current');
  const [customOrigin, setCustomOrigin] = useState(defaultOrigin);
  const [lanOrigin, setLanOrigin] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Keep preset sensible if hostKey loads asynchronously
  useEffect(() => {
    if (open && !hostKey && preset === 'teacher') {
      setPreset('editor');
    }
  }, [open, hostKey, preset]);

  useEffect(() => {
    if (!open || !isLoopbackHost) return;
    let cancelled = false;
    fetch(apiUrl('/api/network/addresses'), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { addresses?: { address?: string }[] } | null) => {
        const address = data?.addresses?.find((item) => typeof item.address === 'string')?.address;
        if (!cancelled && address) {
          const pageUrl = new URL(defaultOrigin);
          const port = pageUrl.port ? `:${pageUrl.port}` : '';
          setLanOrigin(`${pageUrl.protocol}//${address}${port}`);
        }
      })
      .catch(() => {
        if (!cancelled) setLanOrigin('');
      });
    return () => {
      cancelled = true;
    };
  }, [open, isLoopbackHost, defaultOrigin]);

  const activeOrigin = useMemo(() => {
    if (originMode === 'shared' && hasDevPreviewHost) return sharedOrigin;
    if (originMode === 'custom' && customOrigin.trim()) {
      return customOrigin.trim().replace(/\/+$/, '');
    }
    if (originMode === 'current' && isLoopbackHost && lanOrigin) return lanOrigin;
    return defaultOrigin;
  }, [originMode, hasDevPreviewHost, sharedOrigin, customOrigin, defaultOrigin, isLoopbackHost, lanOrigin]);

  useEffect(() => {
    if (!open || preset !== 'teacher' || !hostKey) {
      setInviteTicket('');
      return;
    }
    let cancelled = false;
    setInviteTicket('');
    fetch(apiUrl(`/api/workspaces/${encodeURIComponent(workspaceId)}/invites`), {
      method: 'POST',
      headers: { 'X-Host-Key': hostKey },
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not create a temporary invite');
      if (!cancelled) setInviteTicket(data.token || '');
    }).catch((error: unknown) => {
      if (!cancelled) onNotify?.(error instanceof Error ? error.message : 'Could not create a temporary invite');
    });
    return () => { cancelled = true; };
  }, [open, preset, hostKey, workspaceId, onNotify]);

  const pairUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('room', workspaceId);
    params.set('pair', preset);
    if (preset === 'teacher' && inviteTicket) params.set('ticket', inviteTicket);
    if (syncCameraOnScan && preset !== 'student') {
      params.set('cam', '1');
    }
    return `${activeOrigin}/?${params.toString()}`;
  }, [activeOrigin, workspaceId, preset, inviteTicket, syncCameraOnScan]);

  useEffect(() => {
    if (!open) return;
    if (preset === 'teacher' && !inviteTicket) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(pairUrl, {
      width: 264,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [open, pairUrl, preset, inviteTicket]);

  if (!open) return null;

  const needsGroupCollabWarning =
    preset === 'editor' &&
    (collaborationMode === 'private' ||
      collaborationMode === 'public_readonly' ||
      collaborationMode === 'selected_students');

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pairUrl);
      setCopied(true);
      onNotify?.('1-Tap pairing link copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify?.('Could not access clipboard');
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${workspaceName} — Mobile Connect`,
          text: 'Scan or tap to write and operate this SmartBoard live:',
          url: pairUrl,
        });
      } catch {
        // user cancelled share sheet
      }
    } else {
      void handleCopyLink();
    }
  };

  const handleToggleCamScan = (checked: boolean) => {
    setSyncCameraOnScan(checked);
    if (checked && !followRemoteViewport) {
      onToggleFollowRemoteViewport(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-5">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                1-Tap Mobile &amp; Tablet Connect
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                Scan QR on mobile or tablet to write &amp; operate live on <span className="font-medium">{workspaceName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close mobile connect"
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 studio-scroll">
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5 items-start">
            {/* Left: QR Card */}
            <div className="flex flex-col items-center p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Scan to connect mobile" className="w-44 h-44 block" />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400">
                    Generating QR...
                  </div>
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span>Scan with Phone / Tablet Camera</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 w-full">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Link'}
                </button>
                <button
                  onClick={handleNativeShare}
                  title="Share pairing link"
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Right: Pairing Options */}
            <div className="space-y-3.5">
              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Device Role After Scan
                </div>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={!hostKey}
                    onClick={() => setPreset('teacher')}
                    className={`w-full p-2.5 rounded-lg border text-left transition-colors ${
                      preset === 'teacher'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/35'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    } ${!hostKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                        My Mobile / Tab (Full Teacher Remote)
                      </span>
                      {preset === 'teacher' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-600 text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {hostKey
                        ? 'Write, switch pages, use tools & classroom controls immediately — works even in Private mode.'
                        : 'Host Key unavailable on this session — use Co-Editor mode or claim Teacher first.'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreset('editor')}
                    className={`w-full p-2.5 rounded-lg border text-left transition-colors ${
                      preset === 'editor'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/35'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        Co-Editor (Mobile / Tablet)
                      </span>
                      {preset === 'editor' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-600 text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Draw, type, add shapes/math/diagrams live without sharing Teacher Host Key.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreset('student')}
                    className={`w-full p-2.5 rounded-lg border text-left transition-colors ${
                      preset === 'student'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/35'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-amber-600" />
                        Student / Classroom Participant
                      </span>
                      {preset === 'student' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-600 text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Joins as Student — follows Teacher page switches &amp; participates in polls/Q&amp;A.
                    </div>
                  </button>
                </div>
              </div>

              {needsGroupCollabWarning && (
                <div className="p-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-amber-800 dark:text-amber-200">
                    Board is currently <strong>{collaborationMode.replace('_', ' ')}</strong>. Enable Group Collaboration so Co-Editor can draw immediately.
                  </span>
                  <button
                    onClick={onEnableGroupCollab}
                    className="px-2.5 py-1 rounded bg-amber-600 text-white font-semibold shrink-0 hover:bg-amber-700"
                  >
                    Allow Editors
                  </button>
                </div>
              )}

              {/* Camera / Viewport Sync Controls */}
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-blue-600" />
                  Live Screen &amp; Camera Sync
                </div>
                {preset !== 'student' && (
                  <label className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncCameraOnScan}
                      onChange={(e) => handleToggleCamScan(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>Auto-Sync Mobile View on Scan:</strong> Mobile zoom, pan &amp; page switches stream to connected screens.
                    </span>
                  </label>
                )}
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onToggleFollowRemoteViewport(!followRemoteViewport)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                      followRemoteViewport
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {followRemoteViewport ? 'Mirroring Remote View: ON' : 'Mirror Remote View on This Screen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleBroadcastViewport(!broadcastViewport)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                      broadcastViewport
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    {broadcastViewport ? 'Broadcasting My View: ON' : 'Broadcast This Device View'}
                  </button>
                </div>
                {remoteViewportSender && Date.now() - remoteViewportSender.ts < 30_000 && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Live camera signal received from {remoteViewportSender.userName}
                  </div>
                )}
              </div>

              {/* URL Host selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> QR Target Host
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setOriginMode('current')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        originMode === 'current'
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      Current URL
                    </button>
                    {hasDevPreviewHost && (
                      <button
                        type="button"
                        onClick={() => setOriginMode('shared')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          originMode === 'shared'
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        Shared URL
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOriginMode('custom')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        originMode === 'custom'
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                </div>
                {originMode === 'custom' && (
                  <input
                    value={customOrigin}
                    onChange={(e) => setCustomOrigin(e.target.value)}
                    placeholder={`http://your-host-or-ip${window.location.port ? `:${window.location.port}` : ''}`}
                    className="w-full px-2.5 py-1.5 text-[11px] font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                )}
                {originMode === 'current' && isLoopbackHost && lanOrigin && (
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                    QR uses this device’s network address: <span className="font-mono">{lanOrigin}</span>
                  </div>
                )}
                {originMode === 'current' && isLoopbackHost && !lanOrigin && (
                  <div className="text-[10px] text-amber-700 dark:text-amber-300">
                    Finding this device’s network address for mobile pairing…
                  </div>
                )}
                {preset === 'teacher' && hostKey && (
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      QR uses a one-time teacher invite that expires after five minutes. The permanent Host Key stays on this device.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Connected Devices Live Strip */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
              <span>Live Connected Devices ({presence.length})</span>
              <span className="font-mono text-[10px] text-slate-500">Room: {workspaceId}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presence.length === 0 ? (
                <span className="text-[11px] text-slate-500">Connecting to live room...</span>
              ) : (
                presence.map((u) => (
                  <div
                    key={u.userId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: u.color }} />
                    <span className="font-medium">{u.userName}</span>
                    <span className="text-slate-400 capitalize">· {u.role}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
