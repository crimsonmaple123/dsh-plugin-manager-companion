#!/usr/bin/env node
/**
 * 跨平台的测试入口：自己列举 tests/*.test.mjs，逐个文件交给 `node --test`。
 *
 * 为什么不用 `node --test 'tests/*.test.mjs'`：
 *   · POSIX 下 shell 不展开单引号里的内容，Node 自己按 glob 展开，能跑；
 *   · Windows cmd 下整串带着单引号被当成一个文件名，**测试数 0、退出码 0**。
 * 也就是说同一条命令在 Windows 上会静默"通过"。实测：node --test 匹配不到任何
 * 文件时退出码是 0，所以换引号也不够——必须有"一个都没找到就报错"这一条。
 *
 * 为什么一个文件一次调用（而不是一次传全部文件）：
 *   1. 每个测试文件有自己的临时 HOME 与模块级状态；Node 默认的「每文件一个子进程」
 *      隔离正是它们成立的前提，一次传全部文件会让它们共享同一个进程（实测互相污染）。
 *   2. `--test-isolation=none` 让每个文件在**本进程**内跑，从而不需要再 spawn 子进程。
 *      受限环境下（Windows 沙箱 / 某些企业策略）子进程的管道 stdio 会被拒绝
 *      （spawn EPERM），而这里"一个文件一次调用"已经给出了同等的隔离。
 *
 * 结果按文件汇总：任何文件失败，整体退出码非零；找不到文件也报错。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const files = readdirSync(join(root, 'tests')).filter((name) => name.endsWith('.test.mjs')).sort()

if (files.length === 0) {
  process.stderr.write('run-tests: 在 tests/ 下没找到任何 *.test.mjs —— 拒绝报成功\n')
  process.exit(1)
}

const failed = []
const tapDir = mkdtempSync(join(tmpdir(), 'cmaple-test-tap-'))
try {
for (const name of files) {
  const tapPath = join(tapDir, name + '.tap')
  process.stdout.write(`\n===== ${name} =====\n`)
  const result = spawnSync(process.execPath, ['--test', '--test-isolation=none',
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=tap', '--test-reporter-destination=' + tapPath,
    join('tests', name)], {
    cwd: root, stdio: 'inherit',
  })
  if (result.error !== undefined) {
    process.stderr.write(`run-tests: ${name} 无法启动：${String(result.error)}\n`)
    failed.push(name)
    continue
  }
  const tap = existsSync(tapPath) ? readFileSync(tapPath, 'utf8') : ''
  const hasFailure = /^\s*not ok\s+\d+\b/m.test(tap)
    || /^# fail\s+[1-9]\d*\s*$/m.test(tap)
  const match = /^# tests\s+(\d+)\s*$/m.exec(tap)

  if (result.status !== 0 || hasFailure || match === null || Number(match[1]) === 0) {
    failed.push(name)
    if (result.status === 0) {
      process.stderr.write('run-tests: TAP failure or missing summary: ' + name + '\n')
    }
  }
}
} finally {
  rmSync(tapDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

process.stdout.write(`\n===== 汇总 =====\n`)
process.stdout.write(`文件 ${files.length} 个，失败 ${failed.length} 个${failed.length === 0 ? '' : '：' + failed.join(', ')}\n`)
process.exit(failed.length === 0 ? 0 : 1)
