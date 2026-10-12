import {defineConfig} from 'vite';
export default defineConfig({base:'./',optimizeDeps:{entries:['index.html']},server:{watch:{ignored:['**/.test-data/**']}},build:{outDir:'dist/renderer',emptyOutDir:false}});
