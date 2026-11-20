/* Page-owned zoom gestures are disabled; browser/OS accessibility stays external. */
(()=>{
  const prevent=e=>{if(e.cancelable)e.preventDefault();};
  const active={capture:true,passive:false};
  window.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)prevent(e);},active);
  window.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&(['+','=','-','_','0'].includes(e.key)||['NumpadAdd','NumpadSubtract','Numpad0'].includes(e.code)))prevent(e);
  },active);
  for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,prevent,active);
  for(const type of ['touchstart','touchmove'])document.addEventListener(type,e=>{if(e.touches.length>1)prevent(e);},active);
  document.addEventListener('dblclick',prevent,active);
})();
