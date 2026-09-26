const express = require("express");
const http = require("http");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MIN_PLAYERS = 6;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "mafia.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 wins INTEGER DEFAULT 0,
 games INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn("users", "is_admin", "INTEGER DEFAULT 0");
ensureColumn("users", "is_banned", "INTEGER DEFAULT 0");
ensureColumn("users", "last_login_at", "TEXT");
ensureColumn("users", "last_ip", "TEXT");
ensureColumn("users", "theme", "TEXT DEFAULT 'dark'");
ensureColumn("users", "reduce_motion", "INTEGER DEFAULT 0");
ensureColumn("users", "sounds_enabled", "INTEGER DEFAULT 1");

db.exec(`
CREATE TABLE IF NOT EXISTS site_settings(
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS admin_audit(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 admin_user_id INTEGER,
 action TEXT NOT NULL,
 target_user_id INTEGER,
 details TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO site_settings(key,value) VALUES('announcement','');
INSERT OR IGNORE INTO site_settings(key,value) VALUES('maintenance_mode','0');
INSERT OR IGNORE INTO site_settings(key,value) VALUES('maintenance_message','نعمل حاليًا على تحديث الموقع وسنعود قريبًا');
INSERT OR IGNORE INTO site_settings(key,value) VALUES('registration_open','1');
`);

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "change-this-secret-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
});

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=()");
  next();
});
app.use(express.json({ limit: "200kb" }));
app.use(sessionMiddleware);

const cleanName = s => String(s || "").trim().replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 24);
const requestIp = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim().slice(0, 80);
const userPublic = u => u ? ({
  id: u.id,
  username: u.username,
  wins: u.wins || 0,
  games: u.games || 0,
  isAdmin: !!u.is_admin,
  theme: u.theme || "dark",
  reduceMotion: !!u.reduce_motion,
  soundsEnabled: u.sounds_enabled !== 0
}) : null;
const getUserById = id => db.prepare("SELECT * FROM users WHERE id=?").get(id);
const getSetting = key => db.prepare("SELECT value FROM site_settings WHERE key=?").get(key)?.value || "";
const setSetting = (key, value) => db.prepare("INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
const incrementGames = db.transaction(ids => {
  const stmt = db.prepare("UPDATE users SET games=games+1 WHERE id=?");
  ids.forEach(id => stmt.run(id));
});

function audit(adminId, action, targetUserId = null, details = "") {
  db.prepare("INSERT INTO admin_audit(admin_user_id,action,target_user_id,details) VALUES(?,?,?,?)")
    .run(adminId, action, targetUserId, String(details || "").slice(0, 500));
}

function requireUser(req, res, next) {
  const id = req.session?.user?.id;
  if (!id) return res.status(401).json({ error: "سجل الدخول أولاً" });
  const u = getUserById(id);
  if (!u || u.is_banned) {
    return req.session.destroy(() => res.status(403).json({ error: "الحساب غير متاح" }));
  }
  req.currentUser = u;
  next();
}

function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (!req.currentUser.is_admin) return res.status(403).json({ error: "ليس لديك صلاحية الإدارة" });
    next();
  });
}

app.use((req, res, next) => {
  if (getSetting("maintenance_mode") !== "1") return next();
  const id = req.session?.user?.id;
  const u = id && getUserById(id);
  if (u?.is_admin) return next();

  const allowed =
    req.path === "/admin" ||
    req.path === "/maintenance" ||
    req.path === "/api/login" ||
    req.path === "/api/logout" ||
    req.path === "/api/me" ||
    req.path === "/api/site" ||
    req.path === "/style.css" ||
    req.path.startsWith("/assets/");

  if (allowed) return next();

  if (req.method === "GET" && req.accepts("html")) {
    return res.status(503).sendFile(path.join(__dirname, "maintenance.html"));
  }
  return res.status(503).json({
    error: "الموقع تحت الصيانة",
    maintenance: true,
    message: getSetting("maintenance_message")
  });
});

app.post("/api/register", async (req, res) => {
  if (getSetting("registration_open") === "0") {
    return res.status(403).json({ error: "إنشاء الحسابات متوقف مؤقتًا من الإدارة" });
  }
  const username = cleanName(req.body.username);
  const password = String(req.body.password || "");
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: "الاسم 3 أحرف على الأقل وكلمة المرور 6 أحرف على الأقل" });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users(username,password_hash,last_ip) VALUES(?,?,?)").run(username, hash, requestIp(req));
    const u = getUserById(info.lastInsertRowid);
    req.session.user = { id: u.id, username: u.username };
    res.json({ ok: true, user: userPublic(u) });
  } catch (e) {
    res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" });
  }
});

app.post("/api/login", async (req, res) => {
  const username = cleanName(req.body.username);
  const password = String(req.body.password || "");
  const u = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  if (u.is_banned) return res.status(403).json({ error: "هذا الحساب محظور من الإدارة" });
  db.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP,last_ip=? WHERE id=?").run(requestIp(req), u.id);
  const fresh = getUserById(u.id);
  req.session.user = { id: fresh.id, username: fresh.username };
  res.json({ ok: true, user: userPublic(fresh) });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => {
  const id = req.session?.user?.id;
  if (!id) return res.json({ user: null });
  const u = getUserById(id);
  if (!u || u.is_banned) return req.session.destroy(() => res.json({ user: null }));
  res.json({ user: userPublic(u) });
});
app.get("/api/site", (req, res) => res.json({
  announcement: getSetting("announcement"),
  minPlayers: MIN_PLAYERS,
  maxPlayers: null,
  maintenance: getSetting("maintenance_mode") === "1",
  maintenanceMessage: getSetting("maintenance_message"),
  registrationOpen: getSetting("registration_open") !== "0"
}));

app.get("/settings", requireUser, (req, res) => res.sendFile(path.join(__dirname, "settings.html")));
app.get("/maintenance", (req, res) => res.status(503).sendFile(path.join(__dirname, "maintenance.html")));

app.get("/api/settings", requireUser, (req, res) => {
  res.json({ user: userPublic(req.currentUser) });
});

app.post("/api/settings/profile", requireUser, (req, res) => {
  const username = cleanName(req.body.username);
  if (username.length < 3) return res.status(400).json({ error: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل" });
  try {
    db.prepare("UPDATE users SET username=? WHERE id=?").run(username, req.currentUser.id);
  } catch {
    return res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" });
  }
  req.session.user.username = username;

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId === req.currentUser.id) socket.data.username = username;
  }
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (player.userId === req.currentUser.id) player.name = username;
    }
    emitRoom(room.code);
  }
  res.json({ ok: true, user: userPublic(getUserById(req.currentUser.id)) });
});

app.post("/api/settings/password", requireUser, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  if (newPassword.length < 6) return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
  if (!(await bcrypt.compare(currentPassword, req.currentUser.password_hash))) {
    return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash, req.currentUser.id);
  res.json({ ok: true });
});

app.post("/api/settings/preferences", requireUser, (req, res) => {
  const allowedThemes = new Set(["dark", "midnight", "red"]);
  const theme = allowedThemes.has(String(req.body.theme)) ? String(req.body.theme) : "dark";
  const reduceMotion = req.body.reduceMotion ? 1 : 0;
  const soundsEnabled = req.body.soundsEnabled === false ? 0 : 1;
  db.prepare("UPDATE users SET theme=?,reduce_motion=?,sounds_enabled=? WHERE id=?")
    .run(theme, reduceMotion, soundsEnabled, req.currentUser.id);
  res.json({ ok: true, user: userPublic(getUserById(req.currentUser.id)) });
});

const rooms = new Map();
function publicRoom(r) {
  return {
    code: r.code,
    host: r.host,
    started: r.started,
    minPlayers: MIN_PLAYERS,
    maxPlayers: null,
    players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, alive: p.alive }))
  };
}
function adminRoom(r) {
  return {
    ...publicRoom(r),
    createdAt: r.createdAt,
    players: [...r.players.values()].map(p => ({ id: p.id, userId: p.userId, name: p.name, alive: p.alive }))
  };
}
function emitRoom(code) {
  const r = rooms.get(code);
  if (r) io.to(code).emit("room:update", publicRoom(r));
}
function removeSocketFromRoom(socket) {
  const code = socket.data.room;
  const r = code && rooms.get(code);
  if (!r) { socket.data.room = null; return; }
  r.players.delete(socket.id);
  socket.leave(code);
  socket.data.room = null;
  if (!r.players.size) rooms.delete(code);
  else {
    if (r.host === socket.id) r.host = [...r.players.keys()][0];
    emitRoom(code);
  }
}
function disconnectUserSockets(userId, message = "تم تسجيل خروجك من الإدارة") {
  for (const s of io.sockets.sockets.values()) {
    if (s.data.userId === Number(userId)) {
      s.emit("account:disabled", message);
      removeSocketFromRoom(s);
      s.disconnect(true);
    }
  }
}

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));

app.get("/api/admin/overview", requireAdmin, (req, res) => {
  const totals = db.prepare(`SELECT COUNT(*) totalUsers,
    SUM(CASE WHEN is_banned=1 THEN 1 ELSE 0 END) bannedUsers,
    SUM(CASE WHEN is_admin=1 THEN 1 ELSE 0 END) admins,
    COALESCE(SUM(games),0) totalGames,
    COALESCE(SUM(wins),0) totalWins FROM users`).get();
  const activePlayers = [...rooms.values()].reduce((n, r) => n + r.players.size, 0);
  res.json({
    ...totals,
    activeRooms: rooms.size,
    activePlayers,
    connectedSockets: io.engine.clientsCount,
    announcement: getSetting("announcement"),
    maintenanceMode: getSetting("maintenance_mode") === "1",
    maintenanceMessage: getSetting("maintenance_message"),
    registrationOpen: getSetting("registration_open") !== "0",
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version,
    minPlayers: MIN_PLAYERS,
    maxPlayers: null
  });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 40);
  const users = q
    ? db.prepare("SELECT id,username,wins,games,is_admin,is_banned,created_at,last_login_at,last_ip FROM users WHERE username LIKE ? ORDER BY id DESC LIMIT 200").all(`%${q}%`)
    : db.prepare("SELECT id,username,wins,games,is_admin,is_banned,created_at,last_login_at,last_ip FROM users ORDER BY id DESC LIMIT 200").all();
  res.json({ users });
});

app.post("/api/admin/users/:id/action", requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const action = String(req.body.action || "");
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: "الحساب غير موجود" });
  if (targetId === req.currentUser.id && ["ban", "revoke_admin", "delete"].includes(action)) {
    return res.status(400).json({ error: "لا يمكنك تنفيذ هذا الإجراء على حسابك الإداري الحالي" });
  }

  const actions = {
    ban: () => { db.prepare("UPDATE users SET is_banned=1 WHERE id=?").run(targetId); disconnectUserSockets(targetId, "تم حظر حسابك من الإدارة"); },
    unban: () => db.prepare("UPDATE users SET is_banned=0 WHERE id=?").run(targetId),
    grant_admin: () => db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(targetId),
    revoke_admin: () => db.prepare("UPDATE users SET is_admin=0 WHERE id=?").run(targetId),
    reset_stats: () => db.prepare("UPDATE users SET wins=0,games=0 WHERE id=?").run(targetId)
  };
  if (!actions[action]) return res.status(400).json({ error: "إجراء غير معروف" });
  actions[action]();
  audit(req.currentUser.id, action, targetId, `user:${target.username}`);
  res.json({ ok: true, user: userPublic(getUserById(targetId)) });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.currentUser.id) return res.status(400).json({ error: "لا يمكنك حذف حسابك الإداري الحالي" });
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: "الحساب غير موجود" });
  disconnectUserSockets(targetId, "تم حذف حسابك من الإدارة");
  db.prepare("DELETE FROM users WHERE id=?").run(targetId);
  audit(req.currentUser.id, "delete_user", targetId, `user:${target.username}`);
  res.json({ ok: true });
});

app.get("/api/admin/rooms", requireAdmin, (req, res) => res.json({ rooms: [...rooms.values()].map(adminRoom) }));

app.post("/api/admin/rooms/:code/close", requireAdmin, async (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const r = rooms.get(code);
  if (!r) return res.status(404).json({ error: "الغرفة غير موجودة" });
  io.to(code).emit("room:closed", "تم إغلاق الغرفة من الإدارة");
  const sockets = await io.in(code).fetchSockets();
  sockets.forEach(s => { s.leave(code); s.data.room = null; });
  rooms.delete(code);
  audit(req.currentUser.id, "close_room", null, `room:${code}`);
  res.json({ ok: true });
});

app.post("/api/admin/rooms/:code/kick", requireAdmin, (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const socketId = String(req.body.socketId || "");
  const r = rooms.get(code);
  const s = io.sockets.sockets.get(socketId);
  if (!r || !s || !r.players.has(socketId)) return res.status(404).json({ error: "اللاعب غير موجود في الغرفة" });
  const player = r.players.get(socketId);
  s.emit("room:kicked", "تم إخراجك من الغرفة بواسطة الإدارة");
  removeSocketFromRoom(s);
  audit(req.currentUser.id, "kick_player", player.userId, `room:${code}; player:${player.name}`);
  res.json({ ok: true });
});

app.post("/api/admin/announcement", requireAdmin, (req, res) => {
  const message = String(req.body.message || "").trim().slice(0, 240);
  setSetting("announcement", message);
  io.emit("site:announcement", message);
  audit(req.currentUser.id, "announcement", null, message || "cleared");
  res.json({ ok: true, announcement: message });
});

app.get("/api/admin/audit", requireAdmin, (req, res) => {
  const logs = db.prepare(`SELECT a.id,a.action,a.target_user_id,a.details,a.created_at,u.username admin_username
    FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_user_id ORDER BY a.id DESC LIMIT 120`).all();
  res.json({ logs });
});

app.delete("/api/admin/audit", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM admin_audit").run();
  audit(req.currentUser.id, "clear_audit", null, "Admin audit log cleared");
  res.json({ ok: true });
});

app.post("/api/admin/maintenance", requireAdmin, (req, res) => {
  const enabled = !!req.body.enabled;
  const message = String(req.body.message || "نعمل حاليًا على تحديث الموقع وسنعود قريبًا").trim().slice(0, 300);
  setSetting("maintenance_mode", enabled ? "1" : "0");
  setSetting("maintenance_message", message);
  audit(req.currentUser.id, enabled ? "maintenance_on" : "maintenance_off", null, message);
  io.emit("site:maintenance", { enabled, message });

  if (enabled) {
    for (const socket of [...io.sockets.sockets.values()]) {
      const u = socket.data.userId && getUserById(socket.data.userId);
      if (!u?.is_admin) {
        socket.emit("site:maintenance", { enabled: true, message });
        removeSocketFromRoom(socket);
        socket.disconnect(true);
      }
    }
  }
  res.json({ ok: true, enabled, message });
});

app.post("/api/admin/registration", requireAdmin, (req, res) => {
  const open = !!req.body.open;
  setSetting("registration_open", open ? "1" : "0");
  audit(req.currentUser.id, open ? "registration_open" : "registration_closed");
  res.json({ ok: true, open });
});

app.post("/api/admin/rooms/close-all", requireAdmin, async (req, res) => {
  const roomCodes = [...rooms.keys()];
  for (const code of roomCodes) {
    io.to(code).emit("room:closed", "تم إغلاق جميع الغرف من الإدارة");
    const sockets = await io.in(code).fetchSockets();
    sockets.forEach(s => { s.leave(code); s.data.room = null; });
    rooms.delete(code);
  }
  audit(req.currentUser.id, "close_all_rooms", null, `count:${roomCodes.length}`);
  res.json({ ok: true, closed: roomCodes.length });
});

app.get("/api/admin/export/users", requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id,username,wins,games,is_admin,is_banned,created_at,last_login_at FROM users ORDER BY id").all();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="mafia-users-${Date.now()}.json"`);
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), users }, null, 2));
});

app.use(express.static(path.join(__dirname, "public")));

io.use((socket, next) => sessionMiddleware(socket.request, {}, next));
io.use((socket, next) => {
  const id = socket.request.session?.user?.id;
  const u = id && getUserById(id);
  if (!u || u.is_banned) return next(new Error("سجل الدخول أولاً"));
  if (getSetting("maintenance_mode") === "1" && !u.is_admin) {
    return next(new Error("الموقع تحت الصيانة"));
  }
  socket.data.userId = u.id;
  socket.data.username = u.username;
  next();
});

io.on("connection", socket => {
  const userId = socket.data.userId;
  const username = socket.data.username;

  socket.on("room:create", (_, ack) => {
    removeSocketFromRoom(socket);
    let code;
    do { code = Math.random().toString(36).slice(2, 7).toUpperCase(); } while (rooms.has(code));
    const r = { code, host: socket.id, started: false, createdAt: Date.now(), players: new Map() };
    r.players.set(socket.id, { id: socket.id, userId, name: username, alive: true, role: null });
    rooms.set(code, r);
    socket.join(code);
    socket.data.room = code;
    ack?.({ ok: true, code });
    emitRoom(code);
  });

  socket.on("room:join", (raw, ack) => {
    const code = String(raw || "").trim().toUpperCase();
    const r = rooms.get(code);
    if (!r) return ack?.({ ok: false, error: "الغرفة غير موجودة" });
    if (r.started) return ack?.({ ok: false, error: "بدأت الجولة بالفعل" });
    removeSocketFromRoom(socket);
    r.players.set(socket.id, { id: socket.id, userId, name: username, alive: true, role: null });
    socket.join(code);
    socket.data.room = code;
    ack?.({ ok: true, code });
    emitRoom(code);
  });

  socket.on("game:start", (_, ack) => {
    const code = socket.data.room;
    const r = rooms.get(code);
    if (!r || r.host !== socket.id) return ack?.({ ok: false, error: "المضيف فقط يمكنه البدء" });
    if (r.players.size < MIN_PLAYERS) return ack?.({ ok: false, error: `يلزم ${MIN_PLAYERS} لاعبين على الأقل لبدء الجولة` });

    const ps = [...r.players.values()].sort(() => Math.random() - 0.5);
    const mafiaCount = Math.max(1, Math.floor(ps.length / 4));
    ps.forEach((p, i) => {
      p.role = i < mafiaCount ? "mafia" : i === mafiaCount ? "doctor" : "citizen";
      p.alive = true;
    });
    r.started = true;
    ps.forEach(p => io.to(p.id).emit("role", p.role));
    incrementGames(ps.map(p => p.userId));
    emitRoom(code);
    ack?.({ ok: true });
  });

  socket.on("chat", msg => {
    const code = socket.data.room;
    if (!code) return;
    io.to(code).emit("chat", { name: username, text: String(msg || "").slice(0, 300), at: Date.now() });
  });

  socket.on("voice:signal", ({ to, data } = {}) => {
    const code = socket.data.room;
    const r = rooms.get(code);
    if (r && r.players.has(to)) io.to(to).emit("voice:signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => removeSocketFromRoom(socket));
});

async function ensureBootstrapAdmin() {
  const username = cleanName(process.env.ADMIN_USERNAME || "");
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!username || password.length < 8) return;
  const hash = await bcrypt.hash(password, 12);
  const existing = db.prepare("SELECT id FROM users WHERE username=?").get(username);
  if (existing) {
    db.prepare("UPDATE users SET password_hash=?,is_admin=1,is_banned=0 WHERE id=?").run(hash, existing.id);
  } else {
    db.prepare("INSERT INTO users(username,password_hash,is_admin,is_banned) VALUES(?,?,1,0)").run(username, hash);
  }
}

ensureBootstrapAdmin()
  .then(() => server.listen(PORT, () => console.log(`Mafia web: http://localhost:${PORT} | min players: ${MIN_PLAYERS}`)))
  .catch(err => { console.error(err); process.exit(1); });
