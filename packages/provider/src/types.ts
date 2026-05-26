export interface ProviderModel {
  id: string;
  name?: string;
}

export interface ProviderConfig {
  type: "openai-compatible" | "anthropic";
  apiKey: string;
  baseURL: string;
  defaultModel: string;
  models: ProviderModel[];
}

export interface Config {
  default?: string;
  providers: Record<string, ProviderConfig>;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  provider?: string;
  model?: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

export interface StreamOptions extends ChatOptions {
  thinking?: boolean | { budgetTokens?: number };
}

export interface ChatResult {
  content: string;
  usage?: { input: number; output: number };
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string };
