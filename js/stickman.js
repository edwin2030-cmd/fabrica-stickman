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
   Opcional en la escena: fondo, efecto, camara, transEntra y transSale.
   Opcional en una acción: sostiene (un objeto que lleva en la mano).
   Opcional en un personaje: accesorio puede ser una lista.
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
    alto: 0, boca: 0, ojos: 'normal', gesto: 'sonrisa',
    giro: 0                      // gira todo el cuerpo sobre la cadera (90 = acostado hacia adelante)
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

  // Ángulos para que un brazo o una pierna vaya del punto o al punto d.
  // doblez: 1 = la articulación apunta hacia adelante (rodilla), -1 = hacia abajo (codo).
  function alcanzar(o, d, l1, l2, doblez) {
    var dx = d.x - o.x, dy = d.y - o.y;
    var dist = limitar(Math.sqrt(dx * dx + dy * dy), Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
    var a = Math.acos((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)) / RAD;
    var b = Math.acos((l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2)) / RAD;
    return { ini: Math.atan2(dx, dy) / RAD + doblez * a, medio: -doblez * (180 - b) };
  }

  // La bicicleta vista desde la cadera, en fracciones del alto del muñequito:
  // sale de las medidas del dibujo (tam 0,62) con la cadera sobre el asiento.
  var BICI = { adelante: 0.053, baja: 0.046, piso: 0.3436, manubrio: { x: 0.177, y: -0.041 }, pedales: { x: 0.071, y: 0.22 }, biela: 0.05 };

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
    },
    bailar: function (f) {
      var s = Math.sin(f * 7);
      return pose({
        hA: 140 + s * 22, cA: 20 - s * 25, hB: -140 + s * 22, cB: -20 - s * 25,
        torso: s * 7, cabeza: -s * 8, pA: 9 + s * 5, pB: -9 + s * 5, rA: -Math.max(0, s) * 22, rB: -Math.max(0, -s) * 22,
        alto: Math.abs(Math.sin(f * 7)) * 0.025, ojos: 'feliz', gesto: 'abierta', boca: 0.5
      });
    },
    aplaudir: function (f) {
      var golpe = Math.abs(Math.sin(f * 9));
      return pose({ hA: 62, cA: 30 + golpe * 35, hB: 50, cB: 45 + golpe * 35, ojos: 'feliz', gesto: 'abierta', boca: 0.5 });
    },
    reir: function (f) {
      return pose({
        torso: -8 + Math.sin(f * 22) * 2, cabeza: -16, hA: 15, cA: 80, hB: -10, cB: 85,
        ojos: 'feliz', gesto: 'abierta', boca: 0.55 + 0.45 * Math.abs(Math.sin(f * 11))
      });
    },
    llorar: function (f) {
      return pose({ torso: 10 + Math.sin(f * 14) * 2, cabeza: 14, hA: 12, cA: 20, hB: -10, cB: -8, ojos: 'llorando', gesto: 'triste' });
    },
    comer: function (f) {
      var bocado = Math.max(0, Math.sin(f * 4));
      return pose({ hA: 30, cA: 105 + bocado * 40, hB: 40, cB: 40, cabeza: -4, boca: 0.15 + (1 - bocado) * 0.5, ojos: 'feliz' });
    },
    dormir: function (f) {
      return pose({ torso: 6 + Math.sin(f * 1.6) * 1.5, cabeza: 26, hA: 4, cA: 2, hB: -4, cB: -2, ojos: 'cerrados', gesto: 'seria' });
    },
    cruzar: function (f) {
      return pose({ hA: 25, cA: -105, hB: 18, cB: -100, cabeza: -6 + Math.sin(f * 2) * 2, gesto: 'seria' });
    },
    agacharse: function (f) {
      // En cuclillas, con los brazos sobre la cabeza.
      return pose({
        pA: 95, rA: -150, pB: 80, rB: -140, torso: 12 + Math.sin(f * 30) * 1.2,
        hA: 165, cA: 55, hB: 155, cB: 60, cabeza: 10, ojos: 'cerrados', gesto: 'seria'
      });
    },
    mostrar: function (f) {
      return pose({ hA: 118 + Math.sin(f * 3) * 4, cA: -30, hB: -18, cB: -8, torso: -3, ojos: 'feliz', gesto: 'abierta', boca: 0.35 });
    },
    verguenza: function (f) {
      return pose({ hA: 36, cA: 150, hB: -8, cB: -4, cabeza: 18 + Math.sin(f * 2) * 2, torso: 6, ojos: 'cerrados', gesto: 'seria' });
    },
    escribir: function (f) {
      return pose({ hA: 82 + Math.sin(f * 9) * 7, cA: 12 + Math.cos(f * 9) * 10, hB: -12, cB: -6, cabeza: 6, gesto: 'seria' });
    },

    /* Fuerza y pelea */
    patear: function (f) {
      var x = f % 1, g = x < 0.35 ? suaveSalida(x / 0.35) : 1 - suaveAmbos((x - 0.35) / 0.65);
      return pose({ pA: -25 + 120 * g, rA: -50 * (1 - g), pB: -6, torso: -12 * g, hA: 40 - 70 * g, cA: 40, hB: -30 + 60 * g, cB: 40, gesto: 'abierta', boca: 0.4 * g });
    },
    boxear: function (f) {
      var a = Math.max(0, Math.sin(f * 9)), b = Math.max(0, -Math.sin(f * 9));
      return pose({ hA: 40 + 45 * a, cA: 110 - 105 * a, hB: 40 + 45 * b, cB: 110 - 105 * b, torso: 10, pA: 20, rA: -15, pB: -16, rB: -8, ojos: 'enojado', gesto: 'seria' });
    },
    lanzar: function (f) {
      var x = (f % 1.6) / 1.6, h, tr;
      if (x < 0.45) { var a = suaveSalida(x / 0.45); h = mezclar(20, -140, a); tr = -14 * a; }
      else if (x < 0.62) { var b = (x - 0.45) / 0.17; h = mezclar(-140, 110, b); tr = mezclar(-14, 14, b); }
      else { var c = suaveAmbos((x - 0.62) / 0.38); h = mezclar(110, 20, c); tr = 14 * (1 - c); }
      return pose({ hA: h, cA: 10, hB: 40, cB: 30, torso: tr, pA: 18, rA: -8, pB: -18, gesto: 'abierta', boca: 0.3 });
    },
    empujar: function (f) {
      var s = Math.sin(f * 3.5);
      return pose({ torso: 30, hA: 62, cA: 20, hB: 52, cB: 28, pA: 32 + s * 12, rA: -30, pB: -24 + s * 12, rB: -6, cabeza: -20, gesto: 'seria' });
    },
    jalar: function (f) {
      var s = Math.sin(f * 3.5);
      return pose({ torso: -24 + s * 3, hA: 104, cA: 0, hB: 96, cB: 4, pA: 34, rA: -10, pB: -12, rB: -20, gesto: 'seria', ojos: 'cerrados' });
    },
    levantar: function (f) {
      var s = Math.sin(f * 5) * 2;
      return pose({ hA: 172 + s, cA: 6, hB: 165 + s, cB: 10, pA: 18, rA: -28, pB: -14, rB: -20, torso: s * 0.5, gesto: 'seria', ojos: 'cerrados' });
    },
    pesas: function (f) {
      var x = (1 - Math.cos(f * 2.6)) / 2;
      return pose({ hA: 70 + 100 * x, cA: 110 * (1 - x), hB: 66 + 100 * x, cB: 112 * (1 - x), pA: 14, rA: -10 * (1 - x), pB: -14, gesto: 'seria', ojos: x > 0.5 ? 'cerrados' : 'normal' });
    },

    /* Cuerpo entero */
    nadar: function (f) {
      var s = Math.sin(f * 9), v = f * 280;
      return pose({ giro: 78, cabeza: -50, hA: v % 360, hB: (v + 180) % 360, cA: 0, cB: 0, pA: 6 + s * 14, pB: -6 - s * 14, alto: 0.16 + Math.sin(f * 2) * 0.012 });
    },
    volar: function (f) {
      var s = Math.sin(f * 7);
      return pose({ giro: 70, cabeza: -42, hA: 172, cA: 0, hB: -12, cB: -4, pA: 4 + s * 4, pB: -6 - s * 4, alto: 0.38 + Math.sin(f * 2.5) * 0.03, ojos: 'feliz', gesto: 'abierta', boca: 0.4 });
    },
    flotar: function (f) {
      var s = Math.sin(f * 0.9), r = Math.sin(f * 1.3);
      return pose({ giro: s * 14, hA: 76 + r * 16, cA: 18, hB: -76 - r * 16, cB: -18, pA: 18 + r * 8, rA: -14, pB: -18 - r * 8, rB: -14, alto: 0.22 + Math.sin(f * 1.1) * 0.04, ojos: 'sorpresa' });
    },
    desmayarse: function (f) {
      var x = Math.min(1, f / 0.7);
      return pose({ giro: -92 * x * x, hA: 30 - 32 * x, cA: 8, hB: -30 + 28 * x, cB: -4, pA: 10, pB: -4, ojos: 'mareado', gesto: 'abierta', boca: 0.4 });
    },
    tropezar: function (f) {
      var x = (f % 1.8) / 1.8, g = Math.sin(Math.min(1, x / 0.6) * Math.PI);
      return pose({ giro: 32 * g, torso: 10 * g, hA: 20 + 100 * g, cA: 18, hB: -20 - 100 * g, cB: -18, pA: 40 * g, rA: -50 * g, pB: -30 * g, ojos: g > 0.2 ? 'sorpresa' : 'normal', gesto: 'abierta', boca: 0.6 * g });
    },
    voltereta: function (f, dur) {
      var d = Math.min(dur, 1.2), x = (f % d) / d;
      var g = limitar((x - 0.15) / 0.7, 0, 1), arco = Math.sin(g * Math.PI);
      return pose({
        giro: (-360 * suaveAmbos(g)) % 360, alto: arco * 0.5, pA: 70 * arco, rA: -110 * arco, pB: 62 * arco, rB: -110 * arco,
        hA: 20 + 80 * arco, cA: 60 * arco, hB: 10 + 80 * arco, cB: 60 * arco, ojos: 'feliz'
      });
    },
    gatear: function (f) {
      var s = Math.sin(f * 5);
      // Con el cuerpo girado, un miembro cuelga hacia el suelo si su ángulo es igual al giro.
      return pose({ giro: 82, cabeza: -82, hA: 82 + s * 18, cA: 0, hB: 82 - s * 18, cB: 0, pA: 82 - s * 16, rA: -90, pB: 82 + s * 16, rB: -90 });
    },
    flexiones: function (f) {
      var d = (1 - Math.cos(f * 4)) / 2, giro = 64 + d * 8;
      return pose({ giro: giro, cabeza: -50, hA: giro - d * 42, cA: d * 84, hB: giro - d * 42, cB: d * 84, pA: 2, pB: -2, gesto: 'seria' });
    },
    meditar: function (f) {
      return pose({ pA: 78, rA: -150, pB: 62, rB: -140, hA: 20, cA: 60, hB: 8, cB: 62, ojos: 'cerrados', gesto: 'sonrisa', alto: 0.05 + Math.sin(f * 1.6) * 0.02 });
    },
    escalar: function (f) {
      var s = Math.sin(f * 4);
      return pose({ hA: 162 + s * 14, cA: 6, hB: 150 - s * 14, cB: 10, pA: 34 + s * 26, rA: -56 - s * 22, pB: 34 - s * 26, rB: -56 + s * 22, cabeza: -10, gesto: 'seria' });
    },
    reverencia: function (f, dur) {
      var g = Math.sin(limitar(f / Math.min(dur, 1.6), 0, 1) * Math.PI);
      return pose({ torso: 55 * g, cabeza: 18 * g, hA: 20 - 75 * g, cA: 8, hB: -20 - 55 * g, cB: 6, ojos: g > 0.3 ? 'cerrados' : 'feliz' });
    },
    sentarse: function (f) {
      return pose({ pA: 88, rA: -88, pB: 80, rB: -80, hA: 24, cA: 62 + Math.sin(f * 2) * 4, hB: 16, cB: 66, alto: 0.01 });
    },

    /* Música y baile */
    cantar: function (f) {
      return pose({ hA: 38, cA: 118 + Math.sin(f * 3) * 3, hB: -55, cB: -50 + Math.sin(f * 4) * 16, cabeza: -8, ojos: 'cerrados', gesto: 'abierta', boca: 0.35 + 0.65 * Math.abs(Math.sin(f * 5)) });
    },
    guitarra: function (f) {
      return pose({ hA: -8 + Math.sin(f * 16) * 7, cA: 32, hB: 80, cB: -15, torso: Math.sin(f * 3) * 3, cabeza: 8 + Math.sin(f * 3) * 4, ojos: 'feliz', gesto: 'abierta', boca: 0.3 });
    },
    moonwalk: function (f) {
      var fase = f * 5, s = Math.sin(fase);
      return pose({ torso: -4, pA: 14 * s, pB: -14 * s, rA: -Math.max(0, s) * 42, rB: -Math.max(0, -s) * 42, hA: 12 + s * 12, cA: 24, hB: -12 - s * 12, cB: 24, ojos: 'feliz' });
    },
    robot: function (f) {
      var POSTURAS = [
        { hA: 90, cA: 90, hB: -90, cB: -90, cabeza: 0 },
        { hA: 90, cA: -90, hB: -90, cB: 90, cabeza: 12 },
        { hA: 150, cA: 0, hB: -30, cB: 0, cabeza: -12 },
        { hA: 30, cA: 0, hB: -150, cB: 0, cabeza: 0 }
      ];
      var c = POSTURAS[Math.floor(f * 2.5) % POSTURAS.length];
      return pose({ hA: c.hA, cA: c.cA, hB: c.hB, cB: c.cB, cabeza: c.cabeza, pA: 12, pB: -12, gesto: 'seria' });
    },

    /* Con algo en las manos */
    leer: function (f) {
      return pose({ hA: 48, cA: 50, hB: 42, cB: 58, cabeza: 12 + Math.sin(f * 1.5) * 2, gesto: 'seria' });
    },
    telefonear: function (f) {
      return pose({ hA: 22, cA: 138, hB: -14, cB: -8, cabeza: 6, gesto: 'abierta', boca: 0.15 + 0.6 * Math.abs(Math.sin(f * 8)) });
    },
    fotografiar: function () { return pose({ hA: 62, cA: 82, hB: 55, cB: 88, torso: 4, ojos: 'guino', gesto: 'seria' }); },
    pescar: function (f) {
      return pose({ hA: 70 + Math.sin(f * 2) * 3, cA: 14, hB: 50, cB: 30, gesto: 'sonrisa', cabeza: 6 });
    },
    barrer: function (f) {
      var s = Math.sin(f * 4);
      return pose({ hA: 40 + s * 14, cA: 30, hB: 28 + s * 14, cB: 40, torso: 12, gesto: 'seria', cabeza: 6 });
    },
    cocinar: function (f) {
      var s = Math.max(0, Math.sin(f * 4));
      return pose({ hA: 72 + s * 10, cA: 18 - s * 8, hB: -14, cB: -8, ojos: 'feliz', cabeza: 6 });
    },
    beber: function (f) {
      var l = Math.max(0, Math.sin(f * 1.6));
      return pose({ hA: 34, cA: 100 + 40 * l, hB: -12, cB: -6, cabeza: -14 * l, ojos: l > 0.5 ? 'cerrados' : 'feliz' });
    },
    brindar: function (f) {
      return pose({ hA: 130 + Math.sin(f * 5) * 10, cA: 10, hB: -18, cB: -8, ojos: 'feliz', gesto: 'abierta', boca: 0.5 });
    },
    pintar: function (f) {
      return pose({ hA: 78 + Math.sin(f * 6) * 14, cA: 10 + Math.cos(f * 6) * 14, hB: -16, cB: -8, cabeza: 6, gesto: 'seria' });
    },
    martillar: function (f) {
      var x = (f * 2.2) % 1, g = x < 0.65 ? suaveSalida(x / 0.65) : 1 - (x - 0.65) / 0.35;
      return pose({ hA: 40 + 115 * g, cA: 30, hB: -14, cB: -8, torso: 8 * (1 - g), gesto: 'seria' });
    },
    excavar: function (f) {
      var s = Math.sin(f * 3);
      return pose({ torso: 18 + s * 12, hA: 52 + s * 10, cA: 10, hB: 40 + s * 10, cB: 22, pA: 22, rA: -20, pB: -14, gesto: 'seria', cabeza: 6 });
    },
    investigar: function (f) {
      return pose({ hA: 70 + Math.sin(f * 2.4) * 6, cA: 10, hB: -14, cB: -8, torso: 10, cabeza: 6, ojos: 'arriba', gesto: 'seria' });
    },
    patinar: function (f) {
      var s = Math.sin(f * 3);
      return pose({ pA: 18, rA: -14, pB: -14, rB: -8, torso: 6 + s * 2, hA: 60 + s * 8, cA: 20, hB: -50 - s * 8, cB: -20, alto: 0.055, ojos: 'feliz' });
    },
    bici: function (f) {
      // Las manos en el manubrio, los pies en los pedales y la cadera en el asiento.
      var fase = f * 7, torso = 18, c = BICI.pedales, r = BICI.biela;
      var cadera = { x: 0, y: 0 };
      var hombro = { x: Math.sin(torso * RAD) * L.torso * 0.88, y: -Math.cos(torso * RAD) * L.torso * 0.88 };
      var brazo = alcanzar(hombro, BICI.manubrio, L.brazo, L.antebrazo, -1);
      var pieA = { x: c.x + Math.sin(fase) * r, y: c.y - Math.cos(fase) * r };
      var pieB = { x: c.x - Math.sin(fase) * r, y: c.y + Math.cos(fase) * r };
      var piernaA = alcanzar(cadera, pieA, L.muslo, L.pierna, 1), piernaB = alcanzar(cadera, pieB, L.muslo, L.pierna, 1);
      return pose({ torso: torso, hA: brazo.ini - torso, cA: brazo.medio, hB: brazo.ini - torso, cB: brazo.medio,
        pA: piernaA.ini, rA: piernaA.medio, pB: piernaB.ini, rB: piernaB.medio,
        alto: BICI.piso - Math.max(pieA.y, pieB.y), ojos: 'feliz' });
    },
    paraguas: function (f) {
      return pose({ hA: 150, cA: 20, hB: -12, cB: -8, torso: Math.sin(f * 2) * 1.2, gesto: 'seria' });
    },
    magia: function (f) {
      return pose({ hA: 110 + Math.sin(f * 5) * 22, cA: 14, hB: -30, cB: -30, ojos: 'feliz', gesto: 'abierta', boca: 0.35 });
    },

    /* Gestos y emociones */
    estirarse: function (f) {
      var b = (1 + Math.sin(f * 1.5)) / 2;
      return pose({ hA: 150, cA: 10, hB: -150, cB: -10, torso: -4 * b, ojos: 'cerrados', gesto: 'abierta', boca: 0.4 + b * 0.6 });
    },
    rascarse: function (f) {
      return pose({ hA: 120, cA: 65 + Math.sin(f * 14) * 10, hB: -12, cB: -8, cabeza: 8, gesto: 'seria', ojos: 'arriba' });
    },
    mareado: function (f) {
      var s = Math.sin(f * 3);
      return pose({ giro: s * 8, torso: s * 10, cabeza: -s * 14, hA: 34 + s * 24, cA: 18, hB: -34 + s * 24, cB: -18, pA: 12 + s * 6, pB: -12 + s * 6, ojos: 'mareado', gesto: 'abierta', boca: 0.3 });
    },
    victoria: function (f) {
      var x = Math.abs(Math.sin(f * 5));
      return pose({ hA: 125 + x * 12, cA: 25, hB: -20, cB: -8, alto: x * 0.025, ojos: 'feliz', gesto: 'abierta', boca: 0.7 });
    },
    enamorado: function (f) {
      var s = Math.sin(f * 2.4);
      return pose({ hA: 28, cA: 140, hB: 28, cB: 135, torso: s * 3, cabeza: -s * 6, ojos: 'enamorado', gesto: 'sonrisa' });
    },
    cabezaExplota: function (f) {
      return pose({ hA: 130, cA: 105, hB: -130, cB: -105, torso: -6 + Math.sin(f * 40) * 1.2, ojos: 'sorpresa', gesto: 'abierta', boca: 1 });
    },
    idea: function (f) {
      return pose({ hA: 125, cA: 30, hB: -14, cB: -8, cabeza: -6, alto: Math.max(0, Math.sin(Math.min(f, 0.6) * 5.2)) * 0.03, ojos: 'feliz', gesto: 'abierta', boca: 0.5 });
    },
    dudar: function (f) {
      return pose({ hA: 40, cA: 120 + Math.sin(f * 4) * 5, hB: 30, cB: 85, cabeza: 10 + Math.sin(f * 1.5) * 4, ojos: 'arriba', gesto: 'seria' });
    },
    alarma: function (f) {
      var s = Math.sin(f * 11);
      return pose({ hA: 150 + s * 20, cA: 6, hB: -150 + s * 20, cB: -6, ojos: 'sorpresa', gesto: 'abierta', boca: 0.9, alto: Math.abs(s) * 0.02 });
    },
    susurrar: function () { return pose({ hA: 35, cA: 125, hB: -12, cB: -8, torso: 8, cabeza: 8, ojos: 'guino', gesto: 'seria', boca: 0.12 }); },
    apuntarArriba: function (f) { return pose({ hA: 125 + Math.sin(f * 3) * 3, cA: 28, hB: -14, cB: -8, cabeza: -14, ojos: 'arriba' }); },
    apuntarAbajo: function (f) { return pose({ hA: 35 + Math.sin(f * 3) * 3, cA: 8, hB: -14, cB: -8, cabeza: 14, torso: 4 }); },
    mirarLejos: function (f) { return pose({ hA: 118, cA: 75, hB: -12, cB: -8, torso: 4 + Math.sin(f * 1.2) * 2, cabeza: -6, gesto: 'seria' }); },
    cansado: function (f) {
      var s = Math.sin(f * 7);
      return pose({ torso: 30 + s * 2, cabeza: -10, hA: 30, cA: -30, hB: 16, cB: -22, pA: 24, rA: -24, pB: -12, rB: -14, ojos: 'cerrados', gesto: 'abierta', boca: 0.45 + s * 0.2 });
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

  // Acciones que pueden cambiar de lugar (con "hacia").
  var SE_MUEVEN = { caminar: true, correr: true, moonwalk: true, patinar: true, bici: true, gatear: true, volar: true, nadar: true };

  // Lo que llevan en las manos sin que nadie lo pida. "sostiene" en la acción cambia el objeto.
  // en: mano (por defecto) | pecho | piso (apoyado en el suelo). tam: fracción del alto del muñequito.
  var PROPS = {
    comer: { tipo: 'manzana', tam: 0.13 }, escribir: { tipo: 'lapiz', tam: 0.14 },
    levantar: { tipo: 'caja', tam: 0.34, dy: -0.13 }, pesas: { tipo: 'pesas', tam: 0.5 },
    cantar: { tipo: 'microfono', tam: 0.14 }, guitarra: { tipo: 'guitarra', tam: 0.5, en: 'pecho', giro: 55 },
    leer: { tipo: 'libro', tam: 0.2 }, telefonear: { tipo: 'telefono', tam: 0.12, giro: 12 },
    fotografiar: { tipo: 'camara', tam: 0.17 }, barrer: { tipo: 'escoba', tam: 0.56, giro: 22, dy: 0.08 },
    cocinar: { tipo: 'sarten', tam: 0.26 }, beber: { tipo: 'vaso', tam: 0.12 }, brindar: { tipo: 'vaso', tam: 0.13 },
    pintar: { tipo: 'lapiz', tam: 0.15 }, martillar: { tipo: 'martillo', tam: 0.26, giro: 30 },
    excavar: { tipo: 'pala', tam: 0.48, giro: 24, dy: 0.08 }, investigar: { tipo: 'lupa', tam: 0.2 },
    patinar: { tipo: 'patineta', tam: 0.34, en: 'piso', atras: true },
    bici: { tipo: 'bicicleta', tam: 0.62, en: 'piso', atras: true, dx: BICI.adelante },
    sentarse: { tipo: 'silla', tam: 0.36, en: 'piso', atras: true },
    paraguas: { tipo: 'paraguas', tam: 0.44, dy: -0.14 }, magia: { tipo: 'varita', tam: 0.22 }
  };
  var SOSTENER = { tam: 0.22 };   // lo que Gemini pide que sostenga con la mano

  function copiarCon(base, cambios) {
    var r = {};
    for (var k in base) r[k] = base[k];
    for (var c in cambios) r[c] = cambios[c];
    return r;
  }

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
      if (xFin !== xIni) dir = (xFin > xIni ? 1 : -1) * (a.accion === 'moonwalk' ? -1 : 1);   // el moonwalk va de espaldas
      else if (a.mira) dir = a.mira === 'izquierda' ? -1 : 1;

      if (t < inicio + dur || i === acciones.length - 1) {
        var f = limitar(t - inicio, 0, dur);
        var p = pose(fn(f, dur));
        if (anterior && f < MEZCLA) p = mezclarPoses(anteriorFin, p, suaveSalida(f / MEZCLA));
        if (t > inicio + dur) p = pose(fn(dur, dur));          // terminó la última: se queda así
        var avance = xFin === xIni ? 1 : suaveAmbos(limitar(f / dur, 0, 1));
        if (a.expresion) p.ojos = a.expresion;
        var prop = PROPS[a.accion] || null;
        // La bici, la patineta, la silla o la guitarra no se cambian por lo que pida "sostiene".
        if (a.sostiene && !(prop && prop.en)) prop = copiarCon(prop || SOSTENER, { tipo: a.sostiene });
        resultado = { x: mezclar(xIni, xFin, avance), dir: dir, pose: p, dice: a.dice, diceDesde: inicio, diceHasta: inicio + dur, f: f, accion: a.accion, dur: dur, prop: prop };
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
    var e = { cadera: cadera, cuello: cuello, hombro: hombro, cabeza: centroCabeza, angCabeza: angCabeza,
      codoA: codoA, manoA: manoA, codoB: codoB, manoB: manoB, rodA: rodA, pieA: pieA, rodB: rodB, pieB: pieB };
    if (p.giro) {
      var a = p.giro * dir * RAD, cos = Math.cos(a), sen = Math.sin(a);
      ['cuello', 'hombro', 'cabeza', 'codoA', 'manoA', 'codoB', 'manoB', 'rodA', 'pieA', 'rodB', 'pieB'].forEach(function (n) {
        var q = e[n];
        e[n] = { x: q.x * cos - q.y * sen, y: q.x * sen + q.y * cos };
      });
    }
    return e;
  }

  // El punto más bajo del cuerpo: es el que se apoya en el suelo (acostado, gateando…).
  function puntoMasBajo(e, h) {
    return Math.max(e.pieA.y, e.pieB.y, e.rodA.y, e.rodB.y, e.manoA.y, e.manoB.y, e.cabeza.y + L.cabeza * h, 0);
  }

  function linea(ctx, puntos) {
    ctx.beginPath();
    ctx.moveTo(puntos[0].x, puntos[0].y);
    for (var i = 1; i < puntos.length; i++) ctx.lineTo(puntos[i].x, puntos[i].y);
    ctx.stroke();
  }

  var NO_PARPADEA = { sorpresa: true, llorando: true, guino: true, mareado: true, enamorado: true, estrellas: true, dinero: true };

  function parpadea(t, semilla) {
    var ciclo = 3.4 + (semilla % 7) * 0.23;
    return ((t + semilla * 0.37) % ciclo) < 0.12;
  }

  function dibujarCara(ctx, e, p, dir, h, t, semilla) {
    var r = L.cabeza * h, c = e.cabeza;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((p.cabeza * 0.5 + p.giro) * dir * RAD);
    var ox = dir * r * 0.28;                     // la cara mira hacia donde camina
    var ojoY = -r * 0.12, sep = r * 0.32, ojoR = r * 0.1;
    var ojos = parpadea(t, semilla) && !NO_PARPADEA[p.ojos] ? 'cerrados' : p.ojos;
    ctx.fillStyle = TINTA;
    ctx.lineWidth = Math.max(1.5, h * 0.012);
    [-1, 1].forEach(function (lado) {
      var x = ox + lado * sep, y = ojoY;
      if (ojos === 'cerrados') { linea(ctx, [{ x: x - ojoR, y: y }, { x: x + ojoR, y: y }]); return; }
      if (ojos === 'llorando') {
        ctx.beginPath(); ctx.arc(x, y - ojoR * 0.6, ojoR * 1.1, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
        var caida = ((t * 0.9 + (lado > 0 ? 0.5 : 0)) % 1);
        ctx.save(); ctx.fillStyle = '#4ea8de';
        ctx.beginPath(); ctx.arc(x, y + ojoR * (1.5 + caida * 5), ojoR * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        linea(ctx, [{ x: x - ojoR * 1.4, y: y - ojoR * 2.4 - lado * ojoR * 0.8 }, { x: x + ojoR * 1.4, y: y - ojoR * 2.4 + lado * ojoR * 0.8 }]);
        return;
      }
      if (ojos === 'feliz') { ctx.beginPath(); ctx.arc(x, y + ojoR * 0.6, ojoR * 1.1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); return; }
      if (ojos === 'guino' && lado === dir) { linea(ctx, [{ x: x - ojoR * 1.1, y: y - ojoR * 0.5 }, { x: x + ojoR * 1.1, y: y }, { x: x - ojoR * 1.1, y: y + ojoR * 0.5 }]); return; }
      if (ojos === 'mareado') {
        ctx.beginPath();
        for (var v = 0; v <= 16; v++) {
          var ang = v * 0.8 + t * 8 * lado, rad = ojoR * 1.5 * v / 16;
          ctx[v ? 'lineTo' : 'moveTo'](x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
        }
        ctx.stroke();
        return;
      }
      if (ojos === 'enamorado' || ojos === 'estrellas' || ojos === 'dinero') {
        ctx.save();
        ctx.translate(x, y);
        ctx.lineWidth = Math.max(0.8, h * 0.004);
        if (ojos === 'enamorado') OBJETOS.corazon(ctx, ojoR * 3.4);
        else if (ojos === 'estrellas') OBJETOS.estrella(ctx, ojoR * 3.4);
        else {
          ctx.fillStyle = '#2b9348';
          ctx.font = '900 ' + Math.round(ojoR * 3.2) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$', 0, 0);
        }
        ctx.restore();
        return;
      }
      var rr = ojos === 'sorpresa' ? ojoR * 1.45 : ojoR;
      var dy = ojos === 'arriba' ? -ojoR * 0.6 : 0;
      ctx.beginPath(); ctx.arc(x + (ojos === 'arriba' ? dir * ojoR * 0.4 : 0), y + dy, rr, 0, Math.PI * 2); ctx.fill();
      if (ojos === 'triste' || ojos === 'llorando') linea(ctx, [{ x: x - ojoR * 1.4, y: y - ojoR * 2.4 - lado * ojoR * 0.8 }, { x: x + ojoR * 1.4, y: y - ojoR * 2.4 + lado * ojoR * 0.8 }]);
      if (ojos === 'enojado') linea(ctx, [{ x: x - ojoR * 1.4, y: y - ojoR * 2.6 + lado * ojoR }, { x: x + ojoR * 1.4, y: y - ojoR * 2.6 - lado * ojoR }]);
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

  function dibujarProp(ctx, prop, e, dir, h, piso, vivo) {
    var dibujo = OBJETOS[prop.tipo];
    if (!dibujo) return;
    var s = h * prop.tam, x = e.manoA.x, y = e.manoA.y;
    if (prop.en === 'pecho') { x = mezclar(e.cadera.x, e.cuello.x, 0.45); y = mezclar(e.cadera.y, e.cuello.y, 0.45); }
    if (prop.en === 'piso') { x = (prop.dx || 0) * h * dir; y = piso - s * (prop.tipo === 'patineta' ? 0.14 : 0.48); }
    ctx.save();
    ctx.translate(x, y + (prop.dy || 0) * h);
    ctx.rotate((prop.giro || 0) * dir * RAD);
    ctx.scale(dir, 1);                            // las herramientas apuntan hacia donde mira
    ctx.strokeStyle = TINTA;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    dibujo(ctx, s, vivo);
    ctx.restore();
  }

  function dibujarPersonaje(ctx, est, per, W, H, t, indice, oscuro) {
    var lado = Math.min(W, H);
    var h = lado * ALTO_PERSONAJE * (per.escala || 1);
    var p = est.pose, dir = est.dir;
    var e = esqueleto(p, dir, h);
    // Se apoya en lo más bajo del cuerpo, así al doblar las rodillas baja el cuerpo.
    var bajo = puntoMasBajo(e, h);
    var ox = est.x * W, oy = H * SUELO - bajo - p.alto * h;
    var accesorios = [].concat(per.accesorio || []);

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
    var grosor = ctx.lineWidth;
    accesorios.forEach(function (a) { if (ACCESORIO_ATRAS[a]) dibujarAccesorio(ctx, a, e, p, dir, h, per.color, t); });
    if (est.prop && est.prop.atras) dibujarProp(ctx, est.prop, e, dir, h, bajo + p.alto * h, est.f);
    if (oscuro) {
      // Sobre un fondo oscuro la tinta casi no se ve: se le pone un contorno claro.
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = grosor * 1.8;
      linea(ctx, [e.pieB, e.rodB, e.cadera, e.rodA, e.pieA]);
      linea(ctx, [e.manoB, e.codoB, e.hombro, e.codoA, e.manoA]);
      linea(ctx, [e.cadera, e.cuello]);
      ctx.strokeStyle = TINTA;
      ctx.lineWidth = grosor;
    }
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
    dibujarCara(ctx, e, p, dir, h, t, indice * 13 + 5);
    accesorios.forEach(function (a) { if (!ACCESORIO_ATRAS[a]) dibujarAccesorio(ctx, a, e, p, dir, h, per.color, t); });
    if (est.prop && !est.prop.atras) dibujarProp(ctx, est.prop, e, dir, h, bajo + p.alto * h, est.f);
    if (est.accion && ADORNOS[est.accion]) {
      ctx.save();
      ADORNOS[est.accion](ctx, e, est.f, h, dir, est.dur, bajo + p.alto * h);
      ctx.restore();
    }
    ctx.restore();

    return { cabezaX: ox + e.cabeza.x, cabezaY: oy + e.cabeza.y - L.cabeza * h, h: h };
  }

  /* ---------------- Adornos ----------------
     Pequeños detalles de historieta que acompañan a una acción: la Z de quien duerme,
     las notas de quien canta… Se dibujan alrededor del muñequito, sin tocar su pose. */

  // Un objeto pequeño, centrado en (x, y).
  function icono(ctx, tipo, x, y, s, alfa, giro, vivo) {
    ctx.save();
    ctx.globalAlpha *= limitar(alfa == null ? 1 : alfa, 0, 1);
    ctx.translate(x, y);
    if (giro) ctx.rotate(giro);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TINTA;
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    OBJETOS[tipo](ctx, s, vivo || 0);
    ctx.restore();
  }

  function letra(ctx, texto, x, y, tam, alfa, color) {
    ctx.save();
    ctx.globalAlpha *= limitar(alfa, 0, 1);
    ctx.font = '900 ' + Math.max(8, Math.round(tam)) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = tam * 0.2;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(texto, x, y);
    ctx.fillStyle = color || TINTA;
    ctx.fillText(texto, x, y);
    ctx.restore();
  }

  // Cosas que suben desde la cabeza y se desvanecen. dibuja(i, x, y, alfa)
  function suben(c, h, dir, f, n, ciclo, dibuja) {
    for (var i = 0; i < n; i++) {
      var x = ((f + i * ciclo / n) % ciclo) / ciclo;
      if (f < i * ciclo / n) continue;
      dibuja(i, c.x + dir * h * (0.12 + x * 0.14 + (i % 2) * 0.05), c.y - h * (0.1 + x * 0.26), Math.sin(x * Math.PI) * 1.6);
    }
  }

  function polvo(ctx, x, y, h, f, ciclo) {
    for (var i = 0; i < 3; i++) {
      var k = ((f + i * ciclo / 3) % ciclo) / ciclo;
      ctx.fillStyle = 'rgba(120,110,95,' + (0.35 * (1 - k)) + ')';
      ctx.beginPath();
      ctx.arc(x - k * h * 0.18 * (i - 0.4), y - k * h * 0.08, h * (0.015 + k * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  var ADORNOS = {
    dormir: function (ctx, e, f, h, dir) {
      suben(e.cabeza, h, dir, f, 3, 2.4, function (i, x, y, a) { letra(ctx, 'Z', x, y, h * (0.06 + i * 0.02), a, '#2a6fdb'); });
    },
    reir: function (ctx, e, f, h, dir) {
      suben(e.cabeza, h, dir, f, 2, 1.1, function (i, x, y, a) { letra(ctx, 'JA', x + dir * h * 0.05, y, h * 0.07, a, '#e63946'); });
    },
    cantar: function (ctx, e, f, h, dir) {
      suben(e.cabeza, h, dir, f, 3, 1.8, function (i, x, y, a) { icono(ctx, 'notaMusical', x, y, h * 0.1, a, Math.sin(f * 4 + i) * 0.3); });
    },
    guitarra: function (ctx, e, f, h, dir) {
      suben(e.cabeza, h, dir, f, 3, 2, function (i, x, y, a) { icono(ctx, 'notaMusical', x, y, h * 0.09, a, Math.sin(f * 4 + i) * 0.3); });
    },
    enamorado: function (ctx, e, f, h, dir) {
      suben(e.cabeza, h, dir, f, 3, 1.9, function (i, x, y, a) { icono(ctx, 'corazon', x, y, h * (0.07 + (i % 2) * 0.03), a); });
    },
    pensar: function (ctx, e, f, h, dir) {
      var c = e.cabeza;
      [0.03, 0.045, 0.065].forEach(function (r, i) {
        if (f < 0.3 + i * 0.35) return;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = TINTA;
        ctx.lineWidth = Math.max(1.2, h * 0.008);
        ctx.beginPath();
        ctx.arc(c.x + dir * h * (0.14 + i * 0.05), c.y - h * (0.14 + i * 0.08 + Math.sin(f * 2 + i) * 0.006), r * h * 0.7, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      });
    },
    dudar: function (ctx, e, f, h, dir) {
      letra(ctx, '?', e.cabeza.x + dir * h * 0.16, e.cabeza.y - h * (0.2 + Math.sin(f * 3) * 0.012), h * 0.13, Math.min(1, f * 3), '#e63946');
    },
    rascarse: function (ctx, e, f, h, dir) {
      letra(ctx, '?', e.cabeza.x - dir * h * 0.17, e.cabeza.y - h * (0.18 + Math.sin(f * 3) * 0.012), h * 0.1, Math.min(1, f * 3), '#2a6fdb');
    },
    alarma: function (ctx, e, f, h, dir) {
      letra(ctx, '!', e.cabeza.x + dir * h * 0.17, e.cabeza.y - h * 0.2, h * (0.14 + Math.abs(Math.sin(f * 11)) * 0.03), Math.min(1, f * 4), '#ff7b00');
    },
    sorpresa: function (ctx, e, f, h) {
      var c = e.cabeza, a = 1 - f / 0.6;
      if (a <= 0) return;
      ctx.strokeStyle = '#e63946';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.globalAlpha *= a;
      for (var i = 0; i < 7; i++) {
        var ang = (-160 + i * 23) * RAD, d = h * (0.15 + (1 - a) * 0.04);
        linea(ctx, [{ x: c.x + Math.cos(ang) * d, y: c.y + Math.sin(ang) * d }, { x: c.x + Math.cos(ang) * (d + h * 0.05), y: c.y + Math.sin(ang) * (d + h * 0.05) }]);
      }
    },
    enojado: function (ctx, e, f, h) {
      var c = e.cabeza;
      [-1, 1].forEach(function (l) {
        for (var i = 0; i < 2; i++) {
          var k = ((f + i * 0.35) % 0.7) / 0.7;
          ctx.fillStyle = 'rgba(150,150,155,' + (0.8 * (1 - k)) + ')';
          ctx.beginPath();
          ctx.arc(c.x + l * h * (0.13 + k * 0.11), c.y - h * (0.03 + k * 0.08), h * (0.012 + k * 0.024), 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    asustado: function (ctx, e, f, h, dir) {
      var k = (f % 0.8) / 0.8;
      icono(ctx, 'agua', e.cabeza.x - dir * h * 0.13, e.cabeza.y - h * 0.04 + k * h * 0.08, h * 0.05, 1 - k);
    },
    temblar: function (ctx, e, f, h) {
      ctx.strokeStyle = TINTA;
      ctx.lineWidth = Math.max(1, h * 0.007);
      [-1, 1].forEach(function (l) {
        var x = e.cabeza.x + l * h * 0.17 + Math.sin(f * 40) * h * 0.004;
        ctx.beginPath(); ctx.moveTo(x, e.cabeza.y - h * 0.05); ctx.quadraticCurveTo(x + l * h * 0.03, e.cabeza.y, x, e.cabeza.y + h * 0.05); ctx.stroke();
      });
    },
    triste: function (ctx, e, f, h) {
      // La nubecita gris que persigue a quien está triste.
      var c = e.cabeza, y = c.y - h * 0.24;
      ctx.fillStyle = '#4ea8de';
      for (var i = 0; i < 4; i++) {
        var k = ((f * 1.2 + i * 0.27) % 1);
        ctx.fillRect(c.x + (i - 1.5) * h * 0.05, y + h * 0.02 + k * h * 0.1, h * 0.008, h * 0.022);
      }
      icono(ctx, 'nube', c.x, y, h * 0.2, Math.min(1, f * 3));
    },
    mareado: function (ctx, e, f, h) {
      var c = e.cabeza;
      for (var i = 0; i < 3; i++) {
        var a = f * 4 + i * 2.1;
        icono(ctx, 'estrella', c.x + Math.cos(a) * h * 0.15, c.y - h * 0.13 + Math.sin(a) * h * 0.035, h * 0.06);
      }
    },
    desmayarse: function (ctx, e, f, h) {
      if (f < 0.7) return;
      var c = e.cabeza;
      for (var i = 0; i < 3; i++) {
        var a = f * 4 + i * 2.1;
        icono(ctx, 'estrella', c.x + Math.cos(a) * h * 0.12, c.y - h * 0.13 + Math.sin(a) * h * 0.03, h * 0.05);
      }
    },
    cabezaExplota: function (ctx, e, f, h) {
      if (f < 0.35) return;
      var c = e.cabeza, k = (f - 0.35) % 1.6, COL = ['#ffd23f', '#ff7b00', '#e63946', '#2a6fdb'];
      if (k < 0.3) {
        ctx.strokeStyle = '#ff7b00';
        ctx.lineWidth = Math.max(2, h * 0.016);
        for (var j = 0; j < 9; j++) {
          var a0 = (-170 + j * 20) * RAD, d = h * (0.14 + k * 0.5);
          linea(ctx, [{ x: c.x + Math.cos(a0) * d, y: c.y + Math.sin(a0) * d }, { x: c.x + Math.cos(a0) * (d + h * 0.06), y: c.y + Math.sin(a0) * (d + h * 0.06) }]);
        }
      }
      for (var i = 0; i < 14; i++) {
        var a = (-170 + i * 12) * RAD, v = h * (0.5 + azar(i) * 0.7);
        var x = c.x + Math.cos(a) * v * k, y = c.y - h * 0.08 + Math.sin(a) * v * k + 0.7 * h * k * k;
        ctx.fillStyle = COL[i % COL.length];
        ctx.globalAlpha = limitar(1.4 - k, 0, 1);
        ctx.fillRect(x, y, h * 0.018, h * 0.018);
      }
    },
    idea: function (ctx, e, f, h) {
      var c = e.cabeza, s = h * 0.2 * rebote(limitar(f / 0.35, 0, 1));
      icono(ctx, 'bombilla', c.x, c.y - h * 0.26 + Math.sin(f * 3) * h * 0.006, s);
    },
    correr: function (ctx, e, f, h, dir, dur, piso) { polvo(ctx, -dir * h * 0.1, piso - h * 0.015, h, f, 0.5); },
    patinar: function (ctx, e, f, h, dir, dur, piso) { polvo(ctx, -dir * h * 0.18, piso - h * 0.015, h, f, 0.7); },
    bici: function (ctx, e, f, h, dir, dur, piso) { polvo(ctx, -dir * h * 0.3, piso - h * 0.015, h, f, 0.6); },
    cansado: function (ctx, e, f, h, dir) {
      var k = (f % 0.9) / 0.9;
      icono(ctx, 'agua', e.cabeza.x - dir * h * 0.12, e.cabeza.y - h * 0.05 + k * h * 0.1, h * 0.05, 1 - k);
    },
    meditar: function (ctx, e, f, h) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.globalAlpha = 0.5 + Math.sin(f * 2) * 0.25;
      ctx.beginPath(); ctx.arc(e.cabeza.x, e.cabeza.y, h * 0.16, 0, Math.PI * 2); ctx.stroke();
    },
    martillar: function (ctx, e, f, h, dir) {
      var x = (f * 2.2) % 1;
      if (x < 0.55 || x > 0.8) return;
      icono(ctx, 'estrella', e.manoA.x + dir * h * 0.2, e.manoA.y + h * 0.08, h * 0.14 * (x - 0.3));
    },
    magia: function (ctx, e, f, h, dir) {
      var a = e.manoA;
      for (var i = 0; i < 6; i++) {
        var k = ((f * 1.2 + i / 6) % 1);
        icono(ctx, 'estrella', a.x + dir * h * (0.1 + k * 0.28), a.y - h * (0.1 + Math.sin(i * 2.4) * k * 0.18), h * 0.05 * (1 - k * 0.5), 1 - k);
      }
    },
    fotografiar: function (ctx, e, f, h, dir) {
      var k = f % 1.5;
      if (k > 0.14) return;
      ctx.fillStyle = 'rgba(255,255,220,' + (1 - k / 0.14) + ')';
      ctx.beginPath(); ctx.arc(e.manoA.x + dir * h * 0.08, e.manoA.y - h * 0.03, h * 0.14, 0, Math.PI * 2); ctx.fill();
    },
    lanzar: function (ctx, e, f, h, dir, dur, piso) {
      var x = (f % 1.6) / 1.6;
      if (x < 0.55) { icono(ctx, 'pelota', e.manoA.x, e.manoA.y, h * 0.09, 1, 0, f); return; }
      var k = (x - 0.55) / 0.45;
      icono(ctx, 'pelota', dir * h * (0.3 + k * 1.1), mezclar(-h * 0.5, piso - h * 0.05, k * k), h * 0.09, 1, k * 8 * dir, f);
    },
    jalar: function (ctx, e, f, h, dir) {
      ctx.strokeStyle = '#8d5524';
      ctx.lineWidth = Math.max(2, h * 0.014);
      var w = Math.sin(f * 7) * h * 0.012, m = e.manoA;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.quadraticCurveTo(m.x + dir * h * 0.3, m.y + h * 0.05 + w, m.x + dir * h * 0.75, m.y + h * 0.03); ctx.stroke();
    },
    pescar: function (ctx, e, f, h, dir, dur, piso) {
      var m = e.manoA, px = m.x + dir * h * 0.42, py = m.y - h * 0.34, cae = piso - h * 0.04 + Math.sin(f * 2) * h * 0.012;
      ctx.strokeStyle = '#8d5524';
      ctx.lineWidth = Math.max(2, h * 0.014);
      linea(ctx, [m, { x: px, y: py }]);
      ctx.strokeStyle = TINTA;
      ctx.lineWidth = Math.max(1, h * 0.005);
      linea(ctx, [{ x: px, y: py }, { x: px + dir * h * 0.04, y: cae }]);
      icono(ctx, 'pez', px + dir * h * 0.04, cae, h * 0.1, 1, Math.sin(f * 7) * 0.3);
    },
    cocinar: function (ctx, e, f, h, dir) {
      var m = e.manoA, s = Math.max(0, Math.sin(f * 4));
      ctx.fillStyle = '#8d5524';
      ctx.beginPath();
      ctx.ellipse(m.x + dir * h * 0.16, m.y - h * 0.035 - s * h * 0.13, h * 0.05, h * 0.015, s * 2, 0, Math.PI * 2);
      ctx.fill();
      for (var i = 0; i < 3; i++) {
        var k = ((f * 0.7 + i / 3) % 1);
        ctx.fillStyle = 'rgba(160,160,165,' + (0.5 * (1 - k)) + ')';
        ctx.beginPath();
        ctx.arc(m.x + dir * h * (0.12 + i * 0.04), m.y - h * (0.05 + k * 0.28), h * (0.012 + k * 0.024), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // Número de 0 a 1 que siempre es el mismo para la misma semilla (el video sale idéntico).
  function azar(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  var ACCESORIO_ATRAS = { capa: true, mochila: true };
  // Van en lo alto de la cabeza: no se pueden llevar dos a la vez.
  var SOMBREROS = ['gorra', 'sombrero', 'corona', 'audifonos', 'casco', 'astronauta', 'mago', 'fiesta', 'vaquero', 'chef', 'birrete', 'pirata', 'orejas'];

  function dibujarAccesorio(ctx, tipo, e, p, dir, h, color, t) {
    var r = L.cabeza * h, c = e.cabeza;
    ctx.save();
    // Los accesorios giran con la cabeza; los del cuerpo, con el cuerpo.
    var delCuerpo = tipo === 'corbata' || tipo === 'bufanda' || ACCESORIO_ATRAS[tipo];
    var pivote = delCuerpo ? e.cuello : c;
    ctx.translate(pivote.x, pivote.y);
    ctx.rotate((delCuerpo ? p.giro + p.torso : p.cabeza * 0.5 + p.giro) * dir * RAD);
    ctx.translate(-pivote.x, -pivote.y);
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
      ctx.fillStyle = TINTA;   // con el color del personaje no se vería sobre el cuerpo
      ctx.beginPath(); ctx.moveTo(n.x, n.y + h * 0.01); ctx.lineTo(n.x - h * 0.02, n.y + h * 0.1); ctx.lineTo(n.x, n.y + h * 0.13); ctx.lineTo(n.x + h * 0.02, n.y + h * 0.1); ctx.closePath(); ctx.fill();
    } else if (tipo === 'corona') {
      ctx.fillStyle = '#ffc93c';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      var base = c.y - r * 0.8;
      ctx.beginPath(); ctx.moveTo(c.x - r * 0.7, base); ctx.lineTo(c.x - r * 0.75, base - r * 0.7); ctx.lineTo(c.x - r * 0.35, base - r * 0.35);
      ctx.lineTo(c.x, base - r * 0.85); ctx.lineTo(c.x + r * 0.35, base - r * 0.35); ctx.lineTo(c.x + r * 0.75, base - r * 0.7); ctx.lineTo(c.x + r * 0.7, base); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (tipo === 'moño') {
      var mx = c.x - dir * r * 0.55, my = c.y - r * 0.85;
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + l * r * 0.5, my - r * 0.3); ctx.lineTo(mx + l * r * 0.5, my + r * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
      ctx.beginPath(); ctx.arc(mx, my, r * 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (tipo === 'bigote') {
      var bx = c.x + dir * r * 0.28, by = c.y + r * 0.22;
      ctx.fillStyle = TINTA;
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.ellipse(bx + l * r * 0.2, by, r * 0.22, r * 0.09, l * 0.25, 0, Math.PI * 2); ctx.fill();
      });
    } else if (tipo === 'audifonos') {
      ctx.lineWidth = Math.max(2, h * 0.02);
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 1.12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.ellipse(c.x + l * r * 1.02, c.y - r * 0.05, r * 0.2, r * 0.32, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    } else if (tipo === 'cabello') {
      ctx.fillStyle = '#3b2a1a';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      // Puntas solo en la parte de arriba; por debajo sigue la forma de la cabeza.
      ctx.beginPath();
      var puntas = 8;
      for (var i = 0; i <= puntas; i++) {
        var a = Math.PI * (1.15 + i * 0.7 / puntas), alto = i % 2 ? 1.32 : 0.98;
        ctx.lineTo(c.x + Math.cos(a) * r * alto, c.y + Math.sin(a) * r * alto);
      }
      ctx.arc(c.x, c.y, r * 0.98, Math.PI * 1.85, Math.PI * 1.15, true);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (tipo === 'gafasSol') {
      ctx.fillStyle = TINTA;
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.ellipse(c.x + dir * r * 0.28 + l * r * 0.33, c.y - r * 0.12, r * 0.28, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      });
      linea(ctx, [{ x: c.x + dir * r * 0.28 - r * 0.1, y: c.y - r * 0.16 }, { x: c.x + dir * r * 0.28 + r * 0.1, y: c.y - r * 0.16 }]);
    } else if (tipo === 'parche') {
      ctx.fillStyle = TINTA;
      ctx.lineWidth = Math.max(1.5, h * 0.01);
      var px = c.x + dir * r * 0.6;
      ctx.beginPath(); ctx.ellipse(px, c.y - r * 0.12, r * 0.22, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      linea(ctx, [{ x: c.x - dir * r * 0.95, y: c.y - r * 0.32 }, { x: px, y: c.y - r * 0.2 }]);
    } else if (tipo === 'casco') {
      ctx.fillStyle = '#ffc93c';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.beginPath(); ctx.arc(c.x, c.y - r * 0.2, r * 0.98, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      rect(ctx, c.x - r * 1.2, c.y - r * 0.32, r * 2.4, r * 0.18, '#ffc93c', r * 0.08);
      rect(ctx, c.x - r * 0.14, c.y - r * 1.25, r * 0.28, r * 0.9, '#ffb703', r * 0.08);
    } else if (tipo === 'astronauta') {
      ctx.fillStyle = 'rgba(190,225,245,0.35)';
      ctx.lineWidth = Math.max(2, h * 0.016);
      circulo(ctx, c.x, c.y, r * 1.38, 'rgba(190,225,245,0.35)');
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 1.14, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
      ctx.strokeStyle = TINTA;
      rect(ctx, c.x - r * 0.8, c.y + r * 1.15, r * 1.6, r * 0.26, '#e9e6dd', r * 0.1);
    } else if (tipo === 'mago' || tipo === 'fiesta') {
      var mago = tipo === 'mago', anchoG = r * (mago ? 1.0 : 0.66), baseG = c.y - r * (mago ? 0.65 : 0.72), puntaG = baseG - r * (mago ? 1.8 : 1.3);
      ctx.fillStyle = mago ? '#3a2d8f' : '#ff4d8d';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.beginPath(); ctx.moveTo(c.x - anchoG, baseG); ctx.lineTo(c.x - dir * r * 0.08, puntaG); ctx.lineTo(c.x + anchoG, baseG); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (mago) {
        rect(ctx, c.x - r * 1.3, baseG - r * 0.08, r * 2.6, r * 0.16, '#3a2d8f', r * 0.08);
        ctx.save(); ctx.translate(c.x, baseG - r * 0.7); ctx.lineWidth = Math.max(1, h * 0.005); OBJETOS.estrella(ctx, r * 0.55); ctx.restore();
      } else {
        circulo(ctx, c.x - dir * r * 0.08, puntaG, r * 0.17, '#ffd23f');
      }
    } else if (tipo === 'vaquero') {
      ctx.fillStyle = '#a0692f';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.beginPath(); ctx.moveTo(c.x - r * 1.55, c.y - r * 0.92); ctx.quadraticCurveTo(c.x, c.y - r * 0.45, c.x + r * 1.55, c.y - r * 0.92); ctx.quadraticCurveTo(c.x, c.y - r * 1.05, c.x - r * 1.55, c.y - r * 0.92); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.x - r * 0.68, c.y - r * 0.82); ctx.lineTo(c.x - r * 0.55, c.y - r * 1.7); ctx.quadraticCurveTo(c.x, c.y - r * 1.4, c.x + r * 0.55, c.y - r * 1.7); ctx.lineTo(c.x + r * 0.68, c.y - r * 0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (tipo === 'chef') {
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      [[-0.5, -1.45, 0.48], [0.5, -1.45, 0.48], [0, -1.7, 0.56]].forEach(function (b) { circulo(ctx, c.x + b[0] * r, c.y + b[1] * r, b[2] * r, '#ffffff'); });
      rect(ctx, c.x - r * 0.8, c.y - r * 1.35, r * 1.6, r * 0.6, '#ffffff', r * 0.06);
    } else if (tipo === 'birrete') {
      ctx.fillStyle = '#1d1d1f';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      rect(ctx, c.x - r * 0.72, c.y - r * 1.1, r * 1.44, r * 0.42, '#1d1d1f', r * 0.05);
      ctx.beginPath(); ctx.moveTo(c.x - r * 1.45, c.y - r * 1.2); ctx.lineTo(c.x, c.y - r * 1.65); ctx.lineTo(c.x + r * 1.45, c.y - r * 1.2); ctx.lineTo(c.x, c.y - r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffc93c';
      linea(ctx, [{ x: c.x, y: c.y - r * 1.25 }, { x: c.x - dir * r * 1.1, y: c.y - r * 1.05 }, { x: c.x - dir * r * 1.15, y: c.y - r * 0.5 }]);
    } else if (tipo === 'pirata') {
      ctx.fillStyle = '#1d1d1f';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.beginPath(); ctx.moveTo(c.x - r * 1.5, c.y - r * 0.75); ctx.quadraticCurveTo(c.x - r * 0.8, c.y - r * 1.9, c.x, c.y - r * 1.5); ctx.quadraticCurveTo(c.x + r * 0.8, c.y - r * 1.9, c.x + r * 1.5, c.y - r * 0.75); ctx.quadraticCurveTo(c.x, c.y - r * 0.5, c.x - r * 1.5, c.y - r * 0.75); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.translate(c.x, c.y - r * 1.1); ctx.lineWidth = Math.max(1, h * 0.004); OBJETOS.calavera(ctx, r * 0.75); ctx.restore();
    } else if (tipo === 'orejas') {
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      [-1, 1].forEach(function (l) {
        ctx.fillStyle = '#ffb35c';
        ctx.beginPath(); ctx.moveTo(c.x + l * r * 0.95, c.y - r * 0.5); ctx.lineTo(c.x + l * r * 0.85, c.y - r * 1.4); ctx.lineTo(c.x + l * r * 0.2, c.y - r * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
    } else if (tipo === 'aureola') {
      ctx.strokeStyle = '#ffc93c';
      ctx.lineWidth = Math.max(2, h * 0.016);
      ctx.beginPath(); ctx.ellipse(c.x, c.y - r * 1.4 + Math.sin(t * 2.5) * r * 0.05, r * 0.72, r * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (tipo === 'cuernos') {
      ctx.fillStyle = '#d62828';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.moveTo(c.x + l * r * 0.72, c.y - r * 0.68); ctx.quadraticCurveTo(c.x + l * r * 1.1, c.y - r * 1.2, c.x + l * r * 0.72, c.y - r * 1.55); ctx.quadraticCurveTo(c.x + l * r * 0.72, c.y - r * 1.1, c.x + l * r * 0.28, c.y - r * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
    } else if (tipo === 'barba') {
      ctx.fillStyle = '#6b4a2b';
      ctx.lineWidth = Math.max(1.2, h * 0.008);
      var bbx = c.x + dir * r * 0.1;
      ctx.beginPath(); ctx.moveTo(bbx - r * 0.75, c.y + r * 0.25); ctx.quadraticCurveTo(bbx - r * 0.7, c.y + r * 1.25, bbx, c.y + r * 1.35); ctx.quadraticCurveTo(bbx + r * 0.7, c.y + r * 1.25, bbx + r * 0.75, c.y + r * 0.25); ctx.quadraticCurveTo(bbx, c.y + r * 0.72, bbx - r * 0.75, c.y + r * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (tipo === 'bufanda') {
      var nb = e.cuello;
      ctx.fillStyle = color || '#e63946';
      ctx.lineWidth = Math.max(1.5, h * 0.01);
      rect(ctx, nb.x - r * 0.62, nb.y - r * 0.08, r * 1.24, r * 0.34, color || '#e63946', r * 0.15);
      var ond = Math.sin(t * 5) * r * 0.1;
      ctx.beginPath(); ctx.moveTo(nb.x - dir * r * 0.3, nb.y + r * 0.15); ctx.quadraticCurveTo(nb.x - dir * r * 0.9, nb.y + r * 0.45 + ond, nb.x - dir * r * 1.1, nb.y + r * 1.0 + ond);
      ctx.lineTo(nb.x - dir * r * 0.65, nb.y + r * 1.05); ctx.quadraticCurveTo(nb.x - dir * r * 0.6, nb.y + r * 0.55, nb.x + dir * r * 0.1, nb.y + r * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (tipo === 'capa') {
      var nc = e.cuello, on1 = Math.sin(t * 6) * h * 0.02, on2 = Math.sin(t * 6 + 1.4) * h * 0.03;
      ctx.fillStyle = color || '#e63946';
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      ctx.beginPath();
      ctx.moveTo(nc.x + dir * h * 0.02, nc.y);
      ctx.quadraticCurveTo(nc.x - dir * h * 0.12, nc.y + h * 0.14 + on1, nc.x - dir * h * 0.16 + on2, nc.y + h * 0.42);
      ctx.quadraticCurveTo(nc.x - dir * h * 0.07, nc.y + h * 0.38 + on1, nc.x + dir * h * 0.01, nc.y + h * 0.33);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (tipo === 'mochila') {
      var nm = e.cuello;
      ctx.lineWidth = Math.max(1.5, h * 0.012);
      rect(ctx, nm.x - dir * h * 0.09 - h * 0.055, nm.y + h * 0.02, h * 0.11, h * 0.17, color || '#2a6fdb', h * 0.025);
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
    },

    /* Espacio y clima */
    planeta: function (ctx, s) {
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.55, s * 0.14, -0.35, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
      circulo(ctx, 0, 0, s * 0.3, '#f4a261');
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.55, s * 0.14, -0.35, Math.PI * 0.05, Math.PI * 0.95);
      ctx.strokeStyle = TINTA; ctx.stroke();
      ctx.lineWidth *= 0.6;
      linea(ctx, [{ x: -s * 0.25, y: -s * 0.05 }, { x: s * 0.22, y: -s * 0.18 }]);
    },
    nube: function (ctx, s) {
      // Contorno grueso primero y relleno encima: así no se ven las uniones de los círculos.
      function forma() {
        ctx.beginPath();
        [[-0.25, 0.05, 0.2], [0, -0.08, 0.26], [0.26, 0.05, 0.2]].forEach(function (c) {
          ctx.moveTo(c[0] * s + c[2] * s, c[1] * s); ctx.arc(c[0] * s, c[1] * s, c[2] * s, 0, Math.PI * 2);
        });
        if (ctx.roundRect) ctx.roundRect(-s * 0.44, s * 0.02, s * 0.88, s * 0.22, s * 0.11); else ctx.rect(-s * 0.44, s * 0.02, s * 0.88, s * 0.22);
      }
      forma(); ctx.lineWidth *= 2; ctx.stroke();
      forma(); ctx.fillStyle = '#ffffff'; ctx.fill();
    },
    rayo: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(s * 0.12, -s * 0.5); ctx.lineTo(-s * 0.22, s * 0.05); ctx.lineTo(0, s * 0.05);
      ctx.lineTo(-s * 0.12, s * 0.5); ctx.lineTo(s * 0.24, -s * 0.08); ctx.lineTo(s * 0.02, -s * 0.08); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
    },
    copo: function (ctx, s) {
      ctx.strokeStyle = '#4ea8de';
      for (var i = 0; i < 6; i++) {
        var a = i * 60 * RAD, cx = Math.cos(a), cy = Math.sin(a);
        linea(ctx, [{ x: 0, y: 0 }, { x: cx * s * 0.45, y: cy * s * 0.45 }]);
        [-1, 1].forEach(function (l) {
          var b = a + l * 40 * RAD;
          linea(ctx, [{ x: cx * s * 0.28, y: cy * s * 0.28 }, { x: cx * s * 0.28 + Math.cos(b) * s * 0.13, y: cy * s * 0.28 + Math.sin(b) * s * 0.13 }]);
        });
      }
    },
    volcan: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.55, s * 0.4); ctx.lineTo(-s * 0.15, -s * 0.2); ctx.lineTo(s * 0.15, -s * 0.2); ctx.lineTo(s * 0.55, s * 0.4); ctx.closePath();
      ctx.fillStyle = '#8d6e63'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.2); ctx.lineTo(-s * 0.22, -s * 0.05); ctx.lineTo(-s * 0.08, -s * 0.1); ctx.lineTo(0, 0.02 * s);
      ctx.lineTo(s * 0.08, -s * 0.1); ctx.lineTo(s * 0.2, -s * 0.06); ctx.lineTo(s * 0.15, -s * 0.2); ctx.closePath();
      ctx.fillStyle = '#ff7b00'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9aa5b1';
      [[-0.05, -0.32, 0.1], [0.1, -0.42, 0.08], [-0.02, -0.5, 0.06]].forEach(function (c) { circulo(ctx, c[0] * s, c[1] * s, c[2] * s, '#c9ced4'); });
    },

    /* Seres vivos */
    pez: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(s * 0.2, 0); ctx.lineTo(s * 0.5, -s * 0.2); ctx.lineTo(s * 0.5, s * 0.2); ctx.closePath();
      ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-s * 0.05, 0, s * 0.32, s * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      circulo(ctx, -s * 0.2, -s * 0.05, s * 0.045, TINTA);
    },
    pajaro: function (ctx, s) {
      circulo(ctx, 0, s * 0.05, s * 0.3, '#4ea8de');
      circulo(ctx, s * 0.22, -s * 0.2, s * 0.17, '#4ea8de');
      ctx.beginPath(); ctx.moveTo(s * 0.36, -s * 0.22); ctx.lineTo(s * 0.52, -s * 0.17); ctx.lineTo(s * 0.36, -s * 0.12); ctx.closePath();
      ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
      circulo(ctx, s * 0.26, -s * 0.24, s * 0.035, TINTA);
      ctx.beginPath(); ctx.ellipse(-s * 0.06, s * 0.05, s * 0.18, s * 0.1, -0.5, 0, Math.PI * 2); ctx.fillStyle = '#2a6fdb'; ctx.fill(); ctx.stroke();
      linea(ctx, [{ x: -s * 0.05, y: s * 0.34 }, { x: -s * 0.08, y: s * 0.48 }]);
      linea(ctx, [{ x: s * 0.07, y: s * 0.34 }, { x: s * 0.08, y: s * 0.48 }]);
    },
    gato: function (ctx, s) {
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.moveTo(l * s * 0.32, -s * 0.12); ctx.lineTo(l * s * 0.3, -s * 0.45); ctx.lineTo(l * s * 0.08, -s * 0.28); ctx.closePath();
        ctx.fillStyle = '#ffb35c'; ctx.fill(); ctx.stroke();
      });
      circulo(ctx, 0, 0, s * 0.36, '#ffb35c');
      circulo(ctx, -s * 0.13, -s * 0.05, s * 0.045, TINTA);
      circulo(ctx, s * 0.13, -s * 0.05, s * 0.045, TINTA);
      ctx.lineWidth *= 0.6;
      linea(ctx, [{ x: -s * 0.05, y: s * 0.1 }, { x: 0, y: s * 0.14 }, { x: s * 0.05, y: s * 0.1 }]);
      [-1, 1].forEach(function (l) {
        linea(ctx, [{ x: l * s * 0.15, y: s * 0.1 }, { x: l * s * 0.42, y: s * 0.05 }]);
        linea(ctx, [{ x: l * s * 0.15, y: s * 0.14 }, { x: l * s * 0.42, y: s * 0.18 }]);
      });
    },
    perro: function (ctx, s) {
      circulo(ctx, 0, 0, s * 0.34, '#c08552');
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.ellipse(l * s * 0.33, s * 0.02, s * 0.1, s * 0.24, l * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = '#8d5524'; ctx.fill(); ctx.stroke();
      });
      ctx.beginPath(); ctx.ellipse(0, s * 0.14, s * 0.17, s * 0.12, 0, 0, Math.PI * 2); ctx.fillStyle = '#f1dcc4'; ctx.fill(); ctx.stroke();
      circulo(ctx, 0, s * 0.08, s * 0.06, TINTA);
      circulo(ctx, -s * 0.12, -s * 0.1, s * 0.045, TINTA);
      circulo(ctx, s * 0.12, -s * 0.1, s * 0.045, TINTA);
    },
    dinosaurio: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.2); ctx.quadraticCurveTo(-s * 0.3, -s * 0.02, -s * 0.05, -s * 0.02);
      ctx.lineTo(s * 0.12, -s * 0.35); ctx.quadraticCurveTo(s * 0.18, -s * 0.48, s * 0.42, -s * 0.42);
      ctx.lineTo(s * 0.45, -s * 0.28); ctx.lineTo(s * 0.25, -s * 0.25); ctx.lineTo(s * 0.22, s * 0.1);
      ctx.lineTo(s * 0.22, s * 0.45); ctx.lineTo(s * 0.1, s * 0.45); ctx.lineTo(s * 0.06, s * 0.2);
      ctx.lineTo(-s * 0.08, s * 0.2); ctx.lineTo(-s * 0.1, s * 0.45); ctx.lineTo(-s * 0.22, s * 0.45); ctx.lineTo(-s * 0.22, s * 0.22);
      ctx.closePath();
      ctx.fillStyle = '#6cc070'; ctx.fill(); ctx.stroke();
      circulo(ctx, s * 0.3, -s * 0.37, s * 0.03, TINTA);
    },
    flor: function (ctx, s) {
      ctx.strokeStyle = '#2b9348';
      linea(ctx, [{ x: 0, y: 0 }, { x: 0, y: s * 0.5 }]);
      ctx.strokeStyle = TINTA;
      for (var i = 0; i < 6; i++) {
        var a = i * 60 * RAD;
        circulo(ctx, Math.cos(a) * s * 0.18, -s * 0.1 + Math.sin(a) * s * 0.18, s * 0.13, '#ff7eb6');
      }
      circulo(ctx, 0, -s * 0.1, s * 0.12, '#ffd23f');
    },
    hueso: function (ctx, s) {
      ctx.save(); ctx.rotate(-0.5);
      ctx.fillStyle = '#f5f0e1';
      [-1, 1].forEach(function (l) {
        circulo(ctx, l * s * 0.4, -s * 0.09, s * 0.11, '#f5f0e1');
        circulo(ctx, l * s * 0.4, s * 0.09, s * 0.11, '#f5f0e1');
      });
      rect(ctx, -s * 0.4, -s * 0.08, s * 0.8, s * 0.16, '#f5f0e1');
      ctx.restore();
    },
    adn: function (ctx, s) {
      var puntos = 9;
      ctx.lineWidth *= 0.7;
      for (var i = 0; i < puntos; i++) {
        var y = -s * 0.45 + i * s * 0.9 / (puntos - 1), x = Math.sin(i * 0.8) * s * 0.25;
        linea(ctx, [{ x: x, y: y }, { x: -x, y: y }]);
      }
      ctx.lineWidth /= 0.7;
      [1, -1].forEach(function (l) {
        ctx.strokeStyle = l > 0 ? '#e63946' : '#2a6fdb';
        ctx.beginPath();
        for (var k = 0; k <= 40; k++) {
          var yy = -s * 0.45 + k * s * 0.9 / 40, xx = l * Math.sin(k / 40 * (puntos - 1) * 0.8) * s * 0.25;
          ctx[k ? 'lineTo' : 'moveTo'](xx, yy);
        }
        ctx.stroke();
      });
    },
    virus: function (ctx, s) {
      for (var i = 0; i < 8; i++) {
        var a = i * 45 * RAD;
        linea(ctx, [{ x: Math.cos(a) * s * 0.28, y: Math.sin(a) * s * 0.28 }, { x: Math.cos(a) * s * 0.42, y: Math.sin(a) * s * 0.42 }]);
        circulo(ctx, Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45, s * 0.05, '#e63946');
      }
      circulo(ctx, 0, 0, s * 0.3, '#80ed99');
      circulo(ctx, -s * 0.1, -s * 0.05, s * 0.05, '#2b9348');
      circulo(ctx, s * 0.1, s * 0.08, s * 0.07, '#2b9348');
    },
    ojo: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.quadraticCurveTo(0, -s * 0.42, s * 0.5, 0); ctx.quadraticCurveTo(0, s * 0.42, -s * 0.5, 0); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      circulo(ctx, 0, 0, s * 0.17, '#4ea8de');
      circulo(ctx, 0, 0, s * 0.08, TINTA);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.05, s * 0.03, 0, Math.PI * 2); ctx.fill();
    },
    diente: function (ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s * 0.2);
      ctx.bezierCurveTo(-s * 0.35, -s * 0.5, -s * 0.05, -s * 0.45, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.05, -s * 0.45, s * 0.35, -s * 0.5, s * 0.35, -s * 0.2);
      ctx.bezierCurveTo(s * 0.35, s * 0.1, s * 0.25, s * 0.45, s * 0.15, s * 0.45);
      ctx.bezierCurveTo(s * 0.05, s * 0.45, s * 0.08, s * 0.1, 0, s * 0.1);
      ctx.bezierCurveTo(-s * 0.08, s * 0.1, -s * 0.05, s * 0.45, -s * 0.15, s * 0.45);
      ctx.bezierCurveTo(-s * 0.25, s * 0.45, -s * 0.35, s * 0.1, -s * 0.35, -s * 0.2);
      ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    },

    /* Comida */
    manzana: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.22);
      ctx.bezierCurveTo(s * 0.5, -s * 0.45, s * 0.5, s * 0.3, s * 0.12, s * 0.4);
      ctx.quadraticCurveTo(0, s * 0.35, -s * 0.12, s * 0.4);
      ctx.bezierCurveTo(-s * 0.5, s * 0.3, -s * 0.5, -s * 0.45, 0, -s * 0.22); ctx.closePath();
      ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
      linea(ctx, [{ x: 0, y: -s * 0.22 }, { x: s * 0.05, y: -s * 0.42 }]);
      ctx.beginPath(); ctx.ellipse(s * 0.15, -s * 0.36, s * 0.1, s * 0.05, -0.5, 0, Math.PI * 2); ctx.fillStyle = '#6cc070'; ctx.fill(); ctx.stroke();
    },
    pizza: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, s * 0.45); ctx.lineTo(-s * 0.4, -s * 0.3); ctx.quadraticCurveTo(0, -s * 0.5, s * 0.4, -s * 0.3); ctx.closePath();
      ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.3); ctx.quadraticCurveTo(0, -s * 0.5, s * 0.4, -s * 0.3); ctx.lineWidth *= 2.5; ctx.strokeStyle = '#d4a056'; ctx.stroke();
      ctx.lineWidth /= 2.5; ctx.strokeStyle = TINTA;
      [[-0.12, -0.15], [0.1, -0.1], [0, 0.12]].forEach(function (c) { circulo(ctx, c[0] * s, c[1] * s, s * 0.07, '#e63946'); });
    },
    hamburguesa: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.05); ctx.quadraticCurveTo(-s * 0.45, -s * 0.42, 0, -s * 0.42); ctx.quadraticCurveTo(s * 0.45, -s * 0.42, s * 0.45, -s * 0.05); ctx.closePath();
      ctx.fillStyle = '#e9a23b'; ctx.fill(); ctx.stroke();
      rect(ctx, -s * 0.48, -s * 0.05, s * 0.96, s * 0.08, '#6cc070', s * 0.04);
      rect(ctx, -s * 0.45, s * 0.03, s * 0.9, s * 0.14, '#7a4a2a', s * 0.06);
      rect(ctx, -s * 0.45, s * 0.17, s * 0.9, s * 0.16, '#e9a23b', s * 0.07);
    },

    /* Transporte */
    avion: function (ctx, s) {
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.1, 0, 0, Math.PI * 2); ctx.fillStyle = '#f1f1f1'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.05, 0); ctx.lineTo(-s * 0.25, s * 0.38); ctx.lineTo(-s * 0.1, s * 0.38); ctx.lineTo(s * 0.15, 0); ctx.closePath();
      ctx.fillStyle = '#4ea8de'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.02); ctx.lineTo(-s * 0.18, -s * 0.3); ctx.lineTo(-s * 0.06, -s * 0.3); ctx.lineTo(s * 0.12, -s * 0.03); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.05); ctx.lineTo(-s * 0.5, -s * 0.25); ctx.lineTo(-s * 0.42, -s * 0.25); ctx.lineTo(-s * 0.3, -s * 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
    },
    carro: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.15); ctx.lineTo(-s * 0.5, -s * 0.02); ctx.lineTo(-s * 0.3, -s * 0.05); ctx.lineTo(-s * 0.18, -s * 0.25);
      ctx.lineTo(s * 0.2, -s * 0.25); ctx.lineTo(s * 0.32, -s * 0.05); ctx.lineTo(s * 0.5, -s * 0.02); ctx.lineTo(s * 0.5, s * 0.15); ctx.closePath();
      ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
      rect(ctx, -s * 0.12, -s * 0.2, s * 0.26, s * 0.13, '#8ecae6', s * 0.02);
      circulo(ctx, -s * 0.28, s * 0.16, s * 0.11, '#2b2d42');
      circulo(ctx, s * 0.28, s * 0.16, s * 0.11, '#2b2d42');
    },
    barco: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.1); ctx.lineTo(s * 0.5, s * 0.1); ctx.lineTo(s * 0.35, s * 0.35); ctx.lineTo(-s * 0.35, s * 0.35); ctx.closePath();
      ctx.fillStyle = '#8d5524'; ctx.fill(); ctx.stroke();
      linea(ctx, [{ x: 0, y: s * 0.1 }, { x: 0, y: -s * 0.48 }]);
      ctx.beginPath(); ctx.moveTo(s * 0.03, -s * 0.45); ctx.lineTo(s * 0.35, s * 0.02); ctx.lineTo(s * 0.03, s * 0.02); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    },
    tren: function (ctx, s) {
      rect(ctx, -s * 0.5, -s * 0.2, s * 0.6, s * 0.4, '#2a6fdb', s * 0.03);
      rect(ctx, s * 0.1, -s * 0.38, s * 0.32, s * 0.58, '#e63946', s * 0.03);
      rect(ctx, s * 0.17, -s * 0.3, s * 0.18, s * 0.15, '#8ecae6');
      rect(ctx, -s * 0.38, -s * 0.48, s * 0.12, s * 0.28, '#2b2d42');
      [-0.35, -0.08, 0.26].forEach(function (x) { circulo(ctx, x * s, s * 0.28, s * 0.1, '#2b2d42'); });
    },

    /* Objetos */
    lupa: function (ctx, s) {
      ctx.lineWidth *= 2.2;
      linea(ctx, [{ x: s * 0.12, y: s * 0.12 }, { x: s * 0.42, y: s * 0.42 }]);
      ctx.lineWidth /= 2.2;
      circulo(ctx, -s * 0.1, -s * 0.1, s * 0.3, 'rgba(142,202,230,0.6)');
    },
    termometro: function (ctx, s) {
      rect(ctx, -s * 0.08, -s * 0.48, s * 0.16, s * 0.7, '#ffffff', s * 0.08);
      circulo(ctx, 0, s * 0.3, s * 0.15, '#e63946');
      ctx.fillStyle = '#e63946'; ctx.fillRect(-s * 0.035, -s * 0.2, s * 0.07, s * 0.45);
    },
    bateria: function (ctx, s) {
      rect(ctx, -s * 0.22, -s * 0.38, s * 0.44, s * 0.8, '#ffffff', s * 0.05);
      rect(ctx, -s * 0.08, -s * 0.46, s * 0.16, s * 0.08, '#b8b8b8', s * 0.02);
      [0, 1, 2].forEach(function (i) { rect(ctx, -s * 0.15, s * 0.18 - i * s * 0.2, s * 0.3, s * 0.16, '#6cc070', s * 0.02); });
    },
    iman: function (ctx, s) {
      ctx.lineCap = 'butt';
      ctx.lineWidth = s * 0.2;
      ctx.strokeStyle = '#e63946';
      ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.25, Math.PI, 0); ctx.stroke();
      linea(ctx, [{ x: -s * 0.25, y: -s * 0.05 }, { x: -s * 0.25, y: s * 0.2 }]);
      linea(ctx, [{ x: s * 0.25, y: -s * 0.05 }, { x: s * 0.25, y: s * 0.2 }]);
      ctx.strokeStyle = '#c9ced4';
      linea(ctx, [{ x: -s * 0.25, y: s * 0.2 }, { x: -s * 0.25, y: s * 0.38 }]);
      linea(ctx, [{ x: s * 0.25, y: s * 0.2 }, { x: s * 0.25, y: s * 0.38 }]);
    },
    trofeo: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.42); ctx.lineTo(s * 0.3, -s * 0.42); ctx.quadraticCurveTo(s * 0.3, s * 0.05, 0, s * 0.08); ctx.quadraticCurveTo(-s * 0.3, s * 0.05, -s * 0.3, -s * 0.42); ctx.closePath();
      ctx.fillStyle = '#ffc93c'; ctx.fill(); ctx.stroke();
      [-1, 1].forEach(function (l) { ctx.beginPath(); ctx.arc(l * s * 0.32, -s * 0.25, s * 0.1, l > 0 ? -Math.PI / 2 : Math.PI / 2, l > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke(); });
      rect(ctx, -s * 0.05, s * 0.08, s * 0.1, s * 0.18, '#ffc93c');
      rect(ctx, -s * 0.22, s * 0.26, s * 0.44, s * 0.14, '#8d5524', s * 0.02);
    },
    candado: function (ctx, s) {
      ctx.lineWidth *= 1.8;
      ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.2, Math.PI, 0); ctx.lineTo(s * 0.2, 0); ctx.moveTo(-s * 0.2, -s * 0.12); ctx.lineTo(-s * 0.2, 0); ctx.stroke();
      ctx.lineWidth /= 1.8;
      rect(ctx, -s * 0.32, -s * 0.02, s * 0.64, s * 0.46, '#ffc93c', s * 0.06);
      circulo(ctx, 0, s * 0.16, s * 0.06, TINTA);
    },
    llave: function (ctx, s) {
      ctx.save(); ctx.rotate(-0.6);
      circulo(ctx, -s * 0.3, 0, s * 0.17, '#ffc93c');
      circulo(ctx, -s * 0.3, 0, s * 0.06, '#ffffff');
      rect(ctx, -s * 0.14, -s * 0.05, s * 0.62, s * 0.1, '#ffc93c');
      rect(ctx, s * 0.3, s * 0.05, s * 0.07, s * 0.12, '#ffc93c');
      rect(ctx, s * 0.4, s * 0.05, s * 0.07, s * 0.08, '#ffc93c');
      ctx.restore();
    },
    piramide: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.55, s * 0.38); ctx.lineTo(0, -s * 0.42); ctx.lineTo(s * 0.55, s * 0.38); ctx.closePath();
      ctx.fillStyle = '#e9c46a'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.42); ctx.lineTo(s * 0.12, s * 0.38); ctx.lineTo(s * 0.55, s * 0.38); ctx.closePath();
      ctx.fillStyle = '#d4a84a'; ctx.fill(); ctx.stroke();
    },
    bandera: function (ctx, s) {
      linea(ctx, [{ x: -s * 0.3, y: s * 0.5 }, { x: -s * 0.3, y: -s * 0.45 }]);
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.45); ctx.quadraticCurveTo(0, -s * 0.55, s * 0.4, -s * 0.4);
      ctx.lineTo(s * 0.4, -s * 0.05); ctx.quadraticCurveTo(0, -s * 0.2, -s * 0.3, -s * 0.1); ctx.closePath();
      ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
    },
    dinamita: function (ctx, s) {
      [-0.18, 0, 0.18].forEach(function (x) { rect(ctx, x * s - s * 0.09, -s * 0.2, s * 0.18, s * 0.6, '#d62828', s * 0.04); });
      ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.quadraticCurveTo(s * 0.05, -s * 0.38, s * 0.2, -s * 0.38); ctx.stroke();
      circulo(ctx, s * 0.24, -s * 0.4, s * 0.06, '#ffd23f');
    },
    microscopio: function (ctx, s) {
      rect(ctx, -s * 0.35, s * 0.32, s * 0.7, s * 0.1, '#2b2d42', s * 0.03);
      ctx.lineWidth *= 2.2;
      ctx.beginPath(); ctx.arc(-s * 0.05, s * 0.05, s * 0.25, -Math.PI / 2, Math.PI / 2, true); ctx.stroke();
      ctx.lineWidth /= 2.2;
      ctx.save(); ctx.translate(s * 0.05, -s * 0.18); ctx.rotate(0.45);
      rect(ctx, -s * 0.07, -s * 0.28, s * 0.14, s * 0.4, '#c9ced4', s * 0.03);
      ctx.restore();
      rect(ctx, -s * 0.05, s * 0.05, s * 0.35, s * 0.05, '#2b2d42');
    },

    /* Espacio */
    ovni: function (ctx, s, v) {
      ctx.save();
      ctx.globalAlpha *= 0.3 + Math.sin(v * 3) * 0.1;
      ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.1); ctx.lineTo(-s * 0.32, s * 0.5); ctx.lineTo(s * 0.32, s * 0.5); ctx.lineTo(s * 0.12, s * 0.1); ctx.closePath();
      ctx.fillStyle = '#ffe45c'; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, -s * 0.04, s * 0.2, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#8ecae6'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, s * 0.03, s * 0.48, s * 0.13, 0, 0, Math.PI * 2); ctx.fillStyle = '#9aa5b1'; ctx.fill(); ctx.stroke();
      [-0.28, 0, 0.28].forEach(function (x, i) { circulo(ctx, x * s, s * 0.04, s * 0.04, Math.floor(v * 4) % 3 === i ? '#ffd23f' : '#e63946'); });
    },
    satelite: function (ctx, s) {
      ctx.save(); ctx.rotate(-0.4);
      rect(ctx, -s * 0.5, -s * 0.13, s * 0.3, s * 0.26, '#2a6fdb');
      rect(ctx, s * 0.2, -s * 0.13, s * 0.3, s * 0.26, '#2a6fdb');
      linea(ctx, [{ x: -s * 0.2, y: 0 }, { x: s * 0.2, y: 0 }]);
      rect(ctx, -s * 0.13, -s * 0.17, s * 0.26, s * 0.34, '#c9ced4', s * 0.03);
      ctx.beginPath(); ctx.arc(0, -s * 0.28, s * 0.13, 0.1, Math.PI - 0.1); ctx.stroke();
      ctx.restore();
    },
    cometa: function (ctx, s) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(s * 0.16, -s * 0.28); ctx.quadraticCurveTo(-s * 0.15, -s * 0.2, -s * 0.5, s * 0.42); ctx.quadraticCurveTo(-s * 0.05, s * 0.2, s * 0.3, s * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
      circulo(ctx, s * 0.26, -s * 0.16, s * 0.18, '#9aa5b1');
    },
    agujeroNegro: function (ctx, s, v) {
      ctx.save(); ctx.rotate(v * 0.8);
      ctx.strokeStyle = '#ff9f1c';
      for (var i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.ellipse(0, 0, s * (0.5 - i * 0.07), s * (0.36 - i * 0.06), i * 0.5, i, i + 4.4); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.fill();
    },
    telescopio: function (ctx, s) {
      linea(ctx, [{ x: 0, y: 0 }, { x: -s * 0.22, y: s * 0.45 }]);
      linea(ctx, [{ x: 0, y: 0 }, { x: s * 0.22, y: s * 0.45 }]);
      linea(ctx, [{ x: 0, y: 0 }, { x: 0, y: s * 0.45 }]);
      ctx.save(); ctx.rotate(-0.55);
      rect(ctx, -s * 0.45, -s * 0.08, s * 0.5, s * 0.16, '#c9ced4', s * 0.02);
      rect(ctx, s * 0.05, -s * 0.11, s * 0.42, s * 0.22, '#2a6fdb', s * 0.02);
      ctx.restore();
    },
    alien: function (ctx, s, v) {
      ctx.beginPath(); ctx.moveTo(0, s * 0.44); ctx.bezierCurveTo(-s * 0.5, s * 0.1, -s * 0.44, -s * 0.44, 0, -s * 0.44); ctx.bezierCurveTo(s * 0.44, -s * 0.44, s * 0.5, s * 0.1, 0, s * 0.44); ctx.closePath();
      ctx.fillStyle = '#80ed99'; ctx.fill(); ctx.stroke();
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.ellipse(l * s * 0.16, -s * 0.06, s * 0.11, s * 0.17, l * -0.5, 0, Math.PI * 2); ctx.fillStyle = TINTA; ctx.fill();
      });
      linea(ctx, [{ x: -s * 0.06, y: s * 0.24 }, { x: s * 0.06, y: s * 0.24 }]);
    },

    /* Naturaleza */
    arcoiris: function (ctx, s) {
      ctx.lineCap = 'butt';
      ctx.lineWidth = s * 0.07;
      ['#e63946', '#ff9f1c', '#ffd23f', '#6cc070', '#4ea8de', '#7b2cbf'].forEach(function (c, i) {
        ctx.strokeStyle = c;
        ctx.beginPath(); ctx.arc(0, s * 0.3, s * (0.55 - i * 0.07), Math.PI, 0); ctx.stroke();
      });
    },
    tornado: function (ctx, s, v) {
      ctx.fillStyle = '#c9ced4';
      ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.45); ctx.lineTo(s * 0.42, -s * 0.45); ctx.lineTo(s * 0.04, s * 0.47); ctx.lineTo(-s * 0.04, s * 0.47); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth *= 0.7;
      for (var i = 0; i < 5; i++) {
        var k = (i + (v * 2 % 1)) / 5, y = -s * 0.42 + k * s * 0.86, a = s * 0.42 * (1 - k * 0.92);
        ctx.beginPath(); ctx.ellipse(0, y, a, s * 0.035, 0, 0, Math.PI); ctx.stroke();
      }
    },
    ola: function (ctx, s, v) {
      var m = Math.sin(v * 2) * s * 0.03;
      ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.4); ctx.bezierCurveTo(-s * 0.42, -s * 0.05, -s * 0.05, -s * 0.5 + m, s * 0.3, -s * 0.38 + m);
      ctx.bezierCurveTo(s * 0.5, -s * 0.3, s * 0.4, -s * 0.05, s * 0.15, -s * 0.1); ctx.bezierCurveTo(s * 0.3, s * 0.1, s * 0.42, s * 0.25, s * 0.5, s * 0.4); ctx.closePath();
      ctx.fillStyle = '#4ea8de'; ctx.fill(); ctx.stroke();
    },
    iceberg: function (ctx, s) {
      rect(ctx, -s * 0.5, s * 0.02, s, s * 0.42, '#8ecae6');
      ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.02); ctx.lineTo(-s * 0.12, -s * 0.42); ctx.lineTo(s * 0.04, -s * 0.15); ctx.lineTo(s * 0.18, -s * 0.28); ctx.lineTo(s * 0.32, s * 0.02); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.02); ctx.lineTo(-s * 0.2, s * 0.32); ctx.lineTo(0, s * 0.4); ctx.lineTo(s * 0.22, s * 0.28); ctx.lineTo(s * 0.32, s * 0.02); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill(); ctx.stroke();
    },
    cactus: function (ctx, s) {
      rect(ctx, -s * 0.09, -s * 0.48, s * 0.18, s * 0.96, '#2b9348', s * 0.09);
      rect(ctx, -s * 0.34, -s * 0.15, s * 0.14, s * 0.3, '#2b9348', s * 0.07);
      rect(ctx, -s * 0.34, s * 0.05, s * 0.3, s * 0.12, '#2b9348', s * 0.06);
      rect(ctx, s * 0.2, -s * 0.3, s * 0.14, s * 0.3, '#2b9348', s * 0.07);
      rect(ctx, s * 0.04, -s * 0.1, s * 0.3, s * 0.12, '#2b9348', s * 0.06);
    },
    palmera: function (ctx, s, v) {
      ctx.beginPath(); ctx.moveTo(-s * 0.08, s * 0.5); ctx.quadraticCurveTo(-s * 0.02, 0, s * 0.02, -s * 0.22); ctx.lineTo(s * 0.08, -s * 0.22); ctx.quadraticCurveTo(s * 0.06, 0, s * 0.1, s * 0.5); ctx.closePath();
      ctx.fillStyle = '#8d5524'; ctx.fill(); ctx.stroke();
      var m = Math.sin(v * 2) * s * 0.02;
      [[-0.48, -0.1], [-0.36, -0.42], [0.1, -0.5], [0.5, -0.32], [0.52, -0.04]].forEach(function (p) {
        ctx.beginPath(); ctx.moveTo(s * 0.05, -s * 0.22);
        ctx.quadraticCurveTo((p[0] * 0.55 + 0.03) * s, (p[1] - 0.15) * s + m, p[0] * s, p[1] * s + m);
        ctx.quadraticCurveTo((p[0] * 0.55 + 0.03) * s, (p[1] + 0.02) * s + m, s * 0.05, -s * 0.22); ctx.closePath();
        ctx.fillStyle = '#6cc070'; ctx.fill(); ctx.stroke();
      });
    },
    hongo: function (ctx, s) {
      rect(ctx, -s * 0.12, -s * 0.05, s * 0.24, s * 0.45, '#f5f0e1', s * 0.06);
      ctx.beginPath(); ctx.arc(0, -s * 0.03, s * 0.42, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
      [[-0.2, -0.14, 0.07], [0.05, -0.25, 0.08], [0.25, -0.12, 0.06]].forEach(function (c) { circulo(ctx, c[0] * s, c[1] * s, c[2] * s, '#ffffff'); });
    },
    hoja: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, s * 0.45); ctx.bezierCurveTo(-s * 0.5, s * 0.1, -s * 0.3, -s * 0.4, 0, -s * 0.48); ctx.bezierCurveTo(s * 0.3, -s * 0.4, s * 0.5, s * 0.1, 0, s * 0.45); ctx.closePath();
      ctx.fillStyle = '#6cc070'; ctx.fill(); ctx.stroke();
      ctx.lineWidth *= 0.6;
      linea(ctx, [{ x: 0, y: s * 0.45 }, { x: 0, y: -s * 0.3 }]);
      [0.15, -0.05].forEach(function (y) { linea(ctx, [{ x: 0, y: (y + 0.12) * s }, { x: -s * 0.18, y: y * s }]); linea(ctx, [{ x: 0, y: (y + 0.12) * s }, { x: s * 0.18, y: y * s }]); });
    },

    /* Más animales */
    tiburon: function (ctx, s, v) {
      var c = Math.sin(v * 5) * s * 0.05;
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.02); ctx.quadraticCurveTo(-s * 0.1, -s * 0.28, s * 0.3, -s * 0.05); ctx.lineTo(s * 0.5, -s * 0.2 + c); ctx.lineTo(s * 0.45, 0); ctx.lineTo(s * 0.5, s * 0.2 + c); ctx.lineTo(s * 0.3, s * 0.05); ctx.quadraticCurveTo(-s * 0.1, s * 0.25, -s * 0.5, -s * 0.02); ctx.closePath();
      ctx.fillStyle = '#9aa5b1'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.18); ctx.lineTo(s * 0.02, -s * 0.42); ctx.lineTo(s * 0.12, -s * 0.13); ctx.closePath(); ctx.fill(); ctx.stroke();
      circulo(ctx, -s * 0.32, -s * 0.06, s * 0.025, TINTA);
      ctx.lineWidth *= 0.6;
      linea(ctx, [{ x: -s * 0.44, y: s * 0.05 }, { x: -s * 0.2, y: s * 0.05 }]);
    },
    ballena: function (ctx, s, v) {
      ctx.save(); ctx.strokeStyle = '#4ea8de';
      var c = Math.abs(Math.sin(v * 3)) * s * 0.08;
      linea(ctx, [{ x: -s * 0.15, y: -s * 0.25 }, { x: -s * 0.15, y: -s * 0.36 - c }]);
      linea(ctx, [{ x: -s * 0.15, y: -s * 0.36 - c }, { x: -s * 0.25, y: -s * 0.44 - c }]);
      linea(ctx, [{ x: -s * 0.15, y: -s * 0.36 - c }, { x: -s * 0.05, y: -s * 0.44 - c }]);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.08); ctx.bezierCurveTo(-s * 0.5, -s * 0.3, s * 0.1, -s * 0.3, s * 0.3, -s * 0.02); ctx.lineTo(s * 0.5, -s * 0.18); ctx.lineTo(s * 0.46, s * 0.02); ctx.lineTo(s * 0.5, s * 0.15); ctx.lineTo(s * 0.28, s * 0.1); ctx.bezierCurveTo(s * 0.05, s * 0.34, -s * 0.5, s * 0.36, -s * 0.5, s * 0.08); ctx.closePath();
      ctx.fillStyle = '#4c7fb5'; ctx.fill(); ctx.stroke();
      circulo(ctx, -s * 0.3, -s * 0.03, s * 0.03, TINTA);
      linea(ctx, [{ x: -s * 0.48, y: s * 0.1 }, { x: -s * 0.15, y: s * 0.13 }]);
    },
    mariposa: function (ctx, s, v) {
      var a = 0.45 + Math.abs(Math.sin(v * 8)) * 0.55;
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.ellipse(l * s * 0.24 * a, -s * 0.12, s * 0.24 * a, s * 0.26, l * 0.4, 0, Math.PI * 2); ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(l * s * 0.17 * a, s * 0.18, s * 0.16 * a, s * 0.18, l * -0.4, 0, Math.PI * 2); ctx.fillStyle = '#ff7eb6'; ctx.fill(); ctx.stroke();
      });
      linea(ctx, [{ x: 0, y: -s * 0.25 }, { x: 0, y: s * 0.3 }]);
      linea(ctx, [{ x: 0, y: -s * 0.25 }, { x: -s * 0.1, y: -s * 0.42 }]);
      linea(ctx, [{ x: 0, y: -s * 0.25 }, { x: s * 0.1, y: -s * 0.42 }]);
    },
    abeja: function (ctx, s, v) {
      var a = Math.sin(v * 30) * 0.4;
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.ellipse(l * s * 0.08, -s * 0.27, s * 0.1, s * 0.2, l * 0.5 + a, 0, Math.PI * 2); ctx.fillStyle = 'rgba(190,225,245,0.8)'; ctx.fill(); ctx.stroke();
      });
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.36, s * 0.22, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
      [-0.1, 0.1].forEach(function (x) { ctx.fillStyle = TINTA; ctx.fillRect((x - 0.035) * s, -s * 0.2, s * 0.07, s * 0.4); });
      circulo(ctx, -s * 0.25, -s * 0.05, s * 0.025, TINTA);
      ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.03); ctx.lineTo(s * 0.47, 0); ctx.lineTo(s * 0.34, s * 0.03); ctx.closePath(); ctx.fillStyle = TINTA; ctx.fill();
    },
    serpiente: function (ctx, s, v) {
      ctx.save();
      ctx.lineWidth *= 3.5;
      ctx.strokeStyle = TINTA;
      function cuerpo() {
        ctx.beginPath();
        for (var i = 0; i <= 30; i++) {
          var k = i / 30, x = -s * 0.45 + k * s * 0.78, y = s * 0.28 - k * s * 0.42 + Math.sin(k * 8 + v * 3) * s * 0.11 * (1 - k * 0.5);
          ctx[i ? 'lineTo' : 'moveTo'](x, y);
        }
      }
      cuerpo(); ctx.stroke();
      ctx.strokeStyle = '#6cc070'; ctx.lineWidth *= 0.55;
      cuerpo(); ctx.stroke();
      ctx.restore();
      var cy = s * 0.28 - s * 0.42 + Math.sin(8 + v * 3) * s * 0.055;
      ctx.beginPath(); ctx.ellipse(s * 0.36, cy, s * 0.13, s * 0.09, 0, 0, Math.PI * 2); ctx.fillStyle = '#6cc070'; ctx.fill(); ctx.stroke();
      circulo(ctx, s * 0.38, cy - s * 0.03, s * 0.018, TINTA);
      ctx.strokeStyle = '#e63946';
      linea(ctx, [{ x: s * 0.48, y: cy }, { x: s * 0.56, y: cy }]);
    },
    arana: function (ctx, s, v) {
      for (var l = -1; l <= 1; l += 2) {
        for (var i = 0; i < 4; i++) {
          var y = -s * 0.1 + i * s * 0.08, m = Math.sin(v * 8 + i * 2) * s * 0.02;
          linea(ctx, [{ x: 0, y: y }, { x: l * s * 0.3, y: y - s * 0.16 + m }, { x: l * s * 0.45, y: y + s * 0.15 + m }]);
        }
      }
      ctx.fillStyle = '#2b2d42';
      circulo(ctx, 0, s * 0.08, s * 0.22, '#2b2d42');
      circulo(ctx, 0, -s * 0.15, s * 0.13, '#2b2d42');
      circulo(ctx, -s * 0.05, -s * 0.17, s * 0.03, '#ffffff');
      circulo(ctx, s * 0.05, -s * 0.17, s * 0.03, '#ffffff');
    },
    pulpo: function (ctx, s, v) {
      ctx.lineWidth *= 2.4;
      ctx.strokeStyle = TINTA;
      var patas = function (color) {
        ctx.strokeStyle = color;
        for (var i = 0; i < 6; i++) {
          var x0 = (-0.25 + i * 0.1) * s, m = Math.sin(v * 3 + i) * s * 0.07, xf = (-0.46 + i * 0.184) * s;
          ctx.beginPath(); ctx.moveTo(x0, s * 0.05); ctx.quadraticCurveTo(xf + m, s * 0.22, xf - m, s * 0.46); ctx.stroke();
        }
      };
      patas(TINTA);
      ctx.lineWidth *= 0.55;
      patas('#d65db1');
      ctx.lineWidth /= 1.32;
      ctx.strokeStyle = TINTA;
      ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.3, Math.PI * 0.95, Math.PI * 0.05); ctx.quadraticCurveTo(s * 0.2, s * 0.15, 0, s * 0.15); ctx.quadraticCurveTo(-s * 0.2, s * 0.15, -s * 0.3, -s * 0.05); ctx.closePath();
      ctx.fillStyle = '#d65db1'; ctx.fill(); ctx.stroke();
      circulo(ctx, -s * 0.1, -s * 0.1, s * 0.04, TINTA);
      circulo(ctx, s * 0.1, -s * 0.1, s * 0.04, TINTA);
    },
    pinguino: function (ctx, s) {
      ctx.beginPath(); ctx.ellipse(0, s * 0.03, s * 0.3, s * 0.42, 0, 0, Math.PI * 2); ctx.fillStyle = '#2b2d42'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.2, s * 0.3, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      circulo(ctx, -s * 0.1, -s * 0.2, s * 0.05, '#ffffff');
      circulo(ctx, s * 0.1, -s * 0.2, s * 0.05, '#ffffff');
      ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 0.13); ctx.lineTo(s * 0.06, -s * 0.13); ctx.lineTo(0, -s * 0.05); ctx.closePath(); ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.ellipse(l * s * 0.11, s * 0.46, s * 0.11, s * 0.04, 0, 0, Math.PI * 2); ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(l * s * 0.31, s * 0.07, s * 0.05, s * 0.2, l * -0.3, 0, Math.PI * 2); ctx.fillStyle = '#2b2d42'; ctx.fill(); ctx.stroke();
      });
    },
    elefante: function (ctx, s) {
      rect(ctx, -s * 0.33, s * 0.1, s * 0.16, s * 0.36, '#9aa5b1', s * 0.04);
      rect(ctx, s * 0.06, s * 0.1, s * 0.16, s * 0.36, '#9aa5b1', s * 0.04);
      ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.02, s * 0.38, s * 0.28, 0, 0, Math.PI * 2); ctx.fillStyle = '#9aa5b1'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s * 0.17, -s * 0.15, s * 0.14, s * 0.2, 0.2, 0, Math.PI * 2); ctx.fillStyle = '#b5bec8'; ctx.fill(); ctx.stroke();
      ctx.lineWidth *= 2.8;
      ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.08); ctx.bezierCurveTo(s * 0.5, s * 0.02, s * 0.42, s * 0.25, s * 0.47, s * 0.38); ctx.stroke();
      ctx.lineWidth /= 2.8;
      ctx.strokeStyle = '#9aa5b1'; ctx.lineWidth *= 1.6;
      ctx.beginPath(); ctx.moveTo(s * 0.34, -s * 0.08); ctx.bezierCurveTo(s * 0.5, s * 0.02, s * 0.42, s * 0.25, s * 0.47, s * 0.38); ctx.stroke();
      ctx.lineWidth /= 1.6; ctx.strokeStyle = TINTA;
      ctx.beginPath(); ctx.arc(s * 0.27, -s * 0.21, s * 0.17, 0, Math.PI * 2); ctx.fillStyle = '#9aa5b1'; ctx.fill(); ctx.stroke();
      circulo(ctx, s * 0.32, -s * 0.24, s * 0.025, TINTA);
    },
    vaca: function (ctx, s) {
      circulo(ctx, 0, -s * 0.05, s * 0.36, '#ffffff');
      circulo(ctx, -s * 0.2, -s * 0.2, s * 0.09, TINTA);
      circulo(ctx, s * 0.22, -s * 0.03, s * 0.07, TINTA);
      [-1, 1].forEach(function (l) {
        ctx.beginPath(); ctx.moveTo(l * s * 0.24, -s * 0.33); ctx.lineTo(l * s * 0.33, -s * 0.47); ctx.lineTo(l * s * 0.12, -s * 0.38); ctx.closePath(); ctx.fillStyle = '#e9c46a'; ctx.fill(); ctx.stroke();
      });
      ctx.beginPath(); ctx.ellipse(0, s * 0.17, s * 0.24, s * 0.16, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffb3c6'; ctx.fill(); ctx.stroke();
      circulo(ctx, -s * 0.08, s * 0.17, s * 0.03, TINTA);
      circulo(ctx, s * 0.08, s * 0.17, s * 0.03, TINTA);
      circulo(ctx, -s * 0.09, -s * 0.12, s * 0.035, TINTA);
      circulo(ctx, s * 0.09, -s * 0.12, s * 0.035, TINTA);
    },
    tortuga: function (ctx, s) {
      circulo(ctx, s * 0.42, -s * 0.03, s * 0.12, '#80ed99');
      circulo(ctx, s * 0.45, -s * 0.06, s * 0.018, TINTA);
      [-0.28, 0.25].forEach(function (x) { rect(ctx, x * s - s * 0.06, s * 0.1, s * 0.12, s * 0.18, '#80ed99', s * 0.05); });
      ctx.beginPath(); ctx.arc(0, s * 0.12, s * 0.36, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#2b9348'; ctx.fill(); ctx.stroke();
      ctx.lineWidth *= 0.7;
      [[-0.17, -0.02], [0.05, -0.1], [0.2, 0.02]].forEach(function (c) { circulo(ctx, c[0] * s, c[1] * s, s * 0.06, '#6cc070'); });
    },

    /* Más comida */
    helado: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.22, -s * 0.02); ctx.lineTo(0, s * 0.5); ctx.lineTo(s * 0.22, -s * 0.02); ctx.closePath(); ctx.fillStyle = '#e9c46a'; ctx.fill(); ctx.stroke();
      circulo(ctx, 0, -s * 0.2, s * 0.25, '#ff9ec7');
      circulo(ctx, s * 0.02, -s * 0.38, s * 0.07, '#e63946');
    },
    dona: function (ctx, s) {
      circulo(ctx, 0, 0, s * 0.42, '#e9a23b');
      ctx.beginPath(); ctx.arc(0, -s * 0.02, s * 0.36, 0, Math.PI * 2); ctx.fillStyle = '#ff7eb6'; ctx.fill();
      circulo(ctx, 0, 0, s * 0.13, '#faf6ee');
      ['#ffd23f', '#4ea8de', '#ffffff', '#6cc070', '#ffd23f', '#ffffff'].forEach(function (c, i) {
        var a = i * 60 * RAD + 0.4;
        ctx.fillStyle = c; ctx.fillRect(Math.cos(a) * s * 0.25 - s * 0.02, Math.sin(a) * s * 0.25 - s * 0.015, s * 0.05, s * 0.03);
      });
    },
    huevo: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.bezierCurveTo(s * 0.36, -s * 0.45, s * 0.42, s * 0.42, 0, s * 0.42); ctx.bezierCurveTo(-s * 0.42, s * 0.42, -s * 0.36, -s * 0.45, 0, -s * 0.45); ctx.closePath();
      ctx.fillStyle = '#fff6e5'; ctx.fill(); ctx.stroke();
    },
    platano: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.28); ctx.quadraticCurveTo(-s * 0.3, s * 0.42, s * 0.46, s * 0.15); ctx.quadraticCurveTo(-s * 0.05, s * 0.12, -s * 0.3, -s * 0.34); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
    },
    zanahoria: function (ctx, s) {
      ctx.strokeStyle = '#2b9348';
      [-0.1, 0, 0.1].forEach(function (x) { linea(ctx, [{ x: 0, y: -s * 0.25 }, { x: x * s, y: -s * 0.48 }]); });
      ctx.strokeStyle = TINTA;
      ctx.beginPath(); ctx.moveTo(-s * 0.17, -s * 0.25); ctx.quadraticCurveTo(0, -s * 0.33, s * 0.17, -s * 0.25); ctx.lineTo(0, s * 0.48); ctx.closePath(); ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
    },
    pastel: function (ctx, s, v) {
      rect(ctx, -s * 0.4, 0, s * 0.8, s * 0.42, '#ff9ec7', s * 0.03);
      rect(ctx, -s * 0.4, -s * 0.05, s * 0.8, s * 0.14, '#ffffff', s * 0.05);
      [-0.2, 0, 0.2].forEach(function (x, i) {
        rect(ctx, x * s - s * 0.025, -s * 0.28, s * 0.05, s * 0.22, '#4ea8de');
        ctx.beginPath(); ctx.ellipse(x * s, -s * 0.36, s * 0.035, s * (0.06 + Math.sin(v * 10 + i) * 0.012), 0, 0, Math.PI * 2); ctx.fillStyle = '#ff9f1c'; ctx.fill();
      });
    },
    cafe: function (ctx, s, v) {
      ctx.save(); ctx.strokeStyle = '#9aa5b1';
      [-0.1, 0.1].forEach(function (x, i) {
        var m = Math.sin(v * 3 + i) * s * 0.03;
        ctx.beginPath(); ctx.moveTo(x * s, -s * 0.15); ctx.quadraticCurveTo(x * s + m + s * 0.05, -s * 0.28, x * s - m, -s * 0.42); ctx.stroke();
      });
      ctx.restore();
      ctx.beginPath(); ctx.arc(s * 0.3, s * 0.1, s * 0.11, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      rect(ctx, -s * 0.3, -s * 0.08, s * 0.6, s * 0.46, '#ffffff', s * 0.08);
      ctx.fillStyle = '#6f4e37'; ctx.fillRect(-s * 0.26, -s * 0.05, s * 0.52, s * 0.07);
    },
    queso: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.46, s * 0.3); ctx.lineTo(-s * 0.46, -s * 0.03); ctx.lineTo(s * 0.46, -s * 0.3); ctx.lineTo(s * 0.46, s * 0.3); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
      [[-0.2, 0.14, 0.07], [0.15, 0.03, 0.09], [0.3, 0.18, 0.05]].forEach(function (c) { circulo(ctx, c[0] * s, c[1] * s, c[2] * s, '#e9a23b'); });
    },

    /* Lugares */
    edificio: function (ctx, s) {
      rect(ctx, -s * 0.28, -s * 0.5, s * 0.56, s, '#8ea3b8');
      for (var i = 0; i < 5; i++) for (var j = 0; j < 3; j++) rect(ctx, (-0.2 + j * 0.15) * s, (-0.42 + i * 0.16) * s, s * 0.09, s * 0.1, (i + j) % 3 ? '#ffe45c' : '#2b2d42');
      rect(ctx, -s * 0.06, s * 0.36, s * 0.12, s * 0.14, '#2b2d42');
    },
    castillo: function (ctx, s) {
      rect(ctx, -s * 0.38, -s * 0.1, s * 0.76, s * 0.55, '#c9ced4');
      [-0.38, 0.22].forEach(function (x) {
        rect(ctx, x * s - s * 0.03, -s * 0.34, s * 0.22, s * 0.79, '#b5bec8');
        ctx.beginPath(); ctx.moveTo(x * s - s * 0.06, -s * 0.34); ctx.lineTo(x * s + s * 0.08, -s * 0.5); ctx.lineTo(x * s + s * 0.22, -s * 0.34); ctx.closePath(); ctx.fillStyle = '#d1495b'; ctx.fill(); ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.45); ctx.lineTo(-s * 0.1, s * 0.18); ctx.arc(0, s * 0.18, s * 0.1, Math.PI, 0); ctx.lineTo(s * 0.1, s * 0.45); ctx.closePath(); ctx.fillStyle = '#6f4e37'; ctx.fill(); ctx.stroke();
    },
    faro: function (ctx, s, v) {
      ctx.save();
      ctx.globalAlpha *= 0.4;
      ctx.fillStyle = '#ffe45c';
      var l = Math.sin(v * 1.2) >= 0 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.33); ctx.lineTo(l * s * 0.55, -s * 0.5); ctx.lineTo(l * s * 0.55, -s * 0.18); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-s * 0.13, -s * 0.22); ctx.lineTo(s * 0.13, -s * 0.22); ctx.lineTo(s * 0.2, s * 0.48); ctx.lineTo(-s * 0.2, s * 0.48); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e63946'; ctx.fillRect(-s * 0.16, -s * 0.02, s * 0.32, s * 0.14); ctx.fillRect(-s * 0.19, s * 0.25, s * 0.38, s * 0.13);
      rect(ctx, -s * 0.1, -s * 0.38, s * 0.2, s * 0.16, '#ffe45c');
      ctx.beginPath(); ctx.moveTo(-s * 0.13, -s * 0.38); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s * 0.13, -s * 0.38); ctx.closePath(); ctx.fillStyle = '#d62828'; ctx.fill(); ctx.stroke();
    },
    tienda: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.42); ctx.lineTo(0, -s * 0.4); ctx.lineTo(s * 0.5, s * 0.42); ctx.closePath(); ctx.fillStyle = '#6cc070'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.13, s * 0.42); ctx.lineTo(0, s * 0.02); ctx.lineTo(s * 0.13, s * 0.42); ctx.closePath(); ctx.fillStyle = '#2b2d42'; ctx.fill(); ctx.stroke();
    },
    semaforo: function (ctx, s, v) {
      linea(ctx, [{ x: 0, y: s * 0.2 }, { x: 0, y: s * 0.5 }]);
      rect(ctx, -s * 0.16, -s * 0.5, s * 0.32, s * 0.72, '#2b2d42', s * 0.04);
      var on = Math.floor(v / 1.2) % 3;
      ['#e63946', '#ffd23f', '#6cc070'].forEach(function (c, i) { circulo(ctx, 0, (-0.37 + i * 0.23) * s, s * 0.08, on === i ? c : '#55565e'); });
    },
    puente: function (ctx, s) {
      rect(ctx, -s * 0.5, s * 0.03, s, s * 0.08, '#c1121f');
      [-0.28, 0.28].forEach(function (x) { rect(ctx, x * s - s * 0.03, -s * 0.38, s * 0.06, s * 0.8, '#c1121f'); });
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.05); ctx.quadraticCurveTo(-s * 0.4, -s * 0.2, -s * 0.28, -s * 0.36); ctx.quadraticCurveTo(0, s * 0.18, s * 0.28, -s * 0.36); ctx.quadraticCurveTo(s * 0.4, -s * 0.2, s * 0.5, -s * 0.05); ctx.stroke();
    },

    /* Más transporte */
    bicicleta: function (ctx, s, v) {
      var r = s * 0.2;
      [-0.3, 0.3].forEach(function (x) {
        circulo(ctx, x * s, s * 0.28, r, null);
        for (var i = 0; i < 3; i++) {
          var a = i * 60 * RAD + v * 7;
          linea(ctx, [{ x: x * s - Math.cos(a) * r, y: s * 0.28 - Math.sin(a) * r }, { x: x * s + Math.cos(a) * r, y: s * 0.28 + Math.sin(a) * r }]);
        }
      });
      ctx.save(); ctx.strokeStyle = '#e63946'; ctx.lineWidth *= 1.3;
      linea(ctx, [{ x: -s * 0.3, y: s * 0.28 }, { x: -s * 0.08, y: 0 }, { x: s * 0.22, y: 0 }, { x: s * 0.03, y: s * 0.28 }, { x: -s * 0.3, y: s * 0.28 }]);
      linea(ctx, [{ x: -s * 0.08, y: 0 }, { x: s * 0.03, y: s * 0.28 }]);
      linea(ctx, [{ x: s * 0.3, y: s * 0.28 }, { x: s * 0.2, y: -s * 0.12 }]);
      ctx.restore();
      linea(ctx, [{ x: s * 0.13, y: -s * 0.14 }, { x: s * 0.24, y: -s * 0.14 }]);
      linea(ctx, [{ x: -s * 0.16, y: -s * 0.05 }, { x: -s * 0.01, y: -s * 0.05 }]);
      var pedal = { x: Math.sin(v * 7) * s * 0.08, y: -Math.cos(v * 7) * s * 0.08 };   // gira con las ruedas
      linea(ctx, [{ x: s * 0.03 - pedal.x, y: s * 0.28 - pedal.y }, { x: s * 0.03 + pedal.x, y: s * 0.28 + pedal.y }]);
    },
    globoAerostatico: function (ctx, s) {
      ctx.beginPath(); ctx.arc(0, -s * 0.13, s * 0.34, Math.PI * 0.85, Math.PI * 0.15); ctx.lineTo(s * 0.08, s * 0.25); ctx.lineTo(-s * 0.08, s * 0.25); ctx.closePath();
      ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -s * 0.11, s * 0.13, s * 0.32, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
      linea(ctx, [{ x: -s * 0.08, y: s * 0.25 }, { x: -s * 0.08, y: s * 0.36 }]);
      linea(ctx, [{ x: s * 0.08, y: s * 0.25 }, { x: s * 0.08, y: s * 0.36 }]);
      rect(ctx, -s * 0.1, s * 0.36, s * 0.2, s * 0.13, '#8d5524', s * 0.02);
    },
    helicoptero: function (ctx, s, v) {
      var a = Math.abs(Math.cos(v * 22));
      ctx.beginPath(); ctx.ellipse(-s * 0.1, 0, s * 0.27, s * 0.2, 0, 0, Math.PI * 2); ctx.fillStyle = '#2a6fdb'; ctx.fill(); ctx.stroke();
      linea(ctx, [{ x: s * 0.12, y: -s * 0.04 }, { x: s * 0.48, y: -s * 0.12 }]);
      linea(ctx, [{ x: s * 0.48, y: -s * 0.22 * (0.3 + a) }, { x: s * 0.48, y: -s * 0.02 + s * 0.1 * a }]);
      ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.02, s * 0.11, s * 0.11, 0, 0, Math.PI * 2); ctx.fillStyle = '#8ecae6'; ctx.fill(); ctx.stroke();
      linea(ctx, [{ x: -s * 0.1, y: -s * 0.2 }, { x: -s * 0.1, y: -s * 0.3 }]);
      linea(ctx, [{ x: -s * 0.1 - s * 0.42 * a, y: -s * 0.3 }, { x: -s * 0.1 + s * 0.42 * a, y: -s * 0.3 }]);
      linea(ctx, [{ x: -s * 0.2, y: s * 0.2 }, { x: -s * 0.2, y: s * 0.32 }]);
      linea(ctx, [{ x: s * 0.02, y: s * 0.2 }, { x: s * 0.02, y: s * 0.32 }]);
      linea(ctx, [{ x: -s * 0.36, y: s * 0.32 }, { x: s * 0.16, y: s * 0.32 }]);
    },
    submarino: function (ctx, s) {
      rect(ctx, -s * 0.08, -s * 0.28, s * 0.2, s * 0.17, '#ffc93c', s * 0.02);
      ctx.lineWidth *= 1.2;
      linea(ctx, [{ x: s * 0.02, y: -s * 0.28 }, { x: s * 0.02, y: -s * 0.4 }, { x: s * 0.14, y: -s * 0.4 }]);
      ctx.lineWidth /= 1.2;
      ctx.beginPath(); ctx.ellipse(0, s * 0.03, s * 0.45, s * 0.2, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffc93c'; ctx.fill(); ctx.stroke();
      [-0.22, 0, 0.22].forEach(function (x) { circulo(ctx, x * s, s * 0.03, s * 0.065, '#8ecae6'); });
    },

    /* Ciencia */
    atomo: function (ctx, s, v) {
      for (var i = 0; i < 3; i++) {
        var a = i * 60 * RAD;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 0.48, s * 0.17, a, 0, Math.PI * 2); ctx.stroke();
        var b = v * 2.5 + i * 2.1, ex = Math.cos(b) * s * 0.48, ey = Math.sin(b) * s * 0.17;
        circulo(ctx, ex * Math.cos(a) - ey * Math.sin(a), ex * Math.sin(a) + ey * Math.cos(a), s * 0.04, '#2a6fdb');
      }
      circulo(ctx, 0, 0, s * 0.09, '#e63946');
    },
    matraz: function (ctx, s, v) {
      ctx.beginPath(); ctx.moveTo(-s * 0.09, -s * 0.42); ctx.lineTo(-s * 0.09, -s * 0.12); ctx.lineTo(-s * 0.36, s * 0.42); ctx.lineTo(s * 0.36, s * 0.42); ctx.lineTo(s * 0.09, -s * 0.12); ctx.lineTo(s * 0.09, -s * 0.42); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.22, s * 0.14); ctx.lineTo(-s * 0.36, s * 0.42); ctx.lineTo(s * 0.36, s * 0.42); ctx.lineTo(s * 0.22, s * 0.14); ctx.closePath(); ctx.fillStyle = '#80ed99'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.09, -s * 0.42); ctx.lineTo(-s * 0.09, -s * 0.12); ctx.lineTo(-s * 0.36, s * 0.42); ctx.lineTo(s * 0.36, s * 0.42); ctx.lineTo(s * 0.09, -s * 0.12); ctx.lineTo(s * 0.09, -s * 0.42); ctx.stroke();
      linea(ctx, [{ x: -s * 0.14, y: -s * 0.42 }, { x: s * 0.14, y: -s * 0.42 }]);
      for (var i = 0; i < 3; i++) {
        var k = ((v * 0.7 + i / 3) % 1);
        circulo(ctx, (i - 1) * s * 0.09, s * 0.3 - k * s * 0.2, s * 0.025, '#ffffff');
      }
    },
    engranaje: function (ctx, s, v) {
      ctx.save(); ctx.rotate(v * 1.2);
      ctx.beginPath();
      for (var i = 0; i < 16; i++) {
        var r = i % 2 ? s * 0.34 : s * 0.46, ang = (i / 16) * Math.PI * 2, paso = Math.PI / 16 * 0.65;
        ctx.lineTo(Math.cos(ang - paso) * r, Math.sin(ang - paso) * r);
        ctx.lineTo(Math.cos(ang + paso) * r, Math.sin(ang + paso) * r);
      }
      ctx.closePath(); ctx.fillStyle = '#9aa5b1'; ctx.fill(); ctx.stroke();
      circulo(ctx, 0, 0, s * 0.13, '#faf6ee');
      ctx.restore();
    },
    pastilla: function (ctx, s) {
      ctx.save(); ctx.rotate(-0.6);
      rect(ctx, -s * 0.42, -s * 0.15, s * 0.84, s * 0.3, '#ffffff', s * 0.15);
      ctx.beginPath(); ctx.moveTo(0, -s * 0.15); ctx.lineTo(-s * 0.27, -s * 0.15); ctx.arcTo(-s * 0.42, -s * 0.15, -s * 0.42, 0, s * 0.15); ctx.arcTo(-s * 0.42, s * 0.15, -s * 0.27, s * 0.15, s * 0.15); ctx.lineTo(0, s * 0.15); ctx.closePath();
      ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    jeringa: function (ctx, s) {
      ctx.save(); ctx.rotate(0.7);
      linea(ctx, [{ x: 0, y: s * 0.26 }, { x: 0, y: s * 0.5 }]);
      rect(ctx, -s * 0.09, -s * 0.22, s * 0.18, s * 0.48, '#ffffff', s * 0.02);
      ctx.fillStyle = '#4ea8de'; ctx.fillRect(-s * 0.07, -s * 0.02, s * 0.14, s * 0.26);
      linea(ctx, [{ x: 0, y: -s * 0.22 }, { x: 0, y: -s * 0.42 }]);
      linea(ctx, [{ x: -s * 0.1, y: -s * 0.42 }, { x: s * 0.1, y: -s * 0.42 }]);
      linea(ctx, [{ x: -s * 0.15, y: -s * 0.2 }, { x: s * 0.15, y: -s * 0.2 }]);
      ctx.restore();
    },
    robot: function (ctx, s, v) {
      linea(ctx, [{ x: 0, y: -s * 0.38 }, { x: 0, y: -s * 0.47 }]);
      circulo(ctx, 0, -s * 0.47, s * 0.035, Math.floor(v * 3) % 2 ? '#e63946' : '#ffd23f');
      rect(ctx, -s * 0.2, -s * 0.38, s * 0.4, s * 0.28, '#c9ced4', s * 0.04);
      circulo(ctx, -s * 0.08, -s * 0.26, s * 0.04, '#2a6fdb');
      circulo(ctx, s * 0.08, -s * 0.26, s * 0.04, '#2a6fdb');
      linea(ctx, [{ x: -s * 0.07, y: -s * 0.16 }, { x: s * 0.07, y: -s * 0.16 }]);
      rect(ctx, -s * 0.26, -s * 0.07, s * 0.52, s * 0.35, '#9aa5b1', s * 0.04);
      circulo(ctx, 0, s * 0.1, s * 0.06, '#ffd23f');
      [-1, 1].forEach(function (l) {
        rect(ctx, l * s * 0.27 - s * 0.05, -s * 0.05, s * 0.1, s * 0.27, '#c9ced4', s * 0.03);
        rect(ctx, l * s * 0.13 - s * 0.05, s * 0.28, s * 0.1, s * 0.2, '#c9ced4', s * 0.02);
      });
    },

    /* Herramientas (también las usan las acciones) */
    martillo: function (ctx, s) {
      rect(ctx, -s * 0.05, -s * 0.3, s * 0.1, s * 0.8, '#a0692f', s * 0.02);
      rect(ctx, -s * 0.28, -s * 0.48, s * 0.56, s * 0.24, '#6c757d', s * 0.03);
    },
    pala: function (ctx, s) {
      linea(ctx, [{ x: 0, y: -s * 0.45 }, { x: 0, y: s * 0.18 }]);
      linea(ctx, [{ x: -s * 0.07, y: -s * 0.45 }, { x: s * 0.07, y: -s * 0.45 }]);
      ctx.beginPath(); ctx.moveTo(-s * 0.13, s * 0.16); ctx.lineTo(s * 0.13, s * 0.16); ctx.lineTo(s * 0.1, s * 0.4); ctx.lineTo(0, s * 0.5); ctx.lineTo(-s * 0.1, s * 0.4); ctx.closePath();
      ctx.fillStyle = '#9aa5b1'; ctx.fill(); ctx.stroke();
    },
    escoba: function (ctx, s) {
      ctx.save(); ctx.strokeStyle = '#a0692f'; ctx.lineWidth *= 1.2;
      linea(ctx, [{ x: 0, y: -s * 0.5 }, { x: 0, y: s * 0.2 }]);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-s * 0.05, s * 0.18); ctx.lineTo(s * 0.05, s * 0.18); ctx.lineTo(s * 0.17, s * 0.5); ctx.lineTo(-s * 0.17, s * 0.5); ctx.closePath();
      ctx.fillStyle = '#e9c46a'; ctx.fill(); ctx.stroke();
    },
    sarten: function (ctx, s) {
      rect(ctx, -s * 0.5, -s * 0.03, s * 0.4, s * 0.07, '#a0692f', s * 0.03);
      ctx.beginPath(); ctx.ellipse(s * 0.17, 0, s * 0.33, s * 0.08, 0, 0, Math.PI * 2); ctx.fillStyle = '#2b2d42'; ctx.fill(); ctx.stroke();
    },
    vaso: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 0.45); ctx.lineTo(-s * 0.21, s * 0.45); ctx.lineTo(s * 0.21, s * 0.45); ctx.lineTo(s * 0.28, -s * 0.45); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.255, -s * 0.15); ctx.lineTo(-s * 0.21, s * 0.45); ctx.lineTo(s * 0.21, s * 0.45); ctx.lineTo(s * 0.255, -s * 0.15); ctx.closePath();
      ctx.fillStyle = '#ff9f1c'; ctx.fill(); ctx.stroke();
    },
    caja: function (ctx, s) {
      rect(ctx, -s * 0.42, -s * 0.34, s * 0.84, s * 0.68, '#d4a056');
      ctx.fillStyle = '#b5833f'; ctx.fillRect(-s * 0.07, -s * 0.33, s * 0.14, s * 0.66);
      rect(ctx, -s * 0.42, -s * 0.34, s * 0.84, s * 0.68, null);
    },
    pesas: function (ctx, s) {
      ctx.save(); ctx.lineWidth *= 1.4;
      linea(ctx, [{ x: -s * 0.5, y: 0 }, { x: s * 0.5, y: 0 }]);
      ctx.restore();
      [-1, 1].forEach(function (l) {
        rect(ctx, l * s * 0.36 - s * 0.05, -s * 0.2, s * 0.1, s * 0.4, '#2b2d42', s * 0.02);
        rect(ctx, l * s * 0.45 - s * 0.03, -s * 0.13, s * 0.06, s * 0.26, '#6c757d', s * 0.02);
      });
    },
    paraguas: function (ctx, s) {
      linea(ctx, [{ x: 0, y: -s * 0.25 }, { x: 0, y: s * 0.38 }]);
      ctx.beginPath(); ctx.arc(-s * 0.06, s * 0.38, s * 0.06, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.05); ctx.quadraticCurveTo(-s * 0.42, -s * 0.48, 0, -s * 0.48); ctx.quadraticCurveTo(s * 0.42, -s * 0.48, s * 0.5, -s * 0.05);
      ctx.quadraticCurveTo(s * 0.33, -s * 0.18, s * 0.17, -s * 0.05); ctx.quadraticCurveTo(0, -s * 0.18, -s * 0.17, -s * 0.05); ctx.quadraticCurveTo(-s * 0.33, -s * 0.18, -s * 0.5, -s * 0.05); ctx.closePath();
      ctx.fillStyle = '#7b2cbf'; ctx.fill(); ctx.stroke();
    },
    guitarra: function (ctx, s) {
      ctx.save(); ctx.rotate(-Math.PI / 2);          // el mástil hacia arriba
      rect(ctx, s * 0.05, -s * 0.05, s * 0.45, s * 0.1, '#6f4e37', s * 0.01);
      rect(ctx, s * 0.44, -s * 0.07, s * 0.08, s * 0.14, '#2b2d42', s * 0.01);
      ctx.beginPath(); ctx.ellipse(-s * 0.3, 0, s * 0.2, s * 0.21, 0, 0, Math.PI * 2); ctx.fillStyle = '#d4a056'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-s * 0.03, 0, s * 0.14, s * 0.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      circulo(ctx, -s * 0.13, 0, s * 0.06, '#2b2d42');
      ctx.restore();
    },
    microfono: function (ctx, s) {
      rect(ctx, -s * 0.09, -s * 0.05, s * 0.18, s * 0.5, '#2b2d42', s * 0.06);
      circulo(ctx, 0, -s * 0.22, s * 0.2, '#9aa5b1');
    },
    camara: function (ctx, s) {
      rect(ctx, -s * 0.15, -s * 0.33, s * 0.3, s * 0.14, '#6c757d', s * 0.02);
      rect(ctx, -s * 0.46, -s * 0.22, s * 0.92, s * 0.58, '#2b2d42', s * 0.06);
      circulo(ctx, 0, s * 0.07, s * 0.21, '#6c757d');
      circulo(ctx, 0, s * 0.07, s * 0.12, '#8ecae6');
    },
    varita: function (ctx, s) {
      ctx.save(); ctx.lineWidth *= 1.6;
      linea(ctx, [{ x: -s * 0.05, y: s * 0.45 }, { x: s * 0.12, y: -s * 0.25 }]);
      ctx.restore();
      ctx.save(); ctx.translate(s * 0.14, -s * 0.32); OBJETOS.estrella(ctx, s * 0.36); ctx.restore();
    },
    lapiz: function (ctx, s) {
      ctx.save(); ctx.rotate(0.5);
      rect(ctx, -s * 0.09, -s * 0.28, s * 0.18, s * 0.58, '#ffd23f');
      rect(ctx, -s * 0.09, -s * 0.4, s * 0.18, s * 0.12, '#ff7eb6', s * 0.03);
      ctx.beginPath(); ctx.moveTo(-s * 0.09, s * 0.3); ctx.lineTo(0, s * 0.5); ctx.lineTo(s * 0.09, s * 0.3); ctx.closePath(); ctx.fillStyle = '#f4d6a0'; ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    patineta: function (ctx, s, v) {
      rect(ctx, -s * 0.5, -s * 0.1, s, s * 0.08, '#e63946', s * 0.04);
      [-0.3, 0.3].forEach(function (x) {
        circulo(ctx, x * s, s * 0.05, s * 0.07, '#ffd23f');
        var a = v * 10;
        linea(ctx, [{ x: x * s, y: s * 0.05 }, { x: x * s + Math.cos(a) * s * 0.06, y: s * 0.05 + Math.sin(a) * s * 0.06 }]);
      });
    },
    silla: function (ctx, s) {
      ctx.save(); ctx.strokeStyle = '#8d5524'; ctx.lineWidth *= 2;
      linea(ctx, [{ x: -s * 0.25, y: -s * 0.48 }, { x: -s * 0.25, y: s * 0.48 }]);
      linea(ctx, [{ x: s * 0.25, y: s * 0.02 }, { x: s * 0.25, y: s * 0.48 }]);
      linea(ctx, [{ x: -s * 0.25, y: 0 }, { x: s * 0.3, y: 0 }]);
      ctx.restore();
    },
    pelota: function (ctx, s, v) {
      ctx.save(); ctx.rotate(v * 2);
      circulo(ctx, 0, 0, s * 0.45, '#ff9f1c');
      linea(ctx, [{ x: -s * 0.45, y: 0 }, { x: s * 0.45, y: 0 }]);
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.18, s * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    },
    espada: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.06, s * 0.18); ctx.lineTo(-s * 0.06, -s * 0.38); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s * 0.06, -s * 0.38); ctx.lineTo(s * 0.06, s * 0.18); ctx.closePath();
      ctx.fillStyle = '#c9ced4'; ctx.fill(); ctx.stroke();
      rect(ctx, -s * 0.18, s * 0.18, s * 0.36, s * 0.07, '#ffc93c', s * 0.02);
      rect(ctx, -s * 0.04, s * 0.25, s * 0.08, s * 0.25, '#8d5524', s * 0.02);
    },
    escudo: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.38, -s * 0.38); ctx.lineTo(s * 0.38, -s * 0.38); ctx.lineTo(s * 0.38, 0); ctx.quadraticCurveTo(s * 0.3, s * 0.3, 0, s * 0.48); ctx.quadraticCurveTo(-s * 0.3, s * 0.3, -s * 0.38, 0); ctx.closePath();
      ctx.fillStyle = '#2a6fdb'; ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(0, -s * 0.03); OBJETOS.estrella(ctx, s * 0.42); ctx.restore();
    },

    /* Otras cosas */
    fantasma: function (ctx, s, v) {
      var o = Math.sin(v * 5) * s * 0.03;
      ctx.beginPath(); ctx.moveTo(-s * 0.32, s * 0.42); ctx.lineTo(-s * 0.32, -s * 0.1); ctx.arc(0, -s * 0.1, s * 0.32, Math.PI, 0); ctx.lineTo(s * 0.32, s * 0.42);
      ctx.quadraticCurveTo(s * 0.21, s * 0.3 + o, s * 0.11, s * 0.42); ctx.quadraticCurveTo(0, s * 0.3 - o, -s * 0.11, s * 0.42); ctx.quadraticCurveTo(-s * 0.21, s * 0.3 + o, -s * 0.32, s * 0.42); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      circulo(ctx, -s * 0.11, -s * 0.12, s * 0.05, TINTA);
      circulo(ctx, s * 0.11, -s * 0.12, s * 0.05, TINTA);
      ctx.beginPath(); ctx.ellipse(0, s * 0.03, s * 0.06, s * 0.08, 0, 0, Math.PI * 2); ctx.fillStyle = TINTA; ctx.fill();
    },
    bomba: function (ctx, s, v) {
      circulo(ctx, -s * 0.05, s * 0.08, s * 0.35, '#2b2d42');
      rect(ctx, s * 0.05, -s * 0.33, s * 0.15, s * 0.12, '#6c757d', s * 0.02);
      ctx.beginPath(); ctx.moveTo(s * 0.13, -s * 0.33); ctx.quadraticCurveTo(s * 0.2, -s * 0.47, s * 0.36, -s * 0.38); ctx.stroke();
      ctx.save(); ctx.translate(s * 0.37, -s * 0.38); ctx.scale(1 + Math.sin(v * 22) * 0.25, 1 + Math.sin(v * 22) * 0.25); ctx.lineWidth *= 0.5; OBJETOS.estrella(ctx, s * 0.2); ctx.restore();
    },
    yunque: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.28); ctx.lineTo(s * 0.4, -s * 0.28); ctx.lineTo(s * 0.4, -s * 0.08); ctx.lineTo(s * 0.18, -s * 0.03); ctx.lineTo(s * 0.13, s * 0.22); ctx.lineTo(s * 0.32, s * 0.4); ctx.lineTo(-s * 0.32, s * 0.4); ctx.lineTo(-s * 0.13, s * 0.22); ctx.lineTo(-s * 0.18, -s * 0.03); ctx.quadraticCurveTo(-s * 0.4, -s * 0.05, -s * 0.5, -s * 0.28); ctx.closePath();
      ctx.fillStyle = '#6c757d'; ctx.fill(); ctx.stroke();
    },
    ancla: function (ctx, s) {
      ctx.lineWidth *= 1.6;
      circulo(ctx, 0, -s * 0.38, s * 0.08, null);
      linea(ctx, [{ x: 0, y: -s * 0.3 }, { x: 0, y: s * 0.42 }]);
      linea(ctx, [{ x: -s * 0.16, y: -s * 0.18 }, { x: s * 0.16, y: -s * 0.18 }]);
      ctx.beginPath(); ctx.arc(0, s * 0.03, s * 0.38, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke();
    },
    diamante: function (ctx, s, v) {
      ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.34); ctx.lineTo(s * 0.26, -s * 0.34); ctx.lineTo(s * 0.46, -s * 0.08); ctx.lineTo(0, s * 0.44); ctx.lineTo(-s * 0.46, -s * 0.08); ctx.closePath();
      ctx.fillStyle = '#8ecae6'; ctx.fill(); ctx.stroke();
      ctx.lineWidth *= 0.7;
      linea(ctx, [{ x: -s * 0.46, y: -s * 0.08 }, { x: s * 0.46, y: -s * 0.08 }]);
      linea(ctx, [{ x: -s * 0.14, y: -s * 0.08 }, { x: 0, y: s * 0.44 }, { x: s * 0.14, y: -s * 0.08 }]);
      linea(ctx, [{ x: -s * 0.26, y: -s * 0.34 }, { x: -s * 0.14, y: -s * 0.08 }, { x: 0, y: -s * 0.34 }, { x: s * 0.14, y: -s * 0.08 }, { x: s * 0.26, y: -s * 0.34 }]);
      var b = (v * 1.2) % 2;
      if (b < 0.3) { ctx.save(); ctx.translate(s * 0.3, -s * 0.34); ctx.scale(Math.sin(b / 0.3 * Math.PI), Math.sin(b / 0.3 * Math.PI)); OBJETOS.estrella(ctx, s * 0.26); ctx.restore(); }
    },
    cofre: function (ctx, s) {
      rect(ctx, -s * 0.42, -s * 0.02, s * 0.84, s * 0.42, '#a0692f', s * 0.02);
      ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.02); ctx.quadraticCurveTo(-s * 0.42, -s * 0.36, 0, -s * 0.36); ctx.quadraticCurveTo(s * 0.42, -s * 0.36, s * 0.42, -s * 0.02); ctx.closePath();
      ctx.fillStyle = '#8d5524'; ctx.fill(); ctx.stroke();
      rect(ctx, -s * 0.08, -s * 0.09, s * 0.16, s * 0.2, '#ffc93c', s * 0.02);
    },
    mapa: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.46, -s * 0.3); ctx.lineTo(-s * 0.16, -s * 0.38); ctx.lineTo(s * 0.16, -s * 0.3); ctx.lineTo(s * 0.46, -s * 0.38); ctx.lineTo(s * 0.46, s * 0.3); ctx.lineTo(s * 0.16, s * 0.38); ctx.lineTo(-s * 0.16, s * 0.3); ctx.lineTo(-s * 0.46, s * 0.38); ctx.closePath();
      ctx.fillStyle = '#f4e3b2'; ctx.fill(); ctx.stroke();
      ctx.save(); ctx.strokeStyle = '#e63946'; ctx.setLineDash([s * 0.05, s * 0.05]);
      ctx.beginPath(); ctx.moveTo(-s * 0.32, s * 0.2); ctx.quadraticCurveTo(-s * 0.05, -s * 0.2, s * 0.2, s * 0.02); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#e63946';
      linea(ctx, [{ x: s * 0.18, y: -s * 0.08 }, { x: s * 0.32, y: s * 0.06 }]);
      linea(ctx, [{ x: s * 0.32, y: -s * 0.08 }, { x: s * 0.18, y: s * 0.06 }]);
    },
    brujula: function (ctx, s, v) {
      circulo(ctx, 0, 0, s * 0.45, '#ffc93c');
      circulo(ctx, 0, 0, s * 0.36, '#ffffff');
      ctx.save(); ctx.rotate(Math.sin(v * 1.8) * 0.5 + 0.3);
      ctx.beginPath(); ctx.moveTo(-s * 0.07, 0); ctx.lineTo(0, -s * 0.28); ctx.lineTo(s * 0.07, 0); ctx.closePath(); ctx.fillStyle = '#e63946'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.07, 0); ctx.lineTo(0, s * 0.28); ctx.lineTo(s * 0.07, 0); ctx.closePath(); ctx.fillStyle = '#2b2d42'; ctx.fill();
      ctx.restore();
    },
    relojArena: function (ctx, s, v) {
      var k = (v / 6) % 1;
      rect(ctx, -s * 0.3, -s * 0.48, s * 0.6, s * 0.07, '#8d5524', s * 0.02);
      rect(ctx, -s * 0.3, s * 0.41, s * 0.6, s * 0.07, '#8d5524', s * 0.02);
      ctx.beginPath(); ctx.moveTo(-s * 0.24, -s * 0.41); ctx.lineTo(s * 0.24, -s * 0.41); ctx.lineTo(s * 0.03, 0); ctx.lineTo(s * 0.24, s * 0.41); ctx.lineTo(-s * 0.24, s * 0.41); ctx.lineTo(-s * 0.03, 0); ctx.closePath();
      ctx.fillStyle = '#eaf6fb'; ctx.fill();
      ctx.fillStyle = '#e9c46a';
      var ar = 0.33 * (1 - k);
      ctx.beginPath(); ctx.moveTo(-s * 0.03 - ar * s * 0.5, -ar * s); ctx.lineTo(s * 0.03 + ar * s * 0.5, -ar * s); ctx.lineTo(s * 0.03, 0); ctx.lineTo(-s * 0.03, 0); ctx.closePath(); ctx.fill();
      var ab = 0.05 + 0.26 * k;
      ctx.beginPath(); ctx.moveTo(-s * 0.24, s * 0.41); ctx.lineTo(s * 0.24, s * 0.41); ctx.lineTo(0, s * (0.41 - ab)); ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.01, 0, s * 0.02, s * 0.38);
      ctx.beginPath(); ctx.moveTo(-s * 0.24, -s * 0.41); ctx.lineTo(s * 0.24, -s * 0.41); ctx.lineTo(s * 0.03, 0); ctx.lineTo(s * 0.24, s * 0.41); ctx.lineTo(-s * 0.24, s * 0.41); ctx.lineTo(-s * 0.03, 0); ctx.closePath(); ctx.stroke();
    },
    dado: function (ctx, s) {
      rect(ctx, -s * 0.38, -s * 0.38, s * 0.76, s * 0.76, '#ffffff', s * 0.1);
      [[-0.2, -0.2], [0.2, -0.2], [0, 0], [-0.2, 0.2], [0.2, 0.2]].forEach(function (c) { circulo(ctx, c[0] * s, c[1] * s, s * 0.055, TINTA); });
    },
    globo: function (ctx, s, v) {
      var o = Math.sin(v * 2) * s * 0.03;
      ctx.beginPath(); ctx.moveTo(0, s * 0.18); ctx.quadraticCurveTo(o * 2 + s * 0.05, s * 0.33, -o, s * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -s * 0.13, s * 0.28, s * 0.34, 0, 0, Math.PI * 2); ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.05, s * 0.24); ctx.lineTo(0, s * 0.2); ctx.lineTo(s * 0.05, s * 0.24); ctx.closePath(); ctx.fill(); ctx.stroke();
    },
    peligro: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.lineTo(s * 0.5, s * 0.4); ctx.lineTo(-s * 0.5, s * 0.4); ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = TINTA; ctx.font = '900 ' + Math.round(s * 0.55) + 'px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, s * 0.11);
    },
    basura: function (ctx, s) {
      linea(ctx, [{ x: -s * 0.08, y: -s * 0.44 }, { x: s * 0.08, y: -s * 0.44 }]);
      rect(ctx, -s * 0.36, -s * 0.38, s * 0.72, s * 0.1, '#9aa5b1', s * 0.03);
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.28); ctx.lineTo(-s * 0.24, s * 0.45); ctx.lineTo(s * 0.24, s * 0.45); ctx.lineTo(s * 0.3, -s * 0.28); ctx.closePath();
      ctx.fillStyle = '#6c757d'; ctx.fill(); ctx.stroke();
      [-0.1, 0.1].forEach(function (x) { linea(ctx, [{ x: x * s, y: -s * 0.16 }, { x: x * s, y: s * 0.32 }]); });
    },
    reciclaje: function (ctx, s, v) {
      ctx.save(); ctx.rotate(v * 0.4);
      for (var i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate(i * 120 * RAD);
        ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.34); ctx.lineTo(s * 0.17, -s * 0.34); ctx.lineTo(s * 0.17, -s * 0.46); ctx.lineTo(s * 0.4, -s * 0.26); ctx.lineTo(s * 0.17, -s * 0.06); ctx.lineTo(s * 0.17, -s * 0.18); ctx.lineTo(-s * 0.08, -s * 0.18); ctx.closePath();
        ctx.fillStyle = '#2b9348'; ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
    notaMusical: function (ctx, s) {
      ctx.lineWidth *= 1.4;
      linea(ctx, [{ x: s * 0.2, y: s * 0.26 }, { x: s * 0.2, y: -s * 0.4 }, { x: -s * 0.2, y: -s * 0.3 }, { x: -s * 0.2, y: s * 0.33 }]);
      [[0.1, 0.28], [-0.3, 0.35]].forEach(function (c) { ctx.beginPath(); ctx.ellipse(c[0] * s, c[1] * s, s * 0.11, s * 0.08, -0.4, 0, Math.PI * 2); ctx.fillStyle = TINTA; ctx.fill(); });
    },
    tumba: function (ctx, s) {
      ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.42); ctx.lineTo(-s * 0.3, -s * 0.15); ctx.arc(0, -s * 0.15, s * 0.3, Math.PI, 0); ctx.lineTo(s * 0.3, s * 0.42); ctx.closePath();
      ctx.fillStyle = '#c9ced4'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = TINTA; ctx.font = '900 ' + Math.round(s * 0.18) + 'px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('RIP', 0, -s * 0.08);
      ctx.strokeStyle = '#2b9348';
      linea(ctx, [{ x: -s * 0.42, y: s * 0.44 }, { x: s * 0.42, y: s * 0.44 }]);
    },
    wifi: function (ctx, s, v) {
      var on = Math.floor(v * 2) % 4;
      ctx.lineWidth *= 2;
      [0.5, 0.33, 0.17].forEach(function (r, i) {
        ctx.strokeStyle = on > 2 - i ? '#2a6fdb' : '#c9ced4';
        ctx.beginPath(); ctx.arc(0, s * 0.3, r * s * 1.2, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();
      });
      ctx.fillStyle = '#2a6fdb';
      ctx.beginPath(); ctx.arc(0, s * 0.3, s * 0.05, 0, Math.PI * 2); ctx.fill();
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
    if (ob.animacion === 'rebotar') {                 // cae y rebota cada vez menos
      var saltos = Math.exp(-vivo * 1.3) * Math.abs(Math.cos(vivo * 5.5));
      y -= saltos * H * 0.28;
    }
    if (ob.animacion === 'cruzar') {                  // atraviesa la pantalla y vuelve a entrar
      var vuelta = (vivo / 5) % 1;
      x = (vuelta * 1.3 - 0.15) * W;
      y += Math.sin(vivo * 3) * s * 0.08;
    }
    if (ob.animacion === 'orbitar') {
      x += Math.cos(vivo * 1.6) * s * 0.55;
      y += Math.sin(vivo * 1.6) * s * 0.22;
    }
    if (ob.animacion === 'balancear') giro = Math.sin(vivo * 2.4) * 0.3;
    if (ob.animacion === 'crecer') esc *= 0.5 + 0.7 * suaveAmbos(limitar(vivo / 3, 0, 1));
    if (ob.animacion === 'explotar') {                // se infla y revienta en pedacitos
      var ANTES = 2.2, tras = vivo - ANTES;
      if (tras > 0) { dibujarEstallido(ctx, x, y, s, tras); return; }
      esc *= 1 + Math.pow(vivo / ANTES, 3) * 0.35;
      x += Math.sin(vivo * 50) * s * 0.03 * (vivo / ANTES);
    }
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.translate(x, y);
    ctx.rotate(giro);
    ctx.scale(esc, esc);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TINTA;
    ctx.lineWidth = Math.max(2, s * 0.045);
    dibujo(ctx, s, vivo);
    ctx.restore();
  }

  var COLORES_FIESTA = ['#e63946', '#ffd23f', '#2a6fdb', '#6cc070', '#ff7eb6', '#ff9f1c'];

  // Destello y pedacitos que salen volando; "tras" = segundos desde el estallido.
  function dibujarEstallido(ctx, x, y, s, tras) {
    if (tras > 1.4) return;
    ctx.save();
    if (tras < 0.28) {
      var k = tras / 0.28;
      ctx.globalAlpha = 1 - k;
      ctx.translate(x, y);
      ctx.scale(0.6 + k * 1.4, 0.6 + k * 1.4);
      ctx.beginPath();
      for (var j = 0; j < 20; j++) {
        var rad = s * (j % 2 ? 0.28 : 0.62), ang = j * 18 * RAD;
        ctx[j ? 'lineTo' : 'moveTo'](Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.strokeStyle = '#ff7b00'; ctx.lineWidth = Math.max(2, s * 0.04); ctx.stroke();
      ctx.restore();
      ctx.save();
    }
    ctx.globalAlpha = limitar(1.4 - tras, 0, 1);
    for (var i = 0; i < 20; i++) {
      var a = azar(i + 3) * Math.PI * 2, v = s * (0.8 + azar(i + 40) * 1.6);
      ctx.fillStyle = COLORES_FIESTA[i % COLORES_FIESTA.length];
      ctx.fillRect(x + Math.cos(a) * v * tras, y + Math.sin(a) * v * tras + s * 1.5 * tras * tras, s * 0.06, s * 0.06);
    }
    ctx.restore();
  }

  /* ---------------- Efectos de toda la escena ----------------
     Partículas calculadas solo con el tiempo: el video sale igual a la vista previa. */

  function caen(n, velocidad, semilla, W, H, dibuja, t) {
    for (var i = 0; i < n; i++) {
      var v = velocidad * (0.7 + azar(i + semilla) * 0.6);
      var y = ((t * v + azar(i + semilla + 500)) % 1) * (H * 1.1) - H * 0.05;
      var x = azar(i + semilla + 900) * W;
      dibuja(i, x, y);
    }
  }

  var EFECTOS = {
    confeti: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      caen(70, 0.28, 11, W, H, function (i, x, y) {
        var giro = t * (2 + azar(i) * 5) + i;
        ctx.save();
        ctx.translate(x + Math.sin(t * 2 + i) * lado * 0.02, y);
        ctx.rotate(giro);
        ctx.fillStyle = COLORES_FIESTA[i % COLORES_FIESTA.length];
        var a = lado * 0.016;
        ctx.fillRect(-a / 2, -a * 0.3 * Math.abs(Math.cos(giro * 2)) - 1, a, a * 0.6 * Math.abs(Math.cos(giro * 2)) + 1);
        ctx.restore();
      }, t);
    },
    lluvia: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      ctx.fillStyle = 'rgba(40,60,90,0.12)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(70,120,190,0.6)';
      ctx.lineWidth = Math.max(1, lado * 0.0025);
      ctx.beginPath();
      caen(90, 1.2, 23, W, H, function (i, x, y) {
        ctx.moveTo(x, y); ctx.lineTo(x - lado * 0.008, y + lado * 0.035);
      }, t);
      ctx.stroke();
    },
    nieve: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(120,160,200,0.5)';
      ctx.lineWidth = 1;
      caen(70, 0.14, 37, W, H, function (i, x, y) {
        ctx.beginPath();
        ctx.arc(x + Math.sin(t * 1.3 + i) * lado * 0.02, y, lado * (0.004 + azar(i) * 0.005), 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }, t);
    },
    burbujas: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = Math.max(1, lado * 0.002);
      caen(32, 0.16, 53, W, H, function (i, x, y) {
        ctx.beginPath();
        ctx.arc(x + Math.sin(t * 2 + i) * lado * 0.012, H - y, lado * (0.006 + azar(i) * 0.014), 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }, t);
    },
    hojas: function (ctx, W, H, t) {
      var lado = Math.min(W, H), COL = ['#e9a23b', '#d1495b', '#6cc070'];
      caen(24, 0.14, 71, W, H, function (i, x, y) {
        ctx.save();
        ctx.translate(x + Math.sin(t * 1.5 + i) * lado * 0.05, y);
        ctx.rotate(Math.sin(t * 2 + i) * 1.4);
        ctx.fillStyle = COL[i % 3];
        ctx.beginPath(); ctx.ellipse(0, 0, lado * 0.016, lado * 0.007, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }, t);
    },
    corazones: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      caen(18, 0.13, 83, W, H, function (i, x, y) {
        icono(ctx, 'corazon', x + Math.sin(t * 2 + i) * lado * 0.02, H - y, lado * (0.03 + azar(i) * 0.03), 0.85);
      }, t);
    },
    dinero: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      caen(24, 0.2, 97, W, H, function (i, x, y) {
        icono(ctx, 'dinero', x + Math.sin(t * 1.6 + i) * lado * 0.03, y, lado * 0.055, 1, Math.sin(t * 2 + i) * 0.7);
      }, t);
    },
    estrellas: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      for (var i = 0; i < 26; i++) {
        var brillo = Math.sin(t * (2 + azar(i) * 3) + i * 2);
        if (brillo <= 0) continue;
        icono(ctx, 'estrella', azar(i + 120) * W, azar(i + 170) * H * 0.8, lado * 0.035 * brillo, brillo);
      }
    },
    humo: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      for (var i = 0; i < 16; i++) {
        var k = ((t * 0.12 + azar(i + 210)) % 1);
        ctx.fillStyle = 'rgba(120,120,125,' + (0.26 * (1 - k)) + ')';
        ctx.beginPath();
        ctx.arc(azar(i + 240) * W + Math.sin(t + i) * lado * 0.04, H * (0.92 - k * 0.85), lado * (0.05 + k * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
    },
    chispas: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      caen(36, 0.3, 131, W, H, function (i, x, y) {
        ctx.fillStyle = i % 2 ? '#ff9f1c' : '#ffd23f';
        ctx.fillRect(x + Math.sin(t * 5 + i) * lado * 0.015, H - y, lado * 0.006, lado * 0.006);
      }, t);
    },
    viento: function (ctx, W, H, t) {
      var lado = Math.min(W, H);
      ctx.strokeStyle = 'rgba(90,110,130,0.35)';
      ctx.lineWidth = Math.max(1, lado * 0.003);
      ctx.lineCap = 'round';
      for (var i = 0; i < 12; i++) {
        var k = ((t * (0.5 + azar(i) * 0.4) + azar(i + 300)) % 1);
        var x = k * W * 1.4 - W * 0.2, y = azar(i + 330) * H * 0.75, largo = lado * (0.08 + azar(i + 360) * 0.14);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + largo * 0.6, y + lado * 0.008, x + largo, y - lado * 0.012); ctx.stroke();
      }
    },
    rayos: function (ctx, W, H, t) {
      var ciclo = t % 2.6;
      if (ciclo < 0.22) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - ciclo / 0.22)) + ')';
        ctx.fillRect(0, 0, W, H);
        var n = Math.floor(t / 2.6), x = azar(n + 400) * W, y = 0, lado = Math.min(W, H);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = Math.max(2, lado * 0.008);
        ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(x, y);
        for (var i = 0; i < 6; i++) { x += (azar(n + i + 430) - 0.5) * lado * 0.14; y += H * 0.1; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    },
    explosion: function (ctx, W, H, t) {
      var tras = t - INICIO_EXPLOSION;
      if (tras < 0) return;
      if (tras < 0.3) { ctx.fillStyle = 'rgba(255,240,180,' + (0.85 * (1 - tras / 0.3)) + ')'; ctx.fillRect(0, 0, W, H); }
      dibujarEstallido(ctx, W * 0.5, H * 0.4, Math.min(W, H) * 0.5, tras);
    }
  };
  var INICIO_EXPLOSION = 0.5;

  function sacudidaEfecto(efecto, t) {
    if (efecto !== 'explosion') return 0;
    var tras = t - INICIO_EXPLOSION;
    return tras > 0 && tras < 0.8 ? 1 - tras / 0.8 : 0;
  }

  /* ---------------- Cámara ----------------
     Se acerca tomando como centro el suelo: los pies no se despegan de su línea. */

  function camara(escena, t) {
    var dur = escena.duracion || 10, x = limitar(t / dur, 0, 1);
    var c = { z: 1 + 0.035 * x, dx: 0, dy: 0, giro: 0, sacude: 0 };
    switch (escena.camara) {
      case 'acercar': c.z = 1 + 0.22 * suaveAmbos(x); break;
      case 'alejar': c.z = 1.22 - 0.2 * suaveAmbos(x); break;
      case 'impacto':
        var d = limitar((t - 0.25) / 0.16, 0, 1);
        c.z = 1 + 0.26 * suaveSalida(d) + 0.03 * x;
        c.sacude = t > 0.25 && t < 0.75 ? 0.6 * (1 - (t - 0.25) / 0.5) : 0;
        break;
      case 'sacudir': c.z = 1.04; c.sacude = 0.45 + Math.sin(t * 1.7) * 0.25; break;
      case 'paneo': c.z = 1.12; c.dx = mezclar(-0.05, 0.05, suaveAmbos(x)); break;
      case 'balanceo': c.z = 1.06; c.giro = Math.sin(t * 1.1) * 1.2 * RAD; c.dx = Math.sin(t * 0.7) * 0.008; c.dy = Math.cos(t * 0.9) * 0.005; break;
    }
    c.sacude = Math.max(c.sacude, sacudidaEfecto(escena.efecto, t));
    return c;
  }

  /* ---------------- Transiciones ----------------
     f: 0 = pantalla tapada, 1 = destapada. */

  function dibujarTransicion(ctx, tipo, f, W, H) {
    f = limitar(f, 0, 1);
    if (f >= 1) return;
    var diag = Math.sqrt(W * W + H * H) / 2;
    ctx.save();
    ctx.fillStyle = TINTA;
    if (tipo === 'barrido') {
      var borde = f * (W + H * 0.3);
      ctx.beginPath(); ctx.moveTo(borde, 0); ctx.lineTo(W + H, 0); ctx.lineTo(W + H, H); ctx.lineTo(borde - H * 0.3, H); ctx.closePath(); ctx.fill();
    } else if (tipo === 'persianas') {
      var N = 8, alto = H / N;
      for (var i = 0; i < N; i++) ctx.fillRect(0, i * alto, W, alto * (1 - f));
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      var r = suaveAmbos(f) * diag * (tipo === 'estrella' ? 2.1 : 1.05);
      if (tipo === 'estrella') {
        for (var j = 0; j < 10; j++) {
          var rr = j % 2 ? r * 0.45 : r, a = (j * 36 - 90) * RAD;
          ctx[j ? 'lineTo' : 'moveTo'](W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr);
        }
        ctx.closePath();
      } else {
        ctx.moveTo(W / 2 + r, H / 2);
        ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      }
      ctx.fill('evenodd');
    }
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

  function degradado(ctx, W, H, arriba, abajo) {
    var g = ctx.createLinearGradient(0, 0, 0, H * SUELO);
    g.addColorStop(0, arriba);
    g.addColorStop(1, abajo);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Línea ondulada de lomas, rellena hasta el suelo.
  function lomas(ctx, W, H, altura, amplitud, frecuencia, fase, color) {
    var y0 = H * (SUELO - altura);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var i = 0; i <= 40; i++) {
      var x = i / 40;
      ctx.lineTo(x * W, y0 + Math.sin(x * frecuencia + fase) * amplitud * H);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function nubeFondo(ctx, x, y, s, alfa) {
    ctx.fillStyle = 'rgba(255,255,255,' + alfa + ')';
    ctx.beginPath();
    ctx.arc(x - s * 0.32, y + s * 0.03, s * 0.24, 0, Math.PI * 2);
    ctx.arc(x, y - s * 0.07, s * 0.32, 0, Math.PI * 2);
    ctx.arc(x + s * 0.34, y + s * 0.03, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function nubesQueAndan(ctx, W, H, t, n, alfa) {
    var lado = Math.min(W, H);
    for (var i = 0; i < n; i++) {
      var x = ((azar(i + 600) + t * 0.008 * (1 + i * 0.3)) % 1.3 - 0.15) * W;
      nubeFondo(ctx, x, H * (0.1 + azar(i + 620) * 0.2), lado * (0.16 + azar(i + 640) * 0.1), alfa);
    }
  }

  function estrellasFondo(ctx, W, H, t, n) {
    for (var i = 0; i < n; i++) {
      var brillo = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.6 + azar(i) * 1.2) + i));
      var tam = Math.max(1.5, Math.min(W, H) * (0.002 + azar(i + 40) * 0.002));
      ctx.fillStyle = 'rgba(255,255,255,' + brillo + ')';
      ctx.fillRect(azar(i + 80) * W, azar(i + 120) * H * SUELO * 0.95, tam, tam);
    }
  }

  // Todo en colores apagados: lo importante son los muñequitos y los objetos.
  var ESCENARIOS = {
    cielo: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#cfe9f8', '#eef8fc');
      nubesQueAndan(ctx, W, H, t, 3, 0.75);
      return { suelo: 'rgba(0,0,0,0.035)' };
    },
    noche: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#161a35', '#2a2f58');
      estrellasFondo(ctx, W, H, t, 50);
      return { suelo: '#2c3160', linea: '#8b90c0', oscuro: true };
    },
    espacio: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#07071a', '#191436');
      var lado = Math.min(W, H);
      var neb = ctx.createRadialGradient(W * 0.72, H * 0.28, 0, W * 0.72, H * 0.28, lado * 0.55);
      neb.addColorStop(0, 'rgba(123,44,191,0.32)');
      neb.addColorStop(1, 'rgba(123,44,191,0)');
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, W, H);
      estrellasFondo(ctx, W, H, t, 80);
      // La Tierra a lo lejos y un suelo de luna con cráteres.
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(W * 0.1, H * 0.2);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      OBJETOS.tierra(ctx, lado * 0.17);
      ctx.restore();
      ctx.fillStyle = '#8f8f9c';
      ctx.fillRect(0, H * SUELO, W, H * (1 - SUELO));
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (var i = 0; i < 7; i++) {
        ctx.beginPath(); ctx.ellipse(azar(i + 700) * W, H * (SUELO + 0.03 + azar(i + 720) * 0.12), lado * (0.02 + azar(i + 740) * 0.03), lado * 0.008, 0, 0, Math.PI * 2); ctx.fill();
      }
      return { suelo: null, linea: '#c9c9d2', oscuro: true };
    },
    ciudad: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#d7e6f2', '#f3f1e8');
      nubesQueAndan(ctx, W, H, t, 2, 0.8);
      [[0.42, 0, '#c6cfd9'], [0.26, 13, '#a9b5c2']].forEach(function (capa, c) {
        var n = 11 + c * 2, ancho = W / n;
        for (var i = 0; i < n; i++) {
          var alto = H * capa[0] * (0.45 + azar(i + capa[1] + 800) * 0.55), x = i * ancho, tope = H * SUELO - alto;
          ctx.fillStyle = capa[2];
          ctx.fillRect(x, tope, ancho * 0.94, alto);
          if (!c) continue;
          ctx.fillStyle = 'rgba(255,240,170,0.7)';
          var pasoV = Math.max(8, H * 0.03);
          for (var fila = 1; fila * pasoV < alto - pasoV; fila++) {
            for (var col = 0; col < 3; col++) {
              if (azar(i * 7 + fila * 13 + col + 820) > 0.55) ctx.fillRect(x + ancho * (0.14 + col * 0.26), tope + fila * pasoV, ancho * 0.13, pasoV * 0.45);
            }
          }
        }
      });
      return { suelo: '#b9bcc2' };
    },
    bosque: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#d3ecdc', '#f1f7e6');
      lomas(ctx, W, H, 0.24, 0.03, 5, 1, '#bcdcb6');
      for (var c = 0; c < 2; c++) {
        var n = 9 + c * 3, tono = c ? '#6fa877' : '#9cc99f', base = H * SUELO, lado = Math.min(W, H);
        for (var i = 0; i < n; i++) {
          var x = (i + azar(i + c * 20 + 840) * 0.7) / n * W, alto = lado * (c ? 0.34 : 0.27) * (0.75 + azar(i + 860) * 0.45), ancho = alto * 0.34;
          var m = Math.sin(t * 0.8 + i) * alto * 0.012;
          ctx.fillStyle = tono;
          [0, 0.28, 0.54].forEach(function (k) {
            ctx.beginPath();
            ctx.moveTo(x - ancho * (1 - k * 0.7), base - alto * (0.12 + k * 0.72));
            ctx.lineTo(x + m, base - alto * (0.62 + k * 0.72));
            ctx.lineTo(x + ancho * (1 - k * 0.7), base - alto * (0.12 + k * 0.72));
            ctx.closePath(); ctx.fill();
          });
          ctx.fillRect(x - alto * 0.025, base - alto * 0.14, alto * 0.05, alto * 0.14);
        }
      }
      return { suelo: '#b6d6a0' };
    },
    playa: function (ctx, W, H, t, sinSol) {
      degradado(ctx, W, H, '#bfe6f7', '#f4f4dc');
      var lado = Math.min(W, H);
      ctx.fillStyle = '#ffe89a';
      if (!sinSol) { ctx.beginPath(); ctx.arc(W * 0.85, H * 0.17, lado * 0.09, 0, Math.PI * 2); ctx.fill(); }
      nubesQueAndan(ctx, W, H, t, 2, 0.85);
      var horizonte = H * 0.56;
      ctx.fillStyle = '#6fc3e0';
      ctx.fillRect(0, horizonte, W, H * SUELO - horizonte);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.max(1, lado * 0.003);
      for (var i = 0; i < 4; i++) {
        var y = horizonte + (H * SUELO - horizonte) * (0.18 + i * 0.22);
        ctx.beginPath();
        for (var j = 0; j <= 30; j++) {
          var x = j / 30 * W;
          ctx[j ? 'lineTo' : 'moveTo'](x, y + Math.sin(j * 0.9 + t * 1.5 + i * 2) * H * 0.006);
        }
        ctx.stroke();
      }
      return { suelo: '#f3dfa8', linea: 'rgba(120,95,50,0.65)' };
    },
    desierto: function (ctx, W, H, t, sinSol) {
      degradado(ctx, W, H, '#fcdba7', '#fff3d8');
      var lado = Math.min(W, H);
      ctx.fillStyle = '#ffd166';
      if (!sinSol) { ctx.beginPath(); ctx.arc(W * 0.2, H * 0.2, lado * 0.1, 0, Math.PI * 2); ctx.fill(); }
      lomas(ctx, W, H, 0.17, 0.05, 4, 0.5, '#efc98d');
      lomas(ctx, W, H, 0.07, 0.035, 6, 3, '#e6b872');
      return { suelo: '#eec583', linea: 'rgba(120,85,40,0.65)' };
    },
    mar: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#5bbfdc', '#17688f');
      // Rayos de luz que entran desde arriba.
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (var i = 0; i < 5; i++) {
        var x = (i + 0.3) / 5 * W + Math.sin(t * 0.5 + i) * W * 0.02;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + W * 0.06, 0); ctx.lineTo(x + W * 0.02, H * SUELO); ctx.lineTo(x - W * 0.09, H * SUELO); ctx.closePath(); ctx.fill();
      }
      // Algas.
      ctx.strokeStyle = '#2f8f62';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.012);
      for (var a = 0; a < 9; a++) {
        var ax = azar(a + 900) * W, alto = H * (0.1 + azar(a + 920) * 0.14);
        ctx.beginPath();
        for (var k = 0; k <= 10; k++) {
          var q = k / 10;
          ctx[k ? 'lineTo' : 'moveTo'](ax + Math.sin(q * 5 + t * 1.5 + a) * H * 0.012 * q, H * SUELO - alto * q);
        }
        ctx.stroke();
      }
      return { suelo: '#d9c58d', linea: 'rgba(90,75,40,0.65)' };
    },
    nieve: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#cde0ee', '#f4f8fb');
      nubesQueAndan(ctx, W, H, t, 2, 0.7);
      lomas(ctx, W, H, 0.26, 0.05, 5, 2, '#dfe9f0');
      lomas(ctx, W, H, 0.1, 0.03, 8, 1, '#f1f6f9');
      return { suelo: '#ffffff', linea: 'rgba(90,120,150,0.75)' };
    },
    atardecer: function (ctx, W, H, t, sinSol) {
      degradado(ctx, W, H, '#ff9e7a', '#ffe2a8');
      var lado = Math.min(W, H);
      ctx.fillStyle = '#ffd166';
      if (!sinSol) { ctx.beginPath(); ctx.arc(W * 0.5, H * 0.56, lado * 0.15, 0, Math.PI * 2); ctx.fill(); }
      lomas(ctx, W, H, 0.17, 0.04, 5, 0, '#c8765f');
      lomas(ctx, W, H, 0.08, 0.03, 7, 2, '#a65e50');
      return { suelo: '#8f5146', linea: '#5d332c' };
    },
    laboratorio: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#e4f1f2', '#f3f8f7');
      var lado = Math.min(W, H), y = H * 0.3;
      ctx.fillStyle = '#c3d3d6';
      ctx.fillRect(0, y, W, lado * 0.014);
      ctx.fillRect(0, y + H * 0.22, W, lado * 0.014);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(29,29,31,0.55)';
      ctx.lineWidth = Math.max(1, lado * 0.002);
      for (var i = 0; i < 7; i++) {
        ctx.save();
        ctx.translate((i + 0.5) / 7 * W, y - lado * 0.05);
        OBJETOS[i % 2 ? 'matraz' : 'atomo'](ctx, lado * 0.09, t);
        ctx.restore();
        ctx.save();
        ctx.translate((i + 1) / 7 * W, y + H * 0.22 - lado * 0.05);
        OBJETOS[i % 3 ? 'matraz' : 'engranaje'](ctx, lado * 0.08, t + i);
        ctx.restore();
      }
      ctx.restore();
      return { suelo: '#c9d3d4' };
    },
    aula: function (ctx, W, H) {
      degradado(ctx, W, H, '#f6ecd4', '#faf4e4');
      var lado = Math.min(W, H);
      var bw = W * 0.74, bh = H * 0.42, bx = (W - bw) / 2, by = H * 0.13;
      ctx.fillStyle = '#a0692f';
      ctx.fillRect(bx - lado * 0.012, by - lado * 0.012, bw + lado * 0.024, bh + lado * 0.024);
      ctx.fillStyle = '#3f6b57';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = Math.max(1, lado * 0.003);
      for (var i = 0; i < 3; i++) {
        var y = by + bh * (0.25 + i * 0.22);
        ctx.beginPath(); ctx.moveTo(bx + bw * 0.08, y); ctx.lineTo(bx + bw * (0.4 + azar(i + 960) * 0.45), y); ctx.stroke();
      }
      return { suelo: '#d5bd93' };
    },
    casa: function (ctx, W, H, t) {
      degradado(ctx, W, H, '#f5e3d0', '#fbf0e0');
      var lado = Math.min(W, H);
      // Ventana con cielo y un cuadro.
      var vw = lado * 0.42, vh = lado * 0.32, vx = W * 0.5 - vw / 2, vy = H * 0.14;
      ctx.fillStyle = '#c7e7f7';
      ctx.fillRect(vx, vy, vw, vh);
      ctx.save();
      ctx.beginPath(); ctx.rect(vx, vy, vw, vh); ctx.clip();
      nubeFondo(ctx, vx + ((t * 0.02) % 1.2) * vw, vy + vh * 0.35, lado * 0.1, 0.95);
      ctx.restore();
      ctx.strokeStyle = '#a0692f';
      ctx.lineWidth = Math.max(2, lado * 0.009);
      ctx.strokeRect(vx, vy, vw, vh);
      ctx.beginPath(); ctx.moveTo(vx + vw / 2, vy); ctx.lineTo(vx + vw / 2, vy + vh); ctx.moveTo(vx, vy + vh / 2); ctx.lineTo(vx + vw, vy + vh / 2); ctx.stroke();
      ctx.fillStyle = '#e9c46a';
      ctx.fillRect(W * 0.09, H * 0.2, lado * 0.16, lado * 0.2);
      ctx.strokeRect(W * 0.09, H * 0.2, lado * 0.16, lado * 0.2);
      // Lámpara de pie al otro lado.
      ctx.fillStyle = '#f4d6a0';
      ctx.beginPath(); ctx.moveTo(W * 0.86, H * 0.38); ctx.lineTo(W * 0.86 + lado * 0.1, H * 0.38); ctx.lineTo(W * 0.86 + lado * 0.07, H * 0.28); ctx.lineTo(W * 0.86 + lado * 0.03, H * 0.28); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a0692f';
      ctx.fillRect(W * 0.86 + lado * 0.045, H * 0.38, lado * 0.01, H * SUELO - H * 0.38);
      return { suelo: '#c99c6f' };
    }
  };

  // Devuelve si el fondo es oscuro (para ponerle un contorno a los muñequitos).
  // sinSol: la escena ya trae un sol como objeto, y dos soles se verían raros.
  function dibujarFondo(ctx, W, H, fondo, t, sinSol) {
    if (fondo === 'ninguno') return false;   // quien llama pinta su propio fondo (miniaturas)
    var colores = { papel: PAPEL, pizarra: '#f4f4f4' };
    var escenario = ESCENARIOS[fondo], r = {};
    ctx.save();
    if (escenario) r = escenario(ctx, W, H, t || 0, sinSol) || {};
    else { ctx.fillStyle = colores[fondo] || PAPEL; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    // Suelo
    if (r.suelo !== null) {
      ctx.fillStyle = r.suelo || 'rgba(0,0,0,0.035)';
      ctx.fillRect(0, H * SUELO, W, H * (1 - SUELO));
    }
    ctx.strokeStyle = r.linea || TINTA;
    ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
    ctx.beginPath(); ctx.moveTo(0, H * SUELO); ctx.lineTo(W, H * SUELO); ctx.stroke();
    return !!r.oscuro;
  }

  /* ---------------- Escena completa ---------------- */

  // Dibuja la escena en el segundo t sobre un canvas de W × H píxeles.
  function dibujarEscena(ctx, escena, t, W, H) {
    var dur = escena.duracion || 10;
    var cam = camara(escena, t), lado = Math.min(W, H);
    // Temblor de cámara: varias ondas mezcladas para que no parezca regular.
    var temX = cam.sacude * (Math.sin(t * 47) + Math.sin(t * 71) * 0.6) * lado * 0.012;
    var temY = cam.sacude * (Math.cos(t * 53) + Math.sin(t * 83) * 0.6) * lado * 0.012;

    ctx.save();
    if (cam.sacude) {
      // El fondo también tiembla: se agranda un poco para que no se vean sus bordes.
      ctx.translate(W / 2 + temX, H / 2 + temY);
      ctx.scale(1.04, 1.04);
      ctx.translate(-W / 2, -H / 2);
    }
    var traeSol = (escena.objetos || []).some(function (ob) { return ob.tipo === 'sol'; });
    var oscuro = dibujarFondo(ctx, W, H, escena.fondo, t, traeSol);
    ctx.restore();

    var pivoteY = H * SUELO;
    var movX = cam.dx * W + temX, movY = cam.dy * H + temY;
    ctx.save();
    ctx.translate(W / 2 + movX, pivoteY + movY);
    if (cam.giro) ctx.rotate(cam.giro);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-W / 2, -pivoteY);

    (escena.objetos || []).forEach(function (ob) { if (!ob.adelante) dibujarObjeto(ctx, ob, W, H, t); });
    var cabezas = [];
    (escena.personajes || []).forEach(function (per, i) {
      if (t < (per.desde || 0)) return;
      var est = estadoPersonaje(per, t);
      var c = dibujarPersonaje(ctx, est, per, W, H, t, i, oscuro);
      if (est.dice && t >= est.diceDesde && t <= est.diceHasta) cabezas.push({ c: c, texto: est.dice, f: (t - est.diceDesde) / 0.35 });
    });
    (escena.objetos || []).forEach(function (ob) { if (ob.adelante) dibujarObjeto(ctx, ob, W, H, t); });
    ctx.restore();

    if (escena.efecto && EFECTOS[escena.efecto]) {
      ctx.save();
      EFECTOS[escena.efecto](ctx, W, H, t);
      ctx.restore();
    }
    // Bocadillos y textos van sin zoom: así nunca se salen de la pantalla.
    var ocupados = [];
    cabezas.forEach(function (b) {
      var x = W / 2 + movX + (b.c.cabezaX - W / 2) * cam.z;
      var y = pivoteY + movY + (b.c.cabezaY - pivoteY) * cam.z;
      dibujarBocadillo(ctx, b.texto, x, y, b.c.h, W, b.f, ocupados);
    });
    (escena.textos || []).forEach(function (tx) { dibujarTexto(ctx, tx, W, H, t); });

    if (escena.transEntra) dibujarTransicion(ctx, escena.transEntra, t / 0.35, W, H);
    if (escena.transSale) dibujarTransicion(ctx, escena.transSale, (dur - t) / 0.25, W, H);
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
    EXPRESIONES: ['normal', 'feliz', 'sorpresa', 'triste', 'enojado', 'arriba', 'cerrados', 'llorando', 'guino', 'mareado', 'enamorado', 'estrellas', 'dinero'],
    ACCESORIOS: ['lentes', 'gorra', 'sombrero', 'corbata', 'corona', 'moño', 'bigote', 'audifonos', 'cabello',
      'gafasSol', 'parche', 'casco', 'astronauta', 'mago', 'fiesta', 'vaquero', 'chef', 'birrete', 'pirata', 'orejas', 'aureola', 'cuernos', 'barba', 'bufanda', 'capa', 'mochila'],
    SOMBREROS: SOMBREROS,
    FONDOS: ['papel', 'cielo', 'noche', 'pizarra', 'ciudad', 'bosque', 'playa', 'desierto', 'espacio', 'mar', 'nieve', 'atardecer', 'laboratorio', 'aula', 'casa'],
    EFECTOS: Object.keys(EFECTOS),
    CAMARAS: ['normal', 'acercar', 'alejar', 'impacto', 'sacudir', 'paneo', 'balanceo'],
    TRANSICIONES: ['iris', 'barrido', 'estrella', 'persianas'],
    MOVILES: Object.keys(SE_MUEVEN)
  };
})();
