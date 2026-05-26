import type { ChatProvider, Message } from '@learn-agent/provider'
import type { ToolRegistry, ToolResult } from './tool'

/** Agent 活动事件 */
export type AgentEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: ToolResult }
  | { type: 'text'; text: string }
  | { type: 'text_delta'; text: string }

/** Agent 配置选项 */
export interface AgentOptions {
  /** ChatProvider 实例 */
  provider: ChatProvider
  /** 工具注册中心 */
  tools: ToolRegistry
  /** 系统提示词 */
  systemPrompt?: string
  /** 最大 token 数 */
  maxTokens?: number
  /** 温度参数 */
  temperature?: number
  /** 最大工具调用轮数，防止死循环，默认 10 */
  maxToolRounds?: number
  /** 活动事件回调，用于流式展示 Agent 内部状态 */
  onActivity?: (event: AgentEvent) => void
  /** 是否流式输出最终回复的 token，默认 false */
  stream?: boolean
}

/**
 * Agent 核心类
 *
 * 管理工具调用循环：发送消息 → 模型请求工具 → 执行工具 → 追加结果 → 继续，
 * 直到模型返回纯文本回复或达到最大轮数。
 *
 * 通过 ChatProvider 接口消费 LLM 能力，不直接依赖任何具体 SDK。
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry()
 * registry.registerAll(builtinTools)
 * const agent = new Agent({ provider, tools: registry, systemPrompt: '你是一个编程助手' })
 * const result = await agent.run('列出当前目录的文件')
 * ```
 */
export class Agent {
  private provider: ChatProvider
  private registry: ToolRegistry
  private systemPrompt?: string
  private maxTokens: number
  private temperature?: number
  private maxToolRounds: number
  private onActivity?: (event: AgentEvent) => void
  private stream: boolean

  constructor(options: AgentOptions) {
    this.provider = options.provider
    this.registry = options.tools
    this.systemPrompt = options.systemPrompt
    this.maxTokens = options.maxTokens ?? 4096
    this.temperature = options.temperature
    this.maxToolRounds = options.maxToolRounds ?? 10
    this.onActivity = options.onActivity
    this.stream = options.stream ?? false
  }

  /**
   * 执行一次完整的 Agent 对话
   *
   * @param userMessage - 用户输入
   * @returns 模型最终文本回复
   * @throws 当达到最大工具轮数仍未结束时抛出
   */
  async run(userMessage: string): Promise<string> {
    const messages: Message[] = []
    const emit = this.onActivity

    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt })
    }
    messages.push({ role: 'user', content: userMessage })

    for (let round = 0; round < this.maxToolRounds; round++) {
      const res = await this.provider.chat({
        messages,
        tools: this.registry.list(),
        maxTokens: this.maxTokens,
        temperature: this.temperature,
        system: this.systemPrompt,
      })

      if (res.stopReason === 'tool_use' && res.toolCalls?.length) {
        // 发射思维链内容
        if (res.reasoningContent && emit) {
          emit({ type: 'thinking', text: res.reasoningContent })
        }

        // 追加 assistant 消息，带 reasoning_content 回传
        messages.push({
          role: 'assistant',
          content: res.content,
          toolCalls: res.toolCalls,
          reasoningContent: res.reasoningContent,
        })

        // 执行每个工具并追加结果
        for (const tc of res.toolCalls) {
          if (emit) {
            emit({ type: 'tool_call', name: tc.name, arguments: tc.arguments })
          }

          const result = await this.registry.execute(tc.name, tc.arguments)

          if (emit) {
            emit({ type: 'tool_result', name: tc.name, result })
          }

          messages.push({
            role: 'tool',
            content: result.success ? result.content : `错误: ${result.error}`,
            toolCallId: tc.id,
          })
        }
        continue
      }

      // 最终回复
      if (this.stream && emit) {
        let fullText = ''
        for await (const chunk of this.provider.stream({
          messages,
          tools: this.registry.list(),
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          system: this.systemPrompt,
        })) {
          if (chunk.type === 'thinking') {
            emit({ type: 'thinking', text: chunk.text })
          } else {
            emit({ type: 'text_delta', text: chunk.text })
            fullText += chunk.text
          }
        }
        emit({ type: 'text', text: fullText })
        return fullText
      }

      if (res.reasoningContent && emit) {
        emit({ type: 'thinking', text: res.reasoningContent })
      }

      if (emit) {
        emit({ type: 'text', text: res.content })
      }
      return res.content
    }

    throw new Error(`Agent 达到最大工具调用轮数 (${this.maxToolRounds})，仍未结束`)
  }
}
