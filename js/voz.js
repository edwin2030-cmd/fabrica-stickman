/* ==========================================================
   La voz: Gemini narra cada escena y su audio fija cuánto dura.
   Los audios se guardan en el navegador (IndexedDB), así que
   recargar la página o cambiar la dirección no gasta cupo:
   solo se vuelve a pedir la voz si cambia la narración o el locutor.
   ========================================================== */

var Voz = (function () {
  'use strict';

  var LOCUTORES = [
    { id: 'Puck', nombre: 'Puck — alegre' },
    { id: 'Kore', nombre: 'Kore — firme' },
    { id: 'Zephyr', nombre: 'Zephyr — luminosa' },
    { id: 'Fenrir', nombre: 'Fenrir — emocionado' },
    { id: 'Aoede', nombre: 'Aoede — tranquila' },
    { id: 'Charon', nombre: 'Charon — informativo' }
  ];
  var PAUSA = 0.35;          // silencio después de cada frase
  var DURACION_MINIMA = 2;   // para que ninguna escena pase volando
  var REINTENTOS_CUPO = 4;   // si Gemini pide esperar (límite por minuto)
  var ESPERA_CUPO = 25;      // segundos entre esos reintentos

  /* ---------------- Guardado en el navegador ---------------- */

  var base = null;
  function abrir() {
    if (base) return base;
    base = new Promise(function (ok, mal) {
      // Algunos navegadores (modo privado) nunca responden: sin guardado, pero sin colgarse.
      setTimeout(function () { mal(new Error('IndexedDB no responde')); }, 3000);
      var p = indexedDB.open('fabricaStickman', 1);
      p.onupgradeneeded = function () { p.result.createObjectStore('voces'); };
      p.onsuccess = function () { ok(p.result); };
      p.onerror = function () { mal(p.error); };
    });
    return base;
  }

  function guardar(clave, clip) {
    return abrir().then(function (db) {
      return new Promise(function (ok) {
        var tx = db.transaction('voces', 'readwrite');
        tx.objectStore('voces').put({ pcm: clip.pcm.buffer, frecuencia: clip.frecuencia }, clave);
        tx.oncomplete = ok;
        tx.onerror = ok;   // si no se puede guardar, igual seguimos
      });
    }).catch(function () {});
  }

  function leer(clave) {
    return abrir().then(function (db) {
      return new Promise(function (ok) {
        var p = db.transaction('voces').objectStore('voces').get(clave);
        p.onsuccess = function () { ok(p.result ? { pcm: new Int16Array(p.result.pcm), frecuencia: p.result.frecuencia } : null); };
        p.onerror = function () { ok(null); };
      });
    }).catch(function () { return null; });
  }

  /* ---------------- Pedir la voz ---------------- */

  function clave(texto, locutor) { return locutor + '|' + texto; }

  function decodificar(base64) {
    var bin = atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  }

  function esperar(seg, alEsperar) {
    return new Promise(function (ok) {
      var queda = seg;
      (function tic() {
        if (alEsperar) alEsperar(queda);
        if (queda <= 0) return ok();
        queda--;
        setTimeout(tic, 1000);
      })();
    });
  }

  function pedir(texto, locutor, alEsperar, intento) {
    intento = intento || 0;
    return IA.pedirVoz(texto, locutor).then(function (d) {
      return { pcm: decodificar(d.audio), frecuencia: d.frecuencia || 24000 };
    }, function (e) {
      var cupo = e.estado === 429, ocupado = e.estado === 503 || e.estado === 500 || e.estado === 524;
      if ((cupo || ocupado) && intento < REINTENTOS_CUPO) {
        return esperar(cupo ? ESPERA_CUPO : 5, alEsperar).then(function () {
          return pedir(texto, locutor, alEsperar, intento + 1);
        });
      }
      if (cupo) e.message = 'Se acabó por ahora el cupo gratuito de voz de Gemini. Las escenas ya narradas quedan guardadas: vuelve a pulsar 🎙 más tarde para seguir.';
      throw e;
    });
  }

  // Devuelve el clip de una frase: del guardado si ya existe, si no lo pide a Gemini.
  function obtener(texto, locutor, alEsperar) {
    var k = clave(texto, locutor);
    return leer(k).then(function (clip) {
      if (clip) return clip;
      return pedir(texto, locutor, alEsperar).then(function (nuevo) {
        return guardar(k, nuevo).then(function () { return nuevo; });
      });
    });
  }

  function duracionDe(clip) {
    return Math.max(DURACION_MINIMA, Math.round((clip.pcm.length / clip.frecuencia + PAUSA) * 100) / 100);
  }

  /* ---------------- Reproducir ---------------- */

  var contexto = null, fuente = null, arranque = 0, desdeSeg = 0;

  function ctx() {
    if (!contexto) contexto = new (window.AudioContext || window.webkitAudioContext)();
    return contexto;
  }

  // Une los clips en una sola pista: cada uno empieza donde empieza su escena.
  // clips[i] puede ser null (escena sin voz: queda en silencio).
  function unir(clips, inicios, total) {
    var frecuencia = 24000;
    clips.forEach(function (c) { if (c) frecuencia = c.frecuencia; });
    var pista = ctx().createBuffer(1, Math.ceil((total + 1) * frecuencia), frecuencia);
    var canal = pista.getChannelData(0);
    clips.forEach(function (c, i) {
      if (!c) return;
      var desde = Math.round(inicios[i] * frecuencia);
      for (var j = 0; j < c.pcm.length && desde + j < canal.length; j++) canal[desde + j] = c.pcm[j] / 32768;
    });
    return pista;
  }

  function detener() {
    if (fuente) { try { fuente.stop(); } catch (e) { /* ya parado */ } fuente.disconnect(); fuente = null; }
  }

  function reproducir(pista, seg) {
    detener();
    var c = ctx();
    if (c.state === 'suspended') c.resume();
    if (seg >= pista.duration) return;
    fuente = c.createBufferSource();
    fuente.buffer = pista;
    fuente.connect(c.destination);
    fuente.start(0, Math.max(0, seg));
    arranque = c.currentTime;
    desdeSeg = seg;
  }

  // Segundo del video según el reloj del audio (más preciso que contar fotogramas).
  function tiempo() { return fuente ? desdeSeg + (contexto.currentTime - arranque) : null; }

  return {
    LOCUTORES: LOCUTORES,
    clave: clave,
    leer: leer,
    obtener: obtener,
    duracionDe: duracionDe,
    unir: unir,
    reproducir: reproducir,
    detener: detener,
    tiempo: tiempo
  };
})();
