export type GenerationState = "idle" | "queued" | "generating" | "completed"

export type GenerationRequest = {
  referenceAudio: Blob
  referenceAudioName: string
  referenceText: string
  script: string
  mode: "稳定" | "平衡" | "灵活"
  seed: number
}

export type GenerationResult = {
  audioBlob: Blob
  filename: string
}

const modeParameters = {
  稳定: { topP: "0.7", temperature: "0.7" },
  平衡: { topP: "0.8", temperature: "0.8" },
  灵活: { topP: "0.9", temperature: "0.9" },
} as const

const ttsApiBaseUrl = (
  import.meta.env.VITE_TTS_API_BASE_URL ||
  (import.meta.env.DEV ? "http://workspace.featurize.cn:18438" : "/api")
).replace(/\/+$/, "")

function getResponseFilename(response: Response) {
  const disposition = response.headers.get("content-disposition") ?? ""
  const match = disposition.match(/filename="?([^";]+)"?/i)
  return match?.[1] || "revoltts-preview.wav"
}

async function getErrorMessage(response: Response) {
  const fallback = `语音生成失败（HTTP ${response.status}）`
  try {
    const payload = (await response.json()) as { detail?: unknown }
    return typeof payload.detail === "string" ? payload.detail : fallback
  } catch {
    return fallback
  }
}

export async function generateSpeech(
  request: GenerationRequest,
  onStateChange: (state: GenerationState) => void
): Promise<GenerationResult> {
  const parameters = modeParameters[request.mode]
  const formData = new FormData()

  formData.append("text", request.script)
  formData.append("reference_audio", request.referenceAudio, request.referenceAudioName)
  formData.append("reference_text", request.referenceText)
  formData.append("format", "wav")
  formData.append("chunk_length", "200")
  formData.append("max_new_tokens", "1024")
  formData.append("top_p", parameters.topP)
  formData.append("temperature", parameters.temperature)
  formData.append("seed", String(request.seed))
  formData.append("use_memory_cache", "on")
  formData.append("filename", "revoltts-preview")

  onStateChange("queued")
  onStateChange("generating")

  let response: Response
  try {
    response = await fetch(`${ttsApiBaseUrl}/ttsform`, {
      method: "POST",
      body: formData,
    })
  } catch {
    throw new Error("无法连接语音服务，请确认 TTS 接口地址可访问且已允许跨域请求。")
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return {
    audioBlob: await response.blob(),
    filename: getResponseFilename(response),
  }
}
