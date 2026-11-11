import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [react()],
  // Shared CI runners have no GPU and no steady frame clock: tests read this to skip frame-time and
  // millisecond budgets there. Those budgets are device checks (R-01, R-04; TASKS 24 low-end pass).
  define: { __CI__: JSON.stringify(Boolean(process.env.CI)) },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.ts'],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'webkit' }, { browser: 'chromium' }] },
        },
      },
    ],
  },
});
