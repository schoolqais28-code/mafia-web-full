let me=null,socket=null,mode="login",room=null,localStream=null,peers={},audioCtx=null,currentVote=null;
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
socket.on("room:update",r=>{
  room=r;
  $("#copyCode").textContent=r.code;
  $("#players").innerHTML=r.players.map(p=>`<div class="player ${p.alive===false?"deadPlayer":""}"><span class="avatar">${esc(p.name[0]?.toUpperCase()||"?")}</span><span>${esc(p.name)}</span><small>${p.alive===false?"خارج اللعبة":""}</small><i class="online"></i></div>`).join("");
  $("#startBtn").classList.toggle("hidden",r.host!==socket.id||r.started);
  $("#voteBtn").classList.toggle("hidden",r.host!==socket.id||!r.started);
});
socket.on("role",role=>{
  const n={
    mafia_boss:"⭐ شيخ المافيا — يقرر الضحية النهائية للقتل كل ليلة بين اللاعبين الأحياء",
    mafia_silencer:"🤐 مافيا التسكيت — يقرر من سيسكت غدًا فلا يستطيع الكلام في النقاش",
    mafia_normal:"🔪 مافيا عادي — يعرف زملاءه ويشارك بالرأي دون قرار نهائي",
    boy:"👦 الولد — إذا خرج من اللعبة بأي شكل يختار لاعبًا حيًا آخر ليخرج معه",
    mayor:"🗳️ العمدة — الوحيد المسموح له بكشف دوره وصوته في التصويت يساوي 3 أصوات",
    citizen:"👥 مواطن عادي — لا يملك قدرة خاصة لكن رأيه وتصويته في النهار مهمان جدًا",
    doctor:"🩺 الدكتور — يحمي لاعبًا واحدًا كل ليلة من محاولة القتل ويمكنه حماية نفس الشخص أكثر من مرة",
    old_man:"👁️ الشايب — يحقق مع لاعب حي واحد كل ليلة ليعرف إن كان من المافيا أم لا",
    sniper:"🎯 القناص — يملك رصاصة واحدة طوال اللعبة وإذا أصاب صالحًا يموت معه"
  };
  $("#roleBox").textContent=n[role]||"🎭 دور سري";
  show("#roleBox")
});

function renderOnlineVoteCandidates(data){
  const box=$("#voteCandidates");
  const choices=(data.candidates||[]).filter(c=>c.id!==socket.id);
  box.innerHTML=choices.map(c=>`<button class="voteChoice" data-vote-id="${esc(c.id)}"><span class="avatar">${esc(c.name[0]?.toUpperCase()||"?")}</span><b>${esc(c.name)}</b></button>`).join("");
  if(data.allowNone){
    box.innerHTML+=`<button class="voteChoice noOneChoice" data-vote-id="__NONE__"><span>✋</span><b>لا أحد</b></button>`;
  }
  $$("#voteCandidates [data-vote-id]").forEach(btn=>{
    btn.onclick=()=>{
      if(btn.disabled)return;
      socket.emit("vote:cast",{targetId:btn.dataset.voteId},res=>{
        if(!res?.ok){alert(res?.error||"تعذر تسجيل التصويت");return}
        $$("#voteCandidates button").forEach(b=>b.disabled=true);
        $("#voteStatus").textContent=res.weight===3?"تم تسجيل صوتك — صوت العمدة محسوب 3 أصوات":"تم تسجيل صوتك — بانتظار بقية اللاعبين";
      });
    };
  });
}

socket.on("vote:started",data=>{
  currentVote=data;
  show("#votePanel");
  $("#voteResult").classList.add("hidden");
  $("#voteFinalBtn").classList.add("hidden");
  $("#voteTitle").textContent=data.round===1?"الجولة الأولى":"التصويت النهائي";
  $("#voteStatus").textContent=data.round===1
    ?"اختر اللاعب الذي تشك فيه. بعد انتهاء التصويت يحصل صاحب أعلى الأصوات على فرصة للتبرير."
    :"اختر من يجب أن يخرج، أو اختر لا أحد.";
  $("#voteCounter").textContent=`0 / ${data.totalVoters||0}`;
  renderOnlineVoteCandidates(data);
  $("#votePanel").scrollIntoView({behavior:"smooth",block:"center"});
});

socket.on("vote:progress",data=>{
  $("#voteCounter").textContent=`${data.votesCast||0} / ${data.totalVoters||0}`;
});

socket.on("vote:result",data=>{
  show("#votePanel");
  $("#voteCandidates").innerHTML="";
  $("#voteStatus").textContent=data.message||"انتهى التصويت";
  const result=$("#voteResult");
  const rows=(data.tallies||[]).map(x=>`<div><span>${esc(x.name)}</span><b>${x.votes} صوت</b></div>`).join("");
  result.innerHTML=`<h4>نتيجة التصويت</h4>${rows}${data.eliminated?`<p class="voteEliminated">خرج: <b>${esc(data.eliminated.name)}</b></p>`:""}`;
  result.classList.remove("hidden");
  if(data.round===1&&room?.host===socket.id){
    $("#voteFinalBtn").classList.remove("hidden");
  }else{
    $("#voteFinalBtn").classList.add("hidden");
  }
});

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
$("#voteBtn").onclick=()=>socket.emit("vote:start",{round:1},r=>{if(!r?.ok)alert(r?.error||"تعذر بدء التصويت")});
$("#voteFinalBtn").onclick=()=>socket.emit("vote:start",{round:2},r=>{if(!r?.ok)alert(r?.error||"تعذر بدء التصويت النهائي")});
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
  mafia_boss:{name:"شيخ المافيا",emoji:"⭐",team:"المافيا",desc:"يقرر الضحية النهائية للقتل كل ليلة، بحرية كاملة بين اللاعبين الأحياء."},
  mafia_silencer:{name:"مافيا التسكيت",emoji:"🤐",team:"المافيا",desc:"يقرر من سيسكت غدًا فلا يستطيع الكلام في النقاش."},
  mafia_normal:{name:"مافيا عادي",emoji:"🔪",team:"المافيا",desc:"عضو من المافيا يعرف زملاءه ويشارك بالرأي دون قرار نهائي."},
  boy:{name:"الولد",emoji:"👦",team:"الصالحون",desc:"إذا خرج من اللعبة بأي شكل، يختار لاعبًا حيًا آخر ليخرج معه."},
  mayor:{name:"العمدة",emoji:"🗳️",team:"الصالحون",desc:"الوحيد المسموح له بكشف دوره للآخرين، وصوته في التصويت يساوي 3 أصوات."},
  citizen:{name:"مواطن عادي",emoji:"👥",team:"الصالحون",desc:"لا يملك قدرة خاصة، لكن رأيه وتصويته في النهار مهمان جدًا."},
  doctor:{name:"الدكتور",emoji:"🩺",team:"الصالحون",desc:"يحمي لاعبًا واحدًا كل ليلة من محاولة القتل، ويمكنه حماية نفس الشخص أكثر من مرة."},
  old_man:{name:"الشايب",emoji:"👁️",team:"الصالحون",desc:"يحقق مع لاعب حي واحد كل ليلة ليعرف إن كان من المافيا أم لا."},
  sniper:{name:"القناص",emoji:"🎯",team:"الصالحون",desc:"يملك رصاصة واحدة طوال اللعبة. إن أصاب مافيا يبقى حيًا، وإن أصاب صالحًا يموت معه."}
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
  const mafiaRoles=["mafia_boss","mafia_silencer","mafia_normal"];
  const specialGoodRoles=["doctor","old_man","mayor","boy","sniper"];
  let roles;

  if(names.length>=9){
    roles=[
      ...mafiaRoles,
      ...specialGoodRoles,
      "citizen",
      ...Array(names.length-9).fill("citizen")
    ];
  }else{
    const slotsForSpecials=Math.max(0,names.length-4);
    roles=[
      ...mafiaRoles,
      "citizen",
      ...specialGoodRoles.slice(0,slotsForSpecials)
    ];
  }

  const shuffled=offlineShuffle(roles);
  return names.map((name,i)=>({name,role:shuffled[i]||"citizen",alive:true}));
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
  const stage=offlineState.stage||"reveal";
  const reveal=stage==="reveal";
  const board=stage==="board";
  const vote=stage==="vote";
  $("#offlineReveal").classList.toggle("hidden",!reveal);
  $("#offlineBoard").classList.toggle("hidden",!board);
  $("#offlineVote").classList.toggle("hidden",!vote);
  $("#offlineTitle").textContent=reveal?"كشف الأدوار":vote?"جولة التصويت":"إدارة الجولة";
  if(reveal)renderOfflineReveal();
  else if(vote)renderOfflineVote();
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

function offlineAliveIndexes(){
  return offlineState.players.map((p,i)=>p.alive?i:null).filter(i=>i!==null);
}

function startOfflineVoteRound(round=1){
  const alive=offlineAliveIndexes();
  if(alive.length<2){alert("لا يوجد عدد كافٍ للتصويت");return}

  let candidates=alive;
  if(round===2){
    candidates=(offlineState.voteFinalists||[]).filter(i=>offlineState.players[i]?.alive);
    if(!candidates.length){alert("لا يوجد مرشحون للتصويت النهائي");return}
  }

  offlineState.stage="vote";
  offlineState.vote={
    round,
    voterIds:alive,
    voterPos:0,
    candidates,
    votes:[],
    complete:false,
    choicesVisible:false,
    tallies:[],
    message:"",
    eliminated:null
  };
  offlineSave();
  renderOfflineVote();
}

function renderOfflineVote(){
  const v=offlineState.vote;
  if(!v)return;
  $("#offlineVoteRoundLabel").textContent=v.round===1?"التصويت الأول":"التصويت النهائي";
  $("#offlineVoteChoices").classList.add("hidden");
  $("#offlineVoteResult").classList.add("hidden");
  $("#offlineVoteReady").classList.remove("hidden");
  $("#offlineVoteNext").classList.add("hidden");

  if(v.complete){
    renderOfflineVoteResult();
    return;
  }

  const voterIndex=v.voterIds[v.voterPos];
  const voter=offlineState.players[voterIndex];
  $("#offlineVoterName").textContent=voter.name;
  $("#offlineVoteHelp").textContent="مرّر الهاتف إلى هذا اللاعب فقط ثم اضغط جاهز";
  $("#offlineVoteProgressText").textContent=`${v.voterPos+1} / ${v.voterIds.length}`;
  $("#offlineVoteProgressBar").style.width=`${((v.voterPos+1)/v.voterIds.length)*100}%`;
  $("#offlineVoteReady").textContent="أنا جاهز للتصويت";
}

function showOfflineVoteChoices(){
  const v=offlineState.vote;
  if(!v||v.complete)return;
  const voterIndex=v.voterIds[v.voterPos];
  const voter=offlineState.players[voterIndex];
  const choices=v.candidates.filter(i=>i!==voterIndex);

  $("#offlineVoteHelp").textContent=v.round===1?"اختر اللاعب الذي تصوّت ضده":"اختر من يجب أن يخرج، أو اختر لا أحد";
  $("#offlineVoteReady").classList.add("hidden");
  const box=$("#offlineVoteChoices");
  box.innerHTML=choices.map(i=>`<button class="offlineVoteChoice" data-offline-target="${i}"><span class="avatar">${esc(offlineState.players[i].name[0]?.toUpperCase()||"?")}</span><b>${esc(offlineState.players[i].name)}</b></button>`).join("");
  if(v.round===2){
    box.innerHTML+=`<button class="offlineVoteChoice noOneChoice" data-offline-target="__NONE__"><span>✋</span><b>لا أحد</b></button>`;
  }
  box.classList.remove("hidden");

  $("#offlineVoteChoices [data-offline-target]").forEach(btn=>{
    btn.onclick=()=>{
      const target=btn.dataset.offlineTarget==="__NONE__"?"__NONE__":Number(btn.dataset.offlineTarget);
      const weight=voter.role==="mayor"?3:1;
      v.votes.push({voterIndex,target,weight});
      v.voterPos++;
      v.choicesVisible=false;

      if(v.voterPos>=v.voterIds.length){
        finishOfflineVote();
      }else{
        offlineSave();
        renderOfflineVote();
      }
    };
  });
}

function finishOfflineVote(){
  const v=offlineState.vote;
  const tally=new Map();
  v.votes.forEach(x=>tally.set(x.target,(tally.get(x.target)||0)+x.weight));
  const tallies=[...tally.entries()]
    .map(([target,votes])=>({
      target,
      name:target==="__NONE__"?"لا أحد":offlineState.players[target]?.name||"لاعب",
      votes
    }))
    .sort((a,b)=>b.votes-a.votes);
  const max=tallies[0]?.votes||0;
  const leaders=tallies.filter(x=>x.votes===max);

  v.tallies=tallies;
  v.complete=true;

  if(v.round===1){
    offlineState.voteFinalists=leaders.filter(x=>x.target!=="__NONE__").map(x=>Number(x.target));
    v.message=offlineState.voteFinalists.length>1
      ?"تعادل أعلى الأصوات. أعطوا المرشحين فرصة للتبرير ثم ابدأوا التصويت النهائي."
      :`${offlineState.players[offlineState.voteFinalists[0]]?.name||"اللاعب"} حصل على أعلى الأصوات. أعطوه فرصة للتبرير ثم ابدأوا التصويت النهائي.`;
  }else{
    const unique=leaders.length===1?leaders[0]:null;
    if(unique&&unique.target!=="__NONE__"){
      const idx=Number(unique.target);
      if(offlineState.players[idx]?.alive){
        offlineState.players[idx].alive=false;
        v.eliminated=idx;
        v.message=`${offlineState.players[idx].name} خرج من اللعبة بعد التصويت النهائي.`;
      }
    }
    if(v.eliminated===null){
      v.message="لم يخرج أحد بسبب التعادل أو اختيار لا أحد.";
    }
    offlineState.voteFinalists=[];
  }

  offlineSave();
  renderOfflineVoteResult();
}

function renderOfflineVoteResult(){
  const v=offlineState.vote;
  $("#offlineVoterName").textContent="نتيجة التصويت";
  $("#offlineVoteHelp").textContent=v.message||"انتهى التصويت";
  $("#offlineVoteReady").classList.add("hidden");
  $("#offlineVoteChoices").classList.add("hidden");
  $("#offlineVoteProgressText").textContent=`${v.voterIds.length} / ${v.voterIds.length}`;
  $("#offlineVoteProgressBar").style.width="100%";

  const box=$("#offlineVoteResult");
  box.innerHTML=(v.tallies||[]).map(x=>`<div><span>${esc(x.name)}</span><b>${x.votes} صوت</b></div>`).join("");
  box.classList.remove("hidden");

  $("#offlineVoteNext").textContent=v.round===1?"بدء التصويت النهائي":"العودة إلى لوحة الجولة";
  $("#offlineVoteNext").classList.remove("hidden");
}

$("#offlineStartVote").onclick=()=>startOfflineVoteRound(1);
$("#offlineVoteReady").onclick=showOfflineVoteChoices;
$("#offlineVoteNext").onclick=()=>{
  const v=offlineState.vote;
  if(!v?.complete)return;
  if(v.round===1){
    startOfflineVoteRound(2);
  }else{
    offlineState.stage="board";
    offlineState.vote=null;
    offlineSave();
    renderOffline();
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