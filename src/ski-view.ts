import * as THREE from 'three';
import { tr } from './i18n';
import { COURSE_LENGTH, GATE_HALF, HALF_WIDTH, elevation, sections, type SkiEvent, type SkiGame } from './ski-engine';
import noteIcon from '../assets/ui/catch/note.png';
import starIcon from '../assets/ui/catch/star.png';

/** Banks rise outside the fences so the piste reads as a groomed valley. */
const bank = (x: number) => { const e = Math.max(0, Math.abs(x) - HALF_WIDTH); return Math.min(e, 6) * .35 + Math.max(0, e - 6) * .16; };
const ground = (x: number, z: number) => elevation(z) + bank(x);
const world = (x: number, z: number, lift = 0) => new THREE.Vector3(x, ground(x, z) + lift, -z);

function textTexture(lines: string[], w: number, h: number, bg: string, fg: string) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((line, i) => {
    c.font = `${i ? 500 : 800} ${i ? h * .2 : h * .36}px 'Noto Sans TC', 'Outfit', sans-serif`;
    c.fillText(line, w / 2, h * (lines.length === 1 ? .5 : i ? .74 : .38));
  });
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function pixelTexture(url: string) {
  const t = new THREE.TextureLoader().load(url);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** A strip of ground between z0..z1 and x0..x1 that follows the slope, lifted a little above the snow. */
function patchGeometry(x0: number, x1: number, z0: number, z1: number, lift: number, bump = 0) {
  const sx = Math.max(2, Math.ceil((x1 - x0) / 1)), sz = Math.max(2, Math.ceil((z1 - z0) / 1.5));
  const g = new THREE.PlaneGeometry(1, 1, sx, sz);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = x0 + (p.getX(i) + .5) * (x1 - x0), z = z0 + (p.getY(i) + .5) * (z1 - z0);
    const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z) > .6 ? 1 : 0;
    p.setXYZ(i, x, ground(x, z) + lift + bump * edge * (Math.sin(x * 2.1) * Math.cos(z * 1.3) * .5 + .5), -z);
  }
  g.computeVertexNormals(); return g;
}

type Burst = { sprite: THREE.Sprite; life: number; max: number; grow: number; lift: number; side: number };

export class SkiView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, 1.6, .1, 900);
  private player = new THREE.Group();
  private body: THREE.Sprite;
  private shadow: THREE.Mesh;
  private gateFlags: THREE.MeshLambertMaterial[][] = [];
  private gateStrips: THREE.MeshBasicMaterial[] = [];
  private notes: THREE.Sprite[] = [];
  private marker: THREE.Mesh;
  private spray: THREE.Points;
  private sprayData: { v: THREE.Vector3; life: number }[] = [];
  private snow: THREE.Points;
  private trail: THREE.Mesh;
  private trailPoints: THREE.Vector3[] = [];
  private mountains = new THREE.Group();
  private bursts: Burst[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shake = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private clock = 0;

  constructor(private canvas: HTMLCanvasElement, hero: string) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = this.skyTexture();
    this.scene.fog = new THREE.Fog('#dbe8f4', 45, 190);
    this.scene.add(new THREE.HemisphereLight('#f1f7ff', '#8fa3b8', 1.9));
    const sun = new THREE.DirectionalLight('#fff1d6', 1.7); sun.position.set(-40, 90, 30); this.scene.add(sun);

    this.buildTerrain(); this.buildFences(); this.buildMountains();
    // Player: pixel friend over two 3D skis.
    const skiMat = new THREE.MeshLambertMaterial({ color: '#e5533a' });
    for (const side of [-.19, .19]) {
      const ski = new THREE.Mesh(new THREE.BoxGeometry(.13, .05, 1.75), skiMat);
      ski.position.set(side, .03, -.1); this.player.add(ski);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(.13, .05, .25), skiMat);
      tip.position.set(side, .1, -1.02); tip.rotation.x = .5; this.player.add(tip);
    }
    this.body = new THREE.Sprite(new THREE.SpriteMaterial({ map: pixelTexture(hero), transparent: true, alphaTest: .5 }));
    this.body.scale.set(1.3, 1.56, 1); this.body.position.y = .82; this.player.add(this.body);
    this.scene.add(this.player);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.75, 20), new THREE.MeshBasicMaterial({ color: '#4d6a8a', transparent: true, opacity: .28, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.scene.add(this.shadow);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(.45, .8, 4), new THREE.MeshBasicMaterial({ color: '#f4d480' }));
    this.marker.rotation.x = Math.PI; this.scene.add(this.marker);

    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(240 * 3).fill(-9999), 3));
    for (let i = 0; i < 240; i++) this.sprayData.push({ v: new THREE.Vector3(), life: 0 });
    this.spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: '#ffffff', size: .22, transparent: true, opacity: .9, depthWrite: false }));
    this.spray.frustumCulled = false; this.scene.add(this.spray);
    // Flakes keep a few metres from the lens so none swells into a big square.
    const flakes = new Float32Array(700 * 3).map((_, i) => i % 3 === 2 ? -4 - Math.random() * 70 : (Math.random() - .5) * (i % 3 ? 36 : 70));
    const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(flakes, 3));
    this.snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: .16, transparent: true, opacity: .85, depthWrite: false }));
    this.snow.frustumCulled = false; this.scene.add(this.snow);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(160 * 2 * 3), 3));
    const index: number[] = [];
    for (let i = 0; i < 159; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    trailGeo.setIndex(index);
    this.trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: '#a9bfdc', transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }));
    this.trail.frustumCulled = false; this.scene.add(this.trail);
  }

  private skyTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 256;
    const c = canvas.getContext('2d')!; const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#6fa3d6'); g.addColorStop(.55, '#bcd7ee'); g.addColorStop(1, '#e8f1f8');
    c.fillStyle = g; c.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  private buildTerrain() {
    const width = 130, z0 = -70, z1 = COURSE_LENGTH + 260;
    const geo = new THREE.PlaneGeometry(width, z1 - z0, 64, Math.ceil((z1 - z0) / 3));
    const p = geo.attributes.position; const colors: number[] = [];
    const piste = new THREE.Color('#f7faff'), stripe = new THREE.Color('#e9f0fa'), off = new THREE.Color('#dbe6f2');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = z0 + (p.getY(i) + (z1 - z0) / 2);
      const wild = Math.abs(x) > HALF_WIDTH + 3 ? Math.sin(x * .31 + z * .07) * Math.cos(z * .13) * .8 : 0;
      p.setXYZ(i, x, ground(x, z) + wild, -z);
      const c = Math.abs(x) <= HALF_WIDTH ? (Math.floor(x + 50) % 2 ? piste : stripe) : off;
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  private buildFences() {
    const posts = Math.ceil((COURSE_LENGTH + 80) / 5) * 2;
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(.05, .05, 1.1, 5), new THREE.MeshLambertMaterial({ color: '#ff7a2f' }), posts);
    const m = new THREE.Matrix4(); let n = 0;
    for (let z = -20; z < COURSE_LENGTH + 60 && n < posts; z += 5) for (const s of [-1, 1]) {
      const x = s * (HALF_WIDTH + .3); m.makeTranslation(x, ground(x, z) + .55, -z); post.setMatrixAt(n++, m);
    }
    post.count = n; this.scene.add(post);
    const netMat = new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: .55, side: THREE.DoubleSide, fog: true });
    for (const s of [-1, 1]) {
      const pts: number[] = [];
      for (let z = -20; z <= COURSE_LENGTH + 60; z += 5) { const x = s * (HALF_WIDTH + .3); const y = ground(x, z); pts.push(x, y + .45, -z, x, y + 1.0, -z); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const idx: number[] = []; for (let i = 0; i < pts.length / 6 - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      g.setIndex(idx); this.scene.add(new THREE.Mesh(g, netMat));
    }
  }

  private buildMountains() {
    const rock = new THREE.MeshBasicMaterial({ color: '#90a9c4', fog: false });
    const cap = new THREE.MeshBasicMaterial({ color: '#f4f8fc', fog: false });
    for (let i = 0; i < 11; i++) {
      const h = 90 + (i * 37 % 70), r = 70 + (i * 53 % 50);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rock);
      const top = new THREE.Mesh(new THREE.ConeGeometry(r * .36, h * .36, 7), cap);
      top.position.y = h * .32;
      const g = new THREE.Group(); g.add(peak, top);
      g.position.set((i - 5) * 95 + (i % 3) * 20, h / 2 - 70, -(560 + (i % 4) * 60));
      this.mountains.add(g);
    }
    this.scene.add(this.mountains);
  }

  /** Static props from the course layout, which is the same on every run. */
  build(game: SkiGame) {
    const { gates, notes, obstacles, patches, ramps } = game.course;
    // Trees and rocks: obstacles on the piste plus a forest on both banks.
    const trees: [number, number, number][] = obstacles.filter(o => o.kind === 'tree').map(o => [o.x, o.z, 1]);
    let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let z = -40; z < COURSE_LENGTH + 220; z += 4) for (let k = 0; k < 2; k++) {
      const s = rand() < .5 ? -1 : 1; trees.push([s * (HALF_WIDTH + 2.5 + rand() * 42), z + rand() * 4, .9 + rand() * .9]);
    }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .24, 1.2, 6), new THREE.MeshLambertMaterial({ color: '#6b4f36' }), trees.length);
    const low = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 2.4, 7), new THREE.MeshLambertMaterial({ color: '#2f6b4f' }), trees.length);
    const high = new THREE.InstancedMesh(new THREE.ConeGeometry(.9, 1.9, 7), new THREE.MeshLambertMaterial({ color: '#3b7d58' }), trees.length);
    const snowCap = new THREE.InstancedMesh(new THREE.ConeGeometry(.5, .8, 7), new THREE.MeshLambertMaterial({ color: '#ffffff' }), trees.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    trees.forEach(([x, z, s], i) => {
      const y = ground(x, z); sc.set(s, s, s);
      trunk.setMatrixAt(i, m.compose(v.set(x, y + .6 * s, -z), q, sc));
      low.setMatrixAt(i, m.compose(v.set(x, y + 2 * s, -z), q, sc));
      high.setMatrixAt(i, m.compose(v.set(x, y + 3.1 * s, -z), q, sc));
      snowCap.setMatrixAt(i, m.compose(v.set(x, y + 3.75 * s, -z), q, sc));
    });
    this.scene.add(trunk, low, high, snowCap);
    const rocks = obstacles.filter(o => o.kind === 'rock');
    const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.85, 0), new THREE.MeshLambertMaterial({ color: '#6f7d8c' }), rocks.length);
    const rockCap = new THREE.InstancedMesh(new THREE.SphereGeometry(.62, 8, 5), new THREE.MeshLambertMaterial({ color: '#ffffff' }), rocks.length);
    rocks.forEach((o, i) => {
      const y = ground(o.x, o.z);
      rockMesh.setMatrixAt(i, m.compose(v.set(o.x, y + .35, -o.z), q.setFromEuler(new THREE.Euler(o.z, o.x, 0)), sc.set(1, .75, 1)));
      rockCap.setMatrixAt(i, m.compose(v.set(o.x, y + .78, -o.z), q.identity(), sc.set(1, .35, 1)));
    });
    this.scene.add(rockMesh, rockCap);

    for (const p of patches) {
      const mat = p.kind === 'ice'
        ? new THREE.MeshStandardMaterial({ color: '#8fd0f0', roughness: .12, metalness: .2, transparent: true, opacity: .62 })
        : new THREE.MeshLambertMaterial({ color: '#ffffff' });
      this.scene.add(new THREE.Mesh(patchGeometry(p.x0, p.x1, p.z0, p.z1, p.kind === 'ice' ? .04 : .02, p.kind === 'powder' ? .45 : 0), mat));
    }
    const stripes = document.createElement('canvas'); stripes.width = 64; stripes.height = 64;
    const sctx = stripes.getContext('2d')!; sctx.fillStyle = '#3f8fc8'; sctx.fillRect(0, 0, 64, 64); sctx.fillStyle = '#eef6ff';
    for (let i = 0; i < 4; i++) sctx.fillRect(0, i * 16, 64, 7);
    const rampTex = new THREE.CanvasTexture(stripes); rampTex.colorSpace = THREE.SRGBColorSpace;
    for (const r of ramps) {
      const g = new THREE.BufferGeometry();
      const xa = r.x - r.half, xb = r.x + r.half, za = r.z - r.length, zb = r.z;
      const ya = ground(r.x, za), yb = ground(r.x, zb) + 1.3, yf = ground(r.x, zb);
      g.setAttribute('position', new THREE.Float32BufferAttribute([xa, ya, -za, xb, ya, -za, xa, yb, -zb, xb, yb, -zb, xa, yf, -zb, xb, yf, -zb], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0], 2));
      g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 0, 2, 4, 1, 5, 3]); g.computeVertexNormals();
      this.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: rampTex, side: THREE.DoubleSide })));
    }

    const pole = new THREE.CylinderGeometry(.05, .05, 1.9, 6);
    const flag = new THREE.PlaneGeometry(.75, .55);
    for (const gate of gates) {
      const color = gate.color === 'red' ? '#e2453c' : '#2f7fd8';
      const mats: THREE.MeshLambertMaterial[] = [];
      for (const s of [-1, 1]) {
        const x = gate.x + s * (GATE_HALF + .12);
        const p = new THREE.Mesh(pole, new THREE.MeshLambertMaterial({ color })); p.position.copy(world(x, gate.z, .95)); this.scene.add(p);
        const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, emissive: '#000000' }); mats.push(mat);
        const f = new THREE.Mesh(flag, mat); f.position.copy(world(x - s * .42, gate.z, 1.55)); this.scene.add(f);
      }
      this.gateFlags.push(mats);
      const stripMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .22, depthWrite: false });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(GATE_HALF * 2, .5), stripMat);
      strip.rotation.x = -Math.PI / 2; strip.position.copy(world(gate.x, gate.z, .05)); this.scene.add(strip);
      this.gateStrips.push(stripMat);
    }
    const noteMat = new THREE.SpriteMaterial({ map: pixelTexture(noteIcon), transparent: true, alphaTest: .5 });
    for (const n of notes) {
      const s = new THREE.Sprite(noteMat); s.scale.set(.95, .95, 1); s.position.copy(world(n.x, n.z, n.h)); this.scene.add(s); this.notes.push(s);
    }
    const arch = (z: number, lines: string[], bg: string) => {
      const postMat = new THREE.MeshLambertMaterial({ color: '#7a5a3a' });
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.5, 5, .5), postMat); p.position.copy(world(s * (HALF_WIDTH - .4), z, 2.5)); this.scene.add(p); }
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, 1.8), new THREE.MeshBasicMaterial({ map: textTexture(lines, 1024, 80, bg, '#fff8e0'), side: THREE.DoubleSide }));
      banner.position.copy(world(0, z, 4.6)); this.scene.add(banner);
    };
    arch(0, [tr('出發 · 雪林滑降', 'START · Snowy Forest Run')], '#2c5a46');
    arch(COURSE_LENGTH, [tr('終點 ✦ FINISH', 'FINISH ✦')], '#c2493b');
    sections.forEach((s, i) => {
      if (!i) return;
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture([`${i + 1} / 3`, tr(s.name, s.nameEn)], 256, 128, '#24453b', '#f4d480') }));
      sign.scale.set(3.4, 1.7, 1); sign.position.copy(world(-(HALF_WIDTH + 2.2), s.from, 2.4)); this.scene.add(sign);
    });
    this.reset(game);
  }

  setHero(url: string) {
    const mat = this.body.material; mat.map?.dispose(); mat.map = pixelTexture(url); mat.needsUpdate = true;
  }

  reset(game: SkiGame) {
    this.trailPoints = []; this.bursts.forEach(b => this.scene.remove(b.sprite)); this.bursts = [];
    this.sprayData.forEach(p => p.life = 0);
    this.camPos.copy(world(game.x, game.z - 7.5, 4.4)); this.camLook.copy(world(game.x, game.z + 16, 1));
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  /** Pop-ups ride along with the skier, so the chase camera never flies through one. */
  private burst(url: string, lift: number, side: number, size: number, grow: number) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pixelTexture(url), transparent: true, depthWrite: false, alphaTest: .05 }));
    sprite.scale.set(size, size, 1); sprite.visible = false; this.scene.add(sprite);
    this.bursts.push({ sprite, life: .6, max: .6, grow, lift, side });
  }

  effect(e: SkiEvent, game: SkiGame) {
    const reduced = this.reduced.matches;
    if (e.kind === 'note') this.burst(noteIcon, 1.9, Math.sign(game.course.notes[e.value!].x - game.x) * .6, .5, .8);
    if (e.kind === 'gate' || e.kind === 'trick') this.burst(starIcon, 2.1, 0, .45, e.kind === 'trick' ? 1.4 : .7);
    if ((e.kind === 'crash' || e.kind === 'wipeout' || e.kind === 'fence') && !reduced) this.shake = .35;
    if (e.kind === 'crash' || e.kind === 'wipeout' || e.kind === 'land' || e.kind === 'wobble') this.emit(game, e.kind === 'land' ? 26 : 40, 4);
  }

  private emit(game: SkiGame, count: number, power: number) {
    const base = world(game.x, game.z, .1);
    for (let i = 0, made = 0; i < this.sprayData.length && made < count; i++) {
      const p = this.sprayData[i]; if (p.life > 0) continue;
      p.life = .5 + Math.random() * .4; made++;
      p.v.set((Math.random() - .5) * power + Math.sin(game.heading) * game.speed * .3, Math.random() * power * .7, (Math.random() - .5) * power - Math.cos(game.heading) * game.speed * .3);
      (this.spray.geometry.attributes.position as THREE.BufferAttribute).setXYZ(i, base.x + (Math.random() - .5) * .6, base.y, base.z + (Math.random() - .5) * .6);
    }
  }

  render(game: SkiGame, dt: number) {
    this.resize(); this.clock += dt;
    const reduced = this.reduced.matches;
    const base = world(game.x, game.z);
    this.player.position.set(base.x, base.y + game.height, base.z);
    this.player.rotation.set(0, -game.heading + (game.spin > 0 ? game.spin * Math.PI * 2 : 0), game.airborne ? 0 : -game.steer * .32);
    const tuck = game.input.tuck && !game.airborne && game.stun <= 0;
    this.body.scale.set(1.3, tuck ? 1.25 : 1.56, 1); this.body.position.y = tuck ? .66 : .82;
    this.body.material.rotation = game.stun > 0 ? 1.3 : game.spin > 0 ? -game.spin * Math.PI * 2 : -game.steer * .12;
    this.body.material.opacity = game.stun > 0 && Math.floor(this.clock * 10) % 2 ? .45 : 1;
    this.shadow.position.set(base.x, base.y + .04, base.z);
    const s = Math.max(.35, 1 - game.height * .12); this.shadow.scale.set(s * .8, s * 1.3, 1);
    this.shadow.rotation.z = -game.heading;

    game.course.notes.forEach((n, i) => {
      const sp = this.notes[i]; sp.visible = !n.taken && Math.abs(n.z - game.z) < 200;
      if (sp.visible && !reduced) sp.position.y = ground(n.x, n.z) + n.h + Math.sin(this.clock * 3 + i) * .15;
    });
    game.course.gates.forEach((g, i) => {
      const done = g.result === 'passed' ? '#f4d480' : g.result === 'missed' ? '#8b949e' : null;
      for (const mat of this.gateFlags[i]) {
        if (done) mat.color.set(done);
        else mat.color.set(g.color === 'red' ? '#e2453c' : '#2f7fd8');
        mat.emissive.set(g.result === 'passed' ? '#5a4200' : '#000000');
      }
      this.gateStrips[i].opacity = g.result ? .08 : .24;
    });
    const next = game.course.gates.find(g => !g.result && g.z > game.z);
    this.marker.visible = !!next && game.phase !== 'complete';
    if (next) { this.marker.position.copy(world(next.x, next.z, 2.7 + (reduced ? 0 : Math.sin(this.clock * 4) * .2))); this.marker.rotation.y += dt * 2; }

    // Ski tracks.
    const last = this.trailPoints[this.trailPoints.length - 1];
    if (!game.airborne && game.time > 0 && (!last || last.distanceTo(base) > .6)) { this.trailPoints.push(base.clone()); if (this.trailPoints.length > 160) this.trailPoints.shift(); }
    if (game.airborne || game.time <= 0) { if (this.trailPoints.length && game.time <= 0) this.trailPoints = []; }
    const tp = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 160; i++) {
      const p = this.trailPoints[Math.min(i, this.trailPoints.length - 1)];
      if (!p) { tp.setXYZ(i * 2, 0, -9999, 0); tp.setXYZ(i * 2 + 1, 0, -9999, 0); continue; }
      tp.setXYZ(i * 2, p.x - .16, p.y + .03, p.z); tp.setXYZ(i * 2 + 1, p.x + .16, p.y + .03, p.z);
    }
    tp.needsUpdate = true;

    // Spray from the edges while carving or braking.
    if (!game.airborne && game.phase === 'playing' && game.speed > 4 && !reduced) {
      const carve = Math.abs(game.steer) + (game.input.brake ? 1 : 0);
      if (carve > .35 && Math.random() < carve) this.emit(game, Math.ceil(carve * 3), 2.2);
    }
    const sp = this.spray.geometry.attributes.position as THREE.BufferAttribute;
    this.sprayData.forEach((p, i) => {
      if (p.life <= 0) return;
      p.life -= dt; p.v.y -= 9 * dt;
      if (p.life <= 0) { sp.setXYZ(i, 0, -9999, 0); return; }
      sp.setXYZ(i, sp.getX(i) + p.v.x * dt, sp.getY(i) + p.v.y * dt, sp.getZ(i) + p.v.z * dt);
    });
    sp.needsUpdate = true;

    for (const b of [...this.bursts]) {
      b.life -= dt; const k = 1 - b.life / b.max;
      b.sprite.material.opacity = Math.max(0, 1 - k); const size = b.sprite.scale.x + b.grow * dt; b.sprite.scale.set(size, size, 1);
      b.sprite.visible = true; b.lift += dt * 1.5;
      b.sprite.position.set(this.player.position.x + b.side, this.player.position.y + b.lift, this.player.position.z);
      if (b.life <= 0) { this.scene.remove(b.sprite); b.sprite.material.map?.dispose(); b.sprite.material.dispose(); this.bursts.splice(this.bursts.indexOf(b), 1); }
    }

    // Chase camera: low behind the skier, swinging a little with the turn.
    // Looking at the snow well down the slope keeps the next gates and trees in view.
    const swing = game.heading * .35, dist = 6.6;
    const want = new THREE.Vector3(base.x - Math.sin(swing) * dist, base.y + 4.2 + game.height * .45, base.z + Math.cos(swing) * dist);
    want.y = Math.max(want.y, ground(want.x, -want.z) + 1.5);
    const ahead = world(game.x + Math.sin(swing) * 18, game.z + Math.cos(swing) * 18);
    const look = new THREE.Vector3(ahead.x, ahead.y + .2 + game.height * .6, ahead.z);
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(want, k); this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) { this.shake -= dt; this.camera.position.x += (Math.random() - .5) * this.shake; this.camera.position.y += (Math.random() - .5) * this.shake; }
    this.camera.lookAt(this.camLook);
    const fov = reduced ? 56 : 50 + Math.min(14, game.speed * .45);
    if (Math.abs(this.camera.fov - fov) > .05) { this.camera.fov += (fov - this.camera.fov) * k; this.camera.updateProjectionMatrix(); }

    this.mountains.position.set(this.camPos.x * .9, this.camPos.y, this.camPos.z);
    const fl = this.snow.geometry.attributes.position as THREE.BufferAttribute;
    if (!reduced) for (let i = 0; i < fl.count; i++) {
      let y = fl.getY(i) - dt * 2.2; if (y < -18) y += 36;
      fl.setY(i, y); fl.setX(i, fl.getX(i) + Math.sin(this.clock + i) * dt * .3);
    }
    fl.needsUpdate = true; this.snow.position.copy(this.camPos);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() { this.renderer.dispose(); }
}
