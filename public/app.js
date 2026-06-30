const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.("#171d16");
  tg.setBackgroundColor?.("#171d16");
}

const initData = tg?.initData || "";
const headers = () => ({ "X-Telegram-Init-Data": initData });

const els = {
  connectionStatus: document.getElementById("connectionStatus"),
  owlWrap: document.getElementById("owlWrap"),
  timeRemaining: document.getElementById("timeRemaining"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  hintText: document.getElementById("hintText"),
  remoteAudio: document.getElementById("remoteAudio"),
  premiumCard: document.getElementById("premiumCard"),
};

let pc = null;
let dc = null;
let localStream = null;
let currentSessionId = null;
let heartbeatTimer = null;
let countdownTimer = null;
let remainingSeconds = 0;
let isUnlimited = false;
let isConnected = false;

function formatTime(totalSeconds, unlimited = false) {
  if (unlimited || totalSeconds === null || totalSeconds === undefined) return "∞";
  const safe = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function setStatus(text, state = "idle") {
  els.connectionStatus.textContent = text;
  els.connectionStatus.classList.toggle("connected", state === "connected");
  els.connectionStatus.classList.toggle("error", state === "error");
}

function setHint(text) {
  els.hintText.textContent = text;
}

function setButtons(talking) {
  els.startBtn.classList.toggle("hidden", talking);
  els.stopBtn.classList.toggle("hidden", !talking);
}

function setVisualState(state) {
  els.owlWrap.classList.toggle("listening", state === "listening");
  els.owlWrap.classList.toggle("speaking", state === "speaking");
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Ошибка запроса");
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadMe() {
  try {
    const data = await apiJson("/api/me");
    const access = data.access;
    isUnlimited = Boolean(access.unlimited);
    remainingSeconds = isUnlimited ? null : access.dailyRemainingSeconds || 0;
    els.timeRemaining.textContent = formatTime(remainingSeconds, isUnlimited);

    if (!isUnlimited && access.allowedSeconds <= 0) {
      els.startBtn.disabled = true;
      setStatus(access.premium ? "Лимит на сегодня" : "Пробный лимит окончен", "error");
      setHint(
        access.premium
          ? "На сегодня лимит разговора закончился. Завтра снова будет до 60 минут."
          : "Пробный доступ закончился. Нужна подписка Совёнок Premium."
      );
    } else {
      els.startBtn.disabled = false;
      setStatus("Готов", "idle");
      if (access.admin) {
        setHint("Администраторский доступ активен. Можно разговаривать с Совёнком без оплаты и дневного лимита.");
      } else {
        setHint(access.premium ? "Нажмите кнопку, и Совёнок начнёт голосовой разговор." : "У вас есть пробные минуты для теста Совёнка.");
      }
    }

    if (access.admin) {
      els.premiumCard.querySelector(".small").textContent = "Администраторский доступ активен: без оплаты и без дневного лимита.";
    } else if (access.premium) {
      els.premiumCard.querySelector(".small").textContent = "Premium активен. До 60 минут голосового разговора в день.";
    }
  } catch (error) {
    els.startBtn.disabled = true;
    setStatus("Ошибка входа", "error");
    setHint("Откройте приложение через Telegram-бота. В обычном браузере авторизация Telegram недоступна.");
    console.error(error);
  }
}

async function sendGreetingWhenReady() {
  if (!dc) return;
  const message = {
    type: "response.create",
    response: {
      modalities: ["audio", "text"],
      instructions: "Поздоровайся как Совёнок очень коротко и тепло. Скажи, что ты рядом, и спроси, о чём человеку хочется поговорить сейчас.",
    },
  };

  if (dc.readyState === "open") {
    dc.send(JSON.stringify(message));
  } else {
    dc.addEventListener("open", () => dc.send(JSON.stringify(message)), { once: true });
  }
}

function attachDataChannelHandlers(channel) {
  channel.addEventListener("open", () => {
    setStatus("Совёнок рядом", "connected");
    setVisualState("listening");
    setHint("Говорите естественно. Совёнок услышит вас и ответит голосом.");
  });

  channel.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type?.includes("response.audio") || data.type === "response.created") {
        setVisualState("speaking");
      }
      if (data.type === "response.done" || data.type?.includes("input_audio_buffer.speech_started")) {
        setVisualState("listening");
      }
      if (data.type === "error") {
        console.warn("OpenAI event error", data);
        setHint("Совёнок получил ошибку от голосовой сессии. Попробуйте завершить и начать снова.");
      }
    } catch {
      // Non-JSON event, ignore.
    }
  });

  channel.addEventListener("close", () => {
    setVisualState("listening");
  });
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (!currentSessionId || !isConnected) return;
    try {
      const data = await apiJson("/api/usage/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId }),
      });
      if (data.access?.unlimited) {
        isUnlimited = true;
        remainingSeconds = null;
        els.timeRemaining.textContent = formatTime(remainingSeconds, true);
      } else if (data.access?.dailyRemainingSeconds !== undefined) {
        isUnlimited = false;
        remainingSeconds = data.access.dailyRemainingSeconds;
        els.timeRemaining.textContent = formatTime(remainingSeconds);
      }
      if (data.shouldStop) {
        setHint("Лимит разговора закончился. Сессия будет завершена.");
        await stopConversation();
      }
    } catch (error) {
      console.warn("heartbeat failed", error);
    }
  }, 5000);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (isUnlimited) {
    els.timeRemaining.textContent = formatTime(null, true);
    return;
  }
  countdownTimer = setInterval(() => {
    if (!isConnected) return;
    remainingSeconds = Math.max(0, remainingSeconds - 1);
    els.timeRemaining.textContent = formatTime(remainingSeconds);

    if (remainingSeconds === 600) {
      setHint("Осталось около 10 минут. Совёнок поможет мягко подвести итог разговора.");
    }

    if (remainingSeconds <= 0) {
      stopConversation();
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

async function startConversation() {
  if (isConnected) return;

  try {
    els.startBtn.disabled = true;
    setStatus("Подключение…", "idle");
    setHint("Запрашиваю доступ к микрофону и создаю защищённую голосовую сессию.");

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc = new RTCPeerConnection();
    dc = pc.createDataChannel("oai-events");
    attachDataChannelHandlers(dc);

    pc.ontrack = (event) => {
      els.remoteAudio.srcObject = event.streams[0];
      els.remoteAudio.play().catch(() => {});
    };

    for (const track of localStream.getAudioTracks()) {
      pc.addTrack(track, localStream);
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const response = await fetch("/api/realtime/session", {
      method: "POST",
      headers: {
        ...headers(),
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });

    const contentType = response.headers.get("Content-Type") || "";
    if (!response.ok) {
      const errorPayload = contentType.includes("application/json") ? await response.json() : { message: await response.text() };
      throw new Error(errorPayload.message || errorPayload.error || "Не удалось подключиться к Совёнку");
    }

    currentSessionId = response.headers.get("X-Sovenok-Session-Id");
    isUnlimited = response.headers.get("X-Sovenok-Unlimited") === "1";
    const allowed = Number(response.headers.get("X-Sovenok-Allowed-Seconds") || 0);
    if (isUnlimited) {
      remainingSeconds = null;
      els.timeRemaining.textContent = formatTime(null, true);
    } else if (allowed > 0) {
      remainingSeconds = Math.min(remainingSeconds || allowed, allowed);
    }

    const answer = { type: "answer", sdp: await response.text() };
    await pc.setRemoteDescription(answer);

    isConnected = true;
    setButtons(true);
    setStatus("Разговор идёт", "connected");
    setVisualState("listening");
    startHeartbeat();
    startCountdown();
    await sendGreetingWhenReady();
  } catch (error) {
    console.error(error);
    setStatus("Ошибка", "error");
    setHint(error.message || "Не удалось начать разговор.");
    await stopConversation(false);
  } finally {
    els.startBtn.disabled = false;
  }
}

async function stopConversation(sendEnd = true) {
  const sessionId = currentSessionId;
  isConnected = false;
  setButtons(false);
  stopHeartbeat();
  stopCountdown();
  setVisualState("idle");

  try {
    dc?.close();
  } catch {}
  try {
    pc?.close();
  } catch {}
  try {
    localStream?.getTracks().forEach((track) => track.stop());
  } catch {}

  dc = null;
  pc = null;
  localStream = null;
  currentSessionId = null;

  if (sendEnd && sessionId) {
    try {
      await apiJson("/api/usage/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch (error) {
      console.warn("end session failed", error);
    }
  }

  setStatus("Готов", "idle");
  setHint("Разговор завершён. Можно начать новую сессию, если лимит ещё остался.");
  await loadMe();
}

els.startBtn.addEventListener("click", startConversation);
els.stopBtn.addEventListener("click", () => stopConversation(true));
window.addEventListener("beforeunload", () => {
  if (currentSessionId) {
    navigator.sendBeacon?.(
      "/api/usage/end",
      new Blob([JSON.stringify({ sessionId: currentSessionId })], { type: "application/json" })
    );
  }
});

loadMe();
