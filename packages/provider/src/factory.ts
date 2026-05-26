import { loadConfig, resolveProvider } from './config'
import { OpenAICompatibleProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import type { ChatProvider } from './types'

/**
 * 创建 ChatProvider 实例
 *
 * 根据配置文件中的 provider type 自动选择对应的实现。
 *
 * @param name - provider 名称，不传则取配置文件 default
 * @param model - 模型 ID，不传则取该 provider 的 defaultModel
 * @returns ChatProvider 实例
 *
 * @example
 * ```ts
 * const provider = createProvider('deepseek')
 * const res = await provider.chat({ messages: [...] })
 * ```
 */
export function createProvider(name?: string, model?: string): ChatProvider {
  const config = loadConfig()
  const providerName = name ?? config.default ?? Object.keys(config.providers)[0]
  const pc = resolveProvider(providerName)
  const modelId = model ?? pc.defaultModel

  if (pc.type === 'anthropic') {
    return new AnthropicProvider(pc, modelId)
  }
  return new OpenAICompatibleProvider(pc, modelId)
}
