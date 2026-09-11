import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLES, surfaceAt } from '../src/game/courses.js';
import { CLUBS, simulateShot } from '../src/game/physics.js';
import { createRound, applyShot, nextHole } from '../src/game/round.js';
import { PRESETS } from '../src/game/profiles.js';
import { readSave, writeSave } from '../src/game/storage.js';

const hole = {id:0,name:'Test',par:4,length:400,tee:{x:0,z:0},pin:{x:0,z:400},path:[{x:0,z:0},{x:0,z:400}],width:35,greenRadius:20,bunkers:[],ponds:[],wind:{x:0,z:0},flat:true};
const longFlatHole = {...hole,length:800,pin:{x:0,z:800},path:[{x:0,z:0},{x:0,z:800}],width:80};
const shot=(extra={})=>simulateShot({hole,start:hole.tee,club:CLUBS[0],power:1,aim:0,...extra});
test('out-of-range charge saturates without allowing unbounded distance',()=>{
  assert.deepEqual(shot({power:8}).end,shot({power:1.2}).end);
  assert.ok(shot({power:1.2}).carry>shot({power:1}).carry);
  assert.equal(shot({power:-1}).total,0);
});
test('driver, iron and wedge produce progressively shorter flight',()=>{
  const distances=[0,2,4].map(i=>shot({club:CLUBS[i]}).carry);
  assert.ok(distances[0]>distances[1] && distances[1]>distances[2]);
  assert.ok(distances[0]>170 && distances[0]<270);
});
test('a flat fairway absorbs landing speed and keeps driver roll in a useful arcade range',()=>{
  const full=shot({hole:longFlatHole});
  const relaxed=shot({hole:longFlatHole,power:.85});
  assert.ok(full.total-full.carry>=15 && full.total-full.carry<=45);
  assert.ok(relaxed.total-relaxed.carry>=15 && relaxed.total-relaxed.carry<=45);
  const totals=CLUBS.map(club=>shot({hole:longFlatHole,club}).total);
  assert.ok(totals.every((value,index)=>index===0||totals[index-1]>value));
});
test('overhit dispersion grows continuously from the normal-power baseline',()=>{
  const normal=shot({hole:longFlatHole,power:1,accuracy:1});
  const slightOverhit=shot({hole:longFlatHole,power:1.01,accuracy:1});
  const normalAngle=Math.atan2(normal.landing.x,normal.landing.z);
  const overhitAngle=Math.atan2(slightOverhit.landing.x,slightOverhit.landing.z);
  assert.ok(overhitAngle>normalAngle);
  assert.ok(overhitAngle-normalAngle<.005);
});
test('rotation changes direction and wind changes landing position',()=>{
  assert.ok(shot({aim:0.25}).end.x>20);
  assert.ok(shot({hole:{...hole,wind:{x:5,z:0}}}).landing.x>shot().landing.x);
});
test('water adds a penalty and returns to a playable drop',()=>{
  const h={...hole,ponds:[{x:0,z:210,rx:80,rz:90}]};
  const r=shot({hole:h});
  assert.equal(r.penalty,1);assert.notEqual(surfaceAt(h,r.end),'water');
  assert.equal(r.hazard.lie,'water');assert.deepEqual(r.hazard.point,r.stop);
  assert.notDeepEqual(r.stop,r.end);
});
test('out of bounds adds penalty without stranding the ball',()=>{
  const r=shot({aim:Math.PI/2});assert.equal(r.penalty,1);assert.ok(Math.abs(r.end.x)<105);
});
test('a gentle putt passing through the cup completes the hole',()=>{
  const h={...hole,pin:{x:0,z:5},greenRadius:30};
  const r=shot({hole:h,club:CLUBS.at(-1),power:0.43});
  assert.equal(r.holed,true);assert.deepEqual(r.end,h.pin);
});
test('all nine designed holes have valid playable tee and pin positions',()=>{
  assert.equal(HOLES.length,9);
  for(const h of HOLES){assert.notEqual(surfaceAt(h,h.tee),'water');assert.equal(surfaceAt(h,h.pin),'green');}
});
test('local play skips finished players and finishes all nine holes',()=>{
  let r=createRound(PRESETS.slice(0,2),HOLES.map(h=>h.id));
  for(let i=0;i<9;i++){
    r=applyShot(r,{end:HOLES[i].tee,penalty:1,holed:false});
    assert.equal(r.players[0].strokes,2);assert.equal(r.activePlayer,1);
    r=applyShot(r,{end:HOLES[i].pin,penalty:0,holed:true});
    assert.equal(r.activePlayer,0);
    r=applyShot(r,{end:HOLES[i].pin,penalty:0,holed:true});
    assert.equal(r.phase,'hole-complete');
    assert.throws(()=>applyShot(r,{end:HOLES[i].tee,penalty:0,holed:false}));
    r=nextHole(r);
  }
  assert.equal(r.phase,'results');assert.deepEqual(r.players[0].scores,Array(9).fill(3));
  assert.deepEqual(r.players[1].scores,Array(9).fill(1));
});
test('practice returns to tee and retains shot count',()=>{
  const r=applyShot(createRound([PRESETS[0]],[0],true),{end:{x:4,z:70},penalty:0,holed:false});
  assert.equal(r.practiceShots,1);assert.deepEqual(r.players[0].ball,HOLES[0].tee);assert.equal(r.phase,'playing');
});
test('the twelve-stroke hole cap includes a penalty on the final attempted shot',()=>{
  const round=createRound([PRESETS[0]],[0]);
  round.players[0].strokes=11;
  const completed=applyShot(round,{end:HOLES[0].tee,penalty:1,holed:false});
  assert.equal(completed.players[0].strokes,12);
  assert.equal(completed.players[0].scores[0],12);
  assert.equal(completed.phase,'hole-complete');
});
test('save roundtrip preserves edited profile and corrupt data falls back safely',()=>{
  const memory={value:null,getItem(){return this.value},setItem(k,v){this.value=v}};
  const defaults=readSave(memory);assert.ok(defaults.profiles.length>=6);
  defaults.profiles[0].name='My golfer';defaults.round=createRound(defaults.profiles.slice(0,1),[0]);
  writeSave(defaults,memory);assert.equal(readSave(memory).profiles[0].name,'My golfer');
  memory.value='{';assert.equal(readSave(memory).round,null);
  memory.value=JSON.stringify({version:1,round:{phase:'playing'},profiles:[{id:'bad'}]});
  assert.equal(readSave(memory).round,null);assert.ok(readSave(memory).profiles.length>=6);
});
test('blocked browser storage still provides playable defaults',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('Storage is blocked','SecurityError');}});
  try{
    const defaults=readSave();assert.equal(defaults.round,null);assert.equal(defaults.profiles.length,6);
    assert.equal(writeSave(defaults),false);
  }finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
