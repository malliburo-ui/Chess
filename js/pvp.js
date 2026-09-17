const SESSION_KEY = "chess-pvp-role";
const PEER_PREFIX = "kldscpchess-";

function makeRoom() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 6; i += 1) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

function peerId(room) {
  return PEER_PREFIX + room;
}

function roomUrl(room) {
  const url = new URL(location.href);
  url.searchParams.set("room", room);
  return url.href;
}

function setRoomInUrl(room) {
  history.replaceState({}, "", roomUrl(room));
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(role, room) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role, room }));
}

export function startPvp(handlers) {
  const params = new URLSearchParams(location.search);
  const urlRoom = params.get("room");
  const session = loadSession();

  let room = urlRoom;
  let role = "guest";
  if (!room) {
    room = makeRoom();
    role = "host";
    setRoomInUrl(room);
    saveSession(role, room);
  } else if (session && session.room === room && session.role === "host") {
    role = "host";
  } else {
    role = "guest";
    setRoomInUrl(room);
    saveSession(role, room);
  }

  const net = {
    room,
    role,
    url: roomUrl(room),
    ready: false,
    conn: null,
    peer: null,
    send(payload) {
      if (net.conn && net.conn.open) net.conn.send(payload);
    },
  };

  const Peer = window.Peer;
  if (!Peer) {
    handlers.onStatus("Не удалось загрузить сеть. Обновите страницу.");
    return net;
  }

  const bind = (conn) => {
    net.conn = conn;
    conn.on("data", (data) => {
      if (!data || typeof data !== "object") return;
      if (data.type === "hello") handlers.onHello(data);
      if (data.type === "move") handlers.onMove(data);
      if (data.type === "reset") handlers.onReset();
    });
    conn.on("close", () => {
      net.ready = false;
      handlers.onPeerLeft();
    });
    conn.on("error", () => {
      net.ready = false;
      handlers.onPeerLeft();
    });
  };

  const markReady = () => {
    if (net.ready) return;
    net.ready = true;
    handlers.onReady(net.role === "host" ? "w" : "b");
  };

  if (role === "host") {
    net.peer = new Peer(peerId(room));
    net.peer.on("open", () => handlers.onStatus("Скопируйте ссылку и отправьте другу"));
    net.peer.on("connection", (conn) => {
      if (net.conn && net.conn.open) {
        conn.close();
        return;
      }
      bind(conn);
      conn.on("open", () => {
        markReady();
        conn.send({ type: "hello" });
      });
    });
    net.peer.on("error", (error) => {
      handlers.onStatus(error?.type === "unavailable-id" ? "Комната занята, обновите страницу" : "Ошибка связи, обновите страницу");
    });
    return net;
  }

  net.peer = new Peer();
  const connect = () => {
    if (net.ready) return;
    const conn = net.peer.connect(peerId(room), { reliable: true });
    bind(conn);
    conn.on("open", markReady);
  };
  net.peer.on("open", () => {
    connect();
    const timer = window.setInterval(() => {
      if (net.ready) {
        window.clearInterval(timer);
        return;
      }
      connect();
    }, 1500);
  });
  net.peer.on("error", (error) => {
    if (error?.type === "peer-unavailable") {
      window.setTimeout(connect, 1200);
      return;
    }
    handlers.onStatus("Не удалось подключиться. Проверьте ссылку.");
  });
  handlers.onStatus("Подключение к другу…");
  return net;
}
