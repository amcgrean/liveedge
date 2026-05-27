// Shared validation for the dispatch-alerts admin routes.
// Lives outside `route.ts` because Next.js 15 forbids non-handler exports
// from route files.

export interface RecipientPayload {
  branchCode:  string;
  name:        string;
  email:       string | null;
  phoneE164:   string | null;
  notifyEmail: boolean;
  notifySms:   boolean;
  isActive:    boolean;
}

export function validateRecipient(
  body: Record<string, unknown>,
): { ok: true; value: RecipientPayload } | { ok: false; error: string } {
  const branchCode = typeof body.branchCode === 'string' ? body.branchCode.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!branchCode) return { ok: false, error: 'branchCode is required' };
  if (!name) return { ok: false, error: 'name is required' };

  const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
  const phoneRaw = typeof body.phoneE164 === 'string' ? body.phoneE164.trim() : '';

  const notifyEmail = body.notifyEmail !== false;
  const notifySms   = body.notifySms === true;

  if (!notifyEmail && !notifySms) {
    return { ok: false, error: 'At least one channel (email or SMS) must be enabled' };
  }

  if (notifyEmail) {
    if (!emailRaw) return { ok: false, error: 'Email address is required when email channel is enabled' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw)) {
      return { ok: false, error: 'Email address looks invalid' };
    }
  }
  if (notifySms) {
    if (!phoneRaw) return { ok: false, error: 'Phone number is required when SMS channel is enabled' };
    if (!/^\+[1-9]\d{6,14}$/.test(phoneRaw)) {
      return { ok: false, error: 'Phone must be E.164 format (e.g. +15155550123)' };
    }
  }

  return {
    ok: true,
    value: {
      branchCode,
      name,
      email:     notifyEmail ? emailRaw : (emailRaw || null),
      phoneE164: notifySms   ? phoneRaw : (phoneRaw || null),
      notifyEmail,
      notifySms,
      isActive:  body.isActive !== false,
    },
  };
}
