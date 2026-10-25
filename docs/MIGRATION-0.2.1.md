# DSH 0.2.1-rc.3 兼容适配报告（阶段①：不兼容清单 + 改动说明）

本文件是「把 dsh-plugin-manager-companion 从 DSH 0.1.6-alpha.2 迁到 0.2.1-rc.3」这次改造的
**证据性记录**：先列清官方改了什么（按 版本声明 / 编译 / API / 运行期 四类），再逐条说明我们
改了什么、为什么这么改、以及**没有**改什么。

> 判定口径：每条都写「怎么确认的」。凡是没在真机/真产物上验过的，一律标 **仅读代码** 或
> **未验证**，不写成"已支持"。

---

## 0. 一句话结论

**兼容，且是源码级适配而非版本声明放行**：本插件在 DSH 0.2.1-rc.3 上
`dsh plugin --profile verify add <本地包>` 装得上、`dsh --profile verify` 起得来、
`/api2/companion/*` 全部可用、配置写入真的落到 profile 的 `cordis.patch.yml`、
客户端 bundle 被官方 web 前端按 `dsh-plugin-manager-companion/client.js` 正常下发。

官方兼容闸门（`@deepseek-ai/dsh-app-boot` 的 `evaluatePluginCompatibility`）对我们的判定是
**放行**，依据是 `engines.dsh = "^0.2.1-rc.3"`——这个字段是这次**改写**的（原来写的是
`^0.1.6-alpha.2`），不是为了过闸门而放宽。

---

## 1. 版本声明类不兼容（装不上，最先撞到）

| # | 症状 | 根因（官方口径） | 我们的处置 | 确认方式 |
|---|---|---|---|---|
| V1 | `dsh: installation rejected: Plugin dsh-plugin-manager-companion@0.1.4 is incompatible with dsh 0.2.1-rc.3: requirements {"@deepseek-ai/dsh-tools":"^0.1.6-alpha.2",…}` | `unmetRequirements()`：**只要**插件声明了 `engines.dsh`，就只按它判；否则逐个校验每个 `@deepseek-ai/dsh*` peer 是否满足运行时版本。原包 `engines.dsh` 是 `^0.1.6-alpha.2`，直接不满足 | `engines.dsh` 改为 `^0.2.1-rc.3`；全部官方 peer 精确钉到 `0.2.1-rc.3`（`dsh-app-boot` / `dsh-atomic-write` / `dsh-host-plugin-inventory` / `dsh-plugin-manager` / `dsh-tools`），`cordis ~4.0.5`、`schemastery ~3.18.5`、`js-yaml ^4.3.1` | 原始失败日志 `.plugin-manager/logs/operation-*/pnpm.log`；适配后 `evaluatePluginCompatibility(manifest)` 返回 `undefined`（放行） |
| V2 | 旧 `package.json` 的 `dsh.client.inject` 里含 `@deepseek-ai/dsh-client-ui-renderer` 等**已不存在**的客户端包 | 0.2.1 的客户端平台表只有 11 项（见 C1） | 保留 `inject` 列表（官方只把它当声明，不校验存在性），但客户端代码不再 import 任何不在平台表内的模块 | 产物 `dist/client.js` 的 `require(...)` 只有 4 个说明符，全在平台表内 |

---

## 2. 编译类不兼容（`tsc` 直接报错）

| # | 报错 | 官方变化 | 我们的处置 |
|---|---|---|---|
| C1 | 平台模块表从 9 项变 11 项 | 0.2.1 的 `PLATFORM_MODULES` 新增 `zod` 与 `@tanstack/react-virtual` | `tsdown.client.config.ts` 的 `PLATFORM` 同步为 11 项（逐字对齐 `dsh-web-frontend` 的 seed 工厂 `OZ()`） |
| C2 | `Property 'patchPath' does not exist on type 'ProfileLayer'` | `ProfileLayer.patchPath` → `patchPaths: readonly string[]`（一个 bundle 可声明多个 patch 文件） | `src/diagnostics.ts` 改为按文件逐条展开成 layer 记录；`profile.patchPath`（profile 自己的用户层）仍是单值，保留 |
| C3 | `Property 'healProfilesModuleFallback' does not exist` | 官方删除了 `healProfilesModuleFallback` / `healIsolatedProfileModuleFallback` / `unlinkProfileModuleFallback` / `createProfileResolutionGeneration` | `src/moduleFallback.ts` 改用 `createRuntimeResolution({ installAnchor, home })`（只读、不写盘，返回 `entries[].name`），语义等价 |
| C4 | 图标导出改名（`IconChevronDownOutline14`、`IconDownloadOutline16`、`IconRefreshOutline14` … 共 13 个） | `@deepseek-ai/dsh-client-ui-primitives` 改成 `<Icon><Weight>` 命名（尺寸烘进 artwork：Chevron 14 / Refresh 16 / Globe 14 / Info 14 …） | 13 处统一映射到 `…Regular`（与官方自身 10:0、13:0 的用法一致），未改视觉 |
| C5 | `Property 'commandLine' is missing in type TerminalBlockLabels` | 0.2.1 的 `TerminalBlockLabels` 新增 `commandLine: (line: number) => string` | `ConsolePage.tsx` 补该成员，字典新增 `trace.commandLine`（zh/en 各一条） |
| C6 | `Property 'settingsScope' does not exist` / `SettingsScope` 无导出 | 客户端配置通道整体换成 `ctx.configForms`（见 A5） | `src/client/index.ts` 的 `inject` 改为 `['slots','locale','configForms']`；`ConfigController` 改收 `ConfigForm<T>`；`shared.ts` 不再 import `SettingsScope` |

---

## 3. API 类不兼容（编译能过但语义变了 / 类型对不上）

### A1. 配置模型：`SettingsProvider.register(ns, schema)` → 插件 `Config` + `SettingsForms`

- **官方**：0.2.1 的 `ctx.settings` 是 `SettingsForms`，配置按 **profile 条目 id** 寻址
  （`describe().ns === entry.options.id`），写入走 `settings.update(entryId, patch)`；
  没有 `register()`，也没有"命名空间冲突"这件事。
- **我们原来**：`registerConfig(ctx)` 里 `settings.register('plugin-manager-companion', ConfigSchema)`，
  冲突时降级为只读并报 `namespace-conflict`。
- **改成**：`src/settings.ts` 导出 `ConfigSchema = z.object({...}).volatile()`，`src/index.ts`
  额外 `export { ConfigSchema as Config }`（**这是 Loader 契约名，不能改名**：Loader 读
  `plugin.Config` 做校验，官方 `SettingsForms.schema(entry)` 也从 `fiber.runtime.Config` 取它；
  缺了它 → 配置不校验，且 `describe()` 里根本没有本插件条目，设置页看不到任何字段）。
  `registerConfig(ctx, runtimeConfig?)` 现在做**绑定**：读走 `apply(ctx, config)` 交进来的
  volatile 引用（没有则退回 `describe()`），写走 `settings.update(entryId, patch)`。
- **降级面重写**：`settings-missing` / `no-profile-entry` / `settings-read-only`（`namespace-conflict`
  这一档随 API 一起消失）。降级时返回**只读**句柄（写入抛错，不静默丢写），事实仍进
  `capabilities.missing`。
- **为什么根节点是 `.volatile()`**：非 volatile 的配置变更会让 Loader 卸载再装配整个插件
  （`Entry.update` 的 `volatileOnly` 判据），而本插件的配置被路由、agent 工具、诊断、市场、
  升级引擎长期持有。volatile 下官方把新值提交进 `Volatile` 引用并发 `loader/volatile-update`，
  插件不重挂载。
- **确认**：真机 `setConfig` 返回 200，profile 的 `cordis.patch.yml` 里真的多出
  `config.marketplace.enabled: false`；`capabilities` 显示 `writable` 正常。

### A2. `PluginManager.inspect(spec, signal?)` → `inspect(spec, options?, signal?)`

- 我们只传 `spec`，`options` 省略即"用默认"；签名向后兼容，未改调用点。
- `ManagementError.code` 新增 `already-installed` / `incompatible-version`（带 `incompatible: IncompatiblePlugin[]`）：
  `gatedInstall` 的错误分支按 code 透传，未枚举枚举值，因此不需要改；文案里没有把新 code 说成别的东西。

### A3. `BundleInfo` 新增 `official` / `availability` / `installTarget` / `meta` / `RestartReason`

- 我们的 `BundleLedger` 是**结构式**只读面（只取 `name` + `installed`），新增字段不影响；
  也没有把 `availability` 当"已装"来判。

### A4. `agentPresetRegistry` 不再扫描目录（`roots` / `remove` 都没了）

- 0.2.1 的 `agentPresets` 只有 `list` / `remoteExportList` / `read` / `select` / `register` /
  `inspectCompositions`；预设**只来自声明式 `@deepseek-ai/dsh-agent-preset` 行**（Loader 树里
  一行一个 preset，`config: { id, plugins }`）。
- 我们的 `src/presets.ts` 用 `agentPresetsOf()` 做结构式探测（`list` + `remove` 都在才用服务），
  0.2.1 上**自动降级为直删目录 + 一条明确 note**（"without the host agentPresets service; …"）。
  这是**已知降级**，不是 bug：官方不再提供 `remove`，直删目录仍是正确结果（用户预设目录
  `<dshHome>/.agent-presets` 归我们管），只是无法顺手清 `settings.default`。
- 技能不受影响：官方 `dsh-skill-filesystem` 仍扫 `<dshHome>/skills`（与 `skillsRoot()` 同源）。

### A5. 客户端配置：`settingsScope.bind({namespace})` → `configForms.get(entryId)`

- `ConfigForm<T>` 契约：`getSnapshot()` / `subscribe()` / `mutate(ops, revision?)`；
  `mutate` 返回 **boolean**（Host 接受 = true，拒绝 = false，传输失败才 reject）。
- 我们据此改 `ConfigController`：`snapshot.value` 仍是配置值，`writable` 仍是可写性；
  **`mutate` 返回 false 必须落到 `failed`**——把 false 当成功会让"改了但没保存"看起来像保存了。
- 条目 id 用包名 `dsh-plugin-manager-companion`（= `cordis.patch.yml` 行 id），与字典命名空间
  `plugin-manager-companion` **不是同一个字符串**，因此导出两个常量：`SETTINGS_ENTRY_ID` 与
  `SETTINGS_NAMESPACE`。

### A6. 启动阻断根因：`loadProfileDirectory` 不再抛错，改为 `skippedBundles`

- 0.2.1 的 `loadProfileDirectory` 对解析不到 / 不兼容的 bundle **跳过并记进 `skippedBundles`**
  （`{ packageName, reason }`），profile 照常起；旧版是直接抛。
- 后果：原来"从异常文本解析启动阻断根因"的路径**永远走不到**（静默丢掉一整类诊断）。
- 改成：从 `profile.skippedBundles` 读，逐条变成一等公民 issue（三要素、可复制操作），
  并新增 `incompatible-bundle`（官方新增的第三种跳过原因：`Plugin … is incompatible with dsh …`）。
  另加一条 `composition-skipped-bundles` skip 记录"官方跳过了哪些 bundle"（含原始 reason）。

### A7. `ToolPresentationMode` 去掉 `'both'`；`ToolDefinition` 新增 `projectContent?`

- 我们的工具注册（`plugin_search` / `plugin_health`）没有用 `presentation`，也没有实现
  `projectContent`；0.2.1 里两者都是可选的，因此无需改。

### A8. `tools.guard(guard: (exec) => string | undefined)`

- 签名未变，`src/guard.ts` 原样工作（有 `index.test.mjs` 的守卫用例覆盖）。

---

## 4. 运行期类不兼容（编译过、装得上，但行为不对）

### R1. Windows 上"链接"其实是 junction（**0.1.6 时代就存在的缺陷，这次一并修**）

| 判据 | 符号链接 | junction |
|---|---|---|
| `lstat().isSymbolicLink()` | true | **false**（看起来就是目录） |
| `readlinkSync()` | 目标 | 抛 `EINVAL` |
| `realpathSync()`（JS） | 解析到目标 | **返回链接自身** |
| `realpathSync.native()` | 解析到目标 | 解析到目标 |
| 删除 | `unlinkSync` | `unlinkSync` 抛 `EPERM`；`rmdirSync` 可删且不动目标内容 |

- 旧代码一律只判 `isSymbolicLink()`：桌面版上"路径安装的残留"看不见、清理动作一条也不动、
  诊断里断链恒为 0。
- 新增 `src/links.ts`（`linkKindOf` / `linkTargetOf` / `removeLink`），`moduleFallback.ts` 与
  `index.ts` 的残留判定改用它。判据保守（宁可少认不可误删）：只有 native realpath 与 JS
  realpath 不一致的目录才认作 junction。
- **确认**：本机 `fs.symlinkSync(target, link, 'junction')` 成功、`isSymbolicLink()` 为 false、
  `rmdirSync` 能删而目标内容完好——三条都实测过。

### R2. 进程表可读性变成了"平台能力"（影响 4 个 op 的判定分支）

- 本机（Windows + 受限执行环境）实测：`Get-CimInstance Win32_Process` 返回 **Access denied**，
  管道 `spawnSync` 直接 `EPERM`。于是"进程事实不可读 → 拒绝破坏性操作"这条纪律会**正确但必然**
  触发，`rename` / `remove` / `stop` / `trialRemove` / 金丝雀清理全部走不了。
- 这不是 0.2.1 引入的，而是**环境限制**；但它决定了"哪些功能在这台机器上可验证"。
- 处置：给这些操作加**注入缝**（`CurrentEnvironmentOptions.facts`、`StopEnvironmentOptions.facts`、
  `OpDependencies.processFacts`、`UpgradeEngineDeps.processFacts`），生产路径不变，
  测试可以注入"可读且无实例"的事实来验证**判定逻辑本身**。

### R3. 配置写入必须经过官方 `configEditor`，且要求 profile 有 root Include

- `settings.update()` → `configEditor.edit()` → `reconcileProfilePatches()`；后者要求
  `bootstrapIncludes` 里存在 root Include 条目，否则抛
  `dsh: profile reload requires the root Include entry`。
- **实测教训**：隔离验证第一次启动时，我把 `@deepseek-ai/dsh-base` 装进了 profile 的
  `node_modules`，导致 Loader 从 profile 解析到**另一份** `dsh-app-boot`，
  `bootstrapIncludes` 是另一张 WeakMap → 写入报上面那条错。把 profile 的依赖清空
  （让所有官方包只由安装锚点提供，与真实 `desktop` profile 同形）后，写入正常。
  这是**隔离环境搭建方式**的坑，不是插件缺陷；记在这里免得下次重复踩。

---

## 5. 我们**没有**改的东西（明确边界）

- 没有用 `allow-version --accept-risk` 或任何版本豁免；兼容判定靠真实 `engines.dsh`。
- 没有改 DSH 安装目录（`G:\Software\DeepSeek Harness\…`）里的任何文件。
- 没有改真实 `desktop` profile（`C:\Users\maple\.dsh\profiles\desktop`）：只读过它的
  `package.json` 用来对照形态。
- 没有删测试、没有关 `strict`、没有把异常吞掉；每处降级都带稳定原因码 + 用户可见文案。
- 没有重新打包或覆盖官方组件；客户端 bundle 只通过官方 `__ModuleLoader__.load` 注册自身。

---

## 6. 仍然存在的已知差异 / 未验证项

| # | 项 | 现状 | 影响 |
|---|---|---|---|
| K1 | 预设删除不再经官方服务 | 0.2.1 无 `agentPresets.remove`，降级为直删 + note | 无法顺手清 `settings.default`；用户需在预设设置页自查（note 已写明） |
| K2 | 预设"安装"仍只写目录 | 0.2.1 的预设必须由 `@deepseek-ai/dsh-agent-preset` 行声明才会被 registry 看见；我们没有自动往 profile 插行 | 装完目录后需要在 profile 里加一行才会出现在选择器里（属于"改用户的 profile"，按约定不自动做） |
| K3 | 进程相关能力在本机无法端到端验证 | 进程表不可读（R2） | `stop` / `rename` / `remove` 的**判定逻辑**由注入用例覆盖；真起进程那条路径在有进程表的机器上才会执行 |
| K4 | 符号链接夹具 | 本机 `EPERM`（无 SeCreateSymbolicLinkPrivilege） | 依赖符号链接的 22 条用例在支持链接的平台上跑，本机如实跳过并写明理由 |
| K5 | 子进程管道 | 本机 `spawn EPERM` | `cli` 的 bin 入口判据、`dsh-home-guard` 的脚本用例同样跳过并写明理由 |

> 跳过不等于通过：`node tools/run-tests.mjs` 的汇总里"失败 0"指的是**没有失败**；
> 每个被跳过的用例都在报告里带原因字符串（`--test` 的 `skip` 字段），可以逐条核对。

---

## 7. 验证记录（可复核）

### 7.1 静态与单元

| 项 | 命令 | 结果 |
|---|---|---|
| Host 类型 | `node node_modules/typescript/bin/tsc -p tsconfig.host.json --noEmit` | exit 0 |
| Client 类型 | `node node_modules/typescript/bin/tsc -p tsconfig.client.json --noEmit` | exit 0 |
| 构建 | `node tools/build.mjs` | `dist/`（59 个文件 + `dist/client/` 11 个）+ `dist/client.js`（408 kB） |
| 单测 | `node tools/run-tests.mjs` | **33 个文件，失败 0**（含新增 `tests/compat-0.2.1.test.mjs` 的 13 条） |

### 7.2 真机（官方桌面版 CLI + 一次性 HOME）

用**官方** `dsh` 垫片（`G:\Software\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`，
版本 0.2.1-rc.3）在 `$env:TEMP` 下的独立 `DSH_HOME` 里做完整生命周期，真实 `.dsh` 全程未被读写：

| 步骤 | 命令 | 结果 |
|---|---|---|
| 建 profile | 手写 `package.json`（bundles = base + web-app，dependencies 为空，与真实 desktop 同形） | `--dump-config` 通过 |
| 安装 | `dsh plugin --profile verify add "file:<tgz>" --ignore-scripts` | exit 0；manifest 的 `dsh.profile.bundles` 自动追加本包 |
| 组合树 | `dsh --profile verify --dump-config` | 出现 `# == dsh-plugin-manager-companion` + 该行 |
| 启动 | `dsh --profile verify --no-open` | 打印 `http://127.0.0.1:3080/?token=…` |
| 客户端下发 | 取页面里的合并 bundle URL | 含 `window.__ModuleLoader__.load({ id: "dsh-plugin-manager-companion", … })`，只 require 平台表内 4 个模块 |
| 能力 | `POST /api2/companion/capabilities` | `{"profileBacked":true,"manager":true,"inventory":true,"environmentName":"verify","missing":[]}` |
| 读配置 | `POST /api2/companion/getConfig` | 完整默认配置（含 `reportStaleModuleFallbackLinks`） |
| 写配置 | `POST /api2/companion/setConfig` | 200；profile 的 `cordis.patch.yml` 真的多出 `config:` 段 |
| 诊断 | `POST /api2/companion/diagnose` + `job` 轮询 | 0 issue；2 条 skip（兜底目录不存在 / 生态层关闭） |
| 市场 | `POST /api2/companion/marketplace` | 20156 条，`source=network:api` |
| 其它 | `listEnvironments` / `environmentTemplates` / `listKinds` / `trialEnvironments` / `about` | 全部 `ok:true` |
| 卸载 | `dsh plugin --profile verify remove dsh-plugin-manager-companion` | exit 0；bundles 里该行消失；重启后页面不再引用本插件、`/api2/companion/*` 不再存在 |

> 卸载后 profile 的 `cordis.patch.yml` 会留下一条 `- id: dsh-plugin-manager-companion` 行
> （官方 configEditor 写的），官方会告警 `entry "dsh-plugin-manager-companion" not found`。
> 这是官方配置文档的正常残留，不是本插件写坏的；`docs/INSTALL-LOCAL.md` 第 4 节写了怎么清。

### 7.3 没有做的事（复核用）

- 没有运行 `allow-version` / 任何版本豁免命令。
- 没有对真实 `desktop` profile 做写操作（只读过 `package.json` 对照形态）。
- 没有修改 `G:\Software\DeepSeek Harness\…` 下任何文件（只读 asar 做 API 比对）。
