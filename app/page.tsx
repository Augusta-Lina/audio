"use client"

import dynamic from "next/dynamic"

const AudioVisualizer = dynamic(
  () => import("@/components/audio-visualizer"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen bg-[#010104] flex items-center justify-center">
        <div className="text-white/30 text-sm tracking-widest font-light">Loading...</div>
      </div>
    ),
  }
)

export default function Page() {
  return <AudioVisualizer />
}
