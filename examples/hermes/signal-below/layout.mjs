// Readable room authoring. The bundle precomputes these immutable floor cells.
const W=19,H=13;
function room(path,areas=[]) {
  const grid=Array.from({length:H},()=>Array(W).fill('#'));
  for(const [x1,y1,x2,y2] of areas)for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)grid[y][x]='.';
  for(let i=1;i<path.length;i++){let [x,y]=path[i-1];const [tx,ty]=path[i];grid[y][x]='.';while(x!==tx||y!==ty){x+=Math.sign(tx-x);y+=Math.sign(ty-y);grid[y][x]='.';}}
  return grid;
}
const maps=[
  room([[2,6],[2,2],[6,2],[6,10],[10,10],[10,2],[14,2],[14,10],[17,10],[17,6],[18,6]]),
  room([[0,6],[3,6],[3,2],[15,2],[15,10],[17,10],[17,6],[18,6]]),
  room([[0,6],[3,6]],[[3,2,14,10],[15,6,17,6]])
];
maps[2][5][9]='#';maps[2][5][10]='#';
export {maps,W,H};
