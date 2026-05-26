# AGENTS

# AI 回复规范
1. 回复必须是中文
2. 回复开头必须叫”老大”
3. 回复最后必须加一个emoji表情

# Commit 规范
- 不要在 commit message 中添加 `Co-Authored-By: Claude` 之类的签名
- 保持 message 简洁，描述变更的 what 和 why

# 注释规范

## 原则
- 注释用中文
- 所有导出（export）的类、函数、接口、类型别名必须有 JSDoc 注释
- 私有方法/字段根据复杂度决定是否加注释，非显而易见的逻辑必须加

## JSDoc 格式

### 类 & 构造函数
```ts
/**
 * 一句话概述类的职责
 *
 * 补充说明（如有），可以多行。
 *
 * @example
 * ```ts
 * const foo = new Foo();
 * ```
 */
export class Foo {
  /** 字段说明 */
  private bar: string;

  /**
   * @param options.xxx - 参数说明
   * @throws 在什么情况下抛错
   */
  constructor(options?: { xxx?: string }) { ... }
}
```

### 函数 & 方法
```ts
/**
 * 一句话概述函数功能
 *
 * 补充说明（如有）。
 *
 * @param options.xxx - 参数说明
 * @returns 返回值说明
 * @yields 生成器产出值说明（AsyncGenerator 用 @yields）
 * @throws 在什么情况下抛错
 *
 * @example
 * ```ts
 * const result = await foo.bar();
 * ```
 */
```

### 接口 & 类型别名
```ts
/** 一句话说明用途 */
export type ProviderType = “openai-compatible” | “anthropic”;

/** 一句话说明用途 */
export interface ChatResult {
  /** 字段说明 */
  content: string;
  /** 字段说明（可选时可注明什么情况下为 undefined） */
  usage?: { input: number; output: number };
}
```

## 禁用的写法
- 不要写 `// xxx` 单行注释，优先用 JSDoc（私有方法内部非显而易见的逻辑除外）
- 不要在注释中引用当前任务、issue 编号、PR 号（这些属于 commit message / PR description）
- 不要写冗余注释描述”代码做了什么”——方法名和类型已经说了
- 不要写分隔线注释块 `// === xxx ===`，用 JSDoc 替代