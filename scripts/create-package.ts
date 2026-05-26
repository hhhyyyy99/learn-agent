import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_DIR = path.join(ROOT, "packages", "_template");
const PACKAGES_DIR = path.join(ROOT, "packages");

const PLACEHOLDER = "__PACKAGE_NAME__";
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function replaceInFile(filePath: string, from: string, to: string): Promise<void> {
  const content = await fs.readFile(filePath, "utf-8");
  if (!content.includes(from)) return;
  await fs.writeFile(filePath, content.replaceAll(from, to), "utf-8");
}

async function main() {
  const name = process.argv[2];
  if (!name) fail("用法: pnpm create-package <name>  (例: pnpm create-package agent)");
  if (name.startsWith("_")) fail(`包名不能以下划线开头：${name}`);
  if (!NAME_PATTERN.test(name)) fail(`包名只能小写字母/数字/连字符，且以字母开头：${name}`);

  const destDir = path.join(PACKAGES_DIR, name);
  if (await exists(destDir)) fail(`packages/${name} 已存在`);
  if (!(await exists(TEMPLATE_DIR))) fail(`找不到模板目录: ${TEMPLATE_DIR}`);

  await copyDir(TEMPLATE_DIR, destDir);
  await replaceInFile(path.join(destDir, "package.json"), PLACEHOLDER, name);
  await replaceInFile(path.join(destDir, "README.md"), PLACEHOLDER, name);

  console.log(`✓ 已创建 packages/${name}/`);
  console.log(`  下一步: pnpm install`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
