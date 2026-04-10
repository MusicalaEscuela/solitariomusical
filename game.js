'use strict';

const NOTAS = [
  'Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯',
  'Sol', 'Sol♯', 'La', 'La♯', 'Si', 'Do↑'
];

const PALOS = [
  { sym: '🎹', tipo: 'oscuro', nombre: 'Teclas', clase: 'funda-teclas' },
  { sym: '🥁', tipo: 'oscuro', nombre: 'Percusión', clase: 'funda-percusion' },
  { sym: '🎸', tipo: 'claro', nombre: 'Cuerdas', clase: 'funda-cuerdas' },
  { sym: '🎺', tipo: 'claro', nombre: 'Vientos', clase: 'funda-vientos' }
];

const PUNTAJES = {
  ROBAR_MAZO: 2,
  VOLTEAR: 5,
  MOVER_TABLERO: 5,
  MOVER_FUNDA: 10,
  DEVOLVER_FUNDA: 5,
  RECICLAR: 15
};

const MENSAJES = {
  SOLO_UNA_A_FUNDA: 'Solo una carta a la vez puede subir a la fundación.',
  MOV_INVALIDO: 'Ese movimiento no encaja.',
  SOLO_MAXIMA_VACIA: 'Solo Do↑ abre una columna vacía.',
  RECICLADO: 'El descarte volvió al mazo.',
  STATS_REINICIADAS: 'Historial reiniciado en este dispositivo.',
  AYUDA: 'Arrastra cartas o tócalas. También puedes bajar la carta superior de una fundación al tablero.'
};

const STORAGE_KEY = 'musicala_solitario_stats_v5';

const DEFAULT_STATS = {
  bestScore: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestTimeSeconds: null,
  lastScore: 0
};

const LAYOUT = {
  MIN_BOARD_WIDTH: 320,
  MIN_CARD_WIDTH: 52,
  MAX_CARD_WIDTH: 136,
  MIN_CARD_HEIGHT: 76,
  MAX_CARD_HEIGHT: 188,
  CARD_RATIO: 1.42,
  MIN_GAP: 4,
  MAX_GAP: 10,
  MIN_FACE_OFFSET: 18,
  MAX_FACE_OFFSET: 36,
  MIN_BACK_OFFSET: 12,
  MAX_BACK_OFFSET: 22
};

const DRAG_THRESHOLD = 8;

let mazo = [];
let descarte = [];
let fundas = [[], [], [], []];
let tablero = [];
let sel = null;

let puntos = 0;
let movimientos = 0;
let partidaRegistrada = false;
let partidaGanada = false;

let inicioPartidaMs = Date.now();
let relojTimer = null;
let toastTimer = null;
let resizeRaf = null;
let resizeObserver = null;

let stats = cargarEstadisticas();

let CH = 76;
let OD = 14;
let OU = 24;

let dragState = null;
let dragClickSuppressUntil = 0;

const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function getEl(id) {
  return document.getElementById(id);
}

function q(selector, root = document) {
  return root.querySelector(selector);
}

function setText(id, value) {
  const el = getEl(id);
  if (el) el.textContent = value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatearNumero(valor) {
  return Number(valor || 0).toLocaleString('es-CO');
}

function formatearTiempo(segundos) {
  const total = Math.max(0, Number(segundos || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function cartaToTexto(carta) {
  if (!carta) return '';
  return `${NOTAS[carta.n]} ${PALOS[carta.p].sym}`;
}

function limpiarSeleccion() {
  sel = null;
}

function getElapsedSeconds() {
  return Math.max(0, Math.floor((Date.now() - inicioPartidaMs) / 1000));
}

function getViewportHeight() {
  return Math.floor(
    window.visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight ||
    800
  );
}

function actualizarOverlayVictoria() {
  setText('pts-finales', formatearNumero(puntos));
  setText('tiempo-final', formatearTiempo(getElapsedSeconds()));
  setText('victorias-total', formatearNumero(stats.gamesWon));
}

function sumarPuntos(valor) {
  puntos += valor;
  if (puntos < 0) puntos = 0;

  if (puntos > stats.bestScore) {
    stats.bestScore = puntos;
    persistirEstadisticas();
  }

  actualizarHud();
}

function registrarInicioPartida() {
  if (partidaRegistrada) return;
  partidaRegistrada = true;
  stats.gamesPlayed += 1;
  persistirEstadisticas();
  actualizarHud();
}

function registrarMovimiento() {
  registrarInicioPartida();
  movimientos += 1;
  actualizarHud();
}

function actualizarHud() {
  setText('puntos', formatearNumero(puntos));
  setText('mejor-puntaje', formatearNumero(stats.bestScore));
  setText('partidas-ganadas', formatearNumero(stats.gamesWon));
  setText('racha-actual', formatearNumero(stats.currentStreak));
  setText('movimientos', formatearNumero(movimientos));
  setText('tiempo', formatearTiempo(getElapsedSeconds()));
  setText(
    'mejor-tiempo',
    stats.bestTimeSeconds == null ? '--:--' : formatearTiempo(stats.bestTimeSeconds)
  );
  setText('partidas-jugadas', formatearNumero(stats.gamesPlayed));
  actualizarOverlayVictoria();
}

function normalizarStats(rawStats) {
  const safe = { ...DEFAULT_STATS, ...(rawStats || {}) };

  return {
    bestScore: Number.isFinite(Number(safe.bestScore)) ? Math.max(0, Number(safe.bestScore)) : 0,
    gamesPlayed: Number.isFinite(Number(safe.gamesPlayed)) ? Math.max(0, Number(safe.gamesPlayed)) : 0,
    gamesWon: Number.isFinite(Number(safe.gamesWon)) ? Math.max(0, Number(safe.gamesWon)) : 0,
    currentStreak: Number.isFinite(Number(safe.currentStreak)) ? Math.max(0, Number(safe.currentStreak)) : 0,
    bestStreak: Number.isFinite(Number(safe.bestStreak)) ? Math.max(0, Number(safe.bestStreak)) : 0,
    bestTimeSeconds:
      safe.bestTimeSeconds == null || !Number.isFinite(Number(safe.bestTimeSeconds))
        ? null
        : Math.max(0, Number(safe.bestTimeSeconds)),
    lastScore: Number.isFinite(Number(safe.lastScore)) ? Math.max(0, Number(safe.lastScore)) : 0
  };
}

function cargarEstadisticas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    return normalizarStats(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATS };
  }
}

function persistirEstadisticas() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Sin storage disponible, seguimos sin bloquear el juego.
  }
}

function resetearEstadisticas() {
  stats = { ...DEFAULT_STATS };
  persistirEstadisticas();
  actualizarHud();
  toast(MENSAJES.STATS_REINICIADAS);
}

function iniciarReloj() {
  detenerReloj();
  inicioPartidaMs = Date.now();
  actualizarHud();

  relojTimer = window.setInterval(() => {
    actualizarHud();
  }, 1000);
}

function detenerReloj() {
  if (!relojTimer) return;
  window.clearInterval(relojTimer);
  relojTimer = null;
}

function getGrupoClasePorPalo(paloIndex) {
  return PALOS[paloIndex].tipo === 'oscuro' ? 'funda-oscura' : 'funda-clara';
}

function limpiarClasesFunda(el) {
  el.classList.remove(
    'funda-oscura',
    'funda-clara',
    'funda-teclas',
    'funda-percusion',
    'funda-cuerdas',
    'funda-vientos',
    'drop-target'
  );
}

function aplicarClasesFunda(el, fi) {
  const palo = PALOS[fi];
  limpiarClasesFunda(el);
  el.classList.add(getGrupoClasePorPalo(fi), palo.clase);
}

function obtenerContenedorJuego() {
  const tableroEl = getEl('tablero-area');
  return tableroEl?.parentElement || getEl('app') || document.body;
}

function obtenerAnchoDisponibleJuego() {
  const contenedor = obtenerContenedorJuego();
  const rect = contenedor.getBoundingClientRect();
  const width = Math.floor(rect.width || contenedor.clientWidth || (window.innerWidth - 16));
  return Math.max(LAYOUT.MIN_BOARD_WIDTH, width - 4);
}

function aplicarAnchoControladoTablero(boardWidth) {
  const topRow = getEl('top-row');
  const tableroArea = getEl('tablero-area');

  [topRow, tableroArea].forEach(el => {
    if (!el) return;
    el.style.width = '100%';
    el.style.maxWidth = `${boardWidth}px`;
    el.style.marginInline = 'auto';
  });
}

function calcDims() {
  const availableWidth = obtenerAnchoDisponibleJuego();
  const viewportHeight = getViewportHeight();
  const gap = clamp(Math.floor(availableWidth * 0.0065), LAYOUT.MIN_GAP, LAYOUT.MAX_GAP);

  const desiredCardWidth = clamp(
    Math.floor((availableWidth - 6 * gap) / 7),
    LAYOUT.MIN_CARD_WIDTH,
    LAYOUT.MAX_CARD_WIDTH
  );

  const targetBoardWidth = (desiredCardWidth * 7) + (gap * 6);
  const actualBoardWidth = Math.min(availableWidth, targetBoardWidth);
  aplicarAnchoControladoTablero(actualBoardWidth);

  const cardWidth = Math.max(
    LAYOUT.MIN_CARD_WIDTH,
    Math.floor((actualBoardWidth - 6 * gap) / 7)
  );

  const maxHeightByViewport = clamp(
    Math.floor(viewportHeight * 0.24),
    130,
    LAYOUT.MAX_CARD_HEIGHT
  );

  CH = clamp(Math.floor(cardWidth * LAYOUT.CARD_RATIO), LAYOUT.MIN_CARD_HEIGHT, maxHeightByViewport);
  OD = clamp(Math.floor(CH * 0.16), LAYOUT.MIN_BACK_OFFSET, LAYOUT.MAX_BACK_OFFSET);
  OU = clamp(Math.floor(CH * 0.27), LAYOUT.MIN_FACE_OFFSET, LAYOUT.MAX_FACE_OFFSET);

  const d = document.documentElement.style;
  d.setProperty('--gap', `${gap}px`);
  d.setProperty('--ch', `${CH}px`);
  d.setProperty('--fn', `${clamp(Math.floor(cardWidth * 0.16), 8, 15)}px`);
  d.setProperty('--fs', `${clamp(Math.floor(cardWidth * 0.13), 7, 13)}px`);
  d.setProperty('--fm', `${clamp(Math.floor(cardWidth * 0.34), 16, 34)}px`);
  d.setProperty('--fb', `${clamp(Math.floor(cardWidth * 0.38), 18, 38)}px`);
}

function programarRecalculoLayout() {
  // No recalcular mientras el usuario está arrastrando:
  // el ResizeObserver o el resize de viewport destruiría el DOM del ghost.
  if (dragState?.dragging) return;

  if (resizeRaf) {
    window.cancelAnimationFrame(resizeRaf);
  }

  resizeRaf = window.requestAnimationFrame(() => {
    calcDims();
    renderizar();
    resizeRaf = null;
  });
}

function initLayoutObservers() {
  const tableroEl = getEl('tablero-area');
  const shellEl = tableroEl?.parentElement;

  if (typeof ResizeObserver === 'undefined') return;

  if (resizeObserver) resizeObserver.disconnect();

  resizeObserver = new ResizeObserver(() => {
    programarRecalculoLayout();
  });

  if (tableroEl) resizeObserver.observe(tableroEl);
  if (shellEl) resizeObserver.observe(shellEl);
  const appEl = getEl('app');
  if (appEl) resizeObserver.observe(appEl);
}

function crearBaraja() {
  const baraja = [];
  for (let p = 0; p < 4; p++) {
    for (let n = 0; n < 13; n++) {
      baraja.push({ p, n, up: false });
    }
  }
  return baraja;
}

function mezclar(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nuevaPartida() {
  cancelarArrastre();

  if (partidaRegistrada && !partidaGanada && movimientos > 0) {
    stats.currentStreak = 0;
    persistirEstadisticas();
  }

  const b = mezclar(crearBaraja());

  mazo = [];
  descarte = [];
  fundas = [[], [], [], []];
  tablero = Array.from({ length: 7 }, () => []);
  limpiarSeleccion();

  puntos = 0;
  movimientos = 0;
  partidaRegistrada = false;
  partidaGanada = false;

  let i = 0;
  for (let c = 0; c < 7; c += 1) {
    for (let r = 0; r <= c; r += 1) {
      b[i].up = (r === c);
      tablero[c].push(b[i]);
      i += 1;
    }
  }

  while (i < 52) {
    mazo.push(b[i]);
    i += 1;
  }

  const win = getEl('win');
  if (win) win.classList.add('oculto');

  iniciarReloj();
  renderizar();
}

function puedeEnFunda(carta, fi) {
  const funda = fundas[fi];
  if (!funda) return false;

  if (funda.length === 0) return carta.n === 0;

  const tope = funda[funda.length - 1];
  return carta.p === tope.p && carta.n === tope.n + 1;
}

function puedeEnTablero(carta, col) {
  const pila = tablero[col];
  if (!pila) return false;

  if (pila.length === 0) return carta.n === 12;

  const tope = pila[pila.length - 1];
  return (
    tope.up &&
    PALOS[carta.p].tipo !== PALOS[tope.p].tipo &&
    carta.n === tope.n - 1
  );
}

function voltearTope(pila) {
  if (pila.length > 0 && !pila[pila.length - 1].up) {
    pila[pila.length - 1].up = true;
    sumarPuntos(PUNTAJES.VOLTEAR);
  }
}

function origenActivo() {
  return dragState?.origin || sel;
}

function haySeleccionEnCarta(col, idx) {
  const origen = origenActivo();
  return origen?.zona === 'tablero' && origen.col === col && origen.idx <= idx;
}

function haySeleccionEnFunda(fi) {
  const origen = origenActivo();
  return origen?.zona === 'funda' && origen.fi === fi;
}

function haySeleccionEnDescarte() {
  const origen = origenActivo();
  return origen?.zona === 'descarte';
}

function cartasDeOrigen(origen) {
  if (!origen) return null;

  if (origen.zona === 'descarte') {
    return descarte.length ? [descarte[descarte.length - 1]] : null;
  }

  if (origen.zona === 'tablero') {
    const pila = tablero[origen.col];
    if (!pila || origen.idx < 0 || origen.idx >= pila.length) return null;
    return pila.slice(origen.idx);
  }

  if (origen.zona === 'funda') {
    const pila = fundas[origen.fi];
    return pila && pila.length ? [pila[pila.length - 1]] : null;
  }

  return null;
}

function cartasSel() {
  return cartasDeOrigen(sel);
}

function extraerCartasDesdeOrigen(origen) {
  if (origen.zona === 'descarte') {
    return descarte.length ? [descarte.pop()] : [];
  }

  if (origen.zona === 'tablero') {
    const pila = tablero[origen.col];
    const cartas = pila.splice(origen.idx);
    voltearTope(pila);
    return cartas;
  }

  if (origen.zona === 'funda') {
    const pila = fundas[origen.fi];
    return pila.length ? [pila.pop()] : [];
  }

  return [];
}

function asegurarToast() {
  let t = getEl('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('aria-live', 'polite');
    t.setAttribute('aria-atomic', 'true');
    document.body.appendChild(t);
  }
  return t;
}

function toast(msg) {
  const t = asegurarToast();
  t.textContent = msg;
  t.classList.add('visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('visible');
  }, msg.length > 42 ? 2600 : 1800);
}

function onClickMazo() {
  limpiarSeleccion();

  if (mazo.length === 0) {
    if (descarte.length === 0) {
      renderizar();
      return;
    }

    registrarMovimiento();
    mazo = descarte.reverse().map(carta => ({ ...carta, up: false }));
    descarte = [];
    sumarPuntos(-PUNTAJES.RECICLAR);
    toast(MENSAJES.RECICLADO);
    renderizar();
    return;
  }

  registrarMovimiento();
  const carta = mazo.pop();
  carta.up = true;
  descarte.push(carta);
  sumarPuntos(PUNTAJES.ROBAR_MAZO);
  renderizar();
}

function onClickDescarte() {
  if (!descarte.length) return;

  if (haySeleccionEnDescarte()) {
    limpiarSeleccion();
    renderizar();
    return;
  }

  if (sel) {
    limpiarSeleccion();
  }

  sel = { zona: 'descarte' };
  renderizar();
}

function moverDesdeOrigenATablero(origen, col, opts = {}) {
  const cartas = cartasDeOrigen(origen);
  if (!cartas || !puedeEnTablero(cartas[0], col)) {
    if (!opts.silencioso) toast(tablero[col].length === 0 ? MENSAJES.SOLO_MAXIMA_VACIA : MENSAJES.MOV_INVALIDO);
    return false;
  }

  if (origen.zona === 'tablero' && origen.col === col) return false;

  registrarMovimiento();
  const movidas = extraerCartasDesdeOrigen(origen);
  tablero[col].push(...movidas);

  if (origen.zona === 'funda') {
    sumarPuntos(PUNTAJES.DEVOLVER_FUNDA);
  } else {
    sumarPuntos(PUNTAJES.MOVER_TABLERO);
  }

  return true;
}

function moverDesdeOrigenAFunda(origen, fi, opts = {}) {
  const cartas = cartasDeOrigen(origen);

  if (!cartas || cartas.length !== 1) {
    if (!opts.silencioso) toast(MENSAJES.SOLO_UNA_A_FUNDA);
    return false;
  }

  const carta = cartas[0];
  if (!puedeEnFunda(carta, fi)) {
    if (!opts.silencioso) toast(MENSAJES.MOV_INVALIDO);
    return false;
  }

  registrarMovimiento();
  const movidas = extraerCartasDesdeOrigen(origen);
  fundas[fi].push(movidas[0]);
  sumarPuntos(PUNTAJES.MOVER_FUNDA);
  verificarVictoria();
  return true;
}

function onClickFunda(fi) {
  const pila = fundas[fi];

  if (!sel) {
    if (!pila.length) return;
    sel = { zona: 'funda', fi };
    renderizar();
    return;
  }

  if (sel.zona === 'funda' && sel.fi === fi) {
    limpiarSeleccion();
    renderizar();
    return;
  }

  if (moverDesdeOrigenAFunda(sel, fi)) {
    limpiarSeleccion();
    renderizar();
    return;
  }

  if (pila.length) {
    sel = { zona: 'funda', fi };
  } else {
    limpiarSeleccion();
  }
  renderizar();
}

function onClickCarta(col, idx) {
  const pila = tablero[col];
  if (!pila || idx < 0 || idx >= pila.length) return;

  const carta = pila[idx];
  if (!carta.up) {
    limpiarSeleccion();
    renderizar();
    return;
  }

  if (sel) {
    const mismaCarta =
      sel.zona === 'tablero' &&
      sel.col === col &&
      sel.idx === idx;

    if (mismaCarta) {
      limpiarSeleccion();
      renderizar();
      return;
    }

    if (moverDesdeOrigenATablero(sel, col, { silencioso: true })) {
      limpiarSeleccion();
      renderizar();
      return;
    }
  }

  sel = { zona: 'tablero', col, idx };
  renderizar();
}

function onClickColVacia(col) {
  if (!sel) return;

  if (moverDesdeOrigenATablero(sel, col)) {
    limpiarSeleccion();
    renderizar();
    return;
  }

  limpiarSeleccion();
  renderizar();
}

function verificarVictoria() {
  const gano = fundas.every(funda => funda.length === 13);
  if (!gano || partidaGanada) return;

  registrarInicioPartida();
  partidaGanada = true;
  detenerReloj();

  const tiempoFinal = getElapsedSeconds();
  stats.gamesWon += 1;
  stats.currentStreak += 1;
  stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  stats.lastScore = puntos;

  if (stats.bestTimeSeconds == null || tiempoFinal < stats.bestTimeSeconds) {
    stats.bestTimeSeconds = tiempoFinal;
  }

  persistirEstadisticas();
  actualizarHud();

  setTimeout(() => {
    actualizarOverlayVictoria();
    const win = getEl('win');
    if (win) win.classList.remove('oculto');
  }, 320);
}

function slotHTML(icono = '') {
  return `
    <div class="slot-ph">
      ${icono ? `<span class="slot-ico">${icono}</span>` : ''}
    </div>
  `;
}

function fundaVaciaHTML(fi) {
  const palo = PALOS[fi];
  const grupoClase = palo.tipo === 'oscuro' ? 'funda-oscura' : 'funda-clara';

  return `
    <div class="slot-ph slot-ph-funda ${grupoClase} ${palo.clase}">
      <span class="slot-ico">${palo.sym}</span>
      <span class="slot-label">${palo.nombre}</span>
    </div>
  `;
}

function backHTML() {
  return `
    <div class="card back" aria-hidden="true">
      <div class="back-inner">
        <span class="back-sym">♪</span>
      </div>
    </div>
  `;
}

function faceHTML(carta, isSel = false, isDraggable = false) {
  const nota = NOTAS[carta.n];
  const palo = PALOS[carta.p];
  const selClass = isSel ? ' sel' : '';
  const dragClass = isDraggable ? ' is-draggable' : '';

  return `
    <div class="card face ${palo.tipo}${selClass}${dragClass}" aria-label="${nota} ${palo.nombre}">
      <div class="c-tl">
        <b>${nota}</b>
        <span>${palo.sym}</span>
      </div>
      <div class="c-mid">${palo.sym}</div>
      <div class="c-br">
        <b>${nota}</b>
        <span>${palo.sym}</span>
      </div>
    </div>
  `;
}

function renderMazo() {
  const mazoEl = getEl('mazo');
  if (!mazoEl) return;

  mazoEl.classList.remove('drop-target');
  mazoEl.innerHTML = mazo.length > 0 ? backHTML() : slotHTML('↺');
  mazoEl.setAttribute(
    'aria-label',
    mazo.length > 0 ? `Mazo con ${mazo.length} cartas` : 'Reciclar descarte'
  );
}

function renderDescarte() {
  const descarteEl = getEl('descarte');
  if (!descarteEl) return;

  descarteEl.classList.remove('drop-target');
  descarteEl.innerHTML = descarte.length
    ? faceHTML(descarte[descarte.length - 1], haySeleccionEnDescarte(), true)
    : slotHTML();

  const carta = descarte[descarte.length - 1];
  descarteEl.setAttribute(
    'aria-label',
    carta ? `Descarte: ${cartaToTexto(carta)}` : 'Descarte vacío'
  );
}

function renderFundas() {
  for (let fi = 0; fi < 4; fi += 1) {
    const el = q(`.funda[data-fi="${fi}"]`);
    if (!el) continue;

    aplicarClasesFunda(el, fi);
    const pila = fundas[fi];
    const tope = pila[pila.length - 1];

    el.innerHTML = tope
      ? faceHTML(tope, haySeleccionEnFunda(fi), true)
      : fundaVaciaHTML(fi);

    const texto = tope
      ? `Fundación ${fi + 1}: ${cartaToTexto(tope)}`
      : `Fundación ${fi + 1} vacía, ${PALOS[fi].nombre}`;

    el.setAttribute('aria-label', texto);
  }
}

function calcularAlturaColumna(pila) {
  if (!pila.length) return CH;

  let h = 0;
  pila.forEach((carta, i) => {
    h += i < pila.length - 1 ? (carta.up ? OU : OD) : CH;
  });
  return h;
}

function renderTablero() {
  for (let col = 0; col < 7; col += 1) {
    const cEl = q(`.col[data-col="${col}"]`);
    if (!cEl) continue;

    cEl.classList.remove('drop-target');
    const pila = tablero[col];

    if (!pila.length) {
      cEl.innerHTML = '<div class="slot-ph"></div>';
      cEl.style.height = `${CH}px`;
      cEl.setAttribute('aria-label', `Columna ${col + 1} vacía`);
      continue;
    }

    cEl.style.height = `${calcularAlturaColumna(pila)}px`;
    cEl.innerHTML = '';

    let top = 0;

    pila.forEach((carta, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'cwrap';
      wrap.style.top = `${top}px`;
      wrap.style.zIndex = String(idx + 1);
      wrap.dataset.col = String(col);
      wrap.dataset.idx = String(idx);
      wrap.innerHTML = carta.up
        ? faceHTML(carta, haySeleccionEnCarta(col, idx), true)
        : backHTML();

      wrap.setAttribute(
        'aria-label',
        carta.up ? cartaToTexto(carta) : 'Carta boca abajo'
      );

      cEl.appendChild(wrap);
      if (idx < pila.length - 1) {
        top += carta.up ? OU : OD;
      }
    });

    cEl.setAttribute('aria-label', `Columna ${col + 1}, ${pila.length} cartas`);
  }
}

function limpiarDestinosDeArrastre() {
  $$('.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function renderizar() {
  actualizarHud();
  renderMazo();
  renderDescarte();
  renderFundas();
  renderTablero();
  limpiarDestinosDeArrastre();
}

function getDraggableOriginFromTarget(target) {
  const discardCard = target.closest('#descarte .card.face');
  if (discardCard && descarte.length) return { zona: 'descarte' };

  const fundaCard = target.closest('.funda .card.face');
  if (fundaCard) {
    const fundaEl = fundaCard.closest('.funda');
    const fi = Number(fundaEl?.dataset.fi);
    if (Number.isInteger(fi) && fundas[fi]?.length) return { zona: 'funda', fi };
  }

  const wrap = target.closest('.cwrap');
  if (!wrap) return null;

  const col = Number(wrap.dataset.col);
  const idx = Number(wrap.dataset.idx);
  const carta = tablero[col]?.[idx];
  if (!carta?.up) return null;
  return { zona: 'tablero', col, idx };
}

function crearGhostArrastre(cartas, pointerX, pointerY) {
  const layer = document.createElement('div');
  layer.id = 'drag-layer';

  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.setProperty('--drag-width', `${Math.max(60, Math.floor(CH / 1.42))}px`);

  const stack = document.createElement('div');
  stack.className = 'drag-ghost-stack';
  stack.style.height = `${CH + Math.max(0, cartas.length - 1) * Math.min(OU, 18)}px`;

  cartas.slice(0, 5).forEach((carta, idx) => {
    const item = document.createElement('div');
    item.className = 'drag-stack-card';
    item.style.top = `${idx * Math.min(OU, 18)}px`;
    item.innerHTML = faceHTML(carta);
    stack.appendChild(item);
  });

  ghost.appendChild(stack);
  layer.appendChild(ghost);
  document.body.appendChild(layer);

  return {
    layer,
    ghost,
    offsetX: Math.floor((Math.max(60, Math.floor(CH / 1.42))) * 0.45),
    offsetY: Math.floor(CH * 0.3)
  };
}

function moverGhost(pointerX, pointerY) {
  if (!dragState?.ghost) return;
  dragState.ghost.style.transform = `translate(${pointerX - dragState.ghostOffsetX}px, ${pointerY - dragState.ghostOffsetY}px)`;
}

function limpiarGhost() {
  if (dragState?.layer && dragState.layer.parentNode) {
    dragState.layer.parentNode.removeChild(dragState.layer);
  }
}

function setDropTarget(target) {
  limpiarDestinosDeArrastre();
  if (!target) return;

  if (target.zona === 'tablero') {
    const el = q(`.col[data-col="${target.col}"]`);
    if (el) el.classList.add('drop-target');
    return;
  }

  if (target.zona === 'funda') {
    const el = q(`.funda[data-fi="${target.fi}"]`);
    if (el) el.classList.add('drop-target');
  }
}

function resolverDestinoDesdePunto(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;

  const fundaEl = el.closest('.funda');
  if (fundaEl) return { zona: 'funda', fi: Number(fundaEl.dataset.fi) };

  const wrap = el.closest('.cwrap');
  if (wrap) return { zona: 'tablero', col: Number(wrap.dataset.col) };

  const colEl = el.closest('.col');
  if (colEl) return { zona: 'tablero', col: Number(colEl.dataset.col) };

  return null;
}

function iniciarArrastre(origin, event) {
  const cartas = cartasDeOrigen(origin);
  if (!cartas?.length) return;

  const ghostData = crearGhostArrastre(cartas, event.clientX, event.clientY);

  dragState = {
    origin,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: true,
    layer: ghostData.layer,
    ghost: ghostData.ghost,
    ghostOffsetX: ghostData.offsetX,
    ghostOffsetY: ghostData.offsetY
  };

  document.body.classList.add('is-dragging');
  moverGhost(event.clientX, event.clientY);
  renderizar();
}

function cancelarArrastre() {
  limpiarGhost();
  limpiarDestinosDeArrastre();
  document.body.classList.remove('is-dragging');
  dragState = null;
}

function onPointerDownGlobal(event) {
  if (event.button !== 0 && event.pointerType !== 'touch') return;

  const origin = getDraggableOriginFromTarget(event.target);
  if (!origin) return;
  event.preventDefault();

  dragState = {
    origin,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false
  };
}

function onPointerMoveGlobal(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  // Siempre prevenir default cuando estamos siguiendo un posible arrastre;
  // si no, el browser móvil toma el control con scroll nativo y rompe todo.
  event.preventDefault();

  if (!dragState.dragging) {
    const movedEnough =
      Math.abs(event.clientX - dragState.startX) > DRAG_THRESHOLD ||
      Math.abs(event.clientY - dragState.startY) > DRAG_THRESHOLD;

    if (!movedEnough) return;
    iniciarArrastre(dragState.origin, event);
  }

  moverGhost(event.clientX, event.clientY);
  const target = resolverDestinoDesdePunto(event.clientX, event.clientY);
  setDropTarget(target);
}

function resolverMovimientoArrastre(origin, target) {
  if (!target) return false;
  if (target.zona === 'tablero') return moverDesdeOrigenATablero(origin, target.col, { silencioso: true });
  if (target.zona === 'funda') return moverDesdeOrigenAFunda(origin, target.fi, { silencioso: true });
  return false;
}

function onPointerUpGlobal(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const wasDragging = dragState.dragging;
  const origin = dragState.origin;

  if (wasDragging) {
    const target = resolverDestinoDesdePunto(event.clientX, event.clientY);
    const moved = resolverMovimientoArrastre(origin, target);
    dragClickSuppressUntil = Date.now() + 250;
    cancelarArrastre();
    limpiarSeleccion();
    renderizar();
    if (!moved && target) toast(MENSAJES.MOV_INVALIDO);
    return;
  }

  dragState = null;
}

function onPointerCancelGlobal(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  cancelarArrastre();
  renderizar();
}

function onKeyActivate(event, callback) {
  const key = event.key;
  if (key === 'Enter' || key === ' ') {
    event.preventDefault();
    callback();
  }
}

function initEventos() {
  const mazoEl = getEl('mazo');
  const descarteEl = getEl('descarte');
  const tableroArea = getEl('tablero-area');
  const nuevaBtn = getEl('nueva-btn');
  const playAgainBtn = getEl('play-again-btn');
  const resetStatsBtn = getEl('reset-stats-btn');
  const reciclarBtn = getEl('reciclar-btn');
  const ayudaBtn = getEl('ayuda-btn');
  const reglasBtn = getEl('reglas-btn');

  mazoEl?.addEventListener('click', onClickMazo);
  mazoEl?.addEventListener('keydown', event => onKeyActivate(event, onClickMazo));

  descarteEl?.addEventListener('click', onClickDescarte);
  descarteEl?.addEventListener('keydown', event => onKeyActivate(event, onClickDescarte));

  $$('.funda').forEach(el => {
    const fi = Number(el.dataset.fi);
    el.addEventListener('click', () => onClickFunda(fi));
    el.addEventListener('keydown', event => onKeyActivate(event, () => onClickFunda(fi)));
  });

  tableroArea?.addEventListener('click', event => {
    const wrap = event.target.closest('.cwrap');
    const col = event.target.closest('.col');

    if (wrap) {
      onClickCarta(Number(wrap.dataset.col), Number(wrap.dataset.idx));
      return;
    }

    if (col) onClickColVacia(Number(col.dataset.col));
  });

  // passive: false es crítico en móvil para que event.preventDefault() funcione
  // y el browser no inicie scroll/pan nativo mientras arrastramos.
  document.addEventListener('pointerdown', onPointerDownGlobal, { passive: false });
  document.addEventListener('pointermove', onPointerMoveGlobal, { passive: false });
  document.addEventListener('pointerup', onPointerUpGlobal);
  document.addEventListener('pointercancel', onPointerCancelGlobal);
  document.addEventListener('click', event => {
    if (Date.now() >= dragClickSuppressUntil) return;
    if (!event.target.closest('#app') && !event.target.closest('#win')) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  nuevaBtn?.addEventListener('click', nuevaPartida);
  playAgainBtn?.addEventListener('click', nuevaPartida);
  reciclarBtn?.addEventListener('click', onClickMazo);
  ayudaBtn?.addEventListener('click', () => toast(MENSAJES.AYUDA));
  reglasBtn?.addEventListener('click', abrirIntro);

  resetStatsBtn?.addEventListener('click', () => {
    const confirmado = window.confirm(
      '¿Borrar el historial de puntajes y estadísticas guardado en este dispositivo?'
    );

    if (!confirmado) return;
    resetearEstadisticas();
  });
}


// ═══════════════════════════════════════════════════════
// PANTALLA DE INTRODUCCIÓN / REGLAS
// ═══════════════════════════════════════════════════════

const INTRO_STORAGE_KEY = 'musicala_solitario_intro_v1';

function debesMostrarIntro() {
  try {
    return !localStorage.getItem(INTRO_STORAGE_KEY);
  } catch {
    return true;
  }
}

function marcarIntroVista() {
  try {
    const check = getEl('intro-noshowagain-check');
    if (check?.checked) {
      localStorage.setItem(INTRO_STORAGE_KEY, '1');
    }
  } catch {
    // sin storage, no bloqueamos
  }
}

function cerrarIntro() {
  const intro = getEl('intro');
  if (!intro || intro.classList.contains('oculto')) return;

  marcarIntroVista();

  intro.classList.add('intro-saliendo');
  intro.addEventListener('animationend', () => {
    intro.classList.add('oculto');
    intro.classList.remove('intro-saliendo');
  }, { once: true });
}

function abrirIntro() {
  const intro = getEl('intro');
  if (!intro) return;

  // Scroll al inicio del body del panel al abrir
  const body = intro.querySelector('.intro-body');
  if (body) body.scrollTop = 0;

  intro.classList.remove('oculto', 'intro-saliendo');
}

function initIntro() {
  getEl('intro-play-btn')?.addEventListener('click', cerrarIntro);
  getEl('intro-close')?.addEventListener('click', cerrarIntro);
  getEl('reglas-btn')?.addEventListener('click', abrirIntro);

  // Cerrar con Escape
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const intro = getEl('intro');
      if (intro && !intro.classList.contains('oculto')) {
        cerrarIntro();
      }
    }
  });

  if (!debesMostrarIntro()) {
    getEl('intro')?.classList.add('oculto');
  }
}

window.addEventListener('load', () => {
  asegurarToast();
  calcDims();
  initEventos();
  initLayoutObservers();
  initIntro();
  actualizarHud();
  nuevaPartida();
});

window.addEventListener('resize', programarRecalculoLayout);
window.addEventListener('orientationchange', programarRecalculoLayout);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', programarRecalculoLayout);
}
