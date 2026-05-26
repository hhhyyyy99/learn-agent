import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { loadConfig, resolveProvider } from './config'
import type {
  ChatOptions,
  ChatResult,
  Message,
  ProviderConfig,
  ProviderType,
  StreamChunk,
  StreamOptions,
} from './types'

/**
 * 判断 provider 是否走 OpenAI 兼容协议（包括 openai-compatible 和 openai-chat）
 *
 * @param type - provider 协议类型
 * @returns 是否使用 OpenAI SDK 调用
 */
function isOpenAICompatible(type: ProviderType): boolean {
  return type === 'openai-compatible' || type === 'openai-chat'
}

/**
 * LLM 统一调用入口
 *
 * 根据 provider 类型自动分发到 OpenAI 兼容或 Anthropic 协议，
 * 对外暴露统一的 {@link chat} / {@link stream} 接口。
 *
 * @example
 * ```ts
 * const llm = new LLM();
 * const result = await llm.chat({ messages: [...] });
 * ```
 */
export class LLM {
  /** 全局配置缓存 */
  private config: ReturnType<typeof loadConfig>

  /** 当前使用的 provider 名称 */
  private providerName: string

  /** 当前 provider 的完整配置 */
  private providerConfig: ProviderConfig

  /** 当前使用的模型 ID */
  private modelId: string

  /** OpenAI 兼容 SDK 实例（惰性初始化） */
  private openaiClient?: OpenAI

  /** Anthropic SDK 实例（惰性初始化） */
  private anthropicClient?: Anthropic

  /**
   * @param options.provider - 指定 provider 名称，不传则取配置文件中的 default
   * @param options.model   - 指定模型 ID，不传则取该 provider 的 defaultModel
   * @throws 当 provider 或 model 在配置中不存在时抛出错误
   */
  constructor(options?: { provider?: string; model?: string }) {
    this.config = loadConfig()

    this.providerName =
      options?.provider ?? this.config.default ?? Object.keys(this.config.providers)[0]
    this.providerConfig = resolveProvider(this.providerName)

    this.modelId = options?.model ?? this.providerConfig.defaultModel
    const found = this.providerConfig.models.find(m => m.id === this.modelId)
    if (!found) throw new Error(`provider "${this.providerName}" 下未定义 model: "${this.modelId}"`)

    if (isOpenAICompatible(this.providerConfig.type)) {
      this.openaiClient = new OpenAI({
        apiKey: this.providerConfig.apiKey,
        baseURL: this.providerConfig.baseURL,
      })
    } else {
      this.anthropicClient = new Anthropic({
        apiKey: this.providerConfig.apiKey,
        baseURL: this.providerConfig.baseURL,
      })
    }
  }

  /** 当前 provider 名称 */
  get provider(): string {
    return this.providerName
  }

  /** 当前模型 ID */
  get model(): string {
    return this.modelId
  }

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * 发送消息，返回完整回复
   *
   * @param options.messages  - 消息数组
   * @param options.maxTokens - 最大 token 数
   * @param options.temperature - 温度参数
   * @returns 包含回复内容和 token 用量统计的 {@link ChatResult}
   */
  async chat(options: Omit<ChatOptions, 'provider' | 'model'>): Promise<ChatResult> {
    if (isOpenAICompatible(this.providerConfig.type)) {
      return this.chatOpenAI(options)
    }
    return this.chatAnthropic(options)
  }

  /**
   * 流式发送消息，逐步产出统一格式的 {@link StreamChunk}
   *
   * 连续相同类型的 chunk 会被合并后再 yield，避免单个 token 粒度的碎片输出。
   *
   * @param options.messages   - 消息数组
   * @param options.maxTokens  - 最大 token 数
   * @param options.temperature - 温度参数
   * @param options.thinking   - 是否开启思维链（Anthropic 用 thinking block，DeepSeek 自动返回 reasoning_content）
   * @yields {@link StreamChunk} — `{ type: "thinking", text }` 或 `{ type: "text", text }`
   *
   * @example
   * ```ts
   * for await (const chunk of llm.stream({ messages, thinking: true })) {
   *   if (chunk.type === "thinking") {
   *     process.stdout.write(`[思考] ${chunk.text}`);
   *   } else {
   *     process.stdout.write(chunk.text);
   *   }
   * }
   * ```
   */
  async *stream(options: Omit<StreamOptions, 'provider' | 'model'>): AsyncGenerator<StreamChunk> {
    if (isOpenAICompatible(this.providerConfig.type)) {
      yield* this.streamOpenAI(options)
    } else {
      yield* this.streamAnthropic(options)
    }
  }

  // ============================================================
  // OpenAI 兼容分支（openai-compatible / openai-chat）
  // ============================================================

  /** 非流式：调用 OpenAI 兼容 API */
  private async chatOpenAI(options: Omit<ChatOptions, 'provider' | 'model'>): Promise<ChatResult> {
    const client = this.openaiClient!
    const res = await client.chat.completions.create({
      model: this.modelId,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    })

    return {
      content: res.choices[0].message.content ?? '',
      usage: res.usage
        ? {
            input: res.usage.prompt_tokens,
            output: res.usage.completion_tokens,
          }
        : undefined,
    }
  }

  /**
   * 流式：调用 OpenAI 兼容 API 的流式接口
   */
  private async *streamOpenAI(
    options: Omit<StreamOptions, 'provider' | 'model'>,
  ): AsyncGenerator<StreamChunk> {
    const client = this.openaiClient!
    const stream = await client.chat.completions.create({
      model: this.modelId,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      const reasoning = (delta as Record<string, unknown>)?.reasoning_content as string | undefined
      if (reasoning) {
        yield { type: 'thinking', text: reasoning }
      }

      if (delta.content) {
        yield { type: 'text', text: delta.content }
      }
    }
  }

  // ============================================================
  // Anthropic 分支
  // ============================================================

  /**
   * 提取 system 消息并从剩余消息中分离
   *
   * Anthropic API 的 system 是顶层参数而非消息列表中的一条，
   * 所以需要从 messages 中抽出来单独传递。
   */
  private separateSystem(messages: Message[]): {
    system: string | undefined
    rest: Anthropic.MessageParam[]
  } {
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content)
    const rest = messages.filter(m => m.role !== 'system') as Anthropic.MessageParam[]
    return {
      system: systemParts.length > 0 ? systemParts.join('\n') : undefined,
      rest,
    }
  }

  /** 非流式：调用 Anthropic Messages API */
  private async chatAnthropic(
    options: Omit<ChatOptions, 'provider' | 'model'>,
  ): Promise<ChatResult> {
    const client = this.anthropicClient!
    const { system, rest } = this.separateSystem(options.messages)

    const res = await client.messages.create({
      model: this.modelId,
      max_tokens: options.maxTokens ?? 4096,
      system,
      messages: rest,
      temperature: options.temperature,
    })

    const content = res.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    return {
      content,
      usage: {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
      },
    }
  }

  /**
   * 流式：调用 Anthropic Messages Streaming API
   */
  private async *streamAnthropic(
    options: Omit<StreamOptions, 'provider' | 'model'>,
  ): AsyncGenerator<StreamChunk> {
    const client = this.anthropicClient!
    const { system, rest } = this.separateSystem(options.messages)

    const thinkingOpt = options.thinking
    const thinking =
      thinkingOpt === true
        ? { type: 'enabled' as const, budget_tokens: 4000 }
        : typeof thinkingOpt === 'object'
          ? {
              type: 'enabled' as const,
              budget_tokens: thinkingOpt.budgetTokens ?? 4000,
            }
          : undefined

    const stream = client.messages.stream({
      model: this.modelId,
      max_tokens: options.maxTokens ?? 4096,
      system,
      messages: rest,
      temperature: options.temperature,
      thinking,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') {
          yield { type: 'thinking', text: event.delta.thinking }
        } else if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text }
        }
      }
    }
  }
}
