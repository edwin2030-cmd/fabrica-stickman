/* ==========================================================
   Música de fondo generada aquí mismo (sin archivos ni derechos
   de autor): acordes punteados, bajo y un poco de percusión.
   Se renderiza un trozo que se repite sin cortes y se mezcla
   con la voz, bajando de volumen cuando alguien habla.
   ========================================================== */

var Musica = (function () {
  'use strict';

  var FRECUENCIA = 24000;   // la misma que la voz de Gemini
  var NIVEL = 0.07;          // volumen medio (rms) cuando nadie habla
  var NIVEL_CON_VOZ = 0.025; // volumen debajo de la voz

  // Notas en semitonos desde La 440 (0 = La4).
  function hz(semitono) { return 440 * Math.pow(2, semitono / 12); }
  var C = -9, D = -7, E = -5, F = -4, G = -2, A = 0, B = 2;

  var ESTILOS = {
    alegre: {
      nombre: 'Alegre', tempo: 104, percusion: true, onda: 'triangle',
      acordes: [[C, E, G], [G - 12, B - 12, D], [A - 12, C, E], [F - 12, A - 12, C]],
      patron: [0, 1, 2, 1, 0, 2, 1, 2]
    },
    misteriosa: {
      nombre: 'Misteriosa', tempo: 88, percusion: false, onda: 'sine',
      acordes: [[A - 12, C, E], [F - 12, A - 12, C], [D - 12, F - 12, A - 12], [E - 12, G - 12 + 1, B - 12]],
      patron: [0, 2, 1, 2, 0, 2, 1, 2]
    },
    tranquila: {
      nombre: 'Tranquila', tempo: 76, percusion: false, onda: 'sine',
      acordes: [[F - 12, A - 12, C, E], [E - 12, G - 12, B - 12, D], [D - 12, F - 12, A - 12, C], [C - 12, E - 12, G - 12, B - 12]],
      patron: [0, 1, 2, 3, 2, 1, 2, 3]
    },
    aventura: {
      nombre: 'Aventura', tempo: 118, percusion: true, onda: 'triangle',
      acordes: [[D - 12, F - 12, A - 12], [B - 24, D - 12, F - 12], [G - 12, B - 12, D], [A - 12, C, E]],
      patron: [0, 0, 2, 0, 1, 0, 2, 1]
    },
    fiesta: {
      nombre: 'Fiesta', tempo: 128, percusion: true, onda: 'square',
      acordes: [[C, E, G], [A - 12, C, E], [F - 12, A - 12, C], [G - 12, B - 12, D]],
      patron: [0, 2, 1, 2, 0, 2, 1, 2]
    },
    suspenso: {
      nombre: 'Suspenso', tempo: 66, percusion: false, onda: 'sine',
      acordes: [[A - 24, C - 12, E - 12], [A - 24, D - 12, F - 12], [G - 24, B - 24, E - 12], [A - 24, C - 12, E - 12]],
      patron: [0, 2, 1, 2, 0, 1, 2, 1]
    }
  };

  function nota(ctx, salida, f, cuando, dur, vol, onda) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = onda;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, cuando);
    g.gain.exponentialRampToValueAtTime(vol, cuando + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, cuando + dur);
    o.connect(g);
    g.connect(salida);
    o.start(cuando);
    o.stop(cuando + dur + 0.02);
  }

  function golpe(ctx, salida, ruido, cuando, vol) {
    var s = ctx.createBufferSource(), filtro = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = ruido;
    filtro.type = 'highpass';
    filtro.frequency.value = 6000;
    g.gain.setValueAtTime(vol, cuando);
    g.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.05);
    s.connect(filtro);
    filtro.connect(g);
    g.connect(salida);
    s.start(cuando);
    s.stop(cuando + 0.06);
  }

  function bombo(ctx, salida, cuando) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, cuando);
    o.frequency.exponentialRampToValueAtTime(45, cuando + 0.12);
    g.gain.setValueAtTime(0.5, cuando);
    g.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.18);
    o.connect(g);
    g.connect(salida);
    o.start(cuando);
    o.stop(cuando + 0.2);
  }

  // Renderiza un trozo de 8 compases que se repite sin cortes. (Renderizar el
  // video entero de una vez es lentísimo: con 5 minutos tardaba varios minutos.)
  function bucle(e) {
    var pulso = 60 / e.tempo;          // un tiempo
    var compas = pulso * 4;
    var vuelta = compas * 8;
    var COLA = 1;                      // lo que suena después del final se suma al principio
    var largo = Math.ceil((vuelta + COLA) * FRECUENCIA);
    var ctx = new OfflineAudioContext(1, largo, FRECUENCIA);
    var maestro = ctx.createGain();
    maestro.connect(ctx.destination);

    var ruido = ctx.createBuffer(1, FRECUENCIA * 0.1, FRECUENCIA);
    var r = ruido.getChannelData(0);
    for (var i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;

    for (var c = 0; c < 8; c++) {
      var acorde = e.acordes[c % e.acordes.length];
      var t0 = c * compas;
      // Arpegio en corcheas.
      e.patron.forEach(function (k, j) {
        nota(ctx, maestro, hz(acorde[k % acorde.length] + 12), t0 + j * pulso / 2, pulso * 0.9, 0.18, e.onda);
      });
      // Bajo en los tiempos 1 y 3.
      [0, 2].forEach(function (b) {
        nota(ctx, maestro, hz(acorde[0] - 24), t0 + b * pulso, pulso * 1.8, 0.35, 'sine');
      });
      if (e.percusion) {
        for (var b = 0; b < 4; b++) {
          if (b % 2 === 0) bombo(ctx, maestro, t0 + b * pulso);
          golpe(ctx, maestro, ruido, t0 + b * pulso + pulso / 2, 0.12);
        }
      }
    }

    return ctx.startRendering().then(function (buf) {
      var n = Math.round(vuelta * FRECUENCIA);
      var d = buf.getChannelData(0);
      var trozo = new Float32Array(n);
      trozo.set(d.subarray(0, n));
      for (var j = n; j < d.length; j++) trozo[j - n] += d[j];
      // Se deja con volumen medio (rms) 1: así cada estilo suena igual de fuerte.
      var suma = 0;
      for (var k = 0; k < n; k++) suma += trozo[k] * trozo[k];
      var rms = Math.sqrt(suma / n) || 1;
      for (k = 0; k < n; k++) trozo[k] /= rms;
      return trozo;
    });
  }

  var bucles = {};

  // Devuelve una promesa con la música (AudioBuffer mono) de "segundos" de largo.
  function generar(estilo, segundos) {
    var e = ESTILOS[estilo];
    if (!e) return Promise.resolve(null);
    if (!bucles[estilo]) bucles[estilo] = bucle(e);
    return bucles[estilo].then(function (trozo) {
      var largo = Math.ceil(segundos * FRECUENCIA);
      var musica = new AudioBuffer({ length: largo, numberOfChannels: 1, sampleRate: FRECUENCIA });
      var d = musica.getChannelData(0);
      for (var i = 0; i < largo; i += trozo.length) d.set(trozo.subarray(0, Math.min(trozo.length, largo - i)), i);
      // Entrada y salida suaves.
      var entrada = Math.min(1.5, segundos / 3) * FRECUENCIA, salida = Math.min(2.5, segundos / 3) * FRECUENCIA;
      for (i = 0; i < entrada; i++) d[i] *= i / entrada;
      for (i = 0; i < salida; i++) d[largo - 1 - i] *= i / salida;
      return musica;
    });
  }

  // Los golpes que pasarían del máximo se redondean: a volumen alto, cortarlos de golpe suena roto.
  function sinRecorte(x) {
    var a = Math.abs(x), UMBRAL = 0.8;
    if (a <= UMBRAL) return x;
    var r = UMBRAL + (1 - UMBRAL) * Math.tanh((a - UMBRAL) / (1 - UMBRAL));
    return x < 0 ? -r : r;
  }

  // Mezcla voz y música en una pista nueva. La música baja cuando hay voz
  // (se mide la voz en bloques de ~40 ms y el volumen cambia con suavidad).
  // "volumen": 1 = normal, 0 = sin música, 2 = el doble.
  function mezclar(voz, musica, largoSeg, volumen) {
    if (typeof volumen !== 'number') volumen = 1;
    var largo = voz ? voz.length : Math.ceil(largoSeg * FRECUENCIA);
    var frecuencia = voz ? voz.sampleRate : FRECUENCIA;
    var salida = new AudioBuffer({ length: largo, numberOfChannels: 1, sampleRate: frecuencia });
    var out = salida.getChannelData(0);
    var v = voz ? voz.getChannelData(0) : null;
    var m = musica ? musica.getChannelData(0) : null;

    var BLOQUE = Math.round(frecuencia * 0.04);
    var nivel = NIVEL * volumen;
    for (var inicio = 0; inicio < largo; inicio += BLOQUE) {
      var fin = Math.min(largo, inicio + BLOQUE), hablando = false;
      if (v) for (var j = inicio; j < fin; j += 4) if (Math.abs(v[j]) > 0.02) { hablando = true; break; }
      var objetivo = (hablando ? NIVEL_CON_VOZ : NIVEL) * volumen;
      // Baja rápido cuando empieza la voz y sube despacio cuando termina.
      var siguiente = nivel + (objetivo - nivel) * (objetivo < nivel ? 0.5 : 0.08);
      for (var k = inicio; k < fin; k++) {
        var g = nivel + (siguiente - nivel) * (k - inicio) / (fin - inicio);
        var muestra = (v ? v[k] : 0) + (m && k < m.length ? m[k] * g : 0);
        out[k] = sinRecorte(muestra);
      }
      nivel = siguiente;
    }
    return salida;
  }

  var LISTA = [{ id: 'ninguna', nombre: 'Sin música' }].concat(Object.keys(ESTILOS).map(function (k) {
    return { id: k, nombre: ESTILOS[k].nombre };
  }));

  return { LISTA: LISTA, generar: generar, mezclar: mezclar };
})();
