"use client"

import React from "react"

import { useRef, useMemo, useEffect, useState } from "react"
import { Canvas, useFrame, useThree, extend } from "@react-three/fiber"
import * as THREE from "three"

// Lo-fi study aesthetic — calm, muted palette
const PALETTE = {
  orchid: "#c471ec",
  frost: "#cff1f4",
  ice: "#ccd4f2",
  lavender: "#9e9fef",
  paleViolet: "#c4b5fd",
  bgDark: "#0f0f1a",
  bgWarm: "#1a1025",
}

interface AudioAnalyzerData {
  analyser: AnalyserNode
  dataArray: Uint8Array
}

type AudioMode = "off" | "mic" | "file"

function useAudioAnalyzer(): {
  analyzerData: AudioAnalyzerData | null
  audioElement: HTMLAudioElement | null
  error?: string
  startMic: () => void
  startFile: (file: File) => void
  stop: () => void
  audioMode: AudioMode
} {
  const [analyzerData, setAnalyzerData] = useState<AudioAnalyzerData | null>(null)
  const [error, setError] = useState<string>()
  const [audioMode, setAudioMode] = useState<AudioMode>("off")
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileUrlRef = useRef<string | null>(null)

  const cleanup = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ""
      audioElementRef.current = null
    }
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current)
      fileUrlRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    sourceRef.current = null
    setAnalyzerData(null)
    setError(undefined)
  }

  // Called directly from a click handler so getUserMedia has user-gesture context
  const startMic = async () => {
    cleanup()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      if (audioContext.state === "suspended") {
        await audioContext.resume()
      }

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      analyser.minDecibels = -90
      analyser.maxDecibels = -10

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      // Don't connect mic analyser to destination to avoid feedback

      audioContextRef.current = audioContext
      sourceRef.current = source
      streamRef.current = stream
      setAnalyzerData({ analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) })
      setAudioMode("mic")
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

  // Called directly from the file-input onChange handler (user gesture)
  const startFile = async (file: File) => {
    cleanup()
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      if (audioContext.state === "suspended") {
        await audioContext.resume()
      }

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      analyser.minDecibels = -90
      analyser.maxDecibels = -10

      const audio = new Audio()
      audio.crossOrigin = "anonymous"
      const url = URL.createObjectURL(file)
      fileUrlRef.current = url
      audio.src = url
      audio.loop = true

      const source = audioContext.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(audioContext.destination)

      audioContextRef.current = audioContext
      sourceRef.current = source
      audioElementRef.current = audio

      // play() is called within the same user-gesture call stack
      await audio.play()
      setAnalyzerData({ analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) })
      setAudioMode("file")
    } catch (err: any) {
      console.error("Error playing file:", err)
      setError("Unable to play audio file. Please try another file.")
    }
  }

  const stop = () => {
    cleanup()
    setAudioMode("off")
  }

  useEffect(() => {
    return () => cleanup()
  }, [])

  return { analyzerData, audioElement: audioElementRef.current, error, startMic, startFile, stop, audioMode }
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

// ========== Calm gradient background ==========
class AmbientBackgroundMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uColorTop: { value: new THREE.Color(PALETTE.bgWarm) },
        uColorBottom: { value: new THREE.Color(PALETTE.bgDark) },
        uAccent: { value: new THREE.Color(PALETTE.lavender) },
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
        uniform vec3 uColorTop;
        uniform vec3 uColorBottom;
        uniform vec3 uAccent;
        varying vec2 vUv;
        
        void main() {
          // Gentle vertical gradient
          vec3 bg = mix(uColorBottom, uColorTop, vUv.y);
          
          // Very subtle radial glow in center that breathes with bass
          vec2 uv = vUv - 0.5;
          float dist = length(uv);
          float glow = smoothstep(0.5, 0.0, dist) * (0.03 + uBass * 0.04);
          bg += uAccent * glow;
          
          // Extremely subtle slow-moving noise-like pattern
          float wave = sin(vUv.x * 3.0 + uTime * 0.15) * sin(vUv.y * 2.0 + uTime * 0.1) * 0.01;
          bg += vec3(wave);
          
          gl_FragColor = vec4(bg, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
    })
  }
}

extend({ AmbientBackgroundMaterial })

function ShaderBackground({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const matRef = useRef<AmbientBackgroundMaterial>(null)

  useFrame((state) => {
    if (!matRef.current) return
    const time = state.clock.elapsedTime
    matRef.current.uniforms.uTime.value = time
    matRef.current.uniforms.uBass.value = getBass(analyzerData, time)
  })

  return (
    <mesh position={[0, 0, -12]} scale={[40, 40, 1]}>
      <planeGeometry args={[1, 1]} />
      {/* @ts-ignore */}
      <ambientBackgroundMaterial ref={matRef} />
    </mesh>
  )
}

// ========== DNA double helix (softened) ==========
function DNAHelix({
  analyzerData,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
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
      const twist = t * Math.PI * 4 + time * 0.6
      const radius = 1.2 + mids * 0.4
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      mesh.scale.setScalar(0.04 + bass * 0.03 + Math.sin(time * 2 + i * 0.3) * 0.01)
    })

    strand2Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 12
      const twist = t * Math.PI * 4 + time * 0.6 + Math.PI
      const radius = 1.2 + mids * 0.4
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      mesh.scale.setScalar(0.04 + bass * 0.03 + Math.sin(time * 2 + i * 0.3) * 0.01)
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
      mesh.scale.set(0.01 + bass * 0.005, 0.01 + bass * 0.005, dist)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.12 + mids * 0.15
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.08 + mousePos.x * 0.2
      groupRef.current.position.x = -5.5
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s1-${i}`} ref={(el) => { if (el) strand1Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={PALETTE.lavender} emissive={PALETTE.lavender} emissiveIntensity={0.3} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={PALETTE.paleViolet} emissive={PALETTE.paleViolet} emissiveIntensity={0.3} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: connectorCount }).map((_, i) => (
        <mesh key={`c-${i}`} ref={(el) => { if (el) connectorsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={PALETTE.frost} transparent opacity={0.15} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}

// ========== Mirror DNA on the right (softened) ==========
function DNAHelixMirror({
  analyzerData,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
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
      const twist = t * Math.PI * 4 - time * 0.6
      const radius = 1.2 + mids * 0.4
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      mesh.scale.setScalar(0.04 + bass * 0.03 + Math.sin(time * 2 + i * 0.3) * 0.01)
    })

    strand2Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 12
      const twist = t * Math.PI * 4 - time * 0.6 + Math.PI
      const radius = 1.2 + mids * 0.4
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      mesh.scale.setScalar(0.04 + bass * 0.03 + Math.sin(time * 2 + i * 0.3) * 0.01)
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
      mesh.scale.set(0.01 + bass * 0.005, 0.01 + bass * 0.005, dist)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.12 + mids * 0.15
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = -time * 0.08 - mousePos.x * 0.2
      groupRef.current.position.x = 5.5
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s1m-${i}`} ref={(el) => { if (el) strand1Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={PALETTE.paleViolet} emissive={PALETTE.paleViolet} emissiveIntensity={0.3} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2m-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={PALETTE.lavender} emissive={PALETTE.lavender} emissiveIntensity={0.3} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: connectorCount }).map((_, i) => (
        <mesh key={`cm-${i}`} ref={(el) => { if (el) connectorsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={PALETTE.frost} transparent opacity={0.15} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}

// ========== Central orb with gentle warping ==========
function CentralOrb({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
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

    // Gentler scaling — breathes rather than pulses
    const scale = 0.9 + bass * 0.3
    meshRef.current.scale.setScalar(scale)
    glowRef.current.scale.setScalar(scale * 2.2 + Math.sin(time * 1.2) * 0.08)
    wireRef.current.scale.setScalar(scale * 1.3)
    wire2Ref.current.scale.setScalar(scale * 1.6)

    // Slower rotations
    meshRef.current.rotation.y = time * 0.15
    meshRef.current.rotation.x = time * 0.1
    wireRef.current.rotation.y = -time * 0.12
    wireRef.current.rotation.z = time * 0.08
    wire2Ref.current.rotation.y = time * 0.06
    wire2Ref.current.rotation.x = -time * 0.05

    // Gentler vertex warping
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
          + Math.sin(nx * 5 + time * 1.2) * bass * 0.08
          + Math.cos(ny * 4 + time * 1.0) * mids * 0.06
          + Math.sin(nz * 6 + time * 0.8) * bass * 0.04
        arr[i * 3] = nx * warp
        arr[i * 3 + 1] = ny * warp
        arr[i * 3 + 2] = nz * warp
      }
    }
    pos.needsUpdate = true

    const glowMat = glowRef.current.material as THREE.MeshBasicMaterial
    glowMat.opacity = 0.04 + bass * 0.06
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.8, 3]} />
        <meshStandardMaterial color={PALETTE.lavender} metalness={0.7} roughness={0.2} emissive={PALETTE.lavender} emissiveIntensity={0.35} />
      </mesh>
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color={PALETTE.paleViolet} wireframe transparent opacity={0.2} />
      </mesh>
      <mesh ref={wire2Ref}>
        <octahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color={PALETTE.ice} wireframe transparent opacity={0.08} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color={PALETTE.lavender} transparent opacity={0.06} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

// ========== Nebula cloud surrounding the orb ==========
function NebulaCloud({
  analyzerData,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const particleCount = 300
  const basePositions = useRef<Float32Array | null>(null)

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const col = new Float32Array(particleCount * 3)

    const colorPalette = [
      new THREE.Color(PALETTE.lavender),
      new THREE.Color(PALETTE.paleViolet),
      new THREE.Color(PALETTE.orchid).multiplyScalar(0.5), // orchid at low intensity
      new THREE.Color(PALETTE.frost),
      new THREE.Color(PALETTE.ice),
    ]

    for (let i = 0; i < particleCount; i++) {
      // Distribute in a soft shell around center (radius 1.5 to 4)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 1.5 + Math.random() * 2.5
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6 // flatten slightly
      pos[i * 3 + 2] = r * Math.cos(phi)

      const c = colorPalette[Math.floor(Math.random() * colorPalette.length)]
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    basePositions.current = new Float32Array(pos)
    return { positions: pos, colors: col }
  }, [])

  useFrame((state) => {
    if (!pointsRef.current || !basePositions.current) return
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    const posAttr = pointsRef.current.geometry.attributes.position
    const arr = posAttr.array as Float32Array
    const base = basePositions.current

    // Nebula breathes: expands on louder audio, contracts when quiet
    const breathScale = 1.0 + bass * 0.3 + mids * 0.15

    for (let i = 0; i < particleCount; i++) {
      const bx = base[i * 3]
      const by = base[i * 3 + 1]
      const bz = base[i * 3 + 2]

      // Gentle drifting motion
      const drift = Math.sin(time * 0.3 + i * 0.1) * 0.1
      const sway = Math.cos(time * 0.2 + i * 0.07) * 0.08

      arr[i * 3] = bx * breathScale + drift + mousePos.x * 0.15
      arr[i * 3 + 1] = by * breathScale + sway
      arr[i * 3 + 2] = bz * breathScale + drift * 0.5
    }

    posAttr.needsUpdate = true

    // Slow rotation
    pointsRef.current.rotation.y = time * 0.03
    pointsRef.current.rotation.x = Math.sin(time * 0.1) * 0.05

    // Fade opacity with audio
    const mat = pointsRef.current.material as THREE.PointsMaterial
    mat.opacity = 0.15 + bass * 0.2
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={particleCount} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.35}
        vertexColors
        transparent
        opacity={0.2}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

// ========== Orbiting rings (softened, slower) ==========
function OrbitingRings({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const ringsRef = useRef<THREE.Mesh[]>([])
  const ringCount = 4

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    ringsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const baseScale = 2.5 + i * 1.5
      const pulse = Math.sin(time * 0.8 - i * 0.6) * bass * 0.2
      mesh.scale.setScalar(baseScale + pulse)

      mesh.rotation.x = Math.PI / 2 + Math.sin(time * 0.15 + i * 1.2) * 0.15
      mesh.rotation.y = time * 0.03 * (i % 2 === 0 ? 1 : -1) + i * 0.5
      mesh.rotation.z = Math.cos(time * 0.1 + i) * 0.1

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (0.08 - i * 0.01) * (0.5 + bass * 0.3 + mids * 0.15)
    })
  })

  const ringColors = [PALETTE.lavender, PALETTE.paleViolet, PALETTE.ice, PALETTE.frost]

  return (
    <group>
      {Array.from({ length: ringCount }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) ringsRef.current[i] = el }}>
          <torusGeometry args={[1, 0.008 + i * 0.002, 8, 64]} />
          <meshBasicMaterial
            color={ringColors[i]}
            transparent
            opacity={0.08}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

// ========== Spiral ribbons (softened, slower) ==========
function SpiralRibbons({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const groupRef = useRef<THREE.Group>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const ribbonCount = 6

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const highs = getHighs(analyzerData, time)

    meshesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const angle = (i / ribbonCount) * Math.PI * 2 + time * 0.12
      const radius = 1.8 + bass * 0.8 + Math.sin(time * 1.0 + i * 0.9) * 0.15
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = Math.sin(time * 0.8 + i * (Math.PI * 2 / ribbonCount)) * (0.5 + bass * 0.3)

      mesh.position.set(x, y, z)
      mesh.rotation.set(time * 0.4 + i, time * 0.2 + i * 0.4, time * 0.1)
      const stretch = 1 + bass * 1.0 + highs * 0.5
      mesh.scale.set(0.06 + highs * 0.03, stretch * 0.6, 0.06 + highs * 0.03)

      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.15 + bass * 0.3
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.06
    }
  })

  const lavColor = useMemo(() => new THREE.Color(PALETTE.lavender), [])
  const violetColor = useMemo(() => new THREE.Color(PALETTE.paleViolet), [])

  return (
    <group ref={groupRef}>
      {Array.from({ length: ribbonCount }).map((_, i) => {
        const t = i / ribbonCount
        const color = new THREE.Color().lerpColors(lavColor, violetColor, t)
        return (
          <mesh key={i} ref={(el) => { if (el) meshesRef.current[i] = el }}>
            <octahedronGeometry args={[0.3, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} metalness={0.6} roughness={0.3} transparent opacity={0.5} />
          </mesh>
        )
      })}
    </group>
  )
}

// ========== Soft light rays from center ==========
function EnergyBeams({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const beamsRef = useRef<THREE.Mesh[]>([])
  const beamCount = 10
  const groupRef = useRef<THREE.Group>(null)

  const beamColors = [PALETTE.lavender, PALETTE.paleViolet, PALETTE.ice, PALETTE.frost, PALETTE.orchid]

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const frequencies = getFrequencies(analyzerData, beamCount, time)

    beamsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const angle = (i / beamCount) * Math.PI * 2
      const freq = frequencies[i]
      const reach = 1.5 + freq * 2.5 + bass * 0.8
      const x = Math.cos(angle) * reach * 0.5
      const z = Math.sin(angle) * reach * 0.5
      const y = Math.sin(time * 0.6 + i * 0.5) * freq * 0.3

      mesh.position.set(x, y, z)
      mesh.rotation.z = angle + Math.PI / 2
      mesh.rotation.x = Math.sin(time * 0.3 + i) * 0.08
      mesh.scale.set(0.008 + freq * 0.008, reach, 0.008 + freq * 0.008)

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.03 + freq * 0.1
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.02
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: beamCount }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) beamsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color={beamColors[i % beamColors.length]}
            transparent
            opacity={0.05}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

// ========== Ambient particles (reduced, slower, softer) ==========
function Particles({
  analyzerData,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const particleCount = 150

  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2
      const radius = 5 + Math.random() * 4
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

    for (let i = 0; i < particleCount; i++) {
      const baseAngle = (i / particleCount) * Math.PI * 2
      const band = i < particleCount / 2 ? 0 : 1
      const speed = band === 0 ? 0.04 : -0.03 // much slower
      const baseRadius = band === 0 ? 6 : 8
      const angle = baseAngle + time * speed + mousePos.x * 0.1

      const wobble = Math.sin(time * 0.6 + i * 0.02) * (0.2 + bass * 0.5)
      const radius = baseRadius + wobble

      arr[i * 3] = Math.cos(angle) * radius
      arr[i * 3 + 1] =
        Math.sin(time * 0.4 + i * 0.04) * (0.5 + bass * 0.6) +
        mousePos.y * 0.15 +
        (band === 1 ? 0.5 : -0.5)
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }

    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.01
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color={PALETTE.ice}
        transparent
        opacity={0.3}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ========== Scene ==========
function Scene({
  analyzerData,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
}) {
  const { camera } = useThree()

  useFrame((state) => {
    const time = state.clock.elapsedTime
    // Slower, gentler camera breathing
    const breathe = Math.sin(time * 0.2) * 0.3
    const sway = Math.cos(time * 0.15) * 0.15
    const targetX = mousePos.x * 2.5 + sway
    const targetY = 3.5 + mousePos.y * 1.5 + breathe
    const targetZ = 10 + Math.sin(time * 0.1) * 1

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.015)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.015)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.01)
    camera.lookAt(0, breathe * 0.2, 0)
  })

  return (
    <>
      <color attach="background" args={[PALETTE.bgDark]} />
      <fog attach="fog" args={[PALETTE.bgDark, 14, 40]} />

      {/* Soft, ambient lighting */}
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 8, 0]} intensity={0.8} color={PALETTE.lavender} distance={25} />
      <pointLight position={[8, 3, 8]} intensity={0.4} color={PALETTE.paleViolet} distance={20} />
      <pointLight position={[-8, 3, -8]} intensity={0.4} color={PALETTE.ice} distance={20} />
      <pointLight position={[0, -4, 0]} intensity={0.25} color={PALETTE.frost} distance={15} />

      <ShaderBackground analyzerData={analyzerData} />
      <CentralOrb analyzerData={analyzerData} />
      <NebulaCloud analyzerData={analyzerData} mousePos={mousePos} />
      <SpiralRibbons analyzerData={analyzerData} />
      <OrbitingRings analyzerData={analyzerData} />
      <EnergyBeams analyzerData={analyzerData} />
      <DNAHelix analyzerData={analyzerData} mousePos={mousePos} />
      <DNAHelixMirror analyzerData={analyzerData} mousePos={mousePos} />
      <Particles analyzerData={analyzerData} mousePos={mousePos} />
    </>
  )
}

export default function AudioVisualizer() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { analyzerData, error, startMic, startFile, stop, audioMode } = useAudioAnalyzer()
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
      setFileName(file.name)
      startFile(file)
    }
  }

  const toggleMic = () => {
    if (audioMode === "mic") {
      stop()
    } else {
      setFileName(null)
      setShowErrorTimeout(false)
      startMic()
    }
  }

  const stopAudio = () => {
    stop()
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
    <div className="w-full h-screen relative overflow-hidden" style={{ backgroundColor: PALETTE.bgDark }}>
      <Canvas
        camera={{ position: [0, 4, 10], fov: 60 }}
        gl={{ antialias: false, powerPreference: "default", alpha: false }}
        dpr={[1, 1.5]}
      >
        <Scene analyzerData={analyzerData} mousePos={mousePos} />
      </Canvas>

      {/* Error message */}
      {error && showErrorTimeout && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 backdrop-blur-sm px-6 py-3 rounded-lg text-sm pointer-events-auto z-50" style={{ backgroundColor: "rgba(158, 159, 239, 0.3)", color: "#ccd4f2" }}>
          {error}
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-3">
          {/* Status indicator */}
          {audioMode !== "off" && (
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: PALETTE.lavender }} />
              <span className="text-sm font-medium" style={{ color: "rgba(204, 212, 242, 0.7)" }}>
                {audioMode === "mic" ? "Listening to microphone" : fileName}
              </span>
            </div>
          )}

          {/* Control buttons — calm, glassy style */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMic}
              className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-500 backdrop-blur-md"
              style={
                audioMode === "mic"
                  ? { backgroundColor: "rgba(158, 159, 239, 0.35)", color: "#ccd4f2", boxShadow: `0 0 20px rgba(158, 159, 239, 0.2)` }
                  : { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(204, 212, 242, 0.6)" }
              }
            >
              {audioMode === "mic" ? "Mic On" : "Microphone"}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-500 backdrop-blur-md"
              style={
                audioMode === "file"
                  ? { backgroundColor: "rgba(196, 181, 253, 0.35)", color: "#ccd4f2", boxShadow: `0 0 20px rgba(196, 181, 253, 0.2)` }
                  : { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(204, 212, 242, 0.6)" }
              }
            >
              {audioMode === "file" ? "Playing" : "Upload MP3"}
            </button>

            {audioMode !== "off" && (
              <button
                onClick={stopAudio}
                className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-500 backdrop-blur-md"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(204, 212, 242, 0.6)" }}
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
