'use strict';

/* ============================================================
   MultiAccountIdle — configurações rápidas
   ============================================================ */
const DEFAULT_GAMES = [
  { name: 'Huntera', url: 'https://huntera.com.br/game' }
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_SLOTS = 6;
const TICK_MS = 5000;

/* Arranjos de telas: retângulos [x, y, largura, altura] em %.
   O 1º retângulo é sempre a conta principal; contas fora do arranjo
   viram miniaturas no dock (ou ficam ocultas, com hideDock). */
const T3 = 100 / 3;
const LAYOUTS = {
  solo:     { label: 'Tela única (outras contas ficam ocultas, rodando em segundo plano)', hideDock: true, rects: [[0, 0, 100, 100]] },
  duo:      { label: '2 lado a lado',         rects: [[0, 0, 50, 100], [50, 0, 50, 100]] },
  pilha:    { label: '2 empilhadas',          rects: [[0, 0, 100, 50], [0, 50, 100, 50]] },
  trio:     { label: 'Principal + 2 embaixo', rects: [[0, 0, 100, 55], [0, 55, 50, 45], [50, 55, 50, 45]] },
  trioLado: { label: 'Principal + 2 ao lado', rects: [[0, 0, 65, 100], [65, 0, 35, 50], [65, 50, 35, 50]] },
  grade:    { label: 'Grade 2×2',             rects: [[0, 0, 50, 50], [50, 0, 50, 50], [0, 50, 50, 50], [50, 50, 50, 50]] },
  colunas:  { label: '4 colunas',             rects: [[0, 0, 25, 100], [25, 0, 25, 100], [50, 0, 25, 100], [75, 0, 25, 100]] },
  foco:     { label: 'Principal + 3 ao lado', rects: [[0, 0, 70, 100], [70, 0, 30, T3], [70, T3, 30, T3], [70, 2 * T3, 30, T3]] },
  palco:    { label: 'Principal + 3 embaixo', rects: [[0, 0, 100, 62], [0, 62, T3, 38], [T3, 62, T3, 38], [2 * T3, 62, T3, 38]] },
  grade6:   { label: 'Grade 3×2 (6 contas)',  rects: [[0, 0, T3, 50], [T3, 0, T3, 50], [2 * T3, 0, T3, 50], [0, 50, T3, 50], [T3, 50, T3, 50], [2 * T3, 50, T3, 50]] }
};

/* ============================================================
   Script injetado dentro de cada conta (roda na página do jogo).
   - __mfSetFps(n): limita o requestAnimationFrame a n quadros/s (0 = sem limite)
   - __mfScrape(): lê Capacidade / Stamina / Lv / XP% do texto da página.
     Os padrões (regex) foram feitos para o Huntera; para outros jogos,
     ajuste aqui (o painel ECO mostra "—" quando não encontra).
   ============================================================ */
function mfPageBootstrap() {
  if (window.__mfReady) return;
  window.__mfReady = true;

  var nativeRAF = window.requestAnimationFrame.bind(window);
  var cap = 0, last = 0;
  window.__mfSetFps = function (f) { cap = Number(f) || 0; };
  window.requestAnimationFrame = function (cb) {
    return nativeRAF(function frame(ts) {
      if (!cap || ts - last >= (1000 / cap) - 1) { last = ts; cb(ts); }
      else nativeRAF(frame);
    });
  };

  function near(txt, anchor, span, re) {
    var i = txt.search(anchor);
    if (i < 0) return null;
    var m = txt.slice(i, i + span).match(re);
    return m ? m[1] : null;
  }

  window.__mfScrape = function () {
    try {
      var t = (document.body && document.body.innerText) || '';
      var lv = t.match(/\blv\.?\s*:?\s*(\d+)/i);
      return {
        cap: near(t, /Capacidade/i, 60, /([\d.,]+\s*oz)/i),
        sta: near(t, /Stamina/i, 60, /(\d{1,2}:\d{2}\s*h?)/i),
        lv: lv ? Number(lv[1]) : null,
        xp: near(t, /Experi[êe]ncia/i, 120, /([\d.,]+\s*%)/) ||
            near(t, /\bEXP\b/i, 120, /([\d.,]+\s*%)/),
        disc: /(voc[êe] foi desconectad|desconectado do servidor|connection lost|disconnected from|conex[ãa]o perdida)/i.test(t)
      };
    } catch (e) { return null; }
  };
}
const INJECT_SRC = '(' + mfPageBootstrap.toString() + ')();';

/* ============================================================
   Estado persistido (localStorage)
   ============================================================ */
function defaultSlot(n) {
  return { eco: false, muted: false, name: 'Conta ' + n };
}

const DEFAULTS = {
  layout: 'grade',
  principal: 1,
  ecoFps: 15,
  zoom: 1,
  slotCount: 4,
  gameUrl: DEFAULT_GAMES[0].url,
  games: DEFAULT_GAMES,
  autoEco: 'off',          // off | others | idle
  autoEcoMinutes: 5,
  autoReload: true,
  notifStamina: true,
  notifStaminaMin: 60,
  notifLevel: true,
  notifDisc: true,
  profiles: [],
  slots: {}
};
for (let i = 1; i <= MAX_SLOTS; i++) DEFAULTS.slots[i] = defaultSlot(i);

let state = loadState();

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem('multiaccountidle') || 'null');
    if (!raw) return structuredClone(DEFAULTS);
    const s = Object.assign(structuredClone(DEFAULTS), raw);
    s.slots = {};
    for (let i = 1; i <= MAX_SLOTS; i++) {
      s.slots[i] = Object.assign(defaultSlot(i), (raw.slots || {})[i] || {});
    }
    if (!Array.isArray(s.games) || !s.games.length) s.games = structuredClone(DEFAULT_GAMES);
    s.games = s.games.filter(g => g && typeof g.name === 'string' && typeof g.url === 'string');
    if (!s.games.some(g => g.url === DEFAULT_GAMES[0].url)) s.games.unshift(structuredClone(DEFAULT_GAMES)[0]);
    if (typeof s.gameUrl !== 'string' || !s.gameUrl) s.gameUrl = DEFAULT_GAMES[0].url;
    // Migração de versões antigas, onde o layout era um número (1–4)
    if (typeof s.layout === 'number') s.layout = { 1: 'solo', 2: 'duo', 3: 'trio', 4: 'grade' }[s.layout] || 'grade';
    if (!LAYOUTS[s.layout]) s.layout = 'grade';
    s.slotCount = Math.max(1, Math.min(MAX_SLOTS, Number(s.slotCount) || 4));
    if (s.principal > s.slotCount) s.principal = 1;
    if (!['off', 'others', 'idle'].includes(s.autoEco)) s.autoEco = 'off';
    if (!Array.isArray(s.profiles)) s.profiles = [];
    return s;
  } catch (e) {
    return structuredClone(DEFAULTS);
  }
}
function saveState() { localStorage.setItem('multiaccountidle', JSON.stringify(state)); }

/* ============================================================
   Notificações do Windows
   ============================================================ */
function notify(title, body) {
  try { new Notification(title, { body }); } catch (e) {}
}

/* ============================================================
   Painéis (uma webview por conta, cada uma na sua partição)
   ============================================================ */
const grid = document.getElementById('grid');
const chipsBox = document.getElementById('chips');
let SLOTS = [];
const panes = {};
const chipEls = {};

function slotName(slot) { return state.slots[slot].name || ('Conta ' + slot); }

function createPane(slot) {
  const el = document.createElement('section');
  el.className = 'pane';
  el.dataset.slot = slot;
  el.innerHTML = `
    <div class="phead">
      <span class="pnum">0${slot}</span>
      <span class="pname"></span>
      <span class="pstatus">Carregando…</span>
      <span class="spacer"></span>
      <button class="pb b-star" title="Tornar principal">★</button>
      <button class="pb b-eco" title="Modo economia">ECO</button>
      <button class="pb b-mute" title="Som ligado/desligado">🔊</button>
      <button class="pb b-reload" title="Recarregar">⟳</button>
      <button class="pb b-clear" title="Limpar sessão (deslogar esta conta)">🧹</button>
    </div>
    <div class="pbody">
      <webview partition="persist:conta${slot}" src="${state.gameUrl}" allowpopups
        useragent="${UA}"
        webpreferences="backgroundThrottling=no,spellcheck=no"></webview>
      <div class="eco-overlay">
        <div class="eco-emblem">🌿</div>
        <h2></h2>
        <p class="eco-sub">JOGO ATIVO EM SEGUNDO PLANO · <span class="eco-fps">${state.ecoFps}</span> FPS</p>
        <div class="eco-stats">
          <div class="stat"><label>Capacidade</label><b class="s-cap">—</b></div>
          <div class="stat"><label>Stamina</label><b class="s-sta">—</b></div>
        </div>
        <div class="stat wide">
          <label>Experiência · Lv <span class="s-lv">—</span></label>
          <div class="xpbar"><i class="s-xpi"></i></div>
          <b class="s-xp">—</b>
        </div>
        <p class="eco-hint">← Arraste para voltar</p>
        <input type="range" class="eco-return" min="0" max="100" value="0">
      </div>
    </div>
    <div class="dock-label"></div>`;
  grid.appendChild(el);

  const p = panes[slot] = {
    el,
    wv: el.querySelector('webview'),
    ready: false,
    status: 'Carregando…',
    lastPrincipalAt: Date.now(),
    failCount: 0,
    lastLv: null,
    staminaNotified: false,
    lastDiscNotify: 0,
    lastDiscReload: 0,
    statusEl: el.querySelector('.pstatus'),
    nameEl: el.querySelector('.pname'),
    dockEl: el.querySelector('.dock-label'),
    ecoTitleEl: el.querySelector('.eco-overlay h2'),
    slider: el.querySelector('.eco-return'),
    ecoFpsEl: el.querySelector('.eco-fps'),
    muteBtn: el.querySelector('.b-mute'),
    sCap: el.querySelector('.s-cap'),
    sSta: el.querySelector('.s-sta'),
    sLv: el.querySelector('.s-lv'),
    sXp: el.querySelector('.s-xp'),
    sXpi: el.querySelector('.s-xpi')
  };

  if (state.slots[slot].eco) el.classList.add('eco');

  /* ---- eventos da webview ---- */
  p.wv.addEventListener('dom-ready', () => {
    p.ready = true;
    p.wv.executeJavaScript(INJECT_SRC).catch(() => {});
    try { p.wv.setZoomFactor(state.zoom); } catch (e) {}
    applyEcoToGuest(slot);
    setStatus(slot, 'Pronta');
  });
  p.wv.addEventListener('did-start-loading', () => setStatus(slot, 'Carregando…'));
  p.wv.addEventListener('did-finish-load', () => { p.failCount = 0; });
  p.wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3 || !e.isMainFrame) return;
    setStatus(slot, 'Erro ao carregar');
    notifyDisc(slot, 'erro ao carregar a página');
    if (state.autoReload) {
      const delay = Math.min(60, 5 * Math.pow(2, p.failCount)) * 1000;
      p.failCount++;
      setTimeout(() => { if (p.ready && state.autoReload) { try { p.wv.reload(); } catch (er) {} } }, delay);
    }
  });
  const onGone = () => {
    setStatus(slot, 'Travou');
    notifyDisc(slot, 'a conta travou');
    if (state.autoReload) setTimeout(() => { try { p.wv.reload(); } catch (er) {} }, 3000);
  };
  p.wv.addEventListener('render-process-gone', onGone);
  p.wv.addEventListener('crashed', onGone);

  /* ---- botões do cabeçalho ---- */
  el.querySelector('.b-star').addEventListener('click', () => setPrincipal(slot));
  el.querySelector('.b-eco').addEventListener('click', () => setEco(slot, !state.slots[slot].eco));
  p.muteBtn.addEventListener('click', () => {
    const s = state.slots[slot];
    s.muted = !s.muted;
    saveState();
    p.muteBtn.textContent = s.muted ? '🔇' : '🔊';
    applyEcoToGuest(slot);
  });
  el.querySelector('.b-reload').addEventListener('click', () => { if (p.ready) p.wv.reload(); });
  el.querySelector('.b-clear').addEventListener('click', async () => {
    const ok = await window.forja.clearPartition(`persist:conta${slot}`);
    if (ok && p.ready) p.wv.loadURL(state.gameUrl);
  });

  /* ---- slider "arraste para voltar" ---- */
  p.slider.addEventListener('input', () => {
    if (+p.slider.value >= 97) setEco(slot, false);
  });
  p.slider.addEventListener('change', () => {
    if (state.slots[slot].eco) p.slider.value = 0;
  });

  /* ---- clicar numa conta no dock traz ela de volta ---- */
  p.dockEl.addEventListener('click', () => setPrincipal(slot));

  p.muteBtn.textContent = state.slots[slot].muted ? '🔇' : '🔊';
  refreshNames(slot);
}

function destroyPane(slot) {
  const p = panes[slot];
  if (!p) return;
  p.el.remove();
  delete panes[slot];
}

function withGuest(slot, fn) {
  const p = panes[slot];
  if (p && p.ready) { try { fn(p.wv); } catch (e) {} }
}

/* ============================================================
   Chips da barra superior (dinâmicos, renomeáveis)
   ============================================================ */
function buildChips() {
  chipsBox.innerHTML = '';
  for (const k of Object.keys(chipEls)) delete chipEls[k];
  for (const slot of SLOTS) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.dataset.slot = slot;
    chip.title = 'Clique: tornar principal · Duplo clique: renomear';
    chip.innerHTML = `
      <span class="cnum">0${slot}</span>
      <span class="cbody"><b></b><small class="cstatus">Carregando…</small></span>
      <span class="ceco">ECO</span>`;
    chip.addEventListener('click', () => setPrincipal(slot));
    chip.addEventListener('dblclick', async () => {
      const novo = await askText('Renomear conta', slotName(slot));
      if (novo && novo.trim()) {
        state.slots[slot].name = novo.trim().slice(0, 20);
        saveState();
        refreshNames(slot);
      }
    });
    chip.querySelector('.ceco').addEventListener('click', (e) => {
      e.stopPropagation();
      setEco(slot, !state.slots[slot].eco);
    });
    chipsBox.appendChild(chip);
    chipEls[slot] = chip;
    refreshNames(slot);
    refreshStatusUI(slot);
  }
}

function refreshNames(slot) {
  const name = slotName(slot);
  const p = panes[slot];
  if (p) {
    p.nameEl.textContent = name;
    p.dockEl.textContent = name;
    p.ecoTitleEl.textContent = `${name} em economia`;
  }
  const chip = chipEls[slot];
  if (chip) chip.querySelector('.cbody b').textContent = name;
}

/* ============================================================
   Status (painel + chip da barra superior)
   ============================================================ */
function setStatus(slot, txt) {
  if (!panes[slot]) return;
  panes[slot].status = txt;
  refreshStatusUI(slot);
}

function refreshStatusUI(slot) {
  const p = panes[slot];
  const chip = chipEls[slot];
  if (!p) return;
  const eco = state.slots[slot].eco;
  const txt = eco ? 'ECO ON' : p.status;
  p.statusEl.textContent = txt;
  if (chip) {
    chip.querySelector('.cstatus').textContent = txt;
    chip.querySelector('.ceco').classList.toggle('on', eco);
    chip.classList.toggle('principal', slot === state.principal);
  }
}

/* ============================================================
   Número de contas
   ============================================================ */
function rebuildSlots() {
  const wanted = [];
  for (let i = 1; i <= state.slotCount; i++) wanted.push(i);
  for (const slot of Object.keys(panes).map(Number)) {
    if (!wanted.includes(slot)) destroyPane(slot);
  }
  for (const slot of wanted) {
    if (!panes[slot]) createPane(slot);
  }
  SLOTS = wanted;
  if (!SLOTS.includes(state.principal)) state.principal = SLOTS[0];
  buildChips();
}

function setSlotCount(n) {
  n = Math.max(1, Math.min(MAX_SLOTS, Number(n) || 4));
  if (n === state.slotCount) return;
  state.slotCount = n;
  saveState();
  rebuildSlots();
  applyLayout();
}

/* ============================================================
   Troca de jogo
   ============================================================ */
const gameSelect = document.getElementById('gameSelect');

function fillGameSelect() {
  gameSelect.innerHTML = '';
  for (const g of state.games) {
    const o = document.createElement('option');
    o.value = g.url;
    o.textContent = g.name;
    gameSelect.appendChild(o);
  }
  gameSelect.value = state.gameUrl;
  if (gameSelect.value !== state.gameUrl) {
    const o = document.createElement('option');
    o.value = state.gameUrl;
    o.textContent = '(atual)';
    gameSelect.appendChild(o);
    gameSelect.value = state.gameUrl;
  }
}

function setGame(url) {
  state.gameUrl = url;
  saveState();
  SLOTS.forEach(slot => {
    const p = panes[slot];
    if (!p) return;
    if (p.ready) { try { p.wv.loadURL(url); } catch (e) {} }
    else p.wv.setAttribute('src', url);
  });
}

function wireGameControls() {
  const modal = document.getElementById('modal');
  const mName = document.getElementById('mName');
  const mUrl = document.getElementById('mUrl');

  fillGameSelect();
  gameSelect.addEventListener('change', () => setGame(gameSelect.value));

  const openModal = () => {
    mName.value = '';
    mUrl.value = '';
    modal.classList.remove('hidden');
    mName.focus();
  };
  const closeModal = () => modal.classList.add('hidden');

  const addGame = () => {
    let name = mName.value.trim();
    let url = mUrl.value.trim();
    if (!url) { mUrl.focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let parsed;
    try { parsed = new URL(url); } catch (e) { alert('URL inválida.'); return; }
    if (!name) name = parsed.hostname.replace(/^www\./, '');
    if (state.games.some(g => g.url === url)) { alert('Esse jogo já está na lista.'); return; }
    state.games.push({ name, url });
    saveState();
    setGame(url);
    fillGameSelect();
    closeModal();
  };

  document.getElementById('btnAddGame').addEventListener('click', openModal);
  document.getElementById('mCancel').addEventListener('click', closeModal);
  document.getElementById('mOk').addEventListener('click', addGame);
  [mName, mUrl].forEach(inp => inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addGame();
    if (e.key === 'Escape') closeModal();
  }));

  document.getElementById('btnDelGame').addEventListener('click', () => {
    const url = gameSelect.value;
    if (url === DEFAULT_GAMES[0].url) { alert('O jogo padrão não pode ser removido.'); return; }
    const g = state.games.find(x => x.url === url);
    if (!g) return;
    if (!confirm(`Remover "${g.name}" da lista?`)) return;
    state.games = state.games.filter(x => x.url !== url);
    saveState();
    if (state.gameUrl === url) setGame(DEFAULT_GAMES[0].url);
    fillGameSelect();
  });
}

/* ============================================================
   Modal genérico de texto (renomear conta, nome de perfil)
   ============================================================ */
function askText(title, initial) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalText');
    const input = document.getElementById('mtInput');
    document.getElementById('mtTitle').textContent = title;
    input.value = initial || '';
    modal.classList.remove('hidden');
    input.focus();
    input.select();

    const done = (val) => {
      modal.classList.add('hidden');
      document.getElementById('mtOk').removeEventListener('click', ok);
      document.getElementById('mtCancel').removeEventListener('click', cancel);
      input.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const ok = () => done(input.value);
    const cancel = () => done(null);
    const onKey = (e) => {
      if (e.key === 'Enter') ok();
      if (e.key === 'Escape') cancel();
    };
    document.getElementById('mtOk').addEventListener('click', ok);
    document.getElementById('mtCancel').addEventListener('click', cancel);
    input.addEventListener('keydown', onKey);
  });
}

/* ============================================================
   Modo economia
   ============================================================ */
function setEco(slot, on) {
  const s = state.slots[slot];
  if (!panes[slot] || s.eco === on) return;
  s.eco = on;
  saveState();
  panes[slot].el.classList.toggle('eco', on);
  applyEcoToGuest(slot);
  if (!on) {
    clearEcoStats(slot);
    panes[slot].slider.value = 0;
  }
  refreshStatusUI(slot);
}

function applyEcoToGuest(slot) {
  const s = state.slots[slot];
  withGuest(slot, (wv) => {
    wv.executeJavaScript(`window.__mfSetFps && window.__mfSetFps(${s.eco ? state.ecoFps : 0})`).catch(() => {});
    wv.setAudioMuted(s.eco ? true : s.muted);
  });
}

function clearEcoStats(slot) {
  const p = panes[slot];
  p.sCap.textContent = '—';
  p.sSta.textContent = '—';
  p.sLv.textContent = '—';
  p.sXp.textContent = '—';
  p.sXpi.style.width = '0%';
}

function renderEcoStats(slot, d) {
  const p = panes[slot];
  if (!p || !d) return;
  p.sCap.textContent = d.cap || '—';
  p.sSta.textContent = d.sta || '—';
  p.sLv.textContent = (d.lv !== null && d.lv !== undefined) ? d.lv : '—';
  p.sXp.textContent = d.xp || '—';
  const pct = d.xp ? parseFloat(String(d.xp).replace(',', '.')) : 0;
  p.sXpi.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
}

/* ============================================================
   Monitor: scraping, notificações, eco automático, reconexão
   ============================================================ */
function staminaToMinutes(sta) {
  const m = String(sta || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function notifyDisc(slot, motivo) {
  const p = panes[slot];
  if (!p || !state.notifDisc) return;
  const now = Date.now();
  if (now - p.lastDiscNotify < 120000) return;
  p.lastDiscNotify = now;
  notify('MultiAccountIdle', `${slotName(slot)}: ${motivo}.`);
}

function handleScrape(slot, d) {
  const p = panes[slot];
  if (!p || !d) return;

  if (state.slots[slot].eco) renderEcoStats(slot, d);

  // stamina baixa
  const mins = staminaToMinutes(d.sta);
  if (mins !== null && state.notifStamina) {
    if (mins < state.notifStaminaMin && !p.staminaNotified) {
      p.staminaNotified = true;
      notify('MultiAccountIdle', `${slotName(slot)}: stamina baixa (${d.sta}).`);
    } else if (mins > state.notifStaminaMin + 30) {
      p.staminaNotified = false;
    }
  }

  // subiu de nível
  if (d.lv !== null && d.lv !== undefined) {
    if (p.lastLv !== null && state.notifLevel && d.lv > p.lastLv) {
      notify('MultiAccountIdle', `${slotName(slot)}: subiu para o nível ${d.lv}! 🎉`);
    }
    p.lastLv = d.lv;
  }

  // desconectado (texto na página)
  if (d.disc) {
    setStatus(slot, 'Desconectada');
    notifyDisc(slot, 'parece desconectada');
    if (state.autoReload && Date.now() - p.lastDiscReload > 120000) {
      p.lastDiscReload = Date.now();
      try { p.wv.reload(); } catch (e) {}
    }
  }
}

function tick() {
  const now = Date.now();
  for (const slot of SLOTS) {
    const p = panes[slot];
    if (!p || !p.ready) continue;

    // eco automático por inatividade
    if (state.autoEco === 'idle' && slot !== state.principal && !state.slots[slot].eco &&
        now - p.lastPrincipalAt > state.autoEcoMinutes * 60000) {
      setEco(slot, true);
    }

    p.wv.executeJavaScript('window.__mfScrape ? window.__mfScrape() : null')
      .then((d) => handleScrape(slot, d))
      .catch(() => {});
  }
}

/* ============================================================
   Layout (arranjos + dock com miniaturas ao vivo)
   ============================================================ */
function setPrincipal(slot) {
  if (!SLOTS.includes(slot)) return;
  const prev = state.principal;
  state.principal = slot;
  if (panes[slot]) panes[slot].lastPrincipalAt = Date.now();
  if (prev !== slot && panes[prev]) panes[prev].lastPrincipalAt = Date.now();
  saveState();
  if (state.autoEco !== 'off' && state.slots[slot].eco) setEco(slot, false);
  if (state.autoEco === 'others') {
    SLOTS.forEach(s2 => { if (s2 !== slot && !state.slots[s2].eco) setEco(s2, true); });
  }
  applyLayout();
}

function applyLayout() {
  const lay = LAYOUTS[state.layout] || LAYOUTS.grade;
  const order = [state.principal, ...SLOTS.filter(s => s !== state.principal)];
  const shown = order.slice(0, lay.rects.length);
  const docked = order.slice(lay.rects.length);

  shown.forEach((slot, i) => {
    const el = panes[slot].el;
    const [x, y, w, h] = lay.rects[i];
    el.classList.remove('docked', 'ghost');
    el.classList.add('shown');
    el.style.left = x + '%';
    el.style.top = y + '%';
    el.style.width = w + '%';
    el.style.height = h + '%';
    el.style.right = '';
    el.style.bottom = '';
  });
  docked.forEach((slot, i) => {
    const el = panes[slot].el;
    el.classList.remove('shown');
    el.style.left = '';
    el.style.top = '';
    el.style.width = '';
    el.style.height = '';
    if (lay.hideDock) {
      // conta invisível, mas ainda "visível" para o Chromium: o jogo
      // continua renderizando minúsculo e não é pausado/desconectado
      el.classList.remove('docked');
      el.classList.add('ghost');
      el.style.bottom = '2px';
      el.style.right = (2 + i * 4) + 'px';
    } else {
      el.classList.remove('ghost');
      el.classList.add('docked');
      el.style.bottom = '12px';
      el.style.right = (12 + i * 218) + 'px';
    }
  });

  SLOTS.forEach(s => {
    panes[s].el.classList.toggle('principal', s === state.principal);
    refreshStatusUI(s);
  });
  document.querySelectorAll('.lay').forEach(b => {
    b.classList.toggle('active', b.dataset.lay === state.layout);
  });
}

/* Botões de arranjo com miniatura do formato */
function buildLayoutButtons() {
  const box = document.getElementById('layouts');
  for (const [key, lay] of Object.entries(LAYOUTS)) {
    const b = document.createElement('button');
    b.className = 'tbtn lay';
    b.dataset.lay = key;
    b.title = lay.label;
    const mini = document.createElement('span');
    mini.className = 'mini';
    for (const [x, y, w, h] of lay.rects) {
      const i = document.createElement('i');
      i.style.left = x + '%';
      i.style.top = y + '%';
      i.style.width = w + '%';
      i.style.height = h + '%';
      mini.appendChild(i);
    }
    b.appendChild(mini);
    b.addEventListener('click', () => {
      state.layout = key;
      saveState();
      applyLayout();
    });
    box.appendChild(b);
  }
}

/* ============================================================
   Painel de configurações
   ============================================================ */
function wireConfig() {
  const panel = document.getElementById('cfgPanel');
  const cfgSlots = document.getElementById('cfgSlots');
  const cfgAutoEco = document.getElementById('cfgAutoEco');
  const cfgAutoEcoMin = document.getElementById('cfgAutoEcoMin');
  const cfgAutoReload = document.getElementById('cfgAutoReload');
  const cfgNotifSta = document.getElementById('cfgNotifSta');
  const cfgNotifStaMin = document.getElementById('cfgNotifStaMin');
  const cfgNotifLv = document.getElementById('cfgNotifLv');
  const cfgNotifDisc = document.getElementById('cfgNotifDisc');
  const cfgProfiles = document.getElementById('cfgProfiles');

  const syncUI = () => {
    cfgSlots.value = state.slotCount;
    cfgAutoEco.value = state.autoEco;
    cfgAutoEcoMin.value = state.autoEcoMinutes;
    cfgAutoEcoMin.disabled = state.autoEco !== 'idle';
    cfgAutoReload.checked = state.autoReload;
    cfgNotifSta.checked = state.notifStamina;
    cfgNotifStaMin.value = state.notifStaminaMin;
    cfgNotifLv.checked = state.notifLevel;
    cfgNotifDisc.checked = state.notifDisc;
    fillProfiles();
  };

  function fillProfiles() {
    cfgProfiles.innerHTML = '';
    if (!state.profiles.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = '(nenhum perfil salvo)';
      cfgProfiles.appendChild(o);
      return;
    }
    state.profiles.forEach((pr, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = pr.name;
      cfgProfiles.appendChild(o);
    });
  }

  document.getElementById('btnCfg').addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) syncUI();
  });
  document.getElementById('cfgClose').addEventListener('click', () => panel.classList.add('hidden'));

  cfgSlots.addEventListener('change', () => setSlotCount(cfgSlots.value));
  cfgAutoEco.addEventListener('change', () => {
    state.autoEco = cfgAutoEco.value;
    saveState();
    cfgAutoEcoMin.disabled = state.autoEco !== 'idle';
    if (state.autoEco === 'others') {
      SLOTS.forEach(s => { if (s !== state.principal && !state.slots[s].eco) setEco(s, true); });
    }
  });
  cfgAutoEcoMin.addEventListener('change', () => {
    state.autoEcoMinutes = Math.max(1, Math.min(120, Number(cfgAutoEcoMin.value) || 5));
    cfgAutoEcoMin.value = state.autoEcoMinutes;
    saveState();
  });
  cfgAutoReload.addEventListener('change', () => { state.autoReload = cfgAutoReload.checked; saveState(); });
  cfgNotifSta.addEventListener('change', () => { state.notifStamina = cfgNotifSta.checked; saveState(); });
  cfgNotifStaMin.addEventListener('change', () => {
    state.notifStaminaMin = Math.max(5, Math.min(900, Number(cfgNotifStaMin.value) || 60));
    cfgNotifStaMin.value = state.notifStaminaMin;
    saveState();
  });
  cfgNotifLv.addEventListener('change', () => { state.notifLevel = cfgNotifLv.checked; saveState(); });
  cfgNotifDisc.addEventListener('change', () => { state.notifDisc = cfgNotifDisc.checked; saveState(); });

  document.getElementById('cfgProfSave').addEventListener('click', async () => {
    const nome = await askText('Nome do perfil', '');
    if (!nome || !nome.trim()) return;
    const prof = {
      name: nome.trim().slice(0, 24),
      gameUrl: state.gameUrl,
      layout: state.layout,
      principal: state.principal,
      ecoFps: state.ecoFps,
      zoom: state.zoom,
      slotCount: state.slotCount,
      eco: Object.fromEntries(SLOTS.map(s => [s, !!state.slots[s].eco]))
    };
    const idx = state.profiles.findIndex(pr => pr.name === prof.name);
    if (idx >= 0) state.profiles[idx] = prof;
    else state.profiles.push(prof);
    saveState();
    fillProfiles();
    cfgProfiles.value = String(state.profiles.findIndex(pr => pr.name === prof.name));
  });

  document.getElementById('cfgProfApply').addEventListener('click', () => {
    const pr = state.profiles[Number(cfgProfiles.value)];
    if (!pr) return;
    setSlotCount(pr.slotCount || 4);
    if (LAYOUTS[pr.layout]) state.layout = pr.layout;
    state.ecoFps = Math.max(5, Math.min(30, Number(pr.ecoFps) || 15));
    state.zoom = Math.max(0.3, Math.min(2, Number(pr.zoom) || 1));
    if (SLOTS.includes(pr.principal)) state.principal = pr.principal;
    saveState();
    SLOTS.forEach(s => {
      setEco(s, !!(pr.eco && pr.eco[s]));
      withGuest(s, wv => wv.setZoomFactor(state.zoom));
    });
    if (pr.gameUrl && pr.gameUrl !== state.gameUrl) { setGame(pr.gameUrl); fillGameSelect(); }
    document.getElementById('ecoFps').value = state.ecoFps;
    document.getElementById('ecoFpsLabel').textContent = state.ecoFps + ' FPS';
    applyLayout();
    syncUI();
  });

  document.getElementById('cfgProfDel').addEventListener('click', () => {
    const idx = Number(cfgProfiles.value);
    const pr = state.profiles[idx];
    if (!pr) return;
    if (!confirm(`Excluir o perfil "${pr.name}"?`)) return;
    state.profiles.splice(idx, 1);
    saveState();
    fillProfiles();
  });
}

/* ============================================================
   Barra superior
   ============================================================ */
function wireTopbar() {
  const ecoFps = document.getElementById('ecoFps');
  const ecoFpsLabel = document.getElementById('ecoFpsLabel');
  ecoFps.value = state.ecoFps;
  ecoFpsLabel.textContent = state.ecoFps + ' FPS';
  ecoFps.addEventListener('input', () => {
    state.ecoFps = +ecoFps.value;
    saveState();
    ecoFpsLabel.textContent = state.ecoFps + ' FPS';
    SLOTS.forEach(s => {
      panes[s].ecoFpsEl.textContent = state.ecoFps;
      if (state.slots[s].eco) applyEcoToGuest(s);
    });
  });

  document.getElementById('btnHome').addEventListener('click', () => {
    withGuest(state.principal, wv => wv.loadURL(state.gameUrl));
  });
  document.getElementById('btnReload').addEventListener('click', () => {
    withGuest(state.principal, wv => wv.reload());
  });
  document.getElementById('btnZoomOut').addEventListener('click', () => setZoom(state.zoom - 0.1));
  document.getElementById('btnZoomIn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  document.getElementById('btnFull').addEventListener('click', () => window.forja.toggleFullscreen());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11') { e.preventDefault(); window.forja.toggleFullscreen(); }
    if (e.ctrlKey && ['1', '2', '3', '4', '5', '6'].includes(e.key)) setPrincipal(+e.key);
  });
}

function setZoom(z) {
  state.zoom = Math.round(Math.max(0.3, Math.min(2, z)) * 10) / 10;
  saveState();
  SLOTS.forEach(s => withGuest(s, wv => wv.setZoomFactor(state.zoom)));
}

/* ============================================================
   Inicialização
   ============================================================ */
wireTopbar();
wireGameControls();
wireConfig();
buildLayoutButtons();
rebuildSlots();
if (state.autoEco === 'others') {
  SLOTS.forEach(s => { if (s !== state.principal && !state.slots[s].eco) setEco(s, true); });
}
applyLayout();
setInterval(tick, TICK_MS);
