'use strict';
const data = window.PCB_DATA;
const colors = ['#d9dfdd', '#b2bfbb', '#e3bc72', '#72a999', '#206c52'];
const systemMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let manualReduce = false, repeatEndpoint = 'once', currentInvestigation = 'gemini', caseStage = 0;
const reduceMotion = () => manualReduce || systemMotion.matches;
function finishMotion(scope=document) { scope.getAnimations({subtree:true}).forEach(a=>{try{a.finish();}catch{a.cancel();}}); }
function updateMotion() {
  const reduced=reduceMotion();
  document.documentElement.classList.toggle('reduce-motion',reduced);
  const input=document.getElementById('reduce-motion');input.checked=reduced;input.disabled=systemMotion.matches;
  document.getElementById('motion-note').textContent=reduced?'Reduced motion: automatic effects are off. The guided path plays only when you press Play.':'Animations are brief, user-controlled explanations—not execution replays.';
  if(reduced){finishMotion();window.PCB_FIGURES?.pauseAnimation();}
}
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderChart(mode) {
  const repeat = mode === 'repeat';
  const overview = mode === 'overview';
  document.getElementById('repeat-controls').hidden=!repeat;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  document.getElementById('chart-description').textContent = repeat ? 'Closure on a task at least once is not the same as closure in all three independent runs.' : overview ? 'Two separate metrics, shown side by side—not a conversion from points to closure.' : '150 final scored attempts per model. Mean Atomic Score and RC distribution are separate measures.';
  document.getElementById('chart-legend').innerHTML = overview ? '<span><i class="swatch" style="background:#90aab4"></i>Mean Atomic Score</span><span><i class="swatch" style="background:#206c52"></i>Complete closure (RC4)</span>' : repeat ? '<span>○ RC4 in all three runs</span><span>● RC4 in at least one run</span>' : colors.map((c,i) => `<span><i class="swatch" style="background:${c}"></i>RC${i}</span>`).join('');
  const target = document.getElementById('model-chart');
  target.classList.toggle('overview-chart', overview);
  const head = overview ? '<div class="overview-row overview-head"><span>Model</span><span>Mean Atomic Score <small>0–10 points</small></span><span>RC4 attempts <small>0–100%</small></span></div>' : `<div class="chart-row chart-label"><span>Model</span><span>Mean /10</span><span>${repeat ? 'Tasks reaching RC4 · scale 0–50%' : 'All 150 attempts · scale 0–100%'}</span><span>${repeat ? 'All / ≥1' : 'RC4'}</span></div>`;
  document.getElementById('model-chart').innerHTML = head + data.models.map(m => {
    if(overview) return `<div class="overview-row"><span class="model-name">${esc(m.name)}</span><div class="metric-cell"><div class="metric-track"><span style="width:${m.mean*10}%;background:#90aab4"></span></div><strong>${m.mean.toFixed(2)}</strong></div><div class="metric-cell"><div class="metric-track"><span style="width:${m.rc[4]/150*100}%;background:#206c52"></span></div><strong>${(m.rc[4]/150*100).toFixed(1)}<small>%</small></strong></div></div>`;
    const graphic = repeat ? `<div class="repeat-track" data-once="${m.once*2}" data-all="${m.all*2}" role="img" aria-label="${m.all}% of tasks reach RC4 in all runs; ${m.once}% in at least one"><span class="repeat-connection" style="left:${m.all*2}%;width:${(m.once-m.all)*2}%"></span><span class="repeat-emphasis" style="width:${m[repeatEndpoint]*2}%"></span><span class="repeat-dot open" style="left:${m.all*2}%"></span><span class="repeat-dot" style="left:${m.once*2}%"></span><span class="repeat-focus" style="left:${m[repeatEndpoint]*2}%"></span></div>` : `<div class="stack" role="img" aria-label="${m.rc.map((n,i)=>'RC'+i+': '+n+' of 150').join('; ')}">${m.rc.map((n,i)=>`<span style="width:${n/150*100}%;background:${colors[i]}" title="RC${i}: ${n} / 150 (${(n/150*100).toFixed(1)}%)"></span>`).join('')}</div>`;
    return `<div class="chart-row"><span class="model-name">${esc(m.name)}</span><span class="mean-score">${m.mean.toFixed(2)}<small> /10</small></span>${graphic}<span class="${repeat?'repeat-numbers':'chart-end'}">${repeat ? m.all+' / '+m.once+'%' : (m.rc[4]/150*100).toFixed(1)+'%'}</span></div>`;
  }).join('');
  document.getElementById('chart-footnote').textContent = overview ? 'Each row summarizes 150 final scored attempts. Left: mean score on a 0–10 scale. Right: fraction reaching RC4 on a 0–100% scale. Bar lengths are normalized within their own scales; the metrics are not interchangeable.' : repeat ? 'Denominator: the same 50 tasks for every model. Both markers describe task-level outcomes across three runs, not attempt-level success rates. Values at right are percentages.' : 'Bars show the RC0–RC4 distribution. Atomic Score is reported separately, not inferred from RC. Values follow the final seven-model analysis in the paper.';
  if(repeat)setRepeatEndpoint(repeatEndpoint,false);
}
function setRepeatEndpoint(endpoint,animate=true) {
  repeatEndpoint=endpoint;
  document.querySelectorAll('[data-repeat]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.repeat===endpoint)));
  document.querySelectorAll('.repeat-track').forEach(track=>{
    for(const [selector,property] of [['.repeat-emphasis','width'],['.repeat-focus','left']]){
      const element=track.querySelector(selector),from=getComputedStyle(element)[property],to=track.dataset[endpoint]+'%';
      element.getAnimations().forEach(a=>a.cancel());element.style[property]=to;
      if(animate&&!reduceMotion())element.animate([{[property]:from},{[property]:to}],{duration:650,easing:'cubic-bezier(.2,.7,.2,1)'});
    }
  });
  document.getElementById('repeat-status').textContent=endpoint==='once'?'Highlighted: tasks reaching RC4 at least once. Next, compare with all three runs.':'Highlighted: tasks reaching RC4 in all three runs. Both recorded endpoints remain visible; this motion is not an execution history.';
}
function curvePlot(compact=false) {
  const x=v=>55+v/.03*485,y=v=>230-v/3.25*195;
  const lines=[['2.0','#257d73','2'],['5.0','#c77844','5']];
  const grids=[0,1,2,3].map(t=>`<line x1="55" x2="540" y1="${y(t)}" y2="${y(t)}" class="plot-grid"/><text x="43" y="${y(t)+4}" text-anchor="end">${t}</text>`).join('');
  const ticks=[0,.01,.02,.03].map(t=>`<text x="${x(t)}" y="251" text-anchor="middle">${t===0?'0':t.toFixed(2)}</text>`).join('');
  const curves=lines.map(([k,c])=>`<g class="curve-line" data-line="${k}"><polyline fill="none" stroke="${c}" stroke-width="2.6" points="${data.case30.intensity.map((v,i)=>`${x(v)},${y(data.case30.angles[k][i])}`).join(' ')}"/>${data.case30.intensity.map((v,i)=>`<circle cx="${x(v)}" cy="${y(data.case30.angles[k][i])}" r="1.5" fill="${c}"/>`).join('')}</g>`).join('');
  const peak=data.case30.angles['5.0'].indexOf(Math.max(...data.case30.angles['5.0']));
  const annotations=compact?'':`<g class="compare-annotations" aria-hidden="true"><g data-annotation-line="2.0"><polyline fill="none" stroke="#257d73" stroke-opacity=".24" stroke-width="10" points="${data.case30.intensity.map((v,i)=>`${x(v)},${y(data.case30.angles['2.0'][i])}`).join(' ')}"/><text x="420" y="${y(data.case30.angles['2.0'][85])-15}" class="annotation-label">rises</text></g><g data-annotation-line="5.0"><circle cx="${x(data.case30.intensity[peak])}" cy="${y(data.case30.angles['5.0'][peak])}" r="9" fill="none" stroke="#b16c3c" stroke-width="2"/><text x="${x(data.case30.intensity[peak])+16}" y="${y(data.case30.angles['5.0'][peak])-14}" class="annotation-label">turnover</text></g></g>`;
  return `<div class="curve-chart">${!compact?'<div class="curve-legend" role="group" aria-label="Toggle submitted curves">'+lines.map(([k,c,n])=>`<button type="button" data-curve="${k}" aria-pressed="true"><i style="background:${c}"></i>Screening length λ = ${n} a.u.</button>`).join('')+'</div>':'<div class="compact-legend"><span style="color:#257d73">— λ = 2</span><span style="color:#c77844">— λ = 5 a.u.</span></div>'}<svg class="curve-svg" viewBox="0 0 580 290" role="img" aria-label="Submitted offsets for screening lengths 2 and 5 atomic units. The first rises with intensity, while the second rises then falls. All 100 samples per curve are shown without fitting."><text x="55" y="17" class="plot-axis-title">Offset angle θ (degrees)</text>${grids}${ticks}<line x1="55" x2="540" y1="230" y2="230" class="plot-axis"/>${curves}${annotations}<text x="298" y="279" text-anchor="middle" class="plot-axis-title">Laser intensity I (a.u.)</text></svg></div>`;
}
const investigations = {
  kimi: {title:'A corrected calculation—and a justified scope.', steps:['Constructed the scattering calculation and detected inconsistent signs between two ways of computing the angle.','Corrected the angle convention and checked numerical consistency.','Explained how the tunnel-exit distance relative to screening length changes the response.'], outcome:'The report restricted physical interpretation to quasistatic, sub-barrier exits and labeled other regimes as formal extensions. The saved results retained a screening contrast inside that stated window.', end:'RC4 · Required evidence and scope conditions satisfied.'},
  gpt: {title:'The mechanism was supported. Its limits were not settled.', steps:['Repaired the numerical solver and generated screened and Coulomb responses.','Identified the screening-dependent trends and explained the competing effects of exit distance and electron momentum.','Saved a diagnostic flagging a high-field barrier-suppression concern.'], outcome:'The final interpretation did not reconcile that concern with its claim that a low Keldysh parameter made the weak-field exit approximation more favorable. A low Keldysh parameter does not, by itself, resolve a separate barrier-suppression risk.', end:'RC3 · Main conclusion supported; a material applicability gap remains.'},
  gemini: {title:'The data were generated. Their trend was misidentified.', steps:['Revised trajectory propagation and the angle convention.','Generated offset scans for Coulomb and screened potentials.','Described all tested offset curves as monotonically decreasing with intensity.'], outcome:'The saved screened curves instead included rising and turning-over responses. The interpretation therefore did not account for the trends actually present in the submitted data.', end:'RC2 · A central identification and mechanism requirement remains unresolved.'}
};
function renderInvestigation(key) {
  currentInvestigation=key;
  const c = investigations[key];
  document.querySelectorAll('[data-case]').forEach(b => {const selected=b.dataset.case===key;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
  const panel=document.getElementById('investigation');panel.setAttribute('aria-labelledby','tab-'+key);
  const visual = key==='gemini' ? `<span class="evidence-type">SUBMITTED NUMERICAL EVIDENCE · WEB REPLOT</span>${curvePlot()}<p class="evidence-reading"><b>Read the curves:</b> λ = 2 rises across the scan; λ = 5 rises and then falls. Neither is monotonically decreasing.</p><p class="fine">Same 2 × 100 submitted samples as paper Appendix E; straight connectors, no fit or smoothing. This is an evaluator replot, not the candidate’s original figure.</p>` : key==='gpt' ? '<span class="evidence-type">RECORDED DIAGNOSTIC · VALUES FROM APPENDIX E</span><h4>A high-field warning was already in the evidence.</h4><div class="diagnostic-row"><span>Saved field E₀</span><div><i style="width:80%;background:#c77844"></i></div><b>0.0800</b></div><div class="diagnostic-row"><span>Coulomb reference E<sub>BSI</sub></span><div><i style="width:62.5%;background:#739d9d"></i></div><b>0.0625</b></div><p class="fine">Field values in atomic units; common display scale 0–0.10 a.u. The Coulomb-reference threshold is not a universal threshold for screened targets.</p><div class="evidence-takeaway">A low Keldysh parameter does not resolve this separate barrier-suppression concern.</div>' : '<span class="evidence-type">RECORDED CHECKS · VALUES FROM APPENDIX E</span><h4>Numerical agreement was paired with a physical scope.</h4><div class="consistency-number">4.53 × 10<sup>−7</sup><span>rad</span></div><p class="fine">Angle discrepancy after correcting the sign convention between orbit integration and direct trajectory propagation.</p><div class="scope-window"><span class="tiny-label">STATED COULOMB WINDOW</span><strong>0.0065 &lt; I &lt; 0.0078 a.u.</strong><p>Two saved intensities lie within this window and retain a screening contrast.</p></div><p class="fine">Scope: quasistatic, sub-barrier exits. Other regimes were labeled formal extensions. These are reported checks, not a newly computed validation.</p>';
  panel.innerHTML = `<div class="case-guide"><div class="segmented" role="group" aria-label="Explore evidence and interpretation"><button type="button" data-case-stage="0" aria-pressed="true">1 · Evidence</button><button type="button" data-case-stage="1" aria-pressed="false">2 · Interpretation</button><button type="button" data-case-stage="2" aria-pressed="false">3 · Closure</button></div><button type="button" class="quiet-button" id="case-skip">Show conclusion directly</button><p id="case-guide-status" role="status" aria-live="polite"></p></div><div class="investigation-visual">${visual}<p class="annotation-credit">Highlights are evaluator annotations, not additions to the candidate’s report.</p></div><div class="investigation-story"><div id="case-stage-copy"></div><div class="research-steps"><span class="tiny-label">SELECTED RESEARCH ACTIVITIES · EDITORIAL SUMMARY</span><ol>${c.steps.map(s=>`<li>${s}</li>`).join('')}</ol></div><div class="closure-verdict ${key}"><span class="tiny-label">FINAL REGISTERED OUTCOME · NOT AN INTERMEDIATE SCORE</span><p>${c.outcome}</p><strong>${c.end}</strong></div><div class="case-progress"><button type="button" class="button" id="case-next">Next: interpretation →</button></div></div>`;
  setCaseStage(0,false);
}
const stageCopy={
  gemini:[['Inspect the submitted curves.','Both curves come from the saved numerical results. Consider how the offset changes as laser intensity increases.'],['Compare the report with the evidence.','The report describes the calculated offsets as decreasing monotonically for all tested potentials. This is a paraphrase of the claim documented in paper Appendix E.']],
  gpt:[['Inspect the saved applicability diagnostic.','The saved field exceeds the Coulomb-reference barrier-suppression threshold. The threshold is not universal for screened targets.'],['Compare the diagnostic with the interpretation.','The report described the low-Keldysh-parameter regime as more favorable for its weak-field exit approximation. That addresses a different condition from the flagged barrier-suppression risk.']],
  kimi:[['Inspect the recorded checks.','The angle-convention inconsistency was corrected. Agreement between two calculations checks numerical consistency, but does not alone establish physical applicability.'],['Examine the stated scope.','The report limited physical interpretation to quasistatic, sub-barrier exits, labeling other regimes formal extensions. Saved results retain a screening contrast within the stated window.']]
};
function setCaseStage(stage,animate=true){
  caseStage=stage;const panel=document.getElementById('investigation'),c=investigations[currentInvestigation];
  finishMotion(panel);panel.dataset.stage=String(stage);
  panel.querySelectorAll('[data-case-stage]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.caseStage)===stage)));
  const copy=stage<2?stageCopy[currentInvestigation][stage]:[c.title,c.outcome];
  const box=document.getElementById('case-stage-copy');box.innerHTML=`<h3>${copy[0]}</h3><p>${copy[1]}</p>`;
  if(animate&&!reduceMotion())box.animate([{opacity:.3,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'ease-out'});
  document.getElementById('case-guide-status').textContent=['Evidence stays complete and unchanged. These steps guide reading, not the agent’s execution chronology.','Interpretation is a report paraphrase. No missing candidate reasoning has been supplied.','Compare the evidence, interpretation and applicable scope. Only the final registered RC is shown.'][stage];
  const next=document.getElementById('case-next');next.disabled=stage===2;next.textContent=['Next: interpretation →','Next: assess closure →','Final outcome shown'][stage];
}
function setGapView(view,animate=true){
  const mosaic=document.getElementById('gap-mosaic'),marks=[...mosaic.children];
  finishMotion(mosaic);const before=marks.map(e=>e.getBoundingClientRect());
  mosaic.dataset.view=view;
  marks.forEach((e,i)=>{const position=view==='grouped'?(i<146?i:i+14):i;e.style.gridRow=String(Math.floor(position/20)+1);e.style.gridColumn=String(position%20+1);});
  if(animate&&!reduceMotion())marks.forEach((e,i)=>{const after=e.getBoundingClientRect();e.animate([{transform:`translate(${before[i].left-after.left}px,${before[i].top-after.top}px)`,backgroundColor:'#b9c8bd'},{transform:'translate(0,0)',backgroundColor:getComputedStyle(e).backgroundColor}],{duration:480,delay:Math.min(i*2,160),easing:'cubic-bezier(.2,.7,.2,1)'});});
  document.querySelectorAll('[data-gap]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.gap===view)));
  document.getElementById('gap-status').textContent=view==='grouped'?'Grouped: 146 reached RC4; 83 did not. Aggregate counts only—not a replay or per-attempt RC transition.':'All 229 high-scoring attempts, before separating closure outcomes.';
}
function renderTasks() {
  const term=document.getElementById('task-search').value.trim().toLowerCase(), cpu=document.getElementById('cpu-filter').value;
  const tasks=data.tasks.filter(t=>(cpu==='all'||String(t.cpu_cores)===cpu)&&(t.case_id+' '+t.title).toLowerCase().includes(term));
  document.getElementById('task-count').textContent=`${tasks.length} / 50 tasks`;
  document.getElementById('task-rows').innerHTML = tasks.length ? tasks.map(t=>`<tr><td>${esc(t.case_id)}</td><td>${esc(t.title)}</td><td>${t.cpu_cores} cores<br>${t.time_limit_minutes} min</td><td><div class="table-links"><a href="${esc(t.task_url)}">Task ↗</a><a href="${esc(t.resource_limits_url)}">Limits ↗</a></div></td><td><div class="table-links"><a href="${esc(t.rubric_url)}">Rubric ↗</a><a href="${esc(t.sources_url)}">Sources ↗</a></div></td></tr>`).join('') : '<tr><td colspan="5">No tasks match these filters.</td></tr>';
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>renderChart(b.dataset.mode)));
document.querySelectorAll('[data-case]').forEach(b=>{b.addEventListener('click',()=>renderInvestigation(b.dataset.case));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-case]')];let i=tabs.indexOf(b);i=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;renderInvestigation(tabs[i].dataset.case);tabs[i].focus();});});
document.getElementById('task-search').addEventListener('input',renderTasks);
document.getElementById('cpu-filter').addEventListener('change',renderTasks);
document.addEventListener('click',e=>{const b=e.target.closest('[data-curve]');if(!b)return;const pressed=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(pressed));b.closest('.curve-chart').querySelectorAll(`[data-line="${b.dataset.curve}"], [data-annotation-line="${b.dataset.curve}"]`).forEach(line=>line.style.opacity=pressed?'1':'.08');});
document.addEventListener('click',e=>{const b=e.target.closest('[data-case-stage]');if(b)setCaseStage(Number(b.dataset.caseStage));if(e.target.closest('#case-next'))setCaseStage(Math.min(2,caseStage+1));if(e.target.closest('#case-skip'))setCaseStage(2,false);});
document.querySelectorAll('[data-repeat]').forEach(b=>b.addEventListener('click',()=>setRepeatEndpoint(b.dataset.repeat)));
document.getElementById('repeat-skip').addEventListener('click',()=>setRepeatEndpoint('all',false));
document.querySelectorAll('[data-gap]').forEach(b=>b.addEventListener('click',()=>setGapView(b.dataset.gap)));
document.getElementById('gap-skip').addEventListener('click',()=>setGapView('grouped',false));
document.getElementById('reduce-motion').addEventListener('change',e=>{manualReduce=e.target.checked;updateMotion();});
systemMotion.addEventListener('change',updateMotion);
const dialog=document.getElementById('image-dialog');
document.addEventListener('click',e=>{const b=e.target.closest('[data-image]');if(!b)return;document.getElementById('dialog-image').src=b.dataset.image;document.getElementById('dialog-image').alt=b.dataset.caption;document.getElementById('dialog-caption').textContent=b.dataset.caption;dialog.showModal();});
document.getElementById('close-image').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.getElementById('copy-citation').addEventListener('click',async()=>{const text=document.getElementById('citation').textContent;try{await navigator.clipboard.writeText(text);document.getElementById('copy-status').textContent='BibTeX copied.';}catch{const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(document.getElementById('citation'));selection.removeAllRanges();selection.addRange(range);document.getElementById('copy-status').textContent='Citation selected. Press Ctrl+C or ⌘C to copy.';}});
document.getElementById('hero-plot').innerHTML=curvePlot(true);
document.getElementById('gap-mosaic').innerHTML=Array.from({length:229},(_,i)=>`<span class="${i<146?'closed':'open'}" aria-hidden="true"></span>`).join('');
renderChart('overview');renderInvestigation('gemini');renderTasks();updateMotion();
