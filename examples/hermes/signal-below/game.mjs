/* Pure simulation shared by the delivered browser bundle and replay. */
import {maps,W,H} from './layout.mjs';
  const MOVE_SECONDS=.17;
  const PLAYING=0,DEAD=1,WON=2;
  const spikes=[[8,2],[9,2],[10,2],[15,6],[15,7]],plate=[11,4],keyAt=[13,3],exit=[17,6];
  const names=['The conduit','Clockwork crossing','The buried signal'];
  const hints=['Follow the conduit.','Cross dim spikes.','Block to plate. Collect key.'];
  const start=()=>({phase:PLAYING,room:0,x:2,y:6,block:{x:8,y:7},hasKey:false,time:0,moveAt:0,message:hints[0]});
  const active=t=>(t%4)<2.25;
  const powered=s=>s.block.x===plate[0]&&s.block.y===plate[1];
  const hazard=(r,x,y)=>r===1&&spikes.some(p=>p[0]===x&&p[1]===y);
  function step(s,action,seconds=MOVE_SECONDS) {
    if(action==='retry')return start();
    if(s.phase!==PLAYING)return s;
    const dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],wait:[0,0]};
    const n={...s,block:{...s.block},time:s.time+seconds};
    let [dx,dy]=dirs[action];
    if(n.time+1e-9<n.moveAt){dx=0;dy=0;}
    if(dx||dy)n.moveAt=n.time+MOVE_SECONDS;
    let x=n.x+dx,y=n.y+dy,r=n.room;
    if(x===W-1&&y===6&&r<2){r++;x=1;}
    else if(x===0&&y===6&&r>0){r--;x=W-2;}
    if(x<1||x>=W-1||y<1||y>=H-1||maps[r][y][x]==='#'){x=n.x;y=n.y;r=n.room;}
    if(r===2&&x===n.block.x&&y===n.block.y&&(dx||dy)){
      const bx=x+dx,by=y+dy;
      if(bx<3||bx>14||by<2||by>10||maps[2][by][bx]==='#'){x=n.x;y=n.y;r=n.room;}
      else n.block={x:bx,y:by};
    }
    if(r===2&&x===15&&y===6&&!n.hasKey){x=n.x;y=n.y;r=n.room;n.message='Key required.';}
    if(r!==n.room)n.message=hints[r];
    n.room=r;n.x=x;n.y=y;
    if(r===2&&powered(n)&&!n.hasKey)n.message='Key: upper right.';
    if(r===2&&x===keyAt[0]&&y===keyAt[1]&&powered(n)){n.hasKey=true;n.message='Key found. Go east.';}
    if(hazard(r,x,y)&&active(n.time)){n.phase=DEAD;n.message='Spikes! Retry.';}
    if(r===2&&x===exit[0]&&y===exit[1]&&n.hasKey){n.phase=WON;n.message='Signal restored!';}
    return n;
  }
export {start,step,active,powered,hazard,maps,spikes,plate,keyAt,exit,names,W,H,MOVE_SECONDS,PLAYING,DEAD,WON};
