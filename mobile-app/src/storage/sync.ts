import NetInfo from '@react-native-community/netinfo';
import { markDelivered } from '@/api/dispatch';
import { outbox, OutboxItem } from '@/storage/outbox';

type SyncEvent = { type: 'synced'; item: OutboxItem } | { type: 'failed'; item: OutboxItem; error: string };
type SyncListener = (event: SyncEvent) => void;

const listeners = new Set<SyncListener>();
let running = false;
let initialized = false;
let intervalId: ReturnType<typeof setInterval> | undefined;

function backoffMs(attempts: number): number {
  const values = [1_000, 5_000, 30_000, 60_000, 300_000];
  return values[Math.min(attempts, values.length - 1)];
}

async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

function emit(event: SyncEvent): void {
  listeners.forEach((fn) => fn(event));
}

async function syncItem(item: OutboxItem, now: number): Promise<void> {
  if (item.nextRetryAt && item.nextRetryAt > now) return;
  if (item.status === 'failed' && item.attempts >= 5) return;

  await outbox.update(item.id, { status: item.attempts > 0 ? 'retrying' : 'queued' });

  try {
    await markDelivered(item.soNumber, {
      type: item.type,
      notes: item.notes,
      photoUris: item.photoUris,
      timestamp: new Date().toISOString(),
    });
    const synced = { ...item, status: 'synced' as const, syncedAt: Date.now(), lastError: undefined, nextRetryAt: undefined };
    await outbox.update(item.id, synced);
    emit({ type: 'synced', item: synced });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    const attempts = item.attempts + 1;
    const failed = attempts >= 5;
    const patch = {
      status: failed ? ('failed' as const) : ('retrying' as const),
      attempts,
      lastError: message,
      nextRetryAt: failed ? undefined : Date.now() + backoffMs(attempts),
    };
    const nextItem = { ...item, ...patch };
    await outbox.update(item.id, patch);
    emit({ type: 'failed', item: nextItem, error: message });
  }
}

export async function syncNow(): Promise<void> {
  if (running) return;
  if (!(await isOnline())) return;

  running = true;
  try {
    const now = Date.now();
    const items = (await outbox.all())
      .filter((item) => item.status !== 'synced')
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const item of items) {
      await syncItem(item, now);
    }
  } finally {
    running = false;
  }
}

export function initSyncEngine(): () => void {
  if (initialized) return () => {};
  initialized = true;

  let wasOnline = true;
  const unsubNetInfo = NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (!wasOnline && online) {
      syncNow();
    }
    wasOnline = online;
  });

  const unsubOutbox = outbox.subscribe(() => {
    syncNow();
  });

  intervalId = setInterval(() => {
    syncNow();
  }, 30_000);

  syncNow();

  return () => {
    unsubNetInfo();
    unsubOutbox();
    if (intervalId) clearInterval(intervalId);
    initialized = false;
  };
}

export function subscribeSyncEvents(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
