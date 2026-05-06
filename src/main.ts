import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

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

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  [
    new THREE.MeshBasicMaterial({ color: 0xffff00 }), // right
    new THREE.MeshBasicMaterial({ color: 0xffff00 }), // left
    new THREE.MeshBasicMaterial({ color: 0xff00ff }), // top
    new THREE.MeshBasicMaterial({ color: 0xff00ff }), // bottom
    new THREE.MeshBasicMaterial({ color: 0x31b7c4 }), // front
    new THREE.MeshBasicMaterial({ color: 0x31b7c4 }), // back
  ],
)
scene.add(cube)

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
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

window.addEventListener('resize', resize)
resize()
animate()
