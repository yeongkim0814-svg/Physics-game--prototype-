import * as THREE from 'three';
import { GameEngine } from './engine/GameEngine';

const engine = new GameEngine(document.getElementById('app')!);
engine.scene.background = new THREE.Color(0x15181c);
engine.camera.position.set(0, 1.6, 5);
engine.start();
