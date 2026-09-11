import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { createAvatar } from '../src/render/avatar.js';

const profile = {name:'Maya',skin:'#8c5034',hair:'#221914',hairStyle:'curls',face:'relaxed',build:'athletic',top:'#168da0',bottom:'#243951',outfit:'trousers',hat:'none',accessory:'none'};
test('all independent avatar options produce finite visible athletic geometry', () => {
 for (const hairStyle of ['crop','curls','ponytail','twists','bob','undercut']) {
  const avatar=createAvatar({...profile,hairStyle});
  const box=new Box3().setFromObject(avatar);
  assert.ok(box.max.y-box.min.y > 4, hairStyle);
  assert.ok(box.max.y-box.min.y < 6, hairStyle);
  avatar.traverse(part=> { if(part.isMesh) for(const n of part.geometry.attributes.position.array) assert.ok(Number.isFinite(n)); });
 }
});
test('swing and celebration animate articulated joints without accumulating transforms', () => {
 const avatar=createAvatar(profile);
 avatar.userData.animate(.45,'swing'); avatar.updateMatrixWorld(true);
 const swing=avatar.getObjectByName('shoulders').rotation.y;
 avatar.userData.animate(1,'idle'); avatar.updateMatrixWorld(true);
 assert.notEqual(avatar.getObjectByName('shoulders').rotation.y,swing);
 const first=avatar.getObjectByName('shoulders').rotation.y;
 avatar.userData.animate(1,'idle');
 assert.equal(avatar.getObjectByName('shoulders').rotation.y,first);
 avatar.userData.animate(.3,'celebration');
 assert.ok(Number.isFinite(new Box3().setFromObject(avatar).max.y));
});

test('outfits, face treatments, headwear and accessories combine without invalid geometry', () => {
 for (const [outfit,hat,accessory,face,build] of [
  ['shorts','cap','glasses','sharp','strong'],
  ['trousers','visor','beard','relaxed','athletic'],
  ['skort','none','earrings','sharp','slim'],
 ]) {
  const avatar=createAvatar({...profile,outfit,hat,accessory,face,build});
  for(const kind of ['idle','address','swing','celebration']) {
   avatar.userData.animate(.75,kind);
   const box=new Box3().setFromObject(avatar);
   assert.ok(Number.isFinite(box.max.x)&&Number.isFinite(box.max.y)&&Number.isFinite(box.max.z));
   assert.ok(box.max.y-box.min.y>3);
  }
 }
});
