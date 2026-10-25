/**
 * 本插件的配置面。
 *
 * 归属：A 类·重写（新代码；旧仓库把配置散在 profile 文件与 market 缓存里）。
 * 官方复用：Cordis 的插件 `Config` + 官方 `ctx.settings`（0.2.1 起是 `SettingsForms`）。
 *
 * ## 0.2.1 的配置模型（与 0.1.6 的根本差别）
 *
 * 0.1.6 的 `ctx.settings` 是「按命名空间注册 schema」的 `SettingsProvider`：
 * 插件在 apply 里 `register(ns, schema)` 拿一个 scope。
 * 0.2.1 起配置就是**插件自己的 `Config`**：Loader 行按 `id` 认领配置，官方把
 * 每一行的 schema 投影成表单，写入走 `settings.update(entryId, patch)`。
 * 所以本模块不再注册命名空间，只做三件事：
 *   1. 导出 `Config`（供 Loader 校验与官方表单渲染）；
 *   2. 把 volatile 引用归一成 `CompanionConfig`（缺字段回落默认值）；
 *   3. 提供 `ConfigHandle` 门面（读 / 观察 / 写），写失败绝不静默。
 *
 * `SETTINGS_NAMESPACE` 仍然存在，但语义已收窄为**客户端字典命名空间**：
 * 0.2.1 的 `settings.describe()` 返回的 `ns` 是 `entry.options.id`（Loader 行 id），
 * 客户端的 `configForms.get(id)` 也用它。两者不是同一个字符串，所以本文件导出两个
 * 常量（{@link SETTINGS_NAMESPACE} 与 {@link SETTINGS_ENTRY_ID}），改名时两处都要看。
 *
 * 配置只描述**本插件自己的行为**，绝不描述环境状态：环境状态是事实，读出来
 * 即可，不该由用户配置。
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/**
 * 本插件在客户端字典里的命名空间。
 *
 * 0.2.1 起它**只**是 `ctx.locale.register` 的键，与配置寻址无关（旧版把它同时
 * 当作 settings 命名空间，那套 API 已不存在）。
 */
export const SETTINGS_NAMESPACE = 'plugin-manager-companion'

/**
 * 本插件的配置条目 id（= Loader 行 id = 包名）。
 *
 * 0.2.1 的 `settings.describe()` 用 `entry.options.id` 作为 `ns`，
 * 客户端 `configForms.get(entryId)` 也用它；`cordis.patch.yml` 的行 id 与包名
 * 一致，因此这里必须是包名，而不是字典命名空间。
 */
export const SETTINGS_ENTRY_ID = 'dsh-plugin-manager-companion-cmaple'

/**
 * 诊断深度。用户要求"最大化利用能力，但同时保证不出错"，所以深度是**可选**的：
 * 环境不支持某一层时，该层自动跳过并在报告里标注，而不是让整次诊断失败。
 */
export interface DiagnosticsConfig {
  /** 依赖层（静态扫描 import 图）。 */
  readonly dependency: boolean
  /** 组合层（patch 层栈与行 id）。 */
  readonly composition: boolean
  /** 运行时层（loader fiber 相位、注册表冲突）。需要 Loader 服务。 */
  readonly runtime: boolean
  /** 一致性层（官方 inventory 与本地文件对照）。 */
  readonly consistency: boolean
  /** 生态层（市场索引的更新与风险）。需要网络。 */
  readonly ecosystem: boolean
  /**
   * 是否上报「完好但过时」的依赖兜底链接（`$DSH_HOME/profiles/node_modules`）。
   *
   * 默认 **true**（上报）。关掉只影响这一类提示：**断链的上报与清理不受它控制**——
   * 断链是旧版本残骸、默认自动删，属于"管理器该做的事"，不该被一个提示开关顺手关掉。
   */
  readonly reportStaleModuleFallbackLinks: boolean
}

/** 安装前质量门的配置。 */
export interface QualityGateConfig {
  /** 是否在安装前扫描。关闭后安装直接交给官方，不做前置校验。 */
  readonly enabled: boolean
  /**
   * 拦截强度。
   * - `block`：发现问题即回滚（默认）
   * - `warn`：只报告，仍完成安装
   */
  readonly mode: 'block' | 'warn'
  /**
   * 豁免的包名。用于质量门误伤的第三方包（其依赖声明方式超出规则能表达的
   * 范围）。加进来即跳过全部检查——这是用户显式承担风险的选择。
   */
  readonly allowlist: readonly string[]
}

/** 市场配置。 */
export interface MarketplaceConfig {
  /** 是否在设置页与市场页启用远程索引。关闭后市场页只显示已安装信息。 */
  readonly enabled: boolean
  /** 索引缓存有效期（分钟）。 */
  readonly cacheTtlMinutes: number
  /** 网络请求超时（毫秒）。 */
  readonly timeoutMs: number
  /**
   * 上游索引地址。默认取社区维护的 topic:dsh-plugin 全量索引。
   * 留空表示只用内置默认源。
   */
  readonly indexUrl: string
}

/**
 * 试装（质量门第二步，DESIGN §5.2/§5.3）的配置。
 *
 * 这一段的字段全部描述"点一下安装会发生什么"，因为试装会在**用户机器上真实执行第三方代码**：
 * 默认关闭，且开启后设置页必须如实告知（事实见 TRIAL_DISCLOSURE）。
 */
export interface TrialConfig {
  /**
   * 试装总开关。**默认关**。
   *
   * 打开后的后果（设置页必须原样告知用户，不要自己另写一套）：
   *   · 每次安装都会先把候选包**真实安装**进一个测试环境（`<环境名>-dpmc`）并**执行它自带的安装脚本**
   *     （带 `postinstall` 的包会在你的机器上真的跑）；
   *   · 一次验证启动的内存峰值约 **161 MiB**（maxrss 实测，口径见 TRIAL_DISCLOSURE.measurement）；
   *   · 一轮试装约 0.65 秒（冷 store 且需联网下载候选包时约 2.3 秒）；
   *   · 会在磁盘上多出一个测试环境目录（删掉它即可回收，设置页显示总占地）。
   *
   * 关闭时安装走的是原来的路径（静态快筛 + 官方通道），不产生任何额外进程与目录。
   */
  readonly enabled: boolean
  /**
   * 快照深度。
   *   · `auto`（默认）：先建**浅快照**（只复制清单文件）；只有基线**明确挂载失败**才升级为完整快照
   *     重试一次，两次都起不来才说"基线本身有问题"。
   *   · `shallow`：只用浅快照。给不起完整快照的机器用（省一次官方 install），代价是层栈不全时
   *     会把"快照缺依赖"误报成"基线起不来"。
   *   · `full`：每次试装都跑一次官方 `install --prefer-offline` 物化真实快照（约 59ms 热 / 831ms 冷），
   *     最保真，也最慢。
   *
   * 用户看到的后果：这一项只影响结论的**可信度**与耗时；无论哪种深度，结论里都会写明"实际用了哪种"。
   */
  readonly depth: 'auto' | 'shallow' | 'full'
  /**
   * 试装前做一次基线启动（DESIGN §5.2 四步的②）。**默认开**。
   *
   * 关掉的后果：省约 558ms，但失败时**说不出是谁的问题**——只能看到"装完后起不来"，
   * 无法区分"环境本来就起不来"与"候选包把它弄坏了"。结论会如实降级为"无法试装"，而不是通过。
   */
  readonly baseline: boolean
  /**
   * 允许联网拉取候选包。**默认开**。
   *
   * 关掉的后果：只用本地 pnpm store，冷包（store 里没有）直接判"无法试装"——如实说明，**不假装通过**。
   * 适合离线机器：代价是没下过的包永远试装不了。
   */
  readonly allowNetwork: boolean
  /**
   * 试装未通过（候选包导致挂载失败 / 基线起不来 / 无法试装）时的行为。
   *   · `block`（默认）：**不安装**——回滚候选包并给出原因链，用户看不到半装状态；
   *   · `warn`：照常安装，但结果里带着试装结论（用户自己决定要不要留着）。
   *
   * 两种模式都**不会**把"无法试装"当成通过：`warn` 下装是装了，结论字段照样写"无法试装（不算通过）"。
   */
  readonly onFailure: 'block' | 'warn'
  /**
   * 自动清理测试环境。**默认开**。开启后，每次试装结束时按 {@link TrialConfig.retentionDays}
   * 清理**已过期**的测试环境（正在运行的永远不删），并在 `<DSH_HOME>/dpmc-trial-cleanup.log` 记账。
   *
   * 关掉的后果：测试环境只增不减，需要用户自己在环境列表里删（每个测试环境都可单独删除）。
   * 无论开关如何，"一键清理过期"这个显式动作都可以用。
   */
  readonly autoCleanup: boolean
  /**
   * 测试环境保留天数（默认 14）。只对自动清理与"一键清理"生效。
   *
   * 用户看到的后果：测试环境超过这个天数没被用过就会被自动删除；改大=留得更久、占更多盘，
   * 改小=清理更早。正在运行的测试环境不受影响（删除一律先拒，让用户自己决定停不停）。
   */
  readonly retentionDays: number
  /**
   * 最多保留的测试环境数；**0 = 不限（默认）**。
   *
   * 为什么用 0 而不是 null：settings 的 schema 里可空字段不会回填默认值（实测：值会变成
   * undefined），这种"看不见的洞"比一个显式的 0 糟得多。
   *
   * 用户看到的后果：设成 N 后，若测试环境已经有 N 个（不含本次要用的那一个），试装会**拒绝执行**
   * 并告诉你"先清理"——它**不会**为了腾位而偷偷删掉任何一个测试环境（删除只在两处发生：
   * 你自己点删除，或超过保留期的自动清理）。这正是"不设硬上限"的意思。
   */
  readonly maxKept: number
}

/**
 * 升级（档三）的配置：**检查时机**与 registry 地址。
 *
 * 检查时机刻意不做后台轮询（官方没有这类钩子，自己挂定时器会让插件在宿主里留一个永不退出的句柄）：
 * "每天一次"的语义是"下次进入时若距上次成功检查超过 24h 就查"。
 */
export interface UpgradeConfig {
  /**
   * 自动检查更新。**默认开**。
   *
   * 关掉的后果：进入关于页不再自动出网；手动检查按钮照常可用（它不受开关与 TTL 限制）。
   */
  readonly autoCheck: boolean
  /**
   * 检查间隔：`session`（每次打开）/ `6h` / `daily`（默认）/ `manual`（仅手动）。
   *
   * 用户看到的后果：间隔越大越少出网、越省时间；代价是"最近发布了新版本"可能晚一点才看到。
   * 检查失败也会记时间戳（1 小时内不自动重试），免得每次进入都等一次超时——手动按钮不受影响。
   */
  readonly interval: 'session' | '6h' | 'daily' | 'manual'
  /**
   * npm registry 地址（默认官方 registry，可填镜像）。
   *
   * 用户看到的后果：填镜像后版本查询走镜像；镜像不可用一律显示"查不到"，
   * **不会**显示成"已是最新"（这两个是不同状态）。
   */
  readonly registryUrl: string
}

/** 本插件的完整配置。 */
export interface CompanionConfig {
  readonly diagnostics: DiagnosticsConfig
  readonly qualityGate: QualityGateConfig
  readonly marketplace: MarketplaceConfig
  /**
   * 试装配置。
   *
   * 为什么是**可选**字段（而不是像其他三段那样必填）：客户端（src/client）镜像这份配置的形状，
   * 它按自己的节奏新增字段；把这里写成必填会让"宿主加了字段"直接变成客户端编译失败（跨任务互锁）。
   * 读配置的人因此**必须**走 effectiveTrialConfig()——它保证缺字段时拿到的是安全默认值，
   * 而不是 undefined。运行期这份配置永远由 ConfigSchema 补齐（schema 里带 .default）。
   */
  readonly trial?: TrialConfig
  /**
   * 升级配置。与 trial 同为**可选**字段（客户端镜像是按自己的节奏补齐的）；
   * 读配置一律走 effectiveUpgradeConfig()，缺字段时拿到的是安全默认值。
   */
  readonly upgrade?: UpgradeConfig
}

/**
 * 试装配置的默认值。
 *
 * 单独一份（而不是只有 DEFAULT_CONFIG.trial）：CompanionConfig.trial 是可选字段，
 * 类型上它可能是 undefined；读配置的人都该拿这一份，不该拿"可能是 undefined 的默认值"。
 */
export const DEFAULT_TRIAL_CONFIG: TrialConfig = {
  // 试装默认关闭：它会在用户机器上真实装包并执行对方代码（DESIGN §5.2），必须显式开启。
  enabled: false,
  depth: 'auto',
  baseline: true,
  allowNetwork: true,
  onFailure: 'block',
  autoCleanup: true,
  retentionDays: 14,
  maxKept: 0,
}

/** 升级配置的默认值（单独一份：CompanionConfig.upgrade 是可选字段）。 */
export const DEFAULT_UPGRADE_CONFIG: UpgradeConfig = {
  autoCheck: true,
  interval: 'daily',
  registryUrl: '',
}

/** 默认配置：诊断全开、质量门拦截、市场启用、试装关闭、升级检查每天一次。 */
export const DEFAULT_CONFIG: CompanionConfig = {
  diagnostics: {
    dependency: true,
    composition: true,
    runtime: true,
    consistency: true,
    // 生态层要联网，默认关闭——诊断页在用户显式开启后才访问网络。
    ecosystem: false,
    // 「完好但过时」默认上报：用户要知道磁盘上有什么（用户裁决：报但不删）。
    reportStaleModuleFallbackLinks: true,
  },
  qualityGate: { enabled: true, mode: 'block', allowlist: [] },
  marketplace: { enabled: true, cacheTtlMinutes: 1440, timeoutMs: 15_000, indexUrl: '' },
  trial: { ...DEFAULT_TRIAL_CONFIG },
  upgrade: { ...DEFAULT_UPGRADE_CONFIG },
}

/**
 * 开启试装前必须让用户看到的事实（DESIGN §5.2 的"显式开启 + 明确告知"）。
 *
 * 为什么是机器可读的常量而不是写死在文案里：这两个数字是本机实测的**口径事实**
 * （内存 161 MiB / 会执行第三方安装脚本），文案由 UI 任务落地，但数字不能各自抄一份——
 * 抄一份就会在下次实测后漂移，而漂移的是"用户以为自己承担了什么风险"。
 */
export interface TrialDisclosure {
  /** 是否会真的安装候选包并执行它的安装脚本（带 postinstall 的包会真的跑）。恒为 true。 */
  readonly executesCandidateCode: true
  /** 一次验证启动的实测内存峰值（MiB，maxrss 口径）。 */
  readonly peakMemoryMiB: number
  /** 上面这个数字的测量口径（UI 引用数字时必须一起给出，否则数字没有意义）。 */
  readonly measurement: string
}

/** 试装的告知事实（口径：Linux x64 / Node 24 / DSH 0.1.6-alpha.2，headless 验证启动）。 */
export const TRIAL_DISCLOSURE: TrialDisclosure = {
  executesCandidateCode: true,
  peakMemoryMiB: 161,
  measurement: '实测口径：headless 验证启动的 maxrss 峰值 161 MiB，'
    + '在 Linux x64 / Node 24 / DSH 0.1.6-alpha.2 上量得；候选包自带的安装脚本会真的在你机器上执行。',
}

/**
 * 插件配置的 schema（0.2.1 的插件 `Config`）。
 *
 * `.default()` 逐项给出，使旧配置文件在新增字段后仍能解析；未知字段由
 * schemastery 丢弃，不会因为未来删字段而炸掉整份配置。
 *
 * ## 为什么根节点是 `.volatile()`
 *
 * 0.2.1 起配置的**写路径**是官方 `settings.update(entryId, patch)` →
 * `configEditor.edit()` → `reconcileProfilePatches()`。该路径只对
 * **volatile 字段**做增量热更新（Loader 的 `_commitVolatile` 会把新值写进
 * 正在运行的引用而不重挂载插件）；非 volatile 的配置变更会走 `restart()`，
 * 也就是**卸载再装配整个插件**。
 *
 * 本插件的配置会被路由、agent 工具、诊断、市场、升级引擎长期持有（`ConfigHandle`
 * 在装配期建立、模块级缓存也按它算），重挂载会中断正在跑的 job 并让句柄指向旧实例。
 * 因此整份配置声明为 volatile：官方把变更提交进 `Volatile` 引用，我们通过
 * `ctx.on('loader/volatile-update')` 观察并重新发布快照，插件本身不重挂载。
 *
 * 代价与事实边界（必须知道，别把它当"可热改一切"）：
 *   · volatile 只保证**引用内**的值被更新；已经算好的派生结果（如缓存键、已注册的
 *     工具描述）不会自动重算——这些在本插件里都在调用点按当前配置现算，因此成立；
 *   · 官方 `volatileForm()` 对根 volatile 的投影是**整份** schema（`plainSchema`），
 *     所以设置页看到的字段与这里逐字一致；
 *   · 测试与 CLI 直接调用 `ConfigSchema(...)` 时拿到的是 `Volatile` 引用（有 `.get()`），
 *     归一入口是 {@link resolveConfigValue}。
 */
export const ConfigSchema = z.object({
  diagnostics: z.object({
    dependency: z.boolean().default(true),
    composition: z.boolean().default(true),
    runtime: z.boolean().default(true),
    consistency: z.boolean().default(true),
    ecosystem: z.boolean().default(false),
    reportStaleModuleFallbackLinks: z.boolean().default(true),
  }).default({ ...DEFAULT_CONFIG.diagnostics }),
  qualityGate: z.object({
    enabled: z.boolean().default(true),
    mode: z.union([z.const('block'), z.const('warn')]).default('block'),
    allowlist: z.array(z.string()).default([]),
  }).default({
    enabled: DEFAULT_CONFIG.qualityGate.enabled,
    mode: DEFAULT_CONFIG.qualityGate.mode,
    allowlist: [...DEFAULT_CONFIG.qualityGate.allowlist],
  }),
  marketplace: z.object({
    enabled: z.boolean().default(true),
    cacheTtlMinutes: z.number().min(1).max(10_080).default(1440),
    timeoutMs: z.number().min(1_000).max(120_000).default(15_000),
    indexUrl: z.string().default(''),
  }).default({ ...DEFAULT_CONFIG.marketplace }),
  // 注意：maxKept 用 0 = 不限而**不用 null**。实测（schemastery 3.18.2）：
  // 字段 schema 里含 z.const(null) 时，用户配置只写了别的字段，这个键会被整个丢掉
  // （值变成 undefined，不是 null）——即"用户在设置页看不到的一个洞"。
  // 也正因如此，读配置一律走 effectiveTrialConfig()：schema 的默认值不是运行期保证。
  trial: z.object({
    enabled: z.boolean().default(false),
    depth: z.union([z.const('auto'), z.const('shallow'), z.const('full')]).default('auto'),
    baseline: z.boolean().default(true),
    allowNetwork: z.boolean().default(true),
    onFailure: z.union([z.const('block'), z.const('warn')]).default('block'),
    autoCleanup: z.boolean().default(true),
    retentionDays: z.natural().min(1).max(3_650).default(14),
    maxKept: z.natural().max(1_000).default(0),
  }).default({ ...DEFAULT_TRIAL_CONFIG }),
  upgrade: z.object({
    autoCheck: z.boolean().default(true),
    interval: z.union([z.const('session'), z.const('6h'), z.const('daily'), z.const('manual')]).default('daily'),
    registryUrl: z.string().default(''),
  }).default({ ...DEFAULT_UPGRADE_CONFIG }),
}).volatile()

/**
 * 从官方配置值里取纯数据。
 *
 * 0.2.1 的 volatile 配置在运行期是一个 `Volatile<T>` 引用（`get()` 给不可变快照），
 * 而不是裸对象；非 volatile 的旧形态、以及测试里手工拼的字面量仍是裸对象。
 * 两个形态都要接受——否则任何一处读配置都会在其中一个形态上拿到 undefined。
 *
 * @param value - Loader 解析后的配置值，或任意配置片段。
 * @returns 纯数据对象；无法识别时 undefined。
 */
export function resolveConfigValue<T>(value: unknown): T | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = value as { get?: unknown }
  if (typeof candidate.get === 'function') {
    const snapshot = (candidate.get as () => unknown)()
    return snapshot === null || typeof snapshot !== 'object' ? undefined : snapshot as T
  }
  return value as T
}

/**
 * 把任意来源的配置补齐成完整形态。
 *
 * 三道来源都要过这里：Loader 的 volatile 引用、CLI 直接构造的字面量、以及
 * 测试替身。缺字段一律回落默认值（`effectiveTrialConfig` 那条纪律的推广）。
 *
 * @param value - 任意配置值。
 * @returns 完整配置。
 */
export function normalizeConfig(value: unknown): CompanionConfig {
  const raw = resolveConfigValue<Partial<CompanionConfig>>(value) ?? {}
  return {
    diagnostics: { ...DEFAULT_CONFIG.diagnostics, ...(raw.diagnostics ?? {}) },
    qualityGate: {
      ...DEFAULT_CONFIG.qualityGate,
      ...(raw.qualityGate ?? {}),
      allowlist: [...(raw.qualityGate?.allowlist ?? DEFAULT_CONFIG.qualityGate.allowlist)],
    },
    marketplace: { ...DEFAULT_CONFIG.marketplace, ...(raw.marketplace ?? {}) },
    trial: effectiveTrialConfig(raw),
    upgrade: effectiveUpgradeConfig(raw),
  }
}

/**
 * 读试装配置：缺字段、字段类型不对、越界一律回落到默认值。
 *
 * 为什么需要它（不是多此一举）：schema 的默认值只在"官方 settings 解析过这份配置"时成立。
 * 事实是配置对象还会从别处来——测试与工具自己拼的 CompanionConfig 字面量、以及未来
 * schemastery 行为变化（本文件里 maxKept 那条注释就是一个实测例子）。试装是**会写磁盘、会起进程**
 * 的动作，任何一个字段读到 undefined 都必须变成"用安全默认值"，不能变成"意外地开启/强制浅快照"。
 *
 * @param config - 任意形状的配置片段。
 * @returns 补齐后的试装配置（全部字段都有确定值）。
 */
export function effectiveTrialConfig(config: { readonly trial?: Partial<TrialConfig> | undefined } | undefined): TrialConfig {
  const fallback = DEFAULT_TRIAL_CONFIG
  const raw = (config?.trial ?? {}) as Partial<Record<keyof TrialConfig, unknown>>
  const bool = (value: unknown, byDefault: boolean): boolean => typeof value === 'boolean' ? value : byDefault
  const count = (value: unknown, byDefault: number, min: number, max: number): number => {
    const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : byDefault
    return Math.min(max, Math.max(min, parsed))
  }
  return {
    enabled: bool(raw.enabled, fallback.enabled),
    depth: raw.depth === 'shallow' || raw.depth === 'full' ? raw.depth : 'auto',
    baseline: bool(raw.baseline, fallback.baseline),
    allowNetwork: bool(raw.allowNetwork, fallback.allowNetwork),
    onFailure: raw.onFailure === 'warn' ? 'warn' : 'block',
    autoCleanup: bool(raw.autoCleanup, fallback.autoCleanup),
    retentionDays: count(raw.retentionDays, fallback.retentionDays, 1, 3_650),
    maxKept: count(raw.maxKept, fallback.maxKept, 0, 1_000),
  }
}

/** 配置的读写句柄。 */
export interface ConfigHandle {
  /** 当前生效配置（官方已解析默认值与用户层）。 */
  current(): CompanionConfig
  /** 观察配置提交；返回取消订阅函数。 */
  watch(listener: (next: CompanionConfig) => void): () => void
  /**
   * 合并写入一个局部配置，由官方 settings 服务负责校验与落盘。
   *
   * 不提供"重置为默认"以外的整段替换：局部合并足以表达界面上所有开关，
   * 而整段替换会让界面漏掉一个字段就把它打回默认值。
   *
   * @param patch - 局部配置。
   * @returns 写入完成后的生效配置。
   */
  update(patch: Partial<CompanionConfig>): Promise<CompanionConfig>
}

/**
 * 检查间隔对应的毫秒数；`null` = 仅手动（永不自动检查）。
 *
 * 纯函数、单一事实来源：引擎与界面用它算"要不要查"，避免两处各写一份间隔表而漂移。
 *
 * @param interval - 配置里的间隔。
 * @returns 毫秒；仅手动时为 null。
 */
export function upgradeIntervalMs(interval: UpgradeConfig['interval']): number | null {
  switch (interval) {
    case 'session': return 0
    case '6h': return 6 * 60 * 60 * 1000
    case 'manual': return null
    default: return 24 * 60 * 60 * 1000
  }
}

/**
 * 读升级配置：缺字段、类型不对一律回落默认值（与 effectiveTrialConfig 同一纪律：
 * schema 的默认值只在官方 settings 解析过那份配置时成立；这两个字段决定要不要出网）。
 *
 * @param config - 任意形状的配置片段。
 * @returns 补齐后的升级配置。
 */
export function effectiveUpgradeConfig(config: { readonly upgrade?: Partial<UpgradeConfig> | undefined } | undefined): UpgradeConfig {
  const fallback = DEFAULT_UPGRADE_CONFIG
  const raw = (config?.upgrade ?? {}) as Partial<Record<keyof UpgradeConfig, unknown>>
  const interval = raw.interval === 'session' || raw.interval === '6h' || raw.interval === 'manual'
    ? raw.interval
    : 'daily'
  return {
    autoCheck: typeof raw.autoCheck === 'boolean' ? raw.autoCheck : fallback.autoCheck,
    interval,
    registryUrl: typeof raw.registryUrl === 'string' ? raw.registryUrl : fallback.registryUrl,
  }
}

/**
 * 本插件配置面的当前状态（给 capabilities 用，让"配置不可写"对用户可见）。
 */
export interface ConfigState {
  /** 配置是否可以写入（false = 正在用只读的默认配置）。 */
  readonly writable: boolean
  /** 不可写的稳定原因码；可写时为 null。 */
  readonly reason: 'settings-missing' | 'no-profile-entry' | 'settings-read-only' | null
  /** 面向用户的一句话；可写时为 null。 */
  readonly detail: string | null
}

/** 最近一次配置降级的事实；null = 配置面正常。 */
let lastConfigDegradation: { readonly reason: ConfigState['reason']; readonly detail: string } | null = null

/**
 * 配置面的当前状态。
 *
 * 为什么是模块级：装配层用 `ctx.inject(['settings'], …)` 在 settings 就绪时才绑定
 * 句柄；而这件事实必须能被 probeOfficialCapabilities 读到、进而出现在用户可见的
 * capabilities 里（不能只在日志里）。
 *
 * @returns 当前配置面状态。
 */
export function configState(): ConfigState {
  if (lastConfigDegradation === null) return { writable: true, reason: null, detail: null }
  return { writable: false, reason: lastConfigDegradation.reason, detail: lastConfigDegradation.detail }
}

/**
 * 记录一次配置降级：写日志 + 留给 capabilities 呈现。
 *
 * @param ctx - host 上下文（用于日志）。
 * @param reason - 稳定原因码。
 * @param detail - 面向用户的原因。
 */
function noteConfigDegraded(ctx: Context, reason: ConfigState['reason'], detail: string): void {
  lastConfigDegradation = { reason, detail }
  ctx.logger?.warn?.('plugin-manager-companion: ' + detail)
}

/** 错误消息（本地小工具）。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 官方 settings 服务尚不可用时的**只读**降级句柄。
 *
 * 为什么需要它：settings 服务可能**晚于**本插件装配（服务挂载顺序不保证），
 * 而配置句柄会被各模块长期持有。装配层先拿这个，等服务出现再换成真句柄。
 *
 * `update` 刻意**抛错**而不是静默返回默认值——静默丢写是最糟的失败形态：
 * 用户改了配置、界面回显成功、实际什么都没发生（实测踩过，见 CONTEXT.md）。
 *
 * @returns 只读句柄；任何写入尝试都抛出可读错误。
 */
export function fallbackConfigHandle(): ConfigHandle {
  return {
    current: () => DEFAULT_CONFIG,
    watch: () => () => {},
    update: () => Promise.reject(new Error(
      '配置服务（settings）尚未就绪；写入被拒绝而不是丢弃——请稍后重试',
    )),
  }
}

/**
 * 官方 `SettingsForms` 服务里我们用到的那一面（结构式，不 import 官方类）。
 *
 * 0.2.1 的 `ctx.settings` 是 `SettingsForms`：`describe()` 列条目、`update(entryId, patch)`
 * 合并写入、`get(entryId)` 给客户端表单。服务是 peer 包的一部分，小版本可能增减方法，
 * 因此这里只声明实际调用的成员，并在运行时逐个校验。
 */
export interface SettingsFormsLike {
  describe(options?: { readonly redactSecrets?: boolean }): readonly {
    readonly ns: string
    readonly value: unknown
    readonly writable?: boolean
  }[]
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>
}

/**
 * 绑定本插件的配置句柄。
 *
 * 0.2.1 不再"注册命名空间"：配置就是本插件 Loader 行的 `Config`，由官方
 * `SettingsForms` 按行 id 暴露与写入。因此这里做的是**绑定**：
 *   · 读：优先用 Loader 交进来的运行期配置（`apply(ctx, config)` 的第二个参数，
 *     volatile 引用；`loader/volatile-update` 提交后同一个引用里就是新值）；
 *     没拿到时退回官方 `describe()` 里本行 id 的 `value`；
 *   · 写：官方 `update(entryId, patch)`（校验、落盘、volatile 提交都归官方）；
 *   · 观察：`loader/volatile-update`（volatile 值已提交、插件未重挂载）与
 *     `settings/document-updated`（外部编辑）。
 *
 * 三种"不可写"都要如实登记，且都不抛穿装配（否则用户看到的是一个装不上的插件）：
 *   · settings 服务缺失（非 profile 启动的宿主）；
 *   · 本插件不是 profile 行（没有 entry id / describe 里没有本行）；
 *   · 官方报告文档只读。
 *
 * @param ctx - 本插件的 host 上下文。
 * @param runtimeConfig - Loader 解析后的配置值（volatile 引用或裸对象）；省略时从 describe() 读。
 * @returns 配置句柄；不可写时返回只读的默认配置句柄，并把原因留给 capabilities。
 */
export function registerConfig(ctx: Context, runtimeConfig?: unknown): ConfigHandle {
  const settings = ctx.get('settings') as SettingsFormsLike | undefined
  if (settings === undefined || typeof settings.describe !== 'function' || typeof settings.update !== 'function') {
    noteConfigDegraded(ctx, 'settings-missing',
      'settings 服务未就绪（0.2.1 需要 @deepseek-ai/dsh-settings 的 SettingsForms），配置降级为只读')
    return { ...fallbackConfigHandle(), current: () => normalizeConfig(runtimeConfig) }
  }
  /** 本行 id：Loader 行 id 就是官方表单的 `ns`；没经 Loader 时退回包名。 */
  const entryId = entryIdOf(ctx) ?? SETTINGS_ENTRY_ID
  const read = (): CompanionConfig => {
    if (runtimeConfig !== undefined) return normalizeConfig(runtimeConfig)
    let descriptors: ReturnType<SettingsFormsLike['describe']>
    try {
      descriptors = settings.describe()
    } catch (error) {
      noteConfigDegraded(ctx, 'settings-read-only', '读配置表单失败：' + messageOf(error))
      return DEFAULT_CONFIG
    }
    const own = descriptors.find(descriptor => descriptor.ns === entryId)
    if (own === undefined) {
      noteConfigDegraded(ctx, 'no-profile-entry',
        '当前 profile 的组合里没有本插件的配置行（id "' + entryId + '"）：'
        + '配置只在以 profile 方式启动、且本插件作为 Loader 行装配时可用')
      return DEFAULT_CONFIG
    }
    if (own.writable === false) {
      noteConfigDegraded(ctx, 'settings-read-only', '官方配置文档当前只读，配置降级为默认值')
    } else {
      lastConfigDegradation = null
    }
    return normalizeConfig(own.value)
  }
  // 首次读一次：把"行不存在 / 只读"这类事实在装配期就登记给 capabilities。
  const initial = read()
  // 降级时**必须**给只读句柄：能读（甚至能读到宿主里的真实值）不等于能写。
  // 若在这里返回一个"能写"的句柄，写入会打到官方 update 上并被它拒绝——但那是一个
  // 迟到的、不可解释的失败；用户改完配置看到的是"保存失败"，而不是"这里不可写"。
  if (!configState().writable) {
    return { ...fallbackConfigHandle(), current: () => initial }
  }
  return {
    current: read,
    watch: (listener) => {
      // `loader/volatile-update` 是 0.2.1 的 Loader 事件（值已提交、插件未重挂载）。
      const offVolatile = ctx.on('loader/volatile-update', () => { listener(read()) })
      // `settings/document-updated` 由官方 dsh-settings 声明（客户端合并的 Cordis Events）；
      // 本包的编译面只含 dsh-tools/inventory 等 peer，未必拉到那条声明，因此用结构式注册。
      const onAny = ctx.on as unknown as (name: string, listener: (...args: unknown[]) => void) => () => void
      const offDocument = onAny('settings/document-updated', (ns: unknown) => {
        if (ns === entryId) listener(read())
      })
      return () => { offVolatile(); offDocument() }
    },
    update: async (patch) => {
      await settings.update(entryId, patch as object)
      return read()
    },
  }
}

/**
 * 取本插件 Loader 行的 id（`ctx.fiber.entry.options.id`）。
 *
 * 与官方 `PluginManager` 同一口径：它用 `ctx.fiber.entry?.options.id` 认领自己的配置行。
 * 不经 Loader 装配时（单测直接调 apply）没有 entry，返回 undefined。
 *
 * @param ctx - host 上下文。
 * @returns 行 id；取不到时 undefined。
 */
function entryIdOf(ctx: Context): string | undefined {
  const entry = (ctx as unknown as { fiber?: { entry?: { options?: { id?: unknown } } } }).fiber?.entry
  const id = entry?.options?.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}
