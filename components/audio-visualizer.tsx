"use client"

import { useRef, useMemo, useEffect, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Environment } from "@react-three/drei"
import * as THREE from "three"
import { Settings, X } from "lucide-react"
import { colors } from "./colors" // Import colors from a separate file or declare it here

interface ColorConfig {
  primary: string
  accent: string
  particles: string
  background: string
}

interface AudioAnalyzerData {
  analyser: AnalyserNode
  dataArray: Uint8Array
  frequencyBands: {
    bass: number
    lowMid: number
    mid: number
    highMid: number
    treble: number
  }
}

function useAudioAnalyzer(isListening: boolean): AudioAnalyzerData | null {
  const [analyzerData, setAnalyzerData] = useState<AudioAnalyzerData | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)

  useEffect(() => {
    if (!isListening) {
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
        analyserRef.current = null
        dataArrayRef.current = null
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

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        audioContextRef.current = audioContext
        analyserRef.current = analyser
        dataArrayRef.current = dataArray

        setAnalyzerData({
          analyser,
          dataArray,
          frequencyBands: { bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0 },
        })
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

function getFrequencyBands(analyser: AnalyserNode, dataArray: Uint8Array) {
  analyser.getByteFrequencyData(dataArray)
  const bufferLength = dataArray.length

  const bassEnd = Math.floor(bufferLength * 0.1)
  const lowMidEnd = Math.floor(bufferLength * 0.25)
  const midEnd = Math.floor(bufferLength * 0.5)
  const highMidEnd = Math.floor(bufferLength * 0.75)

  let bass = 0,
    lowMid = 0,
    mid = 0,
    highMid = 0,
    treble = 0

  for (let i = 0; i < bufferLength; i++) {
    const value = dataArray[i] / 255
    if (i < bassEnd) bass += value
    else if (i < lowMidEnd) lowMid += value
    else if (i < midEnd) mid += value
    else if (i < highMidEnd) highMid += value
    else treble += value
  }

  return {
    bass: bass / bassEnd,
    lowMid: lowMid / (lowMidEnd - bassEnd),
    mid: mid / (midEnd - lowMidEnd),
    highMid: highMid / (highMidEnd - midEnd),
    treble: treble / (bufferLength - highMidEnd),
  }
}

interface SymmetricBarsProps {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  colors: ColorConfig
}

function SymmetricBars({ analyzerData, mousePos, colors: colorConfig }: SymmetricBarsProps) {
  const groupRef = useRef<THREE.Group>(null)
  const barsRef = useRef<THREE.InstancedMesh>(null)
  const count = 64
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const barColors = useMemo(() => {
    const colorArray = new Float32Array(count * 2 * 3)
    const primaryColor = new THREE.Color(colorConfig.primary)
    const accentColor = new THREE.Color(colorConfig.accent)
    
    for (let i = 0; i < count * 2; i++) {
      const t = (i % count) / count
      const color = new THREE.Color().lerpColors(primaryColor, accentColor, t)
      colorArray[i * 3] = color.r
      colorArray[i * 3 + 1] = color.g
      colorArray[i * 3 + 2] = color.b
    }
    return colorArray
  }, [colorConfig.primary, colorConfig.accent])

  useFrame((state) => {
    if (!barsRef.current) return

    const time = state.clock.elapsedTime
    let frequencies: number[] = []

    if (analyzerData) {
      analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
      frequencies = Array.from(analyzerData.dataArray).slice(0, count)
    } else {
      for (let i = 0; i < count; i++) {
        frequencies.push(
          Math.sin(time * 2 + i * 0.1) * 50 +
            Math.sin(time * 3 + i * 0.2) * 30 +
            50
        )
      }
    }

    const radius = 4 + mousePos.y * 0.5

    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < count; i++) {
        const index = side * count + i
        const angle = (i / count) * Math.PI + (side === 1 ? Math.PI : 0)
        const normalizedFreq = frequencies[i] / 255
        const height = 0.5 + normalizedFreq * 4

        const x = Math.cos(angle + mousePos.x * 0.3) * radius
        const z = Math.sin(angle + mousePos.x * 0.3) * radius

        dummy.position.set(x, height / 2 - 0.5, z)
        dummy.scale.set(0.15, height, 0.15)
        dummy.lookAt(0, dummy.position.y, 0)
        dummy.rotateX(Math.PI / 2)
        dummy.updateMatrix()

        barsRef.current.setMatrixAt(index, dummy.matrix)
      }
    }

    barsRef.current.instanceMatrix.needsUpdate = true

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.1 + mousePos.x * 0.5
    }
  })

  return (
    <group ref={groupRef}>
      <instancedMesh ref={barsRef} args={[undefined, undefined, count * 2]}>
        <boxGeometry args={[1, 1, 1]} />
<meshStandardMaterial
          vertexColors
          metalness={0.6}
          roughness={0.2}
          emissive={colorConfig.primary}
          emissiveIntensity={0.3}
        />
        <instancedBufferAttribute
          attach="geometry-attributes-color"
          args={[barColors, 3]}
        />
        <instancedBufferAttribute
          attach="geometry-attributes-color"
          args={[barColors, 3]}
        />
      </instancedMesh>
    </group>
  )
}

interface CentralOrbProps {
  analyzerData: AudioAnalyzerData | null
  colors: ColorConfig
}

function CentralOrb({ analyzerData, colors: colorConfig }: CentralOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current) return

    const time = state.clock.elapsedTime
    let scale = 1

    if (analyzerData) {
      const bands = getFrequencyBands(analyzerData.analyser, analyzerData.dataArray)
      scale = 1 + bands.bass * 0.8
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
          color={colorConfig.primary}
          metalness={0.9}
          roughness={0.1}
          emissive={colorConfig.primary}
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.9, 32, 32]} />
        <meshBasicMaterial
          color={colorConfig.primary}
          transparent
          opacity={0.15}
        />
      </mesh>
    </group>
  )
}

interface ParticleRingProps {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  colors: ColorConfig
}

function ParticleRing({ analyzerData, mousePos, colors: colorConfig }: ParticleRingProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const count = 2000

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const siz = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const radius = 5 + Math.random() * 2
      const y = (Math.random() - 0.5) * 2

      pos[i * 3] = Math.cos(angle) * radius
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = Math.sin(angle) * radius
      siz[i] = Math.random() * 0.5 + 0.1
    }

    return [pos, siz]
  }, [])

  useFrame((state) => {
    if (!pointsRef.current) return

    const time = state.clock.elapsedTime
    const positionAttr = pointsRef.current.geometry.attributes.position
    const positions = positionAttr.array as Float32Array

    let intensity = 0.5
    if (analyzerData) {
      const bands = getFrequencyBands(analyzerData.analyser, analyzerData.dataArray)
      intensity = bands.mid + bands.highMid
    }

    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2
      const angle = baseAngle + time * 0.2 + mousePos.x * 0.3
      const baseRadius = 5 + (i % 10) * 0.2
      const radius = baseRadius + Math.sin(time * 2 + i * 0.01) * intensity

      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] =
        Math.sin(time + i * 0.02) * (0.5 + intensity) + mousePos.y * 0.5
      positions[i * 3 + 2] = Math.sin(angle) * radius
    }

    positionAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.05
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color={colorConfig.particles}
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

interface WaveRingsProps {
  analyzerData: AudioAnalyzerData | null
  colors: ColorConfig
}

function WaveRings({ analyzerData, colors: colorConfig }: WaveRingsProps) {
  const ringsRef = useRef<THREE.Group>(null)
  const ringCount = 5

  useFrame((state) => {
    if (!ringsRef.current) return

    const time = state.clock.elapsedTime
    let intensity = 0.5

    if (analyzerData) {
      const bands = getFrequencyBands(analyzerData.analyser, analyzerData.dataArray)
      intensity = bands.bass * 2
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
      {Array.from({ length: ringCount }).map((_, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1, 64]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? colorConfig.primary : colorConfig.accent}
            transparent
            opacity={0.3 - i * 0.05}
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
  colors: colorConfig,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  colors: ColorConfig
}) {
  const { camera } = useThree()

  useFrame(() => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mousePos.x * 2, 0.02)
    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      5 + mousePos.y * 2,
      0.02
    )
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
<color attach="background" args={[colorConfig.background]} />
      <fog attach="fog" args={[colorConfig.background, 8, 25]} />

      <ambientLight intensity={0.2} />
      <pointLight position={[0, 5, 0]} intensity={1} color={colorConfig.primary} />
      <pointLight position={[5, 0, 5]} intensity={0.5} color={colorConfig.accent} />
      <pointLight position={[-5, 0, -5]} intensity={0.5} color={colorConfig.particles} />

      <CentralOrb analyzerData={analyzerData} colors={colorConfig} />
      <SymmetricBars analyzerData={analyzerData} mousePos={mousePos} colors={colorConfig} />
      <ParticleRing analyzerData={analyzerData} mousePos={mousePos} colors={colorConfig} />
      <WaveRings analyzerData={analyzerData} colors={colorConfig} />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 4}
      />
      <Environment preset="night" />
    </>
  )
}

const DEFAULT_COLORS: ColorConfig = {
  primary: "#ff1a5c",
  accent: "#c084fc",
  particles: "#3b82f6",
  background: "#0a0a0f",
}

const COLOR_PRESETS: { name: string; colors: ColorConfig }[] = [
  { name: "Neon", colors: DEFAULT_COLORS },
  { name: "Ocean", colors: { primary: "#06b6d4", accent: "#0ea5e9", particles: "#22d3ee", background: "#0a1628" } },
  { name: "Sunset", colors: { primary: "#f97316", accent: "#f59e0b", particles: "#fbbf24", background: "#1c1007" } },
  { name: "Forest", colors: { primary: "#22c55e", accent: "#10b981", particles: "#34d399", background: "#0a1f0f" } },
  { name: "Lavender", colors: { primary: "#a855f7", accent: "#d946ef", particles: "#e879f9", background: "#150a1f" } },
]

export default function AudioVisualizer() {
  const [isListening, setIsListening] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [showControls, setShowControls] = useState(false)
  const [colors, setColors] = useState<ColorConfig>(DEFAULT_COLORS)
  const analyzerData = useAudioAnalyzer(isListening)

  const updateColor = (key: keyof ColorConfig, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }))
  }

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
    <div className="w-full h-screen relative overflow-hidden">
      <Canvas camera={{ position: [0, 5, 10], fov: 60 }}>
        <Scene analyzerData={analyzerData} mousePos={mousePos} colors={colors} />
      </Canvas>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
            Audio Visualizer
          </h1>
          <p className="text-muted-foreground text-sm">
            Move your mouse to interact
          </p>
        </div>

        {/* Settings Button */}
        <button
          onClick={() => setShowControls(!showControls)}
          className="absolute top-8 right-8 p-3 rounded-full bg-secondary/80 backdrop-blur-sm text-foreground hover:bg-secondary transition-colors pointer-events-auto"
          aria-label="Toggle color controls"
        >
          {showControls ? <X size={20} /> : <Settings size={20} />}
        </button>

        {/* Control Panel */}
        {showControls && (
          <div className="absolute top-20 right-8 w-72 bg-card/90 backdrop-blur-md rounded-2xl border border-border p-5 pointer-events-auto">
            <h2 className="text-lg font-semibold text-foreground mb-4">Color Controls</h2>
            
            {/* Color Presets */}
            <div className="mb-5">
              <label className="text-sm text-muted-foreground mb-2 block">Presets</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setColors(preset.colors)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      backgroundColor: preset.colors.primary + "20",
                      color: preset.colors.primary,
                      border: colors.primary === preset.colors.primary ? `2px solid ${preset.colors.primary}` : "2px solid transparent",
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Individual Color Pickers */}
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.primary}
                    onChange={(e) => updateColor("primary", e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={colors.primary}
                    onChange={(e) => updateColor("primary", e.target.value)}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Accent Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.accent}
                    onChange={(e) => updateColor("accent", e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={colors.accent}
                    onChange={(e) => updateColor("accent", e.target.value)}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Particle Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.particles}
                    onChange={(e) => updateColor("particles", e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={colors.particles}
                    onChange={(e) => updateColor("particles", e.target.value)}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Background Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.background}
                    onChange={(e) => updateColor("background", e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={colors.background}
                    onChange={(e) => updateColor("background", e.target.value)}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Reset Button */}
            <button
              onClick={() => setColors(DEFAULT_COLORS)}
              className="w-full mt-5 px-4 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              Reset to Default
            </button>
          </div>
        )}

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            onClick={() => setIsListening(!isListening)}
            className={`px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 ${
              isListening
                ? "bg-primary text-primary-foreground shadow-[0_0_30px_rgba(255,26,92,0.5)]"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {isListening ? "Stop Listening" : "Start Microphone"}
          </button>
        </div>

        {isListening && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-primary rounded-full animate-pulse" />
              <span className="text-primary text-sm font-medium">
                Listening to microphone
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
