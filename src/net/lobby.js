// Online lobbies over PeerJS's public broker. The host is authoritative: guests send swing intents, the host simulates and broadcasts.
const ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PEER_PREFIX='bluebaygolf-';
export const MAX_GUESTS=3;
export const CODE_LENGTH=6;

export const lobbyCode=(rand=Math.random)=>Array.from({length:CODE_LENGTH},()=>ALPHABET[Math.floor(rand()*ALPHABET.length)]).join('');
export function normalizeCode(value){
 const code=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 return code.length===CODE_LENGTH&&[...code].every(c=>ALPHABET.includes(c))?code:null;
}
export function joinUrl(code,base){const url=new URL(base);url.search='';url.hash='';url.searchParams.set('join',code);return url.toString();}

const loadPeer=async()=>(await import('peerjs')).Peer;

export class Lobby{
 constructor({onMessage=()=>{},onPeers=()=>{},onError=()=>{},PeerImpl=null}={}){
  Object.assign(this,{onMessage,onPeers,onError,PeerImpl,guests:[],banned:new Set(),locked:false,peer:null,conn:null,code:null});
 }
 async host(){
  const Peer=this.PeerImpl||await loadPeer();
  for(let attempt=0;attempt<5;attempt++){
   const code=lobbyCode(),peer=new Peer(PEER_PREFIX+code);
   const opened=await new Promise(resolve=>{peer.on('open',()=>resolve(true));peer.on('error',e=>{if(e?.type==='unavailable-id')resolve(false);else{resolve(false);this.onError('Could not reach the lobby service. Check your connection and try again.');}});});
   if(!opened){peer.destroy();if(this.closed)return null;continue;}
   this.peer=peer;this.code=code;
   peer.on('connection',conn=>this.accept(conn));
   return code;
  }
  this.onError('Could not open a lobby. Try again.');return null;
 }
 accept(conn){
  conn.on('data',m=>{
   if(!m||typeof m!=='object')return;
   const guest=this.guests.find(g=>g.conn===conn);
   if(m.t==='hello'){
    if(guest)return;
    const key=typeof m.device==='string'&&/^[\w-]{8,64}$/.test(m.device)?m.device:conn.peer;
    if(this.banned.has(key)){conn.send({t:'kicked'});return;}
    if(this.locked||this.guests.filter(g=>!g.gone).length>=MAX_GUESTS){conn.send({t:'full'});return;}
    this.guests.push({conn,key,profile:m.profile,gone:false});this.onPeers();return;
   }
   if(guest&&!guest.gone)this.onMessage(m,this.guests.indexOf(guest)+1);
  });
  conn.on('close',()=>{
   const guest=this.guests.find(g=>g.conn===conn);if(!guest)return;
   if(this.locked)guest.gone=true;else this.guests.splice(this.guests.indexOf(guest),1);
   this.onPeers();
  });
 }
 async join(code){
  const Peer=this.PeerImpl||await loadPeer();
  this.code=code;this.peer=new Peer();
  this.peer.on('error',e=>this.onError(e?.type==='peer-unavailable'?`No lobby found for ${code}.`:'Connection problem. Try again.'));
  return new Promise(resolve=>{
   this.peer.on('open',()=>{
    const conn=this.peer.connect(PEER_PREFIX+code,{reliable:true});this.conn=conn;
    conn.on('open',()=>resolve(true));
    conn.on('data',m=>m&&typeof m==='object'&&this.onMessage(m,0));
    conn.on('close',()=>{if(!this.closed)this.onError('The host left the lobby.');});
   });
  });
 }
 send(message){if(this.conn?.open)this.conn.send(message);}
 sendTo(seat,message){const g=this.guests[seat-1];if(g&&!g.gone&&g.conn.open)g.conn.send(message);}
 broadcast(message){this.guests.forEach((g,i)=>this.sendTo(i+1,message));}
 kick(seat){
  const guest=this.guests[seat-1];if(!guest||guest.gone)return;
  this.banned.add(guest.key);guest.conn.send({t:'kicked'});setTimeout(()=>guest.conn.close(),400);
  if(this.locked)guest.gone=true;else this.guests.splice(seat-1,1);
  this.onPeers();
 }
 isPresent(seat){return seat===0||!!(this.guests[seat-1]&&!this.guests[seat-1].gone);}
 close(){this.closed=true;this.peer?.destroy();}
}
