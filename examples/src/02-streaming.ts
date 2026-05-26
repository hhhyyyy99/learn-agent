import { LLM } from "@learn-agent/provider";

// ============================================================
// 统一流式调用：不管是 OpenAI 兼容还是 Anthropic，chunk 格式一致
// ============================================================
async function main() {
  try {
    const llm = new LLM();

    console.log(`Provider: ${llm.provider} | Model: ${llm.model}\n`);

    // stream() 返回统一的 StreamChunk 格式：
    //   { type: "text", text: string }
    //   { type: "thinking", text: string }
    for await (const chunk of llm.stream({
      messages: [
        { role: "system", content: "你是一个编程助手" },
        { role: "user", content: "用一句话解释什么是递归" },
      ],
      thinking: true, // DeepSeek 自动返回 reasoning_content，Anthropic 开启 thinking block
    })) {
      if (chunk.type === "thinking") {
        process.stdout.write(`[思考] ${chunk.text}`);
      } else {
        process.stdout.write(chunk.text);
      }
    }
    console.log();
  } catch (err) {
    if (err instanceof Error) {
      console.error(`\n错误: ${err.message}`);
      process.exit(1);
    }
  }
}

main();
