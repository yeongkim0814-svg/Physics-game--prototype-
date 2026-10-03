/**
 * 외부 음원 없이 WebAudio 사인/톱니파만으로 만든 효과음.
 * AudioContext는 사용자 제스처 이후에만 소리가 나므로, 첫 재생 시점(키/터치 직후)에 만든다.
 */
export class Sfx {
  private ctx: AudioContext | null = null;

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    try {
      this.ctx ??= new AudioContext();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
      // 클릭 노이즈를 막기 위해 즉시 켜고 끄지 않고 지수 감쇠로 끝낸다.
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch {
      // 오디오 미지원/차단 환경에서도 게임은 계속되어야 한다.
    }
  }

  /** 통과 성공: 올라가는 음(열리는 느낌). */
  success(): void {
    this.tone(400, 1200, 0.3, 'sine', 0.18);
  }

  /** 반사 실패: 내려가는 거친 음(튕겨 나가는 느낌). */
  fail(): void {
    this.tone(280, 70, 0.35, 'sawtooth', 0.12);
  }

  /** 불가(에너지 부족/막힘): 짧은 낮은 비프. */
  deny(): void {
    this.tone(170, 150, 0.1, 'square', 0.07);
  }

  pickup(): void {
    this.tone(700, 1000, 0.1, 'sine', 0.1);
  }

  /** 적에게 발각: 짧은 두 번의 높은 비프(경보). */
  alert(): void {
    this.tone(900, 900, 0.07, 'square', 0.07);
    setTimeout(() => this.tone(1200, 1200, 0.09, 'square', 0.07), 90);
  }

  /** 피격: 낮고 거친 타격음. */
  hurt(): void {
    this.tone(160, 50, 0.25, 'sawtooth', 0.16);
  }

  /** 적 격파: 에너지가 빠지는 하강음. */
  kill(): void {
    this.tone(500, 80, 0.3, 'triangle', 0.14);
  }
}
