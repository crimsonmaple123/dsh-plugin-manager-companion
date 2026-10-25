#!/usr/bin/env node
/**
 * 跨平台构建入口：不依赖 pnpm/npm 的脚本转发。
 *
 * 为什么不用 `pnpm run build` 里的 `&&` 链：Windows 上 `pnpm` 不一定在 PATH
 * （桌面版 DSH 自带的是 `resources/runtime/primary-runtime/dependencies/pnpm`，
 * 不进 PATH），而 `pnpm run` 内部再调 `pnpm` 也会失败。这里直接用当前 Node
 * 执行 tsc / tsdown，两个平台同一条路径。
 *
 * 用法：
 *   node tools/build.mjs            # host 类型 + client 类型 + client bundle
 *   node tools/build.mjs --host     # 只出 host 产物
 *   node tools/build.mjs --client   # 只出 client 类型与 bundle
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = new Set(process.argv.slice(2))
const onlyHost = args.has('--host')
const onlyClient = args.has('--client')
const runAll = !onlyHost && !onlyClient

/** 在包根下跑一条命令；非零退出立即结束（不吞错）。 */
function run(label, command, commandArgs) {
  process.stdout.write(`\n[build] ${label}\n`)
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' })
  if (result.error !== undefined) {
    process.stderr.write(`[build] ${label} 无法启动：${String(result.error)}\n`)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.stderr.write(`[build] ${label} 失败（exit ${String(result.status)}）\n`)
    process.exit(result.status ?? 1)
  }
}

const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const tsdown = join(root, 'node_modules', 'tsdown', 'dist', 'run.mjs')
for (const [name, path] of [['typescript', tsc], ['tsdown', tsdown]]) {
  if (!existsSync(path)) {
    process.stderr.write(`[build] 缺少 ${name}：先安装开发依赖（见 docs/DEVELOPMENT.md）\n`)
    process.exit(1)
  }
}

if (runAll || onlyHost) run('host types (tsc -p tsconfig.host.json)', process.execPath, [tsc, '-p', 'tsconfig.host.json'])
if (runAll || onlyClient) {
  run('client types (tsc -p tsconfig.client.json)', process.execPath, [tsc, '-p', 'tsconfig.client.json'])
  run('client bundle (tsdown)', process.execPath, [tsdown, '--config', 'tsdown.client.config.ts'])
}
process.stdout.write('\n[build] done\n')
