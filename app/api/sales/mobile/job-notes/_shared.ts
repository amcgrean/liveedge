import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { z } from 'zod';
import { hasCapability } from '../../../../../src/lib/access-control-shared';
import { salesJobNotes } from '../../../../../db/schema';

export const NOTE_TYPES = ['site_visit', 'spec_meeting', 'measure', 'general'] as const;

// R2 keys are confined to the job-notes object space AND to the calling user's
// own namespace. This stops a user from persisting an arbitrary R2 key (a POD
// photo, a Hubbell doc, or another user's note photo) and then reading it back
// via the /photos presign endpoint. The upload-url route mints keys shaped
// `job-notes/{userId}/{noteId}/...`; create/patch verify the prefix per-request
// (see assertOwnedPhotoKeys) since the static schema can't see the user id.
export const JOB_NOTE_KEY_PREFIX = 'job-notes/';
const jobNotePhotoKey = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((k) => k.startsWith(JOB_NOTE_KEY_PREFIX) && !k.includes('..'), {
    message: 'photo key must be within the job-notes namespace',
  });

/**
 * Per-request ownership check: every photo key must live under the caller's own
 * `job-notes/{userId}/` prefix. Returns the keys on success, or null if any key
 * is foreign (caller should 400). Legacy/admin: branch.all users are allowed to
 * keep existing keys on patch (they can already see all notes).
 */
export function assertOwnedPhotoKeys(session: Session, keys: string[] | undefined): boolean {
  if (!keys || keys.length === 0) return true;
  if (hasCapability(session, 'branch.all')) return true;
  const mine = `${JOB_NOTE_KEY_PREFIX}${String(session.user?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}/`;
  return keys.every((k) => k.startsWith(mine));
}

export const noteCreateSchema = z.object({
  customer_code: z.string().trim().max(100).optional().nullable(),
  customer_name: z.string().trim().max(255).optional().nullable(),
  so_id: z.string().trim().max(100).optional().nullable(),
  address_label: z.string().trim().max(500).optional().nullable(),
  note_type: z.enum(NOTE_TYPES).default('general'),
  body: z.string().default(''),
  fields: z.record(z.unknown()).default({}),
  photo_keys: z.array(jobNotePhotoKey).default([]),
});

export const notePatchSchema = noteCreateSchema.partial();

export type NoteCreateInput = z.infer<typeof noteCreateSchema>;
export type NotePatchInput = z.infer<typeof notePatchSchema>;

export function sessionUserId(session: Session): string {
  return String(session.user?.id ?? '');
}

export function canSeeAllBranches(session: Session): boolean {
  return hasCapability(session, 'branch.all');
}

export function branchCode(session: Session): string | null {
  return session.user?.branch ?? null;
}

export function activeScope(session: Session, extra: SQL<unknown>[] = []): SQL<unknown> | undefined {
  const clauses: SQL<unknown>[] = [isNull(salesJobNotes.deletedAt), ...extra];
  if (!canSeeAllBranches(session)) {
    const branch = branchCode(session);
    clauses.push(branch ? eq(salesJobNotes.branchCode, branch) : isNull(salesJobNotes.branchCode));
  }
  return and(...clauses);
}

export function editableScope(session: Session, id: string): SQL<unknown> | undefined {
  const clauses: SQL<unknown>[] = [eq(salesJobNotes.id, id), isNull(salesJobNotes.deletedAt)];
  if (!canSeeAllBranches(session)) {
    const branch = branchCode(session);
    clauses.push(branch ? eq(salesJobNotes.branchCode, branch) : isNull(salesJobNotes.branchCode));
    clauses.push(eq(salesJobNotes.authorUserId, sessionUserId(session)));
  }
  return and(...clauses);
}

export function listOrder() {
  return desc(salesJobNotes.createdAt);
}

export function toApiNote(row: typeof salesJobNotes.$inferSelect) {
  return {
    id: row.id,
    author_user_id: row.authorUserId,
    author_name: row.authorName,
    branch_code: row.branchCode,
    customer_code: row.customerCode,
    customer_name: row.customerName,
    so_id: row.soId,
    address_label: row.addressLabel,
    note_type: row.noteType,
    body: row.body,
    fields: row.fields ?? {},
    photo_keys: row.photoKeys ?? [],
    created_at: row.createdAt?.toISOString?.() ?? row.createdAt,
    updated_at: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    deleted_at: row.deletedAt?.toISOString?.() ?? row.deletedAt,
  };
}

export function cleanString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
