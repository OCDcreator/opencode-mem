# OpenCode 1.4.0 启动高 CPU 与插件排障记录

本文记录一次真实排障过程，目标不是“证明插件有问题”，而是把：

- 现象是什么
- 哪些怀疑最后被排除
- 哪些改动是确实必要的
- 哪些负担其实来自 OpenCode 1.4.0 自身启动流程

尽量整理清楚，方便以后再遇到类似情况时少走弯路。

## 1. 现象

用户反馈的现象有三类：

1. 打开 OpenCode 后偶尔有错误提示音
2. `http://127.0.0.1:4747/` 一度出现 Bun 默认页面，而不是插件 Web UI
3. 启动后任务管理器里 `bun` / `opencode-cli` CPU 很高，风扇明显加速

后续还补充了一个重要时间线：

- 问题出现在为 macOS 本地插件加载做调整之后
- 同一天又升级到了 `OpenCode 1.4.0`

这意味着问题来源不能先入为主地认定为“插件代码本身”。

## 2. 最开始容易误判的点

### 2.1 `tsconfig.json` 里的 `"types": ["bun"]`

这个改动很显眼，但它只是 **编译期类型声明**。

作用：

- 让 `bun run build` / `bunx tsc` 正确识别 Bun 运行时相关全局类型

它不参与：

- OpenCode Desktop 启动
- 插件运行时 CPU 占用
- `opencode-cli` 的后台行为

所以它不是这次启动高 CPU 的根因。

### 2.2 “只要关掉插件就一定不高 CPU”

这个直觉也不一定对。

因为 OpenCode Desktop 自己在启动时就会做很多事，例如：

- 初始化 sidecar
- 建立事件流
- 加载技能
- 初始化 MCP
- 建立文件监听和项目状态

所以必须做 **A/B 对照**，不能只凭感觉下结论。

## 3. 先确认的真实插件问题

虽然最终高 CPU 不完全是插件导致，但排障过程中仍然确认了几个真实存在的插件问题。

### 3.1 本地插件导出契约问题

OpenCode 1.3+ 的路径插件要求更严格：

- 路径插件需要导出 `id`
- 默认导出不能只是裸函数
- server 插件需要导出形如 `{ id, server }`

为避免初始化时机问题，`src/plugin.ts` 改成了惰性导入实现：

- `src/plugin.ts:3`
- `src/plugin.ts:5`

并且补充了契约测试：

- `tests/plugin-loader-contract.test.ts:33`

这个改动是合理且应保留的，因为它直接解决了实际加载失败。

### 3.2 插件 Web UI 服务端实现与宿主不兼容

桌面日志曾明确报过：

- `Expected a Response object, but received '_Response {'`

也就是说，插件侧原先依赖 `Bun.serve` 返回的对象，在这个宿主环境下并不完全兼容。

因此 `src/services/web-server.ts` 被改为基于 `node:http` 的适配实现：

- `src/services/web-server.ts:1`
- `src/services/web-server.ts:39`
- `src/services/web-server.ts:220`

这个改动也应保留，因为它解决的是确定性的兼容性 bug，而不是猜测式性能优化。

### 3.3 插件事件日志过多

插件之前会把大量事件直接写入本地日志，尤其是：

- `file.watcher.updated`

在 OpenCode 1.4.0 下，事件量变大后，这种同步写盘会放大启动阶段负担。

因此做了两类收敛：

1. 只记录关键事件类型
   - `src/index.ts:27`
   - `src/index.ts:513`
2. 对日志数据做截断和浅层清洗
   - `src/services/logger.ts:24`
   - `src/services/logger.ts:39`

这组改动是合理的，因为它减少的是已观测到的日志放大效应。

## 4. A/B 对照：插件到底是不是高 CPU 主因

为了避免误判，做了一个严格的本地 A/B：

### A 组：禁用本地插件 wrapper

- 临时把 `C:\Users\lt\.config\opencode\plugins\opencode-mem.js` 改名
- 启动 OpenCode
- 连续采样 `opencode-cli` 约 22 秒

结果：

- CPU 累积约 `+21.72s`
- 内存约 `495.7MB -> 814.1MB`

### B 组：恢复本地插件 wrapper

- 恢复 `opencode-mem.js`
- 重启 OpenCode
- 用同样方式再次采样

结果：

- CPU 累积约 `+20.09s`
- 内存约 `527.0MB -> 797.1MB`

### 结论

两组结果接近，说明：

- **当前启动高 CPU 并不是这个插件的主要来源**
- 即使关闭插件，`opencode-cli` 在启动阶段仍然会显著吃 CPU

这一步很关键，因为它把“插件就是罪魁祸首”这个假设排除了。

## 5. 更像根因的 OpenCode 侧因素

在 OpenCode Desktop 日志中，当时还能看到两类明显噪音：

### 5.1 重复 skills

例如：

- `frontend-design`
- `skill-creator`

它们同时存在于：

- `C:\Users\lt\.claude\skills`
- `C:\Users\lt\.config\opencode\skills`

这会导致重复扫描和告警。

### 5.2 MCP 在启动时探测 `prompts/list`

以下 MCP 服务会在启动时报错：

- `zai-mcp-server`
- `web-search-prime`
- `zread`
- `web-reader`
- `web-search`

报错并不表示它们完全不可用，而是它们不支持当前 OpenCode 启动时尝试调用的 `prompts/list`。

这会带来：

- 启动日志噪音
- 额外的连接、探测和异常处理开销

## 6. 本次做的本机配置清理

这部分改动发生在用户本机配置中，不在本仓库版本控制内。

### 6.1 禁用重复 skills 的一份副本

将以下目录改名备份：

- `C:\Users\lt\.config\opencode\skills\frontend-design.disabled-codex-...`
- `C:\Users\lt\.config\opencode\skills\skill-creator.disabled-codex-...`

保留：

- `C:\Users\lt\.claude\skills\...`

### 6.2 暂时关闭启动即报错的 MCP

已备份：

- `C:\Users\lt\.config\opencode\opencode.json.bak-codex-...`

并将以下条目的 `enabled` 设为 `false`：

- `zai-mcp-server`
- `web-search-prime`
- `zread`
- `web-reader`
- `web-search`

### 6.3 清理后的结果

重启后，最新桌面日志里不再出现：

- `duplicate skill name`
- `failed to get prompts`

这说明启动噪音被明显收敛了。

## 7. 对当前仓库改动的审查结论

这次改动不能一股脑全算“性能优化”。更准确地说，它们分成三类。

### 7.1 应保留的改动

这些有明确证据支持：

1. `src/plugin.ts`
   - 修复本地路径插件导出契约与初始化时机
2. `src/services/web-server.ts`
   - 修复 Bun `_Response` 与宿主不兼容的问题
3. `tests/plugin-loader-contract.test.ts`
   - 为加载契约提供回归保护
4. `src/index.ts` 的事件日志筛选
   - 避免 `file.watcher.updated` 日志风暴
5. `src/services/logger.ts`
   - 截断大日志，减少同步写盘负担
6. `src/services/embedding.ts` / `src/index.ts` / `src/services/web-server.ts` 的 `unref`
   - 避免非关键定时器把进程生命周期拖长

### 7.2 需要谨慎处理的改动

`provider state` 的“永久 ready 去重”就偏激进。

原因：

- provider 连接状态并不是永远不变
- 如果只允许一次成功初始化，后续实例可能拿不到更新后的 provider 状态

因此审查后保留了：

- “同一时刻只跑一个初始化”的 `in-flight` 去重

但去掉了：

- “成功一次后永远不再刷新”的 `ready` 逻辑

这样更符合“减少并发重复工作，但不冻结后续刷新”的原则。

### 7.3 不应误解的改动

- `tsconfig.json` 中的 `"types": ["bun"]`

它是构建层修复，不是运行时性能修复。

## 8. 上游仓库最新改动是否值得合并

上游 `tickernelz/opencode-mem` 当前比本 fork 新的主要提交有：

1. `eee6ffc`
   - `fix(embedding): defer transformers initialization`
2. `6186a69`
   - `fix(index): defer opencode provider startup import`
3. `dbe32de`
   - `fix: Chinese language detection fallback and lower minLength threshold`
4. 以及少量版本号 / `.gitignore` 类提交

### 8.1 `eee6ffc`

本 fork 在更早之前已经用自己的方式实现了更强版本：

- 不在模块顶层导入 `@xenova/transformers`
- 改成按需动态加载
- 同时兼顾 Windows 启动稳定性

所以不需要按原样再合并。

### 8.2 `6186a69`

本 fork 也已经实现了更完整的 provider 启动容错与状态处理，因此同样不适合直接覆盖式合并。

### 8.3 `dbe32de`

这个提交值得参考，但不能整包覆盖。

原因：

- 本 fork 的语言检测已经加入了路径/代码噪音清洗与脚本级兜底
- 这部分逻辑比上游更适合当前用户的真实提示词形态

如果要吸收，也应该是：

- 只挑其中低风险的小修补
- 不能把 fork 的路径清洗逻辑回退掉

## 9. 最后的判断

本次问题最终可以分成两层：

### 第一层：插件里确实有 bug

包括：

- 路径插件导出契约
- Web UI 服务端兼容性
- 事件日志放大

这些已经修复，而且是值得保留的修复。

### 第二层：启动高 CPU 主要不是插件主因

更大的来源来自：

- OpenCode 1.4.0 启动行为变化
- skills 重复扫描
- MCP 启动探测报错

所以如果以后再次看到“打开就风扇狂转”，应优先按这个顺序排查：

1. 先做插件禁用 / 启用 A/B
2. 再看桌面日志里的 skills 与 MCP 噪音
3. 最后才判断是不是插件业务逻辑本身又退化了

这样比直接修改插件源码更可靠。
