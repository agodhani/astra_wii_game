import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const target=new URL('public/mediapipe/wasm/',root);
await mkdir(target,{recursive:true});
for(const base of ['vision_wasm_internal','vision_wasm_nosimd_internal']){
 for(const extension of ['js','wasm'])await copyFile(new URL(`node_modules/@mediapipe/tasks-vision/wasm/${base}.${extension}`,root),new URL(`${base}.${extension}`,target));
 const source=await readFile(new URL(`${base}.js`,target),'utf8');
 // The upstream classic script's fallback logger relies on sloppy-mode block
 // function hoisting. Supply its supported logger so the unchanged vendor code
 // can also execute safely under ES-module strict semantics.
 await writeFile(new URL(`${base}.mjs`,target),`const dbg = (...args) => console.warn(...args);\n${source}\nexport default ModuleFactory;\n`);
}
console.log(`Local MediaPipe assets prepared in ${fileURLToPath(target)}`);
