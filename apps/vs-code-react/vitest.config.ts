import { defineProject } from 'vitest/config';
import packageJson from './package.json';

export default defineProject({
  plugins: [],
  resolve: {},
  test: {
    name: packageJson.name,
    environment: 'jsdom',
    setupFiles: ['test-setup.ts'],
    coverage: { enabled: true, provider: 'istanbul', include: ['src/app/**/*'], reporter: ['html', 'cobertura'] },
    restoreMocks: true,
    alias: [
      {
        find: /^monaco-editor$/,
        replacement: `${__dirname}/node_modules/monaco-editor/esm/vs/editor/editor.api`,
      },
    ],
  },
});
