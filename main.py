import io
import os
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock
from typing import Literal

import numpy as np
import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from loguru import logger
from pydantic import BaseModel, Field
from typing_extensions import Annotated

from fish_speech.inference_engine import TTSInferenceEngine
from fish_speech.models.dac.inference import load_model as load_decoder_model
from fish_speech.models.text2semantic.inference import launch_thread_safe_queue
from fish_speech.utils.schema import ServeReferenceAudio, ServeTTSRequest

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseModel):
    llama_checkpoint: Path = Field(
        default_factory=lambda: Path(
            os.getenv("REVOLTTS_LLAMA_CHECKPOINT", BASE_DIR / "checkpoints/s2-pro")
        )
    )
    decoder_checkpoint: Path = Field(
        default_factory=lambda: Path(
            os.getenv(
                "REVOLTTS_DECODER_CHECKPOINT",
                BASE_DIR / "checkpoints/s2-pro/codec.pth",
            )
        )
    )
    decoder_config: str = Field(
        default_factory=lambda: os.getenv("REVOLTTS_DECODER_CONFIG", "modded_dac_vq")
    )
    device: str = Field(default_factory=lambda: os.getenv("REVOLTTS_DEVICE", "cuda"))
    half: bool = Field(default_factory=lambda: env_bool("REVOLTTS_HALF", False))
    compile: bool = Field(default_factory=lambda: env_bool("REVOLTTS_COMPILE", False))
    warmup: bool = Field(default_factory=lambda: env_bool("REVOLTTS_WARMUP", True))


class ModelManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.lock = Lock()
        self.device = select_device(settings.device)
        self.precision = torch.half if settings.half else torch.bfloat16

        self._validate_checkpoints()
        self._load_models()

        if settings.warmup:
            self.warm_up()

    def _validate_checkpoints(self) -> None:
        if not self.settings.llama_checkpoint.exists():
            raise FileNotFoundError(
                f"Llama checkpoint not found: {self.settings.llama_checkpoint}"
            )
        if not self.settings.decoder_checkpoint.exists():
            raise FileNotFoundError(
                f"Decoder checkpoint not found: {self.settings.decoder_checkpoint}"
            )

    def _load_models(self) -> None:
        logger.info("Loading Llama model from {}", self.settings.llama_checkpoint)
        self.llama_queue = launch_thread_safe_queue(
            checkpoint_path=self.settings.llama_checkpoint,
            device=self.device,
            precision=self.precision,
            compile=self.settings.compile,
        )

        logger.info("Loading decoder model from {}", self.settings.decoder_checkpoint)
        self.decoder_model = load_decoder_model(
            config_name=self.settings.decoder_config,
            checkpoint_path=self.settings.decoder_checkpoint,
            device=self.device,
        )

        self.engine = TTSInferenceEngine(
            llama_queue=self.llama_queue,
            decoder_model=self.decoder_model,
            precision=self.precision,
            compile=self.settings.compile,
        )

    def warm_up(self) -> None:
        logger.info("Warming up TTS models")
        request = ServeTTSRequest(
            text="Hello world.",
            references=[],
            reference_id=None,
            max_new_tokens=1024,
            chunk_length=200,
            top_p=0.7,
            repetition_penalty=1.2,
            temperature=0.7,
            format="wav",
            streaming=False,
        )
        list(self.engine.inference(request))
        logger.info("Models warmed up")

    def synthesize(
        self,
        *,
        text: str,
        reference_audio: bytes,
        reference_text: str,
        audio_format: Literal["wav", "pcm", "mp3", "opus"],
        chunk_length: int,
        max_new_tokens: int,
        top_p: float,
        repetition_penalty: float,
        temperature: float,
        normalize: bool,
        seed: int | None,
        use_memory_cache: Literal["on", "off"],
    ) -> tuple[int, np.ndarray]:
        request = ServeTTSRequest(
            text=text,
            references=[
                ServeReferenceAudio(audio=reference_audio, text=reference_text)
            ],
            reference_id=None,
            format=audio_format,
            chunk_length=chunk_length,
            max_new_tokens=max_new_tokens,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
            temperature=temperature,
            normalize=normalize,
            seed=seed,
            use_memory_cache=use_memory_cache,
            streaming=False,
        )

        with self.lock:
            for result in self.engine.inference(request):
                if result.code == "error":
                    raise RuntimeError(str(result.error))
                if result.code == "final" and isinstance(result.audio, tuple):
                    return result.audio

        raise RuntimeError("No audio generated, please check the input text.")


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def select_device(preferred: str) -> str:
    if preferred == "cuda" and not torch.cuda.is_available():
        if torch.backends.mps.is_available():
            logger.info("CUDA is not available, using MPS.")
            return "mps"
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            logger.info("CUDA is not available, using XPU.")
            return "xpu"
        logger.info("CUDA is not available, using CPU.")
        return "cpu"
    return preferred


def audio_content_type(audio_format: str) -> str:
    return {
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "opus": "audio/ogg",
        "pcm": "application/octet-stream",
    }.get(audio_format, "application/octet-stream")


def write_audio(sample_rate: int, audio: np.ndarray, audio_format: str) -> bytes:
    if audio_format == "pcm":
        return audio.astype(np.float32).tobytes()

    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format=audio_format)
    return buffer.getvalue()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model_manager = ModelManager(Settings())
    host = os.getenv("REVOLTTS_HOST", "0.0.0.0")
    port = int(os.getenv("REVOLTTS_PORT", "8080"))
    display_host = "127.0.0.1" if host == "0.0.0.0" else host
    logger.success("revoltts started successfully")
    logger.info("Health: http://{}:{}/health", display_host, port)
    logger.info("TTS form API: http://{}:{}/ttsform", display_host, port)
    yield


app = FastAPI(title="revoltts", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ttsform")
async def ttsform(
    text: Annotated[str, Form(min_length=1)],
    reference_audio: Annotated[UploadFile, File()],
    reference_text: Annotated[str, Form(min_length=1)],
    format: Annotated[Literal["wav", "pcm", "mp3", "opus"], Form()] = "wav",
    chunk_length: Annotated[int, Form(ge=100, le=1000)] = 200,
    max_new_tokens: Annotated[int, Form(ge=0)] = 1024,
    top_p: Annotated[float, Form(ge=0.1, le=1.0)] = 0.8,
    repetition_penalty: Annotated[float, Form(ge=0.9, le=2.0)] = 1.1,
    temperature: Annotated[float, Form(ge=0.1, le=1.0)] = 0.8,
    normalize: Annotated[bool, Form()] = True,
    seed: Annotated[int | None, Form()] = None,
    use_memory_cache: Annotated[Literal["on", "off"], Form()] = "off",
    filename: Annotated[str | None, Form()] = None,
):
    manager: ModelManager = app.state.model_manager
    try:
        reference_audio_bytes = await reference_audio.read()
        if not reference_audio_bytes:
            raise HTTPException(status_code=400, detail="Reference audio is empty")

        sample_rate, audio = manager.synthesize(
            text=text,
            reference_audio=reference_audio_bytes,
            reference_text=reference_text,
            audio_format=format,
            chunk_length=chunk_length,
            max_new_tokens=max_new_tokens,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
            temperature=temperature,
            normalize=normalize,
            seed=seed,
            use_memory_cache=use_memory_cache,
        )
        payload = write_audio(sample_rate, audio, format)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("TTS generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    output_name = filename or "audio"
    if not output_name.endswith(f".{format}"):
        output_name = f"{output_name}.{format}"

    return Response(
        content=payload,
        media_type=audio_content_type(format),
        headers={"Content-Disposition": f"attachment; filename={output_name}"},
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("REVOLTTS_HOST", "0.0.0.0"),
        port=int(os.getenv("REVOLTTS_PORT", "8080")),
        reload=env_bool("REVOLTTS_RELOAD", False),
    )
