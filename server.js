const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const STALE_TIMEOUT = 5 * 60 * 1000;
const rooms = new Map();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.main && room.main.readyState <= 1) room.main.close();
  if (room.clone && room.clone.readyState <= 1) room.clone.close();
  rooms.delete(code);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", ws => {
  let roomCode = null;
  let role = null;

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "create") {
      const code = generateCode();
      rooms.set(code, { main: ws, clone: null, level: 0, lastActivity: Date.now() });
      roomCode = code;
      role = "main";
      send(ws, { type: "created", code });
      send(ws, { type: "joined", role: "main" });
    } else if (msg.type === "join") {
      const code = (msg.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: "error", message: "Room not found" });
      if (room.clone) return send(ws, { type: "error", message: "Room full" });
      room.clone = ws;
      room.lastActivity = Date.now();
      roomCode = code;
      role = "clone";
      send(ws, { type: "joined", role: "clone" });
      send(room.main, { type: "start" });
      send(ws, { type: "start" });
    } else if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.lastActivity = Date.now();
      const partner = role === "main" ? room.clone : room.main;
      if (partner) send(partner, msg);
      if (msg.type === "level") room.level = msg.index;
    }
  });

  ws.on("close", () => {
    if (!roomCode || !rooms.has(roomCode)) return;
    const room = rooms.get(roomCode);
    const partner = role === "main" ? room.clone : room.main;
    if (partner) send(partner, { type: "partner_disconnected" });
    rooms.delete(roomCode);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > STALE_TIMEOUT) cleanupRoom(code);
  }
}, 60000);

console.log("ECHO multiplayer server listening on port " + PORT);
