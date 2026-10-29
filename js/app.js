/* ==========================================================
   Fábrica Stickman — página principal
   Tema → guion y dirección con Gemini → vista previa animada.
   ========================================================== */

(function () {
  'use strict';

  var CLAVE_PROYECTO = 'fabricaStickman.proyecto';
  var CLAVE_REPARTO = 'fabricaStickman.reparto';
  var COLORES_PERSONAJE = [
    ['#e63946', 'Rojo'], ['#2a6fdb', 'Azul'], ['#2b9348', 'Verde'], ['#7b2cbf', 'Morado'], ['#f77f00', 'Naranja'],
    ['#ff4d8d', 'Rosa'], ['#00a6a6', 'Turquesa'], ['#e9b100', 'Amarillo'], ['#8d5524', 'Café'], ['#1d1d1f', 'Negro']
  ];
  var NOMBRES_ACCESORIO = {
    '': 'Ninguno', lentes: 'Lentes', gorra: 'Gorra', sombrero: 'Sombrero', corbata: 'Corbata', corona: 'Corona',
    'moño': 'Moño', bigote: 'Bigote', audifonos: 'Audífonos', cabello: 'Cabello'
  };
  var TAMANOS = { '16:9': [1280, 720], '9:16': [540, 960] };
  var PAUSA_FINAL = 0.8;

  // Proyecto de ejemplo ya dirigido: funciona sin internet.
  var EJEMPLO = {
    tema: '¿Por qué el mar es salado?', minutos: 1,
    titulo: '¿Por qué el mar es salado? 🌊',
    descripcion: 'El agua de los ríos es dulce, pero el mar es salado. ¿De dónde sale toda esa sal? Te lo explicamos en menos de un minuto.',
    etiquetas: ['curiosidades', 'mar', 'ciencia', 'datos curiosos', 'stickman'],
    escenas: [
      { narracion: 'Si toda la sal del mar se esparciera sobre la tierra, formaría una capa de más de 150 metros de alto.',
        direccion: { fondo: 'cielo', personajes: [{ quien: 'presentador', acciones: [{ accion: 'saludar', expresion: 'feliz' }, { accion: 'sorpresa' }] }],
          objetos: [{ tipo: 'agua', animacion: 'latir' }], texto: { texto: '150 metros', contar: true } } },
      { narracion: 'Pero los ríos son de agua dulce. Entonces, ¿de dónde sale tanta sal?',
        direccion: { fondo: 'cielo', personajes: [{ quien: 'presentador', acciones: [{ accion: 'explicar' }] }, { quien: 'amigo', acciones: [{ accion: 'pensar', dice: '¿Y la sal?' }] }],
          objetos: [{ tipo: 'pregunta', animacion: 'latir' }] } },
      { narracion: 'Todo empieza con la lluvia. Al caer, el agua se vuelve un poquito ácida y va desgastando las rocas.',
        direccion: { fondo: 'cielo', personajes: [{ quien: 'presentador', acciones: [{ accion: 'señalar' }, { accion: 'hablar' }] }, { quien: 'amigo', acciones: [{ accion: 'asentir' }] }],
          objetos: [{ tipo: 'agua', animacion: 'caer' }, { tipo: 'montana', animacion: 'aparecer' }] } },
      { narracion: 'Los ríos arrastran esos minerales hasta el mar, y ahí se quedan durante millones de años.',
        direccion: { fondo: 'papel', personajes: [{ quien: 'presentador', acciones: [{ accion: 'explicar' }] }],
          objetos: [{ tipo: 'flecha', animacion: 'aparecer' }, { tipo: 'reloj', animacion: 'girar' }] } },
      { narracion: 'El sol evapora el agua, pero la sal no se evapora. Por eso se va acumulando cada vez más.',
        direccion: { fondo: 'papel', personajes: [{ quien: 'presentador', acciones: [{ accion: 'señalar' }, { accion: 'explicar' }] }, { quien: 'amigo', acciones: [{ accion: 'sorpresa', dice: '¡Ahora entiendo!' }] }],
          objetos: [{ tipo: 'sol', animacion: 'girar' }] } },
      { narracion: 'Hoy, cada litro de agua de mar tiene unos 35 gramos de sal. ¡Casi dos cucharadas!',
        direccion: { fondo: 'pizarra', personajes: [{ quien: 'presentador', acciones: [{ accion: 'celebrar', expresion: 'feliz' }] }, { quien: 'amigo', acciones: [{ accion: 'saltar' }] }],
          texto: { texto: '35 gramos', contar: true }, objetos: [] } },
      { narracion: 'Así que la próxima vez que vayas a la playa, recuerda que esa sal viene de las montañas. ¡Suscríbete para más curiosidades!',
        direccion: { fondo: 'cielo', personajes: [{ quien: 'presentador', acciones: [{ accion: 'hablar' }, { accion: 'saludar', expresion: 'feliz', dice: '¡Suscríbete!' }] }],
          objetos: [{ tipo: 'corazon', animacion: 'latir' }] } }
    ]
  };

  var lienzo = document.getElementById('lienzo');
  var ctx = lienzo.getContext('2d');
  var formato = '16:9';
  var proyecto = null;
  var escenas = [], inicios = [], total = 0;   // escenas listas para dibujar y en qué segundo empieza cada una
  var t = 0, reproduciendo = false, ultimo = null, ocupado = false;
  var clips = [], pista = null, cargaVoces = 0;  // audio de cada escena y la pista completa ya unida
  var pistaVoz = null, musica = { clave: '', buffer: null, promesa: null };
  var reparto = cargarReparto();   // apariencia de los personajes (para todos los videos)

  function $(id) { return document.getElementById(id); }

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ---------------- Avisos ---------------- */

  function aviso(mensaje, tipo) {
    var el = document.createElement('div');
    el.className = 'toast' + (tipo === 'error' ? ' toast-error' : '');
    el.textContent = mensaje;
    $('avisos').appendChild(el);
    setTimeout(function () {
      el.classList.add('saliendo');
      setTimeout(function () { el.remove(); }, 200);
    }, tipo === 'error' ? 6000 : 3000);
  }

  function estado(texto) { $('estado').textContent = texto || ''; }

  function bloquear(si) {
    ocupado = si;
    ['botonCrear', 'botonSugerir', 'botonEjemplo', 'botonVoz', 'selLocutor', 'selMusica', 'botonExportar'].forEach(function (id) { $(id).disabled = si; });
    document.querySelectorAll('.btn-redirigir').forEach(function (b) { b.disabled = si; });
  }

  /* ---------------- Guardar ---------------- */

  function guardar() {
    try { localStorage.setItem(CLAVE_PROYECTO, JSON.stringify({ proyecto: proyecto, formato: formato })); } catch (e) { /* sin espacio */ }
  }

  function cargarGuardado() {
    try {
      var d = JSON.parse(localStorage.getItem(CLAVE_PROYECTO) || 'null');
      if (d && d.proyecto && d.proyecto.escenas && d.proyecto.escenas.length) {
        if (TAMANOS[d.formato]) formato = d.formato;
        return d.proyecto;
      }
    } catch (e) { /* guardado dañado */ }
    return null;
  }

  /* ---------------- Personajes ---------------- */

  function cargarReparto() {
    var base = JSON.parse(JSON.stringify(Director.REPARTO));
    try {
      var r = JSON.parse(localStorage.getItem(CLAVE_REPARTO) || 'null');
      ['presentador', 'amigo'].forEach(function (q) {
        if (r && r[q] && typeof r[q].color === 'string') {
          base[q].color = r[q].color;
          base[q].accesorio = typeof r[q].accesorio === 'string' ? r[q].accesorio : base[q].accesorio;
        }
      });
    } catch (e) { /* guardado dañado: se usan los de siempre */ }
    return base;
  }

  function nombreColor(c) {
    return ((COLORES_PERSONAJE.filter(function (x) { return x[0] === c; })[0]) || [c, 'personalizado'])[1].toLowerCase();
  }

  function describir(a) {
    return nombreColor(a.color) + (a.accesorio ? ' con ' + NOMBRES_ACCESORIO[a.accesorio].toLowerCase() : '');
  }

  function dibujarPersonajes(seg) {
    var c = $('lienzoPersonajes');
    Stickman.dibujarEscena(c.getContext('2d'), {
      duracion: 1e6, fondo: 'papel', objetos: [], textos: [],
      personajes: [
        { id: 'presentador', x: 0.3, escala: 1.6, color: reparto.presentador.color, accesorio: reparto.presentador.accesorio, mira: 'derecha',
          acciones: [{ accion: 'saludar', dur: 1e6 }] },
        { id: 'amigo', x: 0.72, escala: 1.6, color: reparto.amigo.color, accesorio: reparto.amigo.accesorio, mira: 'izquierda',
          acciones: [{ accion: 'hablar', dur: 1e6 }] }
      ]
    }, seg, c.width, c.height);
  }

  function mostrarReparto() {
    ['presentador', 'amigo'].forEach(function (q) {
      var sufijo = q === 'presentador' ? 'Presentador' : 'Amigo';
      $('color' + sufijo).value = reparto[q].color;
      $('accesorio' + sufijo).value = reparto[q].accesorio || '';
    });
    $('resumenPersonajes').textContent = 'presentador ' + describir(reparto.presentador) + ' · amigo ' + describir(reparto.amigo);
    dibujarPersonajes(0.6);
  }

  function cambiarReparto() {
    ['presentador', 'amigo'].forEach(function (q) {
      var sufijo = q === 'presentador' ? 'Presentador' : 'Amigo';
      reparto[q].color = $('color' + sufijo).value;
      reparto[q].accesorio = $('accesorio' + sufijo).value;
    });
    try { localStorage.setItem(CLAVE_REPARTO, JSON.stringify(reparto)); } catch (e) { /* sin espacio */ }
    mostrarReparto();
    if (!proyecto) return;
    proyecto.reparto = reparto;
    recomponer();
    pintarMiniatura();
    guardar();
  }

  /* ---------------- Vista previa ---------------- */

  function recomponer() {
    if (!proyecto) return;
    escenas = Director.componer(proyecto, formato);
    inicios = [];
    total = 0;
    escenas.forEach(function (e) { inicios.push(total); total += e.duracion; });
    if (t > total) t = 0;
    pistaVoz = clips.some(Boolean) ? Voz.unir(clips, inicios, total) : null;
    armarPista();
    if (reproduciendo) irA(t);
  }

  // Pista final = voz + música. La música se genera aparte (tarda un momento)
  // y se guarda mientras no cambien el estilo ni la duración del video.
  // Devuelve una promesa que se cumple cuando la pista ya incluye la música.
  function armarPista() {
    var estilo = (proyecto && proyecto.musica) || 'ninguna';
    pista = pistaVoz;
    if (estilo === 'ninguna') return Promise.resolve();
    var largo = total + 1;   // igual que la pista de la voz
    var clave = estilo + '|' + total.toFixed(2);
    if (musica.clave === clave && musica.buffer) {
      pista = Musica.mezclar(pistaVoz, musica.buffer, largo);
      return Promise.resolve();
    }
    if (musica.clave !== clave) {
      musica = { clave: clave, buffer: null, promesa: null };
      musica.promesa = Musica.generar(estilo, total + 0.6).then(function (b) {
        if (musica.clave !== clave) return;
        musica.buffer = b;
        armarPista();
        if (reproduciendo) irA(t);
      }).catch(function () {
        aviso('No se pudo generar la música en este navegador.', 'error');
      });
    }
    return musica.promesa;
  }

  // Salta a un segundo del video; si está sonando, el audio salta con él.
  function irA(seg) {
    t = seg;
    if (reproduciendo && pista) Voz.reproducir(pista, t); else Voz.detener();
  }

  function indiceEn(seg) {
    for (var i = inicios.length - 1; i > 0; i--) if (seg >= inicios[i]) return i;
    return 0;
  }

  function reloj(seg) {
    seg = Math.floor(seg);
    return Math.floor(seg / 60) + ':' + ('0' + (seg % 60)).slice(-2);
  }

  var escenaMarcada = -1;
  function dibujar() {
    if (!escenas.length) return;
    var i = indiceEn(Math.min(t, total - 0.001));
    Stickman.dibujarEscena(ctx, escenas[i], Math.min(t - inicios[i], escenas[i].duracion), lienzo.width, lienzo.height);
    $('linea').value = Math.round((Math.min(t, total) / total) * 1000);
    $('tiempo').textContent = reloj(t) + ' / ' + reloj(total);
    if (i !== escenaMarcada) {
      escenaMarcada = i;
      $('subtitulo').textContent = escenas[i].narracion;
      document.querySelectorAll('.escena').forEach(function (li, j) { li.classList.toggle('actual', j === i); });
    }
  }

  function bucle(ahora) {
    if (ultimo !== null && reproduciendo) {
      var segAudio = Voz.tiempo();
      t = segAudio !== null ? segAudio : t + Math.min(0.1, (ahora - ultimo) / 1000);
      if (t > total + PAUSA_FINAL) irA(0);
    }
    ultimo = ahora;
    dibujar();
    if ($('panelPersonajes').open) dibujarPersonajes(ahora / 1000);
    requestAnimationFrame(bucle);
  }

  function ponerPlay(si) {
    reproduciendo = si;
    $('botonPlay').textContent = si ? '⏸ Pausa' : '▶ Reproducir';
    irA(t);
  }

  function ajustarLienzo() {
    lienzo.width = TAMANOS[formato][0];
    lienzo.height = TAMANOS[formato][1];
    document.querySelectorAll('[data-formato]').forEach(function (b) {
      b.classList.toggle('activo', b.getAttribute('data-formato') === formato);
    });
  }

  /* ---------------- Lista de escenas ---------------- */

  var NOMBRES = { presentador: 'Presentador', amigo: 'Amigo' };

  function resumenDireccion(d) {
    if (!d) return 'Sin dirigir todavía';
    var partes = d.personajes.map(function (p) {
      return NOMBRES[p.quien] + ': ' + p.acciones.map(function (a) { return a.accion + (a.dice ? ' («' + a.dice + '»)' : ''); }).join(' → ');
    });
    if (d.objetos.length) partes.push('Objetos: ' + d.objetos.map(function (o) { return o.tipo; }).join(', '));
    if (d.texto) partes.push('Texto: ' + d.texto.texto);
    partes.push('Fondo: ' + d.fondo);
    return partes.join(' · ');
  }

  function pintarEscenas() {
    $('listaEscenas').innerHTML = proyecto.escenas.map(function (e, i) {
      return '<li class="escena" data-indice="' + i + '">' +
        '<div class="escena-cabeza"><button type="button" class="btn btn-chico btn-ir" data-indice="' + i + '">▶ Escena ' + (i + 1) + '</button>' +
        '<span class="duracion">' + (tieneVoz(e) ? '🎙 ' + coma(e.duracion) : '~' + coma(Director.duracionEstimada(e.narracion))) + ' s</span>' +
        '<button type="button" class="btn btn-chico btn-redirigir" data-indice="' + i + '" title="Volver a dirigir esta escena">🎬 Otra dirección</button></div>' +
        '<textarea class="narracion" data-indice="' + i + '" rows="2" aria-label="Narración de la escena ' + (i + 1) + '">' + escapar(e.narracion) + '</textarea>' +
        '<p class="direccion">' + escapar(resumenDireccion(e.direccion)) + '</p>' +
        '</li>';
    }).join('');
    $('txtDescripcion').value = proyecto.descripcion || '';
    $('txtEtiquetas').textContent = proyecto.etiquetas && proyecto.etiquetas.length ? 'Etiquetas: ' + proyecto.etiquetas.join(', ') : '';
    escenaMarcada = -1;
    notaVoz();
    notaExportar();
  }

  /* ---------------- Exportar ---------------- */

  var ESCALA_EXPORTAR = { '16:9': 1.5, '9:16': 2 };   // 1920×1080 y 1080×1920
  var exportacion = null, urlDescarga = null;

  function resolucion() {
    return TAMANOS[formato].map(function (n) { return Math.round(n * ESCALA_EXPORTAR[formato]); }).join('×');
  }

  function notaExportar() {
    var f = Exportar.formatoDisponible();
    $('notaExportar').textContent = f
      ? 'Se guardará en ' + f.ext.toUpperCase() + ' de ' + resolucion() + '. La grabación tarda lo mismo que dura el video (' + reloj(total) + '): deja esta pestaña abierta mientras tanto.'
      : 'Este navegador no puede grabar video. Usa Chrome o Edge en la computadora.';
  }

  function nombreArchivo(ext) {
    var base = (proyecto.titulo || proyecto.tema || 'video').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';
    return base + (formato === '9:16' ? '-short' : '') + '.' + ext;
  }

  function exportar() {
    if (!Exportar.formatoDisponible()) { aviso('Este navegador no puede grabar video. Usa Chrome o Edge en la computadora.', 'error'); return; }
    var sinVoz = proyecto.escenas.filter(function (e) { return !tieneVoz(e); }).length;
    if (sinVoz && !confirm(sinVoz === proyecto.escenas.length
      ? 'El video todavía no tiene voz: se exportará ' + (proyecto.musica === 'ninguna' ? 'mudo' : 'solo con música') + '. ¿Exportar de todos modos?'
      : sinVoz + ' escenas no tienen voz y quedarán en silencio. ¿Exportar de todos modos?')) return;

    bloquear(true);
    ponerPlay(false);
    recomponer();
    if (urlDescarga) { URL.revokeObjectURL(urlDescarga); urlDescarga = null; }
    $('enlaceDescarga').hidden = true;
    $('botonCancelar').hidden = false;
    $('progresoExportar').hidden = false;
    $('progresoExportar').value = 0;
    $('estadoExportar').textContent = '🎬 Preparando…';
    $('seccionVideo').scrollIntoView({ behavior: 'smooth', block: 'start' });

    var duracion = total, cancelarAntes = false;
    exportacion = { cancelar: function () { cancelarAntes = true; } };
    // Primero se espera a que la música esté lista.
    armarPista().then(function () {
      if (cancelarAntes) throw new Error('Exportación cancelada.');
      exportacion = Exportar.grabar({
        escenas: escenas, inicios: inicios, total: total, pista: pista,
        base: TAMANOS[formato], escala: ESCALA_EXPORTAR[formato],
        subtitulos: $('chkSubtitulos').checked,
        alAvanzar: function (seg) {
          t = seg;   // la vista previa acompaña a la grabación
          $('progresoExportar').value = Math.round(seg / duracion * 1000);
          $('estadoExportar').textContent = '🔴 Grabando… ' + reloj(seg) + ' de ' + reloj(duracion) + '. No cierres esta pestaña.';
        }
      });
      return exportacion.promesa;
    }).then(function (r) {
      urlDescarga = URL.createObjectURL(r.archivo);
      var enlace = $('enlaceDescarga');
      enlace.href = urlDescarga;
      enlace.download = nombreArchivo(r.extension);
      enlace.hidden = false;
      enlace.click();
      $('estadoExportar').textContent = '✅ Video listo: ' + enlace.download + ' (' + (r.archivo.size / 1048576).toFixed(1).replace('.', ',') + ' MB). Se descargó a tu carpeta de Descargas.';
    }).catch(function (e) {
      $('estadoExportar').textContent = '';
      if (!/cancelada/.test(e.message)) aviso(e.message, 'error'); else aviso('Exportación cancelada.');
    }).finally(function () {
      exportacion = null;
      t = 0;
      $('botonCancelar').hidden = true;
      $('progresoExportar').hidden = true;
      bloquear(false);
    });
  }

  /* ---------------- Voz ---------------- */

  function coma(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

  function tieneVoz(e) { return !!e.duracion && e.vozDe === Voz.clave(e.narracion, proyecto.locutor); }

  function nombreLocutor(id) {
    return (Voz.LOCUTORES.filter(function (l) { return l.id === id; })[0] || { nombre: id }).nombre.split(' ')[0];
  }

  function notaVoz() {
    var n = proyecto.escenas.length;
    var hechas = proyecto.escenas.filter(tieneVoz).length;
    $('notaVoz').textContent = hechas === n
      ? '🎙 Narrado con la voz de ' + nombreLocutor(proyecto.locutor) + '. Cada escena dura lo que dura su audio.'
      : hechas
        ? '🎙 ' + hechas + ' de ' + n + ' escenas narradas. Pulsa 🎙 Generar voz para completar las demás.'
        : 'Sin voz todavía: los tiempos son aproximados. Pulsa 🎙 Generar voz para narrar el video.';
  }

  function ponerVoz(i, clip) {
    var e = proyecto.escenas[i];
    clips[i] = clip;
    if (clip) {
      e.duracion = Voz.duracionDe(clip);
      e.vozDe = Voz.clave(e.narracion, proyecto.locutor);
    } else if (e.vozDe) {
      delete e.duracion;
      delete e.vozDe;
    }
  }

  // Recupera del navegador los audios ya generados (no gasta cupo de Gemini).
  function cargarVoces() {
    var carga = ++cargaVoces;
    var p = proyecto;
    return Promise.all(p.escenas.map(function (e) {
      return Voz.leer(Voz.clave(e.narracion, p.locutor));
    })).then(function (lista) {
      if (carga !== cargaVoces || p !== proyecto) return;
      lista.forEach(function (clip, i) { ponerVoz(i, clip); });
      recomponer();
      pintarEscenas();
      guardar();
    });
  }

  function generarVoz() {
    var faltan = proyecto.escenas.map(function (e, i) { return i; }).filter(function (i) { return !tieneVoz(proyecto.escenas[i]); });
    if (!faltan.length) { aviso('Todas las escenas ya tienen voz.'); return; }
    var locutor = proyecto.locutor, p = proyecto;
    bloquear(true);
    ponerPlay(false);
    var inicio = Date.now();
    faltan.reduce(function (cadena, i, k) {
      return cadena.then(function () {
        var paso = 'escena ' + (k + 1) + ' de ' + faltan.length;
        estado('🎙 Narrando la ' + paso + '…');
        return Voz.obtener(p.escenas[i].narracion, locutor, function (queda) {
          estado('⏳ Gemini pide esperar un momento (' + paso + ')… ' + queda + ' s');
        }).then(function (clip) {
          if (p !== proyecto || locutor !== proyecto.locutor) throw new Error('Se cambió el proyecto o la voz; pulsa 🎙 de nuevo.');
          ponerVoz(i, clip);
          guardar();
        });
      });
    }, Promise.resolve()).then(function () {
      estado('✅ Voz lista en ' + Math.round((Date.now() - inicio) / 1000) + ' s. Pulsa ▶ Reproducir para escucharlo.');
      t = 0;
    }).catch(function (e) {
      estado('');
      aviso(e.message, 'error');
    }).finally(function () {
      if (p === proyecto) {
        recomponer();
        pintarEscenas();
      }
      bloquear(false);
    });
  }

  function mostrarProyecto(p) {
    proyecto = p;
    p.reparto = reparto;
    if (!p.locutor) p.locutor = Voz.LOCUTORES[0].id;
    if (!p.musica) p.musica = 'alegre';
    if (!p.miniatura) p.miniatura = { texto: Miniatura.textoSugerido(p), color: 'amarillo', pose: 0 };
    $('txtMiniatura').value = p.miniatura.texto;
    $('selColorMiniatura').value = p.miniatura.color;
    $('selLocutor').value = p.locutor;
    $('selMusica').value = p.musica;
    clips = [];
    $('txtTema').value = p.tema || '';
    $('selMinutos').value = String(p.minutos || 1);
    $('tituloVideo').textContent = p.titulo;
    $('seccionVideo').hidden = false;
    $('seccionEscenas').hidden = false;
    $('seccionExportar').hidden = false;
    $('seccionMiniatura').hidden = false;
    t = 0;
    recomponer();
    pintarEscenas();
    pintarMiniatura();
    guardar();
    cargarVoces();
  }

  /* ---------------- Miniatura ---------------- */

  function pintarMiniatura() {
    Miniatura.dibujar($('lienzoMiniatura'), proyecto, proyecto.miniatura);
  }

  function descargarMiniatura() {
    $('lienzoMiniatura').toBlob(function (archivo) {
      var url = URL.createObjectURL(archivo);
      var a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo('png').replace(/(-short)?\.png$/, '-miniatura.png');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      aviso('Miniatura guardada en tu carpeta de Descargas.');
    }, 'image/png');
  }

  /* ---------------- Acciones con Gemini ---------------- */

  function crear() {
    var tema = $('txtTema').value.trim();
    if (!tema) { aviso('Escribe un tema o pulsa 💡 Sugerir temas.', 'error'); $('txtTema').focus(); return; }
    var minutos = +$('selMinutos').value;
    var inicio = Date.now();
    bloquear(true);
    ponerPlay(false);
    estado('✍️ Gemini está escribiendo el guion…');
    Director.escribirGuion(tema, minutos).then(function (plan) {
      estado('🎬 Dirigiendo las escenas… 0 de ' + plan.escenas.length);
      return Director.dirigir(plan, null, function (hechas, de) {
        estado('🎬 Dirigiendo las escenas… ' + hechas + ' de ' + de);
      });
    }).then(function (plan) {
      mostrarProyecto(plan);
      estado('✅ Listo en ' + Math.round((Date.now() - inicio) / 1000) + ' s. Pulsa ▶ Reproducir para verlo.');
      $('seccionVideo').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (e) {
      estado('');
      aviso(e.message, 'error');
    }).finally(function () { bloquear(false); });
  }

  function sugerir() {
    bloquear(true);
    estado('💡 Buscando temas curiosos…');
    Director.sugerirTemas().then(function (temas) {
      estado('Elige un tema o escribe el tuyo.');
      $('temasSugeridos').innerHTML = temas.map(function (tema) {
        return '<button type="button" class="chip">' + escapar(tema) + '</button>';
      }).join('');
      $('temasSugeridos').hidden = false;
    }).catch(function (e) {
      estado('');
      aviso(e.message, 'error');
    }).finally(function () { bloquear(false); });
  }

  function redirigir(i) {
    bloquear(true);
    estado('🎬 Dirigiendo de nuevo la escena ' + (i + 1) + '…');
    Director.dirigir(proyecto, [i]).then(function () {
      recomponer();
      pintarEscenas();
      guardar();
      t = inicios[i];
      ponerPlay(true);
      estado('✅ Escena ' + (i + 1) + ' dirigida de nuevo.');
    }).catch(function (e) {
      estado('');
      aviso(e.message, 'error');
    }).finally(function () { bloquear(false); });
  }

  /* ---------------- Eventos ---------------- */

  $('botonCrear').addEventListener('click', crear);
  $('botonSugerir').addEventListener('click', sugerir);
  $('botonEjemplo').addEventListener('click', function () {
    mostrarProyecto(JSON.parse(JSON.stringify(EJEMPLO)));
    estado('Este es un ejemplo hecho a mano. Pulsa ▶ Reproducir.');
  });
  $('txtTema').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !ocupado) crear(); });

  $('temasSugeridos').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    $('txtTema').value = chip.textContent;
    $('temasSugeridos').querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('activo', c === chip); });
  });

  document.querySelectorAll('[data-formato]').forEach(function (b) {
    b.addEventListener('click', function () {
      formato = b.getAttribute('data-formato');
      ajustarLienzo();
      recomponer();
      if (proyecto) { guardar(); notaExportar(); }
    });
  });

  $('botonPlay').addEventListener('click', function () { ponerPlay(!reproduciendo); });
  $('botonInicio').addEventListener('click', function () { t = 0; ponerPlay(true); });
  $('linea').addEventListener('input', function () { irA((this.value / 1000) * total); });

  $('selLocutor').innerHTML = Voz.LOCUTORES.map(function (l) {
    return '<option value="' + l.id + '">' + escapar(l.nombre) + '</option>';
  }).join('');
  $('selLocutor').addEventListener('change', function () {
    if (!proyecto) return;
    ponerPlay(false);
    proyecto.locutor = this.value;
    clips = [];
    cargarVoces();
  });
  $('selMusica').innerHTML = Musica.LISTA.map(function (m) {
    return '<option value="' + m.id + '">' + escapar(m.nombre) + '</option>';
  }).join('');
  $('selMusica').addEventListener('change', function () {
    if (!proyecto) return;
    proyecto.musica = this.value;
    guardar();
    armarPista();
    if (reproduciendo) irA(t);
  });
  ['Presentador', 'Amigo'].forEach(function (sufijo) {
    $('color' + sufijo).innerHTML = COLORES_PERSONAJE.map(function (c) {
      return '<option value="' + c[0] + '">' + c[1] + '</option>';
    }).join('');
    $('accesorio' + sufijo).innerHTML = [''].concat(Stickman.ACCESORIOS).map(function (a) {
      return '<option value="' + a + '">' + escapar(NOMBRES_ACCESORIO[a] || a) + '</option>';
    }).join('');
    $('color' + sufijo).addEventListener('change', cambiarReparto);
    $('accesorio' + sufijo).addEventListener('change', cambiarReparto);
  });
  mostrarReparto();

  $('selColorMiniatura').innerHTML = Miniatura.COLORES.map(function (c) {
    return '<option value="' + c.id + '">' + escapar(c.nombre) + '</option>';
  }).join('');
  $('txtMiniatura').addEventListener('input', function () {
    if (!proyecto) return;
    proyecto.miniatura.texto = this.value.replace(/\s+/g, ' ').trim();
    pintarMiniatura();
  });
  $('txtMiniatura').addEventListener('change', function () { if (proyecto) guardar(); });
  $('selColorMiniatura').addEventListener('change', function () {
    if (!proyecto) return;
    proyecto.miniatura.color = this.value;
    pintarMiniatura();
    guardar();
  });
  $('botonPose').addEventListener('click', function () {
    if (!proyecto) return;
    proyecto.miniatura.pose = ((proyecto.miniatura.pose || 0) + 1) % Miniatura.POSES;
    pintarMiniatura();
    guardar();
  });
  $('botonMiniatura').addEventListener('click', function () { if (proyecto) descargarMiniatura(); });
  $('botonVoz').addEventListener('click', function () { if (proyecto && !ocupado) generarVoz(); });
  $('botonExportar').addEventListener('click', function () { if (proyecto && !ocupado) exportar(); });
  $('botonCancelar').addEventListener('click', function () { if (exportacion) exportacion.cancelar(); });

  $('listaEscenas').addEventListener('click', function (e) {
    var ir = e.target.closest('.btn-ir');
    if (ir) { t = inicios[+ir.getAttribute('data-indice')] || 0; ponerPlay(true); $('seccionVideo').scrollIntoView({ behavior: 'smooth' }); return; }
    var otra = e.target.closest('.btn-redirigir');
    if (otra && !ocupado) redirigir(+otra.getAttribute('data-indice'));
  });

  // Al corregir la narración, cambia la duración estimada de esa escena.
  $('listaEscenas').addEventListener('change', function (e) {
    if (!e.target.classList.contains('narracion')) return;
    var i = +e.target.getAttribute('data-indice');
    var nuevo = e.target.value.replace(/\s+/g, ' ').trim();
    if (!nuevo) { e.target.value = proyecto.escenas[i].narracion; return; }
    proyecto.escenas[i].narracion = nuevo;
    ponerVoz(i, null);
    delete proyecto.escenas[i].duracion;
    // Si esa frase ya se había narrado antes (por ejemplo, al deshacer un cambio), se recupera.
    Voz.leer(Voz.clave(nuevo, proyecto.locutor)).then(function (clip) {
      if (!clip || proyecto.escenas[i].narracion !== nuevo) return;
      ponerVoz(i, clip);
      recomponer();
      pintarEscenas();
      guardar();
    });
    recomponer();
    pintarEscenas();
    guardar();
  });

  $('txtDescripcion').addEventListener('change', function () {
    if (!proyecto) return;
    proyecto.descripcion = this.value.trim();
    guardar();
  });

  /* ---------------- Inicio ---------------- */

  var guardado = cargarGuardado();
  ajustarLienzo();
  if (guardado) mostrarProyecto(guardado);

  // Para pruebas automáticas: ?ejemplo&t=5&formato=9:16 congela ese segundo del ejemplo.
  var q = location.search;
  var fmt = /[?&]formato=(9:16|16:9)/.exec(q);
  if (fmt) { formato = fmt[1]; ajustarLienzo(); recomponer(); }
  if (/[?&]ejemplo/.test(q)) mostrarProyecto(JSON.parse(JSON.stringify(EJEMPLO)));
  var congelar = /[?&]t=([\d.]+)/.exec(q);
  if (congelar) t = parseFloat(congelar[1]);

  requestAnimationFrame(bucle);
})();
