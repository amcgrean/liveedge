import client, { IS_DEV_MODE } from './client';
import { outbox, OutboxItem, PhotoUploadState } from '@/storage/outbox';

export type JobNoteType = 'site_visit' | 'spec_meeting' | 'measure' | 'general';

export interface JobNote {
  id: string;
  author_user_id?: string;
  author_name?: string | null;
  branch_code?: string | null;
  customer_code?: string | null;
  customer_name?: string | null;
  so_id?: string | null;
  address_label?: string | null;
  note_type: JobNoteType;
  body: string;
  fields: Record<string, unknown>;
  photo_keys: string[];
  created_at: string;
  updated_at?: string;
  photo_urls?: { key: string; url: string }[];
}

export interface JobNoteInput {
  customer_code?: string | null;
  customer_name?: string | null;
  so_id?: string | null;
  address_label?: string | null;
  note_type: JobNoteType;
  body: string;
  fields?: Record<string, unknown>;
  photo_keys?: string[];
}

interface PresignResponse { url: string; key: string; expiresIn: number }

export function inferContentType(uri: string): { contentType: string; ext: string } {
  const lower = uri.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return { contentType: 'image/png', ext: 'png' };
  if (lower.endsWith('.heic')) return { contentType: 'image/heic', ext: 'heic' };
  if (lower.endsWith('.webp')) return { contentType: 'image/webp', ext: 'webp' };
  return { contentType: 'image/jpeg', ext: 'jpg' };
}

async function uploadOnePhoto(localUri: string, noteId?: string): Promise<string> {
  const { contentType, ext } = inferContentType(localUri);
  const fileName = localUri.split('/').pop() || `photo.${ext}`;
  const presign = await client.post<PresignResponse>('/api/sales/mobile/job-notes/photo-upload-url', {
    noteId, fileName, contentType, ext,
  });
  const { url, key } = presign.data;
  if (!url || !key) throw new Error('Presign response missing url/key');
  const fileRes = await fetch(localUri);
  if (!fileRes.ok) throw new Error(`Failed to read local photo: ${fileRes.status}`);
  const blob = await fileRes.blob();
  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
  if (!put.ok) throw new Error(`Photo PUT ${put.status}: ${(await put.text().catch(() => '')).slice(0, 120)}`);
  return key;
}

export const jobNotesApi = {
  async list(params: { customer?: string; so?: string; mine?: boolean; limit?: number } = {}): Promise<JobNote[]> {
    const { data } = await client.get<{ notes: JobNote[] }>('/api/sales/mobile/job-notes', {
      params: { customer: params.customer, so: params.so, mine: params.mine ? '1' : undefined, limit: params.limit },
    });
    return data.notes;
  },

  async get(id: string): Promise<JobNote> {
    const { data } = await client.get<{ note: JobNote }>(`/api/sales/mobile/job-notes/${encodeURIComponent(id)}`);
    return data.note;
  },

  async photos(id: string): Promise<{ key: string; url: string }[]> {
    const { data } = await client.get<{ photos: { key: string; url: string }[] }>(`/api/sales/mobile/job-notes/${encodeURIComponent(id)}/photos`);
    return data.photos;
  },

  async create(input: JobNoteInput): Promise<JobNote> {
    const { data } = await client.post<{ note: JobNote }>('/api/sales/mobile/job-notes', input);
    return data.note;
  },

  async patch(id: string, input: Partial<JobNoteInput>): Promise<JobNote> {
    const { data } = await client.patch<{ note: JobNote }>(`/api/sales/mobile/job-notes/${encodeURIComponent(id)}`, input);
    return data.note;
  },

  async enqueueCreate(input: JobNoteInput, photoUris: string[]): Promise<OutboxItem> {
    return outbox.enqueue({ type: 'job_note_create', note: input, photoUris });
  },
};

export async function syncJobNoteCreate(item: OutboxItem): Promise<{ note: JobNote; photoKeys: string[] }> {
  if (IS_DEV_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { note: { id: item.id, note_type: item.note?.note_type ?? 'general', body: item.note?.body ?? '', fields: item.note?.fields ?? {}, photo_keys: [], created_at: new Date().toISOString() }, photoKeys: [] };
  }
  if (!item.note) throw new Error('Missing queued note body');
  const uploads: PhotoUploadState[] = item.photoUploads ?? item.photoUris.map((uri) => ({ uri, uploaded: false }));
  const noteBucket = item.id;
  for (let i = 0; i < uploads.length; i++) {
    const u = uploads[i];
    if (u.uploaded && u.remoteKey) continue;
    const key = await uploadOnePhoto(u.uri, noteBucket);
    uploads[i] = { uri: u.uri, remoteKey: key, uploaded: true };
    await outbox.update(item.id, { photoUploads: [...uploads] });
  }
  const photoKeys = uploads.map((u) => u.remoteKey).filter((k): k is string => Boolean(k));
  const note = await jobNotesApi.create({ ...item.note, photo_keys: photoKeys });
  return { note, photoKeys };
}
