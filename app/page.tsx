"use client"

import dynamic from "next/dynamic"

const AudioVisualizer = dynamic(
  () => import("@/components/audio-visualizer"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen bg-[#020208] flex items-center justify-center">
        <div className="text-white/60 text-lg font-light tracking-wider">Loading visualizer...</div>
      </div>
    ),
  }
)

export default function Page() {
  return <AudioVisualizer />
}
