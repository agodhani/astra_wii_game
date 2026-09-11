import {HOLES,distance} from './courses.js';
export function createRound(profiles,holeIds=HOLES.map(h=>h.id),practice=false){
  if(profiles.length<1||profiles.length>4||!holeIds.length||holeIds.some(id=>!HOLES[id]))throw new Error('Choose 1–4 players and a valid course.');
  return {version:1,holeIds:[...holeIds],holeIndex:0,activePlayer:0,phase:'playing',practice,practiceShots:0,
    players:profiles.map(p=>({profile:structuredClone(p),ball:{...HOLES[holeIds[0]].tee},strokes:0,holed:false,scores:[]}))};
}
export function applyShot(round,result){
  if(round.phase!=='playing')throw new Error('This hole is complete.');
  const next=structuredClone(round),hole=HOLES[next.holeIds[next.holeIndex]],p=next.players[next.activePlayer];
  if(next.practice){next.practiceShots++;p.ball={...hole.tee};return next;}
  p.strokes=Math.min(12,p.strokes+1+(result.penalty||0));p.ball={...result.end};p.holed=!!result.holed||p.strokes>=12;
  if(p.holed)p.scores[next.holeIndex]=p.strokes;
  const unfinished=next.players.map((v,i)=>({v,i})).filter(({v})=>!v.holed);
  if(!unfinished.length)next.phase='hole-complete';
  else next.activePlayer=unfinished.sort((a,b)=>distance(b.v.ball,hole.pin)-distance(a.v.ball,hole.pin)||((a.i-next.activePlayer+next.players.length)%next.players.length||next.players.length)-((b.i-next.activePlayer+next.players.length)%next.players.length||next.players.length))[0].i;
  return next;
}
export function nextHole(round){
  if(round.phase!=='hole-complete')throw new Error('Finish the current hole first.');
  const r=structuredClone(round);
  if(r.holeIndex===r.holeIds.length-1){r.phase='results';return r;}
  r.holeIndex++;r.phase='playing';r.activePlayer=0;
  for(const p of r.players){p.ball={...HOLES[r.holeIds[r.holeIndex]].tee};p.strokes=0;p.holed=false;}
  return r;
}
export const totalScore=p=>p.scores.reduce((a,b)=>a+(b||0),0);
export function scoreLabel(strokes,par){const delta=strokes-par;return delta<=-3?'Albatross':delta===-2?'Eagle':delta===-1?'Birdie':delta===0?'Par':delta===1?'Bogey':delta===2?'Double bogey':`${strokes} strokes`;}
