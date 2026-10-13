import {defineConfig} from 'vite';
export default defineConfig({base:'./',optimizeDeps:{entries:['index.html']},server:{watch:{ignored:['**/.test-data/**','**/过程文件/**']}},build:{outDir:'dist/renderer',emptyOutDir:false}});
