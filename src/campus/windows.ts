import type * as THREE from 'three'

/**
 * Night-time facades: patches a standard material so building walls show a window band per floor
 * (in world space, so it needs no UVs and survives merged geometry), a seeded share of them lit warm.
 * Roofs are left alone.
 */
export function withWindows(mat: THREE.MeshStandardMaterial, floorH: number, litShare = 0.3) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uFloorH = { value: floorH }
    shader.uniforms.uLit = { value: litShare }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNormal;
uniform float uFloorH;
uniform float uLit;
float winHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (abs(vWNormal.y) < 0.5 && vWPos.y > uFloorH * 0.3) {
  vec2 side = normalize(vec2(-vWNormal.z, vWNormal.x));
  float along = dot(vWPos.xz, side);
  float level = floor(vWPos.y / uFloorH), f = fract(vWPos.y / uFloorH);
  float col = floor(along / 3.2), c = fract(along / 3.2);
  float pane = step(0.32, f) * step(f, 0.72) * step(0.18, c) * step(c, 0.82);
  float lit = step(1.0 - uLit, winHash(vec2(level, col) + floor(vWPos.xz / 40.0)));
  diffuseColor.rgb *= 1.0 - pane * 0.55;
  totalEmissiveRadiance += pane * mix(vec3(0.02, 0.03, 0.05), vec3(1.0, 0.72, 0.38) * 0.85, lit);
}`)
  }
  mat.customProgramCacheKey = () => `windows-${floorH}-${litShare}`
  return mat
}
