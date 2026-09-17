const SESSION_KEY = "chess-pvp-role";
const APP_ID = "kldscp-chess";

function makeRoom() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 6; i += 1) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

function roomUrl(room) {
  const url = new URL(location.href);
  url.searchParams.set("room", room);
  url.searchParams.delete("v");
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

function bindAction(action, onData) {
  if (Array.isArray(action)) {
    const [send, receive] = action;
    receive(onData);
    return send;
  }
  action.onMessage = (data) => onData(data);
  return (data) => action.send(data);
}

async function loadJoinRoom() {
  try {
    const mod = await import("https://esm.run/trystero");
    if (mod.joinRoom) return mod.joinRoom;
  } catch {
    /* try next */
  }
  const mod = await import("https://esm.sh/trystero");
  return mod.joinRoom;
}

export function startPvp(handlers) {
  const params = new URLSearchParams(location.search);
  const urlRoom = params.get("room");
  const session = loadSession();

  let roomId = urlRoom;
  let role = "guest";
  if (!roomId) {
    roomId = makeRoom();
    role = "host";
    setRoomInUrl(roomId);
    saveSession(role, roomId);
  } else if (session && session.room === roomId && session.role === "host") {
    role = "host";
  } else {
    role = "guest";
    setRoomInUrl(roomId);
    saveSession(role, roomId);
  }

  const net = {
    room: roomId,
    role,
    url: roomUrl(roomId),
    ready: false,
    opponent: null,
    send(payload) {
      net._send?.(payload);
    },
  };

  handlers.onStatus("Пока друг не зашёл — можно играть с компьютером");

  (async () => {
    let joinRoom;
    try {
      joinRoom = await loadJoinRoom();
    } catch {
      handlers.onStatus("Не удалось подключить сеть. Обновите страницу.");
      return;
    }

    const room = joinRoom(
      {
        appId: APP_ID,
        rtcConfig: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun.cloudflare.com:3478" },
            { urls: "stun:stun.relay.metered.ca:80" },
            {
              urls: [
                "turn:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:443",
                "turn:openrelay.metered.ca:443?transport=tcp",
              ],
              username: "openrelayproject",
              credential: "openrelayproject",
            },
          ],
        },
      },
      `chess-${roomId}`,
    );

    net._send = bindAction(room.makeAction("move"), (data) => {
      if (data?.type === "move") handlers.onMove(data);
      else if (data?.type === "reset") handlers.onReset();
      else if (data?.type === "sync") handlers.onSync?.(data);
    });

    let leaveTimer = 0;
    const markReady = (peerId) => {
      window.clearTimeout(leaveTimer);
      net.opponent = peerId;
      if (!net.ready) {
        net.ready = true;
        handlers.onReady(role === "host" ? "w" : "b");
      }
      if (role === "host") {
        const snap = handlers.getSnapshot?.();
        if (snap) net.send({ type: "sync", ...snap });
      }
    };

    const listen = (event, fn) => {
      const current = room[event];
      if (typeof current === "function") {
        try {
          current.call(room, fn);
          return;
        } catch {
          /* new API uses assignment */
        }
      }
      room[event] = fn;
    };

    listen("onPeerJoin", (peerId) => markReady(peerId));
    listen("onPeerLeave", (peerId) => {
      if (peerId !== net.opponent) return;
      leaveTimer = window.setTimeout(() => {
        if (net.opponent !== peerId) return;
        net.ready = false;
        net.opponent = null;
        handlers.onPeerLeft();
      }, 2500);
    });
  })();

  return net;
}
