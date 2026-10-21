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

  // ---------- Rutnät ----------
  const g = []; for (let y = 0; y < MAP_H; y++) g.push(new Uint8Array(MAP_W).fill(1));
  const carve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = 0; };
  ROOMS.forEach(r => carve(r.x0, r.y0, r.x1, r.y1)); carve(CORRIDOR.x0, CORRIDOR.y0, CORRIDOR.x1, CORRIDOR.y1);
  OPENINGS.forEach(([x, y]) => { g[y][x] = 0; });
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const bi = (c, r) => r * MAP_W + c;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) blocked[bi(x, y)] = g[y][x];
  const isBlocked = (c, r) => c < 0 || r < 0 || c >= MAP_W || r >= MAP_H || blocked[bi(c, r)] === 1;
  const cellOf = (x, z) => [Math.floor(x / CS), Math.floor(z / CS)];
  const wc = c => (c + 0.5) * CS;

  // ---------- Three.js ----------
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02070a');
  scene.fog = new THREE.FogExp2('#02070a', 0.065);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 80);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  scene.add(new THREE.AmbientLight('#35605e', 0.55));
  const glow = new THREE.PointLight('#6fb8c8', 0.7, 8, 1.6); camera.add(glow);
  const torch = new THREE.SpotLight('#fff3d0', 2.6, 24, 0.5, 0.45, 1.2);
  camera.add(torch); torch.position.set(0.15, -0.1, 0); torch.target.position.set(0, 0, -5); camera.add(torch.target);

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
      if (g[y][x] !== 1) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < MAP_W && ny < MAP_H && g[ny][nx] === 0) near = true; }
      if (near) cells.push([x, y]);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(CS, WALL_H, CS), new THREE.MeshLambertMaterial({ map: wallTex }), cells.length);
    const m4 = new THREE.Matrix4();
    cells.forEach(([x, y], k) => { m4.makeTranslation(wc(x), WALL_H / 2, wc(y)); im.setMatrixAt(k, m4); });
    scene.add(im);
  }
  // Lysrör i taket. Några är trasiga, några flimrar. De två närmaste lysande ger riktigt ljus.
  const lamps = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (g[y][x] === 0 && (x + y * 2) % 5 === 0) {
    const k = lamps.length, mode = k % 5 === 0 ? 2 : k % 3 === 0 ? 1 : 0, mat = basic(mode === 2 ? '#161a1a' : '#c8e8e0');
    box(1.1, 0.06, 0.3, mat, wc(x), WALL_H - 0.04, wc(y)); box(1.2, 0.04, 0.38, lam('#555'), wc(x), WALL_H - 0.01, wc(y));
    lamps.push({ x: wc(x), z: wc(y), mode, mat, k });
  }
  const lampLights = [0, 1].map(() => { const l = new THREE.PointLight('#cfe9ff', 0, 11, 1.4); l.position.set(0, WALL_H - 0.3, 0); scene.add(l); return l; });
  const lampLevel = (l) => l.mode === 2 ? 0 : l.mode === 1 ? (Math.sin(time * 31 + l.k * 7) > -0.1 || Math.sin(time * 4 + l.k) > 0.6 ? 1 : 0.08) : 1;

  // Dekor på väggar
  function wallItem(c, r, face, w, h, y, map, color) {
    const mat = map ? new THREE.MeshLambertMaterial({ map }) : lam(color);
    const p = mesh(new THREE.PlaneGeometry(w, h), mat, 0, y, 0);
    if (face === 'N') { p.position.set(wc(c), y, r * CS + 0.04); }
    else if (face === 'S') { p.position.set(wc(c), y, (r + 1) * CS - 0.04); p.rotation.y = Math.PI; }
    return p;
  }
  const textTex = (txt, w, h, bg, fg, font) => tex(w, h, (c) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2); });
  wallItem(8, 1, 'N', 5, 1.6, 1.7, textTex('Tisdag: bråk', 256, 80, '#1f3b2f', '#e8e8e8', 'bold 34px sans-serif'));
  wallItem(8, 13, 'N', 5, 1.6, 1.7, textTex('Läxa: sidan 42', 256, 80, '#1f3b2f', '#e8e8e8', 'bold 34px sans-serif'));
  wallItem(7, 19, 'S', 4, 1.4, 1.7, textTex('Välkomna!', 256, 80, '#1f3b2f', '#e8e8e8', 'bold 34px sans-serif'));
  wallItem(24, 19, 'S', 3.2, 1.2, 1.8, textTex('Kapprum', 256, 64, '#5a3a22', '#f4e4c1', 'bold 34px sans-serif'));
  wallItem(25, 1, 'N', 2.4, 1.2, 1.7, textTex('LÄRARRUM', 256, 80, '#222', '#ffd43b', 'bold 36px sans-serif'));
  wallItem(13, 1, 'N', 2.4, 1.2, 1.7, textTex('BIBLIOTEK', 256, 80, '#222', '#8ce99a', 'bold 36px sans-serif'));
  for (let c = 2; c <= 33; c += 3) {
    const cols = ['#e8590c', '#1c7ed6', '#f59f00', '#2f9e44', '#c2255c'];
    if (g[8][c] === 1 && c !== 4 && c !== 7) wallItem(c, 9, 'N', 0.9, 1.2, 1.7, null, cols[(c * 7) % 5]);
    if (g[12][c] === 1 && c !== 4 && c !== 7) wallItem(c, 11, 'S', 0.9, 1.2, 1.7, null, cols[(c * 3) % 5]);
  }
  // Väggklocka i korridoren som visar spelklockan
  const clockCv = document.createElement('canvas'); clockCv.width = clockCv.height = 128;
  const clockTex = new THREE.CanvasTexture(clockCv);
  const clockMesh = wallItem(14, 11, 'S', 1.1, 1.1, 2.2, clockTex);
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
  // Utgångsdörren
  {
    const frame = box(4.2, 2.9, 0.3, lam('#5a4a3a'), EXIT_X, 1.45, EXIT_Z + 0.05);
    for (const s of [-1, 1]) box(1.8, 2.5, 0.12, new THREE.MeshLambertMaterial({ color: '#27465a' }), EXIT_X + s * 0.95, 1.3, EXIT_Z - 0.12);
    const sign = mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: textTex('UTGÅNG', 256, 64, '#0a6b2a', '#ffffff', 'bold 40px sans-serif') }), EXIT_X, 2.75, EXIT_Z - 0.3);
    sign.rotation.y = Math.PI;
    box(0.3, 0.45, 0.1, basic('#2fd6c6'), EXIT_X + 2.5, 1.3, EXIT_Z - 0.1);
  }

  // Fönster med månljus (fönster på ytterväggarna + ljusfläck på golvet)
  const WINDOWS = [[3, 1, 'N'], [19, 1, 'N'], [31, 1, 'N'], [33, 1, 'N'], [2, 19, 'S'], [4, 19, 'S'], [13, 19, 'S'], [19, 19, 'S'], [26, 19, 'S'], [32, 19, 'S']];
  {
    const winTex = tex(128, 160, (c) => {
      const gr = c.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#1d3a6b'); gr.addColorStop(1, '#0d1d3d'); c.fillStyle = gr; c.fillRect(0, 0, 128, 160);
      c.fillStyle = 'rgba(210,225,255,.9)'; c.beginPath(); c.arc(92, 38, 9, 0, 7); c.fill();
      c.fillStyle = '#0a1120'; c.beginPath(); c.moveTo(0, 160); for (let x = 0; x <= 128; x += 8) c.lineTo(x, 130 + Math.sin(x * 0.3) * 8 + (x % 16 ? 4 : 0)); c.lineTo(128, 160); c.fill();
      c.strokeStyle = '#d8d4c6'; c.lineWidth = 8; c.strokeRect(4, 4, 120, 152); c.lineWidth = 5; c.beginPath(); c.moveTo(64, 0); c.lineTo(64, 160); c.moveTo(0, 80); c.lineTo(128, 80); c.stroke();
    });
    const patchTex = tex(64, 128, (c) => { const gr = c.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 128); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(30, 0, 4, 128); c.fillRect(0, 62, 64, 4); });
    const wm = new THREE.MeshBasicMaterial({ map: winTex }), pm = new THREE.MeshBasicMaterial({ map: patchTex, color: '#6f9bd8', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    WINDOWS.forEach(([c, r, f]) => {
      const w = wallItem(c, r, f, 1.5, 1.6, 1.75, null, '#000'); w.material = wm;
      const x = wc(c), wallZ = f === 'N' ? r * CS : (r + 1) * CS, dir = f === 'N' ? 1 : -1;
      box(1.7, 0.08, 0.3, lam('#cfc9b8'), x, 0.92, wallZ + dir * 0.14);                       // fönsterbräda
      box(1.0, 0.7, 0.14, lam('#8f918c'), x, 0.5, wallZ + dir * 0.1);                          // element
      const pt = mesh(new THREE.PlaneGeometry(1.5, 3.4), pm, x, 0.03, wallZ + dir * 1.9); pt.rotation.x = -Math.PI / 2; pt.rotation.z = f === 'N' ? 0 : Math.PI;
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
    box(0.9, 0.04, 0.02, basic('#1b2a36'), x, 1.7, z + (f === 'N' ? 0.39 : -0.39));
    box(0.08, 0.3, 0.05, lam('#c9d4dc'), x + 0.35, 1.0, z + (f === 'N' ? 0.4 : -0.4));
    blocked[bi(c, r)] = 1;
    return { x, z, c, r, outYaw: f === 'N' ? Math.PI : 0, mesh: m };   // utåt från väggen
  });

  // ---------- Monstret: långt, blekt och snett. Läskigt, men utan blod ----------
  const mon = new THREE.Group();
  const pale = lam('#cfc8bb'), dark = lam('#0e0a14'), rag = lam('#1b1a22'), claw = lam('#15121a');
  const redEye = basic('#ff2a1a'), blackB = basic('#000000'), toothB = basic('#efe9d6');
  const legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(s * 0.2, 1.05, 0); mon.add(l); mesh(new THREE.CylinderGeometry(0.08, 0.05, 1.05, 6), dark, 0, -0.52, 0, l); mesh(new THREE.ConeGeometry(0.1, 0.35, 5), claw, 0, -1.05, 0.12, l).rotation.x = Math.PI / 2; return l; });
  const upper = new THREE.Group(); upper.position.set(0, 1.05, 0); mon.add(upper);
  mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.15, 8), rag, 0, 0.55, 0, upper);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; mesh(new THREE.ConeGeometry(0.07, 0.6, 4), rag, Math.sin(a) * 0.3, 0.1, Math.cos(a) * 0.28, upper).rotation.x = Math.PI; }
  const neck = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6), pale, 0, 1.3, 0.08, upper); neck.rotation.x = 0.4;
  const headG = new THREE.Group(); headG.position.set(0, 1.62, 0.2); upper.add(headG);
  mesh(new THREE.SphereGeometry(0.3, 14, 12), pale, 0, 0, 0, headG).scale.set(0.78, 1.28, 0.9);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.1, 10, 8), blackB, s * 0.14, 0.1, 0.22, headG).scale.set(1, 1.35, 0.6);
    mesh(new THREE.SphereGeometry(0.045, 8, 6), redEye, s * 0.14, 0.1, 0.285, headG);
  }
  mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), blackB, 0, -0.02, 0.28, headG);
  const eyeLight = new THREE.PointLight('#ff2a1a', 0.9, 6, 2); eyeLight.position.set(0, 0.1, 0.45); headG.add(eyeLight);
  for (let k = -3; k <= 3; k++) mesh(new THREE.ConeGeometry(0.03, 0.12, 4), toothB, k * 0.065, -0.2, 0.27 - Math.abs(k) * 0.02, headG).rotation.x = Math.PI;
  mesh(new THREE.BoxGeometry(0.46, 0.03, 0.05), blackB, 0, -0.18, 0.25, headG);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.2, 0.05); headG.add(jaw);
  mesh(new THREE.BoxGeometry(0.4, 0.18, 0.28), blackB, 0, -0.1, 0.12, jaw);
  for (let k = -3; k <= 3; k++) mesh(new THREE.ConeGeometry(0.03, 0.12, 4), toothB, k * 0.065, -0.02, 0.24 - Math.abs(k) * 0.025, jaw);
  mesh(new THREE.SphereGeometry(0.1, 8, 6), pale, 0, -0.22, 0.12, jaw).scale.set(1.2, 0.8, 1);
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 1.6 - 0.8, len = 0.7 + Math.random() * 0.7; mesh(new THREE.CylinderGeometry(0.012, 0.006, len, 4), dark, Math.sin(a) * 0.22, 0.28 - len / 2, -0.1 - Math.cos(a) * 0.05, headG); }
  const armP = [-1, 1].map(s => {
    const a = new THREE.Group(); a.position.set(s * 0.34, 1.1, 0); upper.add(a);
    mesh(new THREE.CylinderGeometry(0.055, 0.04, 1.0, 6), dark, 0, -0.5, 0, a);
    const f = new THREE.Group(); f.position.set(0, -1.0, 0); a.add(f);
    mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.95, 6), dark, 0, -0.47, 0, f); mesh(new THREE.SphereGeometry(0.06, 6, 5), pale, 0, -0.97, 0, f);
    for (let k = -1; k <= 2; k++) mesh(new THREE.ConeGeometry(0.018, 0.3, 4), claw, k * 0.035 - 0.017, -1.12, 0, f);
    return { a, f, s };
  });
  mon.scale.setScalar(1.05); scene.add(mon);

  // ---------- Dynamiska föremål (slumpas varje runda) ----------
  const dyn = new THREE.Group(); scene.add(dyn);
  let notes = [], batteries = [], digits = [], found = [], decoyRead = false;
  const WORDS = [['BOK', 3], ['BÄNK', 4], ['SKÅP', 4], ['SKOLA', 5], ['KRITA', 5], ['TAVLA', 5], ['SLÖJD', 5], ['KLOCKA', 6], ['LÄRARE', 6], ['GÖTEBORG', 8], ['VICTORIA', 8], ['KLASSRUM', 8], ['BIBLIOTEK', 9]];
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
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
    digits = [rint(1, 9), rint(1, 9), rint(1, 9)]; found = [false, false, false]; decoyRead = false;
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
  const player = { x: 0, z: 0, yaw: 0, pitch: 0, r: 0.35, noise: 0, hid: null, hideCool: 0, moving: false };
  const flash = { on: false, bat: 100 };
  let chalk = 3, state = 'menu', elapsed = 0, thrown = [], time = 0, msgT = 0, msgQ = [];
  const M = { x: 0, z: 0, face: 0, state: 'patrol', path: [], wait: 0, lost: 0, rp: 0, last: [0, 0], checked: false, certain: false, step: 0 };

  function say(t, d = 2.6) { msgQ.push([t, d]); }
  function updMsg(dt) {
    msgT -= dt;
    if (msgT <= 0) { if (msgQ.length) { const [t, d] = msgQ.shift(); $('msg').textContent = t; $('msg').classList.add('show'); msgT = d; } else $('msg').classList.remove('show'); }
  }

  // ---------- Ljud (Web Audio, inga filer) ----------
  let ac = null, droneOn = false;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (ac && ac.state === 'suspended') ac.resume();
    if (ac && !droneOn) {
      droneOn = true;
      for (const f of [55, 58.5]) { const o = ac.createOscillator(), gn = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = f; gn.gain.value = 0.018; const lp = ac.createBiquadFilter(); lp.frequency.value = 160; o.connect(lp); lp.connect(gn); gn.connect(ac.destination); o.start(); }
    }
  }
  function tone(f, d, type = 'sine', v = 0.1, slide = 0, delay = 0) {
    if (!ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
    gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, v, f = 1200, delay = 0) {
    if (!ac) return; const t = ac.currentTime + delay, n = Math.floor(ac.sampleRate * d), b = ac.createBuffer(1, n, ac.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), gn = ac.createGain(), lp = ac.createBiquadFilter(); s.buffer = b; lp.frequency.value = f; gn.gain.value = v; s.connect(lp); lp.connect(gn); gn.connect(ac.destination); s.start(t);
  }
  const sfx = {
    tick: () => tone(1400, 0.03, 'square', 0.015), beat: v => { tone(62, 0.13, 'sine', v, 40); tone(55, 0.16, 'sine', v * 0.8, 38, 0.17); },
    creak: () => tone(190, 0.7, 'sawtooth', 0.03, 120), pick: () => { tone(660, 0.1, 'triangle', 0.1, 990); }, door: () => { noise(0.25, 0.2, 500); tone(110, 0.2, 'square', 0.06, 70); },
    alarm: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 520 : 400, 0.22, 'square', 0.1, 0, i * 0.24); }, thump: v => { noise(0.12, v, 260); tone(70, 0.12, 'sine', v, 40); },
    scare: () => { noise(0.9, 0.5, 4000); tone(95, 0.9, 'sawtooth', 0.3, 40); tone(900, 0.5, 'square', 0.15, 300, 0.05); },
    scream: long => { const d = long ? 1.2 : 0.65; noise(d, 0.55, 7000); [700, 1050, 1420].forEach((f, i) => tone(f, d, 'sawtooth', 0.15, f * 0.4, i * 0.02)); tone(170, d, 'square', 0.14, 480); tone(90, d, 'sawtooth', 0.25, 40); },
    stinger: () => { tone(220, 0.5, 'sawtooth', 0.12, 110); tone(233, 0.5, 'sawtooth', 0.12, 117); }, win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, 0, i * 0.14)); }, chalk: () => noise(0.08, 0.2, 3000)
  };

  // ---------- Hjälpfunktioner för rutnät ----------
  function los(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / 0.4);
    for (let k = 1; k < n; k++) { const [c, r] = cellOf(x0 + dx * k / n, z0 + dz * k / n); if (isBlocked(c, r)) return false; }
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

  // ---------- Styrning ----------
  const keys = {}; let locked = false;
  const joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 }, look = { id: null, x: 0, y: 0 };
  let sneakToggle = false;
  addEventListener('keydown', e => {
    if (state === 'pad' && /^[0-9]$/.test(e.key)) { padKey(e.key); return; }
    keys[e.code] = true;
    if (state === 'play') {
      if (e.code === 'KeyE') useAction(); else if (e.code === 'KeyF') toggleFlash(); else if (e.code === 'KeyQ') throwChalk();
    }
    if (e.code === 'Escape' && state === 'play') pauseGame();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && state === 'play' && !isTouch && !player.hid) pauseGame(); });
  document.addEventListener('mousemove', e => { if (locked && state === 'play') lookBy(e.movementX * 0.0022, e.movementY * 0.0022); });
  function lookBy(dx, dy) {
    player.yaw -= dx; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - dy));
    if (player.hid) {
      const o = player.hid.outYaw; let rel = (((player.yaw - o + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      player.yaw = o + Math.max(-1.1, Math.min(1.1, rel));
    }
  }
  function relock() { if (!isTouch) { try { canvas.requestPointerLock(); } catch (e) { } } }
  canvas.addEventListener('click', () => { if (state === 'play' && !locked) relock(); });
  // Touch: vänster halva = joystick, höger halva = titta
  const joyb = $('joyb'), joyk = $('joyk');
  addEventListener('touchstart', e => {
    if (state !== 'play') return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('.tb,#pause,#bOut')) continue;
      if (t.clientX < innerWidth * 0.5 && joy.id === null) { joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = joy.y = 0; joyb.style.display = joyk.style.display = 'block'; joyb.style.left = joyk.style.left = t.clientX + 'px'; joyb.style.top = joyk.style.top = t.clientY + 'px'; }
      else if (t.clientX >= innerWidth * 0.5 && look.id === null) { look.id = t.identifier; look.x = t.clientX; look.y = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (state !== 'play') return;
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
    test('door', null, EXIT_X, EXIT_Z - 0.6, 3.2, 0.4);
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
    M.certain = M.state === 'chase' && d < 12 && los(M.x, M.z, player.x, player.z);
    player.hid = l; player.x = l.x; player.z = l.z; player.yaw = l.outYaw; player.pitch = 0; player.hideCool = 0.6; document.body.classList.add('inlocker'); sfx.door(); if (document.exitPointerLock) document.exitPointerLock();
    say(M.certain ? 'Monstret såg att du gömde dig!' : 'Du gömmer dig i skåpet. Håll andan...', 2.2);
  }
  function unhide() {
    if (player.hideCool > 0) return; const l = player.hid, fo = l.outYaw === Math.PI ? 1 : -1;
    player.x = l.x; player.z = l.z + fo * 1.15; if (!canStand(player.x, player.z, 0.3)) { player.x = l.x + 1.1; player.z = l.z + fo * 0.9; }
    player.hid = null; player.hideCool = 0.6; document.body.classList.remove('inlocker'); sfx.door(); relock();
  }
  function readNote(n) {
    n.read = true; sfx.pick();
    if (n.idx >= 0) {
      found[n.idx] = true;
      $('notetitle').textContent = n.spot.intro; $('notetext').innerHTML = '<b>Siffra ' + (n.idx + 1) + ' i koden:</b><br>' + n.riddle;
      const nb = $('notes'); if (!document.getElementById('nt' + n.idx)) { const d = document.createElement('div'); d.id = 'nt' + n.idx; d.textContent = 'Siffra ' + (n.idx + 1) + ': ' + n.riddle; nb.appendChild(d); }
      $('code').textContent = 'Lappar: ' + found.filter(Boolean).length + '/3';
    } else {
      $('notetitle').textContent = n.spot.intro; $('notetext').textContent = 'Matsedel: Fredag blir det fiskpinnar. Glöm inte stänga fönstret! (Inget om koden här.)';
    }
    openOverlay('note');
  }
  // Kodlås
  let entry = '';
  const keysEl = $('keys');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].forEach(k => { const b = document.createElement('button'); b.textContent = k; b.addEventListener('click', () => padKey(k)); keysEl.appendChild(b); });
  function padShow() { $('disp').textContent = (entry + '___').slice(0, 3).replace(/_/g, '_'); }
  function padKey(k) {
    sfx.tick();
    if (k === 'C') entry = ''; else if (k === 'OK') { if (entry.length === 3) checkCode(); }
    else if (entry.length < 3) { entry += k; if (entry.length === 3) setTimeout(checkCode, 250); }
    padShow();
  }
  function checkCode() {
    if (entry === digits.join('')) { win(); return; }
    entry = ''; padShow(); sfx.alarm(); say('Fel kod! Larmet går! Monstret hör det!', 2.6);
    closeOverlay(); M.state = 'investigate'; M.last = [EXIT_X, EXIT_Z - 2]; M.path = bfs(...cellOf(M.x, M.z), 28, 18); M.wait = 0; M.certain = false;
  }
  function openPad() {
    if (found.filter(Boolean).length < 3) say('Ett kodlås. Du hittar nog siffrorna på lappar någonstans i skolan.', 2.6);
    entry = ''; padShow(); openOverlay('pad');
  }
  function openOverlay(name) { state = name; $(name).classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); }
  function closeOverlay() { $('note').classList.add('hidden'); $('pad').classList.add('hidden'); state = 'play'; relock(); }
  $('noteok').addEventListener('click', closeOverlay); $('padclose').addEventListener('click', closeOverlay);
  function pauseGame() { state = 'paused'; $('pausev').classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); }
  $('resume').addEventListener('click', () => { $('pausev').classList.add('hidden'); state = 'play'; relock(); });

  // ---------- Start, slut ----------
  function reset() {
    placeRandom();
    const [sc, sr] = START; player.x = wc(sc); player.z = wc(sr); player.yaw = 0; player.pitch = 0; player.hid = null; player.hideCool = 0; document.body.classList.remove('inlocker');
    flash.on = false; flash.bat = 100; chalk = 3; elapsed = 0; $('chalk').textContent = 3; $('code').textContent = 'Lappar: 0/3';
    thrown.forEach(t => scene.remove(t.m)); thrown = [];
    const [mc, mr] = pick(MONSTER_STARTS); M.x = wc(mc); M.z = wc(mr); M.state = 'patrol'; M.path = []; M.wait = 2; M.lost = 0; M.checked = false;
    msgQ = []; msgT = 0; hbT = 0; stepT = 0; creakT = 6;
    tut = [[1.0, 'Du vaknar under en bänk i Klassrum 2. Allt är mörkt...'], [5.5, 'Tryck på F (eller 🔦) för att tända ficklampan.'], [10, 'Leta efter lappar med gåtor. Svaren är siffror i koden till utgången.'], [16, 'Hör du steg? Gå in i ett skåp med E när monstret kommer!']];
  }
  let tut = [];
  function begin() {
    audio(); ['menu', 'caught', 'late', 'win'].forEach(i => $(i).classList.add('hidden')); reset(); state = 'play'; relock();
  }
  function flashScare(ms) { const s = $('scare'); s.classList.remove('hidden'); clearTimeout(flashScare.t); flashScare.t = setTimeout(() => s.classList.add('hidden'), ms); }
  let scareCool = 0;
  function caught() {
    if (state !== 'play') return; state = 'over'; sfx.scream(true); flashScare(1200); if (document.exitPointerLock) document.exitPointerLock();
    document.body.classList.remove('inlocker'); setTimeout(() => $('caught').classList.remove('hidden'), 1250);
  }
  function win() {
    state = 'over'; $('note').classList.add('hidden'); $('pad').classList.add('hidden'); sfx.win(); if (document.exitPointerLock) document.exitPointerLock();
    const t = Math.round(elapsed); let best = 0; try { best = +localStorage.getItem('sem-best') || 0; } catch (e) { }
    let rec = ''; if (!best || t < best) { try { localStorage.setItem('sem-best', t); } catch (e) { } rec = ' Nytt rekord!'; }
    $('wintext').textContent = 'Du tog dig ut på ' + Math.floor(t / 60) + ' min ' + (t % 60) + ' s.' + rec;
    $('win').classList.remove('hidden');
  }
  function tooLate() { state = 'over'; sfx.scare(); if (document.exitPointerLock) document.exitPointerLock(); $('late').classList.remove('hidden'); }
  $('startbtn').addEventListener('click', begin); ['again1', 'again2', 'again3'].forEach(i => $(i).addEventListener('click', begin));
  try { const b = +localStorage.getItem('sem-best'); if (b) $('best').textContent = 'Din bästa tid: ' + Math.floor(b / 60) + ' min ' + (b % 60) + ' s'; } catch (e) { }

  // ---------- Monsterns hjärna ----------
  function turnM(a, dt, k = 8) { let d = a - M.face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; M.face += d * Math.min(1, dt * k); }
  function setPath(x, z) { const [mc, mr] = cellOf(M.x, M.z), [tc, tr] = cellOf(x, z); M.path = bfs(mc, mr, tc, tr); }
  function followPath(dt, sp) {
    if (!M.path.length) return true; const [c, r] = M.path[0], tx = wc(c), tz = wc(r), dx = tx - M.x, dz = tz - M.z, d = Math.hypot(dx, dz), st = sp * dt;
    if (d <= st) { M.x = tx; M.z = tz; M.path.shift(); } else { M.x += dx / d * st; M.z += dz / d * st; }
    if (d > 0.02) turnM(Math.atan2(dx, dz), dt); return M.path.length === 0;
  }
  function updateMonster(dt) {
    const dx = player.x - M.x, dz = player.z - M.z, d = Math.hypot(dx, dz);
    let see = false;
    if (!player.hid && d < (flash.on ? 14 : 9)) {
      const dot = (Math.sin(M.face) * dx + Math.cos(M.face) * dz) / (d || 1);
      if ((dot > 0.55 || d < 2.2) && los(M.x, M.z, player.x, player.z)) see = true;
    }
    const heard = !player.hid && player.noise > 0 && d < player.noise * (los(M.x, M.z, player.x, player.z) ? 1 : 0.6);
    const speedUp = 3.3 + 0.6 * Math.min(1, elapsed / 600);
    M.rp -= dt; scareCool -= dt;
    if (see) {
      if (M.state !== 'chase') {
        say('Monstret såg dig! Spring eller göm dig!', 2.2); sfx.stinger();
        if (scareCool <= 0) { sfx.scream(false); flashScare(550); scareCool = 10; }
      }
      M.state = 'chase'; M.lost = 0; M.last = [player.x, player.z];
    } else if (heard && M.state !== 'chase' && M.rp <= 0) {
      if (M.state !== 'investigate') say('Monstret hörde dig...', 1.6);
      M.state = 'investigate'; M.last = [player.x, player.z]; setPath(player.x, player.z); M.rp = 0.6; M.wait = 0;
    }
    // Skåpskontroll
    if (player.hid) {
      const l = player.hid, dl = Math.hypot(M.x - l.x, M.z - l.z);
      if (dl < 2.4 && !M.checked) {
        M.checked = true;
        if (Math.random() < (M.certain ? 0.95 : 0.4)) { caught(); return; }
        say('Monstret nosade vid skåpet... och gick vidare.', 2.4); M.state = 'search'; M.wait = 2.5; M.path = [];
      }
      if (dl > 5) M.checked = false;
    }
    if (M.state === 'chase') {
      if (!see) M.lost += dt;
      if (M.rp <= 0) { M.rp = 0.3; setPath(M.last[0], M.last[1]); }
      const stp = speedUp * dt;
      if (see && d < 3.5 && canStand(M.x + dx / d * stp, M.z + dz / d * stp, 0.4)) { turnM(Math.atan2(dx, dz), dt, 12); M.x += dx / d * stp; M.z += dz / d * stp; }
      else if (followPath(dt, speedUp) && !see) { M.state = 'search'; M.wait = 2.5; }
      if (!see && M.lost > 5) { M.state = 'search'; M.wait = 2; M.path = []; }
    } else if (M.state === 'investigate') {
      if (followPath(dt, 2.6)) { M.state = 'search'; M.wait = 2.2; }
    } else if (M.state === 'search') {
      M.wait -= dt; M.face += dt * 1.6; if (M.wait <= 0) { M.state = 'patrol'; M.path = []; M.wait = 0.3; }
    } else {
      if (!M.path.length) { M.wait -= dt; if (M.wait <= 0) { const w = pick(WAYPOINTS); setPath(wc(w[0]), wc(w[1])); M.wait = 1.2; } }
      else followPath(dt, 1.8);
    }
    if (!player.hid && d < 1.05) caught();
  }

  // ---------- Uppdatering ----------
  let hbT = 0, stepT = 0, creakT = 6, tickT = 0, lastMin = -1;
  function update(dt) {
    time += dt;
    if (state !== 'play') return;
    elapsed += dt;
    // Förflyttning
    let mx = joy.x, mz = joy.y;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
    let l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; l = 1; }
    player.hideCool -= dt;
    if (player.hid && player.hideCool <= 0 && l > 0.3) { unhide(); return; }
    let sp = 0; player.moving = false; player.noise = 0;
    if (!player.hid && l > 0.12) {
      const touchy = joy.id !== null;
      const sneak = keys.ShiftLeft || keys.ShiftRight || sneakToggle || (touchy && l < 0.5), run = keys.Space || (touchy && l > 0.92 && !sneakToggle);
      sp = sneak ? 1.3 : run ? 4.4 : 2.6; player.noise = sneak ? 3.5 : run ? 15 : 8; player.moving = true;
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      const vx = (fx * -mz + rx * mx) * sp * dt, vz = (fz * -mz + rz * mx) * sp * dt;
      if (canStand(player.x + vx, player.z, player.r)) player.x += vx;
      if (canStand(player.x, player.z + vz, player.r)) player.z += vz;
    }
    // Ficklampa
    if (flash.on) { flash.bat -= 0.55 * dt; if (flash.bat <= 0) { flash.bat = 0; flash.on = false; say('Batteriet tog slut!', 2); } }
    $('batf').style.width = flash.bat + '%'; $('batt').textContent = Math.round(flash.bat) + '%';
    torch.intensity = flash.on ? (flash.bat < 15 ? 2.6 * (0.55 + 0.45 * Math.sin(time * 40) * Math.sin(time * 13)) : 2.6) : 0;
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
    // Monster
    updateMonster(dt); if (state !== 'play') return;
    // Klocka
    const gm = 23 * 60 + elapsed * 0.1, hh = Math.floor(gm / 60) % 24, mm = Math.floor(gm % 60);
    $('clock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    drawWallClock(Math.floor(gm));
    if (gm >= 24 * 60) { tooLate(); return; }
    if (gm > 23 * 60 + 50 && lastMin !== 50) { lastMin = 50; say('Klockan närmar sig tolv! Skynda dig!', 3); }
    if (elapsed < 1) lastMin = -1;
    // Handledning
    while (tut.length && elapsed >= tut[0][0]) say(tut.shift()[1], 3.6);
    // Interaktionstext
    $('bOut').classList.toggle('hidden', !player.hid);
    const it = nearestInteract(), pr = $('prompt');
    if (it) { pr.style.display = 'block'; pr.textContent = it.type === 'unhide' ? (isTouch ? 'Använd: kliv ut' : 'E: kliv ut') : (isTouch ? 'Använd: ' : 'E: ') + (it.type === 'locker' ? 'gömma dig' : it.type === 'note' ? 'läs lappen' : 'skriv kod'); } else pr.style.display = 'none';
    // Ljud och fara
    const md = Math.hypot(M.x - player.x, M.z - player.z);
    let danger = md < 18 ? Math.pow(1 - md / 18, 1.3) : 0; if (M.state === 'chase') danger = Math.min(1, danger * 1.4 + 0.3);
    $('vig').style.opacity = Math.min(0.75, danger * 0.8);
    hbT -= dt; if (hbT <= 0 && danger > 0.05) { sfx.beat(0.12 + danger * 0.35); hbT = 1.3 - danger * 0.9; }
    tickT -= dt; if (tickT <= 0) { sfx.tick(); tickT = 1; }
    stepT -= dt; if (stepT <= 0 && md < 16 && M.state !== 'search') { sfx.thump(Math.max(0.04, 0.35 * (1 - md / 16))); stepT = M.state === 'chase' ? 0.32 : 0.6; }
    creakT -= dt; if (creakT <= 0) { sfx.creak(); creakT = 7 + Math.random() * 9; }
    updMsg(dt);
  }
  function noiseAt(x, z, rad) {
    if (Math.hypot(M.x - x, M.z - z) < rad && M.state !== 'chase') { M.state = 'investigate'; M.last = [x, z]; setPath(x, z); M.wait = 0; say('Monstret hörde något i närheten...', 1.8); }
  }

  function render() {
    const shake = (typeof scareCool !== 'undefined' && scareCool > 9.4) ? (Math.random() - 0.5) * 0.08 : 0;
    const hy = player.hid ? 1.45 : 1.6 + (player.moving ? Math.sin(time * 9) * 0.03 : 0);
    camera.position.set(player.x + shake, hy + shake, player.z); camera.rotation.set(player.pitch, player.yaw, 0);
    // Monstermodellen
    const chase = M.state === 'chase', mv = M.path.length > 0 || chase, sw = time * (chase ? 15 : 7);
    mon.position.set(M.x, mv ? Math.abs(Math.sin(sw)) * 0.07 : 0, M.z); mon.rotation.y = M.face;
    legs[0].rotation.x = mv ? Math.sin(sw) * 0.7 : 0; legs[1].rotation.x = -legs[0].rotation.x;
    upper.rotation.x = (chase ? 0.7 : 0.32) + Math.sin(time * 1.7) * 0.03;
    let rel = Math.atan2(player.x - M.x, player.z - M.z) - M.face; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    const near = Math.hypot(player.x - M.x, player.z - M.z) < 16;
    headG.rotation.y += ((near ? Math.max(-1, Math.min(1, rel)) : Math.sin(time * 0.7) * 0.5) - headG.rotation.y) * 0.1;
    headG.rotation.z = Math.sin(time * (chase ? 33 : 2.3)) * (chase ? 0.14 : 0.08); headG.rotation.x = -0.3 + (chase ? Math.sin(time * 27) * 0.06 : 0);
    jaw.rotation.x = chase ? 0.55 + Math.sin(time * 18) * 0.18 : 0.08 + Math.sin(time * 1.4) * 0.03;
    armP.forEach(({ a, f, s }) => { a.rotation.x = chase ? -1.25 + Math.sin(sw + s) * 0.25 : (mv ? Math.sin(sw * 0.5 + s) * 0.3 : 0.05); a.rotation.z = s * (chase ? 0.25 : 0.06); f.rotation.x = chase ? -0.5 : 0.1; });
    eyeLight.intensity = chase ? 1.4 : 0.8 + Math.sin(time * 9) * 0.15;
    // Lampor: de två närmaste som lyser ger riktigt ljus
    const lit = lamps.filter(l => Math.hypot(l.x - player.x, l.z - player.z) < 16).sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
    lamps.forEach(l => { if (l.mode === 1) l.mat.color.set(lampLevel(l) > 0.5 ? '#c8e8e0' : '#26302e'); });
    for (let i = 0; i < 2; i++) { const l = lit.filter(q => q.mode !== 2)[i]; if (l) { lampLights[i].position.set(l.x, WALL_H - 0.3, l.z); lampLights[i].intensity = 1.1 * lampLevel(l); } else lampLights[i].intensity = 0; }
    // Dammkorn runt kameran
    const dp = dustGeo.attributes.position.array;
    for (let i = 0; i < dustN; i++) { dp[i * 3 + 1] -= 0.012; dp[i * 3] += Math.sin(time * 0.4 + i) * 0.003; if (dp[i * 3 + 1] < 0) dp[i * 3 + 1] = 3; }
    dustGeo.attributes.position.needsUpdate = true; dust.position.set(Math.round(player.x / 12) * 12, 0, Math.round(player.z / 12) * 12);
    mon.visible = state !== 'menu'; renderer.render(scene, camera);
  }
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  reset(); state = 'menu';
  if (location.hash === '#test') window.__t = { player, M, flash, digits: () => digits, setElapsed: t => { elapsed = t; }, notes: () => notes, lockers, begin, win };
  if (location.hash === '#playmon') { begin(); player.x = 13; player.z = 21; player.yaw = 0; flash.on = true; M.x = 13; M.z = 14.6; M.face = 0; M.state = 'chase'; M.last = [13, 21]; }
  if (location.hash === '#play') { begin(); player.yaw = 0.6; flash.on = true; }
  let last = performance.now();
  function frame(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; update(dt); render(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
