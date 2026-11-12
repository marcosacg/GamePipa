// Renderizador, câmera, céu, luz e dados do terreno (o cenário em si é montado em world.js)
import * as THREE from 'three';
import { clamp, lerp, smooth, noise2 } from './utils.js';
import { mat, smat, mesh } from './materials.js';
export { mat, smat, mesh };

/* ---------------- renderizador ---------------- */
export const renderer = new THREE.WebGLRenderer({ antialias: true });
// celular/tablet: resolução e sombras um pouco mais leves para rodar liso
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe3f5, 140, 700);
export const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);
camera.position.set(0, 4, 32);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b5a3a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

/** etiqueta de nome que sempre aparece por cima */
export function makeLabel(text, color = '#fff8ea', wide = false) {
  const W = wide ? 512 : 256;
  const c = document.createElement('canvas'); c.width = W; c.height = 64;
  const x = c.getContext('2d');
  x.font = '900 30px Nunito, sans-serif';
  const w = Math.min(W - 8, x.measureText(text).width + 28);
  x.fillStyle = 'rgba(20,18,30,.6)';
  x.beginPath(); x.roundRect((W - w) / 2, 10, w, 44, 22); x.fill();
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, W / 2, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, fog: false }));
  sp.scale.set(wide ? .4 : .2, .05, 1);
  sp.renderOrder = 20;
  return sp;
}

/* ---------------- céu ---------------- */
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() } },
  vertexShader: `varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vW;
    void main(){
      vec3 d = normalize(vW);
      float h = max(d.y, 0.0);
      vec3 c = mix(bottom, top, pow(h, 0.5));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      c += sunCol * (pow(s, 6.0) * 0.35 + smoothstep(0.9985, 0.9993, s) * 2.0);
      if (d.y < 0.0) c = bottom;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
  side: THREE.BackSide, depthWrite: false, fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1300, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);

const starGeo = new THREE.BufferGeometry();
{
  const p = [];
  for (let i = 0; i < 900; i++) {
    const th = Math.random() * Math.PI * 2, y = Math.random() * .95 + .05, r = Math.sqrt(1 - y * y);
    p.push(Math.cos(th) * r * 1200, y * 1200, Math.sin(th) * r * 1200);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(stars);

const SKY_KEYS = [ // elevação do sol, topo, horizonte, cor do sol, int. sol, int. hemisfério
  [-10, '#070b24', '#1d1a3a', '#4050a0', 0.06, 0.22],
  [-3,  '#1b2350', '#5a3a6a', '#ff7040', 0.25, 0.40],
  [3,   '#3a4f8f', '#ff8a50', '#ff7a3d', 1.00, 0.70],
  [10,  '#4f7fc0', '#ffc380', '#ffb066', 1.90, 0.95],
  [20,  '#3f86d6', '#cfe6f2', '#fff0d0', 2.60, 1.10],
  [45,  '#3a82d8', '#bfe0f5', '#ffffff', 2.80, 1.15],
].map(k => [k[0], new THREE.Color(k[1]), new THREE.Color(k[2]), new THREE.Color(k[3]), k[4], k[5]]);
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
const _sd = new THREE.Vector3(), MOON = new THREE.Vector3(.3, .8, -.4).normalize(), DOWN = new THREE.Vector3(0, -1, 0);
export let sunElev = 20;
export const lampMats = []; // lâmpadas dos postes (world.js adiciona)

export function updateSky(minutes, focus) {
  const t = clamp((minutes - 960) / 200, 0, 1); // 16:00 → 19:20
  sunElev = lerp(30, -10, t);
  let i = 0; while (i < SKY_KEYS.length - 2 && sunElev > SKY_KEYS[i + 1][0]) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const f = clamp((sunElev - a[0]) / (b[0] - a[0]), 0, 1);
  _c1.lerpColors(a[1], b[1], f); _c2.lerpColors(a[2], b[2], f); _c3.lerpColors(a[3], b[3], f);
  skyMat.uniforms.top.value.copy(_c1); skyMat.uniforms.bottom.value.copy(_c2); skyMat.uniforms.sunCol.value.copy(_c3);
  scene.fog.color.copy(_c2);
  const e = THREE.MathUtils.degToRad(sunElev), az = -0.55;
  _sd.set(Math.sin(az) * Math.cos(e) * -1, Math.sin(e), Math.cos(az) * Math.cos(e) * 0.45).normalize();
  const night = sunElev < -2;
  skyMat.uniforms.sunDir.value.copy(night ? DOWN : _sd);
  if (night) _sd.copy(MOON);
  sun.color.copy(_c3); sun.intensity = lerp(a[4], b[4], f);
  hemi.intensity = lerp(a[5], b[5], f);
  hemi.color.copy(_c1).lerp(WHITE, .45);
  sun.position.copy(focus).addScaledVector(_sd, 160);
  sun.target.position.copy(focus);
  stars.material.opacity = smooth(0, -7, sunElev);
  const lamp = smooth(4, -2, sunElev);
  for (const m of lampMats) m.emissiveIntensity = lamp * 2.2;
  renderer.toneMappingExposure = lerp(1.25, 1.0, smooth(-8, 8, sunElev));
}

/* ---------------- cenário ---------------- */
export const FIELD = { hx: 20, hz: 30 };
export const trees = []; // {x,z,r,top,label} — usado para colisão do jogador e turbulência
export function groundH(x, z) {
  const r = Math.sqrt(x * x + z * z);
  return smooth(110, 260, r) * (6 + noise2(x * .012, z * .012) * 9) + smooth(110, 200, r) * noise2(x * .05, z * .05) * 1.5;
}

/** céu e estrelas acompanham a câmera */
export function followCamera() {
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
}
