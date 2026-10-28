/* ==========================================================
   Fábrica Stickman — motor de animación
   Dibuja muñequitos de palitos, objetos y textos en un canvas.
   Todo depende solo del tiempo "t": el mismo segundo siempre
   se dibuja igual, así el video MP4 sale idéntico a la vista
   previa.

   Una escena se describe así (posiciones de 0 a 1):
   {
     duracion: 12,
     personajes: [{ id: 'ana', x: 0.3, color: '#e63946', mira: 'derecha',
       acciones: [{ accion: 'caminar', hacia: 0.45, dur: 2 },
                  { accion: 'señalar', dur: 2.5, dice: '¡Mira eso!' }] }],
     objetos: [{ tipo: 'luna', x: 0.75, y: 0.35, tam: 0.2, desde: 1.5, animacion: 'flotar' }],
     textos:  [{ texto: '384.400 km', x: 0.75, y: 0.12, tam: 0.08, desde: 3, contar: true }]
   }
   ========================================================== */

var Stickman = (function () {
  'use strict';

  var TINTA = '#1d1d1f';
  var PAPEL = '#faf6ee';
  var SUELO = 0.82;              // altura del suelo (fracción del alto)
  var ALTO_PERSONAJE = 0.42;     // alto del muñequito (fracción del lado corto)
  var MEZCLA = 0.3;              // segundos para pasar de una pose a otra

  // Largos de cada parte, como fracción del alto del muñequito.
  var L = { torso: 0.3, cuello: 0.035, cabeza: 0.105, brazo: 0.15, antebrazo: 0.14, muslo: 0.2, pierna: 0.2 };

  var RAD = Math.PI / 180;

  /* ---------------- Curvas de movimiento ---------------- */

  function limitar(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function mezclar(a, b, f) { return a + (b - a) * f; }
  function suaveSalida(f) { return 1 - Math.pow(1 - f, 3); }
  function suaveAmbos(f) { return f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2; }
  function rebote(f) {           // entra pasándose un poco y vuelve (para objetos que aparecen)
    var c = 1.70158, c3 = c + 1;
    return 1 + c3 * Math.pow(f - 1, 3) + c * Math.pow(f - 1, 2);
  }

  /* ---------------- Poses ----------------
     Ángulos en grados, mirando a la derecha. 0 = hacia abajo, 90 = hacia adelante,
     180 = hacia arriba. Brazo A = el de adelante, brazo B = el de atrás. */

  var BASE = {
    torso: 0, cabeza: 0,
    hA: 20, cA: 6, hB: -20, cB: -6,
    pA: 7, rA: 0, pB: -7, rB: 0,
    alto: 0, boca: 0, ojos: 'normal', gesto: 'sonrisa'
  };

  function pose(cambios) {
    var p = {};
    for (var k in BASE) p[k] = BASE[k];
    for (var c in cambios) p[c] = cambios[c];
    return p;
  }

  var POSES = {
    parado: pose({}),
    señalar: pose({ hA: 92, cA: 0, cabeza: 6 }),
    saludar: pose({ hA: 118, cA: 30, gesto: 'sonrisa' }),
    pensar: pose({ hA: 28, cA: 140, hB: 18, cB: 85, cabeza: -10, gesto: 'seria', ojos: 'arriba' }),
    celebrar: pose({ hA: 128, cA: 18, hB: -128, cB: -18, ojos: 'feliz', gesto: 'abierta', boca: 0.8 }),
    nose: pose({ hA: 58, cA: 105, hB: -58, cB: -105, cabeza: 12, gesto: 'seria' }),
    sorpresa: pose({ hA: 100, cA: 55, hB: -100, cB: -55, torso: -6, ojos: 'sorpresa', gesto: 'abierta', boca: 1 }),
    triste: pose({ torso: 8, cabeza: 22, hA: 4, cA: 2, hB: -4, cB: -2, ojos: 'triste', gesto: 'triste' }),
    explicar: pose({ hA: 48, cA: 62, hB: -40, cB: -55, gesto: 'abierta', boca: 0.4 }),
    asustado: pose({ hA: 75, cA: 80, hB: -75, cB: -80, torso: -10, rA: -20, rB: 20, ojos: 'sorpresa', gesto: 'abierta', boca: 0.6 }),
    enojado: pose({ hA: 30, cA: 120, hB: -30, cB: -120, torso: 5, ojos: 'enojado', gesto: 'triste' })
  };

  /* ---------------- Acciones ----------------
     Cada acción devuelve la pose en el segundo "f" (desde que empezó) de una acción
     que dura "dur" segundos. */

  function caminata(f, rapido) {
    var vel = rapido ? 2.6 : 1.6, amp = rapido ? 38 : 24;
    var fase = f * vel * Math.PI * 2;
    var s = Math.sin(fase);
    return pose({
      torso: rapido ? 12 : 3,
      pA: amp * s, pB: -amp * s,
      rA: -Math.max(0, -Math.cos(fase)) * (rapido ? 70 : 40),
      rB: -Math.max(0, Math.cos(fase)) * (rapido ? 70 : 40),
      hA: -amp * 0.9 * s + (rapido ? 20 : 8), cA: rapido ? 80 : 18,
      hB: amp * 0.9 * s - (rapido ? 0 : 8), cB: rapido ? 80 : -10,
      alto: Math.abs(Math.sin(fase)) * (rapido ? 0.03 : 0.015)
    });
  }

  var ACCIONES = {
    parado: function () { return POSES.parado; },
    caminar: function (f) { return caminata(f, false); },
    correr: function (f) { return caminata(f, true); },
    saludar: function (f) {
      var p = pose(POSES.saludar);
      p.cA = 30 + Math.sin(f * 10) * 26;
      return p;
    },
    hablar: function (f) {
      var p = pose(POSES.explicar);
      p.hA += Math.sin(f * 3.1) * 14;
      p.cA += Math.sin(f * 4.3) * 12;
      p.hB -= Math.sin(f * 2.3 + 1) * 8;
      p.boca = 0.25 + 0.75 * Math.abs(Math.sin(f * 11));
      return p;
    },
    saltar: function (f, dur) {
      var d = Math.min(dur, 1.2), x = (f % d) / d;
      var p;
      if (x < 0.25) {                                  // se agacha
        var a = suaveSalida(x / 0.25);
        p = pose({ pA: 30 * a, rA: -60 * a, pB: -10 + 40 * a, rB: -60 * a, torso: 12 * a, hA: 14 - 40 * a, hB: -14 - 20 * a });
        p.alto = -0.06 * a;
      } else if (x < 0.8) {                            // en el aire
        var b = (x - 0.25) / 0.55;
        p = pose(POSES.celebrar);
        p.alto = Math.sin(b * Math.PI) * 0.28;
        p.rA = -25; p.rB = -25;
      } else {                                         // aterriza
        var c = (x - 0.8) / 0.2;
        p = pose({ pA: 20 * (1 - c), rA: -40 * (1 - c), pB: 10 * (1 - c), rB: -40 * (1 - c), ojos: 'feliz' });
        p.alto = -0.04 * Math.sin(c * Math.PI);
      }
      return p;
    },
    asentir: function (f) {
      var p = pose(POSES.parado);
      p.cabeza = Math.max(0, Math.sin(f * 7)) * 18;
      return p;
    },
    negar: function (f) {
      var p = pose(POSES.nose);
      p.torso = Math.sin(f * 8) * 4;
      return p;
    },
    temblar: function (f) {
      var p = pose(POSES.asustado);
      p.torso = -10 + Math.sin(f * 60) * 3;
      return p;
    }
  };
  // Las poses quietas también sirven como acciones (con una leve respiración).
  ['señalar', 'pensar', 'celebrar', 'nose', 'sorpresa', 'triste', 'explicar', 'asustado', 'enojado'].forEach(function (n) {
    ACCIONES[n] = function (f) {
      var p = pose(POSES[n]);
      p.torso += Math.sin(f * 2) * 1.2;
      if (n === 'celebrar') p.alto = Math.abs(Math.sin(f * 5)) * 0.03;
      return p;
    };
  });

  var SE_MUEVEN = { caminar: true, correr: true };

  function mezclarPoses(a, b, f) {
    var p = {};
    for (var k in BASE) p[k] = typeof BASE[k] === 'number' ? mezclar(a[k], b[k], f) : (f < 0.5 ? a[k] : b[k]);
    return p;
  }

  /* ---------------- Estado de un personaje en el segundo t ---------------- */

  function estadoPersonaje(per, t) {
    var x = typeof per.x === 'number' ? per.x : 0.5;
    var dir = per.mira === 'izquierda' ? -1 : 1;
    var acciones = per.acciones || [];
    var inicio = per.desde || 0, anterior = null, anteriorFin = null;
    var resultado = null;

    for (var i = 0; i < acciones.length; i++) {
      var a = acciones[i];
      var dur = Math.max(0.1, +a.dur || 1);
      var fn = ACCIONES[a.accion] || ACCIONES.parado;
      var xIni = x;
      var xFin = SE_MUEVEN[a.accion] && typeof a.hacia === 'number' ? a.hacia : x;
      if (xFin !== xIni) dir = xFin > xIni ? 1 : -1;
      else if (a.mira) dir = a.mira === 'izquierda' ? -1 : 1;

      if (t < inicio + dur || i === acciones.length - 1) {
        var f = limitar(t - inicio, 0, dur);
        var p = pose(fn(f, dur));
        if (anterior && f < MEZCLA) p = mezclarPoses(anteriorFin, p, suaveSalida(f / MEZCLA));
        if (t > inicio + dur) p = pose(fn(dur, dur));          // terminó la última: se queda así
        var avance = xFin === xIni ? 1 : suaveAmbos(limitar(f / dur, 0, 1));
        if (a.expresion) p.ojos = a.expresion;
        resultado = { x: mezclar(xIni, xFin, avance), dir: dir, pose: p, dice: a.dice, diceDesde: inicio, diceHasta: inicio + dur, f: f };
        break;
      }
      anterior = a;
      anteriorFin = pose(fn(dur, dur));
      x = xFin;
      inicio += dur;
    }
    if (!resultado) resultado = { x: x, dir: dir, pose: POSES.parado };
    return resultado;
  }

  /* ---------------- Dibujo del muñequito ---------------- */

  function punto(o, ang, largo) {
    return { x: o.x + Math.sin(ang * RAD) * largo, y: o.y + Math.cos(ang * RAD) * largo };
  }

  // Calcula las articulaciones. "h" = alto del muñequito en píxeles.
  function esqueleto(p, dir, h) {
    var s = function (a) { return a * dir; };
    var cadera = { x: 0, y: 0 };
    var cuello = { x: cadera.x + Math.sin(s(p.torso) * RAD) * L.torso * h, y: cadera.y - Math.cos(p.torso * RAD) * L.torso * h };
    var hombro = { x: mezclar(cadera.x, cuello.x, 0.88), y: mezclar(cadera.y, cuello.y, 0.88) };
    var angCabeza = (p.torso + p.cabeza);
    var centroCabeza = {
      x: cuello.x + Math.sin(s(angCabeza) * RAD) * (L.cuello + L.cabeza) * h,
      y: cuello.y - Math.cos(angCabeza * RAD) * (L.cuello + L.cabeza) * h
    };
    var codoA = punto(hombro, s(p.hA + p.torso), L.brazo * h);
    var manoA = punto(codoA, s(p.hA + p.cA + p.torso), L.antebrazo * h);
    var codoB = punto(hombro, s(p.hB + p.torso), L.brazo * h);
    var manoB = punto(codoB, s(p.hB + p.cB + p.torso), L.antebrazo * h);
    var rodA = punto(cadera, s(p.pA), L.muslo * h);
    var pieA = punto(rodA, s(p.pA + p.rA), L.pierna * h);
    var rodB = punto(cadera, s(p.pB), L.muslo * h);
    var pieB = punto(rodB, s(p.pB + p.rB), L.pierna * h);
    return { cadera: cadera, cuello: cuello, hombro: hombro, cabeza: centroCabeza, angCabeza: angCabeza,
      codoA: codoA, manoA: manoA, codoB: codoB, manoB: manoB, rodA: rodA, pieA: pieA, rodB: rodB, pieB: pieB };
  }

  function linea(ctx, puntos) {
    ctx.beginPath();
    ctx.moveTo(puntos[0].x, puntos[0].y);
    for (var i = 1; i < puntos.length; i++) ctx.lineTo(puntos[i].x, puntos[i].y);
    ctx.stroke();
  }

  function parpadea(t, semilla) {
    var ciclo = 3.4 + (semilla % 7) * 0.23;
    return ((t + semilla * 0.37) % ciclo) < 0.12;
  }

  function dibujarCara(ctx, e, p, dir, h, t, semilla) {
    var r = L.cabeza * h, c = e.cabeza;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(p.cabeza * dir * RAD * 0.5);
    var ox = dir * r * 0.28;                     // la cara mira hacia donde camina
    var ojoY = -r * 0.12, sep = r * 0.32, ojoR = r * 0.1;
    var ojos = parpadea(t, semilla) && p.ojos !== 'sorpresa' ? 'cerrados' : p.ojos;
    ctx.fillStyle = TINTA;
    ctx.lineWidth = Math.max(1.5, h * 0.012);
    [-1, 1].forEach(function (lado) {
      var x = ox + lado * sep, y = ojoY;
      if (ojos === 'cerrados') { linea(ctx, [{ x: x - ojoR, y: y }, { x: x + ojoR, y: y }]); return; }
      if (ojos === 'feliz') { ctx.beginPath(); ctx.arc(x, y + ojoR * 0.6, ojoR * 1.1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); return; }
      var rr = ojos === 'sorpresa' ? ojoR * 1.45 : ojoR;
      var dy = ojos === 'arriba' ? -ojoR * 0.6 : 0;
      ctx.beginPath(); ctx.arc(x + (ojos === 'arriba' ? dir * ojoR * 0.4 : 0), y + dy, rr, 0, Math.PI * 2); ctx.fill();
      if (ojos === 'triste') linea(ctx, [{ x: x - ojoR * 1.4, y: y - ojoR * 2.4 + lado * ojoR * 0.8 }, { x: x + ojoR * 1.4, y: y - ojoR * 2.4 - lado * ojoR * 0.8 }]);
      if (ojos === 'enojado') linea(ctx, [{ x: x - ojoR * 1.4, y: y - ojoR * 2.6 - lado * ojoR }, { x: x + ojoR * 1.4, y: y - ojoR * 2.6 + lado * ojoR }]);
    });
    // Boca
    var bx = ox, by = r * 0.42, bw = r * 0.34;
    if (p.boca > 0.08 || p.gesto === 'abierta') {
      var abre = Math.max(0.15, p.boca);
      ctx.beginPath();
      ctx.ellipse(bx, by, bw * (0.55 + abre * 0.25), r * 0.22 * abre, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.gesto === 'triste') {
      ctx.beginPath(); ctx.arc(bx, by + r * 0.22, bw, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    } else if (p.gesto === 'seria') {
      linea(ctx, [{ x: bx - bw * 0.7, y: by }, { x: bx + bw * 0.7, y: by }]);
    } else {
      ctx.beginPath(); ctx.arc(bx, by - r * 0.2, bw, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
    ctx.restore();
  }

  function dibujarPersonaje(ctx, est, per, W, H, t, indice) {
    var lado = Math.min(W, H);
    var h = lado * ALTO_PERSONAJE * (per.escala || 1);
    var p = est.pose, dir = est.dir;
    var e = esqueleto(p, dir, h);
    // Se apoya en el pie más bajo, así al doblar las rodillas baja el cuerpo.
    var bajo = Math.max(e.pieA.y, e.pieB.y);
    var ox = est.x * W, oy = H * SUELO - bajo - p.alto * h;

    // Sombra en el suelo
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    var sombra = limitar(1 - p.alto * 3, 0.4, 1);
    ctx.beginPath();
    ctx.ellipse(ox, H * SUELO + h * 0.01, h * 0.16 * sombra, h * 0.025 * sombra, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(ox, oy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TINTA;
    ctx.lineWidth = Math.max(2, h * 0.035);
    // Atrás primero: brazo y pierna B
    linea(ctx, [e.cadera, e.rodB, e.pieB]);
    linea(ctx, [e.hombro, e.codoB, e.manoB]);
    // Cuerpo (con el color del personaje)
    ctx.strokeStyle = per.color || TINTA;
    linea(ctx, [e.cadera, e.cuello]);
    ctx.strokeStyle = TINTA;
    linea(ctx, [e.cadera, e.rodA, e.pieA]);
    linea(ctx, [e.hombro, e.codoA, e.manoA]);
    // Cabeza
    ctx.beginPath();
    ctx.arc(e.cabeza.x, e.cabeza.y, L.cabeza * h, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    if (per.accesorio) dibujarAccesorio(ctx, per.accesorio, e, dir, h, per.color);
    dibujarCara(ctx, e, p, dir, h, t, indice * 13 + 5);
    ctx.restore();

    return { cabezaX: ox + e.cabeza.x, cabezaY: oy + e.cabeza.y - L.cabeza * h, h: h };
  }

  function dibujarAccesorio(ctx, tipo, e, dir, h, color) {
    var r = L.cabeza * h, c = e.cabeza;
    ctx.save();
    ctx.fillStyle = color || TINTA;
    ctx.strokeStyle = TINTA;
    if (tipo === 'gorra') {
      ctx.beginPath(); ctx.arc(c.x, c.y - r * 0.15, r * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(c.x + dir * r * 0.9, c.y - r * 0.38, r * 0.6, r * 0.14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (tipo === 'lentes') {
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.arc(c.x + dir * r * 0.28 + l * r * 0.32, c.y - r * 0.12, r * 0.22, 0, Math.PI * 2); ctx.stroke();
      });
    } else if (tipo === 'sombrero') {
      ctx.fillRect(c.x - r * 1.3, c.y - r * 0.95, r * 2.6, r * 0.18);
      ctx.fillRect(c.x - r * 0.75, c.y - r * 1.75, r * 1.5, r * 0.85);
    } else if (tipo === 'corbata') {
      var n = e.cuello;
      ctx.beginPath(); ctx.moveTo(n.x, n.y + h * 0.01); ctx.lineTo(n.x - h * 0.02, n.y + h * 0.1); ctx.lineTo(n.x, n.y + h * 0.13); ctx.lineTo(n.x + h * 0.02, n.y + h * 0.1); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- Bocadillo de diálogo ---------------- */

  function partirTexto(ctx, texto, ancho) {
    var palabras = String(texto).split(/\s+/), lineas = [], actual = '';
    palabras.forEach(function (p) {
      var prueba = actual ? actual + ' ' + p : p;
      if (ctx.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = p; } else actual = prueba;
    });
    if (actual) lineas.push(actual);
    return lineas;
  }

  function dibujarBocadillo(ctx, texto, x, y, h, W, aparicion, ocupados) {
    if (aparicion <= 0) return;
    var tam = Math.round(h * 0.1);
    ctx.save();
    ctx.font = '700 ' + tam + 'px "Segoe UI", system-ui, sans-serif';
    var lineas = partirTexto(ctx, texto, h * 1.1);
    var ancho = 0;
    lineas.forEach(function (l) { ancho = Math.max(ancho, ctx.measureText(l).width); });
    var pad = tam * 0.6, bw = ancho + pad * 2, bh = lineas.length * tam * 1.25 + pad * 1.4;
    var bx = limitar(x - bw / 2, 8, W - bw - 8), by = y - h * 0.12 - bh;
    // Si choca con otro bocadillo, se sube por encima de él (la colita se alarga sola).
    (ocupados || []).forEach(function (o) {
      if (bx < o.x + o.w && bx + bw > o.x && by < o.y + o.h && by + bh > o.y) by = o.y - bh - tam * 0.4;
    });
    if (ocupados) ocupados.push({ x: bx, y: by, w: bw, h: bh });
    var esc = rebote(limitar(aparicion, 0, 1));
    ctx.translate(x, y - h * 0.08);
    ctx.scale(esc, esc);
    ctx.translate(-x, -(y - h * 0.08));
    ctx.globalAlpha = limitar(aparicion * 2, 0, 1);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = TINTA;
    ctx.lineWidth = Math.max(2, h * 0.014);
    var r = Math.min(tam * 0.8, bh / 2);
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    var px = limitar(x, bx + r * 1.5, bx + bw - r * 1.5);
    ctx.lineTo(px + tam * 0.4, by + bh);
    ctx.lineTo(x, y - h * 0.08);
    ctx.lineTo(px - tam * 0.4, by + bh);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = TINTA;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lineas.forEach(function (l, i) { ctx.fillText(l, bx + bw / 2, by + pad * 0.75 + i * tam * 1.25); });
    ctx.restore();
  }

  /* ---------------- Objetos ----------------
     Cada objeto se dibuja centrado en (0,0) con tamaño "s" (alto aproximado). */

  function circulo(ctx, x, y, r, relleno) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
    ctx.stroke();
  }

  function rect(ctx, x, y, w, h, relleno, radio) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radio || 0); else ctx.rect(x, y, w, h);
    if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
    ctx.stroke();
  }

  var OBJETOS = {
    bombilla: function (ctx, s) {
      circulo(ctx, 0, -s * 0.12, s * 0.3, '#ffd23f');
      rect(ctx, -s * 0.14, s * 0.16, s * 0.28, s * 0.2, '#b8b8b8', s * 0.04);
      ctx.lineWidth *= 0.7;
      for (var i = 0; i < 7; i++) {
        var a = (-90 + (i - 3) * 30) * RAD;
        linea(ctx, [{ x: Math.cos(a) * s * 0.4, y: -s * 0.12 + Math.sin(a) * s * 0.4 }, { x: Math.cos(a) * s * 0.5, y: -s * 0.12 + Math.sin(a) * s * 0.5 }]);
      }
    },
    dinero: function (ctx, s) {
      rect(ctx, -s * 0.5, -s * 0.28, s, s * 0.56, '#7bc67b', s * 0.05);
      circulo(ctx, 0, 0, s * 0.17, '#5aa65a');
      ctx.fillStyle = TINTA; ctx.font = '900 ' + Math.round(s * 0.26) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, s * 0.01);
    },
    moneda: function (ctx, s) {
      circulo(ctx, 0, 0, s * 0.45, '#ffc93c');
      circulo(ctx, 0, 0, s * 0.33, null);
      ctx.fillStyle = TINTA; ctx.font = '900 ' + Math.round(s * 0.4) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, s * 0.02);
    },
    tierra: function (ctx, s) {
      circulo(ctx, 0, 0, s * 0.45, '#4ea8de');
      ctx.fillStyle = '#6cc070';
      ctx.beginPath(); ctx.ellipse(-s * 0.12, -s * 0.1, s * 0.16, s * 0.12, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s * 0.17, s * 0.13, s * 0.12, s * 0.15, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    },
    luna: function (ctx, s) {
      circulo(ctx, 0, 0, s * 0.45, '#e9e6dd');
      ctx.fillStyle = '#cfcabd';
      [[-0.15, -0.12, 0.09], [0.14, 0.05, 0.12], [-0.05, 0.2, 0.06]].forEach(function (c) { circulo(ctx, c[0] * s, c[1] * s, c[2] * s, '#cfcabd'); });
    },
    sol: function (ctx, s) {
      for (var i = 0; i < 12; i++) {
        var a = i * 30 * RAD;
        linea(ctx, [{ x: Math.cos(a) * s * 0.36, y: Math.sin(a) * s * 0.36 }, { x: Math.cos(a) * s * 0.5, y: Math.sin(a) * s * 0.5 }]);
      }
      circulo(ctx, 0, 0, s * 0.3, '#ffcf3f');
    },
    estrella: function (ctx, s) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var r = i % 2 ? s * 0.2 : s * 0.48, a = (i * 36 - 90) * RAD;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
    },
    corazon: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s * 0.55, 0, -s * 0.4, -s * 0.45, 0, -s * 0.18);
      ctx.bezierCurveTo(s * 0.4, -s * 0.45, s * 0.55, 0, 0, s * 0.35);
      ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
    },
    reloj: function (ctx, s) {
      circulo(ctx, 0, 0, s * 0.45, '#ffffff');
      linea(ctx, [{ x: 0, y: 0 }, { x: 0, y: -s * 0.3 }]);
      linea(ctx, [{ x: 0, y: 0 }, { x: s * 0.2, y: s * 0.05 }]);
      circulo(ctx, 0, 0, s * 0.03, TINTA);
    },
    libro: function (ctx, s) {
      rect(ctx, -s * 0.45, -s * 0.3, s * 0.45, s * 0.6, '#4ea8de', s * 0.03);
      rect(ctx, 0, -s * 0.3, s * 0.45, s * 0.6, '#4ea8de', s * 0.03);
      ctx.lineWidth *= 0.6;
      [-0.12, 0, 0.12].forEach(function (y) {
        linea(ctx, [{ x: -s * 0.36, y: y * s }, { x: -s * 0.09, y: y * s }]);
        linea(ctx, [{ x: s * 0.09, y: y * s }, { x: s * 0.36, y: y * s }]);
      });
    },
    pregunta: function (ctx, s) {
      ctx.fillStyle = '#e63946'; ctx.font = '900 ' + Math.round(s) + 'px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth *= 1.2; ctx.strokeText('?', 0, 0); ctx.fillText('?', 0, 0);
    },
    exclamacion: function (ctx, s) {
      ctx.fillStyle = '#ff9f1c'; ctx.font = '900 ' + Math.round(s) + 'px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth *= 1.2; ctx.strokeText('!', 0, 0); ctx.fillText('!', 0, 0);
    },
    cohete: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(s * 0.2, -s * 0.25, s * 0.15, s * 0.25);
      ctx.lineTo(-s * 0.15, s * 0.25); ctx.quadraticCurveTo(-s * 0.2, -s * 0.25, 0, -s * 0.5); ctx.closePath();
      ctx.fillStyle = '#f1f1f1'; ctx.fill(); ctx.stroke();
      circulo(ctx, 0, -s * 0.12, s * 0.07, '#4ea8de');
      ctx.fillStyle = '#e63946';
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.moveTo(l * s * 0.15, s * 0.05); ctx.lineTo(l * s * 0.3, s * 0.3); ctx.lineTo(l * s * 0.15, s * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.27); ctx.lineTo(0, s * 0.5); ctx.lineTo(s * 0.1, s * 0.27); ctx.closePath();
      ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
    },
    casa: function (ctx, s) {
      rect(ctx, -s * 0.35, -s * 0.05, s * 0.7, s * 0.5, '#f4d6a0');
      ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.03); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s * 0.45, -s * 0.03); ctx.closePath();
      ctx.fillStyle = '#d1495b'; ctx.fill(); ctx.stroke();
      rect(ctx, -s * 0.08, s * 0.18, s * 0.16, s * 0.27, '#8d5524');
    },
    arbol: function (ctx, s) {
      rect(ctx, -s * 0.06, s * 0.05, s * 0.12, s * 0.45, '#8d5524');
      circulo(ctx, 0, -s * 0.15, s * 0.3, '#6cc070');
    },
    montana: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.6, s * 0.4); ctx.lineTo(-s * 0.05, -s * 0.45); ctx.lineTo(s * 0.6, s * 0.4); ctx.closePath();
      ctx.fillStyle = '#9aa5b1'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.22); ctx.lineTo(-s * 0.05, -s * 0.45); ctx.lineTo(s * 0.1, -s * 0.22); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    },
    computadora: function (ctx, s) {
      rect(ctx, -s * 0.45, -s * 0.38, s * 0.9, s * 0.58, '#2b2d42', s * 0.04);
      rect(ctx, -s * 0.38, -s * 0.31, s * 0.76, s * 0.44, '#8ecae6');
      rect(ctx, -s * 0.12, s * 0.2, s * 0.24, s * 0.14, '#b8b8b8');
      rect(ctx, -s * 0.3, s * 0.34, s * 0.6, s * 0.06, '#b8b8b8', s * 0.02);
    },
    telefono: function (ctx, s) {
      rect(ctx, -s * 0.22, -s * 0.45, s * 0.44, s * 0.9, '#2b2d42', s * 0.07);
      rect(ctx, -s * 0.17, -s * 0.36, s * 0.34, s * 0.66, '#8ecae6', s * 0.02);
    },
    grafica: function (ctx, s) {
      linea(ctx, [{ x: -s * 0.45, y: -s * 0.45 }, { x: -s * 0.45, y: s * 0.4 }, { x: s * 0.5, y: s * 0.4 }]);
      [[-0.3, 0.25, '#e9c46a'], [-0.05, 0.45, '#f4a261'], [0.2, 0.7, '#2a9d8f']].forEach(function (b) {
        rect(ctx, b[0] * s, s * 0.4 - b[1] * s, s * 0.18, b[1] * s, b[2]);
      });
    },
    cerebro: function (ctx, s) {
      ctx.fillStyle = '#f7a1c4';
      ctx.beginPath();
      [[-0.18, -0.08, 0.22], [0.15, -0.1, 0.24], [-0.05, 0.12, 0.24], [0.2, 0.12, 0.18]].forEach(function (c) {
        ctx.moveTo(c[0] * s + c[2] * s, c[1] * s); ctx.arc(c[0] * s, c[1] * s, c[2] * s, 0, Math.PI * 2);
      });
      ctx.fill(); ctx.stroke();
      linea(ctx, [{ x: 0, y: -s * 0.3 }, { x: s * 0.02, y: s * 0.3 }]);
    },
    agua: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.bezierCurveTo(s * 0.4, 0, s * 0.35, s * 0.42, 0, s * 0.42);
      ctx.bezierCurveTo(-s * 0.35, s * 0.42, -s * 0.4, 0, 0, -s * 0.45); ctx.closePath();
      ctx.fillStyle = '#4ea8de'; ctx.fill(); ctx.stroke();
    },
    fuego: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.bezierCurveTo(s * 0.45, -s * 0.05, s * 0.35, s * 0.42, 0, s * 0.42);
      ctx.bezierCurveTo(-s * 0.35, s * 0.42, -s * 0.45, -s * 0.1, -s * 0.12, -s * 0.2);
      ctx.quadraticCurveTo(-s * 0.05, -s * 0.05, 0, -s * 0.5); ctx.closePath();
      ctx.fillStyle = '#ff7b00'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.13, s * 0.18, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffd23f'; ctx.fill();
    },
    flecha: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.1); ctx.lineTo(s * 0.1, -s * 0.1); ctx.lineTo(s * 0.1, -s * 0.28); ctx.lineTo(s * 0.5, 0);
      ctx.lineTo(s * 0.1, s * 0.28); ctx.lineTo(s * 0.1, s * 0.1); ctx.lineTo(-s * 0.5, s * 0.1); ctx.closePath();
      ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
    },
    calavera: function (ctx, s) {
      circulo(ctx, 0, -s * 0.08, s * 0.36, '#ffffff');
      rect(ctx, -s * 0.18, s * 0.18, s * 0.36, s * 0.2, '#ffffff', s * 0.04);
      circulo(ctx, -s * 0.13, -s * 0.08, s * 0.09, TINTA);
      circulo(ctx, s * 0.13, -s * 0.08, s * 0.09, TINTA);
    },
    regalo: function (ctx, s) {
      rect(ctx, -s * 0.4, -s * 0.15, s * 0.8, s * 0.55, '#e63946');
      rect(ctx, -s * 0.45, -s * 0.3, s * 0.9, s * 0.17, '#e63946');
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-s * 0.06, -s * 0.3, s * 0.12, s * 0.7);
    }
  };

  function dibujarObjeto(ctx, ob, W, H, t) {
    var desde = ob.desde || 0;
    if (t < desde || (ob.hasta && t > ob.hasta + 0.3)) return;
    var dibujo = OBJETOS[ob.tipo];
    if (!dibujo) return;
    var lado = Math.min(W, H);
    var s = lado * (ob.tam || 0.18);
    var f = (t - desde) / 0.45;                       // aparece en 0,45 s
    var esc = f >= 1 ? 1 : rebote(limitar(f, 0, 1));
    var alfa = limitar(f * 2, 0, 1);
    if (ob.hasta && t > ob.hasta) { var g = (t - ob.hasta) / 0.3; esc *= 1 - g * 0.3; alfa *= 1 - g; }
    var x = (ob.x == null ? 0.5 : ob.x) * W, y = (ob.y == null ? 0.4 : ob.y) * H, giro = 0;
    var vivo = t - desde;
    if (ob.animacion === 'flotar') y += Math.sin(vivo * 2) * s * 0.06;
    if (ob.animacion === 'latir') esc *= 1 + Math.max(0, Math.sin(vivo * 6)) * 0.08;
    if (ob.animacion === 'girar') giro = vivo * 1.2;
    if (ob.animacion === 'temblar') x += Math.sin(vivo * 45) * s * 0.02;
    if (ob.animacion === 'caer') y -= Math.max(0, 1 - vivo / 0.6) * H * 0.5;
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.translate(x, y);
    ctx.rotate(giro);
    ctx.scale(esc, esc);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TINTA;
    ctx.lineWidth = Math.max(2, s * 0.045);
    dibujo(ctx, s);
    ctx.restore();
  }

  /* ---------------- Textos grandes ---------------- */

  // "384.400 km" → cuenta de 0 a 384.400 manteniendo el formato.
  function textoContado(texto, f) {
    var m = /(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?/.exec(texto);
    if (!m) return texto;
    var entero = parseInt(m[1].replace(/\./g, ''), 10);
    var valor = Math.round(entero * suaveSalida(limitar(f, 0, 1)));
    var conPuntos = String(valor).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return texto.slice(0, m.index) + conPuntos + (f >= 1 && m[2] ? m[2] : '') + texto.slice(m.index + m[0].length);
  }

  function dibujarTexto(ctx, tx, W, H, t) {
    var desde = tx.desde || 0;
    if (t < desde || (tx.hasta && t > tx.hasta + 0.3)) return;
    var lado = Math.min(W, H);
    var tam = Math.round(lado * (tx.tam || 0.07));
    var f = (t - desde) / 0.4;
    var esc = f >= 1 ? 1 : 0.85 + 0.15 * suaveSalida(limitar(f, 0, 1));
    var alfa = limitar(f * 1.5, 0, 1);
    if (tx.hasta && t > tx.hasta) alfa *= 1 - (t - tx.hasta) / 0.3;
    var texto = tx.contar ? textoContado(tx.texto, (t - desde) / 1.4) : tx.texto;
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.translate((tx.x == null ? 0.5 : tx.x) * W, (tx.y == null ? 0.15 : tx.y) * H);
    ctx.scale(esc, esc);
    ctx.font = '900 ' + tam + 'px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var lineas = partirTexto(ctx, texto, W * 0.85);
    lineas.forEach(function (l, i) {
      var y = (i - (lineas.length - 1) / 2) * tam * 1.15;
      ctx.lineWidth = tam * 0.16;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(l, 0, y);
      ctx.fillStyle = tx.color || TINTA;
      ctx.fillText(l, 0, y);
    });
    ctx.restore();
  }

  /* ---------------- Fondo ---------------- */

  function dibujarFondo(ctx, W, H, fondo) {
    var colores = { papel: PAPEL, cielo: '#e8f4fb', noche: '#1f2340', pizarra: '#f4f4f4' };
    var base = colores[fondo] || PAPEL;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    if (fondo === 'noche') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (var i = 0; i < 40; i++) {
        var x = ((i * 9301 + 49297) % 233280) / 233280 * W, y = ((i * 4271 + 1237) % 23328) / 23328 * H * SUELO * 0.9;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    // Suelo
    ctx.fillStyle = fondo === 'noche' ? '#2c3160' : 'rgba(0,0,0,0.035)';
    ctx.fillRect(0, H * SUELO, W, H * (1 - SUELO));
    ctx.strokeStyle = fondo === 'noche' ? '#8b90c0' : TINTA;
    ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
    ctx.beginPath(); ctx.moveTo(0, H * SUELO); ctx.lineTo(W, H * SUELO); ctx.stroke();
  }

  /* ---------------- Escena completa ---------------- */

  // Dibuja la escena en el segundo t sobre un canvas de W × H píxeles.
  function dibujarEscena(ctx, escena, t, W, H) {
    ctx.save();
    dibujarFondo(ctx, W, H, escena.fondo);
    // Acercamiento lento de cámara (da vida aunque nada se mueva).
    var dur = escena.duracion || 10;
    var zoom = 1 + 0.035 * limitar(t / dur, 0, 1);
    ctx.translate(W / 2, H * 0.55);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H * 0.55);

    (escena.objetos || []).forEach(function (ob) { if (!ob.adelante) dibujarObjeto(ctx, ob, W, H, t); });
    var cabezas = [];
    (escena.personajes || []).forEach(function (per, i) {
      if (t < (per.desde || 0)) return;
      var est = estadoPersonaje(per, t);
      var c = dibujarPersonaje(ctx, est, per, W, H, t, i);
      if (est.dice && t >= est.diceDesde && t <= est.diceHasta) cabezas.push({ c: c, texto: est.dice, f: (t - est.diceDesde) / 0.35 });
    });
    (escena.objetos || []).forEach(function (ob) { if (ob.adelante) dibujarObjeto(ctx, ob, W, H, t); });
    var ocupados = [];
    cabezas.forEach(function (b) { dibujarBocadillo(ctx, b.texto, b.c.cabezaX, b.c.cabezaY, b.c.h, W, b.f, ocupados); });
    (escena.textos || []).forEach(function (tx) { dibujarTexto(ctx, tx, W, H, t); });
    ctx.restore();
  }

  // Duración total de una escena (si no la trae, se calcula con las acciones).
  function duracionDe(escena) {
    if (escena.duracion) return escena.duracion;
    var max = 0;
    (escena.personajes || []).forEach(function (p) {
      var s = p.desde || 0;
      (p.acciones || []).forEach(function (a) { s += +a.dur || 1; });
      max = Math.max(max, s);
    });
    return Math.max(max, 1);
  }

  return {
    dibujarEscena: dibujarEscena,
    duracionDe: duracionDe,
    ACCIONES: Object.keys(ACCIONES),
    OBJETOS: Object.keys(OBJETOS),
    EXPRESIONES: ['normal', 'feliz', 'sorpresa', 'triste', 'enojado', 'arriba', 'cerrados'],
    ACCESORIOS: ['gorra', 'lentes', 'sombrero', 'corbata'],
    FONDOS: ['papel', 'cielo', 'noche', 'pizarra']
  };
})();
