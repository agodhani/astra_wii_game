import {test,expect} from '@playwright/test';

test('camera unavailable allows returning to the same playable round',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Practice range',exact:true}).click();
 await page.locator('#input-toggle').click();await page.getByRole('button',{name:'Enable camera',exact:true}).click();
 await expect(page.locator('#camera-status')).toContainText(/denied|No camera|unavailable/i,{timeout:30000});
 await page.getByRole('button',{name:'Use keyboard',exact:true}).click();
 await expect(page.locator('.game-hud')).toBeVisible();await expect(page.getByRole('button',{name:'Swing',exact:true})).toBeEnabled();
});

 test('loads the real local model and stops all tracks on fallback',async({playwright,baseURL})=>{
  test.setTimeout(60000); // Software WebGL can spend several seconds compiling inference shaders.
  const browser=await playwright.chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const page=await browser.newPage();
  try {
  const modelRequests=[];page.on('request',r=>{if(r.url().includes('/models/')||r.url().includes('/mediapipe/'))modelRequests.push(r.url());});
  await page.goto(baseURL);await page.getByRole('button',{name:'Practice range',exact:true}).click();await page.locator('#input-toggle').click();
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await expect(page.getByRole('button',{name:'Calibrate',exact:true})).toBeEnabled({timeout:30000});
  expect(modelRequests.some(r=>r.endsWith('pose_landmarker_lite.task'))).toBe(true);
  await page.evaluate(()=>{window.cameraTestTracks=document.querySelector('#camera-video').srcObject.getTracks();});
  await page.getByRole('button',{name:'Calibrate',exact:true}).click();
  // Color bars contain no golfer. Wait for a real inference result to update
  // calibration, proving frame processing works without falsely accepting it.
  await expect(page.locator('#camera-status')).toContainText('Hold your address pose… 0%',{timeout:25000});
  await expect(page.getByRole('button',{name:'Ready to play',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Use keyboard',exact:true}).click();
  expect(await page.evaluate(()=>window.cameraTestTracks.every(t=>t.readyState==='ended'))).toBe(true);
  await expect(page.getByRole('button',{name:'Swing',exact:true})).toBeEnabled();
  } finally { await browser.close(); }
 });
