/* ==========================================================
   Intermediario de la Fábrica Stickman (Cloudflare Worker).
   Recibe { prompt, json } desde la página publicada, llama a
   Gemini con la clave guardada como secreto y devuelve
   { texto } o { error }. Rechaza cualquier otro origen.
   ========================================================== */

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
    var prompt = typeof cuerpo.prompt === 'string' ? cuerpo.prompt.trim() : '';
    if (!prompt) return responder(400, { error: 'Falta el prompt' });
    if (prompt.length > 30000) return responder(413, { error: 'El prompt es demasiado largo' });

    var configuracion = { temperature: 0.9 };
    if (cuerpo.json) configuracion.responseMimeType = 'application/json';

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + (env.MODELO || 'gemini-flash-latest') + ':generateContent';
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: configuracion })
    });

    var crudo = await r.text();
    var datos;
    try { datos = JSON.parse(crudo); } catch (e) { datos = {}; }
    if (!r.ok) return responder(r.status, { error: (datos.error && datos.error.message) || ('Error de Gemini ' + r.status + ': ' + crudo.slice(0, 200)) });

    var partes = (datos.candidates && datos.candidates[0] && datos.candidates[0].content && datos.candidates[0].content.parts) || [];
    var texto = partes.map(function (p) { return p.text || ''; }).join('');
    return responder(200, { texto: texto });
  }
};
