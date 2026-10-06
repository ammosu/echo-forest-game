import { tr } from "./i18n";
export type PlantKind = "shooter" | "wall" | "ice";
export type Phase = "ready" | "build" | "wave" | "won" | "lost";
/** Short-lived touch feedback for the view: a shot landing, a defeat, Anbo hit, a log broken. */
export type SparkKind = "hit" | "ice" | "defeat" | "hurt" | "log";
export const sparkLife: Record<SparkKind, number> = { hit: 0.3, ice: 0.3, defeat: 0.5, hurt: 0.5, log: 0.5 };
export const seeds = {
  shooter: { name: tr("松果射手", "Cone Shooter"), cost: 40, hp: 100 },
  wall: { name: tr("樹樁守衛", "Stump Guard"), cost: 25, hp: 260 },
  ice: { name: tr("冰霧蘑菇", "Frost Mushroom"), cost: 50, hp: 90 },
};
/** Every tuning number in one place; tests/defense-balance.spec.ts plays bot strategies against it. */
export const balance = {
  startDew: 150,
  income: { every: 5, amount: 10 },
  killReward: [3, 2, 8],
  logReward: 25,
  waveBonus: 30,
  /** Enemies per wave and seconds between spawns. */
  waveSize: [10, 14, 18, 22, 26],
  spawnGap: [1.7, 1.45, 1.25, 1.1, 0.95],
  /** Enemy HP grows each wave: hp × (1 + hpGrowth × (wave − 1)). */
  enemyHp: [75, 50, 200],
  hpGrowth: 0.9,
  /** Share of each wave sent down its two focus lanes. */
  focusShare: 0.7,
  bombDamage: 90,
};
/** The two lanes a wave leans on; the build-phase message warns the player about them. */
export const focusLanes = (wave: number) => [(wave * 2 + 1) % 5, (wave * 2 + 3) % 5];
export class DefenseEngine {
  phase: Phase = "ready";
  paused = false;
  wave = 0;
  timer = 12;
  elapsed = 0;
  resources = balance.startDew;
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
  message = tr(
    `先種射手，再用炸彈守住缺口。第 1 波集中在第 ${focusLanes(1).map((y) => y + 1).sort().join("、")} 行！`,
    `Plant shooters first, then use bombs to plug the gaps. Wave 1 targets rows ${focusLanes(1).map((y) => y + 1).sort().join(" and ")}!`,
  );
  start() {
    Object.assign(this, new DefenseEngine());
    this.phase = "build";
  }
  get active() {
    return !this.paused && (this.phase === "build" || this.phase === "wave");
  }
  /** `pace` is the delay before the next step; the touch stick walks slower on a light push. */
  move(dx: number, dy: number, pace = 0.15) {
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
    this.moveCooldown = pace;
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
      this.message = tr("最右側是怪物入口，請種在草地上。", "The far right is the monster entrance. Plant on the grass.");
      return false;
    }
    if (
      [...this.plants, ...this.logs, ...this.bombs].some(
        (p) => p.x === x && p.y === y,
      )
    ) {
      this.message = tr("這格已被占用。", "That spot is already taken.");
      return false;
    }
    if (this.resources < seeds[kind].cost) {
      this.message = tr("露珠不足，等待補給或擊退怪物。", "Not enough dew. Wait for more or defeat monsters.");
      return false;
    }
    this.resources -= seeds[kind].cost;
    this.plants.push({ x, y, kind, hp: seeds[kind].hp, cooldown: 0.3 });
    this.message = tr(`${seeds[kind].name}已種下；角色可穿過植物。`, `${seeds[kind].name} planted! You can walk through plants.`);
    return true;
  }
  bomb() {
    if (!this.active) return;
    if (this.bombs.length >= 3) {
      this.message = tr("最多同時放三顆炸彈。", "You can place at most three bombs at once.");
      return;
    }
    const { x, y } = this.player;
    if (this.bombs.some((b) => b.x === x && b.y === y)) return;
    this.bombs.push({ x, y, fuse: 2 });
    this.message = tr("兩秒後爆炸！十字兩格，快離開爆風。", "Boom in two seconds! The blast reaches two tiles in a cross. Get clear!");
  }
  nextWave() {
    if (this.phase !== "build" || this.paused) return;
    this.wave++;
    this.phase = "wave";
    this.remaining = balance.waveSize[this.wave - 1];
    this.spawn = 1;
    this.message = tr(`第 ${this.wave} 波來襲！守住生命樹。`, `Wave ${this.wave} incoming! Protect the Life Tree.`);
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
          this.resources += balance.logReward;
          this.score += 30;
          break;
        }
      }
    for (const cell of cells) {
      this.flames.push({ ...cell, life: 0.45 });
      for (const e of this.enemies)
        if (Math.abs(e.x - cell.x) < 0.65 && e.y === cell.y) {
          e.hp -= balance.bombDamage;
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
    if (this.income >= balance.income.every) {
      this.income -= balance.income.every;
      this.resources += balance.income.amount;
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
      this.message = tr("被爆風擊中了！閃爍時暫時無敵。", "Hit by the blast! You can\'t be hurt while blinking.");
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
        const hp = Math.round(
          balance.enemyHp[kind] * (1 + balance.hpGrowth * (this.wave - 1)),
        );
        const focus = focusLanes(this.wave);
        // Deterministic spread: most spawns hit the focus lanes, the rest cycle through all five.
        const y =
          (n * 7) % 10 < balance.focusShare * 10
            ? focus[n % 2]
            : (n * 3 + this.wave) % 5;
        this.enemies.push({
          x: 8.7,
          y,
          kind,
          hp,
          maxHp: hp,
          slow: 0,
          attack: 0,
          hit: 0,
        });
        this.remaining--;
        this.spawn = balance.spawnGap[this.wave - 1];
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
        this.message = tr("怪物突破防線，生命樹受傷了！", "A monster broke through and hurt the Life Tree!");
      }
    }
    this.plants = this.plants.filter((p) => p.hp > 0);
    this.enemies = this.enemies.filter((e) => {
      if (e.hp > 0) return true;
      if (e.hp > -999) {
        this.spark(e.x, e.y, "defeat");
        this.kills++;
        this.resources += balance.killReward[e.kind];
        this.score += [100, 150, 250][e.kind];
      }
      return false;
    });
    if (this.tree <= 0 || this.hearts <= 0) {
      this.phase = "lost";
      this.message =
        this.hearts <= 0
          ? tr("安寶耗盡體力，下次記得躲開十字爆風。", "Anbo is out of energy. Next time, dodge the cross-shaped blasts.")
          : tr("生命樹失守了，試著替每一行安排射手。", "The Life Tree fell. Try putting a shooter in every row.");
    } else if (
      this.phase === "wave" &&
      this.remaining === 0 &&
      this.enemies.length === 0
    ) {
      if (this.wave === 5) {
        this.phase = "won";
        this.score += this.tree * 100 + this.hearts * 200;
        this.message = tr("五波全數擊退，森林平安了！", "All five waves beaten. The forest is safe!");
      } else {
        this.phase = "build";
        this.timer = this.wave < 2 ? 10 : this.wave < 4 ? 8 : 6;
        this.resources += balance.waveBonus;
        const [a, b] = focusLanes(this.wave + 1).map((y) => y + 1).sort();
        this.message = tr(
          `守住了！獲得 ${balance.waveBonus} 露珠。下一波集中在第 ${a}、${b} 行！`,
          `Wave cleared! +${balance.waveBonus} dew. Next wave targets rows ${a} and ${b}!`,
        );
      }
    }
  }
}
