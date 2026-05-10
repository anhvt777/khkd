// KPI Engine v8.2 patch: common-base room + NIM terminology + safer reset
(function(){
  function normalizeRuntimeData(){
    if(!window.db || !db.staff || !db.kpis) return;
    let s = db.staff.find(x => x.code === 'PHONG154' || x.code === '54000601' || /chung/i.test(String(x.name||'')) && /154|phong/i.test(String(x.name||'')));
    if(!s){
      s = {code:'PHONG154', name:'54000601 - CHUNG / PHONG 154', short:'Chung 154', role:'Nen KH chung phong: tinh quy mo dau ky va thu nhap nen, khong phan bo KPI ky', type:'person', active:true, biz:false, qty:false, salary:0, weight:0};
      db.staff.push(s);
    }
    s.code = 'PHONG154';
    s.short = s.short || 'Chung 154';
    s.name = s.name || '54000601 - CHUNG / PHONG 154';
    s.type = 'person';
    s.active = true;
    s.biz = false;
    s.qty = false;
    s.salary = 0;
    s.weight = 0;
    s.excludeRanking = true;
    s.excludeAllocation = true;
    s.includeBase = true;
    s.retail = true;
    s.wholesale = true;
    s.modelType = 'COMMON_BASE';

    db.baselines = db.baselines || [];
    ['CT2','CT11','CT12','KH_VAY'].forEach(kid => {
      if(db.kpis.some(k => k.id === kid) && !db.baselines.some(b => b.sc === 'PHONG154' && b.kid === kid)){
        db.baselines.push({sc:'PHONG154', kid, base:0, rate:0});
      }
    });

    db.targets = (db.targets || []).filter(t => !(t.sc === 'PHONG154' || t.sc === '54000601'));
    db.kpis.forEach(k => {
      if(['CT2','CT11','CT12','KH_VAY'].includes(k.id)) k.useBase = true;
      if(k.id === 'HH_BIC') { k.q2 = 0.166; k.unit = 'Tỷ đồng'; }
      if(k.id === 'HH_MET') { k.q2 = 0.065; k.unit = 'Tỷ đồng'; }
    });
  }

  function basePeopleFor(k){
    normalizeRuntimeData();
    return people().filter(s => {
      const hasBase = db.baselines && db.baselines.some(b => b.sc === s.code && b.kid === k.id);
      const isCommonBase = s.code === 'PHONG154' || s.includeBase;
      return eligible(s,k) || isCommonBase || hasBase;
    });
  }
  function isMainKpiRow(r){ return r.s && r.s.biz && !r.s.excludeRanking && !r.s.excludeAllocation; }
  function isSupportKpiRow(r){ return r.s && !r.s.includeBase && !isMainKpiRow(r) && n(r.target)!==0; }
  function commonBaseSum(kid){ normalizeRuntimeData(); return (db.baselines||[]).filter(b => ((staffByCode(b.sc)||{}).includeBase || b.sc === 'PHONG154') && b.kid===kid).reduce((a,b)=>a+n(b.base),0); }
  function mainAssigned(kid){ return assignedRows().filter(r=>r.kid===kid && isMainKpiRow(r)).reduce((a,r)=>a+n(r.target),0); }
  function supportAssigned(kid){ return assignedRows().filter(r=>r.kid===kid && isSupportKpiRow(r)).reduce((a,r)=>a+n(r.target),0); }
  function mainActual(kid){ return assignedRows().filter(r=>r.kid===kid && isMainKpiRow(r)).reduce((a,r)=>a+actualVal(r.sc,r.kid),0); }

  window.resetDefault = function(){
    if(!confirm('Reset dữ liệu kiểm thử về mặc định v8.2? Dữ liệu nhập trên trình duyệt này sẽ được lưu đè.')) return;
    fetch('./kpi-default.json?v=8.2')
      .then(r => r.json())
      .then(x => {
        db = ensure(x);
        normalizeRuntimeData();
        draft = [];
        localStorage.setItem(KEY, JSON.stringify(db));
        render();
      })
      .catch(err => { console.error(err); alert('Không tải được dữ liệu mặc định v8.2. Hãy Ctrl+F5 rồi thử lại.'); });
  };

  window.summary = function(){
    normalizeRuntimeData();
    const rows = assignedRows();
    const mainRows = rows.filter(isMainKpiRow);
    const supportRows = rows.filter(isSupportKpiRow);
    const activeKpis = db.kpis.filter(k=>n(targetRoom(k.id))!==0);
    const doneCount = rows.filter(r=>actualVal(r.sc,r.kid)!==0).length;
    const avg = mainRows.length ? mainRows.reduce((b,x)=>b+Math.min(n(x.k.scoreCap||1.2), rate(actualVal(x.sc,x.kid),x.target,x.k.lower)),0)/mainRows.length : 0;
    const warnings = getWarnings();
    return `<div class="grid g4">
      <div class="card"><div class="small">Kỳ đang xem</div><div class="val">${periodName()}</div></div>
      <div class="card"><div class="small">KPI phòng có kế hoạch</div><div class="val">${activeKpis.length}</div></div>
      <div class="card"><div class="small">Dòng giao chính / giao thêm</div><div class="val">${mainRows.length} / ${supportRows.length}</div><div class="small">Đã nhập TH: ${doneCount}</div></div>
      <div class="card"><div class="small">Bình quân HT KPI chính</div><div class="val">${pct(avg)}</div><div class="small">Cảnh báo dữ liệu: ${warnings.length}</div></div>
    </div>`;
  };

  window.kpiSummaryRows = function(){
    normalizeRuntimeData();
    return db.kpis.map(k=>{
      const planValue = targetRoom(k.id);
      const assignedMain = mainAssigned(k.id);
      const assignedSupport = supportAssigned(k.id);
      const assignedTotal = assignedMain + assignedSupport;
      const actual = mainActual(k.id);
      const r = rate(actual, assignedMain || planValue, k.lower);
      const gapRoom = k.lower ? Math.max(0, actual - planValue) : Math.max(0, planValue - assignedTotal);
      const gapMain = k.lower ? Math.max(0, actual - assignedMain) : Math.max(0, assignedMain - actual);
      return {k,planValue,assignedMain,assignedSupport,assignedTotal,actual,r,gapRoom,gapMain,commonBase:commonBaseSum(k.id)};
    }).filter(x=>n(x.planValue)!==0 || n(x.assignedTotal)!==0 || n(x.commonBase)!==0);
  };

  window.kpiSummaryTable = function(){
    const rows = kpiSummaryRows();
    return `<div class="card" style="margin-top:14px"><h2>Tổng hợp KPI phòng theo kỳ</h2>
      <div class="notice">“Giao chính” là 4 cán bộ kinh doanh nhận KPI. “Giao thêm” là cán bộ hỗ trợ/ngoài xếp hạng. “Nền chung” dùng để tính quy mô đầu kỳ và thu nhập nền của phòng, không phải KPI giao cá nhân.</div>
      <div class="table"><table><thead><tr><th>KPI</th><th>Nhóm</th><th>Quy tắc</th><th class="num">KH phòng</th><th class="num">Giao chính</th><th class="num">Giao thêm</th><th class="num">Tổng giao</th><th class="num">Nền chung</th><th class="num">TH chính</th><th class="num">GAP phòng</th><th class="num">%HT chính</th></tr></thead><tbody>
      ${rows.map(x=>`<tr><td>${esc(x.k.name)}<div class="small">${x.k.id}</div></td><td>${esc(x.k.group)}</td><td>${esc(METHOD_LABEL[x.k.method]||x.k.method)}</td><td class="num">${fmt(x.planValue)}</td><td class="num">${fmt(x.assignedMain)}</td><td class="num">${fmt(x.assignedSupport)}</td><td class="num">${fmt(x.assignedTotal)}</td><td class="num">${fmt(x.commonBase)}</td><td class="num">${fmt(x.actual)}</td><td class="num">${fmt(x.gapRoom)}</td><td class="num"><span class="pill ${groupClass(x.r)}">${pct(x.r)}</span></td></tr>`).join('') || '<tr><td colspan="11">Chưa có kế hoạch KPI.</td></tr>'}
      </tbody></table></div></div>`;
  };

  window.basePage = function(){
    normalizeRuntimeData();
    const baseKpis = db.kpis.filter(k=>k.useBase);
    if(kid === 'all' || !kpiById(kid) || !kpiById(kid).useBase) kid = baseKpis[0]?.id;
    const k = kpiById(kid);
    const rows = basePeopleFor(k);
    $('app').innerHTML = summary() + `<div class="card" style="margin-top:14px"><h2>Đầu kỳ: quy mô, số lượng, NIM</h2>
      ${toolbar(`<select onchange="kid=this.value;basePage()">${baseKpis.map(x=>`<option value="${x.id}" ${x.id===kid?'selected':''}>${esc(x.name)}</option>`).join('')}</select><button onclick="applyDefaultRate('${kid}')">Áp NIM mặc định</button>`)}
      <div class="notice">Tab này đã bổ sung <b>Chung 154</b> vào nhóm có nền đầu kỳ. Dữ liệu nền chung chỉ phục vụ tính quy mô/thu nhập nền của phòng; không sinh KPI giao kỳ và không xếp hạng cá nhân.</div>
      <div class="table"><table><thead><tr><th>Cán bộ/Nhóm</th><th>Vai trò</th><th class="num">Đầu kỳ</th><th class="num">NIM %</th><th class="num">Thu nhập nền năm</th><th>Ghi chú</th></tr></thead><tbody>
      ${rows.map(s=>{const r=baseline(s.code,kid); const income=n(r.base)*n(r.rate)/100; return `<tr><td>${esc(s.short||s.name)}<div class="small">${esc(s.code)}</div></td><td>${s.includeBase?'<span class="pill warnp">Nền chung</span>':(s.biz&&!s.excludeRanking?'<span class="pill good">KPI chính</span>':'<span class="pill">Giao thêm</span>')}</td><td>${input(r.base,`onchange="baseline('${s.code}','${kid}').base=n(this.value);save();basePage()"`)}</td><td>${input(r.rate,`onchange="baseline('${s.code}','${kid}').rate=n(this.value);save();basePage()"`)}</td><td class="num">${fmt(income)}</td><td>${s.includeBase?'Không phân bổ KPI kỳ, chỉ cộng nền phòng':''}</td></tr>`}).join('') || '<tr><td colspan="6">Chưa có cán bộ/phòng phù hợp KPI này.</td></tr>'}
      </tbody></table></div></div>`;
  };

  window.trackPage = function(){
    normalizeRuntimeData();
    const rows = assignedRows().filter(x=>(sc==='all'||x.sc===sc) && (kid==='all'||x.kid===kid));
    $('app').innerHTML = summary() + `<div class="card" style="margin-top:14px"><h2>Theo dõi thực hiện</h2>
      ${toolbar(`<select onchange="sc=this.value;trackPage()"><option value="all">Tất cả cán bộ</option>${people().filter(s=>!s.includeBase && (!s.excludeRanking || s.qty || s.biz)).map(s=>`<option value="${s.code}" ${sc===s.code?'selected':''}>${esc(s.short||s.name)}</option>`).join('')}</select><select onchange="kid=this.value;trackPage()"><option value="all">Tất cả KPI</option>${db.kpis.map(k=>`<option value="${k.id}" ${kid===k.id?'selected':''}>${esc(k.name)}</option>`).join('')}</select><label class="btnlike">Import TH Excel<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importActuals(event)"></label><button onclick="createActionsFromGap()">Tạo hành động từ GAP</button>`)}
      <div class="table"><table><thead><tr><th>Loại</th><th>CB</th><th>KPI</th><th class="num">Giao</th><th class="num">TH</th><th class="num">GAP</th><th class="num">%HT</th><th>Trạng thái</th></tr></thead><tbody>
      ${rows.map(x=>{const a=actualVal(x.sc,x.kid), rr=rate(a,x.target,x.k.lower), gap=x.k.lower?Math.max(0,a-x.target):Math.max(0,x.target-a); const kind=isMainKpiRow(x)?'<span class="pill good">Chính</span>':'<span class="pill warnp">Giao thêm</span>'; return `<tr><td>${kind}</td><td>${esc(x.s.short||x.s.name)}</td><td>${esc(x.k.name)}<div class="small">${x.k.id}</div></td><td class="num">${fmt(x.target)}</td><td>${input(a,`onchange="setActual('${x.sc}','${x.kid}',this.value);trackPage()"`)}</td><td class="num">${fmt(gap)}</td><td class="num"><span class="pill ${groupClass(rr)}">${pct(rr)}</span></td><td>${statusPill(rr)}</td></tr>`}).join('') || '<tr><td colspan="8">Chưa có dữ liệu phân giao cho kỳ này.</td></tr>'}
      </tbody></table></div></div>` + actionsTable();
  };
})();
