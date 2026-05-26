import fs from 'node:fs/promises'
import Anthropic from '@anthropic-ai/sdk'
import { loadConfig, resolveProvider } from '@learn-agent/provider'
import OpenAI from 'openai'

const config = loadConfig()
const providerName = config.default ?? Object.keys(config.providers)[0]
const providerConfig = resolveProvider(providerName)

// ============================================================
// 内部格式：与 provider 无关的工具定义
// ============================================================
const tools = [
  {
    name: 'read_file',
    description: '读取文件内容',
    parameters: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: '文件路径' } },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: '列出目录下的文件',
    parameters: {
      type: 'object' as const,
      properties: { dir: { type: 'string', description: '目录路径' } },
      required: ['dir'],
    },
  },
]

function toOpenAI(tool: (typeof tools)[number]) {
  return {
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }
}

function toAnthropic(tool: (typeof tools)[number]) {
  return { name: tool.name, description: tool.description, input_schema: tool.parameters }
}

async function executeTool(name: string, args: any) {
  try {
    if (name === 'read_file') return await fs.readFile(args.path, 'utf-8')
    if (name === 'list_files') {
      const entries = await fs.readdir(args.dir, { withFileTypes: true })
      return entries.map(e => `${e.isDirectory() ? '[目录]' : '[文件]'} ${e.name}`).join('\n')
    }
    return `未知工具: ${name}`
  } catch (e: any) {
    return `错误: ${e.message}`
  }
}

// ============================================================
// Agent 循环：一套逻辑，根据 provider type 分发
// ============================================================
async function agent(userMessage: string) {
  if (providerConfig.type === 'anthropic') {
    const client = new Anthropic({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseURL })
    const messages: any[] = [{ role: 'user', content: userMessage }]

    while (true) {
      const res = await client.messages.create({
        model: providerConfig.defaultModel,
        max_tokens: 4096,
        system: '你是一个编程助手。可以读取文件和列出目录。回答要简洁。',
        messages,
        tools: tools.map(toAnthropic),
      })

      if (res.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: res.content })
        for (const block of res.content) {
          if (block.type === 'tool_use') {
            console.log(`  [工具] ${block.name}(${JSON.stringify(block.input)})`)
            messages.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: await executeTool(block.name, block.input as any),
                },
              ],
            })
          }
        }
        continue
      }
      return res.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
    }
  } else {
    const client = new OpenAI({ apiKey: providerConfig.apiKey, baseURL: providerConfig.baseURL })
    const messages: any[] = [
      { role: 'system', content: '你是一个编程助手。可以读取文件和列出目录。回答要简洁。' },
      { role: 'user', content: userMessage },
    ]

    while (true) {
      const res = await client.chat.completions.create({
        model: providerConfig.defaultModel,
        messages,
        tools: tools.map(toOpenAI),
      })
      const choice = res.choices[0]

      if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
        messages.push(choice.message)
        for (const tc of choice.message.tool_calls) {
          const args = JSON.parse(tc.function.arguments)
          console.log(`  [工具] ${tc.function.name}(${JSON.stringify(args)})`)
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: await executeTool(tc.function.name, args),
          })
        }
        continue
      }
      return choice.message.content || ''
    }
  }
}

const answer = await agent('列出当前目录的文件，然后读取 package.json 并告诉我项目名称')
console.log('\nAI:', answer)
