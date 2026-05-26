import fs from 'node:fs/promises'
import type { ToolResult } from '../tool'

/**
 * 通过查找替换编辑文件内容
 *
 * @param args.path - 文件路径
 * @param args.oldContent - 要替换的原始内容
 * @param args.newContent - 替换后的新内容
 */
export async function editFile(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const content = await fs.readFile(String(args.path), 'utf-8')
    const oldStr = String(args.oldContent)
    if (!content.includes(oldStr)) {
      return { success: false, content: '', error: `在 ${args.path} 中未找到匹配内容` }
    }
    const newContent = content.replace(oldStr, String(args.newContent))
    await fs.writeFile(String(args.path), newContent, 'utf-8')
    return { success: true, content: `已编辑 ${args.path}` }
  } catch (e: unknown) {
    return { success: false, content: '', error: e instanceof Error ? e.message : String(e) }
  }
}
