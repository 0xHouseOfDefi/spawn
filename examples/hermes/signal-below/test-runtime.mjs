// Executes the exact bundled JavaScript against a small DOM/canvas test port.
// This checks compiled event handling, not browser rendering or accessibility.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
const html=process.argv[2]==='--stdin'?readFileSync(0,'utf8'):JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('./bundle.mjs',import.meta.url))],{encoding:'utf8'})).html;
const art=JSON.parse(readFileSync(process.argv[3]??new URL('./fixture-art.json',import.meta.url),'utf8'));
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,1,'one complete inline runtime');
assert.match(html,/aria-label="Dungeon board"/);
for(const action of ['left','up','down','right'])assert.match(html,new RegExp('aria-label="Move '+action+'"'));
let now=0,frame,paintCalls=0,focused=false;
const context2d={fillRect(){paintCalls++;},strokeRect(){paintCalls++;},clearRect(){paintCalls++;}};
const canvas={width:608,height:416,getContext:()=>context2d,focus:()=>focused=true};
const status={textContent:''},inventory={textContent:''},start={textContent:'Start'};
const buttons=['left','up','down','right'].map(move=>({dataset:{move}}));
const document={hidden:false,querySelector(selector){const value={'canvas':canvas,'#status':status,'#inventory':inventory,'#start':start}[selector];assert(value,'unknown DOM selector '+selector);return value;},querySelectorAll(selector){assert.equal(selector,'[data-move]');return buttons;}};
const window={SIGNAL_ART:art};
runInContext(scripts[0],createContext({document,window,performance:{now:()=>now},requestAnimationFrame:fn=>frame=fn}),{timeout:2000});
function advance(seconds){let left=seconds;while(left>1e-9){const dt=Math.min(left,.05);now+=dt*1000;frame(now);left-=dt;}}
function key(value){document.onkeydown({key:value,preventDefault(){}});document.onkeyup({key:value});advance(.18);}
const repeat=(value,n)=>{for(let i=0;i<n;i++)key(value);};
start.onclick();assert(focused,'Start focuses the playable board');assert.equal(start.textContent,'Retry');
let begun=now;
function safe(){const phase=(now-begun)/1000%4;advance((2.4-phase+4)%4||4);}
repeat('ArrowUp',4);repeat('ArrowRight',4);repeat('ArrowDown',8);repeat('ArrowRight',4);repeat('ArrowUp',8);repeat('ArrowRight',4);repeat('ArrowDown',8);repeat('ArrowRight',3);repeat('ArrowUp',4);key('ArrowRight');
assert.match(status.textContent,/Room 2\/3/);
repeat('d',2);repeat('w',4);repeat('d',4);safe();repeat('d',8);repeat('s',3);safe();repeat('s',5);repeat('d',2);repeat('w',4);key('d');
assert.match(status.textContent,/Room 3\/3/);
repeat('d',6);repeat('s',2);key('d');repeat('w',3);key('a');key('w');repeat('d',3);
assert.equal(inventory.textContent,'KEY —','powering plate still requires key collection');
key('w');repeat('d',3);assert.equal(inventory.textContent,'KEY ✓');key('d');repeat('s',3);repeat('d',3);
assert.match(status.textContent,/Signal restored!/);
const elapsed=(now-begun)/1000;begun=now;key('Enter');assert.match(status.textContent,/Room 1\/3/);assert.equal(inventory.textContent,'KEY —');
const up=buttons.find(b=>b.dataset.move==='up');up.onpointerdown();window.onpointerup();advance(.2);
const pointerRoute=[['up',3],['right',4],['down',8],['right',4],['up',8],['right',4],['down',8],['right',3],['up',4],['right',1]];
function pointer(direction,count=1){for(let i=0;i<count;i++){
  const button=buttons.find(b=>b.dataset.move===direction);
  button.onpointerdown();window.onpointerup();button.onclick();advance(.18);
}}
for(const [direction,count] of pointerRoute)pointer(direction,count);
assert.match(status.textContent,/Room 2\/3/,'pointer-only movement also completes the first room');
pointer('right',2);pointer('up',4);pointer('right',4);safe();pointer('right',8);pointer('down',3);safe();pointer('down',5);pointer('right',2);pointer('up',4);pointer('right');
assert.match(status.textContent,/Room 3\/3/,'pointer-only movement crosses both timed hazards');
pointer('right',6);pointer('down',2);pointer('right');pointer('up',3);pointer('left');pointer('up');pointer('right',3);
assert.equal(inventory.textContent,'KEY —','pointer block placement reveals but does not collect the key');
pointer('up');pointer('right',3);assert.equal(inventory.textContent,'KEY ✓');
pointer('left',2);pointer('down');assert.equal(context2d.strokeStyle,'#b18c55','the plate is no longer powered');
assert.equal(inventory.textContent,'KEY ✓','pointer play retains the collected key after releasing the plate');
pointer('right',3);pointer('down',2);pointer('right',3);assert.match(status.textContent,/Signal restored!/,'pointer-only play reaches victory');
start.onclick();assert.match(status.textContent,/Room 1\/3/);assert.equal(inventory.textContent,'KEY —','the Retry button clears the won pointer game');
assert(paintCalls>0,'compiled renderer used the canvas test port');

// A valid transparent floor must not retain the previous hero pixel. This small
// raster probe models only transparent/opaque fills; it is not browser rendering.
const transparentArt={schema_version:'spawn.pixel-grid.v1',palette:['#00000000','#ffffffff'],frames:
  ['floor','wall','hero','block','key','spike','exit'].map(id=>({id,kind:id==='hero'?'sprite':'tile',width:1,height:1,pixels:[id==='floor'||id==='wall'?0:1]}))};
const point={x:2*32+16,y:6*32+16};let pixel=null;
const covers=(x,y,w,h)=>point.x>=x&&point.x<x+w&&point.y>=y&&point.y<y+h;
const raster={fillRect(x,y,w,h){if(covers(x,y,w,h)&&this.fillStyle.slice(-2)!=='00')pixel=this.fillStyle;},strokeRect(){},clearRect(x,y,w,h){if(covers(x,y,w,h))pixel=null;}};
const alphaNodes={'canvas':{width:608,height:416,getContext:()=>raster,focus(){}},'#status':{textContent:''},'#inventory':{textContent:''},'#start':{textContent:'Start'}};
const alphaDocument={hidden:false,querySelector:selector=>alphaNodes[selector],querySelectorAll:()=>[]};
runInContext(scripts[0],createContext({document:alphaDocument,window:{SIGNAL_ART:transparentArt},performance:{now:()=>0},requestAnimationFrame(){}}),{timeout:2000});
alphaNodes['#start'].onclick();assert.equal(pixel,'#ffffffff');
alphaDocument.onkeydown({key:'ArrowUp',preventDefault(){}});alphaDocument.onkeyup({key:'ArrowUp'});
assert.equal(pixel,null,'redraw clears a departed hero over a valid transparent floor');
console.log(JSON.stringify({status:'pass',checks:['compiled runtime parses','keyboard and WASD complete route','start focus','pressure plate and key','victory','Enter retry','pointer-only full route and retry','key persists after plate release','transparent art redraw'],scripted_elapsed_seconds:Number(elapsed.toFixed(3)),rendered_browser:false}));
