// Build the exact standalone executable reviewed by the QA child.
// esbuild is pinned in this folder's own lockfile; no browser libraries or network.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {deepStrictEqual} from 'node:assert';
import {runInNewContext} from 'node:vm';
import {maps,W,H} from './layout.mjs';
const require=createRequire(new URL('./package.json',import.meta.url));
const {build,version}=require('esbuild');
// Every immutable cell is preserved; only the room-construction algorithm is
// replaced by a compact data table. Verify the exact emitted expression before
// bundling it, rather than treating a successful walking route as map equality.
if(W>31)throw Error('row masks require at most 31 columns');
const masks=[...new Set(maps.flatMap(room=>room.map(row=>row.reduce((mask,tile,x)=>mask|(tile==='.'?1<<x:0),0))))];
if(masks.length>36)throw Error('row mask dictionary exceeds one base36 digit');
const rows=maps.map(room=>room.map(row=>masks.indexOf(row.reduce((mask,tile,x)=>mask|(tile==='.'?1<<x:0),0)).toString(36)).join(''));
const expression=`${JSON.stringify(rows)}.map(row=>[...row].map(code=>Array.from({length:${W}},(_,x)=>(${JSON.stringify(masks)}[parseInt(code,36)]&(1<<x))?'.':'#')))`;
deepStrictEqual(JSON.parse(JSON.stringify(runInNewContext(expression,{}, {timeout:1000}))),maps);
const layoutPath=fileURLToPath(new URL('./layout.mjs',import.meta.url));
const result=await build({entryPoints:[fileURLToPath(new URL('./play.mjs',import.meta.url))],
  bundle:true,minify:true,target:'es2022',charset:'utf8',write:false,format:'iife',legalComments:'none',
  plugins:[{name:'immutable-room-layout',setup(builder){builder.onLoad({filter:/layout\.mjs$/},args=>args.path===layoutPath?{contents:`export const W=${W},H=${H},maps=${expression};`,loader:'js'}:undefined);}}],
  // These seven fields belong only to our private simulation state. Art and DOM
  // properties are deliberately excluded. The delivered bundle has no public API.
  mangleProps:/^(phase|room|block|time|moveAt|message|hasKey)$/});
const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const template=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const marker='<script type="module" src="play.mjs"></script>';
if(!template.includes(marker))throw Error('runtime entry marker missing');
const shell=template.replace(marker,'<!--runtime-->').replace(/="([A-Za-z0-9_-]+)"/g,'=$1');
const html=shell.replace('<!--runtime-->','<script>'+script+'</script>');
process.stdout.write(JSON.stringify({html,builder:'esbuild@'+version,layout_cells_verified:maps.length*W*H}));
