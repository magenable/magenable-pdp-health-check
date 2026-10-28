import { readFileSync, readdirSync, statSync } from 'node:fs';
const manifest=JSON.parse(readFileSync('manifest.json','utf8'));
const expected=['activeTab','scripting','sidePanel','storage'];
if(JSON.stringify([...manifest.permissions].sort())!==JSON.stringify(expected.sort()))throw Error('Unexpected permissions');
for(const p of ['host_permissions','optional_host_permissions','content_scripts','externally_connectable'])if(p in manifest)throw Error(`Forbidden manifest property ${p}`);
function walk(p){return readdirSync(p).flatMap(f=>statSync(`${p}/${f}`).isDirectory()?walk(`${p}/${f}`):[`${p}/${f}`]);}
for(const p of walk('src'))if(/\.(ts|html)$/.test(p)){
 const text=readFileSync(p,'utf8');
 if(/\beval\s*\(|new\s+Function\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|\bfetch\s*\(|XMLHttpRequest|https?:\/\/[^\s"']+\.js/.test(text))throw Error(`Unsafe runtime pattern: ${p}`);
}
console.log('PASS: manifest permission allowlist, no persistent hosts/content scripts, no unsafe sinks or runtime network APIs');
