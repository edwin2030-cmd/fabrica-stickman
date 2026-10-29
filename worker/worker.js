/* ==========================================================
   Intermediario de la Fábrica Stickman (Cloudflare Worker).
   Recibe desde la página publicada:
     { prompt, json }  → devuelve { texto, modelo }
     { voz, locutor }  → devuelve { audio (PCM base64), frecuencia, modelo }
   Llama a Gemini con la clave guardada como secreto. Si un modelo
   está saturado, reintenta y pasa al siguiente de la lista.
   Rechaza cualquier otro origen.
   ========================================================== */

var LOCUTORES = ['Puck', 'Kore', 'Charon', 'Aoede', 'Fenrir', 'Leda', 'Orus', 'Zephyr'];

function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function lista(texto) {
  return String(texto || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

// Prueba cada modelo en orden. Ante "ocupado" (500/503) reintenta una vez;
// ante límite (429) o modelo inexistente (404) pasa directo al siguiente.
async function llamarGemini(env, modelos, cuerpo) {
  var ultimo = { estado: 500, error: 'No hay modelos configurados' };
  for (var i = 0; i < modelos.length; i++) {
    for (var intento = 0; intento < 2; intento++) {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelos[i] + ':generateContent';
      var r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(cuerpo)
      });
      var crudo = await r.text();
      var datos;
      try { datos = JSON.parse(crudo); } catch (e) { datos = {}; }
      if (r.ok) return { estado: 200, datos: datos, modelo: modelos[i] };

      ultimo = { estado: r.status, error: (datos.error && datos.error.message) || ('Error de Gemini ' + r.status + ': ' + crudo.slice(0, 200)) };
      if (r.status === 400 || r.status === 403) return ultimo;   // la petición o la clave están mal: no sirve reintentar
      if (r.status !== 500 && r.status !== 503) break;            // 429, 404…: siguiente modelo
      if (intento === 0) await esperar(1500);
    }
  }
  return ultimo;
}

function partesDe(datos) {
  return (datos.candidates && datos.candidates[0] && datos.candidates[0].content && datos.candidates[0].content.parts) || [];
}

export default {
  async fetch(peticion, env) {
    var origen = peticion.headers.get('Origin') || '';
    var permitido = origen === env.ORIGEN_PERMITIDO;
    var cabeceras = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': env.ORIGEN_PERMITIDO,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };

    function responder(estado, datos) {
      return new Response(JSON.stringify(datos), { status: estado, headers: cabeceras });
    }

    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabeceras });
    if (!permitido) return responder(403, { error: 'Origen no permitido' });
    if (peticion.method !== 'POST') return responder(405, { error: 'Solo se acepta POST' });
    if (!env.GEMINI_API_KEY) return responder(500, { error: 'Falta el secreto GEMINI_API_KEY en Cloudflare' });

    var cuerpo;
    try { cuerpo = await peticion.json(); } catch (e) { return responder(400, { error: 'JSON inválido' }); }

    /* ---------- Voz ---------- */
    if (typeof cuerpo.voz === 'string') {
      var frase = cuerpo.voz.trim();
      if (!frase) return responder(400, { error: 'Falta el texto de la voz' });
      if (frase.length > 1500) return responder(413, { error: 'El texto de la voz es demasiado largo' });
      var locutor = LOCUTORES.indexOf(cuerpo.locutor) !== -1 ? cuerpo.locutor : 'Puck';

      var rv = await llamarGemini(env, lista(env.MODELOS_VOZ || 'gemini-2.5-flash-preview-tts'), {
        contents: [{ role: 'user', parts: [{ text: 'Narra con tono alegre, claro y entusiasta, como un divulgador de curiosidades: ' + frase }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: locutor } } }
        }
      });
      if (rv.estado !== 200) return responder(rv.estado, { error: rv.error });

      var audio = partesDe(rv.datos).filter(function (p) { return p.inlineData && p.inlineData.data; })[0];
      if (!audio) return responder(502, { error: 'Gemini no devolvió audio' });
      var frecuencia = +((/rate=(\d+)/.exec(audio.inlineData.mimeType || '') || [])[1]) || 24000;
      return responder(200, { audio: audio.inlineData.data, frecuencia: frecuencia, modelo: rv.modelo });
    }

    /* ---------- Texto ---------- */
    var prompt = typeof cuerpo.prompt === 'string' ? cuerpo.prompt.trim() : '';
    if (!prompt) return responder(400, { error: 'Falta el prompt' });
    if (prompt.length > 30000) return responder(413, { error: 'El prompt es demasiado largo' });

    var configuracion = { temperature: 0.9 };
    if (cuerpo.json) configuracion.responseMimeType = 'application/json';

    var modelos = [env.MODELO || 'gemini-flash-latest'].concat(lista(env.MODELOS_RESPALDO));
    var rt = await llamarGemini(env, modelos, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: configuracion });
    if (rt.estado !== 200) return responder(rt.estado, { error: rt.error });

    var texto = partesDe(rt.datos).map(function (p) { return p.text || ''; }).join('');
    return responder(200, { texto: texto, modelo: rt.modelo });
  }
};
