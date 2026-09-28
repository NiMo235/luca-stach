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
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  readonly dpr: number;
  setDpr(d: number): void;
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  /* the hall is static in T-101: render the shadow map once after the
     build (index.ts sets needsUpdate), not per frame */
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(COL.night, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COL.night, 0.0062);

  /* PMREM from a procedural room — reflections without any HDR asset */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.26;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 320);
  camera.position.set(-38, 5.4, 25.5);

  /* ---- lighting rig: one shadow-casting "moon through skylights"
     key light, a faint cool fill, and local work lights (details.ts) ---- */
  const hemi = new THREE.HemisphereLight(0x24303e, 0x11150f, 0.5);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xa8bce0, 2.0);
  moon.position.set(14, 70, 20);
  moon.target.position.set(-4, 0, -6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -80;
  moon.shadow.camera.right = 80;
  moon.shadow.camera.top = 65;
  moon.shadow.camera.bottom = -65;
  moon.shadow.camera.near = 20;
  /* T-105: shift presets move the key light low over the corners
     (morning sun, late sun) — the far plane must reach across the
     diagonal of the hall from there */
  moon.shadow.camera.far = 220;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  scene.add(moon, moon.target);

  /* T-106: dpr is the main quality lever — index.ts steps it down on
     slow GPUs (adaptive quality), resize() re-applies it */
  let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const resize = () => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    hemi,
    moon,
    get dpr() {
      return dpr;
    },
    setDpr(d: number) {
      dpr = Math.min(d, window.devicePixelRatio || 1);
      resize();
    },
    dispose() {
      window.removeEventListener('resize', resize);
    },
  };
}
