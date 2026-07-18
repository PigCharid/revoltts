import {
  AudioLines,
  Check,
  ChevronDown,
  CircleStop,
  Clock3,
  FileAudio,
  Gauge,
  Headphones,
  Info,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Upload,
  WandSparkles,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { generateSpeech, type GenerationState } from "@/services/tts"

type TagGroup = "情绪" | "语气" | "节奏" | "声音"

type VoiceTag = {
  label: string
  value: string
  group: TagGroup
  tone: string
}

const tags: VoiceTag[] = [
  { label: "开心", value: "happy", group: "情绪", tone: "bg-amber-500/12 text-amber-300 border-amber-400/20" },
  { label: "兴奋", value: "excited", group: "情绪", tone: "bg-orange-500/12 text-orange-300 border-orange-400/20" },
  { label: "悲伤", value: "sad", group: "情绪", tone: "bg-blue-500/12 text-blue-300 border-blue-400/20" },
  { label: "生气", value: "angry", group: "情绪", tone: "bg-rose-500/12 text-rose-300 border-rose-400/20" },
  { label: "惊讶", value: "surprised", group: "情绪", tone: "bg-fuchsia-500/12 text-fuchsia-300 border-fuchsia-400/20" },
  { label: "温柔", value: "gentle", group: "情绪", tone: "bg-pink-500/12 text-pink-300 border-pink-400/20" },
  { label: "耳语", value: "whisper", group: "语气", tone: "bg-violet-500/12 text-violet-300 border-violet-400/20" },
  { label: "低沉", value: "low voice", group: "语气", tone: "bg-indigo-500/12 text-indigo-300 border-indigo-400/20" },
  { label: "专业播报", value: "professional broadcast tone", group: "语气", tone: "bg-cyan-500/12 text-cyan-300 border-cyan-400/20" },
  { label: "坚定", value: "calm but firm", group: "语气", tone: "bg-teal-500/12 text-teal-300 border-teal-400/20" },
  { label: "强调", value: "emphasis", group: "节奏", tone: "bg-lime-500/12 text-lime-300 border-lime-400/20" },
  { label: "停顿", value: "pause", group: "节奏", tone: "bg-slate-500/15 text-slate-300 border-slate-400/20" },
  { label: "短暂停顿", value: "short pause", group: "节奏", tone: "bg-slate-500/15 text-slate-300 border-slate-400/20" },
  { label: "放慢", value: "speak slowly", group: "节奏", tone: "bg-emerald-500/12 text-emerald-300 border-emerald-400/20" },
  { label: "轻笑", value: "chuckle", group: "声音", tone: "bg-yellow-500/12 text-yellow-300 border-yellow-400/20" },
  { label: "叹气", value: "sigh", group: "声音", tone: "bg-sky-500/12 text-sky-300 border-sky-400/20" },
  { label: "吸气", value: "inhale", group: "声音", tone: "bg-sky-500/12 text-sky-300 border-sky-400/20" },
  { label: "清嗓", value: "clearing throat", group: "声音", tone: "bg-stone-500/15 text-stone-300 border-stone-400/20" },
]

const exampleScript =
  "今天本来是很普通的一天。[短暂停顿]直到我打开那扇门，[惊讶]天啊！[耳语]里面竟然站着一个和我一模一样的人。"

const referenceTextExample =
  "这个系统能够将文字转换为自然流畅的语音。它会分析每个词语的上下文，并生成合适的语调。目标是让数字化的声音尽可能接近人类的对话。"

const MIN_REFERENCE_SECONDS = 10

function serializeScriptForApi(script: string) {
  return tags.reduce(
    (serialized, tag) => serialized.replaceAll(`[${tag.label}]`, `[${tag.value}]`),
    script
  )
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

function Waveform({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  const bars = useMemo(
    () => Array.from({ length: compact ? 48 : 76 }, (_, index) => 18 + ((index * 17 + index ** 2 * 3) % 76)),
    [compact]
  )

  return (
    <div className={cn("flex w-full items-center gap-[3px] overflow-hidden", compact ? "h-10" : "h-16")}>
      {bars.map((height, index) => (
        <span
          key={index}
          className={cn(
            "block w-0.5 shrink-0 rounded-full bg-white/12 transition-colors",
            active && "wave-bar bg-violet-400/75"
          )}
          style={{ height: `${height}%`, animationDelay: `${(index % 12) * 45}ms` }}
        />
      ))}
    </div>
  )
}

function StepBadge({ number, done }: { number: number; done?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
        done
          ? "border-emerald-400/25 bg-emerald-400/12 text-emerald-300"
          : "border-white/10 bg-white/[0.045] text-white/55"
      )}
    >
      {done ? <Check className="size-3.5" /> : number}
    </span>
  )
}

function App() {
  const [referenceName, setReferenceName] = useState("")
  const [referenceAudio, setReferenceAudio] = useState<Blob | null>(null)
  const [referenceUrl, setReferenceUrl] = useState("")
  const [referenceText, setReferenceText] = useState(referenceTextExample)
  const [script, setScript] = useState(exampleScript)
  const [activeGroup, setActiveGroup] = useState<TagGroup>("情绪")
  const [customTag, setCustomTag] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [referencePlaying, setReferencePlaying] = useState(false)
  const [generationState, setGenerationState] = useState<GenerationState>("idle")
  const [resultPlaying, setResultPlaying] = useState(false)
  const [resultUrl, setResultUrl] = useState("")
  const [mode, setMode] = useState<"稳定" | "平衡" | "灵活">("平衡")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [error, setError] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const referenceAudioRef = useRef<HTMLAudioElement>(null)
  const resultAudioRef = useRef<HTMLAudioElement>(null)

  const referenceReady = Boolean(referenceAudio && referenceUrl)
  const canGenerate = referenceReady && referenceText.trim().length > 0 && script.trim().length > 0

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isRecording])

  useEffect(() => {
    return () => {
      if (referenceUrl) URL.revokeObjectURL(referenceUrl)
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [referenceUrl])

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl)
    }
  }, [resultUrl])

  const setAudioSource = (blob: Blob, name: string) => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    setReferenceAudio(blob)
    setReferenceUrl(URL.createObjectURL(blob))
    setReferenceName(name)
    setGenerationState("idle")
    setResultPlaying(false)
    setResultUrl("")
    setError("")
  }

  const readAudioDuration = (file: File) =>
    new Promise<number>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const audio = new Audio()
      audio.preload = "metadata"
      audio.onloadedmetadata = () => {
        const duration = audio.duration
        URL.revokeObjectURL(url)
        if (Number.isFinite(duration)) resolve(duration)
        else reject(new Error("invalid duration"))
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error("audio metadata unavailable"))
      }
      audio.src = url
    })

  const handleFile = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith("audio/")) {
      setError("请选择 WAV、MP3、M4A 或 WebM 音频文件。")
      return
    }
    try {
      const duration = await readAudioDuration(file)
      if (duration < MIN_REFERENCE_SECONDS) {
        setError(`参考音频至少需要 ${MIN_REFERENCE_SECONDS} 秒，当前音频约 ${duration.toFixed(1)} 秒。`)
        return
      }
      setAudioSource(file, file.name)
    } catch {
      setError("无法读取音频时长，请更换 WAV、MP3、M4A 或 WebM 文件后重试。")
    }
  }

  const startRecording = async () => {
    setError("")
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("当前浏览器不支持录音，请改用上传音频。")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream
      recordingChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      })
      recorder.addEventListener("stop", () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        setAudioSource(blob, `我的录音 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}.webm`)
        stream.getTracks().forEach((track) => track.stop())
      })
      setRecordingSeconds(0)
      setIsRecording(true)
      recorder.start()
    } catch {
      setError("无法访问麦克风，请检查浏览器权限后重试。")
    }
  }

  const stopRecording = () => {
    if (recordingSeconds < MIN_REFERENCE_SECONDS) return
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const clearReference = () => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl)
    setReferenceUrl("")
    setReferenceAudio(null)
    setReferenceName("")
    setReferencePlaying(false)
    setGenerationState("idle")
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    setResultUrl("")
  }

  const insertTag = (value: string) => {
    const tag = `[${value.trim().replace(/^\[|\]$/g, "")}]`
    const textarea = textareaRef.current
    if (!textarea) {
      setScript((current) => `${current}${tag}`)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const next = `${script.slice(0, start)}${tag}${script.slice(end)}`
    setScript(next)
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + tag.length, start + tag.length)
    })
  }

  const addCustomTag = () => {
    if (!customTag.trim()) return
    insertTag(customTag)
    setCustomTag("")
  }

  const generate = async () => {
    if (!canGenerate || !referenceAudio || generationState === "generating" || generationState === "queued") return
    setResultPlaying(false)
    setError("")
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    setResultUrl("")
    try {
      const result = await generateSpeech(
        {
          referenceAudio,
          referenceAudioName: referenceName || "reference-audio.webm",
          referenceText,
          script: serializeScriptForApi(script),
          mode,
        },
        setGenerationState
      )
      setResultUrl(URL.createObjectURL(result.audioBlob))
      setGenerationState("completed")
    } catch (generationError) {
      setGenerationState("idle")
      setError(generationError instanceof Error ? generationError.message : "语音生成失败，请稍后重试。")
    }
  }

  const toggleReference = () => {
    const audio = referenceAudioRef.current
    if (!audio) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }

  const toggleResult = () => {
    const audio = resultAudioRef.current
    if (!audio) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }

  const visibleTags = tags.filter((tag) => tag.group === activeGroup)

  return (
    <div className="min-h-svh overflow-x-hidden bg-[#08090d] text-white selection:bg-violet-500/30">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(124,92,255,0.11),transparent_30%),radial-gradient(circle_at_90%_30%,rgba(67,188,255,0.07),transparent_32%)]" />

      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#08090d]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="relative flex size-9 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/12 text-violet-300 shadow-[0_0_28px_rgba(124,92,255,0.15)]">
              <AudioLines className="size-[18px]" />
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-[#08090d] bg-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-[-0.02em]">RevolTTS</span>
                <span className="rounded-full border border-white/[0.07] bg-white/[0.035] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/35">
                  Studio
                </span>
              </div>
              <p className="hidden text-[10px] text-white/28 sm:block">让声音拥有真实情绪</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 text-[11px] text-white/40 sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              RevolTTS 在线
            </div>
            <Button variant="ghost" size="sm" className="text-white/45 hover:bg-white/[0.05] hover:text-white">
              使用指南
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1480px] px-4 py-3 sm:px-6 sm:py-7 lg:px-8">
        <div className="mb-3 flex flex-col justify-between gap-3 sm:mb-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-violet-300/75">
              <Sparkles className="size-3.5" /> Voice Creation Workspace
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white sm:text-[32px]">创作一段有情绪的声音</h1>
            <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-white/38 sm:block">
              提供一段清晰的参考声音，在文字任意位置插入情绪指令，即刻生成自然、细腻的克隆语音。
            </p>
          </div>
          <div className="hidden items-center gap-4 text-[11px] text-white/28 sm:flex">
            <span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />预计 15–30 秒</span>
            <span className="h-3 w-px bg-white/10" />
            <span className="flex items-center gap-1.5"><Gauge className="size-3.5" />高保真 44.1kHz</span>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(320px,0.78fr)_minmax(480px,1.22fr)]">
          <section className="overflow-hidden rounded-[22px] border border-white/[0.075] bg-white/[0.025] shadow-[0_22px_70px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between border-b border-white/[0.055] px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-center gap-3">
                <StepBadge number={1} done={referenceReady && referenceText.trim().length > 0} />
                <div>
                  <h2 className="text-sm font-medium text-white/90">提供参考声音</h2>
                  <p className="mt-0.5 text-[11px] text-white/30">建议 10–30 秒清晰单人语音</p>
                </div>
              </div>
              <Headphones className="size-4 text-white/20" />
            </div>

            <div className="space-y-3 p-4 sm:p-5">
              <div className="overflow-hidden rounded-2xl border border-white/[0.075] bg-black/15">
              {!referenceReady ? (
                <div
                  className={cn(
                    "group relative flex min-h-[148px] flex-col items-center justify-center overflow-hidden p-4 text-center transition-all hover:bg-violet-500/[0.025] sm:min-h-[170px]",
                    isRecording && "bg-rose-500/[0.035]"
                  )}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleFile(event.dataTransfer.files[0])
                  }}
                >
                  <div className="pointer-events-none absolute inset-x-6 top-1 opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent)]">
                    <Waveform active={isRecording} compact />
                  </div>
                  <div
                    className={cn(
                      "relative z-10 mb-2 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-white/65 shadow-xl transition-all group-hover:scale-105 group-hover:text-violet-300 sm:size-12",
                      isRecording && "border-rose-400/25 bg-rose-400/10 text-rose-300"
                    )}
                  >
                    {isRecording ? <Mic className="recording-pulse size-5" /> : <FileAudio className="size-5" />}
                  </div>
                  {isRecording ? (
                    <>
                      <p className="text-sm font-medium text-white">正在聆听你的声音</p>
                      <p className="mt-1 font-mono text-2xl tracking-tight text-rose-300">{formatTime(recordingSeconds)}</p>
                      <Button
                        type="button"
                        onClick={stopRecording}
                        disabled={recordingSeconds < MIN_REFERENCE_SECONDS}
                        className="mt-5 bg-rose-500 text-white hover:bg-rose-400"
                      >
                        <CircleStop className="size-4" />
                        {recordingSeconds < MIN_REFERENCE_SECONDS
                          ? `${MIN_REFERENCE_SECONDS - recordingSeconds} 秒后可结束`
                          : "完成录音"}
                      </Button>
                      <p className="mt-2 text-[10px] text-white/30">参考录音至少需要 10 秒</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-white/85">拖入音频，或直接录制</p>
                      <p className="mt-1.5 text-xs text-white/28">WAV、MP3、M4A、WebM · 至少 10 秒 · 最大 30MB</p>
                      <div className="mt-3 flex flex-wrap justify-center gap-2.5">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          className="border-white/10 bg-white/[0.045] text-white/75 hover:bg-white/[0.08] hover:text-white"
                        >
                          <Upload className="size-4" /> 上传声音
                        </Button>
                        <Button
                          type="button"
                          onClick={startRecording}
                          className="bg-violet-500 text-white shadow-[0_8px_30px_rgba(124,92,255,0.24)] hover:bg-violet-400"
                        >
                          <Mic className="size-4" /> 开始录音
                        </Button>
                      </div>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={async (event) => {
                      const input = event.currentTarget
                      await handleFile(input.files?.[0])
                      input.value = ""
                    }}
                  />
                </div>
              ) : (
                <div className="bg-black/20 p-3.5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/12 text-violet-300">
                          <FileAudio className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-white/80">{referenceName}</p>
                          <p className="mt-0.5 text-[10px] text-white/28">参考声音已就绪</p>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearReference}
                      aria-label="移除参考声音"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white/25 transition hover:bg-white/[0.06] hover:text-white/70"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleReference}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:scale-105"
                    >
                      {referencePlaying ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
                    </button>
                    <Waveform active={referencePlaying} compact />
                  </div>
                  <audio
                    ref={referenceAudioRef}
                    src={referenceUrl}
                    onPlay={() => setReferencePlaying(true)}
                    onPause={() => setReferencePlaying(false)}
                    onEnded={() => setReferencePlaying(false)}
                    className="hidden"
                  />
                </div>
              )}

              {error && (
                <div className="mx-3 mb-3 flex gap-2 rounded-xl border border-rose-400/15 bg-rose-400/[0.055] px-3.5 py-2.5 text-xs leading-5 text-rose-200/80">
                  <Info className="mt-0.5 size-3.5 shrink-0" /> {error}
                </div>
              )}

              <div className="border-t border-white/[0.055] p-3.5 sm:p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <label htmlFor="reference-text" className="text-xs font-medium text-white/68">参考音频原文</label>
                  <button
                    type="button"
                    onClick={() =>
                      setReferenceText(referenceTextExample)
                    }
                    className="text-[10px] text-violet-300/65 transition hover:text-violet-200"
                  >
                    使用示例朗读稿
                  </button>
                </div>
                <textarea
                  id="reference-text"
                  value={referenceText}
                  onChange={(event) => setReferenceText(event.target.value)}
                  placeholder="准确填写参考音频中说出的内容…"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-white/[0.075] bg-black/20 px-3.5 py-2.5 text-[13px] leading-5 text-white/80 outline-none transition placeholder:text-white/18 focus:border-violet-400/30 focus:ring-2 focus:ring-violet-500/10 sm:text-sm sm:leading-6"
                />
                <div className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-white/25">
                  <Info className="mt-0.5 size-3 shrink-0" /> 原文与音频越匹配，声音还原通常越稳定。
                </div>
              </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-white/[0.075] bg-white/[0.025] shadow-[0_22px_70px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between border-b border-white/[0.055] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <StepBadge number={2} done={script.trim().length > 0} />
                <div>
                  <h2 className="text-sm font-medium text-white/90">编辑情绪脚本</h2>
                  <p className="mt-0.5 text-[11px] text-white/30">在光标位置插入任意表达指令</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScript(exampleScript)}
                  className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-white/35 transition hover:bg-white/[0.05] hover:text-white/70 sm:flex"
                >
                  <RotateCcw className="size-3.5" /> 示例脚本
                </button>
                <Button
                  type="button"
                  disabled={generationState !== "completed" && (!canGenerate || generationState !== "idle")}
                  onClick={generationState === "completed" ? toggleResult : generate}
                  className="h-9 rounded-lg bg-violet-500 px-3.5 text-xs text-white shadow-[0_8px_24px_rgba(124,92,255,0.22)] hover:bg-violet-400 disabled:bg-white/[0.06] disabled:text-white/25 disabled:shadow-none sm:px-4"
                >
                  {generationState === "idle" && <><Sparkles className="size-3.5" />生成语音</>}
                  {(generationState === "queued" || generationState === "generating") && <><AudioLines className="generation-pulse size-3.5" />生成中…</>}
                  {generationState === "completed" && (resultPlaying
                    ? <><Pause className="size-3.5 fill-current" />暂停</>
                    : <><Play className="size-3.5 fill-current" />试听</>)}
                </Button>
                <audio
                  ref={resultAudioRef}
                  src={resultUrl}
                  onPlay={() => setResultPlaying(true)}
                  onPause={() => setResultPlaying(false)}
                  onEnded={() => setResultPlaying(false)}
                  className="hidden"
                />
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.075] bg-black/20 transition focus-within:border-violet-400/30 focus-within:ring-2 focus-within:ring-violet-500/10">
                <textarea
                  ref={textareaRef}
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                  placeholder="输入你想生成的内容，然后插入情绪标签…"
                  className="min-h-[210px] w-full resize-none bg-transparent px-4 py-4 text-[15px] leading-8 text-white/82 outline-none placeholder:text-white/18 sm:min-h-[238px] sm:px-5 sm:py-5"
                  maxLength={1000}
                />
                <div className="flex items-center justify-between border-t border-white/[0.045] px-4 py-2.5 text-[10px] text-white/22 sm:px-5">
                  <span className="flex items-center gap-1.5"><WandSparkles className="size-3" />支持自由自然语言标签</span>
                  <span>{script.length} / 1000</span>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-white/60">表达标签</p>
                  <p className="hidden text-[10px] text-white/22 sm:block">点击后插入到当前光标位置</p>
                </div>
                <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.055] bg-black/15 p-1 scrollbar-none">
                  {(["情绪", "语气", "节奏", "声音"] as TagGroup[]).map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => setActiveGroup(group)}
                      className={cn(
                        "min-w-[58px] flex-1 rounded-lg px-3 py-2 text-[11px] font-medium transition",
                        activeGroup === group
                          ? "bg-white/[0.085] text-white shadow-sm"
                          : "text-white/30 hover:text-white/55"
                      )}
                    >
                      {group}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex min-h-[72px] flex-wrap content-start gap-2">
                  {visibleTags.map((tag) => (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => insertTag(tag.label)}
                      title={`插入 [${tag.label}]`}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition hover:-translate-y-0.5 hover:brightness-125",
                        tag.tone
                      )}
                    >
                      <Plus className="mr-1 inline size-3" />{tag.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-black/15 p-2 sm:flex-row">
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
                    <Sparkles className="size-3.5 shrink-0 text-violet-300/60" />
                    <input
                      value={customTag}
                      onChange={(event) => setCustomTag(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          addCustomTag()
                        }
                      }}
                      placeholder="自定义：像发现秘密一样小声而兴奋地说"
                      className="h-9 min-w-0 flex-1 bg-transparent text-xs text-white/75 outline-none placeholder:text-white/20"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!customTag.trim()}
                    onClick={addCustomTag}
                    className="border-white/[0.08] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
                  >
                    插入自定义标签
                  </Button>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-white/[0.055] bg-black/15">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((value) => !value)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-white/55">
                    <SlidersHorizontal className="size-3.5" /> 生成设置
                  </span>
                  <ChevronDown className={cn("size-3.5 text-white/25 transition", advancedOpen && "rotate-180")} />
                </button>
                {advancedOpen && (
                  <div className="border-t border-white/[0.05] px-4 py-4">
                    <p className="mb-3 text-[10px] uppercase tracking-wider text-white/25">表达模式</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(["稳定", "平衡", "灵活"] as const).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setMode(item)}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-[11px] transition",
                            mode === item
                              ? "border-violet-400/25 bg-violet-500/10 text-violet-200"
                              : "border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-white/55"
                          )}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <footer className="flex flex-col items-center justify-between gap-2 px-1 pb-4 pt-6 text-[10px] text-white/18 sm:flex-row">
          <p>RevolTTS Voice Studio · Powered by Fish Audio S2-Pro</p>
          <p>生成请求由本地 RevolTTS 推理服务处理</p>
        </footer>
      </main>
    </div>
  )
}

export default App
