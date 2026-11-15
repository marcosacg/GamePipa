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

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x7c7391, 1.0); // sombra puxando pro violeta (anime)
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
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() },
    uTime: { value: 0 }, uClouds: { value: 1 }, uDay: { value: 1 } },
  vertexShader: `varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunCol; uniform vec3 sunDir; uniform float uTime; uniform float uClouds; uniform float uDay; varying vec3 vW;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
    // nuvens de anime: massas grandes e recortadas, claras em cima e azuladas embaixo
    float cloud(vec3 d, float t){
      vec2 uv = d.xz / (d.y + 0.22) * 1.15 + vec2(t * 0.006, t * 0.002);
      float n = fbm(uv) + 0.25 * fbm(uv * 3.1 + 4.0);
      return n;
    }
    void main(){
      vec3 d = normalize(vW);
      float h = max(d.y, 0.0);
      vec3 c = mix(bottom, top, pow(h, 0.42));
      vec3 sd = normalize(sunDir);
      float s = max(dot(d, sd), 0.0);
      c += sunCol * (pow(s, 6.0) * 0.32 + pow(s, 60.0) * 0.5 + smoothstep(0.9982, 0.9992, s) * 2.2);
      if (uClouds > 0.5 && d.y > 0.0) {
        float n = cloud(d, uTime);
        float cover = 0.585 + 0.1 * smoothstep(0.05, 0.6, d.y);          // mais nuvem perto do horizonte, céu mais limpo no alto
        float m = smoothstep(cover, cover + 0.035, n);                   // borda recortada (desenho)
        float n2 = cloud(normalize(d + sd * 0.045), uTime);              // amostra na direção do sol: lado iluminado
        float lit = smoothstep(-0.02, 0.05, n - n2);
        float core = smoothstep(cover + 0.03, cover + 0.2, n);           // miolo mais denso = mais sombra embaixo
        vec3 light = mix(bottom, vec3(1.0), 0.72) + sunCol * 0.22;
        light = mix(mix(top, bottom, 0.6) * 1.9 + vec3(0.03, 0.04, 0.08), light, uDay);   // de noite: nuvem escura, só um pouco mais clara que o céu
        vec3 shade = mix(mix(top, bottom, 0.55), vec3(0.62, 0.66, 0.82), 0.45) * (0.72 + 0.28 * length(sunCol) / 1.7);
        vec3 cc = mix(shade, light, clamp(lit * 0.75 + (1.0 - core) * 0.45, 0.0, 1.0));
        float fade = smoothstep(0.015, 0.14, d.y);                       // some na névoa do horizonte
        c = mix(c, cc, m * fade * 0.94);
      }
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
  skyMat.uniforms.uTime.value = performance.now() / 1000;
  skyMat.uniforms.uDay.value = clamp((sunElev + 5) / 13, 0, 1);
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

/* ---------------- cenário atual ----------------
   Cada cenário (js/cenarios/*.js) preenche o SCN quando é montado:
   ground(x,z)  altura do chão (inclui o telhado/laje das casas)
   walk         retângulo onde o jogador anda
   spawns       pontos onde os jogadores aparecem [x,z]
   bots         cantinhos dos bots na disputa offline
   areas        (opcional) áreas separadas, uma por jogador enquanto couber: [{ walk, spawns, bot }] (as lajes)
   npcZones     onde a molecada figurante fica e corre { x0,x1,z0,z1, homes:[[x,z]...] }
   fallLabel    texto quando a pipa cai: "no chão", "na laje do vizinho"... */
export const FIELD = { hx: 20, hz: 30 };
export const SCN = {
  id: 'campinho',
  ground: () => 0,
  walk: { x0: -29.5, x1: 25.8, z0: -52, z1: 48 },
  spawns: [[0, 22]],
  bots: [[-12, 18], [13, 20], [5, 28], [-6, 30]],
  npcZones: [],
  fallLabel: () => 'no chão',
};
export const trees = [];    // {x,z,r,top,label} — turbulência do vento (e colisão de quem anda)
export const blockers = []; // obstáculos de quem anda: {x,z,r} (círculo) ou {x0,x1,z0,z1} (retângulo)
export function groundH(x, z) { return SCN.ground(x, z); }

/** empurra quem anda para fora de árvores, caixas d'água etc. (raio r) */
export function collideWalk(pos, r = .45) {
  for (const t of trees) {
    const dx = pos.x - t.x, dz = pos.z - t.z, d = Math.hypot(dx, dz), rr = r + .35;
    if (d < rr && d > 0) { pos.x = t.x + dx / d * rr; pos.z = t.z + dz / d * rr; }
  }
  for (const b of blockers) {
    if (b.r != null) {
      const dx = pos.x - b.x, dz = pos.z - b.z, d = Math.hypot(dx, dz), rr = r + b.r;
      if (d < rr && d > 0) { pos.x = b.x + dx / d * rr; pos.z = b.z + dz / d * rr; }
    } else if (pos.x > b.x0 - r && pos.x < b.x1 + r && pos.z > b.z0 - r && pos.z < b.z1 + r) {
      // sai pelo lado mais perto
      const pl = pos.x - (b.x0 - r), pr = (b.x1 + r) - pos.x, pb = pos.z - (b.z0 - r), pf = (b.z1 + r) - pos.z;
      const m = Math.min(pl, pr, pb, pf);
      if (m === pl) pos.x = b.x0 - r; else if (m === pr) pos.x = b.x1 + r; else if (m === pb) pos.z = b.z0 - r; else pos.z = b.z1 + r;
    }
  }
}

/** céu e estrelas acompanham a câmera */
export function followCamera() {
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
}
