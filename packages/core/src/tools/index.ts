import type { Tool } from '../tool'
import { readFile } from './read-file'
import { editFile } from './edit-file'
import { deleteFile } from './delete-file'
import { runShell } from './run-shell'

/** 所有内置工具 */
export const builtinTools: Tool[] = [
  {
    name: 'read_file',
    description: '读取文件内容',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径' } },
      required: ['path'],
    },
    execute: readFile,
  },
  {
    name: 'edit_file',
    description: '通过查找替换编辑文件内容',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        oldContent: { type: 'string', description: '要替换的原始内容' },
        newContent: { type: 'string', description: '替换后的新内容' },
      },
      required: ['path', 'oldContent', 'newContent'],
    },
    execute: editFile,
  },
  {
    name: 'delete_file',
    description: '删除文件',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径' } },
      required: ['path'],
    },
    execute: deleteFile,
  },
  {
    name: 'run_shell',
    description: '执行终端命令',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: '要执行的命令' } },
      required: ['command'],
    },
    execute: runShell,
  },
]
