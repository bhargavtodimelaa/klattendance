/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   CONFIG
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const WORKER = "https://dawn-fire-931d.bhargavtodimela4.workers.dev";
let SID="", CSRF="";
let SUBJECTS=[], curFilter="all";

const CMETA = {
  L:{ name:"Lecture",   weight:100, color:"#60a5fa", bg:"rgba(96,165,250,.12)", cls:"tb-L" },
  P:{ name:"Practical", weight:50,  color:"#4ade80", bg:"rgba(74,222,128,.12)", cls:"tb-P" },
  T:{ name:"Tutorial",  weight:25,  color:"#c084fc", bg:"rgba(192,132,252,.12)", cls:"tb-T" },
  S:{ name:"Skilling",  weight:25,  color:"#fb923c", bg:"rgba(251,146,60,.12)", cls:"tb-S" },
};

function getCompKey(name="", ltps="") {
  const n=name.toLowerCase();
  if(n.includes("lecture"))   return "L";
  if(n.includes("practical")) return "P";
  if(n.includes("tutorial"))  return "T";
  if(n.includes("skilling"))  return "S";
  const l=ltps.toUpperCase();
  for(const k of ["L","P","T","S"]) if(l.includes(k)) return k;
  return "L";
}

function getStatus(p){ return p>=85?"safe":p>=75?"cond":"danger"; }
const ST_LABEL={safe:"Safe âœ“",cond:"Conditional âš ",danger:"Danger âœ—"};
const ST_COLOR={safe:"var(--safe)",cond:"var(--cond)",danger:"var(--danger)"};

/* Logic for weighted calculation - supports multiple overrides */
function calcWeightedPct(components, overrides = {}) {
  let totalWeight=0, weightedSum=0;
  components.forEach((c, i) => {
    const ov = overrides[i] || { att: c.attended, cond: c.conducted };
    const pct = (ov.cond > 0) ? (ov.att / ov.cond * 100) : 0;
    totalWeight += c.weight; 
    weightedSum += pct * c.weight;
  });
  if(totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight * 10) / 10;
}

function calcMaxSkip(components, idx, threshold) {
  const CAP=200, c=components[idx]; let maxSkip=0;
  for(let n=1;n<=CAP;n++){
    const ov=calcWeightedPct(components, {[idx]: {att: c.attended, cond: c.conducted + n}});
    if(ov>=threshold){ maxSkip=n; } else { break; }
  }
  return { canSkip:maxSkip, newAtt:c.attended, newCond:c.conducted+maxSkip };
}

function calcMinAttend(components, idx, threshold) {
  const CAP=200, c=components[idx];
  if(calcWeightedPct(components)>=threshold) return { needAttend:0, newAtt:c.attended, newCond:c.conducted, capped:false };
  for(let n=1;n<=CAP;n++){
    const ov=calcWeightedPct(components, {[idx]: {att: c.attended + n, cond: c.conducted + n}});
    if(ov>=threshold) return { needAttend:n, newAtt:c.attended+n, newCond:c.conducted+n, capped:false };
  }
  return { needAttend:CAP, newAtt:c.attended+CAP, newCond:c.conducted+CAP, capped:true };
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   GROUPING
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function groupSubjects(rows) {
  const map=new Map();
  rows.forEach(r=>{
    const code=(r.CourseCode||r.coursecode||r.CourseId||r.courseid||"").trim().replace(/[-_][LPTS]$/i,"");
    const name=(r.Coursedesc||r.courseName||"").trim();
    const key=code||name;
    if(!map.has(key)) map.set(key,{name,code,eligibility:r.eligibility||r.Eligibility||"",components:[],_seenKeys:new Set()});
    const subj=map.get(key);
    const ltps=(r.Ltps||r.ltps||"").toUpperCase();
    const cname=r.componentName||r.ComponentName||"";
    const ckey=getCompKey(cname,ltps);
    if(subj._seenKeys.has(ckey)) return;
    subj._seenKeys.add(ckey);
    const meta=CMETA[ckey];
    const conducted=parseInt(r["Total Conducted"]||0)||0;
    const attended=parseInt(r["Total Attended"]||0)||0;
    const absent=parseInt(r["Total Absent"]||0)||0;
    const rawPct=parseFloat(r.Percentage||0)||0;
    const pct=rawPct>0?rawPct:(conducted>0?Math.round(attended/conducted*1000)/10:0);
    const apiW=parseFloat(r.weightage||r.Weightage||r.weight||0);
    const weight=apiW>0?apiW:meta.weight;
    subj.components.push({key:ckey,name:meta.name,weight,pct,attended,conducted,absent,color:meta.color,bg:meta.bg,cls:meta.cls});
  });
  const ORDER={L:0,P:1,T:2,S:3};
  map.forEach(s=>{
    s.components.sort((a,b)=>(ORDER[a.key]||9)-(ORDER[b.key]||9));
    delete s._seenKeys;
    s.components.forEach(c=>{ if(c.conducted>0) c.pct=Math.round(c.attended/c.conducted*1000)/10; });
    s.aggPct=calcWeightedPct(s.components);
    s.status=getStatus(s.aggPct);
    s.conducted=s.components.reduce((a,c)=>a+c.conducted,0);
    s.attended=s.components.reduce((a,c)=>a+c.attended,0);
    s.absent=s.components.reduce((a,c)=>a+c.absent,0);
  });
  return Array.from(map.values());
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   BUILD PROJECTIONS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function buildProjections(subj) {
  const comps=subj.components, projItems=[];
  comps.forEach((c,idx)=>{
    const curOv=calcWeightedPct(comps);
    const skip85=calcMaxSkip(comps,idx,85);
    const skip75=calcMaxSkip(comps,idx,75);
    if(skip85.canSkip>0) projItems.push({compName:c.name,compColor:c.color,n:skip85.canSkip,futAtt:skip85.newAtt,futCond:skip85.newCond,threshold:85,action:'skip',label:'to stay â‰¥85% overall',capped:false});
    if(skip75.canSkip>0&&skip75.canSkip>skip85.canSkip) projItems.push({compName:c.name,compColor:c.color,n:skip75.canSkip,futAtt:skip75.newAtt,futCond:skip75.newCond,threshold:75,action:'skip',label:'to stay â‰¥75% overall',capped:false});
    if(skip85.canSkip===0&&skip75.canSkip>0) projItems.push({compName:c.name,compColor:c.color,n:skip75.canSkip,futAtt:skip75.newAtt,futCond:skip75.newCond,threshold:75,action:'skip',label:'to stay â‰¥75% overall',capped:false});
    if(curOv<85){const a85=calcMinAttend(comps,idx,85);if(a85.needAttend>0) projItems.push({compName:c.name,compColor:c.color,n:a85.needAttend,futAtt:a85.newAtt,futCond:a85.newCond,threshold:85,action:'attend',label:'to reach â‰¥85% overall',capped:a85.capped});}
    if(curOv<75){const a75=calcMinAttend(comps,idx,75);if(a75.needAttend>0) projItems.push({compName:c.name,compColor:c.color,n:a75.needAttend,futAtt:a75.newAtt,futCond:a75.newCond,threshold:75,action:'attend',label:'to reach â‰¥75% overall',capped:a75.capped});}
  });
  return projItems;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RENDER SUBJECT CARD
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function renderCard(s) {
  const st=s.status, pctCls=`pct-${st}`, barCls=`bar-${st}`;
  let compHtml="";
  s.components.forEach(c=>{
    const cpSt=getStatus(c.pct), cpColor=ST_COLOR[cpSt];
    compHtml+=`
    <div class="comp-row">
      <span class="comp-type-badge ${c.cls}">${c.key}</span>
      <div class="comp-info">
        <div class="comp-name-line">
          <span class="comp-name">${c.name}</span>
          <span class="comp-weight">w: ${c.weight}%</span>
        </div>
        <div class="comp-nums">${c.attended}/${c.conducted} attended Â· ${c.absent} absent</div>
      </div>
      <div class="comp-pct-right">
        <div class="comp-pct-val" style="color:${cpColor}">${c.pct}%</div>
        <div class="comp-bar-bg">
          <div class="comp-bar-fill" style="width:${Math.min(c.pct,100)}%;background:${cpColor}"></div>
        </div>
      </div>
    </div>`;
  });

  let formulaHtml="";
  if(s.components.length>1){
    const tw=s.components.reduce((a,c)=>a+c.weight,0);
    const parts=s.components.map(c=>`(${c.pct}% Ã— ${c.weight})`).join(" + ");
    formulaHtml=`<div class="formula-row">
      <div style="color:var(--gold);margin-bottom:3px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:.2em">Weighted Formula</div>
      <div style="word-break:break-word;color:var(--silver)">[${parts}] Ã· ${tw}</div>
      <div style="margin-top:5px">= <span class="formula-eq" style="color:${ST_COLOR[st]}">${s.aggPct}%</span></div>
    </div>`;
  } else if(s.components.length===1){
    const c=s.components[0];
    formulaHtml=`<div class="formula-row">
      <div style="color:var(--gold);margin-bottom:3px;font-size:9px;font-weight:400;text-transform:uppercase;letter-spacing:.2em">Calculation</div>
      <div style="color:var(--silver)">${c.attended} attended Ã· ${c.conducted} conducted Ã— 100</div>
      <div style="margin-top:5px">= <span class="formula-eq" style="color:${ST_COLOR[st]}">${s.aggPct}%</span></div>
    </div>`;
  }

  const projItems=buildProjections(s);
  const skipItems=projItems.filter(p=>p.action==='skip').sort((a,b)=>b.threshold-a.threshold);
  const attendItems=projItems.filter(p=>p.action==='attend').sort((a,b)=>b.threshold-a.threshold);

  const renderProjItem=(item)=>{
    const nStr=item.capped?`>200`:item.n;
    return `<div class="proj-item">
      <div class="proj-item-left">
        <span class="proj-comp-dot" style="background:${item.compColor}"></span>
        <div>
          <span class="proj-desc">${nStr} Ã— ${item.compName} class${item.n!==1?'es':''}</span>
          <span class="proj-sub">${item.label}</span>
        </div>
      </div>
      <span class="proj-count">${item.futAtt}/${item.futCond}</span>
    </div>`;
  };

  const eligText=s.eligibility||ST_LABEL[st];
  const eligCls=st==="safe"?"elig-safe":st==="cond"?"elig-cond":"elig-danger";

  return `
  <div class="subject-card st-${st}">
    <div class="sc-header">
      <div class="sc-title-wrap">
        <span class="sc-name">${s.name||"â€”"}</span>
        ${s.code?`<span class="sc-code">${s.code}</span>`:""}
        <span class="sc-elig ${eligCls}">${eligText}</span>
      </div>
      <div class="sc-pct-wrap" style="min-width:80px">
        <div class="sc-pct-num ${pctCls}">${s.aggPct}%</div>
        <div class="sc-pct-bar-bg">
          <div class="sc-pct-bar ${barCls}" style="width:${Math.min(s.aggPct,100)}%"></div>
        </div>
      </div>
    </div>
    <div class="sc-body">
      <div class="sc-components">
        <div class="sc-section-title">Components</div>
        ${compHtml}
        ${formulaHtml}
      </div>
      <div class="sc-projections">
        <div class="sc-section-title">Class Planning</div>
        <div class="proj-block">
          <div class="proj-block-title proj-safe-title">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            Can Skip (max)
          </div>
          ${skipItems.length>0?skipItems.map(renderProjItem).join(""):'<div class="proj-empty">No safe skips available</div>'}
        </div>
        ${attendItems.length>0?`
        <div class="proj-block">
          <div class="proj-divider"></div>
          <div class="proj-block-title proj-need-title">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            Need to Attend (min)
          </div>
          ${attendItems.map(renderProjItem).join("")}
        </div>`:''}
      </div>
    </div>
  </div>`;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   NEW SIMULATOR LOGIC
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const SIM_STATE = {};
const TYPE_MAP = { 1: "Single", 2: "Double", 3: "Triple" };

function renderSimCard(s, idx) {
  const st = s.status;
  // Initialize state for this subject if not exists
  if(!SIM_STATE[idx]) {
    SIM_STATE[idx] = s.components.map(() => ({ 
      count: 0, 
      type: 1, 
      action: "attend" 
    }));
  }

  const controlsHtml = s.components.map((c, ci) => `
    <div class="sim-comp-row">
      <span class="comp-type-badge ${c.cls}">${c.key}</span>
      
      <div class="sim-comp-info-label">
        <span class="scil-name">${c.name}</span>
        <span class="scil-stats">${c.attended}/${c.conducted} Â· w:${c.weight}%</span>
      </div>

      <div class="sim-stepper-container">
        <div class="sim-type-selector">
          ${[1,2,3].map(t => `<div class="sim-type-chip ${SIM_STATE[idx][ci].type===t?'active':''}" id="tc-${idx}-${ci}-${t}" onclick="setSimType(${idx}, ${ci}, ${t})">${TYPE_MAP[t]}</div>`).join('')}
        </div>
        <div class="sim-stepper">
          <button class="sim-stepper-btn" onclick="stepSimValue(${idx}, ${ci}, -1)">âˆ’</button>
          <span class="sim-stepper-val" id="sv-${idx}-${ci}">0</span>
          <button class="sim-stepper-btn" onclick="stepSimValue(${idx}, ${ci}, 1)">+</button>
        </div>
        <div class="sim-type-selector">
          <div class="sim-type-chip ${SIM_STATE[idx][ci].action==='attend'?'active':''}" style="flex:1.5" id="act-att-${idx}-${ci}" onclick="setSimAction(${idx}, ${ci}, 'attend')">Attend</div>
          <div class="sim-type-chip ${SIM_STATE[idx][ci].action==='skip'?'active':''}" style="flex:1" id="act-skip-${idx}-${ci}" onclick="setSimAction(${idx}, ${ci}, 'skip')">Skip</div>
        </div>
      </div>
    </div>
  `).join('');

  return `
    <div class="sim-card st-${st}" id="sim-card-${idx}">
      <div class="sim-header" onclick="toggleSim(${idx})">
        <div class="sim-title-wrap">
          <span class="sim-name">${s.name||'â€”'}</span>
          <span class="sim-code">${s.code?s.code+' Â· ':''}${s.components.map(c=>c.key).join('+')} components</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px">
          <div style="text-align:right">
            <div class="sim-current-pct" id="sim-cur-pct-${idx}" style="color:${ST_COLOR[st]}">${s.aggPct}%</div>
            <div style="font-size:9px;color:var(--silver);letter-spacing:.1em;text-transform:uppercase">Projected</div>
          </div>
          <svg class="sim-expand-icon" id="sim-icon-${idx}" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
        </div>
      </div>
      <div class="sim-body" id="sim-body-${idx}">
        <div class="sim-grid">
          <div class="sim-controls-col">
            <div class="sc-section-title">Class Simulation</div>
            ${controlsHtml}
          </div>
          <div class="sim-result-col">
            <div class="sim-res-eyebrow">Simulation Result</div>
            <div class="sim-res-val" id="sim-res-pct-${idx}">${s.aggPct}%</div>
            <div class="sim-res-delta" id="sim-res-delta-${idx}">â€” 0.0%</div>
            <div class="sim-res-status-wrap" id="sim-res-status-${idx}">
              <span class="sc-elig ${st==='safe'?'elig-safe':st==='cond'?'elig-cond':'elig-danger'}">${ST_LABEL[st]}</span>
            </div>
            <div class="sim-res-formula-box" id="sim-res-form-${idx}">
              No changes simulated.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setSimType(idx, ci, type) {
  SIM_STATE[idx][ci].type = type;
  [1,2,3].forEach(t => {
    el(`tc-${idx}-${ci}-${t}`).classList.toggle('active', t === type);
  });
  updateSubjectSim(idx);
}

function setSimAction(idx, ci, action) {
  SIM_STATE[idx][ci].action = action;
  el(`act-att-${idx}-${ci}`).classList.toggle('active', action === 'attend');
  el(`act-skip-${idx}-${ci}`).classList.toggle('active', action === 'skip');
  updateSubjectSim(idx);
}

function stepSimValue(idx, ci, dir) {
  SIM_STATE[idx][ci].count = Math.max(0, Math.min(20, SIM_STATE[idx][ci].count + dir));
  el(`sv-${idx}-${ci}`).textContent = SIM_STATE[idx][ci].count;
  updateSubjectSim(idx);
}

function updateSubjectSim(idx) {
  const s = SUBJECTS[idx];
  const state = SIM_STATE[idx];
  const overrides = {};

  state.forEach((st, i) => {
    const totalAdded = st.count * st.type;
    const attAdded = st.action === 'attend' ? totalAdded : 0;
    overrides[i] = {
      att: s.components[i].attended + attAdded,
      cond: s.components[i].conducted + totalAdded
    };
  });

  const newPct = calcWeightedPct(s.components, overrides);
  const diff = Math.round((newPct - s.aggPct) * 10) / 10;
  const status = getStatus(newPct);

  // Update UI
  el(`sim-cur-pct-${idx}`).textContent = newPct + "%";
  el(`sim-cur-pct-${idx}`).style.color = ST_COLOR[status];
  el(`sim-res-pct-${idx}`).textContent = newPct + "%";
  el(`sim-res-pct-${idx}`).style.color = ST_COLOR[status];
  
  // Delta
  const deltaEl = el(`sim-res-delta-${idx}`);
  if(diff > 0) { deltaEl.innerHTML = `<span style="color:var(--safe)">â–² +${diff}%</span>`; }
  else if(diff < 0) { deltaEl.innerHTML = `<span style="color:var(--danger)">â–¼ ${diff}%</span>`; }
  else { deltaEl.innerHTML = `<span style="color:var(--silver)">â€” 0.0%</span>`; }

  // Badge
  el(`sim-res-status-${idx}`).innerHTML = `<span class="sc-elig ${status==='safe'?'elig-safe':status==='cond'?'elig-cond':'elig-danger'}">${ST_LABEL[status]}</span>`;

  // Formula String
  const parts = s.components.map((c, i) => {
    const o = overrides[i];
    const cpct = o.cond > 0 ? (o.att/o.cond*100).toFixed(1) : "0.0";
    return `${cpct}%Ã—${c.weight}`;
  });
  el(`sim-res-form-${idx}`).textContent = `[${parts.join(" + ")}] / ${s.components.reduce((a,c)=>a+c.weight,0)} = ${newPct}%`;
}

function toggleSim(idx) {
  const body = el(`sim-body-${idx}`), icon = el(`sim-icon-${idx}`);
  const open = body.classList.contains('open');
  body.classList.toggle('open', !open);
  icon.classList.toggle('open', !open);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   STATS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function renderStats(subjs){
  const pcts=subjs.map(s=>s.aggPct);
  const avg=pcts.length?(pcts.reduce((a,b)=>a+b,0)/pcts.length).toFixed(1):0;
  const safe=subjs.filter(s=>s.status==="safe").length;
  const cond=subjs.filter(s=>s.status==="cond").length;
  const dng=subjs.filter(s=>s.status==="danger").length;
  const tc=subjs.reduce((a,s)=>a+s.conducted,0);
  const ta=subjs.reduce((a,s)=>a+s.attended,0);
  const ov=tc>0?((ta/tc)*100).toFixed(1):"â€”";
  const ac=avg>=85?"s":avg>=75?"c":"d";
  document.getElementById("statsRow").innerHTML=`
    <div class="stat-card sc-b" style="animation-delay:.0s"><div class="stat-icon si-b"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg></div><div class="stat-val sv-b">${subjs.length}</div><div class="stat-lbl">Subjects</div></div>
    <div class="stat-card sc-${ac}" style="animation-delay:.05s"><div class="stat-icon si-${ac}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg></div><div class="stat-val sv-${ac}">${avg}%</div><div class="stat-lbl">Avg Weighted</div></div>
    <div class="stat-card sc-s" style="animation-delay:.1s"><div class="stat-icon si-s"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div><div class="stat-val sv-s">${safe}</div><div class="stat-lbl">Safe â‰¥85%</div></div>
    <div class="stat-card sc-c" style="animation-delay:.15s"><div class="stat-icon si-c"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg></div><div class="stat-val sv-c">${cond}</div><div class="stat-lbl">Conditional</div></div>
    <div class="stat-card sc-d" style="animation-delay:.2s"><div class="stat-icon si-d"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div><div class="stat-val sv-d">${dng}</div><div class="stat-lbl">Danger &lt;75%</div></div>
    <div class="stat-card sc-g" style="animation-delay:.25s"><div class="stat-icon si-g"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm.5 14.5h-1V11h1v5.5zm0-7h-1V7h1v2.5z"/></svg></div><div class="stat-val sv-g">${ov}%</div><div class="stat-lbl">Overall Raw</div></div>
  `;
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   FILTER & RENDER
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function setFilter(f,el_){
  curFilter=f;
  document.querySelectorAll(".chip").forEach(c=>c.classList.remove("active"));
  el_.classList.add("active");
  applyFilters();
}

function applyFilters(){
  const q=document.getElementById("srch").value.toLowerCase();
  let list=SUBJECTS.filter(s=>{
    if(curFilter==="safe"&&s.status!=="safe") return false;
    if(curFilter==="cond"&&s.status!=="cond") return false;
    if(curFilter==="danger"&&s.status!=="danger") return false;
    if(q&&!s.name.toLowerCase().includes(q)&&!s.code.toLowerCase().includes(q)) return false;
    return true;
  });
  document.getElementById("cardsContainer").innerHTML=list.map(renderCard).join("");
  document.getElementById("secTitle").textContent=curFilter==="all"?"All Subjects":curFilter==="safe"?"Safe Subjects":curFilter==="cond"?"Conditional Subjects":"Danger Subjects";
  document.getElementById("secCount").textContent=`${list.length} of ${SUBJECTS.length} subject${SUBJECTS.length!==1?"s":""}`;
}

function renderSimTab(){
  document.getElementById("simCount").textContent=`${SUBJECTS.length} subject${SUBJECTS.length!==1?"s":""}`;
  document.getElementById("simContainer").innerHTML=SUBJECTS.map((s,i)=>renderSimCard(s,i)).join("");
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TAB SWITCHING
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function switchTab(tab){
  document.getElementById("detailsTab").style.display=tab==="details"?"block":"none";
  document.getElementById("simTab").style.display=tab==="sim"?"block":"none";
  document.getElementById("tab-details").classList.toggle("active",tab==="details");
  document.getElementById("tab-sim").classList.toggle("active",tab==="sim");
  if(tab==="sim") renderSimTab();
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   UI HELPERS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function showBanner(msg,type="info"){
  const b=document.getElementById("banner");
  const ico={err:'<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',ok:'<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14l-4-4 1.41-1.41L10 13.17l6.59-6.59L18 8l-8 8z"/>',info:'<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'};
  document.getElementById("bico").innerHTML=ico[type]||ico.info;
  document.getElementById("btxt").textContent=msg;
  b.className="banner bn-"+(type==="ok"?"ok":type==="err"?"err":"info");
  b.style.display="flex";
  if(type!=="err") setTimeout(()=>b.style.display="none",5000);
}

function ld(id,sid,on){document.getElementById(id).disabled=on;document.getElementById(sid).style.display=on?"inline-block":"none";}

function el(id){ return document.getElementById(id); }

/* â•â•â• CAPTCHA â•â•â• */
async function refreshCaptcha(){
  document.getElementById("capbox").style.opacity=".4";
  try{const r=await fetch(WORKER+"/captcha");SID=r.headers.get("x-session-id");document.getElementById("capImg").src=URL.createObjectURL(await r.blob());}
  catch{showBanner("Could not load captcha.","err");}
  document.getElementById("capbox").style.opacity="1";
}

/* â•â•â• LOGIN â•â•â• */
async function login(){
  ld("loginBtn","loginSpin",true);
  try{
    const res=await fetch(WORKER+"/login",{method:"POST",headers:{"Content-Type":"application/json","x-session-id":SID},body:JSON.stringify({username:user.value.trim(),password:pass.value,captcha:captcha.value.trim()})});
    const d=await res.json();
    if(!d.success){showBanner(d.message||"Login failed.","err");refreshCaptcha();ld("loginBtn","loginSpin",false);return;}
    SID=d.sessionId;CSRF=d.csrfToken;
    const fill=(id,arr)=>document.getElementById(id).innerHTML=arr.map(x=>`<option value="${x.value}">${x.label}</option>`).join("");
    fill("yearSel",d.academicYears);fill("semSel",d.semesters);
    document.getElementById("loginSection").style.display="none";
    document.getElementById("selCard").style.display="block";
    const uid=user.value.trim();
    document.getElementById("ulbl").textContent=uid;
    document.getElementById("uav").textContent=uid[0].toUpperCase();
    document.getElementById("uchip").classList.add("show");
    showBanner("Signed in successfully","ok");
  }catch{showBanner("Network error. Please try again.","err");}
  ld("loginBtn","loginSpin",false);
}

/* â•â•â• FETCH â•â•â• */
async function fetchAttendance(){
  ld("fetchBtn","fetchSpin",true);
  try{
    const res=await fetch(WORKER+"/attendance",{method:"POST",headers:{"Content-Type":"application/json","x-session-id":SID},body:JSON.stringify({csrfToken:CSRF,academicYear:document.getElementById("yearSel").value,semesterId:document.getElementById("semSel").value})});
    const d=await res.json();
    SUBJECTS=groupSubjects(d.attendanceData||[]);
    renderStats(SUBJECTS);
    applyFilters();
    document.getElementById("selCard").style.display="none";
    document.getElementById("attsec").style.display="block";
    setTimeout(()=>document.getElementById("attsec").scrollIntoView({behavior:"smooth",block:"start"}),120);
    showBanner(`Loaded ${SUBJECTS.length} subject${SUBJECTS.length!==1?"s":""}. Dashboard ready.`,"ok");
  }catch{showBanner("Failed to fetch attendance data.","err");}
  ld("fetchBtn","fetchSpin",false);
}

/* â•â•â• EXPORT CSV â•â•â• */
function exportCSV(){
  if(!SUBJECTS.length) return;
  const hdr=["Subject","Code","Weighted%","Status","Components","Conducted","Attended","Absent"];
  const rows=SUBJECTS.map(s=>[
    `"${s.name.replace(/"/g,'""')}"`,s.code,s.aggPct,
    s.status==="safe"?"Safe":s.status==="cond"?"Conditional":"Danger",
    `"${s.components.map(c=>`${c.key}:${c.attended}/${c.conducted}=${c.pct}%(w${c.weight})`).join("; ")}"`,
    s.conducted,s.attended,s.absent
  ].join(","));
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([[hdr.join(","),...rows].join("\n")],{type:"text/csv"}));
  a.download="kl_attendance.csv";a.click();
  showBanner("Exported successfully","ok");
}

/* â•â•â• INIT â•â•â• */
requestIdleCallback ? requestIdleCallback(refreshCaptcha) : setTimeout(refreshCaptcha,0);
document.getElementById("user").addEventListener("keydown",e=>e.key==="Enter"&&document.getElementById("pass").focus());
document.getElementById("pass").addEventListener("keydown",e=>e.key==="Enter"&&document.getElementById("captcha").focus());
document.getElementById("captcha").addEventListener("keydown",e=>e.key==="Enter"&&login());
