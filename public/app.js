const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.("#171d16");
  tg.setBackgroundColor?.("#171d16");
}

const initData = tg?.initData || "";
const headers = () => ({ "X-Telegram-Init-Data": initData });
const params = new URLSearchParams(window.location.search);

const fallbackMini = {
  title: "Совёнок",
  subtitle: "Тихое место, где тебя слышат. Голосовой AI-собеседник для спокойного разговора и поддержки.",
  statusDisconnected: "Не подключён",
  statusReady: "Готов",
  statusConnecting: "Подключение…",
  statusConnected: "Совёнок рядом",
  statusTalking: "Разговор идёт",
  statusError: "Ошибка",
  statusLoginError: "Ошибка входа",
  statusDailyLimit: "Лимит на сегодня",
  statusTrialEnded: "Пробный лимит окончен",
  timerLabel: "Осталось сегодня",
  startButton: "Поговорить с Совёнком",
  stopButton: "Завершить разговор",
  initialHint: "Нажмите кнопку, разрешите микрофон и говорите естественно.",
  readyHintPremium: "Нажмите кнопку, и Совёнок начнёт голосовой разговор.",
  readyHintTrial: "У вас есть пробные минуты для теста Совёнка.",
  readyHintAdmin: "Администраторский доступ активен. Можно разговаривать с Совёнком без оплаты и дневного лимита.",
  micHint: "Запрашиваю доступ к микрофону и создаю защищённую голосовую сессию.",
  talkingHint: "Говорите естественно. Совёнок услышит вас и ответит голосом.",
  sessionEndedHint: "Разговор завершён. Можно начать новую сессию, если лимит ещё остался.",
  limitTodayHint: "На сегодня лимит разговора закончился. Завтра снова будет до 60 минут.",
  trialEndedHint: "Пробный доступ закончился. Нужна подписка Совёнок Premium.",
  limitSoonHint: "Осталось около 10 минут. Совёнок поможет мягко подвести итог разговора.",
  limitEndedHint: "Лимит разговора закончился. Сессия будет завершена.",
  openViaTelegramHint: "Откройте приложение через Telegram-бота. В обычном браузере авторизация Telegram недоступна.",
  voiceSessionErrorHint: "Совёнок получил ошибку от голосовой сессии. Попробуйте завершить и начать снова.",
  connectErrorFallback: "Не удалось начать разговор.",
  premiumTitle: "Совёнок Premium",
  premiumDescription: "<b>12 990 ₽/мес</b> · до 60 минут голосового разговора в день.",
  premiumSmall: "Сейчас в MVP подписка выдаётся администратором вручную. Эквайринг можно подключить следующим этапом.",
  premiumAdminSmall: "Администраторский доступ активен: без оплаты и без дневного лимита.",
  premiumActiveSmall: "Premium активен. До 60 минут голосового разговора в день.",
  safetyTitle: "Важно",
  safetyText: "Совёнок — AI-помощник поддержки, а не врач и не замена психотерапевту. При угрозе жизни, самоповреждении или насилии обратитесь к близкому человеку, специалисту или в экстренную службу.",
  paymentTitle: "Оплата подписки",
  paymentText: "Оплата пока подключается. Напишите в поддержку, чтобы оформить доступ вручную.",
  supportTitle: "Поддержка",
  supportText: "Напишите администратору, если нужна помощь с оплатой, доступом или работой Совёнка.",
  adminPanelTitle: "Админ-Панель",
  adminPanelSubtitle: "Редактируйте приветствия, инлайн-кнопки и тексты Mini App без правки кода.",
  adminSaveButton: "Сохранить изменения",
  adminSaved: "Сохранено. Новые тексты применятся сразу.",
  adminForbidden: "Админ-панель доступна только администраторам.",
  adminLoadError: "Не удалось загрузить админ-панель.",
  adminSaveError: "Не удалось сохранить изменения.",
};

const labelMap = {
  "bot.greetings.user": "Приветствие обычного пользователя",
  "bot.greetings.admin": "Приветствие администратора",
  "bot.buttons.payment.text": "Кнопка оплаты — текст",
  "bot.buttons.payment.url": "Кнопка оплаты — ссылка",
  "bot.buttons.support.text": "Кнопка поддержки — текст",
  "bot.buttons.support.url": "Кнопка поддержки — ссылка",
  "bot.buttons.talk.text": "Главная кнопка разговора — текст",
  "bot.buttons.talk.url": "Главная кнопка разговора — ссылка",
  "bot.buttons.adminPanel.text": "Кнопка админ-панели — текст",
  "bot.buttons.adminPanel.url": "Кнопка админ-панели — ссылка",
};

const $ = (id) => document.getElementById(id);
const els = {
  connectionStatus: $("connectionStatus"),
  owlWrap: $("owlWrap"),
  appTitle: $("appTitle"),
  appSubtitle: $("appSubtitle"),
  timerLabel: $("timerLabel"),
  timeRemaining: $("timeRemaining"),
  startBtn: $("startBtn"),
  stopBtn: $("stopBtn"),
  hintText: $("hintText"),
  remoteAudio: $("remoteAudio"),
  premiumTitle: $("premiumTitle"),
  premiumDescription: $("premiumDescription"),
  premiumSmall: $("premiumSmall"),
  safetyTitle: $("safetyTitle"),
  safetyText: $("safetyText"),
  paymentCard: $("paymentCard"),
  paymentTitle: $("paymentTitle"),
  paymentText: $("paymentText"),
  supportCard: $("supportCard"),
  supportTitle: $("supportTitle"),
  supportText: $("supportText"),
  adminPanel: $("adminPanel"),
  adminTitle: $("adminTitle"),
  adminSubtitle: $("adminSubtitle"),
  adminFields: $("adminFields"),
  adminSaveBtn: $("adminSaveBtn"),
  adminNotice: $("adminNotice"),
};

let contentSettings = null;
let uiText = { ...fallbackMini };
let pc = null;
let dc = null;
let localStream = null;
let currentSessionId = null;
let heartbeatTimer = null;
let countdownTimer = null;
let remainingSeconds = 0;
let isUnlimited = false;
let isConnected = false;

const t = (key) => uiText[key] || fallbackMini[key] || key;

function mergeMini(source) {
  return { ...fallbackMini, ...(source || {}) };
}

function formatTime(totalSeconds, unlimited = false) {
  if (unlimited || totalSeconds === null || totalSeconds === undefined) return "∞";
  const safe = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function setStatus(text, state = "idle") {
  els.connectionStatus.textContent = text;
  els.connectionStatus.classList.toggle("connected", state === "connected");
  els.connectionStatus.classList.toggle("error", state === "error");
}

const setHint = (text) => (els.hintText.textContent = text);
const setButtons = (talking) => {
  els.startBtn.classList.toggle("hidden", talking);
  els.stopBtn.classList.toggle("hidden", !talking);
};
const setVisualState = (state) => {
  els.owlWrap.classList.toggle("listening", state === "listening");
  els.owlWrap.classList.toggle("speaking", state === "speaking");
};

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
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

function applyMiniTexts(miniApp) {
  uiText = mergeMini(miniApp);
  document.title = `${t("title")} Premium`;
  els.connectionStatus.textContent = t("statusDisconnected");
  els.appTitle.textContent = t("title");
  els.appSubtitle.textContent = t("subtitle");
  els.timerLabel.textContent = t("timerLabel");
  els.startBtn.textContent = t("startButton");
  els.stopBtn.textContent = t("stopButton");
  els.hintText.textContent = t("initialHint");
  els.premiumTitle.textContent = t("premiumTitle");
  els.premiumDescription.innerHTML = t("premiumDescription");
  els.premiumSmall.textContent = t("premiumSmall");
  els.safetyTitle.textContent = t("safetyTitle");
  els.safetyText.textContent = t("safetyText");
  els.paymentTitle.textContent = t("paymentTitle");
  els.paymentText.textContent = t("paymentText");
  els.supportTitle.textContent = t("supportTitle");
  els.supportText.textContent = t("supportText");
  els.adminTitle.textContent = t("adminPanelTitle");
  els.adminSubtitle.textContent = t("adminPanelSubtitle");
  els.adminSaveBtn.textContent = t("adminSaveButton");
}

async function loadContent() {
  try {
    const data = await apiJson("/api/content");
    contentSettings = data.content;
    applyMiniTexts(data.content?.miniApp);
  } catch (error) {
    applyMiniTexts(fallbackMini);
    console.warn("content load failed", error);
  }
}

function showRequestedScreen() {
  const screen = params.get("screen");
  if (screen === "subscription") {
    els.paymentCard.classList.remove("hidden");
    els.paymentCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (screen === "support") {
    els.supportCard.classList.remove("hidden");
    els.supportCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function loadMe() {
  try {
    const data = await apiJson("/api/me");
    if (data.content) applyMiniTexts(data.content);

    const access = data.access;
    isUnlimited = Boolean(access.unlimited);
    remainingSeconds = isUnlimited ? null : access.dailyRemainingSeconds || 0;
    els.timeRemaining.textContent = formatTime(remainingSeconds, isUnlimited);

    if (!isUnlimited && access.allowedSeconds <= 0) {
      els.startBtn.disabled = true;
      setStatus(access.premium ? t("statusDailyLimit") : t("statusTrialEnded"), "error");
      setHint(access.premium ? t("limitTodayHint") : t("trialEndedHint"));
    } else {
      els.startBtn.disabled = false;
      setStatus(t("statusReady"), "idle");
      setHint(access.admin ? t("readyHintAdmin") : access.premium ? t("readyHintPremium") : t("readyHintTrial"));
    }

    if (access.admin) {
      els.premiumSmall.textContent = t("premiumAdminSmall");
      await showAdminPanel();
    } else if (access.premium) {
      els.premiumSmall.textContent = t("premiumActiveSmall");
    } else if (params.get("admin") === "1") {
      setHint(t("adminForbidden"));
    }
  } catch (error) {
    els.startBtn.disabled = true;
    setStatus(t("statusLoginError"), "error");
    setHint(t("openViaTelegramHint"));
    console.error(error);
  }
}

function flattenContent(obj, prefix = "") {
  return Object.entries(obj || {}).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value) ? flattenContent(value, path) : [{ path, value: String(value ?? "") }];
  });
}

function setByPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part] ||= {};
  cursor[parts.at(-1)] = value;
}

function fieldLabel(path) {
  if (labelMap[path]) return labelMap[path];
  if (path.startsWith("miniApp.")) return `Mini App — ${path.replace("miniApp.", "")}`;
  return path;
}

function renderAdminFields(content) {
  els.adminFields.innerHTML = "";
  for (const row of flattenContent(content)) {
    const wrapper = document.createElement("label");
    const title = document.createElement("span");
    const textarea = document.createElement("textarea");
    wrapper.className = "admin-field";
    title.textContent = fieldLabel(row.path);
    textarea.dataset.path = row.path;
    textarea.value = row.value;
    textarea.rows = row.value.length > 90 || row.value.includes("\n") ? 4 : 2;
    wrapper.append(title, textarea);
    els.adminFields.append(wrapper);
  }
}

async function showAdminPanel() {
  try {
    const data = await apiJson("/api/admin/content");
    contentSettings = data.content;
    applyMiniTexts(data.content?.miniApp);
    renderAdminFields(data.content);
    els.adminPanel.classList.remove("hidden");
    if (params.get("admin") === "1") els.adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (params.get("admin") === "1") setHint(t("adminLoadError"));
    console.warn("admin panel load failed", error);
  }
}

async function saveAdminContent() {
  const nextContent = JSON.parse(JSON.stringify(contentSettings || {}));
  for (const field of els.adminFields.querySelectorAll("textarea[data-path]")) setByPath(nextContent, field.dataset.path, field.value);

  try {
    els.adminSaveBtn.disabled = true;
    const data = await apiJson("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: nextContent }),
    });
    contentSettings = data.content;
    applyMiniTexts(data.content?.miniApp);
    renderAdminFields(data.content);
    els.adminNotice.textContent = t("adminSaved");
  } catch (error) {
    els.adminNotice.textContent = t("adminSaveError");
    console.error(error);
  } finally {
    els.adminSaveBtn.disabled = false;
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
  if (dc.readyState === "open") dc.send(JSON.stringify(message));
  else dc.addEventListener("open", () => dc.send(JSON.stringify(message)), { once: true });
}

function attachDataChannelHandlers(channel) {
  channel.addEventListener("open", () => {
    setStatus(t("statusConnected"), "connected");
    setVisualState("listening");
    setHint(t("talkingHint"));
  });

  channel.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type?.includes("response.audio") || data.type === "response.created") setVisualState("speaking");
      if (data.type === "response.done" || data.type?.includes("input_audio_buffer.speech_started")) setVisualState("listening");
      if (data.type === "error") {
        console.warn("OpenAI event error", data);
        setHint(t("voiceSessionErrorHint"));
      }
    } catch {}
  });

  channel.addEventListener("close", () => setVisualState("listening"));
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
        els.timeRemaining.textContent = formatTime(null, true);
      } else if (data.access?.dailyRemainingSeconds !== undefined) {
        isUnlimited = false;
        remainingSeconds = data.access.dailyRemainingSeconds;
        els.timeRemaining.textContent = formatTime(remainingSeconds);
      }
      if (data.shouldStop) {
        setHint(t("limitEndedHint"));
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
    if (remainingSeconds === 600) setHint(t("limitSoonHint"));
    if (remainingSeconds <= 0) stopConversation();
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
    setStatus(t("statusConnecting"), "idle");
    setHint(t("micHint"));

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc = new RTCPeerConnection();
    dc = pc.createDataChannel("oai-events");
    attachDataChannelHandlers(dc);
    pc.ontrack = (event) => {
      els.remoteAudio.srcObject = event.streams[0];
      els.remoteAudio.play().catch(() => {});
    };
    for (const track of localStream.getAudioTracks()) pc.addTrack(track, localStream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const response = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/sdp" },
      body: offer.sdp,
    });

    const contentType = response.headers.get("Content-Type") || "";
    if (!response.ok) {
      const payload = contentType.includes("application/json") ? await response.json() : { message: await response.text() };
      throw new Error(payload.message || payload.error || "Не удалось подключиться к Совёнку");
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

    await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
    isConnected = true;
    setButtons(true);
    setStatus(t("statusTalking"), "connected");
    setVisualState("listening");
    startHeartbeat();
    startCountdown();
    await sendGreetingWhenReady();
  } catch (error) {
    console.error(error);
    setStatus(t("statusError"), "error");
    setHint(error.message || t("connectErrorFallback"));
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
  try { dc?.close(); } catch {}
  try { pc?.close(); } catch {}
  try { localStream?.getTracks().forEach((track) => track.stop()); } catch {}
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

  setStatus(t("statusReady"), "idle");
  setHint(t("sessionEndedHint"));
  await loadMe();
}

els.startBtn.addEventListener("click", startConversation);
els.stopBtn.addEventListener("click", () => stopConversation(true));
els.adminSaveBtn.addEventListener("click", saveAdminContent);
window.addEventListener("beforeunload", () => {
  if (currentSessionId) {
    navigator.sendBeacon?.("/api/usage/end", new Blob([JSON.stringify({ sessionId: currentSessionId })], { type: "application/json" }));
  }
});

await loadContent();
await loadMe();
showRequestedScreen();
