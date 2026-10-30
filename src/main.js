import './ui/styles.css';
import {GolfScene} from './render/scene.js';
import {HOLES,distance,surfaceAt} from './game/courses.js';
import {CLUBS,simulateShot,recommendedClub,clampPower} from './game/physics.js';
import {createRound,applyShot,nextHole,totalScore,scoreLabel} from './game/round.js';
import {PRESETS,validProfile} from './game/profiles.js';
import {readSave,writeSave} from './game/storage.js';
import {CameraController} from './input/camera.js';
import {drawMinimap,minimapView} from './ui/minimap.js';
import {GolfAudio} from './audio.js';
import {icon,escapeHtml} from './ui/icons.js';
import * as screens from './ui/screens.js';
import {Lobby,normalizeCode,joinUrl} from './net/lobby.js';
import {parseChallenge,challengeFromRound,challengeUrl,challengeText} from './game/challenge.js';

const challenge=parseChallenge(location.search);
let net=null,netUi={mode:'choose'};

const app=document.querySelector('#app'),canvas=document.querySelector('#world');
const dock=document.createElement('div');dock.id='camera-dock';document.body.append(dock);
let data=readSave(),screen='menu',overlay=null,returnOverlay=null,tutorialStep=0;
let setup={courseMode:'nine',hole:0,players:[{id:data.profiles[0].id,input:'keyboard'}]};
let edited=structuredClone(data.profiles[0]),editOriginal=edited.id;
let round=data.round,aim=0,clubIndex=0,power=.85,busy=false,charging=null,skipClick=false;
let activeSceneHole=null,toastTimer,announcementTimer,shotGeneration=0;
let cameraStatus={state:'idle',message:'Camera off.',calibrated:false},scene;
const audio=new GolfAudio();audio.setSettings(data.settings);
const currentHole=()=>round?HOLES[round.holeIds[round.holeIndex]]:HOLES[0];
const currentPlayer=()=>round?.players[round.activePlayer];
const isCamera=()=>currentPlayer()?.profile.input==='camera';
const save=()=>{data.round=round;if(!writeSave(data))toast('Browser storage is full or unavailable. This round will stay open, but may not survive a reload.');};
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4500);}
function announce(message,detail='',tone=''){const el=document.querySelector('#shot-announcement');if(!el)return;el.innerHTML=message?`<strong>${escapeHtml(message)}</strong>${detail?`<span>${escapeHtml(detail)}</span>`:''}`:'';el.dataset.tone=tone;clearTimeout(announcementTimer);announcementTimer=setTimeout(()=>{if(el.isConnected)el.textContent='';},4200);}
function setSceneHole(hole){if(activeSceneHole!==hole.id){scene.setHole(hole);activeSceneHole=hole.id;}}

const camera=new CameraController({
 onStatus(status){cameraStatus=status;updateCameraStatus();},
 onLandmarks:drawPose,
 onSwing({power:measured}){if(screen==='game'&&!overlay&&!busy&&isCamera()){power=clampPower(measured);shoot();}},
});

function render(){
 if(camera.video?.isConnected)dock.append(camera.video);
 let html='';
 if(screen==='menu')html=screens.menuScreen(data,data.profiles.find(p=>p.id===setup.players[0]?.id)||data.profiles[0],challenge);
 if(screen==='setup')html=screens.setupScreen(data,setup);
 if(screen==='custom')html=screens.customScreen(edited,data);
 if(screen==='game')html=screens.gameScreen(round,currentHole(),currentPlayer());
 if(overlay==='pause')html+=screens.pauseScreen();
 if(overlay==='settings')html+=screens.settingsScreen(data.settings);
 if(overlay==='tutorial')html+=screens.tutorialScreen(tutorialStep);
 if(overlay==='camera')html+=screens.cameraScreen(data.settings);
 if(overlay==='scorecard')html+=screens.scorecardScreen(round);
 if(overlay==='hole')html+=screens.holeCompleteScreen(round);
 if(overlay==='results')html+=screens.scorecardScreen(round,true,challenge);
 if(overlay==='online')html+=screens.onlineScreen(netUi);
 app.innerHTML=html;
 document.body.classList.toggle('reduced-motion',data.settings.reducedMotion);
 if(screen==='game'){updateHud();if(overlay!=='camera')camera.setArmed(!overlay&&!busy&&isCamera()&&cameraStatus.calibrated);}
 if(overlay==='camera'){
   camera.setArmed(false);
   if(camera.video){document.querySelector('#camera-video').replaceWith(camera.video);camera.video.id='camera-video';}
   updateCameraStatus();refreshDevices();
 }
 // Dialog keyboard focus starts inside the active surface. Avoid stealing slider/edit focus on HUD updates.
 if(overlay)requestAnimationFrame(()=>app.querySelector('.modal-backdrop button:not(:disabled)')?.focus({preventScroll:true}));
}

function goMenu(){
 shotGeneration++;busy=false;charging=null;camera.stop();save();screen='menu';overlay=null;
 setSceneHole(HOLES[0]);scene.setMode('menu');render();
}
function enterGame({resetAim=true}={}){
 screen='game';overlay=null;setSceneHole(currentHole());scene.setMode('play');scene.setPlayer(currentPlayer().profile);scene.setBall(currentPlayer().ball);
 if(resetAim){aim=Math.atan2(currentHole().pin.x-currentPlayer().ball.x,currentHole().pin.z-currentPlayer().ball.z);clubIndex=recommendedClub(currentHole(),currentPlayer().ball);power=.85;}
 scene.setAim(aim);render();
 if(round.phase==='hole-complete'){overlay='hole';render();}
 else if(round.phase==='results'){overlay='results';render();}
 else if(isCamera()&&!cameraStatus.calibrated){overlay='camera';render();}
}
function startRound(practice=false){
 camera.stop();shotGeneration++;busy=false;
 let ids=setup.courseMode==='nine'?HOLES.map(h=>h.id):setup.courseMode==='three'?[0,1,2]:[setup.hole];
 const players=setup.players.map(p=>({...structuredClone(data.profiles.find(v=>v.id===p.id)||data.profiles[0]),input:p.input}));
 round=createRound(practice?[{...players[0],input:'keyboard'}]:players,practice?[0]:ids,practice);save();enterGame();
}
function predict(){return simulateShot({hole:currentHole(),start:currentPlayer().ball,club:CLUBS[clubIndex],power,aim});}
function updateHud(){
 if(screen!=='game'||!document.querySelector('#minimap'))return;
 const h=currentHole(),p=currentPlayer(),club=CLUBS[clubIndex],result=predict();
 document.querySelector('#distance-value').innerHTML=`${Math.round(distance(p.ball,h.pin))}<em>yd</em>`;
 document.querySelector('#stroke-value').textContent=round.practice?round.practiceShots:p.strokes+1;
 document.querySelector('#lie-value').textContent=`${surfaceAt(h,p.ball).replace(/^\w/,c=>c.toUpperCase())} · ${round.practice?'Practice range':h.name}`;
 document.querySelector('#club-code').textContent=club.code;document.querySelector('#club-name').textContent=club.name;
 document.querySelector('#power-value').textContent=`${Math.round(power*100)}%`;
 document.querySelector('#power-slider').value=Math.round(power*100);
 document.querySelector('#power-fill').style.width=`${power/1.2*100}%`;
 document.querySelector('#power-needle').style.left=`${Math.max(.8,power/1.2*100)}%`;
 const green=minimapView(h,p.ball,club).green,putt=green&&club.id==='putter',left=distance(result.stop||result.end,h.pin);
 document.querySelector('#map-title').textContent=green?'READ THE GREEN':'THE LAY OF THE LAND';
 document.querySelector('#map-help').textContent=green?'Arrows run downhill · Rings: 10 / 20 ft':'Dots: 25 · 50 · 75 · 100% power';
 document.querySelector('#carry-label').textContent=putt?'Est. roll':'Est. carry';
 document.querySelector('#total-label').textContent=putt?'Leaves':'Est. total';
 document.querySelector('#carry-value').innerHTML=putt?`${Math.round(result.total*3)} <small>ft</small>`:`${Math.round(result.carry)} <small>yd</small>`;
 document.querySelector('#total-value').innerHTML=putt?(result.holed?'In <small>the cup</small>':`${Math.round(left*3)} <small>ft</small>`):`${Math.round(result.total)} <small>yd</small>`;
 document.querySelector('#aim-value').textContent=`${Math.round(aim*180/Math.PI)}°`;
 document.querySelector('#risk-label').textContent=result.penalty?'Projected hazard · Try another line':power>1?'Overhit · Wider landing area':'';
 document.querySelector('#power-caption').textContent=isCamera()?'TARGET / PRACTICE POWER':'SHOT POWER';
 document.querySelector('#power-instruction').textContent=isCamera()?'Swing to play · Actual power is measured from your gesture':'Hold & release to swing · Click for planned power';
 const swing=document.querySelector('#swing');swing.disabled=!busy&&(isCamera()||!myTurn());swing.classList.toggle('skipping',busy);swing.querySelector('span').textContent=busy?'Skip to result':!myTurn()?`${currentPlayer().profile.name}’s turn`:isCamera()?'Swing on camera':'Swing';
 document.querySelector('#input-toggle').innerHTML=`${icon(isCamera()?'camera':'keyboard',15)} ${isCamera()?'Camera swing':'Keyboard & mouse'} ▾`;
 document.querySelector('#camera-badge').hidden=!isCamera();
 for(const e of app.querySelectorAll('.club-control button,.aim-controls button,#power-slider'))e.disabled=busy;
 drawMinimap(document.querySelector('#minimap'),h,p.ball,aim,club,power,result);
 updateCameraStatus();
}
function updateCameraStatus(){
 const el=document.querySelector('#camera-status');if(el){el.textContent=cameraStatus.message+(cameraStatus.lastPower!=null?` Last practice: ${Math.round(cameraStatus.lastPower*100)}%.`:'');}
 const live=['ready','tracking','calibrating','tracking-lost'].includes(cameraStatus.state);
 const placeholder=document.querySelector('#video-placeholder');if(placeholder)placeholder.hidden=live||cameraStatus.state==='requesting'&&!!camera.stream;
 const calibrate=document.querySelector('#calibrate');if(calibrate)calibrate.disabled=!live;
 const ready=document.querySelector('#camera-ready');if(ready)ready.disabled=!cameraStatus.calibrated||cameraStatus.state==='error';
 const enable=document.querySelector('[data-action="enable-camera"]');if(enable){enable.disabled=cameraStatus.state==='requesting';enable.innerHTML=`${icon('camera')} ${live?'Restart camera':cameraStatus.state==='error'?'Retry camera':'Enable camera'}`;}
 const label=document.querySelector('#tracking-label');if(label)label.textContent=cameraStatus.state==='tracking-lost'?'Tracking lost · Pause and reframe':cameraStatus.state==='error'?'Camera unavailable · Open setup':cameraStatus.message;
}
function drawPose(points){
 const c=document.querySelector('#pose-overlay');if(!c)return;const v=document.querySelector('#camera-video');c.width=v.videoWidth||640;c.height=v.videoHeight||480;
 const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(!points?.length)return;
 ctx.strokeStyle='#f1cf84';ctx.fillStyle='#fff5d3';ctx.lineWidth=3;
 for(const [a,b] of [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]]){
 if(!points[a]||!points[b]||points[a].visibility<.5||points[b].visibility<.5)continue;
 ctx.beginPath();ctx.moveTo(points[a].x*c.width,points[a].y*c.height);ctx.lineTo(points[b].x*c.width,points[b].y*c.height);ctx.stroke();}
 for(const i of [11,12,13,14,15,16])if(points[i]?.visibility>.5){ctx.beginPath();ctx.arc(points[i].x*c.width,points[i].y*c.height,5,0,Math.PI*2);ctx.fill();}
}
async function refreshDevices(){
 try{const devices=await camera.listDevices(),s=document.querySelector('#camera-device');if(s){const selected=camera.options.deviceId;s.innerHTML=`<option value="">Default camera</option>`+devices.map(d=>`<option value="${escapeHtml(d.deviceId)}" ${d.deviceId===selected?'selected':''}>${escapeHtml(d.label)}</option>`).join('');}}catch{/* Device names may be unavailable before permission. */}
}
async function enableCamera(){
 const video=document.querySelector('#camera-video');if(!video)return;
 const deviceId=document.querySelector('#camera-device').value;
 try{await camera.start(video,{deviceId,handedness:data.settings.handedness,sensitivity:data.settings.sensitivity,reducedMotion:data.settings.gestureReduced});await refreshDevices();}catch(error){if(error.name!=='AbortError')toast(error.message);}
}
function myTurn(){
 if(!net||!round?.online)return true;
 const seat=round.activePlayer;
 return net.role==='guest'?seat===net.seat:!net.lobby.isPresent(seat)||seat===0;
}
function shoot(remote=false){
 if(screen!=='game'||overlay||busy||round.phase!=='playing')return;
 if(net?.role==='guest'&&round.online){if(myTurn())net.lobby.send({t:'swing',club:clubIndex,power,aim});return;}
 if(!remote&&!myTurn())return;
 const result=simulateShot({hole:currentHole(),start:currentPlayer().ball,club:CLUBS[clubIndex],power,aim,accuracy:(Math.random()*2-1)});
 if(net?.role==='host'&&round.online)net.lobby.broadcast({t:'shot',result});
 playResult(result);
}
function playResult(result){
 busy=true;camera.setArmed(false);audio.play('shot');updateHud();
 const generation=shotGeneration,previousPlayer=round.activePlayer;
 scene.animateShot(result,()=>{
   if(generation!==shotGeneration)return;
   round=applyShot(round,result);busy=false;save();audio.play(result.holed?'win':'ball');
   const [message,detail,tone]=shotSummary(result,previousPlayer);
   const changedPlayer=previousPlayer!==round.activePlayer;
   if(changedPlayer)camera.stop();
   scene.setPlayer(currentPlayer().profile);scene.setBall(currentPlayer().ball);
   if(result.holed&&!data.settings.reducedMotion)scene.celebrate();
   aim=Math.atan2(currentHole().pin.x-currentPlayer().ball.x,currentHole().pin.z-currentPlayer().ball.z);
   clubIndex=round.practice?clubIndex:recommendedClub(currentHole(),currentPlayer().ball);scene.setAim(aim);scene.resetView();
   if(round.phase==='hole-complete')overlay='hole';
   else if(isCamera()&&!cameraStatus.calibrated)overlay='camera';
   render();announce(message,detail,tone);
 });
}
function shotSummary(result,playerIndex){
 const player=round.players[playerIndex],hole=currentHole(),lie=result.lie.replace(/^\w/,c=>c.toUpperCase());
 if(result.holed&&!round.practice)return [player.strokes===1?'Hole in one!':`${scoreLabel(player.strokes,hole.par)}!`,`In the cup in ${player.strokes}`,'great'];
 if(result.holed)return ['In the cup!','Nice swing. Try another.','great'];
 if(result.penalty)return [result.hazard?.lie==='water'?'Splash!':'Out of bounds','+1 penalty · Back to your previous lie','bad'];
 if(round.practice)return [`${Math.round(result.total)} yd`,`${lie} · Nice swing. Try another.`,''];
 const left=distance(player.ball,hole.pin);
 return [`${Math.round(result.total)} yd`,`${lie} · ${result.lie==='green'?`${Math.round(left*3)} ft`:`${Math.round(left)} yd`} to the pin`,result.lie==='green'||result.lie==='fairway'?'good':''];
}
function skipShot(){if(screen==='game'&&!overlay&&busy)scene.skipShot();}
// Input timestamps keep a slow frame from stretching a short press into a charged swing.
function beginCharge(time=performance.now()){if(screen!=='game'||overlay||busy||isCamera())return;charging={time,initial:power};}
// A tap or ordinary press always uses planned power; charging only begins after a deliberate hold.
const HOLD_DELAY=400,chargePower=elapsed=>clampPower((elapsed-HOLD_DELAY)/1800);
function releaseCharge(time=performance.now()){if(!charging)return;const c=charging;charging=null;const held=time-c.time;power=held<HOLD_DELAY?c.initial:chargePower(held);shoot();}
function alterAim(delta){if(screen!=='game'||busy||overlay)return;aim+=delta;scene.setAim(aim);updateHud();}
function changeClub(delta){if(screen!=='game'||busy)return;clubIndex=(clubIndex+delta+CLUBS.length)%CLUBS.length;updateHud();}
function saveProfile(asNew=false){
 const name=document.querySelector('#golfer-name')?.value.trim();edited.name=name||edited.name;
 if(asNew)edited.id=`golfer-${crypto.randomUUID()}`;
 if(!validProfile(edited)){toast('Please choose a name of 1–24 characters.');return;}
 const i=data.profiles.findIndex(p=>p.id===edited.id);if(i>=0)data.profiles[i]=structuredClone(edited);else data.profiles.push(structuredClone(edited));
 setup.players[0].id=edited.id;save();goMenu();toast(`${edited.name} is ready for the fairway.`);
}
const actions={
 menu:goMenu,setup(){screen='setup';overlay=null;scene.setMode('menu');render();},start:()=>startRound(),practice:()=>startRound(true),resume(){round=data.round;if(round)enterGame();},
 customize(){screen='custom';overlay=null;edited=structuredClone(data.profiles.find(p=>p.id===setup.players[0].id)||data.profiles[0]);editOriginal=edited.id;setSceneHole(HOLES[0]);scene.setMode('avatar');scene.setPlayer(edited);render();},
 'cancel-custom':goMenu,'save-profile':()=>saveProfile(),'save-new':()=>saveProfile(true),
 pause(){if(screen!=='game')return;charging=null;camera.setArmed(false);overlay='pause';render();},
 continue(){overlay=null;render();},exit:goMenu,
 restart(){if(!confirm('Restart this round? Your current round progress will be replaced.'))return;round=createRound(round.players.map(p=>p.profile),round.holeIds,round.practice);camera.stop();shotGeneration++;busy=false;save();enterGame();},
 async share(){
   const c=challengeFromRound(round);if(!c)return;
   const url=challengeUrl(c,location.href),text=challengeText(c),btn=document.querySelector('[data-action="share"]');
   try{
     if(navigator.share)await navigator.share({title:'Blue Bay Golf',text,url});
     else{await navigator.clipboard.writeText(`${text}\n${url}`);if(btn)btn.textContent='Link copied ✓';}
   }catch(error){if(error?.name!=='AbortError')window.prompt('Copy your challenge link',url);}
 },
 online(){net?.lobby.close();net=null;netUi={mode:'choose'};overlay='online';render();},
 async 'host-lobby'(){
   net?.lobby.close();netUi={mode:'busy',status:'Opening a lobby…'};render();
   const lobby=new Lobby({onMessage:onHostMessage,onError:netError,onPeers:()=>{if(net?.lobby!==lobby)return;netUi.players=lobbyNames();lobby.broadcast({t:'lobby',players:netUi.players});if(overlay==='online')render();}});
   net={role:'host',lobby,seat:0};
   const code=await lobby.host();if(!code||net?.lobby!==lobby)return;
   const QRCode=(await import('qrcode')).default,qr=await QRCode.toString(joinUrl(code,location.href),{type:'svg',margin:1,color:{dark:'#183c37',light:'#fffaf0'}});
   if(net?.lobby!==lobby)return;netUi={mode:'hosting',code,qr,players:lobbyNames()};render();
 },
 async 'join-lobby'(){
   const code=normalizeCode(document.querySelector('#join-code')?.value);
   if(!code){netUi={...netUi,error:'Enter the 4-letter lobby code.'};render();return;}
   net?.lobby.close();netUi={mode:'busy',status:`Joining ${code}…`};render();
   const lobby=new Lobby({onMessage:onGuestMessage,onError:netError});net={role:'guest',lobby,seat:null};
   if(await lobby.join(code)&&net?.lobby===lobby){netUi={mode:'joined',code,players:[]};lobby.send({t:'hello',profile:myProfile()});render();}
 },
 'start-online'(){
   if(net?.role!=='host')return;const guests=net.lobby.guests.filter(g=>!g.gone);if(!guests.length)return;
   net.lobby.locked=true;net.lobby.guests=guests;
   const players=[myProfile(),...guests.map((g,i)=>guestProfile(g.profile,i+1))].map(p=>({...structuredClone(p),input:'keyboard'}));
   camera.stop();shotGeneration++;busy=false;round=createRound(players,HOLES.map(h=>h.id));round.online=true;save();
   guests.forEach((g,i)=>net.lobby.sendTo(i+1,{t:'start',round,seat:i+1}));enterGame();
 },
 'leave-lobby'(){net?.lobby.close();net=null;netUi={mode:'choose'};overlay=null;render();},
 replay(){round=createRound(round.players.map(p=>p.profile),round.holeIds,round.practice);camera.stop();shotGeneration++;busy=false;save();enterGame();},
 settings(){returnOverlay=overlay;overlay='settings';render();},'close-settings'(){overlay=returnOverlay;returnOverlay=null;save();render();},
 tutorial(){tutorialStep=0;overlay='tutorial';render();},'tutorial-next'(){tutorialStep++;render();},'tutorial-prev'(){tutorialStep--;render();},
 scorecard(){returnOverlay=overlay;overlay='scorecard';camera.setArmed(false);render();},'close-scorecard'(){overlay=returnOverlay;returnOverlay=null;render();},
 'next-hole'(){round=nextHole(round);camera.stop();save();if(round.phase==='results'){if(round.holeIds.length===9&&!round.practice){const best=Math.min(...round.players.map(totalScore));data.best=data.best?Math.min(data.best,best):best;save();}overlay='results';audio.play('win');render();}else enterGame();},
 'prev-club':()=>changeClub(-1),'next-club':()=>changeClub(1),'aim-left':()=>alterAim(-.025),'aim-right':()=>alterAim(.025),'reset-view':()=>scene.resetView(),
 swing(){if(skipClick){skipClick=false;return;}if(busy){skipShot();return;}shoot();},
 quick(){setup.courseMode='nine';setup.players=[{id:setup.players[0]?.id||data.profiles[0].id,input:'keyboard'}];startRound();},
 'toggle-input'(){if(busy)return;if(isCamera()){currentPlayer().profile.input='keyboard';camera.stop();save();render();}else{currentPlayer().profile.input='camera';overlay='camera';save();render();}},
 'camera-setup'(){camera.setArmed(false);overlay='camera';render();},'enable-camera':enableCamera,
 calibrate:()=>camera.calibrate(),
 'camera-ready'(){if(cameraStatus.calibrated){overlay=null;render();}},
 'keyboard-fallback'(){camera.stop();currentPlayer().profile.input='keyboard';overlay=null;save();render();},
};

app.addEventListener('click',event=>{
 const action=event.target.closest('[data-action]');if(action&&!action.disabled){audio.unlock();actions[action.dataset.action]?.();return;}
 const preset=event.target.closest('[data-preset]');if(preset){edited=structuredClone(PRESETS.find(p=>p.id===preset.dataset.preset));scene.setPlayer(edited);render();return;}
 const field=event.target.closest('[data-field]');if(field){edited.name=document.querySelector('#golfer-name').value.trim()||edited.name;edited[field.dataset.field]=field.dataset.value;scene.setPlayer(edited);render();return;}
 const mode=event.target.closest('[data-course-mode]');if(mode){setup.courseMode=mode.dataset.courseMode;render();return;}
 const hole=event.target.closest('[data-hole]');if(hole){setup.hole=Number(hole.dataset.hole);setup.courseMode='single';render();return;}
 const count=event.target.closest('[data-player-count]');if(count){const n=Number(count.dataset.playerCount);setup.players=Array.from({length:n},(_,i)=>setup.players[i]||{id:data.profiles[i%data.profiles.length].id,input:'keyboard'});render();}
});
app.addEventListener('input',event=>{
 const e=event.target;
 if(e.id==='power-slider'){power=clampPower(Number(e.value)/100);updateHud();}
 if(e.dataset.setting){const k=e.dataset.setting;data.settings[k]=e.type==='checkbox'?e.checked:e.tagName==='SELECT'?e.value:Number(e.value);audio.setSettings(data.settings);if(k==='quality')scene.setQuality(data.settings.quality);scene.setReducedMotion(data.settings.reducedMotion);document.body.classList.toggle('reduced-motion',data.settings.reducedMotion);save();}
 if(e.id==='camera-sensitivity'){data.settings.sensitivity=Number(e.value);camera.setOptions({sensitivity:data.settings.sensitivity});save();}
});
app.addEventListener('change',event=>{
 const e=event.target;
 if(e.dataset.playerIndex!==undefined){setup.players[Number(e.dataset.playerIndex)].id=e.value;render();}
 if(e.dataset.inputIndex!==undefined)setup.players[Number(e.dataset.inputIndex)].input=e.value;
 if(e.id==='saved-profile'){edited=structuredClone(data.profiles.find(p=>p.id===e.value));scene.setPlayer(edited);render();}
 if(e.id==='camera-hand'){data.settings.handedness=e.value;camera.setOptions({handedness:e.value});save();}
 if(e.id==='camera-reduced'){data.settings.gestureReduced=e.checked;camera.setOptions({reducedMotion:e.checked});save();}
 if(e.id==='camera-device'&&cameraStatus.state!=='idle')enableCamera();
});
app.addEventListener('pointerdown',event=>{if(event.target.closest('#swing')&&!isCamera()){event.preventDefault();audio.unlock();event.target.closest('#swing').setPointerCapture(event.pointerId);beginCharge(event.timeStamp);}});
app.addEventListener('pointerup',event=>{if(charging){skipClick=true;releaseCharge(event.timeStamp);}});
app.addEventListener('pointercancel',()=>{charging=null;updateHud();});
let orbit=null;
canvas.addEventListener('pointerdown',e=>{if(screen==='game'&&!overlay&&busy){skipShot();return;}if((screen==='game'&&!overlay&&!busy)||screen==='custom'){orbit={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(orbit){scene.orbit(e.clientX-orbit.x,e.clientY-orbit.y);orbit={x:e.clientX,y:e.clientY};}});
canvas.addEventListener('pointerup',()=>orbit=null);canvas.addEventListener('pointercancel',()=>orbit=null);
for(const name of ['next-hole','replay','restart']){
 const local=actions[name];
 actions[name]=()=>{
   const online=round?.online;
   if(net?.role==='guest'&&online){toast('Waiting for the host to continue');return;}
   local();
   if(net?.role==='host'&&online){round.online=true;save();net.lobby.broadcast({t:'sync',round});}
 };
}
for(const name of ['exit','menu']){
 const local=actions[name];
 actions[name]=()=>{if(net&&round?.online){net.lobby.close();net=null;}local();};
}
// Copy only known profile fields from a peer, with a local id, so nothing unvalidated reaches rendering.
const guestName=raw=>String(raw?.name??'').replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim().slice(0,24)||'Guest';
function guestProfile(raw,seat){
 const base=PRESETS[seat%PRESETS.length],picked=Object.fromEntries(Object.keys(base).map(k=>[k,raw?.[k]]));
 picked.id=`guest-${seat}`;picked.name=guestName(raw);
 return validProfile(picked)?picked:{...base,id:`guest-${seat}`,name:guestName(raw)};
}
function myProfile(){return data.profiles.find(p=>p.id===setup.players[0]?.id)||data.profiles[0];}
function lobbyNames(){return [myProfile().name,...net.lobby.guests.filter(g=>!g.gone).map(g=>guestName(g.profile))];}
function netError(message){
 if(net?.role==='guest'&&round?.online&&screen==='game'){net.lobby.close();net=null;announce(message,'You can finish the round on this device.','bad');return;}
 netUi={...netUi,mode:netUi.mode==='busy'?'choose':netUi.mode,error:message};if(screen!=='game'||overlay==='online'){overlay='online';render();}else announce(message,'','bad');
}
function onHostMessage(m,seat){
 if(m.t!=='swing'||!round?.online||round.activePlayer!==seat||screen!=='game'||overlay||busy||round.phase!=='playing')return;
 if(Number.isInteger(m.club)&&CLUBS[m.club])clubIndex=m.club;
 const a=Number(m.aim);if(!Number.isFinite(a))return;
 power=clampPower(Number(m.power)||0);aim=Math.atan2(Math.sin(a),Math.cos(a));scene.setAim(aim);shoot(true);
}
function onGuestMessage(m){
 if(m.t==='full')return netError('That lobby is full or already playing.');
 if(m.t==='lobby'){netUi={...netUi,mode:'joined',players:m.players};if(overlay==='online')render();return;}
 if(m.t==='start'){net.seat=m.seat;camera.stop();shotGeneration++;busy=false;round=m.round;save();enterGame();return;}
 if(m.t==='shot'&&round?.online&&screen==='game'&&!busy){overlay=null;playResult(m.result);return;}
 if(m.t==='sync'&&round?.online){shotGeneration++;busy=false;round=m.round;save();enterGame();}
}
window.addEventListener('keydown',event=>{
 if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
 if(event.key==='Escape'){event.preventDefault();if(screen==='game'){if(overlay==='pause')actions.continue();else if(!overlay)actions.pause();}return;}
 // Focused controls retain their native Space/Enter activation. A global swing
 // shortcut must never turn Pause, a club arrow, or a menu action into a shot.
 if(event.key===' '&&event.target.closest('button,a,[role="button"]')&&event.target.closest('button')?.id!=='swing')return;
 if((screen==='custom'||(screen==='game'&&!overlay&&!busy))&&['j','l','i','k'].includes(event.key.toLowerCase())){const key=event.key.toLowerCase();scene.orbit(key==='j'?-24:key==='l'?24:0,key==='i'?-12:key==='k'?12:0);return;}
 if(screen==='game'&&!overlay&&busy&&(event.key===' '||event.key==='Enter')&&!event.repeat){event.preventDefault();skipShot();return;}
 if(screen!=='game'||overlay||busy)return;
 if([' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();
 if(event.key===' '&&!event.repeat){audio.unlock();beginCharge(event.timeStamp);}
 if(event.key.toLowerCase()==='a'||event.key==='ArrowLeft')alterAim(-.025);
 if(event.key.toLowerCase()==='d'||event.key==='ArrowRight')alterAim(.025);
 if(event.key.toLowerCase()==='q')changeClub(-1);if(event.key.toLowerCase()==='e')changeClub(1);
 if(event.key==='ArrowUp'||event.key==='ArrowDown'){power=clampPower(power+(event.key==='ArrowUp'?.025:-.025));updateHud();}
});
window.addEventListener('keyup',event=>{if(event.key===' '&&charging){event.preventDefault();releaseCharge(event.timeStamp);}});
window.addEventListener('blur',()=>{charging=null;if(screen==='game'&&!overlay)actions.pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){camera.setArmed(false);audio.suspend();if(screen==='game'&&!overlay)actions.pause();}});
window.addEventListener('beforeunload',()=>{camera.stop();save();});
document.addEventListener('keydown',event=>{
 if(event.key!=='Tab'||!overlay)return;
 const nodes=[...app.querySelectorAll('.modal-backdrop button:not(:disabled),.modal-backdrop input,.modal-backdrop select')].filter(e=>e.offsetParent!==null);
 const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}
});

try{
 scene=new GolfScene(canvas,{onError:toast});scene.setHole(HOLES[0]);activeSceneHole=0;scene.setPlayer(data.profiles[0]);scene.setMode('menu');scene.setQuality(data.settings.quality);scene.setReducedMotion(data.settings.reducedMotion);window.__golfPerf=scene.perf;
 const inviteCode=normalizeCode(new URLSearchParams(location.search).get('join'));if(inviteCode){netUi={mode:'choose',joinCode:inviteCode};overlay='online';}
 render();document.querySelector('#loading').remove();
 let last=performance.now(),lastPreview=0;
 function frame(now){const dt=(now-last)/1000;last=now;
  if(charging&&now-charging.time>=HOLD_DELAY&&now-lastPreview>65){power=chargePower(now-charging.time);updateHud();lastPreview=now;}
  if(!(screen==='game'&&overlay&&busy))scene.update(dt);
  requestAnimationFrame(frame);
 }requestAnimationFrame(frame);
}catch(error){console.error(error);document.querySelector('#loading').innerHTML=`<strong>The 3D view couldn’t start.</strong><span>${escapeHtml(error.message)}</span><p>Try Chrome or Edge with hardware acceleration enabled.</p><button class="btn primary" onclick="location.reload()">Try again</button>`;}
