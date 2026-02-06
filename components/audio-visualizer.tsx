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

// Deep black + purple palette
const PRISMATIC_THEME: ColorTheme = {
  name: "Void Purple",
  primary: "#7b2ff2",   // vivid electric purple
  accent: "#c840e9",    // bright magenta-purple
  particles: "#a855f7", // mid-tone purple
}


interface AudioAnalyzerData {
  analyser: AnalyserNode
  dataArray: Uint8Array
}

type AudioMode = "off" | "mic" | "file"

/**
 * Uses a DOM-rendered <audio> element to avoid iframe autoplay restrictions.
 * The browser trusts the native play button even in sandboxed iframes.
 * The analyser is connected lazily when the audio actually starts playing.
 */
function useAudioAnalyzer(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [analyzerData, setAnalyzerData] = useState<AudioAnalyzerData | null>(null)
  const [error, setError] = useState<string>()
  const [audioMode, setAudioMode] = useState<AudioMode>("off")
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const connectedElementRef = useRef<HTMLAudioElement | null>(null)
  const fileUrlRef = useRef<string | null>(null)

  const cleanupMic = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  const ensureAnalyserForElement = (audio: HTMLAudioElement) => {
    if (connectedElementRef.current === audio && analyzerData) return analyzerData

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.75
    analyser.minDecibels = -90
    analyser.maxDecibels = -10

    const source = audioContext.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(audioContext.destination)

    audioContextRef.current = audioContext
    sourceRef.current = source
    connectedElementRef.current = audio

    const data = { analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) }
    setAnalyzerData(data)
    return data
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onPlay = () => {
      ensureAnalyserForElement(audio)
      setAudioMode("file")
    }
    const onPause = () => {}
    const onEnded = () => {
      if (!streamRef.current) setAudioMode("off")
    }

    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("ended", onEnded)
    return () => {
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("ended", onEnded)
    }
  })

  const loadFile = (file: File) => {
    cleanupMic()
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    connectedElementRef.current = null
    sourceRef.current = null
    setAnalyzerData(null)

    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    const url = URL.createObjectURL(file)
    fileUrlRef.current = url

    const audio = audioRef.current
    if (audio) {
      audio.src = url
      audio.load()
      audio.play().catch(() => {})
    }
    setAudioMode("file")
  }

  const startMic = async () => {
    try {
      cleanupMic()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute("src")
        audioRef.current.load()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
      connectedElementRef.current = null
      sourceRef.current = null

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      analyser.minDecibels = -90
      analyser.maxDecibels = -10

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioContext
      sourceRef.current = source

      setAnalyzerData({ analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) })
      setAudioMode("mic")
      setError(undefined)
    } catch (err: any) {
      setError("Microphone access denied. Please allow microphone permissions.")
    }
  }

  const stop = () => {
    cleanupMic()
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setAudioMode("off")
  }

  return { analyzerData, error, loadFile, startMic, stop, audioMode }
}

// ========== Audio analysis ==========
function getFrequencies(data: AudioAnalyzerData | null, count: number, time: number): number[] {
  if (data) {
    data.analyser.getByteFrequencyData(data.dataArray)
    const result: number[] = []
    const step = Math.floor(data.dataArray.length / count)
    for (let i = 0; i < count; i++) {
      result.push(data.dataArray[i * step] / 255)
    }
    return result
  }
  return Array.from({ length: count }, (_, i) =>
    0.3 + Math.sin(time * 2 + i * 0.3) * 0.15 + Math.cos(time * 3.5 + i * 0.7) * 0.1,
  )
}

function getBass(data: AudioAnalyzerData | null, time: number): number {
  if (data) {
    data.analyser.getByteFrequencyData(data.dataArray)
    let bass = 0
    const range = Math.min(8, data.dataArray.length)
    for (let i = 0; i < range; i++) bass += data.dataArray[i]
    return bass / (range * 255)
  }
  return 0.4 + Math.sin(time * 1.8) * 0.2
}

function getMids(data: AudioAnalyzerData | null, time: number): number {
  if (data) {
    data.analyser.getByteFrequencyData(data.dataArray)
    let mids = 0
    const start = Math.floor(data.dataArray.length * 0.15)
    const end = Math.floor(data.dataArray.length * 0.6)
    for (let i = start; i < end; i++) mids += data.dataArray[i]
    return mids / ((end - start) * 255)
  }
  return 0.35 + Math.sin(time * 2.8) * 0.15
}

function getHighs(data: AudioAnalyzerData | null, time: number): number {
  if (data) {
    data.analyser.getByteFrequencyData(data.dataArray)
    const len = data.dataArray.length
    const start = Math.floor(len * 0.6)
    let highs = 0
    for (let i = start; i < len; i++) highs += data.dataArray[i]
    if (len > start) {
      return highs / ((len - start) * 255)
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
        uMids: { value: 0 },
        uColor1: { value: new THREE.Color("#7b2ff2") },
        uColor2: { value: new THREE.Color("#c840e9") },
        uColor3: { value: new THREE.Color("#a855f7") },
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
        uniform float uMids;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float val = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 6; i++) {
            val += amp * noise(p);
            p *= 2.15;
            amp *= 0.48;
          }
          return val;
        }

        void main() {
          vec2 uv = vUv - 0.5;
          float dist = length(uv);
          float angle = atan(uv.y, uv.x);

          // Chromatic aberration
          float offset = 0.005 + uBass * 0.018;
          vec2 uvR = uv * (1.0 + offset);
          vec2 uvB = uv * (1.0 - offset);

          // Deep flowing nebula
          float t = uTime * 0.12;
          float nebula1 = fbm(uv * 3.5 + vec2(t, -t * 0.6));
          float nebula2 = fbm(uv * 5.0 + vec2(-t * 0.7, t * 0.4) + nebula1 * 0.6);
          float nebula3 = fbm(uv * 7.0 + vec2(t * 0.3, t * 0.8) + nebula2 * 0.3);
          float nebula = nebula1 * 0.5 + nebula2 * 0.35 + nebula3 * 0.15;
          nebula *= smoothstep(0.65, 0.03, dist) * (0.06 + uMids * 0.15 + uBass * 0.08);

          // Central glow -- purple-biased
          float glowR = exp(-length(uvR) * 4.0);
          float glowG = exp(-dist * 5.0);
          float glowB = exp(-length(uvB) * 3.5);

          // Multiple breathing rings
          float ring1D = abs(dist - 0.14 - uBass * 0.08);
          float ring1 = exp(-ring1D * ring1D * 400.0) * 0.15;
          float ring2D = abs(dist - 0.25 - uMids * 0.05);
          float ring2 = exp(-ring2D * ring2D * 250.0) * 0.08;
          float ring3D = abs(dist - 0.38 - uBass * 0.03);
          float ring3 = exp(-ring3D * ring3D * 180.0) * 0.05;

          // Spiral arms
          float sp1 = sin(angle * 3.0 + dist * 12.0 - uTime * 0.7) * 0.5 + 0.5;
          float sp2 = sin(angle * 5.0 - dist * 16.0 + uTime * 1.0) * 0.5 + 0.5;
          float sp3 = sin(angle * 7.0 + dist * 8.0 + uTime * 0.5) * 0.5 + 0.5;
          float spiral = (sp1 * 0.5 + sp2 * 0.3 + sp3 * 0.2) * smoothstep(0.55, 0.02, dist) * 0.04;
          spiral *= (0.2 + uBass * 0.6);

          float ring = ring1 + ring2 + ring3;

          // Purple-dominant with traces of magenta and deep violet
          float r = glowR * 0.03 + ring * 0.4 + spiral * 0.35 + nebula * 0.35;
          float g = glowG * 0.008 + ring * 0.05 + spiral * 0.03 + nebula * 0.04;
          float b = glowB * 0.07 + ring * 0.7 + spiral * 0.7 + nebula * 0.6;

          vec3 color = vec3(r, g, b) * (uBass * 0.7 + 0.1);
          color += uColor1 * (glowB * 0.04 + nebula * 0.04);
          color += uColor2 * (ring * 0.05 + spiral * 0.03);
          color += uColor3 * (nebula * 0.02 + spiral * 0.02);

          // Deep vignette to pure black
          color *= smoothstep(0.62, 0.0, dist * 0.6);

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
    matRef.current.uniforms.uMids.value = getMids(analyzerData, time)
    matRef.current.uniforms.uColor1.value.set(theme.primary)
    matRef.current.uniforms.uColor2.value.set(theme.accent)
    matRef.current.uniforms.uColor3.value.set(theme.particles)
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
  const nodeCount = 40
  const connectorCount = 20

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)
    const highs = getHighs(analyzerData, time)

    strand1Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 14
      const twist = t * Math.PI * 5 + time * 1.8
      const radius = 1.0 + mids * 1.0 + Math.sin(time * 2 + i * 0.2) * 0.15
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      const s = 0.05 + bass * 0.07 + Math.sin(time * 5 + i * 0.3) * 0.015 + highs * 0.02
      mesh.scale.setScalar(s)
    })

    strand2Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 14
      const twist = t * Math.PI * 5 + time * 1.8 + Math.PI
      const radius = 1.0 + mids * 1.0 + Math.sin(time * 2 + i * 0.2) * 0.15
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      const s = 0.05 + bass * 0.07 + Math.sin(time * 5 + i * 0.3) * 0.015 + highs * 0.02
      mesh.scale.setScalar(s)
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
      mesh.scale.set(0.012 + bass * 0.008, 0.012 + bass * 0.008, dist)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.2 + mids * 0.5 + bass * 0.2
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.22 + mousePos.x * 0.5
      groupRef.current.position.x = -5.5
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s1-${i}`} ref={(el) => { if (el) strand1Ref.current[i] = el }}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color="#7b2ff2" emissive="#7b2ff2" emissiveIntensity={0.9} metalness={0.95} roughness={0.05} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color="#c840e9" emissive="#c840e9" emissiveIntensity={0.9} metalness={0.95} roughness={0.05} />
        </mesh>
      ))}
      {Array.from({ length: connectorCount }).map((_, i) => (
        <mesh key={`c-${i}`} ref={(el) => { if (el) connectorsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.25} blending={THREE.AdditiveBlending} />
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
  const nodeCount = 40
  const connectorCount = 20

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)
    const highs = getHighs(analyzerData, time)

    strand1Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 14
      const twist = t * Math.PI * 5 - time * 1.8
      const radius = 1.0 + mids * 1.0 + Math.sin(time * 2 + i * 0.2) * 0.15
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      const s = 0.05 + bass * 0.07 + Math.sin(time * 5 + i * 0.3) * 0.015 + highs * 0.02
      mesh.scale.setScalar(s)
    })

    strand2Ref.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = i / nodeCount
      const y = (t - 0.5) * 14
      const twist = t * Math.PI * 5 - time * 1.8 + Math.PI
      const radius = 1.0 + mids * 1.0 + Math.sin(time * 2 + i * 0.2) * 0.15
      mesh.position.set(Math.cos(twist) * radius, y, Math.sin(twist) * radius)
      const s = 0.05 + bass * 0.07 + Math.sin(time * 5 + i * 0.3) * 0.015 + highs * 0.02
      mesh.scale.setScalar(s)
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
      mesh.scale.set(0.012 + bass * 0.008, 0.012 + bass * 0.008, dist)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.2 + mids * 0.5 + bass * 0.2
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = -time * 0.22 - mousePos.x * 0.5
      groupRef.current.position.x = 5.5
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s1m-${i}`} ref={(el) => { if (el) strand1Ref.current[i] = el }}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color="#c840e9" emissive="#c840e9" emissiveIntensity={0.9} metalness={0.95} roughness={0.05} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2m-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color="#7b2ff2" emissive="#7b2ff2" emissiveIntensity={0.9} metalness={0.95} roughness={0.05} />
        </mesh>
      ))}
      {Array.from({ length: connectorCount }).map((_, i) => (
        <mesh key={`cm-${i}`} ref={(el) => { if (el) connectorsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.25} blending={THREE.AdditiveBlending} />
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
  const glow2Ref = useRef<THREE.Mesh>(null)
  const glow3Ref = useRef<THREE.Mesh>(null)
  const glow4Ref = useRef<THREE.Mesh>(null)
  const wireRef = useRef<THREE.Mesh>(null)
  const wire2Ref = useRef<THREE.Mesh>(null)
  const wire3Ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current || !glow2Ref.current || !glow3Ref.current || !glow4Ref.current || !wireRef.current || !wire2Ref.current || !wire3Ref.current) return
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)
    const highs = getHighs(analyzerData, time)

    const scale = 0.8 + bass * 0.9 + mids * 0.2
    meshRef.current.scale.setScalar(scale)
    glowRef.current.scale.setScalar(scale * 2.5 + Math.sin(time * 3) * 0.25 + bass * 0.6)
    glow2Ref.current.scale.setScalar(scale * 3.8 + Math.sin(time * 2.2) * 0.3 + bass * 0.9)
    glow3Ref.current.scale.setScalar(scale * 5.5 + Math.cos(time * 1.8) * 0.5 + bass * 1.2)
    glow4Ref.current.scale.setScalar(scale * 8.0 + Math.sin(time * 1.2) * 0.6 + bass * 1.5)
    wireRef.current.scale.setScalar(scale * 1.25)
    wire2Ref.current.scale.setScalar(scale * 1.5)
    wire3Ref.current.scale.setScalar(scale * 1.8)

    meshRef.current.rotation.y = time * 0.5
    meshRef.current.rotation.x = time * 0.3
    wireRef.current.rotation.y = -time * 0.4
    wireRef.current.rotation.z = time * 0.25
    wire2Ref.current.rotation.y = time * 0.2
    wire2Ref.current.rotation.x = -time * 0.15
    wire3Ref.current.rotation.z = -time * 0.3
    wire3Ref.current.rotation.x = time * 0.18

    // Warp vertices based on audio -- complex multi-frequency warping
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
        const warp = 0.7
          + Math.sin(nx * 5 + time * 3) * bass * 0.3
          + Math.cos(ny * 4 + time * 2.5) * mids * 0.25
          + Math.sin(nz * 6 + time * 2) * bass * 0.18
          + Math.sin((nx + ny) * 8 + time * 4) * mids * 0.14
          + Math.cos((nx - nz) * 6 + time * 5) * bass * 0.1
          + Math.sin((ny + nz) * 10 + time * 6) * highs * 0.08
          + Math.cos(nx * 12 + time * 7) * highs * 0.05
        arr[i * 3] = nx * warp
        arr[i * 3 + 1] = ny * warp
        arr[i * 3 + 2] = nz * warp
      }
    }
    pos.needsUpdate = true

    const glowMat = glowRef.current.material as THREE.MeshBasicMaterial
    glowMat.opacity = 0.1 + bass * 0.2
    const glow2Mat = glow2Ref.current.material as THREE.MeshBasicMaterial
    glow2Mat.opacity = 0.05 + bass * 0.12
    const glow3Mat = glow3Ref.current.material as THREE.MeshBasicMaterial
    glow3Mat.opacity = 0.025 + bass * 0.06
    const glow4Mat = glow4Ref.current.material as THREE.MeshBasicMaterial
    glow4Mat.opacity = 0.012 + bass * 0.03
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.8, 4]} />
        <meshStandardMaterial color="#b060ff" metalness={0.98} roughness={0.01} emissive="#7b2ff2" emissiveIntensity={1.2} />
      </mesh>
      {/* Wireframe shells */}
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[0.8, 2]} />
        <meshBasicMaterial color="#7b2ff2" wireframe transparent opacity={0.18} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={wire2Ref}>
        <octahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color="#c840e9" wireframe transparent opacity={0.08} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={wire3Ref}>
        <dodecahedronGeometry args={[0.8, 0]} />
        <meshBasicMaterial color="#a855f7" wireframe transparent opacity={0.06} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Layered glow halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.9, 20, 20]} />
        <meshBasicMaterial color="#7b2ff2" transparent opacity={0.1} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={glow2Ref}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color="#c840e9" transparent opacity={0.05} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={glow3Ref}>
        <sphereGeometry args={[0.9, 12, 12]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.025} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={glow4Ref}>
        <sphereGeometry args={[0.9, 10, 10]} />
        <meshBasicMaterial color="#5b10c2" transparent opacity={0.012} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

// ========== Symmetric frequency dot cloud ==========
function SymmetricBars({
  analyzerData,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  theme: ColorTheme
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const freqBands = 56
  const dotsPerBand = 28
  const totalDots = freqBands * 2 * dotsPerBand

  const { positions, colors, baseData } = useMemo(() => {
    const pos = new Float32Array(totalDots * 3)
    const col = new Float32Array(totalDots * 3)
    const data: { angle: number; bandIdx: number; dotIdx: number; radialOffset: number }[] = []

    const deepPurple = new THREE.Color("#3b0f70")
    const electricPurple = new THREE.Color("#7b2ff2")
    const magenta = new THREE.Color("#c840e9")
    const lavender = new THREE.Color("#a855f7")
    const hotWhite = new THREE.Color("#e0c0ff")

    let idx = 0
    for (let side = 0; side < 2; side++) {
      for (let band = 0; band < freqBands; band++) {
        const angle = (band / freqBands) * Math.PI + (side === 1 ? Math.PI : 0)
        for (let d = 0; d < dotsPerBand; d++) {
          const radialOffset = (Math.random() - 0.5) * 0.5
          data.push({ angle, bandIdx: band, dotIdx: d, radialOffset })
          pos[idx * 3] = 0
          pos[idx * 3 + 1] = 0
          pos[idx * 3 + 2] = 0

          const t = band / freqBands
          const dNorm = d / dotsPerBand
          const c = new THREE.Color()
          if (t < 0.25) {
            c.lerpColors(deepPurple, electricPurple, t * 4)
          } else if (t < 0.5) {
            c.lerpColors(electricPurple, lavender, (t - 0.25) * 4)
          } else if (t < 0.75) {
            c.lerpColors(lavender, magenta, (t - 0.5) * 4)
          } else {
            c.lerpColors(magenta, electricPurple, (t - 0.75) * 4)
          }
          // Hot white tips for sparkle
          if (dNorm > 0.75) c.lerp(hotWhite, (dNorm - 0.75) * 2.5)

          col[idx * 3] = c.r
          col[idx * 3 + 1] = c.g
          col[idx * 3 + 2] = c.b
          idx++
        }
      }
    }
    return { positions: pos, colors: col, baseData: data }
  }, [totalDots])

  useFrame((state) => {
    if (!pointsRef.current) return
    const time = state.clock.elapsedTime
    const frequencies = getFrequencies(analyzerData, freqBands, time)
    const radius = 4.0 + mousePos.y * 0.5
    const posAttr = pointsRef.current.geometry.attributes.position
    const arr = posAttr.array as Float32Array

    for (let i = 0; i < totalDots; i++) {
      const { angle, bandIdx, dotIdx, radialOffset } = baseData[i]
      const freq = frequencies[bandIdx]
      const height = freq * 7
      const adjustedAngle = angle + mousePos.x * 0.3
      const dNorm = dotIdx / dotsPerBand
      const yPos = dNorm * height
        + Math.sin(time * 2.5 + dotIdx * 0.5 + bandIdx * 0.25) * 0.25 * freq
        + Math.cos(time * 1.6 + bandIdx * 0.4) * 0.12
      const scatter = radialOffset + Math.sin(time * 1.4 + dotIdx * 1.1) * 0.08
      const r = radius + scatter

      arr[i * 3] = Math.cos(adjustedAngle) * r
      arr[i * 3 + 1] = yPos
      arr[i * 3 + 2] = Math.sin(adjustedAngle) * r
    }
    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.05 + mousePos.x * 0.35
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={totalDots} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={totalDots} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.022}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

// ========== Orbiting rings ==========
function OrbitingRings({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const ringsRef = useRef<THREE.Mesh[]>([])
  const ringCount = 10

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    ringsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const baseScale = 1.8 + i * 1.0
      const pulse = Math.sin(time * 1.8 - i * 0.5) * bass * 0.9
      mesh.scale.setScalar(baseScale + pulse)

      mesh.rotation.x = Math.PI / 2 + Math.sin(time * 0.35 + i * 0.9) * 0.45
      mesh.rotation.y = time * 0.07 * (i % 2 === 0 ? 1 : -1) + i * 0.4
      mesh.rotation.z = Math.cos(time * 0.22 + i * 0.6) * 0.35

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (0.2 - i * 0.016) * (0.25 + bass * 1.2 + mids * 0.3)
    })
  })

  const ringColors = [
    "#7b2ff2", "#5b10c2", "#c840e9", "#a855f7", "#7b2ff2",
    "#9040d0", "#c840e9", "#6020b0", "#a855f7", "#7b2ff2",
  ]

  return (
    <group>
      {Array.from({ length: ringCount }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) ringsRef.current[i] = el }}>
          <torusGeometry args={[1, 0.004 + (i % 4) * 0.003, 8, 100]} />
          <meshBasicMaterial
            color={ringColors[i]}
            transparent
            opacity={0.18}
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
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const groupRef = useRef<THREE.Group>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const ribbonCount = 16

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)
    const highs = getHighs(analyzerData, time)

    meshesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const angle = (i / ribbonCount) * Math.PI * 2 + time * 0.3
      const radius = 1.5 + bass * 2.8 + Math.sin(time * 2.2 + i * 0.6) * 0.5
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = Math.sin(time * 1.8 + i * (Math.PI * 2 / ribbonCount)) * (1.2 + bass * 1.5)

      mesh.position.set(x, y, z)
      mesh.rotation.set(time * 2.0 + i, time * 0.5 + i * 0.3, time * 0.2)
      const stretch = 0.6 + bass * 4.5 + highs * 2.5 + mids * 0.8
      mesh.scale.set(0.05 + highs * 0.12, stretch, 0.05 + highs * 0.12)

      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.5 + bass * 2.0
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.15
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: ribbonCount }).map((_, i) => {
        const t = i / ribbonCount
        const c = new THREE.Color()
        if (t < 0.33) c.lerpColors(new THREE.Color("#3b0f70"), new THREE.Color("#7b2ff2"), t * 3)
        else if (t < 0.66) c.lerpColors(new THREE.Color("#7b2ff2"), new THREE.Color("#c840e9"), (t - 0.33) * 3)
        else c.lerpColors(new THREE.Color("#c840e9"), new THREE.Color("#a855f7"), (t - 0.66) * 3)
        return (
          <mesh key={i} ref={(el) => { if (el) meshesRef.current[i] = el }}>
            <octahedronGeometry args={[0.3, 0]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.5} metalness={0.98} roughness={0.02} transparent opacity={0.9} />
          </mesh>
        )
      })}
    </group>
  )
}

// ========== Energy beams from center ==========
function EnergyBeams({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const beamsRef = useRef<THREE.Mesh[]>([])
  const beamCount = 32
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const frequencies = getFrequencies(analyzerData, beamCount, time)

    beamsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const angle = (i / beamCount) * Math.PI * 2
      const freq = frequencies[i]
      const reach = 1.2 + freq * 10 + bass * 3.5
      const x = Math.cos(angle) * reach * 0.4
      const z = Math.sin(angle) * reach * 0.4
      const y = Math.sin(time * 1.5 + i * 0.35) * freq * 1.2

      mesh.position.set(x, y, z)
      mesh.rotation.z = angle + Math.PI / 2
      mesh.rotation.x = Math.sin(time * 0.7 + i * 0.6) * 0.3
      mesh.scale.set(0.006 + freq * 0.01, reach, 0.006 + freq * 0.01)

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.02 + freq * 0.3
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.04
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: beamCount }).map((_, i) => {
        const t = i / beamCount
        const beamColor = t < 0.25 ? "#7b2ff2" : t < 0.5 ? "#5b10c2" : t < 0.75 ? "#c840e9" : "#a855f7"
        return (
          <mesh key={i} ref={(el) => { if (el) beamsRef.current[i] = el }}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color={beamColor}
              transparent
              opacity={0.04}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )
      })}
    </group>
  )
}

// ========== Particles ==========
function Particles({
  analyzerData,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  theme: ColorTheme
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const particleCount = 1800

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const col = new Float32Array(particleCount * 3)
    const deepPurple = new THREE.Color("#2a0845")
    const electricPurple = new THREE.Color("#7b2ff2")
    const magenta = new THREE.Color("#c840e9")
    const lavender = new THREE.Color("#a855f7")
    const white = new THREE.Color("#d8b0ff")

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2
      const radius = 3.5 + Math.random() * 6
      pos[i * 3] = Math.cos(angle) * radius
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8
      pos[i * 3 + 2] = Math.sin(angle) * radius

      const r = Math.random()
      const c = new THREE.Color()
      if (r < 0.25) c.lerpColors(deepPurple, electricPurple, Math.random())
      else if (r < 0.5) c.lerpColors(electricPurple, lavender, Math.random())
      else if (r < 0.75) c.lerpColors(lavender, magenta, Math.random())
      else if (r < 0.92) c.lerpColors(magenta, electricPurple, Math.random())
      else c.copy(white) // sparkle
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    return { positions: pos, colors: col }
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
      const layer = i % 4
      const speed = layer === 0 ? 0.12 : layer === 1 ? -0.08 : layer === 2 ? 0.05 : -0.03
      const baseRadius = layer === 0 ? 4.5 : layer === 1 ? 6 : layer === 2 ? 7.5 : 9
      const angle = baseAngle + time * speed + mousePos.x * 0.25

      const wobble = Math.sin(time * 1.8 + i * 0.012) * (0.25 + bass * 3.0)
      const radius = baseRadius + wobble

      arr[i * 3] = Math.cos(angle) * radius
      arr[i * 3 + 1] =
        Math.sin(time * 1.0 + i * 0.025) * (0.5 + bass * 3.5 + highs * 1.8) +
        mousePos.y * 0.35 +
        Math.sin(i * 0.5) * 0.4
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }

    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.025
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={particleCount} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        vertexColors
        transparent
        opacity={0.65}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

// ========== Ambient dust -- very tiny slowly drifting particles ==========
function AmbientDust({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
  theme: ColorTheme
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const count = 600

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30
      const brightness = 0.15 + Math.random() * 0.25
      col[i * 3] = brightness * 0.6
      col[i * 3 + 1] = brightness * 0.2
      col[i * 3 + 2] = brightness
    }
    return { positions: pos, colors: col }
  }, [])

  useFrame((state) => {
    if (!pointsRef.current) return
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const posAttr = pointsRef.current.geometry.attributes.position
    const arr = posAttr.array as Float32Array

    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += Math.sin(time * 0.3 + i * 0.1) * 0.002 + bass * 0.003
      // Slowly wrap around
      if (arr[i * 3 + 1] > 10) arr[i * 3 + 1] = -10
    }
    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.008
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        vertexColors
        transparent
        opacity={0.35}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
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
      ;(mat as THREE.MeshBasicMaterial).opacity = 0.025 + bass * 0.06
    }
      gridRef.current.position.y = -4 - bass * 0.6
  })

  return (
    <gridHelper
      ref={gridRef}
      args={[60, 60, "#5b10c2", "#3b0870"]}
      position={[0, -4, 0]}
      material-transparent={true}
      material-opacity={0.03}
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
    const breathe = Math.sin(time * 0.3) * 0.9 + Math.sin(time * 0.65) * 0.3
    const sway = Math.cos(time * 0.2) * 0.6 + Math.sin(time * 0.5) * 0.2
    const targetX = mousePos.x * 3.5 + sway
    const targetY = 2.8 + mousePos.y * 3 + breathe
    const targetZ = 12 + Math.sin(time * 0.15) * 3

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.018)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.018)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.01)
    camera.lookAt(0, breathe * 0.2, 0)
  })

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <fog attach="fog" args={["#000000", 16, 42]} />

      <ambientLight intensity={0.02} />
      <pointLight position={[0, 8, 0]} intensity={2.5} color="#7b2ff2" distance={30} />
      <pointLight position={[8, 3, 8]} intensity={1.5} color="#c840e9" distance={25} />
      <pointLight position={[-8, 3, -8]} intensity={1.0} color="#a855f7" distance={22} />
      <pointLight position={[0, -5, 0]} intensity={0.5} color="#5b10c2" distance={18} />
      <pointLight position={[5, 6, -5]} intensity={0.6} color="#9040d0" distance={16} />
      <pointLight position={[-5, -2, 7]} intensity={0.3} color="#7b2ff2" distance={14} />
      <pointLight position={[0, 0, 10]} intensity={0.4} color="#c840e9" distance={12} />

      <ShaderBackground analyzerData={analyzerData} theme={theme} />
      <CentralOrb analyzerData={analyzerData} theme={theme} />
      <SpiralRibbons analyzerData={analyzerData} theme={theme} />
      <OrbitingRings analyzerData={analyzerData} theme={theme} />
      <EnergyBeams analyzerData={analyzerData} theme={theme} />
      <DNAHelix analyzerData={analyzerData} theme={theme} mousePos={mousePos} />
      <DNAHelixMirror analyzerData={analyzerData} theme={theme} mousePos={mousePos} />
      <SymmetricBars analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <Particles analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      <AmbientDust analyzerData={analyzerData} theme={theme} />
      <GroundGrid analyzerData={analyzerData} theme={theme} />
    </>
  )
}

export default function AudioVisualizer() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const theme = PRISMATIC_THEME
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const { analyzerData, error, loadFile, startMic, stop, audioMode } = useAudioAnalyzer(audioRef)
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
      loadFile(file)
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
    <div className="w-full h-screen relative overflow-hidden bg-black">
      <Canvas
        camera={{ position: [0, 4, 12], fov: 58 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
        dpr={[1, 2]}
      >
        <Scene analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      </Canvas>

      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" loop />

      {error && showErrorTimeout && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-lg text-sm pointer-events-auto z-50 animate-pulse">
          {error}
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-3">
          {audioMode !== "off" && (
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#a855f7" }} />
              <span className="text-sm font-medium tracking-wide" style={{ color: "rgba(168,85,247,0.6)" }}>
                {audioMode === "mic" ? "Listening to microphone" : fileName}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={toggleMic}
              className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 backdrop-blur-md border"
              style={
                audioMode === "mic"
                  ? { backgroundColor: "rgba(123,47,242,0.3)", color: "#c8a0ff", boxShadow: "0 0 25px rgba(123,47,242,0.2)", borderColor: "rgba(123,47,242,0.4)" }
                  : { backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.08)" }
              }
            >
              {audioMode === "mic" ? "Mic On" : "Microphone"}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 backdrop-blur-md border"
              style={
                audioMode === "file"
                  ? { backgroundColor: "rgba(200,64,233,0.3)", color: "#d8a0ff", boxShadow: "0 0 25px rgba(200,64,233,0.2)", borderColor: "rgba(200,64,233,0.4)" }
                  : { backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.08)" }
              }
            >
              {audioMode === "file" ? "Playing" : "Upload MP3"}
            </button>

            {fileName && audioMode !== "file" && audioMode !== "mic" && (
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.play().catch(() => {})
                  }
                }}
                className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 backdrop-blur-md border"
                style={{ backgroundColor: "rgba(123,47,242,0.3)", color: "#c8a0ff", boxShadow: "0 0 25px rgba(123,47,242,0.2)", borderColor: "rgba(123,47,242,0.4)" }}
              >
                Play
              </button>
            )}

            {audioMode !== "off" && (
              <button
                onClick={stopAudio}
                className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 backdrop-blur-md border"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.08)" }}
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
