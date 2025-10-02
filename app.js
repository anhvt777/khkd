// v3.1 — Adds: Excel export, templates (weekly/monthly), stricter RBAC (space memberships), and reminder docs.
const supabase = window.supabase.createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let TAB='tasks';
function switchTab(tab){
  TAB=tab; $$("#nav .link").forEach(el=>el.classList.toggle('active', el.dataset.tab===tab)); renderAuth();
}

async function renderAuth(){
  const { data:{ user } } = await supabase.auth.getUser();
  const authArea = $("#authArea");
  if(!user){
    authArea.innerHTML = `<form class="row" onsubmit="return false">
      <input id="email" type="email" placeholder="Email cán bộ" required style="width:220px">
      <input id="password" type="password" placeholder="Mật khẩu" required style="width:150px">
      <button class="btn primary" onclick="login()">Đăng nhập</button>
      <button class="btn ghost" onclick="signup()">Đăng ký</button></form>`;
    $("#root").innerHTML = `<div class="card"><b>Đăng nhập để sử dụng hệ thống.</b></div>`;
  }else{
    const me = await getMyProfile();
    authArea.innerHTML = `<span class="small">Xin chào: <b>${me?.full_name||user.email}</b> <span class="badge">${me?.role||'member'}</span></span>
      <button class="btn" onclick="logout()">Đăng xuất</button>`;
    if(TAB==='tasks') await renderTasksPage();
    if(TAB==='dashboard') await renderDashboardPage();
    if(TAB==='goals') await renderGoalsPage();
    if(TAB==='import') await renderImportPage();
    if(TAB==='admin') await renderAdminPage();
  }
}
async function login(){ const { error } = await supabase.auth.signInWithPassword({ email:$("#email").value.trim(), password:$("#password").value }); if(error) alert(error.message); renderAuth(); }
async function signup(){ const { error } = await supabase.auth.signUp({ email:$("#email").value.trim(), password:$("#password").value }); if(error) alert(error.message); else alert("Đăng ký thành công. Quản trị hãy gán full_name & role trong profiles, và thêm vào space_members nếu dùng quyền theo Space."); }
async function logout(){ await supabase.auth.signOut(); renderAuth(); }
async function getMyProfile(){ const { data:{user} } = await supabase.auth.getUser(); if(!user) return null; const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single(); return data; }

function todayISO(){ const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
function startOfWeek(d){ const dt=new Date(d); const day=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-day); dt.setHours(0,0,0,0); return dt; }
function endOfWeek(d){ const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e; }
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999); }
function within(t, start, end){ const due=new Date(t.due_date); return due>=start && due<=end; }

// Data
async function fetchSpaces(){ const { data } = await supabase.from('spaces').select('*').order('name'); return data||[]; }
async function fetchFolders(spaceId){ const { data } = await supabase.from('folders').select('*').eq('space_id', spaceId).order('name'); return data||[]; }
async function fetchLists(folderId){ const { data } = await supabase.from('lists').select('*').eq('folder_id', folderId).order('name'); return data||[]; }
async function fetchMembers(){ const { data } = await supabase.from('profiles').select('id,full_name,role').order('full_name'); return data||[]; }
async function fetchTasks(listId){ let q=supabase.from('tasks').select('*, profiles!tasks_assignee_fkey(full_name,role)').order('due_date',{ascending:true}); if(listId) q=q.eq('list_id', listId); const { data } = await q; return data||[]; }
async function fetchGoals(listId){ let q=supabase.from('goals').select('*').order('created_at',{ascending:false}); if(listId) q=q.eq('list_id', listId); const { data } = await q; return data||[]; }

// Realtime
let channel=null;
async function ensureRealtime(){
  if(channel) return;
  channel = supabase.channel('rt')
    .on('postgres_changes', { event:'*', schema:'public', table:'tasks' }, ()=>{ if(TAB==='tasks') renderTasksOnly(); if(TAB==='dashboard') renderDashboardOnly(); if(TAB==='goals') renderGoalsOnly(); })
    .subscribe();
}

// TASKS
let state = { view:'week', focus:todayISO(), filterStatus:'all', q:'', space:null, folder:null, list:null };
let cache = { spaces:[], folders:[], lists:[], members:[], tasks:[] };

async function renderTasksPage(){
  await ensureRealtime();
  cache.spaces = await fetchSpaces();
  $("#root").innerHTML = `
    <div class="grid">
      <section class="card">
        <h3>Tạo công việc</h3>
        <div class="row wrap">
          <input id="title" placeholder="Tên công việc">
          <input id="due" type="date" style="width:160px" value="${todayISO()}">
        </div>
        <div class="row wrap" style="margin-top:6px">
          <select id="assignee" style="width:200px"></select>
          <select id="status" style="width:160px">
            <option value="todo">Cần làm</option>
            <option value="doing">Đang làm</option>
            <option value="done">Hoàn thành</option>
          </select>
          <input id="points" type="number" min="0" placeholder="KPI" style="width:120px">
        </div>
        <textarea id="note" rows="2" placeholder="Ghi chú" style="margin-top:6px"></textarea>
        <div class="row wrap" style="margin-top:6px">
          <select id="repeat" style="width:180px">
            <option value="none">Không lặp</option>
            <option value="daily">Lặp hằng ngày</option>
            <option value="weekly">Lặp hằng tuần</option>
            <option value="monthly">Lặp hằng tháng</option>
          </select>
          <input id="repeatCount" type="number" min="1" placeholder="Số lần lặp" style="width:140px">
          <button class="btn" onclick="generateRecurring()">Sinh tác vụ lặp</button>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn primary" onclick="createTask()">Tạo</button>
          <button class="btn" onclick="$('#title').value='';$('#note').value=''">Xoá nhập</button>
        </div>

        <hr style="margin:12px 0;border:none;border-top:1px solid var(--line)">
        <h3>Chọn Space / Folder / List</h3>
        <div class="row wrap">
          <select id="spaceSel"></select>
          <select id="folderSel"></select>
          <select id="listSel"></select>
        </div>
      </section>

      <section>
        <div class="card">
          <div class="row wrap" style="justify-content:space-between">
            <div class="row" style="gap:6px">
              <button class="btn" onclick="setView('day')">Ngày</button>
              <button class="btn" onclick="setView('week')">Tuần</button>
              <button class="btn" onclick="setView('month')">Tháng</button>
              <button class="btn" onclick="setView('table')">Bảng</button>
            </div>
            <div class="row">
              <input id="focus" type="date" value="${state.focus}" onchange="renderTasksOnly()">
              <select id="filterStatus" onchange="state.filterStatus=this.value;renderTasksOnly()">
                <option value="all">Tất cả</option>
                <option value="todo">Cần làm</option>
                <option value="doing">Đang làm</option>
                <option value="done">Hoàn thành</option>
              </select>
              <input id="q" placeholder="Tìm kiếm" oninput="state.q=this.value.toLowerCase();renderTasksOnly()">
            </div>
          </div>
        </div>
        <div id="kpis" class="row" style="gap:12px;margin:10px 0"></div>
        <div class="row" style="gap:8px;margin-bottom:8px">
          <button class="btn" onclick="exportExcel()">Xuất Excel (theo view hiện tại)</button>
        </div>
        <div id="listArea"></div>
      </section>
    </div>
  `;

  cache.members = await fetchMembers();
  $("#assignee").innerHTML = cache.members.map(m=>`<option value="${m.id}">${m.full_name||'(Không tên)'}${m.role?' • '+m.role:''}</option>`).join('');

  const sp=$("#spaceSel"), fo=$("#folderSel"), li=$("#listSel");
  sp.innerHTML = `<option value="">(Chọn Space)</option>` + cache.spaces.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  sp.onchange = async ()=>{ state.space=sp.value||null; cache.folders = state.space? await fetchFolders(state.space):[];
    fo.innerHTML = `<option value="">(Chọn Folder)</option>` + cache.folders.map(f=>`<option value="${f.id}">${f.name}</option>`).join(''); fo.onchange();
  };
  fo.onchange = async ()=>{ state.folder=fo.value||null; cache.lists = state.folder? await fetchLists(state.folder):[];
    li.innerHTML = `<option value="">(Chọn List)</option>` + cache.lists.map(l=>`<option value="${l.id}">${l.name}</option>`).join(''); li.onchange();
  };
  li.onchange = async ()=>{ state.list=li.value||null; await loadTasksAndRender(); };
  if(cache.spaces[0]){ sp.value=cache.spaces[0].id; sp.onchange(); }
}

async function loadTasksAndRender(){ cache.tasks = await fetchTasks(state.list); renderTasksOnly(); }
function setView(v){ state.view=v; renderTasksOnly(); }
function matchFilters(t, start, end){
  const fs=state.filterStatus, q=state.q; let pass=true;
  if(fs!=='all' && t.status!==fs) pass=false;
  if(q && !((t.title||'').toLowerCase().includes(q) || (t.note||'').toLowerCase().includes(q))) pass=false;
  if(start && end && !within(t,start,end)) pass=false;
  return pass;
}
function renderKPIs(items,label){
  const total=items.length, done=items.filter(t=>t.status==='done').length;
  const pts=items.reduce((a,t)=>a+(t.points||0),0);
  const ptsDone=items.filter(t=>t.status==='done').reduce((a,t)=>a+(t.points||0),0);
  $("#kpis").innerHTML = `
    <div class="card"><div class="small">${label}: Tổng việc</div><b>${total}</b></div>
    <div class="card"><div class="small">${label}: Hoàn thành</div><b>${done}</b></div>
    <div class="card"><div class="small">${label}: Điểm/KPI</div><b>${pts}</b></div>
    <div class="card"><div class="small">${label}: Điểm đã đạt</div><b>${ptsDone}</b></div>`;
}
function taskCard(t){
  const name=t.profiles?.full_name||'—';
  return `<div class="task">
    <div class="row" style="justify-content:space-between">
      <b>${t.title}</b>
      <div class="small">
        <span class="badge">${new Date(t.due_date).toLocaleDateString('vi-VN')}</span>
        <span class="badge">${name}</span>
        <span class="badge">KPI: ${t.points||0}</span>
      </div>
    </div>
    <div class="small" style="margin-top:6px">${t.note||''}</div>
    <div class="row" style="margin-top:8px">
      <select onchange="updateStatus('${t.id}', this.value)">
        <option value="todo" ${t.status==='todo'?'selected':''}>Cần làm</option>
        <option value="doing" ${t.status==='doing'?'selected':''}>Đang làm</option>
        <option value="done" ${t.status==='done'?'selected':''}>Hoàn thành</option>
      </select>
      <button class="btn" onclick="removeTask('${t.id}')">Xoá</button>
    </div>
  </div>`;
}
function renderTasksOnly(){
  const focus=new Date($("#focus")?.value||state.focus||todayISO());
  let start,end,label='Tất cả';
  if(state.view==='day'){ start=new Date(focus); start.setHours(0,0,0,0); end=new Date(focus); end.setHours(23,59,59,999); label='Ngày'; }
  if(state.view==='week'){ start=startOfWeek(focus); end=endOfWeek(focus); label='Tuần'; }
  if(state.view==='month'){ start=startOfMonth(focus); end=endOfMonth(focus); label='Tháng'; }
  let items = cache.tasks.filter(t=>state.view==='table'?matchFilters(t):matchFilters(t,start,end));
  renderKPIs(items,label);
  if(state.view==='table'){
    const rows = items.map(t=>`<tr><td>${new Date(t.due_date).toLocaleDateString('vi-VN')}</td><td>${t.title}</td><td>${t.profiles?.full_name||''}</td><td>${t.status}</td><td>${t.points||0}</td><td>${t.note||''}</td></tr>`).join('');
    $("#listArea").innerHTML = `<div class="card"><table><thead><tr><th>Ngày hạn</th><th>Công việc</th><th>Giao cho</th><th>Trạng thái</th><th>KPI</th><th>Ghi chú</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }else{
    const groups={}; items.forEach(t=>{const k=t.assignee||'ungroup'; (groups[k]=groups[k]||[]).push(t);});
    const html = Object.entries(groups).map(([id,arr])=>{
      const name = arr[0]?.profiles?.full_name || (id==='ungroup'?'Chưa giao':'(Ẩn danh)');
      const stats = `${arr.filter(x=>x.status==='done').length}/${arr.length} • ${arr.reduce((a,x)=>a+(x.points||0),0)} KPI`;
      return `<div class="card" style="margin-bottom:10px">
        <div class="row" style="justify-content:space-between"><b>${name}</b><span class="small">${stats}</span></div>
        <div style="display:grid;gap:8px;margin-top:8px">${arr.map(taskCard).join('')}</div>
      </div>`;
    }).join('') || `<div class="card small">Không có công việc.</div>`;
    $("#listArea").innerHTML = html;
  }
}

async function createTask(){
  const { data:{user} } = await supabase.auth.getUser();
  if(!user) return alert("Cần đăng nhập");
  if(!state.list) return alert("Chọn List trước");
  const title=$("#title").value.trim(); if(!title) return alert("Nhập tên công việc");
  const due=$("#due").value||todayISO();
  const status=$("#status").value;
  const points=parseInt($("#points").value||"0",10);
  const note=$("#note").value.trim();
  const assignee=$("#assignee").value;
  const { error } = await supabase.from('tasks').insert({ title, due_date:due, status, points, note, assignee, list_id:state.list, created_by:user.id, repeat:'none' });
  if(error) return alert(error.message);
  $("#title").value=""; $("#note").value="";
}
async function updateStatus(id,val){ const { error } = await supabase.from('tasks').update({ status:val, done_at: val==='done'?new Date().toISOString():null }).eq('id',id); if(error) alert(error.message); }
async function removeTask(id){ if(!confirm("Xoá công việc?")) return; const { error } = await supabase.from('tasks').delete().eq('id',id); if(error) alert(error.message); }

async function generateRecurring(){
  const title=$("#title").value.trim(); if(!title) return alert("Nhập tên công việc");
  if(!state.list) return alert("Chọn List trước");
  const baseDue = new Date($("#due").value||todayISO());
  const repeat = $("#repeat").value;
  const count = parseInt($("#repeatCount").value||"0",10);
  const status=$("#status").value;
  const points=parseInt($("#points").value||"0",10);
  const note=$("#note").value.trim();
  const assignee=$("#assignee").value;
  if(repeat==='none' || !count) return alert("Chọn kiểu lặp và số lần");
  const dates=[new Date(baseDue)];
  for(let i=1;i<count;i++){
    const d=new Date(baseDue);
    if(repeat==='daily') d.setDate(d.getDate()+i);
    if(repeat==='weekly') d.setDate(d.getDate()+7*i);
    if(repeat==='monthly') d.setMonth(d.getMonth()+i);
    dates.push(d);
  }
  const rows = dates.map(d=>({ title, due_date: d.toISOString().slice(0,10), status, points, note, assignee, list_id: state.list, repeat }));
  const { error } = await supabase.from('tasks').insert(rows);
  if(error) return alert(error.message);
  alert(`Đã tạo ${rows.length} việc lặp.`);
}

// DASHBOARD (thêm Export Excel)
let charts={};
async function renderDashboardPage(){
  await ensureRealtime();
  const spaces = await fetchSpaces();
  $("#root").innerHTML = `
    <div class="card">
      <div class="row wrap" style="justify-content:space-between">
        <div class="row wrap" style="gap:8px">
          <select id="dSpace"></select>
          <select id="dFolder"></select>
          <select id="dList"></select>
          <input id="dFocus" type="date" value="${todayISO()}">
          <select id="dView">
            <option value="week">Tuần</option>
            <option value="month">Tháng</option>
            <option value="day">Ngày</option>
          </select>
          <button class="btn primary" onclick="renderDashboardOnly()">Xem</button>
        </div>
        <div class="row">
          <button class="btn" onclick="exportExcel(true)">Xuất Excel Dashboard</button>
        </div>
      </div>
    </div>
    <div class="row" style="gap:16px;flex-wrap:wrap;margin-top:12px">
      <div class="card" style="flex:1;min-width:320px"><canvas id="chartStatus"></canvas></div>
      <div class="card" style="flex:1;min-width:320px"><canvas id="chartMembers"></canvas></div>
    </div>
  `;
  const sp=$("#dSpace"),fo=$("#dFolder"),li=$("#dList");
  sp.innerHTML = `<option value="">(Chọn Space)</option>` + spaces.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  sp.onchange = async ()=>{ const fs=sp.value?await fetchFolders(sp.value):[]; fo.innerHTML = `<option value="">(Chọn Folder)</option>` + fs.map(f=>`<option value="${f.id}">${f.name}</option>`).join(''); fo.onchange(); };
  fo.onchange = async ()=>{ const ls=fo.value?await fetchLists(fo.value):[]; li.innerHTML = `<option value="">(Chọn List)</option>` + ls.map(l=>`<option value="${l.id}">${l.name}</option>`).join(''); };
  if(spaces[0]){ sp.value=spaces[0].id; sp.onchange(); }
  await renderDashboardOnly();
}
async function renderDashboardOnly(){
  const listId = $("#dList")?.value || null;
  const view = $("#dView")?.value || 'week';
  const focus = new Date($("#dFocus")?.value || todayISO());
  let start,end;
  if(view==='day'){ start=new Date(focus); start.setHours(0,0,0,0); end=new Date(focus); end.setHours(23,59,59,999); }
  if(view==='week'){ start=startOfWeek(focus); end=endOfWeek(focus); }
  if(view==='month'){ start=startOfMonth(focus); end=endOfMonth(focus); }
  let tasks = await fetchTasks(listId);
  tasks = tasks.filter(t=>within(t,start,end));
  // charts
  const byStatus = {todo:0,doing:0,done:0}; tasks.forEach(t=>{ byStatus[t.status]=(byStatus[t.status]||0)+1; });
  const c1=$("#chartStatus"); if(charts.s) charts.s.destroy();
  charts.s = new Chart(c1, { type:'bar', data:{ labels:['Cần làm','Đang làm','Hoàn thành'], datasets:[{label:'Số việc', data:[byStatus.todo||0,byStatus.doing||0,byStatus.done||0]}] } });
  const byMember={}; tasks.forEach(t=>{ const name=t.profiles?.full_name||'—'; byMember[name]=(byMember[name]||0)+(t.status==='done'?(t.points||0):0); });
  const labels=Object.keys(byMember), values=labels.map(k=>byMember[k]);
  const c2=$("#chartMembers"); if(charts.m) charts.m.destroy();
  charts.m = new Chart(c2, { type:'bar', data:{ labels, datasets:[{label:'KPI hoàn thành', data:values}] } });
  // cache for export
  window._dashboard_cache = { tasks, start, end, labels, values, byStatus };
}

// Export Excel (Tasks view or Dashboard view)
function exportExcel(fromDashboard=false){
  const wb = XLSX.utils.book_new();
  if(fromDashboard && window._dashboard_cache){
    const { tasks, byStatus, labels, values } = window._dashboard_cache;
    const sheet1 = XLSX.utils.json_to_sheet(tasks.map(t=>({
      due_date: t.due_date, title:t.title, assignee: t.profiles?.full_name||'', status:t.status, points:t.points||0, note:t.note||''
    })));
    XLSX.utils.book_append_sheet(wb, sheet1, "Tasks");
    const sheet2 = XLSX.utils.aoa_to_sheet([["Trạng thái","Số việc"], ["todo", byStatus.todo||0], ["doing", byStatus.doing||0], ["done", byStatus.done||0]]);
    XLSX.utils.book_append_sheet(wb, sheet2, "By Status");
    const sheet3 = XLSX.utils.aoa_to_sheet([["Thành viên","KPI hoàn thành"], ...labels.map((n,i)=>[n, values[i]])]);
    XLSX.utils.book_append_sheet(wb, sheet3, "By Member");
  }else{
    // current filtered tasks in Tasks page
    const focus=new Date($("#focus")?.value||state.focus||todayISO());
    let start,end;
    if(state.view==='day'){ start=new Date(focus); start.setHours(0,0,0,0); end=new Date(focus); end.setHours(23,59,59,999); }
    if(state.view==='week'){ start=startOfWeek(focus); end=endOfWeek(focus); }
    if(state.view==='month'){ start=startOfMonth(focus); end=endOfMonth(focus); }
    let items = cache.tasks.filter(t=>state.view==='table'?matchFilters(t):matchFilters(t,start,end));
    const sheet = XLSX.utils.json_to_sheet(items.map(t=>({
      due_date: t.due_date, title:t.title, assignee: t.profiles?.full_name||'', status:t.status, points:t.points||0, note:t.note||''
    })));
    XLSX.utils.book_append_sheet(wb, sheet, "Tasks");
  }
  XLSX.writeFile(wb, "report.xlsx");
}

// GOALS
async function renderGoalsPage(){
  await ensureRealtime();
  const spaces = await fetchSpaces();
  $("#root").innerHTML = `
    <div class="grid">
      <section class="card">
        <h3>Tạo Goal/KPI</h3>
        <div class="row wrap">
          <select id="gSpace"></select><select id="gFolder"></select><select id="gList"></select>
        </div>
        <div class="row wrap" style="margin-top:6px">
          <input id="goalName" placeholder="Tên Goal (VD: KPI Tuần 40)">
          <input id="goalTarget" type="number" min="0" placeholder="Mục tiêu KPI" style="width:160px">
        </div>
        <div class="row wrap" style="margin-top:6px">
          <select id="goalPeriod"><option value="week">Tuần</option><option value="month">Tháng</option></select>
          <input id="goalKey" placeholder="Khóa kỳ (VD: 2025-W40 hoặc 2025-10)" style="width:200px">
          <button class="btn primary" onclick="createGoal()">Tạo Goal</button>
        </div>
      </section>
      <section class="card">
        <h3>Danh sách Goals</h3>
        <div id="goalList"></div>
      </section>
    </div>`;
  const sp=$("#gSpace"), fo=$("#gFolder"), li=$("#gList");
  sp.innerHTML = `<option value="">(Chọn Space)</option>` + spaces.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  sp.onchange = async ()=>{ const fs=sp.value?await fetchFolders(sp.value):[]; fo.innerHTML = `<option value="">(Chọn Folder)</option>` + fs.map(f=>`<option value="${f.id}">${f.name}</option>`).join(''); fo.onchange(); };
  fo.onchange = async ()=>{ const ls=fo.value?await fetchLists(fo.value):[]; li.innerHTML = `<option value="">(Chọn List)</option>` + ls.map(l=>`<option value="${l.id}">${l.name}</option>`).join(''); await renderGoalsOnly(); };
  if(spaces[0]){ sp.value=spaces[0].id; sp.onchange(); }
}
async function fetchGoalsAndTasks(listId){ const goals = await fetchGoals(listId); const tasks = await fetchTasks(listId); return {goals,tasks}; }
async function renderGoalsOnly(){
  const listId = $("#gList")?.value || null;
  const {goals,tasks} = await fetchGoalsAndTasks(listId);
  const html = goals.map(g=>{
    const prog = tasks.filter(t=>matchesPeriod(t,g.period_type,g.period_key) && t.status==='done').reduce((a,t)=>a+(t.points||0),0);
    const pct = g.target_points? Math.min(100, Math.round(prog*100/g.target_points)):0;
    return `<div class="card" style="margin-bottom:8px"><b>${g.name}</b> <span class="badge">${g.period_type}:${g.period_key}</span> <span class="badge">Mục tiêu: ${g.target_points}</span>
      <div class="small" style="margin-top:6px">Đã đạt: ${prog} (${pct}%)</div>
      <div style="background:#eee;height:10px;border-radius:999px;margin-top:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--brand)"></div></div></div>`;
  }).join('') || `<div class="small">Chưa có Goal</div>`;
  $("#goalList").innerHTML = html;
}
function matchesPeriod(t, type, key){
  const d=new Date(t.due_date);
  if(type==='week'){ const iso=isoWeek(d); const y=key.split('-W')[0], w=parseInt(key.split('-W')[1]||'0',10); return (iso.year+''===y && iso.week===w); }
  if(type==='month'){ const [y,m]=key.split('-'); return (d.getFullYear()==+y && (d.getMonth()+1)==+m); }
  return false;
}
function isoWeek(d){ d=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); const day=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-day); const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1)); const week=Math.ceil((((d-yearStart)/86400000)+1)/7); return {year:d.getUTCFullYear(),week}; }
async function createGoal(){
  const list = $("#gList").value; if(!list) return alert("Chọn List");
  const name = $("#goalName").value.trim(); if(!name) return alert("Nhập tên Goal");
  const target = parseInt($("#goalTarget").value||"0",10);
  const period = $("#goalPeriod").value;
  const key = $("#goalKey").value.trim(); if(!key) return alert("Nhập khóa kỳ (VD: 2025-W40)");
  const { error } = await supabase.from('goals').insert({ name, target_points:target, period_type:period, period_key:key, list_id:list });
  if(error) return alert(error.message);
  $("#goalName").value=''; $("#goalTarget").value=''; $("#goalKey").value=''; await renderGoalsOnly();
}

// IMPORT
async function renderImportPage(){
  const spaces = await fetchSpaces();
  $("#root").innerHTML = `
    <div class="card">
      <h3>Import CSV/Excel → Tạo Task hàng loạt</h3>
      <div class="small">Cột: title, due_date(YYYY-MM-DD), assignee_full_name, status(todo/doing/done), points, note</div>
      <div class="row wrap" style="margin-top:8px">
        <select id="iSpace"></select><select id="iFolder"></select><select id="iList"></select>
      </div>
      <div class="row wrap" style="margin-top:8px">
        <input type="file" id="fileInput" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel">
        <button class="btn primary" onclick="handleImport()">Import</button>
        <a class="btn" href="./tasks_template.csv" download>Download mẫu CSV</a>
      </div>
      <div id="importLog" class="small" style="margin-top:8px"></div>
    </div>`;
  const sp=$("#iSpace"),fo=$("#iFolder"),li=$("#iList");
  sp.innerHTML = `<option value="">(Chọn Space)</option>` + spaces.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  sp.onchange = async ()=>{ const fs=sp.value?await fetchFolders(sp.value):[]; fo.innerHTML = `<option value="">(Chọn Folder)</option>` + fs.map(f=>`<option value="${f.id}">${f.name}</option>`).join(''); fo.onchange(); };
  fo.onchange = async ()=>{ const ls=fo.value?await fetchLists(fo.value):[]; li.innerHTML = `<option value="">(Chọn List)</option>` + ls.map(l=>`<option value="${l.id}">${l.name}</option>`).join(''); };
  if(spaces[0]){ sp.value=spaces[0].id; sp.onchange(); }
}
async function handleImport(){
  const listId=$("#iList").value; if(!listId) return alert("Chọn List");
  const file=$("#fileInput").files[0]; if(!file) return alert("Chọn file CSV/Excel");
  const log=$("#importLog"); log.textContent='Đang đọc file...';
  const members=await fetchMembers(); const map={}; members.forEach(m=>map[(m.full_name||'').toLowerCase().trim()]=m.id);
  function toRows(rows){ return rows.map(r=>({ title:r.title, due_date:r.due_date, assignee: map[(r.assignee_full_name||'').toLowerCase().trim()]||null, status:(r.status||'todo'), points:parseInt(r.points||'0',10), note:r.note||'', list_id:listId })); }
  if(file.name.endsWith('.csv')){
    Papa.parse(file,{header:true,skipEmptyLines:true,complete:async (res)=>{ const rows=res.data; log.textContent=`Đã đọc ${rows.length} dòng. Đang ghi...`; const {error}=await supabase.from('tasks').insert(toRows(rows)); log.textContent= error?('Lỗi: '+error.message):'Import xong.'; }});
  }else{
    const reader=new FileReader();
    reader.onload=async (e)=>{ const data=new Uint8Array(e.target.result); const wb=XLSX.read(data,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{defval:''}); log.textContent=`Đã đọc ${rows.length} dòng. Đang ghi...`; const {error}=await supabase.from('tasks').insert(toRows(rows)); log.textContent= error?('Lỗi: '+error.message):'Import xong.'; };
    reader.readAsArrayBuffer(file);
  }
}

// ADMIN — Templates & hierarchy
async function renderAdminPage(){
  $("#root").innerHTML = `
    <div class="grid">
      <section class="card">
        <h3>Phân cấp & Templates</h3>
        <div class="row wrap">
          <input id="spaceName" placeholder="Tên Space">
          <button class="btn primary" onclick="createSpace()">Tạo Space</button>
        </div>
        <div class="row wrap" style="margin-top:6px">
          <select id="aSpace"></select>
          <input id="folderName" placeholder="Tên Folder">
          <button class="btn primary" onclick="createFolder()">Tạo Folder</button>
        </div>
        <div class="row wrap" style="margin-top:6px">
          <select id="aFolder"></select>
          <input id="listName" placeholder="Tên List (VD: Tuần 40 / Tháng 10)">
          <button class="btn primary" onclick="createList()">Tạo List</button>
        </div>
        <hr style="margin:12px 0;border:none;border-top:1px solid var(--line)">
        <div class="row wrap">
          <select id="tSpace"></select>
          <select id="tFolder"></select>
          <button class="btn" onclick="templateWeekly()">Tạo List Tuần (hiện tại)</button>
          <button class="btn" onclick="templateMonthly()">Tạo 4 List Tuần cho Tháng hiện tại</button>
          <button class="btn" onclick="templateGoalWeek()">Tạo Goal tuần cho List được chọn</button>
          <button class="btn" onclick="templateGoalMonth()">Tạo Goal tháng cho List được chọn</button>
        </div>
      </section>
      <section class="card">
        <h3>Cấu trúc hiện có</h3>
        <div id="tree"></div>
      </section>
    </div>`;
  await hydrateAdminSelectors();
  await renderTree();
}
async function hydrateAdminSelectors(){
  const spaces=await fetchSpaces();
  const aSpace=$("#aSpace"), aFolder=$("#aFolder"), tSpace=$("#tSpace"), tFolder=$("#tFolder");
  aSpace.innerHTML = `<option value="">(Chọn Space)</option>` + spaces.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  tSpace.innerHTML = aSpace.innerHTML;
  aSpace.onchange = async ()=>{ const folders=aSpace.value?await fetchFolders(aSpace.value):[]; aFolder.innerHTML = `<option value="">(Chọn Folder)</option>` + folders.map(f=>`<option value="${f.id}">${f.name}</option>`).join(''); };
  tSpace.onchange = async ()=>{ const folders=tSpace.value?await fetchFolders(tSpace.value):[]; tFolder.innerHTML = `<option value="">(Chọn Folder)</option>` + folders.map(f=>`<option value="${f.id}">${f.name}</option>`).join(''); };
}
async function renderTree(){
  const spaces=await fetchSpaces(); let html='';
  for(const s of spaces){
    const fs=await fetchFolders(s.id);
    html += `<div class="card" style="margin-bottom:8px"><b>Space:</b> ${s.name}<div style="margin-left:12px">`;
    for(const f of fs){
      const ls=await fetchLists(f.id);
      html += `<div><b>Folder:</b> ${f.name}<div style="margin-left:12px">${ls.map(l=>`• List: ${l.name}`).join('<br>')||'<span class="small">(chưa có list)</span>'}</div></div>`;
    }
    html += `</div></div>`;
  }
  $("#tree").innerHTML = html || '<div class="small">Chưa có Space/Folder/List</div>';
}
async function createSpace(){ const name=$("#spaceName").value.trim(); if(!name) return alert("Nhập tên Space"); const { error } = await supabase.from('spaces').insert({ name }); if(error) alert(error.message); $("#spaceName").value=''; await hydrateAdminSelectors(); await renderTree(); }
async function createFolder(){ const space=$("#aSpace").value; if(!space) return alert("Chọn Space"); const name=$("#folderName").value.trim(); if(!name) return alert("Nhập tên Folder"); const { error } = await supabase.from('folders').insert({ space_id:space, name }); if(error) alert(error.message); $("#folderName").value=''; await hydrateAdminSelectors(); await renderTree(); }
async function createList(){ const folder=$("#aFolder").value; if(!folder) return alert("Chọn Folder"); const name=$("#listName").value.trim(); if(!name) return alert("Nhập tên List"); const { error } = await supabase.from('lists').insert({ folder_id:folder, name }); if(error) alert(error.message); $("#listName").value=''; await hydrateAdminSelectors(); await renderTree(); }

// Templates
async function templateWeekly(){
  const space=$("#tSpace").value, folder=$("#tFolder").value; if(!space||!folder) return alert("Chọn Space & Folder");
  const now=new Date(); const iso=isoWeek(now); const listName=`Tuần ${iso.week}`;
  const { error } = await supabase.from('lists').insert({ folder_id:folder, name:listName });
  if(error) alert(error.message); else alert(`Đã tạo List: ${listName}`); await renderTree();
}
async function templateMonthly(){
  const folder=$("#tFolder").value; if(!folder) return alert("Chọn Folder");
  const now=new Date(); const month=now.getMonth()+1; const year=now.getFullYear();
  // Tạo 4 list tuần trong tháng hiện tại (đơn giản hoá)
  const names=[`T${month}-W1`,`T${month}-W2`,`T${month}-W3`,`T${month}-W4`];
  const rows=names.map(n=>({folder_id:folder, name:`${n}/${year}`}));
  const { error } = await supabase.from('lists').insert(rows);
  if(error) alert(error.message); else alert("Đã tạo 4 List tuần cho tháng hiện tại."); await renderTree();
}
async function templateGoalWeek(){
  // tạo goal dựa trên list được chọn ở Goals tab? Đơn giản: yêu cầu chọn list trong Goals khi tạo.
  alert("Vào tab Goals/KPI để chọn List và bấm Tạo Goal tuần (đã hỗ trợ).");
}
async function templateGoalMonth(){
  alert("Vào tab Goals/KPI để chọn List và bấm Tạo Goal tháng (đã hỗ trợ).");
}

// Utils isoWeek
function isoWeek(d){ d=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); const day=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-day); const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1)); const week=Math.ceil((((d-yearStart)/86400000)+1)/7); return {year:d.getUTCFullYear(),week}; }

// Boot
supabase.auth.onAuthStateChange((_e,_s)=>renderAuth());
renderAuth();
