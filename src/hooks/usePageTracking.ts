'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Fires POST /api/track-visit on path changes, but waits 1 s and bails if
// the path changes again within the window. Rapid client-side nav (sibling
// tabs, hub-page tab switches) used to spam one upsert per intermediate
// pathname × 49 module clients; the debounce coalesces those into the
// destination only.
const DEBOUNCE_MS = 1000;

export function usePageTracking() {
  const pathname = usePathname();

  useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/track-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname }),
      }).catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pathname]);
}
