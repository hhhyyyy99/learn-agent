import fs from 'node:fs/promises'
import type { AgentEvent, Tool } from '@learn-agent/core'
import { Agent, ToolRegistry } from '@learn-agent/core'
import { createProvider } from '@learn-agent/provider'

const readFile: Tool = {
  name: 'read_file',
  description: '读取文件内容',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: '文件路径' } },
    required: ['path'],
  },
  execute: async args => {
    try {
      const content = await fs.readFile(String(args.path), 'utf-8')
      return { success: true, content }
    } catch (e) {
      return { success: false, content: '', error: e instanceof Error ? e.message : String(e) }
    }
  },
}

const listFiles: Tool = {
  name: 'list_files',
  description: '列出目录下的文件',
  parameters: {
    type: 'object',
    properties: { dir: { type: 'string', description: '目录路径' } },
    required: ['dir'],
  },
  execute: async args => {
    try {
      const entries = await fs.readdir(String(args.dir), { withFileTypes: true })
      const result = entries
        .map(e => `${e.isDirectory() ? '[目录]' : '[文件]'} ${e.name}`)
        .join('\n')
      return { success: true, content: result }
    } catch (e) {
      return { success: false, content: '', error: e instanceof Error ? e.message : String(e) }
    }
  },
}

/** 流式输出 Agent 内部活动 */
function onActivity(event: AgentEvent): void {
  switch (event.type) {
    case 'thinking':
      process.stdout.write(`[思考] ${event.text}\n`)
      break
    case 'tool_call':
      process.stdout.write(`[调用工具] ${event.name}(${JSON.stringify(event.arguments)})\n`)
      break
    case 'tool_result': {
      const preview = event.result.content.slice(0, 200)
      const status = event.result.success ? 'OK' : 'FAIL'
      process.stdout.write(
        `[工具结果] ${status}: ${preview}${event.result.content.length > 200 ? '...' : ''}\n`,
      )
      break
    }
    case 'text_delta':
      process.stdout.write(event.text)
      break
    case 'text':
      process.stdout.write('\n')
      break
  }
}

async function main() {
  const provider = createProvider()
  const registry = new ToolRegistry()
  registry.registerAll([readFile, listFiles])

  const agent = new Agent({
    provider,
    tools: registry,
    systemPrompt: '你是一个编程助手，可以读取文件和列出目录。回答要简洁。',
    stream: true,
    onActivity,
  })

  const answer = await agent.run('列出当前目录的文件，然后读取 package.json 并告诉我项目名称')
  console.log('\n最终回复:', answer)
}

main().catch(err => {
  console.error('错误:', err.message)
  process.exit(1)
})
