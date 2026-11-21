import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  BoardObject,
  BoardPage,
  ClassroomSessionState,
  PDFAnnotation,
  PresenceUser,
  UserRole,
  WorkspaceDocument,
} from './src/types/smartboard.ts';
import type { Request } from 'express';
import {
  clearSpeechCache,
  chatWithBoardStream,
  chatWithBedrockStream,
  cleanLayoutWithAI,
  educateWithAI,
  generateDiagramWithAI,
  generatePresentationWithAI,
  generateQuizAndFlashcardsWithAI,
  generateSpeechWithAI,
  gradeStudentWorkWithAI,
  ocrPdfPageWithAI,
  parseGeminiApiError,
  recognizeSketchWithAI,
  solveMathWithAI,
  transcribeAudioWithAI,
} from './server/ai.ts';
import {
  getAIProviderSettings,
  getPublicAIProviderSettings,
  saveAIProviderSettings,
} from './server/providerSettings.ts';
import {
  appendAudit,
  checkRateLimit,
  cleanupOrphanedUploads,
  createDefaultClassroomState,
  createDefaultPage,
  createDefaultWorkspace,
  flushPendingPersist,
  getUploadedFilePath,
  loadStore,
  persistStoreSync,
  replaceUploadedFile,
  saveUploadedFile,
  schedulePersist,
  verifyFileToken,
} from './server/store.ts';

const PORT = Number(process.env.PORT || 3000);
const allowedWebOrigins = (process.env.WEB_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

type ClientMeta = {
  ws: WebSocket;
  workspaceId: string;
  userId: string;
  userName: string;
  role: UserRole;
  color: string;
  pageId: string;
  cursorX: number;
  cursorY: number;
  lastActive: number;
  hostAuthorized: boolean;
};

const rooms = new Map<string, Set<ClientMeta>>();
const hostInviteTokens = new Map<string, { workspaceId: string; expiresAt: number }>();

function sanitizeWorkspaceForClient(wsDoc: WorkspaceDocument, includeHostKey = false): WorkspaceDocument {
  if (includeHostKey) {
    return wsDoc;
  }
  const { hostKey: _omitted, ...safe } = wsDoc;
  return safe as WorkspaceDocument;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

function isRequestHostAuthorized(wsDoc: WorkspaceDocument, headerOrBodyKey?: unknown, userId?: unknown): boolean {
  if (typeof headerOrBodyKey === 'string' && wsDoc.hostKey && headerOrBodyKey.length === wsDoc.hostKey.length) {
    if (timingSafeEqual(headerOrBodyKey, wsDoc.hostKey)) return true;
  }
  if (typeof userId === 'string' && wsDoc.ownerId && userId === wsDoc.ownerId && !wsDoc.hostKey) return true;
  return false;
}

function isProviderHostAuthorized(req: Request, workspaceId: string, store: ReturnType<typeof loadStore>): boolean {
  const wsDoc = store.workspaces[workspaceId];
  const providedKey = req.get('x-host-key');
  if (!wsDoc) return false;
  if (!providedKey) return isLocalTrustedRequest(req);
  return Boolean(
    wsDoc.hostKey &&
      providedKey.length === wsDoc.hostKey.length &&
      timingSafeEqual(providedKey, wsDoc.hostKey)
  );
}

function isLoopbackRequest(req: Request): boolean {
  const address = req.socket.remoteAddress || '';
  return address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.');
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isLocalTrustedRequest(req: Request): boolean {
  if (!isLoopbackRequest(req)) return false;
  const origin = req.get('origin');
  if (!origin) {
    try {
      return isLoopbackHostname(new URL(`http://${req.get('host') || ''}`).hostname);
    } catch {
      return false;
    }
  }
  try {
    const parsedOrigin = new URL(origin);
    return (
      isLoopbackHostname(parsedOrigin.hostname) &&
      parsedOrigin.host === req.get('host') &&
      parsedOrigin.protocol === `${req.protocol}:`
    );
  } catch {
    return false;
  }
}

function getConnectedMember(workspaceId: string, userId: unknown): ClientMeta | undefined {
  if (typeof userId !== 'string' || !userId) return undefined;
  return Array.from(rooms.get(workspaceId) || []).find((client) => client.userId === userId);
}

function sanitizeClassroomForClient(classroom: ClassroomSessionState, role: UserRole, userId: string): ClassroomSessionState {
  if (role === 'teacher') return classroom;
  return {
    ...classroom,
    quizzes: classroom.quizzes.map((quiz) => ({
      ...quiz,
      questions: quiz.questions.map(({ correctIndex: _correctIndex, ...question }) => question),
      answers: Object.fromEntries(Object.entries(quiz.answers || {}).filter(([id]) => id === userId)),
    })),
    submissions: classroom.submissions.filter((submission) => submission.userId === userId),
  } as unknown as ClassroomSessionState;
}

function broadcastClassroomState(workspaceId: string, classroom: ClassroomSessionState) {
  for (const client of rooms.get(workspaceId) || []) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'classroom:state',
        classroom: sanitizeClassroomForClient(classroom, client.role, client.userId),
      }));
    }
  }
}

function isSecureProviderSettingsRequest(req: Request): boolean {
  const origin = req.get('origin') || '';
  return req.secure || isLocalTrustedRequest(req) || (origin.startsWith('https://') && allowedWebOrigins.includes(origin));
}

function broadcastToRoom(workspaceId: string, payload: unknown, excludeWs?: WebSocket) {
  const clients = rooms.get(workspaceId);
  if (!clients) return;
  const serialized = JSON.stringify(payload);
  for (const client of clients) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

function getPresenceList(workspaceId: string): PresenceUser[] {
  const clients = rooms.get(workspaceId);
  if (!clients) return [];
  return Array.from(clients).map((c) => ({
    userId: c.userId,
    userName: c.userName,
    role: c.role,
    color: c.color,
    cursorX: c.cursorX,
    cursorY: c.cursorY,
    pageId: c.pageId,
    lastActive: c.lastActive,
  }));
}

function canMutateWorkspace(
  wsDoc: WorkspaceDocument,
  classroom: ClassroomSessionState | undefined,
  meta: ClientMeta
): boolean {
  if (meta.role === 'viewer') return false;
  if (wsDoc.collaborationMode === 'public_readonly' && !meta.hostAuthorized && meta.role !== 'teacher') {
    return false;
  }
  if (wsDoc.collaborationMode === 'private' && !meta.hostAuthorized && meta.role !== 'teacher') {
    return false;
  }
  if (wsDoc.collaborationMode === 'teacher_controlled' && meta.role !== 'teacher') {
    if (classroom?.studentEditingLocked) return false;
    if (classroom && classroom.allowedStudentIds.length > 0 && !classroom.allowedStudentIds.includes(meta.userId)) {
      return false;
    }
  }
  if (wsDoc.collaborationMode === 'selected_students' && meta.role !== 'teacher') {
    const allowed = new Set([...(wsDoc.allowedEditors || []), ...(classroom?.allowedStudentIds || [])]);
    if (!allowed.has(meta.userId)) return false;
  }
  if (classroom?.active && classroom.studentEditingLocked && meta.role === 'student') {
    if (!classroom.allowedStudentIds.includes(meta.userId)) return false;
  }
  return true;
}

async function startServer() {
  const store = loadStore();
  const app = express();
  // Never trust arbitrary forwarded headers. Set WEB_ORIGINS explicitly for deployed use.
  app.set('trust proxy', false);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const sameOrigin = `${req.protocol}://${req.get('host')}`;
    const originAllowed = !origin || (allowedWebOrigins.length > 0 ? allowedWebOrigins.includes(origin) : origin === sameOrigin);
    if (origin && originAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Host-Key');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    if (origin && !originAllowed) return res.status(403).json({ error: 'Origin is not allowed.' });
    next();
  });

  // A 25 MB binary file expands to roughly 33.4 MB when sent as base64 JSON.
  app.use(express.json({ limit: '36mb' }));

  // Basic security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // PDF.js CMap, Standard Fonts, and WASM image decoders (critical for crisp fonts & scanned PDFs)
  const pdfjsRoot = path.resolve(process.cwd(), 'node_modules/pdfjs-dist');
  if (fs.existsSync(pdfjsRoot)) {
    app.use('/pdfjs/cmaps', express.static(path.join(pdfjsRoot, 'cmaps'), { maxAge: '7d' }));
    app.use('/pdfjs/standard_fonts', express.static(path.join(pdfjsRoot, 'standard_fonts'), { maxAge: '7d' }));
    app.use('/pdfjs/wasm', express.static(path.join(pdfjsRoot, 'wasm'), { maxAge: '7d' }));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get('/api/webrtc/ice-config', (_req, res) => {
    const urls = (process.env.TURN_URLS || '').split(',').map((url) => url.trim()).filter(Boolean);
    const iceServers: { urls: string[]; username?: string; credential?: string }[] = [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ];
    if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ iceServers });
  });

  app.get('/api/ai/provider-settings', (req, res) => {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    if (!isProviderHostAuthorized(req, workspaceId, store)) {
      return res.status(403).json({ error: 'Workspace host authorization is required.' });
    }
    try {
      res.json(getPublicAIProviderSettings());
    } catch (err: unknown) {
      console.error('/api/ai/provider-settings read failed:', err);
      res.status(500).json({ error: 'Could not read AI provider settings.' });
    }
  });

  app.post('/api/ai/provider-settings', (req, res) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Provider settings are required.' });
    }
    const values = body as Record<string, unknown>;
    const workspaceId = typeof values.workspaceId === 'string' ? values.workspaceId : '';
    if (!isProviderHostAuthorized(req, workspaceId, store)) {
      return res.status(403).json({ error: 'Workspace host authorization is required.' });
    }
    if (!isSecureProviderSettingsRequest(req)) {
      return res.status(400).json({ error: 'Save provider secrets from localhost or an HTTPS connection.' });
    }

    const updates: {
      geminiApiKey?: string | null;
      preferredTtsQuality?: 'full' | 'lite';
      ttsVoiceCharacter?: 'auto' | 'feminine' | 'masculine';
      ttsVoiceStyle?: 'natural' | 'warm' | 'calm' | 'energetic' | 'narrator';
      ttsVoiceSpeed?: 'slow' | 'normal' | 'brisk';
      ttsPauseStyle?: 'brief' | 'natural' | 'relaxed';
      ttsProviderMode?: 'auto' | 'gemini' | 'polly';
      chatProviderMode?: 'auto' | 'gemini' | 'bedrock';
      awsCredentialMode?: 'profile' | 'access_keys';
      awsAccessKeyId?: string | null;
      awsSecretAccessKey?: string | null;
      awsSessionToken?: string | null;
      awsProfileName?: string;
    } = {};
    if ('geminiApiKey' in values) {
      if (values.geminiApiKey !== null && typeof values.geminiApiKey !== 'string') {
        return res.status(400).json({ error: 'Gemini API key must be text or null.' });
      }
      if (typeof values.geminiApiKey === 'string' && values.geminiApiKey.length > 512) {
        return res.status(400).json({ error: 'Gemini API key is too long.' });
      }
      if (values.geminiApiKey === null) updates.geminiApiKey = null;
      else if (typeof values.geminiApiKey === 'string') updates.geminiApiKey = values.geminiApiKey;
    }
    if ('preferredTtsQuality' in values) {
      if (values.preferredTtsQuality !== 'full' && values.preferredTtsQuality !== 'lite') {
        return res.status(400).json({ error: 'Choose Gemini Full or Gemini Lite as the preferred voice.' });
      }
      updates.preferredTtsQuality = values.preferredTtsQuality;
    }
    if ('ttsVoiceCharacter' in values) {
      if (values.ttsVoiceCharacter !== 'auto' && values.ttsVoiceCharacter !== 'feminine' && values.ttsVoiceCharacter !== 'masculine') {
        return res.status(400).json({ error: 'Choose an automatic, feminine-sounding, or masculine-sounding Gemini voice.' });
      }
      updates.ttsVoiceCharacter = values.ttsVoiceCharacter;
    }
    if ('ttsVoiceStyle' in values) {
      if (
        values.ttsVoiceStyle !== 'natural' &&
        values.ttsVoiceStyle !== 'warm' &&
        values.ttsVoiceStyle !== 'calm' &&
        values.ttsVoiceStyle !== 'energetic' &&
        values.ttsVoiceStyle !== 'narrator'
      ) {
        return res.status(400).json({ error: 'Choose a supported Gemini voice style.' });
      }
      updates.ttsVoiceStyle = values.ttsVoiceStyle;
    }
    if ('ttsVoiceSpeed' in values) {
      if (values.ttsVoiceSpeed !== 'slow' && values.ttsVoiceSpeed !== 'normal' && values.ttsVoiceSpeed !== 'brisk') {
        return res.status(400).json({ error: 'Choose a supported Gemini speaking pace.' });
      }
      updates.ttsVoiceSpeed = values.ttsVoiceSpeed;
    }
    if ('ttsPauseStyle' in values) {
      if (values.ttsPauseStyle !== 'brief' && values.ttsPauseStyle !== 'natural' && values.ttsPauseStyle !== 'relaxed') {
        return res.status(400).json({ error: 'Choose a supported Gemini pause style.' });
      }
      updates.ttsPauseStyle = values.ttsPauseStyle;
    }
    if ('ttsProviderMode' in values) {
      if (values.ttsProviderMode !== 'auto' && values.ttsProviderMode !== 'gemini' && values.ttsProviderMode !== 'polly') {
        return res.status(400).json({ error: 'Choose Auto, Gemini, or Amazon Polly for PDF speech.' });
      }
      updates.ttsProviderMode = values.ttsProviderMode;
    }
    if ('chatProviderMode' in values) {
      if (values.chatProviderMode !== 'auto' && values.chatProviderMode !== 'gemini' && values.chatProviderMode !== 'bedrock') {
        return res.status(400).json({ error: 'Choose Auto, Gemini, or Amazon Bedrock for chat.' });
      }
      updates.chatProviderMode = values.chatProviderMode;
    }
    if ('awsCredentialMode' in values) {
      if (values.awsCredentialMode !== 'profile' && values.awsCredentialMode !== 'access_keys') {
        return res.status(400).json({ error: 'Choose an AWS profile or access keys.' });
      }
      updates.awsCredentialMode = values.awsCredentialMode;
    }
    for (const field of ['awsAccessKeyId', 'awsSecretAccessKey', 'awsSessionToken'] as const) {
      if (!(field in values)) continue;
      const value = values[field];
      if (value !== null && typeof value !== 'string') {
        return res.status(400).json({ error: 'AWS credential fields must be text or null.' });
      }
      const maxLength = field === 'awsSessionToken' ? 8192 : field === 'awsSecretAccessKey' ? 256 : 128;
      if (typeof value === 'string' && value.length > maxLength) {
        return res.status(400).json({ error: 'An AWS credential field is too long.' });
      }
      updates[field] = value as string | null;
    }
    if ('awsProfileName' in values) {
      if (
        typeof values.awsProfileName !== 'string' ||
        (values.awsProfileName !== '' && !/^[A-Za-z0-9._-]{1,64}$/.test(values.awsProfileName))
      ) {
        return res.status(400).json({ error: 'AWS profile name may contain only letters, numbers, dots, underscores, and hyphens.' });
      }
      updates.awsProfileName = values.awsProfileName;
    }

    try {
      const current = getAIProviderSettings();
      const accessKeyId = updates.awsAccessKeyId === null ? undefined : updates.awsAccessKeyId || current.awsAccessKeyId;
      const secretAccessKey =
        updates.awsSecretAccessKey === null ? undefined : updates.awsSecretAccessKey || current.awsSecretAccessKey;
      const sessionToken = updates.awsSessionToken === null ? undefined : updates.awsSessionToken || current.awsSessionToken;
      const credentialMode = updates.awsCredentialMode || current.awsCredentialMode;
      if (Boolean(accessKeyId) !== Boolean(secretAccessKey) || (sessionToken && !accessKeyId)) {
        return res.status(400).json({ error: 'Enter both AWS access key ID and secret key, or remove both.' });
      }
      if (credentialMode === 'access_keys' && (!accessKeyId || !secretAccessKey)) {
        return res.status(400).json({ error: 'Add AWS access key ID and secret key before selecting access-key mode.' });
      }
      saveAIProviderSettings(updates);
      clearSpeechCache();
      res.json(getPublicAIProviderSettings());
    } catch (err: unknown) {
      console.error('/api/ai/provider-settings save failed:', err);
      res.status(500).json({ error: 'Could not save AI provider settings.' });
    }
  });

  app.get('/api/network/addresses', (_req, res) => {
    const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, interfaces]) =>
      (interfaces || [])
        .filter(({ address, family, internal }) => {
          if (family !== 'IPv4' || internal) return false;
          const octets = address.split('.').map(Number);
          return (
            octets.length === 4 &&
            (octets[0] === 10 ||
              (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
              (octets[0] === 192 && octets[1] === 168))
          );
        })
        .map(({ address }) => ({ name, address }))
    );
    res.json({ addresses });
  });

  // Workspace list & management
  app.get('/api/workspaces', (_req, res) => {
    const list = Object.values(store.workspaces)
      .filter((ws) => ws.collaborationMode !== 'private' || isLocalTrustedRequest(_req))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((ws) => ({
        id: ws.id,
        name: ws.name,
        folder: ws.folder,
        starred: ws.starred,
        trashed: ws.trashed,
        collaborationMode: ws.collaborationMode,
        pageCount: ws.pages.length,
        updatedAt: ws.updatedAt,
        createdAt: ws.createdAt,
      }));
    res.json({ workspaces: list, customTemplates: store.customTemplates });
  });

  app.post('/api/workspaces', (req, res) => {
    const name = String(req.body?.name || 'Untitled SmartBoard').slice(0, 120);
    const folder = String(req.body?.folder || 'General').slice(0, 60);
    const ownerId = typeof req.body?.ownerId === 'string' && req.body.ownerId ? req.body.ownerId.slice(0, 64) : 'teacher-host';
    const id = 'ws-' + crypto.randomUUID().slice(0, 8);
    const wsDoc = createDefaultWorkspace(id, name);
    wsDoc.folder = folder;
    wsDoc.ownerId = ownerId;
    wsDoc.ownerClaimed = true;
    if (Array.isArray(req.body?.pages) && req.body.pages.length > 0) {
      wsDoc.pages = req.body.pages;
      wsDoc.activePageId = req.body.pages[0].id;
    }
    store.workspaces[id] = wsDoc;
    store.classroomSessions[id] = createDefaultClassroomState(wsDoc.activePageId);
    appendAudit(wsDoc, 'User', `Created workspace "${name}"`);
    persistStoreSync();
    res.status(201).json({ workspace: sanitizeWorkspaceForClient(wsDoc, true) });
  });

  app.get('/api/workspaces/:id', (req, res) => {
    const wsDoc = store.workspaces[req.params.id];
    if (!wsDoc) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    if (!store.classroomSessions[wsDoc.id]) {
      store.classroomSessions[wsDoc.id] = createDefaultClassroomState(wsDoc.activePageId);
    }
    const providedKey = req.headers['x-host-key'];
    const isHost = Boolean((providedKey && wsDoc.hostKey && providedKey === wsDoc.hostKey) || isLocalTrustedRequest(req));
    if (wsDoc.collaborationMode === 'private' && !isHost) {
      return res.status(403).json({ error: 'Workspace host authorization is required.' });
    }
    const member = getConnectedMember(wsDoc.id, req.query.userId);
    const responseRole = isHost ? 'teacher' : (member?.role || 'viewer');
    res.json({
      workspace: sanitizeWorkspaceForClient(wsDoc, isHost),
      classroom: sanitizeClassroomForClient(store.classroomSessions[wsDoc.id], responseRole, member?.userId || ''),
    });
  });

  app.patch('/api/workspaces/:id', (req, res) => {
    const wsDoc = store.workspaces[req.params.id];
    if (!wsDoc) return res.status(404).json({ error: 'Workspace not found' });
    const body = req.body || {};
    const providedKey = req.headers['x-host-key'] || body.hostKey;
    const isHost = isRequestHostAuthorized(wsDoc, providedKey, body.userId);
    const member = getConnectedMember(wsDoc.id, body.userId);
    if (!isHost && (!member || !canMutateWorkspace(wsDoc, store.classroomSessions[wsDoc.id], member))) {
      return res.status(403).json({ error: 'An authorized workspace editor is required.' });
    }
    if (!isHost && ['name', 'folder', 'starred', 'trashed', 'collaborationMode', 'allowedEditors'].some((key) => key in body)) {
      return res.status(403).json({ error: 'Only the workspace host can change workspace settings.' });
    }
    if (typeof body.name === 'string') wsDoc.name = body.name.slice(0, 120);
    if (typeof body.folder === 'string') wsDoc.folder = body.folder.slice(0, 60);
    if (typeof body.starred === 'boolean') wsDoc.starred = body.starred;
    if (typeof body.trashed === 'boolean') wsDoc.trashed = body.trashed;
    if (typeof body.collaborationMode === 'string') {
      if (!isHost) return res.status(403).json({ error: 'Only the workspace owner can change collaboration mode.' });
      wsDoc.collaborationMode = body.collaborationMode;
    }
    if (Array.isArray(body.allowedEditors)) {
      if (!isHost) return res.status(403).json({ error: 'Only the workspace owner can change editor list.' });
      wsDoc.allowedEditors = body.allowedEditors;
    }
    if (typeof body.activePageId === 'string') wsDoc.activePageId = body.activePageId;
    if (Array.isArray(body.pages)) wsDoc.pages = body.pages;
    if (body.pdfAnnotations && typeof body.pdfAnnotations === 'object') {
      wsDoc.pdfAnnotations = body.pdfAnnotations as Record<string, PDFAnnotation[]>;
    }
    wsDoc.updatedAt = Date.now();
    appendAudit(wsDoc, String(body.actor || 'User'), 'Saved workspace updates');
    schedulePersist();
    const hasValidKey = isHost;
    res.json({ workspace: sanitizeWorkspaceForClient(wsDoc, hasValidKey) });
  });

  app.post('/api/workspaces/:id/duplicate', (req, res) => {
    const src = store.workspaces[req.params.id];
    if (!src) return res.status(404).json({ error: 'Workspace not found' });
    if (!isProviderHostAuthorized(req, req.params.id, store)) {
      return res.status(403).json({ error: 'Host authorization required to duplicate workspace.' });
    }
    const copyId = 'ws-' + crypto.randomUUID().slice(0, 8);
    const copy: WorkspaceDocument = structuredClone(src);
    copy.id = copyId;
    copy.name = `${src.name} (Copy)`;
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    copy.trashed = false;
    copy.hostKey = crypto.randomBytes(16).toString('hex');
    copy.ownerClaimed = true;
    store.workspaces[copyId] = copy;
    store.classroomSessions[copyId] = createDefaultClassroomState(copy.activePageId);
    appendAudit(copy, 'User', `Duplicated from "${src.name}"`);
    persistStoreSync();
    res.status(201).json({ workspace: sanitizeWorkspaceForClient(copy, true) });
  });

  app.delete('/api/workspaces/:id', (req, res) => {
    const wsDoc = store.workspaces[req.params.id];
    if (!wsDoc) return res.status(404).json({ error: 'Workspace not found' });
    if (!isProviderHostAuthorized(req, req.params.id, store)) {
      return res.status(403).json({ error: 'Host authorization required to delete workspace.' });
    }
    if (req.query.permanent === 'true') {
      if (Object.keys(store.workspaces).length <= 1) {
        return res.status(400).json({ error: 'Cannot permanently delete the last workspace.' });
      }
      delete store.workspaces[req.params.id];
      delete store.classroomSessions[req.params.id];
      cleanupOrphanedUploads(store);
    } else {
      wsDoc.trashed = true;
      wsDoc.updatedAt = Date.now();
      appendAudit(wsDoc, 'User', 'Moved workspace to trash');
    }
    persistStoreSync();
    res.json({ ok: true });
  });

  app.post('/api/workspaces/:id/restore', (req, res) => {
    const wsDoc = store.workspaces[req.params.id];
    if (!wsDoc) return res.status(404).json({ error: 'Workspace not found' });
    if (!isProviderHostAuthorized(req, req.params.id, store)) {
      return res.status(403).json({ error: 'Host authorization required to restore workspace.' });
    }
    wsDoc.trashed = false;
    wsDoc.updatedAt = Date.now();
    appendAudit(wsDoc, 'User', 'Restored workspace from trash');
    persistStoreSync();
    res.json({ workspace: sanitizeWorkspaceForClient(wsDoc, false) });
  });

  app.post('/api/workspaces/:id/versions', (req, res) => {
    const wsDoc = store.workspaces[req.params.id];
    if (!wsDoc) return res.status(404).json({ error: 'Workspace not found' });
    if (!isProviderHostAuthorized(req, req.params.id, store)) {
      return res.status(403).json({ error: 'Host authorization required to create versions.' });
    }
    const label = String(req.body?.label || `Snapshot ${wsDoc.versions.length + 1}`).slice(0, 80);
    const createdBy = String(req.body?.createdBy || 'User').slice(0, 60);
    const version = {
      id: 'ver-' + crypto.randomUUID().slice(0, 8),
      label,
      createdAt: Date.now(),
      createdBy,
      pages: structuredClone(wsDoc.pages),
      attachedFiles: structuredClone(wsDoc.attachedFiles),
      pdfAnnotations: structuredClone(wsDoc.pdfAnnotations || {}),
    };
    wsDoc.versions = [version, ...wsDoc.versions.slice(0, 29)];
    appendAudit(wsDoc, createdBy, `Created version "${label}"`);
    persistStoreSync();
    res.status(201).json({ version, versions: wsDoc.versions });
  });

  app.post('/api/workspaces/:id/versions/:versionId/restore', (req, res) => {
    const wsDoc = store.workspaces[req.params.id];
    if (!wsDoc) return res.status(404).json({ error: 'Workspace not found' });
    const body = req.body || {};
    const providedKey = req.headers['x-host-key'] || body.hostKey;
    if (!isProviderHostAuthorized(req, wsDoc.id, store)) {
      return res.status(403).json({ error: 'Host authorization required to restore versions.' });
    }
    const ver = wsDoc.versions.find((v) => v.id === req.params.versionId);
    if (!ver) return res.status(404).json({ error: 'Version not found' });
    const rollback = {
      id: 'ver-' + crypto.randomUUID().slice(0, 8),
      label: `Before restore ${new Date().toISOString()}`,
      createdAt: Date.now(),
      createdBy: String(body.actor || 'User').slice(0, 60),
      pages: structuredClone(wsDoc.pages),
      attachedFiles: structuredClone(wsDoc.attachedFiles),
      pdfAnnotations: structuredClone(wsDoc.pdfAnnotations || {}),
    };
    wsDoc.versions = [rollback, ...wsDoc.versions.slice(0, 29)];
    wsDoc.pages = structuredClone(ver.pages);
    if (ver.attachedFiles) wsDoc.attachedFiles = structuredClone(ver.attachedFiles);
    if (ver.pdfAnnotations) wsDoc.pdfAnnotations = structuredClone(ver.pdfAnnotations);
    if (wsDoc.pages[0]) wsDoc.activePageId = wsDoc.pages[0].id;
    wsDoc.updatedAt = Date.now();
    appendAudit(wsDoc, String(body.actor || 'User'), `Restored version "${ver.label}"`);
    persistStoreSync();
    broadcastToRoom(wsDoc.id, { type: 'workspace:sync', pages: wsDoc.pages, activePageId: wsDoc.activePageId });
    const hasValidKey = Boolean(providedKey && wsDoc.hostKey && providedKey === wsDoc.hostKey);
    res.json({ workspace: sanitizeWorkspaceForClient(wsDoc, hasValidKey) });
  });

  app.post('/api/workspaces/:id/invites', (req, res) => {
    const wsDoc = store.workspaces[req.params.id];
    if (!wsDoc) return res.status(404).json({ error: 'Workspace not found.' });
    if (!isProviderHostAuthorized(req, wsDoc.id, store)) return res.status(403).json({ error: 'Workspace host authorization is required.' });
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + 5 * 60_000;
    hostInviteTokens.set(token, { workspaceId: wsDoc.id, expiresAt });
    for (const [key, invite] of hostInviteTokens) if (invite.expiresAt < Date.now()) hostInviteTokens.delete(key);
    res.status(201).json({ token, expiresAt });
  });

  // Custom Templates
  app.post('/api/templates', (req, res) => {
    const workspaceId = typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : '';
    if (!isProviderHostAuthorized(req, workspaceId, store)) {
      return res.status(403).json({ error: 'Workspace host authorization is required to save templates.' });
    }
    if (store.customTemplates.length >= 500) return res.status(413).json({ error: 'Template library is full.' });
    const name = String(req.body?.name || 'Custom Template').slice(0, 80);
    const category = String(req.body?.category || 'Custom').slice(0, 40);
    const page = req.body?.page as BoardPage | undefined;
    if (!page) return res.status(400).json({ error: 'Template page data required' });
    const tpl = {
      id: 'tpl-' + crypto.randomUUID().slice(0, 8),
      name,
      category,
      page: structuredClone(page),
      createdAt: Date.now(),
    };
    store.customTemplates.unshift(tpl);
    persistStoreSync();
    res.status(201).json({ template: tpl, customTemplates: store.customTemplates });
  });

  app.delete('/api/templates/:id', (req, res) => {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    if (!isProviderHostAuthorized(req, workspaceId, store)) {
      return res.status(403).json({ error: 'Workspace host authorization is required to delete templates.' });
    }
    const index = store.customTemplates.findIndex((tpl) => tpl.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Template not found.' });
    store.customTemplates.splice(index, 1);
    persistStoreSync();
    res.json({ ok: true, customTemplates: store.customTemplates });
  });

  // Secure File Upload & Signed Download
  app.post('/api/files/upload', (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`upload:${ip}`, 40, 60_000)) {
      return res.status(429).json({ error: 'Upload rate limit exceeded. Please wait a moment.' });
    }
    const { workspaceId, fileName, mimeType, base64Data, extractedText } = req.body || {};
    if (!workspaceId || !fileName || !base64Data) {
      return res.status(400).json({ error: 'Missing required file upload fields.' });
    }
    const wsDoc = store.workspaces[workspaceId];
    if (!wsDoc) return res.status(404).json({ error: 'Workspace not found' });
    if (!isProviderHostAuthorized(req, String(workspaceId), store)) {
      return res.status(403).json({ error: 'Workspace host authorization is required to upload files.' });
    }

    const cleanB64 = String(base64Data).includes(',') ? String(base64Data).split(',')[1] : String(base64Data);
    const buffer = Buffer.from(cleanB64, 'base64');
    if (buffer.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: 'File exceeds 25MB limit.' });
    }

    const existingDupe = wsDoc.attachedFiles.find((f) => {
      if (f.fileName !== String(fileName) || f.size !== buffer.length) return false;
      const existingPath = getUploadedFilePath(f.fileId);
      return Boolean(existingPath && fs.readFileSync(existingPath).equals(buffer));
    });
    if (existingDupe) {
      return res.status(200).json({ file: existingDupe, deduplicated: true });
    }

    const meta = saveUploadedFile(
      workspaceId,
      String(fileName),
      String(mimeType || 'application/octet-stream'),
      buffer,
      typeof extractedText === 'string' ? extractedText.slice(0, 120_000) : undefined
    );
    wsDoc.attachedFiles = [meta, ...wsDoc.attachedFiles];
    wsDoc.updatedAt = Date.now();
    appendAudit(wsDoc, 'User', `Uploaded file "${meta.fileName}"`);
    persistStoreSync();
    broadcastToRoom(workspaceId, { type: 'files:sync', attachedFiles: wsDoc.attachedFiles });
    res.status(201).json({ file: meta });
  });

  app.post('/api/files/replace', (req, res) => {
    const { workspaceId, fileId, base64Data, extractedText } = req.body || {};
    if (!workspaceId || !fileId || !base64Data) {
      return res.status(400).json({ error: 'Missing required fields for file replacement.' });
    }
    if (!isProviderHostAuthorized(req, String(workspaceId), store)) {
      return res.status(403).json({ error: 'Workspace host authorization is required to replace files.' });
    }
    const cleanB64 = String(base64Data).includes(',') ? String(base64Data).split(',')[1] : String(base64Data);
    const buffer = Buffer.from(cleanB64, 'base64');
    if (buffer.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: 'File exceeds 25MB limit.' });
    }
    const updated = replaceUploadedFile(
      String(workspaceId),
      String(fileId),
      buffer,
      typeof extractedText === 'string' ? extractedText.slice(0, 120_000) : undefined
    );
    if (!updated) return res.status(404).json({ error: 'File not found in workspace.' });
    persistStoreSync();
    const wsDoc = store.workspaces[String(workspaceId)];
    if (wsDoc) {
      broadcastToRoom(String(workspaceId), { type: 'files:sync', attachedFiles: wsDoc.attachedFiles });
    }
    res.json({ file: updated });
  });

  app.post('/api/files/delete', (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`file-delete:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: 'File delete rate limit reached. Please wait a moment.' });
    }

    const { workspaceId, fileIds } = req.body || {};
    if (typeof workspaceId !== 'string' || !Array.isArray(fileIds) || fileIds.length === 0 || fileIds.length > 500) {
      return res.status(400).json({ error: 'Choose one or more workspace PDFs to remove.' });
    }
    if (!isProviderHostAuthorized(req, workspaceId, store)) {
      return res.status(403).json({ error: 'Workspace host authorization is required to delete files.' });
    }

    const wsDoc = store.workspaces[workspaceId];
    if (!wsDoc) return res.status(404).json({ error: 'Workspace not found.' });
    const requestedIds = new Set<string>();
    for (const fileId of fileIds) {
      if (typeof fileId !== 'string' || !fileId || fileId.length > 512) {
        return res.status(400).json({ error: 'A selected file ID is invalid.' });
      }
      requestedIds.add(fileId);
    }

    const selectedFiles = wsDoc.attachedFiles.filter(
      (file) => requestedIds.has(file.fileId)
    );
    const selectedIds = new Set(selectedFiles.map((file) => file.fileId));
    if (selectedIds.size !== requestedIds.size) {
      return res.status(404).json({ error: 'One or more selected files are no longer in this workspace.' });
    }

    wsDoc.attachedFiles = wsDoc.attachedFiles.filter((file) => !requestedIds.has(file.fileId));
    if (wsDoc.pdfAnnotations) {
      for (const fileId of requestedIds) delete wsDoc.pdfAnnotations[fileId];
      if (Object.keys(wsDoc.pdfAnnotations).length === 0) delete wsDoc.pdfAnnotations;
    }
    wsDoc.updatedAt = Date.now();
    appendAudit(
      wsDoc,
      'User',
      requestedIds.size === 1 ? `Removed file "${selectedFiles[0].fileName}"` : `Removed ${requestedIds.size} files`
    );
    persistStoreSync();
    cleanupOrphanedUploads(store);
    broadcastToRoom(workspaceId, {
      type: 'files:sync',
      attachedFiles: wsDoc.attachedFiles,
      removedFileIds: Array.from(requestedIds),
    });
    res.json({ removedFileIds: Array.from(requestedIds) });
  });

  function buildContentDisposition(rawFileName: string): string {
    const cleaned =
      String(rawFileName || 'download')
        .replace(/[\r\n\x00-\x1f\x7f]/g, ' ')
        .trim() || 'download';
    const asciiFallback =
      cleaned
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/["\\;]/g, '_')
        .trim() || 'download';
    const encodedUtf8 = encodeURIComponent(cleaned).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`;
  }

  app.get('/api/files/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    const wsId = String(req.query.ws || '');
    const token = String(req.query.token || '');
    if (!wsId || !token || !verifyFileToken(fileId, wsId, token)) {
      return res.status(403).json({ error: 'Invalid or expired signed file URL.' });
    }
    const diskPath = getUploadedFilePath(fileId);
    if (!diskPath) return res.status(404).json({ error: 'File not found on disk.' });
    const wsDoc = store.workspaces[wsId];
    const meta = wsDoc?.attachedFiles.find((f) => f.fileId === fileId);
    if (meta?.mimeType) {
      const safeMime = /^(application\/pdf|image\/(?:png|jpeg|gif|webp|avif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)$/i.test(meta.mimeType.trim())
        ? meta.mimeType.trim()
        : 'application/octet-stream';
      res.setHeader('Content-Type', safeMime);
    }
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if ((req.query.download === '1' || !meta?.mimeType || /^(text\/|image\/svg\+xml)/i.test(meta.mimeType)) && meta?.fileName) {
      res.setHeader('Content-Disposition', buildContentDisposition(meta.fileName));
    }
    fs.createReadStream(diskPath).pipe(res);
  });

  const sendAiError = (res: express.Response, route: string, err: unknown) => {
    const info = parseGeminiApiError(err);
    if (info.statusCode === 429) {
      if (info.retryAfterSeconds) {
        res.setHeader('Retry-After', String(info.retryAfterSeconds));
      }
      console.warn(`${route} rate-limited (${info.code}, retry in ${info.retryAfterSeconds ?? 30}s)`);
    } else if (info.statusCode >= 500) {
      console.error(`${route} error:`, info.message);
    } else {
      console.warn(`${route} (${info.statusCode}): ${info.message}`);
    }
    return res.status(info.statusCode).json({
      error: info.message,
      code: info.code,
      ...(info.retryAfterSeconds ? { retryAfterSeconds: info.retryAfterSeconds } : {}),
    });
  };

  // Server-Side Gemini AI Routes
  app.post('/api/ai/generate-diagram', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 25, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached. Please wait a few seconds.' });
    }
    try {
      const { prompt, diagramType, locale } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required.' });
      }
      const result = await generateDiagramWithAI(prompt.slice(0, 2000), diagramType || 'mind_map', locale || 'en');
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/generate-diagram', err);
    }
  });

  app.post('/api/ai/generate-presentation', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { topic, slideCount, locale } = req.body || {};
      if (!topic || typeof topic !== 'string') {
        return res.status(400).json({ error: 'Topic is required.' });
      }
      const result = await generatePresentationWithAI(topic.slice(0, 1500), Number(slideCount || 5), locale || 'en');
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/generate-presentation', err);
    }
  });

  app.post('/api/ai/math-solve', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 25, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { query, imageBase64, locale } = req.body || {};
      if (!query && !imageBase64) {
        return res.status(400).json({ error: 'Math query or image is required.' });
      }
      const result = await solveMathWithAI(String(query || 'Solve the math shown in the image'), imageBase64, locale || 'en');
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/math-solve', err);
    }
  });

  app.post('/api/ai/recognize-sketch', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 25, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { imageBase64, mode, width, height } = req.body || {};
      if (!imageBase64) {
        return res.status(400).json({ error: 'Canvas snapshot image is required.' });
      }
      const result = await recognizeSketchWithAI(
        String(imageBase64),
        mode || 'shape',
        Number(width || 1000),
        Number(height || 700)
      );
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/recognize-sketch', err);
    }
  });

  app.post('/api/ai/clean-layout', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 25, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { objects, instruction } = req.body || {};
      if (!Array.isArray(objects) || objects.length === 0) {
        return res.status(400).json({ error: 'Objects array is required.' });
      }
      const result = await cleanLayoutWithAI(objects, String(instruction || 'Align cleanly with balanced spacing'));
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/clean-layout', err);
    }
  });

  app.post('/api/ai/educate', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 25, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { action, prompt, contextText, locale, targetLanguage } = req.body || {};
      if (!prompt && !contextText) {
        return res.status(400).json({ error: 'Prompt or document context is required.' });
      }
      const result = await educateWithAI(
        action || 'explain',
        String(prompt || 'Summarize and explain key concepts'),
        typeof contextText === 'string' ? contextText : undefined,
        locale || 'en',
        typeof targetLanguage === 'string' ? targetLanguage : undefined
      );
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/educate', err);
    }
  });

  app.post('/api/ai/tts', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 25, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.', code: 'RATE_LIMITED', retryAfterSeconds: 30 });
    }
    try {
      const { text, locale, workspaceId } = req.body || {};
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required for speech synthesis.' });
      }
      const providerHostAuthorized =
        typeof workspaceId === 'string' && isProviderHostAuthorized(req, workspaceId, store);
      const result = await generateSpeechWithAI(text, locale || 'en', providerHostAuthorized);
      res.json({
        ...result,
        audioDataUrl: `data:${result.mimeType};base64,${result.audioBase64}`,
      });
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/tts', err);
    }
  });

  app.post('/api/ai/transcribe', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 25, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { audioBase64, mimeType, locale } = req.body || {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        return res.status(400).json({ error: 'Audio data is required for transcription.' });
      }
      const rawB64 = audioBase64.includes(',') ? audioBase64.split(',')[1].trim() : audioBase64.trim();
      if (!rawB64 || Buffer.from(rawB64, 'base64').length < 64) {
        return res.status(400).json({ error: 'Recorded audio is empty or too short.' });
      }
      const result = await transcribeAudioWithAI(audioBase64, String(mimeType || 'audio/wav'), locale || 'en');
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/transcribe', err);
    }
  });

  app.post('/api/ai/chat-stream', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 30, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { messages, boardContext, imageBase64, locale, workspaceId } = req.body || {};
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required.' });
      }
      const settings = getAIProviderSettings();
      const providerHostAuthorized =
        typeof workspaceId === 'string' && isProviderHostAuthorized(req, workspaceId, store);
      if (settings.chatProviderMode === 'bedrock' && !providerHostAuthorized) {
        return res.status(403).json({ error: 'Workspace host authorization is required for AWS providers.' });
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      let emittedGeminiChunk = false;
      if (settings.chatProviderMode === 'bedrock') {
        await chatWithBedrockStream(
          messages,
          String(boardContext || ''),
          typeof imageBase64 === 'string' ? imageBase64 : undefined,
          locale || 'en',
          (chunk) => {
            res.write(`data: ${JSON.stringify({ chunk, provider: 'Amazon Bedrock' })}\n\n`);
          }
        );
      } else {
        try {
          await chatWithBoardStream(
            messages,
            String(boardContext || ''),
            typeof imageBase64 === 'string' ? imageBase64 : undefined,
            locale || 'en',
            (chunk) => {
              emittedGeminiChunk = true;
              res.write(`data: ${JSON.stringify({ chunk, provider: 'Gemini' })}\n\n`);
            }
          );
        } catch (geminiError: unknown) {
          const canUseBedrock =
            settings.chatProviderMode === 'auto' &&
            !emittedGeminiChunk &&
            providerHostAuthorized;
          if (!canUseBedrock) throw geminiError;
          console.warn('/api/ai/chat-stream falling back to Amazon Bedrock before streaming output.');
          await chatWithBedrockStream(
            messages,
            String(boardContext || ''),
            typeof imageBase64 === 'string' ? imageBase64 : undefined,
            locale || 'en',
            (chunk) => {
              res.write(`data: ${JSON.stringify({ chunk, provider: 'Amazon Bedrock' })}\n\n`);
            }
          );
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const info = parseGeminiApiError(err);
      if (info.statusCode === 429) {
        console.warn(`/api/ai/chat-stream rate-limited (${info.code}, retry in ${info.retryAfterSeconds ?? 30}s)`);
      } else {
        console.error('/api/ai/chat-stream error:', info.message);
      }
      if (!res.headersSent) {
        res.status(info.statusCode).json({ error: info.message, code: info.code });
      } else {
        res.write(`data: ${JSON.stringify({ error: info.message })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/ai/quiz-flashcards', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { topic, contextText, count, locale } = req.body || {};
      const result = await generateQuizAndFlashcardsWithAI(
        String(topic || 'Current Board'),
        String(contextText || ''),
        Number(count || 5),
        locale || 'en'
      );
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/quiz-flashcards', err);
    }
  });

  app.post('/api/ai/grade-work', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { rubric, studentText, imageBase64, locale } = req.body || {};
      const result = await gradeStudentWorkWithAI(
        String(rubric || 'Evaluate correctness and reasoning'),
        String(studentText || ''),
        typeof imageBase64 === 'string' ? imageBase64 : undefined,
        locale || 'en'
      );
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/grade-work', err);
    }
  });

  app.post('/api/ai/pdf-ocr', async (req, res) => {
    const ip = req.ip || 'local';
    if (!checkRateLimit(`ai:${ip}`, 30, 60_000)) {
      return res.status(429).json({ error: 'AI rate limit reached.' });
    }
    try {
      const { imageBase64, locale } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'Page snapshot image is required.' });
      }
      const result = await ocrPdfPageWithAI(imageBase64, locale || 'en');
      res.json(result);
    } catch (err: unknown) {
      sendAiError(res, '/api/ai/pdf-ocr', err);
    }
  });

  const server = http.createServer(app);

  // Real-Time Collaboration & Classroom WebSocket Server on same port (noServer avoids aborting Vite HMR upgrades)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 3 * 1024 * 1024 });
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if ((client as WebSocket & { isAlive?: boolean }).isAlive === false) {
        client.terminate();
        continue;
      }
      (client as WebSocket & { isAlive?: boolean }).isAlive = false;
      client.ping();
    }
  }, 30_000);
  wss.on('close', () => clearInterval(heartbeat));
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', `http://localhost:${PORT}`).pathname;
    if (pathname === '/ws') {
      const origin = req.headers.origin;
      if (origin && allowedWebOrigins.length > 0 && !allowedWebOrigins.includes(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => { (ws as WebSocket & { isAlive?: boolean }).isAlive = true; });
    const url = new URL(req.url || '/ws', `http://localhost:${PORT}`);
    const workspaceId = url.searchParams.get('room') || 'default-board';
    const userId = url.searchParams.get('userId') || 'u-' + crypto.randomUUID().slice(0, 6);
    const userName = (url.searchParams.get('userName') || 'Collaborator').slice(0, 40);
    const requestedRole = (url.searchParams.get('role') as UserRole) || 'editor';
    const inviteTicket = url.searchParams.get('ticket') || '';
    const color = url.searchParams.get('color') || '#2563EB';

    if (!store.workspaces[workspaceId]) {
      store.workspaces[workspaceId] = createDefaultWorkspace(workspaceId);
    }
    if (!store.classroomSessions[workspaceId]) {
      store.classroomSessions[workspaceId] = createDefaultClassroomState(store.workspaces[workspaceId].activePageId);
    }

    const initialWsDoc = store.workspaces[workspaceId];
    let localOriginTrusted = false;
    try {
      const parsedOrigin = req.headers.origin ? new URL(req.headers.origin) : null;
      const remoteAddress = req.socket.remoteAddress || '';
      const loopback = remoteAddress === '::1' || remoteAddress === '127.0.0.1' || remoteAddress.startsWith('::ffff:127.');
      localOriginTrusted = Boolean(loopback && parsedOrigin && isLoopbackHostname(parsedOrigin.hostname) && parsedOrigin.host === req.headers.host);
    } catch {
      localOriginTrusted = false;
    }
    const invite = hostInviteTokens.get(inviteTicket);
    const validInvite = Boolean(invite && invite.workspaceId === workspaceId && invite.expiresAt >= Date.now());
    if (validInvite) hostInviteTokens.delete(inviteTicket);
    if (validInvite && !initialWsDoc.ownerClaimed) {
      initialWsDoc.ownerClaimed = true;
      initialWsDoc.ownerId = userId;
      schedulePersist();
    }
    const hostAuthorized = validInvite || localOriginTrusted;
    if (initialWsDoc.collaborationMode === 'private' && !hostAuthorized) {
      ws.close(1008, 'Workspace host authorization is required.');
      return;
    }
    const effectiveRole: UserRole = requestedRole === 'teacher' && !hostAuthorized
      ? 'student'
      : requestedRole === 'editor' && !hostAuthorized && initialWsDoc.collaborationMode !== 'group_collab'
        ? 'viewer'
        : requestedRole;

    const meta: ClientMeta = {
      ws,
      workspaceId,
      userId,
      userName,
      role: effectiveRole,
      color,
      pageId: initialWsDoc.activePageId,
      cursorX: 0,
      cursorY: 0,
      lastActive: Date.now(),
      hostAuthorized,
    };

    if (!rooms.has(workspaceId)) rooms.set(workspaceId, new Set());
    rooms.get(workspaceId)!.add(meta);

    // Send initial authoritative state (include hostKey only for authorized host)
    ws.send(
      JSON.stringify({
        type: 'init',
        workspace: sanitizeWorkspaceForClient(initialWsDoc, hostAuthorized),
        classroom: sanitizeClassroomForClient(store.classroomSessions[workspaceId], meta.role, meta.userId),
        presence: getPresenceList(workspaceId),
        effectiveRole,
        hostAuthorized,
      })
    );

    broadcastToRoom(workspaceId, { type: 'presence:update', presence: getPresenceList(workspaceId) }, ws);

    ws.on('message', (raw) => {
      try {
        if (!checkRateLimit(`ws:${req.socket.remoteAddress || 'unknown'}:${meta.userId}`, 240, 10_000)) {
          ws.close(1008, 'Message rate limit exceeded');
          return;
        }
        const msg = JSON.parse(raw.toString());
        const wsDoc = store.workspaces[workspaceId];
        const classroom = store.classroomSessions[workspaceId];
        if (!wsDoc) return;
        meta.lastActive = Date.now();

        switch (msg.type) {
          case 'host:auth': {
            const candidateKey = typeof msg.hostKey === 'string' ? msg.hostKey : '';
            if (!candidateKey || !wsDoc.hostKey || candidateKey.length !== wsDoc.hostKey.length || !timingSafeEqual(candidateKey, wsDoc.hostKey)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid workspace host key.' }));
              return;
            }
            meta.hostAuthorized = true;
            meta.role = 'teacher';
            if (!wsDoc.ownerClaimed) {
              wsDoc.ownerClaimed = true;
              wsDoc.ownerId = meta.userId;
              schedulePersist();
            }
            ws.send(JSON.stringify({ type: 'host:granted', hostKey: wsDoc.hostKey }));
            broadcastToRoom(workspaceId, { type: 'presence:update', presence: getPresenceList(workspaceId) });
            break;
          }
          case 'cursor:move': {
            meta.cursorX = Number(msg.x || 0);
            meta.cursorY = Number(msg.y || 0);
            if (typeof msg.pageId === 'string') meta.pageId = msg.pageId;
            broadcastToRoom(
              workspaceId,
              {
                type: 'cursor:move',
                userId: meta.userId,
                userName: meta.userName,
                role: meta.role,
                color: meta.color,
                x: meta.cursorX,
                y: meta.cursorY,
                pageId: meta.pageId,
                activeTool: typeof msg.activeTool === 'string' ? msg.activeTool : undefined,
              },
              ws
            );
            break;
          }
          case 'laser:point': {
            broadcastToRoom(
              workspaceId,
              {
                type: 'laser:point',
                userId: meta.userId,
                color: msg.color || '#EF4444',
                x: Number(msg.x || 0),
                y: Number(msg.y || 0),
                pageId: msg.pageId,
              },
              ws
            );
            break;
          }
          case 'viewport:sync': {
            if (!canMutateWorkspace(wsDoc, classroom, meta) && !meta.hostAuthorized && meta.role !== 'teacher') {
              return;
            }
            const rawZoom = Number(msg.zoom);
            const zoom = Number.isFinite(rawZoom) ? Math.min(6, Math.max(0.1, rawZoom)) : 1;
            const panX = Number.isFinite(Number(msg.panX)) ? Number(msg.panX) : 0;
            const panY = Number.isFinite(Number(msg.panY)) ? Number(msg.panY) : 0;
            const rotationDeg = Number.isFinite(Number(msg.rotationDeg)) ? Number(msg.rotationDeg) : 0;
            broadcastToRoom(
              workspaceId,
              {
                type: 'viewport:sync',
                userId: meta.userId,
                userName: meta.userName,
                pageId: typeof msg.pageId === 'string' ? msg.pageId : wsDoc.activePageId,
                zoom,
                panX,
                panY,
                rotationDeg,
              },
              ws
            );
            break;
          }
          case 'reaction:send': {
            broadcastToRoom(workspaceId, {
              type: 'reaction:send',
              userId: meta.userId,
              userName: meta.userName,
              emoji: String(msg.emoji || '👍').slice(0, 8),
              x: Number(msg.x || 300),
              y: Number(msg.y || 300),
            });
            break;
          }
          case 'object:create': {
            if (!canMutateWorkspace(wsDoc, classroom, meta)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Editing is currently locked by the teacher/owner.' }));
              return;
            }
            const page = wsDoc.pages.find((p) => p.id === msg.pageId);
            const obj = msg.object as BoardObject | undefined;
            if (page && obj && obj.id) {
              if (!page.objects.some((o) => o.id === obj.id)) {
                page.objects.push(obj);
                wsDoc.updatedAt = Date.now();
                schedulePersist();
              }
              broadcastToRoom(workspaceId, { type: 'object:create', pageId: page.id, object: obj }, ws);
            }
            break;
          }
          case 'object:update': {
            if (!canMutateWorkspace(wsDoc, classroom, meta)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Editing is currently locked by the teacher/owner.' }));
              return;
            }
            const page = wsDoc.pages.find((p) => p.id === msg.pageId);
            const patch = msg.patch as Partial<BoardObject> & { id: string };
            if (page && patch && patch.id) {
              const idx = page.objects.findIndex((o) => o.id === patch.id);
              if (idx !== -1) {
                page.objects[idx] = { ...page.objects[idx], ...patch } as BoardObject;
                wsDoc.updatedAt = Date.now();
                schedulePersist();
                broadcastToRoom(workspaceId, { type: 'object:update', pageId: page.id, patch }, ws);
              }
            }
            break;
          }
          case 'objects:patch': {
            if (!canMutateWorkspace(wsDoc, classroom, meta)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Editing is currently locked by the teacher/owner.' }));
              return;
            }
            const page = wsDoc.pages.find((p) => p.id === msg.pageId);
            const patches = Array.isArray(msg.patches)
              ? (msg.patches as (Partial<BoardObject> & { id: string })[])
              : [];
            if (page && patches.length > 0) {
              const patchMap = new Map(patches.map((p) => [p.id, p]));
              page.objects = page.objects.map((o) => {
                const p = patchMap.get(o.id);
                return p ? ({ ...o, ...p } as BoardObject) : o;
              });
              wsDoc.updatedAt = Date.now();
              schedulePersist();
              broadcastToRoom(workspaceId, { type: 'objects:patch', pageId: page.id, patches }, ws);
            }
            break;
          }
          case 'object:delete': {
            if (!canMutateWorkspace(wsDoc, classroom, meta)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Editing is currently locked by the teacher/owner.' }));
              return;
            }
            const page = wsDoc.pages.find((p) => p.id === msg.pageId);
            const ids: string[] = Array.isArray(msg.objectIds) ? msg.objectIds : msg.objectId ? [msg.objectId] : [];
            if (page && ids.length > 0) {
              const idSet = new Set(ids);
              page.objects = page.objects.filter((o) => !idSet.has(o.id));
              wsDoc.updatedAt = Date.now();
              schedulePersist();
              broadcastToRoom(workspaceId, { type: 'object:delete', pageId: page.id, objectIds: ids }, ws);
            }
            break;
          }
          case 'page:sync': {
            if (!canMutateWorkspace(wsDoc, classroom, meta)) return;
            const incomingPage = msg.page as BoardPage | undefined;
            if (incomingPage && incomingPage.id) {
              const idx = wsDoc.pages.findIndex((p) => p.id === incomingPage.id);
              if (idx !== -1) {
                wsDoc.pages[idx] = incomingPage;
              } else {
                wsDoc.pages.push(incomingPage);
              }
              wsDoc.updatedAt = Date.now();
              schedulePersist();
              broadcastToRoom(workspaceId, { type: 'page:sync', page: incomingPage }, ws);
            }
            break;
          }
          case 'pages:replace': {
            if (!canMutateWorkspace(wsDoc, classroom, meta)) return;
            if (Array.isArray(msg.pages)) {
              wsDoc.pages = msg.pages;
              if (typeof msg.activePageId === 'string') wsDoc.activePageId = msg.activePageId;
              wsDoc.updatedAt = Date.now();
              schedulePersist();
              broadcastToRoom(
                workspaceId,
                { type: 'workspace:sync', pages: wsDoc.pages, activePageId: wsDoc.activePageId },
                ws
              );
            }
            break;
          }
          case 'pdf:annotations': {
            if (!canMutateWorkspace(wsDoc, classroom, meta)) return;
            const fileId = typeof msg.fileId === 'string' ? msg.fileId : '';
            const anns = Array.isArray(msg.annotations) ? (msg.annotations as PDFAnnotation[]) : null;
            if (fileId && anns) {
              if (!wsDoc.pdfAnnotations) wsDoc.pdfAnnotations = {};
              wsDoc.pdfAnnotations[fileId] = anns;
              wsDoc.updatedAt = Date.now();
              schedulePersist();
              broadcastToRoom(workspaceId, { type: 'pdf:annotations', fileId, annotations: anns }, ws);
            }
            break;
          }
          case 'pdf:view': {
            if (!canMutateWorkspace(wsDoc, classroom, meta)) return;
            const fileId = typeof msg.fileId === 'string' ? msg.fileId : '';
            const rawProgress = Number(msg.scrollProgress);
            if (fileId && wsDoc.attachedFiles.some((file) => file.fileId === fileId) && Number.isFinite(rawProgress)) {
              broadcastToRoom(
                workspaceId,
                {
                  type: 'pdf:view',
                  userId: meta.userId,
                  userName: meta.userName,
                  fileId,
                  scrollProgress: Math.max(0, Math.min(1, rawProgress)),
                },
                ws
              );
            }
            break;
          }
          case 'workspace:meta': {
            if (!meta.hostAuthorized && meta.role !== 'teacher') return;
            if (typeof msg.collaborationMode === 'string') wsDoc.collaborationMode = msg.collaborationMode;
            if (Array.isArray(msg.allowedEditors)) wsDoc.allowedEditors = msg.allowedEditors;
            if (typeof msg.name === 'string') wsDoc.name = msg.name;
            wsDoc.updatedAt = Date.now();
            schedulePersist();
            broadcastToRoom(workspaceId, {
              type: 'workspace:meta',
              collaborationMode: wsDoc.collaborationMode,
              allowedEditors: wsDoc.allowedEditors,
              name: wsDoc.name,
            });
            break;
          }
          case 'classroom:state': {
            if (meta.role !== 'teacher' || !meta.hostAuthorized) return;
            const updated: ClassroomSessionState = {
              ...classroom,
              ...(msg.state || {}),
              chat: classroom.chat || [],
            };
            if (Array.isArray(msg.state?.chat)) {
              updated.chat = msg.state.chat;
            }
            store.classroomSessions[workspaceId] = updated;
            schedulePersist();
            broadcastClassroomState(workspaceId, updated);
            break;
          }
          case 'classroom:follow': {
            if (meta.role !== 'teacher' || !meta.hostAuthorized) return;
            classroom.teacherPageId = String(msg.pageId || wsDoc.activePageId);
            schedulePersist();
            broadcastToRoom(workspaceId, { type: 'classroom:follow', pageId: classroom.teacherPageId }, ws);
            break;
          }
          case 'classroom:question': {
            const text = String(msg.text || '').trim().slice(0, 500);
            if (!text) return;
            classroom.questions.unshift({
              id: 'q-' + crypto.randomUUID().slice(0, 8),
              userId: meta.userId,
              userName: meta.userName,
              text,
              resolved: false,
              createdAt: Date.now(),
            });
            schedulePersist();
            broadcastClassroomState(workspaceId, classroom);
            break;
          }
          case 'classroom:chat': {
            const text = String(msg.text || '').trim().slice(0, 800);
            if (!text) return;
            if (!Array.isArray(classroom.chat)) classroom.chat = [];
            classroom.chat = [
              ...classroom.chat.slice(-199),
              {
                id: 'msg-' + crypto.randomUUID().slice(0, 8),
                userId: meta.userId,
                userName: meta.userName,
                role: meta.role,
                text,
                createdAt: Date.now(),
              },
            ];
            schedulePersist();
            broadcastClassroomState(workspaceId, classroom);
            break;
          }
          case 'classroom:poll_vote': {
            const { pollId, optionId } = msg;
            const poll = classroom.polls.find((p) => p.id === pollId);
            if (poll && poll.active !== false) {
              for (const opt of poll.options) {
                opt.votes = opt.votes.filter((u) => u !== meta.userId);
                if (opt.id === optionId) opt.votes.push(meta.userId);
              }
              schedulePersist();
              broadcastClassroomState(workspaceId, classroom);
            }
            break;
          }
          case 'classroom:quiz_answer': {
            const { quizId, answers } = msg;
            const quiz = classroom.quizzes.find((q) => q.id === quizId);
            if (quiz && quiz.active !== false && Array.isArray(answers)) {
              if (quiz.lockOnSubmit && Array.isArray(quiz.answers[meta.userId])) {
                ws.send(JSON.stringify({ type: 'error', message: 'Your quiz response is already locked.' }));
                return;
              }
              quiz.answers[meta.userId] = answers;
              schedulePersist();
              broadcastClassroomState(workspaceId, classroom);
            }
            break;
          }
          case 'classroom:submission': {
            const { pageName, snapshotDataUrl } = msg;
            if (typeof snapshotDataUrl === 'string') {
              classroom.submissions.unshift({
                id: 'sub-' + crypto.randomUUID().slice(0, 8),
                userId: meta.userId,
                userName: meta.userName,
                pageName: String(pageName || 'Board'),
                snapshotDataUrl: snapshotDataUrl.slice(0, 2_000_000),
                submittedAt: Date.now(),
              });
              schedulePersist();
              broadcastClassroomState(workspaceId, classroom);
            }
            break;
          }
          case 'classroom:feedback': {
            if (meta.role !== 'teacher' || !meta.hostAuthorized) return;
            const sub = classroom.submissions.find((s) => s.id === msg.submissionId);
            if (sub) {
              sub.feedback = String(msg.feedback || '');
              sub.grade = String(msg.grade || '');
              schedulePersist();
              broadcastClassroomState(workspaceId, classroom);
            }
            break;
          }
          case 'webrtc:signal': {
            const signalType = String(msg.signalType || '');
            const teacherSignal = ['offer', 'stream_ready', 'stream_stopped'].includes(signalType);
            if (teacherSignal && (meta.role !== 'teacher' || !meta.hostAuthorized)) return;
            if (!teacherSignal && !['answer', 'ice', 'request_stream'].includes(signalType)) return;
            const clients = rooms.get(workspaceId);
            if (!clients) return;
            const targetUserId = typeof msg.targetUserId === 'string' ? msg.targetUserId : '';
            const signalPayload = JSON.stringify({
              type: 'webrtc:signal',
              fromUserId: meta.userId,
              fromRole: meta.role,
              signalType,
              payload: msg.payload ?? null,
            });
            for (const client of clients) {
              if (client.ws === ws || client.ws.readyState !== WebSocket.OPEN) continue;
              if (!targetUserId || client.userId === targetUserId) {
                client.ws.send(signalPayload);
              }
            }
            break;
          }
          case 'role:change': {
            const nextRole = msg.role as UserRole;
            if (nextRole === 'teacher' || nextRole === 'student' || nextRole === 'editor' || nextRole === 'viewer') {
              if (nextRole === 'teacher') {
                const candidateKey = typeof msg.hostKey === 'string' ? msg.hostKey : '';
                if (candidateKey && wsDoc.hostKey && candidateKey.length === wsDoc.hostKey.length && timingSafeEqual(candidateKey, wsDoc.hostKey)) {
                  meta.hostAuthorized = true;
                } else if (!meta.hostAuthorized) {
                  ws.send(JSON.stringify({ type: 'error', message: 'Valid Host Key required to assume Teacher Host role.' }));
                  return;
                }
              }
              if (nextRole === 'editor' && !meta.hostAuthorized && wsDoc.collaborationMode !== 'group_collab') {
                ws.send(JSON.stringify({ type: 'error', message: 'Host approval is required for editor access.' }));
                return;
              }
              meta.role = nextRole;
              if (typeof msg.userName === 'string') meta.userName = msg.userName.slice(0, 40);
              broadcastToRoom(workspaceId, { type: 'presence:update', presence: getPresenceList(workspaceId) });
            }
            break;
          }
          case 'classroom:hand_raise': {
            const classroomState = store.classroomSessions[workspaceId];
            if (!classroomState) return;
            if (!Array.isArray(classroomState.raisedHands)) classroomState.raisedHands = [];
            if (!classroomState.raisedHands.some((h) => h.userId === meta.userId)) {
              classroomState.raisedHands.push({ userId: meta.userId, userName: meta.userName, raisedAt: Date.now() });
              schedulePersist();
              broadcastClassroomState(workspaceId, classroomState);
            }
            break;
          }
          case 'classroom:hand_lower': {
            const classroomState = store.classroomSessions[workspaceId];
            if (!classroomState || !Array.isArray(classroomState.raisedHands)) return;
            const targetId = meta.role === 'teacher' && typeof msg.targetUserId === 'string' ? msg.targetUserId : meta.userId;
            classroomState.raisedHands = classroomState.raisedHands.filter((h) => h.userId !== targetId);
            schedulePersist();
            broadcastClassroomState(workspaceId, classroomState);
            break;
          }
        }
      } catch (err) {
        console.error('WS message parse/handle error:', err);
      }
    });

    ws.on('close', () => {
      const set = rooms.get(workspaceId);
      if (set) {
        set.delete(meta);
        if (meta.role === 'teacher') {
          const otherTeacherConnected = Array.from(set).some((c) => c.role === 'teacher');
          const cs = store.classroomSessions[workspaceId];
          if (!otherTeacherConnected && cs && cs.screenSharingActive) {
            cs.screenSharingActive = false;
            schedulePersist();
            broadcastClassroomState(workspaceId, cs);
          }
        }
        if (set.size === 0) rooms.delete(workspaceId);
      }
      broadcastToRoom(workspaceId, { type: 'presence:update', presence: getPresenceList(workspaceId) });
    });
    ws.on('error', () => {
      try { ws.close(); } catch { /* ignore already closed sockets */ }
    });
  });

  // Vite dev middleware vs static production dist
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const viteWsConfig = { server, path: '/vite-hmr' };
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: viteWsConfig,
        hmr: process.env.DISABLE_HMR === 'true' ? false : viteWsConfig,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LuminaBoard server running on http://0.0.0.0:${PORT}`);
  });
  const shutdown = () => {
    flushPendingPersist();
    clearInterval(heartbeat);
    wss.close();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start LuminaBoard server:', err);
  process.exit(1);
});
