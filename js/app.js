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
};

const NAME_KEY = 'focsecord:name';
let myName = (localStorage.getItem(NAME_KEY) || '').trim();
let supabase = null;
let roomChannel = null;
let jitsiApi = null;
let lastSentAt = 0;
let messageCount = 0;

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
      (payload) => addMessage(payload.new, true)
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
  els.chatCount.textContent = n === 1 ? 'so tu por aqui' : n + ' na sala';
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
    messageCount = data.length;
    els.chatEmpty.hidden = messageCount > 0;
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
  els.chatEmpty.hidden = true;
  messageCount++;

  const wrap = document.createElement('div');
  wrap.className = 'msg';
  if (!live) wrap.style.animation = 'none';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const author = document.createElement('span');
  author.className = 'msg-author';
  author.textContent = m.author || 'alguem';
  author.style.color = `hsl(${hueFor(m.author || '')} 50% 74%)`;

  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = formatTime(m.created_at);

  meta.append(author, time);

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = m.content;

  wrap.append(meta, body);

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
  if (!content || !supabase) return;
  const now = Date.now();
  if (now - lastSentAt < 700) return; // freio anti flood
  lastSentAt = now;

  els.msgInput.value = '';
  try {
    const { error } = await supabase.from('messages').insert({ author: myName, content });
    if (error) throw error;
  } catch {
    els.msgInput.value = content; // devolve pro campo se falhou
  }
  els.msgInput.focus();
});

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
