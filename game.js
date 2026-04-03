'use strict';

/* ════════════════════════════════════════════════════════════
   SOLITARIO MUSICAL CROMÁTICO — game.js
   Musicala edition
   Ajustes:
   - Mantiene la lógica actual del juego
   - Compacta el tablero sin cambiar la estructura
   - Controla mejor el tamaño de cartas en desktop y móvil
   - Centra top-row y tablero con ancho máximo dinámico
   - Reduce scroll vertical ajustando offsets de columnas
   - Resize más estable con ResizeObserver + rAF
   ════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────
   CONSTANTES
──────────────────────────────────────────────────────────── */

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
  RECICLAR: 15
};

const MENSAJES = {
  SOLO_UNA_A_FUNDA: 'Solo una carta a la vez en la armonía final',
  MOV_INVALIDO: 'Ese movimiento no encaja',
  SOLO_MAXIMA_VACIA: 'Solo Do↑ abre una columna vacía',
  RECICLADO: 'Se recicló el descarte',
  STATS_REINICIADAS: 'Historial reiniciado en este dispositivo'
};

const STORAGE_KEY = 'musicala_solitario_stats_v4';

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
  MAX_CARD_HEIGHT: 186,
  CARD_RATIO: 1.42,
  MIN_GAP: 4,
  MAX_GAP: 10,
  MIN_FACE_OFFSET: 18,
  MAX_FACE_OFFSET: 34,
  MIN_BACK_OFFSET: 12,
  MAX_BACK_OFFSET: 22
};

/* ────────────────────────────────────────────────────────────
   ESTADO DEL JUEGO
──────────────────────────────────────────────────────────── */

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

// Dimensiones dinámicas
let CH = 76;
let OD = 14;
let OU = 24;

/* ────────────────────────────────────────────────────────────
   HELPERS DOM
──────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────
   HELPERS GENERALES
──────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────
   STORAGE
──────────────────────────────────────────────────────────── */

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
    // Si el navegador bloquea storage, seguimos tranquilos.
  }
}

function resetearEstadisticas() {
  stats = { ...DEFAULT_STATS };
  persistirEstadisticas();
  actualizarHud();
  toast(MENSAJES.STATS_REINICIADAS);
}

/* ────────────────────────────────────────────────────────────
   RELOJ
──────────────────────────────────────────────────────────── */

function iniciarReloj() {
  detenerReloj();
  inicioPartidaMs = Date.now();
  actualizarHud();

  relojTimer = window.setInterval(() => {
    actualizarHud();
  }, 1000);
}

function detenerReloj() {
  if (relojTimer) {
    window.clearInterval(relojTimer);
    relojTimer = null;
  }
}

/* ────────────────────────────────────────────────────────────
   CLASES / SELECCIÓN
──────────────────────────────────────────────────────────── */

function haySeleccionEnCarta(col, idx) {
  return (
    sel?.zona === 'tablero' &&
    sel.col === col &&
    sel.idx <= idx
  );
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
    'funda-vientos'
  );
}

function aplicarClasesFunda(el, fi) {
  const palo = PALOS[fi];
  limpiarClasesFunda(el);
  el.classList.add(getGrupoClasePorPalo(fi), palo.clase);
}

/* ────────────────────────────────────────────────────────────
   DIMENSIONES RESPONSIVAS
──────────────────────────────────────────────────────────── */

function obtenerContenedorJuego() {
  const tableroEl = getEl('tablero-area');
  return tableroEl?.parentElement || getEl('app') || document.body;
}

function obtenerAnchoDisponibleJuego() {
  const contenedor = obtenerContenedorJuego();
  const rect = contenedor.getBoundingClientRect();
  const width = Math.floor(rect.width || contenedor.clientWidth || (window.innerWidth - 16));
  return Math.max(LAYOUT.MIN_BOARD_WIDTH, width);
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

  // Gap pequeño y controlado para que no se desperdicie ancho.
  const gap = clamp(Math.floor(availableWidth * 0.0065), LAYOUT.MIN_GAP, LAYOUT.MAX_GAP);

  // El tablero usa el ancho disponible, pero no deja crecer las columnas sin control.
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

  // La altura también se limita por viewport para evitar scroll absurdo.
  const maxHeightByViewport = clamp(
    Math.floor(viewportHeight * 0.24),
    130,
    LAYOUT.MAX_CARD_HEIGHT
  );

  const baseHeight = Math.floor(cardWidth * LAYOUT.CARD_RATIO);

  CH = clamp(baseHeight, LAYOUT.MIN_CARD_HEIGHT, maxHeightByViewport);
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

  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  resizeObserver = new ResizeObserver(() => {
    programarRecalculoLayout();
  });

  if (tableroEl) resizeObserver.observe(tableroEl);
  if (shellEl) resizeObserver.observe(shellEl);

  const appEl = getEl('app');
  if (appEl) resizeObserver.observe(appEl);
}

/* ────────────────────────────────────────────────────────────
   BARAJA
──────────────────────────────────────────────────────────── */

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
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ────────────────────────────────────────────────────────────
   NUEVA PARTIDA
──────────────────────────────────────────────────────────── */

function cerrarVictoria() {
  const win = getEl('win');
  if (win) win.classList.add('oculto');
}

function nuevaPartida() {
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

  for (let c = 0; c < 7; c++) {
    for (let r = 0; r <= c; r++) {
      b[i].up = (r === c);
      tablero[c].push(b[i]);
      i += 1;
    }
  }

  while (i < 52) {
    mazo.push(b[i]);
    i += 1;
  }

  cerrarVictoria();
  iniciarReloj();
  calcDims();
  actualizarHud();
  renderizar();
}

/* ────────────────────────────────────────────────────────────
   REGLAS
──────────────────────────────────────────────────────────── */

function puedeEnFunda(carta, fi) {
  const funda = fundas[fi];
  if (!funda) return false;

  if (funda.length === 0) {
    return carta.n === 0;
  }

  const tope = funda[funda.length - 1];
  return carta.p === tope.p && carta.n === tope.n + 1;
}

function puedeEnTablero(carta, col) {
  const pila = tablero[col];
  if (!pila) return false;

  if (pila.length === 0) {
    return carta.n === 12;
  }

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

/* ────────────────────────────────────────────────────────────
   SELECCIÓN
──────────────────────────────────────────────────────────── */

function cartasSel() {
  if (!sel) return null;

  if (sel.zona === 'descarte') {
    return descarte.length ? [descarte[descarte.length - 1]] : null;
  }

  if (sel.zona === 'tablero') {
    const pila = tablero[sel.col];
    if (!pila || sel.idx < 0 || sel.idx >= pila.length) return null;
    return pila.slice(sel.idx);
  }

  return null;
}

/* ────────────────────────────────────────────────────────────
   TOAST
──────────────────────────────────────────────────────────── */

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
  }, msg.length > 28 ? 2200 : 1600);
}

/* ────────────────────────────────────────────────────────────
   ACCIONES DEL JUEGO
──────────────────────────────────────────────────────────── */

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
  if (descarte.length === 0) return;

  if (sel?.zona === 'descarte') {
    limpiarSeleccion();
    renderizar();
    return;
  }

  if (sel) {
    limpiarSeleccion();
    renderizar();
    return;
  }

  sel = { zona: 'descarte' };
  renderizar();
}

function onClickFunda(fi) {
  if (!sel) return;

  const cartas = cartasSel();

  if (!cartas || cartas.length !== 1) {
    toast(MENSAJES.SOLO_UNA_A_FUNDA);
    limpiarSeleccion();
    renderizar();
    return;
  }

  const carta = cartas[0];

  if (!puedeEnFunda(carta, fi)) {
    toast(MENSAJES.MOV_INVALIDO);
    limpiarSeleccion();
    renderizar();
    return;
  }

  registrarMovimiento();

  if (sel.zona === 'descarte') {
    descarte.pop();
  } else if (sel.zona === 'tablero') {
    tablero[sel.col].splice(sel.idx);
    voltearTope(tablero[sel.col]);
  }

  fundas[fi].push(carta);
  sumarPuntos(PUNTAJES.MOVER_FUNDA);
  limpiarSeleccion();

  verificarVictoria();
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

    const cartas = cartasSel();
    if (cartas && puedeEnTablero(cartas[0], col)) {
      moverATablero(col);
      return;
    }

    sel = { zona: 'tablero', col, idx };
    renderizar();
    return;
  }

  sel = { zona: 'tablero', col, idx };
  renderizar();
}

function onClickColVacia(col) {
  if (!sel) return;

  const cartas = cartasSel();

  if (cartas && puedeEnTablero(cartas[0], col)) {
    moverATablero(col);
    return;
  }

  if (cartas) toast(MENSAJES.SOLO_MAXIMA_VACIA);
  limpiarSeleccion();
  renderizar();
}

function moverATablero(col) {
  const cartas = cartasSel();

  if (!cartas || !puedeEnTablero(cartas[0], col)) {
    limpiarSeleccion();
    renderizar();
    return;
  }

  registrarMovimiento();

  if (sel.zona === 'descarte') {
    descarte.pop();
  } else if (sel.zona === 'tablero') {
    tablero[sel.col].splice(sel.idx);
    voltearTope(tablero[sel.col]);
  }

  tablero[col].push(...cartas);
  sumarPuntos(PUNTAJES.MOVER_TABLERO);
  limpiarSeleccion();
  renderizar();
}

/* ────────────────────────────────────────────────────────────
   VICTORIA
──────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────
   HTML DE CARTAS / SLOTS
──────────────────────────────────────────────────────────── */

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

function faceHTML(carta, isSel = false) {
  const nota = NOTAS[carta.n];
  const palo = PALOS[carta.p];
  const selClass = isSel ? ' sel' : '';

  return `
    <div class="card face ${palo.tipo}${selClass}" aria-label="${nota} ${palo.nombre}">
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

/* ────────────────────────────────────────────────────────────
   RENDER
──────────────────────────────────────────────────────────── */

function renderMazo() {
  const mazoEl = getEl('mazo');
  if (!mazoEl) return;

  mazoEl.innerHTML = mazo.length > 0 ? backHTML() : slotHTML('↺');
  mazoEl.setAttribute(
    'aria-label',
    mazo.length > 0 ? `Mazo con ${mazo.length} cartas` : 'Reciclar descarte'
  );
}

function renderDescarte() {
  const descarteEl = getEl('descarte');
  if (!descarteEl) return;

  descarteEl.innerHTML =
    descarte.length > 0
      ? faceHTML(descarte[descarte.length - 1], sel?.zona === 'descarte')
      : slotHTML();

  const carta = descarte[descarte.length - 1];
  descarteEl.setAttribute(
    'aria-label',
    carta ? `Descarte: ${cartaToTexto(carta)}` : 'Descarte vacío'
  );
}

function renderFundas() {
  for (let fi = 0; fi < 4; fi++) {
    const el = q(`.funda[data-fi="${fi}"]`);
    if (!el) continue;

    aplicarClasesFunda(el, fi);

    const pila = fundas[fi];
    const tope = pila[pila.length - 1];

    el.innerHTML = tope ? faceHTML(tope) : fundaVaciaHTML(fi);

    const texto = tope
      ? `Fundación ${fi + 1}: ${cartaToTexto(tope)}`
      : `Fundación ${fi + 1} vacía, ${PALOS[fi].nombre}, grupo ${PALOS[fi].tipo}`;

    el.setAttribute('aria-label', texto);
  }
}

function calcularAlturaColumna(pila) {
  if (!pila.length) return CH;

  let h = 0;
  pila.forEach((carta, i) => {
    h += (i < pila.length - 1)
      ? (carta.up ? OU : OD)
      : CH;
  });

  return h;
}

function renderTablero() {
  for (let col = 0; col < 7; col++) {
    const cEl = q(`.col[data-col="${col}"]`);
    if (!cEl) continue;

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
      const seleccionada = haySeleccionEnCarta(col, idx);

      wrap.className = 'cwrap';
      wrap.style.top = `${top}px`;
      wrap.style.zIndex = String(idx + 1);
      wrap.dataset.col = String(col);
      wrap.dataset.idx = String(idx);
      wrap.innerHTML = carta.up ? faceHTML(carta, seleccionada) : backHTML();

      wrap.setAttribute(
        'aria-label',
        carta.up ? cartaToTexto(carta) : 'Carta boca abajo'
      );

      cEl.appendChild(wrap);

      if (idx < pila.length - 1) {
        top += carta.up ? OU : OD;
      }
    });

    cEl.setAttribute(
      'aria-label',
      `Columna ${col + 1}, ${pila.length} carta${pila.length === 1 ? '' : 's'}`
    );
  }
}

function renderizar() {
  actualizarHud();
  renderMazo();
  renderDescarte();
  renderFundas();
  renderTablero();
}

/* ────────────────────────────────────────────────────────────
   EVENTOS
──────────────────────────────────────────────────────────── */

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

    if (col) {
      onClickColVacia(Number(col.dataset.col));
    }
  });

  nuevaBtn?.addEventListener('click', nuevaPartida);
  playAgainBtn?.addEventListener('click', nuevaPartida);

  resetStatsBtn?.addEventListener('click', () => {
    const confirmado = window.confirm(
      '¿Borrar el historial de puntajes y estadísticas guardado en este dispositivo?'
    );

    if (!confirmado) return;
    resetearEstadisticas();
  });
}

/* ────────────────────────────────────────────────────────────
   INICIO
──────────────────────────────────────────────────────────── */

window.addEventListener('load', () => {
  asegurarToast();
  calcDims();
  initEventos();
  initLayoutObservers();
  actualizarHud();
  nuevaPartida();
});

window.addEventListener('resize', programarRecalculoLayout);
window.addEventListener('orientationchange', programarRecalculoLayout);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', programarRecalculoLayout);
}