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
    css: true,
  },
});
