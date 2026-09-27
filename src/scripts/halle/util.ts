/* ------------------------------------------------------------------ */
/* Small shared helpers: deterministic RNG, canvas textures, geometry  */
/* merge batches. Everything in the hall is procedural — no assets.    */
/* ------------------------------------------------------------------ */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* mulberry32 — deterministic so every visitor builds the same hall */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { srgb?: boolean; repeat?: [number, number]; aniso?: number } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  if (opts.aniso) tex.anisotropy = opts.aniso;
  return tex;
}

/* batching helper: collect transformed geometries, merge to one mesh */
export class GeoBatch {
  private geos: THREE.BufferGeometry[] = [];
  box(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.geos.push(g);
    return this;
  }
  cyl(
    rTop: number,
    rBot: number,
    h: number,
    seg: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    rz = 0,
  ): this {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    this.geos.push(g);
    return this;
  }
  add(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0): this {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.geos.push(g);
    return this;
  }
  merge(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.geos, false)!;
    for (const g of this.geos) g.dispose();
    this.geos = [];
    return merged;
  }
  mesh(mat: THREE.Material, castShadow = false, receiveShadow = false): THREE.Mesh {
    const m = new THREE.Mesh(this.merge(), mat);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    return m;
  }
}

export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
