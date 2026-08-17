import { defineConfig } from 'vite'

// MV3 content scripts cannot use ES `import` at all. Built separately from
// vite.config.ts so Rollup inlines shared modules (constants.ts) instead of
// splitting them into a chunk this classic script couldn't import.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { pageToast: 'src/pageToast.ts' },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
      },
    },
  },
})
