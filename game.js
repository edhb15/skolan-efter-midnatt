'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  document.querySelectorAll(isTouch ? '.pc' : '.tc').forEach(e => e.classList.add('hidden'));
  if (isTouch) document.body.classList.add('touch');

  // =====================================================================
  // DATA: ändra här för att flytta rum, möbler, skåp och föremål.
  // Rutnät: 1 ruta = 2 meter. Kolumn x (väst-öst), rad y (nord-syd).
  // =====================================================================
  const CS = 2, WALL_H = 3, MAP_W = 36, MAP_H = 21;
  const ROOMS = [
    { id: 'A', name: 'Klassrum 1', x0: 1, y0: 1, x1: 10, y1: 7 },
    { id: 'B', name: 'Biblioteket', x0: 12, y0: 1, x1: 21, y1: 7 },
    { id: 'C', name: 'Lärarrummet', x0: 23, y0: 1, x1: 34, y1: 7 },
    { id: 'D', name: 'Klassrum 2', x0: 1, y0: 13, x1: 10, y1: 19 },
    { id: 'E', name: 'Matsalen', x0: 12, y0: 13, x1: 21, y1: 19 },
    { id: 'F', name: 'Entrén', x0: 23, y0: 13, x1: 34, y1: 19 }
  ];
  const CORRIDOR = { x0: 1, y0: 9, x1: 34, y1: 11 };
  const OPENINGS = [[5, 8], [6, 8], [16, 8], [17, 8], [28, 8], [29, 8], [5, 12], [6, 12], [16, 12], [17, 12], [28, 12], [29, 12]];
  const START = [3, 16];                       // spelaren vaknar under bänken här
  const EXIT_X = 29 * CS, EXIT_Z = 20 * CS;    // huvudentréns dörr i södra väggen i Entrén
  const DOOR_CELLS = [[28, 20], [29, 20]];     // väggrutorna bakom dörren, öppnas när koden är rätt
  const DESKS = [[3, 3], [4, 3], [7, 3], [8, 3], [3, 5], [4, 5], [7, 5], [8, 5], [3, 14], [4, 14], [7, 14], [8, 14], [3, 18], [4, 18], [7, 18], [8, 18]];
  const SHELVES = [14, 15, 16, 17, 18, 19].flatMap(c => [[c, 3], [c, 5]]);
  const TABLES = [{ x0: 27, y0: 3, x1: 30, y1: 4, h: 0.8 }, { x0: 14, y0: 15, x1: 19, y1: 15, h: 0.8 }, { x0: 14, y0: 17, x1: 19, y1: 17, h: 0.8 }];
  // [kolumn, rad, vilken vägg skåpet står mot: N/S]
  const LOCKERS = [[1, 1, 'N'], [10, 1, 'N'], [12, 7, 'S'], [21, 1, 'N'], [34, 1, 'N'], [23, 7, 'S'], [1, 13, 'N'], [10, 19, 'S'], [12, 19, 'S'], [21, 13, 'N'], [23, 13, 'N'], [34, 19, 'S'], [1, 9, 'N'], [34, 11, 'S'], [10, 9, 'N'], [24, 11, 'S']];
  // Platser där lappar kan sitta. Tre av fyra används varje runda, den fjärde är en nitlott.
  const NOTE_SPOTS = [
    { room: 'A', c: 5, r: 1, face: 'N', intro: 'Vikarien skrev på en lapp vid tavlan:' },
    { room: 'B', c: 16, r: 1, face: 'N', intro: 'En lapp stack ut ur en bok:' },
    { room: 'C', c: 28, r: 1, face: 'N', intro: 'En lapp på lärarrummets anslagstavla:' },
    { room: 'E', c: 16, r: 19, face: 'S', intro: 'En lapp på matsalens vägg:' }
  ];
  const BATTERY_SPOTS = [[9, 6], [13, 2], [33, 6], [25, 18], [3, 19], [20, 14], [6, 10], [26, 10]];
  const WAYPOINTS = [[5, 4], [16, 4], [28, 6], [6, 16], [16, 16], [28, 16], [4, 10], [17, 10], [30, 10]];
  const MONSTER_STARTS = [[28, 6], [16, 4], [30, 10]];
  // Det som plötsligt står skrivet på tavlorna
  const SCRAWLS = ['JAG SER DIG', 'GÅ INTE UT', 'BAKOM DIG', 'STANNA KVAR', 'TICK TACK', 'KURRAGÖMMA'];

  // ---------- Rutnät ----------
  const g = []; for (let y = 0; y < MAP_H; y++) g.push(new Uint8Array(MAP_W).fill(1));
  const carve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = 0; };
  ROOMS.forEach(r => carve(r.x0, r.y0, r.x1, r.y1)); carve(CORRIDOR.x0, CORRIDOR.y0, CORRIDOR.x1, CORRIDOR.y1);
  OPENINGS.forEach(([x, y]) => { g[y][x] = 0; });
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const bi = (c, r) => r * MAP_W + c;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) blocked[bi(x, y)] = g[y][x];
  const isBlocked = (c, r) => c < 0 || r < 0 || c >= MAP_W || r >= MAP_H || blocked[bi(c, r)] === 1;
  const isWall = (c, r) => c < 0 || r < 0 || c >= MAP_W || r >= MAP_H || g[r][c] === 1;
  const cellOf = (x, z) => [Math.floor(x / CS), Math.floor(z / CS)];
  const wc = c => (c + 0.5) * CS;

  // ---------- Three.js ----------
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  // Samma ljus och färger oavsett three.js-version (r128–r159)
  if (THREE.ColorManagement) THREE.ColorManagement.enabled = false;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#010304');
  scene.fog = new THREE.FogExp2('#010304', 0.08);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 80);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const ambL = new THREE.AmbientLight('#2a4550', 0.22); scene.add(ambL);
  const boltL = new THREE.AmbientLight('#b8c8ff', 0); scene.add(boltL);          // blixtar genom fönstren
  const glow = new THREE.PointLight('#6fb8c8', 0.22, 5, 1.6); camera.add(glow);
  const torch = new THREE.SpotLight('#fff1cc', 2.8, 22, 0.48, 0.5, 1.2);
  camera.add(torch); torch.position.set(0.15, -0.1, 0); torch.target.position.set(0, 0, -5); camera.add(torch.target);
  // Månljus genom utgången i slutet, rött ljus när monstret tar dig
  const fxLight = new THREE.PointLight('#9fb8ff', 0, 14, 1.5); fxLight.position.set(EXIT_X, 2.2, EXIT_Z + 1); scene.add(fxLight);

  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const basic = c => new THREE.MeshBasicMaterial({ color: c });
  const mesh = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (parent || scene).add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  function tex(w, h, fn, rep) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; fn(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }

  // Golv, tak, väggar
  const rr = (a, b) => a + Math.random() * (b - a);
  const floorTex = tex(512, 512, (c) => {
    for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) { const v = Math.floor(rr(108, 140)); c.fillStyle = 'rgb(' + v + ',' + (v + 5) + ',' + (v - 4) + ')'; c.fillRect(tx * 64, ty * 64, 64, 64); }
    for (let k = 0; k < 4000; k++) { c.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,255,255') + ',' + rr(0.02, 0.06) + ')'; c.fillRect(rr(0, 512), rr(0, 512), rr(1, 3), rr(1, 3)); }
    c.strokeStyle = 'rgba(25,25,22,.7)'; c.lineWidth = 2; for (let k = 0; k <= 8; k++) { c.beginPath(); c.moveTo(k * 64, 0); c.lineTo(k * 64, 512); c.moveTo(0, k * 64); c.lineTo(512, k * 64); c.stroke(); }
    for (let k = 0; k < 70; k++) { c.strokeStyle = 'rgba(' + (k % 3 ? '20,20,20' : '230,230,220') + ',' + rr(0.05, 0.14) + ')'; c.lineWidth = rr(1, 3); const x = rr(0, 512), y = rr(0, 512); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rr(-40, 40), y + rr(-10, 10)); c.stroke(); }
    for (let k = 0; k < 7; k++) { const x = rr(0, 512), y = rr(0, 512), gr = c.createRadialGradient(x, y, 2, x, y, rr(25, 60)); gr.addColorStop(0, 'rgba(30,25,15,.22)'); gr.addColorStop(1, 'rgba(30,25,15,0)'); c.fillStyle = gr; c.fillRect(0, 0, 512, 512); }
  }, [MAP_W / 2, MAP_H / 2]);
  const floor = mesh(new THREE.PlaneGeometry(MAP_W * CS, MAP_H * CS), new THREE.MeshLambertMaterial({ map: floorTex }), MAP_W * CS / 2, 0, MAP_H * CS / 2);
  floor.rotation.x = -Math.PI / 2;
  const ceilTex = tex(256, 256, (c) => {
    c.fillStyle = '#a4a6a0'; c.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 1500; k++) { c.fillStyle = 'rgba(0,0,0,' + rr(0.03, 0.1) + ')'; c.fillRect(rr(0, 256), rr(0, 256), 2, 2); }
    c.strokeStyle = '#4c4e4a'; c.lineWidth = 4; c.strokeRect(0, 0, 256, 256); c.beginPath(); c.moveTo(128, 0); c.lineTo(128, 256); c.moveTo(0, 128); c.lineTo(256, 128); c.stroke();
    for (let k = 0; k < 4; k++) { const x = rr(10, 100) + (k % 2) * 128, y = rr(10, 100) + (k >> 1) * 128, gr = c.createRadialGradient(x, y, 2, x, y, rr(15, 30)); gr.addColorStop(0, 'rgba(90,70,30,.35)'); gr.addColorStop(1, 'rgba(90,70,30,0)'); c.fillStyle = gr; c.fillRect(0, 0, 256, 256); }
  }, [MAP_W, MAP_H]);
  const ceil = mesh(new THREE.PlaneGeometry(MAP_W * CS, MAP_H * CS), new THREE.MeshLambertMaterial({ map: ceilTex }), MAP_W * CS / 2, WALL_H, MAP_H * CS / 2);
  ceil.rotation.x = Math.PI / 2;
  const wallTex = tex(256, 384, (c) => {
    c.fillStyle = '#c4bc9e'; c.fillRect(0, 0, 256, 384);
    for (let k = 0; k < 5000; k++) { c.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,255,240') + ',' + rr(0.02, 0.07) + ')'; c.fillRect(rr(0, 256), rr(0, 384), rr(1, 3), rr(1, 3)); }
    let gr = c.createLinearGradient(0, 0, 0, 90); gr.addColorStop(0, 'rgba(20,15,5,.35)'); gr.addColorStop(1, 'rgba(20,15,5,0)'); c.fillStyle = gr; c.fillRect(0, 0, 256, 90);
    c.fillStyle = '#35655d'; c.fillRect(0, 214, 256, 170);
    gr = c.createLinearGradient(0, 214, 0, 384); gr.addColorStop(0, 'rgba(255,255,255,.07)'); gr.addColorStop(1, 'rgba(0,0,0,.35)'); c.fillStyle = gr; c.fillRect(0, 214, 256, 170);
    c.fillStyle = '#e2dcc4'; c.fillRect(0, 208, 256, 6); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 214, 256, 3);
    c.fillStyle = '#1d1a16'; c.fillRect(0, 364, 256, 20);
    for (let k = 0; k < 8; k++) { const x = rr(0, 256), y = rr(20, 300), gr2 = c.createRadialGradient(x, y, 2, x, y, rr(20, 60)); gr2.addColorStop(0, 'rgba(70,55,25,.16)'); gr2.addColorStop(1, 'rgba(70,55,25,0)'); c.fillStyle = gr2; c.fillRect(0, 0, 256, 384); }
    for (let k = 0; k < 40; k++) { c.strokeStyle = 'rgba(0,0,0,' + rr(0.08, 0.22) + ')'; c.lineWidth = rr(1, 3); const x = rr(0, 256), y = rr(240, 360); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rr(-30, 30), y + rr(-6, 6)); c.stroke(); }
    c.strokeStyle = 'rgba(30,25,15,.4)'; c.lineWidth = 1.5; { let x = rr(30, 220), y = 0; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 8; k++) { x += rr(-14, 14); y += rr(8, 24); c.lineTo(x, y); } c.stroke(); }
  });
  {
    const cells = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (g[y][x] !== 1 || DOOR_CELLS.some(([c, r]) => c === x && r === y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H && g[ny][nx] === 0) near = true; }
      if (near) cells.push([x, y]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(CS, WALL_H, CS), new THREE.MeshLambertMaterial({ map: wallTex }), cells.length);
    const m4 = new THREE.Matrix4();
    cells.forEach(([x, y], k) => { m4.makeTranslation(wc(x), WALL_H / 2, wc(y)); im.setMatrixAt(k, m4); });
    scene.add(im);
  }
  // Lysrör i taket. Många är trasiga, några flimrar, och fler går sönder under natten.
  // De två närmaste lysande ger riktigt ljus.
  const lamps = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (g[y][x] === 0 && (x + y * 2) % 5 === 0) {
    const k = lamps.length, mode = k % 4 === 0 ? 2 : k % 3 === 0 ? 1 : 0, mat = basic(mode === 2 ? '#161a1a' : '#c8e8e0');
    box(1.1, 0.06, 0.3, mat, wc(x), WALL_H - 0.04, wc(y)); box(1.2, 0.04, 0.38, lam('#555'), wc(x), WALL_H - 0.01, wc(y));
    lamps.push({ x: wc(x), z: wc(y), mode, mat, k, dead: false, fx: 0, lv: 0 });
  }
  const lampLights = [0, 1].map(() => { const l = new THREE.PointLight('#cfe9ff', 0, 11, 1.4); l.position.set(0, WALL_H - 0.3, 0); scene.add(l); return l; });
  const LAMP_ON = new THREE.Color('#c8e8e0'), LAMP_OFF = new THREE.Color('#26302e');
  let power = 1;   // 1 = full ström, 0 = allt släckt
  const lampLevel = (l) => {
    if (l.mode === 2 || l.dead) return 0;
    let v = l.mode === 1 ? (Math.sin(time * 31 + l.k * 7) > -0.1 || Math.sin(time * 4 + l.k) > 0.6 ? 1 : 0.08) : 1;
    if (time < l.fx) v *= Math.random() < 0.5 ? 0.04 : 1;
    return v * power;
  };

  // Dekor på väggar
  function wallItem(c, r, face, w, h, y, map, color) {
    const mat = map ? new THREE.MeshLambertMaterial({ map }) : lam(color);
    const p = mesh(new THREE.PlaneGeometry(w, h), mat, 0, y, 0);
    if (face === 'N') { p.position.set(wc(c), y, r * CS + 0.04); }
    else if (face === 'S') { p.position.set(wc(c), y, (r + 1) * CS - 0.04); p.rotation.y = Math.PI; }
    return p;
  }
  const textTex = (txt, w, h, bg, fg, font) => tex(w, h, (c) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2); });
  // Griffeltavlor. Någon skriver på dem när du inte tittar.
  const boards = [];
  function drawBoard(b, txt, scary) {
    const c = b.cv.getContext('2d'), w = b.cv.width, h = b.cv.height;
    c.fillStyle = '#1f3b2f'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) { c.fillStyle = 'rgba(255,255,255,' + rr(0.02, 0.06) + ')'; c.fillRect(rr(0, w), rr(0, h), rr(10, 60), rr(4, 14)); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (!scary) { c.fillStyle = '#e8e8e8'; c.font = 'bold 34px sans-serif'; c.fillText(txt, w / 2, h / 2); }
    else {
      c.fillStyle = '#f4f4f0'; c.font = 'bold 34px "Comic Sans MS", "Chalkboard SE", cursive, sans-serif';
      const cw = Math.min(26, (w - 24) / txt.length);
      for (let i = 0; i < txt.length; i++) { c.save(); c.translate(w / 2 + (i - (txt.length - 1) / 2) * cw, h / 2 + rr(-7, 7)); c.rotate(rr(-0.28, 0.28)); c.fillText(txt[i], 0, 0); c.restore(); }
    }
    b.t.needsUpdate = true; b.scary = scary; b.seen = !scary;
  }
  function board(c, r, face, w, h, y, txt) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80;
    const t = new THREE.CanvasTexture(cv), b = { cv, t, txt, mesh: wallItem(c, r, face, w, h, y, t) };
    b.wx = b.mesh.position.x; b.wz = b.mesh.position.z + (face === 'N' ? 0.3 : -0.3);
    drawBoard(b, txt, false); boards.push(b);
  }
  board(8, 1, 'N', 5, 1.6, 1.7, 'Tisdag: bråk');
  board(8, 13, 'N', 5, 1.6, 1.7, 'Läxa: sidan 42');
  board(7, 19, 'S', 4, 1.4, 1.7, 'Välkomna!');
  wallItem(24, 19, 'S', 3.2, 1.2, 1.8, textTex('Kapprum', 256, 64, '#5a3a22', '#f4e4c1', 'bold 34px sans-serif'));
  wallItem(25, 1, 'N', 2.4, 1.2, 1.7, textTex('LÄRARRUM', 256, 80, '#222', '#ffd43b', 'bold 36px sans-serif'));
  wallItem(13, 1, 'N', 2.4, 1.2, 1.7, textTex('BIBLIOTEK', 256, 80, '#222', '#8ce99a', 'bold 36px sans-serif'));
  // Barnteckningar i korridoren. Vissa av dem har ritat något som inte borde vara där.
  function drawing(k) {
    return tex(128, 160, (c) => {
      c.fillStyle = '#ece5cf'; c.fillRect(0, 0, 128, 160);
      for (let i = 0; i < 260; i++) { c.fillStyle = 'rgba(90,70,40,' + rr(0.02, 0.07) + ')'; c.fillRect(rr(0, 128), rr(0, 160), 2, 2); }
      const cr = (col, w, pts) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = c.lineJoin = 'round'; c.globalAlpha = 0.8; for (let n = 0; n < 2; n++) { c.beginPath(); pts.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x + rr(-1.2, 1.2), y + rr(-1.2, 1.2))); c.stroke(); } c.globalAlpha = 1; };
      const ring = (x, y, r) => { const p = []; for (let a = 0; a <= 6.5; a += 0.45) p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); return p; };
      const fig = (x, y, s, col) => { cr(col, 2.5, ring(x, y - 17 * s, 5 * s)); cr(col, 2.5, [[x, y - 12 * s], [x, y + 3 * s]]); cr(col, 2.5, [[x - 8 * s, y - 4 * s], [x, y - 8 * s], [x + 8 * s, y - 4 * s]]); cr(col, 2.5, [[x - 6 * s, y + 15 * s], [x, y + 3 * s], [x + 6 * s, y + 15 * s]]); };
      const word = (t, x, y, col, s) => { c.fillStyle = col; c.font = 'bold ' + s + 'px "Comic Sans MS", cursive, sans-serif'; c.textAlign = 'center'; c.fillText(t, x, y); };
      const eyes = (x, y, gap) => { c.fillStyle = '#e21b12'; c.beginPath(); c.arc(x - gap, y, 2.6, 0, 7); c.arc(x + gap, y, 2.6, 0, 7); c.fill(); };
      const tall = (x) => {
        for (let i = 0; i < 26; i++) cr('#141014', 3, [[x + rr(-5, 5), rr(40, 52)], [x + rr(-7, 7), rr(110, 138)]]);
        c.fillStyle = '#141014'; c.beginPath(); c.ellipse(x, 32, 8, 11, 0, 0, 7); c.fill();
        cr('#141014', 2.5, [[x - 5, 50], [x - 16, 90], [x - 18, 128]]); cr('#141014', 2.5, [[x + 5, 50], [x + 16, 90], [x + 18, 128]]); eyes(x, 31, 3.5);
      };
      cr('#3f8f2d', 5, [[0, 142], [40, 138], [84, 143], [128, 139]]);
      if (k === 0) {
        cr('#f2c200', 3, ring(22, 22, 10)); for (let a = 0; a < 6.3; a += 0.8) cr('#f2c200', 2, [[22 + Math.cos(a) * 14, 22 + Math.sin(a) * 14], [22 + Math.cos(a) * 20, 22 + Math.sin(a) * 20]]);
        cr('#9c5a2a', 3, [[60, 138], [60, 96], [110, 96], [110, 138]]); cr('#d0312d', 3, [[55, 98], [85, 70], [115, 98]]); cr('#2b6cb0', 2.5, [[76, 138], [76, 118], [92, 118], [92, 138]]);
        fig(22, 118, 0.9, '#2b6cb0'); fig(42, 122, 0.7, '#d0312d');
      } else if (k === 1) {
        fig(24, 120, 0.85, '#2b6cb0'); fig(46, 124, 0.65, '#d0312d'); fig(66, 120, 0.85, '#7b3fa0'); tall(100); word('?', 100, 16, '#141014', 18);
      } else if (k === 2) {
        cr('#7a4a2a', 3, [[14, 138], [14, 52], [114, 52], [114, 138]]); cr('#555', 3, [[8, 54], [64, 26], [120, 54]]);
        for (let y = 64; y < 120; y += 26) for (let x = 24; x < 110; x += 30) cr('#2b6cb0', 2, [[x, y], [x + 18, y], [x + 18, y + 16], [x, y + 16], [x, y]]);
        c.fillStyle = '#111'; c.fillRect(85, 91, 17, 15); eyes(93, 98, 3); word('SKOLAN', 64, 20, '#2b6cb0', 16);
      } else if (k === 3) {
        cr('#222', 3, ring(64, 70, 38)); for (let h = 0; h < 12; h++) { const a = h / 12 * Math.PI * 2; cr('#222', 2, [[64 + Math.sin(a) * 31, 70 - Math.cos(a) * 31], [64 + Math.sin(a) * 35, 70 - Math.cos(a) * 35]]); }
        cr('#d0312d', 3.5, [[64, 70], [64, 44]]); cr('#d0312d', 2.5, [[64, 70], [65, 38]]); word('TICK TACK', 64, 128, '#d0312d', 15);
      } else {
        for (let i = 0; i < 70; i++) cr('#151215', 3, [[rr(4, 124), rr(4, 120)], [rr(4, 124), rr(4, 120)]]);
        fig(64, 118, 0.7, '#ece5cf'); eyes(40, 40, 4); eyes(92, 60, 4); word('GÖM DIG', 64, 156, '#d0312d', 15);
      }
    });
  }
  for (let c = 2; c <= 33; c += 3) {
    if (g[8][c] === 1 && c !== 4 && c !== 7) wallItem(c, 9, 'N', 0.9, 1.2, 1.7, drawing((c * 7) % 5));
    if (g[12][c] === 1 && c !== 4 && c !== 7 && c !== 14) wallItem(c, 11, 'S', 0.9, 1.2, 1.7, drawing((c * 3 + 1) % 5));
  }
  // Klösmärken på väggarna
  {
    const scratchTex = tex(128, 128, (c) => {
      for (let i = 0; i < 4; i++) {
        const x = 28 + i * 20 + rr(-3, 3); c.lineCap = 'round';
        c.strokeStyle = 'rgba(12,9,6,.85)'; c.lineWidth = rr(3, 5); c.beginPath(); c.moveTo(x, 10 + i * 4); c.quadraticCurveTo(x + 10, 64, x - 6 + rr(-4, 4), 118 - i * 3); c.stroke();
        c.strokeStyle = 'rgba(235,230,215,.3)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + 2, 12 + i * 4); c.quadraticCurveTo(x + 12, 64, x - 4, 116 - i * 3); c.stroke();
      }
    });
    const scratchMat = new THREE.MeshLambertMaterial({ map: scratchTex, transparent: true, depthWrite: false });
    [[3, 9, 'N'], [19, 11, 'S'], [31, 9, 'N'], [27, 11, 'S'], [2, 13, 'N'], [18, 1, 'N'], [32, 13, 'N'], [20, 19, 'S']].forEach(([c, r, f]) => {
      const m = wallItem(c, r, f, 1.1, 1.1, rr(1.2, 2.0), null, '#000'); m.material = scratchMat; m.position.x += rr(0, 0.35); m.position.z += f === 'N' ? 0.01 : -0.01;
    });
  }
  // Väggklocka i korridoren som visar spelklockan
  const clockCv = document.createElement('canvas'); clockCv.width = clockCv.height = 128;
  const clockTex = new THREE.CanvasTexture(clockCv);
  wallItem(14, 11, 'S', 1.1, 1.1, 2.2, clockTex);
  let clockMin = -1;
  function drawWallClock(min) {
    if (min === clockMin) return; clockMin = min;
    const c = clockCv.getContext('2d'); c.fillStyle = '#e8e8e8'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill();
    c.strokeStyle = '#111'; c.lineWidth = 5; c.stroke();
    const h = ((min / 60) % 12) / 12 * Math.PI * 2, m = (min % 60) / 60 * Math.PI * 2;
    c.lineCap = 'round'; c.lineWidth = 7; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.sin(h) * 30, 64 - Math.cos(h) * 30); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.sin(m) * 46, 64 - Math.cos(m) * 46); c.stroke();
    clockTex.needsUpdate = true;
  }
  // Utgångsdörren: karm, två skjutdörrar, kodlås, och den månbelysta skolgården bakom
  const exitDoor = { leaves: [], keypad: basic('#ff3b30') };
  {
    const wood = lam('#3d3128');
    for (const s of [-1, 1]) box(0.25, 2.6, 0.32, wood, EXIT_X + s * 2.0, 1.3, EXIT_Z + 0.02);
    box(4.25, 0.5, 0.32, wood, EXIT_X, 2.75, EXIT_Z + 0.02);
    const dm = lam('#27465a'), glass = basic('#152236');
    for (const s of [-1, 1]) { const m = box(1.92, 2.52, 0.1, dm, EXIT_X + s * 0.96, 1.26, EXIT_Z - 0.22); box(0.6, 0.9, 0.02, glass, 0, 0.4, -0.06, m); exitDoor.leaves.push({ m, s }); }
    const sign = mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: textTex('UTGÅNG', 256, 64, '#0a6b2a', '#ffffff', 'bold 40px sans-serif') }), EXIT_X, 2.75, EXIT_Z - 0.3);
    sign.rotation.y = Math.PI;
    box(0.3, 0.45, 0.1, exitDoor.keypad, EXIT_X + 2.5, 1.3, EXIT_Z - 0.1);
    const outTex = tex(256, 192, (c) => {
      const gr = c.createLinearGradient(0, 0, 0, 192); gr.addColorStop(0, '#0b1426'); gr.addColorStop(0.6, '#24385a'); gr.addColorStop(1, '#0a0f18'); c.fillStyle = gr; c.fillRect(0, 0, 256, 192);
      const mg = c.createRadialGradient(180, 46, 4, 180, 46, 40); mg.addColorStop(0, 'rgba(230,238,255,1)'); mg.addColorStop(0.3, 'rgba(200,215,255,.5)'); mg.addColorStop(1, 'rgba(200,215,255,0)'); c.fillStyle = mg; c.fillRect(0, 0, 256, 192);
      c.fillStyle = '#eef3ff'; c.beginPath(); c.arc(180, 46, 11, 0, 7); c.fill();
      c.fillStyle = '#070b12'; c.beginPath(); c.moveTo(0, 192); for (let x = 0; x <= 256; x += 6) c.lineTo(x, 120 - Math.abs(Math.sin(x * 0.07)) * 26 - (x % 12 ? 0 : 8)); c.lineTo(256, 192); c.fill();
      c.fillStyle = '#1c2430'; c.fillRect(0, 150, 256, 42); c.fillStyle = '#2c3646'; c.beginPath(); c.moveTo(100, 192); c.lineTo(156, 192); c.lineTo(136, 150); c.lineTo(120, 150); c.fill();
      c.fillStyle = '#05070b'; c.fillRect(46, 92, 4, 60); const lg = c.createRadialGradient(48, 92, 1, 48, 92, 26); lg.addColorStop(0, 'rgba(255,220,150,.9)'); lg.addColorStop(1, 'rgba(255,220,150,0)'); c.fillStyle = lg; c.fillRect(20, 66, 56, 56);
    });
    mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ map: outTex, fog: false }), EXIT_X, 1.5, EXIT_Z + 1.9).rotation.y = Math.PI;
  }

  // Fönster mot ett oväder (fönster på ytterväggarna + ljusfläck på golvet som lyser upp vid blixtar)
  const WINDOWS = [[3, 1, 'N'], [19, 1, 'N'], [31, 1, 'N'], [33, 1, 'N'], [2, 19, 'S'], [4, 19, 'S'], [13, 19, 'S'], [19, 19, 'S'], [26, 19, 'S'], [32, 19, 'S']];
  let winMat, patchMat;
  {
    const winTex = tex(128, 160, (c) => {
      const gr = c.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#0e1626'); gr.addColorStop(1, '#1a2438'); c.fillStyle = gr; c.fillRect(0, 0, 128, 160);
      c.fillStyle = 'rgba(200,215,255,.55)'; c.beginPath(); c.arc(92, 36, 8, 0, 7); c.fill();
      for (let k = 0; k < 9; k++) { c.fillStyle = 'rgba(10,14,24,' + rr(0.5, 0.85) + ')'; c.beginPath(); c.ellipse(rr(0, 128), rr(10, 80), rr(20, 45), rr(6, 14), 0, 0, 7); c.fill(); }
      c.fillStyle = '#05080f'; c.beginPath(); c.moveTo(0, 160); for (let x = 0; x <= 128; x += 8) c.lineTo(x, 128 + Math.sin(x * 0.3) * 8 + (x % 16 ? 4 : 0)); c.lineTo(128, 160); c.fill();
      c.strokeStyle = '#05080f'; c.lineWidth = 3; c.beginPath(); c.moveTo(30, 135); c.lineTo(34, 80); c.lineTo(20, 55); c.moveTo(33, 95); c.lineTo(50, 66); c.moveTo(34, 80); c.lineTo(40, 50); c.stroke();
      c.strokeStyle = 'rgba(180,200,230,.18)'; c.lineWidth = 1; for (let k = 0; k < 40; k++) { const x = rr(0, 128), y = rr(0, 150); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y + rr(6, 14)); c.stroke(); }
      c.strokeStyle = '#d8d4c6'; c.lineWidth = 8; c.strokeRect(4, 4, 120, 152); c.lineWidth = 5; c.beginPath(); c.moveTo(64, 0); c.lineTo(64, 160); c.moveTo(0, 80); c.lineTo(128, 80); c.stroke();
    });
    const patchTex = tex(64, 128, (c) => { const gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 128); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(30, 0, 4, 128); c.fillRect(0, 62, 64, 4); });
    winMat = new THREE.MeshBasicMaterial({ map: winTex }); patchMat = new THREE.MeshBasicMaterial({ map: patchTex, color: '#6f9bd8', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    WINDOWS.forEach(([c, r, f]) => {
      const w = wallItem(c, r, f, 1.5, 1.6, 1.75, null, '#000'); w.material = winMat;
      const x = wc(c), wallZ = f === 'N' ? r * CS : (r + 1) * CS, dir = f === 'N' ? 1 : -1;
      box(1.7, 0.08, 0.3, lam('#cfc9b8'), x, 0.92, wallZ + dir * 0.14);                       // fönsterbräda
      box(1.0, 0.7, 0.14, lam('#8f918c'), x, 0.5, wallZ + dir * 0.1);                          // element
      const pt = mesh(new THREE.PlaneGeometry(1.5, 3.4), patchMat, x, 0.03, wallZ + dir * 1.9); pt.rotation.x = -Math.PI / 2; pt.rotation.z = f === 'N' ? 0 : Math.PI;
    });
  }
  // Dörrkarmar vid rummens ingångar
  for (let i = 0; i < OPENINGS.length; i += 2) {
    const [x1, y1] = OPENINGS[i], cx = (x1 + 1) * CS, cz = wc(y1), wood = lam('#4b392b');
    box(4.0, 0.6, 2.0, wood, cx, 2.7, cz); box(0.14, 2.4, 2.02, wood, cx - 1.93, 1.2, cz); box(0.14, 2.4, 2.02, wood, cx + 1.93, 1.2, cz);
  }
  // Anslagstavlor med nålade lappar i korridoren
  {
    const cork = tex(256, 128, (c) => { c.fillStyle = '#8c6a44'; c.fillRect(0, 0, 256, 128); for (let k = 0; k < 600; k++) { c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(rr(0, 256), rr(0, 128), 2, 2); } for (let k = 0; k < 9; k++) { c.save(); c.translate(rr(15, 235), rr(15, 110)); c.rotate(rr(-0.3, 0.3)); c.fillStyle = ['#f6f0d8', '#f4c6d0', '#cfe3f4', '#f7e9a0'][k % 4]; c.fillRect(-18, -22, 36, 44); c.fillStyle = '#999'; for (let y = -12; y < 18; y += 8) c.fillRect(-12, y, 24, 2); c.fillStyle = '#d33'; c.beginPath(); c.arc(0, -18, 2.5, 0, 7); c.fill(); c.restore(); } c.strokeStyle = '#4b392b'; c.lineWidth = 8; c.strokeRect(0, 0, 256, 128); });
    wallItem(9, 9, 'N', 2.4, 1.2, 1.7, cork); wallItem(21, 9, 'N', 2.4, 1.2, 1.7, cork); wallItem(24, 11, 'S', 2.4, 1.2, 1.7, cork);
    // brandsläckare
    for (const [c, f] of [[12, 'N'], [26, 'S']]) { const z = f === 'N' ? 9 * CS + 0.12 : 12 * CS - 0.12; mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), lam('#b42318'), wc(c), 1.05, z); box(0.06, 0.1, 0.06, lam('#222'), wc(c), 1.38, z); }
  }
  // Dammkorn som svävar i ficklampans sken
  const dustN = 160, dustPos = new Float32Array(dustN * 3), dustGeo = new THREE.BufferGeometry();
  for (let i = 0; i < dustN; i++) { dustPos[i * 3] = rr(-6, 6); dustPos[i * 3 + 1] = rr(0, 3); dustPos[i * 3 + 2] = rr(-6, 6); }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#b8c8d0', size: 0.014, transparent: true, opacity: 0.6, depthWrite: false })); dust.frustumCulled = false; scene.add(dust);

  // Möbler
  const deskTop = lam('#b5835a'), deskLeg = lam('#4a4a50');
  DESKS.forEach(([c, r]) => { box(1.5, 0.07, 0.95, deskTop, wc(c), 0.78, wc(r)); box(1.3, 0.7, 0.08, deskLeg, wc(c), 0.4, wc(r) + 0.38); blocked[bi(c, r)] = 1;
    const chairM = lam('#2c5f8a'); box(0.5, 0.05, 0.48, chairM, wc(c) + 0.1, 0.46, wc(r) + 0.62); box(0.5, 0.42, 0.05, chairM, wc(c) + 0.1, 0.72, wc(r) + 0.86); box(0.05, 0.44, 0.05, deskLeg, wc(c) + 0.1, 0.22, wc(r) + 0.62);
    if ((c + r) % 3 === 0) box(0.3, 0.03, 0.22, lam(['#c0392b', '#2980b9', '#27ae60'][(c + r) % 3]), wc(c) - 0.3, 0.84, wc(r) - 0.05);
  });
  const spineTex = tex(64, 64, (c) => { c.fillStyle = '#3a2a1e'; c.fillRect(0, 0, 64, 64); for (let y = 6; y < 64; y += 16) { c.fillStyle = '#26190f'; c.fillRect(0, y + 10, 64, 3); for (let x = 0; x < 64; x += 5) { c.fillStyle = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#ecf0f1'][Math.floor(Math.random() * 6)]; c.fillRect(x, y, 4, 9); } } });
  SHELVES.forEach(([c, r]) => { box(1.9, 2.3, 0.9, new THREE.MeshLambertMaterial({ map: spineTex }), wc(c), 1.15, wc(r)); blocked[bi(c, r)] = 1; });
  TABLES.forEach(t => {
    const w = (t.x1 - t.x0 + 1) * CS - 0.3, d = (t.y1 - t.y0 + 1) * CS - 0.5;
    box(w, 0.08, d, lam('#a8764a'), (t.x0 + t.x1 + 1) / 2 * CS, 0.8, (t.y0 + t.y1 + 1) / 2 * CS);
    box(w - 0.4, 0.75, d - 0.3, lam('#3b3d44'), (t.x0 + t.x1 + 1) / 2 * CS, 0.38, (t.y0 + t.y1 + 1) / 2 * CS);
    for (let y = t.y0; y <= t.y1; y++) for (let x = t.x0; x <= t.x1; x++) blocked[bi(x, y)] = 1;
  });
  const lockers = LOCKERS.map(([c, r, f]) => {
    const z = f === 'N' ? r * CS + 0.42 : (r + 1) * CS - 0.42, x = wc(c);
    const m = box(1.1, 2.1, 0.75, lam('#4d6b82'), x, 1.05, z);
    box(0.9, 0.04, 0.02, basic('#1b2a36'), 0, 0.65, f === 'N' ? 0.39 : -0.39, m);
    box(0.08, 0.3, 0.05, lam('#c9d4dc'), 0.35, -0.05, f === 'N' ? 0.4 : -0.4, m);
    blocked[bi(c, r)] = 1;
    return { x, z, c, r, outYaw: f === 'N' ? Math.PI : 0, mesh: m, shake: 0 };   // utåt från väggen
  });
  const lockerFront = l => [wc(l.c), wc(l.r + (l.outYaw === Math.PI ? 1 : -1))];

  // ---------- Monstret: långt, blekt och snett. Läskigt, men utan blod ----------
  const mon = new THREE.Group();
  const pale = lam('#cfc8bb'), dark = lam('#0e0a14'), rag = lam('#1b1a22'), claw = lam('#15121a');
  const redEye = basic('#ff2a1a'), blackB = basic('#000000'), toothB = basic('#efe9d6');
  // Ögonen lyser genom mörkret och dimman: två röda prickar långt bort i korridoren
  const glowTex = tex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  const eyeGlow = new THREE.SpriteMaterial({ map: glowTex, color: '#ff2a1a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  function makeHead(parent) {
    const hg = new THREE.Group(), glows = []; parent.add(hg);
    mesh(new THREE.SphereGeometry(0.3, 14, 12), pale, 0, 0, 0, hg).scale.set(0.78, 1.28, 0.9);
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.1, 10, 8), blackB, s * 0.14, 0.1, 0.22, hg).scale.set(1, 1.35, 0.6);
      mesh(new THREE.SphereGeometry(0.028, 8, 6), redEye, s * 0.14, 0.1, 0.29, hg);
      const sp = new THREE.Sprite(eyeGlow); sp.scale.set(0.2, 0.2, 1); sp.position.set(s * 0.14, 0.1, 0.31); hg.add(sp); glows.push(sp);
    }
    mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), blackB, 0, -0.02, 0.28, hg);
    for (let k = -3; k <= 3; k++) mesh(new THREE.ConeGeometry(0.03, 0.12, 4), toothB, k * 0.065, -0.2, 0.27 - Math.abs(k) * 0.02, hg).rotation.x = Math.PI;
    mesh(new THREE.BoxGeometry(0.46, 0.03, 0.05), blackB, 0, -0.18, 0.25, hg);
    const jaw = new THREE.Group(); jaw.position.set(0, -0.2, 0.05); hg.add(jaw);
    mesh(new THREE.BoxGeometry(0.4, 0.18, 0.28), blackB, 0, -0.1, 0.12, jaw);
    for (let k = -3; k <= 3; k++) mesh(new THREE.ConeGeometry(0.03, 0.12, 4), toothB, k * 0.065, -0.02, 0.24 - Math.abs(k) * 0.025, jaw);
    mesh(new THREE.SphereGeometry(0.1, 8, 6), pale, 0, -0.22, 0.12, jaw).scale.set(1.2, 0.8, 1);
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 1.6 - 0.8, len = 0.7 + Math.random() * 0.7; mesh(new THREE.CylinderGeometry(0.012, 0.006, len, 4), dark, Math.sin(a) * 0.22, 0.28 - len / 2, -0.1 - Math.cos(a) * 0.05, hg); }
    return { g: hg, jaw, glows };
  }
  const legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(s * 0.2, 1.05, 0); mon.add(l); mesh(new THREE.CylinderGeometry(0.08, 0.05, 1.05, 6), dark, 0, -0.52, 0, l); mesh(new THREE.ConeGeometry(0.1, 0.35, 5), claw, 0, -1.05, 0.12, l).rotation.x = Math.PI / 2; return l; });
  const upper = new THREE.Group(); upper.position.set(0, 1.05, 0); mon.add(upper);
  mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.15, 8), rag, 0, 0.55, 0, upper);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mesh(new THREE.ConeGeometry(0.07, 0.6, 4), rag, Math.sin(a) * 0.3, 0.1, Math.cos(a) * 0.28, upper).rotation.x = Math.PI; }
  const neck = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6), pale, 0, 1.3, 0.08, upper); neck.rotation.x = 0.4;
  const { g: headG, jaw, glows: eyeSprites } = makeHead(upper); headG.position.set(0, 1.62, 0.2);
  const eyeLight = new THREE.PointLight('#ff2a1a', 0.9, 6, 2); eyeLight.position.set(0, 0.1, 0.45); headG.add(eyeLight);
  const armP = [-1, 1].map(s => {
    const a = new THREE.Group(); a.position.set(s * 0.34, 1.1, 0); upper.add(a);
    mesh(new THREE.CylinderGeometry(0.055, 0.04, 1.0, 6), dark, 0, -0.5, 0, a);
    const f = new THREE.Group(); f.position.set(0, -1.0, 0); a.add(f);
    mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.95, 6), dark, 0, -0.47, 0, f); mesh(new THREE.SphereGeometry(0.06, 6, 5), pale, 0, -0.97, 0, f);
    for (let k = -1; k <= 2; k++) mesh(new THREE.ConeGeometry(0.018, 0.36, 4), claw, k * 0.035 - 0.017, -1.15, 0, f);
    return { a, f, s };
  });
  mon.scale.setScalar(1.12); scene.add(mon);
  // Ansiktet som kastar sig mot kameran när du blir tagen
  const js = new THREE.Group(); js.visible = false; camera.add(js);
  const jsHead = makeHead(js); jsHead.glows.forEach(e => e.scale.set(0.09, 0.09, 1));
  // Skuggan: en tyst gestalt som bara syns en kort stund och sedan är borta
  const ghostEye = new THREE.SpriteMaterial({ map: glowTex, color: '#dfe8ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.75 });
  const ghost = new THREE.Group(), ghostEyes = []; ghost.visible = false; scene.add(ghost);
  {
    const gm = basic('#050506');
    mesh(new THREE.CylinderGeometry(0.1, 0.3, 2.0, 7), gm, 0, 1.0, 0, ghost); mesh(new THREE.SphereGeometry(0.17, 10, 8), gm, 0, 2.15, 0, ghost).scale.set(0.85, 1.25, 0.9);
    for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.03, 0.02, 1.5, 5), gm, s * 0.24, 1.15, 0, ghost).rotation.z = s * 0.08; const e = new THREE.Sprite(ghostEye); e.scale.set(0.09, 0.09, 1); e.position.set(s * 0.06, 2.18, 0.15); ghost.add(e); ghostEyes.push(e); }
  }
  // Fotspår: mörka klospår där monstret har gått. De bleknar bort efter en stund.
  const fpTex = tex(64, 96, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(32, 70, 13, 17, 0, 0, 7); c.fill(); for (const [x, a] of [[18, -0.35], [32, 0], [46, 0.35]]) { c.save(); c.translate(x, 46); c.rotate(a); c.beginPath(); c.ellipse(0, -16, 4.5, 17, 0, 0, 7); c.fill(); c.restore(); } });
  const prints = [];
  for (let i = 0; i < 36; i++) { const m = mesh(new THREE.PlaneGeometry(0.34, 0.5), new THREE.MeshBasicMaterial({ map: fpTex, color: '#060405', transparent: true, opacity: 0, depthWrite: false }), 0, 0.012, 0); m.rotation.x = -Math.PI / 2; prints.push({ m, born: -99 }); }
  let printK = 0, printSide = 1;
  function addPrint() {
    const p = prints[printK++ % prints.length], px = Math.cos(M.face), pz = -Math.sin(M.face);
    p.m.position.set(M.x + px * 0.17 * printSide, 0.012, M.z + pz * 0.17 * printSide); p.m.rotation.z = M.face + Math.PI; p.born = time; printSide = -printSide;
  }

  // ---------- Dynamiska föremål (slumpas varje runda) ----------
  const dyn = new THREE.Group(); scene.add(dyn);
  let notes = [], batteries = [], digits = [], found = [];
  const WORDS = [['BOK', 3], ['BÄNK', 4], ['SKÅP', 4], ['SKOLA', 5], ['KRITA', 5], ['TAVLA', 5], ['SLÖJD', 5], ['KLOCKA', 6], ['LÄRARE', 6], ['GÖTEBORG', 8], ['VICTORIA', 8], ['KLASSRUM', 8], ['BIBLIOTEK', 9]];
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const nFound = () => found.filter(Boolean).length;
  function riddle(d) {
    const opts = [];
    opts.push(() => { const k = rint(1, 5); return (d + k) + ' − ' + k + ' = ?'; });
    if (d >= 2) opts.push(() => { const a = rint(1, d - 1); return a + ' + ' + (d - a) + ' = ?'; });
    const ws = WORDS.filter(w => w[1] === d); if (ws.length) opts.push(() => 'Hur många bokstäver har ordet ' + pick(ws)[0] + '?');
    opts.push(() => { for (let n = 0; n < 20; n++) { const a = rint(2, 4), b = rint(2, 4), c = a * b - d; if (c >= 0 && c <= 9) return a + ' × ' + b + ' − ' + c + ' = ?'; } return (d + 3) + ' − 3 = ?'; });
    return pick(opts)();
  }
  function placeRandom() {
    while (dyn.children.length) dyn.remove(dyn.children[0]);
    digits = [rint(1, 9), rint(1, 9), rint(1, 9)]; found = [false, false, false];
    const spots = NOTE_SPOTS.slice().sort(() => Math.random() - 0.5);
    notes = spots.map((s, k) => {
      const paperTex = tex(64, 80, (c) => { c.fillStyle = '#f6f0d8'; c.fillRect(0, 0, 64, 80); c.fillStyle = '#7a7a7a'; for (let y = 14; y < 70; y += 9) c.fillRect(8, y, 48, 2); });
      const p = wallItem(s.c, s.r, s.face, 0.5, 0.65, 1.45, paperTex);
      p.position.x += (s.room === 'C' ? 0.6 : 0); dyn.add(p);
      return { x: p.position.x, z: p.position.z + (s.face === 'N' ? 0.9 : -0.9), wx: p.position.x, wz: p.position.z, spot: s, idx: k < 3 ? k : -1, read: false, mesh: p };
    });
    notes.forEach(n => { if (n.idx >= 0) n.riddle = riddle(digits[n.idx]); });
    batteries = BATTERY_SPOTS.slice().sort(() => Math.random() - 0.5).slice(0, 3).map(([c, r]) => {
      const m = new THREE.Group(); mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 8), basic('#ffe066'), 0, 0, 0, m); mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), basic('#ffffff'), 0, 0.19, 0, m);
      m.position.set(wc(c), 0.5, wc(r)); dyn.add(m); return { x: wc(c), z: wc(r), mesh: m, got: false };
    });
    $('notes').innerHTML = '';
  }

  // ---------- Spelartillstånd ----------
  const player = { x: 0, z: 0, yaw: 0, pitch: 0, r: 0.35, noise: 0, hid: null, hideCool: 0, moving: false, running: false, breath: 100, winded: 0, holding: false, holdLock: false, gasp: false };
  const flash = { on: false, bat: 100, flick: 0 };
  let chalk = 3, state = 'menu', elapsed = 0, thrown = [], time = 0, msgT = 0, msgQ = [];
  let fear = 0, spike = 0, shake = 0, fin = null, dieT = 0, dieKind = '', timers = [], bolts = [], holdTouch = false, hintBreath = false;
  const M = { x: 0, z: 0, face: 0, state: 'patrol', path: [], wait: 0, lost: 0, rp: 0, last: [0, 0], certain: false, sniffL: null, sniffT: 0, exposed: 0, snd: 0, checkQ: [], stareT: 0, passChecked: false, quiet: 0, glitch: 2, gt: 0, gx: 0, gz: 0, spd: 0, sw: 0, ph: 0, pd: 0 };
  const fadeEl = $('fade'), clockEl = $('clock'), promptEl = $('prompt'), batF = $('batf'), batT = $('batt'), brF = $('brf'), vigEl = $('vig'), darkEl = $('dark'), grainEl = $('grain');
  const later = (s, fn) => timers.push([elapsed + s, fn]);
  const fearKick = v => { spike = Math.max(spike, v); };

  function say(t, d = 2.6) { msgQ.push([t, d]); if (msgQ.length > 3) msgQ.shift(); }
  function updMsg(dt) {
    msgT -= dt;
    if (msgT <= 0) { if (msgQ.length) { const [t, d] = msgQ.shift(); $('msg').textContent = t; $('msg').classList.add('show'); msgT = d; } else $('msg').classList.remove('show'); }
  }

  // ---------- Ljud (Web Audio, inga filer). Monstrets ljud kommer från där det står ----------
  let ac = null, master = null, muf = null, bus = null, noiseBuf = null;
  let droneG, droneLP, tenG, monPan, monLP, breathG, growlG;
  function panner(ref) { const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref || 2; p.rolloffFactor = 1.3; p.maxDistance = 80; return p; }
  function setP(p, x, y, z) { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); }
  // Ett ljud som hörs från en plats i skolan. Bakom väggar låter det dovt.
  function at(x, z, y = 1.2, ref) {
    if (!ac) return null; const p = panner(ref), lp = ac.createBiquadFilter();
    setP(p, x, y, z); lp.frequency.value = los(x, z, player.x, player.z, true) ? 16000 : 750; lp.connect(p); p.connect(bus); return lp;
  }
  function audio() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      master = ac.createGain(); muf = ac.createBiquadFilter(); muf.frequency.value = 20000;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      master.connect(muf); muf.connect(comp); comp.connect(ac.destination);
      // Efterklang: tomma, hårda korridorer
      const len = Math.floor(ac.sampleRate * 2.6), ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      const verb = ac.createConvolver(), vg = ac.createGain(); verb.buffer = ir; vg.gain.value = 0.3; verb.connect(vg); vg.connect(master);
      bus = ac.createGain(); bus.connect(master); bus.connect(verb);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      // Mullrande bakgrund som blir mörkare och starkare ju räddare du är
      droneLP = ac.createBiquadFilter(); droneLP.frequency.value = 150; droneG = ac.createGain(); droneG.gain.value = 0.016; droneLP.connect(droneG); droneG.connect(bus);
      for (const f of [55, 58.5, 41.2]) { const o = ac.createOscillator(); o.type = f < 50 ? 'sine' : 'sawtooth'; o.frequency.value = f; o.connect(droneLP); o.start(); }
      tenG = ac.createGain(); tenG.gain.value = 0; tenG.connect(bus);
      for (const f of [2960, 2967]) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(tenG); o.start(); }
      // Regn mot fönstren
      { const s = ac.createBufferSource(), hp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(), gn = ac.createGain(); s.buffer = noiseBuf; s.loop = true; hp.type = 'highpass'; hp.frequency.value = 1200; lp.frequency.value = 6000; gn.gain.value = 0.018; s.connect(hp); hp.connect(lp); lp.connect(gn); gn.connect(master); s.start(); }
      // Monstrets andning och morrande
      monPan = panner(2.5); monLP = ac.createBiquadFilter(); monLP.frequency.value = 9000; monLP.connect(monPan); monPan.connect(bus);
      { const s = ac.createBufferSource(), bp = ac.createBiquadFilter(); s.buffer = noiseBuf; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 1.4; breathG = ac.createGain(); breathG.gain.value = 0; s.connect(bp); bp.connect(breathG); breathG.connect(monLP); s.start(); }
      growlG = ac.createGain(); growlG.gain.value = 0; const gl = ac.createBiquadFilter(); gl.frequency.value = 320; gl.connect(growlG); growlG.connect(monLP);
      const vib = ac.createOscillator(), vibG = ac.createGain(); vib.frequency.value = 7; vibG.gain.value = 3; vib.connect(vibG); vib.start();
      for (const f of [46, 46.8, 93]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; vibG.connect(o.frequency); o.connect(gl); o.start(); }
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function tone(f, d, type = 'sine', v = 0.1, slide = 0, delay = 0, dest) {
    if (!ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
    gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn); gn.connect(dest || bus); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, v, f = 1200, delay = 0, dest, ftype = 'lowpass', q = 1, att = 0) {
    if (!ac) return; const t = ac.currentTime + delay, s = ac.createBufferSource(), gn = ac.createGain(), fl = ac.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true; fl.type = ftype; fl.frequency.value = f; fl.Q.value = q;
    if (att) { gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(v, t + att); } else gn.gain.setValueAtTime(v, t);
    gn.gain.linearRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(gn); gn.connect(dest || bus); s.start(t, Math.random() * 1.5); s.stop(t + d + 0.05);
  }
  // Skrikande stråkar
  function strings(fs, d, v, att, dest) {
    if (!ac) return; const t = ac.currentTime, env = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 6.2; lg.gain.value = 25; lfo.connect(lg);
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(v, t + att); env.gain.exponentialRampToValueAtTime(0.0001, t + d); env.connect(dest || bus);
    fs.forEach(f => { const o = ac.createOscillator(), hp = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lg.connect(o.detune); hp.type = 'highpass'; hp.frequency.value = f * 0.8; o.connect(hp); hp.connect(env); o.start(t); o.stop(t + d + 0.05); });
    lfo.start(t); lfo.stop(t + d + 0.05);
  }
  const sfx = {
    tick: () => tone(1400, 0.03, 'square', 0.012, 0, 0, master), beat: v => { tone(62, 0.13, 'sine', v, 40, 0, master); tone(55, 0.16, 'sine', v * 0.8, 38, 0.17, master); },
    pick: () => tone(660, 0.1, 'triangle', 0.1, 990, 0, master), door: () => { noise(0.25, 0.2, 500); tone(110, 0.2, 'square', 0.05, 70); },
    alarm: () => { for (let i = 0; i < 8; i++) tone(i % 2 ? 520 : 400, 0.22, 'square', 0.09, 0, i * 0.24); },
    chalk: () => noise(0.08, 0.2, 3000),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, 0, i * 0.14, master)); },
    step: (x, z, v, delay = 0) => { const o = at(x, z, 0.2); noise(0.13, v, 230, delay, o); tone(62, 0.15, 'sine', v * 0.9, 34, delay, o); if (Math.random() < 0.4) noise(0.05, v * 0.3, 2600, delay + 0.02, o, 'bandpass', 3); },
    scrape: (x, z) => { const o = at(x, z, 1.4); noise(1.2, 0.09, 1800, 0, o, 'bandpass', 6, 0.3); noise(1.0, 0.05, 3200, 0.15, o, 'bandpass', 8, 0.3); },
    bang: (x, z, v = 0.35) => { const o = at(x, z, 1.2); noise(0.3, v, 900, 0, o); [212, 347, 529, 803].forEach(f => tone(f, 0.7, 'sine', v * 0.12, f * 0.98, 0, o)); },
    slam: (x, z) => { const o = at(x, z, 1.2, 4); noise(0.45, 0.5, 300, 0, o); tone(55, 0.4, 'sine', 0.4, 30, 0, o); noise(0.25, 0.12, 2400, 0.08, o, 'bandpass', 2); },
    creak: (x, z) => { const o = at(x, z, 2); tone(190, 0.9, 'sawtooth', 0.03, 120, 0, o); tone(240, 0.6, 'sawtooth', 0.015, 300, 0.25, o); },
    whisper: (x, z) => { const o = at(x, z, 1.6, 1.5); let t = 0; for (let k = 0, n = rint(6, 11); k < n; k++) { const d = rr(0.07, 0.22); noise(d, rr(0.06, 0.14), rr(2200, 5200), t, o, 'bandpass', rr(2, 6), d * 0.4); t += d + rr(0.02, 0.12); } },
    sniff: (x, z) => { const o = at(x, z, 1.5); for (let k = 0; k < 3; k++) noise(0.16, 0.25, 1300, k * 0.2, o, 'bandpass', 2.5, 0.1); noise(0.6, 0.14, 700, 0.75, o, 'bandpass', 1.5, 0.05); },
    growl: (x, z, v = 0.25) => { const o = at(x, z, 2.2, 4); tone(70, 1.1, 'sawtooth', v, 48, 0, o); tone(73, 1.1, 'sawtooth', v * 0.8, 50, 0, o); noise(1.0, v * 0.6, 500, 0, o, 'bandpass', 2, 0.15); },
    scream: (long, o) => { const d = long ? 1.3 : 0.75; noise(d, 0.55, 7000, 0, o); [700, 1050, 1420].forEach((f, i) => tone(f, d, 'sawtooth', 0.15, f * 0.4, i * 0.02, o)); tone(170, d, 'square', 0.14, 480, 0, o); tone(90, d, 'sawtooth', 0.25, 40, 0, o); },
    stinger: () => { strings([1318.5, 1396.9, 1480, 1568], 1.5, 0.045, 0.015); tone(55, 1.4, 'sawtooth', 0.12, 30); noise(0.5, 0.2, 400); },
    reveal: () => { strings([587, 622, 659], 2.4, 0.03, 0.9); noise(1.2, 0.12, 900, 0, undefined, 'bandpass', 0.7, 1.0); },
    hit: () => { noise(0.9, 0.7, 300, 0, master); tone(48, 1.0, 'sine', 0.5, 28, 0, master); strings([1661, 1760, 1865, 1976], 1.2, 0.06, 0.005, master); },
    pop: (x, z) => { const o = at(x, z, 2.9); noise(0.05, 0.5, 4500, 0, o, 'highpass', 0.7); for (let k = 0; k < 5; k++) tone(rr(3000, 6500), 0.14, 'sine', 0.035, 0, 0.05 + k * 0.05, o); },
    buzz: () => { tone(100, 1.6, 'square', 0.015); tone(150, 1.6, 'sawtooth', 0.01); },
    bell: d => {
      if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), a = ac.createOscillator(), ag = ac.createGain(), am = ac.createGain(), env = ac.createGain(), bp = ac.createBiquadFilter();
      o.type = 'square'; o.frequency.value = 1180; a.type = 'square'; a.frequency.value = 24; ag.gain.value = 0.5; am.gain.value = 0.5; a.connect(am); am.connect(ag.gain);
      bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 1.5;
      env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.12, t + 0.03); env.gain.setValueAtTime(0.12, t + d - 0.15); env.gain.linearRampToValueAtTime(0.0001, t + d);
      o.connect(ag); ag.connect(bp); bp.connect(env); env.connect(bus); o.start(t); a.start(t); o.stop(t + d + 0.05); a.stop(t + d + 0.05);
    },
    chime: (delay = 0) => { [[196, 3.4, 0.16], [392.4, 2.6, 0.06], [587.3, 2, 0.05], [784.8, 1.6, 0.03], [1182, 1.1, 0.02]].forEach(([f, d, v]) => tone(f, d, 'sine', v, 0, delay)); },
    // Speldosa som spelar Blinka lilla, falskt och allt långsammare
    musicBox: (x, z) => { const o = at(x, z, 1.1, 3); let t = 0; [0, 0, 7, 7, 9, 9, 7, null, 5, 5, 4, 4, 2, 2, 0].forEach((n, i) => { if (n === null) { t += 0.4; return; } const f = 1046.5 * Math.pow(2, n / 12) * (1 + rr(-0.015, 0.015)); tone(f, 1.3, 'sine', 0.07, 0, t, o); tone(f * 2.003, 0.45, 'sine', 0.02, 0, t, o); t += 0.42 * (1 + i * 0.05); }); },
    thunder: delay => { noise(0.35, 0.3, 1400, delay, master, 'lowpass', 0.7); noise(3.8, 0.5, 120, delay + 0.05, master, 'lowpass', 0.8, 0.35); },
    heavyDoor: () => { tone(70, 4.2, 'sawtooth', 0.06, 50); noise(4.2, 0.07, 260, 0, undefined, 'lowpass', 1, 1.2); for (let k = 0; k < 6; k++) tone(rr(160, 240), 0.5, 'sawtooth', 0.02, rr(120, 160), k * 0.6); },
    pant: () => { for (let k = 0; k < 5; k++) { noise(0.3, 0.07, 1100, k * 0.55, master, 'bandpass', 1.2, 0.12); noise(0.25, 0.05, 800, k * 0.55 + 0.3, master, 'bandpass', 1.2, 0.1); } },
    gasp: () => noise(0.5, 0.25, 1500, 0, master, 'bandpass', 1.5, 0.08),
    exhale: () => noise(0.9, 0.06, 700, 0, master, 'bandpass', 1, 0.2)
  };
  function updAudio() {
    if (!ac) return; const t = ac.currentTime, L = ac.listener, fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), py = player.hid ? 1.45 : 1.6;
    if (L.positionX) { L.positionX.value = player.x; L.positionY.value = py; L.positionZ.value = player.z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(player.x, py, player.z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
    setP(monPan, M.x, 2.3, M.z);
    const live = state === 'play' || state === 'pad';
    monLP.frequency.setTargetAtTime(los(M.x, M.z, player.x, player.z, true) ? 9000 : 700, t, 0.1);
    const lvl = !live ? 0 : M.state === 'chase' ? 0.22 : M.state === 'sniff' ? 0.3 : M.state === 'stare' ? 0.16 : 0.08;
    breathG.gain.setTargetAtTime(lvl * (0.3 + 0.7 * Math.max(0, Math.sin(time * 2.3))), t, 0.06);
    growlG.gain.setTargetAtTime(live && (M.state === 'chase' || M.state === 'stare') ? 0.07 : 0, t, 0.2);
    droneG.gain.setTargetAtTime(0.016 + fear * 0.03, t, 0.5); droneLP.frequency.setTargetAtTime(150 + fear * 500, t, 0.5);
    tenG.gain.setTargetAtTime(fear > 0.4 ? (fear - 0.4) * 0.012 : 0, t, 0.5);
    muf.frequency.setTargetAtTime(state === 'dying' ? 20000 : player.holding ? 900 : player.hid ? 3500 : 20000, t, 0.08);
  }

  // ---------- Hjälpfunktioner för rutnät ----------
  // walls = true: bara väggar skymmer (för ljud och tavlor), annars skymmer även möbler
  function los(x0, z0, x1, z1, walls) {
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.4);
    for (let k = 1; k < n; k++) { const [c, r] = cellOf(x0 + dx * k / n, z0 + dz * k / n); if (walls ? isWall(c, r) : isBlocked(c, r)) return false; }
    return true;
  }
  function nearestFree(c, r) {
    if (!isBlocked(c, r)) return [c, r];
    for (let rad = 1; rad < 4; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) if (!isBlocked(c + dc, r + dr)) return [c + dc, r + dr];
    return [c, r];
  }
  function bfs(sc, sr, tc, tr) {
    [tc, tr] = nearestFree(tc, tr); const start = bi(sc, sr), goal = bi(tc, tr);
    const prev = new Int16Array(MAP_W * MAP_H).fill(-2), q = [start]; prev[start] = -1;
    for (let h = 0; h < q.length; h++) {
      const cur = q[h]; if (cur === goal) break; const c = cur % MAP_W, r = (cur / MAP_W) | 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (!isBlocked(nc, nr) && prev[bi(nc, nr)] === -2) { prev[bi(nc, nr)] = cur; q.push(bi(nc, nr)); } }
    }
    if (prev[goal] === -2) return [];
    const path = []; let cur = goal; while (cur !== start) { path.push([cur % MAP_W, (cur / MAP_W) | 0]); cur = prev[cur]; }
    return path.reverse();
  }
  function solidAt(x, z) { const [c, r] = cellOf(x, z); return isBlocked(c, r); }
  function canStand(x, z, r) { return !solidAt(x - r, z - r) && !solidAt(x + r, z - r) && !solidAt(x - r, z + r) && !solidAt(x + r, z + r); }
  // Tittar spelaren mot punkten (x, z)?
  function looking(x, z, dotMin) {
    const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz) || 1;
    return (-Math.sin(player.yaw) * dx - Math.cos(player.yaw) * dz) / d > dotMin;
  }
  function farSpot(min, max) {
    for (let n = 0; n < 40; n++) { const c = rint(1, 34), r = rint(1, 19); if (isBlocked(c, r)) continue; const x = wc(c), z = wc(r), d = Math.hypot(x - player.x, z - player.z); if (d >= min && d <= max) return [x, z]; }
    return null;
  }

  // ---------- Styrning ----------
  const keys = {}; let locked = false;
  const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 }, look = { id: null, x: 0, y: 0 };
  const canLook = () => state === 'play' || state === 'midnight';
  let sneakToggle = false;
  addEventListener('keydown', e => {
    if (state === 'pad') { if (/^[0-9]$/.test(e.key)) padKey(e.key); else if (e.key === 'Enter') padKey('OK'); else if (e.key === 'Backspace') padKey('C'); else if (e.key === 'Escape') closeOverlay(); return; }
    if (state === 'note') { if (!e.repeat && (e.code === 'KeyE' || e.key === 'Enter' || e.key === 'Escape')) closeOverlay(); return; }
    if (state === 'play' && e.code === 'Space') e.preventDefault();
    keys[e.code] = true;
    if (state === 'play') {
      if (e.code === 'KeyE') useAction(); else if (e.code === 'KeyF') toggleFlash(); else if (e.code === 'KeyQ') throwChalk();
    }
    if (e.code === 'Escape' && state === 'play') pauseGame();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && state === 'play' && !isTouch) pauseGame(); });
  document.addEventListener('mousemove', e => { if (locked && canLook()) lookBy(e.movementX * 0.0022, e.movementY * 0.0022); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'play' || state === 'pad')) pauseGame(); });
  function lookBy(dx, dy) {
    player.yaw -= dx; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - dy));
    if (player.hid) {
      const o = player.hid.outYaw; let rel = (((player.yaw - o + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      player.yaw = o + Math.max(-1.1, Math.min(1.1, rel));
    }
  }
  function relock() { if (!isTouch && document.pointerLockElement !== canvas) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } } }
  canvas.addEventListener('click', () => { if (state === 'play' && !locked) relock(); });
  // Touch: vänster halva = joystick, höger halva = titta
  const joyb = $('joyb'), joyk = $('joyk');
  addEventListener('touchstart', e => {
    if (!canLook()) return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('.tb,#pause,#bOut')) continue;
      if (t.clientX < innerWidth * 0.5 && joy.id === null) { joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = joy.y = 0; joyb.style.display = joyk.style.display = 'block'; joyb.style.left = joyk.style.left = t.clientX + 'px'; joyb.style.top = joyk.style.top = t.clientY + 'px'; }
      else if (t.clientX >= innerWidth * 0.5 && look.id === null) { look.id = t.identifier; look.x = t.clientX; look.y = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!canLook()) return;
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy; const l = Math.hypot(dx, dy), R = 55; if (l > R) { dx = dx / l * R; dy = dy / l * R; }
        joy.x = dx / R; joy.y = dy / R; joyk.style.left = joy.ox + dx + 'px'; joyk.style.top = joy.oy + dy + 'px';
      } else if (t.identifier === look.id) { lookBy((t.clientX - look.x) * 0.005, (t.clientY - look.y) * 0.005); look.x = t.clientX; look.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const endTouch = e => { for (const t of e.changedTouches) { if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; joyb.style.display = joyk.style.display = 'none'; } if (t.identifier === look.id) look.id = null; } };
  addEventListener('touchend', endTouch); addEventListener('touchcancel', endTouch);
  const tap = (id, fn) => $(id).addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); if (state === 'play') fn(); }, { passive: false });
  tap('bUse', () => useAction()); tap('bLight', toggleFlash); tap('bThrow', throwChalk); tap('bSneak', () => { sneakToggle = !sneakToggle; $('bSneak').classList.toggle('on', sneakToggle); });
  {
    const hb = $('bHold'), hold = on => { holdTouch = on; hb.classList.toggle('on', on); };
    hb.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); hold(true); }, { passive: false });
    hb.addEventListener('touchend', () => hold(false)); hb.addEventListener('touchcancel', () => hold(false));
  }
  $('bOut').addEventListener('click', () => { if (state === 'play' && player.hid) unhide(); });
  $('pause').addEventListener('click', () => { if (state === 'play') pauseGame(); });
  $('pause').addEventListener('touchstart', e => e.stopPropagation(), { passive: true });

  // ---------- Handlingar ----------
  function toggleFlash() {
    if (flash.bat <= 0) { say('Batteriet är slut! Leta efter ett nytt.', 2); return; }
    flash.on = !flash.on; sfx.tick();
  }
  function throwChalk() {
    if (player.hid) return; if (chalk <= 0) { say('Du har ingen krita kvar.', 1.6); return; }
    chalk--; $('chalk').textContent = chalk; sfx.chalk();
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), cp = Math.cos(player.pitch);
    thrown.push({ m: box(0.1, 0.1, 0.1, basic('#ffffff'), player.x, 1.4, player.z), vx: fx * cp * 9, vy: Math.sin(player.pitch) * 9 + 1.5, vz: fz * cp * 9, y: 1.4, x: player.x, z: player.z });
  }
  function nearestInteract() {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    let best = null, bd = 99;
    const test = (type, ref, x, z, maxD, dotMin) => {
      const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz); if (d > maxD) return;
      if (d > 0.9 && (fx * dx + fz * dz) / d < dotMin) return;
      if (d < bd) { bd = d; best = { type, ref }; }
    };
    if (player.hid) return { type: 'unhide', ref: player.hid };
    lockers.forEach(l => test('locker', l, l.x, l.z, 2.2, 0.55));
    notes.forEach(n => test('note', n, n.wx, n.wz, 2.4, 0.5));
    if (!fin) test('door', null, EXIT_X, EXIT_Z - 0.6, 3.2, 0.4);
    return best;
  }
  function useAction() {
    audio(); const it = nearestInteract(); if (!it) return;
    if (it.type === 'unhide') { unhide(); }
    else if (it.type === 'locker') hide(it.ref);
    else if (it.type === 'note') readNote(it.ref);
    else if (it.type === 'door') openPad();
  }
  function hide(l) {
    if (player.hideCool > 0) return;
    const dx = player.x - M.x, dz = player.z - M.z, d = Math.hypot(dx, dz);
    M.certain = (M.state === 'chase' || M.state === 'stare') && d < 12 && los(M.x, M.z, player.x, player.z);
    player.hid = l; player.x = l.x; player.z = l.z; player.yaw = l.outYaw; player.pitch = 0; player.hideCool = 0.6; document.body.classList.add('inlocker'); sfx.door();
    say(M.certain ? 'Det såg att du gömde dig!' : 'Du gömmer dig i skåpet. Andas tyst...', 2.2);
    if (!hintBreath) { hintBreath = true; say((isTouch ? 'Håll in 🫁' : 'Håll in MELLANSLAG') + ' för att hålla andan när det kommer nära. Luften räcker inte länge!', 3.6); }
  }
  function unhide() {
    if (player.hideCool > 0) return; const l = player.hid, fo = l.outYaw === Math.PI ? 1 : -1;
    player.x = l.x; player.z = l.z + fo * 1.15; if (!canStand(player.x, player.z, 0.3)) { player.x = l.x + 1.1; player.z = l.z + fo * 0.9; }
    player.hid = null; player.hideCool = 0.6; player.holding = false; M.certain = false; document.body.classList.remove('inlocker'); sfx.door(); relock();
  }
  let pendingNote = 0;
  function readNote(n) {
    n.read = true; sfx.pick();
    if (n.idx >= 0) {
      if (!found[n.idx]) pendingNote = nFound() + 1;
      found[n.idx] = true;
      $('notetitle').textContent = n.spot.intro; $('notetext').innerHTML = '<b>Siffra ' + (n.idx + 1) + ' i koden:</b><br>' + n.riddle;
      const nb = $('notes'); if (!document.getElementById('nt' + n.idx)) { const d = document.createElement('div'); d.id = 'nt' + n.idx; d.textContent = 'Siffra ' + (n.idx + 1) + ': ' + n.riddle; nb.appendChild(d); }
      $('code').textContent = 'Lappar: ' + nFound() + '/3';
    } else {
      $('notetitle').textContent = n.spot.intro; $('notetext').textContent = 'Vaktmästarens lapp: "Stanna aldrig kvar efter midnatt. Den hör allt. Om du måste gömma dig, håll andan tills stegen har gått förbi." (Inget om koden här.)';
    }
    openOverlay('note');
  }
  // Skolan reagerar på varje lapp du hittar. Monstret blir också snabbare och hör bättre.
  function afterNote(k) {
    if (k === 1) later(2, () => { const p = farSpot(8, 14); if (p) sfx.slam(p[0], p[1]); say('Någonstans slår en dörr igen.', 2); fearKick(0.4); });
    else if (k === 2) later(1.5, () => { runEvent('lamps'); runEvent('music'); });
    else if (k === 3) {
      say('Alla lappar! Till huvudentrén, fort. Men det vet att du är här...', 3.4); flash.flick = 0.4;
      later(1, () => { sfx.growl(M.x, M.z, 0.35); if (M.state !== 'chase') { M.state = 'investigate'; M.last = [player.x + rr(-4, 4), player.z + rr(-4, 4)]; setPath(M.last[0], M.last[1]); M.rp = 1; } });
    }
  }
  // Kodlås
  let entry = '';
  const keysEl = $('keys');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].forEach(k => { const b = document.createElement('button'); b.textContent = k; b.addEventListener('click', () => padKey(k)); keysEl.appendChild(b); });
  function padShow() { $('disp').textContent = (entry + '___').slice(0, 3); }
  function padKey(k) {
    if (state !== 'pad') return; sfx.tick();
    if (k === 'C') entry = ''; else if (k === 'OK') { if (entry.length === 3) checkCode(); }
    else if (entry.length < 3) { entry += k; if (entry.length === 3) setTimeout(checkCode, 250); }
    padShow();
  }
  function checkCode() {
    if (state !== 'pad' || entry.length !== 3) return;
    if (entry === digits.join('')) { startFinale(); return; }
    entry = ''; padShow(); sfx.alarm(); say('Fel kod! Larmet går! Monstret hör det!', 2.6); fearKick(0.8);
    closeOverlay(); M.state = 'investigate'; M.last = [EXIT_X, EXIT_Z - 2]; M.path = bfs(...cellOf(M.x, M.z), 28, 18); M.wait = 0; M.certain = false;
  }
  // Kodlåset pausar inte spelet: monstret går vidare medan du skriver
  function openPad() {
    if (nFound() < 3) say('Ett kodlås. Du hittar nog siffrorna på lappar någonstans i skolan.', 2.6);
    entry = ''; padShow(); openOverlay('pad');
  }
  function openOverlay(name) { state = name; $(name).classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); }
  function closeOverlay() {
    $('note').classList.add('hidden'); $('pad').classList.add('hidden'); state = 'play'; relock();
    if (pendingNote) { afterNote(pendingNote); pendingNote = 0; }
  }
  $('noteok').addEventListener('click', closeOverlay); $('padclose').addEventListener('click', () => { if (state === 'pad') closeOverlay(); });
  function pauseGame() {
    if (state === 'pad') $('pad').classList.add('hidden');
    state = 'paused'; $('pausev').classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); if (ac && ac.state === 'running') ac.suspend();
  }
  $('resume').addEventListener('click', () => { $('pausev').classList.add('hidden'); state = 'play'; audio(); relock(); });

  // ---------- Start, slut ----------
  function reset() {
    placeRandom();
    const [sc, sr] = START; player.x = wc(sc); player.z = wc(sr); player.yaw = 0; player.pitch = 0; player.hid = null; player.hideCool = 0;
    player.breath = 100; player.winded = 0; player.holding = false; player.holdLock = false;
    document.body.classList.remove('inlocker', 'holding');
    flash.on = false; flash.bat = 100; flash.flick = 0; chalk = 3; elapsed = 0; $('chalk').textContent = 3; $('code').textContent = 'Lappar: 0/3';
    thrown.forEach(t => scene.remove(t.m)); thrown = [];
    const [mc, mr] = pick(MONSTER_STARTS); Object.assign(M, { x: wc(mc), z: wc(mr), state: 'patrol', path: [], wait: 2, lost: 0, certain: false, sniffL: null, checkQ: [], passChecked: false, quiet: 0, spd: 0, pd: 0 });
    msgQ = []; msgT = 0; hbT = 0; creakT = 6; lastMin = -1; chimeQ = 0; surge = 0; dirT = 24; boltT = rr(10, 20); subT = 40; bellUsed = 0; pendingNote = 0;
    fear = 0; spike = 0; shake = 0; fin = null; timers = []; bolts = []; power = 1;
    lamps.forEach(l => { l.dead = false; l.fx = 0; });
    boards.forEach(b => drawBoard(b, b.txt, false));
    ghost.visible = false; js.visible = false; prints.forEach(p => { p.born = -99; p.m.material.opacity = 0; });
    exitDoor.leaves.forEach(({ m, s }) => { m.position.x = EXIT_X + s * 0.96; }); exitDoor.keypad.color.set('#ff3b30');
    DOOR_CELLS.forEach(([c, r]) => { g[r][c] = 1; blocked[bi(c, r)] = 1; });
    fxLight.intensity = 0; fxLight.color.set('#9fb8ff'); fxLight.distance = 14; fxLight.position.set(EXIT_X, 2.2, EXIT_Z + 1);
    tut = [[1.2, 'Du vaknar under en bänk i Klassrum 2. Det är becksvart...'], [6, isTouch ? 'Tryck på 🔦 för att tända ficklampan.' : 'Tryck på F för att tända ficklampan.', () => !flash.on], [11, 'Leta efter lappar med gåtor. Svaren är siffror i koden till utgången.'], [17, isTouch ? 'Hör du steg? Göm dig i ett skåp med ✋.' : 'Hör du steg? Göm dig i ett skåp med E.'], [24, 'Ficklampan fladdrar när det är nära...']];
  }
  let tut = [];
  function begin() {
    audio(); if (document.activeElement) document.activeElement.blur();
    ['menu', 'caught', 'late', 'win'].forEach(i => $(i).classList.add('hidden')); document.body.classList.remove('dead'); reset(); state = 'play'; relock();
    fadeEl.className = ''; void fadeEl.offsetWidth; fadeEl.className = 'wake';
  }
  function flashScare(ms) { const s = $('scare'); s.classList.remove('hidden'); clearTimeout(flashScare.t); flashScare.t = setTimeout(() => s.classList.add('hidden'), ms); }
  // Fångad: ansiktet kastar sig mot dig, sedan svart
  function caught(kind) {
    if (state !== 'play' && state !== 'pad' && state !== 'midnight') return;
    state = 'dying'; dieT = 0; dieKind = kind || 'caught';
    $('note').classList.add('hidden'); $('pad').classList.add('hidden'); $('bOut').classList.add('hidden'); promptEl.style.display = 'none';
    if (player.hid) sfx.bang(player.x, player.z, 0.7);
    player.holding = false; document.body.classList.remove('inlocker', 'holding'); document.body.classList.add('dead');
    js.visible = true; js.position.set(0, -0.08, -2.4); sfx.scream(true); sfx.hit(); shake = 1.2;
    if (document.exitPointerLock) document.exitPointerLock();
  }
  function dying(dt) {
    dieT += dt; shake = Math.max(shake, 0.7);
    const k = Math.min(1, dieT / 0.2), e = 1 - Math.pow(1 - k, 3);
    js.position.set(Math.sin(time * 41) * 0.025, -0.08 + Math.sin(time * 33) * 0.02, -2.4 + 1.8 * e);
    js.rotation.set(0.1, Math.sin(time * 19) * 0.08, Math.sin(time * 27) * 0.14);
    jsHead.jaw.rotation.x = 0.4 + Math.min(0.55, dieT * 3) + Math.sin(time * 40) * 0.08;
    fxLight.color.set('#ffc8b0'); fxLight.intensity = 2.4 * (Math.random() < 0.15 ? 0.3 : 1); fxLight.distance = 5; fxLight.position.set(player.x - Math.sin(player.yaw) * 0.3, 0.85, player.z - Math.cos(player.yaw) * 0.3);
    if (dieT > 1.05 && fadeEl.className !== 'black') fadeEl.className = 'black';
    if (dieT > 1.45) { state = 'over'; js.visible = false; $(dieKind === 'late' ? 'late' : 'caught').classList.remove('hidden'); }
  }
  // Midnatt: tolv slag, lamporna dör en efter en
  let midT = 0, midN = 0;
  function midnight() { state = 'midnight'; midT = 0; midN = 0; $('pad').classList.add('hidden'); promptEl.style.display = 'none'; say('Klockan slår tolv...', 6); fearKick(1); }
  function midnightTick(dt) {
    midT += dt;
    if (midN < 12 && midT >= midN * 0.5) {
      midN++; sfx.chime(0); shake = 0.15; power = Math.max(0, 1 - midN / 7);
      if (midN === 7) flash.on = false;
      if (midN === 10) sfx.whisper(player.x + Math.cos(player.yaw) * 0.8, player.z - Math.sin(player.yaw) * 0.8);
    }
    torch.intensity = flash.on ? 2.8 * (Math.random() < 0.3 ? 0.1 : 1) : 0;
    updMsg(dt);
    if (midT > 12 * 0.5 + 0.7) caught('late');
  }
  function win() {
    if (state === 'over') return;
    state = 'over'; $('note').classList.add('hidden'); $('pad').classList.add('hidden'); sfx.win(); if (document.exitPointerLock) document.exitPointerLock();
    const t = Math.round(elapsed); let best = 0; try { best = +localStorage.getItem('sem-best') || 0; } catch (e) { }
    let rec = ''; if (!best || t < best) { try { localStorage.setItem('sem-best', t); } catch (e) { } rec = ' Nytt rekord!'; }
    $('wintext').textContent = 'Du tog dig ut på ' + Math.floor(t / 60) + ' min ' + (t % 60) + ' s.' + rec;
    fadeEl.className = 'white'; setTimeout(() => $('win').classList.remove('hidden'), 1200);
  }
  // Rätt kod: dörren glider upp långsamt och monstret kommer springande
  function startFinale() {
    closeOverlay(); fin = { t: 0, open: false };
    exitDoor.keypad.color.set('#40ff70'); sfx.heavyDoor(); say('Klick! Låset släpper. Dörren glider upp... långsamt.', 3);
    lamps.forEach(l => { l.fx = time + rr(1, 3); });
    const [pc, pr] = cellOf(player.x, player.z), cur = bfs(pc, pr, ...cellOf(M.x, M.z)).length;
    const cand = WAYPOINTS.concat(MONSTER_STARTS).map(([c, r]) => ({ c, r, n: bfs(pc, pr, c, r).length })).filter(o => o.n >= 13).sort((a, b) => Math.abs(a.n - 17) - Math.abs(b.n - 17));
    if (cand.length && cur < cand[0].n) { M.x = wc(cand[0].c); M.z = wc(cand[0].r); }
    M.state = 'chase'; M.path = []; M.rp = 0; M.lost = 0; M.last = [player.x, player.z]; M.sniffL = null;
    later(1, () => { sfx.scream(true, at(M.x, M.z, 2.4, 6)); say('Ett skrik ekar genom skolan. DET KOMMER!', 2.6); fearKick(1); shake = 0.3; });
  }
  $('startbtn').addEventListener('click', begin); ['again1', 'again2', 'again3'].forEach(i => $(i).addEventListener('click', begin));
  try { const b = +localStorage.getItem('sem-best'); if (b) $('best').textContent = 'Din bästa tid: ' + Math.floor(b / 60) + ' min ' + (b % 60) + ' s'; } catch (e) { }

  // ---------- Monstrets hjärna ----------
  function turnM(a, dt, k = 8) { let d = a - M.face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; M.face += d * Math.min(1, dt * k); }
  function setPath(x, z) { const [mc, mr] = cellOf(M.x, M.z), [tc, tr] = cellOf(x, z); M.path = bfs(mc, mr, tc, tr); if (!M.path.length && mc === tc && mr === tr) M.path = [[tc, tr]]; }
  function followPath(dt, sp) {
    if (!M.path.length) return true; const [c, r] = M.path[0], tx = wc(c), tz = wc(r), dx = tx - M.x, dz = tz - M.z, d = Math.hypot(dx, dz), st = sp * dt;
    if (d <= st) { M.x = tx; M.z = tz; M.path.shift(); } else { M.x += dx / d * st; M.z += dz / d * st; }
    if (d > 0.02) turnM(Math.atan2(dx, dz), dt); return M.path.length === 0;
  }
  function startChase() {
    if (M.state !== 'chase') { sfx.scream(false, at(M.x, M.z, 2.4, 5)); say('Monstret såg dig! Spring eller göm dig!', 2.2); fearKick(1); shake = Math.max(shake, 0.4); }
    M.state = 'chase'; M.lost = 0; M.rp = 0; M.quiet = 0;
  }
  // Letar: kollar skåpen nära där det senast visste var du var
  function enterSearch() {
    M.state = 'search'; M.wait = rr(1.8, 3); M.path = [];
    const [lx, lz] = M.last;
    M.checkQ = lockers.filter(l => Math.hypot(l.x - lx, l.z - lz) < 7.5 && Math.random() < 0.7).sort((a, b) => Math.hypot(a.x - M.x, a.z - M.z) - Math.hypot(b.x - M.x, b.z - M.z)).slice(0, 2);
    if (M.certain && player.hid) M.checkQ = [player.hid].concat(M.checkQ.filter(l => l !== player.hid));
  }
  function beginSniff(l) {
    M.state = 'sniff'; M.sniffL = l; M.sniffT = 3.6; M.exposed = 0; M.snd = 0; M.path = [];
    M.face = l.outYaw === Math.PI ? Math.PI : 0;
    if (player.hid === l) { fearKick(1); say(isTouch ? 'Det nosar på ditt skåp! Håll in 🫁!' : 'Det nosar på ditt skåp! Håll in MELLANSLAG!', 2.6); }
  }
  function sniffTick(dt) {
    const l = M.sniffL, [fx, fz] = lockerFront(l); M.sniffT -= dt; M.snd -= dt;
    if (M.snd <= 0) { sfx.sniff((l.x + fx) / 2, (l.z + fz) / 2); M.snd = 1.15; }
    if (player.hid === l) { if (!player.holding) M.exposed += dt; if (player.gasp) { caught(); return; } }
    if (M.sniffT > 0) return;
    M.state = 'search'; M.wait = 1.2; M.sniffL = null;
    if (player.hid === l) {
      if (Math.random() < (M.certain ? (M.exposed > 0.6 ? 0.97 : 0.75) : M.exposed > 0.6 ? 0.85 : 0.06)) { caught(); return; }
      M.certain = false; say('Det nosade vid skåpet... och gick vidare.', 2.4);
      if (player.holding) later(0.8, sfx.exhale);
    } else { sfx.bang(l.x, l.z, 0.45); l.shake = 0.5; }   // det river upp ett tomt skåp
  }
  // Om det har tappat bort dig länge smyger det sig närmare, utom synhåll
  function relocate() {
    if (los(player.x, player.z, M.x, M.z)) return;
    const ok = WAYPOINTS.concat(MONSTER_STARTS).filter(([c, r]) => { const x = wc(c), z = wc(r), d = Math.hypot(x - player.x, z - player.z); return d > 11 && d < 18 && !los(player.x, player.z, x, z); });
    if (!ok.length) return;
    const [c, r] = pick(ok); M.x = wc(c); M.z = wc(r); M.path = []; M.wait = 0.5; M.quiet = 0;
  }
  function nextWaypoint() {
    const near = WAYPOINTS.slice().sort((a, b) => Math.hypot(wc(a[0]) - player.x, wc(a[1]) - player.z) - Math.hypot(wc(b[0]) - player.x, wc(b[1]) - player.z));
    return Math.random() < 0.5 ? pick(near.slice(0, 3)) : pick(WAYPOINTS);
  }
  function updateMonster(dt) {
    const dx = player.x - M.x, dz = player.z - M.z, d = Math.hypot(dx, dz), angry = nFound();
    const spd = 1 + 0.06 * angry + 0.1 * Math.min(1, elapsed / 600);
    let see = false;
    if (!player.hid && d < (flash.on ? 15 : 9)) {
      const dot = (Math.sin(M.face) * dx + Math.cos(M.face) * dz) / (d || 1);
      const glare = flash.on && d < 12 && looking(M.x, M.z, 0.92);   // ficklampan rakt i ansiktet märks
      if ((dot > 0.5 || d < 2.4 || glare) && los(M.x, M.z, player.x, player.z)) see = true;
    }
    const heard = !player.hid && player.noise > 0 && d < player.noise * (1 + 0.15 * angry) * (los(M.x, M.z, player.x, player.z, true) ? 1 : 0.6);
    M.rp -= dt; M.quiet += dt;
    if (M.state === 'sniff') { sniffTick(dt); if (state !== 'dying' && !player.hid && d < 1.05) caught(); return; }
    if (see) {
      if (M.state !== 'chase' && M.state !== 'stare') {
        // Långt bort stannar det först och stirrar. Sedan kommer det.
        if (d > 7 && !fin) { M.state = 'stare'; M.stareT = rr(0.8, 1.5); M.path = []; sfx.stinger(); fearKick(0.8); say('Något står och stirrar på dig...', 1.8); }
        else startChase();
      }
      M.lost = 0; M.last = [player.x, player.z]; M.quiet = 0;
    } else if (heard && M.state !== 'chase' && M.state !== 'stare' && M.rp <= 0) {
      if (M.state !== 'investigate') say('Monstret hörde dig...', 1.6);
      M.state = 'investigate'; M.last = [player.x, player.z]; setPath(player.x, player.z); M.rp = 0.6; M.wait = 0; M.quiet = 0;
    }
    if (fin && !player.hid) { M.last = [player.x, player.z]; M.lost = 0; if (M.state !== 'chase') { M.state = 'chase'; M.rp = 0; } }
    // Går det förbi skåpet du gömmer dig i kanske det stannar och nosar
    if (player.hid && (M.state === 'patrol' || M.state === 'investigate')) {
      const l = player.hid, dl = Math.hypot(M.x - l.x, M.z - l.z);
      if (dl < 3.4 && !M.passChecked) { M.passChecked = true; if (Math.random() < 0.45 + 0.15 * angry) { M.state = 'search'; M.checkQ = [l]; M.path = []; M.wait = 1; } }
    }
    if (!player.hid || Math.hypot(M.x - player.hid.x, M.z - player.hid.z) > 6) M.passChecked = false;
    if (M.state === 'stare') {
      turnM(Math.atan2(dx, dz), dt, 10); M.stareT -= dt; if (M.stareT <= 0 || (see && d < 5)) startChase();
    } else if (M.state === 'chase') {
      if (!see) M.lost += dt;
      if (M.rp <= 0) { M.rp = 0.3; setPath(M.last[0], M.last[1]); }
      const cs = Math.min(4.15, 3.4 * spd) * (fin ? 1.05 : 1), stp = cs * dt;
      if (see && d < 3.5 && canStand(M.x + dx / d * stp, M.z + dz / d * stp, 0.4)) { turnM(Math.atan2(dx, dz), dt, 12); M.x += dx / d * stp; M.z += dz / d * stp; }
      else if (followPath(dt, cs) && !see) enterSearch();
      if (M.state === 'chase' && !see && M.lost > 5 && !fin) enterSearch();
    } else if (M.state === 'investigate') {
      if (followPath(dt, 2.5 * spd)) enterSearch();
    } else if (M.state === 'search') {
      if (M.checkQ.length) {
        const l = M.checkQ[0], [fx, fz] = lockerFront(l);
        if (Math.hypot(fx - M.x, fz - M.z) < 0.3) { M.checkQ.shift(); beginSniff(l); }
        else { if (!M.path.length) setPath(fx, fz); if (!M.path.length) M.checkQ.shift(); else followPath(dt, 2.3 * spd); }
      } else { M.wait -= dt; M.face += dt * 1.6; if (M.wait <= 0) { M.state = 'patrol'; M.path = []; M.wait = 0.3; } }
    } else {
      if (!M.path.length) { M.wait -= dt; if (M.wait <= 0) { const w = nextWaypoint(); setPath(wc(w[0]), wc(w[1])); M.wait = rr(0.8, 2.5); } }
      else followPath(dt, 1.8 * spd);
      if (M.quiet > 40 && d > 22) relocate();
    }
    if (!player.hid && d < 1.05) caught();
  }
  // Steg, fotspår och tunga dunsar som skakar kameran när det är nära
  function gait(ox, oz, dt) {
    const moved = Math.hypot(M.x - ox, M.z - oz); if (moved > 2) { M.spd = 0; return; }
    M.spd = moved / Math.max(dt, 1e-4); M.sw += moved * 4.2;
    const ph = Math.floor(M.sw / Math.PI);
    if (ph !== M.ph) {
      M.ph = ph; const chase = M.state === 'chase', md = Math.hypot(M.x - player.x, M.z - player.z);
      sfx.step(M.x, M.z, chase ? 0.55 : 0.34); if (!chase && Math.random() < 0.1) sfx.scrape(M.x, M.z);
      if (md < 7) shake = Math.max(shake, 0.12 * (1 - md / 7));
    }
    M.pd += moved; if (M.pd > 0.9) { M.pd = 0; addPrint(); }
  }

  // ---------- Händelser: saker som händer i skolan för att skrämma dig ----------
  let dirT = 24, boltT = 15, subT = 40, bellUsed = 0, ghostT = 0;
  function lightning() { bolts = [[time, 1], [time + 0.11, 0.45], [time + 0.27, 0.85]]; sfx.thunder(rr(0.7, 2.2)); fearKick(0.2); }
  function powerSurge() {
    say('Strömmen fladdrar...', 2.4); sfx.buzz(); fearKick(0.4);
    lamps.forEach(l => { l.fx = time + rr(0.8, 2.5); });
    const live = lamps.filter(l => !l.dead && l.mode !== 2).sort(() => Math.random() - 0.5);
    live.slice(0, Math.floor(live.length * 0.3)).forEach((l, i) => later(1 + i * 0.15, () => { l.dead = true; if (Math.hypot(l.x - player.x, l.z - player.z) < 18) sfx.pop(l.x, l.z); }));
  }
  function spawnGhost() {
    if (ghost.visible || player.hid) return;
    const s = Math.random() < 0.5 ? -1 : 1, a = player.yaw + s * rr(0.25, 0.45), fx = -Math.sin(a), fz = -Math.cos(a);
    for (let dd = 15; dd >= 8; dd--) {
      const x = player.x + fx * dd, z = player.z + fz * dd, [c, r] = cellOf(x, z);
      if (isBlocked(c, r) || !los(player.x, player.z, x, z) || Math.hypot(x - M.x, z - M.z) < 8) continue;
      ghost.position.set(x, 0, z); ghost.visible = true; ghostT = rr(2.5, 4); return;
    }
  }
  function runEvent(ev) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    if (ev === 'steps') { for (let k = 0; k < 4; k++) sfx.step(player.x - fx * (3.2 - k * 0.35), player.z - fz * (3.2 - k * 0.35), 0.22, k * 0.5); fearKick(0.5); }
    else if (ev === 'whisper') { const s = Math.random() < 0.5 ? -1 : 1; sfx.whisper(player.x + rx * s * 1.1 - fx * 0.4, player.z + rz * s * 1.1 - fz * 0.4); fearKick(0.4); }
    else if (ev === 'slam') { const p = farSpot(7, 15); if (p) sfx.slam(p[0], p[1]); fearKick(0.35); }
    else if (ev === 'lamps') {
      lamps.forEach(l => { if (Math.hypot(l.x - player.x, l.z - player.z) < 13) l.fx = time + rr(1.2, 2.8); }); sfx.buzz(); fearKick(0.3);
      const near = lamps.filter(l => !l.dead && l.mode !== 2 && Math.hypot(l.x - player.x, l.z - player.z) < 10);
      if (near.length && Math.random() < 0.4) { const l = pick(near); later(2, () => { l.dead = true; sfx.pop(l.x, l.z); }); }
    }
    else if (ev === 'music') { const here = cellOf(player.x, player.z), r = pick(ROOMS.filter(q => !(here[0] >= q.x0 && here[0] <= q.x1 && here[1] >= q.y0 && here[1] <= q.y1))); sfx.musicBox(wc((r.x0 + r.x1) / 2), wc((r.y0 + r.y1) / 2)); }
    else if (ev === 'ghost') spawnGhost();
    else if (ev === 'board') { const b = pick(boards.filter(q => !q.scary && (!looking(q.wx, q.wz, 0.3) || Math.hypot(q.wx - player.x, q.wz - player.z) > 14))); if (b) drawBoard(b, pick(SCRAWLS), true); }
    else if (ev === 'bell') { sfx.bell(2.6); bellUsed++; say('Skolklockan ringer... mitt i natten?', 2.4); fearKick(0.6); shake = 0.2; }
    else if (ev === 'locker') {
      const l = pick(lockers.filter(q => { const d = Math.hypot(q.x - player.x, q.z - player.z); return d > 5 && d < 16 && q !== player.hid; }));
      if (l) { for (let k = 0; k < 3; k++) later(k * 0.32, () => { sfx.bang(l.x, l.z, 0.3); l.shake = 0.3; }); fearKick(0.4); }
    }
  }
  function director(dt) {
    boltT -= dt; if (boltT <= 0) { lightning(); boltT = rr(30, 70); }
    // Skuggan försvinner om du kommer nära eller lyser på den
    if (ghost.visible) {
      ghostT -= dt; const gx = ghost.position.x, gz = ghost.position.z, gd = Math.hypot(gx - player.x, gz - player.z);
      ghost.rotation.y = Math.atan2(player.x - gx, player.z - gz);
      const es = 0.1 * Math.max(1, gd / 5); ghostEyes.forEach(e => e.scale.set(es, es, 1));
      if (ghostT <= 0 || gd < 6.5 || (flash.on && gd < 13 && looking(gx, gz, 0.985))) { ghost.visible = false; flash.flick = 0.25; sfx.whisper(gx, gz); fearKick(0.6); }
    }
    dirT -= dt;
    if (dirT > 0 || fin || M.state === 'chase' || M.state === 'stare' || M.state === 'sniff') return;
    dirT = rr(13, 26) - nFound() * 2.5;
    const md = Math.hypot(M.x - player.x, M.z - player.z);
    const evs = [['steps', md > 14 ? 3 : 0], ['whisper', 2], ['slam', 3], ['lamps', 3], ['music', 1.5], ['ghost', md > 14 && !player.hid ? 2.5 : 0],
      ['board', nFound() && boards.some(b => !b.scary) ? 2.5 : 0], ['bell', !bellUsed && elapsed > 150 ? 1 : 0], ['locker', 1.5]];
    let sum = evs.reduce((s, e) => s + e[1], 0) * Math.random();
    for (const [ev, w] of evs) { sum -= w; if (sum < 0) { runEvent(ev); break; } }
  }

  // ---------- Uppdatering ----------
  let hbT = 0, creakT = 6, tickT = 0, lastMin = -1, chimeQ = 0, surge = 0;
  function update(dt) {
    time += dt; shake = Math.max(0, shake - dt * 1.5); M.gt -= dt; M.glitch -= dt;
    if (M.glitch <= 0) { M.glitch = rr(0.7, 3.5); M.gt = 0.08 + Math.random() * 0.08; M.gx = rr(-1.2, 1.2); M.gz = rr(-1, 1); }
    if (state === 'dying') { dying(dt); updAudio(); return; }
    if (state === 'midnight') { midnightTick(dt); updAudio(); return; }
    if (state !== 'play' && state !== 'pad') { updAudio(); return; }
    elapsed += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (elapsed >= timers[i][0]) { const f = timers[i][1]; timers.splice(i, 1); f(); if (state !== 'play' && state !== 'pad') return; }
    // Förflyttning
    let mx = 0, mz = 0, l = 0;
    if (state === 'play') {
      mx = joy.x; mz = joy.y;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
      if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
      l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; l = 1; }
    }
    player.hideCool -= dt;
    if (player.hid && player.hideCool <= 0 && l > 0.3) { unhide(); return; }
    player.moving = false; player.running = false; player.noise = 0; player.gasp = false;
    if (!player.hid && l > 0.12) {
      const touchy = joy.id !== null;
      const sneak = keys.ShiftLeft || keys.ShiftRight || sneakToggle || (touchy && l < 0.5);
      const run = !sneak && (keys.Space || (touchy && l > 0.92)) && player.winded <= 0 && player.breath > 0;
      const sp = sneak ? 1.3 : run ? 4.4 : 2.6; player.noise = sneak ? 3.5 : run ? 15 : 8; player.moving = true; player.running = run;
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      const vx = (fx * -mz + rx * mx) * sp * dt, vz = (fz * -mz + rz * mx) * sp * dt;
      if (canStand(player.x + vx, player.z, player.r)) player.x += vx;
      if (canStand(player.x, player.z + vz, player.r)) player.z += vz;
    }
    // Andning: att springa och att hålla andan tar luft. Tar luften slut flämtar du, och det hörs.
    player.holding = !!player.hid && state === 'play' && (keys.Space || holdTouch) && player.breath > 0 && !player.holdLock;
    if (player.running) { player.breath -= 17 * dt; if (player.breath <= 0) { player.breath = 0; player.winded = 3; sfx.pant(); say('Du är andfådd!', 1.6); } }
    else if (player.holding) { player.breath -= 15 * dt; if (player.breath <= 0) { player.breath = 0; player.gasp = true; player.holdLock = true; player.holding = false; sfx.gasp(); noiseAt(player.x, player.z, 9, true); say('Du flämtar efter luft!', 1.6); } }
    else player.breath = Math.min(100, player.breath + (player.hid ? 16 : player.moving ? 9 : 14) * dt);
    if (player.holdLock && player.breath > 30) player.holdLock = false;
    if (player.winded > 0) { player.winded -= dt; if (!player.hid) player.noise = Math.max(player.noise, 6); }
    document.body.classList.toggle('holding', player.holding);
    // Ficklampa
    if (flash.on) { flash.bat -= 0.5 * dt; if (flash.bat <= 0) { flash.bat = 0; flash.on = false; say('Batteriet tog slut!', 2); } }
    batF.style.width = flash.bat + '%'; batT.textContent = Math.round(flash.bat) + '%';
    brF.style.width = player.breath + '%'; brF.classList.toggle('low', player.winded > 0 || player.holdLock);
    // Lampan fladdrar när monstret är nära, och när batteriet håller på att ta slut
    const md = Math.hypot(M.x - player.x, M.z - player.z);
    flash.flick -= dt;
    let ti = flash.on ? 2.8 : 0;
    if (flash.on && flash.bat < 15) ti *= 0.55 + 0.45 * Math.sin(time * 40) * Math.sin(time * 13);
    if (flash.on && md < 11 && Math.random() < (1 - md / 11) * 0.25) ti *= Math.random() * 0.3;
    if (flash.flick > 0) ti *= Math.random() < 0.6 ? 0.03 : 0.6;
    torch.intensity = ti;
    // Batterier
    for (const b of batteries) {
      if (b.got) continue; b.mesh.rotation.y += dt * 2; b.mesh.position.y = 0.5 + Math.sin(time * 3) * 0.08;
      if (Math.hypot(b.x - player.x, b.z - player.z) < 1.2 && !player.hid) { b.got = true; dyn.remove(b.mesh); flash.bat = Math.min(100, flash.bat + 60); sfx.pick(); say('Du hittade ett batteri! 🔋', 2); }
    }
    // Kritor
    for (const t of thrown) {
      t.vy -= 14 * dt; const nx = t.x + t.vx * dt, nz = t.z + t.vz * dt, ny = t.y + t.vy * dt;
      if (solidAt(nx, t.z)) t.vx *= -0.2; else t.x = nx; if (solidAt(t.x, nz)) t.vz *= -0.2; else t.z = nz;
      t.y = ny; if (t.y <= 0.05) { t.y = 0.05; t.landed = true; }
      t.m.position.set(t.x, t.y, t.z); t.m.rotation.x += dt * 8;
      if (t.landed && !t.done) { t.done = true; t.life = 6; sfx.chalk(); noiseAt(t.x, t.z, 15); }
      if (t.done) t.life -= dt;
    }
    thrown = thrown.filter(t => { if (t.done && t.life <= 0) { scene.remove(t.m); return false; } return true; });
    lockers.forEach(q => { if (q.shake > 0) q.shake -= dt; });
    // Monster
    const ox = M.x, oz = M.z; updateMonster(dt); if (state !== 'play' && state !== 'pad') return; gait(ox, oz, dt);
    // Tavlor som någon har skrivit på medan du inte tittade
    for (const b of boards) if (b.scary && !b.seen && Math.hypot(b.wx - player.x, b.wz - player.z) < 9 && looking(b.wx, b.wz, 0.85) && los(player.x, player.z, b.wx, b.wz, true)) { b.seen = true; sfx.reveal(); fearKick(0.6); say('Någon har skrivit på tavlan...', 2.2); }
    // Klocka
    const gm = 23 * 60 + elapsed * 0.1, hh = Math.floor(gm / 60) % 24, mm = Math.floor(gm % 60);
    clockEl.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); clockEl.classList.toggle('late', gm >= 23 * 60 + 45);
    drawWallClock(Math.floor(gm));
    if (gm >= 24 * 60) { midnight(); return; }
    const q = Math.floor((gm - 23 * 60) / 15);
    if (q > chimeQ) { chimeQ = q; for (let k = 0; k < q; k++) sfx.chime(k * 1.4); say(['', 'Kvart över elva.', 'Halv tolv. Det blir kallare i skolan...', 'Kvart i tolv! Skynda dig!'][q], 3); }
    if (surge < 2 && gm >= 23 * 60 + 20 + surge * 20) { surge++; powerSurge(); }
    if (gm > 23 * 60 + 50 && lastMin !== 50) { lastMin = 50; say('Klockan närmar sig tolv! Skynda dig!', 3); }
    // Slutet: dörren öppnas
    if (fin) {
      fin.t += dt; const o = Math.min(1, fin.t / 4.5);
      exitDoor.leaves.forEach(({ m, s }) => { m.position.x = EXIT_X + s * (0.96 + o * 1.95); });
      fxLight.intensity = o * 1.6;
      if (o > 0.5 && !fin.open) { fin.open = true; DOOR_CELLS.forEach(([c, r]) => { g[r][c] = 0; blocked[bi(c, r)] = 0; }); say('Dörren är öppen! SPRING UT!', 2.4); }
      if (fin.open && player.z > EXIT_Z + 0.5) { win(); return; }
    }
    // Handledning
    while (tut.length && elapsed >= tut[0][0]) { const [, m, cond] = tut.shift(); if (!cond || cond()) say(m, 3.6); }
    // Interaktionstext
    $('bOut').classList.toggle('hidden', !player.hid || !isTouch);
    const it = state === 'play' ? nearestInteract() : null;
    if (it) { promptEl.style.display = 'block'; promptEl.textContent = it.type === 'unhide' ? (isTouch ? 'Håll in 🫁 för att hålla andan' : 'MELLANSLAG: håll andan · E: kliv ut') : (isTouch ? 'Använd: ' : 'E: ') + (it.type === 'locker' ? 'gömma dig' : it.type === 'note' ? 'läs lappen' : 'skriv kod'); } else promptEl.style.display = 'none';
    // Rädsla: närhet till monstret, mörker och plötsliga händelser
    let danger = md < 18 ? Math.pow(1 - md / 18, 1.3) : 0; if (M.state === 'chase') danger = Math.min(1, danger * 1.4 + 0.3); if (M.state === 'sniff' && player.hid === M.sniffL) danger = 1;
    const dark = !flash.on && !lamps.some(q => q.lv > 0.5 && Math.abs(q.x - player.x) < 4 && Math.abs(q.z - player.z) < 4) ? 0.25 : 0;
    spike = Math.max(0, spike - dt * 0.25);
    const ft = Math.min(1, Math.max(danger, dark, spike));
    fear += (ft - fear) * Math.min(1, dt * (ft > fear ? 3 : 0.4));
    vigEl.style.opacity = Math.min(0.75, danger * 0.8);
    darkEl.style.opacity = 0.55 + fear * 0.3 + (player.holding ? 0.15 : 0);
    grainEl.style.opacity = 0.06 + fear * 0.12;
    hbT -= dt; if (hbT <= 0 && fear > 0.12) { sfx.beat(0.1 + fear * 0.35 + (player.holding ? 0.1 : 0)); hbT = 1.25 - fear * 0.85; }
    tickT -= dt; if (tickT <= 0) { sfx.tick(); tickT = 1; }
    creakT -= dt; if (creakT <= 0) { const p = farSpot(3, 12); if (p) sfx.creak(p[0], p[1]); creakT = 7 + Math.random() * 9; }
    // En blixtsnabb skymt av ansiktet när rädslan är som störst
    subT -= dt; if (subT <= 0 && fear > 0.55 && M.state !== 'chase') { subT = rr(25, 50); flashScare(70); }
    director(dt);
    updMsg(dt); updAudio();
  }
  function noiseAt(x, z, rad, quiet) {
    if (Math.hypot(M.x - x, M.z - z) < rad && M.state !== 'chase' && M.state !== 'sniff') { M.state = 'investigate'; M.last = [x, z]; setPath(x, z); M.wait = 0; if (!quiet) say('Monstret hörde något i närheten...', 1.8); }
  }

  const gctx = grainEl.getContext('2d'), gimg = gctx.createImageData(grainEl.width, grainEl.height), g32 = new Uint32Array(gimg.data.buffer);
  function drawGrain() { for (let i = 0; i < g32.length; i++) { const v = (Math.random() * 255) | 0; g32[i] = 0xff000000 | (v << 16) | (v << 8) | v; } gctx.putImageData(gimg, 0, 0); }
  let frameN = 0;
  function render() {
    const sh = shake * 0.1, sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    if (state === 'menu') {
      // Startskärmen: korridoren, och något som står längst bort och tittar på dig
      const cx = wc(2), cz = wc(10); camera.position.set(cx, 1.6, cz); camera.rotation.set(0.03, -Math.PI / 2 + 0.5 + Math.sin(time * 0.25) * 0.04, 0);
      M.x = wc(8); M.z = wc(10) + 1.6; M.face = Math.atan2(cx - M.x, cz - M.z); M.state = 'patrol'; M.spd = 0;
      torch.intensity = Math.random() < 0.03 ? 0.4 : 2.4;
    } else {
      const wake = Math.min(1, elapsed / 3.2), bob = player.moving ? Math.sin(time * (player.running ? 13 : 9)) * (player.running ? 0.05 : 0.03) : Math.sin(time * 1.7) * 0.006 * (1 + fear * 3);
      const hy = player.hid ? 1.45 : 0.75 + 0.85 * wake * wake * (3 - 2 * wake) + bob;
      camera.position.set(player.x + sx, hy + sy, player.z);
      camera.rotation.set(player.pitch + sy * 0.4, player.yaw + sx * 0.4, Math.sin(time * 0.8) * 0.006 * (1 + fear * 3));
    }
    let fov = 72;
    if (state === 'play' || state === 'pad') { if (player.running) fov += 7; if (M.state === 'stare') fov -= 9; if (M.state === 'chase') fov += 3 + Math.sin(time * 8) * 1.2; }
    if (state === 'dying') fov = 80;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.1; camera.updateProjectionMatrix(); }
    // Monstermodellen
    const chase = M.state === 'chase', sniff = M.state === 'sniff' && M.sniffL, stare = M.state === 'stare', mv = M.spd > 0.3, sw = M.sw;
    let lean = 0, mzr = M.z;
    if (sniff) { lean = Math.min(1, (3.6 - M.sniffT) * 1.6) * Math.min(1, M.sniffT * 2.5 + 0.2); mzr -= (M.sniffL.outYaw === Math.PI ? 1 : -1) * 0.6 * lean; }
    mon.position.set(M.x, mv ? Math.abs(Math.sin(sw)) * 0.07 : -0.45 * lean, mzr); mon.rotation.y = M.face;
    legs[0].rotation.x = mv ? Math.sin(sw) * 0.7 : 0; legs[1].rotation.x = -legs[0].rotation.x;
    upper.rotation.x = sniff ? 0.32 + 0.75 * lean : chase ? 0.7 : 0.32 + Math.sin(time * 1.7) * 0.03;
    let rel = Math.atan2(player.x - M.x, player.z - M.z) - M.face; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    const near = Math.hypot(player.x - M.x, player.z - M.z) < 16;
    headG.rotation.y += ((near && !sniff ? Math.max(-1, Math.min(1, rel)) : Math.sin(time * 0.7) * 0.5) - headG.rotation.y) * 0.1;
    headG.rotation.z = stare ? Math.min(1.25, (1.6 - M.stareT) * 1.2) : sniff ? Math.sin(time * 1.3) * 0.35 : state === 'menu' ? 0.5 + Math.sin(time * 0.6) * 0.2 : Math.sin(time * (chase ? 33 : 2.3)) * (chase ? 0.14 : 0.08);
    headG.rotation.x = sniff ? -0.3 - 0.75 * lean + Math.sin(time * 9) * 0.05 : -0.3 + (chase ? Math.sin(time * 27) * 0.06 : 0);
    if (M.gt > 0) { headG.rotation.y = M.gx; headG.rotation.z = M.gz; }   // ryck i huvudet
    jaw.rotation.x = chase || stare ? 0.55 + Math.sin(time * 18) * 0.18 : sniff ? 0.2 + Math.abs(Math.sin(time * 6)) * 0.15 : 0.08 + Math.sin(time * 1.4) * 0.03;
    armP.forEach(({ a, f, s }) => { a.rotation.x = sniff ? -0.5 * lean : chase ? -1.25 + Math.sin(sw + s) * 0.25 : (mv ? Math.sin(sw * 0.5 + s) * 0.3 : 0.05); a.rotation.z = s * (chase ? 0.25 : sniff ? 0.2 : 0.06); f.rotation.x = chase ? -0.5 : sniff ? -0.7 * lean : 0.1; });
    eyeGlow.opacity = chase || stare ? 1 : 0.6 + Math.sin(time * 9) * 0.12;
    { const es = 0.2 * Math.max(1, Math.hypot(camera.position.x - M.x, camera.position.z - M.z) / 7) / 1.12; eyeSprites.forEach(e => e.scale.set(es, es, 1)); }   // syns som två prickar långt bort
    eyeLight.intensity = chase || stare ? 1.4 : 0.8 + Math.sin(time * 9) * 0.15;
    mon.visible = state !== 'dying';
    const cx = camera.position.x, cz = camera.position.z;
    // Lampor: de två närmaste som lyser ger riktigt ljus
    for (const l of lamps) { l.lv = lampLevel(l); if (l.mode !== 2) l.mat.color.copy(l.lv > 0.5 ? LAMP_ON : LAMP_OFF); }
    const lit = lamps.filter(l => l.mode !== 2 && !l.dead && Math.abs(l.x - cx) < 16 && Math.abs(l.z - cz) < 16).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    for (let i = 0; i < 2; i++) { const l = lit[i]; if (l) { lampLights[i].position.set(l.x, WALL_H - 0.3, l.z); lampLights[i].intensity = 1.0 * l.lv; } else lampLights[i].intensity = 0; }
    // Blixtar, och skolan som blir mörkare ju närmare midnatt
    let bolt = 0; for (const [t, v] of bolts) if (time >= t) bolt = Math.max(bolt, v * Math.max(0, 1 - (time - t) / 0.1));
    boltL.intensity = bolt * 1.3; winMat.color.setScalar(0.65 + bolt * 2); patchMat.opacity = 0.16 + bolt * 0.6;
    ambL.intensity = 0.22 * (0.45 + 0.55 * power) * (1 - 0.3 * Math.min(1, elapsed / 600));
    for (const p of prints) p.m.material.opacity = Math.max(0, 0.7 * (1 - (time - p.born) / 50));
    for (const q of lockers) q.mesh.position.x = q.x + (q.shake > 0 ? (Math.random() - 0.5) * 0.06 : 0);
    // Dammkorn runt kameran
    const dp = dustGeo.attributes.position.array;
    for (let i = 0; i < dustN; i++) { dp[i * 3 + 1] -= 0.012; dp[i * 3] += Math.sin(time * 0.4 + i) * 0.003; if (dp[i * 3 + 1] < 0) dp[i * 3 + 1] = 3; }
    dustGeo.attributes.position.needsUpdate = true; dust.position.set(Math.round(cx / 12) * 12, 0, Math.round(cz / 12) * 12);
    if ((frameN++ & 1) === 0) drawGrain();
    renderer.render(scene, camera);
  }
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  reset(); state = 'menu';
  if (location.hash === '#test') window.__t = { player, M, flash, digits: () => digits, setElapsed: t => { elapsed = t; }, notes: () => notes, lockers, boards, begin, win, caught, startFinale, beginSniff, runEvent, lightning, spawnGhost, hide, unhide, keys, scene, renderer, state: () => state, fin: () => fin, fear: () => fear, tick: (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) update(dt); } };
  if (location.hash === '#playmon') { begin(); player.x = 13; player.z = 21; player.yaw = 0; flash.on = true; M.x = 13; M.z = 14.6; M.face = 0; M.state = 'chase'; M.last = [13, 21]; }
  if (location.hash === '#play') { begin(); player.yaw = 0.6; flash.on = true; }
  let last = performance.now();
  function frame(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; update(dt); render(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
