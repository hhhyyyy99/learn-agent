import { LLM } from '@learn-agent/provider'

async function main() {
  try {
    const llm = new LLM()
    const result = await llm.chat({
      messages: [
        { role: 'system', content: '你是一个编程助手' },
        { role: 'user', content: '用一句话解释什么是递归' },
      ],
    })

    console.log(`\n模型: ${llm.model}`)
    console.log(`内容: ${result.content}`)

    if (result.usage) {
      console.log(`Token 消耗: 输入 ${result.usage.input} + 输出 ${result.usage.output}`)
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error(`\n错误: ${err.message}`)
      process.exit(1)
    }
  }
}

main()
