import { LLM } from '@learn-agent/provider'

async function main() {
  try {
    const llm = new LLM()

    console.log(`Model: ${llm.model}\n`)

    let lastType: 'thinking' | 'text' | null = null

    for await (const chunk of llm.stream({
      messages: [
        { role: 'system', content: '你是一个编程助手' },
        { role: 'user', content: '用一句话解释什么是递归' },
      ],
      thinking: true,
    })) {
      if (chunk.type !== lastType) {
        if (lastType !== null) {
          process.stdout.write('\n')
        }
        if (chunk.type === 'thinking') {
          process.stdout.write('【思考过程】\n')
        } else {
          process.stdout.write('【回复】\n')
        }
        lastType = chunk.type
      }
      process.stdout.write(chunk.text)
    }

    console.log()
  } catch (err) {
    if (err instanceof Error) {
      console.error(`\n错误: ${err.message}`)
      process.exit(1)
    }
  }
}

main()
