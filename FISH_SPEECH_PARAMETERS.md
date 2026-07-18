# Fish Speech S2-Pro 参数说明

本文以当前仓库内的 `fish_speech` 源码和 RevolTTS 的 `main.py` 为准，区分：

1. RevolTTS `/ttsform` 当前对外开放的表单参数；
2. Fish Speech `ServeTTSRequest` 原生请求模型；
3. 底层生成器具备、但 RevolTTS 当前没有开放的参数；
4. 参数是否真正进入当前推理链路。

## 1. RevolTTS `/ttsform` 接口

请求方式：

```text
POST /ttsform
Content-Type: multipart/form-data
```

### 必填参数

| 参数 | 类型 | 作用 |
| --- | --- | --- |
| `text` | string | 要合成的文本，可包含 Fish Speech 行内标签和多人说话标记 |
| `reference_audio` | file | 声音克隆参考音频，当前接口每次接收一个文件 |
| `reference_text` | string | 参考音频中实际说出的原文，必须尽量准确匹配 |

前端当前要求参考音频至少 10 秒；这是前端产品校验，后端暂未校验时长。

### 可选参数

| 参数 | 类型/范围 | 默认值 | 当前作用 |
| --- | --- | --- | --- |
| `format` | `wav` / `pcm` / `mp3` / `opus` | `wav` | 控制返回音频编码；WAV 最稳妥 |
| `chunk_length` | integer，100–1000 | `200` | 按 UTF-8 字节数对长文本/多人轮次分批；值越小分段越多 |
| `max_new_tokens` | integer，≥ 0 | `1024` | 限制每批生成的最大新 token 数；`0` 代表由模型上下文长度决定 |
| `top_p` | float，0.1–1.0 | `0.8` | nucleus sampling；越低通常越保守稳定 |
| `repetition_penalty` | float，0.9–2.0 | `1.1` | 请求层接受，但当前底层采样调用未实际使用，暂不建议放到产品界面 |
| `temperature` | float，0.1–1.0 | `0.8` | 采样随机度；越高通常越灵活，越低通常越稳定 |
| `normalize` | boolean | `true` | 请求层接受，但当前推理引擎未读取该字段，目前实际无效 |
| `seed` | integer 或空 | 空 | 固定随机种子；相同输入和参数更容易复现相近结果 |
| `use_memory_cache` | `on` / `off` | `off` | 以参考音频 SHA-256 为键缓存编码结果；重复使用同一参考音频时可减少处理开销 |
| `filename` | string 或空 | `audio` | 控制下载响应中的文件名；缺少扩展名时自动补充 |

接口成功时直接返回音频二进制，不返回 JSON。

## 2. Fish Speech 原生 `ServeTTSRequest`

| 字段 | 类型/范围 | 默认值 | 状态 |
| --- | --- | --- | --- |
| `text` | string | 必填 | 真正进入文本到语义生成器 |
| `chunk_length` | 100–1000 | `200` | 真正生效 |
| `format` | `wav` / `pcm` / `mp3` / `opus` | `wav` | 推理引擎本身不编码，由 API 输出层使用 |
| `latency` | `normal` / `balanced` | `normal` | 当前本地推理引擎未读取，实际无效 |
| `references` | `ServeReferenceAudio[]` | `[]` | 支持一个或多个参考音频，每项包含 `audio` 和 `text` |
| `reference_id` | string 或空 | 空 | 从 `references/<id>/` 加载预存参考声音；优先级高于 `references` |
| `seed` | integer 或空 | 空 | 真正生效 |
| `use_memory_cache` | `on` / `off` | `off` | 真正生效 |
| `normalize` | boolean | `true` | 当前本地推理引擎未读取，实际无效 |
| `streaming` | boolean | `false` | 引擎支持分段结果；RevolTTS 当前固定为 `false`，HTTP 接口不流式返回 |
| `max_new_tokens` | integer | `1024` | 真正生效 |
| `top_p` | 0.1–1.0 | `0.8` | 真正生效 |
| `repetition_penalty` | 0.9–2.0 | `1.1` | 字段被传入 `generate_long`，但当前采样调用没有继续使用 |
| `temperature` | 0.1–1.0 | `0.8` | 真正生效 |

### `ServeReferenceAudio`

每个参考声音包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `audio` | bytes | 音频二进制；JSON 场景也能尝试解析较长的 Base64 字符串 |
| `text` | string | 对应音频的准确原文 |

Fish Speech 引擎原生支持多个参考声音，但 RevolTTS `/ttsform` 当前只开放一个 `reference_audio + reference_text`。

## 3. 底层生成器参数

`generate_long` 还具备以下参数：

| 参数 | 底层默认值 | RevolTTS 状态 |
| --- | --- | --- |
| `num_samples` | `1` | 未开放，固定生成一个样本 |
| `top_k` | `30` | 未开放，当前推理引擎使用底层默认值 |
| `compile` | `false` | 通过服务环境变量控制，不是单次请求参数 |
| `iterative_prompt` | `true` | RevolTTS 根据 `chunk_length > 0` 自动开启；接口限制最小 100，因此始终开启 |
| `prompt_text` | 空 | 由参考声音原文自动构建 |
| `prompt_tokens` | 空 | 由参考音频编码或缓存自动构建 |

命令行推理脚本还支持 `prompt-audio`、`prompt-tokens`、`output`、`output-dir`、`checkpoint-path`、`device` 和 `half`，但这些属于离线 CLI/服务启动配置，不适合作为普通 HTTP 单次请求参数。

## 4. 多人说话

底层会识别文本中的说话人标记：

```text
<|speaker:0|>你好，我是第一个人。
<|speaker:1|>你好，我是第二个人。
```

当前分批逻辑最多按 5 个说话人处理。没有显式说话人标记时，参考文本会自动添加 `<|speaker:0|>`。

## 5. 服务启动环境变量

这些参数在服务启动时生效，不属于 `/ttsform`：

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `REVOLTTS_LLAMA_CHECKPOINT` | `checkpoints/s2-pro` | 文本到语义模型目录 |
| `REVOLTTS_DECODER_CHECKPOINT` | `checkpoints/s2-pro/codec.pth` | 音频解码器权重 |
| `REVOLTTS_DECODER_CONFIG` | `modded_dac_vq` | 解码器配置名 |
| `REVOLTTS_DEVICE` | `cuda` | `cuda` / `cpu` / `mps` / `xpu` 等设备 |
| `REVOLTTS_HALF` | `false` | 使用 FP16；关闭时模型使用 BF16 |
| `REVOLTTS_COMPILE` | `false` | 是否启用模型编译 |
| `REVOLTTS_WARMUP` | `true` | 启动时是否预热 |
| `REVOLTTS_HOST` | `0.0.0.0` | 后端监听地址 |
| `REVOLTTS_PORT` | `8080` | 后端监听端口 |
| `REVOLTTS_RELOAD` | `false` | Uvicorn 自动重载 |

## 6. 产品界面建议开放的参数

第一版建议只向普通用户显示：

- 输出格式：固定 WAV，下载时再考虑转码；
- 表达模式：映射到 `temperature + top_p`；
- 随机种子：放在高级设置；
- 参考声音缓存：服务端自动开启，不必让用户选择。

建议暂时隐藏：

- `normalize`、`latency`：当前链路实际无效；
- `repetition_penalty`：当前实现没有真正进入采样；
- `max_new_tokens`、`chunk_length`：由后端根据文本长度管理更合理；
- `streaming`：当前 RevolTTS HTTP 响应不支持；
- `top_k`、`num_samples`：当前接口未开放。

