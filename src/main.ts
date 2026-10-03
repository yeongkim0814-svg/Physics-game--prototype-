import * as THREE from 'three';
import { GameEngine } from './engine/GameEngine';
import { Level } from './level/Level';
import { Input } from './player/Input';
import { Player } from './player/Player';

const engine = new GameEngine(document.getElementById('app')!);
engine.scene.background = new THREE.Color(0x15181c);

const level = new Level(engine.scene);
const input = new Input(engine.renderer.domElement, document.getElementById('hint')!);
const player = new Player(engine.camera, input, level.walls);

engine.addUpdatable(player);
engine.addRenderable(player);
engine.start();

// 개발 중 콘솔/자동 테스트에서 상태를 들여다보기 위한 훅. 프로덕션 빌드에서는 트리셰이킹으로 제거된다.
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { engine, level, player, input };
}
