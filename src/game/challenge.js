import {HOLES} from './courses.js';
import {totalScore} from './round.js';

const MARKS=['🦅','🐦','🟩','🟨','🟥'];
export const scoreMark=(strokes,par)=>MARKS[Math.max(0,Math.min(4,strokes-par+2))];
export const relativeToPar=n=>n===0?'E':n>0?`+${n}`:`${n}`;
const COURSE_PAR=HOLES.reduce((s,h)=>s+h.par,0);

export function challengeFromRound(round){
 if(!round||round.practice||round.holeIds.length!==HOLES.length||round.phase!=='results')return null;
 const winner=round.players.reduce((a,p)=>totalScore(p)<totalScore(a)?p:a);
 return {by:winner.profile.name,score:totalScore(winner),par:COURSE_PAR,card:winner.scores.slice()};
}

export function challengeUrl(c,base){
 const url=new URL(base);url.search='';url.hash='';
 url.searchParams.set('beat',c.score);url.searchParams.set('by',c.by);
 url.searchParams.set('card',c.card.map(s=>s.toString(36)).join(''));
 return url.toString();
}

export const challengeText=c=>`Blue Bay Golf ⛳ ${c.by} shot ${c.score} (${relativeToPar(c.score-c.par)}) on the Blue Bay Nine\n${c.card.map((s,i)=>scoreMark(s,HOLES[i].par)).join('')}\nCan you beat it?`;

export function parseChallenge(search){
 const q=new URLSearchParams(search),score=Number(q.get('beat'));
 if(!q.has('beat')||!Number.isInteger(score)||score<HOLES.length||score>HOLES.length*12)return null;
 const card=[...(q.get('card')||'')].map(ch=>parseInt(ch,36));
 const valid=card.length===HOLES.length&&card.every(s=>s>=1&&s<=12)&&card.reduce((a,b)=>a+b,0)===score;
 return {by:(q.get('by')||'').trim().slice(0,24)||'A friend',score,par:COURSE_PAR,card:valid?card:null};
}

export function challengeVerdict(c,score){
 const d=c.score-score;
 return d>0?`You beat ${c.by} by ${d}!`:d===0?`All square with ${c.by}.`:`${c.by} still leads by ${-d}. One more go?`;
}
