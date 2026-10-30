import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChallenge,challengeUrl,challengeText,challengeVerdict,challengeFromRound} from '../src/game/challenge.js';
import {createRound} from '../src/game/round.js';
import {HOLES} from '../src/game/courses.js';
import {PRESETS} from '../src/game/profiles.js';

const finished=()=>{const r=createRound(PRESETS.slice(0,2),HOLES.map(h=>h.id));r.phase='results';r.players[0].scores=[4,3,4,5,3,4,4,3,2];r.players[1].scores=HOLES.map(h=>h.par+1);return r;};

test('a finished nine becomes a challenge link that round-trips with its scorecard', () => {
 const c=challengeFromRound(finished());
 assert.equal(c.by,PRESETS[0].name);assert.equal(c.score,32);
 const url=challengeUrl(c,'https://golf.example/play/?old=1#x');
 assert.match(url,/^https:\/\/golf\.example\/play\/\?beat=32&by=/);
 assert.deepEqual(parseChallenge(new URL(url).search),{by:c.by,score:32,par:c.par,card:c.card});
 assert.match(challengeText(c),/shot 32 \(-\d+\)/);
 assert.match(challengeText(c),/[🦅🐦]/u);
});

test('practice, partial and short rounds cannot be shared', () => {
 const r=finished();r.practice=true;assert.equal(challengeFromRound(r),null);
 const p=finished();p.phase='playing';assert.equal(challengeFromRound(p),null);
});

test('malformed links are ignored or lose only the bad scorecard', () => {
 assert.equal(parseChallenge('?beat=abc'),null);assert.equal(parseChallenge('?beat=3'),null);assert.equal(parseChallenge(''),null);
 const c=parseChallenge('?beat=40&card=111&by=%20');assert.equal(c.card,null);assert.equal(c.by,'A friend');
 assert.equal(parseChallenge(`?beat=40&by=${'x'.repeat(40)}`).by.length,24);
});

test('verdict compares totals', () => {
 const c={by:'Kai',score:34};
 assert.equal(challengeVerdict(c,32),'You beat Kai by 2!');assert.equal(challengeVerdict(c,34),'All square with Kai.');assert.match(challengeVerdict(c,36),/Kai still leads by 2/);
});
