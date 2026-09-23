import {defineConfig} from 'vite';
export default defineConfig({base:process.env.DEPLOY_BASE || '/',server:{watch:{ignored:['**/source-reference/**','**/design-reference/**','**/work/**','**/qa/**']}},build:{rollupOptions:{output:{manualChunks(id){if(id.includes('node_modules/three/examples'))return 'three-effects';if(id.includes('node_modules/three'))return 'three-core'}}}}});
