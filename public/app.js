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
Promise.all([refreshMe(),refreshSite()]);