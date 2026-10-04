import * as THREE from 'three';
import type { Renderable } from '../engine/GameEngine';

const CSS = `
#debug-stats { position: fixed; left: max(8px, env(safe-area-inset-left)); bottom: 8px; z-index: 5; pointer-events: none;
  font: 11px ui-monospace; color: #7fbf6a; background: rgba(13, 15, 10, 0.7);
  padding: 4px 6px; white-space: pre; }
`;

/** 왜 디버그 통계가 필요한가: 성능 최적화 때 실시간 피드백이 필요하다. */
export class DebugStats implements Renderable {
  private readonly element: HTMLElement | null = null;
  private frameCount = 0;
  private lastUpdateTime = 0;
  private lastFps = 0;
  private readonly UPDATE_INTERVAL = 0.5; // 0.5초마다 업데이트

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly retroInfo: () => { width: number; height: number },
  ) {
    // ?debug 파라미터가 있을 때만 활성화
    const hasDebugParam = new URLSearchParams(location.search).has('debug');
    if (!hasDebugParam) {
      this.element = null;
      return;
    }

    // 스타일 주입
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // 디버그 통계 DOM 생성
    this.element = document.createElement('div');
    this.element.id = 'debug-stats';
    document.body.appendChild(this.element);

    this.lastUpdateTime = performance.now() / 1000;
  }

  render(_alpha: number): void {
    // 디버그 모드가 비활성화되면 아무것도 하지 않음
    if (!this.element) {
      return;
    }

    const now = performance.now() / 1000;
    this.frameCount++;

    // UPDATE_INTERVAL 마다 통계 업데이트
    if (now - this.lastUpdateTime >= this.UPDATE_INTERVAL) {
      const elapsed = now - this.lastUpdateTime;
      this.lastFps = Math.round(this.frameCount / elapsed);
      const msPerFrame = (elapsed / this.frameCount) * 1000;

      const info = this.renderer.info;
      const retroSize = this.retroInfo();

      const text = [
        `FPS: ${this.lastFps}`,
        `${msPerFrame.toFixed(2)}ms/frame`,
        `Calls: ${info.render.calls}`,
        `Triangles: ${info.render.triangles}`,
        `Geometries: ${info.memory.geometries}`,
        `Textures: ${info.memory.textures}`,
        `${retroSize.width}x${retroSize.height}`,
      ].join('\n');

      this.element.textContent = text;

      this.frameCount = 0;
      this.lastUpdateTime = now;
    }
  }
}
