import test from 'node:test';
import assert from 'node:assert/strict';
import {Lobby,lobbyCode,normalizeCode,joinUrl,PEER_PREFIX} from '../src/net/lobby.js';

// In-memory stand-in for PeerJS: peers find each other by id and exchange messages synchronously.
function fakeNetwork(){
 const peers=new Map();let anon=0;
 const emitter=()=>{const h={};return {on(e,f){(h[e]??=[]).push(f);},emit(e,...a){(h[e]||[]).forEach(f=>f(...a));}};};
 class Conn{constructor(){Object.assign(this,emitter());this.open=false;}send(m){this.other.emit('data',structuredClone(m));}close(){this.open=this.other.open=false;this.emit('close');this.other.emit('close');}}
 class Peer{
  constructor(id){Object.assign(this,emitter());this.id=id??`anon-${anon++}`;
   queueMicrotask(()=>{if(peers.has(this.id))return this.emit('error',{type:'unavailable-id'});peers.set(this.id,this);this.emit('open');});}
  connect(id){const a=new Conn(),b=new Conn();a.other=b;b.other=a;a.peer=id;b.peer=this.id;const host=peers.get(id);
   queueMicrotask(()=>{if(!host)return this.emit('error',{type:'peer-unavailable'});a.open=b.open=true;host.emit('connection',b);a.emit('open');});return a;}
  destroy(){peers.delete(this.id);}
 }
 return {Peer,peers};
}

test('codes avoid ambiguous characters and normalise user input', () => {
 for(let i=0;i<200;i++)assert.match(lobbyCode(),/^[A-HJKMNP-Z2-9]{6}$/);
 assert.equal(normalizeCode(' ab-c d e9 '),'ABCDE9');assert.equal(normalizeCode('AB0DEF'),null);assert.equal(normalizeCode('ABCD'),null);
 assert.equal(joinUrl('ABCDEF','https://x.test/golf/?beat=3#h'),'https://x.test/golf/?join=ABCDEF');
});

test('guests join a hosted lobby, get seats and route swings to the host', async () => {
 const {Peer,peers}=fakeNetwork(),hostMsgs=[],guestMsgs=[];
 const host=new Lobby({PeerImpl:Peer,onMessage:(m,seat)=>hostMsgs.push([m,seat])});
 const code=await host.host();assert.ok(peers.has(PEER_PREFIX+code));
 const guest=new Lobby({PeerImpl:Peer,onMessage:m=>guestMsgs.push(m)});
 assert.equal(await guest.join(code),true);
 guest.send({t:'hello',profile:{name:'Kai'}});
 assert.equal(host.guests.length,1);assert.equal(host.guests[0].profile.name,'Kai');
 guest.send({t:'swing',club:2,power:.7,aim:.1});
 assert.deepEqual(hostMsgs,[[{t:'swing',club:2,power:.7,aim:.1},1]]);
 host.broadcast({t:'shot',result:{total:12}});assert.deepEqual(guestMsgs,[{t:'shot',result:{total:12}}]);
 host.locked=true;guest.conn.close();
 assert.equal(host.isPresent(1),false);assert.equal(host.isPresent(0),true);
});

test('a full or started lobby turns new guests away and unknown codes report an error', async () => {
 const {Peer}=fakeNetwork(),host=new Lobby({PeerImpl:Peer});const code=await host.host();
 host.locked=true;const late=[],g=new Lobby({PeerImpl:Peer,onMessage:m=>late.push(m)});await g.join(code);g.send({t:'hello',profile:{name:'Late'}});
 assert.deepEqual(late,[{t:'full'}]);assert.equal(host.guests.length,0);
 const errors=[],lost=new Lobby({PeerImpl:Peer,onError:e=>errors.push(e)});lost.join('ZZZZZZ');
 await new Promise(r=>setTimeout(r,5));assert.deepEqual(errors,['No lobby found for ZZZZZZ.']);
});

test('the host can remove a golfer, who is told and cannot rejoin from the same device', async () => {
 const {Peer}=fakeNetwork(),peers=[];const host=new Lobby({PeerImpl:Peer,onPeers:()=>peers.push(host.guests.length)});const code=await host.host();
 const got=[],g=new Lobby({PeerImpl:Peer,onMessage:m=>got.push(m)});await g.join(code);g.send({t:'hello',profile:{name:'Rando'}});
 assert.equal(host.guests.length,1);
 host.kick(1);
 assert.equal(host.guests.length,0);assert.deepEqual(got,[{t:'kicked'}]);assert.deepEqual(peers,[1,0]);
 g.send({t:'hello',profile:{name:'Rando'}});
 assert.equal(host.guests.length,0);assert.deepEqual(got,[{t:'kicked'},{t:'kicked'}]);
 await new Promise(r=>setTimeout(r,450));
});
