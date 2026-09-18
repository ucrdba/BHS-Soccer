import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // Component tests cannot compile without this: a .vue import reaches Vitest
  // as raw SFC source otherwise.
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    // Clears the remembered sorts between tests; see the file.
    setupFiles: ['src/test-setup.ts'],
    css: true,
  },
});
