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

// Effervescent gold and purple palette
const PRISMATIC_THEME: ColorTheme = {
  name: "Prismatic",
  primary: "#d4a040",   // shimmery gold
  accent: "#8040c0",    // rich purple
  particles: "#c090ff", // soft lavender shimmer
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
        uColor1: { value: new THREE.Color("#d4a040") },
        uColor2: { value: new THREE.Color("#8040c0") },
        uColor3: { value: new THREE.Color("#c090ff") },
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

        // Simplex-ish noise for organic nebula
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
          for (int i = 0; i < 5; i++) {
            val += amp * noise(p);
            p *= 2.1;
            amp *= 0.5;
          }
          return val;
        }

        void main() {
          vec2 uv = vUv - 0.5;
          float dist = length(uv);
          float angle = atan(uv.y, uv.x);

          // Chromatic aberration - offset per channel
          float offset = 0.006 + uBass * 0.015;
          vec2 uvR = uv * (1.0 + offset);
          vec2 uvG = uv;
          vec2 uvB = uv * (1.0 - offset);

          // Flowing nebula noise
          float t = uTime * 0.15;
          float nebula1 = fbm(uv * 3.0 + vec2(t, -t * 0.7));
          float nebula2 = fbm(uv * 4.5 + vec2(-t * 0.8, t * 0.5) + nebula1 * 0.5);
          float nebula = nebula1 * 0.6 + nebula2 * 0.4;
          nebula *= smoothstep(0.6, 0.05, dist) * (0.08 + uMids * 0.12);

          // Soft central glow with prismatic fringing
          float glowR = exp(-length(uvR) * 3.5);
          float glowG = exp(-dist * 4.0);
          float glowB = exp(-length(uvB) * 4.5);

          // Multiple breathing rings
          float ring1Dist = abs(dist - 0.16 - uBass * 0.07);
          float ring1 = exp(-ring1Dist * ring1Dist * 300.0) * 0.2;
          float ring2Dist = abs(dist - 0.28 - uMids * 0.04);
          float ring2 = exp(-ring2Dist * ring2Dist * 200.0) * 0.1;

          // Spiral arms
          float spiral1 = sin(angle * 3.0 + dist * 10.0 - uTime * 0.8) * 0.5 + 0.5;
          float spiral2 = sin(angle * 5.0 - dist * 14.0 + uTime * 1.1) * 0.5 + 0.5;
          float spiral = (spiral1 * 0.6 + spiral2 * 0.4) * smoothstep(0.5, 0.03, dist) * 0.05;
          spiral *= (0.3 + uBass * 0.5);

          // Color channels - gold warmth + purple coolness
          float ring = ring1 + ring2;
          float r = glowR * 0.06 + ring * 0.8 + spiral * 0.5 + nebula * 0.7;
          float g = glowG * 0.03 + ring * 0.4 + spiral * 0.2 + nebula * 0.35;
          float b = glowB * 0.08 + ring * 0.7 + spiral * 0.8 + nebula * 0.6;

          // Theme tinting
          vec3 color = vec3(r, g, b) * (uBass * 0.6 + 0.12);
          color += uColor1 * (glowG * 0.05 + nebula * 0.03);
          color += uColor2 * (ring * 0.06 + nebula * 0.02);
          color += uColor3 * (spiral * 0.04);

          // Deep vignette
          color *= smoothstep(0.6, 0.0, dist * 0.65);

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
          <meshStandardMaterial color={theme.primary} emissive={theme.primary} emissiveIntensity={0.7} metalness={0.95} roughness={0.05} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={0.7} metalness={0.95} roughness={0.05} />
        </mesh>
      ))}
      {Array.from({ length: connectorCount }).map((_, i) => (
        <mesh key={`c-${i}`} ref={(el) => { if (el) connectorsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#c890f0" transparent opacity={0.25} blending={THREE.AdditiveBlending} />
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
          <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={0.7} metalness={0.95} roughness={0.05} />
        </mesh>
      ))}
      {Array.from({ length: nodeCount }).map((_, i) => (
        <mesh key={`s2m-${i}`} ref={(el) => { if (el) strand2Ref.current[i] = el }}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={theme.primary} emissive={theme.primary} emissiveIntensity={0.7} metalness={0.95} roughness={0.05} />
        </mesh>
      ))}
      {Array.from({ length: connectorCount }).map((_, i) => (
        <mesh key={`cm-${i}`} ref={(el) => { if (el) connectorsRef.current[i] = el }}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#c890f0" transparent opacity={0.25} blending={THREE.AdditiveBlending} />
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

    const scale = 0.85 + bass * 0.8 + mids * 0.15
    meshRef.current.scale.setScalar(scale)
    glowRef.current.scale.setScalar(scale * 2.8 + Math.sin(time * 3) * 0.2 + bass * 0.5)
    glow2Ref.current.scale.setScalar(scale * 4.0 + Math.sin(time * 2.2) * 0.25 + bass * 0.8)
    glow3Ref.current.scale.setScalar(scale * 6.0 + Math.cos(time * 1.8) * 0.4 + bass * 1.0)
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
        const warp = 0.75
          + Math.sin(nx * 5 + time * 3) * bass * 0.28
          + Math.cos(ny * 4 + time * 2.5) * mids * 0.22
          + Math.sin(nz * 6 + time * 2) * bass * 0.15
          + Math.sin((nx + ny) * 8 + time * 4) * mids * 0.12
          + Math.cos((nx - nz) * 6 + time * 5) * bass * 0.08
        arr[i * 3] = nx * warp
        arr[i * 3 + 1] = ny * warp
        arr[i * 3 + 2] = nz * warp
      }
    }
    pos.needsUpdate = true

    const glowMat = glowRef.current.material as THREE.MeshBasicMaterial
    glowMat.opacity = 0.08 + bass * 0.18
    const glow2Mat = glow2Ref.current.material as THREE.MeshBasicMaterial
    glow2Mat.opacity = 0.04 + bass * 0.1
    const glow3Mat = glow3Ref.current.material as THREE.MeshBasicMaterial
    glow3Mat.opacity = 0.02 + bass * 0.05
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.8, 3]} />
        <meshStandardMaterial color="#f0d8a0" metalness={0.98} roughness={0.01} emissive="#d4a040" emissiveIntensity={0.9} />
      </mesh>
      <mesh ref={wireRef}>
        <icosahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color={theme.primary} wireframe transparent opacity={0.2} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={wire2Ref}>
        <octahedronGeometry args={[0.8, 1]} />
        <meshBasicMaterial color={theme.accent} wireframe transparent opacity={0.08} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Layered glow for soft prismatic diffusion */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color="#e8c870" transparent opacity={0.08} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={glow2Ref}>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.03} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={glow3Ref}>
        <sphereGeometry args={[0.9, 12, 12]} />
        <meshBasicMaterial color={theme.particles} transparent opacity={0.015} blending={THREE.AdditiveBlending} />
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
  const freqBands = 48
  const dotsPerBand = 24
  const totalDots = freqBands * 2 * dotsPerBand

  const { positions, colors, baseData } = useMemo(() => {
    const pos = new Float32Array(totalDots * 3)
    const col = new Float32Array(totalDots * 3)
    const data: { angle: number; bandIdx: number; dotIdx: number; radialOffset: number }[] = []

    const goldColor = new THREE.Color("#d4a040")
    const brightGold = new THREE.Color("#f0d070")
    const purpleColor = new THREE.Color("#8040c0")
    const lavenderColor = new THREE.Color("#c090ff")
    const warmWhite = new THREE.Color("#f0e0d0")

    let idx = 0
    for (let side = 0; side < 2; side++) {
      for (let band = 0; band < freqBands; band++) {
        const angle = (band / freqBands) * Math.PI + (side === 1 ? Math.PI : 0)
        for (let d = 0; d < dotsPerBand; d++) {
          const radialOffset = (Math.random() - 0.5) * 0.4
          data.push({ angle, bandIdx: band, dotIdx: d, radialOffset })
          pos[idx * 3] = 0
          pos[idx * 3 + 1] = 0
          pos[idx * 3 + 2] = 0

          const t = band / freqBands
          const dNorm = d / dotsPerBand
          const c = new THREE.Color()
          // Richer color distribution with shimmer hotspots
          if (t < 0.33) {
            c.lerpColors(brightGold, goldColor, t * 3)
          } else if (t < 0.66) {
            c.lerpColors(goldColor, purpleColor, (t - 0.33) * 3)
          } else {
            c.lerpColors(purpleColor, lavenderColor, (t - 0.66) * 3)
          }
          // Add warm white tips to the top dots
          if (dNorm > 0.8) c.lerp(warmWhite, (dNorm - 0.8) * 3)

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
    const radius = 4.2 + mousePos.y * 0.5
    const posAttr = pointsRef.current.geometry.attributes.position
    const arr = posAttr.array as Float32Array

    for (let i = 0; i < totalDots; i++) {
      const { angle, bandIdx, dotIdx, radialOffset } = baseData[i]
      const freq = frequencies[bandIdx]
      const height = freq * 6
      const adjustedAngle = angle + mousePos.x * 0.3
      const dNorm = dotIdx / dotsPerBand
      // Organic vertical spread with breathing
      const yPos = dNorm * height
        + Math.sin(time * 2.5 + dotIdx * 0.6 + bandIdx * 0.3) * 0.2 * freq
        + Math.cos(time * 1.8 + bandIdx * 0.5) * 0.1
      const scatter = radialOffset + Math.sin(time * 1.2 + dotIdx * 1.3) * 0.06
      const r = radius + scatter

      arr[i * 3] = Math.cos(adjustedAngle) * r
      arr[i * 3 + 1] = yPos
      arr[i * 3 + 2] = Math.sin(adjustedAngle) * r
    }
    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.06 + mousePos.x * 0.4
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={totalDots} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={totalDots} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
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
  const ringCount = 8

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    ringsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const baseScale = 2.0 + i * 1.2
      const pulse = Math.sin(time * 2.0 - i * 0.6) * bass * 0.8
      mesh.scale.setScalar(baseScale + pulse)

      mesh.rotation.x = Math.PI / 2 + Math.sin(time * 0.4 + i * 1.0) * 0.4
      mesh.rotation.y = time * 0.08 * (i % 2 === 0 ? 1 : -1) + i * 0.45
      mesh.rotation.z = Math.cos(time * 0.25 + i * 0.7) * 0.3

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (0.18 - i * 0.018) * (0.3 + bass * 1.0 + mids * 0.3)
    })
  })

  const ringColors = ["#d4a040", "#b870d0", "#8040c0", "#c090ff", "#e0c060", "#9050d0", "#d4a040", "#c090ff"]

  return (
    <group>
      {Array.from({ length: ringCount }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) ringsRef.current[i] = el }}>
          <torusGeometry args={[1, 0.006 + (i % 3) * 0.004, 8, 80]} />
          <meshBasicMaterial
            color={ringColors[i]}
            transparent
            opacity={0.15}
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
  const ribbonCount = 12

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)
    const highs = getHighs(analyzerData, time)

    meshesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const angle = (i / ribbonCount) * Math.PI * 2 + time * 0.35
      const radius = 1.6 + bass * 2.5 + Math.sin(time * 2.5 + i * 0.75) * 0.4
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = Math.sin(time * 2.0 + i * (Math.PI * 2 / ribbonCount)) * (1.0 + bass * 1.2)

      mesh.position.set(x, y, z)
      mesh.rotation.set(time * 1.8 + i, time * 0.6 + i * 0.35, time * 0.25)
      const stretch = 0.8 + bass * 4.0 + highs * 2.0 + mids * 0.5
      mesh.scale.set(0.06 + highs * 0.1, stretch, 0.06 + highs * 0.1)

      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.4 + bass * 1.5
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.18
    }
  })

  const goldColor = useMemo(() => new THREE.Color("#d4a040"), [])
  const purpleColor = useMemo(() => new THREE.Color("#8040c0"), [])
  const lavenderColor = useMemo(() => new THREE.Color("#c090ff"), [])

  return (
    <group ref={groupRef}>
      {Array.from({ length: ribbonCount }).map((_, i) => {
        const t = i / ribbonCount
        const c = new THREE.Color()
        if (t < 0.5) c.lerpColors(goldColor, purpleColor, t * 2)
        else c.lerpColors(purpleColor, lavenderColor, (t - 0.5) * 2)
        return (
          <mesh key={i} ref={(el) => { if (el) meshesRef.current[i] = el }}>
            <octahedronGeometry args={[0.35, 0]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.4} metalness={0.98} roughness={0.02} transparent opacity={0.85} />
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
  const beamCount = 24
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const frequencies = getFrequencies(analyzerData, beamCount, time)

    beamsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const angle = (i / beamCount) * Math.PI * 2
      const freq = frequencies[i]
      const reach = 1.5 + freq * 8 + bass * 3
      const x = Math.cos(angle) * reach * 0.45
      const z = Math.sin(angle) * reach * 0.45
      const y = Math.sin(time * 1.8 + i * 0.4) * freq * 1.0

      mesh.position.set(x, y, z)
      mesh.rotation.z = angle + Math.PI / 2
      mesh.rotation.x = Math.sin(time * 0.8 + i * 0.7) * 0.25
      mesh.scale.set(0.008 + freq * 0.012, reach, 0.008 + freq * 0.012)

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.03 + freq * 0.25
    })

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.05
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: beamCount }).map((_, i) => {
        const t = i / beamCount
        const beamColor = t < 0.33 ? "#d4a040" : t < 0.5 ? "#b870d0" : t < 0.75 ? "#8040c0" : "#c090ff"
        return (
          <mesh key={i} ref={(el) => { if (el) beamsRef.current[i] = el }}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color={beamColor}
              transparent
              opacity={0.05}
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
  const particleCount = 1200

  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    const col = new Float32Array(particleCount * 3)
    const sz = new Float32Array(particleCount)
    const gold = new THREE.Color("#d4a040")
    const purple = new THREE.Color("#8040c0")
    const lavender = new THREE.Color("#c090ff")
    const white = new THREE.Color("#e8d8c0")

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2
      const radius = 4 + Math.random() * 5
      pos[i * 3] = Math.cos(angle) * radius
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6
      pos[i * 3 + 2] = Math.sin(angle) * radius

      // Mix of gold, purple, lavender, and occasional bright white
      const r = Math.random()
      const c = new THREE.Color()
      if (r < 0.35) c.lerpColors(gold, white, Math.random() * 0.6)
      else if (r < 0.65) c.lerpColors(purple, lavender, Math.random())
      else if (r < 0.9) c.lerpColors(gold, purple, Math.random())
      else c.copy(white) // sparkle points
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b

      // Varying sizes - most tiny, some larger for depth
      sz[i] = r < 0.9 ? 0.02 + Math.random() * 0.03 : 0.06 + Math.random() * 0.04
    }
    return { positions: pos, colors: col, sizes: sz }
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
      const layer = i % 3
      const speed = layer === 0 ? 0.15 : layer === 1 ? -0.1 : 0.06
      const baseRadius = layer === 0 ? 5 : layer === 1 ? 6.5 : 8
      const angle = baseAngle + time * speed + mousePos.x * 0.3

      const wobble = Math.sin(time * 2.0 + i * 0.015) * (0.3 + bass * 2.5)
      const radius = baseRadius + wobble

      arr[i * 3] = Math.cos(angle) * radius
      arr[i * 3 + 1] =
        Math.sin(time * 1.2 + i * 0.03) * (0.6 + bass * 3 + highs * 1.5) +
        mousePos.y * 0.4 +
        Math.sin(i * 0.7) * 0.5
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }

    posAttr.needsUpdate = true
    pointsRef.current.rotation.y = time * 0.03
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={particleCount} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        vertexColors
        transparent
        opacity={0.7}
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
      ;(mat as THREE.MeshBasicMaterial).opacity = 0.03 + bass * 0.08
    }
      gridRef.current.position.y = -3.5 - bass * 0.5
  })

  return (
    <gridHelper
      ref={gridRef}
      args={[50, 50, theme.primary, theme.accent]}
      position={[0, -3.5, 0]}
      material-transparent={true}
      material-opacity={0.035}
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
    const breathe = Math.sin(time * 0.35) * 0.8 + Math.sin(time * 0.7) * 0.2
    const sway = Math.cos(time * 0.25) * 0.5 + Math.sin(time * 0.6) * 0.15
    const targetX = mousePos.x * 4 + sway
    const targetY = 3.0 + mousePos.y * 3 + breathe
    const targetZ = 11 + Math.sin(time * 0.18) * 2.5

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.02)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.02)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.012)
    camera.lookAt(0, breathe * 0.25, 0)
  })

  return (
    <>
      <color attach="background" args={["#020108"]} />
      <fog attach="fog" args={["#020108", 15, 40]} />

      <ambientLight intensity={0.03} />
      <pointLight position={[0, 8, 0]} intensity={2.0} color="#d4a040" distance={30} />
      <pointLight position={[8, 3, 8]} intensity={1.2} color="#8040c0" distance={25} />
      <pointLight position={[-8, 3, -8]} intensity={0.8} color="#c090ff" distance={22} />
      <pointLight position={[0, -4, 0]} intensity={0.4} color="#e0c070" distance={18} />
      <pointLight position={[4, 6, -4]} intensity={0.5} color="#b870d0" distance={15} />
      <pointLight position={[-4, -2, 6]} intensity={0.3} color="#f0d070" distance={12} />

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
    <div className="w-full h-screen relative overflow-hidden bg-[#020108]">
      <Canvas
        camera={{ position: [0, 4, 10], fov: 60 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
        dpr={[1, 2]}
      >
        <Scene analyzerData={analyzerData} mousePos={mousePos} theme={theme} />
      </Canvas>

      {/* Hidden but DOM-rendered audio element — browser trusts native controls in iframes */}
      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" loop />

      {/* Error message */}
      {error && showErrorTimeout && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-lg text-sm pointer-events-auto z-50 animate-pulse">
          {error}
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-3">
          {/* Status indicator */}
          {audioMode !== "off" && (
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#d4a040" }} />
              <span className="text-sm font-medium text-white/50 tracking-wide">
                {audioMode === "mic" ? "Listening to microphone" : fileName}
              </span>
            </div>
          )}

          {/* Control buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMic}
              className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 backdrop-blur-sm border border-white/10"
              style={
                audioMode === "mic"
                  ? { backgroundColor: "rgba(212,160,64,0.25)", color: "#e8d0a0", boxShadow: "0 0 20px rgba(212,160,64,0.15)" }
                  : { backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }
              }
            >
              {audioMode === "mic" ? "Mic On" : "Microphone"}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 backdrop-blur-sm border border-white/10"
              style={
                audioMode === "file"
                  ? { backgroundColor: "rgba(128,64,192,0.25)", color: "#c0a0e0", boxShadow: "0 0 20px rgba(128,64,192,0.15)" }
                  : { backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }
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
                className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 backdrop-blur-sm border border-white/10"
                style={{ backgroundColor: "rgba(212,160,64,0.25)", color: "#e8d0a0", boxShadow: "0 0 20px rgba(212,160,64,0.15)" }}
              >
                Play
              </button>
            )}

            {audioMode !== "off" && (
              <button
                onClick={stopAudio}
                className="px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 backdrop-blur-sm border border-white/10"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}
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
