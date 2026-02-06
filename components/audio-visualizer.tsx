"use client"

import React from "react"

import { useRef, useMemo, useEffect, useState } from "react"
import { Canvas, useFrame, useThree, extend } from "@react-three/fiber"
import * as THREE from "three"

// Mystical cosmic orb palette — warm/cool contrast like the reference
const PALETTE = {
  // Cool tones
  deepBlue: "#1a2444",
  midnightBlue: "#0a0e1f",
  lavender: "#8e8edf",
  paleViolet: "#b4a8e0",
  ice: "#a8c4e0",
  frost: "#c8daea",
  // Warm tones
  amber: "#c8965c",
  warmGold: "#d4a870",
  peachGlow: "#e0b88a",
  softPink: "#c48aac",
  // Base
  bgDark: "#080c18",
  bgMid: "#0f1428",
  bgWarm: "#1a1535",
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

// ========== Atmospheric cosmic background ==========
class CosmicBackgroundMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
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
        varying vec2 vUv;

        // Simple pseudo-noise
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
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = vUv;
          
          // Deep midnight base — darker at edges, slightly lighter in center
          vec3 bgDark = vec3(0.031, 0.047, 0.094);   // #080c18
          vec3 bgMid = vec3(0.059, 0.078, 0.157);     // #0f1428
          vec3 bgWarm = vec3(0.102, 0.082, 0.208);    // #1a1535
          
          // Vertical gradient with warm zone at horizon (center-vertical)
          float horizonMask = exp(-pow((uv.y - 0.42) * 3.5, 2.0));
          vec3 bg = mix(bgDark, bgMid, smoothstep(0.0, 0.5, uv.y));
          bg = mix(bg, bgWarm, horizonMask * 0.6);
          
          // Warm amber horizon glow
          vec3 amberGlow = vec3(0.784, 0.588, 0.361); // #c8965c
          bg += amberGlow * horizonMask * 0.06 * (1.0 + uBass * 0.08);
          
          // Nebula cloud layers using fbm
          vec2 cloudUv = uv * 3.0 + vec2(uTime * 0.015, uTime * 0.008);
          float cloud1 = fbm(cloudUv);
          float cloud2 = fbm(cloudUv * 1.5 + vec2(3.7, 1.2) + uTime * 0.01);
          
          // Cool blue-purple clouds
          vec3 coolCloud = vec3(0.16, 0.18, 0.35);
          bg += coolCloud * cloud1 * 0.12;
          
          // Warm dusty cloud layer
          vec3 warmCloud = vec3(0.3, 0.22, 0.18);
          bg += warmCloud * cloud2 * 0.06 * horizonMask;
          
          // Central radial glow where the orb will be
          vec2 center = uv - vec2(0.5, 0.45);
          float dist = length(center);
          float orbGlow = smoothstep(0.35, 0.0, dist) * (0.08 + uBass * 0.06);
          vec3 glowColor = mix(vec3(0.557, 0.557, 0.875), vec3(0.784, 0.588, 0.361), 0.3);
          bg += glowColor * orbGlow;
          
          // Distant stars
          float starField = hash(floor(uv * 200.0));
          float starBrightness = smoothstep(0.997, 1.0, starField);
          float twinkle = sin(uTime * 2.0 + starField * 100.0) * 0.3 + 0.7;
          bg += vec3(0.8, 0.85, 1.0) * starBrightness * twinkle * 0.5;
          
          // Subtle mountain/landscape silhouette at horizon
          float mountainNoise = noise(vec2(uv.x * 8.0, 0.0)) * 0.04 + 0.42;
          float mountainMask = smoothstep(mountainNoise, mountainNoise - 0.015, uv.y);
          bg = mix(bg, bgDark * 0.7, mountainMask * 0.5);
          
          gl_FragColor = vec4(bg, 1.0);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
    })
  }
}

extend({ CosmicBackgroundMaterial })

function ShaderBackground({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const matRef = useRef<CosmicBackgroundMaterial>(null)

  useFrame((state) => {
    if (!matRef.current) return
    const time = state.clock.elapsedTime
    matRef.current.uniforms.uTime.value = time
    matRef.current.uniforms.uBass.value = getBass(analyzerData, time)
  })

  return (
    <mesh position={[0, 0, -14]} scale={[50, 50, 1]}>
      <planeGeometry args={[1, 1]} />
      {/* @ts-ignore */}
      <cosmicBackgroundMaterial ref={matRef} />
    </mesh>
  )
}



// ========== Orb shader — translucent glass with internal swirling energy ==========
class CrystalOrbMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMids: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uBass;
        uniform float uMids;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        varying vec3 vViewDir;

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

        void main() {
          // Fresnel for glassy rim glow
          float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
          fresnel = pow(fresnel, 2.5);

          // Internal swirling energy pattern
          vec2 swirlUv = vUv * 4.0;
          float angle = atan(vWorldPos.y, vWorldPos.x);
          float r = length(vWorldPos.xy);
          
          // Multiple swirl layers
          float swirl1 = noise(vec2(angle * 2.0 + uTime * 0.4, r * 3.0 - uTime * 0.3));
          float swirl2 = noise(vec2(angle * 3.0 - uTime * 0.5, r * 2.0 + uTime * 0.2));
          float swirl3 = noise(vec2(vWorldPos.z * 4.0 + uTime * 0.3, angle * 1.5 - uTime * 0.4));
          
          float energy = swirl1 * 0.4 + swirl2 * 0.35 + swirl3 * 0.25;
          energy = smoothstep(0.2, 0.8, energy);
          energy *= (0.6 + uBass * 0.6);

          // Color layers — blues, purples, pinks from center
          vec3 deepBlue = vec3(0.12, 0.15, 0.45);
          vec3 purple = vec3(0.35, 0.2, 0.55);
          vec3 pink = vec3(0.55, 0.3, 0.5);
          vec3 teal = vec3(0.2, 0.4, 0.5);
          
          vec3 innerColor = mix(deepBlue, purple, swirl1);
          innerColor = mix(innerColor, teal, swirl3 * 0.4);
          innerColor = mix(innerColor, pink, swirl2 * 0.3 * uMids);
          innerColor += energy * 0.15;

          // Warm golden rim light (from the right side, like reference)
          vec3 warmRim = vec3(0.784, 0.588, 0.361); // amber
          float rimWarm = pow(max(0.0, dot(vNormal, normalize(vec3(1.0, 0.2, 0.5)))), 2.0);
          
          // Cool blue rim light (from the left)
          vec3 coolRim = vec3(0.45, 0.55, 0.85);
          float rimCool = pow(max(0.0, dot(vNormal, normalize(vec3(-0.8, 0.3, -0.5)))), 2.0);

          // Combine
          vec3 color = innerColor;
          color += warmRim * rimWarm * (0.5 + uBass * 0.3);
          color += coolRim * rimCool * 0.3;
          
          // Fresnel edge glow — iridescent mix
          vec3 fresnelColor = mix(coolRim, warmRim, fresnel);
          color += fresnelColor * fresnel * (0.6 + uBass * 0.4);

          // Translucency — more transparent at center, opaque at edges
          float alpha = 0.45 + fresnel * 0.45 + energy * 0.1;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
      depthWrite: true,
    })
  }
}

extend({ CrystalOrbMaterial })

// ========== Central orb — mystical crystal sphere ==========
function CentralOrb({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const orbRef = useRef<THREE.Mesh>(null)
  const orbMatRef = useRef<CrystalOrbMaterial>(null)
  const innerGlowRef = useRef<THREE.Mesh>(null)
  const outerGlowRef = useRef<THREE.Mesh>(null)
  const rimRingRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)

    // Gentle breathing
    const scale = 1.6 + bass * 0.25
    if (orbRef.current) {
      orbRef.current.scale.setScalar(scale)
      orbRef.current.rotation.y = time * 0.08
      orbRef.current.rotation.x = Math.sin(time * 0.05) * 0.1
    }

    // Update shader uniforms
    if (orbMatRef.current) {
      orbMatRef.current.uniforms.uTime.value = time
      orbMatRef.current.uniforms.uBass.value = bass
      orbMatRef.current.uniforms.uMids.value = mids
    }

    // Inner warm glow
    if (innerGlowRef.current) {
      innerGlowRef.current.scale.setScalar(scale * 1.05)
      const mat = innerGlowRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.06 + bass * 0.06
    }

    // Outer soft atmospheric glow
    if (outerGlowRef.current) {
      outerGlowRef.current.scale.setScalar(scale * 2.0 + Math.sin(time * 0.5) * 0.1)
      const mat = outerGlowRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.03 + bass * 0.04
    }

    // Faint halo ring
    if (rimRingRef.current) {
      rimRingRef.current.scale.setScalar(scale * 1.15)
      rimRingRef.current.rotation.x = Math.PI / 2 + Math.sin(time * 0.2) * 0.08
      rimRingRef.current.rotation.z = time * 0.02
      const mat = rimRingRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.08 + bass * 0.08
    }
  })

  return (
    <group>
      {/* Main crystal orb */}
      <mesh ref={orbRef}>
        <sphereGeometry args={[1, 64, 64]} />
        {/* @ts-ignore */}
        <crystalOrbMaterial ref={orbMatRef} />
      </mesh>
      {/* Inner warm glow sphere */}
      <mesh ref={innerGlowRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={PALETTE.amber} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Outer atmospheric glow */}
      <mesh ref={outerGlowRef}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color={PALETTE.lavender} transparent opacity={0.04} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Faint halo ring like reference */}
      <mesh ref={rimRingRef}>
        <torusGeometry args={[1, 0.015, 16, 100]} />
        <meshBasicMaterial color={PALETTE.warmGold} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ========== Dense nebula fog cloud surrounding the orb ==========
function NebulaCloud({
  analyzerData,
  mousePos,
}: {
  analyzerData: AudioAnalyzerData | null
  mousePos: { x: number; y: number }
}) {
  const groupRef = useRef<THREE.Group>(null)

  // Dense inner fog — large soft particles close to orb
  const innerRef = useRef<THREE.Points>(null)
  const innerCount = 200
  const innerBase = useRef<Float32Array | null>(null)

  // Outer diffuse haze — spread wider
  const outerRef = useRef<THREE.Points>(null)
  const outerCount = 250
  const outerBase = useRef<Float32Array | null>(null)

  const innerData = useMemo(() => {
    const pos = new Float32Array(innerCount * 3)
    const col = new Float32Array(innerCount * 3)
    const sizes = new Float32Array(innerCount)

    const colors = [
      new THREE.Color(PALETTE.deepBlue),
      new THREE.Color(PALETTE.lavender).multiplyScalar(0.5),
      new THREE.Color(PALETTE.paleViolet).multiplyScalar(0.4),
      new THREE.Color(PALETTE.amber).multiplyScalar(0.3),
      new THREE.Color(PALETTE.softPink).multiplyScalar(0.3),
      new THREE.Color(PALETTE.ice).multiplyScalar(0.4),
    ]

    for (let i = 0; i < innerCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      // Concentrate near the orb surface (r = 1.8 to 4)
      const r = 1.8 + Math.pow(Math.random(), 0.7) * 2.2
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55
      pos[i * 3 + 2] = r * Math.cos(phi)

      const c = colors[Math.floor(Math.random() * colors.length)]
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b

      sizes[i] = 0.3 + Math.random() * 0.5
    }
    innerBase.current = new Float32Array(pos)
    return { positions: pos, colors: col, sizes }
  }, [])

  const outerData = useMemo(() => {
    const pos = new Float32Array(outerCount * 3)
    const col = new Float32Array(outerCount * 3)

    const colors = [
      new THREE.Color(PALETTE.deepBlue).multiplyScalar(0.6),
      new THREE.Color(PALETTE.bgWarm),
      new THREE.Color(PALETTE.amber).multiplyScalar(0.15),
      new THREE.Color(PALETTE.lavender).multiplyScalar(0.2),
      new THREE.Color(PALETTE.ice).multiplyScalar(0.2),
    ]

    for (let i = 0; i < outerCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 3.5 + Math.random() * 5
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.45
      pos[i * 3 + 2] = r * Math.cos(phi)

      const c = colors[Math.floor(Math.random() * colors.length)]
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    outerBase.current = new Float32Array(pos)
    return { positions: pos, colors: col }
  }, [])

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)
    const mids = getMids(analyzerData, time)
    const breathScale = 1.0 + bass * 0.2 + mids * 0.1

    // Animate inner nebula
    if (innerRef.current && innerBase.current) {
      const arr = (innerRef.current.geometry.attributes.position.array) as Float32Array
      for (let i = 0; i < innerCount; i++) {
        const bx = innerBase.current[i * 3]
        const by = innerBase.current[i * 3 + 1]
        const bz = innerBase.current[i * 3 + 2]
        const drift = Math.sin(time * 0.2 + i * 0.08) * 0.15
        const sway = Math.cos(time * 0.15 + i * 0.06) * 0.12
        arr[i * 3] = bx * breathScale + drift
        arr[i * 3 + 1] = by * breathScale + sway
        arr[i * 3 + 2] = bz * breathScale + drift * 0.4
      }
      innerRef.current.geometry.attributes.position.needsUpdate = true
      const mat = innerRef.current.material as THREE.PointsMaterial
      mat.opacity = 0.18 + bass * 0.15
    }

    // Animate outer haze
    if (outerRef.current && outerBase.current) {
      const arr = (outerRef.current.geometry.attributes.position.array) as Float32Array
      for (let i = 0; i < outerCount; i++) {
        const bx = outerBase.current[i * 3]
        const by = outerBase.current[i * 3 + 1]
        const bz = outerBase.current[i * 3 + 2]
        const drift = Math.sin(time * 0.1 + i * 0.05) * 0.08
        const sway = Math.cos(time * 0.08 + i * 0.04) * 0.06
        arr[i * 3] = bx + drift + mousePos.x * 0.2
        arr[i * 3 + 1] = by + sway
        arr[i * 3 + 2] = bz + drift * 0.3
      }
      outerRef.current.geometry.attributes.position.needsUpdate = true
      const mat = outerRef.current.material as THREE.PointsMaterial
      mat.opacity = 0.08 + bass * 0.06
    }

    if (groupRef.current) {
      groupRef.current.rotation.y = time * 0.015
    }
  })

  return (
    <group ref={groupRef}>
      {/* Dense inner nebula fog */}
      <points ref={innerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={innerCount} array={innerData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={innerCount} array={innerData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.55} vertexColors transparent opacity={0.2} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
      {/* Outer diffuse haze */}
      <points ref={outerRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={outerCount} array={outerData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={outerCount} array={outerData.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.8} vertexColors transparent opacity={0.1} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  )
}

// ========== Soft halo rings around the orb ==========
function OrbitingRings({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const ringsRef = useRef<THREE.Mesh[]>([])
  const ringCount = 3

  useFrame((state) => {
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)

    ringsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const baseScale = 1.8 + i * 0.4
      const pulse = Math.sin(time * 0.4 - i * 0.5) * bass * 0.08
      mesh.scale.setScalar(baseScale + pulse)

      mesh.rotation.x = Math.PI / 2 + Math.sin(time * 0.08 + i * 1.2) * 0.12
      mesh.rotation.y = time * 0.015 * (i % 2 === 0 ? 1 : -1) + i * 0.7
      mesh.rotation.z = Math.cos(time * 0.06 + i) * 0.06

      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (0.06 - i * 0.015) * (0.6 + bass * 0.4)
    })
  })

  const ringColors = [PALETTE.warmGold, PALETTE.ice, PALETTE.paleViolet]

  return (
    <group>
      {Array.from({ length: ringCount }).map((_, i) => (
        <mesh key={i} ref={(el) => { if (el) ringsRef.current[i] = el }}>
          <torusGeometry args={[1, 0.012, 16, 100]} />
          <meshBasicMaterial
            color={ringColors[i]}
            transparent
            opacity={0.06}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}



// ========== Scattered star field across the entire scene ==========
function StarField({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const starCount = 400

  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(starCount * 3)
    const col = new Float32Array(starCount * 3)
    const sz = new Float32Array(starCount)

    const starColors = [
      new THREE.Color("#e8e8ff"), // white-blue
      new THREE.Color("#d4d4f0"), // soft lavender-white
      new THREE.Color(PALETTE.frost),
      new THREE.Color(PALETTE.peachGlow).multiplyScalar(0.5), // faint warm
    ]

    for (let i = 0; i < starCount; i++) {
      // Spread across a large volume
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 6 + Math.random() * 14
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6 - 0.5
      pos[i * 3 + 2] = r * Math.cos(phi)

      const c = starColors[Math.floor(Math.random() * starColors.length)]
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b

      sz[i] = 0.02 + Math.random() * 0.04
    }
    return { positions: pos, colors: col, sizes: sz }
  }, [])

  useFrame((state) => {
    if (!pointsRef.current) return
    const time = state.clock.elapsedTime
    const bass = getBass(analyzerData, time)

    // Very slow overall rotation
    pointsRef.current.rotation.y = time * 0.003

    // Twinkle by varying opacity
    const mat = pointsRef.current.material as THREE.PointsMaterial
    mat.opacity = 0.5 + Math.sin(time * 0.5) * 0.1 + bass * 0.15
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={starCount} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={starCount} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={0.55}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

// ========== Reflection plane (subtle ground mirror) ==========
function ReflectionPlane({
  analyzerData,
}: {
  analyzerData: AudioAnalyzerData | null
}) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    if (!matRef.current) return
    const bass = getBass(analyzerData, state.clock.elapsedTime)
    matRef.current.opacity = 0.015 + bass * 0.015
  })

  return (
    <mesh position={[0, -2.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[30, 30]} />
      <meshBasicMaterial
        ref={matRef}
        color={PALETTE.lavender}
        transparent
        opacity={0.02}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
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
    // Gentle camera motion
    const breathe = Math.sin(time * 0.15) * 0.2
    const sway = Math.cos(time * 0.1) * 0.1
    const targetX = mousePos.x * 1.5 + sway
    const targetY = 1.0 + mousePos.y * 0.8 + breathe
    const targetZ = 7 + Math.sin(time * 0.08) * 0.5

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.012)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.012)
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.008)
    camera.lookAt(0, breathe * 0.15, 0)
  })

  return (
    <>
      <color attach="background" args={[PALETTE.bgDark]} />
      <fog attach="fog" args={[PALETTE.bgDark, 10, 30]} />

      {/* Ambient fill — low and warm */}
      <ambientLight intensity={0.08} />
      {/* Warm golden key light from right (like reference rim lighting) */}
      <pointLight position={[5, 2, 3]} intensity={1.2} color={PALETTE.amber} distance={15} />
      {/* Cool fill from left */}
      <pointLight position={[-5, 2, -3]} intensity={0.6} color={PALETTE.ice} distance={15} />
      {/* Subtle top light */}
      <pointLight position={[0, 6, 0]} intensity={0.3} color={PALETTE.paleViolet} distance={20} />
      {/* Bottom bounce */}
      <pointLight position={[0, -3, 2]} intensity={0.15} color={PALETTE.deepBlue} distance={12} />

      <ShaderBackground analyzerData={analyzerData} />
      <CentralOrb analyzerData={analyzerData} />
      <NebulaCloud analyzerData={analyzerData} mousePos={mousePos} />
      <OrbitingRings analyzerData={analyzerData} />
      <StarField analyzerData={analyzerData} />
      <ReflectionPlane analyzerData={analyzerData} />
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
        camera={{ position: [0, 1, 7], fov: 55 }}
        gl={{ antialias: true, powerPreference: "default", alpha: false }}
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
