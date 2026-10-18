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
    {key:'kimi',color:'#206c52',path:'M 70 434 C 145 427 210 396 270 389 C 420 349 575 245 760 90'},
    {key:'gpt',color:'#548497',path:'M 70 450 C 145 443 210 412 270 405 C 410 380 620 300 850 265'},
    {key:'gemini',color:'#c77844',path:'M 70 466 C 145 459 210 428 270 421 C 380 406 450 376 500 406 S 720 474 1000 436'}
  ];
  const scene=document.getElementById('pathway-scene');
  scene.innerHTML=`<svg class="pathway-svg flagged-pathway" viewBox="0 0 1100 530" role="img" aria-label="Three schematic evidence paths advance together from slightly separated starting points. Flags mark accomplishments; circled crosses mark Gemini's interpretation error, and a circled exclamation marks GPT's unresolved applicability concern. Only final RC outcomes are assigned."><path d="M 90 477 L 315 343 L 410 357 L 758 48 L 880 286 L 1040 477 Z" fill="#e9eee4"/><path d="M 410 357 L 758 48 L 711 225 L 837 324 L 880 286 L 1040 477 L 500 477 Z" fill="#dfe8da"/><path d="M 758 48 L 823 174 L 784 157 L 762 121 L 738 141 L 721 118 L 687 149 Z" fill="#f8faf5"/>${routes.map(r=>`<path d="${r.path}" fill="none" stroke="${r.color}" stroke-opacity=".11" stroke-width="2" stroke-dasharray="4 6"/><path class="revealed-route" data-route="${r.key}" d="${r.path}" fill="none" stroke="${r.color}" stroke-width="3.6" stroke-linecap="round"/><circle data-route-dot="${r.key}" r="6" fill="${r.color}" stroke="#fff" stroke-width="2"/>`).join('')}<g id="route-flags"></g><text x="48" y="510" class="route-start-label">Shared research goal · same binding energy</text></svg>`;
  const paths=routes.map(r=>({...r,path:scene.querySelector(`[data-route="${r.key}"]`),dot:scene.querySelector(`[data-route-dot="${r.key}"]`)}));
  paths.forEach(r=>{r.length=r.path.getTotalLength();r.path.style.strokeDasharray=String(r.length);});
  const commonTargets=[.25,.25,.25];
  const checkpoints=[
    {name:'Research goal',title:'What must the investigation explain?',body:'How does the attoclock offset change with intensity, and how far does a Coulomb scattering explanation extend to screened targets with the same binding energy?',targets:[0,0,0]},
    {name:'Computed offsets',title:'All three generated numerical evidence.',body:'Each investigation computed Coulomb and screened-potential offsets. Generating these outputs is an important accomplishment, but it does not by itself identify the correct trend or establish the physical explanation.',targets:commonTargets},
    {name:'Trend misread',title:'Gemini: the interpretation contradicts the computed trend.',body:'The report described all tested offsets as monotonically decreasing. Its saved λ = 1–3 curves rise, while λ = 5 and 10 rise and then fall. The circled cross marks this unresolved identification and mechanism requirement—not successful closure.',targets:[.45,.45,.45]},
    {name:'Identify response',title:'Kimi and GPT identified the screening-dependent response.',body:'Kimi corrected an angle-sign inconsistency; its two angle calculations then agreed to 4.53 × 10⁻⁷ rad. Both investigations identified the changes in the intensity response rather than merely producing the curves.',targets:[.48,.50,1]},
    {name:'Explain mechanism',title:'A trend needs a physical explanation.',body:'Kimi interpreted the response through tunnel-exit distance relative to screening length. GPT explained the competition between shorter exit distance and increasing electron momentum as intensity rises.',targets:[.74,.79,1]},
    {name:'Scope unresolved',title:'GPT: a separate high-field applicability concern remained.',body:'Its saved E₀ = 0.0800 a.u. exceeds the Coulomb-reference barrier-suppression threshold, 0.0625 a.u. A low Keldysh parameter does not resolve that separate risk. The threshold is not universal for screened targets; the final outcome is RC3.',targets:[.74,1,1]},
    {name:'Scope justified',title:'Kimi supported the conclusion within a justified scope.',body:'The report restricted physical interpretation to quasistatic, sub-barrier exits and labeled other regimes formal extensions. Two saved intensities within its stated Coulomb window, approximately 0.0065 < I < 0.0078 a.u., retain a screening contrast. Its final outcome is RC4.',targets:[1,1,1]}
  ];
  // Synchronized reading progress is illustrative, never execution timing.
  const checkpointProgress=[0,.25,.45,.60,.78,.92,1];
  checkpoints.forEach((c,i)=>{c.targets=paths.map(()=>checkpointProgress[i]);});
  const evidencePanels=[
    ['A shared physical question','Compare the offset Δφ(I) for a Coulomb potential and screened targets matched to the same binding energy. A numerical curve, its interpretation, and the physical limits of that interpretation are separate parts of the answer.'],
    ['Three recorded approaches','Kimi: constructed scattering calculations and checked two angle calculations. GPT: repaired its numerical solver and generated Coulomb and screened responses. Gemini: revised trajectory propagation and the angle convention, then generated offset scans.'],
    ['The saved curves versus the report','Gemini described all tested offsets as decreasing monotonically. The plotted λ = 2 curve rises; λ = 5 rises and turns over. This is an identification error, not a failure to generate numerical output.'],
    ['Numerical consistency is not physical applicability','Kimi found opposite angle signs from orbit integration and direct trajectory propagation. After correcting the convention, their discrepancy was 4.53 × 10⁻⁷ rad. That checks consistency; a separate argument is still needed to establish where the model applies.'],
    ['Two supported mechanism arguments','Kimi compared the tunnel-exit distance with the screening length. GPT balanced the shorter exit distance against increasing electron momentum as intensity rises. These are distinct physical explanations of the screening-dependent response, not merely descriptions of curve shape.'],
    ['An unresolved high-field diagnostic','The saved field exceeds a Coulomb-reference barrier-suppression threshold. The final report did not reconcile that warning with its favorable interpretation of the low-Keldysh-parameter regime. The mechanism was supported, but this applicability issue remained.'],
    ['A conclusion with a stated physical scope','Kimi restricted physical interpretation to quasistatic, sub-barrier exits. It labeled other regimes formal extensions. Two saved intensities inside the stated Coulomb window still showed a screening contrast, supporting the conclusion within that scope.']
  ];
  function checkpointEvidence(stage){
    if(stage===2)return `<div class="checkpoint-evidence"><span class="tiny-label">SUBMITTED DATA · EVALUATOR REPLOT</span>${curvePlot(true)}<p>All 100 samples per curve; straight connectors, no fit or smoothing. λ is the screening length. Highlights and this explanation are editorial, not candidate text.</p></div>`;
    if(stage===3)return '<div class="checkpoint-evidence"><span class="tiny-label">RECORDED CONSISTENCY CHECK</span><strong class="checkpoint-number">4.53 × 10<sup>−7</sup> <small>rad</small></strong><p>Angle discrepancy after correcting the convention between orbit integration and direct trajectory propagation.</p></div>';
    if(stage===5)return '<div class="checkpoint-evidence"><span class="tiny-label">RECORDED FIELD DIAGNOSTIC</span><div class="checkpoint-bar"><span>Saved E₀</span><i style="--bar:80%;--color:#c77844"></i><b>0.0800</b></div><div class="checkpoint-bar"><span>Coulomb E<sub>BSI</sub></span><i style="--bar:62.5%;--color:#739d9d"></i><b>0.0625</b></div><p>Fields in atomic units; common scale 0–0.10. This reference threshold is not universal for screened targets.</p></div>';
    if(stage===6)return '<div class="checkpoint-evidence"><span class="tiny-label">STATED COULOMB WINDOW</span><strong class="checkpoint-number window-number">0.0065 &lt; I &lt; 0.0078 <small>a.u.</small></strong><p>Two saved intensities inside the stated window retain a screening contrast. This is reported evidence, not a newly computed test.</p></div>';
    return '';
  }
  const flagSpecs=[
    {stage:1,route:0,color:'#206c52',label:['Scattering model'],dx:-155,dy:-28},
    {stage:1,route:1,color:'#548497',label:['Screened trajectories'],dx:-210,dy:30},
    {stage:1,route:2,color:'#c77844',label:['Computed offsets'],dx:-40,dy:68},
    {stage:2,route:2,color:'#c77844',label:['Trend misidentified'],dx:35,dy:42,issue:'error'},
    {stage:3,route:0,color:'#206c52',label:['Screening response'],dx:-170,dy:-32},
    {stage:3,route:1,color:'#548497',label:['Intensity response'],dx:-100,dy:50},
    {stage:4,route:0,color:'#206c52',label:['Exit distance vs','screening length'],dx:-175,dy:-40},
    {stage:4,route:1,color:'#548497',label:['Exit distance &','electron momentum'],dx:-70,dy:50},
    {stage:5,route:1,color:'#548497',label:['High-field limit','unresolved'],dx:32,dy:-20,issue:'caution'},
    {stage:6,route:0,color:'#206c52',label:['Applicability','justified'],dx:30,dy:-10},
    {stage:6,route:2,color:'#c77844',label:['Incomplete closure'],dx:-180,dy:45,issue:'error',inspect:2}
  ];
  const flags=document.getElementById('route-flags');
  flags.innerHTML=flagSpecs.map((f,i)=>{const p=paths[f.route].path.getPointAtLength(paths[f.route].length*checkpointProgress[f.stage]);const icon=f.issue?`<g class="marker-icon issue-icon ${f.issue}"><circle class="issue-ring" r="11" fill="#fafbf7" stroke="${f.color}" stroke-width="2.5"/>${f.issue==='error'?`<path d="M -4 -4 L 4 4 M -4 4 L 4 -4" fill="none" stroke="${f.color}" stroke-width="2.5" stroke-linecap="round"/>`:`<text y="5" text-anchor="middle" fill="${f.color}" font-size="16" font-family="Arial" font-weight="bold">!</text>`}</g>`:`<g class="marker-icon flag-icon"><path d="M 0 0 L 0 -30" stroke="${f.color}" stroke-width="2"/><path d="M 0 -30 L 26 -24 L 0 -16 Z" fill="${f.color}"/></g>`;return `<g class="route-flag ${f.issue?'warning-flag':''}" data-flag="${i}" data-checkpoint="${f.inspect??f.stage}" transform="translate(${p.x} ${p.y})" role="button" tabindex="-1" aria-hidden="true" aria-label="${esc(checkpoints[f.inspect??f.stage].title)}"><circle r="3" fill="${f.color}"/>${icon}<text x="${f.dx}" y="${f.dy}" fill="${f.color}" class="checkpoint-label">${f.label.map((line,n)=>`<tspan x="${f.dx}" dy="${n?18:0}">${line}</tspan>`).join('')}</text></g>`;}).join('');
  const flagElements=[...flags.children];
  const miniPlots=[
    {stage:3,title:'Screening response',label:'Kimi · qualitative response curves',svg:'<path d="M 24 37 C 77 40 143 43 222 45" stroke="#244839"/><path d="M 24 47 C 80 47 145 46 222 45" stroke="#206c52"/><path d="M 24 60 C 82 53 146 48 222 45" stroke="#4c9b78"/><path d="M 24 88 C 85 61 151 50 222 45" stroke="#83bda1"/>',caption:'Different screening-dependent responses approach one another in the illustration.'},
    {stage:3,title:'Intensity response',label:'GPT · qualitative rising and turning-over response',svg:'<path d="M 24 89 C 79 78 120 30 162 34 S 200 43 222 49" stroke="#548497"/><circle cx="162" cy="34" r="3.5" fill="#fafbf7" stroke="#548497" stroke-width="2"/>',caption:'The rising and turning-over shape is a schematic, not a new numerical curve.'},
    {stage:2,title:'Trend misinterpretation',label:'Gemini · claimed decrease versus rising or turning-over behavior',svg:'<path d="M 24 37 C 90 43 156 47 222 50" stroke="#647570" stroke-dasharray="4 3"/><path d="M 24 80 C 83 60 143 57 222 52" stroke="#c77844"/><path d="M 24 86 C 93 79 139 41 174 53 S 208 65 222 65" stroke="#dda878"/>',caption:'Dashed: the reported decrease. Orange: the rising or turning-over behavior the report missed.'}
  ];
  scene.insertAdjacentHTML('afterend',`<div class="pathway-miniatures" aria-label="Schematic result insets adapted from the paper illustration">${miniPlots.map((m,i)=>`<button type="button" class="pathway-miniature" data-mini-stage="${m.stage}"><span class="mini-title">${m.title}</span><svg viewBox="0 0 250 120" role="img" aria-label="${esc(m.label)}"><path d="M 24 22 V 96 H 226" fill="none" stroke="#a7b9ab" stroke-width="1"/><text x="9" y="18">Δφ</text><text x="230" y="112">I</text><g class="schematic-curves" fill="none" stroke-width="2">${m.svg}</g></svg><span class="mini-caption">${m.caption}</span></button>`).join('')}</div><p class="mini-disclosure">Schematic result insets adapted from the paper illustration—not submitted data or quantitative evidence. Select an inset to inspect its evidence checkpoint.</p>`);
  const miniatureElements=[...document.querySelectorAll('[data-mini-stage]')];
  document.getElementById('pathway-milestones').innerHTML=checkpoints.map((c,i)=>`<button type="button" data-pathway-stage="${i}" aria-pressed="${i===0}">${i} · ${c.name}</button>`).join('');
  const play=document.getElementById('pathway-play'),pause=document.getElementById('pathway-pause'),slider=document.getElementById('pathway-scrub');
  const STEP_MS=2600,MOVE_MS=750,DURATION=STEP_MS*(checkpoints.length-1);
  let position=0,running=false,frame=0,lastTime=0,completed=0;
  function selectCheckpoint(stage){
    const c=checkpoints[stage];
    const evidence=checkpointEvidence(stage),detail=evidencePanels[stage];
    document.getElementById('pathway-checkpoint').classList.toggle('with-evidence',Boolean(evidence));
    document.getElementById('pathway-checkpoint').innerHTML=`<div class="checkpoint-copy"><span class="tiny-label">EVIDENCE CHECKPOINT · EDITORIAL SUMMARY</span><h4>${c.title}</h4><p>${esc(c.body)}</p><details class="checkpoint-detail"><summary>${esc(detail[0])}</summary><p>${esc(detail[1])}</p></details></div>${evidence}`;
    document.querySelectorAll('[data-pathway-stage]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.pathwayStage)===stage)));
  }
  function renderPosition(p){
    position=Math.max(0,Math.min(1,p));
    const scaled=position*(checkpoints.length-1),segment=Math.min(checkpoints.length-2,Math.floor(scaled));
    const travel=position===1?1:Math.min(1,(scaled-segment)*STEP_MS/MOVE_MS);
    const eased=travel*travel*(3-2*travel),reached=segment+(travel>=1?1:0);
    paths.forEach((r,i)=>{const t=checkpoints[segment].targets[i]+(checkpoints[segment+1].targets[i]-checkpoints[segment].targets[i])*eased;r.path.style.strokeDashoffset=String(r.length*(1-t));const point=r.path.getPointAtLength(r.length*t);r.dot.setAttribute('cx',point.x);r.dot.setAttribute('cy',point.y);});
    flagElements.forEach((el,i)=>{const visible=flagSpecs[i].stage<=reached;el.classList.toggle('planted',visible);el.setAttribute('aria-hidden',String(!visible));el.setAttribute('tabindex',visible?'0':'-1');if(visible&&flagSpecs[i].stage>completed&&running&&!reduceMotion())el.querySelector('.marker-icon').animate([{opacity:0,transform:'translateY(-10px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out'});});
    miniatureElements.forEach(el=>{const visible=Number(el.dataset.miniStage)<=reached;el.classList.toggle('revealed',visible);el.querySelector('.schematic-curves').setAttribute('aria-hidden',String(!visible));});
    slider.value=String(Math.round(position*100));slider.setAttribute('aria-valuetext',`${Math.round(position*100)}% of the guided illustration; not execution progress`);
    if(reached!==completed){completed=reached;selectCheckpoint(completed);}
    document.getElementById('pathway-status').textContent=position===0?(reduceMotion()?'Reduced motion is enabled. Nothing plays automatically; press Play to explicitly watch this guided path.':'Ready: three paths advance together. Flags mark accomplishments; × marks a misinterpretation and ! an unresolved applicability concern.'):position===1?'Complete illustration: eight accomplishment flags and three issue markers. Final outcomes are unchanged; no intermediate RC is assigned.':travel<1?`All three paths are moving to reading checkpoint ${segment+1}: ${checkpoints[segment+1].name}. This is not execution chronology.`:`Checkpoint ${reached}: ${checkpoints[reached].name}. Pause to inspect the evidence; all three paths resume together.`;
  }
  function stop(){running=false;cancelAnimationFrame(frame);pause.disabled=true;play.disabled=false;play.textContent=position===0?'Play guided path':position<1?'Resume guided path':'Replay guided path';}
  function finish(){stop();renderPosition(1);play.textContent='Replay guided path';}
  function tick(time){if(!running)return;const delta=Math.max(0,time-lastTime);lastTime=time;renderPosition(position+delta/DURATION);if(position>=1){finish();return;}frame=requestAnimationFrame(tick);}
  play.addEventListener('click',()=>{
    if(running)return;if(position>=1){renderPosition(0);selectCheckpoint(0);}running=true;lastTime=performance.now();pause.disabled=false;play.disabled=true;play.textContent='Following evidence…';frame=requestAnimationFrame(tick);
  });
  pause.addEventListener('click',()=>{stop();document.getElementById('pathway-status').textContent='Paused. Inspect a planted flag, resume, or show all checkpoints.';});
  document.getElementById('pathway-skip').addEventListener('click',finish);
  slider.addEventListener('input',()=>{stop();renderPosition(Number(slider.value)/100);play.textContent=position<1?'Resume guided path':'Replay guided path';});
  function jumpTo(stage){stop();renderPosition(stage===0?0:(stage-1+MOVE_MS/STEP_MS+.001)/(checkpoints.length-1));selectCheckpoint(stage);}
  document.getElementById('pathway-milestones').addEventListener('click',e=>{const b=e.target.closest('[data-pathway-stage]');if(b)jumpTo(Number(b.dataset.pathwayStage));});
  document.querySelector('.pathway-miniatures').addEventListener('click',e=>{const b=e.target.closest('[data-mini-stage]');if(b)jumpTo(Number(b.dataset.miniStage));});
  function inspectFlag(e){const el=e.target.closest('[data-checkpoint]');if(!el||el.getAttribute('aria-hidden')==='true')return;stop();selectCheckpoint(Number(el.dataset.checkpoint));document.getElementById('pathway-status').textContent='Selected a recorded evidence checkpoint. Its description does not change the final grade.';}
  flags.addEventListener('click',inspectFlag);flags.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspectFlag(e);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop();});
  window.PCB_FIGURES={finishAnimation:finish,pauseAnimation:stop};selectCheckpoint(0);renderPosition(0);
})();
