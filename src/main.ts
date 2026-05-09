import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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
camera.position.set(6.4, 4.7, 8.0)
camera.lookAt(0, 0, 0)

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3)
hemiLight.position.set(0, 20, 0)
scene.add(hemiLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 4)
directionalLight.position.set(1.737, 1.721, -1.737)
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

const groundMaterial = new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false })

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
uniform float colorDarkness;
uniform float saturation;
uniform float bounces;
uniform float reflectionBoost;
uniform bool enableInternal;
uniform float brightness;
uniform float reflectionStrength;
uniform float dispersion;
uniform float internalColorOpacity;
uniform float edgeWidth;
uniform float edgeBrightness;
uniform float edgeWhiteness;
uniform float edgeAlpha;

varying vec3 vWorldPosition;
varying vec3 vLocalNormal;

// CMY colors (subtractive primaries) - saturated for vibrancy
const vec3 CYAN = vec3(0.0, 0.92, 1.0);
const vec3 MAGENTA = vec3(1.0, 0.05, 0.9);
const vec3 YELLOW = vec3(1.0, 0.95, 0.0);
const vec3 DEEP_CYAN = vec3(0.0, 0.58, 0.72);
const vec3 DEEP_MAGENTA = vec3(0.72, 0.0, 0.48);
const vec3 DEEP_YELLOW = vec3(0.96, 0.78, 0.0);
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
  vec3 faceColor = CYAN;
  vec3 deepFaceColor = DEEP_CYAN;
  if (absNormal.x > 0.5) {
    faceColor = YELLOW;
    deepFaceColor = DEEP_YELLOW;
  }
  if (absNormal.y > 0.5) {
    faceColor = MAGENTA;
    deepFaceColor = DEEP_MAGENTA;
  }
  return mix(faceColor, deepFaceColor, colorDarkness);
}

vec3 saturateColor(vec3 color, float amount) {
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luminance), color, amount);
}

float getEdgeFactor(vec3 hitPoint, vec3 normal, vec3 boxHalfSize) {
  vec3 normalizedPoint = abs(hitPoint) / boxHalfSize;
  vec3 tangentMask = 1.0 - abs(normal);
  float tangentEdge = max(
    max(normalizedPoint.x * tangentMask.x, normalizedPoint.y * tangentMask.y),
    normalizedPoint.z * tangentMask.z
  );

  return smoothstep(0.998 - edgeWidth, 0.998, tangentEdge);
}

float getBottomSurfaceEdgeFactor(vec3 hitPoint, vec3 normal, vec3 boxHalfSize) {
  float sideFace = 1.0 - abs(normal.y);
  float bottomEdge = smoothstep(0.986, 0.999, -hitPoint.y / boxHalfSize.y);
  return sideFace * bottomEdge;
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
  float bottomSurfaceEdgeFactor = getBottomSurfaceEdgeFactor(p, entryNormal, boxHalfSize);
  vec3 entryFilterColor = mix(WHITE, getFaceColor(entryNormal), absorptionStrength * 0.95);
  vec3 internalFilterColor = entryFilterColor;
  
  // Initial refraction with dispersion (R G B slightly different IORs)
  float safeIor = max(ior, 0.01);
  float iorR = max(safeIor - dispersion, 0.01);
  float iorG = safeIor;
  float iorB = max(safeIor + dispersion, 0.01);
  
  vec3 rayDirR = refract(viewDir, entryNormal, 1.0 / iorR);
  vec3 rayDirG = refract(viewDir, entryNormal, 1.0 / iorG);
  vec3 rayDirB = refract(viewDir, entryNormal, 1.0 / iorB);
  
  float totalPathLength = 0.0;
  float internalEdgeFactor = 0.0;
  vec3 pG = p;
  vec3 currentRayDirG = rayDirG;

  for (int i = 0; i < 12; i++) {
      if (!enableInternal || float(i) >= bounces) break;
      pG += currentRayDirG * 0.0001;
      vec2 tInner = intersectBox(pG, currentRayDirG, boxHalfSize);
      pG += currentRayDirG * tInner.y;
      vec3 hitNormal = getFaceNormal(pG, boxHalfSize);
      if (i == 0) {
          internalEdgeFactor = getEdgeFactor(pG, hitNormal, boxHalfSize);
      }
      totalPathLength += tInner.y;
      vec3 faceColor = mix(WHITE, getFaceColor(hitNormal), absorptionStrength);
      internalFilterColor *= mix(WHITE, faceColor, reflectionBoost * 0.98);
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
  vec3 filterColor = mix(entryFilterColor, internalFilterColor, internalColorOpacity);
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
  color += directLightColor * internalEdgeFactor * edgeBrightness * (0.12 + fresnel * 0.2 + normalizedLightIntensity * 0.1);
  color = mix(color, max(color, acrylicColor * brightness * 1.08), bottomSurfaceEdgeFactor * 0.35);
  
  color = mix(color, WHITE, 0.015 + internalEdgeFactor * edgeWhiteness);
  float alpha = clamp(opacity + thickness * 0.1 + fresnel * 0.7 + specular * 0.6 + internalEdgeFactor * edgeAlpha, 0.0, 0.98);
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
    colorDarkness: { value: 0.0 },
    saturation: { value: 1.35 },
    bounces: { value: 8.0 },
    reflectionBoost: { value: 1.0 },
    internalColorOpacity: { value: 0.45 },
    enableInternal: { value: true },
    brightness: { value: 1.2 },
    reflectionStrength: { value: 0.85 },
    dispersion: { value: 0.02 },
    edgeWidth: { value: 0.01 },
    edgeBrightness: { value: 1.0 },
    edgeWhiteness: { value: 0.05 },
    edgeAlpha: { value: 0.01 },
    },
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: true,
})

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
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
  colorDarkness: 0.0,
  saturation: 1.35,
  bounces: 8,
  reflectionBoost: 1.0,
  enableInternal: true,
  brightness: 1.2,
  reflectionStrength: 0.85,
  dispersion: 0.02,
  internalColorOpacity: 0.45,
  edgeWidth: 0.01,
  edgeBrightness: 1.0,
  edgeWhiteness: 0.05,
  edgeAlpha: 0.01,
  lightAzimuthDegrees: 135,
  lightElevationDegrees: 35,
  lightDistance: 3,
  lightBrightness: directionalLight.intensity,
  lightWarmth: 0.5,
  ambientBrightness: hemiLight.intensity,
}

const rotationFolder = gui.addFolder('Rotation')
rotationFolder.add(params, 'rotationXDegrees', 0, 360).name('X').step(1)
rotationFolder.add(params, 'rotationYDegrees', 0, 360).name('Y').step(1)
rotationFolder.add(params, 'rotationZDegrees', 0, 360).name('Z').step(1)
rotationFolder.open()

gui.add(params, 'brightness', 0.5, 3.0).name('Brightness').onChange((val: number) => {
  cubeMaterial.uniforms.brightness.value = val
})

gui.add(params, 'ior', 1.0, 2.5).name('IOR').onChange((val: number) => {
  cubeMaterial.uniforms.ior.value = val
})

const materialFolder = gui.addFolder('Material')
materialFolder.add(params, 'opacity', 0.2, 0.9).name('Opacity').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.opacity.value = val
})
materialFolder.add(params, 'absorption', 0.2, 1.0).name('Absorption').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.absorptionStrength.value = val
})
materialFolder.add(params, 'colorDarkness', 0.0, 2.0).name('Color Darkness').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.colorDarkness.value = val
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
materialFolder.add(params, 'internalColorOpacity', 0.0, 1.0).name('Internal Color').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.internalColorOpacity.value = val
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

const edgeFolder = gui.addFolder('Internal Edges')
edgeFolder.add(params, 'edgeWidth', 0.004, 0.06).name('Width').step(0.001).onChange((val: number) => {
  cubeMaterial.uniforms.edgeWidth.value = val
})
edgeFolder.add(params, 'edgeBrightness', 0.0, 2.0).name('Brightness').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.edgeBrightness.value = val
})
edgeFolder.add(params, 'edgeWhiteness', 0.0, 0.2).name('Whiteness').step(0.001).onChange((val: number) => {
  cubeMaterial.uniforms.edgeWhiteness.value = val
})
edgeFolder.add(params, 'edgeAlpha', 0.0, 0.08).name('Alpha').step(0.001).onChange((val: number) => {
  cubeMaterial.uniforms.edgeAlpha.value = val
})
edgeFolder.open()

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
  updateLightBrightness()
}

const updateLightColor = () => {
  const color = params.lightWarmth < 0.5
    ? coolLightColor.clone().lerp(neutralLightColor, params.lightWarmth * 2)
    : neutralLightColor.clone().lerp(warmLightColor, (params.lightWarmth - 0.5) * 2)

  directionalLight.color.copy(color)
  cubeMaterial.uniforms.lightColor.value.copy(color)
}

const updateLightBrightness = () => {
  const distanceFalloff = THREE.MathUtils.clamp(baseLightDistance / params.lightDistance, 0.35, 3)
  const intensity = params.lightBrightness * distanceFalloff

  directionalLight.intensity = intensity
  cubeMaterial.uniforms.lightIntensity.value = intensity
}

const updateAmbientBrightness = () => {
  hemiLight.intensity = params.ambientBrightness
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

updateLightColor()
gui.close()

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
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

window.addEventListener('resize', resize)
resize()
animate()
