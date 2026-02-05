"use client"

import dynamic from "next/dynamic"

const AudioVisualizer = dynamic(
  () => import("@/components/audio-visualizer"),
  { ssr: false }
)

export default function Page() {
  return <AudioVisualizer />
}

