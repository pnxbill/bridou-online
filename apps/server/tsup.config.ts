import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // Workspace packages export raw .ts — bundle them in so `node dist/main.js` works.
  noExternal: ['@bridou/engine', '@bridou/shared'],
})
