import { build } from 'esbuild';
import { mkdir, rm, copyFile } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true}); await mkdir('dist',{recursive:true});
await build({entryPoints:{'service-worker':'src/service-worker.ts','sidepanel':'src/sidepanel/index.ts'},outdir:'dist',bundle:true,format:'esm',target:'chrome116',sourcemap:false,legalComments:'none'});
for (const [a,b] of [['manifest.json','manifest.json'],['src/sidepanel/index.html','sidepanel.html'],['src/sidepanel/styles.css','styles.css'],['assets/magenable-logo-colour.png','magenable-logo-colour.png']]) await copyFile(a,`dist/${b}`);
for (const size of [16,32,48,128])await copyFile(`assets/icons/icon-${size}.png`,`dist/icon-${size}.png`);
console.log('Built local-only MV3 extension in dist/');
