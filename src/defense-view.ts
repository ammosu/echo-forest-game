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
import { DefenseEngine, seeds, sparkLife, type PlantKind, type SparkKind } from "./defense-engine";

type Cell = { x: number; y: number };
/** Scene labels live on their own layer so HD-2D post effects skip them. */
const LABEL_LAYER = 1;
type Entity = Cell & {
  kind?: PlantKind | SparkKind | number;
  hp?: number;
  maxHp?: number;
  slow?: number;
  hit?: number;
  power?: number;
  fuse?: number;
  life?: number;
};

/** View only: the engine owns grid coordinates, collision, timers and damage. */
export class DefenseView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-7, 7, 4.8, -4.8, 0.1, 70);
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private textures: THREE.Texture[] = [];
  private extras: THREE.Material[] = [];
  private entities = new Map<Entity, { group: THREE.Group; type: string }>();
  private player = new THREE.Group();
  private anbo = new THREE.Group();
  private anboTail = new THREE.Group();
  private anboHead = new THREE.Group();
  private anboLegs: THREE.Group[] = [];
  private anboArms: THREE.Group[] = [];
  private idle = 0;
  private facing = Math.PI / 4;
  private lastFrame = performance.now();
  private lifeCrown: THREE.Mesh;
  private hoverTile: THREE.Mesh;
  private dangerTiles: THREE.Mesh[] = [];
  private observer: ResizeObserver;
  private disposed = false;
  private width = 0;
  private height = 0;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  /** HD-2D look: diorama tilt-shift, bloom, grading, vignette and light motes. */
  private composer?: EffectComposer;
  private tiltShift: ShaderPass[] = [];
  private motes?: THREE.Points;
  private moteSeeds: number[] = [];
  private shafts: THREE.Mesh[] = [];
  private glow?: THREE.PointLight;
  private sun: THREE.DirectionalLight;
  private sky: THREE.HemisphereLight;
  look: "standard" | "hd2d" = "standard";

  constructor(
    private canvas: HTMLCanvasElement,
    look: "standard" | "hd2d" = "standard",
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.scene.background = new THREE.Color();
    this.camera.position.set(7.2, 12.8, 15.8);
    this.camera.lookAt(-0.35, 0, 0);
    this.camera.updateMatrixWorld();
    this.sky = new THREE.HemisphereLight("#edf5dd", "#526948", 2.5);
    this.scene.add(this.sky);
    const sun = (this.sun = new THREE.DirectionalLight("#ffe2a1", 3.2));
    sun.position.set(-5, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -9,
      right: 9,
      top: 7,
      bottom: -7,
      near: 0.5,
      far: 30,
    });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.setLook(look);
    this.buildGrove();
    this.batchScenery();
    this.lifeCrown = this.ball(this.scene, -5.65, 1.9, -0.2, 0.9, "#82aa56");
    this.lifeCrown.scale.set(0.85, 1, 0.85);
    this.label("生命樹", -5.65, 3.05, -0.2, 1.05);
    this.label("← 怪物入口", 3.9, 1.75, -3.12, 1.8);
    for (let row = 0; row < 5; row++)
      this.label(String(row + 1), 5.05, 0.18, row - 2, 0.55);
    this.hoverTile = this.box(
      this.scene,
      0,
      0.065,
      0,
      0.91,
      0.055,
      0.91,
      "#edd78b",
    );
    this.hoverTile.visible = false;
    const dangerMaterial = new THREE.MeshBasicMaterial({
      color: "#ec8c3e",
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.extras.push(dangerMaterial);
    const dangerGeometry = this.geometry("danger-outline", () =>
      new THREE.RingGeometry(0.49, 0.6, 4)
        .rotateZ(Math.PI / 4)
        .rotateX(-Math.PI / 2),
    );
    for (let i = 0; i < 27; i++) {
      const tile = new THREE.Mesh(dangerGeometry, dangerMaterial);
      tile.visible = false;
      this.scene.add(tile);
      this.dangerTiles.push(tile);
    }
    this.scene.add(this.player);
    const ring = new THREE.Mesh(
      this.geometry("ring", () => new THREE.RingGeometry(0.27, 0.36, 24)),
      new THREE.MeshBasicMaterial({ color: "#fff0a9", side: THREE.DoubleSide }),
    );
    this.extras.push(ring.material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.11;
    this.player.add(ring);
    this.buildAnbo();
    this.player.add(this.anbo);
    this.label("Anbo", 0, 1.42, 0, 0.65, this.player);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  private material(color: string) {
    let material = this.materials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.88,
        flatShading: true,
      });
      this.materials.set(color, material);
    }
    return material;
  }
  private geometry(key: string, create: () => THREE.BufferGeometry) {
    if (!this.geometries.has(key)) this.geometries.set(key, create());
    return this.geometries.get(key)!;
  }
  private mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(
      geometry,
      this.material(color),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const mesh = this.mesh(
      parent,
      this.geometry("box", () => new THREE.BoxGeometry(1, 1, 1)),
      color,
      x,
      y,
      z,
    );
    mesh.scale.set(w, h, d);
    return mesh;
  }
  private ball(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    color: string,
  ) {
    const mesh = this.mesh(
      parent,
      this.geometry("ball", () => new THREE.IcosahedronGeometry(1, 1)),
      color,
      x,
      y,
      z,
    );
    mesh.scale.setScalar(r);
    return mesh;
  }
  private cylinder(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    color: string,
  ) {
    const mesh = this.mesh(
      parent,
      this.geometry("cylinder", () => new THREE.CylinderGeometry(1, 1, 1, 10)),
      color,
      x,
      y,
      z,
    );
    mesh.scale.set(r, h, r);
    return mesh;
  }
  /** One Anbo part: cached geometry, flat-shaded colour, transform in model space. */
  private part(
    parent: THREE.Object3D,
    key: string,
    create: () => THREE.BufferGeometry,
    color: string,
    [x, y, z]: number[],
    [sx, sy, sz]: number[],
    [rx, ry, rz]: number[] = [0, 0, 0],
  ) {
    const mesh = this.mesh(parent, this.geometry(key, create), color, x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(rx, ry, rz);
    return mesh;
  }
  /**
   * Chibi Anbo modelled after the cover art, facing +z: big-eared fox head,
   * open charcoal jacket over a cream shirt, belt, mustard trousers, boots
   * and a fluffy white-tipped tail. Limbs hang from pivots for the walk cycle.
   */
  private buildAnbo() {
    const a = this.anbo,
      fur = "#e57a2e",
      furDark = "#c45f22",
      cream = "#f6ead6",
      jacket = "#3b403d",
      lapel = "#4a514c",
      ink = "#1c1a1a",
      ball = () => new THREE.IcosahedronGeometry(1, 1),
      orb = () => new THREE.IcosahedronGeometry(1, 2),
      cube = () => new THREE.BoxGeometry(1, 1, 1),
      pyramid = () => new THREE.ConeGeometry(1, 1, 4),
      cone = () => new THREE.ConeGeometry(1, 1, 7),
      tube = () => new THREE.CylinderGeometry(1, 1, 1, 8),
      torso = () => new THREE.CylinderGeometry(0.8, 1, 1, 8),
      smile = () => new THREE.TorusGeometry(1, 0.22, 4, 8, Math.PI);
    // Legs: trousers, rolled cuffs and boots on hip pivots.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.075, 0.2, 0);
      a.add(leg);
      this.anboLegs.push(leg);
      this.part(
        leg,
        "a-tube",
        tube,
        "#c9942e",
        [0, -0.07, 0],
        [0.065, 0.14, 0.065],
      );
      this.part(
        leg,
        "a-tube",
        tube,
        "#b5832a",
        [0, -0.135, 0],
        [0.072, 0.03, 0.072],
      );
      this.part(
        leg,
        "a-orb",
        orb,
        "#5b3a22",
        [0, -0.17, 0.025],
        [0.07, 0.045, 0.1],
      );
    }
    // Torso: jacket, shirt front, lapels, belt and buckle.
    this.part(a, "a-torso", torso, jacket, [0, 0.32, 0], [0.155, 0.22, 0.12]);
    this.part(a, "a-cube", cube, cream, [0, 0.335, 0.098], [0.085, 0.17, 0.03]);
    for (const side of [-1, 1]) {
      this.part(
        a,
        "a-cube",
        cube,
        lapel,
        [side * 0.055, 0.37, 0.104],
        [0.035, 0.12, 0.02],
        [0, 0, side * 0.35],
      );
      this.part(
        a,
        "a-cube",
        cube,
        jacket,
        [side * 0.075, 0.27, 0.1],
        [0.05, 0.11, 0.025],
      );
    }
    this.part(
      a,
      "a-tube",
      tube,
      "#6e4a2a",
      [0, 0.235, 0],
      [0.152, 0.035, 0.122],
    );
    this.part(
      a,
      "a-cube",
      cube,
      "#e8c35c",
      [0, 0.235, 0.122],
      [0.045, 0.035, 0.015],
    );
    // Arms: sleeves with orange paws on shoulder pivots.
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.16, 0.4, 0);
      arm.rotation.z = side * 0.18;
      a.add(arm);
      this.anboArms.push(arm);
      this.part(
        arm,
        "a-tube",
        tube,
        jacket,
        [0, -0.07, 0],
        [0.045, 0.15, 0.045],
      );
      this.part(
        arm,
        "a-ball",
        ball,
        fur,
        [0, -0.16, 0.01],
        [0.045, 0.045, 0.045],
      );
    }
    // Head: wide cheeks, cream muzzle, snout, nose, eyes, smile.
    const head = this.anboHead;
    head.position.set(0, 0.6, 0);
    a.add(head);
    this.part(head, "a-orb", orb, fur, [0, 0, 0], [0.2, 0.175, 0.18]);
    this.part(
      head,
      "a-orb",
      orb,
      furDark,
      [0, 0.02, -0.04],
      [0.17, 0.16, 0.16],
    );
    for (const side of [-1, 1]) {
      this.part(
        head,
        "a-pyramid",
        pyramid,
        cream,
        [side * 0.19, -0.05, 0.03],
        [0.07, 0.11, 0.05],
        [0, 0, side * 1.9],
      );
      this.part(
        head,
        "a-orb",
        orb,
        ink,
        [side * 0.075, 0.025, 0.155],
        [0.032, 0.04, 0.02],
      );
      this.part(
        head,
        "a-ball",
        ball,
        "#ffffff",
        [side * 0.065, 0.04, 0.172],
        [0.01, 0.01, 0.006],
      );
      this.part(
        head,
        "a-cube",
        cube,
        furDark,
        [side * 0.078, 0.092, 0.148],
        [0.04, 0.01, 0.02],
        [0, 0, side * 0.2],
      );
      // Ears: orange pyramid with cream inner face, dark tip.
      const ear = new THREE.Group();
      ear.position.set(side * 0.115, 0.13, -0.01);
      ear.rotation.set(-0.08, 0, side * -0.32);
      head.add(ear);
      this.part(
        ear,
        "a-pyramid",
        pyramid,
        fur,
        [0, 0.11, 0],
        [0.11, 0.21, 0.07],
        [0, Math.PI / 4, 0],
      );
      this.part(
        ear,
        "a-pyramid",
        pyramid,
        cream,
        [0, 0.095, 0.02],
        [0.07, 0.15, 0.03],
        [0, Math.PI / 4, 0],
      );
      this.part(
        ear,
        "a-pyramid",
        pyramid,
        ink,
        [0, 0.2, 0],
        [0.04, 0.05, 0.03],
        [0, Math.PI / 4, 0],
      );
    }
    this.part(head, "a-orb", orb, cream, [0, -0.07, 0.1], [0.13, 0.085, 0.1]);
    this.part(
      head,
      "a-cone",
      cone,
      cream,
      [0, -0.045, 0.2],
      [0.06, 0.1, 0.05],
      [Math.PI / 2, 0, 0],
    );
    this.part(
      head,
      "a-orb",
      orb,
      ink,
      [0, -0.035, 0.25],
      [0.028, 0.022, 0.022],
    );
    this.part(
      head,
      "a-smile",
      smile,
      ink,
      [0, -0.085, 0.192],
      [0.022, 0.016, 0.02],
      [0, 0, Math.PI],
    );
    // Tail: three fluffy segments curling up behind, big cream tip.
    const tail = this.anboTail;
    tail.position.set(0, 0.24, -0.11);
    a.add(tail);
    this.part(
      tail,
      "a-orb",
      orb,
      fur,
      [0, 0.02, -0.09],
      [0.08, 0.075, 0.11],
      [0.5, 0, 0],
    );
    this.part(
      tail,
      "a-orb",
      orb,
      fur,
      [0, 0.12, -0.18],
      [0.1, 0.1, 0.11],
      [0.9, 0, 0],
    );
    this.part(
      tail,
      "a-orb",
      orb,
      cream,
      [0, 0.25, -0.2],
      [0.085, 0.1, 0.085],
      [1.2, 0, 0],
    );
    a.scale.setScalar(1.15);
    a.rotation.y = this.facing;
  }
  private label(
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#173d30e6";
    ctx.roundRect(0, 0, 256, 64, 16);
    ctx.fill();
    ctx.font = "600 36px sans-serif";
    ctx.fillStyle = "#fff0bc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 33);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);
    const material = new THREE.SpriteMaterial({
      map: texture,
      toneMapped: false,
    });
    this.extras.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(width, width / 4, 1);
    sprite.layers.set(LABEL_LAYER);
    parent.add(sprite);
  }

  private buildGrove() {
    this.box(this.scene, -0.55, -0.57, 0, 12.2, 0.85, 7.3, "#624834");
    this.box(this.scene, -0.55, -0.14, 0, 12.35, 0.2, 7.4, "#526b40");
    this.box(this.scene, -0.55, -0.95, 0, 12.4, 0.12, 7.45, "#342f26");
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 9; x++) {
        this.box(
          this.scene,
          x - 4,
          -0.01,
          y - 2,
          0.96,
          0.12,
          0.96,
          x === 8 ? "#a09362" : (x + y) % 2 ? "#749653" : "#85a460",
        );
        // Small grass tufts keep the grid readable while giving the meadow texture.
        for (let i = 0; i < 2; i++) {
          const blade = this.box(
            this.scene,
            x - 4.33 + i * 0.57,
            0.08,
            y - 2.32 + i * 0.52,
            0.035,
            0.09,
            0.035,
            "#a3ba74",
          );
          blade.rotation.z = i ? 0.3 : -0.3;
        }
      }
      this.box(this.scene, -4.64, 0.06, y - 2, 0.09, 0.12, 0.76, "#d8c883");
      const arrow = this.mesh(
        this.scene,
        this.geometry("arrow", () => new THREE.ConeGeometry(0.12, 0.24, 3)),
        "#e4cc91",
        4,
        0.13,
        y - 2,
      );
      arrow.rotation.z = Math.PI / 2;
      arrow.scale.z = 0.3;
    }
    // Trees live beyond the playing cells, so their crowns never hide a planting lane.
    for (const [x, z, size] of [
      [-5.8, -2.8, 0.65],
      [-3.7, -3.15, 0.5],
      [-1.8, -3.2, 0.65],
      [0.5, -3.2, 0.48],
      [2.4, -3.2, 0.6],
      [5, -2.7, 0.65],
      [-5.9, 2.9, 0.55],
      [4.9, 2.95, 0.43],
    ]) {
      this.cylinder(this.scene, x, size * 0.45, z, 0.12, size, "#785539");
      const crown = this.ball(this.scene, x, size * 1.65, z, size, "#3b7650");
      crown.scale.y *= 1.15;
      this.ball(
        this.scene,
        x - size * 0.3,
        size * 1.9,
        z + size * 0.12,
        size * 0.62,
        "#63944e",
      );
    }
    this.cylinder(this.scene, -5.65, 0.68, -0.2, 0.23, 1.4, "#8e653d");
    this.ball(this.scene, -5.9, 1.48, -0.13, 0.63, "#4d8347");
    this.ball(this.scene, -5.27, 1.62, -0.2, 0.6, "#67964c");
    for (let i = 0; i < 18; i++) {
      const x = -5.4 + i * 0.62;
      this.ball(
        this.scene,
        x,
        0.04,
        3.05 + Math.sin(i * 2) * 0.18,
        0.08,
        i % 3 ? "#d9c888" : "#b19eb7",
      );
      if (i % 3 === 0)
        this.box(this.scene, x, 0.06, -2.8, 0.17, 0.12, 0.12, "#899488");
    }
    // Wooden corner stakes frame the miniature meadow.
    for (const x of [-4.65, 4.65])
      for (const z of [-2.65, 2.65]) {
        this.box(this.scene, x, 0.17, z, 0.12, 0.5, 0.12, "#a98a55");
        this.ball(this.scene, x, 0.47, z, 0.08, "#e5c479");
      }
  }

  /** Batch immutable scenery by geometry/material; moving game objects stay separate. */
  private batchScenery() {
    const buckets = new Map<string, THREE.Mesh[]>();
    for (const child of this.scene.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material))
        continue;
      const key = `${child.geometry.uuid}:${child.material.uuid}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(child);
      buckets.set(key, bucket);
    }
    for (const meshes of buckets.values()) {
      const batch = new THREE.InstancedMesh(
        meshes[0].geometry,
        meshes[0].material,
        meshes.length,
      );
      meshes.forEach((mesh, index) => {
        mesh.updateMatrix();
        batch.setMatrixAt(index, mesh.matrix);
        this.scene.remove(mesh);
      });
      batch.castShadow = true;
      batch.receiveShadow = true;
      batch.computeBoundingSphere();
      this.scene.add(batch);
    }
  }

  private makePlant(kind: PlantKind | "log", group: THREE.Group) {
    if (kind === "wall" || kind === "log") {
      this.cylinder(
        group,
        0,
        0.32,
        0,
        0.3,
        0.55,
        kind === "log" ? "#71503b" : "#a67845",
      );
      this.cylinder(group, 0, 0.61, 0, 0.31, 0.055, "#d1ad71");
      this.cylinder(group, 0, 0.644, 0, 0.2, 0.015, "#967247");
      this.cylinder(group, 0, 0.656, 0, 0.12, 0.015, "#d1ad71");
      this.box(group, -0.29, 0.18, 0.12, 0.17, 0.18, 0.17, "#71503b");
      this.box(group, 0.29, 0.15, -0.12, 0.17, 0.18, 0.17, "#71503b");
      if (kind === "wall") {
        for (const x of [-0.1, 0.1])
          this.ball(group, x, 0.4, 0.28, 0.04, "#253d31");
        const leaf = this.ball(group, -0.25, 0.62, 0, 0.12, "#8fb359");
        leaf.scale.y = 0.4;
      }
      return;
    }
    this.cylinder(
      group,
      0,
      0.25,
      0,
      0.09,
      0.45,
      kind === "ice" ? "#ebe6c9" : "#4f8241",
    );
    for (const x of [-0.19, 0.19]) {
      const leaf = this.ball(group, x, 0.16, 0, 0.2, "#528743");
      leaf.scale.set(0.24, 0.07, 0.15);
      leaf.rotation.z = x > 0 ? 0.3 : -0.3;
    }
    if (kind === "ice") {
      const cap = this.ball(group, 0, 0.53, 0, 0.37, "#80ccca");
      cap.scale.y = 0.22;
      this.ball(group, -0.1, 0.71, 0.12, 0.075, "#e8f4d5");
      this.ball(group, 0.18, 0.66, 0.1, 0.055, "#e8f4d5");
      for (const x of [-0.055, 0.055])
        this.ball(group, x, 0.3, 0.085, 0.024, "#2c5a58");
    } else {
      this.ball(group, 0, 0.57, 0, 0.24, "#c59a57");
      const cap = this.ball(group, -0.045, 0.74, 0, 0.26, "#745335");
      cap.scale.y = 0.13;
      const nozzle = this.cylinder(group, 0.24, 0.55, 0, 0.12, 0.32, "#b98a49");
      nozzle.rotation.z = Math.PI / 2;
      const hole = this.cylinder(
        group,
        0.407,
        0.55,
        0,
        0.083,
        0.015,
        "#403b29",
      );
      hole.rotation.z = Math.PI / 2;
      this.ball(group, -0.035, 0.59, 0.225, 0.035, "#283d31");
    }
  }

  private createEntity(entity: Entity, type: string) {
    const group = new THREE.Group();
    if (type === "plant" || type === "log")
      this.makePlant(
        type === "log" ? "log" : (entity.kind as PlantKind),
        group,
      );
    if (type === "enemy") {
      const kind = entity.kind as number;
      const color = ["#a286b1", "#d7a061", "#8097ad"][kind];
      const body = this.ball(group, 0, 0.42, 0, 0.31, color);
      body.scale.y = kind === 1 ? 0.35 : 0.4;
      for (const z of [-0.14, 0.14]) {
        this.ball(group, -0.02, 0.1, z, 0.12, "#3b4247");
        this.ball(group, -0.23, 0.54, z, 0.085, "#f9eecb");
        this.ball(group, -0.295, 0.54, z, 0.035, "#343041");
      }
      if (kind === 2) this.box(group, 0, 0.75, 0, 0.62, 0.14, 0.55, "#53657b");
      else {
        this.ball(group, 0.03, 0.79, -0.14, 0.105, color);
        this.ball(group, 0.03, 0.79, 0.14, 0.105, color);
      }
      const frost = this.cylinder(group, 0, 0.09, 0, 0.38, 0.07, "#acf1eb");
      frost.name = "frost";
    }
    if (type === "bomb") {
      this.ball(group, 0, 0.3, 0, 0.25, "#34434a").name = "shell";
      this.cylinder(group, 0, 0.55, 0, 0.06, 0.14, "#b79560");
      this.ball(group, 0, 0.67, 0, 0.06, "#ffdc80");
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        this.box(
          group,
          Math.cos(angle) * 0.34,
          0.12,
          Math.sin(angle) * 0.34,
          0.075,
          0.03,
          0.075,
          "#ffcb6c",
        ).name = `fuse-${i}`;
      }
    }
    if (type === "shot")
      this.ball(
        group,
        0,
        0.5,
        0,
        0.095,
        entity.kind === "ice" ? "#b5ffff" : "#ffe59b",
      );
    if (type === "flame") {
      this.box(group, 0, 0.1, 0, 0.86, 0.12, 0.86, "#ef9346");
      for (let i = 0; i < 3; i++) {
        const flame = this.ball(
          group,
          (i - 1) * 0.21,
          0.35,
          (i % 2) * 0.2 - 0.1,
          0.19,
          i === 1 ? "#fff1a3" : "#ffbf51",
        );
        flame.scale.y = 0.5 - Math.abs(i - 1) * 0.12;
      }
    }
    if (type === "spark") {
      const kind = entity.kind as SparkKind;
      const colors = { hit: ["#ffe59b", "#fff8d6"], ice: ["#b5ffff", "#ffffff"], defeat: ["#ffd45a", "#fff8d6"], hurt: ["#f39a7f", "#ffd2c4"], log: ["#b98a55", "#e1c08a"] }[kind];
      const power = entity.power ?? 1;
      const count = Math.round((kind === "hit" || kind === "ice" ? 6 : 12) * power);
      const star = this.geometry("spark", () => new THREE.OctahedronGeometry(1));
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const rainbow = ["#ff9fb3", "#ffd45a", "#9ff3ff", "#c7a6ff", "#a6f0a0"];
        const piece = this.mesh(group, star, power >= 2 ? rainbow[i % rainbow.length] : colors[i % 2], 0, 0.5, 0);
        piece.castShadow = false;
        piece.userData.dir = new THREE.Vector3(Math.cos(angle), 0.6 + Math.random() * 0.8, Math.sin(angle));
      }
      if (kind !== "hit" && kind !== "ice") {
        const ring = this.mesh(group, this.geometry("spark-ring", () => new THREE.RingGeometry(0.85, 1, 28)), colors[0], 0, 0.12, 0);
        ring.rotation.x = -Math.PI / 2;
        ring.castShadow = false;
        ring.name = "ring";
      }
      group.position.y = 0;
    }
    if (entity.hp !== undefined) {
      this.box(group, 0, 0.99, 0, 0.56, 0.045, 0.075, "#31463c");
      const health = this.box(
        group,
        0,
        1,
        0.015,
        0.54,
        0.05,
        0.08,
        type === "enemy" ? "#f3aa84" : "#d1eb94",
      );
      health.name = "health";
    }
    this.scene.add(group);
    this.entities.set(entity, { group, type });
    return group;
  }

  /** Sparks fly out and shrink over the spark's life; a ground ring expands for big touches. */
  private animateSpark(group: THREE.Group, entity: Entity) {
    const kind = entity.kind as SparkKind;
    const age = 1 - (entity.life ?? 0) / sparkLife[kind];
    const still = this.reducedMotion.matches;
    const power = entity.power ?? 1;
    const reach = (kind === "hit" || kind === "ice" ? 0.45 : 0.9) * (1 + (power - 1) * 0.5);
    for (const piece of group.children) {
      if (piece.name === "ring") {
        piece.scale.setScalar((still ? 0.6 : 0.2 + age * 0.7) * (1 + (power - 1) * 0.6));
        piece.visible = age < 0.85;
        continue;
      }
      const dir = piece.userData.dir as THREE.Vector3;
      const travel = still ? 0 : reach * Math.sin(age * Math.PI * 0.5);
      piece.position.set(dir.x * travel, 0.5 + dir.y * travel - age * age * 0.4, dir.z * travel);
      piece.scale.setScalar((kind === "hit" || kind === "ice" ? 0.11 : 0.15) * (1 - age * 0.7));
      piece.rotation.y = age * 6;
    }
  }

  private kickAt = -10000;
  private kickShake = 0;
  private kickZoom = 0;
  /** Camera reaction: shake (world units) and a zoom punch that decay over ~0.3s. */
  kick(shake: number, zoom = 0) {
    if (this.reducedMotion.matches) return;
    const now = performance.now();
    const left = Math.max(0, 1 - (now - this.kickAt) / 300);
    this.kickShake = Math.max(shake, this.kickShake * left);
    this.kickZoom = Math.max(zoom, this.kickZoom * left);
    this.kickAt = now;
  }
  private applyKick() {
    const k = Math.max(0, 1 - (performance.now() - this.kickAt) / 300);
    const shake = this.kickShake * k * k;
    this.camera.position.set(7.2 + (Math.random() - 0.5) * shake, 12.8 + (Math.random() - 0.5) * shake * 0.5, 15.8 + (Math.random() - 0.5) * shake);
    const zoom = 1 + this.kickZoom * Math.sin(k * Math.PI);
    if (this.camera.zoom !== zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
  }

  private sizeComposer() {
    if (!this.composer || !this.width) return;
    this.composer.setSize(this.width, this.height);
    const [horizontal, vertical] = this.tiltShift;
    // Gentle tilt-shift: enough for the diorama feel, labels stay sharp anyway.
    horizontal.uniforms.h.value = 2 / this.width;
    vertical.uniforms.v.value = 2 / this.height;
    // Motes are screen-sized under the orthographic camera; scale with the board.
    if (this.motes)
      (this.motes.material as THREE.PointsMaterial).size =
        THREE.MathUtils.clamp(this.width / 160, 2.5, 6);
  }

  private resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height || (width === this.width && height === this.height))
      return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.sizeComposer();
    const aspect = width / height;
    const halfWidth = Math.max(7.25, 4.75 * aspect);
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfWidth / aspect;
    this.camera.bottom = -halfWidth / aspect;
    this.camera.updateProjectionMatrix();
  }

  pick(clientX: number, clientY: number): Cell | null {
    this.resize();
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const point = this.raycaster.ray.intersectPlane(
      this.ground,
      new THREE.Vector3(),
    );
    if (!point) return null;
    const x = Math.floor(point.x + 4.5),
      y = Math.floor(point.z + 2.5);
    return x >= 0 && x < 9 && y >= 0 && y < 5 ? { x, y } : null;
  }

  /** Read-only projection for browser verification of real pointer input. */
  screenCell(x: number, y: number) {
    this.resize();
    const position = new THREE.Vector3(x - 4, 0, y - 2).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((position.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - position.y) * rect.height) / 2,
    };
  }

  render(game: DefenseEngine, hover: Cell | null, selected: PlantKind) {
    if (this.disposed || this.renderer.getContext().isContextLost()) return;
    const alive = new Set<Entity>();
    const lists: [string, Entity[]][] = [
      ["log", game.logs],
      ["plant", game.plants],
      ["enemy", game.enemies],
      ["bomb", game.bombs],
      ["shot", game.shots],
      ["flame", game.flames],
      ["spark", game.sparks],
    ];
    for (const [type, list] of lists)
      for (const entity of list) {
        alive.add(entity);
        const group =
          this.entities.get(entity)?.group ?? this.createEntity(entity, type);
        group.position.set(entity.x - 4, 0, entity.y - 2);
        if (entity.hp !== undefined) {
          const ratio = Math.max(
            0,
            entity.hp / (entity.maxHp ?? seeds[entity.kind as PlantKind].hp),
          );
          const health = group.getObjectByName("health")!;
          health.scale.x = 0.54 * ratio;
          health.position.x = -0.27 * (1 - ratio);
        }
        if (type === "enemy") {
          // Squash briefly when struck so every landed shot reads as a touch.
          const f = this.reducedMotion.matches ? 0 : entity.hit ?? 0;
          group.scale.set(1 + f * 1.4, 1 - f * 1.4, 1 + f * 1.4);
          group.getObjectByName("frost")!.visible = (entity.slow ?? 0) > 0;
          if (!this.reducedMotion.matches)
            group.position.y =
              Math.abs(Math.sin(game.elapsed * 7 + entity.y)) * 0.035;
        }
        if (type === "bomb") {
          const fuse = entity.fuse!;
          const shell = group.getObjectByName("shell") as THREE.Mesh;
          shell.material = this.material(
            fuse < 0.7 && Math.floor(fuse * 10) % 2 ? "#d77644" : "#34434a",
          );
          for (let i = 0; i < 10; i++)
            group.getObjectByName(`fuse-${i}`)!.visible =
              i < Math.ceil(fuse * 5);
        }
        if (type === "spark") this.animateSpark(group, entity);
        if (type === "flame")
          group.scale.y = this.reducedMotion.matches
            ? 1
            : 0.65 + entity.life! * 1.8;
      }
    for (const [entity, { group }] of this.entities)
      if (!alive.has(entity)) {
        this.scene.remove(group);
        this.entities.delete(entity);
      }
    this.applyKick();
    this.animateAnbo(game);
    this.anbo.visible =
      game.player.invincible <= 0 ||
      Math.floor(game.player.invincible * 10) % 2 === 0;
    this.lifeCrown.material = this.material(
      game.tree > 3 ? "#82aa56" : "#bc9661",
    );
    this.hoverTile.visible = game.active && hover !== null;
    if (hover) {
      const valid =
        hover.x < 8 &&
        game.resources >= seeds[selected].cost &&
        ![...game.plants, ...game.logs, ...game.bombs].some(
          (p) => p.x === hover.x && p.y === hover.y,
        );
      this.hoverTile.position.set(hover.x - 4, 0.065, hover.y - 2);
      this.hoverTile.material = this.material(valid ? "#edd78b" : "#bd7765");
    }
    let count = 0;
    const danger = (x: number, y: number) => {
      const tile = this.dangerTiles[count++];
      tile.visible = true;
      tile.position.set(x - 4, 0.09, y - 2);
    };
    for (const bomb of game.bombs) {
      danger(bomb.x, bomb.y);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        for (let i = 1; i <= 2; i++) {
          const x = bomb.x + dx * i,
            y = bomb.y + dy * i;
          if (x < 0 || x > 8 || y < 0 || y > 4) break;
          danger(x, y);
          if (game.logs.some((log) => log.x === x && log.y === y)) break;
        }
    }
    for (let i = count; i < this.dangerTiles.length; i++)
      this.dangerTiles[i].visible = false;
    if (this.look === "hd2d" && this.composer) {
      this.animateAmbience();
      this.camera.layers.set(0);
      this.composer.render();
      // Labels skip bloom, grading and tilt-shift so text stays readable.
      this.camera.layers.set(LABEL_LAYER);
      const background = this.scene.background;
      this.scene.background = null;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = true;
      this.scene.background = background;
      this.camera.layers.enable(0);
    } else {
      this.camera.layers.enable(LABEL_LAYER);
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Octopath-style diorama: warm low sun and deeper shadows, sun shafts and
   * drifting motes in the scene, then bloom, grading, tilt-shift and vignette.
   */
  /** Switch between the standard grove and the HD-2D diorama at runtime. */
  setLook(look: "standard" | "hd2d") {
    const hd = look === "hd2d";
    this.look = look;
    if (hd && !this.composer) this.buildHd2d();
    this.renderer.toneMappingExposure = hd ? 1.4 : 1.35;
    (this.scene.background as THREE.Color).set(hd ? "#173a33" : "#284d43");
    this.sun.color.set(hd ? "#ffd28a" : "#ffe2a1");
    this.sun.intensity = hd ? 4.6 : 3.2;
    this.sun.position.set(hd ? -7 : -5, hd ? 9 : 10, hd ? 3 : 5);
    this.sky.intensity = hd ? 2.1 : 2.5;
    for (const extra of [this.glow, this.motes, ...this.shafts])
      if (extra) extra.visible = hd;
  }

  private buildHd2d() {
    const glow = (this.glow = new THREE.PointLight("#ffcf7a", 6, 6, 1.6));
    glow.position.set(-5.4, 1.4, 0.4);
    this.scene.add(glow);
    // Soft round sprite shared by the motes.
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
    const count = 70,
      positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set(
        [
          Math.random() * 13 - 6.5,
          0.3 + Math.random() * 2.6,
          Math.random() * 7 - 3.5,
        ],
        i * 3,
      );
      this.moteSeeds.push(Math.random() * Math.PI * 2);
    }
    const motesGeometry = new THREE.BufferGeometry();
    motesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    const motesMaterial = new THREE.PointsMaterial({
      map: dotTexture,
      size: 6,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.extras.push(motesMaterial);
    this.motes = new THREE.Points(motesGeometry, motesMaterial);
    this.scene.add(this.motes);
    // Sun shafts: tall additive planes slanting in from the top-left.
    const shaft = document.createElement("canvas");
    shaft.width = 4;
    shaft.height = 128;
    const s = shaft.getContext("2d")!,
      beam = s.createLinearGradient(0, 0, 0, 128);
    beam.addColorStop(0, "#fff1c400");
    beam.addColorStop(0.3, "#fff1c455");
    beam.addColorStop(1, "#fff1c400");
    s.fillStyle = beam;
    s.fillRect(0, 0, 4, 128);
    const shaftTexture = new THREE.CanvasTexture(shaft);
    this.textures.push(shaftTexture);
    for (const [x, z, w] of [
      [-3.2, -1.2, 1.1],
      [-0.6, 0.4, 0.7],
      [1.8, -0.8, 0.9],
    ]) {
      const material = new THREE.MeshBasicMaterial({
        map: shaftTexture,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      this.extras.push(material);
      const mesh = new THREE.Mesh(
        this.geometry("shaft", () => new THREE.PlaneGeometry(1, 1)),
        material,
      );
      mesh.scale.set(w, 7, 1);
      mesh.position.set(x, 2.6, z);
      mesh.rotation.set(0, 0.6, 0.55);
      this.scene.add(mesh);
      this.shafts.push(mesh);
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.55, 0.86),
    );
    // Grade, blur and vignette after tone mapping, in display colour space.
    this.composer.addPass(new OutputPass());
    const warm = new ShaderPass(ColorCorrectionShader);
    warm.uniforms.mulRGB.value.set(1.06, 1.01, 0.9);
    warm.uniforms.powRGB.value.set(1.1, 1.05, 1.0);
    this.composer.addPass(warm);
    const grade = new ShaderPass(HueSaturationShader);
    grade.uniforms.saturation.value = 0.16;
    this.composer.addPass(grade);
    const contrast = new ShaderPass(BrightnessContrastShader);
    contrast.uniforms.contrast.value = 0.07;
    this.composer.addPass(contrast);
    // Focus band sits on the middle rows; foreground and backdrop soften.
    for (const shader of [HorizontalTiltShiftShader, VerticalTiltShiftShader]) {
      const pass = new ShaderPass(shader);
      pass.uniforms.r.value = 0.48;
      this.composer.addPass(pass);
      this.tiltShift.push(pass);
    }
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.95;
    vignette.uniforms.darkness.value = 1.1;
    this.composer.addPass(vignette);
    this.sizeComposer();
  }

  private animateAmbience() {
    if (!this.motes || this.reducedMotion.matches) return;
    const t = performance.now() / 1000,
      position = this.motes.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const seed = this.moteSeeds[i];
      let y = position.getY(i) + 0.0035;
      if (y > 3.1) y = 0.3;
      position.setXYZ(
        i,
        position.getX(i) + Math.sin(t * 0.6 + seed) * 0.003,
        y,
        position.getZ(i) + Math.cos(t * 0.5 + seed) * 0.003,
      );
    }
    position.needsUpdate = true;
    this.shafts.forEach((shaft, i) => {
      (shaft.material as THREE.MeshBasicMaterial).opacity =
        0.12 + Math.sin(t * 0.7 + i * 2) * 0.04;
    });
  }

  /** Glide between grid cells, turn toward travel and hop while walking. */
  private animateAnbo(game: DefenseEngine) {
    const now = performance.now(),
      dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    const p = this.player.position,
      dx = game.player.x - 4 - p.x,
      dz = game.player.y - 2 - p.z,
      distance = Math.hypot(dx, dz);
    const teleport = distance > 1.5;
    if (teleport) p.set(game.player.x - 4, 0, game.player.y - 2);
    else {
      const k = 1 - Math.exp(-dt * 18);
      p.x += dx * k;
      p.z += dz * k;
    }
    const moving = !teleport && distance > 0.03;
    this.idle = moving ? 0 : this.idle + dt;
    // Face travel; after a short rest, turn back toward the camera.
    if (moving) this.facing = Math.atan2(dx, dz);
    else if (this.idle > 1.4) this.facing = 0.45;
    let turn = this.facing - this.anbo.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.anbo.rotation.y += turn * (1 - Math.exp(-dt * 12));
    const still = this.reducedMotion.matches,
      stride = still || !moving ? 0 : Math.sin(now / 55);
    this.anboLegs.forEach(
      (leg, i) => (leg.rotation.x = stride * (i ? -0.6 : 0.6)),
    );
    this.anboArms.forEach(
      (arm, i) => (arm.rotation.x = stride * (i ? 0.5 : -0.5)),
    );
    this.anbo.position.y = still
      ? 0
      : moving
        ? Math.abs(stride) * 0.05
        : Math.sin(now / 420) * 0.008;
    this.anboHead.rotation.z = still || moving ? 0 : Math.sin(now / 900) * 0.06;
    this.anboTail.rotation.y = still
      ? 0
      : Math.sin(now / (moving ? 90 : 300)) * 0.35;
  }

  diagnostics() {
    return {
      renderer: "three.js",
      look: this.look,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      entities: [...this.entities.values()].reduce<Record<string, number>>(
        (counts, { type }) => {
          counts[type] = (counts[type] ?? 0) + 1;
          return counts;
        },
        {},
      ),
      dangerCells: this.dangerTiles
        .filter((tile) => tile.visible)
        .map((tile) => ({ x: tile.position.x + 4, y: tile.position.z + 2 })),
    };
  }

  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.extras.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    this.composer?.dispose();
    this.motes?.geometry.dispose();
    this.renderer.dispose();
    this.entities.clear();
  }
}
