let me=null,socket=null,mode="login",room=null,localStream=null,peers={},audioCtx=null;
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const show=id=>$(id).classList.remove("hidden"),hide=id=>$(id).classList.add("hidden");
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...opt});const j=await r.json();if(!r.ok)throw Error(j.error||"حدث خطأ");return j}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function setAnnouncement(m){const e=$("#siteAnnouncement");e.textContent=m||"";e.classList.toggle("hidden",!m)}
function applyPrefs(u){document.body.dataset.theme=u?.theme||"dark";document.documentElement.classList.toggle("reduce-motion",!!u?.reduceMotion)}
function ping(){if(me?.soundsEnabled===false)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=520;g.gain.value=.025;o.connect(g);g.connect(audioCtx.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.stop(audioCtx.currentTime+.13)}catch{}}
async function refreshMe(){me=(await api("/api/me")).user;$("#authBtn").classList.toggle("hidden",!!me);$("#logoutBtn").classList.toggle("hidden",!me);$("#adminBtn").classList.toggle("hidden",!me?.isAdmin);$("#settingsBtn").classList.toggle("hidden",!me);applyPrefs(me);if(me&&!socket)connectSocket()}
async function refreshSite(){try{const j=await api("/api/site");setAnnouncement(j.announcement);const reg=$('[data-tab="register"]');if(reg)reg.classList.toggle("hidden",j.registrationOpen===false);if(j.maintenance&&!me?.isAdmin)location.href="/maintenance"}catch{}}
function connectSocket(){socket=io();
socket.on("room:update",r=>{room=r;$("#copyCode").textContent=r.code;$("#players").innerHTML=r.players.map(p=>`<div class="player"><span class="avatar">${esc(p.name[0]?.toUpperCase()||"?")}</span><span>${esc(p.name)}</span><i class="online"></i></div>`).join("");$("#startBtn").classList.toggle("hidden",r.host!==socket.id)});
socket.on("role",role=>{const n={mafia:"🔪 أنت المافيا — اخفِ هويتك",doctor:"🩺 أنت الطبيب — احمِ المدينة",citizen:"🕵️ أنت مواطن — اكتشف المافيا"};$("#roleBox").textContent=n[role];show("#roleBox")});
socket.on("chat",m=>{const d=document.createElement("div");d.className="msg";d.innerHTML=`<b>${esc(m.name)}</b> <span>${esc(m.text)}</span>`;$("#messages").appendChild(d);d.scrollIntoView();ping()});
socket.on("voice:signal",handleSignal);socket.on("site:announcement",setAnnouncement);socket.on("site:maintenance",d=>{if(d?.enabled&&!me?.isAdmin)location.href="/maintenance"});
socket.on("room:closed",m=>{alert(m||"تم إغلاق الغرفة");location.reload()});
socket.on("room:kicked",m=>{alert(m||"تم إخراجك من الغرفة");location.reload()});
socket.on("account:disabled",m=>{alert(m||"تم تعطيل الحساب");location.reload()})}
function requireAuth(){if(!me){show("#authModal");return false}return true}
$("#authBtn").onclick=()=>show("#authModal");$("#joinOpen").onclick=()=>requireAuth()&&show("#joinModal");
$$("[data-close]").forEach(b=>b.onclick=()=>b.closest(".modal").classList.add("hidden"));
$$("[data-tab]").forEach(b=>b.onclick=()=>{$$("[data-tab]").forEach(x=>x.classList.remove("active"));b.classList.add("active");mode=b.dataset.tab;$("#password").autocomplete=mode==="login"?"current-password":"new-password"});
$("#authForm").onsubmit=async e=>{e.preventDefault();$("#authError").textContent="";try{const j=await api("/api/"+mode,{method:"POST",body:JSON.stringify({username:$("#username").value,password:$("#password").value})});me=j.user;hide("#authModal");await refreshMe()}catch(e){$("#authError").textContent=e.message}};
$("#logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
$("#createBtn").onclick=()=>{if(!requireAuth())return;socket.emit("room:create",{},r=>r.ok?enterGame(r.code):alert(r.error))};
$("#joinBtn").onclick=()=>socket.emit("room:join",$("#roomCode").value,r=>r.ok?enterGame(r.code):alert(r.error));
function enterGame(code){room={code};document.querySelector("main").classList.add("hidden");show("#game");$("#copyCode").textContent=code;hide("#joinModal");scrollTo(0,0)}
$("#copyCode").onclick=()=>navigator.clipboard?.writeText($("#copyCode").textContent);
$("#startBtn").onclick=()=>socket.emit("game:start",{},r=>{if(!r.ok)alert(r.error)});
$("#chatForm").onsubmit=e=>{e.preventDefault();const v=$("#chatInput").value.trim();if(v){socket.emit("chat",v);$("#chatInput").value=""}};
const rtcCfg={iceServers:[{urls:"stun:stun.l.google.com:19302"}]};
async function enableVoice(){try{localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});$("#voiceBtn").classList.add("micOn");$("#voiceBtn").textContent="🎙 الصوت يعمل";for(const p of(room?.players||[]))if(p.id!==socket.id)await makePeer(p.id,true)}catch{alert("تعذر تشغيل الميكروفون. اسمح للموقع باستخدامه وافتح الموقع عبر HTTPS أو localhost.")}}
async function makePeer(id,offerer=false){if(peers[id])return peers[id];const pc=new RTCPeerConnection(rtcCfg);peers[id]=pc;localStream?.getTracks().forEach(t=>pc.addTrack(t,localStream));pc.onicecandidate=e=>e.candidate&&socket.emit("voice:signal",{to:id,data:{candidate:e.candidate}});pc.ontrack=e=>{let a=document.getElementById("audio-"+id);if(!a){a=document.createElement("audio");a.id="audio-"+id;a.autoplay=true;document.body.appendChild(a)}a.srcObject=e.streams[0]};if(offerer){const o=await pc.createOffer();await pc.setLocalDescription(o);socket.emit("voice:signal",{to:id,data:{sdp:pc.localDescription}})}return pc}
async function handleSignal({from,data}){if(!localStream)return;const pc=await makePeer(from,false);if(data.sdp){await pc.setRemoteDescription(data.sdp);if(data.sdp.type==="offer"){const a=await pc.createAnswer();await pc.setLocalDescription(a);socket.emit("voice:signal",{to:from,data:{sdp:pc.localDescription}})}}if(data.candidate)try{await pc.addIceCandidate(data.candidate)}catch{}}
$("#voiceBtn").onclick=()=>localStream?(()=>{localStream.getAudioTracks().forEach(t=>t.enabled=!t.enabled);$("#voiceBtn").classList.toggle("micOn")})():enableVoice();
// ---------- Single-device offline / Pass & Play ----------
const OFFLINE_KEY="mafia_offline_game_v1";
let offlineState=null;
let offlineRoleVisible=false;

const offlineRoles={
  mafia:{name:"المافيا",emoji:"🔪",desc:"اخفِ هويتك وحاول التخلص من بقية اللاعبين بدون ما ينكشف أمرك."},
  doctor:{name:"الطبيب",emoji:"🩺",desc:"أنت الطبيب. حاول حماية اللاعبين ومساعدة المدينة على النجاة."},
  citizen:{name:"المواطن",emoji:"🕵️",desc:"راقب الكلام والتصرفات واكتشف من هو المافيا قبل فوات الأوان."}
};

function offlineShuffle(items){
  const a=[...items];
  for(let i=a.length-1;i>0;i--){
    const buf=new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j=buf[0]%(i+1);
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function offlineSave(){
  if(!offlineState)return;
  const safe={...offlineState,revealVisible:false};
  localStorage.setItem(OFFLINE_KEY,JSON.stringify(safe));
}

function offlineLoad(){
  try{
    const s=JSON.parse(localStorage.getItem(OFFLINE_KEY)||"null");
    if(!s||!Array.isArray(s.players)||s.players.length<6)return null;
    return s;
  }catch{return null}
}

function offlineBuildNames(){
  const count=Math.max(6,parseInt($("#offlinePlayerCount").value||"6",10)||6);
  $("#offlinePlayerCount").value=count;
  const old=[...$("#offlineNames").querySelectorAll("input")].map(i=>i.value);
  $("#offlineNames").innerHTML=Array.from({length:count},(_,i)=>`
    <label class="offlineNameField">
      <span>اللاعب ${i+1}</span>
      <input class="offlineNameInput" maxlength="24" value="${esc(old[i]||"")}" placeholder="اسم اللاعب ${i+1}">
    </label>
  `).join("");
}

function offlineAssign(names){
  const mafiaCount=Math.max(1,Math.floor(names.length/4));
  const roles=[
    ...Array(mafiaCount).fill("mafia"),
    "doctor",
    ...Array(Math.max(0,names.length-mafiaCount-1)).fill("citizen")
  ];
  const shuffled=offlineShuffle(roles);
  return names.map((name,i)=>({name,role:shuffled[i],alive:true}));
}

function openOffline(){
  document.querySelector("main").classList.add("hidden");
  $("#game").classList.add("hidden");
  $("#offlineGame").classList.remove("hidden");
  $("#offlineSetupModal").classList.add("hidden");
  scrollTo(0,0);
  renderOffline();
}

function closeOfflineToHome(){
  $("#offlineGame").classList.add("hidden");
  document.querySelector("main").classList.remove("hidden");
  scrollTo(0,0);
}

function renderOffline(){
  if(!offlineState)return;
  offlineRoleVisible=false;
  const reveal=offlineState.stage!=="board";
  $("#offlineReveal").classList.toggle("hidden",!reveal);
  $("#offlineBoard").classList.toggle("hidden",reveal);
  $("#offlineTitle").textContent=reveal?"كشف الأدوار":"إدارة الجولة";
  if(reveal)renderOfflineReveal();
  else renderOfflineBoard();
}

function renderOfflineReveal(){
  const total=offlineState.players.length;
  const i=Math.min(offlineState.revealIndex||0,total-1);
  const p=offlineState.players[i];
  $("#offlineCurrentName").textContent=p.name;
  $("#offlineProgressText").textContent=`${i+1} / ${total}`;
  $("#offlineProgressBar").style.width=`${((i+1)/total)*100}%`;
  $("#offlineRoleCard").classList.add("hidden");
  $("#offlineRevealBtn").textContent="أنا جاهز — أظهر دوري";
  $("#offlineRevealHelp").textContent="تأكد أن لا أحد غيرك يرى الشاشة";
  $("#offlinePassIcon").textContent="📱";
}

function renderOfflineBoard(){
  const players=offlineState.players;
  const alive=players.filter(p=>p.alive).length;
  $("#offlineRound").textContent=offlineState.round||1;
  $("#offlineAlive").textContent=alive;
  $("#offlineDead").textContent=players.length-alive;
  $("#offlineTotal").textContent=players.length;
  $("#offlinePlayersBoard").innerHTML=players.map((p,i)=>`
    <button class="offlinePlayerState ${p.alive?"alive":"dead"}" data-offline-player="${i}">
      <span class="avatar">${esc((p.name[0]||"?").toUpperCase())}</span>
      <span class="offlinePlayerName">${esc(p.name)}</span>
      <b>${p.alive?"حي":"خارج اللعبة"}</b>
    </button>
  `).join("");
  $("#offlinePlayersBoard [data-offline-player]").forEach(btn=>{
    btn.onclick=()=>{
      const i=Number(btn.dataset.offlinePlayer);
      offlineState.players[i].alive=!offlineState.players[i].alive;
      offlineSave();
      renderOfflineBoard();
    };
  });
  $("#offlineAllRoles").classList.add("hidden");
}

$("#offlineOpen").onclick=()=>{
  $("#offlineError").textContent="";
  if(!$("#offlineNames").children.length)offlineBuildNames();
  const saved=offlineLoad();
  $("#offlineResume").classList.toggle("hidden",!saved);
  show("#offlineSetupModal");
};

$("#offlineBuildNames").onclick=offlineBuildNames;
$("#offlinePlayerCount").onchange=offlineBuildNames;

$("#offlineStart").onclick=()=>{
  $("#offlineError").textContent="";
  const inputs=[...$("#offlineNames").querySelectorAll(".offlineNameInput")];
  if(inputs.length<6){$("#offlineError").textContent="يلزم 6 لاعبين على الأقل";return}
  const names=inputs.map((x,i)=>x.value.trim()||`لاعب ${i+1}`);
  const normalized=names.map(n=>n.toLowerCase());
  if(new Set(normalized).size!==names.length){
    $("#offlineError").textContent="استخدم اسمًا مختلفًا لكل لاعب";
    return;
  }
  offlineState={
    version:1,
    stage:"reveal",
    revealIndex:0,
    round:1,
    createdAt:Date.now(),
    players:offlineAssign(names)
  };
  offlineSave();
  openOffline();
};

$("#offlineResume").onclick=()=>{
  offlineState=offlineLoad();
  if(offlineState)openOffline();
};

$("#offlineRevealBtn").onclick=()=>{
  if(!offlineState)return;
  const i=offlineState.revealIndex||0;
  const p=offlineState.players[i];
  if(!offlineRoleVisible){
    offlineRoleVisible=true;
    const role=offlineRoles[p.role]||offlineRoles.citizen;
    $("#offlineRoleEmoji").textContent=role.emoji;
    $("#offlineRoleName").textContent=role.name;
    $("#offlineRoleDesc").textContent=role.desc;
    $("#offlineRoleCard").classList.remove("hidden");
    $("#offlineRevealBtn").textContent=i===offlineState.players.length-1
      ?"إخفاء الدور وبدء الجولة"
      :"إخفاء الدور وتمرير الهاتف";
    $("#offlineRevealHelp").textContent="احفظ دورك ثم أخفِ الشاشة قبل تمرير الهاتف";
    $("#offlinePassIcon").textContent="🤫";
    return;
  }

  offlineRoleVisible=false;
  if(i>=offlineState.players.length-1){
    offlineState.stage="board";
    offlineState.revealIndex=0;
    offlineSave();
    renderOffline();
  }else{
    offlineState.revealIndex=i+1;
    offlineSave();
    renderOfflineReveal();
  }
};

$("#offlineNextRound").onclick=()=>{
  if(!offlineState)return;
  offlineState.round=(offlineState.round||1)+1;
  offlineSave();
  renderOfflineBoard();
};

$("#offlineRedistribute").onclick=()=>{
  if(!offlineState||!confirm("إعادة توزيع الأدوار على نفس اللاعبين؟"))return;
  const names=offlineState.players.map(p=>p.name);
  offlineState={
    version:1,
    stage:"reveal",
    revealIndex:0,
    round:1,
    createdAt:Date.now(),
    players:offlineAssign(names)
  };
  offlineSave();
  renderOffline();
};

$("#offlineRevealAll").onclick=()=>{
  if(!offlineState||!confirm("هذا سيكشف أدوار كل اللاعبين. متأكد؟"))return;
  const box=$("#offlineAllRoles");
  box.innerHTML=offlineState.players.map(p=>{
    const r=offlineRoles[p.role]||offlineRoles.citizen;
    return `<div class="offlineRoleRow"><span>${r.emoji}</span><b>${esc(p.name)}</b><em>${r.name}</em><small>${p.alive?"حي":"خارج اللعبة"}</small></div>`;
  }).join("");
  box.classList.remove("hidden");
  box.scrollIntoView({behavior:"smooth",block:"nearest"});
};

$("#offlineHome").onclick=closeOfflineToHome;
$("#offlineEnd").onclick=()=>{
  if(!confirm("إنهاء لعبة الجهاز الواحد وحذف اللعبة المحفوظة؟"))return;
  localStorage.removeItem(OFFLINE_KEY);
  offlineState=null;
  closeOfflineToHome();
};

offlineBuildNames();
if("serviceWorker" in navigator){
  addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
}
Promise.allSettled([refreshMe(),refreshSite()]);