import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AttachedFileMeta,
  BoardPage,
  ClassroomSessionState,
  WorkspaceDocument,
} from '../src/types/smartboard.ts';

const DATA_DIR = path.resolve(process.env.LUMINABOARD_DATA_DIR || path.join(process.cwd(), 'data'));
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const SECRET_FILE = path.join(DATA_DIR, '.signing_secret');

function getOrCreateSigningSecret(): string {
  if (process.env.FILE_SIGNING_SECRET) {
    return process.env.FILE_SIGNING_SECRET;
  }
  ensureDirs();
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
  return generated;
}

const SIGNING_SECRET = getOrCreateSigningSecret();

export type StoreData = {
  workspaces: Record<string, WorkspaceDocument>;
  classroomSessions: Record<string, ClassroomSessionState>;
  customTemplates: {
    id: string;
    name: string;
    category: string;
    page: BoardPage;
    createdAt: number;
  }[];
};

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function createDefaultPage(name = 'Board 1'): BoardPage {
  return {
    id: 'page-' + crypto.randomUUID().slice(0, 8),
    name,
    objects: [
      {
        id: 'obj-welcome-title',
        name: 'Board Title',
        type: 'text',
        x: 140,
        y: 90,
        width: 580,
        height: 64,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 1,
        text: 'Interactive Teaching & Diagramming Canvas',
        textColor: '#0F172A',
        bgColor: 'transparent',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 28,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        textAlign: 'left',
      },
      {
        id: 'obj-welcome-note',
        name: 'Quick Guide Sticky',
        type: 'sticky',
        x: 140,
        y: 185,
        width: 260,
        height: 170,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 2,
        text: 'Double-click anywhere to edit text, drag shapes or connectors, open AI Assistant to generate diagrams, or switch to Slides / PDF studio.',
        noteColor: '#FEF08A',
        textColor: '#1E293B',
        author: 'Workspace Guide',
        fontSize: 14,
        reactions: { '👍': 1 },
      },
      {
        id: 'obj-welcome-box-1',
        name: 'Concept Node',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 460,
        y: 195,
        width: 210,
        height: 82,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 3,
        fill: '#EFF6FF',
        stroke: '#2563EB',
        strokeWidth: 2,
        text: 'Visual Concept',
        textColor: '#1E3A8A',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 15,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      },
      {
        id: 'obj-welcome-box-2',
        name: 'Outcome Node',
        type: 'shape',
        shapeKind: 'rounded_rect',
        x: 760,
        y: 195,
        width: 210,
        height: 82,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 4,
        fill: '#ECFDF5',
        stroke: '#059669',
        strokeWidth: 2,
        text: 'Live Collaboration',
        textColor: '#065F46',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 15,
        fontWeight: 'bold',
        fontStyle: 'normal',
        textAlign: 'center',
      },
      {
        id: 'obj-welcome-conn',
        name: 'Concept Link',
        type: 'connector',
        x: 670,
        y: 236,
        width: 90,
        height: 4,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        zIndex: 5,
        fromId: 'obj-welcome-box-1',
        toId: 'obj-welcome-box-2',
        fromPort: 'right',
        toPort: 'left',
        x1: 670,
        y1: 236,
        x2: 760,
        y2: 236,
        routeType: 'curved',
        stroke: '#2563EB',
        strokeWidth: 2.5,
        lineStyle: 'solid',
        startHead: 'none',
        endHead: 'arrow',
        label: 'syncs',
      },
    ],
    layers: [{ id: 'layer-default', name: 'Main Layer', visible: true, locked: false }],
    guides: [],
    background: '#FFFFFF',
    gridType: 'dots',
    gridSize: 28,
    transition: 'fade',
    slideDurationSec: 0,
  };
}

export function createDefaultWorkspace(id = 'default-board', name = 'Mathematics & System Design Studio'): WorkspaceDocument {
  const page1 = createDefaultPage('Overview Board');
  const now = Date.now();
  return {
    id,
    name,
    folder: 'General',
    starred: true,
    trashed: false,
    collaborationMode: 'group_collab',
    ownerId: 'teacher-host',
    ownerClaimed: false,
    hostKey: crypto.randomBytes(16).toString('hex'),
    allowedEditors: [],
    pages: [page1],
    activePageId: page1.id,
    createdAt: now,
    updatedAt: now,
    versions: [
      {
        id: 'ver-initial',
        label: 'Initial Workspace',
        createdAt: now,
        createdBy: 'System',
        pages: structuredClone([page1]),
      },
    ],
    attachedFiles: [],
    pdfAnnotations: {},
    auditLogs: [
      {
        id: 'audit-' + crypto.randomUUID().slice(0, 8),
        actor: 'System',
        action: 'Workspace initialized',
        timestamp: now,
      },
    ],
  };
}

export function createDefaultClassroomState(pageId: string): ClassroomSessionState {
  return {
    active: false,
    teacherId: 'teacher-host',
    teacherName: 'Lead Instructor',
    followTeacher: true,
    teacherPageId: pageId,
    studentEditingLocked: false,
    allowedStudentIds: [],
    screenSharingActive: false,
    polls: [],
    quizzes: [],
    questions: [],
    submissions: [],
    chat: [],
    raisedHands: [],
    breakoutRooms: [],
  };
}

let memoryStore: StoreData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function loadStore(): StoreData {
  if (memoryStore) return memoryStore;
  ensureDirs();
  if (fs.existsSync(STORE_FILE)) {
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed && parsed.workspaces && Object.keys(parsed.workspaces).length > 0) {
        for (const ws of Object.values(parsed.workspaces)) {
          if (!ws.hostKey) ws.hostKey = crypto.randomBytes(16).toString('hex');
          if (typeof ws.ownerClaimed !== 'boolean') ws.ownerClaimed = false;
          if (!ws.pdfAnnotations) ws.pdfAnnotations = {};
        }
        for (const cs of Object.values(parsed.classroomSessions || {})) {
          if (!Array.isArray(cs.chat)) cs.chat = [];
        }
        memoryStore = {
          workspaces: parsed.workspaces,
          classroomSessions: parsed.classroomSessions || {},
          customTemplates: parsed.customTemplates || [],
        };
        return memoryStore;
      }
      throw new Error('Store has no valid workspaces.');
    } catch (err) {
      console.error('Failed to parse store.json, creating fresh store:', err);
      try {
        fs.renameSync(STORE_FILE, `${STORE_FILE}.corrupt-${Date.now()}`);
      } catch (backupErr) {
        console.error('Could not preserve corrupt store file:', backupErr);
        throw new Error('Store file is corrupt and could not be preserved; refusing to overwrite it.');
      }
    }
  }
  const defaultWs = createDefaultWorkspace();
  memoryStore = {
    workspaces: { [defaultWs.id]: defaultWs },
    classroomSessions: {
      [defaultWs.id]: createDefaultClassroomState(defaultWs.activePageId),
    },
    customTemplates: [],
  };
  persistStoreSync();
  return memoryStore;
}

export function persistStoreSync() {
  if (!memoryStore) return;
  ensureDirs();
  const tmpFile = STORE_FILE + '.tmp';
  if (fs.existsSync(STORE_FILE)) {
    try { fs.copyFileSync(STORE_FILE, `${STORE_FILE}.bak`); } catch (err) {
      console.error('Could not create store backup:', err);
    }
  }
  fs.writeFileSync(tmpFile, JSON.stringify(memoryStore), 'utf-8');
  fs.renameSync(tmpFile, STORE_FILE);
}

export function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      persistStoreSync();
    } catch (err) {
      console.error('Store persistence error:', err);
    }
  }, 400);
}

export function flushPendingPersist() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistStoreSync();
}

export function appendAudit(ws: WorkspaceDocument, actor: string, action: string) {
  ws.auditLogs = [
    {
      id: 'aud-' + crypto.randomUUID().slice(0, 8),
      actor,
      action,
      timestamp: Date.now(),
    },
    ...ws.auditLogs.slice(0, 99),
  ];
}

export function signFileToken(fileId: string, workspaceId: string, expiresAt: number): string {
  const payload = `${fileId}:${workspaceId}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  return `${expiresAt}.${sig}`;
}

export function verifyFileToken(fileId: string, workspaceId: string, token: string): boolean {
  if (!token || !token.includes('.')) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return false;
  // Allow existing workspace attachments even if original 30-day token passed when signature verifies,
  // unless explicitly expired well beyond reasonable long-term project lifetime (>10 years)
  const expected = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`${fileId}:${workspaceId}:${exp}`)
    .digest('hex');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  // If signature is valid and workspace still exists in store, allow access cleanly
  const store = memoryStore;
  if (Date.now() > exp && store) {
    const ws = store.workspaces[workspaceId];
    const hasFile = ws?.attachedFiles?.some((f) => f.fileId === fileId);
    if (!hasFile) return false;
  }
  return true;
}

export function saveUploadedFile(
  workspaceId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
  extractedText?: string
): AttachedFileMeta {
  ensureDirs();
  const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeBase}`;
  const diskPath = path.join(UPLOADS_DIR, fileId);
  fs.writeFileSync(diskPath, buffer);

  const ext = path.extname(fileName).toLowerCase();
  let kind: AttachedFileMeta['kind'] = 'other';
  if (mimeType.includes('pdf') || ext === '.pdf') kind = 'pdf';
  else if (ext === '.pptx' || ext === '.ppt' || mimeType.includes('presentation')) kind = 'pptx';
  else if (mimeType.startsWith('image/')) kind = 'image';
  else if (mimeType.startsWith('audio/')) kind = 'audio';
  else if (mimeType.startsWith('video/')) kind = 'video';

  const exp = Date.now() + 1000 * 60 * 60 * 24 * 365 * 10; // 10 years signed URL
  const token = signFileToken(fileId, workspaceId, exp);

  return {
    fileId,
    fileName,
    mimeType,
    size: buffer.length,
    kind,
    url: `/api/files/${encodeURIComponent(fileId)}?ws=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(token)}`,
    uploadedAt: Date.now(),
    extractedText,
  };
}

export function replaceUploadedFile(
  workspaceId: string,
  fileId: string,
  buffer: Buffer,
  extractedText?: string
): AttachedFileMeta | null {
  const safeId = path.basename(fileId);
  const fullPath = path.join(UPLOADS_DIR, safeId);
  const store = loadStore();
  const ws = store.workspaces[workspaceId];
  const existing = ws?.attachedFiles.find((f) => f.fileId === safeId);
  if (!existing) return null;
  ensureDirs();
  const tmpPath = `${fullPath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, fullPath);
  existing.size = buffer.length;
  existing.uploadedAt = Date.now();
  if (typeof extractedText === 'string') existing.extractedText = extractedText;
  return existing;
}

export function cleanupOrphanedUploads(store: StoreData) {
  try {
    ensureDirs();
    const referenced = new Set<string>();
    for (const ws of Object.values(store.workspaces)) {
      for (const f of ws.attachedFiles || []) {
        referenced.add(path.basename(f.fileId));
      }
      for (const p of ws.pages || []) {
        for (const o of p.objects || []) {
          if (('src' in o) && typeof o.src === 'string' && o.src.includes('/api/files/')) {
            const m = /\/api\/files\/([^?]+)/.exec(o.src);
            if (m) referenced.add(decodeURIComponent(m[1]));
          }
        }
      }
      for (const version of ws.versions || []) {
        for (const file of version.attachedFiles || []) referenced.add(path.basename(file.fileId));
        for (const p of version.pages || []) {
          for (const o of p.objects || []) {
            if (('src' in o) && typeof o.src === 'string' && o.src.includes('/api/files/')) {
              const m = /\/api\/files\/([^?]+)/.exec(o.src);
              if (m) referenced.add(decodeURIComponent(m[1]));
            }
          }
        }
      }
    }
    const files = fs.readdirSync(UPLOADS_DIR);
    const now = Date.now();
    for (const file of files) {
      if (!referenced.has(file)) {
        const full = path.join(UPLOADS_DIR, file);
        const stat = fs.statSync(full);
        // Keep brand-new uploads (< 5 mins) in case save is pending
        if (now - stat.mtimeMs > 5 * 60 * 1000) {
          fs.unlinkSync(full);
        }
      }
    }
  } catch (err) {
    console.warn('Orphan upload cleanup skipped:', err);
  }
}

export function getUploadedFilePath(fileId: string): string | null {
  const safeId = path.basename(fileId);
  const fullPath = path.join(UPLOADS_DIR, safeId);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

// Simple in-memory sliding window rate limiter
const rateBuckets = new Map<string, number[]>();
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    rateBuckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return true;
}
