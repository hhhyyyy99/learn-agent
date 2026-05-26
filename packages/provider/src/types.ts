/** 支持的 provider 协议类型 */
export type ProviderType = 'openai-compatible' | 'anthropic' | 'openai-chat'

/** provider 下注册的模型 */
export interface ProviderModel {
  id: string
  name?: string
}

/** 单个 provider 的完整配置 */
export interface ProviderConfig {
  type: ProviderType
  apiKey: string
  baseURL: string
  defaultModel: string
  models: ProviderModel[]
}

/** providers.yaml 顶层结构 */
export interface Config {
  default?: string
  providers: Record<string, ProviderConfig>
}

/** 工具参数的 JSON Schema 定义 */
export interface ToolParameters {
  type: 'object'
  properties: Record<string, { type: string; description: string }>
  required?: string[]
}

/** 工具定义（不含执行器） */
export interface ToolDef {
  name: string
  description: string
  parameters: ToolParameters
}

/** 统一的工具调用格式 */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** 统一的消息格式 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** tool 消息的 tool_call_id */
  toolCallId?: string
  /** assistant 消息中可能包含的 tool_calls */
  toolCalls?: ToolCall[]
  /** reasoning_content 回传（DeepSeek thinking 模式要求） */
  reasoningContent?: string
}

/** chat 请求参数 */
export interface ChatRequest {
  messages: Message[]
  tools?: ToolDef[]
  maxTokens?: number
  temperature?: number
  /** 系统提示词，各 provider 自行处理位置 */
  system?: string
}

/** chat 响应 */
export interface ChatResponse {
  /** 纯文本回复（tool_use 时可为空） */
  content: string
  /** 工具调用请求 */
  toolCalls?: ToolCall[]
  /** 停止原因 */
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  /** token 用量统计 */
  usage?: { input: number; output: number }
  /** 思维链内容（DeepSeek thinking 模式返回） */
  reasoningContent?: string
}

/** 流式请求参数 */
export interface StreamRequest extends ChatRequest {
  thinking?: boolean | { budgetTokens?: number }
}

/** 统一的 LLM 调用接口 */
export interface ChatProvider {
  /** provider 名称 */
  readonly name: string

  /** 当前使用的模型 ID */
  readonly model: string

  /** 发送消息并获取完整回复 */
  chat(options: ChatRequest): Promise<ChatResponse>

  /** 流式发送消息 */
  stream(options: StreamRequest): AsyncGenerator<StreamChunk>
}

/** 标准聊天消息（兼容旧版） */
export interface LegacyMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 非流式聊天请求参数（兼容旧版 LLM 类） */
export interface ChatOptions {
  provider?: string
  model?: string
  messages: LegacyMessage[]
  maxTokens?: number
  temperature?: number
}

/** 流式聊天请求参数（兼容旧版 LLM 类） */
export interface StreamOptions extends ChatOptions {
  thinking?: boolean | { budgetTokens?: number }
}

/** 非流式聊天返回 */
export interface ChatResult {
  content: string
  usage?: { input: number; output: number }
}

/** 流式聊天的统一 chunk 格式 */
export type StreamChunk = { type: 'text'; text: string } | { type: 'thinking'; text: string }
