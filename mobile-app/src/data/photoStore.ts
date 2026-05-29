import { useEffect, useState } from 'react';
import { MOCK_STOPS } from '@/data/mockRoute';
import { deletePhoto, listSavedPhotos, savePhotoForStop } from '@/storage/photoFS';

type Listener = () => void;
const subs = new Set<Listener>();
const photosBySo: Record<string, string[]> = {};
const hydrated = new Set<string>();
let initPromise: Promise<void> | undefined;

function notify() {
  subs.forEach((fn) => fn());
}

async function hydrateStop(so: string): Promise<void> {
  if (hydrated.has(so)) return;
  photosBySo[so] = await listSavedPhotos(so);
  hydrated.add(so);
  notify();
}

export const photoStore = {
  async init(): Promise<void> {
    if (!initPromise) {
      initPromise = Promise.all(MOCK_STOPS.map((stop) => hydrateStop(stop.so))).then(() => undefined);
    }
    await initPromise;
  },
  async hydrate(so: string): Promise<void> {
    await hydrateStop(so);
  },
  get(so: string): string[] {
    return photosBySo[so] || [];
  },
  async add(so: string, uri: string): Promise<string> {
    await hydrateStop(so);
    const savedUri = await savePhotoForStop(so, uri);
    photosBySo[so] = [...(photosBySo[so] || []), savedUri];
    notify();
    return savedUri;
  },
  async remove(so: string, idx: number): Promise<void> {
    await hydrateStop(so);
    const uri = photosBySo[so]?.[idx];
    if (uri) await deletePhoto(uri);
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
  useEffect(() => {
    photoStore.hydrate(so);
    return photoStore.subscribe(() => force((n) => n + 1));
  }, [so]);
  return photoStore.get(so);
}
