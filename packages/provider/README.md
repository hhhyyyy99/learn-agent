# @learn-agent/provider

通过 `providers.yaml` 配置文件统一管理多个 LLM provider，对外暴露统一的 `LLM` 类。

## 快速开始

```ts
import { LLM } from "@learn-agent/provider";

// 用默认 provider + 默认 model
const llm = new LLM();

// 非流式
const result = await llm.chat({
  messages: [{ role: "user", content: "用一句话解释什么是递归" }],
});
console.log(result.content);

// 流式（统一 chunk 格式）
for await (const chunk of llm.stream({
  messages: [{ role: "user", content: "用一句话解释什么是递归" }],
  thinking: true,
})) {
  process.stdout.write(chunk.text);
}
```

## 配置文件

项目根目录创建 `providers.yaml`：

```yaml
default: openai

providers:
  openai:
    type: openai-compatible
    apiKey: ${OPENAI_API_KEY}
    baseURL: ${OPENAI_BASE_URL}
    defaultModel: gpt-4o
    models:
      - id: gpt-4o

  anthropic:
    type: anthropic
    apiKey: ${ANTHROPIC_API_KEY}
    baseURL: ${ANTHROPIC_BASE_URL}
    defaultModel: claude-sonnet-4-6
    models:
      - id: claude-sonnet-4-6
```

`${ENV_VAR}` 会自动从根目录 `.env` 中读取。

## API

### `new LLM(options?)`

| Option | 说明 |
|--------|------|
| `provider` | 可选，不指定用 `default` |
| `model` | 可选，不指定用 provider 的 `defaultModel` |

### `llm.chat(options)`

非流式调用，返回 `ChatResult { content, usage? }`。

### `llm.stream(options)`

流式调用，返回 `AsyncGenerator<StreamChunk>`。chunk 格式统一为 `{ type: "text" | "thinking", text: string }`。

### `loadConfig()`

直接获取解析后的配置对象。适合需要 raw SDK 访问的高级场景（如工具调用）。
