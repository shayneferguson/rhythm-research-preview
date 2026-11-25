/* Playback-only tone controls; the original audio files remain untouched. */
window.RRAudioPlayer={create(audio,deck,tools){
 // Declare music playback before creating Web Audio (Safari/iOS).
 function playbackSession(){try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(e){}}
 playbackSession();
 const Context=window.AudioContext||window.webkitAudioContext;
 const values={bass:0,mid:0,treble:0,output:100,boost:0};
 let graph=null,bypassed=false,unavailable=!Context,frame=0,visible=true,meterVisible=true;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const scope=document.createElement('div');scope.className='rr-waveform';
 scope.innerHTML='<canvas tabindex="0" role="slider" aria-label="Track waveform, seek playback" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></canvas><span class="rr-wave-label">TRACK WAVEFORM</span>';
 deck.insertBefore(scope,deck.querySelector('.rr-transport'));
 const canvas=scope.querySelector('canvas'),pen=canvas.getContext('2d');
 let waveformData={},waveformFailed=false;
 fetch('assets/track-waveforms.json?v=1').then(r=>{if(!r.ok)throw Error('Waveforms unavailable');return r.json();}).then(data=>{waveformData=data;refresh();}).catch(()=>{waveformFailed=true;refresh();});
 function currentWaveform(){const src=audio.getAttribute('src')||'';return waveformData[src.split('/').pop().split('?')[0]];}
 let queuedSeek=null,metadataRequestedFor=null,dragPointer=null;
 function seekWave(fraction){
  const position=Math.max(0,Math.min(1,fraction)),src=audio.getAttribute('src');
  if(Number.isFinite(audio.duration)&&audio.duration>0){queuedSeek=null;audio.currentTime=position*audio.duration;}
  else{queuedSeek={src,position};if(metadataRequestedFor!==src){metadataRequestedFor=src;audio.preload='metadata';audio.load();}}
  refresh();
 }
 audio.addEventListener('loadedmetadata',()=>{if(queuedSeek?.src===audio.getAttribute('src')){const position=queuedSeek.position;queuedSeek=null;seekWave(position);}else queuedSeek=null;});
 let dragStart=null,dragging=false;
 function seekPointer(e){const rect=canvas.getBoundingClientRect();if(rect.width)seekWave(dragStart.position+(e.clientX-dragStart.x)/rect.width);}
 function finishDrag(e){if(e.pointerId!==dragPointer)return;dragPointer=null;dragStart=null;dragging=false;canvas.classList.remove('rr-scrubbing');if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
 canvas.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||dragPointer!==null)return;
  const rect=canvas.getBoundingClientRect(),duration=Number.isFinite(audio.duration)?audio.duration:currentWaveform()?.duration||0;
  const position=queuedSeek?.src===audio.getAttribute('src')?queuedSeek.position:duration?audio.currentTime/duration:0;
  // Only the playhead has a drag target. Touching the waveform never seeks.
  if(Math.abs(e.clientX-(rect.left+position*rect.width))>12)return;
  dragPointer=e.pointerId;dragStart={x:e.clientX,y:e.clientY,position};dragging=false;canvas.setPointerCapture(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  if(e.pointerId!==dragPointer)return;
  const dx=Math.abs(e.clientX-dragStart.x),dy=Math.abs(e.clientY-dragStart.y);
  if(!dragging){
   if(dy>6&&dy>=dx){finishDrag(e);return;}
   if(dx<6||dx<=dy)return;
   dragging=true;canvas.classList.add('rr-scrubbing');canvas.focus({preventScroll:true});
  }
  e.preventDefault();seekPointer(e);
 });
 canvas.addEventListener('pointerup',e=>{if(e.pointerId===dragPointer){if(dragging)seekPointer(e);finishDrag(e);}});
 canvas.addEventListener('pointercancel',finishDrag);
 canvas.addEventListener('lostpointercapture',finishDrag);
 canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||!Number.isFinite(audio.duration))return;e.preventDefault();seekWave(e.key==='Home'?0:e.key==='End'?1:(audio.currentTime+(e.key==='ArrowRight'?1:-1)*(e.shiftKey ? 0.1 : 5))/audio.duration);});

 const panel=document.createElement('section');panel.className='rr-tone';panel.setAttribute('aria-label','Audio processing');
 panel.innerHTML='<div class="rr-tone-heading"><span>TONE &amp; LEVEL</span><div><button type="button" class="rr-tone-bypass" aria-pressed="false">Bypass EQ</button><button type="button" class="rr-tone-reset">Reset</button></div></div><div class="rr-tone-sliders">'+Object.keys(values).map(key=>`<label class="rr-tone-control"><span>${key[0].toUpperCase()+key.slice(1)}<output>${key==='output'?'100%':'0 dB'}</output></span><input type="range" aria-orientation="vertical" aria-label="${key[0].toUpperCase()+key.slice(1)}" data-tone="${key}" min="${key==='output'||key==='boost'?0:-6}" max="${key==='output'?100:6}" step="${key==='output'?1:0.5}" value="${values[key]}"></label>`).join('')+'</div><p class="rr-tone-note" role="status"></p>';
 tools.append(panel);
 panel.querySelectorAll(".rr-tone-control").forEach(label=>label.insertAdjacentHTML("beforeend",'<i class="rr-tone-meter" aria-hidden="true"><i></i><b></b></i>'));
 const inputs=[...panel.querySelectorAll('input')],bypass=panel.querySelector('.rr-tone-bypass'),note=panel.querySelector('.rr-tone-note');
 function render(){
  for(const input of inputs){const key=input.dataset.tone,v=values[key],label=key==='output'?v+'%':(v>0?'+':'')+v+' dB';input.value=v;input.setAttribute('aria-valuetext',label);input.previousElementSibling.querySelector('output').textContent=label;input.disabled=unavailable||(bypassed&&['bass','mid','treble'].includes(key));}
  bypass.setAttribute('aria-pressed',String(bypassed));bypass.disabled=unavailable;
  panel.querySelector('.rr-tone-reset').disabled=unavailable;
  note.textContent=unavailable?'Tone controls are unavailable in this browser.':bypassed?'EQ bypassed · output and boost stay active.':'';

 }
 function smooth(param,value){const now=graph.context.currentTime;param.cancelScheduledValues(now);param.setTargetAtTime(value,now,.025);}
 function apply(){
  if(!graph?.level)return;
  for(const key of ['bass','mid','treble'])smooth(graph[key].gain,bypassed?0:values[key]);
  // Reserve headroom for boosts, without a compressor changing the music's dynamics.
  const boost=bypassed?0:['bass','mid','treble'].reduce((sum,key)=>sum+Math.max(0,values[key]),0);
  smooth(graph.level.gain,(values.output/100)*Math.pow(10,-boost/20));
  smooth(graph.boostGain.gain,Math.pow(10,values.boost/20));
 }
 function init(){
  if(graph||unavailable)return;
  let context,source;
  try{
   context=new Context();
   const bass=context.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=120;
   const mid=context.createBiquadFilter();mid.type='peaking';mid.frequency.value=1000;mid.Q.value=.7;
   const treble=context.createBiquadFilter();treble.type='highshelf';treble.frequency.value=8000;
   const level=context.createGain(),boostGain=context.createGain(),outputMeter=context.createAnalyser(),analyser=context.createAnalyser();analyser.fftSize=2048;outputMeter.fftSize=1024;
   bass.connect(mid);mid.connect(treble);treble.connect(level);level.connect(boostGain);boostGain.connect(analyser);analyser.connect(context.destination);
   const meterSink=context.createGain();meterSink.gain.value=0;meterSink.connect(context.destination);
   const meters=['lowpass','bandpass','highpass'].map((type,i)=>{const filter=context.createBiquadFilter();filter.type=type;filter.frequency.value=[250,1000,4000][i];filter.Q.value=.7;const meter=context.createAnalyser();meter.fftSize=1024;level.connect(filter);filter.connect(meter);meter.connect(meterSink);return meter;});
   level.connect(outputMeter);outputMeter.connect(meterSink);meters.push(outputMeter,analyser);
   source=context.createMediaElementSource(audio);source.connect(bass);
   context.addEventListener('statechange',refresh);
   graph={context,source,bass,mid,treble,level,boostGain,analyser,meterSink,meters,meterData:meters.map(n=>new Float32Array(n.fftSize)),peaks:[0,0,0,0,0],data:new Float32Array(analyser.fftSize)};apply();
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
  const wave=currentWaveform(),duration=Number.isFinite(audio.duration)?audio.duration:wave?.duration||0;
  const progress=queuedSeek?.src===audio.getAttribute('src')?queuedSeek.position:duration?Math.max(0,Math.min(1,audio.currentTime/duration)):0;
  canvas.setAttribute('aria-valuenow',String(Math.round(progress*100)));
  canvas.setAttribute('aria-valuetext',Math.floor(audio.currentTime||0)+' seconds of '+Math.floor(duration)+' seconds');
  scope.querySelector('.rr-wave-label').textContent=wave?'DRAG THE PLAYHEAD TO SEEK':waveformFailed?'WAVEFORM UNAVAILABLE':'LOADING WAVEFORM';
  if(wave){
   const columns=Math.max(1,Math.floor(width/2)),peaks=wave.peaks;
   for(let x=0;x<columns;x++){
    const from=Math.floor(x*peaks.length/columns),to=Math.max(from+1,Math.floor((x+1)*peaks.length/columns));let lo=0,hi=0;
    for(let i=from;i<Math.min(to,peaks.length);i++){lo=Math.min(lo,peaks[i][0]);hi=Math.max(hi,peaks[i][1]);}
    pen.fillStyle=x/columns<progress?'#333333':'#999999';
    const top=height/2-Math.min(1,hi)*height*.46,bottom=height/2-Math.max(-1,lo)*height*.46;
    pen.fillRect(x*width/columns,top,Math.max(1,width/columns-0.5),Math.max(1,bottom-top));
   }
   const headX=Math.max(0,Math.min(width-2,progress*width));
   pen.fillStyle='#151515';pen.fillRect(headX,0,2,height);
   pen.fillRect(Math.max(0,Math.min(width-8,headX-3)),0,8,6);
  }
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
 panel.querySelector('.rr-tone-reset').addEventListener('click',()=>{Object.assign(values,{bass:0,mid:0,treble:0,output:100,boost:0});bypassed=false;apply();render();refresh();});
 for(const event of ['play','playing','pause','ended','emptied','loadstart','loadedmetadata','durationchange','seeked','timeupdate'])audio.addEventListener(event,refresh);
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
