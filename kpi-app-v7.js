const KEY = 'khkd_kpi_v7';
const OLD_KEYS = ['khkd_kpi_v6','khkd_kpi_v5','khkd_kpi_v4'];
let D, db;
let tab = 'dash';
let per = 'q2';
let kid = 'all';
let sc = 'all';
let draft = [];

const $ = id => document.getElementById(id);
const PERIODS = [
  ['year','Năm'], ['q1','Quý 1'], ['q2','Quý 2'], ['q3','Quý 3'], ['q4','Quý 4'],
  ...Array.from({length:12},(_,i)=>['m'+(i+1),'T'+(i+1)])
];
const METHOD_LABEL = {
  hybrid: 'Lai 45/35/20',
  salary: 'Theo hệ số lương',
  scale: 'Theo quy mô đầu kỳ',
  equal: 'Chia đều',
  manual: 'Thủ công'
};

function n(v){
  if(v == null || v === '') return 0;
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(s.includes('.') && s.includes(',')){
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  } else if(s.includes(',')) s = s.replace(',','.');
  else if((s.match(/\./g)||[]).length > 1) s = s.replace(/\./g,'');
  return Number(s) || 0;
}
function fmt(v,d=2){ return n(v).toLocaleString('vi-VN',{maximumFractionDigits:d}); }
function pct(v,d=1){ return (n(v)*100).toLocaleString('vi-VN',{maximumFractionDigits:d}) + '%'; }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function noAccent(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim(); }
function input(v,attr=''){ return `<input type="text" inputmode="decimal" value="${esc(v ?? '')}" ${attr}>`; }
function periodName(x=per){ return (PERIODS.find(a=>a[0]===x)||['',x])[1]; }
function periodSelect(){ return `<select onchange="per=this.value;render()">${PERIODS.map(x=>`<option value="${x[0]}" ${x[0]===per?'selected':''}>${x[1]}</option>`).join('')}</select>`; }
function staffByCode(c){ return db.staff.find(x=>x.code===c); }
function kpiById(id){ return db.kpis.find(x=>x.id===id); }
function people(){ return db.staff.filter(s=>s.active && s.type !== 'pool'); }
function businessPeople(){ return people().filter(s=>s.biz && !s.excludeRanking); }
function planIn(data,id){
  data.roomPlans = data.roomPlans || [];
  let r = data.roomPlans.find(x=>x.kid===id);
  const k = (data.kpis || []).find(x=>x.id===id);
  if(!r && k){
    r = {kid:id, annual:n(k.q2)*4, q1:.25, q2:.25, q3:.25, q4:.25};
    for(let i=1;i<=12;i++) r['m'+i] = 1/12;
    data.roomPlans.push(r);
  }
  return r || {kid:id, annual:0};
}
function plan(id){ return planIn(db,id); }
function targetRoom(id,x=per){ const r=plan(id); return x==='year' ? n(r.annual) : n(r.annual)*n(r[x]); }
function sumQuarters(r){ return n(r.q1)+n(r.q2)+n(r.q3)+n(r.q4); }
function sumMonths(r){ let s=0; for(let i=1;i<=12;i++) s+=n(r['m'+i]); return s; }

function ensure(d){
  d.targets = d.targets || [];
  d.actuals = d.actuals || [];
  d.baselines = d.baselines || [];
  d.roomPlans = d.roomPlans || [];
  d.actions = d.actions || [];
  d.status = d.status || {};
  d.staff = d.staff || [];
  d.kpis = d.kpis || [];

  d.staff.forEach(s=>{
    if(s.active == null) s.active = true;
    if(!s.type) s.type = s.code === 'CHUNG' ? 'pool' : 'person';
    if(s.code === 'CHUNG') s.type = 'pool';
    if(s.code === 'VTA' || noAccent(s.role).includes('quan ly')) s.excludeRanking = true;
    if(s.productivity == null) s.productivity = s.type === 'pool' ? 0 : 1;
    if(!s.modelType) s.modelType = s.type === 'pool' ? 'POOL' : (s.biz ? 'PRM' : (s.qty ? 'SUPPORT' : 'OTHER'));
    if(s.retailRatio == null) s.retailRatio = s.modelType === 'DUAL' ? .8 : (s.modelType === 'WHOLESALE' ? 0 : 1);
    if(s.wholesaleRatio == null) s.wholesaleRatio = Math.max(0, 1 - n(s.retailRatio));
    if(s.retail == null) s.retail = !!(s.biz || s.qty);
    if(s.wholesale == null) s.wholesale = s.modelType === 'DUAL' || s.modelType === 'WHOLESALE';
    if(s.potentialWeight == null) s.potentialWeight = 1;
  });

  d.kpis.forEach(k=>{
    if(!k.method) k.method = 'manual';
    if(['F06','F07','F08','F09','F10'].includes(k.id) && (!k._methodReviewed)) k.method = 'hybrid';
    if(!k.segment) k.segment = 'retail';
    if(k.useBase == null) k.useBase = ['F06','F07','F08','F09','F10','Q02','Q03','Q07'].includes(k.id);
    if(k.incomeBase == null) k.incomeBase = ['F06','F07','F08','F09','F10'].includes(k.id);
    if(k.defaultRate == null) k.defaultRate = 0;
    if(k.scoreCap == null) k.scoreCap = 1.2;
    if(k.importance == null) k.importance = (k.group === 'Rủi ro' || k.group === 'Hiệu quả' || k.group === 'Quy mô') ? 1 : .8;
    if(!k.shortName) k.shortName = k.name;
  });

  d.kpis.forEach(k=>planIn(d, k.id));
  return d;
}
function save(){ localStorage.setItem(KEY, JSON.stringify(db)); }
function load(){
  try{
    const current = JSON.parse(localStorage.getItem(KEY));
    if(current) return ensure(current);
  }catch(e){}
  for(const oldKey of OLD_KEYS){
    try{
      const old = JSON.parse(localStorage.getItem(oldKey));
      if(old && (old.targets?.length || old.actuals?.length)){
        const migrated = ensure(old);
        localStorage.setItem(KEY, JSON.stringify(migrated));
        return migrated;
      }
    }catch(e){}
  }
  const fresh = ensure(structuredClone(D));
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}
function resetDefault(){
  if(!confirm('Reset dữ liệu kiểm thử về mặc định v7? Dữ liệu nhập trên trình duyệt này sẽ được lưu đè.')) return;
  db = ensure(structuredClone(D));
  draft = [];
  save();
  render();
}

function baseline(sc,kid){
  db.baselines = db.baselines || [];
  let r = db.baselines.find(x=>x.sc===sc && x.kid===kid);
  if(!r){ r = {sc,kid,base:0,rate:0}; db.baselines.push(r); }
  return r;
}
function baseVal(sc,kid){ return n((db.baselines.find(x=>x.sc===sc && x.kid===kid)||{}).base); }
function actualVal(sc,kid,x=per){ return n((db.actuals.find(a=>a.sc===sc && a.kid===kid && a.period===x)||{}).actual); }
function setActual(sc,kid,v,x=per){
  let r = db.actuals.find(a=>a.sc===sc && a.kid===kid && a.period===x);
  if(!r){ r={sc,kid,period:x,actual:0}; db.actuals.push(r); }
  r.actual = n(v); save();
}
function setTarget(sc,kid,v,x=per,note='Thủ công'){
  let r = db.targets.find(a=>a.sc===sc && a.kid===kid && a.period===x);
  if(!r){ r={sc,kid,period:x,target:0,note}; db.targets.push(r); }
  r.target = n(v); r.note = note || r.note || 'Thủ công'; save();
}
function assignedRows(x=per){
  return db.targets.map(t=>({...t,s:staffByCode(t.sc),k:kpiById(t.kid)}))
    .filter(r=>r.s && r.k && r.period===x && n(r.target)!==0 && r.s.type!=='pool');
}

function segmentWeight(s,k){
  if(k.segment === 'wholesale') return n(s.wholesaleRatio);
  if(k.segment === 'retail') return n(s.retailRatio);
  return 1;
}
function isQuantityKpi(k){ return noAccent(k.group).includes('so luong') || /^Q/.test(k.id); }
function eligible(s,k){
  if(!s.active || s.type === 'pool') return false;
  if(s.excludeAllocation) return false;
  if(k.segment === 'retail' && !s.retail) return false;
  if(k.segment === 'wholesale' && !s.wholesale) return false;
  if(isQuantityKpi(k)) return !!(s.qty || s.biz);
  return !!s.biz;
}
function eligiblePeople(k){ return people().filter(s=>eligible(s,k)); }
function share(arr, getter, fallbackGetter){
  const vals = arr.map(x=>Math.max(0,n(getter(x))));
  let sum = vals.reduce((a,b)=>a+b,0);
  if(!sum && fallbackGetter){
    const fb = arr.map(x=>Math.max(0,n(fallbackGetter(x))));
    const fs = fb.reduce((a,b)=>a+b,0);
    return fs ? fb.map(v=>v/fs) : arr.map(()=>1/Math.max(1,arr.length));
  }
  return sum ? vals.map(v=>v/sum) : arr.map(()=>1/Math.max(1,arr.length));
}
function calcKpi(k){
  if(!k || k.method === 'manual') return [];
  const staff = eligiblePeople(k);
  if(!staff.length) return [];
  const roomT = targetRoom(k.id);
  let weights = [];

  if(k.method === 'hybrid'){
    const salaryShare = share(staff, s=>s.weight, s=>s.salary);
    const baseShare = share(staff, s=>baseVal(s.code,k.id), s=>s.weight || s.salary);
    const potShare = share(staff, s=>n(s.potentialWeight)*n(s.productivity)*segmentWeight(s,k), s=>1);
    weights = staff.map((s,i)=>({s,w:.45*salaryShare[i] + .35*baseShare[i] + .20*potShare[i], explain:'45% lương + 35% đầu kỳ + 20% tiềm năng/HSNS'}));
  } else {
    weights = staff.map(s=>{
      let w = 0, explain = '';
      if(k.method === 'salary') { w = n(s.weight) * (n(s.productivity)||1) * segmentWeight(s,k); explain = 'Theo tỷ trọng lương x HSNS x tỷ lệ BL/BB'; }
      if(k.method === 'scale') { w = baseVal(s.code,k.id) * (n(s.productivity)||1) * segmentWeight(s,k); explain = 'Theo quy mô đầu kỳ x HSNS x tỷ lệ BL/BB'; }
      if(k.method === 'equal') { w = (n(s.productivity)||1) * segmentWeight(s,k); explain = 'Chia đều có hiệu chỉnh HSNS/tỷ lệ BL-BB'; }
      return {s,w,explain};
    }).filter(x=>x.w>0);
  }
  const sw = weights.reduce((a,x)=>a+n(x.w),0);
  if(!sw) return [];
  return weights.map(x=>({
    sc:x.s.code, kid:k.id, period:per,
    target: roomT * n(x.w) / sw,
    weight:n(x.w), note:x.explain || METHOD_LABEL[k.method] || k.method
  }));
}
function calcAll(){
  draft = [];
  db.kpis.forEach(k=>draft.push(...calcKpi(k)));
  tab = 'alloc';
  render();
}
function acceptDraft(){
  if(!draft.length) return alert('Chưa có dữ liệu tính thử.');
  draft.forEach(x=>setTarget(x.sc,x.kid,x.target,x.period,x.note));
  draft = [];
  tab = 'track';
  render();
}
function rate(actual,target,lower){
  actual=n(actual); target=n(target);
  if(!target) return actual ? 1 : 0;
  return lower ? (actual <= target ? 1 : target/Math.max(actual,.000001)) : actual/target;
}
function statusPill(r){
  return r>=1 ? '<span class="pill good">Đạt</span>' : r>=.9 ? '<span class="pill warnp">Gần đạt</span>' : r>=.75 ? '<span class="pill warnp">Bám sát</span>' : '<span class="pill bad">Thiếu</span>';
}
function groupClass(r){ return r>=1 ? 'good' : r>=.75 ? 'warnp' : 'bad'; }

function nav(){
  const tabs = [
    ['dash','Dashboard'], ['staff','Cán bộ'], ['room','Số liệu phòng'], ['base','Đầu kỳ'],
    ['rules','Quy tắc KPI'], ['alloc','Phân bổ KPI'], ['track','Theo dõi'], ['review','Đánh giá']
  ];
  $('tabs').innerHTML = tabs.map(x=>`<button class="tab ${tab===x[0]?'on':''}" onclick="tab='${x[0]}';render()">${x[1]}</button>`).join('');
}
function toolbar(extra=''){
  return `<div class="toolbar">Kỳ ${periodSelect()}<button class="primary" onclick="calcAll()">Tính thử phân bổ</button><button onclick="tab='track';render()">Theo dõi</button><button onclick="exportExcel()">Xuất Excel</button><button class="danger" onclick="resetDefault()">Reset v7</button>${extra}</div>`;
}
function summary(){
  const rows = assignedRows();
  const activeKpis = db.kpis.filter(k=>n(targetRoom(k.id))!==0);
  const doneCount = rows.filter(r=>actualVal(r.sc,r.kid)!==0).length;
  const avg = rows.length ? rows.reduce((b,x)=>b+Math.min(n(x.k.scoreCap||1.2), rate(actualVal(x.sc,x.kid),x.target,x.k.lower)),0)/rows.length : 0;
  const warnings = getWarnings();
  return `<div class="grid g4">
    <div class="card"><div class="small">Kỳ đang xem</div><div class="val">${periodName()}</div></div>
    <div class="card"><div class="small">KPI phòng có kế hoạch</div><div class="val">${activeKpis.length}</div></div>
    <div class="card"><div class="small">Dòng phân giao</div><div class="val">${rows.length}</div><div class="small">Đã nhập TH: ${doneCount}</div></div>
    <div class="card"><div class="small">Bình quân hoàn thành</div><div class="val">${pct(avg)}</div><div class="small">Cảnh báo dữ liệu: ${warnings.length}</div></div>
  </div>`;
}
function getWarnings(){
  const w=[];
  db.roomPlans.forEach(r=>{
    const k = kpiById(r.kid);
    if(Math.abs(sumQuarters(r)-1)>.001) w.push(`${k?.name || r.kid}: tổng tỷ lệ quý ${pct(sumQuarters(r))}`);
    if(Math.abs(sumMonths(r)-1)>.001) w.push(`${k?.name || r.kid}: tổng tỷ lệ tháng ${pct(sumMonths(r))}`);
  });
  db.kpis.filter(k=>['scale','hybrid'].includes(k.method)).forEach(k=>{
    const staff = eligiblePeople(k);
    const totalBase = staff.reduce((a,s)=>a+baseVal(s.code,k.id),0);
    if(k.useBase && !totalBase) w.push(`${k.name}: chưa nhập đầu kỳ, công thức ${METHOD_LABEL[k.method]} sẽ tạm dùng trọng số thay thế.`);
  });
  people().forEach(s=>{
    if((s.retail || s.wholesale) && Math.abs(n(s.retailRatio)+n(s.wholesaleRatio)-1)>.001) w.push(`${s.short || s.name}: tỷ lệ BL + BB khác 100%.`);
  });
  if(!assignedRows().length) w.push('Chưa chốt phân bổ KPI cho kỳ đang xem. Bấm “Tính thử phân bổ”, sau đó “Chấp nhận phân bổ”.');
  return w;
}
function kpiSummaryRows(){
  return db.kpis.map(k=>{
    const planValue = targetRoom(k.id);
    const assigned = assignedRows().filter(r=>r.kid===k.id).reduce((a,r)=>a+n(r.target),0);
    const actual = assignedRows().filter(r=>r.kid===k.id).reduce((a,r)=>a+actualVal(r.sc,k.id),0);
    const r = rate(actual, assigned || planValue, k.lower);
    return {k,planValue,assigned,actual,r,gap:k.lower?Math.max(0,actual-(assigned||planValue)):Math.max(0,(assigned||planValue)-actual)};
  }).filter(x=>n(x.planValue)!==0 || n(x.assigned)!==0);
}
function dash(){
  const warnings = getWarnings();
  const bad = assignedRows().filter(r=>rate(actualVal(r.sc,r.kid),r.target,r.k.lower)<.75);
  $('app').innerHTML = summary() + `<div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>Luồng kiểm tra KPI Engine</h2>
      <div class="notice">Số liệu phòng → Cán bộ → Đầu kỳ → Quy tắc → Tính thử → Chốt giao → Theo dõi → Đánh giá. Bản v7 đã loại AnhVT và CHUNG khỏi xếp hạng, thêm công thức lai 45/35/20 cho HĐV/Dư nợ.</div>
      ${toolbar('<button onclick="createActionsFromGap()">Tạo hành động từ GAP</button>')}
      <h3>Cảnh báo dữ liệu</h3>${warnings.length?'<ul>'+warnings.slice(0,12).map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':'<span class="pill good">Dữ liệu ổn</span>'}
    </div>
    <div class="card"><h2>Cảnh báo thiếu mạnh</h2>
      <div class="table"><table><thead><tr><th>CB</th><th>KPI</th><th class="num">Giao</th><th class="num">TH</th><th class="num">GAP</th><th class="num">%HT</th></tr></thead><tbody>
      ${bad.slice(0,12).map(r=>{const a=actualVal(r.sc,r.kid), rr=rate(a,r.target,r.k.lower), gap=r.k.lower?Math.max(0,a-r.target):Math.max(0,r.target-a);return `<tr><td>${esc(r.s.short||r.s.name)}</td><td>${esc(r.k.name)}</td><td class="num">${fmt(r.target)}</td><td class="num">${fmt(a)}</td><td class="num">${fmt(gap)}</td><td class="num"><span class="pill ${groupClass(rr)}">${pct(rr)}</span></td></tr>`}).join('') || '<tr><td colspan="6">Chưa có cảnh báo hoặc chưa chốt phân bổ.</td></tr>'}
      </tbody></table></div>
    </div>
  </div>` + kpiSummaryTable() + actionsTable() + reviewTable(true);
}
function kpiSummaryTable(){
  const rows = kpiSummaryRows();
  return `<div class="card" style="margin-top:14px"><h2>Tổng hợp KPI phòng theo kỳ</h2>
    <div class="table"><table><thead><tr><th>KPI</th><th>Nhóm</th><th>Quy tắc</th><th class="num">KH phòng</th><th class="num">Đã giao</th><th class="num">TH</th><th class="num">GAP</th><th class="num">%HT</th></tr></thead><tbody>
    ${rows.map(x=>`<tr><td>${esc(x.k.name)}<div class="small">${x.k.id}</div></td><td>${esc(x.k.group)}</td><td>${esc(METHOD_LABEL[x.k.method]||x.k.method)}</td><td class="num">${fmt(x.planValue)}</td><td class="num">${fmt(x.assigned)}</td><td class="num">${fmt(x.actual)}</td><td class="num">${fmt(x.gap)}</td><td class="num"><span class="pill ${groupClass(x.r)}">${pct(x.r)}</span></td></tr>`).join('') || '<tr><td colspan="8">Chưa có kế hoạch KPI.</td></tr>'}
    </tbody></table></div></div>`;
}

function staffPage(){
  $('app').innerHTML = summary() + `<div class="card" style="margin-top:14px"><h2>Cán bộ và phạm vi nhận KPI</h2>
    ${toolbar('<button onclick="normalizeSalaryWeight()">Chuẩn hóa trọng số lương</button>')}
    <div class="notice">AnhVT/quản lý và mã CHUNG không đưa vào xếp hạng. 4 cán bộ QLKH nhận KPI kinh doanh; cán bộ hỗ trợ chỉ nhận chỉ tiêu số lượng nếu bật ô SL.</div>
    <div class="table"><table><thead><tr><th>Mã</th><th>Tên</th><th>Tên ngắn</th><th>Loại</th><th class="num">HSNS</th><th class="num">BL</th><th class="num">BB</th><th>Nhận BL</th><th>Nhận BB</th><th class="num">Lương</th><th class="num">Tỷ trọng</th><th>Biz</th><th>SL</th><th>Loại xếp hạng</th></tr></thead><tbody>
    ${db.staff.map(s=>`<tr><td>${esc(s.code)}</td><td><input value="${esc(s.name)}" onchange="setStaff('${s.code}','name',this.value)"></td><td><input value="${esc(s.short||'')}" onchange="setStaff('${s.code}','short',this.value)"></td><td><select onchange="setModel('${s.code}',this.value)">${['PRM','VRM','DUAL','WHOLESALE','SUPPORT','OTHER','POOL'].map(x=>`<option value="${x}" ${s.modelType===x?'selected':''}>${x}</option>`).join('')}</select></td><td>${input(s.productivity,`onchange="setStaff('${s.code}','productivity',this.value)"`)}</td><td>${input(n(s.retailRatio)*100,`onchange="setStaff('${s.code}','retailRatio',n(this.value)/100)"`)}</td><td>${input(n(s.wholesaleRatio)*100,`onchange="setStaff('${s.code}','wholesaleRatio',n(this.value)/100)"`)}</td><td><input type="checkbox" ${s.retail?'checked':''} onchange="setStaff('${s.code}','retail',this.checked)"></td><td><input type="checkbox" ${s.wholesale?'checked':''} onchange="setStaff('${s.code}','wholesale',this.checked)"></td><td>${input(s.salary,`onchange="setStaff('${s.code}','salary',this.value)"`)}</td><td>${input(n(s.weight)*100,`onchange="setStaff('${s.code}','weight',n(this.value)/100)"`)}</td><td><input type="checkbox" ${s.biz?'checked':''} onchange="setStaff('${s.code}','biz',this.checked)"></td><td><input type="checkbox" ${s.qty?'checked':''} onchange="setStaff('${s.code}','qty',this.checked)"></td><td><input type="checkbox" ${s.excludeRanking?'checked':''} onchange="setStaff('${s.code}','excludeRanking',this.checked)"></td></tr>`).join('')}
    </tbody></table></div></div>`;
}
function setStaff(code,key,val){
  const s = staffByCode(code); if(!s) return;
  if(['salary','weight','productivity','retailRatio','wholesaleRatio','potentialWeight'].includes(key)) s[key] = n(val); else s[key] = val;
  if(key === 'retailRatio') s.wholesaleRatio = Math.max(0,1-n(s.retailRatio));
  if(key === 'wholesaleRatio') s.retailRatio = Math.max(0,1-n(s.wholesaleRatio));
  save();
}
function setModel(code,val){
  const s=staffByCode(code); if(!s) return;
  s.modelType=val;
  if(val==='DUAL'){s.biz=true; s.qty=true; s.retail=true; s.wholesale=true; s.retailRatio=.8; s.wholesaleRatio=.2;}
  else if(val==='WHOLESALE'){s.biz=true; s.retail=false; s.wholesale=true; s.retailRatio=0; s.wholesaleRatio=1;}
  else if(val==='PRM' || val==='VRM'){s.biz=true; s.retail=true; s.wholesale=false; s.retailRatio=1; s.wholesaleRatio=0;}
  else if(val==='SUPPORT'){s.biz=false; s.qty=true; s.retail=true; s.wholesale=false; s.retailRatio=1; s.wholesaleRatio=0;}
  else if(val==='POOL'){s.type='pool'; s.biz=false; s.qty=false; s.retail=false; s.wholesale=false; s.productivity=0; s.excludeRanking=true;}
  save(); staffPage();
}
function normalizeSalaryWeight(){
  const arr = people().filter(s=>s.biz && !s.excludeRanking);
  const total = arr.reduce((a,s)=>a+n(s.salary),0);
  if(!total) return alert('Chưa có lương/hệ số để chuẩn hóa.');
  arr.forEach(s=>s.weight=n(s.salary)/total);
  save(); staffPage();
}

function roomPage(){
  if(kid === 'all' || !kpiById(kid)) kid = db.kpis[0]?.id;
  const selected = kpiById(kid), r=plan(kid);
  $('app').innerHTML = summary() + `<div class="card" style="margin-top:14px"><h2>Số liệu phòng: kế hoạch năm/quý/tháng</h2>
    ${toolbar('<button onclick="equalQuarter()">Chia đều quý</button><button onclick="equalMonth()">Chia đều tháng</button>')}
    <div class="table"><table><thead><tr><th>KPI</th><th>Đơn vị</th><th class="num">KH năm</th><th class="num">Q1%</th><th class="num">Q2%</th><th class="num">Q3%</th><th class="num">Q4%</th><th class="num">Tổng quý</th><th class="num">KH kỳ</th><th></th></tr></thead><tbody>
    ${db.kpis.map(k=>{const rp=plan(k.id);return `<tr><td>${esc(k.name)}<div class="small">${k.id}</div></td><td>${esc(k.unit)}</td><td>${input(rp.annual,`onchange="plan('${k.id}').annual=n(this.value);save();roomPage()"`)}</td>${['q1','q2','q3','q4'].map(q=>`<td>${input(n(rp[q])*100,`onchange="plan('${k.id}')['${q}']=n(this.value)/100;save();roomPage()"`)}</td>`).join('')}<td class="num"><span class="pill ${Math.abs(sumQuarters(rp)-1)<.001?'good':'warnp'}">${pct(sumQuarters(rp))}</span></td><td class="num"><b>${fmt(targetRoom(k.id))}</b></td><td><button onclick="kid='${k.id}';roomPage()">Chi tiết tháng</button></td></tr>`}).join('')}
    </tbody></table></div></div>${monthEditor(selected,r)}`;
}
function monthEditor(k,r){
  if(!k) return '';
  const months=Array.from({length:12},(_,i)=>'m'+(i+1));
  return `<div class="card" style="margin-top:14px"><h2>Tỷ lệ tháng: ${esc(k.name)}</h2>
    <div class="small">Tổng tỷ lệ tháng: <span class="pill ${Math.abs(sumMonths(r)-1)<.001?'good':'warnp'}">${pct(sumMonths(r))}</span></div>
    <div class="table"><table><thead><tr>${months.map((x,i)=>`<th>T${i+1}%</th>`).join('')}</tr></thead><tbody><tr>${months.map(x=>`<td>${input(n(r[x])*100,`onchange="plan('${k.id}')['${x}']=n(this.value)/100;save();roomPage()"`)}</td>`).join('')}</tr><tr>${months.map(x=>`<td><b>${fmt(n(r.annual)*n(r[x]))}</b></td>`).join('')}</tr></tbody></table></div></div>`;
}
function equalQuarter(){ db.roomPlans.forEach(r=>{r.q1=r.q2=r.q3=r.q4=.25}); save(); roomPage(); }
function equalMonth(){ db.roomPlans.forEach(r=>{for(let i=1;i<=12;i++) r['m'+i]=1/12}); save(); roomPage(); }

function basePage(){
  const baseKpis = db.kpis.filter(k=>k.useBase);
  if(kid === 'all' || !kpiById(kid) || !kpiById(kid).useBase) kid = baseKpis[0]?.id;
  const k = kpiById(kid);
  $('app').innerHTML = summary() + `<div class="card" style="margin-top:14px"><h2>Đầu kỳ: quy mô, số lượng, lãi suất/biên</h2>
    ${toolbar(`<select onchange="kid=this.value;basePage()">${baseKpis.map(x=>`<option value="${x.id}" ${x.id===kid?'selected':''}>${esc(x.name)}</option>`).join('')}</select><button onclick="applyDefaultRate('${kid}')">Áp LS mặc định</button>`)}
    <div class="notice">Đầu kỳ dùng cho công thức “Theo quy mô” và “Lai 45/35/20”. Nếu chưa nhập đầu kỳ, hệ thống tạm dùng trọng số lương để không bị trắng dashboard.</div>
    <div class="table"><table><thead><tr><th>Cán bộ</th><th>Loại</th><th class="num">Đầu kỳ</th><th class="num">LS/Biên %</th><th class="num">Thu nhập nền năm</th></tr></thead><tbody>
    ${eligiblePeople(k).map(s=>{const r=baseline(s.code,kid);return `<tr><td>${esc(s.short||s.name)}</td><td>${esc(s.modelType)}</td><td>${input(r.base,`onchange="baseline('${s.code}','${kid}').base=n(this.value);save();basePage()"`)}</td><td>${input(r.rate,`onchange="baseline('${s.code}','${kid}').rate=n(this.value);save();basePage()"`)}</td><td class="num">${fmt(n(r.base)*n(r.rate)/100)}</td></tr>`}).join('') || '<tr><td colspan="5">Chưa có cán bộ phù hợp KPI này.</td></tr>'}
    </tbody></table></div></div>`;
}
function applyDefaultRate(id){ eligiblePeople(kpiById(id)).forEach(s=>baseline(s.code,id).rate=n(kpiById(id).defaultRate)); save(); basePage(); }

function rulesPage(){
  $('app').innerHTML = summary() + `<div class="card" style="margin-top:14px"><h2>Quy tắc KPI</h2>
    ${toolbar('')}
    <div class="notice"><b>Lai 45/35/20</b> = 45% tỷ trọng lương + 35% quy mô đầu kỳ + 20% tiềm năng/HSNS. Nên áp dụng cho HĐV và dư nợ; chỉ tiêu số lượng dùng chia đều; chỉ tiêu đặc thù dùng thủ công.</div>
    <div class="table"><table><thead><tr><th>KPI</th><th>Nhóm</th><th>Đơn vị</th><th>Phân khúc</th><th>Quy tắc</th><th>Dùng đầu kỳ</th><th>TN nền</th><th class="num">LS mặc định</th><th>Thấp tốt</th><th class="num">Trần điểm</th><th class="num">Trọng số</th></tr></thead><tbody>
    ${db.kpis.map(k=>`<tr><td><input value="${esc(k.name)}" onchange="setKpi('${k.id}','name',this.value)"><div class="small">${k.id}</div></td><td><input value="${esc(k.group)}" onchange="setKpi('${k.id}','group',this.value)"></td><td><input value="${esc(k.unit)}" onchange="setKpi('${k.id}','unit',this.value)"></td><td><select onchange="setKpi('${k.id}','segment',this.value)">${['retail','wholesale','common'].map(x=>`<option value="${x}" ${k.segment===x?'selected':''}>${x}</option>`).join('')}</select></td><td><select onchange="setKpi('${k.id}','method',this.value);setKpi('${k.id}','_methodReviewed',true)">${['hybrid','salary','scale','equal','manual'].map(x=>`<option value="${x}" ${k.method===x?'selected':''}>${METHOD_LABEL[x]}</option>`).join('')}</select></td><td><input type="checkbox" ${k.useBase?'checked':''} onchange="setKpi('${k.id}','useBase',this.checked)"></td><td><input type="checkbox" ${k.incomeBase?'checked':''} onchange="setKpi('${k.id}','incomeBase',this.checked)"></td><td>${input(k.defaultRate,`onchange="setKpi('${k.id}','defaultRate',this.value)"`)}</td><td><input type="checkbox" ${k.lower?'checked':''} onchange="setKpi('${k.id}','lower',this.checked)"></td><td>${input(k.scoreCap,`onchange="setKpi('${k.id}','scoreCap',this.value)"`)}</td><td>${input(k.importance,`onchange="setKpi('${k.id}','importance',this.value)"`)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}
function setKpi(id,key,val){ const k=kpiById(id); if(!k) return; k[key]=['defaultRate','scoreCap','importance'].includes(key)?n(val):val; save(); }

function allocPage(){
  const data = draft.length ? draft : assignedRows();
  const roomTotal = db.kpis.reduce((a,k)=>a+targetRoom(k.id),0);
  const assigned = data.reduce((a,x)=>a+n(x.target),0);
  $('app').innerHTML = summary() + `<div class="card" style="margin-top:14px"><h2>Phân bổ KPI</h2>
    ${toolbar('<button onclick="acceptDraft()">Chấp nhận phân bổ</button>')}
    <div class="notice">Tổng KH phòng kỳ đang xem: <b>${fmt(roomTotal)}</b>. Tổng giao/nháp: <b>${fmt(assigned)}</b>. Lưu ý: tổng này cộng nhiều đơn vị tính khác nhau, chỉ dùng để kiểm soát nhanh. Khi kiểm soát chuẩn, xem bảng “Tổng hợp KPI phòng theo kỳ”.</div>
    <div class="table"><table><thead><tr><th>KPI</th><th>Cán bộ</th><th>Quy tắc</th><th class="num">Đầu kỳ</th><th class="num">Trọng số</th><th class="num">KPI giao</th><th>Giải thích</th></tr></thead><tbody>
    ${data.map(x=>{const k=kpiById(x.kid), s=staffByCode(x.sc), w=x.weight ?? 0;return `<tr><td>${esc(k?.name)}<div class="small">${esc(k?.id)}</div></td><td>${esc(s?.short||s?.name)}</td><td>${esc(METHOD_LABEL[k?.method]||k?.method)}</td><td class="num">${fmt(baseVal(x.sc,x.kid))}</td><td class="num">${fmt(w,4)}</td><td>${input(x.target,`onchange="setTarget('${x.sc}','${x.kid}',this.value,'${x.period||per}','Điều chỉnh tay');"`)}</td><td>${esc(x.note||'')}</td></tr>`}).join('') || '<tr><td colspan="7">Bấm “Tính thử phân bổ” để tạo bản nháp.</td></tr>'}
    </tbody></table></div></div>` + kpiSummaryTable();
}

function trackPage(){
  const rows = assignedRows().filter(x=>(sc==='all'||x.sc===sc) && (kid==='all'||x.kid===kid));
  $('app').innerHTML = summary() + `<div class="card" style="margin-top:14px"><h2>Theo dõi thực hiện</h2>
    ${toolbar(`<select onchange="sc=this.value;trackPage()"><option value="all">Tất cả cán bộ</option>${people().filter(s=>!s.excludeRanking || s.qty || s.biz).map(s=>`<option value="${s.code}" ${sc===s.code?'selected':''}>${esc(s.short||s.name)}</option>`).join('')}</select><select onchange="kid=this.value;trackPage()"><option value="all">Tất cả KPI</option>${db.kpis.map(k=>`<option value="${k.id}" ${kid===k.id?'selected':''}>${esc(k.name)}</option>`).join('')}</select><label class="btnlike">Import TH Excel<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importActuals(event)"></label><button onclick="createActionsFromGap()">Tạo hành động từ GAP</button>`)}
    <div class="table"><table><thead><tr><th>CB</th><th>KPI</th><th class="num">Giao</th><th class="num">TH</th><th class="num">GAP</th><th class="num">%HT</th><th>Trạng thái</th></tr></thead><tbody>
    ${rows.map(x=>{const a=actualVal(x.sc,x.kid), rr=rate(a,x.target,x.k.lower), gap=x.k.lower?Math.max(0,a-x.target):Math.max(0,x.target-a);return `<tr><td>${esc(x.s.short||x.s.name)}</td><td>${esc(x.k.name)}<div class="small">${x.k.id}</div></td><td class="num">${fmt(x.target)}</td><td>${input(a,`onchange="setActual('${x.sc}','${x.kid}',this.value);trackPage()"`)}</td><td class="num">${fmt(gap)}</td><td class="num"><span class="pill ${groupClass(rr)}">${pct(rr)}</span></td><td>${statusPill(rr)}</td></tr>`}).join('') || '<tr><td colspan="7">Chưa có dữ liệu phân giao cho kỳ này.</td></tr>'}
    </tbody></table></div></div>` + actionsTable();
}

function importActuals(ev){
  const file = ev.target.files?.[0];
  if(!file) return;
  if(!window.XLSX){ alert('Không tải được thư viện Excel.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try{
      const wb = XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws,{defval:''});
      let count = 0;
      rows.forEach(row=>{
        const entries = Object.entries(row);
        const h = Object.fromEntries(entries.map(([k,v])=>[noAccent(k),v]));
        const staffText = String(h['can_bo'] || h['can bo'] || h['ma cb'] || h['ma_can_bo'] || h['staff'] || h['cb'] || entries.map(x=>x[1]).join(' '));
        const kpiText = String(h['kpi'] || h['chi tieu'] || h['chi_tieu'] || h['ma kpi'] || h['ma_kpi'] || entries.map(x=>x[1]).join(' '));
        const actualText = h['thuc_hien'] ?? h['thuc hien'] ?? h['actual'] ?? h['th'] ?? h['so thuc hien'] ?? h['so_thuc_hien'] ?? h['thuc hien ky nay'];
        const rowPeriod = String(h['ky'] || h['period'] || per).trim() || per;
        const s = db.staff.find(x=> noAccent(staffText).includes(noAccent(x.code)) || noAccent(staffText).includes(noAccent(x.short)) || noAccent(staffText).includes(noAccent(x.name)) );
        const k = db.kpis.find(x=> noAccent(kpiText).includes(noAccent(x.id)) || noAccent(kpiText).includes(noAccent(x.name)) );
        if(s && k && actualText !== undefined && actualText !== ''){ setActual(s.code,k.id,actualText,rowPeriod); count++; }
      });
      alert(`Đã import ${count} dòng thực hiện. Nếu chưa nhận đúng, nên dùng file xuất từ nút “Xuất Excel” rồi nhập cột Thuc_hien.`);
      trackPage();
    }catch(err){ console.error(err); alert('Không đọc được file Excel.'); }
  };
  reader.readAsArrayBuffer(file);
}

function createActionsFromGap(){
  db.actions = db.actions || [];
  let created=0;
  assignedRows().forEach(r=>{
    const a=actualVal(r.sc,r.kid), rr=rate(a,r.target,r.k.lower);
    if(rr >= .9) return;
    const gap = r.k.lower ? Math.max(0,a-r.target) : Math.max(0,r.target-a);
    const exists = db.actions.some(x=>x.period===per && x.sc===r.sc && x.kid===r.kid && x.status!=='Done');
    if(exists) return;
    db.actions.push({
      id: 'A'+Date.now()+Math.random().toString(16).slice(2), period:per, sc:r.sc, kid:r.kid, gap,
      title: suggestAction(r.k), status:'Doing', dueDate:'', createdAt:new Date().toISOString()
    });
    created++;
  });
  save();
  alert(`Đã tạo ${created} hành động từ GAP.`);
  render();
}
function suggestAction(k){
  const name = noAccent(k.name);
  if(name.includes('huy dong')) return 'Rà soát KH tiền gửi đến hạn và lập danh sách chăm sóc bổ sung HĐV';
  if(name.includes('du no') || name.includes('vay')) return 'Cập nhật pipeline KH vay, hồ sơ đang xử lý và nguồn giải ngân tuần';
  if(name.includes('the')) return 'Lọc KH đủ điều kiện phát hành thẻ tín dụng để gọi tư vấn';
  if(name.includes('smb') || name.includes('nhdt')) return 'Lọc KH chưa dùng SmartBanking/SMB để kích hoạt trong tuần';
  if(name.includes('bic') || name.includes('met') || name.includes('bao hiem')) return 'Rà soát KH có khoản vay/tài sản bảo đảm để tư vấn bảo hiểm phù hợp';
  return `Lập danh sách KH/nguồn việc để bù GAP chỉ tiêu ${k.shortName || k.name}`;
}
function actionsTable(){
  const rows = (db.actions||[]).filter(x=>x.period===per).map(x=>({...x,s:staffByCode(x.sc),k:kpiById(x.kid)}));
  return `<div class="card" style="margin-top:14px"><h2>Hành động từ GAP KPI</h2>
    <div class="table"><table><thead><tr><th>Cán bộ</th><th>KPI</th><th>Nội dung hành động</th><th class="num">GAP lúc tạo</th><th>Hạn</th><th>Trạng thái</th></tr></thead><tbody>
    ${rows.map(x=>`<tr><td>${esc(x.s?.short||x.s?.name)}</td><td>${esc(x.k?.name)}</td><td><input value="${esc(x.title)}" onchange="setAction('${x.id}','title',this.value)"></td><td class="num">${fmt(x.gap)}</td><td><input type="date" value="${esc(x.dueDate||'')}" onchange="setAction('${x.id}','dueDate',this.value)"></td><td><select onchange="setAction('${x.id}','status',this.value);render()">${['Doing','Done','Overdue'].map(v=>`<option value="${v}" ${x.status===v?'selected':''}>${v}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="6">Chưa có hành động. Bấm “Tạo hành động từ GAP”.</td></tr>'}
    </tbody></table></div></div>`;
}
function setAction(id,key,val){ const a=(db.actions||[]).find(x=>x.id===id); if(a){a[key]=val; save();} }

function reviewPage(){ $('app').innerHTML = summary() + reviewTable(false); }
function reviewTable(short){
  const relevant = businessPeople();
  const rows = relevant.map(s=>{
    const rs = assignedRows().filter(x=>x.sc===s.code);
    const denom = rs.reduce((a,x)=>a+n(x.k.importance||1),0);
    const score = denom ? rs.reduce((a,x)=>a + Math.min(n(x.k.scoreCap||1.2), rate(actualVal(x.sc,x.kid),x.target,x.k.lower))*n(x.k.importance||1),0)/denom : 0;
    const weak = rs.filter(x=>rate(actualVal(x.sc,x.kid),x.target,x.k.lower)<.75).map(x=>x.k.shortName||x.k.name).slice(0,3).join('; ');
    return {s,score,count:rs.length,weak};
  }).sort((a,b)=>b.score-a.score);
  return `<div class="card" style="margin-top:14px"><h2>Đánh giá ${periodName()} ${short?'tóm tắt':''}</h2>
    <div class="notice">Bảng này chỉ xếp hạng cán bộ nhận KPI kinh doanh; không đưa AnhVT/quản lý và CHUNG vào so sánh.</div>
    <div class="table"><table><thead><tr><th>Hạng</th><th>Cán bộ</th><th class="num">Số KPI</th><th class="num">Điểm</th><th>Xếp loại</th><th>GAP trọng yếu</th></tr></thead><tbody>
    ${rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.s.short||x.s.name)}</td><td class="num">${x.count}</td><td class="num"><b>${pct(x.score)}</b></td><td>${x.score>=1?'<span class="pill good">Tốt</span>':x.score>=.9?'<span class="pill warnp">Gần đạt</span>':x.score>=.75?'<span class="pill warnp">Cần bám sát</span>':'<span class="pill bad">Thiếu</span>'}</td><td>${esc(x.weak||'')}</td></tr>`).join('') || '<tr><td colspan="6">Chưa có dữ liệu đánh giá.</td></tr>'}
    </tbody></table></div></div>`;
}

function exportExcel(){
  if(!window.XLSX) return alert('Không tải được thư viện Excel.');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.staff), 'Can_bo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.kpis), 'Quy_tac_KPI');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.roomPlans), 'So_lieu_phong');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.baselines.map(x=>({...x,Can_bo:staffByCode(x.sc)?.name,KPI:kpiById(x.kid)?.name}))), 'Dau_ky');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assignedRows().map(t=>({Ky:t.period,Ma_CB:t.sc,Can_bo:t.s?.name,Ma_KPI:t.kid,KPI:t.k?.name,KPI_giao:t.target,Thuc_hien:actualVal(t.sc,t.kid,t.period),GAP:t.k?.lower?Math.max(0,actualVal(t.sc,t.kid,t.period)-t.target):Math.max(0,t.target-actualVal(t.sc,t.kid,t.period)),Ty_le_HT:rate(actualVal(t.sc,t.kid,t.period),t.target,t.k?.lower)}))), 'Theo_doi');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db.actions || []), 'Hanh_dong');
  XLSX.writeFile(wb, 'KPI_Engine_PGD_Duong_9_v7.xlsx');
}

function render(){
  nav();
  const map = {dash, staff:staffPage, room:roomPage, base:basePage, rules:rulesPage, alloc:allocPage, track:trackPage, review:reviewPage};
  (map[tab] || dash)();
}

fetch('./kpi-default.json?v=7')
  .then(r=>r.json())
  .then(x=>{ D=ensure(x); db=load(); render(); })
  .catch(err=>{ console.error(err); $('app').innerHTML='<div class="card">Không tải được dữ liệu mặc định KPI.</div>'; });
