import fs from 'node:fs/promises'
import type { ToolResult } from '../tool'

/**
 * 删除文件
 *
 * @param args.path - 文件路径
 */
export async function deleteFile(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    await fs.unlink(String(args.path))
    return { success: true, content: `已删除 ${args.path}` }
  } catch (e: unknown) {
    return { success: false, content: '', error: e instanceof Error ? e.message : String(e) }
  }
}
