export type CatchPhase = 'ready' | 'playing' | 'paused' | 'complete';
export type FallingNote = { id: number; lane: number; at: number; kind: 'note' | 'noise'; pitch: number; settled: boolean };
export type CatchEvent = { kind: 'catch' | 'miss' | 'noise' | 'complete'; lane: number; pitch: number };

/** Original three-phrase chart. Times are arrival times at the catch line. */
export function createChart(): FallingNote[] {
  const melody = [0, 2, 4, 2, 5, 4, 2, 1, 0, 1, 2, 4, 2, 1, 0, 4];
  const routes = [
    [1, 1, 2, 2, 3, 2, 1, 0, 0, 1, 2, 3, 2, 1, 0, 1],
    [2, 0, 2, 3, 1, 0, 2, 1, 3, 1, 0, 2, 3, 1, 2, 0],
    [1, 3, 0, 2, 1, 3, 1, 0, 3, 2, 0, 2, 3, 0, 1, 3],
  ];
  const notes: FallingNote[] = [];
  for (let phrase = 0; phrase < 3; phrase++) {
    const count = [12, 16, 20][phrase];
    const beat = [1, .8, .65][phrase];
    for (let n = 0; n < count; n++) {
      const lane = routes[phrase][n % 16];
      const at = phrase * 16 + 3 + n * beat;
      notes.push({ id: notes.length, lane, at, kind: 'note', pitch: melody[n % 16], settled: false });
      // Later phrases put decoys next to the target; all routes allow full-width travel.
      if (n % (phrase === 0 ? 4 : 2) === (phrase === 0 ? 3 : 1)) notes.push({ id: notes.length, lane: (lane + (phrase === 0 ? 2 : 1)) % 4, at, kind: 'noise', pitch: 0, settled: false });
    }
  }
  return notes.sort((a, b) => a.at - b.at || a.id - b.id);
}

export class CatchGame {
  readonly duration = 48;
  readonly fallTime = 2.8;
  phase: CatchPhase = 'ready';
  chart = createChart();
  time = 0;
  x = 1.5;
  target = 1.5;
  direction = 0;
  score = 0;
  caught = 0;
  missed = 0;
  noises = 0;
  combo = 0;
  maxCombo = 0;
  get total() { return this.chart.filter(n => n.kind === 'note').length; }
  get phrase() { return Math.min(2, Math.floor(this.time / 16)); }
  get stars() { return this.caught >= 44 && this.noises <= 1 ? 3 : this.caught >= 28 ? 2 : this.caught >= 12 ? 1 : 0; }

  start() {
    this.chart = createChart(); this.time = 0; this.x = this.target = 1.5;
    this.direction = this.score = this.caught = this.missed = this.noises = this.combo = this.maxCombo = 0;
    this.phase = 'playing';
  }
  moveTo(x: number) { if (this.phase === 'playing' && Number.isFinite(x)) this.target = Math.max(0, Math.min(3, x)); }
  release() { this.direction = 0; this.target = this.x; }
  pause() { if (this.phase === 'playing') { this.phase = 'paused'; this.release(); } }
  resume() { if (this.phase === 'paused') this.phase = 'playing'; }

  /** Fixed small substeps preserve catch-line crossing even at low rendering rates. */
  update(dt: number): CatchEvent[] {
    if (this.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return [];
    const events: CatchEvent[] = [];
    let remaining = Math.min(dt, .1);
    while (remaining > .000001) {
      const step = Math.min(remaining, 1 / 120); remaining -= step;
      this.time = Math.min(this.duration, this.time + step);
      if (this.direction) this.target = Math.max(0, Math.min(3, this.x + this.direction * 5 * step));
      const delta = this.target - this.x;
      this.x += Math.sign(delta) * Math.min(Math.abs(delta), 7 * step);
      for (const note of this.chart) {
        if (note.settled || note.at > this.time) continue;
        note.settled = true;
        if (Math.abs(this.x - note.lane) <= .40) {
          if (note.kind === 'note') {
            this.caught++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.score += 100 + Math.min(10, this.combo - 1) * 10;
            events.push({ kind: 'catch', lane: note.lane, pitch: note.pitch });
          } else {
            this.noises++; this.combo = 0; this.score = Math.max(0, this.score - 50);
            events.push({ kind: 'noise', lane: note.lane, pitch: 0 });
          }
        } else if (note.kind === 'note') {
          this.missed++; this.combo = 0;
          events.push({ kind: 'miss', lane: note.lane, pitch: note.pitch });
        }
      }
      if (this.time >= this.duration) {
        this.phase = 'complete'; this.release(); events.push({ kind: 'complete', lane: 0, pitch: 0 }); break;
      }
    }
    return events;
  }

  snapshot() {
    return { phase: this.phase, time: this.time, x: this.x, score: this.score, caught: this.caught, missed: this.missed,
      noises: this.noises, combo: this.combo, maxCombo: this.maxCombo, total: this.total, stars: this.stars,
      upcoming: this.chart.filter(n => !n.settled && n.at - this.time <= this.fallTime).map(n => ({ ...n })) };
  }
}
