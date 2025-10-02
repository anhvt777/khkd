// v3.2.1 Debug mode
const supabase = window.supabase.createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let TAB='tasks';
function switchTab(tab){
  TAB=tab;
  $$("#nav .link").forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
  renderAuth();
}

async function renderAuth(){
  console.log("renderAuth() bắt đầu...");
  try{
    const { data:{user}, error } = await supabase.auth.getUser();
    console.log("Supabase user:",user,"error:",error);
    const authArea=$("#authArea");
    console.log("authArea element:",authArea);
    if(!user){
      console.log("Không có user → hiển thị form đăng nhập");
      authArea.innerHTML=`<form class="row" onsubmit="return false">
        <input id="email" type="email" placeholder="Email cán bộ" required style="width:180px">
        <input id="password" type="password" placeholder="Mật khẩu" required style="width:120px">
        <button class="btn" onclick="login()">Đăng nhập</button>
        <button class="btn" onclick="signup()">Đăng ký</button></form>`;
      $("#root").innerHTML=`<div class="card"><b>Đăng nhập để sử dụng hệ thống.</b></div>`;
    }else{
      console.log("Có user:",user.email);
      authArea.innerHTML=`<span>Xin chào: <b>${user.email}</b></span>
        <button onclick="logout()">Đăng xuất</button>`;
      $("#root").innerHTML=`<div class="card">Bạn đã đăng nhập thành công.</div>`;
    }
  }catch(e){
    console.error("Lỗi trong renderAuth:",e);
  }
}

async function login(){
  console.log("Login attempt...");
  const {error}=await supabase.auth.signInWithPassword({
    email:$("#email").value.trim(),password:$("#password").value
  });
  if(error) alert(error.message);
  renderAuth();
}
async function signup(){
  console.log("Signup attempt...");
  const {error}=await supabase.auth.signUp({
    email:$("#email").value.trim(),password:$("#password").value
  });
  if(error) alert(error.message); else alert("Đăng ký thành công.");
}
async function logout(){
  console.log("Logout...");
  await supabase.auth.signOut();
  renderAuth();
}

supabase.auth.onAuthStateChange((_e,_s)=>renderAuth());
renderAuth();
