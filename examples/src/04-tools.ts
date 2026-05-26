import { createProvider } from '@learn-agent/provider'
import type { AgentEvent } from '@learn-agent/core'
import { Agent, builtinTools, ToolRegistry } from '@learn-agent/core'

function onActivity(event: AgentEvent): void {
  switch (event.type) {
    case 'thinking':
      process.stdout.write(`\n[思考] ${event.text.slice(0, 200)}...\n`)
      break
    case 'tool_call':
      process.stdout.write(`\n[调用工具] ${event.name}(${JSON.stringify(event.arguments)})\n`)
      break
    case 'tool_result': {
      const preview = event.result.content.slice(0, 300)
      const status = event.result.success ? 'OK' : 'FAIL'
      process.stdout.write(`[工具结果] ${status}: ${preview}${event.result.content.length > 300 ? '...' : ''}\n`)
      break
    }
    case 'text':
      process.stdout.write(`\n[回复] ${event.text}\n`)
      break
  }
}

async function main() {
  const provider = createProvider()
  const registry = new ToolRegistry()
  registry.registerAll(builtinTools)

  const agent = new Agent({
    provider,
    tools: registry,
    systemPrompt:
      '你是一个编程助手。可以读取文件、编辑文件、删除文件、执行 shell 命令。回答要简洁。',
    onActivity,
  })

  const answer = await agent.run(
    '列出当前目录的文件，然后读取 package.json 并告诉我项目名称。',
  )
  console.log('\nAI:', answer)
}

main().catch(err => {
  console.error('错误:', err.message)
  process.exit(1)
})
