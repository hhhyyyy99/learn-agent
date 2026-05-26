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

/** 标准聊天消息 */
export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 非流式聊天请求参数 */
export interface ChatOptions {
  provider?: string
  model?: string
  messages: Message[]
  maxTokens?: number
  temperature?: number
}

/** 流式聊天请求参数 */
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
