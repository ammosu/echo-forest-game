import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BrightnessContrastShader } from "three/examples/jsm/shaders/BrightnessContrastShader.js";
import { ColorCorrectionShader } from "three/examples/jsm/shaders/ColorCorrectionShader.js";
import { HorizontalTiltShiftShader } from "three/examples/jsm/shaders/HorizontalTiltShiftShader.js";
import { HueSaturationShader } from "three/examples/jsm/shaders/HueSaturationShader.js";
import { VerticalTiltShiftShader } from "three/examples/jsm/shaders/VerticalTiltShiftShader.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import {
  entries,
  vehicles,
  track,
  TRACK_LENGTH,
  mod,
  clamp,
  itemBoxes,
  boostPads,
  obstacles,
} from "./racing-data";
import type { RaceSnapshot } from "./racing-engine";

import {
  ROAD_HALF_WIDTH as HALF_WIDTH,
  WORLD_SCALE as SCALE,
  WALL_LANE,
} from "./racing-collision";

const portraits = import.meta.glob(
  [
    "../assets/sprites/1x/{anbo,angoo,anmi,anje}.png",
    "../assets/sprites/extras/{anbo,angoo,anmi,anje}_back.png",
  ],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;
const UP = new THREE.Vector3(0, 1, 0);
const roadColors = ["#b6a17a", "#8f9e82", "#c5aa79"];
const leafColors = ["#608452", "#327963", "#b2b55a"];

/** One shared distance-to-world mapping for track, cars, scenery and gameplay props. */
export function raceFrame(distance: number, lane = 0) {
  const t = (mod(distance, TRACK_LENGTH) / TRACK_LENGTH) * track.length;
  const i = Math.floor(t),
    f = t - i;
  const a = track[i],
    b = track[(i + 1) % track.length];
  const prev = track[mod(i - 1, track.length)],
    next = track[(i + 2) % track.length];
  const tangent = new THREE.Vector3(b.mapX - prev.mapX, 0, b.mapY - prev.mapY)
    .lerp(new THREE.Vector3(next.mapX - a.mapX, 0, next.mapY - a.mapY), f)
    .normalize();
  const right = new THREE.Vector3().crossVectors(tangent, UP).normalize();
  const position = new THREE.Vector3(
    (a.mapX + (b.mapX - a.mapX) * f) * SCALE,
    0,
    (a.mapY + (b.mapY - a.mapY) * f) * SCALE,
  ).addScaledVector(right, lane * HALF_WIDTH);
  return {
    position,
    tangent,
    right,
    heading: Math.atan2(-tangent.x, -tangent.z),
  };
}

type Kart = {
  group: THREE.Group;
  body: THREE.Group;
  driver: THREE.Sprite;
  front: THREE.Texture;
  back: THREE.Texture;
  flame: THREE.Group;
  sparks: THREE.Group;
  impactBurst: THREE.Group;
  stunStars: THREE.Group;
  /** Per-kart material copies so an opponent can fade without affecting others. */
  fade: THREE.Material[];
};

export type RaceLook = "standard" | "hd2d";

/** Three.js presentation only; race rules stay in RacingEngine. */
export class RacingView {
  readonly renderer: THREE.WebGLRenderer;
  readonly ready: Promise<void>;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(57, 1.6, 0.1, 240);
  private sun = new THREE.DirectionalLight("#ffe2ab", 2.8);
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private textures: THREE.Texture[] = [];
  private extraMaterials: THREE.Material[] = [];
  private karts: Kart[] = [];
  private boxes: THREE.Group[] = [];
  private pads: THREE.Group[] = [];
  private scenery = new THREE.Group();
  private hud = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private disposed = false;
  private cameraReady = false;
  private lastDistance = 0;
  private look = new THREE.Vector3();
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private width = 0;
  private height = 0;
  /** HUD drawing space is 640 units wide; its height follows the stage aspect. */
  private hudH = 400;
  private lastState?: RaceSnapshot;
  private renderKey = "";
  private pickupSerial = 0;
  private pickupAt = -10;
  private pickupBurst = new THREE.Group();
  private sky = new THREE.HemisphereLight("#fff5d6", "#48674e", 2.2);
  /** HD-2D look: golden haze, bloom, grading, tilt-shift focus band, motes. */
  style: RaceLook = "standard";
  private composer?: EffectComposer;
  private tiltShift: ShaderPass[] = [];
  private motes?: THREE.Points;
  private moteSeeds: number[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    style: RaceLook = "standard",
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new THREE.Color("#c9ddcf");
    this.scene.fog = new THREE.Fog("#c9ddcf", 60, 150);
    this.scene.add(this.sky);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -27,
      right: 27,
      top: 35,
      bottom: -25,
      near: 1,
      far: 110,
    });
    this.sun.shadow.normalBias = 0.08;
    this.sun.shadow.bias = -0.0002;
    this.scene.add(this.sun, this.sun.target, this.scenery);
    this.buildTrack();
    this.buildScenery();
    this.buildGuardrails();
    this.batchScenery();
    this.buildProps();
    this.scene.add(this.pickupBurst);
    for (let i = 0; i < 16; i++)
      this.mesh(
        this.pickupBurst,
        this.geometry("sparkle", () => new THREE.OctahedronGeometry(0.1)),
        "#fff3a3",
        0,
        0,
        0,
        1,
        1,
        1,
        true,
      );
    this.hud.width = 640;
    this.hud.height = 400;
    this.hud.className = "race-canvas-hud";
    this.hud.setAttribute("aria-hidden", "true");
    canvas.after(this.hud);
    this.ctx = this.hud.getContext("2d")!;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.ready = this.loadKarts();
    this.setLook(style);
    if (import.meta.env.DEV)
      (window as any).__raceView = { snapshot: () => this.diagnostics() };
  }
  private geometry(key: string, make: () => THREE.BufferGeometry) {
    if (!this.geometries.has(key)) this.geometries.set(key, make());
    return this.geometries.get(key)!;
  }
  private material(color: string, emissive = false) {
    const key = color + emissive;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.82,
          ...(emissive ? { emissive: color, emissiveIntensity: 0.7 } : {}),
        }),
      );
    return this.materials.get(key)!;
  }
  private mesh(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    emissive = false,
  ) {
    const m = new THREE.Mesh(geo, this.material(color, emissive));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  private box(
    parent: THREE.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    glow = false,
  ) {
    return this.mesh(
      parent,
      this.geometry("box", () => new THREE.BoxGeometry()),
      color,
      x,
      y,
      z,
      sx,
      sy,
      sz,
      glow,
    );
  }
  private buildTrack() {
    this.box(this.scenery, "#688957", 25, -0.3, 0, 400, 0.5, 400);
    // Colored ribbons share vertices at every cross-section, including the lap seam.
    const ribbon = (
      left: number,
      right: number,
      height: number,
      color: (i: number) => string,
    ) => {
      const positions: number[] = [],
        colors: number[] = [];
      const n = 960;
      for (let i = 0; i < n; i++) {
        const a = raceFrame((i / n) * TRACK_LENGTH, left).position;
        const b = raceFrame((i / n) * TRACK_LENGTH, right).position;
        const c = raceFrame(((i + 1) / n) * TRACK_LENGTH, left).position;
        const d = raceFrame(((i + 1) / n) * TRACK_LENGTH, right).position;
        const col = new THREE.Color(color(i));
        for (const p of [a, c, b, b, c, d]) {
          positions.push(p.x, height, p.z);
          colors.push(col.r, col.g, col.b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      this.geometries.set(`ribbon-${left}-${right}`, geo);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: THREE.DoubleSide,
      });
      this.extraMaterials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    ribbon(-1.15, 1.15, 0, (i) =>
      Math.floor(i / 12) % 2 ? "#eee2b3" : leafColors[Math.floor(i / 320)],
    );
    ribbon(-1, 1, 0.02, (i) => roadColors[Math.floor(i / 320)]);
    for (const lane of [-1 / 3, 1 / 3])
      ribbon(lane - 0.008, lane + 0.008, 0.025, (i) =>
        i % 24 < 12 ? "#f1e2b8" : roadColors[Math.floor(i / 320)],
      );
    const start = new THREE.Group();
    const f = raceFrame(0);
    start.position.copy(f.position);
    start.rotation.y = f.heading;
    this.scenery.add(start);
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 3; z++)
        this.box(
          start,
          (x + z) % 2 ? "#344e40" : "#fff0c5",
          ((x + 0.5) / 16) * 11 - 5.5,
          0.035,
          -z * 0.65,
          11 / 16,
          0.03,
          0.65,
        );
    for (const side of [-1, 1]) {
      this.box(start, "#70543d", side * 6.25, 3.6, 0, 0.5, 7.2, 0.5);
      this.box(start, "#dec383", side * 6.25, 0.4, 0, 1, 0.8, 1);
    }
    this.box(start, "#345b43", 0, 6.6, 0, 13, 1.15, 0.6);
    this.sign(start, "晨光盃  /  START", 0, 6.6, 0.34, 8, 0.85);
    for (let j = 0; j < 16; j++)
      this.box(
        start,
        j % 2 ? "#f4e6b4" : "#344e40",
        ((j + 0.5) / 16) * 13 - 6.5,
        7.3,
        0,
        13 / 16,
        0.25,
        0.6,
      );
  }
  private sign(
    parent: THREE.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
  ) {
    const c = document.createElement("canvas");
    c.width = 768;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f7e6b2";
    ctx.font = "bold 52px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 384, 48);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(t);
    const m = new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.extraMaterials.push(m);
    const mesh = new THREE.Mesh(
      this.geometry("plane", () => new THREE.PlaneGeometry()),
      m,
    );
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, 1);
    parent.add(mesh);
  }
  private buildScenery() {
    const trunk = this.geometry(
      "trunk",
      () => new THREE.CylinderGeometry(0.6, 0.85, 1, 7),
    );
    const crown = this.geometry(
      "crown",
      () => new THREE.IcosahedronGeometry(1, 0),
    );
    const pine = this.geometry("pine", () => new THREE.ConeGeometry(1, 1, 7));
    for (let i = 0; i < 240; i++)
      for (const side of [-1, 1]) {
        const zone = Math.floor(i / 80),
          seed = Math.sin(i * 71.3 + side * 9) * 0.5 + 0.5;
        const f = raceFrame(i * 200, side * (2.2 + seed * 1.2));
        const tree = new THREE.Group();
        tree.position.copy(f.position);
        this.scenery.add(tree);
        const h = 5 + seed * 5;
        this.mesh(tree, trunk, "#765b40", 0, h * 0.35, 0, 0.55, h * 0.7, 0.55);
        if (zone === 1) {
          this.mesh(tree, pine, "#377966", 0, h * 0.65, 0, 2.4, h * 0.8, 2.4);
          this.mesh(tree, pine, "#508f70", 0, h * 0.95, 0, 1.7, h * 0.55, 1.7);
        } else {
          this.mesh(
            tree,
            crown,
            leafColors[zone],
            0,
            h,
            0,
            2.8 + seed,
            3 + seed,
            2.7 + seed,
          );
          this.mesh(
            tree,
            crown,
            zone === 2 ? "#d0bc65" : "#80a25e",
            -1.2,
            h * 0.82,
            0.7,
            2.1,
            2.5,
            2.1,
          );
        }
        const verge = raceFrame(
          i * 200 + 90,
          side * (1.25 + seed * 0.15),
        ).position;
        for (let j = 0; j < 3; j++) {
          this.mesh(
            this.scenery,
            crown,
            zone === 2 ? "#f3d386" : "#a4bd79",
            verge.x + j * 0.25,
            0.25 + j * 0.07,
            verge.z,
            0.14,
            0.24,
            0.14,
          );
        }
        if (i % 8 === 0) {
          const rock = raceFrame(i * 200 + 100, side * 2.3).position;
          this.mesh(
            this.scenery,
            crown,
            "#839482",
            rock.x,
            0.4,
            rock.z,
            1.1,
            0.7,
            0.8,
          );
        }
        if (i % 12 === 0) {
          const f = raceFrame(i * 200, side * 2.1);
          const post = new THREE.Group();
          post.position.copy(f.position);
          post.rotation.y = f.heading;
          this.scenery.add(post);
          this.box(post, "#e8dbad", 0, 0.75, 0, 0.13, 1.5, 0.13);
          this.box(post, leafColors[zone], 0, 1.4, 0, 0.28, 0.3, 0.28);
        }
      }
    for (const [i, label] of ["晨光林道", "蕨葉彎道", "金色花谷"].entries()) {
      const f = raceFrame(i * 16000 + 2400, -2.2),
        g = new THREE.Group();
      g.position.copy(f.position);
      g.rotation.y = f.heading + 0.25;
      this.scene.add(g);
      this.box(g, "#75593d", 0, 1.6, 0, 0.18, 3.2, 0.18);
      this.box(g, "#365e47", 0, 2.8, 0, 3.3, 1, 0.18);
      this.sign(g, label, 0, 2.8, 0.1, 3, 0.65);
    }
  }
  private buildGuardrails() {
    for (let i = 0; i < track.length; i++)
      for (const side of [-1, 1]) {
        const a = raceFrame(
          i * 200,
          side * (WALL_LANE + 0.09 / HALF_WIDTH),
        ).position;
        const b = raceFrame(
          (i + 1) * 200,
          side * (WALL_LANE + 0.09 / HALF_WIDTH),
        ).position;
        const middle = a.clone().add(b).multiplyScalar(0.5);
        for (const y of [0.45, 0.95]) {
          const rail = this.box(
            this.scenery,
            "#99734b",
            middle.x,
            y,
            middle.z,
            0.18,
            0.22,
            a.distanceTo(b) + 0.03,
          );
          rail.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        }
        if (i % 2 === 0)
          this.box(this.scenery, "#644e39", a.x, 0.58, a.z, 0.24, 1.16, 0.24);
      }
  }
  private batchScenery() {
    this.scenery.updateMatrixWorld(true);
    const batches = new Map<string, THREE.Mesh[]>();
    this.scenery.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const key = o.geometry.uuid + (o.material as THREE.Material).uuid;
        const list = batches.get(key) ?? [];
        list.push(o);
        batches.set(key, list);
      }
    });
    for (const meshes of batches.values()) {
      const batch = new THREE.InstancedMesh(
        meshes[0].geometry,
        meshes[0].material,
        meshes.length,
      );
      meshes.forEach((m, i) => batch.setMatrixAt(i, m.matrixWorld));
      batch.castShadow = true;
      batch.receiveShadow = true;
      batch.computeBoundingSphere();
      this.scene.add(batch);
    }
    this.scene.remove(this.scenery);
    this.scenery.clear();
  }
  private batchParts(group: THREE.Group, excluded: THREE.Object3D[] = []) {
    const batches = new Map<string, THREE.Mesh[]>();
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh) || excluded.includes(child)) continue;
      const key = child.geometry.uuid + (child.material as THREE.Material).uuid;
      const list = batches.get(key) ?? [];
      list.push(child);
      batches.set(key, list);
    }
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const batch = new THREE.InstancedMesh(
        meshes[0].geometry,
        meshes[0].material,
        meshes.length,
      );
      meshes.forEach((m, i) => {
        m.updateMatrix();
        batch.setMatrixAt(i, m.matrix);
        group.remove(m);
      });
      batch.castShadow = meshes[0].castShadow;
      batch.receiveShadow = meshes[0].receiveShadow;
      batch.computeBoundingSphere();
      group.add(batch);
    }
  }
  private place(group: THREE.Group, distance: number, lane: number) {
    const f = raceFrame(distance, lane);
    group.position.copy(f.position);
    group.rotation.y = f.heading;
    return f;
  }
  private buildProps() {
    for (const p of obstacles) {
      const g = new THREE.Group();
      this.scene.add(g);
      this.place(g, p.z, p.x);
      this.mesh(
        g,
        this.geometry(
          "stump",
          () => new THREE.CylinderGeometry(0.83, 1, 1.05, 9),
        ),
        "#775337",
        0,
        0.55,
        0,
      );
      this.mesh(
        g,
        this.geometry(
          "stump-top",
          () => new THREE.CylinderGeometry(0.77, 0.77, 0.04, 9),
        ),
        "#d8b67c",
        0,
        1.095,
        0,
      );
      this.mesh(
        g,
        this.geometry("rings", () =>
          new THREE.TorusGeometry(0.43, 0.035, 4, 18).rotateX(Math.PI / 2),
        ),
        "#986e43",
        0,
        1.12,
        0,
      );
    }
    for (const p of itemBoxes) {
      const g = new THREE.Group();
      this.scene.add(g);
      this.place(g, p.z, p.x);
      const core = new THREE.Group();
      g.add(core);
      core.position.y = 1.5;
      this.mesh(
        core,
        this.geometry("energy", () => new THREE.OctahedronGeometry(0.62)),
        "#fff1a1",
        0,
        0,
        0,
        1,
        1.3,
        1,
        true,
      );
      for (const x of [-0.64, 0.64])
        for (const z of [-0.64, 0.64])
          this.box(core, "#ffe39a", x, 0, z, 0.09, 1.35, 0.09, true);
      for (const y of [-0.64, 0.64]) {
        for (const z of [-0.64, 0.64])
          this.box(core, "#ffe39a", 0, y, z, 1.35, 0.09, 0.09, true);
        for (const x of [-0.64, 0.64])
          this.box(core, "#ffe39a", x, y, 0, 0.09, 0.09, 1.35, true);
      }
      const halo = new THREE.Mesh(
        this.geometry("halo", () =>
          new THREE.RingGeometry(0.88, 1.02, 48).rotateX(-Math.PI / 2),
        ),
        this.material("#fff0a0", true),
      );
      halo.position.y = 0.09;
      g.add(halo);
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = glowCanvas.height = 64;
      const ctx = glowCanvas.getContext("2d")!,
        grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
      grad.addColorStop(0, "#fffbc5bb");
      grad.addColorStop(0.3, "#ffe69255");
      grad.addColorStop(1, "#ffe69200");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(glowCanvas);
      this.textures.push(texture);
      const material = new THREE.SpriteMaterial({
        map: texture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.extraMaterials.push(material);
      const glow = new THREE.Sprite(material);
      glow.position.y = 1.5;
      glow.scale.set(4.2, 4.2, 1);
      g.add(glow);
      const orbit = new THREE.Group();
      g.add(orbit);
      for (let j = 0; j < 6; j++)
        this.mesh(
          orbit,
          this.geometry("sparkle", () => new THREE.OctahedronGeometry(0.1)),
          "#fff7cd",
          Math.cos((j / 6) * Math.PI * 2) * 1.15,
          1.3 + Math.sin(j * 2) * 0.7,
          Math.sin((j / 6) * Math.PI * 2) * 1.15,
          1,
          1.5,
          1,
          true,
        );
      this.batchParts(core);
      this.batchParts(orbit);
      this.boxes.push(g);
    }
    for (const p of boostPads) {
      const g = new THREE.Group();
      this.scene.add(g);
      this.place(g, p.z, p.x);
      this.box(g, "#3caa9a", 0, 0.06, 0, 3.5, 0.05, 3.5, true);
      for (let j = -1; j <= 1; j++)
        for (const side of [-1, 1]) {
          const m = this.box(
            g,
            "#fff0a0",
            side * 0.55,
            0.1,
            j * 0.85,
            1.35,
            0.06,
            0.18,
            true,
          );
          m.rotation.y = side * -0.45;
        }
      this.batchParts(g);
      this.pads.push(g);
    }
  }
  private async loadKarts() {
    const loader = new THREE.TextureLoader();
    const load = async (url: string) => {
      const t = await loader.loadAsync(url);
      if (this.disposed) {
        t.dispose();
        return t;
      }
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      this.textures.push(t);
      return t;
    };
    const images = await Promise.all(
      entries.map(async (e) => ({
        front: await load(
          portraits[`../assets/sprites/1x/${e.characterId}.png`],
        ),
        back: await load(
          portraits[`../assets/sprites/extras/${e.characterId}_back.png`],
        ),
      })),
    );
    if (this.disposed) return;
    this.karts = entries.map((entry, i) => {
      const group = new THREE.Group(),
        body = new THREE.Group();
      group.add(body);
      this.scene.add(group);
      const color = vehicles[entry.vehicleId].color;
      this.box(body, "#3d4a3b", 0, 0.36, 0, 1.6, 0.3, 2.5);
      this.box(body, color, 0, 0.65, -0.35, 1.55, 0.48, 1.8);
      this.box(body, "#eed7a1", 0, 0.91, -0.8, 0.2, 0.035, 0.8);
      this.box(body, "#e3cc8e", 0, 0.4, -1.4, 1.85, 0.22, 0.22);
      this.box(body, "#34473c", 0, 0.94, 0.45, 1.0, 0.6, 0.25);
      this.box(body, color, 0, 1.15, 1.05, 1.95, 0.12, 0.4);
      for (const x of [-0.65, 0.65])
        this.box(body, "#eaa267", x, 0.7, 1.21, 0.23, 0.18, 0.07, true);
      for (const x of [-0.9, 0.9])
        for (const z of [-0.82, 0.82]) {
          this.mesh(
            body,
            this.geometry("wheel", () =>
              new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12).rotateZ(
                Math.PI / 2,
              ),
            ),
            "#293b35",
            x,
            0.4,
            z,
          );
          this.mesh(
            body,
            this.geometry("hub", () =>
              new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8).rotateZ(
                Math.PI / 2,
              ),
            ),
            "#cab986",
            x,
            0.4,
            z,
          );
        }
      const mat = new THREE.SpriteMaterial({
        map: images[i].back,
        depthWrite: false,
      });
      this.extraMaterials.push(mat);
      const driver = new THREE.Sprite(mat);
      driver.position.set(0, 1.65, 0.05);
      driver.scale.set(1.9, 2.28, 1);
      body.add(driver);
      const flame = new THREE.Group();
      body.add(flame);
      for (const x of [-0.55, 0.55]) {
        const m = this.mesh(
          flame,
          this.geometry("flame", () =>
            new THREE.ConeGeometry(0.22, 1.4, 6).rotateX(Math.PI / 2),
          ),
          "#ffdc77",
          x,
          0.4,
          1.9,
          1,
          1,
          1,
          true,
        );
        m.castShadow = false;
      }
      const sparks = new THREE.Group();
      body.add(sparks);
      for (let k = 0; k < 8; k++)
        this.box(
          sparks,
          "#8feee7",
          k % 2 ? -1.05 : 1.05,
          0.16 + (k % 3) * 0.12,
          0.9 + Math.floor(k / 2) * 0.4,
          0.09,
          0.09,
          0.3,
          true,
        );
      const impactBurst = new THREE.Group();
      group.add(impactBurst);
      for (let j = 0; j < 8; j++)
        this.box(impactBurst, "#ffe29a", 0, 0, 0, 0.08, 0.08, 0.3, true);
      const starCanvas = document.createElement("canvas");
      starCanvas.width = starCanvas.height = 64;
      const ctx = starCanvas.getContext("2d")!;
      ctx.fillStyle = "#ffe68b";
      ctx.strokeStyle = "#a56c2a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const angle = (j * Math.PI) / 5 - Math.PI / 2,
          radius = j % 2 ? 12 : 28;
        const x = 32 + Math.cos(angle) * radius,
          y = 32 + Math.sin(angle) * radius;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const starTexture = new THREE.CanvasTexture(starCanvas);
      starTexture.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(starTexture);
      const starMaterial = new THREE.SpriteMaterial({
        map: starTexture,
        depthWrite: false,
        toneMapped: false,
      });
      this.extraMaterials.push(starMaterial);
      const stunStars = new THREE.Group();
      group.add(stunStars);
      for (let j = 0; j < 3; j++) {
        const star = new THREE.Sprite(starMaterial);
        star.scale.setScalar(0.42);
        stunStars.add(star);
      }
      this.batchParts(body);
      this.batchParts(sparks);
      this.batchParts(flame);
      const fade: THREE.Material[] = [];
      if (i > 0) {
        fade.push(mat);
        body.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const copy = (o.material as THREE.Material).clone();
          copy.transparent = true;
          this.extraMaterials.push(copy);
          fade.push(copy);
          o.material = copy;
        });
      }
      return {
        group,
        body,
        driver,
        ...images[i],
        flame,
        sparks,
        impactBurst,
        stunStars,
        fade,
      };
    });
  }
  private resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height || (width === this.width && height === this.height))
      return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.sizeComposer();
    this.hud.width = Math.round(width * Math.min(devicePixelRatio, 1.5));
    this.hud.height = Math.round(height * Math.min(devicePixelRatio, 1.5));
    this.hudH = (640 * height) / width;
    const scale = this.hud.width / 640;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  render(
    s: RaceSnapshot,
    dt: number,
    axis: number,
    hit: number,
    consumed: ReadonlySet<string>,
  ) {
    if (this.disposed || this.renderer.getContext().isContextLost()) return;
    this.lastState = s;
    const key = [
      s.phase,
      s.paused,
      s.seconds,
      s.countdown,
      s.distance,
      s.x,
      s.speed,
      axis,
      hit,
      s.pickupSerial,
      s.stun,
      s.impactTime,
      this.width,
      this.height,
      this.reduced.matches,
      this.karts.length,
    ].join("|");
    if (key === this.renderKey) return;
    this.renderKey = key;
    const player = raceFrame(s.distance, s.x);
    const cameraPosition = player.position
      .clone()
      .addScaledVector(player.tangent, -12.5)
      .add(new THREE.Vector3(0, 6.6, 0));
    // Aim below the horizon so the whole player kart stays in frame; narrow
    // portrait stages need a steeper tilt to lift the kart above the HUD.
    const tilt = this.camera.aspect < 1 ? -4.2 : -3.2;
    const target = raceFrame(s.distance + 850, s.x * 0.3).position.add(
      new THREE.Vector3(0, tilt, 0),
    );
    if (
      !this.cameraReady ||
      s.distance < this.lastDistance ||
      s.phase === "countdown"
    ) {
      this.camera.position.copy(cameraPosition);
      this.look.copy(target);
      this.cameraReady = true;
    } else if (!s.paused) {
      // Fast follow keeps the chase gap near 12.5 at top speed (lag ~ speed / rate).
      const alpha = this.reduced.matches ? 1 : 1 - Math.exp(-dt * 22);
      this.camera.position.lerp(cameraPosition, alpha);
      this.look.lerp(target, alpha);
    }
    this.lastDistance = s.distance;
    const shake =
      !this.reduced.matches && s.seconds - s.impactTime < 0.25
        ? Math.sin((s.seconds - s.impactTime) * 70) * s.impact * 0.2
        : 0;
    this.camera.lookAt(this.look.clone().addScaledVector(player.right, shake));
    const fov = this.reduced.matches
      ? 57
      : 57 + Math.min(s.speed / 4800, 1) * 5;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.sun.position.copy(player.position).add(new THREE.Vector3(-22, 38, 16));
    this.sun.target.position
      .copy(player.position)
      .addScaledVector(player.tangent, 12);
    const eye = this.camera.position,
      toPlayer = player.position.clone().sub(eye).setY(0);
    const reach = toPlayer.lengthSq();
    this.karts.forEach((kart, i) => {
      const car = i === 0 ? s : s.opponents[i - 1];
      kart.group.visible = i === 0 || !s.opponents[i - 1].finished;
      const frame = this.place(kart.group, car.distance, car.x);
      if (i > 0) {
        // Chase-camera occlusion: an opponent between the lens and the player
        // turns see-through so the player's own kart always stays readable.
        const toCar = frame.position.clone().sub(eye).setY(0);
        const along = toCar.dot(toPlayer) / reach;
        const off = toCar.clone().addScaledVector(toPlayer, -along).length();
        const blocking = along > 0 && along < 1 ? clamp(3.6 - off, 0, 1) : 0;
        const opacity = 1 - blocking * 0.72;
        for (const m of kart.fade) {
          m.opacity = opacity;
          m.depthWrite = opacity > 0.99;
        }
      }
      kart.body.rotation.y = i === 0 ? axis * (s.drifting ? -0.3 : -0.08) : 0;
      kart.body.rotation.z =
        i === 0 && !this.reduced.matches
          ? -axis * Math.min(s.speed / 3600, 1) * 0.035
          : 0;
      const impactAge = s.seconds - car.impactTime;
      const reacting = impactAge >= 0 && impactAge < 0.35;
      if (!this.reduced.matches && reacting)
        kart.body.rotation.z +=
          Math.sin(impactAge * 65) * car.impact * (1 - impactAge / 0.35) * 0.13;
      kart.impactBurst.visible = reacting;
      kart.impactBurst.position.set(
        -car.impactSide * 1.0,
        0.55,
        car.impactSide ? 0 : -1.3,
      );
      kart.impactBurst.children.forEach((p, j) => {
        const angle = (j / 8) * Math.PI * 2;
        const radius = this.reduced.matches
          ? 0.55
          : impactAge * (3 + car.impact * 3);
        p.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * 0.6,
          ((j % 3) - 1) * radius * 0.5,
        );
        p.scale.setScalar(Math.max(0, 1 - impactAge / 0.35));
      });
      kart.stunStars.visible = car.stun > 0;
      kart.stunStars.children.forEach((star, j) => {
        const angle =
          (j / 3) * Math.PI * 2 + (this.reduced.matches ? 0 : s.seconds * 5);
        star.position.set(
          Math.cos(angle) * 0.78,
          2.9 + Math.sin(angle * 2) * 0.1,
          Math.sin(angle) * 0.6,
        );
      });
      const toCamera = this.camera.position.clone().sub(frame.position);
      const map = toCamera.dot(frame.tangent) > 0 ? kart.front : kart.back;
      if (kart.driver.material.map !== map) {
        kart.driver.material.map = map;
        kart.driver.material.needsUpdate = true;
      }
      if (i === 0)
        kart.driver.material.opacity =
          hit > 0.7 && Math.floor(s.seconds * 10) % 2 ? 0.5 : 1;
      kart.flame.visible = i === 0 && s.boost > 0;
      kart.flame.scale.z = this.reduced.matches
        ? 1
        : 1 + Math.sin(s.seconds * 30) * 0.15;
      kart.sparks.visible = i === 0 && s.drifting && s.driftCharge >= 0.65;
    });
    this.boxes.forEach((g, i) => {
      const lap =
        Math.floor(s.distance / TRACK_LENGTH) +
        (itemBoxes[i].z < mod(s.distance, TRACK_LENGTH) ? 1 : 0);
      // A collected box stays absent behind the driver until the next lap approaches.
      const currentLap = Math.floor(s.distance / TRACK_LENGTH);
      const behind = mod(s.distance, TRACK_LENGTH) - itemBoxes[i].z;
      g.visible = !consumed.has(
        `item-${behind > 0 && behind < 6000 ? currentLap : lap}-${i}`,
      );
      const motion = this.reduced.matches
        ? 0
        : Math.sin(s.seconds * 3 + i) * 0.13;
      g.children[0].position.y = 1.5 + motion;
      g.children[0].rotation.y = this.reduced.matches
        ? 0.35
        : s.seconds * 0.8 + i;
      g.children[3].rotation.y = this.reduced.matches ? 0 : -s.seconds;
      g.children[2].scale.setScalar(
        this.reduced.matches ? 4.2 : 4.2 + Math.sin(s.seconds * 3 + i) * 0.3,
      );
    });
    if (s.pickupSerial < this.pickupSerial) this.pickupAt = -10;
    if (s.pickupSerial > this.pickupSerial) this.pickupAt = s.seconds;
    this.pickupSerial = s.pickupSerial;
    const age = s.seconds - this.pickupAt;
    this.pickupBurst.visible = age >= 0 && age < 0.65;
    this.pickupBurst.position.copy(player.position);
    this.pickupBurst.children.forEach((p, i) => {
      const radius = this.reduced.matches ? 1.5 : 0.6 + age * 4;
      p.position.set(
        Math.cos((i / 16) * Math.PI * 2) * radius,
        1 + age * 1.8,
        Math.sin((i / 16) * Math.PI * 2) * radius,
      );
      p.scale.setScalar(Math.max(0, 1 - age / 0.65) * 1.6);
    });
    if (this.style === "hd2d" && this.composer) {
      this.animateMotes(player, s.seconds);
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
    this.drawHUD(s);
  }
  private drawHUD(s: RaceSnapshot) {
    const c = this.ctx;
    const h = this.hudH,
      mapTop = h - 125;
    c.clearRect(0, 0, 640, h);
    // Portrait stages are narrow, so grow the minimap from its bottom-right corner.
    const mapScale = h > 520 ? 1.5 : 1;
    c.save();
    c.translate(629, h - 13);
    c.scale(mapScale, mapScale);
    c.translate(-629, -(h - 13));
    c.fillStyle = "#173b32b8";
    c.beginPath();
    c.roundRect(504, mapTop, 125, 112, 8);
    c.fill();
    c.strokeStyle = "#d8dba2";
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.beginPath();
    track.forEach((p, i) => {
      const x = 536 + p.mapX * 0.24,
        y = mapTop + 55 + p.mapY * 0.2;
      if (!i) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
    c.stroke();
    const dot = (distance: number, color: string, radius: number) => {
      const f = raceFrame(distance).position;
      c.fillStyle = color;
      c.strokeStyle = "#244838";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(
        536 + (f.x / SCALE) * 0.24,
        mapTop + 55 + (f.z / SCALE) * 0.2,
        radius,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.stroke();
    };
    s.opponents.forEach((o, i) =>
      dot(o.distance, vehicles[entries[i + 1].vehicleId].color, 3),
    );
    dot(s.distance, "#fff1b0", 4);
    c.font = "10px sans-serif";
    c.textAlign = "left";
    c.fillStyle = "#fff0c9";
    c.fillText(s.zone, 513, mapTop + 14);
    c.restore();
    if (s.phase === "countdown" && !s.paused) {
      c.textAlign = "center";
      c.font = "bold 76px sans-serif";
      c.lineWidth = 6;
      c.strokeStyle = "#214738";
      c.fillStyle = "#ffe6a1";
      c.strokeText(String(Math.ceil(s.countdown)), 320, h * 0.51);
      c.fillText(String(Math.ceil(s.countdown)), 320, h * 0.51);
      c.font = "14px sans-serif";
      c.fillText("準備出發", 320, h * 0.51 + 31);
    }
    if (s.stun > 0 && s.phase === "racing") {
      c.textAlign = "center";
      c.font = "bold 16px sans-serif";
      c.fillStyle = "#fff0b1";
      c.strokeStyle = "#483b29";
      c.lineWidth = 4;
      const label = `撞暈中… ${s.stun.toFixed(1)} 秒`;
      c.strokeText(label, 320, h * 0.675);
      c.fillText(label, 320, h * 0.675);
    }
    if (s.offroad && s.stun <= 0 && s.phase === "racing") {
      c.textAlign = "center";
      c.font = "bold 12px sans-serif";
      c.strokeStyle = "#294735";
      c.lineWidth = 3;
      c.fillStyle = "#fff0b1";
      c.strokeText("草地會減速，轉回賽道！", 320, h * 0.725);
      c.fillText("草地會減速，轉回賽道！", 320, h * 0.725);
    }
  }
  private diagnostics() {
    return {
      pickupBurst: this.pickupBurst.visible,
      pickupSerial: this.pickupSerial,
      renderer: "three",
      cameraType: this.camera.type,
      pixelRatio: this.renderer.getPixelRatio(),
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      size: [this.canvas.width, this.canvas.height],
      aspect: this.camera.aspect,
      camera: this.camera.position.toArray(),
      reducedMotion: this.reduced.matches,
      cars: this.karts.map((k) => ({
        position: k.group.position.toArray(),
        heading: k.group.rotation.y,
        boost: k.flame.visible,
        sparks: k.sparks.visible,
        impactBurst: k.impactBurst.visible,
        stunStars: k.stunStars.visible,
      })),
      boxes: this.boxes.map((g) => ({
        position: g.position.toArray(),
        visible: g.visible,
        glow: g.children[2].scale.x,
        rotation: g.children[0].rotation.y,
      })),
      pads: this.pads.map((g) => g.position.toArray()),
      seam: raceFrame(0).position.distanceTo(raceFrame(TRACK_LENGTH).position),
      playerExpected: this.lastState
        ? raceFrame(
            this.lastState.distance,
            this.lastState.x,
          ).position.toArray()
        : [],
    };
  }
  /** Switch between the standard forest and the HD-2D diorama at runtime. */
  setLook(style: RaceLook) {
    const hd = style === "hd2d";
    this.style = style;
    if (hd && !this.composer) this.buildHd2d();
    this.renderer.toneMappingExposure = hd ? 1.22 : 1.15;
    const haze = hd ? "#e9d9ae" : "#c9ddcf";
    (this.scene.background as THREE.Color).set(haze);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(haze);
    fog.near = hd ? 38 : 60;
    fog.far = hd ? 135 : 150;
    this.sun.color.set(hd ? "#ffc97e" : "#ffe2ab");
    this.sun.intensity = hd ? 3.7 : 2.8;
    this.sky.intensity = hd ? 1.75 : 2.2;
    this.sky.color.set(hd ? "#ffe7bd" : "#fff5d6");
    if (this.motes) this.motes.visible = hd;
    this.renderKey = "";
  }
  private sizeComposer() {
    if (!this.composer || !this.width) return;
    this.composer.setSize(this.width, this.height);
    const [horizontal, vertical] = this.tiltShift;
    // Blur is a pixel radius, so narrow screens get proportionally less of it.
    const strength = 1.6 * THREE.MathUtils.clamp(this.width / 1100, 0.4, 1);
    horizontal.uniforms.h.value = strength / this.width;
    vertical.uniforms.v.value = strength / this.height;
    // Focus band sits on the player's kart (lower on wide screens, mid on portrait).
    const focus = this.camera.aspect < 1 ? 0.4 : 0.24;
    horizontal.uniforms.r.value = vertical.uniforms.r.value = focus;
    if (this.motes)
      (this.motes.material as THREE.PointsMaterial).size = THREE.MathUtils.clamp(
        this.width / 200,
        2.5,
        6,
      );
  }
  private buildHd2d() {
    const dot = document.createElement("canvas");
    dot.width = dot.height = 32;
    const g = dot.getContext("2d")!,
      fade = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    fade.addColorStop(0, "#fff8dc");
    fade.addColorStop(0.35, "#ffe9a8aa");
    fade.addColorStop(1, "#ffe9a800");
    g.fillStyle = fade;
    g.fillRect(0, 0, 32, 32);
    const dotTexture = new THREE.CanvasTexture(dot);
    this.textures.push(dotTexture);
    // Motes ride along with the player: x across, -z ahead of the kart.
    const count = 90,
      positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set(
        [Math.random() * 30 - 15, 0.6 + Math.random() * 6, Math.random() * 46 - 36],
        i * 3,
      );
      this.moteSeeds.push(Math.random() * Math.PI * 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: dotTexture,
      size: 5,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.extraMaterials.push(material);
    this.motes = new THREE.Points(geometry, material);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.5, 0.84),
    );
    // Grade, blur and vignette after tone mapping, in display colour space.
    this.composer.addPass(new OutputPass());
    const warm = new ShaderPass(ColorCorrectionShader);
    warm.uniforms.mulRGB.value.set(1.06, 1.01, 0.9);
    warm.uniforms.powRGB.value.set(1.08, 1.04, 1.0);
    this.composer.addPass(warm);
    const grade = new ShaderPass(HueSaturationShader);
    grade.uniforms.saturation.value = 0.14;
    this.composer.addPass(grade);
    const contrast = new ShaderPass(BrightnessContrastShader);
    contrast.uniforms.contrast.value = 0.07;
    this.composer.addPass(contrast);
    for (const shader of [HorizontalTiltShiftShader, VerticalTiltShiftShader]) {
      const pass = new ShaderPass(shader);
      this.composer.addPass(pass);
      this.tiltShift.push(pass);
    }
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.95;
    vignette.uniforms.darkness.value = 1.05;
    this.composer.addPass(vignette);
    this.sizeComposer();
  }
  private animateMotes(player: ReturnType<typeof raceFrame>, seconds: number) {
    if (!this.motes) return;
    this.motes.position.copy(player.position);
    this.motes.rotation.y = player.heading;
    if (this.reduced.matches) return;
    const position = this.motes.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const seed = this.moteSeeds[i];
      position.setY(i, 0.6 + ((seed * 3 + seconds * 0.25 + Math.sin(seconds + seed) * 0.2) % 6));
      position.setX(i, position.getX(i) + Math.sin(seconds * 0.7 + seed) * 0.004);
    }
    position.needsUpdate = true;
  }
  destroy() {
    this.disposed = true;
    this.composer?.dispose();
    this.observer.disconnect();
    this.hud.remove();
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.extraMaterials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.scene.clear();
    this.renderer.dispose();
    if (import.meta.env.DEV) delete (window as any).__raceView;
  }
}
