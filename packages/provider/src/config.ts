import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { config as dotenvConfig } from "dotenv";
import type { Config, ProviderConfig } from "./types.js";

// ============================================================
// env 加载：从 cwd 往上找 .env
// ============================================================
let envLoaded = false;

function ensureEnv(): void {
  if (envLoaded) return;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      dotenvConfig({ path: envPath });
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  envLoaded = true;
}

// ============================================================
// providers.yaml 查找 & 解析
// ============================================================
function findConfigFile(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, "providers.yaml");
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "找不到 providers.yaml（从当前目录向上搜索了 10 层）。\n" +
      "请在项目根目录创建 providers.yaml，参考 providers.yaml.example。"
  );
}

function resolveEnv(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => {
      const v = process.env[name];
      if (v === undefined) throw new Error(`providers.yaml 引用了未定义的环境变量: ${name}`);
      return v;
    });
  }
  if (Array.isArray(value)) return value.map(resolveEnv);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveEnv(v);
    }
    return result;
  }
  return value;
}

function validateConfig(raw: Config): asserts raw is Config {
  if (!raw.providers || Object.keys(raw.providers).length === 0) {
    throw new Error("providers.yaml 至少需要一个 provider");
  }
  for (const [name, p] of Object.entries(raw.providers)) {
    if (!p.type || !["openai-compatible", "anthropic"].includes(p.type)) {
      throw new Error(`provider "${name}" 的 type 必须是 openai-compatible 或 anthropic`);
    }
    if (!p.defaultModel) throw new Error(`provider "${name}" 缺少 defaultModel`);
    if (!p.models || p.models.length === 0) throw new Error(`provider "${name}" 至少需要一个 model`);
    const foundDefault = p.models.find((m) => m.id === p.defaultModel);
    if (!foundDefault) throw new Error(`provider "${name}" 的 defaultModel "${p.defaultModel}" 不在 models 列表中`);
  }
}

export function resolveProvider(name: string): ProviderConfig {
  const config = loadConfig();
  const pc = config.providers[name];
  if (!pc) throw new Error(`providers.yaml 中未定义 provider: "${name}"`);
  if (!pc.apiKey) throw new Error(`provider "${name}" 缺少 apiKey（环境变量为空或未定义）`);
  if (!pc.baseURL) throw new Error(`provider "${name}" 缺少 baseURL（环境变量为空或未定义）`);
  return pc;
}

let cache: Config | null = null;

export function loadConfig(): Config {
  if (cache) return cache;

  ensureEnv();
  const file = findConfigFile();
  const raw = parseYaml(fs.readFileSync(file, "utf-8"));
  const config = resolveEnv(raw) as Config;

  validateConfig(config);
  cache = config;
  return config;
}

export function clearConfigCache(): void {
  cache = null;
}
