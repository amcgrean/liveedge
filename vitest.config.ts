import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
  resolve: {
    // Mirror tsconfig.json paths. Order matters: longer-prefix aliases must
    // come first so `@/db/...` doesn't get rewritten by the `@/` rule.
    alias: [
      { find: /^@\/db\/(.*)$/, replacement: path.resolve(__dirname, 'db') + '/$1' },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'src') + '/$1' },
    ],
  },
});
