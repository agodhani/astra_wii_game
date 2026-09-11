export class GolfAudio {
 constructor(){this.ctx=null;this.sound=.6;this.music=.25;this.notes=null;}
 unlock(){if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.ambient();}this.ctx.resume().catch(()=>{});}
 setSettings(s){this.sound=s.sound;this.music=s.music;if(this.musicGain)this.musicGain.gain.setTargetAtTime(this.music*.035,this.ctx.currentTime,.2);}
 tone(freq,duration,volume,type='sine',delay=0){if(!this.ctx||this.sound===0)return;const t=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(volume*this.sound,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain).connect(this.ctx.destination);osc.start(t);osc.stop(t+duration);}
 play(kind){if(kind==='shot'){this.tone(260,.13,.35,'triangle');this.tone(90,.12,.18,'sine',.02);}else if(kind==='ball')this.tone(500,.06,.12,'sine');else if(kind==='win'){[523,659,784,1046].forEach((n,i)=>this.tone(n,.6,.15,'sine',i*.12));}else this.tone(650,.05,.08);}
 ambient(){
  this.musicGain=this.ctx.createGain();this.musicGain.gain.value=this.music*.035;this.musicGain.connect(this.ctx.destination);
  // Original, quiet sustained coastal chord. No external copyrighted audio.
  [130.81,196,246.94,293.66].forEach((f,i)=>{const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=f;o.type='sine';g.gain.value=.25;o.connect(g).connect(this.musicGain);o.start();});
 }
 suspend(){this.ctx?.suspend();}
}
