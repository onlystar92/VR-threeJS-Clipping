import './index.css'

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { VRButton } from 'three/addons/webxr/VRButton.js'
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js'
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js'
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js'

let container
let camera, scene, renderer
let controller1, controller2
let controllerGrip1, controllerGrip2

let raycaster

const intersected = []
const tempMatrix = new THREE.Matrix4()

let controls, tControls, group, groupPlanes

let planes = []
let objectSelected
let joinMesh = false
let clippingOn = false

const pointer = new THREE.Vector2()

const params = {
  clipping: () => clippingObj(),
  negated: () => negatedClipping(),
  addPlane: () => createPlane(),
  hidePlanes: () => hidePlanes(),
  rotation: 1,
  scale: 1,
  joinMesh: () => joinMeshFn(),
}

init()
animate()

function init() {
  container = document.createElement('div')
  document.body.appendChild(container)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xa5bdff)

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10)
  camera.position.set(0, 1.6, 3)

  controls = new OrbitControls(camera, container)
  controls.target.set(0, 1.6, 0)
  controls.update()

  const floorGeometry = new THREE.PlaneGeometry(4, 4)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 1.0,
    metalness: 0.0,
  })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  scene.add(new THREE.AmbientLight(0xffffff, 0.5))

  const directionalLight = new THREE.DirectionalLight(0xffffff)
  directionalLight.position.set(-5, 3, -1)
  // directionalLight.position.copy(camera.position)
  // directionalLight.castShadow = true
  scene.add(directionalLight)

  const directionalLight2 = new THREE.DirectionalLight(0xffffff)
  directionalLight2.position.set(5, 3, 1)
  scene.add(directionalLight2)

  group = new THREE.Group()
  group.name = 'objects'
  scene.add(group)

  groupPlanes = new THREE.Group()
  groupPlanes.name = 'planes'
  scene.add(groupPlanes)

  // Renderer

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.shadowMap.enabled = true
  renderer.localClippingEnabled = true
  renderer.xr.enabled = true
  container.appendChild(renderer.domElement)

  document.body.appendChild(VRButton.createButton(renderer))

  tControls = new TransformControls(camera, renderer.domElement)
  tControls.addEventListener('change', render)

  tControls.addEventListener('dragging-changed', function (event) {
    controls.enabled = !event.value
  })

  scene.add(tControls)

  // GUI
  const gui = new GUI()

  gui.add(params, 'addPlane')
  gui.add(params, 'hidePlanes')
  gui.add(params, 'clipping')
  gui.add(params, 'negated')
  gui.add(params, 'joinMesh')
  gui.add(params, 'scale', -5.0, 5.0).onChange(() => {
    objectSelected.scale.x = params.scale
    objectSelected.scale.y = params.scale
    objectSelected.scale.z = params.scale
  })
  gui.domElement.style.visibility = 'hidden'

  let groupGui = new InteractiveGroup(renderer, camera)
  scene.add(groupGui)

  const mesh = new HTMLMesh(gui.domElement)
  mesh.position.x = -0.75
  mesh.position.y = 1.5
  mesh.position.z = -0.5
  mesh.rotation.y = Math.PI / 4
  mesh.scale.setScalar(2)
  groupGui.add(mesh)

  // controllers

  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)])
  const line = new THREE.Line(geometry)

  controller1 = renderer.xr.getController(0)
  // controller1.addEventListener('selectstart', onSelectStart)
  // controller1.addEventListener('selectend', onSelectEnd)
  scene.add(controller1)

  controller2 = renderer.xr.getController(1)
  controller2.addEventListener('selectstart', onSelectStart)
  controller2.addEventListener('selectend', onSelectEnd)
  scene.add(controller2)

  const controllerModelFactory = new XRControllerModelFactory()

  controllerGrip1 = renderer.xr.getControllerGrip(0)
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1))
  scene.add(controllerGrip1)

  controllerGrip2 = renderer.xr.getControllerGrip(1)
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2))
  scene.add(controllerGrip2)

  line.name = 'line'
  line.scale.z = 5

  // controller1.add(line.clone())
  controller2.add(line.clone())

  raycaster = new THREE.Raycaster()

  window.addEventListener('resize', onWindowResize)
}

let mesh, position

// Load the file and get the geometry
document.getElementById('file').onchange = (e) => {
  const files = e.target.files

  if (files.length > 0) {
    for (var i = 0; i < files.length; i++) {
      loadFile(files[i])
    }
  }
}

/**
 * Load the imported file and create the mesh from the file
 * @param {File} file The imported file
 */
const loadFile = (file) => {
  let reader = new FileReader()

  reader.onload = () => {
    const geometry = new STLLoader().parse(reader.result)

    createMeshFromFile(geometry)
  }

  reader.readAsArrayBuffer(file)
}

/**
 * Creates the mesh from the file
 * @param {THREE.BufferGeometry} geometry
 */
const createMeshFromFile = (geometry) => {
  if (mesh) {
    scene.remove(mesh)
  }

  const material = new THREE.MeshStandardMaterial({
    // color: '#C7AC96',
    color: '#a08a7a',
    side: THREE.DoubleSide,
  })
  mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'objects'

  // saves the position of the first element
  if (!position) {
    position = getCenter(mesh)
  }

  mesh.position.set(1, 1, -1)

  group.add(mesh)
}

/**
 * Joins the imported object with the planes to handle them together
 */
const joinMeshFn = () => {
  joinMesh = !joinMesh
}

/**
 * Hides all the planes in the scene
 */
const hidePlanes = () => {
  const planesGeometry = group.children.filter((object) => object.name.startsWith('plane'))

  planesGeometry.forEach((item) => (item.visible = !item.visible))
}

/**
 * Creates the plane to add to the scene
 */
const createPlane = () => {
  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
  const material = new THREE.MeshStandardMaterial({
    color: '#38382f',
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'plane'

  mesh.position.set(1, 1, -1)

  group.add(mesh)
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()

  renderer.setSize(window.innerWidth, window.innerHeight)
}

function onSelectStart(event) {
  if (!clippingOn) {
    const controller = event.target

    const intersections = getIntersections(controller)

    if (intersections.length > 0) {
      const intersection = intersections[0]

      if (joinMesh) {
        group.children.forEach((item) => {
          item.material.emissive.b = 1
        })

        controller.attach(group)
        controller.userData.selected = group
      } else {
        const object = intersection.object
        object.material.emissive.b = 1

        controller.attach(object)
        controller.userData.selected = object

        objectSelected = object
      }
    }
  }
}

function onSelectEnd(event) {
  const controller = event.target

  if (controller.userData.selected !== undefined) {
    const object = controller.userData.selected
    if (object.type === 'Mesh') {
      object.material.emissive.b = 0
      group.attach(object)
    } else {
      object.children.forEach((item) => {
        item.material.emissive.b = 0
      })
      scene.attach(group)
    }

    controller.userData.selected = undefined
  }
}

function getIntersections(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld)

  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld)
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix)

  return raycaster.intersectObjects(group.children, false)
}

function intersectObjects(controller) {
  // Do not highlight when already selected

  if (controller.userData.selected !== undefined) return

  const line = controller.getObjectByName('line')
  const intersections = getIntersections(controller)

  if (intersections.length > 0) {
    const intersection = intersections[0]

    const object = intersection.object
    object.material.emissive.r = 1
    intersected.push(object)

    line.scale.z = intersection.distance
  } else {
    line.scale.z = 5
  }
}

function cleanIntersected() {
  while (intersected.length) {
    const object = intersected.pop()
    object.material.emissive.r = 0
  }
}

function animate() {
  renderer.setAnimationLoop(render)
}

function render() {
  cleanIntersected()

  intersectObjects(controller2)
  // intersectObjects(controller2)

  renderer.render(scene, camera)
}

/**
 * Function to clipping the object with the planes in the scene
 */
const clippingObj = () => {
  clippingOn = !clippingOn

  planes = []

  const planesGeometry = group.children.filter((object) => object.name.startsWith('plane'))
  const normals = []
  const centers = []

  planesGeometry.forEach((item) => {
    const plane = new THREE.Plane()
    const normal = new THREE.Vector3()
    const point = new THREE.Vector3()

    // Gets the centers of the planes
    const center = getCenter(item)
    centers.push(center)

    // Creates the THREE.Plane from THREE.PlaneGeometry
    normal.set(0, 0, 1).applyQuaternion(item.quaternion)
    point.copy(item.position)
    plane.setFromNormalAndCoplanarPoint(normal, point)

    // Saves the normals of the planes
    normals.push(plane.normal)

    planes.push(plane)
  })

  // Calculates the barycenter of the planes
  const pointx = centers.reduce((prev, curr) => prev + curr.x, 0) / centers.length
  const pointy = centers.reduce((prev, curr) => prev + curr.y, 0) / centers.length
  const pointz = centers.reduce((prev, curr) => prev + curr.z, 0) / centers.length
  const barycenter = new THREE.Vector3(pointx, pointy, pointz)

  const distances = []

  // Gets the distance from the plane and the barycenter
  planes.forEach((item) => {
    distances.push(item.distanceToPoint(barycenter))
  })

  // Negates only the plane with negative distance
  distances.forEach((distance, index) => {
    if (distance < 0) {
      planes[index].negate()
    }
  })

  // Creates the clipping object with colors
  // addColorToClippedMesh(scene, group, planes, planes, false)

  group.children.map((object) => {
    if (object.name !== 'plane') {
      if (!object.material.clippingPlanes || object.material.clippingPlanes.length === 0) {
        object.material.clippingPlanes = planes
        object.material.clipIntersection = false
      } else {
        object.material.clippingPlanes = []
      }
    }
  })
}

/**
 * Function to negate the clipping with the same planes
 */
const negatedClipping = () => {
  planes.forEach((item) => item.negate())

  group.children.map((object) => {
    object.material.clipIntersection = !object.material.clipIntersection
  })
}

/**
 * Creates a clipping object
 * @param {THREE.BufferGeometry} geometry The geometry of the mesh
 * @param {THREE.Plane} plane The plane to clip the mesh
 * @param {THREE.Vector3} positionVector The vector to position the mesh
 * @param {Number} renderOrder The render order of the mesh
 * @returns THREE.Group of meshes
 */
export const createPlaneStencilGroup = (name, position, geometry, plane, renderOrder) => {
  const group = new THREE.Group()
  const baseMat = new THREE.MeshBasicMaterial()
  baseMat.depthWrite = false
  baseMat.depthTest = false
  baseMat.colorWrite = false
  baseMat.stencilWrite = true
  baseMat.stencilFunc = THREE.AlwaysStencilFunc

  // back faces
  const mat0 = baseMat.clone()
  mat0.side = THREE.BackSide
  mat0.clippingPlanes = [plane]
  mat0.stencilFail = THREE.IncrementWrapStencilOp
  mat0.stencilZFail = THREE.IncrementWrapStencilOp
  mat0.stencilZPass = THREE.IncrementWrapStencilOp

  const mesh0 = new THREE.Mesh(geometry, mat0)
  mesh0.name = 'back'
  mesh0.renderOrder = renderOrder
  mesh0.position.set(position.x, position.y, position.z)

  group.add(mesh0)

  // front faces
  const mat1 = baseMat.clone()
  mat1.side = THREE.FrontSide
  mat1.clippingPlanes = [plane]
  mat1.stencilFail = THREE.DecrementWrapStencilOp
  mat1.stencilZFail = THREE.DecrementWrapStencilOp
  mat1.stencilZPass = THREE.DecrementWrapStencilOp

  const mesh1 = new THREE.Mesh(geometry, mat1)
  mesh1.name = 'front'
  mesh1.renderOrder = renderOrder
  mesh1.position.set(position.x, position.y, position.z)

  group.add(mesh1)
  group.name = 'planeStencilGroup' + name

  return group
}

/**
 * Adds the color to the clipped mesh
 * @param {THREE.Scene} scene The scene to add the mesh to
 * @param {THREE.Group} group The group to add the mesh to
 * @param {THREE.Vector} positionVector The vector to position the mesh
 * @param {THREE.Plane} planesNegated The list of the negated planes
 * @param {THREE.Plane} planes The list of the planes
 */
export const addColorToClippedMesh = (scene, group, planesNegated, planes, negatedClick) => {
  let object = new THREE.Group()
  object.name = 'ClippingGroup'
  scene.add(object)

  let y = 0

  group.children.map((mesh) => {
    if (mesh.name !== 'plane') {
      for (let i = 0; i < planesNegated.length; i++) {
        const planeObj = planesNegated[i]
        const stencilGroup = createPlaneStencilGroup(mesh.name, mesh.position, mesh.geometry, planeObj, y)

        object.add(stencilGroup)

        const cap = createPlaneColored(planes, planeObj, mesh.material.color, y + 0.1, negatedClick)
        cap.name = 'Clipping' + mesh.name
        scene.add(cap)

        planeObj.coplanarPoint(cap.position)
        cap.lookAt(cap.position.x - planeObj.normal.x, cap.position.y - planeObj.normal.y, cap.position.z - planeObj.normal.z)
        y++
      }

      mesh.material.clippingPlanes = planesNegated
    }
  })
}

const createPlaneColored = (planes, plane, color, renderOrder, negatedClick) => {
  const capMat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: 0.1,
    roughness: 0.75,
    clippingPlanes: planes.filter((p) => p !== plane),
    clipIntersection: negatedClick,
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  })
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), capMat)
  // clear the stencil buffer
  cap.onAfterRender = function (renderer) {
    renderer.clearStencil()
  }

  cap.renderOrder = renderOrder
  return cap
}

const getCenter = (object) => {
  const geometry = mesh.geometry
  geometry.computeBoundingBox()

  const center = new THREE.Vector3()
  geometry.boundingBox.getCenter(center)

  mesh.localToWorld(center)
  return center
}
