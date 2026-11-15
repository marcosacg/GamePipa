// Acabamento "anime" da imagem (pós-processamento), sem bibliotecas extras:
//  - traço escuro nas bordas dos objetos próximos (como contorno de desenho);
//  - brilho suave nas partes muito claras (céu, nuvens, janelas acesas);
//  - cores mais vivas, sombras levemente azuladas e uma vinheta discreta.
// A cena é desenhada numa textura (com profundidade) e um shader de tela cheia faz o resto.
// No celular fica desligado (o jogo desenha direto), para não pesar.
import * as THREE from 'three';

const FRAG = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 res; uniform float near; uniform float far; uniform float outline; uniform float glow;
varying vec2 vUv;
float viewZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
void main() {
  vec2 px = 1.0 / res;
  vec3 col = texture2D(tColor, vUv).rgb;

  // ---- traço: salto de profundidade entre vizinhos (o "laplaciano" da profundidade é zero em superfícies planas) ----
  float w = max(1.0, res.y / 900.0);
  float d0 = texture2D(tDepth, vUv).x;
  float dA = texture2D(tDepth, vUv + px * vec2( w,  w)).x, dB = texture2D(tDepth, vUv + px * vec2(-w, -w)).x;
  float dC = texture2D(tDepth, vUv + px * vec2( w, -w)).x, dD = texture2D(tDepth, vUv + px * vec2(-w,  w)).x;
  float z0 = viewZ(min(d0, min(min(dA, dB), min(dC, dD))));
  float k = (far - near) / (2.0 * near * far) * 2.0;                 // converte para variação de 1/z
  float lap = (abs(dA + dB - 2.0 * d0) + abs(dC + dD - 2.0 * d0)) * k * z0;
  float edge = smoothstep(0.035, 0.11, lap) * (1.0 - smoothstep(22.0, 75.0, z0));
  // materiais marcados "sem traço" (linha da pipa, capim, fios) gravam alfa 0
  float keep = min(texture2D(tColor, vUv).a, min(min(texture2D(tColor, vUv + px * vec2(w, w)).a, texture2D(tColor, vUv + px * vec2(-w, -w)).a),
    min(texture2D(tColor, vUv + px * vec2(w, -w)).a, texture2D(tColor, vUv + px * vec2(-w, w)).a)));
  edge *= step(0.5, keep);
  col = mix(col, col * vec3(0.16, 0.11, 0.2), edge * outline);

  // ---- brilho suave (usa as versões borradas que a própria placa de vídeo gera: mipmaps) ----
  vec3 b1 = max(texture2D(tColor, vUv, 3.0).rgb - 0.95, 0.0);
  vec3 b2 = max(texture2D(tColor, vUv, 5.0).rgb - 0.8, 0.0);
  col += (b1 * 0.5 + b2 * 0.6) * glow;

  // ---- cores de anime: mais saturação, sombra puxando pro azul-violeta, luz puxando pro quente ----
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, 1.2);
  col += vec3(0.0, 0.004, 0.022) * (1.0 - smoothstep(0.0, 0.35, lum));
  col *= mix(vec3(1.0), vec3(1.04, 1.01, 0.96), smoothstep(0.5, 1.2, lum));
  vec2 c = vUv - 0.5;
  col *= 1.0 - 0.2 * pow(dot(c, c) * 2.2, 1.6);

  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createPost(renderer, { enabled = true } = {}) {
  const size = new THREE.Vector2();
  let rt = null, ok = enabled && renderer.capabilities.isWebGL2;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2(1, 1) }, near: { value: .1 }, far: { value: 2600 }, outline: { value: .8 }, glow: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function resize() {
    renderer.getDrawingBufferSize(size);
    if (rt) { rt.dispose(); rt.depthTexture.dispose(); }
    rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      samples: 4, type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(size.x, size.y),
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    rt.depthTexture.type = THREE.UnsignedIntType;
    mat.uniforms.tColor.value = rt.texture; mat.uniforms.tDepth.value = rt.depthTexture; mat.uniforms.res.value.copy(size);
  }

  return {
    get enabled() { return ok; },
    set enabled(v) { ok = v && renderer.capabilities.isWebGL2; },
    uniforms: mat.uniforms,
    render(scene, camera) {
      if (!ok) { renderer.render(scene, camera); return; }
      renderer.getDrawingBufferSize(size);
      if (!rt || rt.width !== size.x || rt.height !== size.y) resize();
      mat.uniforms.near.value = camera.near; mat.uniforms.far.value = camera.far;
      try {
        renderer.setRenderTarget(rt); renderer.render(scene, camera);
        renderer.setRenderTarget(null); renderer.render(qScene, qCam);
      } catch (e) { // placa de vídeo sem suporte: volta ao desenho direto
        console.warn('pós-processamento desligado:', e.message);
        ok = false; renderer.setRenderTarget(null); renderer.render(scene, camera);
      }
    },
  };
}
