import katex from 'katex';
import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  Calculator,
  Check,
  Layers,
  MessageCircle,
  Mic,
  MicOff,
  Pin,
  RefreshCw,
  Send,
  Sparkles,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import type {
  AttachedFileMeta,
  BoardObject,
  BoardPage,
  DiagramType,
  LocaleCode,
} from '../types/smartboard';
import { apiUrl } from '../utils/api';
import { getNearestPortsBetweenObjects, getPortPoint, uid } from '../utils/geometry';
import { DIAGRAM_TYPES } from '../utils/templates';
import { centerDiagramObjectsAt } from './ShapeDiagramMenu';

export type AIQuickIntent = {
  section?: 'generate' | 'educate' | 'edit' | 'chat';
  genType?: DiagramType | 'presentation' | 'infographic' | 'chart' | 'table' | 'worksheet';
  sketchMode?: 'shape' | 'handwriting';
  autoRunMath?: boolean;
  autoRunEducate?: boolean;
  customPrompt?: string;
  customContextText?: string;
  nonce: number;
};

type AIAssistantDrawerProps = {
  open: boolean;
  hideTopBar?: boolean;
  workspaceId: string;
  hostKey?: string;
  onClose: () => void;
  locale: LocaleCode;
  activePage: BoardPage;
  selectedIds?: Set<string>;
  initialIntent?: AIQuickIntent | null;
  attachedFiles: AttachedFileMeta[];
  viewportCenter?: { x: number; y: number };
  getCanvasSnapshot: () => string;
  onApplyObjects: (objs: BoardObject[], mode: 'append' | 'replace') => void;
  onApplySlides: (slides: { title: string; subtitle?: string; bullets: string[]; themeColor: string; callout?: string }[]) => void;
  onApplyLayoutUpdates: (updates: { id: string; x: number; y: number; width: number; height: number }[]) => void;
  onLaunchQuizToClass?: (title: string, questions: { id: string; prompt: string; options: string[]; correctIndex: number }[]) => void;
  onUndo: () => void;
};

type DiagramPreview = {
  title: string;
  summary: string;
  nodes: {
    id: string;
    label: string;
    shapeKind: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    stroke: string;
    textColor: string;
  }[];
  connectors: {
    fromNodeId: string;
    toNodeId: string;
    label?: string;
    routeType: 'straight' | 'orthogonal' | 'curved';
  }[];
  chart?: { chartType: 'bar' | 'line' | 'pie'; title: string; labels: string[]; values: number[] };
  table?: { headers: string[]; rows: string[][] };
};

type SpeechResultLike = { isFinal: boolean; 0: { transcript: string } };
type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  open,
  hideTopBar = false,
  workspaceId,
  hostKey,
  onClose,
  locale,
  activePage,
  selectedIds,
  initialIntent,
  attachedFiles,
  viewportCenter,
  getCanvasSnapshot,
  onApplyObjects,
  onApplySlides,
  onApplyLayoutUpdates,
  onLaunchQuizToClass,
  onUndo,
}) => {
  const requestAI = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
    if (hostKey) headers.set('X-Host-Key', hostKey);
    let body = init.body;
    if (typeof body === 'string') {
      try {
        const payload: unknown = JSON.parse(body);
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          body = JSON.stringify({ ...(payload as Record<string, unknown>), workspaceId });
        }
      } catch {
        // Leave non-JSON request bodies unchanged.
      }
    }
    return fetch(apiUrl(path), { ...init, headers, body });
  };

  const [section, setSection] = useState<'generate' | 'educate' | 'edit' | 'chat'>('generate');
  const [genType, setGenType] = useState<DiagramType | 'presentation' | 'infographic' | 'chart' | 'table' | 'worksheet'>('mind_map');
  const [prompt, setPrompt] = useState('');
  const [slideCount, setSlideCount] = useState(5);

  const [eduAction, setEduAction] = useState<'explain' | 'mcqs' | 'lesson_plan' | 'summary' | 'revision' | 'translate' | 'grammar' | 'explain_pdf' | 'flashcards' | 'grade'>('explain');
  const [selectedPdfId, setSelectedPdfId] = useState<string>('');
  const [targetLang, setTargetLang] = useState('Nepali');
  const [rubricText, setRubricText] = useState('Check mathematical steps, accuracy, and clarity');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [replaceOriginalInk, setReplaceOriginalInk] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<string, string>>(new Map());
  const ttsCooldownUntilRef = useRef<number>(0);

  const [diagramPreview, setDiagramPreview] = useState<DiagramPreview | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [selectedPreviewNodes, setSelectedPreviewNodes] = useState<Set<string>>(new Set());
  const [slidesPreview, setSlidesPreview] = useState<{ title: string; subtitle?: string; bullets: string[]; themeColor: string; callout?: string }[] | null>(null);
  const [eduResult, setEduResult] = useState<{
    title: string;
    markdownContent: string;
    stickyNotes: string[];
    mcqs?: { prompt: string; options: string[]; correctIndex: number; explanation: string }[];
  } | null>(null);
  const [flashcardsResult, setFlashcardsResult] = useState<{
    title: string;
    flashcards: { front: string; back: string }[];
    quizQuestions: { prompt: string; options: string[]; correctIndex: number; explanation: string }[];
  } | null>(null);
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [gradeResult, setGradeResult] = useState<{
    scorePercent: number;
    gradeLabel: string;
    strengths: string[];
    mistakes: string[];
    hintForStudent: string;
  } | null>(null);
  const [mathResult, setMathResult] = useState<{
    problem: string;
    finalAnswerLatex: string;
    steps: { title: string; latex: string; explanation: string }[];
    graphExpressions: string[];
  } | null>(null);
  const [sketchResult, setSketchResult] = useState<{
    detectedText: string;
    summary: string;
    shapes: { shapeKind: string; label: string; x: number; y: number; width: number; height: number; stroke: string; fill: string }[];
  } | null>(null);

  // Copilot Streaming Chat State
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [attachSnapshot, setAttachSnapshot] = useState(true);
  const [streamingChat, setStreamingChat] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const runMathSolveRef = useRef<(useCanvasImage?: boolean) => Promise<void>>(async () => {});
  const runSketchRecognizeRef = useRef<(mode: 'shape' | 'handwriting' | 'diagram') => Promise<void>>(async () => {});
  const runEducateRef = useRef<(overridePrompt?: string, overrideContext?: string) => Promise<void>>(async () => {});

  useEffect(() => {
    if (!open || !initialIntent) return;
    if (initialIntent.section) setSection(initialIntent.section);
    if (initialIntent.genType) setGenType(initialIntent.genType);
    if (initialIntent.autoRunMath) {
      setSection('educate');
      void runMathSolveRef.current(true);
    } else if (initialIntent.autoRunEducate) {
      setSection('educate');
      setEduAction('explain_pdf');
      if (initialIntent.customPrompt) setPrompt(initialIntent.customPrompt);
      void runEducateRef.current(initialIntent.customPrompt, initialIntent.customContextText);
    } else if (initialIntent.sketchMode) {
      setSection('edit');
      void runSketchRecognizeRef.current(initialIntent.sketchMode);
    }
  }, [open, initialIntent]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.src = '';
        ttsAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!open) return null;

  const pdfFiles = attachedFiles.filter((f) => f.kind === 'pdf' && f.extractedText);
  const centerPt = viewportCenter || { x: 460, y: 300 };

  const blobTo16kWavBase64 = async (blob: Blob): Promise<{ base64: string; mimeType: string }> => {
    try {
      const arrayBuf = await blob.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        try {
          const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
          const targetRate = 16000;
          const outLen = Math.max(1, Math.ceil(decoded.duration * targetRate));
          const offline = new OfflineAudioContext(1, outLen, targetRate);
          const src = offline.createBufferSource();
          src.buffer = decoded;
          src.connect(offline.destination);
          src.start(0);
          const rendered = await offline.startRendering();
          const samples = rendered.getChannelData(0);
          const wavBuf = new ArrayBuffer(44 + samples.length * 2);
          const view = new DataView(wavBuf);
          const writeStr = (offset: number, s: string) => {
            for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
          };
          writeStr(0, 'RIFF');
          view.setUint32(4, 36 + samples.length * 2, true);
          writeStr(8, 'WAVE');
          writeStr(12, 'fmt ');
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, 1, true);
          view.setUint32(24, targetRate, true);
          view.setUint32(28, targetRate * 2, true);
          view.setUint16(32, 2, true);
          view.setUint16(34, 16, true);
          writeStr(36, 'data');
          view.setUint32(40, samples.length * 2, true);
          let offset = 44;
          for (let i = 0; i < samples.length; i++) {
            const clamped = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
            offset += 2;
          }
          const bytes = new Uint8Array(wavBuf);
          let bin = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          return { base64: btoa(bin), mimeType: 'audio/wav' };
        } finally {
          await ctx.close().catch(() => {});
        }
      }
    } catch {
      // Fallback to raw recorded blob below
    }
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
    const baseMime = (blob.type || 'audio/webm').split(';')[0] || 'audio/webm';
    return { base64: dataUrl, mimeType: baseMime };
  };

  const toggleVoiceDictation = async () => {
    if (recording) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      } else {
        mediaRecorderRef.current?.stop();
      }
      setRecording(false);
      return;
    }
    setError(null);
    const speechWindow = window as Window & {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        const originalPrompt = prompt.trim();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = locale === 'hi' ? 'hi-IN' : locale === 'ne' ? 'ne-NP' : 'en-US';
        recognition.onresult = (event) => {
          const dictated = Array.from(event.results)
            .map((result) => result[0]?.transcript || '')
            .join(' ')
            .trim();
          if (dictated) setPrompt(originalPrompt ? `${originalPrompt} ${dictated}` : dictated);
        };
        recognition.onerror = (event) => {
          setRecording(false);
          speechRecognitionRef.current = null;
          const reason = event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'Microphone permission is blocked. Allow microphone access for this site, then try again.'
            : event.error === 'no-speech'
              ? 'No speech was heard. Click Voice Prompt and speak clearly.'
              : `Voice recognition failed (${event.error}). Check microphone access and try again.`;
          setError(reason);
        };
        recognition.onend = () => {
          if (speechRecognitionRef.current === recognition) {
            speechRecognitionRef.current = null;
            setRecording(false);
          }
        };
        speechRecognitionRef.current = recognition;
        recognition.start();
        setRecording(true);
        return;
      } catch (err: unknown) {
        speechRecognitionRef.current = null;
        setError(err instanceof Error ? err.message : 'Could not start voice recognition.');
        return;
      }
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is unavailable in this browser. Open LuminaBoard on localhost or HTTPS.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType)
      );
      const mr = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
      audioChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      mr.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setTranscribing(false);
        setError('The browser could not record audio. Check microphone access and try again.');
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size < 128) {
          setError('No audio captured. Hold or speak clearly for a moment, then stop.');
          return;
        }
        setTranscribing(true);
        try {
          const { base64, mimeType } = await blobTo16kWavBase64(blob);
          const res = await requestAI('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType, locale }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Voice transcription failed');
          }
          if (data.text) {
            setPrompt((p) => (p ? `${p} ${data.text}` : data.text));
          } else {
            setError('No speech detected in recording.');
          }
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Voice transcription failed');
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = mr;
      mr.start(250);
      setRecording(true);
    } catch (err: unknown) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Microphone permission is blocked. Allow microphone access for this site, then try again.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No microphone was found on this device.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError('The microphone is busy in another app. Close the other app and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not start voice recording.');
      }
    }
  };

  const handleReadAloud = async (textToSpeak: string) => {
    const snippet = textToSpeak.trim().slice(0, 1500);
    if (!snippet) return;
    if (speaking) {
      ttsAudioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    setError(null);
    const cacheKey = `${locale}:${snippet}`;
    const playAudioUrl = async (url: string) => {
      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      audio.onended = () => setSpeaking(false);
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    };

    const cachedUrl = ttsCacheRef.current.get(cacheKey);
    if (cachedUrl) {
      try {
        await playAudioUrl(cachedUrl);
        return;
      } catch {
        // Fall through to browser speech
      }
    }

    if (Date.now() >= ttsCooldownUntilRef.current) {
      try {
        const res = await requestAI('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: snippet, locale }),
        });
        if (res.ok) {
          const data = await res.json();
          const url =
            data.audioDataUrl ||
            (data.audioBase64 ? `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}` : '');
          if (url) {
            if (ttsCacheRef.current.size >= 20) {
              const first = ttsCacheRef.current.keys().next().value;
              if (first !== undefined) ttsCacheRef.current.delete(first);
            }
            ttsCacheRef.current.set(cacheKey, url);
            await playAudioUrl(url);
            return;
          }
        } else {
          const errData = await res.json().catch(() => ({} as { error?: string; retryAfterSeconds?: number }));
          if (res.status === 429) {
            const waitSec = Number(errData.retryAfterSeconds || 30);
            ttsCooldownUntilRef.current = Date.now() + waitSec * 1000;
            setError(
              errData.error ||
                `Gemini TTS rate limit reached. Retry in ${waitSec}s or select a billing-enabled API key in Settings > Secrets. Using browser voice.`
            );
          } else if (errData.error) {
            setError(errData.error);
          }
        }
      } catch {
        // Fallback below
      }
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(snippet);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } else {
      setSpeaking(false);
    }
  };

  const runGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setDiagramPreview(null);
    setSlidesPreview(null);
    try {
      if (genType === 'presentation') {
        const res = await requestAI('/api/ai/generate-presentation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: prompt, slideCount, locale }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Presentation generation failed');
        setSlidesPreview(data.slides || []);
      } else {
        const res = await requestAI('/api/ai/generate-diagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, diagramType: genType, locale }),
        });
        const data = (await res.json()) as DiagramPreview & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Diagram generation failed');
        setDiagramPreview(data);
        setSelectedPreviewNodes(new Set((data.nodes || []).map((n) => n.id)));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setLoading(false);
    }
  };

  const applyDiagramPreview = (replaceExisting = false) => {
    if (!diagramPreview) return;
    const idMap = new Map<string, string>();
    const newObjs: BoardObject[] = [];
    const chosenNodes = diagramPreview.nodes.filter((n) => selectedPreviewNodes.has(n.id));

    for (const n of chosenNodes) {
      const realId = uid('shape');
      idMap.set(n.id, realId);
      newObjs.push({
        id: realId,
        name: n.label.slice(0, 32),
        type: 'shape',
        shapeKind: (n.shapeKind as never) || 'rounded_rect',
        x: Math.round(n.x),
        y: Math.round(n.y),
        width: Math.max(110, Math.round(n.width)),
        height: Math.max(54, Math.round(n.height)),
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: activePage.objects.length + newObjs.length + 1,
        fill: n.fill || '#EFF6FF',
        stroke: n.stroke || '#2563EB',
        strokeWidth: 2,
        text: n.label,
        textColor: n.textColor || '#0F172A',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 14,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      });
    }

    for (const c of diagramPreview.connectors) {
      const fId = idMap.get(c.fromNodeId);
      const tId = idMap.get(c.toNodeId);
      if (!fId || !tId) continue;
      const fromObj = newObjs.find((o) => o.id === fId)!;
      const toObj = newObjs.find((o) => o.id === tId)!;
      const { fromPort, toPort } = getNearestPortsBetweenObjects(fromObj, toObj);
      const p1 = getPortPoint(fromObj, fromPort);
      const p2 = getPortPoint(toObj, toPort);
      newObjs.push({
        id: uid('conn'),
        name: c.label || 'Link',
        type: 'connector',
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.max(10, Math.abs(p2.x - p1.x)),
        height: Math.max(10, Math.abs(p2.y - p1.y)),
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: activePage.objects.length + newObjs.length + 1,
        fromId: fId,
        toId: tId,
        fromPort,
        toPort,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        routeType: c.routeType || 'curved',
        stroke: '#475569',
        strokeWidth: 2,
        lineStyle: 'solid',
        startHead: 'none',
        endHead: 'arrow',
        label: c.label,
      });
    }

    if (diagramPreview.chart && diagramPreview.chart.labels?.length > 0) {
      newObjs.push({
        id: uid('chart'),
        name: diagramPreview.chart.title || 'AI Chart',
        type: 'chart',
        x: Math.round(centerPt.x - 220),
        y: Math.round(centerPt.y - 145),
        width: 440,
        height: 290,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: activePage.objects.length + newObjs.length + 1,
        chartType: diagramPreview.chart.chartType || 'bar',
        title: diagramPreview.chart.title || diagramPreview.title,
        labels: diagramPreview.chart.labels,
        values: diagramPreview.chart.values,
        colors: ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626'],
      });
    }

    if (diagramPreview.table && diagramPreview.table.headers?.length > 0) {
      const cells = [diagramPreview.table.headers, ...(diagramPreview.table.rows || [])];
      const th = Math.max(180, cells.length * 44);
      newObjs.push({
        id: uid('table'),
        name: diagramPreview.title,
        type: 'table',
        x: Math.round(centerPt.x - 330),
        y: Math.round(centerPt.y - th / 2),
        width: 660,
        height: th,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: activePage.objects.length + newObjs.length + 1,
        rows: cells.length,
        cols: diagramPreview.table.headers.length,
        cells,
        headerBg: '#1E293B',
        borderColor: '#CBD5E1',
        textColor: '#0F172A',
      });
    }

    const centered = centerDiagramObjectsAt(newObjs, centerPt);
    onApplyObjects(centered, replaceExisting ? 'replace' : 'append');
  };

  const getBoardContextText = () =>
    activePage.objects
      .map((o) => ('text' in o ? o.text : o.type === 'math' ? o.latex : o.name || ''))
      .filter(Boolean)
      .join('\n');

  const runEducate = async (overridePrompt?: string, overrideContext?: string) => {
    setLoading(true);
    setError(null);
    setEduResult(null);
    setMathResult(null);
    setFlashcardsResult(null);
    setGradeResult(null);
    try {
      const pdfCtx = overrideContext ?? (selectedPdfId ? pdfFiles.find((f) => f.fileId === selectedPdfId)?.extractedText : undefined);
      const boardText = getBoardContextText();
      const effectiveAction = overrideContext ? 'explain_pdf' : eduAction;
      const effectivePrompt = overridePrompt ?? prompt;

      if (effectiveAction === 'flashcards') {
        const res = await requestAI('/api/ai/quiz-flashcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: effectivePrompt.trim() || activePage.name || 'Current Board Lesson',
            contextText: pdfCtx || boardText,
            count: 5,
            locale,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Flashcards generation failed');
        setFlippedCards(new Set());
        setFlashcardsResult(data);
        return;
      }

      if (effectiveAction === 'grade') {
        const snapshot = getCanvasSnapshot();
      const res = await requestAI('/api/ai/grade-work', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rubric: rubricText.trim() || 'Check mathematical steps, reasoning, and completeness',
            studentText: effectivePrompt.trim() || boardText,
            imageBase64: snapshot,
            locale,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Student work grading failed');
        setGradeResult(data);
        return;
      }

      const res = await requestAI('/api/ai/educate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: effectiveAction,
          prompt: effectivePrompt || (effectiveAction === 'explain_pdf' ? 'Explain this uploaded PDF clearly with key takeaways.' : 'Analyze the board content.'),
          contextText: pdfCtx || boardText,
          locale,
          targetLanguage: effectiveAction === 'translate' ? targetLang : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI education failed');
      setEduResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setLoading(false);
    }
  };
  runEducateRef.current = runEducate;

  const runMathSolve = async (useCanvasImage = false) => {
    setLoading(true);
    setError(null);
    setMathResult(null);
    setEduResult(null);
    setFlashcardsResult(null);
    setGradeResult(null);
    try {
      const imageBase64 = useCanvasImage ? getCanvasSnapshot() : undefined;
      const res = await requestAI('/api/ai/math-solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: prompt, imageBase64, locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Math solver failed');
      setMathResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Math solve failed');
    } finally {
      setLoading(false);
    }
  };
  runMathSolveRef.current = runMathSolve;

  const runSketchRecognize = async (mode: 'shape' | 'handwriting' | 'diagram') => {
    setLoading(true);
    setError(null);
    setSketchResult(null);
    try {
      const imageBase64 = getCanvasSnapshot();
      const res = await requestAI('/api/ai/recognize-sketch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mode, width: 1100, height: 700 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sketch recognition failed');
      setSketchResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sketch recognition failed');
    } finally {
      setLoading(false);
    }
  };
  runSketchRecognizeRef.current = runSketchRecognize;

  const runLayoutImprove = async () => {
    const simpleObjs = activePage.objects
      .filter((o) => o.type !== 'stroke' && o.type !== 'connector' && !o.locked && !o.hidden)
      .map((o) => ({
        id: o.id,
        type: o.type,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        text: 'text' in o ? o.text : o.name,
      }));
    if (simpleObjs.length === 0) {
      setError('Add unlocked shapes, sticky notes, or text boxes first to rearrange layout.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await requestAI('/api/ai/clean-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objects: simpleObjs,
          instruction: prompt || 'Align cleanly, prevent overlap, and organize visual hierarchy',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Layout improvement failed');
      if (Array.isArray(data.updates) && data.updates.length > 0) {
        onApplyLayoutUpdates(data.updates);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Layout improvement failed');
    } finally {
      setLoading(false);
    }
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || streamingChat) return;
    const nextHistory: { role: 'user' | 'assistant'; text: string }[] = [
      ...chatMessages,
      { role: 'user', text },
    ];
    setChatMessages([...nextHistory, { role: 'assistant', text: '' }]);
    setChatInput('');
    setStreamingChat(true);
    setError(null);

    try {
      const imageBase64 = attachSnapshot ? getCanvasSnapshot() : undefined;
      const res = await requestAI('/api/ai/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory,
          boardContext: `Page "${activePage.name}":\n${getBoardContextText().slice(0, 3000)}`,
          imageBase64,
          locale,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'AI chat stream failed');
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Streaming not supported in browser');
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payloadStr = trimmed.slice(5).trim();
          if (!payloadStr) continue;
          try {
            const parsed = JSON.parse(payloadStr) as { chunk?: string; done?: boolean; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk) {
              accumulated += parsed.chunk;
              setChatMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', text: accumulated };
                return copy;
              });
              chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
              // ignore partial frame
            }
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI chat failed');
      setChatMessages((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].role === 'assistant' && !copy[copy.length - 1].text) {
          copy.pop();
        }
        return copy;
      });
    } finally {
      setStreamingChat(false);
    }
  };

  return (
    <aside
      className={`fixed right-0 ${
        hideTopBar ? 'top-0' : 'top-12'
      } bottom-0 w-full sm:w-[410px] max-w-full z-40 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col pb-safe`}
    >
      <div className="flex items-center justify-between px-4 py-2.5 sm:py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">AI SmartBoard Assistant</h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onUndo}
            className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
          >
            Undo Last
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-4 gap-1 p-1.5 sm:p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
        {[
          { id: 'generate', label: 'Generate', icon: Sparkles },
          { id: 'educate', label: 'Teach & Math', icon: BookOpen },
          { id: 'edit', label: 'Clean & Sketch', icon: Wand2 },
          { id: 'chat', label: 'Copilot Chat', icon: MessageCircle },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSection(t.id as typeof section)}
              className={`flex items-center justify-center gap-1 py-2 px-1 text-[11px] font-medium rounded-lg transition-colors ${
                section === t.id
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div
        className={`flex-1 min-h-0 p-3.5 sm:p-4 ${
          section === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto space-y-4 studio-scroll'
        }`}
      >
        {section === 'generate' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Output Type
              </label>
              <select
                value={genType}
                onChange={(e) => setGenType(e.target.value as typeof genType)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                <optgroup label="Smart Diagrams">
                  {DIAGRAM_TYPES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Decks, Charts & Worksheets">
                  <option value="presentation">Multi-Slide Presentation</option>
                  <option value="infographic">Educational Infographic</option>
                  <option value="chart">Data Chart</option>
                  <option value="table">Structured Table</option>
                  <option value="worksheet">Educational Worksheet</option>
                </optgroup>
              </select>
            </div>

            {genType === 'presentation' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Slide Count ({slideCount})
                </label>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={slideCount}
                  onChange={(e) => setSlideCount(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Prompt
                </label>
                <button
                  type="button"
                  onClick={toggleVoiceDictation}
                  disabled={transcribing}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border ${
                    recording
                      ? 'bg-red-600 text-white border-red-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {recording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  {recording ? 'Stop Voice' : transcribing ? 'Transcribing...' : 'Voice Prompt'}
                </button>
              </div>
              {recording && (
                <div role="status" aria-live="polite" className="mb-1.5 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-700 dark:bg-red-950/35 dark:text-red-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
                  Listening… speak now; your words should appear in the prompt as you talk.
                </div>
              )}
              {transcribing && (
                <div role="status" aria-live="polite" className="mb-1.5 flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/35 dark:text-blue-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
                  Transcribing your voice…
                </div>
              )}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder='e.g. "Create a mind map about Artificial Intelligence" or "Flowchart of the human digestive system"'
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                'Mind map about Artificial Intelligence',
                'Flowchart of human digestive system',
                'Explain photosynthesis diagram',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="px-2 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-slate-700 dark:text-slate-300 rounded"
                >
                  {ex}
                </button>
              ))}
            </div>

            <button
              disabled={loading || !prompt.trim()}
              onClick={runGenerate}
              className="w-full py-2.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Generating Preview...' : 'Generate Editable Preview'}
            </button>
          </div>
        )}

        {section === 'educate' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'explain', label: 'Explain Topic' },
                { id: 'mcqs', label: 'Generate MCQs' },
                { id: 'flashcards', label: 'Flashcards & Quiz' },
                { id: 'grade', label: 'Grade Student Work' },
                { id: 'lesson_plan', label: 'Lesson Plan' },
                { id: 'summary', label: 'Summary' },
                { id: 'revision', label: 'Revision Material' },
                { id: 'translate', label: 'Translate' },
                { id: 'grammar', label: 'Fix Grammar' },
                { id: 'explain_pdf', label: 'Explain PDF' },
              ].map((a) => (
                <button
                  key={a.id}
                  onClick={() => setEduAction(a.id as typeof eduAction)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border text-left ${
                    eduAction === a.id
                      ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-600 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {eduAction === 'explain_pdf' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Uploaded PDF Document
                </label>
                {pdfFiles.length === 0 ? (
                  <p className="text-xs text-amber-600">Upload a PDF in PDF Studio or Board first.</p>
                ) : (
                  <select
                    value={selectedPdfId}
                    onChange={(e) => setSelectedPdfId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">Select PDF...</option>
                    {pdfFiles.map((f) => (
                      <option key={f.fileId} value={f.fileId}>
                        {f.fileName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {eduAction === 'translate' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Target Language
                </label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="English">English</option>
                  <option value="Nepali (नेपाली)">Nepali (नेपाली)</option>
                  <option value="Hindi (हिन्दी)">Hindi (हिन्दी)</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                </select>
              </div>
            )}

            {eduAction === 'grade' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Grading Rubric (reads current canvas snapshot)
                </label>
                <input
                  value={rubricText}
                  onChange={(e) => setRubricText(e.target.value)}
                  placeholder="Rubric criteria..."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Question, Topic, or Equation</span>
                <button
                  type="button"
                  onClick={toggleVoiceDictation}
                  disabled={transcribing}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border ${
                    recording
                      ? 'bg-red-600 text-white border-red-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {recording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  {recording ? 'Stop Voice' : transcribing ? 'Transcribing...' : 'Voice Input'}
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="Enter topic, math equation (e.g. Solve x^2 - 5x + 6 = 0), or question..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="flex gap-2">
              <button
                disabled={loading}
                onClick={() => void runEducate()}
                className="flex-1 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading
                  ? 'Working...'
                  : eduAction === 'flashcards'
                    ? 'Build Flashcards & Quiz'
                    : eduAction === 'grade'
                      ? 'Grade Current Board'
                      : 'Run AI Education'}
              </button>
              <button
                disabled={loading}
                onClick={() => runMathSolve(false)}
                className="px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-50"
              >
                <Calculator className="w-3.5 h-3.5" />
                Solve Math
              </button>
            </div>
            <button
              disabled={loading}
              onClick={() => runMathSolve(true)}
              className="w-full py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Read &amp; Solve Math Drawn on Canvas
            </button>
          </div>
        )}

        {section === 'edit' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Analyze your current board strokes or objects to clean handwriting, convert rough sketches into editable diagrams, or improve layout alignment.
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button
                disabled={loading}
                onClick={() => runSketchRecognize('shape')}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-left"
              >
                <div className="text-xs font-semibold">Convert Sketch to Clean Shapes</div>
                <div className="text-[11px] text-slate-500">Recognizes drawn boxes, circles, and diagrams into editable vectors.</div>
              </button>
              <button
                disabled={loading}
                onClick={() => runSketchRecognize('handwriting')}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-left"
              >
                <div className="text-xs font-semibold">Convert Handwriting to Editable Text</div>
                <div className="text-[11px] text-slate-500">Transcribes handwritten board ink into an editable text block.</div>
              </button>
              <button
                disabled={loading}
                onClick={runLayoutImprove}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-left"
              >
                <div className="text-xs font-semibold">Rearrange &amp; Align Board Objects</div>
                <div className="text-[11px] text-slate-500">Automatically fixes spacing, alignment, and hierarchy for unlocked items.</div>
              </button>
            </div>
          </div>
        )}

        {section === 'chat' && (
          <div className="flex flex-col flex-1 min-h-0 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachSnapshot}
                  onChange={(e) => setAttachSnapshot(e.target.checked)}
                />
                Attach Board Snapshot
              </label>
              {chatMessages.length > 0 && (
                <button
                  onClick={() => setChatMessages([])}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Clear Chat
                </button>
              )}
            </div>

            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto space-y-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 studio-scroll"
            >
              {chatMessages.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8 space-y-2">
                  <p>Ask the AI Board Copilot about anything on your canvas, create examples, or draft explanations.</p>
                  <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                    {[
                      'Summarize key points on this board',
                      'Give 3 practice questions for this topic',
                      'Check my work for mistakes',
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => setChatInput(s)}
                        className="px-2 py-1 text-[11px] rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-500"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg text-xs border ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white border-blue-600 ml-6'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 mr-4'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{m.text || (streamingChat ? 'Thinking...' : '')}</div>
                    {m.role === 'assistant' && m.text && (
                      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                        <button
                          onClick={() => {
                            onApplyObjects(
                              [
                                {
                                  id: uid('sticky'),
                                  name: 'Copilot Note',
                                  type: 'sticky',
                                  x: Math.round(centerPt.x - 140),
                                  y: Math.round(centerPt.y - 100),
                                  width: 280,
                                  height: 200,
                                  rotation: 0,
                                  opacity: 1,
                                  locked: false,
                                  hidden: false,
                                  zIndex: activePage.objects.length + 1,
                                  text: m.text.slice(0, 600),
                                  noteColor: '#BAE6FD',
                                  textColor: '#0F172A',
                                  author: 'AI Copilot',
                                  fontSize: 13,
                                  reactions: {},
                                },
                              ],
                              'append'
                            );
                          }}
                          className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Pin className="w-3 h-3" /> Pin to Board
                        </button>
                        <button
                          onClick={() => handleReadAloud(m.text)}
                          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          <Volume2 className="w-3 h-3" /> {speaking ? 'Stop' : 'Speak'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendChatMessage();
                  }
                }}
                placeholder="Ask AI Board Copilot..."
                className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                disabled={streamingChat || !chatInput.trim()}
                onClick={() => void sendChatMessage()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Preview: Generated Diagram with Selective Node Toggle */}
        {diagramPreview && (
          <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{diagramPreview.title}</div>
              <button onClick={runGenerate} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                <RefreshCw className="w-3 h-3" /> Regenerate
              </button>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">{diagramPreview.summary}</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {diagramPreview.nodes.map((n) => (
                <label key={n.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPreviewNodes.has(n.id)}
                    onChange={(e) => {
                      const next = new Set(selectedPreviewNodes);
                      if (e.target.checked) next.add(n.id);
                      else next.delete(n.id);
                      setSelectedPreviewNodes(next);
                    }}
                  />
                  <span className="truncate">{n.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setConfirmReplace(false);
                  applyDiagramPreview(false);
                }}
                className="flex-1 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Add to Board
              </button>
              {confirmReplace ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setConfirmReplace(false);
                      applyDiagramPreview(true);
                    }}
                    className="px-2.5 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Confirm Replace
                  </button>
                  <button
                    onClick={() => setConfirmReplace(false)}
                    className="px-2 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReplace(true)}
                  className="px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-white dark:hover:bg-slate-800"
                >
                  Replace Page
                </button>
              )}
            </div>
          </div>
        )}

        {/* Preview: Generated Presentation */}
        {slidesPreview && (
          <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
            <div className="text-xs font-semibold">Preview: {slidesPreview.length} Slides Ready</div>
            <div className="max-h-44 overflow-y-auto space-y-1.5">
              {slidesPreview.map((s, idx) => (
                <div key={idx} className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold">
                    {idx + 1}. {s.title}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{s.bullets.join(' · ')}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                onApplySlides(slidesPreview);
                setSlidesPreview(null);
              }}
              className="w-full py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Insert {slidesPreview.length} Editable Slides
            </button>
          </div>
        )}

        {/* Preview: Math Solution */}
        {mathResult && (
          <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">{mathResult.problem}</div>
              <button
                onClick={() =>
                  handleReadAloud(
                    `${mathResult.problem}. ${mathResult.steps.map((s) => `${s.title}: ${s.explanation}`).join('. ')}`
                  )
                }
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-emerald-300 dark:border-emerald-700 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/40 shrink-0"
              >
                <Volume2 className="w-3 h-3" /> {speaking ? 'Stop' : 'Read Aloud'}
              </button>
            </div>
            <div
              className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-x-auto text-sm"
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(mathResult.finalAnswerLatex || '', { throwOnError: false, displayMode: true }),
              }}
            />
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {mathResult.steps.map((st, idx) => (
                <div key={idx} className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="font-semibold">
                    Step {idx + 1}: {st.title}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{st.explanation}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const objs: BoardObject[] = [
                  {
                    id: uid('math'),
                    name: 'AI Math Solution',
                    type: 'math',
                    x: Math.round(centerPt.x - 210),
                    y: Math.round(centerPt.y - 140),
                    width: 420,
                    height: 92,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: activePage.objects.length + 1,
                    latex: mathResult.finalAnswerLatex,
                    color: '#0F172A',
                    bgColor: '#ECFDF5',
                    fontSize: 20,
                  },
                ];
                if (mathResult.graphExpressions?.length > 0) {
                  objs.push({
                    id: uid('graph'),
                    name: 'AI Solution Graph',
                    type: 'graph',
                    x: Math.round(centerPt.x - 220),
                    y: Math.round(centerPt.y - 30),
                    width: 440,
                    height: 300,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: activePage.objects.length + 2,
                    mode: '2d',
                    expressions: mathResult.graphExpressions.map((ex, i) => ({
                      id: uid('ge'),
                      expr: ex,
                      color: i === 0 ? '#2563EB' : '#059669',
                      visible: true,
                    })),
                    xMin: -8,
                    xMax: 8,
                    yMin: -8,
                    yMax: 8,
                    showGrid: true,
                    title: mathResult.graphExpressions.join(', '),
                  });
                }
                onApplyObjects(objs, 'append');
              }}
              className="w-full py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              Insert Solution &amp; Graph on Board
            </button>
          </div>
        )}

        {/* Preview: Flashcards & Quiz Pack */}
        {flashcardsResult && (
          <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                {flashcardsResult.title}
              </div>
              <span className="text-[11px] text-slate-500">Click card to flip</span>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {(flashcardsResult.flashcards || []).map((c, idx) => {
                const flipped = flippedCards.has(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      const next = new Set(flippedCards);
                      if (flipped) next.delete(idx);
                      else next.add(idx);
                      setFlippedCards(next);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${
                      flipped
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                      {flipped ? 'Answer / Back' : `Card ${idx + 1} · Question / Front`}
                    </div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">{flipped ? c.back : c.front}</div>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const cards = (flashcardsResult.flashcards || []).map(
                    (c, i): BoardObject => ({
                      id: uid('sticky'),
                      name: `Flashcard ${i + 1}`,
                      type: 'sticky',
                      x: Math.round(centerPt.x - 350 + (i % 3) * 240),
                      y: Math.round(centerPt.y - 160 + Math.floor(i / 3) * 190),
                      width: 220,
                      height: 170,
                      rotation: 0,
                      opacity: 1,
                      locked: false,
                      hidden: false,
                      zIndex: activePage.objects.length + i + 1,
                      text: `Q: ${c.front}\n\nA: ${c.back}`,
                      noteColor: i % 2 === 0 ? '#FEF08A' : '#BBF7D0',
                      textColor: '#0F172A',
                      author: 'Study Deck',
                      fontSize: 12,
                      reactions: {},
                    })
                  );
                  onApplyObjects(cards, 'append');
                }}
                className="flex-1 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Insert Cards on Board
              </button>
              {onLaunchQuizToClass && (flashcardsResult.quizQuestions || []).length > 0 && (
                <button
                  onClick={() => {
                    onLaunchQuizToClass(
                      flashcardsResult.title,
                      flashcardsResult.quizQuestions.map((qq) => ({
                        id: uid('qq'),
                        prompt: qq.prompt,
                        options: qq.options,
                        correctIndex: qq.correctIndex,
                      }))
                    );
                  }}
                  className="px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  Push to Class Quiz
                </button>
              )}
            </div>
          </div>
        )}

        {/* Preview: AI Grading Result */}
        {gradeResult && (
          <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="font-semibold flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-600" />
                Assessment Feedback
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono font-semibold">
                {gradeResult.gradeLabel} ({gradeResult.scorePercent}%)
              </span>
            </div>
            {gradeResult.strengths?.length > 0 && (
              <div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">Strengths:</div>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {gradeResult.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {gradeResult.mistakes?.length > 0 && (
              <div>
                <div className="font-semibold text-red-700 dark:text-red-400">Needs Attention:</div>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {gradeResult.mistakes.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
            {gradeResult.hintForStudent && (
              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px]">
                <strong>Hint:</strong> {gradeResult.hintForStudent}
              </div>
            )}
            <button
              onClick={() => {
                const txt = `Grade: ${gradeResult.gradeLabel} (${gradeResult.scorePercent}%)\n\nStrengths:\n- ${gradeResult.strengths.join('\n- ')}\n\nHint: ${gradeResult.hintForStudent}`;
                onApplyObjects(
                  [
                    {
                      id: uid('sticky'),
                      name: 'AI Feedback',
                      type: 'sticky',
                      x: Math.round(centerPt.x - 130),
                      y: Math.round(centerPt.y - 100),
                      width: 260,
                      height: 200,
                      rotation: 0,
                      opacity: 1,
                      locked: false,
                      hidden: false,
                      zIndex: activePage.objects.length + 1,
                      text: txt,
                      noteColor: '#FDE68A',
                      textColor: '#0F172A',
                      author: 'AI Grader',
                      fontSize: 12,
                      reactions: {},
                    },
                  ],
                  'append'
                );
              }}
              className="w-full py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Pin Feedback Sticky to Board
            </button>
          </div>
        )}

        {/* Preview: Education Result */}
        {eduResult && (
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{eduResult.title}</div>
              <button
                onClick={() => handleReadAloud(`${eduResult.title}. ${eduResult.markdownContent}`)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"
              >
                <Volume2 className="w-3 h-3" /> {speaking ? 'Stop' : 'Read Aloud'}
              </button>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {eduResult.markdownContent}
            </div>
            {eduResult.mcqs && eduResult.mcqs.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-blue-600">Generated Questions ({eduResult.mcqs.length})</div>
                {eduResult.mcqs.map((q, i) => (
                  <div key={i} className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]">
                    <div className="font-medium">
                      {i + 1}. {q.prompt}
                    </div>
                    <div className="text-slate-500 mt-0.5">{q.options.join(' | ')}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const notes = (eduResult.stickyNotes?.length ? eduResult.stickyNotes : [eduResult.markdownContent.slice(0, 260)]).map(
                  (txt, i): BoardObject => ({
                    id: uid('sticky'),
                    name: `AI Note ${i + 1}`,
                    type: 'sticky',
                    x: Math.round(centerPt.x - 340 + (i % 3) * 240),
                    y: Math.round(centerPt.y - 160 + Math.floor(i / 3) * 190),
                    width: 220,
                    height: 170,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: activePage.objects.length + i + 1,
                    text: txt,
                    noteColor: i % 2 === 0 ? '#FEF08A' : '#BAE6FD',
                    textColor: '#0F172A',
                    author: 'AI Educator',
                    fontSize: 13,
                    reactions: {},
                  })
                );
                onApplyObjects(notes, 'append');
              }}
              className="w-full py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Place Notes &amp; Takeaways on Board
            </button>
          </div>
        )}

        {/* Preview: Sketch Recognition */}
        {sketchResult && (
          <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
            <div className="text-xs font-semibold">Sketch Analysis</div>
            <p className="text-xs text-slate-600 dark:text-slate-300">{sketchResult.summary}</p>
            {sketchResult.detectedText && (
              <div className="p-2 rounded bg-white dark:bg-slate-900 border text-xs">
                <strong>Detected Text:</strong> {sketchResult.detectedText}
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={replaceOriginalInk}
                onChange={(e) => setReplaceOriginalInk(e.target.checked)}
              />
              Replace original ink strokes with clean vectors/text
            </label>
            <button
              onClick={() => {
                const objs: BoardObject[] = [];
                if (sketchResult.detectedText) {
                  objs.push({
                    id: uid('text'),
                    name: 'Transcribed Text',
                    type: 'text',
                    x: Math.round(centerPt.x - 240),
                    y: Math.round(centerPt.y - 60),
                    width: 480,
                    height: 110,
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: activePage.objects.length + 1,
                    text: sketchResult.detectedText,
                    textColor: '#0F172A',
                    bgColor: '#FFFFFF',
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: 18,
                    fontWeight: 'normal',
                    fontStyle: 'normal',
                    underline: false,
                    textAlign: 'left',
                  });
                }
                for (const s of sketchResult.shapes || []) {
                  objs.push({
                    id: uid('shape'),
                    name: s.label || s.shapeKind,
                    type: 'shape',
                    shapeKind: (s.shapeKind as never) || 'rounded_rect',
                    x: Math.round(s.x),
                    y: Math.round(s.y),
                    width: Math.max(80, Math.round(s.width)),
                    height: Math.max(50, Math.round(s.height)),
                    rotation: 0,
                    opacity: 1,
                    locked: false,
                    hidden: false,
                    zIndex: activePage.objects.length + objs.length + 1,
                    fill: s.fill || '#EFF6FF',
                    stroke: s.stroke || '#2563EB',
                    strokeWidth: 2,
                    text: s.label || '',
                    textColor: '#0F172A',
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: 14,
                    fontWeight: 'bold',
                    fontStyle: 'normal',
                    textAlign: 'center',
                  });
                }
                if (objs.length > 0) {
                  if (replaceOriginalInk) {
                    const hasSelectedStrokes =
                      selectedIds &&
                      selectedIds.size > 0 &&
                      activePage.objects.some((o) => o.type === 'stroke' && selectedIds.has(o.id));
                    const kept = activePage.objects.filter((o) => {
                      if (o.type !== 'stroke') return true;
                      return hasSelectedStrokes ? !selectedIds!.has(o.id) : false;
                    });
                    onApplyObjects([...kept, ...objs], 'replace');
                  } else {
                    onApplyObjects(objs, 'append');
                  }
                }
              }}
              className="w-full py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Insert Clean Editable Result
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
