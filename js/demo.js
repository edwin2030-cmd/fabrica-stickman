/* ==========================================================
   Fábrica Stickman — página de demostración del motor
   ========================================================== */

(function () {
  'use strict';

  // Escena de ejemplo: así la escribirá Gemini en el paso 2.
  var EJEMPLO = {
    duracion: 16,
    fondo: 'papel',
    personajes: [
      {
        id: 'ana', x: 0.22, color: '#e63946', accesorio: 'lentes', mira: 'derecha',
        acciones: [
          { accion: 'saludar', dur: 2.2, dice: '¡Hola! ¿Sabías esto?' },
          { accion: 'señalar', dur: 2.6, dice: 'La Luna está lejísimos' },
          { accion: 'hablar', dur: 2.4 },
          { accion: 'pensar', dur: 2.2, dice: '¿Y si desapareciera?' },
          { accion: 'sorpresa', dur: 2.4 },
          { accion: 'explicar', dur: 2.2, dice: '¡Las mareas cambiarían!' },
          { accion: 'celebrar', dur: 2 }
        ]
      },
      {
        id: 'beto', x: 1.12, color: '#2a6fdb', accesorio: 'gorra', desde: 4,
        acciones: [
          { accion: 'caminar', hacia: 0.55, dur: 2.4 },
          { accion: 'hablar', dur: 2, dice: '¿Desaparecer? ¡¿Cómo?!', mira: 'izquierda' },
          { accion: 'asustado', dur: 2.4 },
          { accion: 'nose', dur: 2.2 },
          { accion: 'saltar', dur: 1.2 },
          { accion: 'asentir', dur: 2 }
        ]
      }
    ],
    objetos: [
      { tipo: 'luna', x: 0.78, y: 0.3, tam: 0.24, desde: 0.6, hasta: 8.6, animacion: 'flotar' },
      { tipo: 'pregunta', x: 0.3, y: 0.16, tam: 0.14, desde: 7.4, hasta: 9.4, animacion: 'latir' },
      { tipo: 'tierra', x: 0.8, y: 0.32, tam: 0.26, desde: 9.2, animacion: 'temblar' },
      { tipo: 'agua', x: 0.64, y: 0.2, tam: 0.1, desde: 11.2, animacion: 'latir' }
    ],
    textos: [
      { texto: '¿Y si la Luna desapareciera?', x: 0.5, y: 0.1, tam: 0.07, desde: 0.2, hasta: 4.4 },
      { texto: '384.400 km', x: 0.78, y: 0.56, tam: 0.075, desde: 2.4, hasta: 8.4, contar: true, color: '#e63946' },
      { texto: 'Mareas 3 veces más pequeñas', x: 0.5, y: 0.1, tam: 0.06, desde: 11.4 }
    ]
  };

  var TAMANOS = { '16:9': [1280, 720], '9:16': [540, 960] };

  var lienzo = document.getElementById('lienzo');
  var ctx = lienzo.getContext('2d');
  var formato = '16:9', modo = 'ejemplo';
  var t = 0, reproduciendo = true, ultimo = null;
  var escena = EJEMPLO;

  function $(id) { return document.getElementById(id); }

  function ajustarLienzo() {
    var tam = TAMANOS[formato];
    lienzo.width = tam[0];
    lienzo.height = tam[1];
  }

  function opciones(sel, lista, extra) {
    sel.insertAdjacentHTML('beforeend', lista.map(function (v) {
      return '<option value="' + v + '">' + v + '</option>';
    }).join(''));
    if (extra) sel.value = extra;
  }

  // Escena de prueba con lo elegido en el panel.
  function escenaDePrueba() {
    var accion = $('selAccion').value;
    var mueve = accion === 'caminar' || accion === 'correr';
    var a = { accion: accion, dur: mueve ? 3 : 4 };
    if (mueve) a.hacia = 0.62;
    if ($('selExpresion').value) a.expresion = $('selExpresion').value;
    if ($('txtDice').value.trim()) a.dice = $('txtDice').value.trim();
    var per = { id: 'prueba', x: mueve ? 0.22 : 0.38, color: '#e63946', acciones: [a] };
    if ($('selAccesorio').value) per.accesorio = $('selAccesorio').value;
    var objetos = [];
    if ($('selObjeto').value) objetos.push({ tipo: $('selObjeto').value, x: 0.76, y: 0.34, tam: 0.22, desde: 0.3, animacion: 'flotar' });
    return { duracion: a.dur, fondo: $('selFondo').value, personajes: [per], objetos: objetos, textos: [] };
  }

  function dibujar() {
    Stickman.dibujarEscena(ctx, escena, t, lienzo.width, lienzo.height);
    var dur = Stickman.duracionDe(escena);
    $('linea').value = Math.round((t / dur) * 1000);
    $('tiempo').textContent = t.toFixed(1).replace('.', ',') + ' s';
  }

  function bucle(ahora) {
    if (ultimo !== null && reproduciendo) {
      t += Math.min(0.1, (ahora - ultimo) / 1000);
      var dur = Stickman.duracionDe(escena);
      if (t > dur + 0.8) t = 0;            // vuelve a empezar tras una pausa corta
    }
    ultimo = ahora;
    dibujar();
    requestAnimationFrame(bucle);
  }

  function cambiarEscena() {
    escena = modo === 'ejemplo' ? EJEMPLO : escenaDePrueba();
    t = 0;
  }

  function marcarActivo(atributo, valor) {
    document.querySelectorAll('[' + atributo + ']').forEach(function (b) {
      b.classList.toggle('activo', b.getAttribute(atributo) === valor);
    });
  }

  document.querySelectorAll('[data-formato]').forEach(function (b) {
    b.addEventListener('click', function () {
      formato = b.getAttribute('data-formato');
      marcarActivo('data-formato', formato);
      ajustarLienzo();
    });
  });

  document.querySelectorAll('[data-modo]').forEach(function (b) {
    b.addEventListener('click', function () {
      modo = b.getAttribute('data-modo');
      marcarActivo('data-modo', modo);
      $('panelProbar').hidden = modo !== 'probar';
      cambiarEscena();
    });
  });

  $('botonPlay').addEventListener('click', function () {
    reproduciendo = !reproduciendo;
    this.textContent = reproduciendo ? '⏸ Pausa' : '▶ Reproducir';
  });
  $('botonInicio').addEventListener('click', function () { t = 0; });
  $('linea').addEventListener('input', function () {
    t = (this.value / 1000) * Stickman.duracionDe(escena);
  });

  opciones($('selAccion'), Stickman.ACCIONES, 'saludar');
  opciones($('selExpresion'), Stickman.EXPRESIONES);
  opciones($('selAccesorio'), Stickman.ACCESORIOS);
  opciones($('selObjeto'), Stickman.OBJETOS, 'bombilla');
  opciones($('selFondo'), Stickman.FONDOS, 'papel');
  ['selAccion', 'selExpresion', 'selAccesorio', 'selObjeto', 'selFondo'].forEach(function (id) {
    $(id).addEventListener('change', cambiarEscena);
  });
  $('txtDice').addEventListener('input', cambiarEscena);

  // Para pruebas automáticas: ?t=5 congela la escena en ese segundo.
  var congelar = /[?&]t=([\d.]+)/.exec(location.search);
  var fmt = /[?&]formato=(9:16|16:9)/.exec(location.search);
  if (fmt) { formato = fmt[1]; marcarActivo('data-formato', formato); }
  if (congelar) { t = parseFloat(congelar[1]); reproduciendo = false; }

  ajustarLienzo();
  requestAnimationFrame(bucle);
})();
