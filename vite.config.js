import {defineConfig} from 'vite';
export default defineConfig({
 build:{rollupOptions:{output:{manualChunks:{three:['three']}}}},
 worker:{format:'es'},
});
