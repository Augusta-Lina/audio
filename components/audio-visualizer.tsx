"use client"

import React from "react"

import { useRef, useMemo, useEffect, useState } from "react"
import { Canvas, useFrame, useThree, extend } from "@react-three/fiber"
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

type AudioMode = "off" | "mic" | "file"

function useAudioAnalyzer(
  mode: AudioMode,
  audioFile: File | null
): { analyzerData: AudioAnalyzerData | null; audioElement: HTMLAudioElement | null; error?: string } {
  const [analyzerData, setAnalyzerData] = useState<AudioAnalyzerData | null>(null)
  const [error, setError] = useState<string>()
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null)
  const fileUrlRef = useRef<string | null>(null)

  useEffect(() => {
    // Cleanup previous
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ""
      audioElementRef.current = null
    }
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current)
      fileUrlRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    sourceRef.current = null
    setAnalyzerData(null)
    setError(undefined)

    if (mode === "off") return

    if (mode === "mic") {
      const initMic = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
          
          // Resume audio context if it's suspended
          if (audioContext.state === 'suspended') {
            await audioContext.resume()
          }
          
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.8
          analyser.minDecibels = -100
          analyser.maxDecibels = -10
          
          const source = audioContext.createMediaStreamSource(stream)
          source.connect(analyser)
          analyser.connect(audioContext.destination)
          
          audioContextRef.current = audioContext
          sourceRef.current = source
          setAnalyzerData({ analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) })
        } catch (err: any) {
          console.error("Error accessing microphone:", err)
          if (err.name === "NotAllowedError") {
            setError("Microphone permission denied. Please allow access in your browser settings.")
          } else if (err.name === "NotFoundError") {
            setError("No microphone found. Please check your device.")
          } else {
            setError("Unable to access microphone. Please try uploading an audio file instead.")
          }
        }
      }
      initMic()
    }

    if (mode === "file" && audioFile) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Resume audio context if it's suspended
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {})
      }
      
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      analyser.minDecibels = -100
      analyser.maxDecibels = -10

      const audio = new Audio()
      audio.crossOrigin = "anonymous"
      const url = URL.createObjectURL(audioFile)
      fileUrlRef.current = url
      audio.src = url
      audio.loop = true

      const source = audioContext.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(audioContext.destination)

      audioContextRef.current = audioContext
      sourceRef.current = source
      audioElementRef.current = audio

      audio.play().catch((err) => console.error("Error playing file:", err))
      setAnalyzerData({ analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) })
    }

    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ""
      }
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [mode, audioFile])

  return { analyzerData, audioElement: audioElementRef.current, error }
}

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

function getMids(analyzerData: AudioAnalyzerData | null, time: number): number {
  if (analyzerData) {
    analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
    let mids = 0
    const len = analyzerData.dataArray.length
    const start = Math.floor(len * 0.2)
    const end = Math.floor(len * 0.6)
    for (let i = start; i < end; i++) {
      mids += analyzerData.dataArray[i] / 255
    }
    return mids / (end - start)
  }
  return 0.4 + Math.sin(time * 3.1) * 0.2
}

function getHighs(analyzerData: AudioAnalyzerData | null, time: number): number {
  if (analyzerData) {
    analyzerData.analyser.getByteFrequencyData(analyzerData.dataArray)
    let highs = 0
    const len = analyzerData.dataArray.length
    const start = Math.floor(len * 0.6)
    for (let i = start; i < len; i++) {
      highs += analyzerData.dataArray[i] / 255
    }
    return highs / (len - start)
  }
  return 0.3 + Math.cos(time * 4.2) * 0.15
}

// ========== Shader background ==========
class VoidShaderMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uColor1: { value: new THREE.Color("#ff1a5c") },
        uColor2: { value: new THREE.Color("#c084fc") },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = vUv - 0.5;
          float dist = length(uv);
          float angle = atan(uv.y, uv.x);
          
          float ring = sin(dist * 20.0 - uTime * 2.0) * 0.5 + 0.5;
          ring *= smoothstep(0.5, 0.15, dist);
          
          float spiral = sin(angle * 6.0 + dist * 15.0 - uTime * 3.0) * 0.5 + 0.5;
          spiral *= smoothstep(0.5, 0.1, dist);
          
          float pattern = ring * 0.5 + spiral * 0.5;
          pattern *= uBass * 0.4 + 0.08;
          
          vec3 color = mix(uColor1, uColor2, spiral) * pattern;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
    })
  }
}

extend({ VoidShaderMaterial })

function ShaderBackground({
  analyzerData,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const matRef = useRef<VoidShaderMaterial>(null)

  useFrame((state) => {
    if (!matRef.current) return
    const time = state.clock.elapsedTime
    matRef.current.uniforms.uTime.value = time
    matRef.current.uniforms.uBass.value = getBass(analyzerData, time)
    matRef.current.uniforms.uColor1.value.set(theme.primary)
    matRef.current.uniforms.uColor2.value.set(theme.accent)
  })

  return (
    <mesh position={[0, 0, -12]} scale={[40, 40, 1]}>
      <planeGeometry args={[1, 1]} />
      {/* @ts-ignore */}
      <voidShaderMaterial ref={matRef} />
    </mesh>
  )
}

// ========== DNA double helix ==========
function DNAHelix({
  analyzerData,
  theme,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
  mousePos: { x: number; y: number }
}) {
  const groupRef = useRef<THREE.Group>(null)
  const strand1Ref = useRef<THREE.Mesh[]>([])
  const strand2Ref = useRef<THREE.Mesh[]>([])
  const connectorsRef = useRef<THREE.Mesh[]>([])
  const nodeCount = 30
  const connectorCount = 15

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    strand1Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 12
      const twist = t * Math.PI * 4 + time * 1.5
      const radius = 1.2 + mids * 0.8
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      mesh.scale.setScalar(0.06 + bass * 0.06 + Math.sin(time * 4 + i * 0.3) * 0.02)
    })

    strand2Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 12
      const twist = t * Math.PI * 4 + time * 1.5 + Math.PI
      const radius = 1.2 + mids * 0.8
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      mesh.scale.setScalar(0.06 + bass * 0.06 + Math.sin(time * 4 + i * 0.3) * 0.02)
    })

    connectorsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const idx = Math.floor((i / connectorCount) * nodeCount)
      const s1 = strand1Ref.current[idx]
      const s2 = strand2Ref.current[idx]
      if (!s1 || !s2) return
      const midPoint = new THREE.Vector3().addVectors(s1.position, s2.position).multiplyScalar(0.5)
      mesh.position.copy(midPoint)
      mesh.lookAt(s1.position)
      const dist = s1.position.distanceTo(s2.position)
      mesh.scale.set(0.015 + bass * 0.01, 0.015 + bass * 0.01, dist)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.3 + mids * 0.4
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.2 + mousePos.x * 0.5
      groupRef.current.position.x = -5.5
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s1-${i}`} ref={(el) => { if (el) strand1Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={theme.primary} emissive={theme.primary} emissiveIntensity={0.8} metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={0.8} metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      {Array.from({ length: connectorCount }).map((_, i) => (
        <mesh key={`c-${i}`} ref={(el) => { if (el) connectorsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={theme.particles} transparent opacity={0.4} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}

// ========== Mirror DNA on the right ==========
function DNAHelixMirror({
  analyzerData,
  theme,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
  mousePos: { x: number; y: number }
}) {
  const groupRef = useRef<THREE.Group>(null)
  const strand1Ref = useRef<THREE.Mesh[]>([])
  const strand2Ref = useRef<THREE.Mesh[]>([])
  const connectorsRef = useRef<THREE.Mesh[]>([])
  const nodeCount = 30
  const connectorCount = 15

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    strand1Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 12
      const twist = t * Math.PI * 4 - time * 1.5
      const radius = 1.2 + mids * 0.8
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      mesh.scale.setScalar(0.06 + bass * 0.06 + Math.sin(time * 4 + i * 0.3) * 0.02)
    })

    strand2Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 12
      const twist = t * Math.PI * 4 - time * 1.5 + Math.PI
      const radius = 1.2 + mids * 0.8
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      mesh.scale.setScalar(0.06 + bass * 0.06 + Math.sin(time * 4 + i * 0.3) * 0.02)
    })

    connectorsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const idx = Math.floor((i / connectorCount) * nodeCount)
      const s1 = strand1Ref.current[idx]
      const s2 = strand2Ref.current[idx]
      if (!s1 || !s2) return
      const midPoint = new THREE.Vector3().addVectors(s1.position, s2.position).multiplyScalar(0.5)
      mesh.position.copy(midPoint)
      mesh.lookAt(s1.position)
      const dist = s1.position.distanceTo(s2.position)
      mesh.scale.set(0.015 + bass * 0.01, 0.015 + bass * 0.01, dist)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.3 + mids * 0.4
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = -time * 0.2 - mousePos.x * 0.5
      groupRef.current.position.x = 5.5
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s1m-${i}`} ref={(el) => { if (el) strand1Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={0.8} metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2m-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={theme.primary} emissive={theme.primary} emissiveIntensity={0.8} metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      {Array.from({ length: connectorCount }).map((_, i) => (
        <mesh key={`cm-${i}`} ref={(el) => { if (el) connectorsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={theme.particles} transparent opacity={0.4} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}

// ========== Central orb with warping geometry ==========
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
  const wire2Ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current || !wireRef.current || !wire2Ref.current) return
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    const scale = 0.9 + bass * 0.7
    meshRef.current.scale.setScalar(scale)
    glowRef.current.scale.setScalar(scale * 2 + Math.sin(time * 3) * 0.15)
    wireRef.current.scale.setScalar(scale * 1.3)
    wire2Ref.current.scale.setScalar(scale * 1.6)

    meshRef.current.rotation.y = time * 0.5
    meshRef.current.rotation.x = time * 0.3
    wireRef.current.rotation.y = -time * 0.4
    wireRef.current.rotation.z = time * 0.25
    wire2Ref.current.rotation.y = time * 0.2
    wire2Ref.current.rotation.x = -time * 0.15

    // Warp vertices based on audio
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
        const warp = 0.8
          + Math.sin(nx * 5 + time * 3) * bass * 0.2
          + Math.cos(ny * 4 + time * 2.5) * mids * 0.15
          + Math.sin(nz * 6 + time * 2) * bass * 0.1
          + Math.sin((nx + ny) * 8 + time * 4) * mids * 0.08
        arr[i * 3] = nx * warp
        arr[i * 3 + 1] = ny * warp
        arr[i * 3 + 2] = nz * warp
      }
    }
    pos.needsUpdate = true

    const glowMat = glowRef.current.material as THREE.MeshBasicMaterial
    glowMat.opacity = 0.06 + bass * 0.1
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.8, 3]} />
        <meshStandardMaterial color={theme.primary} metalness={0.95} roughness={0.02} emissive={theme.primary} emissiveIntensity={0.8} />
      </mesh>
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color={theme.accent} wireframe transparent opacity={0.35} />
      </mesh>
      <mesh ref={wire2Ref}>
        <octahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color={theme.particles} wireframe transparent opacity={0.15} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color={theme.primary} transparent opacity={0.1} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

// ========== Outer symmetrical frequency bars ==========
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
      const height = 0.2 + freq * 5

      const adjustedAngle = angle + mousePos.x * 0.3
      const x = Math.cos(adjustedAngle) * radius
      const z = Math.sin(adjustedAngle) * radius

      mesh.position.set(x, height / 2, z)
      mesh.scale.set(0.15 + freq * 0.08, height, 0.15 + freq * 0.08)
      mesh.lookAt(0, mesh.position.y, 0)

      const mat = materialsRef.current[idx]
      if (mat) {
        mat.emissiveIntensity = 0.3 + freq * 1.2
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
          <mesh key={idx} ref={(el) => { if (el) meshesRef.current[idx] = el }}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              ref={(el) => { if (el) materialsRef.current[idx] = el }}
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

// ========== Orbiting rings that tilt and scale ==========
function OrbitingRings({
  analyzerData,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const ringsRef = useRef<THREE.Mesh[]>([])
  const ringCount = 5

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    ringsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const baseScale = 2.5 + i * 1.5
      const pulse = Math.sin(time * 2.5 - i * 0.8) * bass * 0.6
      mesh.scale.setScalar(baseScale + pulse)

      // Each ring tilts differently and rotates
      mesh.rotation.x = Math.PI / 2 + Math.sin(time * 0.5 + i * 1.2) * 0.3
      mesh.rotation.y = time * 0.1 * (i % 2 === 0 ? 1 : -1) + i * 0.5
      mesh.rotation.z = Math.cos(time * 0.3 + i) * 0.2

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (0.25 - i * 0.03) * (0.5 + bass + mids * 0.3)
    })
  })

  return (
    <group>
      {Array.from({ length: ringCount }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) ringsRef.current[i] = el }}>
          <torusGeometry args={[1, 0.01 + i * 0.003, 8, 64]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? theme.primary : theme.accent}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

// ========== Spiral ribbons ==========
function SpiralRibbons({
  analyzerData,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const groupRef = useRef<THREE.Group>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const ribbonCount = 8

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const highs = getHighs(analyzerData, time)

    meshesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const angle = (i / ribbonCount) * Math.PI * 2 + time * 0.4
      const radius = 1.8 + bass * 2 + Math.sin(time * 3 + i * 0.9) * 0.3
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = Math.sin(time * 2.5 + i * (Math.PI * 2 / ribbonCount)) * (0.8 + bass)

      mesh.position.set(x, y, z)
      mesh.rotation.set(time * 1.5 + i, time * 0.7 + i * 0.4, time * 0.3)
      const stretch = 1 + bass * 3.5 + highs * 1.5
      mesh.scale.set(0.08 + highs * 0.08, stretch, 0.08 + highs * 0.08)

      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.5 + bass * 1.5
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.2
    }
  })

  const primaryColor = useMemo(() => new THREE.Color(theme.primary), [theme.primary])
  const accentColor = useMemo(() => new THREE.Color(theme.accent), [theme.accent])

  return (
    <group ref={groupRef}>
      {Array.from({ length: ribbonCount }).map((_, i) => {
        const t = i / ribbonCount
        const color = new THREE.Color().lerpColors(primaryColor, accentColor, t)
        return (
          <mesh key={i} ref={(el) => { if (el) meshesRef.current[i] = el }}>
            <octahedronGeometry args={[0.4, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.95} roughness={0.05} transparent opacity={0.9} />
          </mesh>
        )
      })}
    </group>
  )
}

// ========== Energy beams from center ==========
function EnergyBeams({
  analyzerData,
  theme,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const beamsRef = useRef<THREE.Mesh[]>([])
  const beamCount = 16
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const frequencies = getFrequencies(analyzerData, beamCount, time)

    beamsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const angle = (i / beamCount) * Math.PI * 2
      const freq = frequencies[i]
      const reach = 2 + freq * 6 + bass * 2
      const x = Math.cos(angle) * reach * 0.5
      const z = Math.sin(angle) * reach * 0.5
      const y = Math.sin(time * 2 + i * 0.5) * freq * 0.8

      mesh.position.set(x, y, z)
      mesh.rotation.z = angle + Math.PI / 2
      mesh.rotation.x = Math.sin(time + i) * 0.2
      mesh.scale.set(0.015 + freq * 0.02, reach, 0.015 + freq * 0.02)

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.08 + freq * 0.35
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.05
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: beamCount }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) beamsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? theme.primary : i % 3 === 1 ? theme.accent : theme.particles}
            transparent
            opacity={0.15}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

// ========== Particles ==========
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
  const particleCount = 500

  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2
      const radius = 5 + Math.random() * 3
      pos[i * 3] = Math.cos(angle) * radius
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4
      pos[i * 3 + 2] = Math.sin(angle) * radius
    }
    return pos
  }, [])

  useFrame((state) => {
    if (!pointsRef.current) return
    const time = state.clock.elapsedTime
    const posAttr = pointsRef.current.geometry.attributes.position
    const arr = posAttr.array as Float32Array

    const bass = getBass(analyzerData, time)
    const highs = getHighs(analyzerData, time)

    for (let i = 0; i < particleCount; i++) {
      const baseAngle = (i / particleCount) * Math.PI * 2
      const band = i < particleCount / 2 ? 0 : 1
      const speed = band === 0 ? 0.2 : -0.12
      const baseRadius = band === 0 ? 5.5 : 7
      const angle = baseAngle + time * speed + mousePos.x * 0.4

      const wobble = Math.sin(time * 2.5 + i * 0.02) * (0.4 + bass * 2)
      const radius = baseRadius + wobble

      arr[i * 3] = Math.cos(angle) * radius
      arr[i * 3 + 1] =
        Math.sin(time * 1.5 + i * 0.04) * (0.8 + bass * 2.5 + highs * 1.5) +
        mousePos.y * 0.5 +
        (band === 1 ? 1 : -1)
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }

    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.04
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color={theme.particles}
        transparent
        opacity={0.75}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ========== Ground grid ==========
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
      ;(mat as THREE.MeshBasicMaterial).opacity = 0.06 + bass * 0.15
    }
    gridRef.current.position.y = -3 - bass * 0.4
  })

  return (
    <gridHelper
      ref={gridRef}
      args={[40, 40, theme.primary, theme.accent]}
      position={[0, -3, 0]}
      material-transparent={true}
      material-opacity={0.08}
    />
  )
}

// ========== Scene ==========
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

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const breathe = Math.sin(time * 0.4) * 0.6
    const sway = Math.cos(time * 0.3) * 0.3
    const targetX = mousePos.x * 5 + sway
    const targetY = 3.5 + mousePos.y * 3 + breathe
    const targetZ = 10 + Math.sin(time * 0.2) * 2

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.025)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.025)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.015)
    camera.lookAt(0, breathe * 0.3, 0)
  })

  return (
    <>
      <color attach="background" args={["#030306"]} />
      <fog attach="fog" args={["#030306", 12, 35]} />

      <ambientLight intensity={0.1} />
      <pointLight position={[0, 8, 0]} intensity={2} color={theme.primary} distance={25} />
      <pointLight position={[8, 3, 8]} intensity={1} color={theme.accent} distance={20} />
      <pointLight position={[-8, 3, -8]} intensity={1} color={theme.particles} distance={20} />
      <pointLight position={[0, -4, 0]} intensity={0.6} color={theme.primary} distance={15} />

      <ShaderBackground analyzerData={analyzerData} theme={theme} />
      <CentralOrb analyzerData={analyzerData} theme={theme} />
      <SpiralRibbons analyzerData={analyzerData} theme={theme} />
      <OrbitingRings analyzerData={analyzerData} theme={theme} />
      <EnergyBeams analyzerData={analyzerData} theme={theme} />
      <DNAHelix analyzerData={analyzerData} theme={theme} mousePos={mousePos} />
      <DNAHelixMirror analyzerData={analyzerData} theme={theme} mousePos={mousePos} />
      <SymmetricBars analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <Particles analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <GroundGrid analyzerData={analyzerData} theme={theme} />
    </>
  )
}

export default function AudioVisualizer() {
  const [audioMode, setAudioMode] = useState<AudioMode>("off")
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [theme, setTheme] = useState<ColorTheme>(COLOR_THEMES[0])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { analyzerData, error } = useAudioAnalyzer(audioMode, audioFile)
  const [isListening, setIsListening] = useState(false)
  const [showErrorTimeout, setShowErrorTimeout] = useState(false)

  useEffect(() => {
    if (error) {
      setShowErrorTimeout(true)
      const timer = setTimeout(() => setShowErrorTimeout(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAudioFile(file)
      setFileName(file.name)
      setAudioMode("file")
    }
  }

  const toggleMic = () => {
    if (audioMode === "mic") {
      setAudioMode("off")
    } else {
      setAudioFile(null)
      setFileName(null)
      setShowErrorTimeout(false)
      setAudioMode("mic")
    }
  }

  const stopAudio = () => {
    setAudioMode("off")
    setAudioFile(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
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
    <div className="w-full h-screen relative overflow-hidden bg-[#030306]">
      <Canvas
        camera={{ position: [0, 4, 10], fov: 60 }}
        gl={{ antialias: false, powerPreference: "default", alpha: false }}
        dpr={[1, 1.5]}
      >
        <Scene analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      </Canvas>

      {/* Error message */}
      {error && showErrorTimeout && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-lg text-sm pointer-events-auto z-50 animate-pulse">
          {error}
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
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
                boxShadow: theme.name === t.name ? `0 0 16px ${t.primary}80` : "none",
              }}
              title={t.name}
              aria-label={`Switch to ${t.name} theme`}
            />
          ))}
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-3">
          {/* Status indicator */}
          {audioMode !== "off" && (
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: theme.primary }} />
              <span className="text-sm font-medium text-white/80">
                {audioMode === "mic" ? "Listening to microphone" : fileName}
              </span>
            </div>
          )}

          {/* Control buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMic}
              className="px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 backdrop-blur-sm"
              style={
                audioMode === "mic"
                  ? { backgroundColor: theme.primary, color: "#fff", boxShadow: `0 0 24px ${theme.primary}60` }
                  : { backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }
              }
            >
              {audioMode === "mic" ? "Mic On" : "Microphone"}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 backdrop-blur-sm"
              style={
                audioMode === "file"
                  ? { backgroundColor: theme.accent, color: "#fff", boxShadow: `0 0 24px ${theme.accent}60` }
                  : { backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }
              }
            >
              {audioMode === "file" ? "Playing" : "Upload MP3"}
            </button>

            {audioMode !== "off" && (
              <button
                onClick={stopAudio}
                className="px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 backdrop-blur-sm"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fff" }}
              >
                Stop
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    </div>
  )
}
