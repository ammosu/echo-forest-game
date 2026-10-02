import * as THREE from "three";
import { DefenseEngine, seeds, type PlantKind } from "./defense-engine";
import anboUrl from "../assets/sprites/1x/anbo.png";

type Cell = { x: number; y: number };
type Entity = Cell & {
  kind?: PlantKind | number;
  hp?: number;
  maxHp?: number;
  slow?: number;
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
  private playerSprite: THREE.Sprite;
  private lifeCrown: THREE.Mesh;
  private hoverTile: THREE.Mesh;
  private dangerTiles: THREE.Mesh[] = [];
  private observer: ResizeObserver;
  private disposed = false;
  private width = 0;
  private height = 0;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(private canvas: HTMLCanvasElement) {
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
    this.scene.background = new THREE.Color("#284d43");
    this.camera.position.set(7.2, 12.8, 15.8);
    this.camera.lookAt(-0.35, 0, 0);
    this.camera.updateMatrixWorld();
    this.scene.add(new THREE.HemisphereLight("#edf5dd", "#526948", 2.5));
    const sun = new THREE.DirectionalLight("#ffe2a1", 3.2);
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
    const texture = new THREE.TextureLoader().load(anboUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    this.textures.push(texture);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      toneMapped: false,
    });
    this.extras.push(material);
    this.playerSprite = new THREE.Sprite(material);
    this.playerSprite.scale.set(0.66, 0.8, 1);
    this.playerSprite.position.y = 0.56;
    this.playerSprite.renderOrder = 5;
    this.player.add(this.playerSprite);
    this.label("Anbo", 0, 1.15, 0, 0.65, this.player);
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

  private resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height || (width === this.width && height === this.height))
      return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
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
    this.player.position.set(game.player.x - 4, 0, game.player.y - 2);
    this.playerSprite.visible =
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
    this.renderer.render(this.scene, this.camera);
  }

  diagnostics() {
    return {
      renderer: "three.js",
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
    this.renderer.dispose();
    this.entities.clear();
  }
}
