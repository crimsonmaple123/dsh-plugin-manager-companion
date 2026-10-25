# 本地安装 / 卸载（Windows PowerShell）

本文件给的是**从本地目录安装**这一条路：不发布 npm、不改 DSH 安装目录、不动官方运行时。
装的是这个仓库自己构建出来的产物（`dist/` + `cordis.patch.yml` + `package.json`）。

---

## 0. 先决条件

- DSH 桌面版 **0.2.1-rc.3**（本包 `engines.dsh = "^0.2.1-rc.3"`，其它版本会被官方兼容闸门拒绝）。
- 目标 profile 已存在（下面示例用 `verify`；**不要**在没确认前拿 `desktop` 试）。
- 本仓库已构建：`node tools/build.mjs`（会产出 `dist/` 与 `dist/client.js`）。

安装命令里出现的两个路径按需替换：

| 变量 | 含义 | 示例 |
|---|---|---|
| `$pkg` | 本仓库根（含 `package.json`） | `D:\Desktop\project\Software Tool Adaptation\p-dsh-plugin-manager-companion-0.2.1\dsh-plugin-manager-companion-0.2.1` |
| `$profile` | 目标 profile 名 | `verify` |

---

## 1. 构建

```powershell
$pkg = 'D:\Desktop\project\Software Tool Adaptation\p-dsh-plugin-manager-companion-0.2.1\dsh-plugin-manager-companion-0.2.1'
Set-Location $pkg
node tools/build.mjs
```

产物检查（缺任何一个都不要往下走）：

```powershell
Test-Path "$pkg\dist\index.js"      # Host 入口（Loader 行的 name 解析到这里）
Test-Path "$pkg\dist\client.js"     # 客户端 bundle（官方 web 前端按 dsh.client 下发）
Test-Path "$pkg\cordis.patch.yml"   # bundle 补丁层
```

---

## 2. 安装（推荐：`dsh plugin add`，走官方安装通道）

官方通道会写 profile 的 `package.json`、把声明了 `dsh.bundle` 的包激活进
`dsh.profile.bundles`，并在 profile 的写锁下执行——**不要手改 profile 文件**。

```powershell
# 桌面版的 dsh 是安装目录里的一个 .cmd 垫片（本机实测路径，按自己的安装改）
$dshCli  = 'G:\Software\DeepSeek Harness\resources\runtime\cli\bin'          # 含 dsh.cmd
$pnpmCjs = 'G:\Software\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.cjs'

# pnpm 不在 PATH 时给官方通道一个 shim（桌面版自带 pnpm，但没进 PATH）
$shim = Join-Path $env:TEMP 'dsh-pnpm-shim'
New-Item -ItemType Directory -Force -Path $shim | Out-Null
Set-Content -Path (Join-Path $shim 'pnpm.cmd') -Value "@echo off`r`nnode `"$pnpmCjs`" %*" -Encoding ascii

$env:PATH = "$dshCli;$shim;$env:PATH"
dsh plugin --profile verify add "file:$pkg"
```

**关于 `--ignore-scripts`**：如果安装以
`ERR_PNPM_IGNORED_BUILDS … Run "pnpm approve-builds"` 收尾（pnpm 11 的默认行为，
因为官方依赖里有 koffi / node-pty 等原生包），有两种收尾方式：

```powershell
# 方案 A（推荐）：先批准构建，再装
#   在 profile 的 pnpm-workspace.yaml 里加 allowBuilds（pnpm 11 的映射形态）：
#   allowBuilds:
#     '@deepseek-ai/dsh-subprocess-local': true
#     '@google/genai': true
#     koffi: true
#     node-pty: true
#     protobufjs: true
# 然后重跑同一条 add。

# 方案 B：先跳过构建脚本装完（插件本身是纯 JS，不需要构建脚本）
dsh plugin --profile verify add "file:$pkg" --ignore-scripts
```

装完核对：

```powershell
$home = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$prof = Join-Path $home "profiles\$profile"
(Get-Content (Join-Path $prof 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles   # 应含 dsh-plugin-manager-companion
Test-Path (Join-Path $prof 'node_modules\dsh-plugin-manager-companion\dist\client.js')       # True
dsh --profile verify --dump-config | Select-String 'dsh-plugin-manager-companion'      # 组合树里有这一行
```

---

## 3. 启动并验证

```powershell
dsh --profile verify --no-open
```

浏览器打开它打印的 `http://127.0.0.1:<port>/?token=…`，然后：

- 设置页应出现四个入口：**插件市场 / 环境控制台 / 技能与预设 / 关于**；
- 官方插件页里应出现本插件的卡片与配置节；
- 配置改动保存后，profile 的 `cordis.patch.yml` 里应出现该行的 `config:` 段。

命令行快速自检（把 token 换成上一步打印的）：

```powershell
$tok = '<token>'
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-WebRequest "http://127.0.0.1:3080/?token=$tok" -UseBasicParsing -WebSession $s
(Invoke-WebRequest "http://127.0.0.1:3080/api2/companion/capabilities" -Method Post -Body '{}' `
  -ContentType 'application/json' -UseBasicParsing -WebSession $s).Content
```

期望：`"capabilities":{ "profileBacked":true, "manager":true, "inventory":true, … "missing":[] }`，
并且 `config` 里是完整默认配置（说明 `Config` 生效、配置面可写）。

> 本机实测（桌面版 0.2.1-rc.3 + 一次性 HOME）：`capabilities` / `getConfig` / `setConfig` /
> `diagnose`（含 `job` 轮询）/ `listEnvironments` / `environmentTemplates` / `listKinds` /
> `trialEnvironments` / `marketplace`（20156 条，`source=network:api`）/ `about` 全部 `ok:true`；
> `setConfig` 之后 profile 的 `cordis.patch.yml` 里真的出现了 `qualityGate` 段
> （`mode: warn`、`allowlist: [probe-pkg]`）。

---

## 4. 卸载

```powershell
dsh plugin --profile verify remove dsh-plugin-manager-companion
```

再确认：

```powershell
(Get-Content (Join-Path $prof 'package.json') -Raw | ConvertFrom-Json).dsh.profile.bundles   # 不再含本包
dsh --profile verify --dump-config | Select-String 'dsh-plugin-manager-companion'            # 无输出
```

**注意（本机实测）**：如果你曾经在设置页保存过配置，profile 的 `cordis.patch.yml` 里会留下
一条 `- id: dsh-plugin-manager-companion` 的行（那是**官方 configEditor 写的**，不是本插件
手写的）。卸载后它变成"指向不存在包的行"，官方会告警：

```
dsh: warning: patch: entry "dsh-plugin-manager-companion" not found
```

把那一行删掉即可（用文本编辑器，或在本插件仍装着时用「环境控制台 → 体检 → 修复」清掉）。
本插件不会在你卸载时偷偷改你的 patch 文件。

清理**本插件自己的**运行期产物（可选，都是本插件写的，不是官方文件）：

```powershell
Remove-Item -Recurse -Force (Join-Path $home 'dpmc-trial-cleanup.log') -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $home 'plugin-manager-cache')  -ErrorAction SilentlyContinue
# 直装过的技能/预设（如果用过「技能与预设」页）：
#   <home>\skills\*  与  <home>\.agent-presets\*  下由本插件安装的目录
```

> 本插件不写 DSH 安装目录，也不改官方运行时；上面这些都在 `$DSH_HOME` 下。

---

## 5. 隔离验证（不碰任何真实 profile）

想先在一个一次性 HOME 里试，不想动自己的 `.dsh`：

```powershell
$iso = Join-Path $env:TEMP ('dsh-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $iso | Out-Null
$env:DSH_HOME = $iso
# 之后按第 2、3 步做（profile 名随意，比如 verify）
```

验证完 `Remove-Item -Recurse -Force $iso` 即可；真实 `.dsh` 全程没有被读写。
