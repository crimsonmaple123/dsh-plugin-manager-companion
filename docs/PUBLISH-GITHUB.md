# 发布到 GitHub 的具体指南

面向这个仓库本身（`dsh-plugin-manager-companion` v0.2.0）。目标：把当前目录发布成
GitHub 上的一个可维护仓库，并给出「改完代码 → 发版 → 别人能装」的完整闭环。

> 本指南**不包含**任何"我已经替你推送"的动作：推送会写你的 GitHub 账号，属于需要你本人授权的操作。
> 下面每条命令都可以直接复制执行；执行前请确认 `git config` 里的身份是对的。

---

## 0. 先确认三件事（已替你核对过，2026-10-25）

| 项 | 现状 | 影响 |
|---|---|---|
| 目标仓库 `LX2000WASD/dsh-plugin-manager-companion` | **已存在**，默认分支 `master`，公开，MIT，已有 tag `v0.1.4` 与一个 release | 不能 `git init` 后随便推，要**基于已有历史**或**强推**（见 §2 的两条路） |
| npm 上的 `dsh-plugin-manager-companion` | 已发布 `0.1.4`（2026-09-20），`latest = 0.1.4` | 你的 `0.2.0` 是**新版本**，可以正常 `npm publish`；不会被占名 |
| 本机 git | `git 2.53.0`，`user.name = crimsonmaple123`，`user.email = crimsonmaple123@gmail.com` | 直接可提交；**注意**：这个身份与仓库 owner（`LX2000WASD`）不同，见 §2.1 的提醒 |
| `gh` CLI | **未安装** | 下面用纯 `git` + 网页操作；想用 `gh` 就先装 |

还有一条与发布直接相关的：**当前目录还没有 `.git`**（我核对时建过一个空仓库又删掉了，见 §9）。
所以你要么先 clone 现有仓库再覆盖文件，要么按 §2.2 走"新历史 + 强推"。

---

## 1. 发布前的三处内容核对

这三处是**内容问题**，与 git 无关，但会直接影响别人照 README 装不上。§1.1 已替你改好，
§1.2 需要你决定，§1.3 已核对无需改。

### 1.1 README 里的 DSH 版本要求（**已替你改好**）

原来 `README.md` / `README.en.md` 写的是「要求 DSH >= 0.1.6-alpha.2」，而
`package.json` 的 `engines.dsh` 已经是 `^0.2.1-rc.3` —— 官方兼容闸门会**拒绝**在 0.1.6 上安装，
照着旧 README 装的人会撞一条看不懂的 `incompatible with dsh` 报错。

已改成：

| 文件 | 现在写的 |
|---|---|
| `README.md`（安装节） | 要求 DSH **0.2.1-rc.3**（`engines.dsh = "^0.2.1-rc.3"`；更早的版本会被官方兼容闸门拒绝安装） |
| `README.md`（已知限制） | 只支持 DSH **0.2.1-rc.3**；更早的版本请用旧仓库的 0.6.x，或本仓库的 0.1.x 线 |
| `README.en.md`（同上两处） | 对应的英文 |
| `docs/DEVELOPMENT.md` §1 | 一个可用的 DSH 安装，**0.2.1-rc.3**（`engines.dsh` 就是这个范围） |

> 两个 README 的第 9 行那句「DSH 0.1.6-alpha.2 起官方自带插件管理页」**保留不改**——
> 它讲的是这个仓库为什么重写，是历史事实，不是版本要求。

### 1.2 `package.json` 的 `repository.url` 与 owner 不一致

现在写的是 `https://github.com/LX2000WASD/dsh-plugin-manager-companion.git`。
如果你要用**自己的账号**（`crimsonmaple123`）发布，就把这里、README 里的徽章链接、
以及 `docs/` 里出现的仓库地址一起换成新地址；否则 GitHub 上的 "repository" 会指向别人的仓库。

### 1.3 版本号

`package.json` 是 `0.2.0`，npm 上最新是 `0.1.4` —— 这是**正确**的（0.2.0 > 0.1.4）。
不需要改；只需要在发版时打对应的 tag（§4）。

---

## 2. 把目录变成仓库并推上去（两条路，选一条）

### 2.1 路线 A（推荐）：clone 现有仓库，用新内容覆盖，保留历史

好处：`v0.1.4` 的历史与 release 都留着，别人能看出 0.1.4 → 0.2.0 的演进。

```powershell
# 1) 在别处 clone（不要在项目目录里 init，避免历史对不上）
$work = 'D:\Desktop\project\Software Tool Adaptation\_publish'
git clone https://github.com/LX2000WASD/dsh-plugin-manager-companion.git $work
Set-Location $work

# 2) 用新版内容覆盖（保留 .git！所以不能用 robocopy /MIR 整个目录）
$src = 'D:\Desktop\project\Software Tool Adaptation\p-dsh-plugin-manager-companion-0.2.1\dsh-plugin-manager-companion-0.2.1'
robocopy $src $work /E /XD node_modules dist .git /XF *.log
# robocopy 退出码 0-7 都算成功（>=8 才是错误）

# 3) 看看 git 认为变了什么
git status --short
git diff --stat
```

> **身份提醒**：`git config user.email` 现在是 `crimsonmaple123@gmail.com`。
> 如果这个邮箱没有加到你 GitHub 账号里，提交会显示"未关联作者"，也不会算进贡献图。
> 想让提交归属到 `LX2000WASD`，就先在那个账号里加这个邮箱，或改成该账号的邮箱：
> `git config user.email '<你的 GitHub 邮箱>'`。

### 2.2 路线 B：新历史 + 强推（当前目录直接 init）

好处：一步到位，不用 clone。代价：**丢掉 v0.1.4 的历史**（tag 和 release 还在，但 commit 历史没了）。

```powershell
$src = 'D:\Desktop\project\Software Tool Adaptation\p-dsh-plugin-manager-companion-0.2.1\dsh-plugin-manager-companion-0.2.1'
Set-Location $src
git init
git add -A
git commit -m "feat: adapt to DSH 0.2.1-rc.3 (source-level migration)"
git branch -M master
git remote add origin https://github.com/LX2000WASD/dsh-plugin-manager-companion.git
# 只有在你确认要覆盖远端历史时才执行下一行
git push --force-with-lease origin master
```

`--force-with-lease` 比 `--force` 安全：如果远端在这期间被别人推过，它会拒绝而不是覆盖。

---

## 3. 提交前自检（我这边已验证过的项，建议你重跑一遍）

```powershell
$src = 'D:\Desktop\project\Software Tool Adaptation\p-dsh-plugin-manager-companion-0.2.1\dsh-plugin-manager-companion-0.2.1'
Set-Location $src

node tools/build.mjs                    # host + client 构建（应为 exit 0）
node node_modules/typescript/bin/tsc -p tsconfig.host.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.client.json --noEmit
node tools/run-tests.mjs                # 33 个测试文件，失败 0
```

我这次在**搬迁后的新目录**里重跑过：构建 `done`、两个 tsc 均 exit 0、测试 `文件 33 个，失败 0 个`。

> 为什么不用 `pnpm test`：本机 `pnpm` 不在 PATH（桌面版自带但没进环境变量），
> 而 `pnpm test` 内部又调 `pnpm run build`，会二次失败。`tools/build.mjs` 与
> `tools/run-tests.mjs` 是刻意做成**不依赖 pnpm 转发**的跨平台入口。

---

## 4. 打 tag 与发 GitHub Release

```powershell
Set-Location $src
git tag -a v0.2.0 -m "v0.2.0: DSH 0.2.1-rc.3 compatibility"
git push origin master --follow-tags     # 或 git push origin v0.2.0
```

然后在网页上：**Releases → Draft a new release → 选 `v0.2.0`**，正文建议直接贴
`docs/MIGRATION-0.2.1.md` 的「0. 一句话结论」+「6. 仍然存在的已知差异」两节，
并附上本地构建产物 `dsh-plugin-manager-companion-0.2.0.tgz`（在
`p-dsh-plugin-manager-companion-0.2.1\release\`，sha256
`020f7fbfdc1be44548037cf91125ffe35a4a943c904ae5ed54b3153f92a99f75`）。

> 为什么要把 tgz 挂到 Release：`dsh plugin add` 支持 `file:` 与 npm 名，也支持
> git/URL 形式的 spec。挂一个产物，别人不装 npm 也能直接装（`docs/INSTALL-LOCAL.md`）。

---

## 5. 发 npm（可选，但 README 里已经写了 `@latest`）

README 的安装命令是 `dsh plugin --profile <name> add dsh-plugin-manager-companion@latest`，
只有真的 `npm publish` 之后这条命令才指向 0.2.0。

```powershell
Set-Location $src
npm login                      # 用有该包发布权的账号
npm pack --dry-run             # 先看会发哪些文件（应为 81 个）
npm publish                    # 默认发到 latest
```

发布前确认（这三条会直接影响别人装得上装不上）：

1. `files` 里必须有 `dist`、`cordis.patch.yml`、`README.en.md`、`docs/MIGRATION-0.2.1.md`、
   `docs/INSTALL-LOCAL.md`、`docs/images/readme`（现在都有）。
2. `engines.dsh = "^0.2.1-rc.3"` 必须在包里（现在有）。
3. `dsh.bundle.patch` 与 `dsh.client.platform` 必须在包里（现在有）。

> npm 上的 0.1.4 没有 `engines` 字段，那是**旧包**；0.2.0 起才有兼容闸门信息。
> 另外注意：`0.2.1-rc.3` 这类**预发布版本号**如果要用 `npm dist-tag` 标 `next`，
> 不要覆盖 `latest`，否则所有 `@latest` 用户会被推到 rc 依赖上。

---

## 6. 仓库设置建议（网页上点几下）

| 设置 | 建议值 | 理由 |
|---|---|---|
| Default branch | `master`（保持现状） | 与现有 clone/文档一致；改名要同步 CI 与徽章 |
| Topics | `dsh`, `dsh-plugin`, `dsh-plugins`, `cordis`, `deepseek-harness` | 现有 3 个，补 `cordis`/`deepseek-harness` 更好被搜到 |
| Releases | 每个 tag 一个 release，正文贴迁移说明 | 用户看的是 release note，不是 commit |
| Issues | 开启（现在是开的） | 兼容性问题需要收集 |
| License | MIT（已有 `LICENSE`） | 与 `package.json` 的 `"license": "MIT"` 一致 |
| Branch protection | 可选：要求 PR + 状态检查通过 | 单人仓库可先不开 |

### 建议加一个 CI（当前仓库没有 `.github/`）

最小可用版本（不跑真机、只跑构建 + 单测）：

```yaml
# .github/workflows/ci.yml
name: ci
on:
  push:
    branches: [master]
  pull_request:
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: node tools/build.mjs
      - run: node tools/run-tests.mjs
```

> 注意两点，否则 CI 一上来就红：
> 1. 仓库 `pnpm-workspace.yaml` 里有 `minimumReleaseAge: 0`、`nodeLinker: hoisted`、
>    `autoInstallPeers: false` —— 这些是**有意**的（见文件里的注释），不要"顺手优化"掉。
> 2. 有一批用例依赖平台能力（符号链接 / 子进程管道 / 进程表）。它们会在 Linux CI 上
>    正常执行（Linux 允许建符号链接、能读 `/proc`），所以**不要在 CI 里放宽它们**；
>    真要放宽，只能按 `tests/platform-support.mjs` 的既有方式如实 skip。

---

## 7. 发布后验证（别只看 CI 绿）

在一台**干净的机器**（或临时 `DSH_HOME`）上按 `docs/INSTALL-LOCAL.md` 走一遍：

```powershell
$env:DSH_HOME = Join-Path $env:TEMP ('dsh-pub-' + [guid]::NewGuid().ToString('N'))
dsh plugin --profile verify add dsh-plugin-manager-companion@latest
dsh --profile verify --no-open
```

页面里应出现四个设置入口，`/api2/companion/capabilities` 应返回
`{"profileBacked":true,"manager":true,"inventory":true,"missing":[]}`。

---

## 8. 这个项目每个文件夹大致放了什么

顶层（`p-dsh-plugin-manager-companion-0.2.1\`）是**工作区**，真正的仓库在
`dsh-plugin-manager-companion-0.2.1\` 子目录里。

### 8.1 工作区（不要提交这些）

| 路径 | 内容 | 要不要进 git |
|---|---|---|
| `dsh-plugin-manager-companion-0.2.1\` | **仓库本体**（见 §8.2） | ✅ 全部（除 `dist/`、`node_modules/`） |
| `dsh-plugin-manager-companion-master\` | 上游 0.1.4 的原始快照（128 个文件），用来对照"改了什么" | ❌ 只在本地对照 |
| `.work\` | 我这次迁移的取证目录：解包出的官方 asar 包、pnpm 包对照、一次性 HOME、探针脚本、命令输出 | ❌ 纯本地 |
| `.pnpm-store\` | pnpm 内容寻址存储（479 MB） | ❌ |
| `release\` | 构建产物 `dsh-plugin-manager-companion-0.2.0.tgz`（825 KB） | ❌ 传 GitHub Release，不进 git |
| `.pkgtmp\` | 打包临时目录（现在是空的） | ❌ |

### 8.2 仓库本体 `dsh-plugin-manager-companion-0.2.1\`

```
dsh-plugin-manager-companion-0.2.1\
├─ src\                  Host 侧 29 个 .ts 模块（插件主体）
│   └─ client\           客户端 18 个文件（React 页面 + 字典 + 契约）
├─ tests\                49 个文件：33 个 *.test.mjs + 16 个取证/夹具模块
├─ tools\                14 个脚本：构建、跑测试、真机 e2e、CDP 截图取证
├─ docs\                 8 份文档 + docs\images\readme\ 4 张 README 截图
├─ dist\                 构建产物（.gitignore 里，不进 git；npm 包靠 files 白名单带上）
├─ node_modules\         依赖（不进 git）
├─ package.json          包清单：engines.dsh / dsh.bundle / dsh.client / peerDependencies
├─ cordis.patch.yml      组合包补丁层：往 profile 插一行本插件
├─ pnpm-lock.yaml        lockfile（进 git，保证可复现）
├─ pnpm-workspace.yaml   pnpm 11 配置：hoisted + 不自动装 peer + 关最小发布年龄
├─ tsconfig*.json        三份 TS 配置（根 / host / client）
├─ tsdown.client.config.ts  客户端打包配置（含官方 11 项平台模块表）
├─ README.md / README.en.md 中英文说明（截图、能力、安装、已知限制）
├─ LICENSE               MIT
└─ .gitignore / .gitattributes  忽略 dist/node_modules；强制 LF 行尾
```

#### `src\` —— Host 侧（跑在 Node 里）

| 文件 | 职责 |
|---|---|
| `index.ts` | 插件入口：装配、29 个 REST op 的分派、agent 工具注册、配置绑定 |
| `settings.ts` | 插件配置：`ConfigSchema`（volatile）、`ConfigHandle`、降级状态 |
| `rest.ts` | 自有 REST 的骨架：信封、鉴权、body 限制、job 注册表 |
| `official.ts` | 官方能力探测（`pluginManager` / `pluginInventory` / `profileContext`） |
| `paths.ts` | DSH home / profile 路径、manifest 读取、安全名校验、全局互斥队列 |
| `links.ts` | **新增**：符号链接 vs Windows junction 的判据与删除 |
| `qualityGate.ts` | 安装前静态检查（未声明 import、声明未装、官方包被声明成普通依赖） |
| `guard.ts` | 安装守卫：拦 agent 的工具调用 |
| `installSession.ts` | 受质量门保护的安装流程 |
| `diagnostics.ts` | 五层诊断引擎（依赖/组合/运行时/一致性/生态） |
| `fix.ts` | 诊断发现的处置动作 |
| `envManager.ts` | 环境生命周期：启动/停止/新建/重命名/删除、跨环境复制、备份、试装引擎 |
| `moduleFallback.ts` | 依赖兜底目录的断链/过时诊断与清理 |
| `kinds.ts` | 技能与预设的安装/卸载/孤儿扫描 |
| `presets.ts` | 预设归属标记、归档/恢复/清理 |
| `marketplace.ts` / `registry.ts` / `rank.ts` / `match.ts` / `tags.ts` / `marketView.ts` | 市场索引抓取、缓存、排序、匹配、标签、视图映射 |
| `upgrade.ts` / `upgradeView.ts` | 升级检查、金丝雀验证、升级/回滚、结果视图 |
| `about.ts` | 「关于」页要的运行时/安装/文件事实 |
| `scan.ts` | 仓库扫描（检测 SKILL.md / agent.cordis.yml / 插件包） |
| `net.ts` | 抓取与代理 |
| `types.ts` | 全量类型定义 |
| `cli.ts` | `dshpmc` 命令行入口（与界面等价的能力） |

#### `src\client\` —— 客户端（跑在浏览器里）

| 文件 | 职责 |
|---|---|
| `index.ts` | 客户端入口：`inject = ['slots','locale','configForms']`，注册 4 个 `settings.section` + 官方 `plugins.*` 槽位 |
| `shared.ts` | 控制器层：REST 调用、状态 store、`ConfigController` 等 |
| `wire.ts` | 与 host 的数据契约（信封、op 名、类型镜像） |
| `locales.ts` | 中英字典（唯一的用户可见文案源） |
| `ConsolePage.tsx` | 环境控制台：体检 / 环境 / 设置三个子页 |
| `MarketplacePage.tsx` | 插件市场 |
| `KindsPage.tsx` | 技能与预设 |
| `AboutPage.tsx` | 关于（运行时/实验包/本插件版本、软件升级） |
| `OfficialSlots.tsx` | 注册进官方插件页的卡片与配置节 |
| `UpgradeRow.tsx` | 官方插件页里按包名注册的升级行 |
| `pmSelect.tsx` | 通用下拉控件 |
| `*.module.css` | 各页样式（CSS Modules，构建时内联进 bundle） |
| `css-modules.d.ts` | CSS Modules 的类型声明 |

#### `tests\` —— 单元测试与取证夹具

- **33 个 `*.test.mjs`**：按模块归口，全部 `import '../dist/*.js'`（**测的是产物，不是源码**）。
- `client-harness.mjs`：客户端 bundle 的模拟模块表（越表 require 会立刻抛）。
- `platform-support.mjs`：平台能力探测（符号链接 / 子进程管道 / 进程表），造不出夹具就如实 skip。
- `*-evidence.mjs`：真机取证脚本，不算单测。
- `compat-0.2.1.test.mjs`：**新增**，钉住 0.2.1 的接口契约（`Config` 导出、条目 id 寻址、
  junction 判据、`skippedBundles` 通道、平台表 11 项）。

#### `tools\` —— 脚本

| 文件 | 用途 |
|---|---|
| `build.mjs` | **新增**：跨平台构建（不依赖 pnpm 转发） |
| `run-tests.mjs` | 跨平台测试入口（逐文件跑 `node --test`，找不到文件就报错） |
| `e2e-lifecycle.mjs` / `.sh` | 真机走「建环境 → 启动 → 可达 → 停止」 |
| `e2e-visual.mjs` / `.sh` | 真浏览器跑三个页面 + 官方插件页内注册 |
| `cdp-shot.mjs` / `shot-assert.mjs` / `visual-audit.mjs` / `dirty-ui-audit.mjs` | CDP 截图与视觉断言 |
| `dirty-profile.mjs` / `dsh-home-guard.mjs` | 脏环境复现；「不许默认写真实 HOME」守卫 |
| `probe-settings.mjs` / `upgrade-realdevice.mjs` | 真机探针 |

#### `docs\`

| 文件 | 内容 |
|---|---|
| `DESIGN.md` | 设计说明（能力边界、交互模型、文案标准 §12） |
| `CODE-POLICY.md` | 工程纪律（测试纪律、降级纪律、文案纪律） |
| `DEVELOPMENT.md` | 开发指南（怎么跑、改一处要验什么、代码在哪） |
| `REST-CONTRACT.md` | 自有 REST 契约（op 名、信封、错误码、客户端约束） |
| `OFFICIAL-DEPENDENCIES.md` | 官方依赖清单与升级检查单（"官方改了先看哪一行"） |
| `MIGRATION-0.2.1.md` | **新增**：0.2.1 迁移报告（不兼容清单 + 改动 + 未验证项 + 验证记录） |
| `INSTALL-LOCAL.md` | **新增**：本地安装/卸载（PowerShell） |
| `PUBLISH-GITHUB.md` | **新增**：发布到 GitHub 的指南 + 目录说明（本文件） |
| `images\readme\` | README 用的 4 张截图 |

---

## 9. 两个坑，先说清

1. **`dist\` 不进 git，但 npm 包必须有 `dist\`**。这是靠 `package.json` 的 `files`
   白名单实现的：`.gitignore` 忽略它，`npm pack` 却会把 `files` 里列的目录打进去。
   所以**发布前一定要先 `node tools/build.mjs`**，否则发出去的包是空的（或者更糟：
   发的是上一次构建的旧产物）。`npm publish` 前跑一次 `npm pack --dry-run` 看一眼文件数。

2. **`.work\` 与 `release\` 在仓库之外**。它们在工作区根，不在 `dsh-plugin-manager-companion-0.2.1\`
   里面，所以不会被误提交——但这也意味着你 `cd` 进仓库后看不到它们。
   `release\*.tgz` 是用来上传到 GitHub Release 的，不是用来提交的。

另外：我核对时在仓库目录里建过一个**空的** `.git`（为了 dry-run 看 `.gitignore` 是否生效），
确认无 commit、无 object 后已删除。现在该目录**没有** `.git`，按 §2 从头做即可。
