import fs from 'node:fs/promises'
import path from 'node:path'

const toolGuides: Record<string, string> = {
  read_file: `
## read_file
读取文件内容。使用前先用 run_shell ls 确认文件存在。
- path 可以是相对路径或绝对路径
- 大文件会返回全部内容，注意控制调用频率`,

  edit_file: `
## edit_file
通过查找替换精确编辑文件。规则：
1. **必须先用 read_file 读取文件**，确认当前内容
2. oldContent 必须**精确匹配**文件中的文字（包括空格和换行）
3. 一次只改一处，如果要改多处，分多次调用
4. 如果 oldContent 找不到，说明文件内容和你想的不一样，重新读取`,

  delete_file: `
## delete_file
删除文件。
- 删除前确认文件确实不需要了
- 已删除的文件无法恢复`,

  run_shell: `
## run_shell
执行 shell 命令。
- 适合：安装依赖、运行测试、查看 git 状态、编译代码
- 有 30 秒超时，长任务会失败
- 先用 pwd/ls 确认目录，再执行危险操作`,
}

async function loadProjectContext(cwd: string): Promise<string> {
  const contextFiles = ['AGENTS.md', 'CLAUDE.md']
  let context = ''
  for (const file of contextFiles) {
    try {
      const content = await fs.readFile(path.join(cwd, file), 'utf-8')
      context += `\n项目配置 (${file})\n${content}\n`
      break
    } catch {}
  }
  return context
}

interface BuildPromptOptions {
  enabledTools: string[]
  cwd: string
  customInstructions?: string
}

async function buildSystemPrompt(options: BuildPromptOptions): Promise<string> {
  const { enabledTools, cwd, customInstructions } = options

  let prompt = `你是一个编程助手。你能帮助用户读取、编辑文件，执行命令。

## 核心原则
- 先理解，再动手：读取文件后再编辑
- 回答简洁，不要废话
- 出错时告诉用户原因，不要瞎猜
- 不确定时先问，不要擅自行动

## 可用工具
`

  for (const toolName of enabledTools) {
    if (toolGuides[toolName]) {
      prompt += `${toolGuides[toolName]}\n`
    }
  }

  const projectContext = await loadProjectContext(cwd)
  if (projectContext) {
    prompt += `\n## 项目上下文\n${projectContext}`
  }

  if (customInstructions) {
    prompt += `\n## 用户指令\n${customInstructions}`
  }

  prompt += `\n\n当前日期: ${new Date().toISOString().split('T')[0]}`
  prompt += `\n工作目录: ${cwd}`

  return prompt
}

async function main() {
  const prompt = await buildSystemPrompt({
    enabledTools: ['read_file', 'edit_file', 'delete_file', 'run_shell'],
    cwd: process.cwd(),
    customInstructions: '回答时使用中文',
  })

  console.log('=== 生成的系统提示词 ===\n')
  console.log(prompt)
}

main()
