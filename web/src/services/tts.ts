export type GenerationState = "idle" | "queued" | "generating" | "completed"

export type GenerationRequest = {
  referenceAudioUrl: string
  referenceText: string
  script: string
  mode: "稳定" | "平衡" | "灵活"
}

export type GenerationResult = {
  audioUrl: string
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

/**
 * 当前使用本地模拟流程。接入真实服务时，只需在这里替换为 fetch 请求，
 * 页面、录音、标签和结果播放器都无需改动。
 */
export async function generateSpeech(
  request: GenerationRequest,
  onStateChange: (state: GenerationState) => void
): Promise<GenerationResult> {
  onStateChange("queued")
  await wait(850)
  onStateChange("generating")
  await wait(2750)

  return { audioUrl: request.referenceAudioUrl }
}
