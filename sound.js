'use strict';

// Voices are synthesized locally so the garden also plays directly from index.html.
function createGardenSound(button){
  const Engine=window.AudioContext||window.webkitAudioContext;
  let context,master,noise,embers,brook,music,effects,nextBeat=0,beat=0,lastWater=-1;
  let stopDescent=null;
  let muted=false,started=false;
  try{muted=localStorage.getItem('moon-garden-muted')==='true';}catch{}
  function display(){
    const on=!!context&&started&&!muted;
    button.textContent=on?'소리 끄기':'소리 켜기';
    button.setAttribute('aria-pressed',String(on));
  }
  if(!Engine){button.hidden=true;return {play(){},water(){},reset(){}};}
  function bus(parent,level){
    const gain=context.createGain();gain.gain.value=level;gain.connect(parent);return gain;
  }
  function voice(source,destination,start,duration,level,attack,filter){
    const envelope=context.createGain(),end=start+duration;
    envelope.gain.setValueAtTime(.00001,start);
    envelope.gain.exponentialRampToValueAtTime(level,start+attack);
    envelope.gain.exponentialRampToValueAtTime(.00001,end);
    if(filter){source.connect(filter);filter.connect(envelope);}else source.connect(envelope);
    envelope.connect(destination);source.start(start);source.stop(end+.02);
    source.onended=()=>{source.disconnect();filter?.disconnect();envelope.disconnect();};
  }
  function tone(from,to,start,duration,level,type='sine',destination=effects,attack=.012){
    const osc=context.createOscillator();osc.type=type;
    osc.frequency.setValueAtTime(from,start);osc.frequency.exponentialRampToValueAtTime(to,start+duration);
    voice(osc,destination,start,duration,level,attack);
  }
  function filteredNoise(type,hz){
    const source=context.createBufferSource(),filter=context.createBiquadFilter();
    source.buffer=noise;source.loop=true;filter.type=type;filter.frequency.value=hz;filter.Q.value=.66;
    return [source,filter];
  }
  function rush(start,duration,from,to,level,attack=.012){
    const [source,filter]=filteredNoise('lowpass',from);
    filter.frequency.setValueAtTime(from,start);filter.frequency.exponentialRampToValueAtTime(to,start+duration);
    voice(source,effects,start,duration,level,attack,filter);
  }
  function descendingRock(t,remaining){
    const end=t+Math.max(.06,remaining),body=bus(effects,0);
    body.gain.setValueAtTime(0,t);
    body.gain.linearRampToValueAtTime(.76,t+.014);
    body.gain.linearRampToValueAtTime(1,end);
    const rumble=context.createOscillator(),bass=bus(body,.23);
    rumble.type='triangle';rumble.frequency.setValueAtTime(76,t);
    rumble.frequency.exponentialRampToValueAtTime(48,end);
    rumble.connect(bass);rumble.start(t);
    const [air,flare]=filteredNoise('lowpass',1200),wind=bus(body,.68);
    flare.frequency.setValueAtTime(1200,t);flare.frequency.exponentialRampToValueAtTime(3800,end);
    air.connect(flare);flare.connect(wind);air.start(t);
    const fire=context.createBufferSource(),crackle=bus(body,.38);
    fire.buffer=embers;fire.loop=true;fire.playbackRate.setValueAtTime(.80,t);
    fire.playbackRate.linearRampToValueAtTime(1.24,end);
    fire.connect(crackle);fire.start(t);
    // Keep the roar alive if a slow renderer takes longer to reach contact.
    stopDescent=()=>{
      const now=context.currentTime;
      const level=body.gain.value;
      body.gain.cancelScheduledValues(now);body.gain.setValueAtTime(level,now);
      body.gain.linearRampToValueAtTime(0,now+.035);
      for(const node of [rumble,air,fire])node.stop(now+.04);
      fire.onended=()=>{for(const node of [rumble,bass,air,flare,wind,fire,crackle,body])node.disconnect();};
      stopDescent=null;
    };
  }
  function ambience(type,hz,level){
    const [source,filter]=filteredNoise(type,hz),levelNode=bus(master,level);
    source.connect(filter);filter.connect(levelNode);source.start(0,.37);return levelNode;
  }
  const chords=[[50,57,62,65],[46,53,58,65],[53,60,65,69],[48,55,60,67]];
  const melody=[2,null,3,null,1,null,2,0,3,null,2,null,1,2,null,null];
  const hz=midi=>440*2**((midi-69)/12);
  function score(){
    if(context.state!=='running'||muted||document.hidden)return;
    const now=context.currentTime;
    if(nextBeat<now)nextBeat=now+.035;
    while(nextBeat<now+.24){
      const chord=chords[Math.floor(beat/8)%chords.length],note=melody[beat%melody.length];
      if(beat%8===0)for(const midi of chord){
        const f=hz(midi);tone(f,f,nextBeat,5.4,.034,'sine',music,.68);
      }
      if(note!==null){
        const f=hz(chord[note]+12);
        tone(f,f,nextBeat,1.4,.052,'sine',music);
        tone(f*2,f*2,nextBeat,.42,.012,'triangle',music);
      }
      nextBeat+=.64;beat++;
    }
  }
  function init(){
    context=new Engine();
    const compressor=context.createDynamicsCompressor();compressor.connect(context.destination);
    master=bus(compressor,.78);music=bus(master,.62);effects=bus(master,.87);
    noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
    const samples=noise.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    embers=context.createBuffer(1,context.sampleRate,context.sampleRate);
    const grit=embers.getChannelData(0),decay=Math.exp(-1/(.005*context.sampleRate));
    let spark=.65;
    for(let i=0;i<grit.length;i++){
      if(Math.random()<42/context.sampleRate)spark=.24+.71*Math.random();
      grit[i]=samples[i]*spark;spark*=decay;
    }
    ambience('lowpass',460,.086);brook=ambience('bandpass',1850,.009);
    window.setInterval(score,100);
  }
  function sync(){
    if(!context)return;
    if(muted||document.hidden){context.suspend().catch(()=>{});return;}
    context.resume().then(score).catch(()=>{});
  }
  function start(){
    if(muted||document.hidden)return;
    if(!context){try{init();}catch{button.hidden=true;return;}}
    started=true;display();sync();
  }
  for(const event of ['pointerdown','keydown','click'])window.addEventListener(event,e=>{
    if(!e.isTrusted||button.contains(e.target)||e.metaKey||e.altKey||e.ctrlKey)return;
    if(!started||context?.state!=='running')start();
  },true);
  button.onclick=()=>{
    muted=started&&!muted;
    try{localStorage.setItem('moon-garden-muted',String(muted));}catch{}
    if(muted){started=false;sync();}else start();
    display();
  };
  document.addEventListener('visibilitychange',sync);
  display();
  return {
    water(amount){
      if(!context||muted||Math.abs(amount-lastWater)<.012)return;
      lastWater=amount;
      brook.gain.setTargetAtTime(.009+.24*amount,context.currentTime,.52);
    },
    reset(){
      if(!context)return;
      stopDescent?.();
      // Detach scheduled spell tails from the previous duel.
      effects.disconnect();effects=bus(master,.87);
    },
    play(name,remaining){
      if(name==='impact')stopDescent?.();
      if(!context||muted||document.hidden)return;
      const t=context.currentTime;
      switch(name){
        case 'fall':
          stopDescent?.();descendingRock(t,remaining);break;
        case 'impact':
          rush(t,.30,5400,370,.62);tone(132,34,t,1.04,.60);
          rush(t+.04,1.55,680,72,.43,.042);break;
        case 'bolt':
          tone(370,930,t,.36,.13,'triangle');tone(610,390,t+.12,.38,.076);break;
        case 'hit':
          rush(t,.17,2400,270,.28);tone(155,66,t,.22,.18);break;
        case 'blink':
          rush(t,.31,400,3700,.20,.08);tone(970,420,t+.09,.38,.12);break;
        case 'warn':
          tone(91,135,t,.74,.17,'triangle',effects,.22);break;
        case 'quake':
          rush(t,.59,1600,150,.45);tone(102,39,t,.48,.43);break;
        case 'hurt':
          tone(235,93,t,.34,.15,'triangle');break;
        case 'win':case 'lose':{
          const notes=name==='win'?[62,65,69,74]:[62,58,53,50];
          notes.forEach((n,i)=>tone(hz(n),hz(n),t+i*.15,.74,.12));break;
        }
        case 'grass':rush(t,.105,980,170,.145);break;
        case 'stone':rush(t,.095,2300,540,.18);tone(190,85,t,.08,.065);break;
      }
    }
  };
}
