'use strict';
// Presentation only: accepted plotted aggregates and an explicitly schematic reveal.
(() => {
  const stats=data.figure4,bands=['0–<2','2–<4','4–<6','6–<8','8–10'];
  const maxCount=Math.max(...stats.counts.flat());
  const shade=n=>{const t=n/maxCount;return `rgb(${Math.round(246-215*t)},${Math.round(248-140*t)},${Math.round(242-160*t)})`;};
  document.getElementById('joint-grid').innerHTML='<table class="joint-table"><caption>Atomic Score bins (columns) × final Research Closure (rows)</caption><thead><tr><th scope="col">RC / Score</th>'+bands.map(b=>`<th scope="col">${b}</th>`).join('')+'</tr></thead><tbody>'+[4,3,2,1,0].map(rc=>`<tr><th scope="row">RC${rc}</th>${stats.counts[rc].map((n,col)=>`<td><button type="button" data-joint="${rc},${col}" aria-pressed="false" class="${col===4&&rc<4?'high-incomplete':''}" style="background:${shade(n)};color:${n/maxCount>.48?'#fff':'#254b3d'}" aria-label="RC${rc}, score ${bands[col]}: ${n} of ${stats.total} attempts, ${(100*n/stats.total).toFixed(2)} percent">${n?(100*n/stats.total).toFixed(1)+'%':'—'}</button></td>`).join('')}</tr>`).join('')+'</tbody></table>';
  document.getElementById('joint-grid').addEventListener('click',event=>{
    const b=event.target.closest('[data-joint]');if(!b)return;
    document.querySelectorAll('[data-joint]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    const [rc,col]=b.dataset.joint.split(',').map(Number),count=stats.counts[rc][col];
    document.getElementById('joint-selection').textContent=`RC${rc}, score ${bands[col]}: ${count} of ${stats.total} attempts (${(100*count/stats.total).toFixed(2)}% of the full benchmark).${col===4?' The high-score column contains 229 attempts; its cells do not use 229 as the percentage denominator.':''}`;
  });
  const dimensionNames={F:'Formulation',O:'Output',I:'Identification',M:'Mechanism'};
  document.getElementById('unmet-chart').innerHTML=Object.entries(dimensionNames).map(([dim,name])=>`<div class="unmet-row"><span>${name}</span><div>${['RC4','Non-RC4'].map(g=>`<div class="unmet-metric"><div class="unmet-track"><i style="width:${stats.unmet[g][dim]/25*100}%;background:${g==='RC4'?'#206c52':'#cf9553'}"></i></div><b>${stats.unmet[g][dim].toFixed(1)}%</b></div>`).join('')}</div></div>`).join('');
  const validationNames={honest_scope:'Scope justification',unconditional_material_validation:'Required validation',risk_triggered_material_validation:'Risk-linked validation'};
  document.getElementById('validation-bars').innerHTML=Object.entries(validationNames).map(([k,name])=>{const v=stats.validation[k],percent=100*v.recorded_conditional_completion_rate;return `<div class="validation-row"><span>${name}<small>${v.satisfied} / ${v.applicable} applicable criteria</small></span><div class="validation-track"><i style="width:${percent}%"></i></div><b>${percent.toFixed(1)}%</b></div>`;}).join('');

  const routes=[
    {key:'kimi',color:'#206c52',path:'M 65 283 C 175 263 252 220 360 190 S 528 115 622 44',label:'Kimi · final RC4',lx:645,ly:43},
    {key:'gpt',color:'#548497',path:'M 65 283 C 165 269 262 229 365 193 S 532 141 686 132',label:'GPT · final RC3',lx:697,ly:124},
    {key:'gemini',color:'#c77844',path:'M 65 283 C 175 271 266 245 346 218 S 425 252 505 264 S 671 269 810 262',label:'Gemini · final RC2',lx:671,ly:293}
  ];
  document.getElementById('pathway-scene').innerHTML=`<ol class="pathway-chapters" aria-label="Illustration reading chapters"><li>Numerical evidence</li><li>Physical interpretation</li><li>Applicability & scope</li></ol><svg class="pathway-svg" viewBox="0 0 900 325" role="img" aria-label="Editorial mountain illustration of three Case30 investigations with final outcomes Kimi RC4, GPT RC3 and Gemini RC2. Path geometry is not measured execution or intermediate grading."><path d="M 80 300 L 245 213 L 331 232 L 620 20 L 710 162 L 845 300 Z" fill="#e9eee4"/><path d="M 331 232 L 620 20 L 579 172 L 675 212 L 710 162 L 845 300 L 420 300 Z" fill="#e0e8dc"/><path d="M 620 20 L 710 162 L 672 151 L 650 105 L 629 114 L 602 80 L 565 108 Z" fill="#f8faf5"/>${routes.map(r=>`<path d="${r.path}" fill="none" stroke="${r.color}" stroke-opacity=".16" stroke-width="3"/><path class="revealed-route" data-route="${r.key}" d="${r.path}" fill="none" stroke="${r.color}" stroke-width="3.5" stroke-linecap="round"/><circle data-route-dot="${r.key}" r="6" fill="${r.color}" stroke="#fff" stroke-width="2"/><text x="${r.lx}" y="${r.ly}" fill="${r.color}" class="route-end-label">${r.label}</text>`).join('')}<circle cx="65" cy="283" r="7" fill="#fff" stroke="#829a8b" stroke-width="2"/><text x="49" y="314" class="route-start-label">Shared research goal</text></svg>`;
  const paths=routes.map(r=>({path:document.querySelector(`[data-route="${r.key}"]`),dot:document.querySelector(`[data-route-dot="${r.key}"]`)}));
  paths.forEach(r=>{r.length=r.path.getTotalLength();r.path.style.strokeDasharray=String(r.length);});
  const play=document.getElementById('pathway-play'),pause=document.getElementById('pathway-pause'),slider=document.getElementById('pathway-scrub');
  let position=1,running=false,frame=0,lastTime=0,lastChapter=-1;
  const chapterCopy=['Reading chapter: numerical evidence. The paths are editorial illustrations, not execution traces.','Reading chapter: interpretation. Compare correct identification with Gemini’s misread intensity trends.','Reading chapter: applicability. The GPT and Kimi examples differ in how the model’s physical scope was justified.'];
  function renderPosition(p){
    position=Math.max(0,Math.min(1,p));
    paths.forEach(r=>{r.path.style.strokeDashoffset=String(r.length*(1-position));const point=r.path.getPointAtLength(r.length*position);r.dot.setAttribute('cx',point.x);r.dot.setAttribute('cy',point.y);});
    slider.value=String(Math.round(position*100));slider.setAttribute('aria-valuetext',`${Math.round(position*100)}% of the illustration revealed; not research progress`);
    const chapter=Math.min(2,Math.floor(position*3));
    document.querySelectorAll('.pathway-chapters li').forEach((li,i)=>li.classList.toggle('active',i===chapter));
    if(chapter!==lastChapter||position===1){document.getElementById('pathway-status').textContent=position===1?'Complete illustration. Only final registered outcomes are shown; no intermediate RC is assigned.':chapterCopy[chapter];lastChapter=chapter;}
  }
  function stop(){running=false;cancelAnimationFrame(frame);pause.disabled=true;play.textContent=position<1?'Resume explanation':'Play explanation';}
  function finish(){stop();renderPosition(1);play.textContent='Replay explanation';}
  function tick(time){if(!running)return;const delta=Math.max(0,time-lastTime);lastTime=time;renderPosition(position+delta/4200);if(position>=1){finish();return;}frame=requestAnimationFrame(tick);}
  play.addEventListener('click',()=>{
    if(reduceMotion()){finish();document.getElementById('pathway-status').textContent='Reduced motion: complete illustration shown immediately. Final outcomes and evidence are unchanged.';return;}
    if(running)return;if(position>=1)renderPosition(0);running=true;lastTime=performance.now();pause.disabled=false;play.textContent='Playing…';frame=requestAnimationFrame(tick);
  });
  pause.addEventListener('click',()=>{stop();document.getElementById('pathway-status').textContent='Illustration paused. Resume, drag the illustration position, or show the complete figure.';});
  document.getElementById('pathway-skip').addEventListener('click',finish);
  slider.addEventListener('input',()=>{stop();renderPosition(Number(slider.value)/100);play.textContent=position<1?'Resume explanation':'Replay explanation';});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop();});
  window.PCB_FIGURES={finishAnimation:finish};renderPosition(1);
})();
