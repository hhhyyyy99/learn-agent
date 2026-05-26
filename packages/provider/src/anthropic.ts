import Anthropic from '@anthropic-ai/sdk'
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
 * Anthropic 协议的 ChatProvider 实现
 *
 * 内部处理 ToolDef → input_schema 转换，
 * system prompt 从 messages 中分离为顶层参数，
 * tool_use / tool_result 格式双向转换。
 */
export class AnthropicProvider implements ChatProvider {
  readonly name: string
  readonly model: string

  private client: Anthropic

  constructor(config: ProviderConfig, model: string) {
    this.name = config.type
    this.model = model
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
  }

  /** 将统一 ToolDef 转为 Anthropic Tool 格式 */
  private toAnthropicTools(tools: ToolDef[]): Anthropic.Tool[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }))
  }

  /** 将统一 Message[] 转为 Anthropic 消息格式 */
  private toAnthropicMessages(
    messages: Message[],
  ): { system?: string; messages: Anthropic.MessageParam[] } {
    const systemParts: string[] = []
    const rest: Anthropic.MessageParam[] = []

    for (const m of messages) {
      if (m.role === 'system') {
        systemParts.push(m.content)
      } else if (m.role === 'tool') {
        rest.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId ?? '',
              content: m.content,
            },
          ],
        })
      } else if (m.role === 'assistant' && m.toolCalls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blocks: any[] = []
        if (m.content) {
          blocks.push({ type: 'text', text: m.content })
        }
        for (const tc of m.toolCalls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          })
        }
        rest.push({
          role: 'assistant',
          content: blocks,
        })
      } else {
        rest.push({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })
      }
    }

    return {
      system: systemParts.length > 0 ? systemParts.join('\n') : undefined,
      messages: rest,
    }
  }

  /** 将 Anthropic 响应转为统一 ChatResponse */
  private toChatResponse(
    res: Anthropic.Message,
  ): ChatResponse {
    const toolCalls: ToolCall[] = []
    let textContent = ''

    for (const block of res.content) {
      if (block.type === 'text') {
        textContent += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        })
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason:
        res.stop_reason === 'tool_use'
          ? 'tool_use'
          : res.stop_reason === 'max_tokens'
            ? 'max_tokens'
            : 'end_turn',
      usage: {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
      },
    }
  }

  async chat(options: ChatRequest): Promise<ChatResponse> {
    const { system, messages } = this.toAnthropicMessages(options.messages)

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.system ?? system,
      messages,
      tools: options.tools ? this.toAnthropicTools(options.tools) : undefined,
      temperature: options.temperature,
    })

    return this.toChatResponse(res)
  }

  async *stream(options: StreamRequest): AsyncGenerator<StreamChunk> {
    const { system, messages } = this.toAnthropicMessages(options.messages)

    const thinkingOpt = options.thinking
    const thinking =
      thinkingOpt === true
        ? { type: 'enabled' as const, budget_tokens: 4000 }
        : typeof thinkingOpt === 'object'
          ? { type: 'enabled' as const, budget_tokens: thinkingOpt.budgetTokens ?? 4000 }
          : undefined

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: options.system ?? system,
      messages,
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
