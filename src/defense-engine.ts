export type PlantKind = "shooter" | "wall" | "ice";
export type Phase = "ready" | "build" | "wave" | "won" | "lost";
/** Short-lived touch feedback for the view: a shot landing, a defeat, Anbo hit, a log broken. */
export type SparkKind = "hit" | "ice" | "defeat" | "hurt" | "log";
export const sparkLife: Record<SparkKind, number> = { hit: 0.3, ice: 0.3, defeat: 0.5, hurt: 0.5, log: 0.5 };
export const seeds = {
  shooter: { name: "松果射手", cost: 40, hp: 100 },
  wall: { name: "樹樁守衛", cost: 25, hp: 260 },
  ice: { name: "冰霧蘑菇", cost: 50, hp: 90 },
};
export class DefenseEngine {
  phase: Phase = "ready";
  paused = false;
  wave = 0;
  timer = 12;
  elapsed = 0;
  resources = 180;
  tree = 10;
  hearts = 3;
  score = 0;
  kills = 0;
  chains = 0;
  player = { x: 2, y: 2, invincible: 0 };
  moveCooldown = 0;
  income = 0;
  spawn = 0;
  remaining = 0;
  plants: {
    x: number;
    y: number;
    kind: PlantKind;
    hp: number;
    cooldown: number;
  }[] = [];
  enemies: {
    x: number;
    y: number;
    kind: number;
    hp: number;
    maxHp: number;
    slow: number;
    attack: number;
    hit: number;
  }[] = [];
  /** `power` > 1 is set by the page for streaks and chains to make the burst bigger. */
  sparks: { x: number; y: number; kind: SparkKind; life: number; power?: number }[] = [];
  bombs: { x: number; y: number; fuse: number }[] = [];
  flames: { x: number; y: number; life: number }[] = [];
  shots: { x: number; y: number; kind: PlantKind }[] = [];
  logs = [
    { x: 4, y: 0 },
    { x: 5, y: 1 },
    { x: 4, y: 3 },
    { x: 5, y: 4 },
    { x: 6, y: 2 },
  ];
  message = "先種射手，再用炸彈守住缺口。";
  start() {
    Object.assign(this, new DefenseEngine());
    this.phase = "build";
  }
  get active() {
    return !this.paused && (this.phase === "build" || this.phase === "wave");
  }
  move(dx: number, dy: number) {
    if (!this.active || this.moveCooldown > 0) return;
    const x = this.player.x + dx,
      y = this.player.y + dy;
    if (
      x < 0 ||
      x > 8 ||
      y < 0 ||
      y > 4 ||
      this.logs.some((p) => p.x === x && p.y === y) ||
      this.bombs.some((p) => p.x === x && p.y === y)
    )
      return;
    this.player.x = x;
    this.player.y = y;
    this.moveCooldown = 0.15;
  }
  plant(x: number, y: number, kind: PlantKind) {
    if (!this.active) return false;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x > 7 ||
      y < 0 ||
      y > 4
    ) {
      this.message = "最右側是怪物入口，請種在草地上。";
      return false;
    }
    if (
      [...this.plants, ...this.logs, ...this.bombs].some(
        (p) => p.x === x && p.y === y,
      )
    ) {
      this.message = "這格已被占用。";
      return false;
    }
    if (this.resources < seeds[kind].cost) {
      this.message = "露珠不足，等待補給或擊退怪物。";
      return false;
    }
    this.resources -= seeds[kind].cost;
    this.plants.push({ x, y, kind, hp: seeds[kind].hp, cooldown: 0.3 });
    this.message = `${seeds[kind].name}已種下；角色可穿過植物。`;
    return true;
  }
  bomb() {
    if (!this.active) return;
    if (this.bombs.length >= 3) {
      this.message = "最多同時放三顆炸彈。";
      return;
    }
    const { x, y } = this.player;
    if (this.bombs.some((b) => b.x === x && b.y === y)) return;
    this.bombs.push({ x, y, fuse: 2 });
    this.message = "兩秒後爆炸！十字兩格，快離開爆風。";
  }
  nextWave() {
    if (this.phase !== "build" || this.paused) return;
    this.wave++;
    this.phase = "wave";
    this.remaining = 7 + this.wave * 2;
    this.spawn = 1;
    this.message = `第 ${this.wave} 波來襲！守住生命樹。`;
  }
  private spark(x: number, y: number, kind: SparkKind) {
    this.sparks.push({ x, y, kind, life: sparkLife[kind] });
  }
  explode(b: { x: number; y: number; fuse: number }) {
    if (!this.bombs.includes(b)) return;
    this.bombs.splice(this.bombs.indexOf(b), 1);
    const cells = [{ x: b.x, y: b.y }];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      for (let i = 1; i <= 2; i++) {
        const x = b.x + dx * i,
          y = b.y + dy * i;
        if (x < 0 || x > 8 || y < 0 || y > 4) break;
        cells.push({ x, y });
        const log = this.logs.find((p) => p.x === x && p.y === y);
        if (log) {
          this.logs.splice(this.logs.indexOf(log), 1);
          this.spark(x, y, "log");
          this.resources += 20;
          this.score += 30;
          break;
        }
      }
    for (const cell of cells) {
      this.flames.push({ ...cell, life: 0.45 });
      for (const e of this.enemies)
        if (Math.abs(e.x - cell.x) < 0.65 && e.y === cell.y) {
          e.hp -= 130;
          e.hit = 0.15;
        }
      const linked = this.bombs.find((p) => p.x === cell.x && p.y === cell.y);
      if (linked) {
        this.chains++;
        this.explode(linked);
      }
    }
  }
  update(dt: number) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.moveCooldown -= dt;
    this.player.invincible -= dt;
    this.income += dt;
    if (this.income >= 3) {
      this.income -= 3;
      this.resources += 15;
    }
    this.flames.forEach((f) => (f.life -= dt));
    this.flames = this.flames.filter((f) => f.life > 0);
    this.sparks.forEach((f) => (f.life -= dt));
    this.sparks = this.sparks.filter((f) => f.life > 0);
    for (const b of [...this.bombs]) {
      b.fuse -= dt;
      if (b.fuse <= 0) this.explode(b);
    }
    if (
      this.player.invincible <= 0 &&
      this.flames.some((f) => f.x === this.player.x && f.y === this.player.y)
    ) {
      this.hearts--;
      this.spark(this.player.x, this.player.y, "hurt");
      this.player.invincible = 2;
      this.message = "被爆風擊中了！閃爍時暫時無敵。";
    }
    if (this.phase === "build") {
      this.timer -= dt;
      if (this.timer <= 0) this.nextWave();
    }
    if (this.phase === "wave") {
      this.spawn -= dt;
      if (this.remaining > 0 && this.spawn <= 0) {
        const n = this.remaining,
          kind =
            this.wave >= 3 && n % (this.wave >= 4 ? 3 : 4) === 0
              ? 2
              : this.wave >= 2 && n % (this.wave >= 4 ? 2 : 3) === 0
                ? 1
                : 0;
        const hp = [75, 50, 200][kind];
        this.enemies.push({
          x: 8.7,
          y: (n * 3 + this.wave) % 5,
          kind,
          hp,
          maxHp: hp,
          slow: 0,
          attack: 0,
          hit: 0,
        });
        this.remaining--;
        this.spawn = [1.9, 1.9, 1.75, 1.6, 1.45][this.wave - 1];
      }
    }
    for (const p of this.plants) {
      p.cooldown -= dt;
      if (
        p.kind !== "wall" &&
        p.cooldown <= 0 &&
        this.enemies.some((e) => e.y === p.y && e.x > p.x && e.hp > 0)
      ) {
        this.shots.push({ x: p.x + 0.3, y: p.y, kind: p.kind });
        p.cooldown = p.kind === "ice" ? 1.7 : 1.05;
      }
    }
    this.shots = this.shots.filter((s) => {
      s.x += dt * 6;
      const hit = this.enemies.find(
        (e) => e.hp > 0 && e.y === s.y && Math.abs(e.x - s.x) < 0.35,
      );
      if (hit) {
        hit.hp -= s.kind === "ice" ? 12 : 26;
        hit.hit = 0.15;
        this.spark(hit.x, hit.y, s.kind === "ice" ? "ice" : "hit");
        if (s.kind === "ice") hit.slow = 3;
        return false;
      }
      return s.x < 9;
    });
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.slow -= dt;
      e.hit = Math.max(0, e.hit - dt);
      e.attack -= dt;
      const p = this.plants.find(
        (p) => p.y === e.y && e.x >= p.x - 0.2 && e.x - p.x < 0.65,
      );
      if (p) {
        if (e.attack <= 0) {
          p.hp -= e.kind === 2 ? 35 : 18;
          e.attack = 0.8;
        }
      } else e.x -= dt * [0.34, 0.6, 0.24][e.kind] * (e.slow > 0 ? 0.45 : 1);
      if (e.x < -0.5) {
        this.tree -= e.kind === 2 ? 2 : 1;
        e.hp = -999;
        this.message = "怪物突破防線，生命樹受傷了！";
      }
    }
    this.plants = this.plants.filter((p) => p.hp > 0);
    this.enemies = this.enemies.filter((e) => {
      if (e.hp > 0) return true;
      if (e.hp > -999) {
        this.spark(e.x, e.y, "defeat");
        this.kills++;
        this.resources += 12;
        this.score += [100, 150, 250][e.kind];
      }
      return false;
    });
    if (this.tree <= 0 || this.hearts <= 0) {
      this.phase = "lost";
      this.message =
        this.hearts <= 0
          ? "Anbo 耗盡體力，下次記得躲開十字爆風。"
          : "生命樹失守了，試著替每一行安排射手。";
    } else if (
      this.phase === "wave" &&
      this.remaining === 0 &&
      this.enemies.length === 0
    ) {
      if (this.wave === 5) {
        this.phase = "won";
        this.score += this.tree * 100 + this.hearts * 200;
        this.message = "五波全數擊退，森林平安了！";
      } else {
        this.phase = "build";
        this.timer = this.wave < 2 ? 10 : this.wave < 4 ? 8 : 6;
        this.resources += 65;
        this.message = "守住了！獲得 65 露珠，補好防線迎接下一波。";
      }
    }
  }
}
