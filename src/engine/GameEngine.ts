import * as THREE from 'three';

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

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly updatables: Updatable[] = [];
  private readonly renderables: Renderable[] = [];
  private accumulator = 0;
  private lastTime = 0;
  private running = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // 모바일 GPU는 fill-rate가 병목이라 해상도 배율을 낮게 제한한다.
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    // 마우스 시점은 yaw → pitch 순서로 적용해야 롤이 생기지 않는다.
    this.camera.rotation.order = 'YXZ';

    window.addEventListener('resize', this.onResize);
    // 모바일은 회전 직후 innerWidth가 늦게 갱신되는 경우가 있어 한 번 더 맞춘다.
    window.addEventListener('orientationchange', () => setTimeout(this.onResize, 200));
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

    this.accumulator += frameTime;
    while (this.accumulator >= GameEngine.FIXED_DT) {
      for (const u of this.updatables) u.update(GameEngine.FIXED_DT);
      this.accumulator -= GameEngine.FIXED_DT;
    }

    const alpha = this.accumulator / GameEngine.FIXED_DT;
    for (const r of this.renderables) r.render(alpha);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };

  private readonly onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
