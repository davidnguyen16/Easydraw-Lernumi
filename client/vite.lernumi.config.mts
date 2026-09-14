import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Build of the editor that runs as a Lernumi tool.
 *
 * Why a second bundler next to Next.js: Lernumi serves every uploaded tool
 * version from its own sub-path on an isolated origin
 * (`/tools/easydraw/<versionId>/…`), which is unknown until upload. Next's static
 * export hard-codes `/_next/...` and page routes; Vite with `base: './'` emits
 * relative URLs and a single `index.html`, which is exactly what the package
 * contract needs. `src/lib/**` (the editor) is shared unchanged — the only Next
 * touch-points there, `next/link` and `next/navigation`, are aliased to shims.
 */
const clientRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(clientRoot, 'lernumi'),
  base: './',
  publicDir: path.join(clientRoot, 'public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(clientRoot, 'src'),
      'next/link': path.join(clientRoot, 'lernumi/src/shims/next-link.tsx'),
      'next/navigation': path.join(clientRoot, 'lernumi/src/shims/next-navigation.ts'),
    },
  },
  build: {
    outDir: path.join(clientRoot, 'dist-lernumi'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, warn) {
        // The shared editor carries Next's "use client" markers; harmless here.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
  server: {
    port: 5174,
  },
});
