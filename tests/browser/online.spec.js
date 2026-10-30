import {test,expect} from '@playwright/test';
import {PRESETS} from '../../src/game/profiles.js';
import {DEFAULT_SETTINGS} from '../../src/game/storage.js';

// Uses PeerJS's public broker, so this needs internet access.
const fixture=profiles=>({version:1,profiles,settings:{...DEFAULT_SETTINGS,reducedMotion:true,quality:'low'},round:null,best:null});
const seed=(page,profiles)=>page.addInitScript(v=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('blue-bay-golf-v1',JSON.stringify(v));sessionStorage.setItem('seeded','1');}},fixture(profiles));
const savedRound=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('blue-bay-golf-v1')).round);

test('a host opens a lobby, a friend joins by code link and turns pass between devices',async({browser})=>{
 test.setTimeout(150000);
 const host=await (await browser.newContext()).newPage(),guest=await (await browser.newContext()).newPage();
 await seed(host,PRESETS);await seed(guest,[PRESETS[1],...PRESETS.filter((_,i)=>i!==1)]);
 await host.goto('/');
 await host.getByRole('button',{name:'Play online',exact:true}).click();
 await host.getByRole('button',{name:'Host a lobby',exact:true}).click();
 await expect(host.locator('#lobby-code')).toHaveText(/^[A-Z2-9]{6}$/,{timeout:30000});
 await expect(host.locator('.lobby-qr svg')).toBeVisible();
 const code=await host.locator('#lobby-code').textContent();

 await guest.goto(`/?join=${code}`);
 await expect(guest.locator('#join-code')).toHaveValue(code);
 await guest.getByRole('button',{name:'Join lobby',exact:true}).click();
 await expect(guest.locator('.lobby-players li')).toHaveCount(2,{timeout:30000});
 await expect(host.locator('.lobby-players li')).toHaveCount(2,{timeout:30000});
 await expect(host.locator('.lobby-players')).toContainText(PRESETS[1].name);
 const intruder=await (await browser.newContext()).newPage();await seed(intruder,[PRESETS[2],...PRESETS.filter((_,i)=>i!==2)]);
 await intruder.goto(`/?join=${code}`);await intruder.getByRole('button',{name:'Join lobby',exact:true}).click();
 await expect(host.locator('.lobby-players li')).toHaveCount(3,{timeout:30000});
 await host.locator('.lobby-card').screenshot({path:'test-results/lobby-host.png'});
 await host.getByRole('button',{name:`Remove ${PRESETS[2].name}`}).click();
 await expect(host.locator('.lobby-players li')).toHaveCount(2);
 await expect(intruder.locator('.lobby-error')).toHaveText('The host removed you from the lobby.',{timeout:30000});
 await intruder.getByRole('button',{name:'Join lobby',exact:true}).click();
 await expect(intruder.locator('.lobby-error')).toHaveText('The host removed you from the lobby.',{timeout:30000});
 await expect(host.locator('.lobby-players li')).toHaveCount(2);

 await host.getByRole('button',{name:'Tee off with 2 golfers',exact:true}).click();
 await expect(host.locator('.game-hud')).toBeVisible();
 await expect(guest.locator('.game-hud')).toBeVisible({timeout:30000});
 await expect(guest.locator('#swing')).toBeDisabled();
 await expect(guest.locator('#swing')).toContainText(`${PRESETS[0].name}’s turn`);

 await host.getByRole('button',{name:'Swing',exact:true}).click();
 await expect.poll(async()=>(await savedRound(guest))?.players[0].strokes,{timeout:45000}).toBe(1);
 await expect(guest.locator('#swing')).toHaveText('Swing',{timeout:30000});
 await expect(host.locator('#swing')).toContainText(`${PRESETS[1].name}’s turn`,{timeout:30000});

 await guest.getByRole('button',{name:'Swing',exact:true}).click();
 await expect.poll(async()=>(await savedRound(host))?.players[1].strokes,{timeout:45000}).toBe(1);
 await expect.poll(async()=>(await savedRound(guest))?.players[1].strokes,{timeout:45000}).toBe(1);
 const [a,b]=[await savedRound(host),await savedRound(guest)];
 expect(b.players.map(p=>p.ball)).toEqual(a.players.map(p=>p.ball));
});
