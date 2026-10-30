import test from 'node:test';
import assert from 'node:assert/strict';
import { GolfScene } from '../src/render/scene.js';

const fake=(quality='auto')=>({quality,gov:{t:0,n:0,good:0},renderScale:null,renderer:{shadowMap:{enabled:true}},perf:{},resizes:0,
 setShadows(on){this.renderer.shadowMap.enabled=on;},resize(){this.resizes++;}});
const run=(s,fps,seconds)=>{for(let i=0;i<Math.round(fps*seconds);i++)GolfScene.prototype.govern.call(s,1/fps);};

test('auto quality lowers resolution when frames are slow', () => {
 globalThis.window={devicePixelRatio:2};
 const s=fake();
 run(s,12,1.05);
 assert.ok(s.renderScale<1.5&&s.renderScale>=.5);
 assert.equal(s.perf.fps,12);
 run(s,12,6);
 assert.equal(s.renderScale,.5);
});

test('auto quality wins detail back after sustained headroom and counts sub-2 FPS frames', () => {
 globalThis.window={devicePixelRatio:2};
 const s=fake();
 run(s,1,3);
 assert.ok(s.renderScale<1.5);
 run(s,12,8);
 run(s,60,40);
 assert.equal(s.renderScale,1.5);
});

test('manual quality settings are never adjusted', () => {
 globalThis.window={devicePixelRatio:2};
 const s=fake('high');
 run(s,10,5);
 assert.equal(s.renderScale,null);
 assert.equal(s.resizes,0);
});
