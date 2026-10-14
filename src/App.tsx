import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import './App.css'

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [hasScrolled, setHasScrolled] = useState<boolean>(false)

  // Track scroll progress target and smoothed value
  const scrollTargetRef = useRef<number>(0)
  const scrollCurrentRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 1. Scene setup with pure black background
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    let width = window.innerWidth
    let height = window.innerHeight

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 0, 5)

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.3

    // 4. Lights: omnidirectional coverage so all sides look great during orbit
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5)
    keyLight.position.set(6, 8, 7)
    scene.add(keyLight)

    const backLight = new THREE.DirectionalLight(0xffffff, 2.2)
    backLight.position.set(-6, 5, -7)
    scene.add(backLight)

    const fillLight = new THREE.DirectionalLight(0xffeedd, 1.5)
    fillLight.position.set(-7, -4, 5)
    scene.add(fillLight)

    const bottomLight = new THREE.DirectionalLight(0xffffff, 1.2)
    bottomLight.position.set(0, -6, -4)
    scene.add(bottomLight)

    // 5. Load GLB Model
    let model: THREE.Group | null = null
    let baseDistance = 4.2
    let minDistance = 1.6

    const loader = new GLTFLoader()
    loader.load(
      '/estrella.glb',
      (gltf) => {
        model = gltf.scene

        // Center model geometry perfectly at (0, 0, 0)
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())

        model.position.sub(center)
        scene.add(model)

        // Calculate optimal camera framing
        const maxDim = Math.max(size.x, size.y, size.z)
        const fov = camera.fov * (Math.PI / 180)
        baseDistance = Math.max(Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.85, 3.5)
        minDistance = baseDistance * 0.38

        // Initial camera position looking at model center
        camera.position.set(0, 0, baseDistance)
        camera.lookAt(0, 0, 0)

        setLoading(false)
      },
      undefined,
      (error) => {
        console.error('Error cargando estrella.glb:', error)
        setLoading(false)
      }
    )

    // 6. Scroll listener to calculate normalized scroll progress (0 to 1)
    const handleScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if (maxScroll > 0) {
        const progress = clamp(window.scrollY / maxScroll, 0, 1)
        scrollTargetRef.current = progress
        if (progress > 0.02) {
          setHasScrolled(true)
        }
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    // 7. Render & Animation loop
    let animationFrameId: number

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop)

      // Smooth interpolation (lerp) for cinematic response
      scrollCurrentRef.current += (scrollTargetRef.current - scrollCurrentRef.current) * 0.075
      const p = scrollCurrentRef.current

      if (model) {
        // Continuous model rotation driven by scroll
        model.rotation.y = p * Math.PI * 5
        model.rotation.x = Math.sin(p * Math.PI * 2) * 0.35
        model.rotation.z = Math.cos(p * Math.PI * 2) * 0.2
      }

      // Camera choreographies based on scroll progress:
      // Stage 1 (0.00 -> 0.35): Zoom in to the center
      // Stage 2 (0.35 -> 0.60): Zoom back out
      // Stage 3 (0.60 -> 1.00): 360-degree orbit around the 3D model
      if (p <= 0.35) {
        const t = easeInOutCubic(p / 0.35)
        const currentDist = THREE.MathUtils.lerp(baseDistance, minDistance, t)
        camera.position.set(0, 0, currentDist)
      } else if (p <= 0.6) {
        const t = easeInOutCubic((p - 0.35) / 0.25)
        const currentDist = THREE.MathUtils.lerp(minDistance, baseDistance, t)
        camera.position.set(0, 0, currentDist)
      } else {
        const t = easeInOutCubic((p - 0.6) / 0.4)
        const orbitAngle = t * Math.PI * 2
        // Orbit in a circle around (0, 0, 0)
        const x = Math.sin(orbitAngle) * baseDistance
        const z = Math.cos(orbitAngle) * baseDistance
        // Gentle height curve for dynamic perspective
        const y = Math.sin(t * Math.PI) * (baseDistance * 0.25)
        camera.position.set(x, y, z)
      }

      // Requirement: The camera must always look at the 3D model center (0, 0, 0)
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }

    renderLoop()

    // 8. Resize handler
    const handleResize = () => {
      width = window.innerWidth
      height = window.innerHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [])

  return (
    <div className="page-wrapper">
      {loading && <div className="loading-text">Cargando modelo 3D...</div>}

      {/* Fixed 3D Canvas in viewport */}
      <canvas ref={canvasRef} className="canvas-fixed" />

      {/* Subtle indicator that fades after initial scroll */}
      <div
        className="scroll-indicator"
        style={{ opacity: hasScrolled ? 0 : 0.85 }}
      >
        <div className="scroll-mouse">
          <div className="scroll-wheel"></div>
        </div>
        <span>Haz scroll para interactuar</span>
      </div>
    </div>
  )
}

export default App
