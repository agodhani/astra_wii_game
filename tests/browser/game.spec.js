import {test,expect} from '@playwright/test';
import {HOLES} from '../../src/game/courses.js';
import {createRound} from '../../src/game/round.js';
import {PRESETS} from '../../src/game/profiles.js';
import {DEFAULT_SETTINGS} from '../../src/game/storage.js';
test('a golfer can customize, save, start a round, swing and resume',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Play a round',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Your golfer',exact:true}).click();
 await page.getByLabel('Golfer name').fill('Ocean Ace');await page.getByRole('button',{name:'Save golfer',exact:true}).click();
 await page.getByRole('button',{name:'Play a round',exact:true}).click();
 await page.getByRole('button',{name:'Tee off',exact:true}).click();
 await expect(page.locator('.game-hud')).toBeVisible();
 await page.getByRole('button',{name:'Swing',exact:true}).click();
 await expect(page.locator('#stroke-value')).toHaveText('2',{timeout:30000});
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:'Save & exit',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Resume round',exact:true}).click();
 await expect(page.locator('#stroke-value')).toHaveText('2');
});
test('menus, presets, settings and practice are usable',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Your golfer',exact:true}).click();
 await expect(page.locator('[data-preset]')).toHaveCount(6);await page.locator('[data-preset="leo"]').click();await expect(page.getByLabel('Golfer name')).toHaveValue('Leo');
 await page.getByRole('button',{name:'Save golfer',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByLabel('Reduced motion').check();await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Practice range',exact:true}).click();await expect(page.locator('.game-hud')).toBeVisible();
 await page.getByRole('button',{name:'Next club',exact:true}).click();await expect(page.locator('#club-code')).toHaveText('3W');
 const before=await page.locator('#aim-value').textContent();await page.keyboard.press('d');await expect(page.locator('#aim-value')).not.toHaveText(before);
 await page.getByLabel('Planned power').fill('120');await expect(page.locator('#power-value')).toHaveText('120%');
});
test('Space activates a focused menu button instead of taking a shot',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Practice range',exact:true}).click();
 await page.getByRole('button',{name:'Pause',exact:true}).focus();await page.keyboard.press('Space');
 await expect(page.getByRole('button',{name:'Back to the green',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to the green',exact:true}).click();
 await expect(page.locator('#stroke-value')).toHaveText('0');
});
test('two local golfers finish a saved ninth hole, see totals and replay from hole one',async({page})=>{
 const round=createRound(PRESETS.slice(0,2),HOLES.map(h=>h.id));round.holeIndex=8;
 for(const p of round.players){p.ball={x:HOLES[8].pin.x,z:HOLES[8].pin.z-5};p.strokes=1;p.scores=HOLES.slice(0,8).map(h=>h.par);}
 const fixture={version:1,profiles:PRESETS,settings:{...DEFAULT_SETTINGS,reducedMotion:true,quality:'low'},round,best:null};
 await page.addInitScript(value=>localStorage.setItem('blue-bay-golf-v1',JSON.stringify(value)),fixture);await page.goto('/');
 await page.getByRole('button',{name:'Resume round',exact:true}).click();
 await page.getByLabel('Planned power').fill('43');await page.getByRole('button',{name:'Swing',exact:true}).click();
 await expect(page.locator('.player-tag strong')).toHaveText('Kai',{timeout:25000});
 await page.getByLabel('Planned power').fill('43');await page.getByRole('button',{name:'Swing',exact:true}).click();
 await page.getByRole('button',{name:'See your results',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Good shots. Great day.'})).toBeVisible();
 const finished=await page.evaluate(()=>JSON.parse(localStorage.getItem('blue-bay-golf-v1')));
 expect(finished.round.phase).toBe('results');expect(finished.round.players[0].scores).toEqual([4,3,4,5,3,4,4,3,2]);
 expect(finished.round.players[1].scores).toEqual([4,3,4,5,3,4,4,3,2]);expect(finished.best).toBe(32);
 await page.getByRole('button',{name:'Play again',exact:true}).click();await expect(page.locator('#distance-value')).toContainText('310');
 await expect(page.locator('#stroke-value')).toHaveText('1');
});
test('maximum charge stays inside the slim meter and orbit does not change aim',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Practice range',exact:true}).click();
 await page.getByLabel('Planned power').fill('120');
 const bounds=await page.evaluate(()=>{const t=document.querySelector('.power-track').getBoundingClientRect(),n=document.querySelector('.power-needle').getBoundingClientRect();return {left:n.left-t.left,right:t.right-n.right,height:t.height};});
 expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeGreaterThanOrEqual(0);expect(bounds.height).toBeLessThanOrEqual(24);
 const aim=await page.locator('#aim-value').textContent();await page.mouse.move(700,450);await page.mouse.down();await page.mouse.move(900,470,{steps:8});await page.mouse.up();
 await page.keyboard.press('j');await page.keyboard.press('i');
 await expect(page.locator('#aim-value')).toHaveText(aim);await expect(page.locator('#stroke-value')).toHaveText('0');
 await page.getByRole('button',{name:'Reset view',exact:true}).click();await page.getByLabel('Planned power').fill('85');
 await page.waitForTimeout(800);await page.screenshot({path:'docs/verification/renderer-integrated-play.png'});
 await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(500);await page.screenshot({path:'docs/verification/renderer-integrated-laptop.png'});
});
