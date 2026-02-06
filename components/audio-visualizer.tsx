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

// Rainbow HSL conversion for smooth cycling
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function getRainbowTheme(time: number): ColorTheme {
  const speed = 15 // degrees per second
  const hue = (time * speed) % 360
  return {
    name: "Rainbow",
    primary: hslToHex(hue, 100, 55),
    accent: hslToHex(hue + 60, 100, 60),
    particles: hslToHex(hue + 180, 90, 65),
  }
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
    // Only create the source node once per audio element
    if (connectedElementRef.current === audio && analyzerData) return analyzerData

    // Close previous context if switching sources
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

  // Attach listeners to the audio element to connect analyser on play
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onPlay = () => {
      ensureAnalyserForElement(audio)
      setAudioMode("file")
    }
    const onPause = () => {
      if (!streamRef.current) {
        // Only go to "off" if mic isn't active
        // Keep analyzerData so it freezes on last frame
      }
    }
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
    // Reset analyser connection for new file
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
      audio.loop = true
      audio.load()
      // Don't call play() — let the user click the native play button
    }
    setAudioMode("off")
  }

  const startMic = () => {
    // Pause file audio if playing
    if (audioRef.current) {
      audioRef.current.pause()
    }

    cleanupMic()
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Close file audio context if any
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {})
        }
        connectedElementRef.current = null

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
        streamRef.current = stream
        setAnalyzerData({ analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) })
        setAudioMode("mic")
      })
      .catch((err: any) => {
        console.error("Error accessing microphone:", err)
        if (err.name === "NotAllowedError") {
          setError("Microphone permission denied. Please allow access in your browser settings.")
        } else if (err.name === "NotFoundError") {
          setError("No microphone found. Please check your device.")
        } else {
          setError("Unable to access microphone. Try uploading an audio file instead.")
        }
      })
  }

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
    }
    cleanupMic()
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    connectedElementRef.current = null
    sourceRef.current = null
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current)
      fileUrlRef.current = null
    }
    setAnalyzerData(null)
    setAudioMode("off")
    setError(undefined)
  }

  useEffect(() => {
    return () => {
      cleanupMic()
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {})
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    }
  }, [])

  return { analyzerData, error, loadFile, startMic, stop, audioMode }
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
        uMids: { value: 0 },
        uColor1: { value: new THREE.Color("#ff1a5c") },
        uColor2: { value: new THREE.Color("#c084fc") },
        uColor3: { value: new THREE.Color("#3b82f6") },
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

        // HSL to RGB conversion
        vec3 hsl2rgb(float h, float s, float l) {
          float c = (1.0 - abs(2.0 * l - 1.0)) * s;
          float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
          float m = l - c * 0.5;
          vec3 rgb;
          if (h < 1.0/6.0)      rgb = vec3(c, x, 0.0);
          else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
          else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
          else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
          else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
          else                   rgb = vec3(c, 0.0, x);
          return rgb + m;
        }

        void main() {
          vec2 uv = vUv - 0.5;
          float dist = length(uv);
          float angle = atan(uv.y, uv.x);

          // Soft rainbow hue based on angle + time
          float hue = fract(angle / 6.2832 + uTime * 0.04);

          // Multiple soft glow layers
          float glow1 = exp(-dist * 3.0) * (0.35 + uBass * 0.5);
          float glow2 = exp(-dist * 5.0) * (0.2 + uMids * 0.3);
          float glow3 = exp(-pow(dist - 0.2 - uBass * 0.05, 2.0) * 20.0) * 0.15;

          // Soft ring that breathes with the bass
          float ring = exp(-pow(dist - 0.25 - uBass * 0.08, 2.0) * 30.0) * 0.3;
          ring += exp(-pow(dist - 0.38 - uMids * 0.05, 2.0) * 40.0) * 0.15;

          // Spiral aurora effect
          float spiral = sin(angle * 3.0 + dist * 8.0 - uTime * 1.5) * 0.5 + 0.5;
          spiral *= smoothstep(0.55, 0.08, dist);
          spiral *= 0.12 + uBass * 0.15;

          // Combine all glows
          float intensity = glow1 + glow2 + glow3 + ring + spiral;

          // Rainbow color with shifting hue across the whole scene
          float h1 = fract(hue + dist * 0.5);
          float h2 = fract(hue + 0.33 + spiral);
          float h3 = fract(hue + 0.66 - dist * 0.3);

          vec3 c1 = hsl2rgb(h1, 0.9, 0.55);
          vec3 c2 = hsl2rgb(h2, 0.85, 0.5);
          vec3 c3 = hsl2rgb(h3, 0.95, 0.6);

          vec3 color = c1 * glow1 + c2 * (glow2 + ring) + c3 * (glow3 + spiral);

          // Soft vignette
          color *= smoothstep(0.7, 0.0, dist * 0.8);

          // Add subtle theme color tint
          color += uColor1 * glow2 * 0.15;
          color += uColor2 * ring * 0.1;

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
          <meshStandardMaterial color={theme.primary} emissive={theme.primary} emissiveIntensity={1.2} metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={1.2} metalness={0.9} roughness={0.1} />
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
          <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={1.2} metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2m-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={theme.primary} emissive={theme.primary} emissiveIntensity={1.2} metalness={0.9} roughness={0.1} />
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
  const glow2Ref = useRef<THREE.Mesh>(null)
  const glow3Ref = useRef<THREE.Mesh>(null)
  const wireRef = useRef<THREE.Mesh>(null)
  const wire2Ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current || !glow2Ref.current || !glow3Ref.current || !wireRef.current || !wire2Ref.current) return
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    const scale = 0.9 + bass * 0.7
    meshRef.current.scale.setScalar(scale)
    glowRef.current.scale.setScalar(scale * 2.2 + Math.sin(time * 3) * 0.2)
    glow2Ref.current.scale.setScalar(scale * 3.0 + Math.sin(time * 2.2) * 0.3)
    glow3Ref.current.scale.setScalar(scale * 4.0 + Math.cos(time * 1.8) * 0.4)
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
    glowMat.opacity = 0.08 + bass * 0.12
    const glow2Mat = glow2Ref.current.material as THREE.MeshBasicMaterial
    glow2Mat.opacity = 0.04 + bass * 0.06
    const glow3Mat = glow3Ref.current.material as THREE.MeshBasicMaterial
    glow3Mat.opacity = 0.02 + bass * 0.04
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.8, 3]} />
        <meshStandardMaterial color={theme.primary} metalness={0.95} roughness={0.02} emissive={theme.primary} emissiveIntensity={1.2} />
      </mesh>
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color={theme.accent} wireframe transparent opacity={0.35} />
      </mesh>
      <mesh ref={wire2Ref}>
        <octahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color={theme.particles} wireframe transparent opacity={0.15} />
      </mesh>
      {/* Layered glow spheres for soft blur effect */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color={theme.primary} transparent opacity={0.1} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={glow2Ref}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.05} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={glow3Ref}>
        <sphereGeometry args={[0.9, 12, 12]} />
        <meshBasicMaterial color={theme.particles} transparent opacity={0.03} blending={THREE.AdditiveBlending} />
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
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.0} metalness={0.95} roughness={0.05} transparent opacity={0.9} />
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
  useRainbow,
  staticTheme,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  useRainbow: boolean
  staticTheme: ColorTheme
}) {
  const { camera } = useThree()
  const themeRef = useRef<ColorTheme>(staticTheme)
  const light1Ref = useRef<THREE.PointLight>(null)
  const light2Ref = useRef<THREE.PointLight>(null)
  const light3Ref = useRef<THREE.PointLight>(null)
  const light4Ref = useRef<THREE.PointLight>(null)

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

    // Update the theme ref with rainbow or static
    if (useRainbow) {
      themeRef.current = getRainbowTheme(time)
    } else {
      themeRef.current = staticTheme
    }

    // Update lights dynamically
    const t = themeRef.current
    if (light1Ref.current) light1Ref.current.color.set(t.primary)
    if (light2Ref.current) light2Ref.current.color.set(t.accent)
    if (light3Ref.current) light3Ref.current.color.set(t.particles)
    if (light4Ref.current) light4Ref.current.color.set(t.primary)
  })

  return (
    <>
      <color attach="background" args={["#020208"]} />
      <fog attach="fog" args={["#020208", 14, 38]} />

      <ambientLight intensity={0.08} />
      <pointLight ref={light1Ref} position={[0, 8, 0]} intensity={2.5} color={staticTheme.primary} distance={28} />
      <pointLight ref={light2Ref} position={[8, 3, 8]} intensity={1.5} color={staticTheme.accent} distance={22} />
      <pointLight ref={light3Ref} position={[-8, 3, -8]} intensity={1.5} color={staticTheme.particles} distance={22} />
      <pointLight ref={light4Ref} position={[0, -4, 0]} intensity={0.8} color={staticTheme.primary} distance={18} />

      <SceneInner analyzerData={analyzerData} mousePos={mousePos} themeRef={themeRef} />
    </>
  )
}

// Inner scene reads theme from ref and updates at a throttled rate
function SceneInner({
  analyzerData,
  mousePos,
  themeRef,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
  themeRef: React.RefObject<ColorTheme | null>
}) {
  const [theme, setTheme] = useState<ColorTheme>(themeRef.current!)
  const frameCount = useRef(0)
  
  useFrame(() => {
    frameCount.current++
    // Update theme state every 3 frames (~20fps) to balance smooth color transitions with performance
    if (frameCount.current % 3 === 0 && themeRef.current) {
      setTheme(themeRef.current)
    }
  })

  return (
    <>
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
  const [fileName, setFileName] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [useRainbow, setUseRainbow] = useState(true)
  const [staticTheme, setStaticTheme] = useState<ColorTheme>(COLOR_THEMES[0])
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

  // Display theme for UI buttons (static theme for colors)
  const displayTheme = staticTheme

  return (
    <div className="w-full h-screen relative overflow-hidden bg-[#020208]">
      <Canvas
        camera={{ position: [0, 4, 10], fov: 60 }}
        gl={{ antialias: false, powerPreference: "default", alpha: false }}
        dpr={[1, 1.5]}
      >
        <Scene analyzerData={analyzerData} mousePos={mousePos} useRainbow={useRainbow} staticTheme={staticTheme} />
      </Canvas>

      {/* Hidden but DOM-rendered audio element */}
      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" loop />

      {/* Error message */}
      {error && showErrorTimeout && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 backdrop-blur-md text-white px-6 py-3 rounded-lg text-sm pointer-events-auto z-50 animate-pulse">
          {error}
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
        {/* Theme picker */}
        <div className="absolute top-8 right-8 flex gap-2 pointer-events-auto items-center">
          {/* Rainbow toggle */}
          <button
            onClick={() => setUseRainbow(true)}
            className={`w-8 h-8 rounded-full transition-all overflow-hidden ${
              useRainbow
                ? "border-2 border-white scale-110 shadow-lg"
                : "border-2 border-white/20 hover:scale-105 hover:border-white/50"
            }`}
            style={{
              background: "conic-gradient(#ff0040, #ff8000, #ffcc00, #00e060, #00c0ff, #4060ff, #a020f0, #ff40c0, #ff0040)",
              boxShadow: useRainbow ? "0 0 20px rgba(255,255,255,0.3)" : "none",
            }}
            title="Rainbow"
            aria-label="Switch to rainbow mode"
          />
          <div className="w-px h-6 bg-white/20 mx-1" />
          {COLOR_THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => {
                setStaticTheme(t)
                setUseRainbow(false)
              }}
              className={`w-8 h-8 rounded-full transition-all ${
                !useRainbow && staticTheme.name === t.name
                  ? "border-2 border-white scale-110 shadow-lg"
                  : "border-2 border-white/20 hover:scale-105 hover:border-white/50"
              }`}
              style={{
                backgroundColor: t.primary,
                boxShadow: !useRainbow && staticTheme.name === t.name ? `0 0 16px ${t.primary}80` : "none",
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
              <span
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{
                  background: useRainbow
                    ? "conic-gradient(#ff0040, #ff8000, #ffcc00, #00e060, #00c0ff, #4060ff, #a020f0, #ff40c0, #ff0040)"
                    : displayTheme.primary,
                }}
              />
              <span className="text-sm font-medium text-white/80">
                {audioMode === "mic" ? "Listening to microphone" : fileName}
              </span>
            </div>
          )}

          {/* Control buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMic}
              className="px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 backdrop-blur-md border border-white/10"
              style={
                audioMode === "mic"
                  ? {
                      background: useRainbow
                        ? "linear-gradient(135deg, #ff0040, #ff8000, #ffcc00, #00e060)"
                        : displayTheme.primary,
                      color: "#fff",
                      boxShadow: useRainbow
                        ? "0 0 30px rgba(255,100,50,0.4)"
                        : `0 0 24px ${displayTheme.primary}60`,
                    }
                  : { backgroundColor: "rgba(255,255,255,0.06)", color: "#fff" }
              }
            >
              {audioMode === "mic" ? "Mic On" : "Microphone"}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 backdrop-blur-md border border-white/10"
              style={
                audioMode === "file"
                  ? {
                      background: useRainbow
                        ? "linear-gradient(135deg, #00c0ff, #4060ff, #a020f0, #ff40c0)"
                        : displayTheme.accent,
                      color: "#fff",
                      boxShadow: useRainbow
                        ? "0 0 30px rgba(100,100,255,0.4)"
                        : `0 0 24px ${displayTheme.accent}60`,
                    }
                  : { backgroundColor: "rgba(255,255,255,0.06)", color: "#fff" }
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
                className="px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 backdrop-blur-md border border-white/10"
                style={{
                  background: useRainbow
                    ? "linear-gradient(135deg, #ff0040, #ffcc00, #00e060, #00c0ff)"
                    : displayTheme.primary,
                  color: "#fff",
                  boxShadow: useRainbow
                    ? "0 0 30px rgba(255,200,50,0.4)"
                    : `0 0 24px ${displayTheme.primary}60`,
                }}
              >
                Play
              </button>
            )}

            {audioMode !== "off" && (
              <button
                onClick={stopAudio}
                className="px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 backdrop-blur-md border border-white/10"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#fff" }}
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
