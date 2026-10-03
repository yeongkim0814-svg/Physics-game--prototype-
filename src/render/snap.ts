import * as THREE from 'three';

/** 모든 패치 재질이 공유하는 유니폼. 해상도가 바뀌면 값만 갱신하면 전 재질에 반영된다. */
export const snapUniforms = {
  uSnap: { value: new THREE.Vector2(240, 135) },
  uJitter: { value: 1 },
};

/**
 * PS1식 정점 스냅: 투영된 정점을 저해상도 격자에 맞춰 반올림한다.
 * 정점이 한 픽셀 단위로 "뚝뚝" 움직여 그 시절 특유의 흔들림이 생긴다.
 */
export function patchRetro<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snapUniforms.uSnap;
    shader.uniforms.uJitter = snapUniforms.uJitter;
    shader.vertexShader =
      'uniform vec2 uSnap;\nuniform float uJitter;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        if (uJitter > 0.5 && gl_Position.w > 0.0) {
          vec2 ndc = gl_Position.xy / gl_Position.w;
          ndc = floor(ndc * uSnap + 0.5) / uSnap;
          gl_Position.xy = ndc * gl_Position.w;
        }`,
      );
  };
  // 같은 three 내장 셰이더라도 패치 여부로 프로그램이 달라지므로 캐시 키를 분리한다.
  material.customProgramCacheKey = () => 'retro-snap';
  return material;
}
