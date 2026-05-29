// Tiny in-memory photo store keyed by SO number.
// Will be replaced with persistent outbox + R2 upload in Phase 4 (sync).

import { useEffect, useState } from 'react';

type Listener = () => void;
const subs = new Set<Listener>();
const photosBySo: Record<string, string[]> = {};

function notify() {
  subs.forEach((fn) => fn());
}

export const photoStore = {
  get(so: string): string[] {
    return photosBySo[so] || [];
  },
  add(so: string, uri: string) {
    photosBySo[so] = [...(photosBySo[so] || []), uri];
    notify();
  },
  remove(so: string, idx: number) {
    photosBySo[so] = (photosBySo[so] || []).filter((_, i) => i !== idx);
    notify();
  },
  clear(so: string) {
    delete photosBySo[so];
    notify();
  },
  subscribe(fn: Listener): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

export function usePhotos(so: string): string[] {
  const [, force] = useState(0);
  useEffect(() => photoStore.subscribe(() => force((n) => n + 1)), []);
  return photoStore.get(so);
}
