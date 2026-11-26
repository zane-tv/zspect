import Dexie, { type Table } from 'dexie';
import type { PinRecord, ReferenceDNA, SessionRecord } from '@/types/zspect';

export class ZSpectDatabase extends Dexie {
  sessions!: Table<SessionRecord, string>;
  pins!: Table<PinRecord, string>;
  references!: Table<ReferenceDNA, string>;

  constructor() {
    super('ZSpectDB');
    this.version(1).stores({
      sessions: 'id, updatedAt, createdAt',
      pins: 'id, sessionId, [sessionId+orderIndex], type, severity, status, pageUrl, createdAt',
      references: 'id, &alias, sourceUrl, createdAt',
    });
  }
}

export const db = new ZSpectDatabase();

const ACTIVE_SESSION_STORAGE_KEY = 'zspect_active_session_id';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `zs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultSessionTitle(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Session QA — ${date}`;
}

async function getStoredSessionId(): Promise<string | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(ACTIVE_SESSION_STORAGE_KEY);
    return (res[ACTIVE_SESSION_STORAGE_KEY] as string | undefined) ?? null;
  }
  return null;
}

export async function setStoredSessionId(sessionId: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [ACTIVE_SESSION_STORAGE_KEY]: sessionId });
  }
}

function notifyDbChanged(entity: 'pins' | 'references' | 'sessions', sessionId?: string): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime
      .sendMessage({ type: 'ZSPECT_DB_UPDATED', entity, sessionId })
      .catch(() => {
        // Receiver may not be open yet; safe to ignore.
      });
  }
}

export async function ensureActiveSession(): Promise<SessionRecord> {
  const storedId = await getStoredSessionId();
  if (storedId) {
    const found = await db.sessions.get(storedId);
    if (found) return found;
  }

  const latest = await db.sessions.orderBy('updatedAt').reverse().first();
  if (latest) {
    await setStoredSessionId(latest.id);
    return latest;
  }

  return createSession(defaultSessionTitle());
}

export async function createSession(title?: string): Promise<SessionRecord> {
  const now = Date.now();
  const record: SessionRecord = {
    id: createId(),
    title: title?.trim() || defaultSessionTitle(),
    activeTabCollection: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.sessions.put(record);
  await setStoredSessionId(record.id);
  notifyDbChanged('sessions', record.id);
  return record;
}

export async function renameSession(id: string, title: string): Promise<void> {
  await db.sessions.update(id, { title: title.trim(), updatedAt: Date.now() });
  notifyDbChanged('sessions', id);
}

export async function deleteSession(id: string): Promise<SessionRecord> {
  await db.transaction('rw', db.sessions, db.pins, async () => {
    await db.pins.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
  notifyDbChanged('sessions', id);
  return ensureActiveSession();
}

export async function listSessions(): Promise<SessionRecord[]> {
  return db.sessions.orderBy('updatedAt').reverse().toArray();
}

export type NewPinInput = Omit<PinRecord, 'id' | 'orderIndex' | 'createdAt'>;

export async function addPin(input: NewPinInput): Promise<PinRecord> {
  const existing = await db.pins.where('sessionId').equals(input.sessionId).toArray();
  const maxOrder = existing.reduce((max, p) => Math.max(max, p.orderIndex), 0);
  const now = Date.now();

  const record: PinRecord = {
    ...input,
    id: createId(),
    orderIndex: maxOrder + 1,
    createdAt: now,
  };

  await db.transaction('rw', db.pins, db.sessions, async () => {
    await db.pins.put(record);
    await db.sessions.update(input.sessionId, { updatedAt: now });
  });

  notifyDbChanged('pins', input.sessionId);
  return record;
}

export async function updatePin(
  id: string,
  patch: Partial<Omit<PinRecord, 'id' | 'sessionId'>>,
): Promise<void> {
  const pin = await db.pins.get(id);
  if (!pin) return;
  await db.pins.update(id, patch);
  await db.sessions.update(pin.sessionId, { updatedAt: Date.now() });
  notifyDbChanged('pins', pin.sessionId);
}

export async function deletePin(id: string): Promise<void> {
  const pin = await db.pins.get(id);
  if (!pin) return;
  await db.transaction('rw', db.pins, db.sessions, async () => {
    await db.pins.delete(id);
    const remaining = await db.pins.where('sessionId').equals(pin.sessionId).sortBy('orderIndex');
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i]!;
      if (item.orderIndex !== i + 1) {
        await db.pins.update(item.id, { orderIndex: i + 1 });
      }
    }
    await db.sessions.update(pin.sessionId, { updatedAt: Date.now() });
  });
  notifyDbChanged('pins', pin.sessionId);
}

export async function listPinsBySession(sessionId: string): Promise<PinRecord[]> {
  return db.pins.where('sessionId').equals(sessionId).sortBy('orderIndex');
}

export function normalizeRefAlias(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/^@ref:?/i, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'ui-sample';
}

export type NewReferenceInput = Omit<ReferenceDNA, 'id' | 'alias' | 'createdAt'> & {
  alias: string;
};

export async function saveReference(input: NewReferenceInput): Promise<ReferenceDNA> {
  const baseAlias = normalizeRefAlias(input.alias);
  let candidate = baseAlias;
  let suffix = 2;

  while (await db.references.where('alias').equals(candidate).first()) {
    candidate = `${baseAlias}-${suffix}`;
    suffix++;
  }

  const record: ReferenceDNA = {
    ...input,
    id: createId(),
    alias: candidate,
    createdAt: Date.now(),
  };

  await db.references.put(record);
  notifyDbChanged('references');
  return record;
}

export async function renameReference(id: string, newAlias: string): Promise<string> {
  const base = normalizeRefAlias(newAlias);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const conflict = await db.references.where('alias').equals(candidate).first();
    if (!conflict || conflict.id === id) break;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  await db.references.update(id, { alias: candidate });
  notifyDbChanged('references');
  return candidate;
}

export async function deleteReference(id: string): Promise<void> {
  await db.references.delete(id);
  notifyDbChanged('references');
}

export async function listReferences(): Promise<ReferenceDNA[]> {
  return db.references.orderBy('createdAt').reverse().toArray();
}
