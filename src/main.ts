import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false }),
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

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const fragmentShader = `
  uniform vec3 cameraPos;
  uniform float cubeSize;
  uniform mat4 inverseModelMatrix;
  uniform float ior;

  varying vec3 vWorldPosition;

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
    // Yellow on X, Magenta on Y, Cyan on Z
    if (absNormal.x > 0.5) return YELLOW;
    if (absNormal.y > 0.5) return MAGENTA;
    return CYAN;
  }

  void main() {
    vec3 localCameraPos = (inverseModelMatrix * vec4(cameraPos, 1.0)).xyz;
    vec3 localWorldPos = (inverseModelMatrix * vec4(vWorldPosition, 1.0)).xyz;

    vec3 rayOrigin = localCameraPos;
    vec3 viewDir = normalize(localWorldPos - localCameraPos);
    vec3 boxHalfSize = vec3(cubeSize * 0.5);

    vec2 tOuter = intersectBox(rayOrigin, viewDir, boxHalfSize);
    if (tOuter.x > tOuter.y || tOuter.y < 0.0) {
      discard;
    }

    vec3 p = rayOrigin + viewDir * max(tOuter.x, 0.0);
    vec3 n = getFaceNormal(p, boxHalfSize);
    
    // 1. Initial filter from front face
    vec3 filterColor = WHITE * getFaceColor(n);

    // 2. Refract into the cube
    vec3 currentRayDir = refract(viewDir, n, 1.0 / ior);
    
    // Trace up to 4 internal bounces
    for (int i = 0; i < 4; i++) {
        p += currentRayDir * 0.001;
        vec2 tInner = intersectBox(p, currentRayDir, boxHalfSize);
        p += currentRayDir * tInner.y;
        vec3 nextN = getFaceNormal(p, boxHalfSize);
        
        filterColor *= getFaceColor(nextN);
        
        vec3 nextRayDir = refract(currentRayDir, -nextN, ior);
        if (length(nextRayDir) > 0.1) {
            currentRayDir = nextRayDir;
            break;
        } else {
            currentRayDir = reflect(currentRayDir, -nextN);
        }
    }

    gl_FragColor = vec4(filterColor, 1.0);
  }
`

const cubeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    cameraPos: { value: camera.position },
    cubeSize: { value: 2.0 },
    inverseModelMatrix: { value: new THREE.Matrix4() },
    ior: { value: 1.49 }, // Standard acrylic IOR
  },
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide,
})

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  cubeMaterial,
)
cube.castShadow = true
scene.add(cube)

// GUI for rotation controls
const gui = new GUI()
const params = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  ior: 1.49,
}

const rotationFolder = gui.addFolder('Rotation')
rotationFolder.add(params, 'rotationX', -Math.PI, Math.PI).name('X').step(0.01)
rotationFolder.add(params, 'rotationY', -Math.PI, Math.PI).name('Y').step(0.01)
rotationFolder.add(params, 'rotationZ', -Math.PI, Math.PI).name('Z').step(0.01)
rotationFolder.open()

gui.add(params, 'ior', 1.0, 2.0).name('IOR').onChange((val: number) => {
  cubeMaterial.uniforms.ior.value = val
})

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

  // Apply rotation from GUI
  cube.rotation.x = params.rotationX
  cube.rotation.y = params.rotationY
  cube.rotation.z = params.rotationZ

  // Update uniforms
  cube.updateMatrixWorld()
  cubeMaterial.uniforms.cameraPos.value.copy(camera.position)
  cubeMaterial.uniforms.inverseModelMatrix.value.copy(cube.matrixWorld).invert()

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

window.addEventListener('resize', resize)
resize()
animate()
