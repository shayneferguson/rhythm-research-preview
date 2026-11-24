/* Playback-only tone controls; the original audio files remain untouched. */
window.RRAudioPlayer={create(audio,deck,tools){
 // Declare music playback before creating Web Audio (Safari/iOS).
 function playbackSession(){try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(e){}}
 playbackSession();
 const Context=window.AudioContext||window.webkitAudioContext;
 const values={bass:0,mid:0,treble:0,output:100};
 let graph=null,bypassed=false,unavailable=!Context,frame=0,visible=true,meterVisible=true;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const scope=document.createElement('div');scope.className='rr-waveform';
 scope.innerHTML='<canvas aria-hidden="true"></canvas><span class="rr-wave-label">LIVE WAVEFORM</span>';
 deck.insertBefore(scope,deck.querySelector('.rr-transport'));
 const canvas=scope.querySelector('canvas'),pen=canvas.getContext('2d');
 const panel=document.createElement('section');panel.className='rr-tone';panel.setAttribute('aria-label','Audio processing');
 panel.innerHTML='<div class="rr-tone-heading"><span>TONE &amp; LEVEL</span><div><button type="button" class="rr-tone-bypass" aria-pressed="false">Bypass EQ</button><button type="button" class="rr-tone-reset">Reset</button></div></div><div class="rr-tone-sliders">'+Object.keys(values).map(key=>`<label class="rr-tone-control"><span>${key[0].toUpperCase()+key.slice(1)}<output>${key==='output'?'100%':'0 dB'}</output></span><input type="range" aria-orientation="vertical" aria-label="${key[0].toUpperCase()+key.slice(1)}" data-tone="${key}" min="${key==='output'?0:-6}" max="${key==='output'?100:6}" step="${key==='output'?1:0.5}" value="${values[key]}"></label>`).join('')+'</div><p class="rr-tone-note" role="status"></p>';
 tools.append(panel);
 panel.querySelectorAll(".rr-tone-control").forEach(label=>label.insertAdjacentHTML("beforeend",'<i class="rr-tone-meter" aria-hidden="true"><i></i><b></b></i>'));
 const inputs=[...panel.querySelectorAll('input')],bypass=panel.querySelector('.rr-tone-bypass'),note=panel.querySelector('.rr-tone-note');
 function render(){
  for(const input of inputs){const key=input.dataset.tone,v=values[key],label=key==='output'?v+'%':(v>0?'+':'')+v+' dB';input.value=v;input.setAttribute('aria-valuetext',label);input.previousElementSibling.querySelector('output').textContent=label;input.disabled=unavailable||(bypassed&&key!=='output');}
  bypass.setAttribute('aria-pressed',String(bypassed));bypass.disabled=unavailable;
  panel.querySelector('.rr-tone-reset').disabled=unavailable;
  note.textContent=unavailable?'Tone controls and waveform are unavailable in this browser.':bypassed?'EQ bypassed · output level stays active.':'';
  scope.querySelector('.rr-wave-label').textContent=unavailable?'WAVEFORM UNAVAILABLE':'LIVE WAVEFORM';
 }
 function smooth(param,value){const now=graph.context.currentTime;param.cancelScheduledValues(now);param.setTargetAtTime(value,now,.025);}
 function apply(){
  if(!graph?.level)return;
  for(const key of ['bass','mid','treble'])smooth(graph[key].gain,bypassed?0:values[key]);
  // Reserve headroom for boosts, without a compressor changing the music's dynamics.
  const boost=bypassed?0:['bass','mid','treble'].reduce((sum,key)=>sum+Math.max(0,values[key]),0);
  smooth(graph.level.gain,(values.output/100)*Math.pow(10,-boost/20));
 }
 function init(){
  if(graph||unavailable)return;
  let context,source;
  try{
   context=new Context();
   const bass=context.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=120;
   const mid=context.createBiquadFilter();mid.type='peaking';mid.frequency.value=1000;mid.Q.value=.7;
   const treble=context.createBiquadFilter();treble.type='highshelf';treble.frequency.value=8000;
   const level=context.createGain(),analyser=context.createAnalyser();analyser.fftSize=2048;
   bass.connect(mid);mid.connect(treble);treble.connect(level);level.connect(analyser);analyser.connect(context.destination);
   const meterSink=context.createGain();meterSink.gain.value=0;meterSink.connect(context.destination);
   const meters=['lowpass','bandpass','highpass'].map((type,i)=>{const filter=context.createBiquadFilter();filter.type=type;filter.frequency.value=[250,1000,4000][i];filter.Q.value=.7;const meter=context.createAnalyser();meter.fftSize=1024;level.connect(filter);filter.connect(meter);meter.connect(meterSink);return meter;});
   meters.push(analyser);
   source=context.createMediaElementSource(audio);source.connect(bass);
   context.addEventListener('statechange',refresh);
   graph={context,source,bass,mid,treble,level,analyser,meterSink,meters,meterData:meters.map(n=>new Float32Array(n.fftSize)),peaks:[0,0,0,0],data:new Float32Array(analyser.fftSize)};apply();
  }catch(error){
   // If rerouting already happened, retain a direct audible path.
   if(source){source.disconnect();source.connect(context.destination);graph={context,source};}
   else if(context)context.close().catch(()=>{});
   unavailable=true;render();
  }
 }
 function draw(){
  frame=0;if(!pen)return;
  const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  pen.setTransform(dpr,0,0,dpr,0,0);pen.clearRect(0,0,width,height);
  const active=graph?.analyser&&graph.context.state==='running'&&!audio.paused&&!audio.ended&&!document.hidden&&(visible||meterVisible);
  pen.strokeStyle=active?'#ff6b2c':'#ff6b2c66';pen.lineWidth=1.5;pen.lineJoin='round';pen.beginPath();
  if(active){
   graph.analyser.getFloatTimeDomainData(graph.data);
   // A real time-domain trace, downsampled to one point per CSS pixel.
   const points=Math.max(2,Math.floor(width));
   for(let x=0;x<points;x++){const sample=graph.data[Math.floor(x*(graph.data.length-1)/(points-1))];const y=height/2-Math.max(-1,Math.min(1,sample))*height*.44;x?pen.lineTo(x,y):pen.moveTo(x,y);}
  }else{pen.moveTo(0,height/2);pen.lineTo(width,height/2);}
  pen.stroke();
  panel.querySelectorAll('.rr-tone-meter').forEach((meter,i)=>{
   let level=0,peak=0;
   if(active){const data=graph.meterData[i];graph.meters[i].getFloatTimeDomainData(data);let sum=0;for(const sample of data){sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}level=Math.max(0,Math.min(1,(20*Math.log10(Math.sqrt(sum/data.length)||1e-6)+60)/60));peak=Math.max(0,Math.min(1,(20*Math.log10(peak||1e-6)+60)/60));graph.peaks[i]=Math.max(peak,graph.peaks[i]-.008);}
   else if(graph?.peaks)graph.peaks[i]=0;
   meter.firstElementChild.style.height=(level*100)+'%';meter.lastElementChild.style.bottom=((graph?.peaks?.[i]||0)*100)+'%';meter.lastElementChild.style.opacity=active?'1':'0';
  });
  if(active&&!motion.matches)frame=requestAnimationFrame(draw);
 }
 function refresh(){cancelAnimationFrame(frame);frame=0;draw();}
 inputs.forEach(input=>input.addEventListener('input',()=>{values[input.dataset.tone]=Number(input.value);apply();render();refresh();}));
 bypass.addEventListener('click',()=>{bypassed=!bypassed;apply();render();refresh();});
 panel.querySelector('.rr-tone-reset').addEventListener('click',()=>{Object.assign(values,{bass:0,mid:0,treble:0,output:100});bypassed=false;apply();render();refresh();});
 for(const event of ['play','playing','pause','ended','emptied','seeked','timeupdate'])audio.addEventListener(event,refresh);
 document.addEventListener('visibilitychange',()=>{refresh();if(!document.hidden&&graph&&!audio.paused&&graph.context.state!=='running')graph.context.resume().catch(()=>{});});motion.addEventListener('change',refresh);
 if(window.ResizeObserver)new ResizeObserver(refresh).observe(canvas);
 if(window.IntersectionObserver){const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.target===scope)visible=entry.isIntersecting;else meterVisible=entry.isIntersecting;}refresh();});observer.observe(scope);observer.observe(panel);}
 render();refresh();
 return {play(){
  playbackSession();init();
  // Start both in the original tap/click gesture, including Safari's resume path.
  const resume=graph&&graph.context.state!=='running'?graph.context.resume():Promise.resolve();
  const playing=audio.play();
  return Promise.all([resume,playing]).then(()=>{refresh();}).catch(error=>{audio.pause();throw error;});
 }};
}};
