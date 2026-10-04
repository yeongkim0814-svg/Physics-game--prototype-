import * as THREE from 'three';
import { RetroPipeline } from '../render/retro';

export interface Updatable {
  /** 고정 간격(FIXED_DT)으로 호출. 게임 로직 전용. */
  update(dt: number): void;
}

export interface Renderable {
  /** 매 프레임 호출. alpha는 직전/현재 로직 상태 사이 보간 비율(0~1). */
  render(alpha: number): void;
}

/**
 * 고정 timestep(60Hz) 로직 + 가변 렌더링.
 * 왜 고정인가: 확률/에너지/충돌 같은 로직이 기기 FPS에 따라 달라지면
 * 터널링 같은 스킬의 밸런스를 맞출 수 없다. 로직은 항상 같은 dt로 돈다.
 */
export class GameEngine {
  static readonly FIXED_DT = 1 / 60;
  // 탭 전환 등으로 dt가 폭주해 "죽음의 나선"(따라잡으려다 더 느려짐)에 빠지는 것을 방지.
  private static readonly MAX_FRAME_TIME = 0.25;

  /** 저해상도 렌더 높이(px). 가로는 화면 비율로 정한다. */
  private static readonly RENDER_HEIGHT = 270;

  readonly renderer: THREE.WebGLRenderer;
  private readonly retro: RetroPipeline;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly updatables: Updatable[] = [];
  private readonly renderables: Renderable[] = [];
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  /**
   * true면 로직 갱신을 멈춘다(시작 안내 화면, 포인터 해제 등). 타이머·적 순찰이 플레이어 모르게 진행되는 것을 막는다.
   * 정지 중에는 몇 프레임만 그리고 멈춰, 모바일 배터리를 아끼고 발열을 줄인다.
   */
  paused: () => boolean = () => false;
  private pausedFrames = 0;
  private dirty = true;

  constructor(container: HTMLElement) {
    // 안티앨리어싱 끔: 저해상도 픽셀 느낌을 일부러 살리고, 모바일 GPU 비용도 줄인다.
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    // 한 프레임에 렌더가 두 번(장면+후처리) 일어나므로 통계가 덮어쓰이지 않게 수동으로 리셋한다(디버그 표시용).
    this.renderer.info.autoReset = false;
    this.retro = new RetroPipeline(this.renderer);
    this.retro.setResolution(GameEngine.RENDER_HEIGHT, window.innerWidth / window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    // 마우스 시점은 yaw → pitch 순서로 적용해야 롤이 생기지 않는다.
    this.camera.rotation.order = 'YXZ';

    window.addEventListener('resize', this.onResize);
    // 모바일은 회전 직후 innerWidth가 늦게 갱신되는 경우가 있어 한 번 더 맞춘다.
    window.addEventListener('orientationchange', () => setTimeout(this.onResize, 200));
  }

  /** DebugStats 등이 현재 렌더 해상도를 읽는다. */
  renderSize(): { width: number; height: number } {
    return { width: this.retro.width, height: this.retro.height };
  }

  addUpdatable(u: Updatable): void {
    this.updatables.push(u);
  }

  addRenderable(r: Renderable): void {
    this.renderables.push(r);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    requestAnimationFrame(this.frame);
  }

  private readonly frame = (nowMs: number): void => {
    if (!this.running) return;
    const now = nowMs / 1000;
    const frameTime = Math.min(now - this.lastTime, GameEngine.MAX_FRAME_TIME);
    this.lastTime = now;

    if (this.paused()) {
      this.accumulator = 0;
      // 정지 직후 몇 프레임(+리사이즈 직후)만 그려 화면을 최신으로 유지하고, 이후엔 렌더를 건너뛴다.
      if (this.pausedFrames >= 3 && !this.dirty) {
        requestAnimationFrame(this.frame);
        return;
      }
      this.pausedFrames++;
    } else {
      this.pausedFrames = 0;
      this.accumulator += frameTime;
      while (this.accumulator >= GameEngine.FIXED_DT) {
        for (const u of this.updatables) u.update(GameEngine.FIXED_DT);
        this.accumulator -= GameEngine.FIXED_DT;
      }
    }
    this.dirty = false;

    const alpha = this.accumulator / GameEngine.FIXED_DT;
    for (const r of this.renderables) r.render(alpha);
    this.renderer.info.reset();
    this.retro.render(this.scene, this.camera, now);
    requestAnimationFrame(this.frame);
  };

  private readonly onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.retro.setResolution(GameEngine.RENDER_HEIGHT, window.innerWidth / window.innerHeight);
    this.dirty = true;
  };
}
