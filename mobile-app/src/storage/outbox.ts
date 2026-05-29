import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OutboxItemStatus = 'queued' | 'retrying' | 'failed' | 'synced';

export interface OutboxItem {
  id: string;
  soNumber: string;
  type: 'deliver' | 'skip';
  notes: string;
  photoUris: string[];
  createdAt: number;
  status: OutboxItemStatus;
  attempts: number;
  lastError?: string;
  nextRetryAt?: number;
  syncedAt?: number;
}

const KEY = 'liveedge.outbox.v1';

type Listener = () => void;
const subs = new Set<Listener>();
let cache: OutboxItem[] = [];
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  loaded = true;
}

async function persist(): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  subs.forEach((fn) => fn());
}

export const outbox = {
  async init(): Promise<void> {
    await load();
  },

  async all(): Promise<OutboxItem[]> {
    await load();
    return [...cache].sort((a, b) => b.createdAt - a.createdAt);
  },

  async enqueue(item: Omit<OutboxItem, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<OutboxItem> {
    await load();
    const newItem: OutboxItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      status: 'queued',
      attempts: 0,
    };
    cache = [newItem, ...cache];
    await persist();
    return newItem;
  },

  async update(id: string, patch: Partial<OutboxItem>): Promise<void> {
    await load();
    cache = cache.map((it) => (it.id === id ? { ...it, ...patch } : it));
    await persist();
  },

  async remove(id: string): Promise<void> {
    await load();
    cache = cache.filter((it) => it.id !== id);
    await persist();
  },

  pending(): OutboxItem[] {
    return cache.filter((it) => it.status !== 'synced');
  },

  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

export function useOutbox(): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const all = await outbox.all();
      if (alive) setItems(all);
    };
    refresh();
    const unsub = outbox.subscribe(refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return items;
}
