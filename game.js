/* ════════════════════════════════════════════════════════════
   SOLITARIO MUSICAL CROMÁTICO — game.js
   Klondike clásico con notas musicales cromáticas.

   Rangos (13):
   Do, Do♯, Re, Re♯, Mi, Fa, Fa♯, Sol, Sol♯, La, La♯, Si, Do↑

   Palos (4):
   🎹 🥁 (oscuros)
   🎸 🎺 (claros)

   Reglas base:
   - Do = valor mínimo, inicia fundaciones
   - Do↑ = valor máximo, abre columnas vacías
   - Fundaciones suben por palo exacto
   - Tablero baja alternando tipo (oscuro/claro)

   Interacción:
   - Toque/click simple
   - 1er toque en carta: selecciona
   - 2do toque en destino: intenta mover
   - Toque en mazo: roba carta

   Puntuación:
   +2  robar del mazo
   +5  voltear carta boca abajo
   +5  mover a columna
   +10 mover a fundación
   -15 reciclar descarte
   ════════════════════════════════════════════════════════════ */

'use strict';

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
  RECICLADO: 'Se recicló el descarte'
};

/* ────────────────────────────────────────────────────────────
   ESTADO DEL JUEGO
──────────────────────────────────────────────────────────── */

let mazo = [];
let descarte = [];
let fundas = [[], [], [], []];
let tablero = [];
let sel = null; // { zona, col?, idx? }
let puntos = 0;

// Dimensiones calculadas dinámicamente
let CH = 76;
let OD = 14;
let OU = 24;

// Toast
let toastTimer = null;

/* ────────────────────────────────────────────────────────────
   HELPERS DOM
──────────────────────────────────────────────────────────── */

const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function getEl(id) {
  return document.getElementById(id);
}

/* ────────────────────────────────────────────────────────────
   HELPERS GENERALES
──────────────────────────────────────────────────────────── */

function cartaToTexto(carta) {
  if (!carta) return '';
  return `${NOTAS[carta.n]} ${PALOS[carta.p].sym}`;
}

function limpiarSeleccion() {
  sel = null;
}

function sumarPuntos(valor) {
  puntos += valor;
  if (puntos < 0) puntos = 0;
}

function actualizarPuntosUI() {
  const puntosEl = getEl('puntos');
  if (puntosEl) puntosEl.textContent = puntos;
}

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

function calcDims() {
  const vw = Math.min(window.innerWidth, 480);
  const pad = Math.max(4, Math.floor(vw * 0.014));
  const gap = Math.max(2, Math.floor(vw * 0.011));
  const cw = Math.floor((vw - 2 * pad - 6 * gap) / 7);

  CH = Math.floor(cw * 1.5);
  OD = Math.max(13, Math.floor(CH * 0.19)); // offset carta boca abajo
  OU = Math.max(22, Math.floor(CH * 0.36)); // offset carta boca arriba

  const d = document.documentElement.style;
  d.setProperty('--pad', `${pad}px`);
  d.setProperty('--gap', `${gap}px`);
  d.setProperty('--ch', `${CH}px`);
  d.setProperty('--fn', `${Math.max(8, Math.floor(cw * 0.17))}px`);
  d.setProperty('--fs', `${Math.max(7, Math.floor(cw * 0.14))}px`);
  d.setProperty('--fm', `${Math.max(15, Math.floor(cw * 0.37))}px`);
  d.setProperty('--fb', `${Math.max(16, Math.floor(cw * 0.38))}px`);
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

function nuevaPartida() {
  const b = mezclar(crearBaraja());

  mazo = [];
  descarte = [];
  fundas = [[], [], [], []];
  tablero = Array.from({ length: 7 }, () => []);
  limpiarSeleccion();
  puntos = 0;

  // Reparto inicial: columna c recibe c+1 cartas y la última va boca arriba
  let i = 0;
  for (let c = 0; c < 7; c++) {
    for (let r = 0; r <= c; r++) {
      b[i].up = (r === c);
      tablero[c].push(b[i]);
      i++;
    }
  }

  while (i < 52) {
    mazo.push(b[i]);
    i++;
  }

  const win = getEl('win');
  if (win) win.classList.add('oculto');

  actualizarPuntosUI();
  renderizar();
}

/* ────────────────────────────────────────────────────────────
   REGLAS
──────────────────────────────────────────────────────────── */

function puedeEnFunda(carta, fi) {
  const funda = fundas[fi];
  if (!funda) return false;

  if (funda.length === 0) {
    return carta.n === 0; // Empieza con Do
  }

  const tope = funda[funda.length - 1];
  return carta.p === tope.p && carta.n === tope.n + 1;
}

function puedeEnTablero(carta, col) {
  const pila = tablero[col];
  if (!pila) return false;

  if (pila.length === 0) {
    return carta.n === 12; // Solo Do↑ abre columna vacía
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
  }, 1600);
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

    mazo = descarte.reverse().map(c => ({ ...c, up: false }));
    descarte = [];
    sumarPuntos(-PUNTAJES.RECICLAR);
    toast(MENSAJES.RECICLADO);
    renderizar();
    return;
  }

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
  const gano = fundas.every(f => f.length === 13);
  if (!gano) return;

  setTimeout(() => {
    const ptsFinales = getEl('pts-finales');
    const win = getEl('win');

    if (ptsFinales) ptsFinales.textContent = puntos;
    if (win) win.classList.remove('oculto');
  }, 500);
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
    const el = document.querySelector(`.funda[data-fi="${fi}"]`);
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
  pila.forEach((c, i) => {
    h += (i < pila.length - 1)
      ? (c.up ? OU : OD)
      : CH;
  });
  return h;
}

function renderTablero() {
  for (let col = 0; col < 7; col++) {
    const cEl = document.querySelector(`.col[data-col="${col}"]`);
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
  actualizarPuntosUI();
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

  mazoEl?.addEventListener('click', onClickMazo);
  mazoEl?.addEventListener('keydown', e => onKeyActivate(e, onClickMazo));

  descarteEl?.addEventListener('click', onClickDescarte);
  descarteEl?.addEventListener('keydown', e => onKeyActivate(e, onClickDescarte));

  $$('.funda').forEach(el => {
    const fi = Number(el.dataset.fi);
    el.addEventListener('click', () => onClickFunda(fi));
    el.addEventListener('keydown', e => onKeyActivate(e, () => onClickFunda(fi)));
  });

  tableroArea?.addEventListener('click', e => {
    const wrap = e.target.closest('.cwrap');
    const col = e.target.closest('.col');

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
}

/* ────────────────────────────────────────────────────────────
   INICIO
──────────────────────────────────────────────────────────── */

window.addEventListener('load', () => {
  asegurarToast();
  calcDims();
  initEventos();
  nuevaPartida();
});

window.addEventListener('resize', () => {
  calcDims();
  renderizar();
});