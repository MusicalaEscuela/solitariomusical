'use strict';

const NOTAS = [
  'Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯',
  'Sol', 'Sol♯', 'La', 'La♯', 'Si', 'Do↑'
];

const FRECUENCIAS_CROMATICAS = [
  261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99,
  392.00, 415.30, 440.00, 466.16, 493.88, 523.25
];

const AUDIO_CONFIG = {
  DURACION_NOTA: 0.34,
  DURACION_ESCALA: 0.32,
  PAUSA_ESCALA: 0.38,
  GANANCIA_NOTA: 0.07,
  GANANCIA_ESCALA: 0.065
};

// Timbres ligeros por familia (Web Audio, sin archivos). Cada capa es un oscilador.
const TIMBRES = {
  teclas: {
    capas: [{ tipo: 'triangle', mult: 1, vol: 1 }, { tipo: 'sine', mult: 2, vol: 0.2 }],
    ataque: 0.012, duracion: 0.5, corte: 2800
  },
  percusion: {
    capas: [{ tipo: 'sine', mult: 1, vol: 1 }, { tipo: 'triangle', mult: 3.9, vol: 0.26 }],
    ataque: 0.004, duracion: 0.22, corte: 3600, caida: 1.04
  },
  cuerdas: {
    capas: [{ tipo: 'sawtooth', mult: 1, vol: 0.42 }, { tipo: 'sawtooth', mult: 1, vol: 0.32, detune: 7 }],
    ataque: 0.045, duracion: 0.56, corte: 1500, vibrato: { hz: 5.2, cents: 7 }
  },
  vientos: {
    capas: [{ tipo: 'sine', mult: 1, vol: 1 }, { tipo: 'triangle', mult: 2, vol: 0.16 }],
    ataque: 0.075, duracion: 0.46, corte: 2000, vibrato: { hz: 4.6, cents: 5 }
  }
};

const PALOS = [
  { sym: '🎹', tipo: 'oscuro', nombre: 'Teclas', clase: 'funda-teclas', timbre: 'teclas' },
  { sym: '🥁', tipo: 'oscuro', nombre: 'Percusión', clase: 'funda-percusion', timbre: 'percusion' },
  { sym: '🎸', tipo: 'claro', nombre: 'Cuerdas', clase: 'funda-cuerdas', timbre: 'cuerdas' },
  { sym: '🎺', tipo: 'claro', nombre: 'Vientos', clase: 'funda-vientos', timbre: 'vientos' }
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
  MOV_INVALIDO: 'Ese movimiento no encaja.',
  SOLO_MAXIMA_VACIA: 'Solo Do↑ abre una columna vacía.',
  RECICLADO: 'El descarte volvió al mazo.',
  STATS_REINICIADAS: 'Historial reiniciado en este dispositivo.',
  AYUDA: 'Arrastra cartas o tócalas. También puedes bajar la carta superior de una fundación al tablero.',
  REVISA_MAZO: 'Revisa el mazo 🎴',
  SIN_PISTA: 'No veo una jugada clara por ahora.',
  CONFIRMAR_REINICIO: '¿Reiniciar esta partida con el mismo reparto? Perderás el avance actual.',
  CONFIRMAR_MODO: 'Cambiar de modo inicia una partida nueva. ¿Continuar?'
};

const STORAGE_KEY = 'musicala_solitario_stats_v5';
const MODE_STORAGE_KEY = 'musicala_solitario_modo_v1';

// destinos: resaltado sutil de jugadas legales al seleccionar/arrastrar.
const GAME_MODES = [
  {
    id: 'clasico',
    label: 'Clásico',
    dealStrategy: 'random',
    destinos: 'sutil'
  },
  {
    id: 'amable',
    label: 'Amable',
    dealStrategy: 'best_of',
    attempts: 10,
    destinos: 'visible'
  },
  {
    id: 'experto',
    label: 'Experto',
    dealStrategy: 'worst_of',
    attempts: 8,
    destinos: false
  }
];

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
  MIN_BOARD_WIDTH: 280,
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
const DOBLE_TOQUE_MS = 380;
const MAX_HISTORIAL = 100;
const LIMITE_ESTADOS_ANALISIS = 5000;
const REY = 12;

let mazo = [];
let descarte = [];
let fundas = [[], [], [], []];
let tablero = Array.from({ length: 7 }, () => []);
let sel = null;
let currentModeId = cargarModo();

let puntos = 0;
let picoPuntaje = 0;
let movimientos = 0;
let partidaRegistrada = false;
let partidaGanada = false;
let partidaPerdida = false;
let autoEnCurso = false;

let repartoInicial = null;
let historial = [];
let versionEstado = 0;
let analisisCache = null;

let relojAcumuladoMs = 0;
let relojDesdeMs = null;
let relojTimer = null;
let toastTimer = null;
let resizeRaf = null;
let resizeObserver = null;
let firmaLayout = '';
let layoutPendiente = false;
let audioCtx = null;
let escalaFinalTimers = [];
let pistaTimers = [];
let ayudaMazoTimer = null;
let ultimaAyudaMazoMs = 0;
let autoTimer = null;
let ghostTimer = null;
let ultimoToque = null;

let hitos = nuevosHitos();
let ultimoMicroMensajeMs = 0;

let stats = cargarEstadisticas();

let CH = 76;
let OD = 14;
let OU = 24;

let dragState = null;
let dragClickSuppressUntil = 0;

// Efectos visuales pendientes: se aplican tras el siguiente render.
const fx = {
  colocadas: new Set(),
  volteadas: new Set(),
  sacudir: new Set()
};

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

function claveCarta(carta) {
  return `${carta.p}-${carta.n}`;
}

function copiarCarta(carta) {
  return { p: carta.p, n: carta.n, up: carta.up };
}

function bloqueado() {
  return partidaPerdida || partidaGanada || autoEnCurso;
}

// ═══════════════════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════════════════

function getAudioContext() {
  if (audioCtx) return audioCtx;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  audioCtx = new AudioContextCtor();
  return audioCtx;
}

function desbloquearAudio() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'suspended') return;
  ctx.resume().catch(() => {
    // Algunos navegadores bloquean el audio hasta una interacción explícita.
  });
}

function tocarConTimbre(ctx, frecuencia, timbre, start, gainValue) {
  const fin = start + timbre.duracion;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const osciladores = [];

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(timbre.corte, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + timbre.ataque);
  gain.gain.exponentialRampToValueAtTime(0.0001, fin);

  filter.connect(gain);
  gain.connect(ctx.destination);

  let lfo = null;
  let lfoGain = null;
  if (timbre.vibrato) {
    lfo = ctx.createOscillator();
    lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(timbre.vibrato.hz, start);
    lfoGain.gain.setValueAtTime(0.0001, start);
    // El vibrato entra poco a poco, como en un instrumento real.
    lfoGain.gain.linearRampToValueAtTime(timbre.vibrato.cents, start + timbre.duracion * 0.6);
    lfo.connect(lfoGain);
  }

  timbre.capas.forEach(capa => {
    const osc = ctx.createOscillator();
    const capaGain = ctx.createGain();
    const f = frecuencia * capa.mult;

    osc.type = capa.tipo;
    if (timbre.caida && capa.mult === 1) {
      osc.frequency.setValueAtTime(f * timbre.caida, start);
      osc.frequency.exponentialRampToValueAtTime(f, start + 0.03);
    } else {
      osc.frequency.setValueAtTime(f, start);
    }
    if (capa.detune) osc.detune.setValueAtTime(capa.detune, start);
    if (lfoGain) lfoGain.connect(osc.detune);

    capaGain.gain.setValueAtTime(capa.vol, start);
    osc.connect(capaGain);
    capaGain.connect(filter);
    osc.start(start);
    osc.stop(fin + 0.03);
    osciladores.push(osc);
  });

  if (lfo) {
    lfo.start(start);
    lfo.stop(fin + 0.03);
  }

  // Libera los nodos cuando la nota termina.
  osciladores[0].onended = () => {
    try {
      filter.disconnect();
      gain.disconnect();
      if (lfoGain) lfoGain.disconnect();
    } catch {
      // Nodo ya desconectado.
    }
  };
}

function tocarFrecuencia(frecuencia, opts = {}) {
  const ctx = getAudioContext();
  if (!ctx || !Number.isFinite(frecuencia)) return;

  desbloquearAudio();

  const delay = Math.max(0, Number(opts.delay || 0));
  const duration = Math.max(0.08, Number(opts.duration || AUDIO_CONFIG.DURACION_NOTA));
  const gainValue = Math.max(0.01, Number(opts.gain || AUDIO_CONFIG.GANANCIA_NOTA));
  const start = ctx.currentTime + delay;
  const end = start + duration;

  if (opts.timbre && TIMBRES[opts.timbre]) {
    tocarConTimbre(ctx, frecuencia, TIMBRES[opts.timbre], start, gainValue);
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = opts.type || 'sine';
  osc.frequency.setValueAtTime(frecuencia, start);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(end + 0.03);
  osc.onended = () => {
    try {
      filter.disconnect();
      gain.disconnect();
    } catch {
      // Nodo ya desconectado.
    }
  };
}

function tocarNota(notaIndex, opts = {}) {
  const frecuencia = FRECUENCIAS_CROMATICAS[notaIndex];
  tocarFrecuencia(frecuencia, opts);
}

function tocarCartaSubidaAFunda(carta, fi) {
  if (!carta) return;
  tocarNota(carta.n, {
    duration: AUDIO_CONFIG.DURACION_NOTA,
    gain: AUDIO_CONFIG.GANANCIA_NOTA,
    timbre: PALOS[carta.p].timbre
  });
  resaltarFundaSonora(fi);
}

function limpiarTimersEscalaFinal() {
  escalaFinalTimers.forEach(timerId => window.clearTimeout(timerId));
  escalaFinalTimers = [];
}

function resaltarFundaSonora(fi) {
  const el = q(`.funda[data-fi="${fi}"]`);
  if (!el) return;

  el.classList.remove('funda-sonando');
  void el.offsetWidth;
  el.classList.add('funda-sonando');

  window.setTimeout(() => {
    el.classList.remove('funda-sonando');
  }, 460);
}

function prepararUIEscalaFinal() {
  const notesEl = getEl('win-scale-notes');
  const foundationsEl = getEl('win-scale-foundations');

  if (notesEl) {
    notesEl.innerHTML = NOTAS.map((nota, idx) => `
      <span class="win-scale-note" data-note-index="${idx}">${nota}</span>
    `).join('');
  }

  if (foundationsEl) {
    foundationsEl.innerHTML = PALOS.map((palo, idx) => `
      <div class="win-scale-foundation ${palo.tipo}" data-foundation-index="${idx}">
        <span class="win-scale-icon">${palo.sym}</span>
        <strong class="win-scale-current-note">Do</strong>
        <small>${palo.nombre}</small>
      </div>
    `).join('');
  }
}

function actualizarUIEscalaFinal(notaIndex) {
  const notes = $$('.win-scale-note');
  const cards = $$('.win-scale-foundation');

  notes.forEach((note, idx) => {
    note.classList.toggle('is-active', idx === notaIndex);
    note.classList.toggle('is-played', idx <= notaIndex);
  });

  cards.forEach(card => {
    const noteEl = card.querySelector('.win-scale-current-note');
    if (noteEl) noteEl.textContent = NOTAS[notaIndex];

    card.classList.remove('is-playing');
    void card.offsetWidth;
    card.classList.add('is-playing');
  });
}

function reproducirEscalaCromaticaFinal() {
  limpiarTimersEscalaFinal();
  prepararUIEscalaFinal();

  NOTAS.forEach((nota, idx) => {
    const timerId = window.setTimeout(() => {
      actualizarUIEscalaFinal(idx);
      tocarNota(idx, {
        duration: AUDIO_CONFIG.DURACION_ESCALA,
        gain: AUDIO_CONFIG.GANANCIA_ESCALA
      });
    }, idx * AUDIO_CONFIG.PAUSA_ESCALA * 1000);

    escalaFinalTimers.push(timerId);
  });

  const limpiarActivoTimer = window.setTimeout(() => {
    $$('.win-scale-note').forEach(note => note.classList.remove('is-active'));
    $$('.win-scale-foundation').forEach(card => card.classList.remove('is-playing'));
  }, (NOTAS.length * AUDIO_CONFIG.PAUSA_ESCALA * 1000) + 260);

  escalaFinalTimers.push(limpiarActivoTimer);
}

// ═══════════════════════════════════════════════════════
// RELOJ, PUNTAJE Y ESTADÍSTICAS
// ═══════════════════════════════════════════════════════

function limpiarSeleccion() {
  sel = null;
}

function getElapsedSeconds() {
  const extra = relojDesdeMs === null ? 0 : Date.now() - relojDesdeMs;
  return Math.max(0, Math.floor((relojAcumuladoMs + extra) / 1000));
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

function actualizarOverlayGameOver() {
  setText('game-over-puntos', formatearNumero(puntos));
  setText('game-over-tiempo', formatearTiempo(getElapsedSeconds()));
  setText('game-over-movimientos', formatearNumero(movimientos));
}

function sumarPuntos(valor) {
  puntos += valor;
  if (puntos < 0) puntos = 0;
  if (puntos > picoPuntaje) picoPuntaje = puntos;
  actualizarHud();
}

// El récord se confirma al terminar o abandonar la partida (no en vivo),
// para que Deshacer no pueda dejar un récord inflado.
function confirmarRecord() {
  if (picoPuntaje > stats.bestScore) {
    stats.bestScore = picoPuntaje;
    persistirEstadisticas();
  }
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

function textoPorcentajeVictorias() {
  if (!stats.gamesPlayed) return '—';
  const pct = Math.min(100, Math.round((stats.gamesWon / stats.gamesPlayed) * 100));
  return `${pct}%`;
}

function actualizarHud() {
  setText('puntos', formatearNumero(puntos));
  setText('mejor-puntaje', formatearNumero(Math.max(stats.bestScore, picoPuntaje)));
  setText('partidas-ganadas', formatearNumero(stats.gamesWon));
  setText('porcentaje-victorias', textoPorcentajeVictorias());
  setText('racha-actual', formatearNumero(stats.currentStreak));
  setText('movimientos', formatearNumero(movimientos));
  setText('tiempo', formatearTiempo(getElapsedSeconds()));
  setText(
    'mejor-tiempo',
    stats.bestTimeSeconds == null ? '--:--' : formatearTiempo(stats.bestTimeSeconds)
  );
  setText('partidas-jugadas', formatearNumero(stats.gamesPlayed));
  actualizarOverlayVictoria();
  actualizarOverlayGameOver();
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

function buscarModoPorId(modeId) {
  return GAME_MODES.find(mode => mode.id === modeId) || GAME_MODES[0];
}

function getCurrentMode() {
  return buscarModoPorId(currentModeId);
}

function cargarModo() {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if (!raw) return GAME_MODES[0].id;
    return buscarModoPorId(raw).id;
  } catch {
    return GAME_MODES[0].id;
  }
}

function persistirModo() {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, currentModeId);
  } catch {
    // Sin storage disponible, seguimos sin bloquear el juego.
  }
}

function actualizarModoUI() {
  const modo = getCurrentMode();
  setText('modo-actual', modo.label);
  document.body.classList.toggle('dest-sutil', modo.destinos === 'sutil');
  document.body.classList.toggle('dest-visible', modo.destinos === 'visible');
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
  relojAcumuladoMs = 0;
  relojDesdeMs = Date.now();
  relojTimer = window.setInterval(actualizarHud, 1000);
  actualizarHud();
}

function reanudarReloj() {
  if (relojDesdeMs !== null) return;
  relojDesdeMs = Date.now();
  if (!relojTimer) relojTimer = window.setInterval(actualizarHud, 1000);
}

// Congela el tiempo: tras detener, getElapsedSeconds() ya no avanza.
function detenerReloj() {
  if (relojDesdeMs !== null) {
    relojAcumuladoMs += Date.now() - relojDesdeMs;
    relojDesdeMs = null;
  }
  if (relojTimer) {
    window.clearInterval(relojTimer);
    relojTimer = null;
  }
}

// ═══════════════════════════════════════════════════════
// LAYOUT
// ═══════════════════════════════════════════════════════

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

// Ancho útil real (sin padding del contenedor): las cartas se calculan sobre él.
function obtenerAnchoDisponibleJuego() {
  const contenedor = obtenerContenedorJuego();
  const estilo = window.getComputedStyle(contenedor);
  const padding = (parseFloat(estilo.paddingLeft) || 0) + (parseFloat(estilo.paddingRight) || 0);
  const width = Math.floor(
    (contenedor.clientWidth || contenedor.getBoundingClientRect().width || (window.innerWidth - 16)) - padding
  );
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

function calcularFirmaLayout() {
  return `${obtenerAnchoDisponibleJuego()}x${getViewportHeight()}`;
}

function programarRecalculoLayout() {
  // No recalcular mientras el usuario está arrastrando:
  // destruiría el DOM del ghost. Se pospone hasta soltar.
  if (dragState?.dragging) {
    layoutPendiente = true;
    return;
  }

  if (resizeRaf) {
    window.cancelAnimationFrame(resizeRaf);
  }

  resizeRaf = window.requestAnimationFrame(() => {
    resizeRaf = null;
    // Si el ancho/alto útil no cambió (p. ej. solo creció la altura del tablero
    // tras una jugada) no hace falta rehacer todo: así no se cortan las animaciones.
    const firma = calcularFirmaLayout();
    if (firma === firmaLayout) return;
    firmaLayout = firma;
    calcDims();
    renderizar();
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

  if (shellEl) resizeObserver.observe(shellEl);
  const appEl = getEl('app');
  if (appEl) resizeObserver.observe(appEl);
}

// ═══════════════════════════════════════════════════════
// REPARTO Y NUEVA PARTIDA
// ═══════════════════════════════════════════════════════

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

function repartirDesdeBaraja(baraja) {
  const mazoLocal = [];
  const fundasLocal = [[], [], [], []];
  const tableroLocal = Array.from({ length: 7 }, () => []);
  let i = 0;

  for (let c = 0; c < 7; c += 1) {
    for (let r = 0; r <= c; r += 1) {
      const carta = { ...baraja[i], up: (r === c) };
      tableroLocal[c].push(carta);
      i += 1;
    }
  }

  while (i < 52) {
    mazoLocal.push({ ...baraja[i], up: false });
    i += 1;
  }

  return { mazoLocal, fundasLocal, tableroLocal };
}

function evaluarSalidaInicial(tableroLocal) {
  let puntaje = 0;
  const topes = tableroLocal.map(col => col[col.length - 1]).filter(Boolean);

  // Aces visibles al inicio facilitan arrancar fundaciones.
  puntaje += topes.filter(carta => carta.n === 0).length * 9;

  // Reyes visibles ayudan a mover cartas hacia columnas vacías pronto.
  puntaje += topes.filter(carta => carta.n === 12).length * 4;

  // Premiar movimientos iniciales posibles entre topes.
  for (let i = 0; i < topes.length; i += 1) {
    for (let j = 0; j < topes.length; j += 1) {
      if (i === j) continue;
      if (
        PALOS[topes[i].p].tipo !== PALOS[topes[j].p].tipo &&
        topes[i].n === topes[j].n - 1
      ) {
        puntaje += 2;
      }
    }
  }

  // Menos penalización si en las primeras columnas queda menos bloqueo oculto.
  tableroLocal.forEach((col, idx) => {
    const ocultas = col.slice(0, -1).filter(carta => !carta.up).length;
    puntaje -= ocultas * (idx < 3 ? 2 : 1);
  });

  return puntaje;
}

function crearEscenarioInicial() {
  const mode = getCurrentMode();

  if (mode.dealStrategy === 'random') {
    const baraja = mezclar(crearBaraja());
    return repartirDesdeBaraja(baraja);
  }

  const attempts = Math.max(2, Number(mode.attempts || 2));
  let mejor = null;
  let mejorScore = mode.dealStrategy === 'worst_of' ? Infinity : -Infinity;

  for (let i = 0; i < attempts; i += 1) {
    const baraja = mezclar(crearBaraja());
    const escenario = repartirDesdeBaraja(baraja);
    const score = evaluarSalidaInicial(escenario.tableroLocal);

    if (mode.dealStrategy === 'best_of' && score > mejorScore) {
      mejorScore = score;
      mejor = escenario;
    }

    if (mode.dealStrategy === 'worst_of' && score < mejorScore) {
      mejorScore = score;
      mejor = escenario;
    }
  }

  return mejor || repartirDesdeBaraja(mezclar(crearBaraja()));
}

function nuevosHitos() {
  return {
    escala: false,
    primerFlip: false,
    todoVisible: false,
    crece: [false, false, false, false],
    completa: [false, false, false, false]
  };
}

// Limpia todo lo que sea transitorio (arrastre, pista, autocompletar, timers).
function detenerActividadTransitoria() {
  cancelarArrastre();
  limpiarTimersEscalaFinal();
  limpiarPista();
  detenerAutocompletar();
  window.clearTimeout(ayudaMazoTimer);
  ayudaMazoTimer = null;
  ultimoToque = null;
  fx.colocadas.clear();
  fx.volteadas.clear();
  fx.sacudir.clear();
}

function ocultarModalesFinales() {
  getEl('win')?.classList.add('oculto');
  getEl('game-over')?.classList.add('oculto');
}

function aplicarEscenario(mazoLocal, tableroLocal) {
  mazo = mazoLocal.map(copiarCarta);
  descarte = [];
  fundas = [[], [], [], []];
  tablero = tableroLocal.map(pila => pila.map(copiarCarta));
}

function reiniciarContadoresDePartida() {
  limpiarSeleccion();
  historial = [];
  puntos = 0;
  picoPuntaje = 0;
  movimientos = 0;
  partidaGanada = false;
  partidaPerdida = false;
  hitos = nuevosHitos();
  ultimoMicroMensajeMs = 0;
  versionEstado += 1;
  ocultarModalesFinales();
}

function comenzarPartidaVisual() {
  iniciarReloj();
  renderizar();
  verificarBloqueo();
  programarAyudaMazo();
}

function nuevaPartida() {
  detenerActividadTransitoria();
  confirmarRecord();

  if (partidaRegistrada && !partidaGanada) {
    stats.currentStreak = 0;
    persistirEstadisticas();
  }

  const escenario = crearEscenarioInicial();
  repartoInicial = {
    mazo: escenario.mazoLocal.map(copiarCarta),
    tablero: escenario.tableroLocal.map(pila => pila.map(copiarCarta))
  };

  aplicarEscenario(escenario.mazoLocal, escenario.tableroLocal);
  partidaRegistrada = false;
  reiniciarContadoresDePartida();
  comenzarPartidaVisual();
}

// Vuelve exactamente al reparto inicial de la partida actual.
// No cuenta como partida nueva: gamesPlayed no se vuelve a sumar.
function reiniciarPartida(forzar = false) {
  if (!repartoInicial) return;

  const enCurso = !partidaGanada && !partidaPerdida && movimientos >= 5;
  if (!forzar && enCurso && !window.confirm(MENSAJES.CONFIRMAR_REINICIO)) return;

  detenerActividadTransitoria();
  confirmarRecord();

  // Si la partida estaba bloqueada, ese intento cuenta como perdido.
  if (partidaPerdida) {
    stats.currentStreak = 0;
    stats.lastScore = puntos;
    persistirEstadisticas();
  }

  aplicarEscenario(repartoInicial.mazo, repartoInicial.tablero);
  reiniciarContadoresDePartida();
  comenzarPartidaVisual();
}

// ═══════════════════════════════════════════════════════
// REGLAS BÁSICAS
// ═══════════════════════════════════════════════════════

function puedeEnFundaDe(fundasRef, carta, fi) {
  const funda = fundasRef[fi];
  if (!funda) return false;

  if (funda.length === 0) return carta.n === 0;

  const tope = funda[funda.length - 1];
  return carta.p === tope.p && carta.n === tope.n + 1;
}

function puedeEnFunda(carta, fi) {
  return puedeEnFundaDe(fundas, carta, fi);
}

// Elige la fundación destino: para un Do, la de su propio palo si está libre.
function elegirFundaDe(fundasRef, carta) {
  if (carta.n === 0 && fundasRef[carta.p]?.length === 0) return carta.p;
  for (let fi = 0; fi < fundasRef.length; fi += 1) {
    if (puedeEnFundaDe(fundasRef, carta, fi)) return fi;
  }
  return -1;
}

function elegirFunda(carta) {
  return elegirFundaDe(fundas, carta);
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
    const carta = pila[pila.length - 1];
    carta.up = true;
    fx.volteadas.add(claveCarta(carta));
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

// ═══════════════════════════════════════════════════════
// TOASTS Y MICROMENSAJES
// ═══════════════════════════════════════════════════════

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

// Mensajes de personalidad: muy espaciados para no resultar invasivos.
function microMensaje(texto) {
  const ahora = Date.now();
  if (ahora - ultimoMicroMensajeMs < 7000) return false;
  ultimoMicroMensajeMs = ahora;
  toast(texto);
  return true;
}

function revisarHitos(info = {}) {
  const candidatos = [];
  const total = fundas.reduce((suma, f) => suma + f.length, 0);

  fundas.forEach((pila, fi) => {
    if (!pila.length) return;
    const palo = PALOS[pila[0].p];

    if (pila.length >= 13 && !hitos.completa[fi]) {
      hitos.completa[fi] = true;
      if (total < 52) candidatos.push(`${palo.sym} ${palo.nombre} completó su escala`);
    } else if (pila.length >= 7 && !hitos.crece[fi]) {
      hitos.crece[fi] = true;
      candidatos.push(`${palo.sym} ${palo.nombre} sigue creciendo`);
    }
  });

  if (total >= 4 && !hitos.escala) {
    hitos.escala = true;
    candidatos.push('🎵 La escala está tomando forma');
  }

  const hayOcultas = tablero.some(pila => pila.some(carta => !carta.up));
  if (!hayOcultas && !hitos.todoVisible) {
    hitos.todoVisible = true;
    candidatos.push('✨ Todo el tablero está a la vista');
  }

  if (info.volteos > 0 && !hitos.primerFlip) {
    hitos.primerFlip = true;
    candidatos.push('✨ Nueva carta descubierta');
  }

  if (info.bloque >= 3) candidatos.push('🎶 Buen movimiento');

  if (candidatos.length) microMensaje(candidatos[0]);
}

// ═══════════════════════════════════════════════════════
// HISTORIAL / DESHACER
// ═══════════════════════════════════════════════════════

function capturarEstado() {
  return {
    mazo: mazo.map(copiarCarta),
    descarte: descarte.map(copiarCarta),
    fundas: fundas.map(f => f.map(copiarCarta)),
    tablero: tablero.map(pila => pila.map(copiarCarta)),
    puntos,
    pico: picoPuntaje,
    movimientos
  };
}

function guardarEstado() {
  historial.push(capturarEstado());
  if (historial.length > MAX_HISTORIAL) historial.shift();
}

function deshacer() {
  if (partidaGanada || autoEnCurso) return;
  const snap = historial.pop();
  if (!snap) return;

  cancelarArrastre();
  limpiarPista();
  limpiarSeleccion();
  fx.colocadas.clear();
  fx.volteadas.clear();
  fx.sacudir.clear();

  mazo = snap.mazo;
  descarte = snap.descarte;
  fundas = snap.fundas;
  tablero = snap.tablero;
  puntos = snap.puntos;
  picoPuntaje = snap.pico;
  movimientos = snap.movimientos;
  versionEstado += 1;

  if (partidaPerdida) {
    partidaPerdida = false;
    getEl('game-over')?.classList.add('oculto');
    reanudarReloj();
  }

  renderizar();
  verificarBloqueo();
  programarAyudaMazo();
}

// ═══════════════════════════════════════════════════════
// ACCIONES DE JUEGO
// ═══════════════════════════════════════════════════════

function despuesDeJugada(info = {}) {
  versionEstado += 1;
  limpiarPista();
  renderizar();
  revisarHitos(info);
  if (!verificarVictoria()) verificarBloqueo();
  programarAyudaMazo();
}

function rechazarMovimiento(origen, mensaje) {
  const cartas = cartasDeOrigen(origen);
  if (cartas) cartas.forEach(carta => fx.sacudir.add(claveCarta(carta)));
  if (mensaje) toast(mensaje);
}

function onClickMazo() {
  if (bloqueado()) return;
  limpiarSeleccion();
  ultimoToque = null;

  if (mazo.length === 0) {
    if (descarte.length === 0) {
      renderizar();
      return;
    }

    guardarEstado();
    registrarMovimiento();
    mazo = descarte.reverse().map(carta => ({ ...carta, up: false }));
    descarte = [];
    sumarPuntos(-PUNTAJES.RECICLAR);
    toast(MENSAJES.RECICLADO);
    despuesDeJugada();
    return;
  }

  guardarEstado();
  registrarMovimiento();
  const carta = mazo.pop();
  carta.up = true;
  descarte.push(carta);
  sumarPuntos(PUNTAJES.ROBAR_MAZO);
  despuesDeJugada();
}

function esDobleToque(carta) {
  const clave = claveCarta(carta);
  const ahora = performance.now();
  const es = ultimoToque && ultimoToque.clave === clave && ahora - ultimoToque.t < DOBLE_TOQUE_MS;
  ultimoToque = es ? null : { clave, t: ahora };
  return es;
}

function intentarEnviarAFunda(origen) {
  const cartas = cartasDeOrigen(origen);
  if (!cartas || cartas.length !== 1) return false;

  const fi = elegirFunda(cartas[0]);
  if (fi < 0) return false;
  return moverDesdeOrigenAFunda(origen, fi, { silencioso: true });
}

function onClickDescarte() {
  if (bloqueado()) return;
  if (!descarte.length) return;

  // Doble clic / doble toque: sube a la fundación si es legal.
  if (esDobleToque(descarte[descarte.length - 1]) && intentarEnviarAFunda({ zona: 'descarte' })) {
    return;
  }

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
  if (!cartas) return false;

  if (origen.zona === 'tablero' && origen.col === col) return false;

  if (!puedeEnTablero(cartas[0], col)) {
    if (opts.sacudir) {
      const vacia = tablero[col].length === 0;
      rechazarMovimiento(origen, !opts.silencioso && vacia ? MENSAJES.SOLO_MAXIMA_VACIA : null);
    }
    return false;
  }

  guardarEstado();
  registrarMovimiento();
  fx.volteadas.clear();
  const movidas = extraerCartasDesdeOrigen(origen);
  const volteos = fx.volteadas.size;
  tablero[col].push(...movidas);
  movidas.forEach(carta => fx.colocadas.add(claveCarta(carta)));

  if (origen.zona === 'funda') {
    // Bajar de fundación cuesta puntos (como indican las reglas).
    sumarPuntos(-PUNTAJES.DEVOLVER_FUNDA);
  } else {
    sumarPuntos(PUNTAJES.MOVER_TABLERO);
  }

  limpiarSeleccion();
  ultimoToque = null;
  despuesDeJugada({ volteos, bloque: movidas.length });
  return true;
}

function moverDesdeOrigenAFunda(origen, fi, opts = {}) {
  const cartas = cartasDeOrigen(origen);

  if (!cartas || cartas.length !== 1 || !puedeEnFunda(cartas[0], fi)) {
    if (opts.sacudir) rechazarMovimiento(origen, null);
    return false;
  }

  guardarEstado();
  registrarMovimiento();
  fx.volteadas.clear();
  const movidas = extraerCartasDesdeOrigen(origen);
  const volteos = fx.volteadas.size;
  fundas[fi].push(movidas[0]);
  tocarCartaSubidaAFunda(movidas[0], fi);
  sumarPuntos(PUNTAJES.MOVER_FUNDA);

  limpiarSeleccion();
  ultimoToque = null;
  despuesDeJugada({ volteos });
  return true;
}

function onClickFunda(fi) {
  if (bloqueado()) return;
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

  if (moverDesdeOrigenAFunda(sel, fi, { sacudir: true })) return;

  if (pila.length) {
    sel = { zona: 'funda', fi };
  } else {
    limpiarSeleccion();
  }
  renderizar();
}

function onClickCarta(col, idx) {
  if (bloqueado()) return;
  const pila = tablero[col];
  if (!pila || idx < 0 || idx >= pila.length) return;

  const carta = pila[idx];
  if (!carta.up) {
    limpiarSeleccion();
    renderizar();
    return;
  }

  // Doble clic / doble toque sobre la carta superior: a la fundación si es legal.
  if (idx === pila.length - 1 && esDobleToque(carta) && elegirFunda(carta) >= 0) {
    if (intentarEnviarAFunda({ zona: 'tablero', col, idx })) return;
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

    if (moverDesdeOrigenATablero(sel, col, { silencioso: true })) return;
  }

  sel = { zona: 'tablero', col, idx };
  renderizar();
}

function onClickColVacia(col) {
  if (bloqueado()) return;
  if (!sel) return;

  if (moverDesdeOrigenATablero(sel, col, { sacudir: true })) return;

  limpiarSeleccion();
  renderizar();
}

function verificarVictoria() {
  const gano = fundas.every(funda => funda.length === 13);
  if (!gano || partidaGanada) return partidaGanada;

  registrarInicioPartida();
  partidaGanada = true;
  autoEnCurso = false;
  detenerReloj();
  limpiarSeleccion();

  const tiempoFinal = getElapsedSeconds();
  stats.gamesWon += 1;
  stats.currentStreak += 1;
  stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  stats.lastScore = puntos;

  if (stats.bestTimeSeconds == null || tiempoFinal < stats.bestTimeSeconds) {
    stats.bestTimeSeconds = tiempoFinal;
  }

  confirmarRecord();
  persistirEstadisticas();
  actualizarHud();
  actualizarControles();

  setTimeout(() => {
    if (!partidaGanada) return;
    actualizarOverlayVictoria();
    const win = getEl('win');
    if (win) win.classList.remove('oculto');
    reproducirEscalaCromaticaFinal();
  }, 320);

  return true;
}

// ═══════════════════════════════════════════════════════
// MOTOR DE ANÁLISIS (bloqueo, pistas)
//
// Una carta se representa por su id = palo*13 + nota.
// El análisis distingue tres tipos de jugada:
//  - PROGRESO: voltea una carta oculta, sube a una fundación (neto) o
//    coloca una carta del mazo/descarte (irreversible y finito).
//  - NEUTRA: reordena cartas ya visibles (tablero↔tablero sin voltear,
//    fundación→tablero). Es reversible, así que nunca cuenta por sí sola
//    como "movimiento disponible": solo sirve si lleva a un progreso.
// Se hace una búsqueda en anchura sobre las jugadas neutras; si ningún
// estado alcanzable ofrece progreso, la partida está realmente bloqueada.
// ═══════════════════════════════════════════════════════

const idDe = carta => carta.p * 13 + carta.n;
const nDe = id => id % 13;
const pDe = id => Math.floor(id / 13);
const tipoDe = id => (PALOS[pDe(id)].tipo === 'oscuro' ? 0 : 1);

function crearEstadoAnalisis() {
  const ups = [];
  const downs = [];

  tablero.forEach(pila => {
    let ocultas = 0;
    while (ocultas < pila.length && !pila[ocultas].up) ocultas += 1;
    downs.push(ocultas);
    ups.push(pila.slice(ocultas).map(idDe));
  });

  const fund = fundas.map(f => (f.length ? idDe(f[f.length - 1]) : -1));
  return { ups, downs, fund };
}

function puedeFundaId(id, tope) {
  if (tope < 0) return nDe(id) === 0;
  return pDe(tope) === pDe(id) && nDe(id) === nDe(tope) + 1;
}

function puedeTableroId(id, U, D) {
  if (!U.length) return D === 0 && nDe(id) === REY;
  const tope = U[U.length - 1];
  return tipoDe(id) !== tipoDe(tope) && nDe(id) === nDe(tope) - 1;
}

function elegirFundaId(id, fund) {
  if (nDe(id) === 0 && fund[pDe(id)] < 0) return pDe(id);
  for (let fi = 0; fi < fund.length; fi += 1) {
    if (puedeFundaId(id, fund[fi])) return fi;
  }
  return -1;
}

function totalFundas(fund) {
  return fund.reduce((suma, tope) => suma + (tope < 0 ? 0 : nDe(tope) + 1), 0);
}

function claveEstado(est) {
  return `${est.ups.map(u => u.join('.')).join('|')}#${est.fund.join('.')}`;
}

function hayReyDisponible(est, cand) {
  return (
    cand.some(id => nDe(id) === REY) ||
    est.ups.some((U, c) => est.downs[c] > 0 && U.length && nDe(U[0]) === REY)
  );
}

// Jugadas que hacen avanzar la partida desde un estado.
// cat: 1 voltea carta · 2 fundación · 3 libera columna · 4 desde mazo/descarte
function listarProgreso(est, cand, totalInicial) {
  const res = [];
  const { ups, downs, fund } = est;
  const total = totalFundas(fund);

  for (let c = 0; c < ups.length; c += 1) {
    const U = ups[c];
    if (!U.length) continue;

    for (let i = 0; i < U.length; i += 1) {
      const id = U[i];
      const voltea = i === 0 && downs[c] > 0;

      if (voltea) {
        for (let j = 0; j < ups.length; j += 1) {
          if (j !== c && puedeTableroId(id, ups[j], downs[j])) {
            res.push({ tipo: 'tt', col: c, i, dest: j, cat: 1, peso: downs[c] });
          }
        }
      }

      if (i === U.length - 1) {
        const fi = elegirFundaId(id, fund);
        if (fi >= 0) {
          if (voltea) res.push({ tipo: 'tf', col: c, i, fi, cat: 1, peso: downs[c] });
          else if (total >= totalInicial) res.push({ tipo: 'tf', col: c, i, fi, cat: 2, peso: 0 });
        }
      }
    }
  }

  // Liberar una columna solo es progreso si hay un Do↑ esperando para usarla.
  const hayVacia = ups.some((U, c) => !U.length && downs[c] === 0);
  if (!hayVacia && hayReyDisponible(est, cand)) {
    for (let c = 0; c < ups.length; c += 1) {
      const U = ups[c];
      if (!U.length || downs[c] > 0) continue;
      for (let j = 0; j < ups.length; j += 1) {
        if (j !== c && ups[j].length && puedeTableroId(U[0], ups[j], downs[j])) {
          res.push({ tipo: 'tt', col: c, i: 0, dest: j, cat: 3, peso: U.length });
        }
      }
    }
  }

  cand.forEach(id => {
    const fi = elegirFundaId(id, fund);
    if (fi >= 0) res.push({ tipo: 'sf', id, fi, cat: 2, peso: 0 });
    for (let j = 0; j < ups.length; j += 1) {
      if (puedeTableroId(id, ups[j], downs[j])) {
        res.push({ tipo: 'st', id, dest: j, cat: 4, peso: 0 });
      }
    }
  });

  return res;
}

// Jugadas reversibles que solo reordenan lo que ya se ve.
function listarNeutros(est, permitirFunda, totalInicial) {
  const res = [];
  const { ups, downs, fund } = est;

  for (let c = 0; c < ups.length; c += 1) {
    const U = ups[c];
    for (let i = 0; i < U.length; i += 1) {
      if (i === 0 && downs[c] > 0) continue; // eso voltearía una carta: es progreso
      for (let j = 0; j < ups.length; j += 1) {
        // Mover a una columna vacía solo sería cambiar de sitio: sin sentido.
        if (j === c || !ups[j].length) continue;
        if (puedeTableroId(U[i], ups[j], downs[j])) res.push({ tipo: 'tt', col: c, i, dest: j });
      }
    }
  }

  if (permitirFunda) {
    const total = totalFundas(fund);

    // Devolver al tablero una carta que antes se había bajado de la fundación.
    if (total < totalInicial) {
      for (let c = 0; c < ups.length; c += 1) {
        const U = ups[c];
        if (!U.length || (U.length === 1 && downs[c] > 0)) continue;
        const fi = elegirFundaId(U[U.length - 1], fund);
        if (fi >= 0) res.push({ tipo: 'tf', col: c, i: U.length - 1, fi });
      }
    }

    for (let fi = 0; fi < fund.length; fi += 1) {
      if (fund[fi] < 0) continue;
      for (let j = 0; j < ups.length; j += 1) {
        if (puedeTableroId(fund[fi], ups[j], downs[j])) res.push({ tipo: 'ft', fi, dest: j });
      }
    }
  }

  return res;
}

function aplicarNeutro(est, mv) {
  const ups = est.ups.map(u => u.slice());
  const fund = est.fund.slice();

  if (mv.tipo === 'tt') {
    const corrida = ups[mv.col].splice(mv.i);
    ups[mv.dest].push(...corrida);
  } else if (mv.tipo === 'tf') {
    const id = ups[mv.col].pop();
    fund[mv.fi] = id;
  } else if (mv.tipo === 'ft') {
    const id = fund[mv.fi];
    fund[mv.fi] = nDe(id) === 0 ? -1 : id - 1;
    ups[mv.dest].push(id);
  }

  return { ups, downs: est.downs, fund };
}

function mejorJugada(lista) {
  return lista.reduce((mejor, mv) => {
    if (!mejor) return mv;
    if (mv.cat !== mejor.cat) return mv.cat < mejor.cat ? mv : mejor;
    return mv.peso > mejor.peso ? mv : mejor;
  }, null);
}

// Búsqueda en anchura. Devuelve { jugada } con la primera jugada a hacer,
// { limite: true } si se agotó el presupuesto, o null si no hay progreso posible.
function buscarProgreso(cand, permitirFunda) {
  const inicial = crearEstadoAnalisis();
  const totalInicial = totalFundas(inicial.fund);
  const visitados = new Set([claveEstado(inicial)]);
  const cola = [{ est: inicial, primera: null }];

  for (let cabeza = 0; cabeza < cola.length; cabeza += 1) {
    const { est, primera } = cola[cabeza];
    const progreso = listarProgreso(est, cand, totalInicial);

    if (progreso.length) {
      return { jugada: primera || mejorJugada(progreso) };
    }

    if (visitados.size > LIMITE_ESTADOS_ANALISIS) return { limite: true };

    listarNeutros(est, permitirFunda, totalInicial).forEach(mv => {
      const nuevo = aplicarNeutro(est, mv);
      const clave = claveEstado(nuevo);
      if (visitados.has(clave)) return;
      visitados.add(clave);
      cola.push({ est: nuevo, primera: primera || mv });
    });
  }

  return null;
}

function calcularAnalisis() {
  const tope = descarte.length ? [idDe(descarte[descarte.length - 1])] : [];
  const todas = [...mazo, ...descarte].map(idDe);
  let incierto = false;

  // A) Hay progreso con lo que se ve ahora mismo (incluye la carta del descarte).
  for (const permitirFunda of [false, true]) {
    const r = buscarProgreso(tope, permitirFunda);
    if (r?.limite) incierto = true;
    else if (r) return { estado: 'progreso', jugada: r.jugada };
  }

  // B) No se ve nada, pero revisando el mazo aparece una jugada.
  if (todas.length > tope.length) {
    for (const permitirFunda of [false, true]) {
      const r = buscarProgreso(todas, permitirFunda);
      if (r?.limite) incierto = true;
      else if (r) return { estado: 'mazo', jugada: r.jugada };
    }
  }

  // C) Nada permite avanzar. Si el análisis fue truncado preferimos no condenar la partida.
  return { estado: incierto ? 'incierto' : 'bloqueada' };
}

function analizar() {
  if (analisisCache && analisisCache.version === versionEstado) return analisisCache.res;
  const res = calcularAnalisis();
  analisisCache = { version: versionEstado, res };
  return res;
}

// ═══════════════════════════════════════════════════════
// PARTIDA BLOQUEADA
// ═══════════════════════════════════════════════════════

function mostrarBloqueo() {
  if (partidaGanada || partidaPerdida) return;

  partidaPerdida = true;
  limpiarSeleccion();
  cancelarArrastre();
  limpiarPista();
  detenerReloj();
  window.clearTimeout(ayudaMazoTimer);
  ayudaMazoTimer = null;

  if (partidaRegistrada) {
    confirmarRecord();
    stats.lastScore = puntos;
    persistirEstadisticas();
  }

  actualizarHud();
  actualizarOverlayGameOver();
  actualizarControles();
  renderizar();

  const gameOver = getEl('game-over');
  if (gameOver) {
    gameOver.classList.remove('oculto');
    getEl('game-over-again-btn')?.focus({ preventScroll: true });
  }
}

function verificarBloqueo() {
  if (partidaGanada || partidaPerdida || autoEnCurso) return;
  if (analizar().estado === 'bloqueada') mostrarBloqueo();
}

// Ayuda discreta: si no hay jugadas visibles pero el mazo aún ofrece algo,
// y el jugador lleva un rato quieto, se le recuerda revisar el mazo (máx. 1 vez por minuto).
function programarAyudaMazo() {
  window.clearTimeout(ayudaMazoTimer);
  ayudaMazoTimer = null;
  if (bloqueado()) return;
  if (analizar().estado !== 'mazo') return;

  ayudaMazoTimer = window.setTimeout(() => {
    ayudaMazoTimer = null;
    const intro = getEl('intro');
    if (bloqueado() || (intro && !intro.classList.contains('oculto'))) return;
    if (Date.now() - ultimaAyudaMazoMs < 60000) return;
    ultimaAyudaMazoMs = Date.now();
    pulsarMazo();
    toast(MENSAJES.REVISA_MAZO);
  }, 7000);
}

// ═══════════════════════════════════════════════════════
// PISTAS
// ═══════════════════════════════════════════════════════

function limpiarPista() {
  pistaTimers.forEach(timerId => window.clearTimeout(timerId));
  pistaTimers = [];
  $$('.pista-origen, .pista-destino').forEach(el => {
    el.classList.remove('pista-origen', 'pista-destino');
  });
}

function pulsarMazo() {
  const mazoEl = getEl('mazo');
  if (!mazoEl) return;
  mazoEl.classList.add('pista-destino');
  pistaTimers.push(window.setTimeout(() => mazoEl.classList.remove('pista-destino'), 2600));
}

function contarOcultas(pila) {
  let ocultas = 0;
  while (ocultas < pila.length && !pila[ocultas].up) ocultas += 1;
  return ocultas;
}

// Traduce una jugada del motor a elementos de la interfaz.
function jugadaAInterfaz(mv) {
  if (mv.tipo === 'tt') {
    return {
      origen: { zona: 'tablero', col: mv.col, idx: contarOcultas(tablero[mv.col]) + mv.i },
      destino: { zona: 'tablero', col: mv.dest }
    };
  }
  if (mv.tipo === 'tf') {
    return {
      origen: { zona: 'tablero', col: mv.col, idx: contarOcultas(tablero[mv.col]) + mv.i },
      destino: { zona: 'funda', fi: mv.fi }
    };
  }
  if (mv.tipo === 'ft') {
    return { origen: { zona: 'funda', fi: mv.fi }, destino: { zona: 'tablero', col: mv.dest } };
  }

  const topeDescarte = descarte[descarte.length - 1];
  if (!topeDescarte || idDe(topeDescarte) !== mv.id) return null;
  return {
    origen: { zona: 'descarte' },
    destino: mv.tipo === 'sf' ? { zona: 'funda', fi: mv.fi } : { zona: 'tablero', col: mv.dest }
  };
}

function elementosDeOrigen(origen) {
  if (origen.zona === 'descarte') return $$('#descarte .card');
  if (origen.zona === 'funda') return $$(`.funda[data-fi="${origen.fi}"] .card`);
  return $$('.cwrap', q(`.col[data-col="${origen.col}"]`) || document)
    .filter(wrap => Number(wrap.dataset.idx) >= origen.idx)
    .map(wrap => wrap.querySelector('.card'))
    .filter(Boolean);
}

function elementoDeDestino(destino) {
  if (destino.zona === 'funda') return q(`.funda[data-fi="${destino.fi}"]`);
  return q(`.col[data-col="${destino.col}"]`);
}

function señalarJugada(ui) {
  elementosDeOrigen(ui.origen).forEach(el => el.classList.add('pista-origen'));

  pistaTimers.push(window.setTimeout(() => {
    const destinoEl = elementoDeDestino(ui.destino);
    if (destinoEl) destinoEl.classList.add('pista-destino');
  }, 750));

  pistaTimers.push(window.setTimeout(limpiarPista, 3400));
}

function mostrarPista() {
  if (bloqueado()) return;

  limpiarPista();
  limpiarSeleccion();
  renderizar();

  const analisis = analizar();

  if (analisis.estado === 'bloqueada') {
    mostrarBloqueo();
    return;
  }

  if (analisis.estado === 'mazo') {
    pulsarMazo();
    toast(MENSAJES.REVISA_MAZO);
    return;
  }

  const ui = analisis.estado === 'progreso' ? jugadaAInterfaz(analisis.jugada) : null;
  if (!ui) {
    toast(MENSAJES.SIN_PISTA);
    return;
  }

  señalarJugada(ui);
}

// ═══════════════════════════════════════════════════════
// AUTOCOMPLETAR
// ═══════════════════════════════════════════════════════

// Siguiente carta que puede subir a una fundación (siempre la más grave: forma una escala).
function siguienteAuto(est) {
  let mejor = null;

  const considerar = (carta, origen) => {
    const fi = elegirFundaDe(est.fundas, carta);
    if (fi < 0) return;
    if (
      !mejor ||
      carta.n < mejor.carta.n ||
      (carta.n === mejor.carta.n && carta.p < mejor.carta.p)
    ) {
      mejor = { carta, origen, fi };
    }
  };

  est.tablero.forEach((pila, col) => {
    const carta = pila[pila.length - 1];
    if (carta?.up) considerar(carta, { zona: 'tablero', col });
  });
  est.descarte.forEach((carta, pos) => considerar(carta, { zona: 'descarte', pos }));
  est.mazo.forEach((carta, pos) => considerar(carta, { zona: 'mazo', pos }));

  return mejor;
}

function aplicarPasoAuto(est, paso) {
  const { origen, carta, fi } = paso;
  if (origen.zona === 'tablero') est.tablero[origen.col].pop();
  else if (origen.zona === 'descarte') est.descarte.splice(origen.pos, 1);
  else est.mazo.splice(origen.pos, 1);
  est.fundas[fi].push(carta);
}

function puedeAutocompletar() {
  if (partidaGanada || partidaPerdida || autoEnCurso) return false;
  if (tablero.some(pila => pila.some(carta => !carta.up))) return false;
  if (fundas.every(f => f.length === 13)) return false;

  const est = {
    tablero: tablero.map(pila => pila.slice()),
    descarte: descarte.slice(),
    mazo: mazo.slice(),
    fundas: fundas.map(f => f.slice())
  };

  let paso = siguienteAuto(est);
  while (paso) {
    aplicarPasoAuto(est, paso);
    paso = siguienteAuto(est);
  }

  return est.fundas.every(f => f.length === 13);
}

function detenerAutocompletar() {
  autoEnCurso = false;
  if (autoTimer) {
    window.clearTimeout(autoTimer);
    autoTimer = null;
  }
}

function ejecutarPasoAuto() {
  const paso = siguienteAuto({ tablero, descarte, mazo, fundas });
  if (!paso) return false;

  registrarMovimiento();
  aplicarPasoAuto({ tablero, descarte, mazo, fundas }, paso);
  tocarCartaSubidaAFunda(paso.carta, paso.fi);
  sumarPuntos(PUNTAJES.MOVER_FUNDA);
  versionEstado += 1;
  renderizar();
  return true;
}

function iniciarAutocompletar() {
  if (!puedeAutocompletar()) return;

  limpiarSeleccion();
  limpiarPista();
  window.clearTimeout(ayudaMazoTimer);
  historial = [];
  autoEnCurso = true;
  registrarInicioPartida();
  actualizarControles();

  const pendientes = 52 - fundas.reduce((suma, f) => suma + f.length, 0);
  const intervalo = pendientes > 30 ? 85 : 115;

  const paso = () => {
    autoTimer = null;
    if (!autoEnCurso) return;

    const hecho = ejecutarPasoAuto();
    const completo = fundas.every(f => f.length === 13);

    if (!hecho || completo) {
      autoEnCurso = false;
      despuesDeJugada();
      return;
    }

    autoTimer = window.setTimeout(paso, intervalo);
  };

  paso();
}

// ═══════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════

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
    <div class="card face ${palo.tipo}${selClass}${dragClass}" data-k="${claveCarta(carta)}" aria-label="${nota} ${palo.nombre}">
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
    const pila = Array.isArray(tablero[col]) ? tablero[col] : [];

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

// Resalta (muy sutilmente) a dónde puede ir la carta seleccionada o arrastrada.
function marcarDestinosValidos() {
  $$('.dest-ok').forEach(el => el.classList.remove('dest-ok'));

  if (!getCurrentMode().destinos) return;
  const origen = origenActivo();
  const cartas = origen ? cartasDeOrigen(origen) : null;
  if (!cartas?.length) return;

  for (let col = 0; col < tablero.length; col += 1) {
    if (origen.zona === 'tablero' && origen.col === col) continue;
    if (puedeEnTablero(cartas[0], col)) q(`.col[data-col="${col}"]`)?.classList.add('dest-ok');
  }

  if (cartas.length === 1) {
    const fi = elegirFunda(cartas[0]);
    if (fi >= 0 && !(origen.zona === 'funda' && origen.fi === fi)) {
      q(`.funda[data-fi="${fi}"]`)?.classList.add('dest-ok');
    }
  }
}

function aplicarFx() {
  const app = getEl('app');
  if (!app) return;

  const aplicar = (conjunto, clase) => {
    if (!conjunto.size) return;
    $$('.card[data-k]', app).forEach(el => {
      if (conjunto.has(el.dataset.k)) el.classList.add(clase);
    });
    conjunto.clear();
  };

  aplicar(fx.colocadas, 'fx-place');
  aplicar(fx.volteadas, 'fx-flip');
  aplicar(fx.sacudir, 'fx-shake');
}

function actualizarControles() {
  const deshacerBtn = getEl('deshacer-btn');
  const pistaBtn = getEl('pista-btn');
  const autoBtn = getEl('auto-btn');

  if (deshacerBtn) deshacerBtn.disabled = historial.length === 0 || partidaGanada || autoEnCurso;
  const modalDeshacerBtn = getEl('game-over-undo-btn');
  if (modalDeshacerBtn) modalDeshacerBtn.disabled = historial.length === 0;
  if (pistaBtn) pistaBtn.disabled = partidaGanada || partidaPerdida || autoEnCurso;
  if (autoBtn) autoBtn.hidden = !puedeAutocompletar();
}

function renderizar() {
  actualizarHud();
  renderMazo();
  renderDescarte();
  renderFundas();
  renderTablero();
  limpiarDestinosDeArrastre();
  marcarDestinosValidos();
  aplicarFx();
  actualizarControles();
}

// ═══════════════════════════════════════════════════════
// ARRASTRE
// ═══════════════════════════════════════════════════════

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

function eliminarGhostsHuerfanos() {
  window.clearTimeout(ghostTimer);
  ghostTimer = null;
  $$('#drag-layer').forEach(layer => layer.remove());
}

function crearGhostArrastre(cartas) {
  eliminarGhostsHuerfanos();

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

  const ghostData = crearGhostArrastre(cartas);

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

// conservarGhost: deja el ghost en pantalla para animar su regreso.
function cancelarArrastre({ conservarGhost = false } = {}) {
  if (!conservarGhost) eliminarGhostsHuerfanos();
  limpiarDestinosDeArrastre();
  document.body.classList.remove('is-dragging');
  dragState = null;

  if (layoutPendiente) {
    layoutPendiente = false;
    programarRecalculoLayout();
  }
}

// El ghost vuelve suavemente a la posición original de la carta.
function devolverGhost(ghostInfo, origen) {
  const primera = elementosDeOrigen(origen)[0];
  if (!ghostInfo?.layer || !ghostInfo.ghost) return;

  if (!primera) {
    ghostInfo.layer.remove();
    return;
  }

  const rect = primera.getBoundingClientRect();
  ghostInfo.ghost.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out';
  ghostInfo.ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  ghostInfo.ghost.style.opacity = '0.55';

  ghostTimer = window.setTimeout(() => {
    ghostTimer = null;
    ghostInfo.layer.remove();
  }, 200);
}

function onPointerDownGlobal(event) {
  limpiarPista();
  if (bloqueado()) return;
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
  if (target.zona === 'tablero') {
    return moverDesdeOrigenATablero(origin, target.col, { silencioso: true, sacudir: true });
  }
  if (target.zona === 'funda') {
    return moverDesdeOrigenAFunda(origin, target.fi, { silencioso: true, sacudir: true });
  }
  return false;
}

function onPointerUpGlobal(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const wasDragging = dragState.dragging;
  const origin = dragState.origin;

  if (!wasDragging) {
    dragState = null;
    return;
  }

  const ghostInfo = { layer: dragState.layer, ghost: dragState.ghost };
  const target = resolverDestinoDesdePunto(event.clientX, event.clientY);

  dragClickSuppressUntil = Date.now() + 250;
  ultimoToque = null;
  cancelarArrastre({ conservarGhost: true });
  limpiarSeleccion();

  if (resolverMovimientoArrastre(origin, target)) {
    ghostInfo.layer.remove();
    return;
  }

  // Movimiento no válido: la carta se sacude y vuelve a su sitio.
  renderizar();
  devolverGhost(ghostInfo, origin);
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

// ═══════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════

function initEventos() {
  const mazoEl = getEl('mazo');
  const descarteEl = getEl('descarte');
  const tableroArea = getEl('tablero-area');
  const modoPill = getEl('modo-pill');

  document.addEventListener('pointerdown', desbloquearAudio, { passive: true });
  document.addEventListener('keydown', desbloquearAudio);

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

  // Si la ventana pierde el foco a mitad de un arrastre, se cancela limpiamente.
  window.addEventListener('blur', () => {
    if (!dragState) return;
    cancelarArrastre();
    renderizar();
  });

  getEl('nueva-btn')?.addEventListener('click', nuevaPartida);
  getEl('play-again-btn')?.addEventListener('click', nuevaPartida);
  getEl('game-over-again-btn')?.addEventListener('click', nuevaPartida);
  getEl('game-over-restart-btn')?.addEventListener('click', () => reiniciarPartida(true));
  getEl('game-over-undo-btn')?.addEventListener('click', deshacer);
  getEl('reiniciar-btn')?.addEventListener('click', () => reiniciarPartida(false));
  getEl('deshacer-btn')?.addEventListener('click', deshacer);
  getEl('pista-btn')?.addEventListener('click', mostrarPista);
  getEl('auto-btn')?.addEventListener('click', iniciarAutocompletar);
  getEl('reciclar-btn')?.addEventListener('click', onClickMazo);
  getEl('ayuda-btn')?.addEventListener('click', () => toast(MENSAJES.AYUDA));

  getEl('reset-stats-btn')?.addEventListener('click', () => {
    const confirmado = window.confirm(
      '¿Borrar el historial de puntajes y estadísticas guardado en este dispositivo?'
    );

    if (!confirmado) return;
    resetearEstadisticas();
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      deshacer();
    }
  });

  // Guarda el récord si se cierra la pestaña a mitad de partida.
  window.addEventListener('pagehide', confirmarRecord);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') confirmarRecord();
  });

  const cambiarModo = () => {
    const enCurso = partidaRegistrada && !partidaGanada && !partidaPerdida && movimientos >= 5;
    if (enCurso && !window.confirm(MENSAJES.CONFIRMAR_MODO)) return;

    const idx = GAME_MODES.findIndex(mode => mode.id === currentModeId);
    const next = GAME_MODES[(idx + 1) % GAME_MODES.length];
    currentModeId = next.id;
    persistirModo();
    actualizarModoUI();
    toast(`Modo ${next.label}`);
    nuevaPartida();
  };

  modoPill?.addEventListener('click', cambiarModo);
  modoPill?.addEventListener('keydown', event => onKeyActivate(event, cambiarModo));
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
  firmaLayout = calcularFirmaLayout();
  initEventos();
  initLayoutObservers();
  initIntro();
  actualizarModoUI();
  actualizarHud();
  nuevaPartida();
});

window.addEventListener('resize', programarRecalculoLayout);
window.addEventListener('orientationchange', programarRecalculoLayout);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', programarRecalculoLayout);
}
