import * as THREE from "three";

export const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0 },
    uWhiteTint: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uWhiteTint;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      vec4 base = texture2D(tDiffuse, vUv);
      float r = texture2D(tDiffuse, vUv + dir * uStrength).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * uStrength).b;
      vec3 tinted = mix(vec3(r, g, b), vec3(1.0), uWhiteTint);
      gl_FragColor = vec4(tinted, base.a);
    }
  `
};

export const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.3 },
    uColor: { value: new THREE.Color("#3a0000") }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.35, 0.82, d) * uIntensity;
      color.rgb = mix(color.rgb, uColor, vignette);
      gl_FragColor = color;
    }
  `
};

export const BloomCompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    bloomTexture: { value: null }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(tDiffuse, vUv) + vec4(texture2D(bloomTexture, vUv).rgb, 0.0);
    }
  `
};
