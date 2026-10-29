/* ==========================================================
   Exportar: graba el video (animación + voz) en un archivo.
   Se dibuja en un lienzo aparte a alta resolución y se graba
   con MediaRecorder mientras suena la voz, así que tarda lo
   mismo que dura el video. Si el navegador lo permite sale en
   MP4; si no, en WebM (YouTube acepta los dos).
   ========================================================== */

var Exportar = (function () {
  'use strict';

  var FPS = 30;
  var COLA = 0.6;   // segundos de más al final para que no se corte la última palabra
  var FORMATOS = [
    { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' }
  ];

  function formatoDisponible() {
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
    return FORMATOS.filter(function (f) { return MediaRecorder.isTypeSupported(f.mime); })[0] || null;
  }

  /* ---------------- Subtítulos ---------------- */

  // Parte la narración en líneas que caben y las agrupa de dos en dos.
  function bloquesSubtitulo(ctx, texto, anchoMax) {
    var lineas = [], actual = '';
    texto.split(' ').forEach(function (p) {
      var prueba = actual ? actual + ' ' + p : p;
      if (actual && ctx.measureText(prueba).width > anchoMax) { lineas.push(actual); actual = p; } else actual = prueba;
    });
    if (actual) lineas.push(actual);
    var bloques = [];
    for (var i = 0; i < lineas.length; i += 2) bloques.push(lineas.slice(i, i + 2));
    return bloques;
  }

  function dibujarSubtitulo(ctx, escena, t, W, H) {
    var tam = Math.round(Math.min(W, H) * (W > H ? 0.045 : 0.055));
    ctx.save();
    ctx.font = '800 ' + tam + 'px system-ui, "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (!escena._bloques) escena._bloques = bloquesSubtitulo(ctx, escena.narracion, W * 0.86);
    var bloques = escena._bloques;
    // Cada bloque se muestra un tiempo proporcional a sus letras.
    var letras = bloques.map(function (b) { return b.join(' ').length; });
    var totalLetras = letras.reduce(function (a, b) { return a + b; }, 0) || 1;
    var habla = Math.max(0.5, escena.duracion - 0.35);
    var acumulado = 0, k = 0;
    for (; k < bloques.length - 1; k++) {
      acumulado += letras[k] / totalLetras * habla;
      if (t < acumulado) break;
    }
    var lineas = bloques[k] || [];
    // La última línea queda cerca del borde inferior, debajo de los pies de los personajes.
    var base = H * 0.935 - (lineas.length - 1) * tam * 1.2;
    lineas.forEach(function (l, j) {
      var y = base + j * tam * 1.2;
      ctx.lineWidth = tam * 0.22;
      ctx.strokeStyle = '#111';
      ctx.strokeText(l, W / 2, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(l, W / 2, y);
    });
    ctx.restore();
  }

  /* ---------------- Grabación ---------------- */

  // Reloj que sigue avisando aunque la pestaña quede en segundo plano
  // (los temporizadores normales se frenan a 1 por segundo).
  function crearReloj(alTic) {
    try {
      var url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},' + Math.round(1000 / FPS) + ')'], { type: 'text/javascript' }));
      var w = new Worker(url);
      w.onmessage = alTic;
      return function () { w.terminate(); URL.revokeObjectURL(url); };
    } catch (e) {
      var id = setInterval(alTic, 1000 / FPS);
      return function () { clearInterval(id); };
    }
  }

  // op: { escenas, inicios, total, pista, base: [ancho, alto], escala, subtitulos, alAvanzar(seg) }
  // Devuelve { promesa, cancelar }.
  function grabar(op) {
    var formato = formatoDisponible();
    var cancelado = false, detener = null;

    var promesa = new Promise(function (ok, mal) {
      if (!formato) return mal(new Error('Este navegador no puede grabar video. Usa Chrome o Edge en la computadora.'));

      var W = Math.round(op.base[0] * op.escala), H = Math.round(op.base[1] * op.escala);
      var lienzo = document.createElement('canvas');
      lienzo.width = W;
      lienzo.height = H;
      var ctx = lienzo.getContext('2d');
      op.escenas.forEach(function (e) { delete e._bloques; });

      var flujo = lienzo.captureStream(FPS);
      var audio = null, fuente = null;
      if (op.pista) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        var destino = audio.createMediaStreamDestination();
        fuente = audio.createBufferSource();
        fuente.buffer = op.pista;
        fuente.connect(destino);
        destino.stream.getAudioTracks().forEach(function (pista) { flujo.addTrack(pista); });
      }

      var partes = [];
      var grabadora = new MediaRecorder(flujo, {
        mimeType: formato.mime,
        videoBitsPerSecond: W * H >= 1920 * 1080 ? 10000000 : 6000000,
        audioBitsPerSecond: 160000
      });
      grabadora.ondataavailable = function (ev) { if (ev.data && ev.data.size) partes.push(ev.data); };

      var parar;
      function cerrar() {
        if (parar) parar();
        if (fuente) { try { fuente.stop(); } catch (e) { /* ya parado */ } }
        if (audio) audio.close();
        flujo.getTracks().forEach(function (p) { p.stop(); });
      }
      grabadora.onstop = function () {
        cerrar();
        if (cancelado) return mal(new Error('Exportación cancelada.'));
        ok({ archivo: new Blob(partes, { type: formato.mime.split(';')[0] }), extension: formato.ext });
      };
      grabadora.onerror = function (ev) {
        cerrar();
        mal(new Error('Falló la grabación: ' + ((ev.error && ev.error.message) || 'error desconocido')));
      };

      function indiceEn(seg) {
        for (var i = op.inicios.length - 1; i > 0; i--) if (seg >= op.inicios[i]) return i;
        return 0;
      }

      function cuadro(seg) {
        var s = Math.min(seg, op.total - 0.001);
        var i = indiceEn(s);
        var escena = op.escenas[i];
        var local = Math.min(s - op.inicios[i], escena.duracion);
        ctx.setTransform(op.escala, 0, 0, op.escala, 0, 0);
        Stickman.dibujarEscena(ctx, escena, local, op.base[0], op.base[1]);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (op.subtitulos) dibujarSubtitulo(ctx, escena, local, W, H);
      }

      cuadro(0);
      var reloj = audio || null;
      var arranque;
      function segundo() { return reloj ? reloj.currentTime - arranque : (performance.now() - arranque) / 1000; }

      function empezar() {
        grabadora.start(1000);
        arranque = reloj ? reloj.currentTime : performance.now();
        if (fuente) fuente.start(reloj.currentTime);
        parar = crearReloj(function () {
          var seg = segundo();
          cuadro(seg);
          if (op.alAvanzar) op.alAvanzar(Math.min(seg, op.total));
          if (seg >= op.total + COLA && grabadora.state === 'recording') grabadora.stop();
        });
      }

      detener = function () {
        cancelado = true;
        if (grabadora.state === 'recording') grabadora.stop(); else { cerrar(); mal(new Error('Exportación cancelada.')); }
      };

      if (audio && audio.state === 'suspended') audio.resume().then(empezar, empezar); else empezar();
    });

    return { promesa: promesa, cancelar: function () { if (detener) detener(); } };
  }

  return { formatoDisponible: formatoDisponible, grabar: grabar };
})();
