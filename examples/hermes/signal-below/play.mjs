import {start,step,active,powered,maps,spikes,plate,keyAt,exit,W,H,PLAYING} from "./game.mjs";
  const $=selector=>document.querySelector(selector),canvas=$('canvas'),ctx=canvas.getContext('2d'),T=32;
  const status=$('#status'),inventory=$('#inventory');
  const art=window.SIGNAL_ART,frames=Object.fromEntries(art.frames.map(f=>[f.id,f]));
  let state=null,last=performance.now(),held=null;
  function sprite(id,x,y){const f=frames[id];x*=T;y*=T;f.pixels.forEach((v,i)=>{ctx.fillStyle=art.palette[v];ctx.fillRect(x+(i%f.width)*T/f.width,y+Math.floor(i/f.width)*T/f.height,T/f.width,T/f.height);});}
  function draw(){
    if(!state)return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)sprite(maps[state.room][y][x]==='#'?'wall':'floor',x,y);
    if(state.room===1)for(const [x,y] of spikes){sprite(active(state.time)?'spike':'floor',x,y);if(!active(state.time)){ctx.fillStyle='#c29564';ctx.fillRect(x*T+4,y*T+24,24,3);}}
    if(state.room===2){
      ctx.strokeStyle=powered(state)?'#f3d184':'#b18c55';ctx.lineWidth=3;ctx.strokeRect(plate[0]*T+4,plate[1]*T+4,24,24);
      if(powered(state)&&!state.hasKey)sprite('key',keyAt[0],keyAt[1]);
      sprite('block',state.block.x,state.block.y);sprite('exit',exit[0],exit[1]);
      if(!state.hasKey){ctx.fillStyle='#b18c55';ctx.fillRect(15*T,194,4,28);}
    }
    sprite('hero',state.x,state.y);
    const text=`Room ${state.room+1}/3 · ${state.message}`;
    if(status.textContent!==text)status.textContent=text;
    inventory.textContent=state.hasKey?'KEY ✓':'KEY —';
  }
  function act(action){if(state)state=step(state,action,0);draw();}
  function restart(){held=null;state=start();last=performance.now();$('#start').textContent='Retry';canvas.focus();draw();}
  $('#start').onclick=restart;
  for(const b of document.querySelectorAll('[data-move]')){b.onpointerdown=()=>{held=b.dataset.move;act(held);};b.onclick=()=>act(b.dataset.move);}
  const dirs={arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'};
  document.onkeydown=e=>{const k=e.key.toLowerCase();if(k==='enter'&&(!state||state.phase!==PLAYING)){e.preventDefault();restart();}else if(dirs[k]){e.preventDefault();held=dirs[k];act(held);}else if(k===' '){e.preventDefault();held=null;}};
  document.onkeyup=e=>{if(dirs[e.key.toLowerCase()]===held)held=null;};
  window.onpointerup=window.onpointercancel=window.onblur=()=>held=null;
  document.onvisibilitychange=()=>{held=null;last=performance.now();};
  function tick(now){const dt=Math.min((now-last)/1000,.1);last=now;if(state&&state.phase===PLAYING&&!document.hidden){state=step(state,'wait',dt);if(held)state=step(state,held,0);draw();}requestAnimationFrame(tick);}
  requestAnimationFrame(tick);
