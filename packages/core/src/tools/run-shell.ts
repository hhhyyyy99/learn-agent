import { execSync } from 'node:child_process'
import type { ToolResult } from '../tool'

/**
 * 执行终端命令
 *
 * @param args.command - 要执行的命令
 */
export function runShell(args: Record<string, unknown>): ToolResult {
  try {
    const output = execSync(String(args.command), { encoding: 'utf-8', timeout: 30000 })
    return { success: true, content: `退出码: 0\n${output}` }
  } catch (e: unknown) {
    const err = e as { status?: number; stderr?: string; message?: string }
    return {
      success: false,
      content: '',
      error: `退出码: ${err.status ?? -1}\n${err.stderr || err.message || String(e)}`,
    }
  }
}
