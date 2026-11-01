import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, setDoc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, writeBatch, runTransaction
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
const MAX_LEN = 100000;    // bir mesajın maksimum uzunluğu (simvol)
const IMG_MAX = 1600;      // şəklin ən uzun tərəfi (px)
const IMG_BYTES = 850000;  // Firestore sənədinə sığsın deyə şəklin maksimum ölçüsü

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

function browserLabel() {
  const u = navigator.userAgent;
  const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows"
    : /Mac OS X/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "Digər";
  const b = /Instagram/.test(u) ? "Instagram" : /FBAN|FBAV/.test(u) ? "Facebook" : /WhatsApp/.test(u) ? "WhatsApp"
    : /Telegram/.test(u) ? "Telegram" : /Edg(A|iOS)?\//.test(u) ? "Edge" : /OPR|Opera/.test(u) ? "Opera"
    : /SamsungBrowser/.test(u) ? "Samsung" : /YaBrowser/.test(u) ? "Yandex" : /CriOS|Chrome/.test(u) ? "Chrome"
    : /FxiOS|Firefox/.test(u) ? "Firefox" : /Safari/.test(u) ? "Safari" : "Brauzer";
  return b + " · " + os;
}

// ---------- iki nəfər: Elish və Nurush ----------
const PEOPLE = {
  elish:  { uid: "elish",  name: "Elish",  avatar: "elish.svg" },
  nurush: { uid: "nurush", name: "Nurush", avatar: "nurush.svg" }
};
const other = (uid) => (uid === "elish" ? PEOPLE.nurush : PEOPLE.elish);

// ---------- başlanğıc ----------
if (!cfg.firebase || !cfg.firebase.apiKey) {
  $("#setup").hidden = false;
} else {
  boot();
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const room = ((params.get("r") || cfg.room || "main").replace(/[^\w-]/g, "").slice(0, 60)) || "main";

  const app = initializeApp(cfg.firebase);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }

  const key = "chat_role_" + room;
  let role = store(key);
  // Elish-in öz digər cihazları üçün: linkin sonuna #elish
  if (location.hash === "#elish") {
    role = "elish";
    history.replaceState(null, "", location.pathname + location.search);
    runTransaction(db, async (tx) => {
      const ref = doc(db, "rooms", room, "meta", "roles");
      const snap = await tx.get(ref);
      if (!snap.exists() || !snap.data().elish) tx.set(ref, { elish: Date.now() }, { merge: true });
    }).catch(() => {});
  }
  if (!PEOPLE[role]) {
    // Heç nə soruşulmur: ilk girən Elish, ondan sonra girən hər kəs Nurush
    try {
      role = await runTransaction(db, async (tx) => {
        const ref = doc(db, "rooms", room, "meta", "roles");
        const snap = await tx.get(ref);
        const taken = snap.exists() ? snap.data() : {};
        const pick = !taken.elish ? "elish" : "nurush";
        if (!taken[pick]) tx.set(ref, { [pick]: Date.now() }, { merge: true });
        return pick;
      });
    } catch (e) { console.warn(e); role = "nurush"; }
  }
  store(key, role);
  start(PEOPLE[role], db, room);
}

function start(me, db, room) {
  const peerInfo = other(me.uid);

  const msgCol = collection(db, "rooms", room, "messages");
  const presCol = collection(db, "rooms", room, "presence");
  const presRef = doc(presCol, me.uid);
  const imgCol = collection(db, "rooms", room, "images");
  const visitCol = collection(db, "rooms", room, "visits");
  const devCol = collection(db, "rooms", room, "devices");

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
          img: v.img || null, w: v.w || 0, h: v.h || 0, thumb: v.thumb || "",
          delivered: !!v.deliveredAt, read: !!v.readAt, pending: d.metadata.hasPendingWrites });
      });
      arr.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
      hasMore = snap.size >= pageSize;
      msgs = arr;
      try { render(); } catch (e) { console.error("render", e); }
      try { markSeen(); } catch (e) { console.error("markSeen", e); }
    }, (err) => {
      console.warn("messages", err.code || err.message);
      // Qısa internet kəsilmələrində xəta göstərmə; özü yenidən qoşulur.
      if (err.code === "permission-denied") toast("İcazə xətası");
      else setTimeout(() => { if (!unsub) subscribe(); }, 4000);
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
      if (m.img) { el.append(imageEl(m)); el.dataset.img = "1"; if (!m.text) txt.classList.add("only-meta"); }
      if (!m.img && onlyEmoji(m.text)) txt.classList.add("big");
      const meta = document.createElement("span");
      meta.className = "meta";
      const time = document.createElement("span");
      time.textContent = hhmm(m.ts);
      meta.append(time);
      if (m.text.length > LONG) {
        // uzun mesaj: "Daha çox oxu" ilə açılır, "Bağla" ilə yığılır
        let open = false;
        const rm = document.createElement("button");
        rm.className = "readmore";
        const draw = () => {
          fillText(txt, open ? m.text : m.text.slice(0, 1000) + "… ");
          rm.textContent = open ? " Bağla ▲" : "Daha çox oxu ▼";
          txt.append(rm, meta);
        };
        rm.onclick = () => { open = !open; draw(); if (!open) el.scrollIntoView({ block: "nearest" }); };
        draw();
      } else {
        fillText(txt, m.text);
        // vaxt + quşlar mətnin sonunda, WhatsApp kimi sağ altda
        txt.append(meta);
      }
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
      const cls = "msg " + (m.uid === me.uid ? "out" : "in") + (m.uid !== prevUid ? " first" : "") + (m.img ? " has-img" : "");
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
    document.title = unread && !isActive() ? `(${unread}) Yeni mesaj` : "Elish & Nurush";
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

  // ----- şəkillər -----
  const localImgs = new Map();   // öz göndərdiyimiz şəkillər (dərhal görünsün)
  const imgData = new Map();     // yüklənmiş şəkillərin keşi
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      loadFull(e.target);
    }
  }, { root: list, rootMargin: "600px 0px" });

  function imageEl(m) {
    const wrap = document.createElement("div");
    wrap.className = "img-wrap";
    const w = m.w || 4, h = m.h || 3;
    wrap.style.aspectRatio = w + " / " + h;
    const img = document.createElement("img");
    img.alt = "şəkil";
    img.decoding = "async";
    img.dataset.id = m.img;
    const local = localImgs.get(m.img) || imgData.get(m.img);
    if (local) img.src = local;
    else { if (m.thumb) { img.src = m.thumb; img.className = "blur"; } io.observe(img); }
    img.onclick = () => { if (!img.classList.contains("blur")) openViewer(img.src); };
    wrap.append(img);
    return wrap;
  }

  async function loadFull(img) {
    const id = img.dataset.id;
    try {
      let data = imgData.get(id);
      if (!data) {
        const snap = await getDoc(doc(imgCol, id));
        data = snap.exists() ? snap.data().data : null;
        if (data) imgData.set(id, data);
      }
      if (data) { img.src = data; img.className = ""; }
    } catch (e) { console.warn(e); setTimeout(() => io.observe(img), 5000); }
  }

  function openViewer(src) {
    const v = $("#viewer");
    $("#viewerImg").src = src;
    v.hidden = false;
  }
  $("#viewer").addEventListener("click", () => { $("#viewer").hidden = true; $("#viewerImg").removeAttribute("src"); });

  async function compress(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch {
      bmp = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file);
      });
    }
    const W = bmp.width, H = bmp.height;
    const draw = (max, q) => {
      const k = Math.min(1, max / Math.max(W, H));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      return { url: c.toDataURL("image/jpeg", q), w: c.width, h: c.height };
    };
    let out = null;
    for (const [max, q] of [[IMG_MAX, 0.8], [IMG_MAX, 0.65], [1280, 0.6], [1024, 0.55], [800, 0.5], [640, 0.45]]) {
      out = draw(max, q);
      if (out.url.length <= IMG_BYTES) break;
    }
    if (out.url.length > IMG_BYTES) throw new Error("Şəkil çox böyükdür");
    const thumb = draw(24, 0.5).url;
    if (bmp.close) bmp.close();
    return { ...out, thumb };
  }

  async function sendImages(files) {
    const caption = input.value.replace(/^\s*\n+|\s+$/g, "").slice(0, MAX_LEN);
    let first = true;
    for (const file of files) {
      if (!file.type.startsWith("image/")) { toast("Yalnız şəkil göndərmək olar"); continue; }
      try {
        const r = await compress(file);
        const id = rid();
        localImgs.set(id, r.url);
        // əvvəlcə şəkil, sonra mesaj — ikisi də offline növbəyə düşür
        setDoc(doc(imgCol, id), { data: r.url, uid: me.uid, ts: Date.now() })
          .catch((e) => { console.error(e); toast("Şəkil göndərilmədi: " + (e.code || e.message)); });
        addDoc(msgCol, { text: first ? caption : "", img: id, w: r.w, h: r.h, thumb: r.thumb,
          uid: me.uid, name: me.name, ts: Date.now(), createdAt: serverTimestamp() })
          .catch((e) => { console.error(e); toast("Göndərilmədi: " + (e.code || e.message)); });
        if (first && caption) { input.value = ""; autoGrow(); }
        first = false;
      } catch (e) { console.error(e); toast("Şəkil göndərilmədi: " + e.message); }
    }
  }

  const fileInput = $("#fileInput");
  $("#attachBtn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { const f = [...fileInput.files]; fileInput.value = ""; if (f.length) sendImages(f); });
  input.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith("image/"));
    if (f.length) { e.preventDefault(); sendImages(f); }
  });
  list.addEventListener("dragover", (e) => e.preventDefault());
  list.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files || [])].filter((x) => x.type.startsWith("image/"));
    if (f.length) sendImages(f);
  });

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
  onSnapshot(doc(presCol, peerInfo.uid), (d) => {
    peer = d.exists() ? d.data() : null;
    showPeer();
  }, () => {});

  $("#peerName").textContent = peerInfo.name;
  $("#avatar").style.backgroundImage = `url(${peerInfo.avatar})`;
  $("#avatar").textContent = "";
  function showPeer() {
    const stEl = $("#peerStatus");
    if (!peer) { stEl.textContent = "hələ qoşulmayıb"; return; }
    const age = Date.now() - (peer.at || 0);
    if (peer.typing && age < 8000) stEl.textContent = "yazır…";
    else if (peer.online && age < 70000) stEl.textContent = "onlayn";
    else stEl.textContent = lastSeenLabel(peer.at);
  }
  setInterval(showPeer, 5000);

  // ----- giriş / çıxış tarixçəsi -----
  let inside = false;
  let dev = store("chat_dev");
  if (!dev) { dev = rid(); store("chat_dev", dev); }
  const br = browserLabel();
  let ipP = null;
  const getIp = () => (ipP ||= fetch("https://api.ipify.org?format=json", AbortSignal.timeout ? { signal: AbortSignal.timeout(5000) } : {})
    .then((r) => r.json()).then((j) => j.ip || null).catch(() => { ipP = null; return null; }));

  function logVisit(type) {
    if ((type === "in") === inside) return;   // eyni hadisəni iki dəfə yazma
    inside = type === "in";
    const at = Date.now();
    if (type === "out") { addDoc(visitCol, { uid: me.uid, name: me.name, dev, type, at }).catch(() => {}); return; }
    getIp().then((ip) => addDoc(visitCol, { uid: me.uid, name: me.name, dev, type, at, ip, br }).catch(() => {}));
  }
  if (document.visibilityState === "visible") logVisit("in");

  // ----- yeni IP / brauzer qeydiyyatı -----
  const slug = (x) => String(x).replace(/[^\w.-]+/g, "_").slice(0, 100);
  async function registerDevice() {
    const ip = await getIp();
    const items = [["br", br]];
    if (ip) items.push(["ip", ip]);
    for (const [type, value] of items) {
      const ref = doc(devCol, me.uid + "_" + type + "_" + slug(value));
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) await setDoc(ref, { uid: me.uid, type, value, ip: ip || null, br, first: Date.now() });
      } catch (e) { console.warn(e); }
    }
  }
  registerDevice();

// Qeyd: IP/brauzer və giriş məlumatları səssiz yazılır (yalnız sahib üçün hesabat), çatda görünmür.

  beat();
  setInterval(() => { if (document.visibilityState === "visible") beat(); }, 30000);
  document.addEventListener("visibilitychange", () => {
    const vis = document.visibilityState === "visible";
    if (!vis) typingOn = false;
    logVisit(vis ? "in" : "out");
    beat();
    markSeen();
  });
  window.addEventListener("focus", markSeen);
  window.addEventListener("blur", updateTitle);
  window.addEventListener("pagehide", () => { logVisit("out"); beat({ online: false, typing: false }); });
  window.addEventListener("pageshow", (e) => { if (e.persisted && document.visibilityState === "visible") { logVisit("in"); beat(); } });

  $("#meAvatar").style.backgroundImage = `url(${me.avatar})`;
  $("#meAvatar").title = "Sən: " + me.name;

  subscribe();
}
