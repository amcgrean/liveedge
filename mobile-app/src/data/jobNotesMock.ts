import { IS_DEV_MODE } from '@/api/client';
import { JobNote, JobNoteInput, jobNotesApi } from '@/api/jobNotes';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const MOCK_JOB_NOTES: JobNote[] = [
  { id: 'mock-note-1', customer_code: 'C-10428', customer_name: 'Holstead Construction', so_id: '102-44947', address_label: 'Lot 14 Hickory Ln', note_type: 'site_visit', body: 'Walked trim package. Customer wants painted 1x6 base and cased openings throughout main floor.', fields: {}, photo_keys: [], created_at: new Date(Date.now() - 3600_000).toISOString(), author_name: 'Riley V.' },
  { id: 'mock-note-2', customer_code: 'C-10387', customer_name: 'Hawkeye Framing Co.', note_type: 'measure', body: 'Pre-quote measure: basement stair skirt needs field verify before order.', fields: {}, photo_keys: [], created_at: new Date(Date.now() - 86_400_000).toISOString(), author_name: 'Riley V.' },
];

function filterNotes(notes: JobNote[], params: { customer?: string; so?: string }) {
  return notes.filter((n) => (!params.customer || n.customer_code === params.customer) && (!params.so || n.so_id === params.so));
}

export async function fetchJobNotes(params: { customer?: string; so?: string; mine?: boolean; limit?: number } = {}): Promise<JobNote[]> {
  if (!IS_DEV_MODE) return jobNotesApi.list(params);
  await wait(180);
  return filterNotes(MOCK_JOB_NOTES, params).slice(0, params.limit ?? 50);
}

export async function fetchJobNote(id: string): Promise<JobNote | undefined> {
  if (!IS_DEV_MODE) return jobNotesApi.get(id);
  await wait(120);
  return MOCK_JOB_NOTES.find((n) => n.id === id);
}

export async function queueJobNote(input: JobNoteInput, photoUris: string[]) {
  return jobNotesApi.enqueueCreate(input, photoUris);
}
