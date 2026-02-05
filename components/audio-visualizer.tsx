"use client"

import { useRef, useMemo, useEffect, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

interface ColorTheme {
  name: string
  primary: string
  accent: string
  particles: string
}

const COLOR_THEMES: ColorTheme[] = [
  { name: "Neon", primary: "#ff1a5c", accent: "#c084fc", particles: "#3b82f6" },
  { name: "Ocean", primary: "#06b6d4", accent: "#0ea5e9", particles: "#22d3ee" },
  { name: "Sunset", primary: "#f97316", accent: "#fbbf24", particles: "#ef4444" },
  { name: "Forest", primary: "#22c55e", accent: "#84cc16", particles: "#10b981" },
  { name: "Violet", primary: "#a855f7", accent: "#ec4899", particles: "#6366f1" },
]

interface AudioAnalyzerData {
  analyser: AnalyserNode
  dataArray: Uint8Array
}

function useAudioAnalyzer(isListening: boolean): AudioAnalyzerData | null {
  const [analyzerData, setAnalyzerData] = useState<AudioAnalyzerData | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!isListening) {
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
        setAnalyzerData(null)
      }
      return
    }

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const audioContext = new AudioContext()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8

        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        audioContextRef.current = audioContext

        setAnalyzerData({ analyser, dataArray })
      } catch (err) {
        console.error("Error accessing microphone:", err)
      }
    }

    initAudio()

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [isListening])

  return analyzerData
}

// Helper: get smoothed frequency bands
function getFrequencies(analyzerData: AudioAnalyzerData | null, count: number, time: number): number[] {
  const frequencies: number[] = []
  if (analyzerData) {
    analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
    for (let i = 0; i < count; i++) {
      const idx = Math.floor((i / count) * analyzerData.dataArray.length)
      frequencies.push(analyzerData.dataArray[idx] / 255)
    }
  } else {
    for (let i = 0; i < count; i++) {
      frequencies.push(
        (Math.sin(time * 1.8 + i * 0.3) * 0.3 +
          Math.sin(time * 2.7 + i * 0.15) * 0.2 +
          Math.cos(time * 1.2 + i * 0.4) * 0.15 +
          0.65) * 0.5
      )
    }
  }
  return frequencies
}

function getBass(analyzerData: AudioAnalyzerData | null, time: number): number {
  if (analyzerData) {
    analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
    let bass = 0
    const bassEnd = Math.floor(analyzerData.dataArray.length * 0.1)
    for (let i = 0; i < bassEnd; i++) {
      bass += analyzerData.dataArray[i] / 255
    }
    return bass / bassEnd
  }
  return 0.5 + Math.sin(time * 2) * 0.3
}

// Outer symmetrical frequency bars
function SymmetricBars({
  analyzerData,
  mousePos,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  theme: ColorTheme
}) {
  const groupRef = useRef<THREE.Group>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([])
  const count = 32

  const barData = useMemo(() => {
    const data: { angle: number }[] = []
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI + (side === 1 ? Math.PI : 0)
        data.push({ angle })
      }
    }
    return data
  }, [])

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const frequencies = getFrequencies(analyzerData, count, time)
    const radius = 4.5 + mousePos.y * 0.5

    meshesRef.current.forEach((mesh, idx) => {
      if (!mesh) return
      const { angle } = barData[idx]
      const freqIdx = idx % count
      const freq = frequencies[freqIdx]
      const height = 0.2 + freq * 4

      const adjustedAngle = angle + mousePos.x * 0.3
      const x = Math.cos(adjustedAngle) * radius
      const z = Math.sin(adjustedAngle) * radius

      mesh.position.set(x, height / 2, z)
      mesh.scale.set(0.12 + freq * 0.06, height, 0.12 + freq * 0.06)
      mesh.lookAt(0, mesh.position.y, 0)

      // Pulse emissive based on frequency
      const mat = materialsRef.current[idx]
      if (mat) {
        mat.emissiveIntensity = 0.2 + freq * 0.8
      }
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.08 + mousePos.x * 0.5
    }
  })

  const primaryColor = useMemo(() => new THREE.Color(theme.primary), [theme.primary])
  const accentColor = useMemo(() => new THREE.Color(theme.accent), [theme.accent])

  return (
    <group ref={groupRef}>
      {barData.map((_, idx) => {
        const t = (idx % count) / count
        const color = new THREE.Color().lerpColors(primaryColor, accentColor, t)
        return (
          <mesh
            key={idx}
            ref={(el) => {
              if (el) meshesRef.current[idx] = el
            }}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              ref={(el) => {
                if (el) materialsRef.current[idx] = el
              }}
              color={color}
              metalness={0.7}
              roughness={0.15}
              emissive={color}
              emissiveIntensity={0.3}
            />
          </mesh>
        )
      })}
    </group>
  )
}

// Inner ring of smaller, faster-moving bars
function InnerRing({
  analyzerData,
  mousePos,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  theme: ColorTheme
}) {
  const groupRef = useRef<THREE.Group>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const count = 24

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const frequencies = getFrequencies(analyzerData, count, time)
    const radius = 2.2 + mousePos.y * 0.2

    meshesRef.current.forEach((mesh, idx) => {
      if (!mesh) return
      const angle = (idx / count) * Math.PI * 2
      const freq = frequencies[idx % count]
      const height = 0.1 + freq * 2

      const adjustedAngle = angle - mousePos.x * 0.5
      const x = Math.cos(adjustedAngle) * radius
      const z = Math.sin(adjustedAngle) * radius

      mesh.position.set(x, height / 2, z)
      mesh.scale.set(0.06, height, 0.06)
      mesh.lookAt(0, mesh.position.y, 0)
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = -time * 0.2 + mousePos.x * 0.3
    }
  })

  const color = useMemo(() => new THREE.Color(theme.accent), [theme.accent])

  return (
    <group ref={groupRef}>
      {Array.from({ length: count }).map((_, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            if (el) meshesRef.current[idx] = el
          }}
        >
          <cylinderGeometry args={[0.5, 0.5, 1, 6]} />
          <meshStandardMaterial
            color={color}
            metalness={0.8}
            roughness={0.1}
            emissive={color}
            emissiveIntensity={0.5}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  )
}

// Central orb with warping geometry
function CentralOrb({
  analyzerData,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const wireRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current || !wireRef.current) return

    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)

    const scale = 0.8 + bass * 0.6
    meshRef.current.scale.setScalar(scale)
    glowRef.current.scale.setScalar(scale * 1.6 + Math.sin(time * 3) * 0.1)
    wireRef.current.scale.setScalar(scale * 1.25)

    meshRef.current.rotation.y = time * 0.5
    meshRef.current.rotation.x = time * 0.3
    wireRef.current.rotation.y = -time * 0.3
    wireRef.current.rotation.z = time * 0.2

    // Warp the orb geometry vertices based on audio
    const geom = meshRef.current.geometry
    const pos = geom.attributes.position
    const arr = pos.array as Float32Array
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3]
      const y = arr[i * 3 + 1]
      const z = arr[i * 3 + 2]
      const len = Math.sqrt(x * x + y * y + z * z)
      if (len > 0) {
        const nx = x / len
        const ny = y / len
        const nz = z / len
        const warp = 0.8 + Math.sin(nx * 4 + time * 3) * bass * 0.15 +
          Math.cos(ny * 3 + time * 2) * bass * 0.1 +
          Math.sin(nz * 5 + time * 2.5) * bass * 0.08
        arr[i * 3] = nx * warp
        arr[i * 3 + 1] = ny * warp
        arr[i * 3 + 2] = nz * warp
      }
    }
    pos.needsUpdate = true
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.8, 3]} />
        <meshStandardMaterial
          color={theme.primary}
          metalness={0.9}
          roughness={0.05}
          emissive={theme.primary}
          emissiveIntensity={0.6}
        />
      </mesh>
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial
          color={theme.accent}
          wireframe
          transparent
          opacity={0.3}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color={theme.primary} transparent opacity={0.1} />
      </mesh>
    </group>
  )
}

// Orbiting particles in dual bands
function Particles({
  analyzerData,
  mousePos,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  theme: ColorTheme
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const particleCount = 600

  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2
      const radius = 5 + Math.random() * 2
      pos[i * 3] = Math.cos(angle) * radius
      pos[i * 3 + 1] = (Math.random() - 0.5) * 2
      pos[i * 3 + 2] = Math.sin(angle) * radius
    }
    return pos
  }, [])

  const sizes = useMemo(() => {
    const s = new Float32Array(particleCount)
    for (let i = 0; i < particleCount; i++) {
      s[i] = 0.02 + Math.random() * 0.04
    }
    return s
  }, [])

  useFrame((state) => {
    if (!pointsRef.current) return

    const time = state.clock.elapsedTime
    const posAttr = pointsRef.current.geometry.attributes.position
    const arr = posAttr.array as Float32Array

    let intensity = 0.3
    if (analyzerData) {
      analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
      const len = analyzerData.dataArray.length
      let mid = 0
      for (let i = Math.floor(len * 0.25); i < Math.floor(len * 0.75); i++) {
        mid += analyzerData.dataArray[i] / 255
      }
      intensity = mid / (len * 0.5)
    }

    for (let i = 0; i < particleCount; i++) {
      const baseAngle = (i / particleCount) * Math.PI * 2
      const band = i < particleCount / 2 ? 0 : 1
      const speed = band === 0 ? 0.15 : -0.1
      const baseRadius = band === 0 ? 5.5 : 6.5
      const angle = baseAngle + time * speed + mousePos.x * 0.3

      const wobble = Math.sin(time * 2 + i * 0.02) * (0.3 + intensity * 1.5)
      const radius = baseRadius + wobble

      arr[i * 3] = Math.cos(angle) * radius
      arr[i * 3 + 1] =
        Math.sin(time * 1.5 + i * 0.03) * (0.5 + intensity * 2) +
        mousePos.y * 0.5 +
        (band === 1 ? 0.5 : -0.5)
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }

    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.03
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={particleCount} array={sizes} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color={theme.particles}
        transparent
        opacity={0.75}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// Expanding pulse rings
function WaveRings({
  analyzerData,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const ringsRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!ringsRef.current) return
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)

    ringsRef.current.children.forEach((ring, i) => {
      const mesh = ring as THREE.Mesh
      const baseScale = 1.8 + i * 1.2
      const pulse = Math.sin(time * 2.5 - i * 0.8) * bass * 0.5
      mesh.scale.setScalar(baseScale + pulse)
      mesh.rotation.z = time * 0.08 * (i % 2 === 0 ? 1 : -1)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (0.2 - i * 0.035) * (0.5 + bass)
    })
  })

  return (
    <group ref={ringsRef}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1, 48]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? theme.primary : theme.accent}
            transparent
            opacity={0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

// Ground grid plane
function GroundGrid({
  analyzerData,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const gridRef = useRef<THREE.GridHelper>(null)

  useFrame((state) => {
    if (!gridRef.current) return
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mat = gridRef.current.material as THREE.Material
    if ("opacity" in mat) {
      ;(mat as THREE.MeshBasicMaterial).opacity = 0.08 + bass * 0.12
    }
    gridRef.current.position.y = -2 - bass * 0.3
  })

  return (
    <gridHelper
      ref={gridRef}
      args={[30, 30, theme.primary, theme.accent]}
      position={[0, -2, 0]}
      material-transparent={true}
      material-opacity={0.1}
    />
  )
}

function Scene({
  analyzerData,
  mousePos,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  theme: ColorTheme
}) {
  const { camera } = useThree()

  useFrame(() => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mousePos.x * 3, 0.02)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 4 + mousePos.y * 3, 0.02)
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      <color attach="background" args={["#050508"]} />
      <fog attach="fog" args={["#050508", 10, 30]} />

      <ambientLight intensity={0.15} />
      <pointLight position={[0, 6, 0]} intensity={1.5} color={theme.primary} distance={20} />
      <pointLight position={[6, 2, 6]} intensity={0.8} color={theme.accent} distance={15} />
      <pointLight position={[-6, 2, -6]} intensity={0.8} color={theme.particles} distance={15} />
      <pointLight position={[0, -3, 0]} intensity={0.4} color={theme.primary} distance={10} />

      <CentralOrb analyzerData={analyzerData} theme={theme} />
      <InnerRing analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <SymmetricBars analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <Particles analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <WaveRings analyzerData={analyzerData} theme={theme} />
      <GroundGrid analyzerData={analyzerData} theme={theme} />
    </>
  )
}

export default function AudioVisualizer() {
  const [isListening, setIsListening] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [theme, setTheme] = useState<ColorTheme>(COLOR_THEMES[0])
  const analyzerData = useAudioAnalyzer(isListening)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      })
    }
    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  return (
    <div className="w-full h-screen relative overflow-hidden bg-[#050508]">
      <Canvas
        camera={{ position: [0, 4, 10], fov: 60 }}
        gl={{
          antialias: false,
          powerPreference: "default",
          alpha: false,
        }}
        dpr={[1, 1.5]}
      >
        <Scene analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      </Canvas>

      <div className="absolute inset-0 pointer-events-none">
        {/* Title */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white mb-1 drop-shadow-lg">
            Audio Visualizer
          </h1>
          <p className="text-white/40 text-sm tracking-wide">
            Move your mouse to interact
          </p>
        </div>

        {/* Theme Switcher */}
        <div className="absolute top-8 right-8 flex gap-2 pointer-events-auto">
          {COLOR_THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t)}
              className={`w-8 h-8 rounded-full transition-all ${
                theme.name === t.name
                  ? "border-2 border-white scale-110 shadow-lg"
                  : "border-2 border-white/20 hover:scale-105 hover:border-white/50"
              }`}
              style={{
                backgroundColor: t.primary,
                boxShadow:
                  theme.name === t.name
                    ? `0 0 16px ${t.primary}80`
                    : "none",
              }}
              title={t.name}
              aria-label={`Switch to ${t.name} theme`}
            />
          ))}
        </div>

        {/* Mic Button */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            onClick={() => setIsListening(!isListening)}
            className="px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 backdrop-blur-sm"
            style={
              isListening
                ? {
                    backgroundColor: theme.primary,
                    color: "#fff",
                    boxShadow: `0 0 30px ${theme.primary}80`,
                  }
                : {
                    backgroundColor: "rgba(255,255,255,0.08)",
                    color: "#fff",
                  }
            }
          >
            {isListening ? "Stop Listening" : "Start Microphone"}
          </button>
        </div>

        {isListening && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full animate-pulse"
                style={{ backgroundColor: theme.primary }}
              />
              <span
                className="text-sm font-medium"
                style={{ color: theme.primary }}
              >
                Listening to microphone
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
