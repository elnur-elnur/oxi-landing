import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, setDoc, query, orderBy, limit, onSnapshot,
  serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const cfg = window.CHAT_CONFIG || {};

const EMOJIS = [
  "😀","😂","🤣","😊","😍","🥰","😘","😉","😎","🤔",
  "😅","😭","😢","😡","😱","😴","🙄","😇","🤗","🤩",
  "😜","😋","🥺","😏","🙈","👍","👎","👏","🙏","💪",
  "🤝","👌","✌️","🔥","❤️","💔","💯","🎉","🌹","☕"
];

const PAGE = 60;           // bir dəfəyə yüklənən mesaj sayı
const LONG = 1500;         // bundan uzun mesajlar "Daha çox oxu" ilə açılır
const MAX_LEN = 50000;     // bir mesajın maksimum uzunluğu

// ---------- yardımçılar ----------
function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
    localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
}
function rid() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3500);
}
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (ms) => { const d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); };
const MONTHS = ["yanvar","fevral","mart","aprel","may","iyun","iyul","avqust","sentyabr","oktyabr","noyabr","dekabr"];
function dayLabel(ms) {
  const d = new Date(ms), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return "Bu gün";
  if (diff === 1) return "Dünən";
  return d.getDate() + " " + MONTHS[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? " " + d.getFullYear() : "");
}
function lastSeenLabel(ms) {
  if (!ms) return "";
  const diff = Math.round((new Date(new Date().toDateString()) - new Date(new Date(ms).toDateString())) / 86400000);
  if (diff === 0) return "son görülmə bu gün " + hhmm(ms);
  if (diff === 1) return "son görülmə dünən " + hhmm(ms);
  return "son görülmə " + dayLabel(ms) + " " + hhmm(ms);
}
const onlyEmoji = (s) => s.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(s) && /\p{Extended_Pictographic}/u.test(s);

// Mətni təhlükəsiz şəkildə yerləşdirir, linkləri kliklənən edir
function fillText(el, text) {
  el.textContent = "";
  const re = /(https?:\/\/[^\s<]+)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) el.append(text.slice(last, m.index));
    const a = document.createElement("a");
    a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = m[0];
    el.append(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) el.append(text.slice(last));
}

const SVG_NS = "http://www.w3.org/2000/svg";
function icon(kind) {
  const s = document.createElementNS(SVG_NS, "svg");
  if (kind === "clock") {
    s.setAttribute("viewBox", "0 0 12 12"); s.setAttribute("class", "clock");
    s.innerHTML = '<circle cx="6" cy="6" r="5"/><path d="M6 3v3.2l2 1.3"/>';
  } else {
    s.setAttribute("viewBox", "0 0 16 11");
    s.setAttribute("class", "tick" + (kind === "read" ? " read" : ""));
    s.innerHTML = kind === "sent"
      ? '<path d="M3 6l3 3 6.5-7"/>'
      : '<path d="M1 6l3 3 6.5-7"/><path d="M7.2 8.4l.6.6 6.5-7"/>';
  }
  return s;
}

// ---------- başlanğıc ----------
if (!cfg.firebase || !cfg.firebase.apiKey) {
  $("#setup").hidden = false;
} else {
  let me = store("chat_me");
  if (me && me.uid && me.name) start(me);
  else askName((name) => { me = { uid: (me && me.uid) || rid(), name }; store("chat_me", me); start(me); });
}

function askName(done, current = "") {
  const modal = $("#nameModal"), input = $("#nameInput"), form = $("#nameForm");
  input.value = current;
  modal.hidden = false;
  setTimeout(() => input.focus(), 50);
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = input.value.trim().slice(0, 30);
    if (!name) return;
    modal.hidden = true;
    done(name);
  };
}

function start(me) {
  const params = new URLSearchParams(location.search);
  const room = ((params.get("r") || cfg.room || "main").replace(/[^\w-]/g, "").slice(0, 60)) || "main";

  const app = initializeApp(cfg.firebase);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }

  const msgCol = collection(db, "rooms", room, "messages");
  const presCol = collection(db, "rooms", room, "presence");
  const presRef = doc(presCol, me.uid);

  const list = $("#list"), items = $("#items"), input = $("#input");
  const toBottom = $("#toBottom"), newCount = $("#newCount");

  // ----- vəziyyət -----
  let pageSize = PAGE, hasMore = false, unsub = null, firstLoad = true, loadingOlder = false;
  let msgs = [];
  const cache = new Map();          // id -> {el, metaEl, state}
  const seps = new Map();           // dayKey -> el
  const marked = { d: new Set(), r: new Set() };
  let unseenBelow = 0, lastCount = 0, lastNewestId = null;

  const moreBtn = document.createElement("button");
  moreBtn.className = "more";
  moreBtn.textContent = "Köhnə mesajları yüklə";
  moreBtn.onclick = () => loadOlder();

  const emptyEl = document.createElement("div");
  emptyEl.className = "empty";
  emptyEl.textContent = "Hələ mesaj yoxdur. İlk mesajı yaz 👋  Linki qarşı tərəfə göndər ki, o da qoşulsun.";

  // ----- mesajlara abunə -----
  function subscribe() {
    if (unsub) unsub();
    const q = query(msgCol, orderBy("ts", "desc"), limit(pageSize));
    unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const arr = [];
      snap.forEach((d) => {
        const v = d.data();
        if (typeof v.text !== "string") return;
        arr.push({ id: d.id, text: v.text, uid: v.uid, name: v.name, ts: v.ts || 0,
          delivered: !!v.deliveredAt, read: !!v.readAt, pending: d.metadata.hasPendingWrites });
      });
      arr.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
      hasMore = snap.size >= pageSize;
      msgs = arr;
      render();
      markSeen();
    }, (err) => {
      console.error(err);
      toast("Bağlantı xətası: " + (err.code || err.message));
    });
  }

  function loadOlder() {
    if (!hasMore || loadingOlder) return;
    loadingOlder = true;
    pageSize += PAGE;
    subscribe();
  }

  function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 120; }
  function scrollToBottom() { list.scrollTop = list.scrollHeight; }

  function statusIcon(m) {
    if (m.pending) return "clock";
    if (m.read) return "read";
    if (m.delivered) return "delivered";
    return "sent";
  }

  function getEl(m) {
    let c = cache.get(m.id);
    if (!c) {
      const el = document.createElement("div");
      const txt = document.createElement("div");
      txt.className = "txt";
      if (onlyEmoji(m.text)) txt.classList.add("big");
      if (m.text.length > LONG) {
        fillText(txt, m.text.slice(0, 1000) + "…");
        const rm = document.createElement("button");
        rm.className = "readmore";
        rm.textContent = "Daha çox oxu";
        rm.onclick = () => { fillText(txt, m.text); txt.append(meta); };
        txt.append(rm);
      } else {
        fillText(txt, m.text);
      }
      const meta = document.createElement("span");
      meta.className = "meta";
      const time = document.createElement("span");
      time.textContent = hhmm(m.ts);
      meta.append(time);
      // vaxt + quşlar mətnin sonunda, WhatsApp kimi sağ altda
      txt.append(meta);
      el.append(txt);
      c = { el, meta, state: null };
      cache.set(m.id, c);
    }
    const mine = m.uid === me.uid;
    const st = mine ? statusIcon(m) : "";
    if (c.state !== st) {
      c.state = st;
      const old = c.meta.querySelector("svg");
      if (old) old.remove();
      if (st) c.meta.append(icon(st));
    }
    return c;
  }

  function render() {
    const wasBottom = firstLoad || nearBottom();
    const fromBottom = list.scrollHeight - list.scrollTop;

    const nodes = [];
    if (hasMore) nodes.push(moreBtn);
    if (!msgs.length) nodes.push(emptyEl);
    let prevDay = null, prevUid = null;
    for (const m of msgs) {
      const dk = dayKey(m.ts);
      if (dk !== prevDay) {
        let s = seps.get(dk);
        if (!s) { s = document.createElement("div"); s.className = "day"; seps.set(dk, s); }
        s.textContent = dayLabel(m.ts);
        nodes.push(s);
        prevUid = null;
      }
      const c = getEl(m);
      const cls = "msg " + (m.uid === me.uid ? "out" : "in") + (m.uid !== prevUid ? " first" : "");
      if (c.el.className !== cls) c.el.className = cls;
      nodes.push(c.el);
      prevDay = dk; prevUid = m.uid;
    }

    // yalnız sıra dəyişibsə DOM-u yenilə
    const cur = items.children;
    let same = cur.length === nodes.length;
    for (let i = 0; same && i < nodes.length; i++) if (cur[i] !== nodes[i]) same = false;
    if (!same) items.replaceChildren(...nodes);

    const newest = msgs.length ? msgs[msgs.length - 1] : null;
    const gotNew = newest && newest.id !== lastNewestId && !firstLoad && msgs.length >= lastCount;
    if (loadingOlder) {
      list.scrollTop = list.scrollHeight - fromBottom;
      loadingOlder = false;
    } else if (wasBottom || (gotNew && newest.uid === me.uid)) {
      scrollToBottom();
      unseenBelow = 0;
    } else if (gotNew) {
      unseenBelow++;
    }
    lastNewestId = newest ? newest.id : null;
    lastCount = msgs.length;
    firstLoad = false;
    updateBottomBtn();
    updateTitle();
  }

  function updateBottomBtn() {
    const show = !nearBottom();
    toBottom.hidden = !show;
    if (!show) unseenBelow = 0;
    newCount.hidden = unseenBelow === 0;
    newCount.textContent = unseenBelow;
  }

  function isActive() { return document.visibilityState === "visible" && document.hasFocus(); }

  function updateTitle() {
    const unread = msgs.filter((m) => m.uid !== me.uid && !m.read).length;
    document.title = unread && !isActive() ? `(${unread}) Yeni mesaj` : "Çat";
  }

  // ----- çatdırıldı / oxundu -----
  function markSeen() {
    const active = isActive();
    let batch = writeBatch(db), n = 0;
    const commits = [];
    for (const m of msgs) {
      if (m.uid === me.uid) continue;
      const upd = {};
      if (!m.delivered && !marked.d.has(m.id)) { upd.deliveredAt = serverTimestamp(); marked.d.add(m.id); }
      if (active && !m.read && !marked.r.has(m.id)) {
        upd.readAt = serverTimestamp(); marked.r.add(m.id);
        if (!m.delivered) upd.deliveredAt = serverTimestamp();
      }
      if (Object.keys(upd).length) {
        batch.update(doc(msgCol, m.id), upd);
        if (++n >= 400) { commits.push(batch.commit()); batch = writeBatch(db); n = 0; }
      }
    }
    if (n) commits.push(batch.commit());
    for (const p of commits) p.catch((e) => { console.warn(e); marked.d.clear(); marked.r.clear(); });
    updateTitle();
  }

  // ----- göndərmək -----
  function send() {
    const text = input.value.replace(/^\s*\n+|\s+$/g, "");
    if (!text.trim()) return;
    if (text.length > MAX_LEN) { toast(`Mesaj çox uzundur (maks. ${MAX_LEN} simvol)`); return; }
    input.value = "";
    autoGrow();
    setTyping(false);
    addDoc(msgCol, { text, uid: me.uid, name: me.name, ts: Date.now(), createdAt: serverTimestamp() })
      .catch((e) => { console.error(e); toast("Göndərilmədi: " + (e.code || e.message)); });
    input.focus();
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
  }

  const desktop = matchMedia("(hover: hover) and (pointer: fine)").matches;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && desktop && !e.isComposing) { e.preventDefault(); send(); }
  });
  input.addEventListener("input", () => { autoGrow(); setTyping(true); });
  // klaviatura bağlanmasın deyə düyməyə toxunanda fokus itməsin
  $("#sendBtn").addEventListener("pointerdown", (e) => e.preventDefault());
  $("#sendBtn").addEventListener("click", send);

  // ----- smayliklər -----
  const panel = $("#emojiPanel");
  for (const em of EMOJIS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = em;
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", () => insertAtCursor(em));
    panel.append(b);
  }
  $("#emojiBtn").addEventListener("pointerdown", (e) => e.preventDefault());
  $("#emojiBtn").addEventListener("click", () => {
    const keep = nearBottom();
    panel.hidden = !panel.hidden;
    if (keep) scrollToBottom();
  });
  function insertAtCursor(t) {
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, s) + t + input.value.slice(e);
    const p = s + t.length;
    input.setSelectionRange(p, p);
    autoGrow();
  }

  // ----- scroll -----
  let ticking = false;
  list.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateBottomBtn();
      if (list.scrollTop < 60 && hasMore && !loadingOlder) loadOlder();
    });
  }, { passive: true });
  toBottom.addEventListener("click", () => { list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }); unseenBelow = 0; updateBottomBtn(); });
  // klaviatura açılanda/ölçü dəyişəndə aşağıda qal
  let wasAtBottom = true;
  list.addEventListener("scroll", () => { wasAtBottom = nearBottom(); }, { passive: true });
  new ResizeObserver(() => { if (wasAtBottom) scrollToBottom(); }).observe(list);

  // ----- onlayn / yazır… -----
  let typingOn = false, typingSentAt = 0, typingTimer = null;
  function beat(extra = {}) {
    setDoc(presRef, { name: me.name, at: Date.now(), online: document.visibilityState === "visible", typing: typingOn, ...extra }, { merge: true })
      .catch(() => {});
  }
  function setTyping(on) {
    clearTimeout(typingTimer);
    if (on) {
      typingTimer = setTimeout(() => setTyping(false), 4000);
      if (!typingOn || Date.now() - typingSentAt > 3000) { typingOn = true; typingSentAt = Date.now(); beat(); }
    } else if (typingOn) {
      typingOn = false; beat();
    }
  }

  let peer = null;
  onSnapshot(presCol, (snap) => {
    let best = null;
    snap.forEach((d) => {
      if (d.id === me.uid) return;
      const v = d.data();
      if (!best || (v.at || 0) > (best.at || 0)) best = v;
    });
    peer = best;
    showPeer();
  }, () => {});

  function showPeer() {
    const nameEl = $("#peerName"), stEl = $("#peerStatus"), av = $("#avatar");
    if (!peer) {
      nameEl.textContent = "Gözlənilir…";
      stEl.textContent = "Linki qarşı tərəfə göndər";
      av.textContent = "?";
      return;
    }
    nameEl.textContent = peer.name || "Qonaq";
    av.textContent = (peer.name || "?").trim().charAt(0).toUpperCase();
    const age = Date.now() - (peer.at || 0);
    if (peer.typing && age < 8000) stEl.textContent = "yazır…";
    else if (peer.online && age < 70000) stEl.textContent = "onlayn";
    else stEl.textContent = lastSeenLabel(peer.at);
  }
  setInterval(showPeer, 5000);

  beat();
  setInterval(() => { if (document.visibilityState === "visible") beat(); }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") typingOn = false;
    beat();
    markSeen();
  });
  window.addEventListener("focus", markSeen);
  window.addEventListener("blur", updateTitle);
  window.addEventListener("pagehide", () => beat({ online: false, typing: false }));

  $("#renameBtn").addEventListener("click", () => {
    askName((name) => { me.name = name; store("chat_me", me); beat(); toast("Adın dəyişdi: " + name); }, me.name);
  });

  subscribe();
}
