import { createProvider } from './factory'
import type { ChatProvider } from './types'
import type { ChatOptions, ChatResult, LegacyMessage, StreamChunk, StreamOptions } from './types'

/**
 * LLM 统一调用入口（兼容层）
 *
 * 内部委托给 ChatProvider，保持原有公开 API 不变。
 * 用于简单聊天场景，不需要工具调用时可直接使用。
 *
 * 需要使用工具调用时，推荐通过 createProvider() + Agent 组合使用。
 *
 * @example
 * ```ts
 * const llm = new LLM()
 * const result = await llm.chat({ messages: [...] })
 * ```
 */
export class LLM {
  private provider: ChatProvider

  /**
   * @param options.provider - 指定 provider 名称，不传则取配置文件中的 default
   * @param options.model   - 指定模型 ID，不传则取该 provider 的 defaultModel
   */
  constructor(options?: { provider?: string; model?: string }) {
    this.provider = createProvider(options?.provider, options?.model)
  }

  /** 当前 provider 名称 */
  get providerName(): string {
    return this.provider.name
  }

  /** 当前模型 ID */
  get model(): string {
    return this.provider.model
  }

  /**
   * 发送消息，返回完整回复
   *
   * @param options.messages  - 消息数组
   * @param options.maxTokens - 最大 token 数
   * @param options.temperature - 温度参数
   * @returns 包含回复内容和 token 用量统计
   */
  async chat(options: Omit<ChatOptions, 'provider' | 'model'>): Promise<ChatResult> {
    const res = await this.provider.chat({
      messages: options.messages as unknown as Parameters<ChatProvider['chat']>[0]['messages'],
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    })
    return { content: res.content, usage: res.usage }
  }

  /**
   * 流式发送消息
   *
   * @param options.messages   - 消息数组
   * @param options.maxTokens  - 最大 token 数
   * @param options.temperature - 温度参数
   * @param options.thinking   - 是否开启思维链
   * @yields 统一的 StreamChunk
   */
  async *stream(
    options: Omit<StreamOptions, 'provider' | 'model'>,
  ): AsyncGenerator<StreamChunk> {
    yield* this.provider.stream({
      messages: options.messages as unknown as Parameters<ChatProvider['stream']>[0]['messages'],
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      thinking: options.thinking,
    })
  }
}
