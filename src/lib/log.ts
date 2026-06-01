// Thin structured-logging wrapper. Use this instead of console.* on the
// load-bearing paths (auth, cron, ERP/Agility write-back, Hubbell ingest).
//
// Why this exists:
//   1. Structured output. One JSON line per call → grep + dashboards work.
//   2. Single Sentry integration point. Errors and warnings forward to Sentry
//      automatically when SENTRY_DSN is set; without it the wrapper is just
//      console.* with a JSON shape.
//   3. Consistent context shape. Every call accepts `{ ... }` metadata so the
//      log line carries enough context to debug without reading the call site.
//
// Pattern:
//   import { log } from '@/lib/log';
//   log.info('hubbell.upload.ok', { docId, sourceHash });
//   log.warn('agility.writeback.rc1', { soId, rc: res.ReturnCode });
//   log.error('hubbell.attach.failed', err, { docId, soId });
//
// First arg is always a short snake-cased event name — that's what you grep
// for in production. Free-form prose belongs in the `message` field of meta.

import * as Sentry from '@sentry/nextjs';

type Meta = Record<string, unknown>;
type Level = 'debug' | 'info' | 'warn' | 'error';

function serializeError(err: unknown): Meta {
  if (err instanceof Error) {
    return {
      err_name: err.name,
      err_message: err.message,
      err_stack: err.stack,
      // Surface common cause/code fields that subclasses (AgilityApiError,
      // AggregateError, etc.) attach without forcing every caller to spread.
      ...(typeof (err as { code?: unknown }).code !== 'undefined' && {
        err_code: (err as { code?: unknown }).code,
      }),
      ...(typeof (err as { cause?: unknown }).cause !== 'undefined' && {
        err_cause: String((err as { cause?: unknown }).cause),
      }),
    };
  }
  return { err_message: String(err) };
}

function emit(level: Level, event: string, payload: Meta): void {
  const line = {
    level,
    event,
    ts: new Date().toISOString(),
    ...payload,
  };
  const text = JSON.stringify(line);
  // Choose the matching console method so Vercel preserves log severity in
  // its UI; falls back to console.log for `debug` since the default Node
  // log level filters debug entirely.
  switch (level) {
    case 'error':
      console.error(text);
      break;
    case 'warn':
      console.warn(text);
      break;
    case 'info':
      console.info(text);
      break;
    case 'debug':
      // eslint-disable-next-line no-console
      console.log(text);
      break;
  }
}

export const log = {
  debug(event: string, meta: Meta = {}): void {
    emit('debug', event, meta);
  },

  info(event: string, meta: Meta = {}): void {
    emit('info', event, meta);
  },

  warn(event: string, meta: Meta = {}): void {
    emit('warn', event, meta);
    Sentry.captureMessage(event, {
      level: 'warning',
      extra: meta,
    });
  },

  // log.error has two call shapes:
  //   log.error('event.name', err)
  //   log.error('event.name', err, { ...meta })
  // Both forward to Sentry as an exception with the meta attached as extras.
  // Passing a non-Error first error arg is allowed — it'll be wrapped.
  error(event: string, err: unknown, meta: Meta = {}): void {
    const errInfo = serializeError(err);
    emit('error', event, { ...errInfo, ...meta });
    if (err instanceof Error) {
      Sentry.captureException(err, {
        tags: { event },
        extra: meta,
      });
    } else {
      Sentry.captureMessage(event, {
        level: 'error',
        extra: { ...errInfo, ...meta },
      });
    }
  },
};
