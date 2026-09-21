const express=require("express");
const http=require("http");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const Database=require("better-sqlite3");
const {Server}=require("socket.io");
const path=require("path");

const app=express(), server=http.createServer(app), io=new Server(server);
const db=new Database(path.join(__dirname,"data","mafia.db"));
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 wins INTEGER DEFAULT 0,
 games INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
const sessionMiddleware=session({
 secret:process.env.SESSION_SECRET||"change-this-secret-in-production",
 resave:false, saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:"lax",secure:false,maxAge:1000*60*60*24*7}
});
app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname,"public")));

const cleanName=s=>String(s||"").trim().replace(/[^\p{L}\p{N}_-]/gu,"").slice(0,24);
app.post("/api/register",async(req,res)=>{
 const username=cleanName(req.body.username), password=String(req.body.password||"");
 if(username.length<3||password.length<6) return res.status(400).json({error:"الاسم 3 أحرف على الأقل وكلمة المرور 6 أحرف على الأقل"});
 try{
  const hash=await bcrypt.hash(password,12);
  const info=db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run(username,hash);
  req.session.user={id:info.lastInsertRowid,username};
  res.json({ok:true,user:req.session.user});
 }catch(e){res.status(409).json({error:"اسم المستخدم مستخدم بالفعل"});}
});
app.post("/api/login",async(req,res)=>{
 const username=cleanName(req.body.username), password=String(req.body.password||"");
 const u=db.prepare("SELECT * FROM users WHERE username=?").get(username);
 if(!u||!(await bcrypt.compare(password,u.password_hash))) return res.status(401).json({error:"بيانات الدخول غير صحيحة"});
 req.session.user={id:u.id,username:u.username}; res.json({ok:true,user:req.session.user});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>res.json({user:req.session.user||null}));

const rooms=new Map();
function publicRoom(r){return {code:r.code,host:r.host,started:r.started,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,alive:p.alive}))};}
function emitRoom(code){const r=rooms.get(code); if(r) io.to(code).emit("room:update",publicRoom(r));}
io.use((socket,next)=>sessionMiddleware(socket.request,{},next));
io.use((socket,next)=>socket.request.session?.user?next():next(new Error("سجل الدخول أولاً")));
io.on("connection",socket=>{
 const user=socket.request.session.user;
 socket.on("room:create",(_,ack)=>{
  let code; do{code=Math.random().toString(36).slice(2,7).toUpperCase()}while(rooms.has(code));
  const r={code,host:socket.id,started:false,players:new Map()};
  r.players.set(socket.id,{id:socket.id,name:user.username,alive:true,role:null}); rooms.set(code,r);
  socket.join(code); socket.data.room=code; ack?.({ok:true,code}); emitRoom(code);
 });
 socket.on("room:join",(raw,ack)=>{
  const code=String(raw||"").trim().toUpperCase(),r=rooms.get(code);
  if(!r) return ack?.({ok:false,error:"الغرفة غير موجودة"});
  if(r.started) return ack?.({ok:false,error:"بدأت الجولة بالفعل"});
  if(r.players.size>=10) return ack?.({ok:false,error:"الغرفة ممتلئة"});
  r.players.set(socket.id,{id:socket.id,name:user.username,alive:true,role:null});
  socket.join(code); socket.data.room=code; ack?.({ok:true,code}); emitRoom(code);
 });
 socket.on("game:start",(_,ack)=>{
  const code=socket.data.room,r=rooms.get(code);
  if(!r||r.host!==socket.id) return ack?.({ok:false,error:"المضيف فقط يمكنه البدء"});
  if(r.players.size<3) return ack?.({ok:false,error:"يلزم 3 لاعبين على الأقل"});
  const ps=[...r.players.values()].sort(()=>Math.random()-.5);
  ps.forEach((p,i)=>p.role=i===0?"mafia":i===1?"doctor":"citizen"); r.started=true;
  ps.forEach(p=>io.to(p.id).emit("role",p.role)); emitRoom(code); ack?.({ok:true});
 });
 socket.on("chat",msg=>{
  const code=socket.data.room;if(!code)return;
  io.to(code).emit("chat",{name:user.username,text:String(msg||"").slice(0,300),at:Date.now()});
 });
 // WebRTC signaling: offers/answers/ICE are forwarded only inside the same game room.
 socket.on("voice:signal",({to,data})=>{
  const code=socket.data.room,r=rooms.get(code);
  if(r&&r.players.has(to)) io.to(to).emit("voice:signal",{from:socket.id,data});
 });
 socket.on("disconnect",()=>{
  const code=socket.data.room,r=rooms.get(code); if(!r)return;
  r.players.delete(socket.id);
  if(!r.players.size) rooms.delete(code);
  else {if(r.host===socket.id) r.host=[...r.players.keys()][0]; emitRoom(code);}
 });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Mafia web: http://localhost:${PORT}`));
