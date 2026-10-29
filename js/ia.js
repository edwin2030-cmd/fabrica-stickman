/* ==========================================================
   Conexión con Gemini a través del intermediario de Cloudflare
   (su código está en worker/). Aquí NO hay ninguna clave:
   vive como secreto en Cloudflare. Solo funciona desde la página
   publicada en GitHub Pages (el intermediario rechaza otros orígenes).
   ========================================================== */

var IA = (function () {
  'use strict';

  var URL_INTERMEDIARIO = 'https://fabrica-stickman.pedro76porro.workers.dev/';
  var TIEMPO_MAXIMO = 120000; // 2 minutos (el intermediario ya cambia de modelo si uno se cuelga)

  function mensajeDeError(estado, texto) {
    texto = texto || '';
    if (estado === 503 || /demand|overloaded|unavailable/i.test(texto)) {
      return 'Gemini está muy ocupado ahora mismo. Intenta de nuevo en unos minutos.';
    }
    if (estado === 429 || /quota|rate/i.test(texto)) {
      return 'Se alcanzó el límite gratuito de Gemini. Vuelve a intentarlo más tarde o mañana.';
    }
    if (estado === 524 || estado === 504) {
      return 'Gemini tardó demasiado en responder. Intenta de nuevo.';
    }
    return 'No se pudo generar el texto: ' + (texto || 'error desconocido') + '.';
  }

  // Envía un pedido al intermediario. Si falla, el error lleva .estado (código HTTP).
  function llamar(cuerpo) {
    if (location.protocol === 'file:') {
      return Promise.reject(new Error('La IA solo funciona desde tu página publicada en GitHub Pages, no abriendo el archivo en tu computadora.'));
    }
    var control = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var temporizador = control ? setTimeout(function () { control.abort(); }, TIEMPO_MAXIMO) : null;

    function fallo(estado, texto) {
      var e = new Error(mensajeDeError(estado, texto));
      e.estado = estado;
      return e;
    }

    return fetch(URL_INTERMEDIARIO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: control ? control.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (datos) {
        if (!r.ok || datos.error) throw fallo(r.status, datos.error);
        return datos;
      });
    }, function (e) {
      if (e && e.name === 'AbortError') throw fallo(524);
      throw new Error('No se pudo conectar con el intermediario. Revisa tu conexión a internet.');
    }).finally(function () {
      if (temporizador) clearTimeout(temporizador);
    });
  }

  // Pide a Gemini una respuesta en JSON y la devuelve ya convertida en objeto.
  function pedirJSON(prompt) {
    return llamar({ prompt: prompt, json: true }).then(function (datos) {
      if (!datos.texto || !datos.texto.trim()) throw new Error('Gemini respondió vacío. Intenta de nuevo.');
      return leerJSON(datos.texto);
    });
  }

  // Pide la narración en audio: { audio (PCM 16 bits en base64), frecuencia }.
  function pedirVoz(texto, locutor) {
    return llamar({ voz: texto, locutor: locutor }).then(function (datos) {
      if (!datos.audio) throw new Error('Gemini no devolvió audio. Intenta de nuevo.');
      return datos;
    });
  }

  // Extrae el primer objeto JSON de la respuesta (Gemini a veces añade ```json).
  function leerJSON(texto) {
    var inicio = texto.indexOf('{');
    var fin = texto.lastIndexOf('}');
    if (inicio === -1 || fin <= inicio) throw new Error('Gemini no respondió en el formato esperado. Intenta de nuevo.');
    try {
      return JSON.parse(texto.slice(inicio, fin + 1));
    } catch (e) {
      throw new Error('Gemini no respondió en el formato esperado. Intenta de nuevo.');
    }
  }

  return { pedirJSON: pedirJSON, pedirVoz: pedirVoz, leerJSON: leerJSON };
})();
