import fs from "fs/promises";
import path from "path";

const toolGuides: Record<string, string> = {
  read_file: `
## read_file
读取文件内容。使用前先用 list_files 确认文件存在。
- path 可以是相对路径或绝对路径
- 大文件会返回全部内容，注意控制调用频率`,

  list_files: `
## list_files
列出目录下的文件和子目录。
- 返回 [目录] 或 [文件] 前缀
- 不支持递归，需要手动进入子目录`,

  edit_file: `
## edit_file
精确编辑文件。规则：
1. **必须先用 read_file 读取文件**，确认当前内容
2. oldfileContent 必须**精确匹配**文件中的文字（包括空格和换行）
3. 一次只改一处，如果要改多处，分多次调用
4. 如果 oldfileContent 找不到，说明文件内容和你想的不一样，重新读取`,

  run_shell: `
## run_shell
执行 shell 命令。
- 适合：安装依赖、运行测试、查看 git 状态、编译代码
- 有 10 秒超时，长任务会失败
- 先用 ls/pwd 确认目录，再执行危险操作`,
};

// 项目级配置：类似 CLAUDE.md, AGENTS.md，目前直接去找
async function loadProjectContext(cwd: string): Promise<string> {
  const contextFiles = ["AGENTS.md",'CLAUDE.md'];
  let context = "";
  for (const file of contextFiles) {
    try {
      const content = await fs.readFile(path.join(cwd, file), "utf-8");
      context += `\n项目配置 (${file})\n${content}\n`;
      break; // 只读第一个找到的
    } catch {}// 文件不存在，跳过
  }
  return context;
}
// 构建系统提示词
interface BuildPromptOptions {
  enabledTools: string[]; // 当前启用的工具列表
  cwd: string; // 当前工作目录
  customInstructions?: string;// 用户自定义指令
}

// 注意：buildSystemPrompt 只生成提示词文本。工具的实际定义（JSON Schema）需要单独传给 LLM 的 tools 参数。两者配合使用。
async function buildSystemPrompt(options: BuildPromptOptions): Promise<string> {
  const { enabledTools, cwd, customInstructions } = options;

  // 基础人格
  let prompt = `你是一个编程助手。你能帮助用户读取、编辑文件，执行命令。

## 核心原则
- 先理解，再动手：读取文件后再编辑
- 回答简洁，不要废话
- 出错时告诉用户原因，不要瞎猜
- 不确定时先问，不要擅自行动

## 可用工具
`;

  // 根据启用的工具，添加使用指南
  for (const toolName of enabledTools) {
    if (toolGuides[toolName]) {
      prompt += toolGuides[toolName] + "\n";
    }
  }

  // 加载项目级配置
  const projectContext = await loadProjectContext(cwd);
  if (projectContext) {
    prompt += `\n## 项目上下文\n${projectContext}`;
  }

  // 用户自定义指令
  if (customInstructions) {
    prompt += `\n## 用户指令\n${customInstructions}`;
  }

  // 加上当前日期和目录
  prompt += `\n\n当前日期: ${new Date().toISOString().split("T")[0]}`;
  prompt += `\n工作目录: ${cwd}`;

  return prompt;
}


async function main() {
  const prompt = await buildSystemPrompt({
    enabledTools: ["read_file", "list_files", "edit_file", "run_bash"],
    cwd: process.cwd(),
    customInstructions: "回答时使用中文",
  });

  console.log("=== 生成的系统提示词 ===\n");
  console.log(prompt);
}

main();