import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig, resolveProvider } from "./config.js";
import type {
  ProviderConfig,
  ChatOptions,
  StreamOptions,
  ChatResult,
  StreamChunk,
  Message,
} from "./types.js";

// ============================================================
// LLM 统一调用入口
// ============================================================
export class LLM {
  private config: ReturnType<typeof loadConfig>;
  private providerName: string;
  private providerConfig: ProviderConfig;
  private modelId: string;
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;

  constructor(options?: { provider?: string; model?: string }) {
    this.config = loadConfig();

    this.providerName = options?.provider ?? this.config.default ?? Object.keys(this.config.providers)[0];
    this.providerConfig = resolveProvider(this.providerName); // 懒校验：只在用到时检查 apiKey/baseURL

    this.modelId = options?.model ?? this.providerConfig.defaultModel;
    const found = this.providerConfig.models.find((m) => m.id === this.modelId);
    if (!found) throw new Error(`provider "${this.providerName}" 下未定义 model: "${this.modelId}"`);

    if (this.providerConfig.type === "openai-compatible") {
      this.openaiClient = new OpenAI({ apiKey: this.providerConfig.apiKey, baseURL: this.providerConfig.baseURL });
    } else {
      this.anthropicClient = new Anthropic({ apiKey: this.providerConfig.apiKey, baseURL: this.providerConfig.baseURL });
    }
  }

  get provider(): string {
    return this.providerName;
  }

  get model(): string {
    return this.modelId;
  }

  // ============================================================
  // 非流式调用
  // ============================================================
  async chat(options: Omit<ChatOptions, "provider" | "model">): Promise<ChatResult> {
    if (this.providerConfig.type === "openai-compatible") {
      return this.chatOpenAI(options);
    }
    return this.chatAnthropic(options);
  }

  // ============================================================
  // 流式调用（统一 chunk 格式）
  // ============================================================
  async *stream(options: Omit<StreamOptions, "provider" | "model">): AsyncGenerator<StreamChunk> {
    if (this.providerConfig.type === "openai-compatible") {
      yield* this.streamOpenAI(options);
    } else {
      yield* this.streamAnthropic(options);
    }
  }

  // ============================================================
  // OpenAI 兼容分支
  // ============================================================
  private async chatOpenAI(options: Omit<ChatOptions, "provider" | "model">): Promise<ChatResult> {
    const client = this.openaiClient!;
    const res = await client.chat.completions.create({
      model: this.modelId,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    });

    return {
      content: res.choices[0].message.content ?? "",
      usage: res.usage ? { input: res.usage.prompt_tokens, output: res.usage.completion_tokens } : undefined,
    };
  }

  private async *streamOpenAI(options: Omit<StreamOptions, "provider" | "model">): AsyncGenerator<StreamChunk> {
    const client = this.openaiClient!;
    const stream = await client.chat.completions.create({
      model: this.modelId,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      const reasoning = (delta as Record<string, unknown>)?.reasoning_content as string | undefined;
      if (reasoning) {
        yield { type: "thinking", text: reasoning };
      }

      if (delta.content) {
        yield { type: "text", text: delta.content };
      }
    }
  }

  // ============================================================
  // Anthropic 分支
  // ============================================================
  private separateSystem(messages: Message[]): { system: string | undefined; rest: Anthropic.MessageParam[] } {
    const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
    const rest = messages.filter((m) => m.role !== "system") as Anthropic.MessageParam[];
    return { system: systemParts.length > 0 ? systemParts.join("\n") : undefined, rest };
  }

  private async chatAnthropic(options: Omit<ChatOptions, "provider" | "model">): Promise<ChatResult> {
    const client = this.anthropicClient!;
    const { system, rest } = this.separateSystem(options.messages);

    const res = await client.messages.create({
      model: this.modelId,
      max_tokens: options.maxTokens ?? 4096,
      system,
      messages: rest,
      temperature: options.temperature,
    });

    const content = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      content,
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
    };
  }

  private async *streamAnthropic(options: Omit<StreamOptions, "provider" | "model">): AsyncGenerator<StreamChunk> {
    const client = this.anthropicClient!;
    const { system, rest } = this.separateSystem(options.messages);

    const thinkingOpt = options.thinking;
    const thinking =
      thinkingOpt === true
        ? ({ type: "enabled" as const, budget_tokens: 4000 })
        : typeof thinkingOpt === "object"
          ? ({ type: "enabled" as const, budget_tokens: thinkingOpt.budgetTokens ?? 4000 })
          : undefined;

    const stream = await client.messages.stream({
      model: this.modelId,
      max_tokens: options.maxTokens ?? 4096,
      system,
      messages: rest,
      temperature: options.temperature,
      thinking,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "thinking_delta") {
          yield { type: "thinking", text: event.delta.thinking };
        } else if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
    }
  }
}
