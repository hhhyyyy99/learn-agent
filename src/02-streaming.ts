import "dotenv/config";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// ============================================================
// 本文件演示两种不同的流式调用（Streaming）方式：
//
// 流式（Streaming）的好处：
//   - 用户体验好：用户不用干等，能看到 AI 一个字一个字"打出来"
//   - 首 token 延迟低：第一个 token 到达后立即开始显示
//   - 可以提前终止：用户觉得回答不对可以随时中断
//
// 两种流式实现对比：
//   callOpenAI()    ← OpenAI 兼容格式的流式（DeepSeek/Qwen/OpenAI 等）
//   callAnthropic() ← Anthropic 原生流式（基于 Message API 的事件流）
//
// 运行方式：
//   npm run task:02
// ============================================================

const provider = process.env.LLM_PROVIDER ?? "openai";

// ============================================================
// OpenAI 兼容格式的流式调用
//
// 关键概念：
//   - stream: true 表示启用流式模式
//   - 返回的 stream 对象是一个 AsyncIterable（异步可迭代对象）
//   - 用 for await 逐个读取 ChatCompletionChunk
//   - 每个 chunk 的 choices[0].delta 只包含新增的内容片段
//
// 推理过程（reasoning_content）：
//   - 部分推理模型（DeepSeek-R1、QwQ 等）在给出最终回答前会输出思考过程
//   - 思考过程通过 delta.reasoning_content 字段传递
//   - 这是提供商扩展字段，不在 OpenAI 官方 SDK 类型定义中
//   - 最终回答仍然在 delta.content 中
// ============================================================
async function callOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey) throw new Error("缺少 OPENAI_API_KEY，请在 .env 中设置");
  if (!baseURL) throw new Error("缺少 OPENAI_BASE_URL，请在 .env 中设置");
  if (!model) throw new Error("缺少 OPENAI_MODEL，请在 .env 中设置");

  const client = new OpenAI({ apiKey, baseURL });

  // --- 发起流式请求 ---
  // stream: true 是关键：告诉 API 不要等全部生成完再返回
  // 而是每生成一个 token 就通过 stream 推送出来
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "你是一个编程助手" },
      { role: "user", content: "用一句话解释什么是递归" },
    ],
    stream: true,
  });

  // --- flag 标记 ---
  // 推理模型（如 DeepSeek-R1）的输出分两阶段：
  //   第一阶段：思考过程 → delta.reasoning_content
  //   第二阶段：最终回答 → delta.content
  // 两个 flag 分别标记是否已开始显示"思考"和"回答"
  let reasoningStarted = false;
  let responseStarted = false;

  // --- 逐个读取流式 chunk ---
  // for await 语法：每次循环从 stream 中取出下一个数据块
  // 数据块到达顺序 = AI 生成的 token 顺序
  for await (const chunk of stream) {
    // chunk: ChatCompletionChunk
    //   chunk.choices[0].delta.content           ← 最终回答的文字片段
    //   chunk.choices[0].delta.reasoning_content  ← 思考过程的文字片段（提供商扩展）
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    // 注意：reasoning_content 不是 OpenAI 官方 SDK 定义的字段
    // DeepSeek / Qwen 等提供商在推理模型的响应中额外添加了这个字段
    // 所以需要用 as Record<string, unknown> 绕过 TypeScript 类型检查
    const reasoningContent = (delta as Record<string, unknown>)?.reasoning_content as string | undefined;
    const textContent = delta.content;

    // --- 显示思考过程（如果当前 chunk 有 reasoning_content）---
    if (reasoningContent) {
      if (!reasoningStarted) {
        // 第一次遇到 reasoning_content：打印 "Thinking: " 前缀
        process.stdout.write("Thinking: ");
        reasoningStarted = true;
      }
      // 逐个 reasoning token 追加输出（不换行，模拟打字效果）
      process.stdout.write(reasoningContent);
    }

    // --- 显示最终回答（如果当前 chunk 有 content）---
    if (textContent) {
      if (!responseStarted) {
        // 如果之前显示过 thinking，加个换行分隔两个阶段
        if (reasoningStarted) console.log();
        process.stdout.write("Response: ");
        responseStarted = true;
      }
      process.stdout.write(textContent);
    }
  }

  // 流结束后换行，保证终端提示符在下一行
  console.log();
}

// ============================================================
// Anthropic 原生流式调用
//
// 关键概念：
//   - Anthropic 的流式 API 与 OpenAI 不同，它返回的是"事件流"
//   - 每个事件有 type 字段，不同类型的携带不同的 payload
//   - 需要用 for await 逐个处理事件，而不是直接读取 token
//
// 事件类型（常用）：
//   message_start        → 消息开始，包含整个消息的元数据
//   content_block_start  → 内容块开始（thinking 块或 text 块）
//   content_block_delta  → 内容块增量（thinking 文字或 text 文字）
//   content_block_stop   → 内容块结束
//   message_delta        → 消息级别的增量（如 stop_reason）
//   message_stop         → 消息结束
//
// Thinking（思考过程）：
//   - 需要显式在请求中开启 thinking: { type: "enabled", budget_tokens: ... }
//   - 开启后 Claude 先生成一个 thinking 块（推理过程）
//   - 再生成一个 text 块（最终回答）
//   - thinking 块的内容通过 content_block_delta 事件中的
//     delta.type === "thinking_delta" 传递
//   - text 块的内容通过 content_block_delta 事件中的
//     delta.type === "text_delta" 传递
// ============================================================
async function callAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey) throw new Error("缺少 ANTHROPIC_API_KEY .env 中设置（以 sk-ant- 开头）");
  if (!baseURL) throw new Error("缺少 ANTHROPIC_BASE_URL，请在 .env 中设置");
  if (!model) throw new Error("缺少 ANTHROPIC_MODEL，请在 .env 中设置");
  const client = new Anthropic({
    apiKey,
    baseURL,
  });

  // --- 发起流式请求 ---
  // 与 OpenAI 不同，Anthropic 的 .stream() 返回的是事件流 AsyncIterable
  // 需要开启 thinking: { type: "enabled", budget_tokens: N }
  // 模型才会在回答前输出推理过程
  const stream = await client.messages.stream({
    model,
    max_tokens: 16000,
    messages: [{ role: "user", content: "用一句话解释什么是递归" }],
    thinking: {
      type: "enabled",
      // budget_tokens: 思考过程分配的 token 预算（不是硬上限，模型可能用更少）
      //   - 不是总输出上限（max_tokens 才是总上限）
      //   - 思考部分不产生计费 token，只有最终回答计费
      //   - 取值范围：≥ 200，且 ≤ max_tokens / 2
      //   - 简单问题 2000 足够，复杂推理建议 8000-10000
      budget_tokens: 10000
    },
  });

  // --- flag 标记 ---
  // 用于跟踪当前处理的是 thinking 块还是 text 块
  // 每次新的 content_block_start 都会重置 flag
  let thinkingStarted = false;
  let responseStarted = false;

  // --- 逐事件处理事件流 ---
  // 事件流 vs token 流：
  //   OpenAI 的流式返回的是平铺的 token 序列（直接读 content 就行）
  //   Anthropic 的流式返回的是结构化的事件（需要判断 type 来决定如何处理）
  //
  // 典型的事件时序（开启 thinking 后）：
  //   message_start
  //   → content_block_start (type: thinking)   ← 思考块开始
  //   → content_block_delta (type: thinking_delta)  ← 思考文字
  //   → content_block_delta (type: thinking_delta)  ← 思考文字
  //   → ...（不断重复 thinking_delta 直到思考结束）
  //   → content_block_stop                      ← 思考块结束
  //   → content_block_start (type: text)        ← 回答块开始
  //   → content_block_delta (type: text_delta)  ← 回答文字
  //   → ...（不断重复 text_delta 直到回答结束）
  //   → content_block_stop                      ← 回答块结束
  //   → message_stop
  for await (const event of stream) {
    // content_block_start：一个新的内容块开始
    // event.content_block.type 说明这个块是 thinking 还是 text
    if (event.type === "content_block_start") {
      console.log(`\nStarting ${event.content_block.type} block...`);
      // 每开始一个新块，重置 flag
      thinkingStarted = false;
      responseStarted = false;

    // content_block_delta：内容块的增量数据（核心输出逻辑）
    } else if (event.type === "content_block_delta") {
      if (event.delta.type === "thinking_delta") {
        // delta.type === "thinking_delta" → 这是推理过程的文字片段
        if (!thinkingStarted) {
          process.stdout.write("Thinking: ");
          thinkingStarted = true;
        }
        process.stdout.write(event.delta.thinking);
      } else if (event.delta.type === "text_delta") {
        // delta.type === "text_delta" → 这是最终回答的文字片段
        if (!responseStarted) {
          process.stdout.write("Response: ");
          responseStarted = true;
        }
        process.stdout.write(event.delta.text);
      }

    // content_block_stop：当前内容块结束
    } else if (event.type === "content_block_stop") {
      console.log("\nBlock complete.");
    }
  }
}

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
