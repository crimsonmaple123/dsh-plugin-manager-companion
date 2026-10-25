/**
 * 平台能力探测（测试用）。
 *
 * 本仓库有一批用例的**夹具**依赖操作系统能力，而当前机器（Windows + 受限执行环境）
 * 实测拿不到它们：
 *
 *   · 符号链接：普通用户默认没有 `SeCreateSymbolicLinkPrivilege`，
 *     `fs.symlinkSync` 报 `EPERM`，`mklink /D` 报"权限不足"。
 *     module-fallback 的断链/过时分类、诊断的共享层证据都以链接为被测对象。
 *   · 进程表：`Get-CimInstance Win32_Process` 在本环境返回 Access denied，
 *     `spawnSync(..., {stdio:'pipe'})` 报 `EPERM`。
 *     "按 pid 精确 kill""进程表指错 pid 时拒绝"这类用例需要一个可读的进程表。
 *
 * 立场（与 kinds.test.mjs 的既有做法一致）：**造不出夹具就如实跳过并写明原因**，
 * 绝不伪造形态（junction 的 `lstat().isSymbolicLink()` 是 false，拿它冒充符号链接
 * 会让断言在错误前提下变绿），也绝不删掉这些用例——它们在支持这些能力的平台上
 * 仍是有效的护栏。
 */
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { processFactsNow } from '../dist/envManager.js'

/** 探测结果缓存：同一进程内只探一次。 */
const cache = new Map()

/** 把未知异常折成稳定的原因片段。 */
function codeOf(error) {
  return error !== null && typeof error === 'object' && 'code' in error ? String(error.code) : String(error)
}

/**
 * 本机能否创建符号链接。
 * @returns `{ ok: true }` 或 `{ ok: false, reason }`（reason 直接用作跳过理由）。
 */
export function symlinkSupport() {
  if (cache.has('symlink')) return cache.get('symlink')
  const dir = mkdtempSync(join(tmpdir(), 'dshpm-link-probe-'))
  let verdict
  try {
    symlinkSync(join(dir, 'target'), join(dir, 'link'))
    verdict = { ok: true }
  } catch (error) {
    verdict = {
      ok: false,
      reason: '本机不允许创建符号链接（' + codeOf(error) + '）：本用例的夹具就是链接，无法在此平台取证',
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  cache.set('symlink', verdict)
  return verdict
}

/**
 * 本机能否读到进程表。
 * @returns `{ ok: true }` 或 `{ ok: false, reason }`。
 */
export function processTableSupport() {
  if (cache.has('process')) return cache.get('process')
  const facts = processFactsNow()
  const verdict = facts.readable
    ? { ok: true }
    : {
        ok: false,
        reason: '本机读不到进程表（' + String(facts.reason) + '）：本用例需要一个可读的进程表，无法在此平台取证',
      }
  cache.set('process', verdict)
  return verdict
}

/**
 * 本机能否用**管道**启动子进程。
 *
 * 为什么单独探：受限环境（Windows 沙箱 / 某些企业策略）下
 * `spawnSync(cmd, args, { stdio: ['ignore','pipe','pipe'] })` 直接报 `EPERM`——
 * 连 `echo hi` 都起不来。依赖"真起一个子进程并读它的 stdout"的用例因此无法取证。
 *
 * @returns `{ ok: true }` 或 `{ ok: false, reason }`。
 */
export function childProcessSupport() {
  if (cache.has('child')) return cache.get('child')
  let verdict
  try {
    const result = spawnSync(process.execPath, ['-e', 'process.stdout.write("ok")'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
    })
    verdict = result.error !== undefined || result.status !== 0 || result.stdout !== 'ok'
      ? {
          ok: false,
          reason: '本机不允许用管道启动子进程（'
            + String(result.error?.code ?? ('exit ' + String(result.status))) + '）：本用例需要一个真实子进程，无法在此平台取证',
        }
      : { ok: true }
  } catch (error) {
    verdict = { ok: false, reason: '本机不允许用管道启动子进程（' + codeOf(error) + '）：本用例需要一个真实子进程，无法在此平台取证' }
  }
  cache.set('child', verdict)
  return verdict
}

/**
 * 按能力把 `test` 包成"不支持就跳过"的版本。
 *
 * @param test - `node:test` 的 test 函数。
 * @param verdict - 能力探测结果。
 * @returns 同签名的 test 函数（不支持时登记一条带原因的 skipped 用例）。
 */
export function testWhen(test, verdict) {
  if (verdict.ok) return test
  return (name, fn) => test(name, { skip: verdict.reason }, fn)
}
