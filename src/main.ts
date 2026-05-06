import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import GUI from 'lil-gui'

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
renderer.shadowMap.enabled = true
mount.appendChild(renderer.domElement)

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
const desktopCameraPosition = new THREE.Vector3(3.2, 2.35, 4)
const mobileCameraPosition = new THREE.Vector3(3.8, 3.4, 9.2)

camera.position.copy(desktopCameraPosition)
camera.lookAt(0, 0, 0)

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3)
hemiLight.position.set(0, 20, 0)
scene.add(hemiLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 3)
directionalLight.position.set(0, 20, 10)
directionalLight.castShadow = true
directionalLight.shadow.camera.top = 2
directionalLight.shadow.camera.bottom = -2
directionalLight.shadow.camera.left = -2
directionalLight.shadow.camera.right = 2
scene.add(directionalLight)

const groundUniforms = {
  lightDirection: { value: directionalLight.position.clone().normalize() },
  cubeSize: { value: 2.0 },
  inverseModelMatrix: { value: new THREE.Matrix4() },
  absorptionStrength: { value: 0.62 },
  brightness: { value: 1.2 },
  innerBrightness: { value: 1.5 },
  outerDarkness: { value: 0.1 },
}

const groundMaterial = new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false })
groundMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.lightDirection = groundUniforms.lightDirection
  shader.uniforms.cubeSize = groundUniforms.cubeSize
  shader.uniforms.inverseModelMatrix = groundUniforms.inverseModelMatrix
  shader.uniforms.absorptionStrength = groundUniforms.absorptionStrength
  shader.uniforms.brightness = groundUniforms.brightness
  shader.uniforms.innerBrightness = groundUniforms.innerBrightness
  shader.uniforms.outerDarkness = groundUniforms.outerDarkness

  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
    varying vec3 vWorldPosition;`
  )
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    vWorldPosition = worldPosition.xyz;`
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
    uniform vec3 lightDirection;
    uniform float cubeSize;
    uniform mat4 inverseModelMatrix;
    uniform float absorptionStrength;
    uniform float brightness;
    uniform float innerBrightness;
    uniform float outerDarkness;
    varying vec3 vWorldPosition;

    const vec3 CYAN = vec3(0.0, 1.0, 1.0);
    const vec3 MAGENTA = vec3(1.0, 0.0, 1.0);
    const vec3 YELLOW = vec3(1.0, 1.0, 0.0);
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

    vec3 traceShadow(vec3 rayOrigin, vec3 rayDir, vec3 boxHalfSize, float absStrength, out float bounceCount) {
      vec3 p = rayOrigin;
      vec3 filterColor = WHITE;
      bounceCount = 0.0;
      vec2 t = intersectBox(p, rayDir, boxHalfSize);
      if (t.x > t.y || t.y < 0.0) return WHITE;
      p = rayOrigin + rayDir * max(t.x, 0.0);
      vec3 n = getFaceNormal(p, boxHalfSize);
      vec3 currentRayDir = refract(rayDir, n, 1.0 / 1.49);
      filterColor *= mix(WHITE, getFaceColor(n), absStrength);
      for (int i = 0; i < 4; i++) {
        p += currentRayDir * 0.001;
        vec2 tInner = intersectBox(p, currentRayDir, boxHalfSize);
        p += currentRayDir * tInner.y;
        vec3 hitNormal = getFaceNormal(p, boxHalfSize);
        filterColor *= mix(WHITE, getFaceColor(hitNormal), absStrength);
        vec3 exitRayDir = refract(currentRayDir, -hitNormal, 1.49);
        if (length(exitRayDir) > 0.1) break; 
        currentRayDir = reflect(currentRayDir, -hitNormal);
        bounceCount += 1.0;
      }
      return filterColor;
    }`
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
    vec3 localPos = (inverseModelMatrix * vec4(vWorldPosition, 1.0)).xyz;
    vec3 localLightDir = normalize((inverseModelMatrix * vec4(lightDirection, 0.0)).xyz);
    vec3 boxHalfSize = vec3(cubeSize * 0.5);
    vec2 t = intersectBox(localPos, localLightDir, boxHalfSize);
    if (t.x < t.y && t.y > 0.0) {
      float bouncesNum = 0.0;
      vec3 shadowFilter = traceShadow(localPos, localLightDir, boxHalfSize, absorptionStrength, bouncesNum);
      
      vec3 result;
      if (bouncesNum < 0.5) {
        result = shadowFilter * brightness * innerBrightness;
      } else {
        result = mix(vec3(outerDarkness), shadowFilter * brightness, 0.2);
      }
      
      gl_FragColor.rgb *= result;
    }`
  )
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  groundMaterial,
)
ground.rotation.x = -Math.PI / 2
ground.position.y = -1
ground.receiveShadow = true
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

varying vec3 vWorldPosition;
varying vec3 vLocalNormal;

// CMY colors (subtractive primaries)
const vec3 CYAN = vec3(0.0, 1.0, 1.0);
const vec3 MAGENTA = vec3(1.0, 0.0, 1.0);
const vec3 YELLOW = vec3(1.0, 1.0, 0.0);
const vec3 WHITE = vec3(1.0, 1.0, 1.0);

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
  vec3 filterColor = mix(WHITE, getFaceColor(entryNormal), absorptionStrength);
  vec3 currentRayDir = refract(viewDir, entryNormal, 1.0 / ior);
  float totalPathLength = 0.0;

  for (int i = 0; i < 12; i++) {
      if (!enableInternal || float(i) >= bounces) break;
      p += currentRayDir * 0.0001;
      vec2 tInner = intersectBox(p, currentRayDir, boxHalfSize);
      p += currentRayDir * tInner.y;
      vec3 hitNormal = getFaceNormal(p, boxHalfSize);
      totalPathLength += tInner.y;
      vec3 faceColor = mix(WHITE, getFaceColor(hitNormal), absorptionStrength);
      filterColor *= mix(WHITE, faceColor, reflectionBoost);
      vec3 exitRayDir = refract(currentRayDir, -hitNormal, ior);
      if (length(exitRayDir) > 0.1) {
          currentRayDir = exitRayDir;
          break;
      } else {
          currentRayDir = reflect(currentRayDir, -hitNormal);
      }
  }

  vec3 vOut = -viewDir;
  vec3 lightingNormal = normalize(vLocalNormal);
  float lambert = max(dot(lightingNormal, localLightDir), 0.0);
  float fresnel = pow(1.0 - max(dot(lightingNormal, vOut), 0.0), 3.0);
  vec3 halfDir = normalize(localLightDir + vOut);
  float specular = pow(max(dot(lightingNormal, halfDir), 0.0), 120.0);
  float bevelCatch = pow(max(dot(lightingNormal, localLightDir), 0.0), 36.0);

  float thickness = clamp(totalPathLength / cubeSize, 0.0, 1.5);
  vec3 acrylicColor = mix(WHITE, filterColor, 0.7 + thickness * 0.25);
  acrylicColor = saturateColor(acrylicColor, saturation);

  float softLight = 0.5 + lambert * 0.5;
  vec3 color = acrylicColor * softLight * brightness;
  color += WHITE * (fresnel * 0.4 + specular * 0.7 + bevelCatch * 0.2);
  color = mix(color, WHITE, 0.02);
  float alpha = clamp(opacity + thickness * 0.15 + fresnel * 0.4 + specular * 0.3, 0.0, 0.98);
  gl_FragColor = vec4(color, alpha);
}
`

const cubeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    cameraPos: { value: camera.position },
    lightDirection: { value: directionalLight.position.clone().normalize() },
    cubeSize: { value: 2.0 },
    inverseModelMatrix: { value: new THREE.Matrix4() },
    ior: { value: 1.49 },
    opacity: { value: 0.58 },
    absorptionStrength: { value: 0.62 },
    saturation: { value: 1.25 },
    bounces: { value: 8.0 },
    reflectionBoost: { value: 1.0 },
    enableInternal: { value: true },
    brightness: { value: 1.2 },
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
cube.castShadow = true
scene.add(cube)

const gui = new GUI()
const params = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  ior: 1.49,
  opacity: 0.58,
  absorption: 0.62,
  saturation: 1.25,
  bounces: 8,
  reflectionBoost: 1.0,
  enableInternal: true,
  brightness: 1.2,
  innerBrightness: 1.5,
  outerDarkness: 0.1,
  lightX: 0,
  lightY: 20,
  lightZ: 10,
}

const rotationFolder = gui.addFolder('Rotation')
rotationFolder.add(params, 'rotationX', -Math.PI, Math.PI).name('X').step(0.01)
rotationFolder.add(params, 'rotationY', -Math.PI, Math.PI).name('Y').step(0.01)
rotationFolder.add(params, 'rotationZ', -Math.PI, Math.PI).name('Z').step(0.01)
rotationFolder.open()

gui.add(params, 'brightness', 0.5, 3.0).name('Brightness').onChange((val: number) => {
  cubeMaterial.uniforms.brightness.value = val
  groundUniforms.brightness.value = val
})

gui.add(params, 'ior', 1.0, 2.0).name('IOR').onChange((val: number) => {
  cubeMaterial.uniforms.ior.value = val
})

const acrylicFolder = gui.addFolder('Acrylic')
acrylicFolder.add(params, 'opacity', 0.2, 0.9).name('Opacity').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.opacity.value = val
})
acrylicFolder.add(params, 'absorption', 0.2, 1.0).name('Absorption').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.absorptionStrength.value = val
  groundUniforms.absorptionStrength.value = val
})
acrylicFolder.add(params, 'saturation', 0.6, 1.8).name('Saturation').step(0.01).onChange((val: number) => {
  cubeMaterial.uniforms.saturation.value = val
})
acrylicFolder.open()

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

const shadowFolder = gui.addFolder('Shadows')
shadowFolder.add(params, 'innerBrightness', 0.5, 3.0).name('Inner Brightness').onChange((val: number) => {
  groundUniforms.innerBrightness.value = val
})
shadowFolder.add(params, 'outerDarkness', 0.0, 0.5).name('Outer Darkness').onChange((val: number) => {
  groundUniforms.outerDarkness.value = val
})
shadowFolder.open()

const updateLight = () => {
  directionalLight.position.set(params.lightX, params.lightY, params.lightZ)
  const dir = directionalLight.position.clone().normalize()
  cubeMaterial.uniforms.lightDirection.value.copy(dir)
  groundUniforms.lightDirection.value.copy(dir)
}

const lightFolder = gui.addFolder('Light Direction')
lightFolder.add(params, 'lightX', -20, 20).name('X').step(0.1).onChange(updateLight)
lightFolder.add(params, 'lightY', -20, 20).name('Y').step(0.1).onChange(updateLight)
lightFolder.add(params, 'lightZ', -20, 20).name('Z').step(0.1).onChange(updateLight)
lightFolder.open()

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.enablePan = false
controls.target.set(0, 0, 0)
controls.update()

function resize() {
  const { clientWidth, clientHeight } = mount
  const isNarrow = clientWidth < 640
  camera.aspect = clientWidth / clientHeight
  camera.position.copy(isNarrow ? mobileCameraPosition : desktopCameraPosition)
  camera.lookAt(controls.target)
  camera.updateProjectionMatrix()
  renderer.setSize(clientWidth, clientHeight, false)
  if (isNarrow) {
    gui.close()
  } else {
    gui.open()
  }
}

function animate() {
  controls.update()
  cube.rotation.x = params.rotationX
  cube.rotation.y = params.rotationY
  cube.rotation.z = params.rotationZ
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
