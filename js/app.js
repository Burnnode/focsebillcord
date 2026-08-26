import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY, JITSI_ROOM } from './config.js';

const $ = (s) => document.querySelector(s);

const els = {
  gate: $('#gate'),
  gateForm: $('#gateForm'),
  nameInput: $('#nameInput'),
  gateError: $('#gateError'),
  app: $('#app'),
  avatars: $('#presenceAvatars'),
  presenceCount: $('#presenceCount'),
  leaveBtn: $('#leaveBtn'),
  callPanel: $('#callPanel'),
  prejoin: $('#prejoin'),
  joinCallBtn: $('#joinCallBtn'),
  jitsiMount: $('#jitsiMount'),
  messages: $('#messages'),
  chatSkeleton: $('#chatSkeleton'),
  chatEmpty: $('#chatEmpty'),
  chatOffline: $('#chatOffline'),
  chatCount: $('#chatCount'),
  composer: $('#composer'),
  msgInput: $('#msgInput'),
  catBtn: $('#catBtn'),
};

const NAME_KEY = 'focsecord:name';
let myName = (localStorage.getItem(NAME_KEY) || '').trim();
let supabase = null;
let roomChannel = null;
let jitsiApi = null;
let lastSentAt = 0;
let historyReady = false;
const pendingLive = []; // eventos realtime que chegam antes do historico renderizar
const seenIds = new Set(); // dedupe: historico e realtime podem trazer a mesma mensagem

/* ---------- portao ---------- */

els.gateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = els.nameInput.value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) {
    els.gateError.hidden = false;
    return;
  }
  els.gateError.hidden = true;
  myName = name;
  localStorage.setItem(NAME_KEY, name);
  enterRoom();
});

els.leaveBtn.addEventListener('click', () => {
  localStorage.removeItem(NAME_KEY);
  try { jitsiApi?.dispose(); } catch {}
  location.reload();
});

/* ---------- sala ---------- */

function enterRoom() {
  els.gate.hidden = true;
  els.app.hidden = false;
  document.body.classList.add('in-app');
  document.title = 'focsecord';
  initSupabase();
}

function initSupabase() {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch {
    chatOffline();
    renderAvatars([{ name: myName }]);
    return;
  }

  // canal unico da sala: presenca + inserts do chat
  roomChannel = supabase
    .channel('room:lounge', { config: { presence: { key: presenceKey() } } })
    .on('presence', { event: 'sync' }, renderPresence)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        if (!historyReady) pendingLive.push(payload.new);
        else addMessage(payload.new, true);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        roomChannel.track({ name: myName, at: new Date().toISOString() });
      }
    });

  loadHistory();
}

function presenceKey() {
  return myName + '#' + Math.random().toString(36).slice(2, 6);
}

/* ---------- presenca ---------- */

function renderPresence() {
  const state = roomChannel?.presenceState() || {};
  const people = [];
  const seen = new Set();
  for (const key of Object.keys(state)) {
    const meta = state[key][0];
    const name = (meta?.name || key.split('#')[0]).trim();
    const dedupe = name.toLowerCase();
    if (!seen.has(dedupe)) {
      seen.add(dedupe);
      people.push({ name });
    }
  }
  if (people.length === 0) people.push({ name: myName });
  renderAvatars(people);
}

function renderAvatars(people) {
  els.avatars.innerHTML = '';
  const max = 8;
  people.slice(0, max).forEach((p) => {
    const el = document.createElement('span');
    el.className = 'avatar';
    el.title = p.name;
    el.textContent = p.name.charAt(0);
    const h = hueFor(p.name);
    el.style.background = `hsl(${h} 45% 70% / 0.16)`;
    el.style.color = `hsl(${h} 50% 74%)`;
    el.style.borderColor = '#101016';
    els.avatars.appendChild(el);
  });
  if (people.length > max) {
    const more = document.createElement('span');
    more.className = 'avatar';
    more.textContent = '+' + (people.length - max);
    more.style.background = 'rgba(255,255,255,0.08)';
    more.style.color = 'rgba(244,244,247,0.7)';
    els.avatars.appendChild(more);
  }
  const n = people.length;
  els.presenceCount.textContent = n + ' online';
  els.chatCount.textContent = n === 1 ? 'só tu por aqui' : n + ' na sala';
}

function hueFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/* ---------- chat ---------- */

async function loadHistory() {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, created_at, author, content')
      .order('id', { ascending: false })
      .limit(60);
    if (error) throw error;
    els.chatSkeleton.hidden = true;
    els.chatSkeleton.style.display = 'none';
    data.reverse().forEach((m) => addMessage(m, false));
    historyReady = true;
    pendingLive.splice(0).forEach((m) => addMessage(m, true));
    els.chatEmpty.hidden = seenIds.size > 0;
    scrollChat(true);
  } catch {
    chatOffline();
  }
}

function chatOffline() {
  els.chatSkeleton.hidden = true;
  els.chatSkeleton.style.display = 'none';
  els.chatEmpty.hidden = true;
  els.chatOffline.hidden = false;
  els.composer.dataset.disabled = 'true';
  els.msgInput.disabled = true;
}

function addMessage(m, live) {
  if (!m || !m.content) return;
  if (m.id != null) {
    if (seenIds.has(m.id)) return;
    seenIds.add(m.id);
  }
  els.chatEmpty.hidden = true;

  const wrap = document.createElement('div');
  wrap.className = 'msg';
  if (!live) wrap.style.animation = 'none';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const author = document.createElement('span');
  author.className = 'msg-author';
  author.textContent = m.author || 'alguém';
  author.style.color = `hsl(${hueFor(m.author || '')} 50% 74%)`;

  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = formatTime(m.created_at);

  meta.append(author, time);

  const body = document.createElement('div');
  body.className = 'msg-body';
  const rich = renderRich(m.content);
  body.appendChild(rich.fragment);

  wrap.append(meta, body);
  if (rich.media) wrap.appendChild(rich.media);

  const nearBottom =
    els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 90;
  els.messages.appendChild(wrap);
  if (!live || nearBottom || m.author === myName) scrollChat(!live);
}

function scrollChat(instant) {
  els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso)
    );
  } catch {
    return '';
  }
}

els.composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = els.msgInput.value.trim();
  if (!content) return;
  els.msgInput.value = '';
  const ok = await sendMessage(content);
  // devolve pro campo se falhou, mas sem atropelar rascunho novo
  if (!ok && !els.msgInput.value) els.msgInput.value = content;
  els.msgInput.focus();
});

els.catBtn.addEventListener('click', () => {
  sendMessage('https://cataas.com/cat/gif?c=' + Date.now());
});

async function sendMessage(content) {
  if (!supabase || els.composer.dataset.disabled === 'true') return false;
  const now = Date.now();
  if (now - lastSentAt < 700) return false; // freio anti flood
  lastSentAt = now;
  try {
    const { error } = await supabase.from('messages').insert({ author: myName, content });
    if (error) throw error;
    return true;
  } catch {
    lastSentAt = 0; // falhou: devolve a janela do freio pro retry imediato
    els.composer.classList.add('composer-err');
    setTimeout(() => els.composer.classList.remove('composer-err'), 1200);
    return false;
  }
}

/* ---------- links, imagens e youtube na mensagem ---------- */

const URL_RE = /https?:\/\/[^\s<>"']+/g;

function renderRich(text) {
  const fragment = document.createDocumentFragment();
  let media = null;
  let last = 0;

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    // solta pontuacao grudada no fim; ')' so cai se nao fechar um '(' da propria URL
    let trimmed = raw;
    while (trimmed.length) {
      const ch = trimmed[trimmed.length - 1];
      if ('.,!?;:]'.includes(ch)) { trimmed = trimmed.slice(0, -1); continue; }
      if (ch === ')') {
        const opens = (trimmed.match(/\(/g) || []).length;
        const closes = (trimmed.match(/\)/g) || []).length;
        if (closes > opens) { trimmed = trimmed.slice(0, -1); continue; }
      }
      break;
    }
    const rest = raw.slice(trimmed.length);

    if (match.index > last) {
      fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    last = match.index + raw.length;

    let url = null;
    try {
      const u = new URL(trimmed);
      if (u.protocol === 'http:' || u.protocol === 'https:') url = u;
    } catch {}

    if (!url) {
      fragment.appendChild(document.createTextNode(raw));
      continue;
    }

    const a = document.createElement('a');
    a.href = url.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
    a.textContent = trimmed;
    fragment.appendChild(a);
    if (rest) fragment.appendChild(document.createTextNode(rest));

    if (!media) {
      if (isImageUrl(url)) {
        media = mediaImage(url.href, url.href);
      } else {
        const yt = youtubeId(url);
        if (yt) media = mediaImage('https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg', url.href);
      }
    }
  }

  if (last < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(last)));
  }
  return { fragment, media };
}

function isImageUrl(u) {
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(u.pathname)) return true;
  return u.hostname === 'cataas.com';
}

function youtubeId(u) {
  const h = u.hostname.replace(/^www\./, '');
  let id = null;
  if (h === 'youtube.com' || h === 'm.youtube.com') id = u.searchParams.get('v');
  else if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  return id && /^[\w-]{6,15}$/.test(id) ? id : null;
}

function mediaImage(src, linkHref) {
  const a = document.createElement('a');
  a.className = 'msg-media';
  a.href = linkHref;
  a.target = '_blank';
  a.rel = 'noopener noreferrer nofollow';
  const img = document.createElement('img');
  img.src = src;
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.alt = 'mídia enviada no chat';
  img.addEventListener('error', () => a.remove());
  img.addEventListener('load', () => {
    const nearBottom =
      els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 160;
    if (nearBottom) scrollChat(true);
  });
  a.appendChild(img);
  return a;
}

/* ---------- call (Jitsi) ---------- */

els.joinCallBtn.addEventListener('click', joinCall);

async function joinCall() {
  els.joinCallBtn.disabled = true;
  els.joinCallBtn.textContent = 'Abrindo a call...';
  try {
    await loadJitsiScript();
    els.prejoin.hidden = true;
    els.jitsiMount.hidden = false;

    jitsiApi = new window.JitsiMeetExternalAPI('meet.jit.si', {
      roomName: JITSI_ROOM,
      parentNode: els.jitsiMount,
      width: '100%',
      height: '100%',
      userInfo: { displayName: myName },
      configOverwrite: {
        prejoinConfig: { enabled: false },
        startWithVideoMuted: true,
        disableDeepLinking: true,
        defaultLanguage: 'ptBR',
      },
    });

    jitsiApi.addListener('videoConferenceLeft', leaveCall);
    jitsiApi.addListener('readyToClose', leaveCall);
  } catch {
    leaveCall();
  }
}

function leaveCall() {
  try { jitsiApi?.dispose(); } catch {}
  jitsiApi = null;
  els.jitsiMount.innerHTML = '';
  els.jitsiMount.hidden = true;
  els.prejoin.hidden = false;
  els.joinCallBtn.disabled = false;
  els.joinCallBtn.innerHTML = '<i class="ph ph-phone-call" aria-hidden="true"></i> Entrar na call';
}

let jitsiScriptPromise = null;
function loadJitsiScript() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (jitsiScriptPromise) return jitsiScriptPromise;
  jitsiScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://meet.jit.si/external_api.js';
    s.onload = resolve;
    s.onerror = () => { jitsiScriptPromise = null; reject(new Error('jitsi script')); };
    document.head.appendChild(s);
  });
  return jitsiScriptPromise;
}

/* ---------- boot ---------- */

if (myName) {
  enterRoom();
} else {
  els.nameInput.focus();
}
