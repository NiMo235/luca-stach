/* ------------------------------------------------------------------ */
/* Scene shell: renderer (ACES, sRGB, soft shadows, capped dpr), PMREM */
/* environment, night lighting rig, fog, camera, resize handling.      */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COL } from './layout';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(COL.night, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COL.night, 0.0072);

  /* PMREM from a procedural room — reflections without any HDR asset */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.16;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 320);
  camera.position.set(-38, 5.4, 25.5);

  /* ---- lighting rig: one shadow-casting "moon through skylights"
     key light, a faint cool fill, and a few local work lights ---- */
  const hemi = new THREE.HemisphereLight(0x18222e, 0x0a0d0a, 0.28);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0x9db4dd, 1.2);
  moon.position.set(14, 70, 20);
  moon.target.position.set(-4, 0, -6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -80;
  moon.shadow.camera.right = 80;
  moon.shadow.camera.top = 65;
  moon.shadow.camera.bottom = -65;
  moon.shadow.camera.near = 20;
  moon.shadow.camera.far = 130;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  scene.add(moon, moon.target);

  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const resize = () => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return { renderer, scene, camera };
}
