import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import GUI from 'lil-gui'

const installPCSSShadows = () => {
  THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
    `#else // SHADOWMAP_TYPE_BASIC

		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

			float shadow = 1.0;

			shadowCoord.xyz /= shadowCoord.w;

			#ifdef USE_REVERSED_DEPTH_BUFFER

				shadowCoord.z -= shadowBias;

			#else

				shadowCoord.z += shadowBias;

			#endif

			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;

			if ( frustumTest ) {

				float depth = texture2D( shadowMap, shadowCoord.xy ).r;

				#ifdef USE_REVERSED_DEPTH_BUFFER

					shadow = step( depth, shadowCoord.z );

				#else

					shadow = step( shadowCoord.z, depth );

				#endif

			}

			return mix( 1.0, shadow, shadowIntensity );

		}`,
    `#else // SHADOWMAP_TYPE_BASIC

		float pcssRandom( vec2 seed ) {

			return fract( sin( dot( seed, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );

		}

		vec2 pcssDiskSample( int sampleIndex, int samplesCount, float angle ) {

			const float goldenAngle = 2.399963229728653;
			float radius = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + angle;
			return vec2( cos( theta ), sin( theta ) ) * radius;

		}

		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

			float shadow = 1.0;

			shadowCoord.xyz /= shadowCoord.w;

			#ifdef USE_REVERSED_DEPTH_BUFFER

				shadowCoord.z -= shadowBias;

			#else

				shadowCoord.z += shadowBias;

			#endif

			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;

			if ( frustumTest ) {

				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float lightSize = max( shadowRadius, 0.001 );
				float searchRadius = lightSize * texelSize.x * 7.0;
				float rotation = pcssRandom( gl_FragCoord.xy ) * PI2;
				float blockerDepth = 0.0;
				float blockers = 0.0;

				for ( int i = 0; i < 16; i ++ ) {

					float sampleDepth = texture2D( shadowMap, shadowCoord.xy + pcssDiskSample( i, 16, rotation ) * searchRadius ).r;

					#ifdef USE_REVERSED_DEPTH_BUFFER

						if ( sampleDepth > shadowCoord.z ) {

							blockerDepth += sampleDepth;
							blockers += 1.0;

						}

					#else

						if ( sampleDepth < shadowCoord.z ) {

							blockerDepth += sampleDepth;
							blockers += 1.0;

						}

					#endif

				}

				if ( blockers > 0.0 ) {

					float averageBlockerDepth = blockerDepth / blockers;

					#ifdef USE_REVERSED_DEPTH_BUFFER

						float penumbra = ( averageBlockerDepth - shadowCoord.z ) / max( averageBlockerDepth, 0.0001 );

					#else

						float penumbra = ( shadowCoord.z - averageBlockerDepth ) / max( averageBlockerDepth, 0.0001 );

					#endif

					float filterRadius = lightSize * ( 0.85 + penumbra * 18.0 ) * texelSize.x;
					float sum = 0.0;

					for ( int i = 0; i < 32; i ++ ) {

						float sampleDepth = texture2D( shadowMap, shadowCoord.xy + pcssDiskSample( i, 32, rotation ) * filterRadius ).r;

						#ifdef USE_REVERSED_DEPTH_BUFFER

							sum += step( sampleDepth, shadowCoord.z );

						#else

							sum += step( shadowCoord.z, sampleDepth );

						#endif

					}

					shadow = sum / 32.0;

				}

			}

			return mix( 1.0, shadow, shadowIntensity );

		}`
  )
}

installPCSSShadows()

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app element')
}

const mount = app
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xa0a0a0)
scene.fog = new THREE.Fog(0xa0a0a0, 4, 20)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = false
mount.appendChild(renderer.domElement)

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
camera.position.set(3.2, 2.35, 4)
camera.lookAt(0, 0, 0)

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3)
hemiLight.position.set(0, 20, 0)
scene.add(hemiLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 3)
directionalLight.position.set(0, 20, 10)
directionalLight.castShadow = false
directionalLight.shadow.mapSize.set(2048, 2048)
directionalLight.shadow.camera.near = 0.5
directionalLight.shadow.camera.far = 30
directionalLight.shadow.camera.top = 2
directionalLight.shadow.camera.bottom = -2
directionalLight.shadow.camera.left = -2
directionalLight.shadow.camera.right = 2
directionalLight.shadow.bias = -0.0001
directionalLight.shadow.normalBias = 0.02
directionalLight.shadow.radius = 18
scene.add(directionalLight)

const baseLightDistance = directionalLight.position.length()
const coolLightColor = new THREE.Color(0xd8ecff)
const neutralLightColor = new THREE.Color(0xffffff)
const warmLightColor = new THREE.Color(0xffd2a1)

const groundUniforms = {
  lightDirection: { value: directionalLight.position.clone().normalize() },
  lightColor: { value: directionalLight.color },
  lightIntensity: { value: directionalLight.intensity },
  ambientIntensity: { value: hemiLight.intensity },
  cubeSize: { value: 2.0 },
  inverseModelMatrix: { value: new THREE.Matrix4() },
  absorptionStrength: { value: 0.88 },
  brightness: { value: 1.2 },
  ior: { value: 1.62 },
  innerShadowSize: { value: 0.03 },
  innerShadowOpacity: { value: 0.35 },
  innerCausticShadowMix: { value: 0.9 },
  outerShadowSize: { value: 0.12 },
  outerShadowOpacity: { value: 0.5 },
  outerCausticShadowMix: { value: 0.2 },
}

const groundMaterial = new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false })
groundMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.lightDirection = groundUniforms.lightDirection
  shader.uniforms.lightColor = groundUniforms.lightColor
  shader.uniforms.lightIntensity = groundUniforms.lightIntensity
  shader.uniforms.ambientIntensity = groundUniforms.ambientIntensity
  shader.uniforms.cubeSize = groundUniforms.cubeSize
  shader.uniforms.inverseModelMatrix = groundUniforms.inverseModelMatrix
  shader.uniforms.absorptionStrength = groundUniforms.absorptionStrength
  shader.uniforms.brightness = groundUniforms.brightness
  shader.uniforms.ior = groundUniforms.ior
  shader.uniforms.innerShadowSize = groundUniforms.innerShadowSize
  shader.uniforms.innerShadowOpacity = groundUniforms.innerShadowOpacity
  shader.uniforms.innerCausticShadowMix = groundUniforms.innerCausticShadowMix
  shader.uniforms.outerShadowSize = groundUniforms.outerShadowSize
  shader.uniforms.outerShadowOpacity = groundUniforms.outerShadowOpacity
  shader.uniforms.outerCausticShadowMix = groundUniforms.outerCausticShadowMix

  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
    varying vec3 vGroundWorldPosition;`
  )
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    vGroundWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;`
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
    uniform vec3 lightDirection;
    uniform vec3 lightColor;
    uniform float lightIntensity;
    uniform float ambientIntensity;
    uniform float cubeSize;
    uniform mat4 inverseModelMatrix;
    uniform float absorptionStrength;
    uniform float brightness;
    uniform float ior;
    uniform float innerShadowSize;
    uniform float innerShadowOpacity;
    uniform float innerCausticShadowMix;
    uniform float outerShadowSize;
    uniform float outerShadowOpacity;
    uniform float outerCausticShadowMix;
    varying vec3 vGroundWorldPosition;

    const vec3 CYAN = vec3(0.0, 0.92, 1.0);
    const vec3 MAGENTA = vec3(1.0, 0.05, 0.9);
    const vec3 YELLOW = vec3(1.0, 0.95, 0.0);
    const vec3 WHITE = vec3(1.0, 1.0, 1.0);

    vec2 intersectBox(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize) {
      vec3 invDir = 1.0 / rayDir;
      vec3 t1 = (-boxHalfSize - rayOrigin) * invDir;
      vec3 t2 = (boxHalfSize - rayOrigin) * invDir;
      vec3 tMin = min(t1, t2);
      vec3 tMax = max(t1, t2);
      float tNear = max(max(tMin.x, tMin.y), tMin.z);
      float tFar = min(min(tMax.x, tMax.y), tMax.z);
      return vec2(tNear, tFar);
    }

    vec3 getFaceNormal(vec3 hitPoint, vec3 boxHalfSize) {
      vec3 p = hitPoint / boxHalfSize;
      vec3 absP = abs(p);
      float maxComp = max(max(absP.x, absP.y), absP.z);
      if (absP.x >= maxComp - 0.001) return vec3(sign(p.x), 0.0, 0.0);
      if (absP.y >= maxComp - 0.001) return vec3(0.0, sign(p.y), 0.0);
      return vec3(0.0, 0.0, sign(p.z));
    }

    vec3 getFaceColor(vec3 normal) {
      vec3 absNormal = abs(normal);
      if (absNormal.x > 0.5) return YELLOW;
      if (absNormal.y > 0.5) return MAGENTA;
      return CYAN;
    }

    float hardBoxShadow(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize) {
      vec2 t = intersectBox(rayOrigin, rayDir, boxHalfSize);
      return (t.x < t.y && t.y > 0.0) ? 1.0 : 0.0;
    }

    float shadowNoise(vec2 seed) {
      return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec2 diskSample(int sampleIndex, int samplesCount, float rotation) {
      const float goldenAngle = 2.399963229728653;
      float radius = sqrt((float(sampleIndex) + 0.5) / float(samplesCount));
      float theta = float(sampleIndex) * goldenAngle + rotation;
      return vec2(cos(theta), sin(theta)) * radius;
    }

    float softBoxShadow(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize, float spread) {
      if (spread <= 0.0001) return hardBoxShadow(rayOrigin, rayDir, boxHalfSize);

      vec3 up = abs(rayDir.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 tangent = normalize(cross(up, rayDir));
      vec3 bitangent = cross(rayDir, tangent);
      float rotation = shadowNoise(gl_FragCoord.xy) * 6.28318530718;
      float occlusion = 0.0;

      for (int i = 0; i < 96; i++) {
        vec2 sampleOffset = diskSample(i, 96, rotation) * spread;
        vec3 sampleDir = normalize(rayDir + tangent * sampleOffset.x + bitangent * sampleOffset.y);
        occlusion += hardBoxShadow(rayOrigin, sampleDir, boxHalfSize);
      }

      return smoothstep(0.0, 1.0, occlusion / 96.0);
    }

    vec3 traceShadow(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize, float absStrength, out float bounceCount, out int axisMask) {
      vec3 p = rayOrigin;
      vec3 filterColor = WHITE;
      bounceCount = 0.0;
      axisMask = 0;
      vec2 t = intersectBox(p, rayDir, boxHalfSize);
      if (t.x > t.y || t.y < 0.0) return WHITE;
      p = rayOrigin + rayDir * max(t.x, 0.0);
      vec3 n = getFaceNormal(p, boxHalfSize);
      
      vec3 absN = abs(n);
      if (absN.x > 0.5) axisMask |= 1;
      else if (absN.y > 0.5) axisMask |= 2;
      else axisMask |= 4;

      float safeIor = max(ior, 0.01);
      vec3 currentRayDir = refract(rayDir, n, 1.0 / safeIor);
      filterColor *= mix(WHITE, getFaceColor(n), absStrength);
      for (int i = 0; i < 4; i++) {
        p += currentRayDir * 0.001;
        vec2 tInner = intersectBox(p, currentRayDir, boxHalfSize);
        p += currentRayDir * tInner.y;
        vec3 hitNormal = getFaceNormal(p, boxHalfSize);
        
        vec3 absHitN = abs(hitNormal);
        if (absHitN.x > 0.5) axisMask |= 1;
        else if (absHitN.y > 0.5) axisMask |= 2;
        else axisMask |= 4;

        filterColor *= mix(WHITE, getFaceColor(hitNormal), absStrength);
        vec3 exitRayDir = refract(currentRayDir, -hitNormal, safeIor);
        if (length(exitRayDir) > 0.1) break; 
        currentRayDir = reflect(currentRayDir, -hitNormal);
        bounceCount += 1.0;
      }
      return filterColor;
    }

    struct ShadowResult {
      vec4 inner;
      vec4 outer;
    };

    ShadowResult traceDualLayerShadow(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize, float innerSpread, float outerSpread, float absStrength) {
      vec3 innerFilter = vec3(0.0);
      float innerOcclusion = 0.0;
      vec3 outerFilter = vec3(0.0);
      float outerOcclusion = 0.0;

      // Early out if the ray doesn't hit the box even with maximum spread
      float maxSpread = max(innerSpread, outerSpread);
      vec2 tRange = intersectBox(rayOrigin, rayDir, boxHalfSize + vec3(maxSpread * 10.0));
      if (tRange.x > tRange.y || tRange.y < 0.0) {
        return ShadowResult(vec4(WHITE, 0.0), vec4(WHITE, 0.0));
      }

      vec3 up = abs(rayDir.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 tangent = normalize(cross(up, rayDir));
      vec3 bitangent = cross(rayDir, tangent);
      float rotation = shadowNoise(gl_FragCoord.xy) * 6.28318530718;

      const int SAMPLES = 48;
      for (int i = 0; i < SAMPLES; i++) {
        vec2 disk = diskSample(i, SAMPLES, rotation);
        
        // Inner sample
        vec3 innerDir = normalize(rayDir + (tangent * disk.x + bitangent * disk.y) * innerSpread);
        if (hardBoxShadow(rayOrigin, innerDir, boxHalfSize) > 0.0) {
          float bounces = 0.0;
          int mask = 0;
          vec3 col = traceShadow(rayOrigin, innerDir, boxHalfSize, absStrength, bounces, mask);
          int count = 0;
          if ((mask & 1) != 0) count++;
          if ((mask & 2) != 0) count++;
          if ((mask & 4) != 0) count++;
          if (count == 1) {
            innerFilter += col;
            innerOcclusion += 1.0;
          }
        }

        // Outer sample
        vec3 outerDir = normalize(rayDir + (tangent * disk.x + bitangent * disk.y) * outerSpread);
        if (hardBoxShadow(rayOrigin, outerDir, boxHalfSize) > 0.0) {
          float bounces = 0.0;
          int mask = 0;
          vec3 col = traceShadow(rayOrigin, outerDir, boxHalfSize, absStrength, bounces, mask);
          int count = 0;
          if ((mask & 1) != 0) count++;
          if ((mask & 2) != 0) count++;
          if ((mask & 4) != 0) count++;
          outerOcclusion += 1.0;
          outerFilter += (count > 1) ? col : vec3(0.02);
        }
      }

      vec4 innerRes = (innerOcclusion <= 0.0) ? vec4(WHITE, 0.0) : vec4(innerFilter / innerOcclusion, smoothstep(0.0, 1.0, innerOcclusion / float(SAMPLES)));
      vec4 outerRes = (outerOcclusion <= 0.0) ? vec4(WHITE, 0.0) : vec4(outerFilter / outerOcclusion, smoothstep(0.0, 1.0, outerOcclusion / float(SAMPLES)));
      
      return ShadowResult(innerRes, outerRes);
    }`
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
    vec3 localPos = (inverseModelMatrix * vec4(vGroundWorldPosition, 1.0)).xyz;
    vec3 localLightDir = normalize((inverseModelMatrix * vec4(lightDirection, 0.0)).xyz);
    vec3 boxHalfSize = vec3(cubeSize * 0.5);

    ShadowResult shadows = traceDualLayerShadow(localPos, localLightDir, boxHalfSize, innerShadowSize, outerShadowSize, absorptionStrength);
    vec4 innerSoftCaustic = shadows.inner;
    vec4 outerSoftCaustic = shadows.outer;

    vec3 innerTransmission = innerSoftCaustic.rgb * mix(WHITE, lightColor, 0.6);
    vec3 innerNeutralShadow = vec3(1.0 - innerShadowOpacity);
    vec3 innerColoredShadow = mix(innerNeutralShadow, innerTransmission * brightness, 0.35);
    vec3 innerShadowResult = mix(WHITE, mix(innerNeutralShadow, innerColoredShadow, innerCausticShadowMix), innerSoftCaustic.a);

    vec3 outerTransmission = outerSoftCaustic.rgb * mix(WHITE, lightColor, 0.6);
    vec3 outerNeutralShadow = vec3(1.0 - outerShadowOpacity);
    vec3 outerColoredShadow = mix(outerNeutralShadow, outerTransmission * brightness, 0.35);
    vec3 outerShadowResult = mix(WHITE, mix(outerNeutralShadow, outerColoredShadow, outerCausticShadowMix), outerSoftCaustic.a);

    gl_FragColor.rgb *= mix(outerShadowResult, innerShadowResult, innerSoftCaustic.a);`
  )
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  groundMaterial,
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -1
ground.receiveShadow = false
scene.add(ground)

const grid = new THREE.GridHelper(40, 20, 0x000000, 0x000000)
grid.position.y = -0.999

if (Array.isArray(grid.material)) {
  grid.material.forEach((material) => {
    material.opacity = 0.2
    material.transparent = true
  })
} else {
  grid.material.opacity = 0.2
  grid.material.transparent = true
}

scene.add(grid)

// CMY cube with ray-traced color mixing
const vertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vLocalNormal;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vLocalNormal = normalize(normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const fragmentShader = `
uniform vec3 cameraPos;
uniform vec3 lightDirection;
uniform vec3 lightColor;
uniform float lightIntensity;
uniform float cubeSize;
uniform mat4 inverseModelMatrix;
uniform float ior;
uniform float opacity;
uniform float absorptionStrength;
uniform float saturation;
uniform float bounces;
uniform float reflectionBoost;
uniform bool enableInternal;
uniform float brightness;
uniform float reflectionStrength;
uniform float dispersion;

varying vec3 vWorldPosition;
varying vec3 vLocalNormal;

// CMY colors (subtractive primaries) - saturated for vibrancy
const vec3 CYAN = vec3(0.0, 0.92, 1.0);
const vec3 MAGENTA = vec3(1.0, 0.05, 0.9);
const vec3 YELLOW = vec3(1.0, 0.95, 0.0);
const vec3 WHITE = vec3(1.0, 1.0, 1.0);

// Procedural environment for fake reflections
vec3 getFakeEnv(vec3 dir, vec3 lDir, vec3 lCol) {
  float sky = smoothstep(-0.2, 0.4, dir.y);
  vec3 skyCol = mix(vec3(0.1, 0.12, 0.15), vec3(0.5, 0.7, 1.0), sky);
  vec3 groundCol = vec3(0.04, 0.04, 0.04);
  vec3 env = mix(groundCol, skyCol, sky);
  
  // Add a fake sun/light reflection in the env
  float sun = pow(max(dot(dir, lDir), 0.0), 120.0);
  env += lCol * sun * 8.0;
  
  // Add some "room" structure
  float grid = step(0.98, fract(dir.x * 2.0)) + step(0.98, fract(dir.z * 2.0));
  env += vec3(0.2) * grid * sky;
  
  return env;
}

// Ray-box intersection
vec2 intersectBox(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize) {
  vec3 invDir = 1.0 / rayDir;
  vec3 t1 = (-boxHalfSize - rayOrigin) * invDir;
  vec3 t2 = (boxHalfSize - rayOrigin) * invDir;
  vec3 tMin = min(t1, t2);
  vec3 tMax = max(t1, t2);
  float tNear = max(max(tMin.x, tMin.y), tMin.z);
  float tFar = min(min(tMax.x, tMax.y), tMax.z);
  return vec2(tNear, tFar);
}

vec3 getFaceNormal(vec3 hitPoint, vec3 boxHalfSize) {
  vec3 p = hitPoint / boxHalfSize;
  vec3 absP = abs(p);
  float maxComp = max(max(absP.x, absP.y), absP.z);
  if (absP.x >= maxComp - 0.001) return vec3(sign(p.x), 0.0, 0.0);
  if (absP.y >= maxComp - 0.001) return vec3(0.0, sign(p.y), 0.0);
  return vec3(0.0, 0.0, sign(p.z));
}

vec3 getFaceColor(vec3 normal) {
  vec3 absNormal = abs(normal);
  if (absNormal.x > 0.5) return YELLOW;
  if (absNormal.y > 0.5) return MAGENTA;
  return CYAN;
}

vec3 saturateColor(vec3 color, float amount) {
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luminance), color, amount);
}

void main() {
  vec3 localCameraPos = (inverseModelMatrix * vec4(cameraPos, 1.0)).xyz;
  vec3 localWorldPos = (inverseModelMatrix * vec4(vWorldPosition, 1.0)).xyz;
  vec3 localLightDir = normalize((inverseModelMatrix * vec4(lightDirection, 0.0)).xyz);

  vec3 rayOrigin = localCameraPos;
  vec3 viewDir = normalize(localWorldPos - localCameraPos);
  vec3 boxHalfSize = vec3(cubeSize * 0.5);

  vec2 tOuter = intersectBox(rayOrigin, viewDir, boxHalfSize);
  if (tOuter.x > tOuter.y || tOuter.y < 0.0) {
    discard;
  }

  vec3 p = rayOrigin + viewDir * max(tOuter.x, 0.0);
  vec3 entryNormal = getFaceNormal(p, boxHalfSize);
  vec3 filterColor = mix(WHITE, getFaceColor(entryNormal), absorptionStrength * 0.95);
  
  // Initial refraction with dispersion (R G B slightly different IORs)
  float safeIor = max(ior, 0.01);
  float iorR = max(safeIor - dispersion, 0.01);
  float iorG = safeIor;
  float iorB = max(safeIor + dispersion, 0.01);
  
  vec3 rayDirR = refract(viewDir, entryNormal, 1.0 / iorR);
  vec3 rayDirG = refract(viewDir, entryNormal, 1.0 / iorG);
  vec3 rayDirB = refract(viewDir, entryNormal, 1.0 / iorB);
  
  float totalPathLength = 0.0;
  vec3 pG = p;
  vec3 currentRayDirG = rayDirG;

  for (int i = 0; i < 12; i++) {
      if (!enableInternal || float(i) >= bounces) break;
      pG += currentRayDirG * 0.0001;
      vec2 tInner = intersectBox(pG, currentRayDirG, boxHalfSize);
      pG += currentRayDirG * tInner.y;
      vec3 hitNormal = getFaceNormal(pG, boxHalfSize);
      totalPathLength += tInner.y;
      vec3 faceColor = mix(WHITE, getFaceColor(hitNormal), absorptionStrength);
      filterColor *= mix(WHITE, faceColor, reflectionBoost * 0.98);
      vec3 exitRayDirG = refract(currentRayDirG, -hitNormal, iorG);
      if (length(exitRayDirG) > 0.1) {
          currentRayDirG = exitRayDirG;
          break;
      } else {
          currentRayDirG = reflect(currentRayDirG, -hitNormal);
      }
  }

  vec3 vOut = -viewDir;
  vec3 lightingNormal = normalize(vLocalNormal);
  float lambert = max(dot(lightingNormal, localLightDir), 0.0);
  float fresnel = pow(1.0 - max(dot(lightingNormal, vOut), 0.0), 4.5);
  vec3 halfDir = normalize(localLightDir + vOut);
  float specular = pow(max(dot(lightingNormal, halfDir), 0.0), 180.0);
  float bevelCatch = pow(max(dot(lightingNormal, localLightDir), 0.0), 64.0);
  float normalizedLightIntensity = lightIntensity / 3.0;
  vec3 directLightColor = mix(WHITE, lightColor, 0.45);

  // Dispersion in reflections/exit
  vec3 R = reflect(viewDir, lightingNormal);
  vec3 envReflection = getFakeEnv(R, localLightDir, directLightColor);

  float thickness = clamp(totalPathLength / cubeSize, 0.0, 1.5);
  vec3 acrylicColor = mix(WHITE, filterColor, 0.82 + thickness * 0.18);
  acrylicColor = saturateColor(acrylicColor, saturation);

  float softLight = 0.55 + lambert * normalizedLightIntensity * 0.45;
  vec3 color = acrylicColor * softLight * brightness;
  color *= mix(WHITE, directLightColor, lambert * 0.35);
  
  // Add a bit of "rainbow" based on dispersion and view angle
  float rainbow = fract(dot(currentRayDirG, vec3(1.0)) * 2.0 + dispersion * 10.0);
  vec3 rainbowCol = mix(CYAN, mix(MAGENTA, YELLOW, rainbow), rainbow);
  color = mix(color, rainbowCol, dispersion * 0.5 * thickness);

  vec3 reflectionLayer = envReflection * (fresnel * 0.98 + 0.02) * reflectionStrength;
  color = mix(color, reflectionLayer, fresnel * 0.75);
  color += reflectionLayer;
  color += directLightColor * (specular * normalizedLightIntensity * 1.5 + bevelCatch * normalizedLightIntensity * 0.6);
  
  color = mix(color, WHITE, 0.015);
  float alpha = clamp(opacity + thickness * 0.1 + fresnel * 0.7 + specular * 0.6, 0.0, 0.98);
  gl_FragColor = vec4(color, alpha);
}
`

const cubeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    cameraPos: { value: camera.position },
    lightDirection: { value: directionalLight.position.clone().normalize() },
    lightColor: { value: directionalLight.color },
    lightIntensity: { value: directionalLight.intensity },
    cubeSize: { value: 2.0 },
    inverseModelMatrix: { value: new THREE.Matrix4() },
    ior: { value: 1.62 },
    opacity: { value: 0.58 },
    absorptionStrength: { value: 0.88 },
    saturation: { value: 1.35 },
    bounces: { value: 8.0 },
    reflectionBoost: { value: 1.0 },
    enableInternal: { value: true },
    brightness: { value: 1.2 },
    reflectionStrength: { value: 0.85 },
    dispersion: { value: 0.02 },
    },
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: true,
})

const cube = new THREE.Mesh(
  new RoundedBoxGeometry(2, 2, 2, 8, 0.035),
  cubeMaterial,
)
cube.castShadow = false
scene.add(cube)

const gui = new GUI()
const params = {
  rotationXDegrees: 0,
  rotationYDegrees: 0,
  rotationZDegrees: 0,
  ior: 1.62,
  opacity: 0.58,
  absorption: 0.88,
  saturation: 1.35,
  bounces: 8,
  reflectionBoost: 1.0,
  enableInternal: true,
  brightness: 1.2,
  reflectionStrength: 0.85,
  dispersion: 0.02,
  lightAzimuthDegrees: 0,
  lightElevationDegrees: 63,
  lightDistance: baseLightDistance,
  lightBrightness: directionalLight.intensity,
  lightWarmth: 0.5,
  ambientBrightness: hemiLight.intensity,
  innerShadowSize: groundUniforms.innerShadowSize.value,
  innerShadowOpacity: groundUniforms.innerShadowOpacity.value,
  innerCausticShadowMix: groundUniforms.innerCausticShadowMix.value,
  outerShadowSize: groundUniforms.outerShadowSize.value,
  outerShadowOpacity: groundUniforms.outerShadowOpacity.value,
  outerCausticShadowMix: groundUniforms.outerCausticShadowMix.value,
}

const rotationFolder = gui.addFolder('Rotation')
rotationFolder.add(params, 'rotationXDegrees', 0, 360).name('X').step(1)
rotationFolder.add(params, 'rotationYDegrees', 0, 360).name('Y').step(1)
rotationFolder.add(params, 'rotationZDegrees', 0, 360).name('Z').step(1)
rotationFolder.open()

gui.add(params, 'brightness', 0.5, 3.0).name('Brightness').onChange((val: number) => {
  cubeMaterial.uniforms.brightness.value = val
  groundUniforms.brightness.value = val
})

gui.add(params, 'ior', 1.0, 2.5).name('IOR').onChange((val: number) => {
  cubeMaterial.uniforms.ior.value = val
  groundUniforms.ior.value = val
})

const materialFolder = gui.addFolder('Material')
materialFolder.add(params, 'opacity', 0.2, 0.9).name('Opacity').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.opacity.value = val
})
materialFolder.add(params, 'absorption', 0.2, 1.0).name('Absorption').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.absorptionStrength.value = val
  groundUniforms.absorptionStrength.value = val
})
materialFolder.add(params, 'saturation', 0.6, 1.8).name('Saturation').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.saturation.value = val
})
materialFolder.add(params, 'reflectionStrength', 0.0, 2.0).name('Reflections').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.reflectionStrength.value = val
})
materialFolder.add(params, 'dispersion', 0.0, 0.1).name('Dispersion').step(0.001).onChange((val: number) => {
  cubeMaterial.uniforms.dispersion.value = val
})
materialFolder.open()

const reflectionFolder = gui.addFolder('Internal Reflection')
reflectionFolder.add(params, 'enableInternal').name('Enabled').onChange((val: boolean) => {
  cubeMaterial.uniforms.enableInternal.value = val
})
reflectionFolder.add(params, 'bounces', 1, 12).step(1).name('Max Bounces').onChange((val: number) => {
  cubeMaterial.uniforms.bounces.value = val
})
reflectionFolder.add(params, 'reflectionBoost', 0.0, 2.0).name('Reflection Boost').step(0.05).onChange((val: number) => {
  cubeMaterial.uniforms.reflectionBoost.value = val
})
reflectionFolder.open()

const updateLight = () => {
  const azimuth = THREE.MathUtils.degToRad(params.lightAzimuthDegrees)
  const elevation = THREE.MathUtils.degToRad(params.lightElevationDegrees)
  const radiusAtElevation = Math.cos(elevation) * params.lightDistance

  directionalLight.position.set(
    Math.sin(azimuth) * radiusAtElevation,
    Math.sin(elevation) * params.lightDistance,
    Math.cos(azimuth) * radiusAtElevation,
  )
  const dir = directionalLight.position.clone().normalize()
  cubeMaterial.uniforms.lightDirection.value.copy(dir)
  groundUniforms.lightDirection.value.copy(dir)
  updateLightBrightness()
}

const updateLightColor = () => {
  const color = params.lightWarmth < 0.5
    ? coolLightColor.clone().lerp(neutralLightColor, params.lightWarmth * 2)
    : neutralLightColor.clone().lerp(warmLightColor, (params.lightWarmth - 0.5) * 2)

  directionalLight.color.copy(color)
  cubeMaterial.uniforms.lightColor.value.copy(color)
  groundUniforms.lightColor.value.copy(color)
}

const updateLightBrightness = () => {
  const distanceFalloff = THREE.MathUtils.clamp(baseLightDistance / params.lightDistance, 0.35, 3)
  const intensity = params.lightBrightness * distanceFalloff

  directionalLight.intensity = intensity
  cubeMaterial.uniforms.lightIntensity.value = intensity
  groundUniforms.lightIntensity.value = intensity
}

const updateAmbientBrightness = () => {
  hemiLight.intensity = params.ambientBrightness
  groundUniforms.ambientIntensity.value = params.ambientBrightness
}

const lightFolder = gui.addFolder('Light Orbit')
lightFolder.add(params, 'lightAzimuthDegrees', 0, 360).name('Azimuth').step(1).onChange(updateLight)
lightFolder.add(params, 'lightElevationDegrees', -89, 89).name('Elevation').step(1).onChange(updateLight)
lightFolder.add(params, 'lightDistance', 3, 40).name('Distance').step(0.1).onChange(updateLight)
lightFolder.open()

const lightAppearanceFolder = gui.addFolder('Light Appearance')
lightAppearanceFolder.add(params, 'lightBrightness', 0, 8).name('Brightness').step(0.1).onChange(updateLightBrightness)
lightAppearanceFolder.add(params, 'lightWarmth', 0, 1).name('Warmth').step(0.01).onChange(updateLightColor)
lightAppearanceFolder.add(params, 'ambientBrightness', 0, 6).name('Ambient').step(0.1).onChange(updateAmbientBrightness)
lightAppearanceFolder.open()

const shadowFolder = gui.addFolder('Soft Shadow')

const innerShadowFolder = shadowFolder.addFolder('Inner (Sharp)')
innerShadowFolder.add(params, 'innerShadowSize', 0.0, 0.1).name('Light Size').step(0.001).onChange((val: number) => {
  groundUniforms.innerShadowSize.value = val
})
innerShadowFolder.add(params, 'innerShadowOpacity', 0.0, 1.0).name('Opacity').step(0.01).onChange((val: number) => {
  groundUniforms.innerShadowOpacity.value = val
})
innerShadowFolder.add(params, 'innerCausticShadowMix', 0.0, 1.0).name('Color Mix').step(0.01).onChange((val: number) => {
  groundUniforms.innerCausticShadowMix.value = val
})
innerShadowFolder.open()

const outerShadowFolder = shadowFolder.addFolder('Outer (Soft)')
outerShadowFolder.add(params, 'outerShadowSize', 0.0, 0.25).name('Light Size').step(0.005).onChange((val: number) => {
  groundUniforms.outerShadowSize.value = val
})
outerShadowFolder.add(params, 'outerShadowOpacity', 0.0, 1.0).name('Opacity').step(0.01).onChange((val: number) => {
  groundUniforms.outerShadowOpacity.value = val
})
outerShadowFolder.add(params, 'outerCausticShadowMix', 0.0, 1.0).name('Color Mix').step(0.01).onChange((val: number) => {
  groundUniforms.outerCausticShadowMix.value = val
})
outerShadowFolder.open()

shadowFolder.open()

updateLightColor()

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.enablePan = false
controls.target.set(0, 0, 0)
controls.update()

function resize() {
  const { clientWidth, clientHeight } = mount
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(clientWidth, clientHeight, false)
}

function animate() {
  controls.update()
  cube.rotation.x = THREE.MathUtils.degToRad(params.rotationXDegrees)
  cube.rotation.y = THREE.MathUtils.degToRad(params.rotationYDegrees)
  cube.rotation.z = THREE.MathUtils.degToRad(params.rotationZDegrees)
  cube.updateMatrixWorld()
  const invMatrix = cube.matrixWorld.clone().invert()
  cubeMaterial.uniforms.cameraPos.value.copy(camera.position)
  cubeMaterial.uniforms.inverseModelMatrix.value.copy(invMatrix)
  groundUniforms.inverseModelMatrix.value.copy(invMatrix)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

window.addEventListener('resize', resize)
resize()
animate()
