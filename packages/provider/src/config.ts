import fs from 'node:fs'
import path from 'node:path'
import { config as dotenvConfig } from 'dotenv'
import { parse as parseYaml } from 'yaml'
import type { Config, ProviderConfig, ProviderType } from './types'

// ============================================================
// env 加载：从 cwd 往上找 .env
// ============================================================
let envLoaded = false

function ensureEnv(): void {
  if (envLoaded) return
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    const envPath = path.join(dir, '.env')
    if (fs.existsSync(envPath)) {
      dotenvConfig({ path: envPath })
      break
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  envLoaded = true
}

// ============================================================
// providers.yaml 查找 & 解析
// ============================================================
function findConfigFile(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, 'providers.yaml')
    if (fs.existsSync(p)) return p
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    '找不到 providers.yaml（从当前目录向上搜索了 10 层）。\n' +
      '请在项目根目录创建 providers.yaml，参考 providers.yaml.example。',
  )
}

function resolveEnv(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => {
      const v = process.env[name]
      if (v === undefined) throw new Error(`providers.yaml 引用了未定义的环境变量: ${name}`)
      return v
    })
  }
  if (Array.isArray(value)) return value.map(resolveEnv)
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveEnv(v)
    }
    return result
  }
  return value
}

/** 合法的 provider type 列表，校验和错误提示统一引用此处 */
const VALID_PROVIDER_TYPES: ProviderType[] = ['openai-compatible', 'anthropic', 'openai-chat']

/** AST 类型守卫：校验并断言 raw 为合法 Config */
function validateConfig(raw: Config): asserts raw is Config {
  if (!raw.providers || Object.keys(raw.providers).length === 0) {
    throw new Error('providers.yaml 至少需要一个 provider')
  }
  for (const [name, p] of Object.entries(raw.providers)) {
    if (!p.type || !VALID_PROVIDER_TYPES.includes(p.type as ProviderType)) {
      throw new Error(`provider "${name}" 的 type 必须是 ${VALID_PROVIDER_TYPES.join(' / ')}`)
    }
    if (!p.defaultModel) throw new Error(`provider "${name}" 缺少 defaultModel`)
    if (!p.models || p.models.length === 0) throw new Error(`provider "${name}" 至少需要一个 model`)
    const foundDefault = p.models.find(m => m.id === p.defaultModel)
    if (!foundDefault)
      throw new Error(`provider "${name}" 的 defaultModel "${p.defaultModel}" 不在 models 列表中`)
  }
}

/** 根据 name 获取 provider 配置，并校验 apiKey/baseURL 非空 */
export function resolveProvider(name: string): ProviderConfig {
  const config = loadConfig()
  const pc = config.providers[name]
  if (!pc) throw new Error(`providers.yaml 中未定义 provider: "${name}"`)
  if (!pc.apiKey) throw new Error(`provider "${name}" 缺少 apiKey（环境变量为空或未定义）`)
  if (!pc.baseURL) throw new Error(`provider "${name}" 缺少 baseURL（环境变量为空或未定义）`)
  return pc
}

let cache: Config | null = null

/** 加载 providers.yaml 并返回解析后的 Config（带缓存） */
export function loadConfig(): Config {
  if (cache) return cache

  ensureEnv()
  const file = findConfigFile()
  const raw = parseYaml(fs.readFileSync(file, 'utf-8'))
  const config = resolveEnv(raw) as Config

  validateConfig(config)
  cache = config
  return config
}

/** 清除配置缓存，下次 load 时重新读取文件 */
export function clearConfigCache(): void {
  cache = null
}
