const vertHead = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uSun;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vObj;
`
const vertBody = /* glsl */ `
void main() {
  vUv = uv;
  vObj = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`
const fragDepth = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
`
const fragTail = /* glsl */ `
  #include <logdepthbuf_fragment>
`

export const sunVertex = vertHead + vertBody

export const sunFragment = /* glsl */ `
${fragDepth}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
uniform float uTime;
uniform sampler2D uMap;
uniform vec3 uTint;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i); float b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0)); float d = hash(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.05; a *= 0.5; }
  return v;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(-vWorld);
  float mu = pow(max(dot(n, viewDir), 0.0), 0.55);
  vec2 uv = vUv * vec2(2.2, 1.1);
  float t = uTime * 0.035;
  float g = fbm(uv * 9.0 + vec2(t, -t * 0.6));
  float g2 = fbm(uv * 26.0 - vec2(t * 1.7, t * 0.4));
  float gran = smoothstep(0.22, 0.82, g * 0.55 + g2 * 0.6);
  vec3 base = texture2D(uMap, vUv).rgb * uTint;
  vec3 hot = vec3(1.0, 0.96, 0.82);
  vec3 mid = vec3(1.0, 0.62, 0.18);
  vec3 limb = vec3(0.85, 0.22, 0.05);
  vec3 col = mix(limb, mix(mid, hot, gran), mu);
  col *= 0.55 + 0.7 * base;
  float spotN = fbm(uv * 2.4 + 3.0);
  float umbra = smoothstep(0.72, 0.8, spotN);
  float penumbra = smoothstep(0.64, 0.74, spotN) * (1.0 - umbra);
  col *= mix(1.0, 0.35, umbra);
  col *= mix(1.0, 0.7, penumbra);
  float promin = pow(1.0 - mu, 2.2) * fbm(vec2(atan(n.z, n.x) * 2.0 + t, n.y * 6.0));
  col += vec3(1.0, 0.35, 0.08) * promin * 1.6;
  col *= 2.15;
  gl_FragColor = vec4(col, 1.0);
  ${fragTail}
}
`

export const rockVertex = vertHead + vertBody

export const rockFragment = /* glsl */ `
${fragDepth}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vObj;
uniform vec3 uSun;
uniform vec3 uTint;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uSpec;
uniform sampler2D uCloud;
uniform float uHasNight;
uniform float uHasSpec;
uniform float uHasCloud;
uniform float uCloudOff;
uniform float uTime;
uniform float uAurora;
uniform vec3 uCenter;
uniform vec3 uRingNormal;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uHasRing;

void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(uSun - vWorld);
  float ndl = dot(n, l);
  float dayF = smoothstep(-0.12, 0.18, ndl);
  vec3 day = texture2D(uDay, vUv).rgb * uTint;
  vec3 nightTex = texture2D(uNight, vUv).rgb;
  float cloud = 0.0;
  if (uHasCloud > 0.5) {
    vec2 cuv = vec2(fract(vUv.x + uCloudOff), vUv.y);
    cloud = texture2D(uCloud, cuv).a;
    float shadow = texture2D(uCloud, vec2(fract(cuv.x + 0.012 * ndl), cuv.y)).a;
    day *= 1.0 - shadow * 0.62 * smoothstep(0.0, 0.35, ndl);
    day = mix(day, vec3(0.95, 0.97, 1.0), cloud * 0.78);
  }
  vec3 col = day;
  if (uHasNight > 0.5) {
    float city = dot(nightTex, vec3(0.3, 0.5, 0.2));
    vec3 lights = nightTex * (2.2 + city * 6.0);
    col = mix(lights, day, dayF);
  } else {
    col *= 0.045 + 0.955 * dayF;
    col += uTint * 0.025;
  }
  vec3 viewDir = normalize(-vWorld);
  if (uHasSpec > 0.5) {
    float spec = texture2D(uSpec, vUv).r;
    vec3 h = normalize(l + viewDir);
    float glint = pow(max(dot(n, h), 0.0), 220.0);
    col += vec3(1.15, 1.05, 0.95) * glint * spec * dayF * 3.2;
    col += vec3(0.45, 0.65, 0.85) * pow(max(dot(n, h), 0.0), 12.0) * spec * dayF * 0.25;
  }
  if (uAurora > 0.5) {
    float pole = smoothstep(0.5, 0.86, abs(n.y));
    float curtain = 0.5 + 0.5 * sin(n.x * 48.0 + uTime * 1.6) * sin(n.z * 36.0 - uTime);
    col += vec3(0.15, 1.15, 0.45) * pole * (1.0 - dayF) * curtain * 1.6;
    col += vec3(0.65, 0.2, 1.0) * smoothstep(0.78, 0.96, abs(n.y)) * (1.0 - dayF) * 0.55;
  }
  if (uHasRing > 0.5) {
    vec3 rn = normalize(uRingNormal);
    float denom = dot(l, rn);
    if (abs(denom) > 1e-3) {
      float t = dot(uCenter - vWorld, rn) / denom;
      if (t > 0.0) {
        vec3 hit = vWorld + l * t;
        vec3 rel = hit - uCenter;
        float radial = length(rel - rn * dot(rel, rn));
        float inner = uRingInner;
        float outer = uRingOuter;
        float cass = smoothstep(0.012, 0.0, abs(radial - mix(inner, outer, 0.62)));
        float inRing = smoothstep(inner, inner * 1.01, radial) * (1.0 - smoothstep(outer * 0.98, outer, radial));
        inRing *= 1.0 - cass;
        col *= 1.0 - inRing * 0.72 * dayF;
      }
    }
  }
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  col += vec3(0.45, 0.65, 1.0) * fres * 0.08 * dayF;
  gl_FragColor = vec4(col, 1.0);
  ${fragTail}
}
`

export const gasFragment = /* glsl */ `
${fragDepth}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
uniform vec3 uSun;
uniform vec3 uTint;
uniform sampler2D uDay;
uniform float uTime;
uniform float uGRS;
uniform vec3 uCenter;
uniform vec3 uRingNormal;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uHasRing;

void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(uSun - vWorld);
  float ndl = dot(n, l);
  float dayF = smoothstep(-0.15, 0.2, ndl);
  float lat = vUv.y;
  float speed = 0.012 + 0.02 * sin(lat * 18.0);
  vec2 uv = vec2(fract(vUv.x + uTime * speed), vUv.y);
  vec3 tex = texture2D(uDay, uv).rgb;
  float bands = 0.85 + 0.15 * sin(lat * 46.0 + sin(uv.x * 12.0 + uTime * 0.2));
  vec3 col = tex * uTint * bands;
  if (uGRS > 0.5) {
    vec2 d = (uv - vec2(0.36, 0.63));
    d.y *= 1.85;
    float blob = length(d);
    float grs = smoothstep(0.075, 0.02, blob);
    float collar = smoothstep(0.11, 0.075, blob) * (1.0 - grs);
    col = mix(col, vec3(0.78, 0.24, 0.12), grs);
    col = mix(col, vec3(0.95, 0.88, 0.74), collar * 0.85);
  }
  col *= 0.08 + 0.92 * dayF;
  if (uHasRing > 0.5) {
    vec3 rn = normalize(uRingNormal);
    float denom = dot(l, rn);
    if (abs(denom) > 1e-3) {
      float t = dot(uCenter - vWorld, rn) / denom;
      if (t > 0.0) {
        vec3 hit = vWorld + l * t;
        vec3 rel = hit - uCenter;
        float radial = length(rel - rn * dot(rel, rn));
        float cass = smoothstep(0.02, 0.0, abs(radial - mix(uRingInner, uRingOuter, 0.58)) / max(uRingOuter, 1.0));
        float inRing = smoothstep(uRingInner * 0.98, uRingInner * 1.02, radial) * (1.0 - smoothstep(uRingOuter * 0.96, uRingOuter, radial));
        inRing *= 1.0 - cass;
        col *= 1.0 - inRing * 0.78 * dayF;
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
  ${fragTail}
}
`

export const atmoVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`

export const atmoFragment = /* glsl */ `
${fragDepth}
varying vec3 vWorld;
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uSun;
uniform vec3 uColor;
uniform float uStrength;
uniform float uOuter;

bool hit(vec3 ro, vec3 rd, vec3 c, float r, out float t0, out float t1) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + r * r;
  if (h < 0.0) return false;
  h = sqrt(h);
  t0 = -b - h;
  t1 = -b + h;
  return t1 > 0.0;
}

void main() {
  vec3 rd = normalize(vWorld);
  vec3 ro = vec3(0.0);
  float t0, t1, p0, p1;
  float Rout = uRadius * uOuter;
  if (!hit(ro, rd, uCenter, Rout, t0, t1)) discard;
  float tStart = max(t0, 0.0);
  float tEnd = t1;
  if (hit(ro, rd, uCenter, uRadius, p0, p1) && p0 > 0.0) tEnd = min(tEnd, p0);
  if (tEnd <= tStart) discard;
  float ds = (tEnd - tStart) / 6.0;
  vec3 sunDir = normalize(uSun - uCenter);
  vec3 acc = vec3(0.0);
  float od = 0.0;
  float H = max(uRadius * 0.014, 1.0);
  for (int i = 0; i < 6; i++) {
    vec3 pos = ro + rd * (tStart + (float(i) + 0.5) * ds);
    float height = length(pos - uCenter) - uRadius;
    float dens = exp(-max(height, 0.0) / H);
    od += dens * ds / uRadius;
    float ld = 0.0;
    float lt0, lt1;
    if (hit(pos, sunDir, uCenter, Rout, lt0, lt1)) {
      float lds = max(lt1, 0.0) / 3.0;
      for (int j = 0; j < 3; j++) {
        vec3 lp = pos + sunDir * ((float(j) + 0.5) * lds);
        float lh = length(lp - uCenter) - uRadius;
        ld += exp(-max(lh, 0.0) / H) * lds / uRadius;
        if (lh < 0.0) ld += 8.0;
      }
    }
    vec3 trans = exp(-uColor * (od + ld) * 0.55);
    acc += dens * trans * ds / uRadius;
  }
  float mu = dot(rd, sunDir);
  float phaseR = 0.75 * (1.0 + mu * mu);
  float phaseM = pow(max(mu, 0.0), 6.0);
  vec3 col = uColor * acc * phaseR * uStrength;
  col += vec3(1.0, 0.55, 0.22) * acc * phaseM * uStrength * 0.55;
  float alpha = clamp(max(col.r, max(col.g, col.b)) * 1.15, 0.0, 0.9);
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(col, alpha);
  ${fragTail}
}
`

export const ringVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`

export const ringFragment = /* glsl */ `
${fragDepth}
varying vec3 vWorld;
varying vec3 vLocal;
uniform vec3 uSun;
uniform vec3 uPlanet;
uniform float uPlanetR;
uniform float uInner;
uniform float uOuter;
uniform sampler2D uRing;
uniform vec3 uTint;

void main() {
  float r = length(vLocal.xy);
  float u = clamp((r - uInner) / max(uOuter - uInner, 1.0), 0.0, 1.0);
  vec4 tex = texture2D(uRing, vec2(u, 0.5));
  float fine = 0.72 + 0.28 * sin(u * 160.0) * sin(u * 47.0 + 1.7);
  float cass = smoothstep(0.02, 0.0, abs(u - 0.68));
  float encke = smoothstep(0.008, 0.0, abs(u - 0.81));
  float alpha = max(tex.a, 0.35) * fine;
  alpha *= 1.0 - cass;
  alpha *= 1.0 - encke * 0.85;
  alpha *= smoothstep(0.0, 0.02, u) * (1.0 - smoothstep(0.97, 1.0, u));
  if (alpha < 0.035) discard;
  vec3 ice = mix(vec3(0.92, 0.86, 0.74), vec3(0.72, 0.78, 0.84), smoothstep(0.2, 0.85, u));
  vec3 col = mix(ice, uTint, 0.25) * (0.65 + 0.5 * tex.r);
  vec3 toSun = normalize(uSun - vWorld);
  vec3 oc = vWorld - uPlanet;
  float b = dot(oc, toSun);
  float c = dot(oc, oc) - uPlanetR * uPlanetR;
  float disc = b * b - c;
  if (disc > 0.0 && b < 0.0) col *= 0.12;
  float back = pow(max(dot(normalize(-vWorld), toSun), 0.0), 1.6);
  col += vec3(1.0, 0.93, 0.8) * back * alpha * 0.55;
  float mu = abs(dot(normalize(vWorld), vec3(0.0, 1.0, 0.0)));
  alpha *= mix(0.28, 1.0, mu);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
  ${fragTail}
}
`

export const starVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
uniform float uWarp;
uniform vec2 uStreak;
uniform float uDensity;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(1.0, -mv.z);
  gl_PointSize = clamp(aSize * uDensity * (280.0 / dist), 1.0, 28.0);
  gl_PointSize *= 1.0 + uWarp * 1.8;
  #include <logdepthbuf_vertex>
}
`

export const starFragment = /* glsl */ `
${fragDepth}
varying vec3 vColor;
uniform float uWarp;
uniform vec2 uStreak;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  vec2 d = length(uStreak) > 0.1 ? normalize(uStreak) : vec2(0.0, 1.0);
  vec2 nrm = vec2(-d.y, d.x);
  float along = dot(p, d);
  float side = dot(p, nrm);
  float stretch = 1.0 + uWarp * 10.0;
  along /= stretch;
  float r = length(vec2(along, side));
  if (r > 0.5) discard;
  float core = smoothstep(0.5, 0.0, r);
  vec3 col = vColor * (0.35 + 2.4 * pow(core, 2.2));
  gl_FragColor = vec4(col, core);
  ${fragTail}
}
`

export const galaxyVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vPos;
void main() {
  vPos = position.xy;
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`

export const galaxyFragment = /* glsl */ `
${fragDepth}
varying vec2 vPos;
uniform float uArms;
uniform float uBar;
uniform float uEdge;
uniform vec3 uColor;
uniform float uTime;
uniform float uElliptical;

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.1, 289.7))) * 43758.5); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}

void main() {
  float r = length(vPos);
  if (r > 1.02) discard;
  float ang = atan(vPos.y, vPos.x);
  float bar = exp(-pow(vPos.y / 0.18, 2.0)) * exp(-pow(vPos.x / 0.45, 2.0)) * uBar;
  float spiral = sin(uArms * (ang - log(r + 0.08) * 3.4) + bar * 2.0);
  float arm = smoothstep(0.0, 1.0, spiral * 0.5 + 0.5);
  arm *= exp(-r * 2.1);
  float bulge = exp(-r * r * 18.0);
  float dust = noise(vPos * 8.0 + ang);
  float lane = smoothstep(0.45, 0.8, dust) * arm;
  vec3 col = uColor * (0.12 + arm * 1.45) + vec3(1.0, 0.82, 0.55) * bulge * 1.2;
  col *= 1.0 - lane * 0.65;
  col += vec3(0.55, 0.7, 1.0) * arm * (1.0 - r) * 0.35;
  if (uElliptical > 0.5) {
    float e = exp(-pow(vPos.x * 1.3, 2.0) - pow(vPos.y * 1.6, 2.0));
    col = vec3(1.0, 0.9, 0.75) * e * 1.3;
  }
  if (uEdge > 0.5) {
    float dustLane = exp(-pow(vPos.y / 0.035, 2.0)) * smoothstep(0.15, 0.3, abs(vPos.x));
    col *= 1.0 - dustLane * 0.85;
    col += vec3(1.0, 0.85, 0.6) * exp(-r * r * 10.0);
  }
  float alpha = clamp(bulge * 0.85 + arm * 0.45 + bar * 0.28, 0.0, 0.8);
  if (uElliptical > 0.5) alpha = clamp(length(col) * 0.6, 0.0, 0.75);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col * 0.7, alpha);
  ${fragTail}
}
`

export const bhVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`

export const bhFragment = /* glsl */ `
${fragDepth}
varying vec3 vWorld;
uniform vec3 uCenter;
uniform float uRs;
uniform float uTime;

void main() {
  vec3 rel = vWorld - uCenter;
  vec3 camDir = normalize(-uCenter);
  vec3 upRef = abs(camDir.y) > 0.85 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 side = normalize(cross(camDir, upRef));
  vec3 upv = cross(side, camDir);
  vec2 p = vec2(dot(rel, side), dot(rel, upv)) / max(uRs * 14.0, 1.0);
  float rr = length(p);
  if (rr > 1.15) discard;
  float horizon = smoothstep(0.16, 0.1, rr);
  float photon = exp(-pow((rr - 0.2) / 0.018, 2.0));
  float disk = exp(-pow((rr - 0.42) / 0.16, 2.0)) * smoothstep(0.18, 0.28, rr);
  float dop = clamp(p.x * 1.4, -1.2, 1.2);
  vec3 hot = mix(vec3(1.0, 0.32, 0.06), vec3(0.72, 0.86, 1.0), smoothstep(0.55, 0.2, rr));
  vec3 col = hot * disk * exp(dop) * (0.85 + 0.15 * sin(uTime * 2.0 + rr * 18.0));
  col += vec3(1.0, 0.92, 0.8) * photon * 1.6;
  float alpha = clamp(disk * 1.2 + photon + horizon, 0.0, 1.0);
  if (rr < 0.12) { col = vec3(0.0); alpha = 1.0; }
  if (alpha < 0.03) discard;
  gl_FragColor = vec4(col * 0.85, alpha);
  ${fragTail}
}
`

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}
`

export const skyFragment = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uNorth;
uniform vec3 uCenter;
uniform vec3 uEast;
uniform float uFade;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
void main() {
  vec3 d = normalize(vDir);
  float b = asin(clamp(dot(d, uNorth), -1.0, 1.0));
  float x = dot(d, uCenter);
  float y = dot(d, uEast);
  float l = atan(y, x);
  float band = exp(-pow(b * 5.5, 2.0));
  float bulge = exp(-(b * b * 22.0 + l * l * 1.15));
  float dust = noise(vec2(l * 3.0, b * 10.0));
  vec3 col = vec3(0.55, 0.62, 0.95) * band * (0.35 + 0.8 * dust);
  col += vec3(1.0, 0.78, 0.48) * bulge * 1.15;
  col *= mix(1.0, 0.35, smoothstep(0.4, 0.85, dust) * band);
  col *= uFade;
  gl_FragColor = vec4(col, 1.0);
}
`

export const coronaVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`

export const coronaFragment = /* glsl */ `
${fragDepth}
varying vec3 vNormal;
varying vec3 vWorld;
uniform float uTime;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(-vWorld);
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
  float ray = 0.65 + 0.35 * sin(atan(n.z, n.x) * 9.0 + n.y * 14.0 + uTime * 0.4);
  vec3 col = mix(vec3(1.0, 0.72, 0.28), vec3(0.95, 0.95, 1.0), fres);
  float alpha = fres * ray * 0.55;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col * 1.15, alpha);
  ${fragTail}
}
`

export const spriteVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`

export const spriteFragment = /* glsl */ `
${fragDepth}
varying vec2 vUv;
uniform vec3 uColor;
uniform sampler2D uMap;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * t.r;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
  ${fragTail}
}
`
