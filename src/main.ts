import './theme.css';
import * as THREE from 'three';
import { GameEngine } from './engine/GameEngine';
import { Level } from './level/Level';
import { Input } from './player/Input';
import { Player } from './player/Player';
import { ResourceManager } from './resource/ResourceManager';
import { Hud } from './ui/Hud';
import { Sfx } from './audio/Sfx';
import { Particles } from './skills/Particles';
import { SkillInput } from './skills/SkillInput';
import { TunnelingSkill } from './skills/TunnelingSkill';
import { AnnihilationSkill } from './skills/AnnihilationSkill';
import { EnemyManager } from './enemy/EnemyManager';
import { HealthHud } from './ui/HealthHud';

const engine = new GameEngine(document.getElementById('app')!);
engine.scene.background = new THREE.Color(0x0d0f0a);

const level = new Level(engine.scene);
const input = new Input(engine.renderer.domElement, document.getElementById('hint')!);
const player = new Player(engine.camera, input, level.walls);

const resources = new ResourceManager(engine.scene, player, level.resourceSpawns);
const sfx = new Sfx();
const particles = new Particles(engine.scene);
const tunnelInput = new SkillInput(input.isTouch, { code: 'KeyE', id: 'skill-tunnel', label: '터널링<br />⇢|⇢' });
const annihilateInput = new SkillInput(input.isTouch, { code: 'KeyQ', id: 'skill-annihilate', label: 'E=mc²<br />✺' });
const tunneling = new TunnelingSkill(player, level.walls, tunnelInput, particles, sfx);
const annihilation = new AnnihilationSkill(engine.scene, player, level, annihilateInput, particles);
const enemies = new EnemyManager(engine.scene, player, level, level.enemySpawns, particles, sfx);
// 폭발은 적에게 피해와 소음을 준다: 제압은 빠르지만 시끄럽다(설계 원칙).
annihilation.onBlast.push((b) => enemies.onBlast(b));
const hud = new Hud(player, resources, tunneling, annihilation, input.isTouch);

engine.addUpdatable(player);
engine.addUpdatable(resources);
engine.addUpdatable(tunneling);
engine.addUpdatable(annihilation);
engine.addUpdatable(enemies);
engine.addUpdatable(particles);
engine.addRenderable(player);
engine.addRenderable(resources);
engine.addRenderable(enemies);
engine.addRenderable(hud);
engine.addRenderable(new HealthHud(player, enemies));
engine.start();

// 개발 중 콘솔/자동 테스트에서 상태를 들여다보기 위한 훅. 프로덕션 빌드에서는 트리셰이킹으로 제거된다.
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { engine, level, player, input, resources, tunneling, annihilation, enemies };
}
