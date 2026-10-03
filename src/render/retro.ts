import * as THREE from 'three';
import { snapUniforms } from './snap';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uTime;
varying vec2 vUv;

float linearDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, uNear, uFar);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// 4x4 바이어 행렬(0~15). 양자화 전에 더해 색 띠(banding)를 격자 무늬로 흩뿌린다.
const float BAYER[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  return (BAYER[i.y * 4 + i.x] + 0.5) / 16.0;
}

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;

  // 1) 깊이 윤곽선: 이웃 픽셀과 "상대" 깊이 차이가 크면 경계로 본다(원근에 따른 깊이 기울기에 속지 않도록 상대값).
  vec2 px = 1.0 / uRes;
  float dc = linearDepth(vUv);
  float m = 0.0;
  m = max(m, abs(linearDepth(vUv + vec2(px.x, 0.0)) - dc));
  m = max(m, abs(linearDepth(vUv - vec2(px.x, 0.0)) - dc));
  m = max(m, abs(linearDepth(vUv + vec2(0.0, px.y)) - dc));
  m = max(m, abs(linearDepth(vUv - vec2(0.0, px.y)) - dc));
  float edge = smoothstep(0.09, 0.22, m / max(dc, 0.001));
  col *= 1.0 - 0.62 * edge;

  // 2) 색 보정: 탁한 채도, 약간 높은 대비, 올리브 노랑 색조, 완전한 검정 방지
  col = linearToOutputTexel(vec4(col, 1.0)).rgb;
  float lightness = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lightness), col, 0.62);
  col = (col - 0.5) * 1.14 + 0.5;
  col *= vec3(1.0, 0.985, 0.8);
  col = max(col, vec3(0.032, 0.036, 0.022));

  // 3) 비네팅
  vec2 d = vUv - 0.5;
  col *= 1.0 - dot(d, d) * 1.6;

  // 4) CRT: 프레임마다 바뀌는 그레인 + 약한 주사선
  float grain = hash12(floor(gl_FragCoord.xy) + floor(uTime * 12.0));
  col += (grain - 0.5) * 0.03;
  col *= 1.0 - step(0.5, fract(gl_FragCoord.y * 0.5)) * 0.05;

  // 5) 채널당 20단계 양자화 + 디더링
  float b = bayer4(gl_FragCoord.xy) - 0.5;
  col = floor(col * 20.0 + b + 0.5) / 20.0;

  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * 장면을 저해상도 렌더 타겟(색+깊이)에 그린 뒤, 후처리 셰이더로 화면(같은 저해상도 캔버스)에 옮긴다.
 * 캔버스는 CSS로 확대(image-rendering: pixelated)되어 큼직한 픽셀로 보인다.
 * 저해상도는 미관뿐 아니라 모바일 GPU의 픽셀 처리량을 크게 줄여 주는 성능 이점도 있다.
 */
export class RetroPipeline {
  width = 480;
  height = 270;

  private target: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.target = this.makeTarget();
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        uRes: { value: new THREE.Vector2(this.width, this.height) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  private makeTarget(): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    t.depthTexture = new THREE.DepthTexture(this.width, this.height);
    return t;
  }

  setResolution(height: number, aspect: number): void {
    this.height = Math.round(height);
    this.width = Math.round(height * aspect);
    this.renderer.setPixelRatio(1);
    // updateStyle=false: 캔버스 CSS 크기는 스타일시트(100%)가 맡아 확대 표시한다.
    this.renderer.setSize(this.width, this.height, false);
    this.target.setSize(this.width, this.height);
    this.material.uniforms.uRes.value.set(this.width, this.height);
    // 스냅 격자는 렌더 해상도의 절반: 한 칸이 2픽셀이라 지터가 눈에 보일 만큼 굵다.
    snapUniforms.uSnap.value.set(this.width / 2, this.height / 2);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, timeSec: number): void {
    this.material.uniforms.uNear.value = camera.near;
    this.material.uniforms.uFar.value = camera.far;
    this.material.uniforms.uTime.value = timeSec;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }
}
