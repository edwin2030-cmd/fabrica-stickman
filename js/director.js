/* ==========================================================
   El director: Gemini escribe la curiosidad (guion) y decide
   qué hace cada muñequito en cada escena. Gemini solo elige
   el "qué" (acciones, gestos, objetos, textos); las posiciones
   y los tiempos los calcula este código según el formato, para
   que nada se encime ni en horizontal ni en vertical.
   ========================================================== */

var Director = (function () {
  'use strict';

  var PALABRAS_POR_MINUTO = 140;
  var PALABRAS_POR_SEGUNDO = 2.6;    // ritmo aproximado de la voz, hasta tener el audio real
  var PALABRAS_POR_ESCENA = 20;
  var ESCENAS_POR_LOTE = 8;          // escenas que dirige Gemini en cada pedido
  var MAX_DICE = 40;                 // caracteres máximos de un bocadillo
  var MAX_TEXTO = 40;                // caracteres máximos de un texto grande
  var ANIMACIONES = ['aparecer', 'flotar', 'latir', 'girar', 'temblar', 'caer'];

  // Los dos personajes del canal. Su apariencia (color y accesorio) se puede
  // cambiar desde la página: llega en plan.reparto.
  var REPARTO = {
    presentador: { id: 'presentador', color: '#e63946', accesorio: 'lentes' },
    amigo: { id: 'amigo', color: '#2a6fdb', accesorio: 'gorra' }
  };

  // Para que Gemini entienda cada opción.
  var SIGNIFICADO_ACCIONES = {
    parado: 'quieto', hablar: 'habla moviendo las manos', saludar: 'saluda con la mano',
    saltar: 'salta de emoción', asentir: 'dice que sí con la cabeza', negar: 'dice que no con la cabeza',
    temblar: 'tiembla de miedo o frío', señalar: 'señala hacia adelante', pensar: 'se rasca la barbilla pensando',
    celebrar: 'levanta los brazos celebrando', nose: 'se encoge de hombros', sorpresa: 'se sorprende',
    triste: 'cabizbajo', explicar: 'explica con las manos abiertas', asustado: 'se asusta', enojado: 'se enoja',
    correr: 'corre con prisa en su lugar', bailar: 'baila de alegría', aplaudir: 'aplaude', reir: 'se ríe a carcajadas',
    llorar: 'llora tapándose la cara', comer: 'come algo', dormir: 'duerme de pie o se aburre', cruzar: 'cruza los brazos, escéptico',
    agacharse: 'se agacha y se cubre la cabeza', mostrar: 'levanta algo para mostrarlo con orgullo',
    verguenza: 'se tapa la cara de vergüenza', escribir: 'escribe o dibuja en la pizarra'
  };

  /* ---------------- Utilidades ---------------- */

  function texto(v) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''; }

  function recortar(v, max) {
    v = texto(v);
    if (v.length <= max) return v;
    var corte = v.slice(0, max + 1).lastIndexOf(' ');
    return v.slice(0, corte > max * 0.5 ? corte : max).replace(/[,;:\s]+$/, '') + '…';
  }

  function contarPalabras(v) { return texto(v).split(' ').filter(Boolean).length; }

  function elegir(valor, lista, porDefecto) { return lista.indexOf(valor) !== -1 ? valor : porDefecto; }

  // Segundos estimados de una narración (el paso 3 los cambia por los del audio real).
  function duracionEstimada(narracion) {
    return Math.max(2.5, Math.round((contarPalabras(narracion) / PALABRAS_POR_SEGUNDO + 0.6) * 10) / 10);
  }

  /* ---------------- 1. Temas sugeridos ---------------- */

  function sugerirTemas() {
    var prompt = [
      'Eres guionista de un canal de YouTube en español latino de curiosidades y datos sorprendentes.',
      'Propón 6 temas ORIGINALES y variados (ciencia, cuerpo humano, animales, historia, espacio, tecnología, dinero, comida).',
      'Cada tema es una pregunta corta y llamativa que dé curiosidad, por ejemplo: "¿Por qué el mar es salado?".',
      'Responde SOLO con JSON válido: {"temas": ["...", "..."]}'
    ].join('\n');
    return IA.pedirJSON(prompt).then(function (d) {
      var temas = (Array.isArray(d.temas) ? d.temas : []).map(function (t) { return recortar(t, 90); }).filter(Boolean);
      if (!temas.length) throw new Error('Gemini no respondió en el formato esperado. Intenta de nuevo.');
      return temas.slice(0, 6);
    });
  }

  /* ---------------- 2. Guion ---------------- */

  function escribirGuion(tema, minutos) {
    minutos = minutos === 3 || minutos === 5 ? minutos : 1;
    var palabras = minutos === 1 ? 125 : minutos * PALABRAS_POR_MINUTO;
    var escenas = Math.max(6, Math.round(palabras / PALABRAS_POR_ESCENA));

    var prompt = [
      'Eres guionista de un canal de YouTube en español latino de curiosidades y datos, animado con muñequitos de palitos (stickman).',
      'Tema del video: "' + recortar(tema, 200) + '".',
      'Escribe la narración (voz en off) para un video de ' + (minutos === 1 ? 'menos de 1 minuto (Short)' : 'unos ' + minutos + ' minutos') +
        ', unas ' + palabras + ' palabras en total, dividida en ' + escenas + ' escenas.',
      'Reglas:',
      '- Cada escena tiene 1 o 2 frases cortas (entre 12 y 25 palabras), fáciles de leer en voz alta.',
      '- La primera escena es un gancho que atrape en 3 segundos: una pregunta intrigante o el dato más sorprendente.',
      '- Cuenta datos VERDADEROS y comprobables. Si no estás seguro de una cifra, no la inventes.',
      '- Escribe los números con cifras y punto de miles (384.400 km, 1.000 millones).',
      '- Tono cercano, curioso y divertido, de tú a tú. Sin groserías.',
      '- La última escena cierra con una conclusión breve y pide suscribirse en pocas palabras.',
      'Responde SOLO con JSON válido, sin texto antes ni después:',
      '{',
      '  "titulo": "título corto y llamativo para YouTube (máximo 70 caracteres)",',
      '  "descripcion": "descripción para YouTube en 2 o 3 frases",',
      '  "etiquetas": ["5 a 8 etiquetas"],',
      '  "escenas": [{"narracion": "texto de la escena"}]',
      '}'
    ].join('\n');

    return IA.pedirJSON(prompt).then(function (d) {
      var lista = (Array.isArray(d.escenas) ? d.escenas : []).map(function (e) {
        return { narracion: texto(e && (e.narracion || e.texto)) };
      }).filter(function (e) { return e.narracion; });
      if (!lista.length || !texto(d.titulo)) throw new Error('Gemini no respondió en el formato esperado. Intenta de nuevo.');
      return {
        tema: texto(tema),
        minutos: minutos,
        titulo: recortar(d.titulo, 100),
        descripcion: texto(d.descripcion),
        etiquetas: (Array.isArray(d.etiquetas) ? d.etiquetas : []).map(texto).filter(Boolean).slice(0, 12),
        escenas: lista
      };
    });
  }

  /* ---------------- 3. Dirección de escenas ---------------- */

  function promptDireccion(plan, indices) {
    var acciones = Object.keys(SIGNIFICADO_ACCIONES).map(function (a) { return a + ' (' + SIGNIFICADO_ACCIONES[a] + ')'; }).join(', ');
    var escenas = indices.map(function (i) {
      return 'Escena ' + (i + 1) + ': "' + plan.escenas[i].narracion + '"';
    }).join('\n');
    return [
      'Eres el director de animación de un video de curiosidades con muñequitos de palitos. Título: "' + plan.titulo + '".',
      'Hay dos personajes: "presentador" (cuenta la curiosidad, aparece en TODAS las escenas) y "amigo"',
      '(aparece en algunas escenas, más o menos la mitad, para reaccionar, sorprenderse o hacer una pregunta).',
      'Para cada escena decide qué hacen mientras se escucha la narración. Opciones permitidas (usa EXACTAMENTE estos nombres):',
      '- accion: ' + acciones,
      '- expresion (opcional): ' + Stickman.EXPRESIONES.join(', '),
      '- objetos (0 a 2 por escena, relacionados con lo que se dice): ' + Stickman.OBJETOS.join(', '),
      '- animacion de cada objeto: ' + ANIMACIONES.join(', '),
      '- fondo: papel (normal), cielo (exteriores), noche (espacio o noche), pizarra (explicaciones de ciencia)',
      'Reglas:',
      '- Cada personaje hace de 1 a 3 acciones seguidas por escena, variadas y acordes a la emoción de la narración.',
      '- "dice" es opcional: un bocadillo corto (máximo 6 palabras) que NO repite la narración. Úsalo solo en algunas escenas.',
      '- "texto" es opcional: una frase o cifra grande en pantalla (máximo 5 palabras). Si la escena tiene una cifra clave,',
      '  ponla con "contar": true para que el número suba contando (ejemplo: "384.400 km").',
      '- Mantén el mismo fondo en escenas seguidas salvo que cambiar tenga sentido.',
      'Escenas a dirigir:',
      escenas,
      'Responde SOLO con JSON válido, una entrada por escena y en el mismo orden:',
      '{"escenas": [{',
      '  "escena": 1,',
      '  "fondo": "papel",',
      '  "personajes": [{"quien": "presentador", "acciones": [{"accion": "explicar", "expresion": "feliz", "dice": "¡Mira esto!"}]}],',
      '  "objetos": [{"tipo": "luna", "animacion": "flotar"}],',
      '  "texto": {"texto": "384.400 km", "contar": true}',
      '}]}'
    ].join('\n');
  }

  // Limpia lo que propone Gemini: solo quedan opciones que el motor sabe dibujar.
  function normalizarDireccion(d) {
    d = d && typeof d === 'object' ? d : {};
    var acciones = Object.keys(SIGNIFICADO_ACCIONES);
    var personajes = [];
    (Array.isArray(d.personajes) ? d.personajes : []).forEach(function (p) {
      if (!p || !REPARTO[p.quien]) return;
      if (personajes.some(function (q) { return q.quien === p.quien; })) return;
      var lista = (Array.isArray(p.acciones) ? p.acciones : []).slice(0, 3).map(function (a) {
        a = a || {};
        var r = { accion: elegir(a.accion, acciones, 'hablar') };
        if (Stickman.EXPRESIONES.indexOf(a.expresion) !== -1) r.expresion = a.expresion;
        if (texto(a.dice)) r.dice = recortar(a.dice, MAX_DICE);
        return r;
      });
      if (!lista.length) lista = [{ accion: 'hablar' }];
      personajes.push({ quien: p.quien, acciones: lista });
    });
    if (!personajes.some(function (p) { return p.quien === 'presentador'; })) {
      personajes.unshift({ quien: 'presentador', acciones: [{ accion: 'explicar' }] });
    }
    personajes.sort(function (a, b) { return a.quien === 'presentador' ? -1 : b.quien === 'presentador' ? 1 : 0; });

    var objetos = (Array.isArray(d.objetos) ? d.objetos : []).filter(function (o) {
      return o && Stickman.OBJETOS.indexOf(o.tipo) !== -1;
    }).slice(0, 2).map(function (o) {
      return { tipo: o.tipo, animacion: elegir(o.animacion, ANIMACIONES, 'flotar') };
    });

    var r = { fondo: elegir(d.fondo, Stickman.FONDOS, 'papel'), personajes: personajes, objetos: objetos };
    var tx = d.texto && typeof d.texto === 'object' ? d.texto : { texto: d.texto };
    if (texto(tx.texto)) r.texto = { texto: recortar(tx.texto, MAX_TEXTO), contar: tx.contar === true && /\d/.test(tx.texto) };
    return r;
  }

  // Dirige las escenas indicadas (o todas) en lotes. progreso(hechas, total).
  function dirigir(plan, indices, progreso) {
    indices = indices || plan.escenas.map(function (e, i) { return i; });
    var lotes = [];
    for (var i = 0; i < indices.length; i += ESCENAS_POR_LOTE) lotes.push(indices.slice(i, i + ESCENAS_POR_LOTE));
    var hechas = 0;

    // Todos los lotes se piden a la vez: un video largo tarda casi lo mismo que uno corto.
    return Promise.all(lotes.map(function (lote) {
      return IA.pedirJSON(promptDireccion(plan, lote)).then(function (d) {
        var lista = Array.isArray(d.escenas) ? d.escenas : [];
        lote.forEach(function (indice, j) {
          // Se busca por número de escena; si no viene, se usa el orden.
          var propuesta = lista.filter(function (x) { return x && +x.escena === indice + 1; })[0] || lista[j];
          plan.escenas[indice].direccion = normalizarDireccion(propuesta);
        });
        hechas += lote.length;
        if (progreso) progreso(hechas, indices.length);
      });
    })).then(function () { return plan; });
  }

  /* ---------------- 4. Composición (posiciones y tiempos) ---------------- */

  // Lugares por formato. x, y en fracción del ancho y alto; tam en fracción del lado corto.
  var LUGARES = {
    '16:9': {
      solo: { presentador: 0.3, objetos: [[[0.7, 0.4, 0.24]], [[0.6, 0.4, 0.18], [0.84, 0.4, 0.18]]] },
      dos: { presentador: 0.22, amigo: 0.78, objetos: [[[0.5, 0.36, 0.2]], [[0.4, 0.36, 0.15], [0.6, 0.36, 0.15]]] },
      texto: { y: 0.12, tam: 0.075 }
    },
    '9:16': {
      solo: { presentador: 0.5, objetos: [[[0.5, 0.33, 0.3]], [[0.3, 0.33, 0.24], [0.7, 0.33, 0.24]]] },
      dos: { presentador: 0.28, amigo: 0.72, objetos: [[[0.5, 0.33, 0.3]], [[0.3, 0.33, 0.24], [0.7, 0.33, 0.24]]] },
      texto: { y: 0.12, tam: 0.085 }
    }
  };

  // Convierte la dirección de una escena en la escena que dibuja el motor.
  // amigoAntes: si el amigo ya estaba en la escena anterior (si no, entra caminando).
  function componerEscena(direccion, duracion, formato, amigoAntes, reparto) {
    var lugar = LUGARES[formato] || LUGARES['16:9'];
    var d = direccion || normalizarDireccion({});
    var conAmigo = d.personajes.some(function (p) { return p.quien === 'amigo'; });
    var disposicion = conAmigo ? lugar.dos : lugar.solo;

    var personajes = d.personajes.map(function (p) {
      var x = disposicion[p.quien];
      var aspecto = (reparto && reparto[p.quien]) || REPARTO[p.quien];
      var per = { id: p.quien, x: x, color: aspecto.color || REPARTO[p.quien].color, accesorio: aspecto.accesorio,
        mira: p.quien === 'amigo' ? 'izquierda' : 'derecha', acciones: [] };
      var resto = duracion;
      if (p.quien === 'amigo' && !amigoAntes) {
        var entrada = Math.min(1.6, duracion * 0.35);
        per.x = 1.15;
        per.acciones.push({ accion: 'caminar', hacia: x, dur: entrada });
        resto -= entrada;
      }
      var cada = resto / p.acciones.length;
      p.acciones.forEach(function (a) {
        var paso = { accion: a.accion, dur: cada };
        if (a.expresion) paso.expresion = a.expresion;
        if (a.dice) paso.dice = a.dice;
        if (p.quien === 'amigo') paso.mira = 'izquierda';
        per.acciones.push(paso);
      });
      return per;
    });

    var huecos = disposicion.objetos[d.objetos.length - 1] || [];
    var objetos = d.objetos.map(function (o, i) {
      var h = huecos[i];
      return { tipo: o.tipo, x: h[0], y: h[1], tam: h[2], animacion: o.animacion,
        desde: Math.round((0.3 + i * Math.min(1.2, duracion * 0.2)) * 100) / 100 };
    });

    var textos = [];
    if (d.texto) textos.push({ texto: d.texto.texto, x: 0.5, y: lugar.texto.y, tam: lugar.texto.tam,
      desde: 0.5, contar: d.texto.contar, color: d.texto.contar ? '#e63946' : undefined });

    return { duracion: duracion, fondo: d.fondo, personajes: personajes, objetos: objetos, textos: textos };
  }

  // Todas las escenas del video listas para dibujar.
  // Cada escena usa e.duracion si ya existe (audio real) o una estimación.
  function componer(plan, formato) {
    var amigoAntes = false;
    return plan.escenas.map(function (e) {
      var duracion = e.duracion || duracionEstimada(e.narracion);
      var escena = componerEscena(e.direccion, duracion, formato, amigoAntes, plan.reparto);
      amigoAntes = escena.personajes.some(function (p) { return p.id === 'amigo'; });
      escena.narracion = e.narracion;
      return escena;
    });
  }

  return {
    sugerirTemas: sugerirTemas,
    escribirGuion: escribirGuion,
    dirigir: dirigir,
    normalizarDireccion: normalizarDireccion,
    componer: componer,
    duracionEstimada: duracionEstimada,
    REPARTO: REPARTO
  };
})();
