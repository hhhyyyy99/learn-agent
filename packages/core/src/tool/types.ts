import type { ToolDef } from '../types'

/** 工具执行结果 */
export interface ToolResult {
  /** 是否执行成功 */
  success: boolean
  /** 执行输出（成功时为结果，失败时可为空） */
  content: string
  /** 失败时的错误描述 */
  error?: string
}

/** 工具执行器，返回结构化结果 */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult

/** 完整的工具定义（定义 + 执行器） */
export interface Tool extends ToolDef {
  /** 执行器 */
  execute: ToolExecutor
}

/** 创建自定义工具的选项 */
export interface CreateToolOptions extends ToolDef {
  execute: ToolExecutor
}
