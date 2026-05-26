import fs from 'node:fs/promises'
import type { ToolResult } from '../tool'

/**
 * 读取文件内容
 *
 * @param args.path - 文件路径
 */
export async function readFile(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const content = await fs.readFile(String(args.path), 'utf-8')
    return { success: true, content }
  } catch (e: unknown) {
    return { success: false, content: '', error: e instanceof Error ? e.message : String(e) }
  }
}
