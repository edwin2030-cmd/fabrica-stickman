/* ==========================================================
   Miniatura para YouTube (1280 × 720): fondo de color con rayos,
   el presentador en grande con una pose llamativa, el objeto
   que más aparece en el video y el título en letras gordas.
   ========================================================== */

var Miniatura = (function () {
  'use strict';

  var W = 1280, H = 720;
  var COLORES = {
    amarillo: { nombre: 'Amarillo', centro: '#ffe45c', borde: '#ffb703', resalte: '#e63946' },
    rojo: { nombre: 'Rojo', centro: '#ff6b6b', borde: '#c1121f', resalte: '#ffd60a' },
    azul: { nombre: 'Azul', centro: '#6ad5f5', borde: '#2a6fdb', resalte: '#ffd60a' },
    verde: { nombre: 'Verde', centro: '#8ef0a3', borde: '#2b9348', resalte: '#ffd60a' },
    morado: { nombre: 'Morado', centro: '#d39bff', borde: '#6a1fb0', resalte: '#ffd60a' }
  };
  // Pose del presentador y la cara que pone.
  var POSES = [
    { accion: 'sorpresa', expresion: 'sorpresa' },
    { accion: 'señalar', expresion: 'feliz' },
    { accion: 'asustado', expresion: 'sorpresa' },
    { accion: 'pensar', expresion: 'arriba' },
    { accion: 'celebrar', expresion: 'feliz' }
  ];
  var OBJETO_POR_DEFECTO = 'pregunta';

  function quitarEmojis(s) {
    return String(s || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  }

  function textoSugerido(proyecto) { return quitarEmojis(proyecto.titulo || proyecto.tema); }

  // El objeto que más se repite en el video (las flechas no lucen solas).
  function objetoPrincipal(proyecto) {
    var cuenta = {}, mejor = OBJETO_POR_DEFECTO, max = 0;
    proyecto.escenas.forEach(function (e) {
      ((e.direccion && e.direccion.objetos) || []).forEach(function (o) {
        if (o.tipo === 'flecha') return;
        cuenta[o.tipo] = (cuenta[o.tipo] || 0) + 1;
        if (cuenta[o.tipo] > max) { max = cuenta[o.tipo]; mejor = o.tipo; }
      });
    });
    return mejor;
  }

  function fondo(ctx, c) {
    var cx = W * 0.72, cy = H * 0.45;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.8);
    g.addColorStop(0, c.centro);
    g.addColorStop(1, c.borde);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Rayos que salen de detrás del presentador.
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    var rayos = 18;
    for (var i = 0; i < rayos; i++) {
      var a = i / rayos * Math.PI * 2, b = a + Math.PI / rayos;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * W * 1.5, cy + Math.sin(a) * W * 1.5);
      ctx.lineTo(cx + Math.cos(b) * W * 1.5, cy + Math.sin(b) * W * 1.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Reparte el texto en líneas y busca el tamaño más grande que cabe.
  function acomodar(ctx, texto, ancho, alto) {
    var palabras = texto.split(' ');
    for (var tam = 140; tam >= 44; tam -= 4) {
      ctx.font = '900 ' + tam + 'px "Arial Black", Impact, system-ui, sans-serif';
      var lineas = [], actual = '', cabe = true;
      palabras.forEach(function (p) {
        var prueba = actual ? actual + ' ' + p : p;
        if (ctx.measureText(prueba).width <= ancho) actual = prueba;
        else { if (actual) lineas.push(actual); actual = p; if (ctx.measureText(p).width > ancho) cabe = false; }
      });
      if (actual) lineas.push(actual);
      if (cabe && lineas.length <= 4 && lineas.length * tam * 1.08 <= alto) return { tam: tam, lineas: lineas };
    }
    return { tam: 44, lineas: lineas };
  }

  function titulo(ctx, texto, c) {
    texto = texto.toLocaleUpperCase('es');
    if (!texto) return;
    var ancho = W * 0.5, alto = H * 0.84;
    var r = acomodar(ctx, texto, ancho, alto);
    var paso = r.tam * 1.08;
    // Se resalta la línea con un número o, si no hay, la última.
    var resaltada = r.lineas.findIndex(function (l) { return /\d/.test(l); });
    if (resaltada === -1) resaltada = r.lineas.length - 1;
    ctx.save();
    ctx.translate(W * 0.05, H / 2 - (r.lineas.length * paso) / 2 + paso / 2);
    ctx.rotate(-2.5 * Math.PI / 180);
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    r.lineas.forEach(function (l, i) {
      var y = i * paso;
      ctx.lineWidth = r.tam * 0.2;
      ctx.strokeStyle = '#111';
      ctx.strokeText(l, 0, y);
      ctx.fillStyle = r.lineas.length > 1 && i === resaltada ? c.resalte : '#fff';
      ctx.fillText(l, 0, y);
    });
    ctx.restore();
  }

  // op: { texto, color, pose (número) }
  function dibujar(lienzo, proyecto, op) {
    lienzo.width = W;
    lienzo.height = H;
    var ctx = lienzo.getContext('2d');
    var c = COLORES[op.color] || COLORES.amarillo;
    var p = POSES[(op.pose || 0) % POSES.length];
    fondo(ctx, c);
    Stickman.dibujarEscena(ctx, {
      duracion: 1000, fondo: 'ninguno',
      personajes: [{ id: 'presentador', x: 0.8, escala: 1.55, color: '#e63946', accesorio: 'lentes', mira: 'izquierda',
        acciones: [{ accion: p.accion, dur: 1000, expresion: p.expresion }] }],
      objetos: [{ tipo: objetoPrincipal(proyecto), x: 0.63, y: 0.27, tam: 0.3, animacion: 'aparecer', desde: 0 }],
      textos: []
    }, 1.2, W, H);
    titulo(ctx, op.texto, c);
  }

  return {
    COLORES: Object.keys(COLORES).map(function (k) { return { id: k, nombre: COLORES[k].nombre }; }),
    POSES: POSES.length,
    textoSugerido: textoSugerido,
    dibujar: dibujar
  };
})();
