import { GoogleGenAI, Type, type GenerateContentResponse } from '@google/genai';
import type { DiagramType, LocaleCode } from '../src/types/smartboard.ts';

const MODEL = 'gemini-4-hydrogen';

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export type GeminiErrorInfo = {
  statusCode: number;
  code: string;
  retryAfterSeconds?: number;
  message: string;
};

export function parseGeminiApiError(err: unknown): GeminiErrorInfo {
  const raw = err instanceof Error ? err.message : String(err || 'AI request failed');
  const lower = raw.toLowerCase();
  const explicitStatus =
    typeof (err as { status?: unknown })?.status === 'number'
      ? Number((err as { status: number }).status)
      : undefined;

  // Parse retryDelay like "30s" or "Please retry in 30.21s"
  let retryAfterSeconds: number | undefined;
  const retryMatch =
    /retrydelay["':\s]+(\d+(?:\.\d+)?)s/i.exec(raw) ||
    /retry in\s+(\d+(?:\.\d+)?)s/i.exec(raw);
  if (retryMatch) {
    retryAfterSeconds = Math.max(1, Math.ceil(Number(retryMatch[1])));
  }

  if (
    explicitStatus === 429 ||
    raw.includes('429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    lower.includes('quota exceeded') ||
    lower.includes('rate limit')
  ) {
    const wait = retryAfterSeconds ?? 30;
    return {
      statusCode: 429,
      code: 'RESOURCE_EXHAUSTED',
      retryAfterSeconds: wait,
      message: `Gemini API rate limit reached (free tier quota exceeded). Please retry in ${wait}s or select a billing-enabled API key in Settings > Secrets.`,
    };
  }

  if (
    explicitStatus === 403 ||
    raw.includes('403') ||
    raw.includes('PERMISSION_DENIED')
  ) {
    return {
      statusCode: 403,
      code: 'PERMISSION_DENIED',
      message: 'Gemini API permission denied. Please check your API key in Settings > Secrets.',
    };
  }

  if (
    explicitStatus === 400 ||
    raw.includes('400') ||
    raw.includes('API_KEY_INVALID')
  ) {
    return {
      statusCode: 400,
      code: 'INVALID_ARGUMENT',
      message: raw.includes('API_KEY_INVALID')
        ? 'Gemini API key is invalid. Please check your API key in Settings > Secrets.'
        : 'Invalid request sent to Gemini API.',
    };
  }

  if (explicitStatus === 404 || raw.includes('404') || raw.includes('NOT_FOUND')) {
    return {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Requested Gemini model or resource was not found.',
    };
  }

  return {
    statusCode: explicitStatus && explicitStatus >= 400 && explicitStatus < 600 ? explicitStatus : 500,
    code: 'INTERNAL_ERROR',
    message: raw.length > 260 ? `${raw.slice(0, 260)}…` : raw,
  };
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const info = parseGeminiApiError(err);
      if (
        info.statusCode === 400 ||
        info.statusCode === 403 ||
        info.statusCode === 404 ||
        info.statusCode === 429
      ) {
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

function langLabel(locale: LocaleCode = 'en'): string {
  if (locale === 'ne') return 'Nepali (नेपाली)';
  if (locale === 'hi') return 'Hindi (हिन्दी)';
  return 'English';
}

export type GeneratedDiagramPayload = {
  title: string;
  summary: string;
  nodes: {
    id: string;
    label: string;
    shapeKind:
      | 'rounded_rect'
      | 'rectangle'
      | 'circle'
      | 'ellipse'
      | 'diamond'
      | 'flow_process'
      | 'flow_decision'
      | 'flow_terminator'
      | 'flow_data'
      | 'flow_database'
      | 'hexagon';
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
  chart?: {
    chartType: 'bar' | 'line' | 'pie';
    title: string;
    labels: string[];
    values: number[];
  };
  table?: {
    headers: string[];
    rows: string[][];
  };
};

export async function generateDiagramWithAI(
  prompt: string,
  diagramType: DiagramType | 'infographic' | 'chart' | 'table' | 'worksheet',
  locale: LocaleCode = 'en'
): Promise<GeneratedDiagramPayload> {
  const ai = getAIClient();
  const systemInstruction = `You are an expert diagram architect and educator for LuminaBoard SmartBoard.
Generate well-spaced, non-overlapping, visually balanced editable diagram nodes and connectors in ${langLabel(locale)}.
Coordinates should start near x: 100, y: 100 and stay within x: 80..1200, y: 80..800 with at least 60px spacing between nodes.
Use harmonious, high-contrast color palettes (soft tinted fills like #EFF6FF, #ECFDF5, #FEF3C7, #F5F3FF, #FFF1F2 with crisp darker strokes like #2563EB, #059669, #D97706, #7C3AED, #E11D48 and readable dark text #0F172A).
For 'chart' requests, also populate the 'chart' object. For 'table' requests, also populate the 'table' object.`;

  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Diagram type: ${diagramType}\nUser request: ${prompt}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  shapeKind: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                  fill: { type: Type.STRING },
                  stroke: { type: Type.STRING },
                  textColor: { type: Type.STRING },
                },
                required: ['id', 'label', 'shapeKind', 'x', 'y', 'width', 'height', 'fill', 'stroke', 'textColor'],
              },
            },
            connectors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fromNodeId: { type: Type.STRING },
                  toNodeId: { type: Type.STRING },
                  label: { type: Type.STRING },
                  routeType: { type: Type.STRING },
                },
                required: ['fromNodeId', 'toNodeId', 'routeType'],
              },
            },
            chart: {
              type: Type.OBJECT,
              properties: {
                chartType: { type: Type.STRING },
                title: { type: Type.STRING },
                labels: { type: Type.ARRAY, items: { type: Type.STRING } },
                values: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              },
            },
            table: {
              type: Type.OBJECT,
              properties: {
                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: {
                  type: Type.ARRAY,
                  items: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
              },
            },
          },
          required: ['title', 'summary', 'nodes', 'connectors'],
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as GeneratedDiagramPayload;
  return {
    title: parsed.title || 'Generated Diagram',
    summary: parsed.summary || '',
    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    connectors: Array.isArray(parsed.connectors) ? parsed.connectors : [],
    chart: parsed.chart,
    table: parsed.table,
  };
}

export type GeneratedPresentationPayload = {
  deckTitle: string;
  slides: {
    title: string;
    subtitle?: string;
    bullets: string[];
    themeColor: string;
    callout?: string;
  }[];
};

export async function generatePresentationWithAI(
  topic: string,
  slideCount = 5,
  locale: LocaleCode = 'en'
): Promise<GeneratedPresentationPayload> {
  const ai = getAIClient();
  const count = Math.max(2, Math.min(12, slideCount));
  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Create a ${count}-slide educational & professional presentation about: ${topic}. Language: ${langLabel(locale)}.`,
      config: {
        systemInstruction:
          'Design crisp, structured presentation slides with concise bullet points, strong slide titles, optional callouts, and tasteful accent hex colors.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            deckTitle: { type: Type.STRING },
            slides: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                  themeColor: { type: Type.STRING },
                  callout: { type: Type.STRING },
                },
                required: ['title', 'bullets', 'themeColor'],
              },
            },
          },
          required: ['deckTitle', 'slides'],
        },
      },
    })
  );

  return JSON.parse((response.text ?? '{"deckTitle":"Presentation","slides":[]}').trim()) as GeneratedPresentationPayload;
}

export type MathSolvePayload = {
  problem: string;
  finalAnswerLatex: string;
  steps: { title: string; latex: string; explanation: string }[];
  graphExpressions: string[];
};

export async function solveMathWithAI(
  query: string,
  imageBase64?: string,
  locale: LocaleCode = 'en'
): Promise<MathSolvePayload> {
  const ai = getAIClient();
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (imageBase64) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
    const mimeType = match ? match[1] : 'image/png';
    const cleanB64 = match ? match[2] : imageBase64.replace(/^data:[^;]+;base64,/, '');
    if (cleanB64.trim()) {
      parts.push({ inlineData: { mimeType, data: cleanB64.trim() } });
    }
  }
  parts.push({
    text: `Solve this mathematics/physics problem step-by-step in ${langLabel(locale)}. Provide valid KaTeX LaTeX for finalAnswerLatex and each step, plus any 2D graphable y=f(x) expressions (just the right-hand side like "x^2 - 4" or "sin(x)") if applicable.\nProblem: ${query}`,
  });

  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            problem: { type: Type.STRING },
            finalAnswerLatex: { type: Type.STRING },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  latex: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['title', 'latex', 'explanation'],
              },
            },
            graphExpressions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['problem', 'finalAnswerLatex', 'steps', 'graphExpressions'],
        },
      },
    })
  );

  return JSON.parse((response.text ?? '{}').trim()) as MathSolvePayload;
}

export type SketchRecognitionPayload = {
  detectedText: string;
  shapes: {
    shapeKind: 'rectangle' | 'rounded_rect' | 'circle' | 'ellipse' | 'triangle' | 'diamond' | 'star' | 'flow_process' | 'flow_decision';
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    stroke: string;
    fill: string;
  }[];
  summary: string;
};

export async function recognizeSketchWithAI(
  imageBase64: string,
  mode: 'shape' | 'handwriting' | 'diagram',
  canvasWidth: number,
  canvasHeight: number
): Promise<SketchRecognitionPayload> {
  const ai = getAIClient();
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
  const mimeType = match ? match[1] : 'image/png';
  const cleanB64 = (match ? match[2] : imageBase64.replace(/^data:[^;]+;base64,/, '')).trim();
  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanB64 } },
          {
            text: `Analyze this whiteboard sketch (${canvasWidth}x${canvasHeight}px). Mode: ${mode}.
If mode is 'handwriting', transcribe all handwritten text cleanly into 'detectedText'.
If mode is 'shape' or 'diagram', identify rough drawn shapes and return clean structured shapes with coordinates mapped to 0..${canvasWidth} and 0..${canvasHeight}.`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedText: { type: Type.STRING },
            summary: { type: Type.STRING },
            shapes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  shapeKind: { type: Type.STRING },
                  label: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                  stroke: { type: Type.STRING },
                  fill: { type: Type.STRING },
                },
                required: ['shapeKind', 'label', 'x', 'y', 'width', 'height', 'stroke', 'fill'],
              },
            },
          },
          required: ['detectedText', 'summary', 'shapes'],
        },
      },
    })
  );

  return JSON.parse((response.text ?? '{"detectedText":"","summary":"","shapes":[]}').trim()) as SketchRecognitionPayload;
}

export async function cleanLayoutWithAI(
  objects: { id: string; type: string; x: number; y: number; width: number; height: number; text?: string }[],
  instruction: string
): Promise<{ updates: { id: string; x: number; y: number; width: number; height: number }[]; summary: string }> {
  const ai = getAIClient();
  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Rearrange and align these canvas objects cleanly without overlap.\nInstruction: ${instruction}\nObjects: ${JSON.stringify(objects)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            updates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                },
                required: ['id', 'x', 'y', 'width', 'height'],
              },
            },
          },
          required: ['summary', 'updates'],
        },
      },
    })
  );

  return JSON.parse((response.text ?? '{"summary":"","updates":[]}').trim()) as {
    updates: { id: string; x: number; y: number; width: number; height: number }[];
    summary: string;
  };
}

export type EducatePayload = {
  title: string;
  markdownContent: string;
  stickyNotes: string[];
  mcqs?: {
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }[];
};

export async function educateWithAI(
  action:
    | 'explain'
    | 'mcqs'
    | 'lesson_plan'
    | 'summary'
    | 'revision'
    | 'translate'
    | 'grammar'
    | 'explain_pdf',
  prompt: string,
  contextText?: string,
  locale: LocaleCode = 'en',
  targetLanguage?: string
): Promise<EducatePayload> {
  const ai = getAIClient();
  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Action: ${action}
Target response language: ${targetLanguage || langLabel(locale)}
User prompt: ${prompt}
${contextText ? `Reference document/board text:\n${contextText.slice(0, 24000)}` : ''}`,
      config: {
        systemInstruction:
          'You are a world-class educator inside LuminaBoard SmartBoard. Return clear, accurate educational content, concise sticky-note takeaways that can be placed directly onto the canvas, and when requested, structured multiple-choice questions (mcqs).',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            markdownContent: { type: Type.STRING },
            stickyNotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            mcqs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['prompt', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
          required: ['title', 'markdownContent', 'stickyNotes'],
        },
      },
    })
  );

  return JSON.parse((response.text ?? '{"title":"","markdownContent":"","stickyNotes":[]}').trim()) as EducatePayload;
}

const TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

const ttsCache = new Map<string, { audioBase64: string; mimeType: string }>();
let ttsCooldownUntil = 0;

export function clearSpeechCache(): void {
  ttsCache.clear();
  ttsCooldownUntil = 0;
}

function wrapPcmAsWav(pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

export async function generateSpeechWithAI(
  text: string,
  locale: LocaleCode = 'en',
  _providerHostAuthorized = false,
): Promise<{ audioBase64: string; mimeType: string }> {
  const cleanText = text.replace(/[#*_`>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3500);
  if (!cleanText) {
    throw new Error('Text is required for speech synthesis.');
  }

  const cacheKey = `${locale}:${cleanText}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const now = Date.now();
  if (now < ttsCooldownUntil) {
    const waitSec = Math.max(1, Math.ceil((ttsCooldownUntil - now) / 1000));
    const cooldownErr = new Error(
      `429 RESOURCE_EXHAUSTED: Please retry in ${waitSec}s (TTS rate-limit cooldown active).`
    ) as Error & { status?: number };
    cooldownErr.status = 429;
    throw cooldownErr;
  }

  const ai = getAIClient();
  const voiceName = locale === 'hi' || locale === 'ne' ? 'Zephyr' : 'Kore';

  let response: GenerateContentResponse;
  try {
    response = await withRetry(() =>
      ai.models.generateContent({
        model: TTS_MODEL,
        contents: [
          {
            role: 'user',
            parts: [{ text: cleanText }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      })
    );
  } catch (err: unknown) {
    const info = parseGeminiApiError(err);
    if (info.statusCode === 429) {
      ttsCooldownUntil = Date.now() + (info.retryAfterSeconds ?? 30) * 1000;
    }
    throw err;
  }

  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new Error('Speech synthesis did not return audio data.');
  }

  const rawMime = (part.inlineData.mimeType || 'audio/wav').toLowerCase();
  const rawBuf = Buffer.from(part.inlineData.data, 'base64');
  const alreadyWav = rawBuf.length >= 12 && rawBuf.subarray(0, 4).toString('ascii') === 'RIFF';

  let out: { audioBase64: string; mimeType: string };
  if (!alreadyWav && (rawMime.includes('pcm') || rawMime.includes('l16'))) {
    const rateMatch = /rate=(\d+)/i.exec(rawMime);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const wavBuf = wrapPcmAsWav(rawBuf, Number.isFinite(sampleRate) ? sampleRate : 24000);
    out = {
      audioBase64: wavBuf.toString('base64'),
      mimeType: 'audio/wav',
    };
  } else {
    out = {
      audioBase64: part.inlineData.data,
      mimeType: alreadyWav ? 'audio/wav' : part.inlineData.mimeType || 'audio/wav',
    };
  }

  if (ttsCache.size >= 30) {
    const firstKey = ttsCache.keys().next().value;
    if (firstKey !== undefined) ttsCache.delete(firstKey);
  }
  ttsCache.set(cacheKey, out);
  return out;
}

function normalizeAudioMimeType(rawMime?: string): string {
  const base = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (!base) return 'audio/webm';
  if (base === 'audio/wave' || base === 'audio/x-wav' || base === 'audio/vnd.wave') return 'audio/wav';
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'audio/x-m4a' || base === 'audio/m4a' || base === 'video/mp4') return 'audio/mp4';
  if (base === 'audio/mp3') return 'audio/mp3';
  const supported = new Set([
    'audio/wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/aac',
    'audio/ogg',
    'audio/opus',
    'audio/flac',
    'audio/webm',
    'audio/mp4',
  ]);
  return supported.has(base) ? base : 'audio/webm';
}

export async function transcribeAudioWithAI(
  audioBase64: string,
  mimeType = 'audio/wav',
  locale: LocaleCode = 'en'
): Promise<{ text: string }> {
  const ai = getAIClient();
  let detectedMime = mimeType;
  let cleanB64 = audioBase64.trim();
  const dataUrlMatch = /^data:([^;]+)(?:;[^,]*)?;base64,([\s\S]*)$/i.exec(cleanB64);
  if (dataUrlMatch) {
    if (!mimeType || mimeType === 'audio/webm') {
      detectedMime = dataUrlMatch[1];
    }
    cleanB64 = dataUrlMatch[2].trim();
  } else if (cleanB64.includes(',')) {
    cleanB64 = cleanB64.split(',')[1].trim();
  }

  if (!cleanB64 || Buffer.from(cleanB64, 'base64').length < 64) {
    throw new Error('Recorded audio is empty or too short to transcribe.');
  }

  const normalizedMime = normalizeAudioMimeType(detectedMime);
  const promptText = `Transcribe all spoken words in this audio accurately in ${langLabel(locale)}. Return only the transcribed text with no extra commentary.`;

  const runWithModel = async (modelName: string) =>
    withRetry(() =>
      ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            { inlineData: { mimeType: normalizedMime, data: cleanB64 } },
            { text: promptText },
          ],
        },
      })
    );

  let response: GenerateContentResponse;
  try {
    response = await runWithModel(TRANSCRIBE_MODEL);
  } catch (err: unknown) {
    // Fallback to gemini-4-hydrogen if container/mime or model tier rejects primary call
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('403') || msg.includes('API_KEY_INVALID')) {
      throw err;
    }
    response = await runWithModel(MODEL);
  }

  const transcriptParts = response.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
  const text = transcriptParts
    .map((part) => part.text || part.audioTranscription?.text || '')
    .map((partText) => partText.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return { text };
}

export async function chatWithBoardStream(
  messages: { role: 'user' | 'assistant'; text: string }[],
  boardContext: string,
  imageBase64?: string,
  locale: LocaleCode = 'en',
  onChunk?: (chunkText: string) => void
): Promise<string> {
  const ai = getAIClient();
  const historyText = messages
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'User' : 'Tutor'}: ${m.text}`)
    .join('\n\n');
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (imageBase64) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
    const mimeType = match ? match[1] : 'image/png';
    const cleanB64 = (match ? match[2] : imageBase64.replace(/^data:[^;]+;base64,/, '')).trim();
    if (cleanB64) parts.push({ inlineData: { mimeType, data: cleanB64 } });
  }
  parts.push({
    text: `You are LuminaBoard Teaching Copilot. Answer in ${langLabel(locale)} with clear markdown formatting and concise explanations grounded in the current canvas/document context.\n\nCanvas/Document Context:\n${boardContext.slice(0, 18000)}\n\nConversation:\n${historyText}\n\nTutor:`,
  });

  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: { parts },
  });
  let fullText = '';
  for await (const chunk of stream) {
    const t = chunk.text ?? '';
    if (t) {
      fullText += t;
      onChunk?.(t);
    }
  }
  return fullText;
}

export async function chatWithBedrockStream(
  _messages: unknown[],
  _boardContext: string,
  _imageBase64: string | undefined,
  _locale: LocaleCode,
  _onChunk: (chunk: string) => void,
): Promise<void> {
  throw new Error('Amazon Bedrock chat is unavailable in this recovered build.');
}

export type QuizFlashcardPayload = {
  title: string;
  flashcards: { front: string; back: string }[];
  quizQuestions: { prompt: string; options: string[]; correctIndex: number; explanation: string }[];
};

export async function generateQuizAndFlashcardsWithAI(
  topic: string,
  contextText: string,
  count = 5,
  locale: LocaleCode = 'en'
): Promise<QuizFlashcardPayload> {
  const ai = getAIClient();
  const safeCount = Math.max(2, Math.min(10, count));
  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Generate ${safeCount} flashcards and ${safeCount} multiple-choice quiz questions in ${langLabel(locale)} on topic: ${topic}.\nContext:\n${contextText.slice(0, 18000)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  front: { type: Type.STRING },
                  back: { type: Type.STRING },
                },
                required: ['front', 'back'],
              },
            },
            quizQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['prompt', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
          required: ['title', 'flashcards', 'quizQuestions'],
        },
      },
    })
  );
  return JSON.parse((response.text ?? '{"title":"Study Pack","flashcards":[],"quizQuestions":[]}').trim()) as QuizFlashcardPayload;
}

export type GradeWorkPayload = {
  scorePercent: number;
  gradeLabel: string;
  strengths: string[];
  mistakes: string[];
  hintForStudent: string;
};

export async function gradeStudentWorkWithAI(
  rubricOrQuestion: string,
  studentText: string,
  imageBase64?: string,
  locale: LocaleCode = 'en'
): Promise<GradeWorkPayload> {
  const ai = getAIClient();
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (imageBase64) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
    const mimeType = match ? match[1] : 'image/png';
    const cleanB64 = (match ? match[2] : imageBase64.replace(/^data:[^;]+;base64,/, '')).trim();
    if (cleanB64) parts.push({ inlineData: { mimeType, data: cleanB64 } });
  }
  parts.push({
    text: `Evaluate the student's work in ${langLabel(locale)} constructively and fairly.\nQuestion / Rubric: ${rubricOrQuestion}\nStudent Text/Answer: ${studentText}`,
  });

  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scorePercent: { type: Type.INTEGER },
            gradeLabel: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            mistakes: { type: Type.ARRAY, items: { type: Type.STRING } },
            hintForStudent: { type: Type.STRING },
          },
          required: ['scorePercent', 'gradeLabel', 'strengths', 'mistakes', 'hintForStudent'],
        },
      },
    })
  );
  return JSON.parse(
    (response.text ?? '{"scorePercent":0,"gradeLabel":"Review","strengths":[],"mistakes":[],"hintForStudent":""}').trim()
  ) as GradeWorkPayload;
}

export type PDFOcrPayload = {
  text: string;
  blocks: { text: string; x: number; y: number; w: number; h: number }[];
};

export async function ocrPdfPageWithAI(
  imageBase64: string,
  locale: LocaleCode = 'en'
): Promise<PDFOcrPayload> {
  const ai = getAIClient();
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
  const mimeType = match ? match[1] : 'image/png';
  const cleanB64 = (match ? match[2] : imageBase64.replace(/^data:[^;]+;base64,/, '')).trim();
  if (!cleanB64) {
    throw new Error('Page image is required for OCR.');
  }

  const response: GenerateContentResponse = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanB64 } },
          {
            text: `Perform accurate OCR on this document page (preserve original script including Devanagari/Hindi/Nepali/English/Math; preferred context hint: ${langLabel(locale)}).
Return:
1. 'text': the full cleanly ordered reading text on the page.
2. 'blocks': line-level text segments with normalized 0..1 bounding boxes (x, y, w, h) relative to page top-left (0,0) and bottom-right (1,1).`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                },
                required: ['text', 'x', 'y', 'w', 'h'],
              },
            },
          },
          required: ['text', 'blocks'],
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{"text":"","blocks":[]}').trim()) as PDFOcrPayload;
  return {
    text: parsed.text || '',
    blocks: Array.isArray(parsed.blocks)
      ? parsed.blocks.map((b) => ({
          text: String(b.text || ''),
          x: Math.max(0, Math.min(1, Number(b.x || 0))),
          y: Math.max(0, Math.min(1, Number(b.y || 0))),
          w: Math.max(0.01, Math.min(1, Number(b.w || 0.1))),
          h: Math.max(0.01, Math.min(0.2, Number(b.h || 0.025))),
        }))
      : [],
  };
}



