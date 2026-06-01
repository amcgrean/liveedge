import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We mock @sentry/nextjs at the module level so the logger never tries to
// actually open a Sentry transport. The mock records calls so we can assert
// log.warn/error forward to captureMessage / captureException.
const captureException = vi.fn();
const captureMessage = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

import { log } from './log';

let infoSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  captureException.mockClear();
  captureMessage.mockClear();
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  infoSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

function parseLine(s: unknown): Record<string, unknown> {
  return JSON.parse(String(s));
}

describe('log.info', () => {
  it('emits a single-line JSON object on console.info', () => {
    log.info('hubbell.upload.ok', { docId: 'abc', count: 3 });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const line = parseLine(infoSpy.mock.calls[0][0]);
    expect(line.level).toBe('info');
    expect(line.event).toBe('hubbell.upload.ok');
    expect(line.docId).toBe('abc');
    expect(line.count).toBe(3);
    expect(typeof line.ts).toBe('string');
  });

  it('does NOT forward info events to Sentry', () => {
    log.info('any.event', { x: 1 });
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('handles a call with no meta arg', () => {
    expect(() => log.info('boot')).not.toThrow();
    const line = parseLine(infoSpy.mock.calls[0][0]);
    expect(line.event).toBe('boot');
  });
});

describe('log.warn', () => {
  it('emits a JSON line AND forwards to Sentry captureMessage with level warning', () => {
    log.warn('agility.rc1', { soId: 99 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe('agility.rc1');
    expect(captureMessage.mock.calls[0][1]).toMatchObject({
      level: 'warning',
      extra: { soId: 99 },
    });
  });
});

describe('log.error', () => {
  it('serializes an Error and forwards to Sentry captureException', () => {
    const e = new Error('boom');
    log.error('hubbell.attach.failed', e, { docId: 'abc' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = parseLine(errorSpy.mock.calls[0][0]);
    expect(line.event).toBe('hubbell.attach.failed');
    expect(line.err_name).toBe('Error');
    expect(line.err_message).toBe('boom');
    expect(line.err_stack).toContain('Error');
    expect(line.docId).toBe('abc');

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0]).toBe(e);
    expect(captureException.mock.calls[0][1]).toMatchObject({
      tags: { event: 'hubbell.attach.failed' },
      extra: { docId: 'abc' },
    });
  });

  it('surfaces a subclass code field automatically', () => {
    class CustomErr extends Error {
      code = 'X42';
    }
    log.error('custom', new CustomErr('nope'));
    const line = parseLine(errorSpy.mock.calls[0][0]);
    expect(line.err_code).toBe('X42');
  });

  it('non-Error first arg is captured as a message, not an exception', () => {
    log.error('weird.thing', 'string-not-error');
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe('weird.thing');
    expect(captureMessage.mock.calls[0][1]).toMatchObject({ level: 'error' });
  });

  it('error meta merges with serialized error (meta overrides on key collision)', () => {
    log.error('e', new Error('first'), { err_message: 'overridden' });
    const line = parseLine(errorSpy.mock.calls[0][0]);
    expect(line.err_message).toBe('overridden');
  });
});

describe('log.debug', () => {
  it('uses console.log so the line is preserved when info level is filtered', () => {
    log.debug('trace', { step: 1 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = parseLine(logSpy.mock.calls[0][0]);
    expect(line.level).toBe('debug');
    expect(line.step).toBe(1);
  });
});
