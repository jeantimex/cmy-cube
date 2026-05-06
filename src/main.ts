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
scene.background = new THREE.Color(0xffffff)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setClearColor(0xffffff, 1)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
mount.appendChild(renderer.domElement)

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
camera.position.set(3.2, 2.35, 4)
camera.lookAt(0, 0, 0)

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

  varying vec3 vWorldPosition;

  // CMY colors (subtractive primaries)
  const vec3 CYAN = vec3(0.0, 1.0, 1.0);
  const vec3 MAGENTA = vec3(1.0, 0.0, 1.0);
  const vec3 YELLOW = vec3(1.0, 1.0, 0.0);
  const vec3 WHITE = vec3(1.0, 1.0, 1.0);

  // Ray-box intersection for a box centered at origin with half-size
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

  // Get face normal from hit point (in local space)
  vec3 getFaceNormal(vec3 hitPoint, vec3 boxHalfSize) {
    vec3 p = hitPoint / boxHalfSize;
    vec3 absP = abs(p);
    float maxComp = max(max(absP.x, absP.y), absP.z);

    if (absP.x >= maxComp - 0.001) return vec3(sign(p.x), 0.0, 0.0);
    if (absP.y >= maxComp - 0.001) return vec3(0.0, sign(p.y), 0.0);
    return vec3(0.0, 0.0, sign(p.z));
  }

  // Get CMY color for a face based on its normal
  vec3 getFaceColor(vec3 normal) {
    vec3 absNormal = abs(normal);
    // X-axis faces (left/right) = Yellow
    if (absNormal.x > 0.5) return YELLOW;
    // Y-axis faces (top/bottom) = Magenta
    if (absNormal.y > 0.5) return MAGENTA;
    // Z-axis faces (front/back) = Cyan
    return CYAN;
  }

  void main() {
    // Transform ray to local (object) space for axis-aligned box intersection
    vec3 localCameraPos = (inverseModelMatrix * vec4(cameraPos, 1.0)).xyz;
    vec3 localWorldPos = (inverseModelMatrix * vec4(vWorldPosition, 1.0)).xyz;

    vec3 rayOrigin = localCameraPos;
    vec3 rayDir = normalize(localWorldPos - localCameraPos);
    vec3 boxHalfSize = vec3(cubeSize * 0.5);

    // Find intersection with outer box
    vec2 tOuter = intersectBox(rayOrigin, rayDir, boxHalfSize);

    if (tOuter.x > tOuter.y || tOuter.y < 0.0) {
      discard;
    }

    // Entry and exit points (in local space)
    vec3 entryPoint = rayOrigin + rayDir * max(tOuter.x, 0.0);
    vec3 exitPoint = rayOrigin + rayDir * tOuter.y;

    // Get face colors at entry and exit
    vec3 entryNormal = getFaceNormal(entryPoint, boxHalfSize);
    vec3 exitNormal = getFaceNormal(exitPoint, boxHalfSize);

    vec3 entryColor = getFaceColor(entryNormal);
    vec3 exitColor = getFaceColor(exitNormal);

    // Subtractive color mixing: multiply the colors
    // Start with white light, filter through each face
    vec3 finalColor = WHITE * entryColor * exitColor;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

const cubeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    cameraPos: { value: camera.position },
    cubeSize: { value: 2.0 },
    inverseModelMatrix: { value: new THREE.Matrix4() },
  },
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide,
})

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  cubeMaterial,
)
scene.add(cube)

// GUI for rotation controls
const gui = new GUI()
const params = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
}

const rotationFolder = gui.addFolder('Rotation')
rotationFolder.add(params, 'rotationX', -Math.PI, Math.PI).name('X').step(0.01)
rotationFolder.add(params, 'rotationY', -Math.PI, Math.PI).name('Y').step(0.01)
rotationFolder.add(params, 'rotationZ', -Math.PI, Math.PI).name('Z').step(0.01)
rotationFolder.open()

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
