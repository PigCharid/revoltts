# revoltts

`revoltts` 是一个基于 Fish Speech 的精简 TTS API 服务，项目内已经打包了必要的模型代码和 S2-Pro 模型文件。

当前只提供克隆音频合成能力：

- `GET /health`：健康检查
- `POST /ttsform`：通过表单上传文本、参考音频和参考音频文本，返回合成音频

## 项目内容

- `main.py`：API 服务入口
- `index.html`：浏览器调试页面
- `fish_speech/`：从 Fish Speech 复制过来的推理代码
- `checkpoints/s2-pro/`：S2-Pro 模型文件和 codec
- `pyproject.toml`：uv 依赖管理配置
- `FISH_SPEECH_LICENSE`：Fish Speech 上游许可证副本

## 安装依赖

依赖已经写在 `pyproject.toml` 里。需要安装时执行：

```bash
cd /home/featurize/app/revoltts
uv sync --python 3.12 --extra cu128
```

如果你的 CUDA/PyTorch 环境不同，可以把 `cu128` 换成其它 extra：

```bash
uv sync --python 3.12 --extra cu126
uv sync --python 3.12 --extra cu129
uv sync --python 3.12 --extra cpu
```

## 启动服务

依赖安装完成后，使用项目虚拟环境里的 Python 启动：

```bash
cd /home/featurize/app/revoltts
.venv/bin/python main.py
```

默认监听：

```text
0.0.0.0:8080
```

也可以通过环境变量修改监听地址：

```bash
REVOLTTS_HOST=127.0.0.1 REVOLTTS_PORT=9000 .venv/bin/python main.py
```

开发时可以开启自动重载：

```bash
REVOLTTS_RELOAD=true .venv/bin/python main.py
```

也可以用 uvicorn 启动：

```bash
cd /home/featurize/app/revoltts
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8080
```

默认加载项目内的模型：

```text
checkpoints/s2-pro
checkpoints/s2-pro/codec.pth
```

可选环境变量：

```bash
export REVOLTTS_LLAMA_CHECKPOINT=/path/to/s2-pro
export REVOLTTS_DECODER_CHECKPOINT=/path/to/s2-pro/codec.pth
export REVOLTTS_DECODER_CONFIG=modded_dac_vq
export REVOLTTS_DEVICE=cuda
export REVOLTTS_HALF=false
export REVOLTTS_COMPILE=false
export REVOLTTS_WARMUP=true
```

## 接口说明

### 页面调试

服务启动后可以在浏览器打开：

```text
http://127.0.0.1:8080/
```

页面里可以配置 `/ttsform` 请求地址，上传或录制参考音频，填写 `text` 和 `reference_text` 后直接生成并播放音频。

### 健康检查

```bash
curl http://127.0.0.1:8080/health
```

返回：

```json
{"status": "ok"}
```

### 克隆音色 TTS

`POST /ttsform`

请求体为 `multipart/form-data`：

```bash
curl -X POST http://127.0.0.1:8080/ttsform \
  -F "text=要合成的文本" \
  -F "reference_audio=@/path/to/reference.wav" \
  -F "reference_text=参考音频对应文本" \
  -F "format=wav" \
  -F "chunk_length=200" \
  -F "max_new_tokens=1024" \
  -F "top_p=0.8" \
  -F "repetition_penalty=1.1" \
  -F "temperature=0.8" \
  -F "normalize=true" \
  -F "use_memory_cache=off" \
  -o output.wav
```

说明：

- `reference_audio` 必须是参考音频文件。
- `reference_text` 必须是参考音频对应的原文。
- `format` 支持 `wav`、`mp3`、`opus`、`pcm`。
- `filename` 可选，用于指定下载文件名。
- 当前服务只走克隆音频模式，不支持 `reference_id`。
- 每次请求都会使用传入的参考音频和参考文本进行音色克隆。
