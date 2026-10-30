import {PRESETS,validProfile} from './profiles.js';
import {HOLES} from './courses.js';
const KEY='blue-bay-golf-v1';
export const DEFAULT_SETTINGS={sound:.6,music:.25,quality:'auto',reducedMotion:false,sensitivity:1,handedness:'right',gestureReduced:false};
export function validRound(r){
  return r&&r.version===1&&Array.isArray(r.holeIds)&&r.holeIds.length>0&&r.holeIds.length<=9&&r.holeIds.every(id=>Number.isInteger(id)&&HOLES[id])&&Number.isInteger(r.holeIndex)&&r.holeIndex>=0&&r.holeIndex<r.holeIds.length&&['playing','hole-complete','results'].includes(r.phase)&&Array.isArray(r.players)&&r.players.length>=1&&r.players.length<=4&&Number.isInteger(r.activePlayer)&&r.activePlayer>=0&&r.activePlayer<r.players.length&&r.players.every(p=>validProfile(p.profile)&&p.ball&&Number.isFinite(p.ball.x)&&Number.isFinite(p.ball.z)&&Number.isInteger(p.strokes)&&p.strokes>=0&&p.strokes<=13&&Array.isArray(p.scores)&&p.scores.every(n=>n===null||(Number.isInteger(n)&&n>=1&&n<=13)));
}
export function readSave(storage){
  const fallback={version:1,profiles:structuredClone(PRESETS),settings:{...DEFAULT_SETTINGS},round:null,best:null};
  try{
    storage??=globalThis.localStorage;
    const data=JSON.parse(storage.getItem(KEY));if(data?.version!==1)return fallback;
    if(Array.isArray(data.profiles)&&data.profiles.length&&data.profiles.every(validProfile))fallback.profiles=data.profiles;
    const s=data.settings||{};
    for(const k of ['sound','music'])if(Number.isFinite(s[k]))fallback.settings[k]=Math.max(0,Math.min(1,s[k]));
    if(['auto','low','medium','high'].includes(s.quality))fallback.settings.quality=s.quality;
    for(const k of ['reducedMotion','gestureReduced'])if(typeof s[k]==='boolean')fallback.settings[k]=s[k];
    if(['left','right'].includes(s.handedness))fallback.settings.handedness=s.handedness;
    if(Number.isFinite(s.sensitivity))fallback.settings.sensitivity=Math.max(.5,Math.min(2,s.sensitivity));
    if(validRound(data.round))fallback.round=data.round;
    if(Number.isInteger(data.best)&&data.best>0)fallback.best=data.best;
  }catch{/* Recover malformed or unavailable browser storage with playable defaults. */}
  return fallback;
}
export function writeSave(data,storage){try{storage??=globalThis.localStorage;storage.setItem(KEY,JSON.stringify({...data,version:1}));return true;}catch{return false;}}
