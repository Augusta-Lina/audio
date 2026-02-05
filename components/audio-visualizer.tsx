"use client"

import { useRef, useMemo, useEffect, useState, useCallback } from "react"
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
  const count = 32

  const barData = useMemo(() => {
    const data: { angle: number; mirror: number }[] = []
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI + (side === 1 ? Math.PI : 0)
        data.push({ angle, mirror: side })
      }
    }
    return data
  }, [])

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const frequencies: number[] = []

    if (analyzerData) {
      analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
      for (let i = 0; i < count; i++) {
        frequencies.push(analyzerData.dataArray[i] / 255)
      }
    } else {
      for (let i = 0; i < count; i++) {
        frequencies.push(
          (Math.sin(time * 2 + i * 0.2) * 0.3 + Math.sin(time * 3 + i * 0.3) * 0.2 + 0.5) * 0.5
        )
      }
    }

    const radius = 4 + mousePos.y * 0.5

    meshesRef.current.forEach((mesh, idx) => {
      if (!mesh) return
      const { angle } = barData[idx]
      const freqIdx = idx % count
      const height = 0.3 + frequencies[freqIdx] * 3.5

      const x = Math.cos(angle + mousePos.x * 0.3) * radius
      const z = Math.sin(angle + mousePos.x * 0.3) * radius

      mesh.position.set(x, height / 2, z)
      mesh.scale.set(0.15, height, 0.15)
      mesh.lookAt(0, mesh.position.y, 0)
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.1 + mousePos.x * 0.5
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
              color={color}
              metalness={0.6}
              roughness={0.2}
              emissive={color}
              emissiveIntensity={0.3}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function CentralOrb({
  analyzerData,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current) return

    const time = state.clock.elapsedTime
    let scale = 1

    if (analyzerData) {
      analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
      let bass = 0
      const bassEnd = Math.floor(analyzerData.dataArray.length * 0.1)
      for (let i = 0; i < bassEnd; i++) {
        bass += analyzerData.dataArray[i] / 255
      }
      scale = 1 + (bass / bassEnd) * 0.8
    } else {
      scale = 1 + Math.sin(time * 2) * 0.2
    }

    meshRef.current.scale.setScalar(scale)
    glowRef.current.scale.setScalar(scale * 1.5)
    meshRef.current.rotation.y = time * 0.5
    meshRef.current.rotation.x = time * 0.3
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.8, 2]} />
        <meshStandardMaterial
          color={theme.primary}
          metalness={0.9}
          roughness={0.1}
          emissive={theme.primary}
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color={theme.primary} transparent opacity={0.15} />
      </mesh>
    </group>
  )
}

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
  const particleCount = 800

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
      const angle = baseAngle + time * 0.2 + mousePos.x * 0.3
      const baseRadius = 5 + (i % 8) * 0.2
      const radius = baseRadius + Math.sin(time * 2 + i * 0.01) * intensity

      arr[i * 3] = Math.cos(angle) * radius
      arr[i * 3 + 1] = Math.sin(time + i * 0.02) * (0.3 + intensity) + mousePos.y * 0.5
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }

    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.05
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color={theme.particles}
        transparent
        opacity={0.7}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

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
    let intensity = 0.5

    if (analyzerData) {
      analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
      let bass = 0
      const bassEnd = Math.floor(analyzerData.dataArray.length * 0.1)
      for (let i = 0; i < bassEnd; i++) {
        bass += analyzerData.dataArray[i] / 255
      }
      intensity = (bass / bassEnd) * 2
    }

    ringsRef.current.children.forEach((ring, i) => {
      const mesh = ring as THREE.Mesh
      const baseScale = 2 + i * 1.5
      const pulse = Math.sin(time * 2 - i * 0.5) * intensity * 0.3
      mesh.scale.setScalar(baseScale + pulse)
      mesh.rotation.z = time * 0.1 * (i % 2 === 0 ? 1 : -1)
    })
  })

  return (
    <group ref={ringsRef}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1, 32]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? theme.primary : theme.accent}
            transparent
            opacity={0.25 - i * 0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
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
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mousePos.x * 2, 0.02)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 5 + mousePos.y * 2, 0.02)
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      <color attach="background" args={["#0a0a0f"]} />
      <fog attach="fog" args={["#0a0a0f", 10, 28]} />

      <ambientLight intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={1} color={theme.primary} />
      <pointLight position={[5, 0, 5]} intensity={0.5} color={theme.accent} />
      <pointLight position={[-5, 0, -5]} intensity={0.5} color={theme.particles} />

      <CentralOrb analyzerData={analyzerData} theme={theme} />
      <SymmetricBars analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <Particles analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <WaveRings analyzerData={analyzerData} theme={theme} />
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
    <div className="w-full h-screen relative overflow-hidden bg-[#0a0a0f]">
      <Canvas
        camera={{ position: [0, 5, 10], fov: 60 }}
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
        <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2">
            Audio Visualizer
          </h1>
          <p className="text-white/60 text-sm">Move your mouse to interact</p>
        </div>

        <div className="absolute top-8 right-8 flex gap-2 pointer-events-auto">
          {COLOR_THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                theme.name === t.name ? "border-white scale-110" : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: t.primary }}
              title={t.name}
              aria-label={`Switch to ${t.name} theme`}
            />
          ))}
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            onClick={() => setIsListening(!isListening)}
            className={`px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 ${
              isListening
                ? "bg-[#ff1a5c] text-white shadow-[0_0_30px_rgba(255,26,92,0.5)]"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {isListening ? "Stop Listening" : "Start Microphone"}
          </button>
        </div>

        {isListening && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#ff1a5c] rounded-full animate-pulse" />
              <span className="text-[#ff1a5c] text-sm font-medium">Listening to microphone</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
