/**
 * Standalone token holder so non-React modules (axios interceptors, the
 * sync engine, dispatch API helpers) can read the current Bearer token
 * without importing AuthContext.
 *
 * AuthContext writes here after bootstrap + after a successful login, and
 * clears on logout. Subscribers (rare — currently none) can react to
 * changes via subscribeAuthToken().
 */

let currentToken: string | null = null;

type Listener = (token: string | null) => void;
const subs = new Set<Listener>();

export function setAuthToken(token: string | null): void {
  currentToken = token;
  subs.forEach((fn) => fn(token));
}

export function getAuthToken(): string | null {
  return currentToken;
}

export function subscribeAuthToken(fn: Listener): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
