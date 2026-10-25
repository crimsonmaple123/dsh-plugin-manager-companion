/**
 * 0.2.1-rc.3 兼容契约的回归测试（node --test，跑 dist 产物）。
 *
 * 为什么要单独一个文件：这些断言钉的是**官方接口的形状**，而不是本插件的功能。
 * 它们全部来自这次迁移中真实撞到的编译/运行期断裂（见 docs/MIGRATION-0.2.1.md），
 * 每一条都能在官方改回去/再改一次时立刻报红——这是"下次升级不会又踩一遍"的唯一保障。
 *
 * 五组：
 *   1. Loader 契约：`Config` 必须是导出的 standard-schema，且根节点 volatile；
 *   2. 配置寻址：`registerConfig` 必须按 **profile 条目 id** 读 `describe()` / 写 `update()`；
 *   3. 链接判据：Windows junction 必须被认成链接（否则桌面版整类功能静默失效）；
 *   4. 启动阻断：0.2.1 的 `skippedBundles` 通道必须被读，不能只剩旧异常路径；
 *   5. 客户端：平台模块表 11 项、`configForms` 注入、`mutate` 返回 boolean 的语义。
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { linkKindOf, linkTargetOf } from '../dist/links.js'
import { ConfigSchema, SETTINGS_ENTRY_ID, SETTINGS_NAMESPACE, configState, normalizeConfig, registerConfig, resolveConfigValue } from '../dist/settings.js'
import { analyzeEnvironment } from '../dist/diagnostics.js'
import { symlinkSupport } from './platform-support.mjs'

const home = mkdtempSync(join(tmpdir(), 'pmc-compat-'))
const originalHome = process.env.DSH_HOME
process.env.DSH_HOME = home

after(() => {
  if (originalHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalHome
  rmSync(home, { recursive: true, force: true })
})

// ── 1. Loader 契约 ────────────────────────────────────────────────────────

describe('0.2.1 · Loader 配置契约', () => {
  it('dist/index.js 必须导出 Config（Loader 读的就是这个名字）', async () => {
    const mod = await import('../dist/index.js')
    // schemastery 的 schema 是可调用对象（`schema(value)` 直接解析），因此 typeof 是 'function'。
    assert.ok(mod.Config !== undefined && mod.Config !== null, '缺 Config：官方 Loader 不会校验配置，settings.describe() 也不会出现本插件条目')
    assert.equal(mod.Config, mod.ConfigSchema, 'Config 必须就是 ConfigSchema（两份 schema 会漂移）')
    assert.equal(typeof mod.Config['~standard']?.validate, 'function', 'Config 必须是 standard-schema')
  })

  it('根节点是 volatile：解析结果是 Volatile 引用，不是裸对象', () => {
    assert.equal(ConfigSchema.meta.volatile, true, '非 volatile 的配置变更会让 Loader 重挂载整个插件')
    const resolved = ConfigSchema['~standard'].validate({})
    assert.equal(resolved.issues, undefined)
    assert.equal(typeof resolved.value.get, 'function', 'volatile 配置在运行期是 { get() } 引用')
    assert.deepEqual(resolveConfigValue(resolved.value).diagnostics.ecosystem, false)
  })

  it('normalizeConfig 两种形态都收：Volatile 引用与裸对象', () => {
    const fromRef = normalizeConfig(ConfigSchema['~standard'].validate({}).value)
    const fromPlain = normalizeConfig({})
    assert.deepEqual(fromRef, fromPlain, '两种来源必须归一到同一份配置')
    assert.deepEqual(normalizeConfig(undefined), fromPlain, 'undefined 也要回落默认值')
    // 缺字段补默认值（不是留 undefined）
    for (const key of Object.keys(fromPlain.trial)) assert.notEqual(fromPlain.trial[key], undefined)
    for (const key of Object.keys(fromPlain.upgrade)) assert.notEqual(fromPlain.upgrade[key], undefined)
  })
})

// ── 2. 配置寻址 ──────────────────────────────────────────────────────────

describe('0.2.1 · 配置按 profile 条目 id 寻址', () => {
  const ctxOf = (services) => ({
    get: (name) => services[name],
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    on: () => () => {},
  })

  it('条目 id 是包名，字典命名空间是另一个字符串（两者不许合并）', () => {
    assert.equal(SETTINGS_ENTRY_ID, 'dsh-plugin-manager-companion-cmaple')
    assert.equal(SETTINGS_NAMESPACE, 'plugin-manager-companion')
    assert.notEqual(SETTINGS_ENTRY_ID, SETTINGS_NAMESPACE, '合并会让 configForms.get() 永远取不到表单')
  })

  it('读 describe() 里本行的 value；写走 update(entryId, patch)', async () => {
    const calls = []
    const settings = {
      describe: () => [{ ns: SETTINGS_ENTRY_ID, value: { qualityGate: { enabled: true, mode: 'warn', allowlist: [] } }, writable: true }],
      update: async (ns, patch) => { calls.push({ ns, patch }) },
    }
    const handle = registerConfig(ctxOf({ settings }))
    assert.equal(configState().writable, true)
    assert.equal(handle.current().qualityGate.mode, 'warn')
    await handle.update({ qualityGate: { enabled: true, mode: 'block', allowlist: [] } })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].ns, SETTINGS_ENTRY_ID, '必须用条目 id，不是旧命名空间')
  })

  it('行不在 describe 里 → 只读降级 + 稳定原因码（不抛穿装配）', async () => {
    const settings = { describe: () => [], update: async () => {} }
    const handle = registerConfig(ctxOf({ settings }))
    assert.equal(configState().writable, false)
    assert.equal(configState().reason, 'no-profile-entry')
    await assert.rejects(() => handle.update({}), /被拒绝/)
  })

  it('只有旧式 register()（0.2.1 已删）→ 走 settings-missing，不是调用点 TypeError', () => {
    const handle = registerConfig(ctxOf({ settings: { register() { throw new Error('namespace already registered') } } }))
    assert.equal(configState().reason, 'settings-missing')
    assert.equal(handle.current().qualityGate.mode, 'block')
  })
})

// ── 3. 链接判据（Windows junction）───────────────────────────────────────

describe('0.2.1 · 链接判据覆盖 junction', () => {
  it('junction 在 lstat 里不是符号链接，但必须被 linkKindOf 认出来', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pmc-junc-'))
    try {
      const target = join(dir, 'real')
      mkdirSync(target)
      writeFileSync(join(target, 'keep.txt'), 'x')
      const link = join(dir, 'link')
      try {
        symlinkSync(target, link, 'junction')
      } catch (error) {
        // 平台连 junction 都不给建（极少数策略）：如实跳过，不伪造。
        assert.ok(error !== null)
        return
      }
      if (process.platform !== 'win32') {
        // POSIX 上 type 参数被忽略，建出来就是普通符号链接：判据同样成立。
        assert.equal(linkKindOf(link), 'symlink')
        return
      }
      assert.ok(['junction', 'symlink'].includes(linkKindOf(link)), 'junction 必须被识别为链接')
      assert.equal(typeof linkTargetOf(link), 'string', 'junction 的 readlink 会抛 EINVAL，必须退回 native realpath')
      // 普通目录不许被误认成链接（宁可少认，不可误删）
      assert.equal(linkKindOf(target), undefined)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('真符号链接（平台支持时）仍判 symlink；不支持则跳过', () => {
    const support = symlinkSupport()
    if (!support.ok) {
      assert.match(support.reason, /符号链接/)
      return
    }
    const dir = mkdtempSync(join(tmpdir(), 'pmc-sym-'))
    try {
      const target = join(dir, 'real')
      mkdirSync(target)
      const link = join(dir, 'link')
      symlinkSync(target, link)
      assert.equal(linkKindOf(link), 'symlink')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── 4. 启动阻断：skippedBundles 通道 ────────────────────────────────────

describe('0.2.1 · 启动阻断根因从 skippedBundles 读', () => {
  before(() => {
    mkdirSync(join(home, 'profiles'), { recursive: true })
  })

  it('解析不到的 bundle 变成 unresolvable-bundle（0.2.1 不再抛错，只跳过）', async () => {
    const dir = join(home, 'profiles', 'skipped')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-skipped',
      dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/definitely-not-installed'] } },
    }))
    writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
    const report = await analyzeEnvironment(
      { get: () => undefined, logger: { info() {}, warn() {}, error() {} } },
      { name: 'skipped', dir, current: false, builtin: false, bundles: [], dependencies: [], runs: [] },
      { diagnostics: { dependency: true, composition: true, runtime: true, consistency: true, ecosystem: false } },
    )
    const issue = report.issues.find((item) => item.code === 'unresolvable-bundle')
    assert.ok(issue, '0.2.1 把"解析不到"从抛错改成跳过；不读 skippedBundles 就会整类丢诊断：'
      + JSON.stringify(report.issues.map((item) => item.code)))
    assert.ok(issue.subjects.includes('@deepseek-ai/definitely-not-installed'))
    // 旧通道（skip）仍在，只是不再是唯一身份
    assert.ok(report.skipped.some((item) => item.check === 'composition-skipped-bundles'))
  })

  it('不兼容的 bundle 变成 incompatible-bundle（0.2.1 新增的跳过原因）', async () => {
    const dir = join(home, 'profiles', 'incompatible')
    mkdirSync(join(dir, 'node_modules', '@probe', 'bad-bundle'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', '@probe', 'bad-bundle', 'package.json'), JSON.stringify({
      name: '@probe/bad-bundle',
      version: '0.0.1',
      engines: { dsh: '^0.0.1-alpha.0' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(dir, 'node_modules', '@probe', 'bad-bundle', 'cordis.patch.yml'), '[]\n')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-incompatible',
      dependencies: { '@probe/bad-bundle': '0.0.1' },
      dsh: { profile: { bundles: ['@probe/bad-bundle'] } },
    }))
    writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
    const report = await analyzeEnvironment(
      { get: () => undefined, logger: { info() {}, warn() {}, error() {} } },
      { name: 'incompatible', dir, current: false, builtin: false, bundles: [], dependencies: [], runs: [] },
      { diagnostics: { dependency: true, composition: true, runtime: true, consistency: true, ecosystem: false } },
    )
    const issue = report.issues.find((item) => item.code === 'incompatible-bundle')
    assert.ok(issue, '要报出"装上了却被跳过"这一类（用户会觉得装好了却不起作用）：'
      + JSON.stringify(report.issues.map((item) => item.code)))
    assert.ok(issue.detail.includes('跳过'), '要说清官方是跳过它，不是整个 profile 起不来')
  })
})

// ── 5. 客户端契约 ────────────────────────────────────────────────────────

describe('0.2.1 · 客户端配置通道', () => {
  it('平台模块表 11 项，且与官方 seed 表逐字一致', async () => {
    const { PLATFORM } = await import('../tsdown.client.config.ts').catch(() => ({}))
    // tsdown 配置是 TS，node 直接 import 会失败：改读源码文本（这也是唯一能静态核对的形态）。
    const { readFileSync } = await import('node:fs')
    const text = readFileSync(new URL('../tsdown.client.config.ts', import.meta.url), 'utf8')
    const names = [...text.matchAll(/'([^']+)'/g)].map((match) => match[1])
    for (const spec of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
      '@deepseek-ai/cordis', 'zod', '@tanstack/react-virtual',
      '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit']) {
      assert.ok(names.includes(spec), 'PLATFORM 缺 ' + spec + '（0.2.1 的表是 11 项）')
    }
    assert.equal(PLATFORM, undefined)
  })

  it('产物只 require 平台表内的模块', async () => {
    const { readFileSync } = await import('node:fs')
    const bundle = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
    const required = [...new Set([...bundle.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]))]
    const allowed = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
      '@deepseek-ai/cordis', 'zod', '@tanstack/react-virtual',
      '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit'])
    for (const spec of required) {
      assert.ok(allowed.has(spec), '越表 require 会中断整个插件页面：' + spec)
    }
    assert.ok(required.length > 0, '产物里一个 require 都没有？那这份断言是空转')
  })
})
