import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Download,
  GraduationCap,
  Hand,
  KeyRound,
  Lock,
  MessageSquare,
  MonitorUp,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  Vote,
  X,
} from 'lucide-react';
import type {
  BoardPage,
  ClassroomSessionState,
  CollaborationMode,
  PresenceUser,
  UserRole,
} from '../types/smartboard';
import { uid } from '../utils/geometry';

type ClassroomCollabModalProps = {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  hostKey?: string;
  allowedEditors?: string[];
  onChangeAllowedEditors?: (ids: string[]) => void;
  collaborationMode: CollaborationMode;
  presence: PresenceUser[];
  classroom: ClassroomSessionState;
  pages?: BoardPage[];
  onJumpToPage?: (pageId: string) => void;
  onChangeUserIdentity: (name: string, role: UserRole, hostKey?: string) => void;
  onChangeCollaborationMode: (mode: CollaborationMode) => void;
  onUpdateClassroom: (patch: Partial<ClassroomSessionState>) => void;
  onRaiseHand?: () => void;
  onLowerHand?: (targetUserId?: string) => void;
  onAskQuestion: (text: string) => void;
  onVotePoll: (pollId: string, optionId: string) => void;
  onSubmitQuiz: (quizId: string, answers: number[]) => void;
  onSubmitWork: () => void;
  onGiveFeedback: (submissionId: string, feedback: string, grade: string) => void;
  onSendChat: (text: string) => void;
  onExportClassNotes: () => void;
  onInsertScreenCapture: (dataUrl: string) => void;
  localScreenStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  webrtcIceState?: RTCPeerConnectionState | 'idle';
  webrtcError?: string | null;
  onStartScreenBroadcast: (includeAudio?: boolean) => void;
  onStopScreenBroadcast: () => void;
  onReconnectScreenViewer?: () => void;
  followTeacherLocal: boolean;
  onToggleFollowTeacher: (follow: boolean) => void;
  onOpenMobileQR?: () => void;
};

export const ClassroomCollabModal: React.FC<ClassroomCollabModalProps> = ({
  open,
  onClose,
  workspaceId,
  userId,
  userName,
  userRole,
  hostKey,
  allowedEditors = [],
  onChangeAllowedEditors,
  collaborationMode,
  presence,
  classroom,
  pages = [],
  onJumpToPage,
  onChangeUserIdentity,
  onChangeCollaborationMode,
  onUpdateClassroom,
  onRaiseHand,
  onLowerHand,
  onAskQuestion,
  onVotePoll,
  onSubmitQuiz,
  onSubmitWork,
  onGiveFeedback,
  onSendChat,
  onExportClassNotes,
  onInsertScreenCapture,
  localScreenStream,
  remoteScreenStream,
  webrtcIceState = 'idle',
  webrtcError,
  onStartScreenBroadcast,
  onStopScreenBroadcast,
  onReconnectScreenViewer,
  followTeacherLocal,
  onToggleFollowTeacher,
  onOpenMobileQR,
}) => {
  const [tab, setTab] = useState<'share' | 'classroom' | 'polls' | 'qa' | 'chat'>('classroom');
  const [copied, setCopied] = useState(false);
  const [copiedHostKey, setCopiedHostKey] = useState(false);
  const [hostKeyInput, setHostKeyInput] = useState(hostKey || '');
  const [questionText, setQuestionText] = useState('');
  const [chatText, setChatText] = useState('');
  const [includeAudio, setIncludeAudio] = useState(false);
  const [breakoutName, setBreakoutName] = useState('');
  const [breakoutPageId, setBreakoutPageId] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Poll builder (newline-separated so options with commas don't break)
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOpts, setPollOpts] = useState('Option A\nOption B\nOption C');

  // Multi-question Quiz builder
  const [quizTitle, setQuizTitle] = useState('');
  const [quizPrompt, setQuizPrompt] = useState('');
  const [quizOpts, setQuizOpts] = useState('Choice 1\nChoice 2\nChoice 3\nChoice 4');
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizLockOnSubmit, setQuizLockOnSubmit] = useState(false);
  const [quizDurationSec, setQuizDurationSec] = useState(120);
  const [quizDraftQuestions, setQuizDraftQuestions] = useState<
    { id: string; prompt: string; options: string[]; correctIndex: number }[]
  >([]);
  const [selectedQuizAnswers, setSelectedQuizAnswers] = useState<Record<string, number[]>>({});

  // Screen share stream preview
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeStream = localScreenStream || remoteScreenStream;
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [fbDraft, setFbDraft] = useState('');
  const [gradeDraft, setGradeDraft] = useState('');

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeStream || null;
    }
  }, [activeStream, open, tab]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;

  const isTeacher = userRole === 'teacher';
  const shareUrl = `${window.location.origin}?room=${encodeURIComponent(workspaceId)}`;
  const myHandRaised = Boolean(classroom.raisedHands?.some((h) => h.userId === userId));

  const parseOptionsLines = (raw: string): string[] => {
    const byLine = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (byLine.length >= 2) return byLine;
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadCSV = (filename: string, rows: string[][]) => {
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1500);
  };

  const captureScreenFrameToBoard = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 1280;
    c.height = v.videoHeight || 720;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(v, 0, 0, c.width, c.height);
      onInsertScreenCapture(c.toDataURL('image/png'));
    }
  };

  const launchPoll = () => {
    if (!pollQuestion.trim()) return;
    const options = parseOptionsLines(pollOpts).map((text) => ({ id: uid('opt'), text, votes: [] }));
    if (options.length < 2) return;
    onUpdateClassroom({
      polls: [
        { id: uid('poll'), question: pollQuestion.trim(), options, active: true, createdAt: Date.now() },
        ...classroom.polls,
      ],
    });
    setPollQuestion('');
  };

  const addDraftQuestion = () => {
    if (!quizPrompt.trim()) return;
    const options = parseOptionsLines(quizOpts);
    if (options.length < 2) return;
    setQuizDraftQuestions((prev) => [
      ...prev,
      {
        id: uid('qq'),
        prompt: quizPrompt.trim(),
        options,
        correctIndex: Math.min(options.length - 1, Math.max(0, quizCorrect)),
      },
    ]);
    setQuizPrompt('');
  };

  const launchQuiz = () => {
    const finalQuestions = [...quizDraftQuestions];
    if (quizPrompt.trim()) {
      const options = parseOptionsLines(quizOpts);
      if (options.length >= 2) {
        finalQuestions.push({
          id: uid('qq'),
          prompt: quizPrompt.trim(),
          options,
          correctIndex: Math.min(options.length - 1, Math.max(0, quizCorrect)),
        });
      }
    }
    if (finalQuestions.length === 0) return;
    onUpdateClassroom({
      quizzes: [
        {
          id: uid('quiz'),
          title: quizTitle.trim() || 'Quick Check',
          questions: finalQuestions,
          answers: {},
          active: true,
          lockOnSubmit: quizLockOnSubmit,
          durationSec: quizDurationSec > 0 ? quizDurationSec : undefined,
          startedAt: quizDurationSec > 0 ? Date.now() : undefined,
          createdAt: Date.now(),
        },
        ...classroom.quizzes,
      ],
    });
    setQuizPrompt('');
    setQuizTitle('');
    setQuizDraftQuestions([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-6">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCap className="w-5 h-5 text-blue-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              Collaboration &amp; Classroom Mode
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 sm:px-5 pt-2.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar shrink-0">
          {[
            { id: 'classroom', label: 'Teaching Session', icon: GraduationCap },
            { id: 'share', label: `Permissions & People (${presence.length})`, icon: Users },
            { id: 'polls', label: `Polls & Quizzes (${classroom.polls.length + classroom.quizzes.length})`, icon: Vote },
            { id: 'qa', label: `Q&A & Work (${classroom.questions.length})`, icon: MessageSquare },
            { id: 'chat', label: `Live Chat (${classroom.chat?.length || 0})`, icon: Send },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
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

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 studio-scroll">
          {tab === 'classroom' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    Session Status: {classroom.active ? 'Live Teaching Active' : 'Standby'}
                  </div>
                  <div className="text-xs text-slate-500">
                    Your Role: <strong className="capitalize">{userRole}</strong> · Room ID: <span className="font-mono">{workspaceId}</span>
                  </div>
                </div>
                {isTeacher ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onUpdateClassroom({ active: !classroom.active, teacherId: userId, teacherName: userName })}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg text-white ${
                        classroom.active ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {classroom.active ? 'End Teaching Session' : 'Start Teaching Session'}
                    </button>
                    <button
                      onClick={() => onUpdateClassroom({ studentEditingLocked: !classroom.studentEditingLocked })}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg"
                    >
                      {classroom.studentEditingLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      {classroom.studentEditingLocked ? 'Unlock Student Editing' : 'Lock Student Editing'}
                    </button>
                    <button
                      onClick={() => onUpdateClassroom({ followSpotlight: !classroom.followSpotlight })}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg ${
                        classroom.followSpotlight
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {classroom.followSpotlight ? 'Spotlight Active' : 'Force Student Follow'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={followTeacherLocal}
                        onChange={(e) => onToggleFollowTeacher(e.target.checked)}
                      />
                      Follow Teacher Navigation
                    </label>
                    {(onRaiseHand || onLowerHand) && (
                      <button
                        onClick={() => (myHandRaised ? onLowerHand?.() : onRaiseHand?.())}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border ${
                          myHandRaised
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                        }`}
                      >
                        <Hand className="w-3.5 h-3.5" />
                        {myHandRaised ? 'Hand Raised (Lower)' : 'Raise Hand'}
                      </button>
                    )}
                    <button
                      onClick={onSubmitWork}
                      className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                      Submit Board to Teacher
                    </button>
                  </div>
                )}
              </div>

              {/* Hand-Raise Queue */}
              {(classroom.raisedHands?.length || 0) > 0 && (
                <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <span className="flex items-center gap-1.5">
                      <Hand className="w-3.5 h-3.5" /> Raised Hands ({classroom.raisedHands!.length})
                    </span>
                    {isTeacher && (
                      <button
                        onClick={() => onUpdateClassroom({ raisedHands: [] })}
                        className="text-[11px] font-medium hover:underline"
                      >
                        Lower All
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {classroom.raisedHands!.map((h) => (
                      <div
                        key={h.userId}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-xs"
                      >
                        <span className="font-medium">{h.userName}</span>
                        {(isTeacher || h.userId === userId) && (
                          <button
                            onClick={() =>
                              onLowerHand
                                ? onLowerHand(h.userId)
                                : onUpdateClassroom({
                                    raisedHands: (classroom.raisedHands || []).filter((x) => x.userId !== h.userId),
                                  })
                            }
                            className="text-[11px] text-slate-500 hover:text-red-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isTeacher && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className={`p-3.5 rounded-lg border text-left space-y-2 ${
                      localScreenStream
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <button
                      onClick={() => (localScreenStream ? onStopScreenBroadcast() : onStartScreenBroadcast(includeAudio))}
                      className="w-full text-left flex items-start gap-3"
                    >
                      <MonitorUp className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold">
                          {localScreenStream ? 'Stop Live Screen Broadcast' : 'Broadcast Screen to Class (WebRTC)'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Stream your screen live to connected students and snapshot any frame onto the SmartBoard.
                        </div>
                      </div>
                    </button>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer pl-8">
                      <input
                        type="checkbox"
                        checked={includeAudio}
                        onChange={(e) => setIncludeAudio(e.target.checked)}
                      />
                      Share system/tab audio
                    </label>
                  </div>
                  <button
                    onClick={onExportClassNotes}
                    className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-left flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold">Export Class Notes (PDF)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Compile all annotated lesson boards into a downloadable PDF handout.
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {(activeStream || classroom.screenSharingActive || webrtcError) && (
                <div className="p-3 rounded-lg border border-blue-300 dark:border-blue-800 bg-slate-950 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                    <span className="font-medium">
                      {localScreenStream
                        ? 'Broadcasting Your Screen Live'
                        : activeStream
                          ? `Viewing Teacher Live Screen (${classroom.teacherName})`
                          : 'Waiting for Teacher Screen Stream...'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px]">
                        ICE: {webrtcIceState}
                      </span>
                      {!localScreenStream && onReconnectScreenViewer && (
                        <button
                          onClick={onReconnectScreenViewer}
                          className="px-2 py-0.5 rounded bg-blue-600 text-white flex items-center gap-1 hover:bg-blue-700"
                        >
                          <RefreshCw className="w-3 h-3" /> Reconnect
                        </button>
                      )}
                    </div>
                  </div>
                  {webrtcError && <div className="text-[11px] text-amber-400">{webrtcError}</div>}
                  {activeStream && (
                    <>
                      <video ref={videoRef} autoPlay muted={Boolean(localScreenStream)} playsInline className="w-full max-h-56 rounded bg-black object-contain" />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={captureScreenFrameToBoard}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded"
                        >
                          Place Frame on SmartBoard
                        </button>
                        {localScreenStream && (
                          <button
                            onClick={onStopScreenBroadcast}
                            className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded"
                          >
                            Stop Broadcast
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Breakout Rooms */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Breakout Rooms ({classroom.breakoutRooms?.length || 0})</span>
                  {isTeacher && pages.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={breakoutName}
                        onChange={(e) => setBreakoutName(e.target.value)}
                        placeholder="Room name..."
                        className="w-28 px-2 py-1 text-[11px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                      />
                      <select
                        value={breakoutPageId || pages[0]?.id || ''}
                        onChange={(e) => setBreakoutPageId(e.target.value)}
                        className="px-2 py-1 text-[11px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded max-w-[120px]"
                      >
                        {pages.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const targetPage = breakoutPageId || pages[0]?.id;
                          if (!targetPage) return;
                          const rooms = classroom.breakoutRooms || [];
                          onUpdateClassroom({
                            breakoutRooms: [
                              ...rooms,
                              {
                                id: uid('br'),
                                name: breakoutName.trim() || `Group ${rooms.length + 1}`,
                                pageId: targetPage,
                                memberIds: [],
                              },
                            ],
                          });
                          setBreakoutName('');
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded"
                      >
                        Create
                      </button>
                    </div>
                  )}
                </div>
                {(classroom.breakoutRooms?.length || 0) === 0 ? (
                  <div className="text-[11px] text-slate-500">No breakout rooms active. Teachers can assign board pages as group rooms.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {classroom.breakoutRooms!.map((br) => (
                      <div key={br.id} className="p-2.5 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{br.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            Page: {pages.find((p) => p.id === br.pageId)?.name || 'Board'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {onJumpToPage && (
                            <button
                              onClick={() => {
                                onJumpToPage(br.pageId);
                                onClose();
                              }}
                              className="px-2.5 py-1 text-[11px] font-medium bg-blue-600 text-white rounded"
                            >
                              Join
                            </button>
                          )}
                          {isTeacher && (
                            <button
                              onClick={() =>
                                onUpdateClassroom({
                                  breakoutRooms: classroom.breakoutRooms!.filter((r) => r.id !== br.id),
                                })
                              }
                              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'share' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 min-w-[200px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy Invite Link'}
                </button>
                {onOpenMobileQR && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenMobileQR();
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg hover:opacity-90"
                  >
                    <QrCode className="w-3.5 h-3.5" /> 1-Tap QR Connect
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Your Display Name</label>
                  <input
                    value={userName}
                    onChange={(e) => onChangeUserIdentity(e.target.value, userRole, hostKeyInput || hostKey)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Session Role</label>
                  <select
                    value={userRole}
                    onChange={(e) => onChangeUserIdentity(userName, e.target.value as UserRole, hostKeyInput || hostKey)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="teacher">Teacher (Host Key Protected)</option>
                    <option value="editor">Collaborator (Editor)</option>
                    <option value="student">Student</option>
                    <option value="viewer">Viewer (Read-Only)</option>
                  </select>
                </div>
              </div>

              {isTeacher && hostKey ? (
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div className="font-semibold">Teacher Host Key</div>
                      <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400">{hostKey}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(hostKey);
                      setCopiedHostKey(true);
                      setTimeout(() => setCopiedHostKey(false), 1800);
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    {copiedHostKey ? 'Copied Key' : 'Copy Host Key'}
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                  <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
                  <input
                    value={hostKeyInput}
                    onChange={(e) => setHostKeyInput(e.target.value)}
                    placeholder="Enter Teacher Host Key to unlock teacher controls..."
                    className="flex-1 min-w-[180px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                  />
                  <button
                    disabled={!hostKeyInput.trim()}
                    onClick={() => onChangeUserIdentity(userName, 'teacher', hostKeyInput.trim())}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded disabled:opacity-50"
                  >
                    Claim Teacher
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Workspace Access Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: 'private', label: '1. Private Workspace', desc: 'Only owner/teacher can edit' },
                    { id: 'teacher_controlled', label: '2. Teacher-Controlled', desc: 'Teacher controls student lock' },
                    { id: 'selected_students', label: '3. Selected Student Editing', desc: 'Only granted students edit' },
                    { id: 'group_collab', label: '4. Group Collaboration', desc: 'All editors collaborate live' },
                    { id: 'public_readonly', label: '5. Public Read-Only', desc: 'Broadcast presentation view' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onChangeCollaborationMode(m.id as CollaborationMode)}
                      className={`p-2.5 rounded-lg border text-left ${
                        collaborationMode === m.id
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="text-xs font-semibold">{m.label}</div>
                      <div className="text-[11px] text-slate-500">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Connected Users ({presence.length})
                </div>
                <div className="space-y-1.5">
                  {presence.map((u) => {
                    const allowedStudent = classroom.allowedStudentIds.includes(u.userId);
                    const allowedEditor = allowedEditors.includes(u.userId);
                    return (
                      <div
                        key={u.userId}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span style={{ backgroundColor: u.color }} className="w-3 h-3 rounded-full" />
                          <span className="font-medium">{u.userName}</span>
                          <span className="text-slate-500 capitalize">· {u.role}</span>
                        </div>
                        {isTeacher && u.userId !== userId && (
                          <div className="flex items-center gap-1.5">
                            {u.role === 'student' && (
                              <button
                                onClick={() => {
                                  const next = allowedStudent
                                    ? classroom.allowedStudentIds.filter((id) => id !== u.userId)
                                    : [...classroom.allowedStudentIds, u.userId];
                                  onUpdateClassroom({ allowedStudentIds: next });
                                }}
                                className={`px-2 py-1 rounded text-[11px] font-medium ${
                                  allowedStudent ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {allowedStudent ? 'Student Can Edit' : 'Allow Student'}
                              </button>
                            )}
                            {onChangeAllowedEditors && (
                              <button
                                onClick={() => {
                                  const next = allowedEditor
                                    ? allowedEditors.filter((id) => id !== u.userId)
                                    : [...allowedEditors, u.userId];
                                  onChangeAllowedEditors(next);
                                }}
                                className={`px-2 py-1 rounded text-[11px] font-medium ${
                                  allowedEditor ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {allowedEditor ? 'Editor Added' : 'Add Editor'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'polls' && (
            <div className="space-y-5">
              {isTeacher && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold">Launch Live Poll</div>
                    <input
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="Poll question..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                    />
                    <textarea
                      rows={3}
                      value={pollOpts}
                      onChange={(e) => setPollOpts(e.target.value)}
                      placeholder={'One option per line (commas supported inside options)'}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                    />
                    <button onClick={launchPoll} className="w-full py-1.5 text-xs font-semibold bg-blue-600 text-white rounded">
                      Launch Poll
                    </button>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Create Multi-Question Quiz</span>
                      {quizDraftQuestions.length > 0 && (
                        <span className="text-[11px] font-mono text-emerald-600">{quizDraftQuestions.length} queued</span>
                      )}
                    </div>
                    <input
                      value={quizTitle}
                      onChange={(e) => setQuizTitle(e.target.value)}
                      placeholder="Quiz title..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                    />
                    <input
                      value={quizPrompt}
                      onChange={(e) => setQuizPrompt(e.target.value)}
                      placeholder="Question prompt..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                    />
                    <textarea
                      rows={3}
                      value={quizOpts}
                      onChange={(e) => setQuizOpts(e.target.value)}
                      placeholder={'One choice per line (commas allowed inside choices)'}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>Correct #</span>
                        <input
                          type="number"
                          min={0}
                          max={7}
                          value={quizCorrect}
                          onChange={(e) => setQuizCorrect(Number(e.target.value))}
                          className="w-12 px-1.5 py-1 border rounded bg-white dark:bg-slate-950"
                        />
                        <span className="ml-1">Timer(s):</span>
                        <input
                          type="number"
                          min={0}
                          max={3600}
                          step={15}
                          value={quizDurationSec}
                          onChange={(e) => setQuizDurationSec(Number(e.target.value))}
                          className="w-16 px-1.5 py-1 border rounded bg-white dark:bg-slate-950"
                        />
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={quizLockOnSubmit}
                          onChange={(e) => setQuizLockOnSubmit(e.target.checked)}
                        />
                        Lock on submit
                      </label>
                    </div>
                    {quizDraftQuestions.length > 0 && (
                      <div className="max-h-24 overflow-y-auto space-y-1 text-[11px]">
                        {quizDraftQuestions.map((dq, i) => (
                          <div key={dq.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded">
                            <span className="truncate">Q{i + 1}: {dq.prompt}</span>
                            <button
                              onClick={() => setQuizDraftQuestions((prev) => prev.filter((x) => x.id !== dq.id))}
                              className="text-red-500 ml-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <button
                        onClick={addDraftQuestion}
                        className="flex-1 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Question
                      </button>
                      <button onClick={launchQuiz} className="flex-1 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded">
                        Launch Quiz
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {classroom.polls.map((poll) => {
                const total = poll.options.reduce((s, o) => s + o.votes.length, 0);
                const isPollActive = poll.active !== false;
                return (
                  <div key={poll.id} className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold">
                        Poll: {poll.question} ({total} votes)
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            isPollActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {isPollActive ? 'Active' : 'Closed'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            downloadCSV(`poll_${poll.id}.csv`, [
                              ['Option', 'Votes', 'Percent'],
                              ...poll.options.map((o) => [
                                o.text,
                                String(o.votes.length),
                                total ? `${Math.round((o.votes.length / total) * 100)}%` : '0%',
                              ]),
                            ])
                          }
                          className="px-2 py-0.5 text-[11px] border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> CSV
                        </button>
                        {isTeacher && (
                          <>
                            <button
                              onClick={() =>
                                onUpdateClassroom({
                                  polls: classroom.polls.map((p) =>
                                    p.id === poll.id ? { ...p, active: !isPollActive } : p
                                  ),
                                })
                              }
                              className="px-2 py-0.5 text-[11px] border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {isPollActive ? 'Close' : 'Reopen'}
                            </button>
                            <button
                              onClick={() =>
                                onUpdateClassroom({
                                  polls: classroom.polls.filter((p) => p.id !== poll.id),
                                })
                              }
                              className="px-2 py-0.5 text-[11px] text-red-600 border border-red-200 dark:border-red-900 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {poll.options.map((opt) => {
                        const pct = total ? Math.round((opt.votes.length / total) * 100) : 0;
                        const voted = opt.votes.includes(userId);
                        return (
                          <button
                            key={opt.id}
                            disabled={!isPollActive}
                            onClick={() => onVotePoll(poll.id, opt.id)}
                            className={`w-full text-left p-2 rounded border text-xs relative overflow-hidden disabled:opacity-70 ${
                              voted ? 'border-blue-600' : 'border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <div style={{ width: `${pct}%` }} className="absolute inset-y-0 left-0 bg-blue-600/15" />
                            <div className="relative flex justify-between">
                              <span>{opt.text}</span>
                              <span className="font-mono">{opt.votes.length} ({pct}%)</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {classroom.quizzes.map((q) => {
                if (!q.questions || q.questions.length === 0) return null;
                const submitted = q.answers[userId];
                const remainingSec =
                  q.durationSec && q.startedAt
                    ? Math.max(0, Math.ceil((q.startedAt + q.durationSec * 1000 - nowTick) / 1000))
                    : null;
                const timerExpired = remainingSec !== null && remainingSec <= 0;
                const isQuizActive = q.active !== false && !timerExpired;
                const isLockedForUser = Boolean(q.lockOnSubmit && submitted);
                const draftAns =
                  selectedQuizAnswers[q.id] ||
                  submitted ||
                  q.questions.map(() => 0);
                const score = submitted
                  ? q.questions.reduce((acc, qq, qi) => acc + (submitted[qi] === qq.correctIndex ? 1 : 0), 0)
                  : 0;
                const respondents = Object.entries(q.answers)
                  .map(([uidKey, ansArr]) => ({
                    uidKey,
                    pname: presence.find((p) => p.userId === uidKey)?.userName || uidKey,
                    sc: q.questions.reduce((acc, qq, qi) => acc + (ansArr[qi] === qq.correctIndex ? 1 : 0), 0),
                    ansArr,
                  }))
                  .sort((a, b) => b.sc - a.sc);
                return (
                  <div key={q.id} className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-800 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold flex flex-wrap items-center gap-1.5">
                        <span>Quiz: {q.title} · {respondents.length} responses</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            isQuizActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {isQuizActive ? (q.lockOnSubmit ? 'Single Submit' : 'Active') : timerExpired ? 'Time Up' : 'Closed'}
                        </span>
                        {remainingSec !== null && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-mono text-[10px]">
                            <Clock className="w-3 h-3" />
                            {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isTeacher && (
                          <>
                            <button
                              onClick={() => {
                                const header = ['Student', 'Score', ...q.questions.map((_, qi) => `Q${qi + 1}`)];
                                const rows = respondents.map(({ pname, sc, ansArr }) => [
                                  pname,
                                  `${sc}/${q.questions.length}`,
                                  ...q.questions.map((qq, qi) => qq.options[ansArr[qi]] ?? ''),
                                ]);
                                downloadCSV(`quiz_${q.id}.csv`, [header, ...rows]);
                              }}
                              className="px-2 py-0.5 text-[11px] border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" /> CSV
                            </button>
                            <button
                              onClick={() =>
                                onUpdateClassroom({
                                  quizzes: classroom.quizzes.map((item) =>
                                    item.id === q.id ? { ...item, active: q.active === false } : item
                                  ),
                                })
                              }
                              className="px-2 py-0.5 text-[11px] border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {q.active !== false ? 'Close' : 'Reopen'}
                            </button>
                            <button
                              onClick={() =>
                                onUpdateClassroom({
                                  quizzes: classroom.quizzes.filter((item) => item.id !== q.id),
                                })
                              }
                              className="px-2 py-0.5 text-[11px] text-red-600 border border-red-200 dark:border-red-900 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {q.questions.map((qq, qi) => (
                        <div key={qq.id} className="space-y-1.5">
                          <div className="text-xs font-medium">
                            {q.questions.length > 1 ? `Q${qi + 1}. ` : ''}{qq.prompt}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {qq.options.map((opt, idx) => (
                              <button
                                key={idx}
                                disabled={!isQuizActive || isLockedForUser}
                                onClick={() =>
                                  setSelectedQuizAnswers((prev) => {
                                    const cur = [...(prev[q.id] || submitted || q.questions.map(() => 0))];
                                    cur[qi] = idx;
                                    return { ...prev, [q.id]: cur };
                                  })
                                }
                                className={`p-2 text-xs rounded border text-left disabled:opacity-70 ${
                                  draftAns[qi] === idx
                                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                                    : 'border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isQuizActive && !isLockedForUser && (
                        <button
                          onClick={() => onSubmitQuiz(q.id, draftAns)}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded"
                        >
                          {submitted ? 'Update Answers' : 'Submit Quiz'}
                        </button>
                      )}
                      {submitted && (
                        <span
                          className={`text-[11px] font-medium px-2 py-1 rounded ${
                            score === q.questions.length
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          Score: {score}/{q.questions.length} {isLockedForUser ? '(Locked)' : ''}
                        </span>
                      )}
                    </div>

                    {isTeacher && respondents.length > 0 && (
                      <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-900/50">
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Leaderboard</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
                          {respondents.map(({ uidKey, pname, sc }, rankIdx) => (
                            <div key={uidKey} className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between gap-1">
                              <span className="truncate">#{rankIdx + 1} {pname}</span>
                              <span className="font-mono font-semibold shrink-0">{sc}/{q.questions.length}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'qa' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && questionText.trim()) {
                      onAskQuestion(questionText);
                      setQuestionText('');
                    }
                  }}
                  placeholder="Ask a question to the teacher/class..."
                  className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button
                  onClick={() => {
                    if (!questionText.trim()) return;
                    onAskQuestion(questionText);
                    setQuestionText('');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </div>

              <div className="space-y-2">
                {classroom.questions.map((q) => (
                  <div
                    key={q.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold">{q.userName}:</span> {q.text}
                    </div>
                    {isTeacher && (
                      <button
                        onClick={() =>
                          onUpdateClassroom({
                            questions: classroom.questions.map((item) =>
                              item.id === q.id ? { ...item, resolved: !item.resolved } : item
                            ),
                          })
                        }
                        className={`px-2 py-0.5 rounded text-[11px] shrink-0 ${
                          q.resolved ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
                        }`}
                      >
                        {q.resolved ? 'Resolved' : 'Mark Resolved'}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {classroom.submissions.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="text-xs font-semibold">Student Work Submissions ({classroom.submissions.length})</div>
                  {classroom.submissions.map((sub) => (
                    <div key={sub.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">
                          {sub.userName} · {sub.pageName}
                        </span>
                        {sub.grade && <span className="font-mono text-emerald-600">Grade: {sub.grade}</span>}
                      </div>
                      <img src={sub.snapshotDataUrl} alt={sub.userName} className="w-full max-h-40 object-contain bg-white rounded border" />
                      {sub.feedback && <div className="text-xs text-slate-600 dark:text-slate-300">Feedback: {sub.feedback}</div>}
                      {isTeacher && (
                        editingSubId === sub.id ? (
                          <div className="flex flex-wrap gap-2 items-center pt-1">
                            <input
                              type="text"
                              value={fbDraft}
                              onChange={(e) => setFbDraft(e.target.value)}
                              placeholder="Teacher feedback..."
                              className="flex-1 min-w-[140px] px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                            />
                            <input
                              type="text"
                              value={gradeDraft}
                              onChange={(e) => setGradeDraft(e.target.value)}
                              placeholder="Grade (e.g. A)"
                              className="w-24 px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                            />
                            <button
                              onClick={() => {
                                if (fbDraft.trim() || gradeDraft.trim()) {
                                  onGiveFeedback(sub.id, fbDraft.trim(), gradeDraft.trim());
                                }
                                setEditingSubId(null);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingSubId(null)}
                              className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingSubId(sub.id);
                                setFbDraft(sub.feedback || 'Great work!');
                                setGradeDraft(sub.grade || 'A');
                              }}
                              className="px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded"
                            >
                              Add Feedback &amp; Grade
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'chat' && (
            <div className="flex flex-col h-[52vh] space-y-3">
              <div className="flex-1 overflow-y-auto space-y-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 studio-scroll">
                {(classroom.chat || []).length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-8">
                    No classroom chat messages yet. Say hello to connected participants!
                  </div>
                ) : (
                  (classroom.chat || []).map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2.5 rounded-lg text-xs border ${
                        msg.userId === userId
                          ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 ml-8'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {msg.userName} ({msg.role})
                        </span>
                        <span className="font-mono">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{msg.text}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chatText.trim()) {
                      onSendChat(chatText.trim());
                      setChatText('');
                    }
                  }}
                  placeholder="Type a message to the classroom..."
                  className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <button
                  onClick={() => {
                    if (!chatText.trim()) return;
                    onSendChat(chatText.trim());
                    setChatText('');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
