"use client"

import dynamic from "next/dynamic"

const AudioVisualizer = dynamic(
  () => import("@/components/audio-visualizer"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-white text-lg">Loading visualizer...</div>
      </div>
    ),
  }
)

export default function Page() {
  return <AudioVisualizer />
}
