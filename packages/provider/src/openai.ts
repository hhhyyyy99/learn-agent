import OpenAI from 'openai'
import type { ProviderConfig } from './types'
import type {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  Message,
  StreamChunk,
  StreamRequest,
  ToolCall,
  ToolDef,
} from './types'

/**
 * OpenAI 兼容协议的 ChatProvider 实现
 *
 * 支持 openai-compatible / openai-chat / DeepSeek 等厂商。
 * 内部处理 ToolDef → function schema 转换和 reasoning_content 回传。
 */
export class OpenAICompatibleProvider implements ChatProvider {
  readonly name: string
  readonly model: string

  private client: OpenAI

  constructor(config: ProviderConfig, model: string) {
    this.name = config.type
    this.model = model
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
  }

  /** 将统一 ToolDef 转为 OpenAI function 格式 */
  private toOpenAITools(tools: ToolDef[]) {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as unknown as Record<string, unknown>,
      },
    }))
  }

  /** 将统一 Message[] 转为 OpenAI 消息格式，包含 reasoning_content 回传 */
  private toOpenAIMessages(messages: Message[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map(m => {
      const msg: Record<string, unknown> = {
        role: m.role,
        content: m.content,
      }
      if (m.reasoningContent) {
        msg.reasoning_content = m.reasoningContent
      }
      if (m.toolCalls) {
        msg.tool_calls = m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }))
      }
      if (m.toolCallId) {
        msg.tool_call_id = m.toolCallId
      }
      return msg as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam
    })
  }

  /** 将 OpenAI 响应转为统一 ChatResponse */
  private toChatResponse(
    res: OpenAI.Chat.Completions.ChatCompletion,
  ): ChatResponse {
    const choice = res.choices[0]
    const msg = choice.message as unknown as Record<string, unknown>

    const toolCalls: ToolCall[] | undefined =
      choice.finish_reason === 'tool_calls' && msg.tool_calls
        ? (msg.tool_calls as Array<{
            id: string
            function: { name: string; arguments: string }
          }>).map(tc => ({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          }))
        : undefined

    return {
      content: choice.message.content ?? '',
      toolCalls,
      stopReason:
        choice.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice.finish_reason === 'length'
            ? 'max_tokens'
            : 'end_turn',
      usage: res.usage
        ? { input: res.usage.prompt_tokens, output: res.usage.completion_tokens }
        : undefined,
      reasoningContent: msg.reasoning_content as string | undefined,
    }
  }

  async chat(options: ChatRequest): Promise<ChatResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toOpenAIMessages(options.messages),
      tools: options.tools ? this.toOpenAITools(options.tools) : undefined,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    })
    return this.toChatResponse(res)
  }

  async *stream(options: StreamRequest): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toOpenAIMessages(options.messages),
      tools: options.tools ? this.toOpenAITools(options.tools) : undefined,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      const reasoning = (delta as Record<string, unknown>)?.reasoning_content as
        | string
        | undefined
      if (reasoning) {
        yield { type: 'thinking', text: reasoning }
      }

      if (delta.content) {
        yield { type: 'text', text: delta.content }
      }
    }
  }
}
