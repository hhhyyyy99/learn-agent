import "dotenv/config";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// LLM_PROVIDER=openai（默认，兼容 DeepSeek/通义千问/Moonshot/OpenAI 等）
// LLM_PROVIDER=anthropic（使用 Anthropic Claude）
const provider = process.env.LLM_PROVIDER ?? "openai";

// ============================================================
// OpenAI 兼容格式（DeepSeek / 通义千问 / Moonshot / OpenAI 等）
// ============================================================
async function callOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey) throw new Error("缺少 OPENAI_API_KEY，请在 .env 中设置");
  if (!baseURL) throw new Error("缺少 OPENAI_BASE_URL，请在 .env 中设置");
  if (!model) throw new Error("缺少 OPENAI_MODEL，请在 .env 中设置");

  const client = new OpenAI({ apiKey, baseURL });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "你是一个编程助手" },
      { role: "user", content: "用一句话解释什么是递归" },
    ],
  });

  console.log(response);
  console.log(response.choices[0].message.content);
}
// ============================================================
// Anthropic（Claude）— 流式 + 思考过程展示
// ============================================================
async function callAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey) throw new Error("缺少 Anthropic_API_API_KEY .env 中设置（以 sk-ant- 开头）");
  if (!baseURL) throw new Error("缺少 ANTHROPIC__BASE_URL，请在 .env 中设置");
  if (!model) throw new Error("缺少 ANTHROPIC__MODEL，请在 .env 中设置");

  const client = new Anthropic({ apiKey, baseURL });
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    messages: [{ role: "user", content: "用一句话解释什么是递归" }],
    thinking: { type: "enabled", budget_tokens: 10000 },
  });

  console.log(response.content);
}

// ============================================================
// 入口：根据 provider 分发
// ============================================================
async function main() {
  try {
    if (provider === "anthropic") {
      console.log("使用 Anthropic (provider=anthropic)");
      await callAnthropic();
    } else {
      console.log("使用 OpenAI 兼容格式 (provider=openai)");
      await callOpenAI();
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error(`\n错误: ${err.message}`);
      process.exit(1);
    }
  }
}

main();
