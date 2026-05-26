import type { ToolDef } from '../types'
import type { Tool, ToolResult } from './types'

/**
 * 工具注册中心
 *
 * 管理工具的注册、查找和执行，提供统一的错误兜底。
 * ToolRegistry 保证 execute 永远不抛错，失败时返回 success=false 的 ToolResult。
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>()

  /** 注册工具，同名则覆盖 */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  /** 批量注册 */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /** 移除工具，返回是否成功 */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /** 检查工具是否存在 */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** 按名称获取工具 */
  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /** 获取所有工具定义（传给 provider.chat） */
  list(): ToolDef[] {
    return Array.from(this.tools.values()).map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }))
  }

  /**
   * 查找并执行工具
   *
   * 未找到或执行异常时返回 success=false 的 ToolResult，决不抛错。
   */
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { success: false, content: '', error: `未知工具: ${name}` }
    }
    try {
      const result = await tool.execute(args)
      return result
    } catch (e: unknown) {
      return {
        success: false,
        content: '',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }
}
