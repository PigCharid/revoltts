# RevolTTS

RevolTTS 是一个基于 [Fish Audio S2-Pro](https://huggingface.co/fishaudio/s2-pro) 的声音克隆 TTS 服务。

项目提供：

- 单人零样本声音克隆
- Fish Audio S2-Pro `[tag]` 行内情绪控制
- 自由自然语言情绪标签
- FastAPI HTTP 接口
- WAV、PCM、MP3、Opus 输出选项

> 模型权重没有提交到 Git。首次运行前必须单独下载 S2-Pro 权重。

## 目录结构

```text
revoltts/
├─ main.py                    # FastAPI 服务入口
├─ fish_speech/               # Fish Speech 推理及训练源码
├─ checkpoints/s2-pro/        # S2-Pro 权重，需单独下载
├─ web/                       # React/Vite 产品前端
├─ pyproject.toml             # Python 项目和依赖配置
├─ uv.lock                    # Python 依赖锁文件
└─ FISH_SPEECH_LICENSE        # Fish Speech 许可证
```

Python 服务只提供 TTS API，不再托管页面。产品界面位于 `web/`，前后端分别启动和部署。

Fish Speech 请求参数、实际生效情况及产品开放建议见 [`FISH_SPEECH_PARAMETERS.md`](FISH_SPEECH_PARAMETERS.md)。

## 运行环境

推荐配置：

- 操作系统：Ubuntu 22.04/24.04
- Python：3.12
- GPU：NVIDIA 24GB 显存或更高
- 系统内存：至少 32GB，推荐 64GB
- 磁盘空间：至少预留 15GB
- 包管理器：[uv](https://docs.astral.sh/uv/)

S2-Pro 官方建议至少使用 24GB 显存。CPU 模式可用于兼容性测试，但生成速度可能很慢。

### 查看 NVIDIA 和 CUDA 版本

首先确认服务器能够识别 NVIDIA 显卡：

```bash
nvidia-smi
```

输出右上角的 `CUDA Version` 表示当前 NVIDIA 驱动支持的最高 CUDA 版本。例如：

```text
CUDA Version: 12.8
```

它不代表服务器一定安装了完整的 CUDA Toolkit。检查 CUDA Toolkit 版本可以执行：

```bash
nvcc --version
```

如果提示 `nvcc: command not found`，通常也不影响项目运行。PyTorch 安装包会携带所需的 CUDA 运行库，关键是 NVIDIA 驱动版本需要兼容。

项目依赖安装完成后，可以检查 PyTorch 实际使用的 CUDA 版本和 GPU 状态：

```bash
uv run python -c "import torch; print('PyTorch:', torch.__version__); print('CUDA:', torch.version.cuda); print('GPU 可用:', torch.cuda.is_available()); print('显卡:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else '无')"
```

根据 `nvidia-smi` 显示的 CUDA 兼容版本选择依赖：

```bash
# CUDA 12.6
uv sync --python 3.12 --extra cu126

# CUDA 12.8
uv sync --python 3.12 --extra cu128

# CUDA 12.9
uv sync --python 3.12 --extra cu129
```

## 快速启动

### 1. 拉取代码

```bash
git clone https://github.com/PigCharid/revoltts.git
cd revoltts
```

### 2. 安装系统依赖

Ubuntu/Debian 需要先安装音频处理工具和 Python pip。该步骤需要 root 或 sudo 权限：

```bash
sudo apt update
sudo apt install -y python3 python3-pip portaudio19-dev libsox-dev ffmpeg
```

如果当前账号没有 sudo 权限，请先让服务器管理员完成这一步。

### 3. 使用 pip 安装 uv

如果机器尚未安装 uv：

```bash
python3 -m pip install --user --upgrade uv
```

本项目不要求 Conda。uv 默认会安装到当前用户的 `~/.local/bin`，如果安装完成后仍提示 `uv: command not found`，执行：

```bash
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

如果使用 Bash，请将上面的 `.zshrc` 改为 `.bashrc`。

确认安装：

```bash
uv --version
```

### 4. 安装 Python 依赖

NVIDIA CUDA 12.8 环境推荐：

```bash
uv sync --python 3.12 --extra cu128
```

其他可选环境：

```bash
# CUDA 12.6
uv sync --python 3.12 --extra cu126

# CUDA 12.9
uv sync --python 3.12 --extra cu129

# CPU
uv sync --python 3.12 --extra cpu
```

依赖安装完成后，uv 会在项目目录创建 `.venv/`。

### 5. 下载 S2-Pro 模型

使用刚安装的项目环境下载：

```bash
uv run hf download fishaudio/s2-pro --local-dir checkpoints/s2-pro
```

下载完成后应至少存在：

```text
checkpoints/s2-pro/config.json
checkpoints/s2-pro/codec.pth
checkpoints/s2-pro/model.safetensors.index.json
checkpoints/s2-pro/model-00001-of-00002.safetensors
checkpoints/s2-pro/model-00002-of-00002.safetensors
checkpoints/s2-pro/tokenizer.json
```

可以执行下面的命令检查：

```bash
ls -lh checkpoints/s2-pro
```

### 6. 启动后端服务

```bash
uv run python main.py
```

默认监听：

```text
http://0.0.0.0:8080
```

首次启动需要加载并预热模型，时间取决于磁盘、CPU 和 GPU 性能。看到下面的日志后才表示服务已经可以使用：

```text
revoltts started successfully
```

### 7. 启动前端

另开一个终端，在项目目录执行：

```bash
cd web
npm install
npm run dev
```

浏览器访问：

```text
http://服务器IP:8000
```

本机部署时访问 `http://127.0.0.1:8000/`。后端默认运行在 `8080` 端口，前端默认运行在 `8000` 端口。

Vite 开发服务器已允许通过 Featurize 的 `*.featurize.cn` 工作区域名访问。

需要让外部用户通过 HTTPS 试用录音功能时，可以使用 Cloudflare Tunnel、LocalTunnel 或 localhost.run 将本机 `8000` 端口映射为临时 HTTPS 地址；Vite 已允许相应的临时域名访问。

开发环境中，Vite 会把所有 `/api/*` 请求代理到同一台机器的 `http://127.0.0.1:8080`，并自动移除 `/api` 前缀。例如：

```text
/api/health  -> http://127.0.0.1:8080/health
/api/ttsform -> http://127.0.0.1:8080/ttsform
```

因此前端代码只需要请求 `/api/ttsform`，不需要写服务器 IP，也不需要单独处理开发环境跨域。后端不在本机或端口不同时，可以在启动前端前覆盖代理目标：

```bash
REVOLTTS_API_PROXY_TARGET=http://192.168.1.10:8080 npm run dev
```

## 验证服务

### 健康检查

```bash
curl http://127.0.0.1:8080/health
```

预期响应：

```json
{"status":"ok"}
```

## API 使用

### `POST /ttsform`

请求类型：

```text
multipart/form-data
```

最小调用示例：

```bash
curl -X POST http://127.0.0.1:8080/ttsform \
  -F "text=你好，这是使用我的声音生成的一段测试语音。" \
  -F "reference_audio=@/path/to/reference.wav" \
  -F "reference_text=参考音频中实际说出的完整文字。" \
  -F "format=wav" \
  -o output.wav
```

参考音频建议：

- 10～30 秒
- 只有一个人说话
- 无背景音乐
- 无明显混响和噪声
- 音量稳定
- `reference_text` 与实际说话内容完全一致

### 行内情绪标签

S2-Pro 支持在目标文本的任意位置插入 `[tag]`：

```bash
curl -X POST http://127.0.0.1:8080/ttsform \
  -F "text=今天本来是很普通的一天。[short pause]直到我打开那扇门，[shocked]天啊！[whisper]里面竟然站着一个和我一模一样的人。" \
  -F "reference_audio=@/path/to/reference.wav" \
  -F "reference_text=参考音频中实际说出的完整文字。" \
  -F "format=wav" \
  -o emotional.wav
```

常用标签：

```text
[happy] [excited] [sad] [angry] [surprised] [shocked]
[whisper] [low voice] [emphasis] [pause] [short pause]
[laughing] [chuckle] [sigh] [inhale] [exhale]
[volume up] [volume down] [loud] [shouting]
```

模型也支持自由自然语言描述：

```text
[whisper in a small voice]
[professional broadcast tone]
[laughing nervously]
[calm but firm]
```

### 完整参数

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---:|---|
| `text` | string | 必填 | 需要生成的目标文本 |
| `reference_audio` | file | 必填 | 参考声音文件 |
| `reference_text` | string | 必填 | 参考声音对应原文 |
| `format` | string | `wav` | `wav`、`pcm`、`mp3`、`opus` |
| `chunk_length` | int | `200` | 文本分段长度，范围 100～1000 |
| `max_new_tokens` | int | `1024` | 最大生成 Token 数 |
| `top_p` | float | `0.8` | 核采样参数，范围 0.1～1.0 |
| `repetition_penalty` | float | `1.1` | 重复惩罚，范围 0.9～2.0 |
| `temperature` | float | `0.8` | 随机性，范围 0.1～1.0 |
| `normalize` | bool | `true` | 是否规范化输入文本 |
| `seed` | int | 空 | 固定随机种子 |
| `use_memory_cache` | string | `off` | 是否缓存参考音频编码，`on`/`off` |
| `filename` | string | `audio` | 下载文件名 |

完整示例：

```bash
curl -X POST http://127.0.0.1:8080/ttsform \
  -F "text=[professional broadcast tone]欢迎使用 RevolTTS。" \
  -F "reference_audio=@/path/to/reference.wav" \
  -F "reference_text=参考音频中实际说出的完整文字。" \
  -F "format=wav" \
  -F "chunk_length=200" \
  -F "max_new_tokens=1024" \
  -F "top_p=0.8" \
  -F "repetition_penalty=1.1" \
  -F "temperature=0.8" \
  -F "normalize=true" \
  -F "use_memory_cache=off" \
  -F "filename=revoltts-demo" \
  -o revoltts-demo.wav
```

## 配置项

服务可以通过环境变量配置：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `REVOLTTS_HOST` | `0.0.0.0` | 监听地址 |
| `REVOLTTS_PORT` | `8080` | 监听端口 |
| `REVOLTTS_RELOAD` | `false` | 是否启用开发热重载 |
| `REVOLTTS_LLAMA_CHECKPOINT` | `checkpoints/s2-pro` | S2-Pro 模型目录 |
| `REVOLTTS_DECODER_CHECKPOINT` | `checkpoints/s2-pro/codec.pth` | Codec 权重路径 |
| `REVOLTTS_DECODER_CONFIG` | `modded_dac_vq` | Codec Hydra 配置名 |
| `REVOLTTS_DEVICE` | `cuda` | 推理设备 |
| `REVOLTTS_HALF` | `false` | 是否使用 FP16；默认使用 BF16 |
| `REVOLTTS_COMPILE` | `false` | 是否使用 `torch.compile` |
| `REVOLTTS_WARMUP` | `true` | 启动时是否预热模型 |

示例：

```bash
REVOLTTS_HOST=127.0.0.1 \
REVOLTTS_PORT=9000 \
REVOLTTS_WARMUP=true \
uv run python main.py
```

不支持 BF16 的 GPU 可以尝试：

```bash
REVOLTTS_HALF=true uv run python main.py
```

CPU 模式：

```bash
REVOLTTS_DEVICE=cpu REVOLTTS_WARMUP=false uv run python main.py
```

## 使用 Uvicorn 启动

也可以直接使用 Uvicorn：

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8080
```

建议只使用一个 Worker：

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8080 --workers 1
```

不要在单张 24GB GPU 上开启多个 Uvicorn Worker。每个 Worker 都会重新加载一份模型，容易导致显存不足。

## `web/` 前端开发

`web/` 是 React + TypeScript + Vite 产品前端。

安装依赖：

```bash
cd web
npm install
```

启动开发服务器：

```bash
npm run dev
```

默认访问地址：`http://127.0.0.1:8000/`。如果 8000 端口已被占用，Vite 会直接提示错误，避免自动切换到其他端口。

构建：

```bash
npm run build
```

Python 服务不会自动返回 `web/dist`。开发时分别启动 FastAPI 和 Vite；部署时可由 Nginx/Caddy 托管 `web/dist`，并将 API 请求转发到 FastAPI。

## 常见问题

### 找不到模型文件

错误类似：

```text
Llama checkpoint not found
Decoder checkpoint not found
```

重新下载模型：

```bash
uv run hf download fishaudio/s2-pro --local-dir checkpoints/s2-pro
```

### CUDA 不可用

先检查驱动和 PyTorch：

```bash
nvidia-smi
uv run python -c "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.version.cuda)"
```

如果 `torch.cuda.is_available()` 返回 `False`，确认安装了与机器环境对应的 uv extra，例如：

```bash
uv sync --python 3.12 --extra cu128 --reinstall
```

### 显存不足

建议依次检查：

1. 是否启动了多个 Python/Uvicorn 进程
2. 是否配置了多个 Uvicorn Worker
3. GPU 是否被其他程序占用
4. 是否开启了 `REVOLTTS_COMPILE=true`

查看 GPU 使用情况：

```bash
nvidia-smi
```

### MP3 或 Opus 输出失败

MP3、Opus 是否可用取决于当前 SoundFile/libsndfile 环境。遇到编码错误时先使用：

```text
format=wav
```

WAV 是当前最稳妥的输出格式。

### 首次启动很慢

首次启动会加载约数 GB 的模型并执行预热。可以暂时关闭预热排查启动问题：

```bash
REVOLTTS_WARMUP=false uv run python main.py
```

## 开发检查

Python 语法检查：

```bash
uv run python -m compileall -q main.py fish_speech
```

前端检查：

```bash
cd web
npm install
npm run lint
npm run build
```

## 许可证

`fish_speech/` 源码和 S2-Pro 模型权重受 Fish Audio 对应许可证约束。使用、分发或部署前请阅读：

- [FISH_SPEECH_LICENSE](./FISH_SPEECH_LICENSE)
- 下载到 `checkpoints/s2-pro/LICENSE.md` 的模型许可证

请确保参考声音的使用符合适用法律，并获得声音权利人的许可。
