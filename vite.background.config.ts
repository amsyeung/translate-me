import { defineConfig } from 'vite'

// The MV3 service worker must ship as a single self-contained script (it
// would need "type": "module" in the manifest to use ES `import`, which we'd
// rather avoid). Built separately from vite.config.ts so Rollup inlines
// shared modules (bcp47.json, constants.ts) instead of splitting them into a
// chunk that only an ES module could import.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { background: 'src/background.ts' },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
      },
    },
  },
})
