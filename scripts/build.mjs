import { build } from 'esbuild';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFile(path.join(root,name),'utf8');
const write=(name,value)=>writeFile(path.join(root,name),value);
await mkdir(path.join(root,'artifacts'),{recursive:true});await mkdir(path.join(root,'public/vendor'),{recursive:true});
const license=await read('LICENSE');const manifest=JSON.parse(await read('licenses/npm/SOURCES.json'));
const notices=['Math Workshop dependency notices.\nApp code is MIT. Area puzzles are original work inspired by Naoki Inaba’s Menseki Meiro; no endorsement is implied.'];
for(const d of manifest){notices.push(`${d.package} ${d.version} (${d.license})`);for(const f of d.notices)notices.push(await read(f));}
await write('public/LICENSE.txt',license);await write('public/THIRD_PARTY_NOTICES.txt',notices.join('\n\n'));
const escape=t=>t.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const credits=`<details id="credits"><summary>Credits and licenses</summary><pre>${escape(license)}\n\n${escape(notices.join('\n\n'))}</pre></details>`;
await build({stdin:{contents:"export { createClient } from '@supabase/supabase-js'",resolveDir:root},bundle:true,format:'esm',target:['es2022'],outfile:path.join(root,'public/vendor/supabase.js'),legalComments:'inline'});
for(const game of ['target','areamaze']){
 const result=await build({entryPoints:[path.join(root,`public/${game}/${game}.js`)],bundle:true,format:'iife',target:['es2022'],external:['../vendor/supabase.js'],write:false,legalComments:'inline'});
 const script=result.outputFiles[0].text;await write(`public/${game}/app.js`,script);
 let html=await read(`public/${game}/index.html`);html=html.replace(`<script type="module" src="./${game}.js"></script>`,'<script src="./app.js" defer></script>');await write(`public/${game}/index.html`,html);
 html=html.replace('<link rel="stylesheet" href="../shared/game.css">',`<style>${await read('public/shared/game.css')}\n#credits {margin:24px;} #credits pre {white-space:pre-wrap;overflow-wrap:anywhere;}</style>`).replace('<script src="./app.js" defer></script>',`<script>${script.replaceAll('</script','<\\/script')}</script>`).replace('href="../index.html"','href="https://github.com/jessecmaddox3/math-workshop"').replace('</body>',`${credits}</body>`);
 await write(`artifacts/${game==='target'?'Target-Number':'Area-Mazes'}.html`,html);
}
console.log('Built both hosted games, offline HTML downloads and optional cloud SDK.');
