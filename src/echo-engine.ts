export type EchoPhase = 'ready' | 'listen' | 'answer' | 'retry' | 'between' | 'paused' | 'complete';

/** Pure sequence rules. The UI owns playback timing and cancellation. */
export class EchoGame {
  readonly rounds = 8;
  phase: EchoPhase = 'ready';
  sequence: number[] = [];
  round = 0;
  cursor = 0;
  completed = 0;

  constructor(private random: () => number = Math.random) {}

  start() {
    this.sequence = [this.note()];
    this.round = 0;
    this.completed = 0;
    this.next();
  }

  private note() { return Math.floor(this.random() * 4); }

  next() {
    this.round++;
    this.sequence.push(this.note());
    this.listen();
  }

  listen() { this.cursor = 0; this.phase = 'listen'; }

  answer(index: number): 'ignored' | 'wrong' | 'correct' | 'round' | 'complete' {
    if (this.phase !== 'answer' || index < 0 || index > 3) return 'ignored';
    if (index !== this.sequence[this.cursor]) {
      this.cursor = 0;
      this.phase = 'retry';
      return 'wrong';
    }
    this.cursor++;
    if (this.cursor < this.sequence.length) return 'correct';
    this.completed = this.round;
    this.phase = this.round === this.rounds ? 'complete' : 'between';
    return this.phase === 'complete' ? 'complete' : 'round';
  }
}
