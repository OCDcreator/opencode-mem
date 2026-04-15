const translations = {
  en: {
    "document-title": "OpenCode Memory Explorer",
    title: "┌─ OPENCODE MEMORY EXPLORER ─┐",
    "lang-toggle-title": "Switch language",
    "repo-upstream": "Upstream",
    "repo-fork": "My Fork",
    "repo-upstream-title": "View upstream repository",
    "repo-fork-title": "View custom fork repository",
    "project-docs": "Learn This Project",
    "project-docs-title": "Open project documentation",
    "tab-project": "PROJECT MEMORIES",
    "tab-profile": "USER PROFILE",
    "tooltip-tab-project": "Browse the project timeline, including saved memories and captured prompts.",
    "tooltip-tab-profile": "View the learned user profile built from long-term behavior patterns.",
    "label-tag": "Tag:",
    "label-type": "Type:",
    "label-tags": "Tags:",
    "label-content": "Content:",
    "btn-cleanup": "Cleanup",
    "btn-deduplicate": "Deduplicate",
    "btn-delete-selected": "Delete Selected",
    "btn-select-all": "Select Page",
    "btn-deselect-all": "Deselect All",
    "btn-add-memory": "Add Memory",
    "section-project": "└─ PROJECT MEMORIES ({count}) ──",
    "section-search": "└─ SEARCH RESULTS ({count}) ──",
    "section-profile": "└─ USER PROFILE ──",
    "section-add": "└─ ADD NEW MEMORY ──",
    "opt-all-tags": "All Tags",
    "opt-select-tag": "Select tag",
    "opt-other": "other",
    "opt-feature": "feature",
    "opt-bug-fix": "bug-fix",
    "opt-refactor": "refactor",
    "opt-architecture": "architecture",
    "opt-rule": "rule",
    "opt-documentation": "documentation",
    "opt-discussion": "discussion",
    "opt-analysis": "analysis",
    "opt-configuration": "configuration",
    "modal-edit-title": "Edit Memory",
    "modal-migration-title": "Memory Tagging Migration",
    "modal-changelog-title": "Profile Version History",
    "modal-docs-title": "Project Guide",
    "btn-cancel": "Cancel",
    "btn-save": "Save Changes",
    "btn-start-migration": "Start Migration",
    "loading-init": "Initializing...",
    "loading-profile": "Loading profile...",
    "loading-changelog": "Loading changelog...",
    "loading-docs": "Loading docs...",
    "migration-mismatch": "Model dimension mismatch detected!",
    "migration-understand":
      "I understand this operation is irreversible and will affect all stored memories",
    "btn-fresh-start": "Fresh Start (Delete All)",
    "btn-reembed": "Re-embed (Preserve Data)",
    "migration-note":
      "Please don't close the browser. This will re-vectorize your memories with technical tags to improve search accuracy.",
    "placeholder-search": "Search memories...",
    "placeholder-tags": "react, hooks, auth (comma separated)",
    "placeholder-content": "Enter memory content...",
    "toast-add-success": "Memory added successfully",
    "toast-add-error": "Content and tag are required",
    "toast-add-failed": "Failed to add memory",
    "toast-delete-success": "Memory deleted successfully",
    "toast-delete-failed": "Failed to delete memory",
    "toast-update-success": "Memory updated successfully",
    "toast-update-failed": "Failed to update memory",
    "toast-cleanup-success": "Cleanup completed successfully",
    "toast-cleanup-failed": "Cleanup failed",
    "toast-dedup-success": "Deduplication completed successfully",
    "toast-dedup-failed": "Deduplication failed",
    "toast-bulk-delete-success": "Selected memories deleted successfully",
    "toast-bulk-delete-failed": "Failed to delete selected memories",
    "toast-migration-success": "Migration completed successfully",
    "toast-migration-failed": "Migration failed",
    "toast-fresh-start-success": "Fresh start completed successfully",
    "toast-fresh-start-failed": "Fresh start failed",
    "confirm-delete": "Delete this memory?",
    "confirm-delete-pair": "Delete this memory AND its linked prompt?",
    "confirm-delete-prompt": "Delete this prompt AND its linked memory?",
    "confirm-bulk-delete": "Delete {count} selected memories?",
    "confirm-cleanup": "This will remove all memories that are no longer relevant. Continue?",
    "confirm-dedup": "This will merge duplicate or highly similar memories. Continue?",
    "text-selected": "{count} selected",
    "text-page": "Page {current} of {total}",
    "text-total": "Saved Memories: {count}",
    "tooltip-stats-total":
      "Counts saved memory records only. The project list can be larger because it also includes captured prompts.",
    "tooltip-section-project":
      "Shows the project timeline for the current filter, including memories and linked prompts.",
    "tooltip-section-search":
      "Shows search matches from memories and captured prompts within the current scope.",
    "tooltip-tag-filter": "Limit the list to one project tag or show all tags.",
    "tooltip-search-input": "Search memory content and captured prompts in the current project scope.",
    "tooltip-search-btn": "Run search for the current keywords.",
    "tooltip-clear-search-btn": "Clear the current search and return to the normal timeline view.",
    "tooltip-cleanup":
      "Remove old memories and prompts past the retention window. Pinned memories and linked items are kept.",
    "tooltip-deduplicate":
      "Delete exact duplicate memories and report highly similar groups for review.",
    "tooltip-select-all": "Select every item on the current page for bulk actions.",
    "tooltip-bulk-delete": "Delete every currently selected memory or prompt.",
    "tooltip-deselect-all": "Clear the current multi-selection.",
    "text-evidence-count": "{count} evidence",
    "text-default-category": "General",
    "empty-memories": "No memories found",
    "empty-profile": "No profile found yet. Keep chatting to build your profile.",
    "empty-changelog": "No changelog available",
    "docs-load-error": "Unable to load this document.",
    "status-cleanup": "Running cleanup...",
    "status-dedup": "Running deduplication...",
    "status-migration-init": "Initializing migration...",
    "status-migration-progress": "Migrating... {current}/{total}",
    "profile-version": "VERSION",
    "profile-prompts": "PROMPTS",
    "profile-updated": "LAST UPDATED",
    "profile-preferences": "PREFERENCES",
    "profile-patterns": "PATTERNS",
    "profile-workflows": "WORKFLOWS",
    "badge-prompt": "USER PROMPT",
    "badge-memory": "MEMORY",
    "badge-pinned": "PINNED",
    "badge-linked": "LINKED",
    "date-created": "Created:",
    "date-updated": "Updated:",
    "label-memory-id": "ID:",
    "empty-preferences": "No preferences learned yet",
    "empty-patterns": "No patterns detected yet",
    "empty-workflows": "No workflows identified yet",
    "btn-delete-pair": "Delete Pair",
    "btn-delete": "Delete",
    "btn-history": "History",
    "title-pin": "Pin this memory to mark it as important and protect it from cleanup.",
    "title-unpin": "Unpin this memory and let normal cleanup rules apply again.",
    "text-generated-above": "Generated memory above",
    "text-from-below": "From prompt below",
    "btn-refresh": "Refresh",
    "tooltip-refresh-profile": "Reload the latest learned user profile from storage.",
    "toast-profile-refresh-queued": "Profile refresh queued",
    "docs-group-overview": "Overview",
    "docs-group-usage": "Use & Explore",
    "docs-group-setup": "Setup & Models",
    "docs-group-troubleshooting": "Troubleshooting",
    "docs-item-overview": "Project Overview",
    "docs-item-project-memories": "Project Memories",
    "docs-item-manual-memory": "Save Memory Manually",
    "docs-item-auto-capture": "Auto Capture",
    "docs-item-user-profile": "User Profile",
    "docs-item-setup-guide": "Setup Guide",
    "docs-item-embedding": "Embedding Modes",
    "docs-item-provider": "Provider Setup",
    "docs-item-storage": "Storage & Search",
    "docs-item-logging": "Logging & Debug",
    "migration-found-tags": "Found {count} memories needing technical tags.",
    "migration-stopped": "Migration stopped: maximum attempts reached",
    "migration-shards-mismatch": "{count} shard(s) have different dimensions",
    "migration-dimension-mismatch": "dimension mismatch detected",
    "migration-confirm-fresh":
      "Run Fresh Start (Delete All) migration?\n\nThis operation is IRREVERSIBLE and will:\n- DELETE all existing memories\n- Remove all shards\n\nContinue?",
    "migration-confirm-reembed":
      "Run Re-embed (Preserve Data) migration?\n\nThis operation is IRREVERSIBLE and will:\n- Re-embed all memories with new model\n- This may take several minutes\n\nContinue?",
    "migration-mismatch-details":
      "Model mismatch: Config uses {configDimensions}D ({configModel}), but {shardInfo}.",
  },
  zh: {
    "document-title": "OpenCode 记忆浏览器",
    title: "┌─ OPENCODE MEMORY EXPLORER ─┐",
    "lang-toggle-title": "切换语言",
    "repo-upstream": "上游仓库",
    "repo-fork": "我的分叉",
    "repo-upstream-title": "查看上游仓库",
    "repo-fork-title": "查看当前分叉仓库",
    "project-docs": "了解该项目",
    "project-docs-title": "打开项目文档窗口",
    "tab-project": "项目记忆",
    "tab-profile": "用户画像",
    "tooltip-tab-project": "查看项目时间线，里面同时包含保存的记忆和已捕获的提示词。",
    "tooltip-tab-profile": "查看根据长期行为模式整理出来的用户画像。",
    "label-tag": "标签:",
    "label-type": "类型:",
    "label-tags": "标签:",
    "label-content": "内容:",
    "btn-cleanup": "清理",
    "btn-deduplicate": "去重",
    "btn-delete-selected": "删除选中",
    "btn-select-all": "全选当前页",
    "btn-deselect-all": "取消全选",
    "btn-add-memory": "添加记忆",
    "section-project": "└─ 项目记忆 ({count}) ──",
    "section-search": "└─ 搜索结果 ({count}) ──",
    "section-profile": "└─ 用户画像 ──",
    "section-add": "└─ 添加新记忆 ──",
    "opt-all-tags": "所有标签",
    "opt-select-tag": "选择标签",
    "opt-other": "其他 (other)",
    "opt-feature": "功能 (feature)",
    "opt-bug-fix": "修复 (bug-fix)",
    "opt-refactor": "重构 (refactor)",
    "opt-architecture": "架构 (architecture)",
    "opt-rule": "规则 (rule)",
    "opt-documentation": "文档 (documentation)",
    "opt-discussion": "讨论 (discussion)",
    "opt-analysis": "分析 (analysis)",
    "opt-configuration": "配置 (configuration)",
    "modal-edit-title": "编辑记忆",
    "modal-migration-title": "记忆标签迁移",
    "modal-changelog-title": "画像版本历史",
    "modal-docs-title": "项目文档",
    "btn-cancel": "取消",
    "btn-save": "保存更改",
    "btn-start-migration": "开始迁移",
    "loading-init": "初始化中...",
    "loading-profile": "加载画像中...",
    "loading-changelog": "加载更新日志中...",
    "loading-docs": "文档加载中...",
    "migration-mismatch": "检测到模型维度不匹配！",
    "migration-understand": "我了解此操作不可逆，并将影响所有存储的记忆",
    "btn-fresh-start": "重新开始 (删除所有)",
    "btn-reembed": "重新向量化 (保留数据)",
    "migration-note": "请不要关闭浏览器。这将使用技术标签重新向量化您的记忆，以提高搜索准确性。",
    "placeholder-search": "搜索记忆...",
    "placeholder-tags": "react, hooks, auth (逗号分隔)",
    "placeholder-content": "输入记忆内容...",
    "toast-add-success": "记忆添加成功",
    "toast-add-error": "内容和标签为必填项",
    "toast-add-failed": "添加记忆失败",
    "toast-delete-success": "记忆删除成功",
    "toast-delete-failed": "删除记忆失败",
    "toast-update-success": "记忆更新成功",
    "toast-update-failed": "更新记忆失败",
    "toast-cleanup-success": "清理完成",
    "toast-cleanup-failed": "清理失败",
    "toast-dedup-success": "去重完成",
    "toast-dedup-failed": "去重失败",
    "toast-bulk-delete-success": "选中的记忆删除成功",
    "toast-bulk-delete-failed": "删除选中的记忆失败",
    "toast-migration-success": "迁移完成",
    "toast-migration-failed": "迁移失败",
    "toast-fresh-start-success": "重新开始完成",
    "toast-fresh-start-failed": "重新开始失败",
    "confirm-delete": "删除这条记忆？",
    "confirm-delete-pair": "删除这条记忆及其关联的提示词？",
    "confirm-delete-prompt": "删除这条提示词及其关联的记忆？",
    "confirm-bulk-delete": "删除选中的 {count} 条记忆？",
    "confirm-cleanup": "这将删除所有不再相关的记忆。是否继续？",
    "confirm-dedup": "这将合并重复或高度相似的记忆。是否继续？",
    "text-selected": "已选择 {count} 条",
    "text-page": "第 {current} 页，共 {total} 页",
    "text-total": "记忆总数: {count}",
    "tooltip-stats-total":
      "这里只统计真正保存下来的记忆记录；项目列表通常更大，因为还会包含已捕获的提示词。",
    "tooltip-section-project": "这里显示当前筛选范围内的项目时间线，包括记忆和关联提示词。",
    "tooltip-section-search": "这里显示当前范围内，记忆和已捕获提示词的搜索结果。",
    "tooltip-tag-filter": "按某个项目标签筛选，或查看全部标签。",
    "tooltip-search-input": "搜索当前项目范围内的记忆内容和已捕获提示词。",
    "tooltip-search-btn": "用当前关键词执行搜索。",
    "tooltip-clear-search-btn": "清空搜索条件，回到普通时间线视图。",
    "tooltip-cleanup":
      "清理超过保留期的旧记忆和提示词；置顶记忆和仍有关联的内容会被保留。",
    "tooltip-deduplicate": "删除完全重复的记忆，并把高度相似的内容分组出来供你检查。",
    "tooltip-select-all": "选中当前页里的全部条目，方便批量操作。",
    "tooltip-bulk-delete": "删除当前已选中的记忆或提示词。",
    "tooltip-deselect-all": "取消当前的批量选择。",
    "text-evidence-count": "{count} 条依据",
    "text-default-category": "通用",
    "empty-memories": "未找到记忆",
    "empty-profile": "暂未生成用户画像，继续聊天后会逐步建立。",
    "empty-changelog": "暂无更新日志",
    "docs-load-error": "文档加载失败，请稍后重试。",
    "status-cleanup": "正在运行清理...",
    "status-dedup": "正在运行去重...",
    "status-migration-init": "正在初始化迁移...",
    "status-migration-progress": "迁移中... {current}/{total}",
    "profile-version": "版本",
    "profile-prompts": "提示词数",
    "profile-updated": "最后更新",
    "profile-preferences": "偏好设置",
    "profile-patterns": "行为模式",
    "profile-workflows": "工作流程",
    "badge-prompt": "用户提示词",
    "badge-memory": "记忆",
    "badge-pinned": "已置顶",
    "badge-linked": "已关联",
    "date-created": "创建于:",
    "date-updated": "更新于:",
    "label-memory-id": "编号:",
    "empty-preferences": "尚未学习到偏好设置",
    "empty-patterns": "尚未检测到行为模式",
    "empty-workflows": "尚未识别出工作流程",
    "btn-delete-pair": "删除组合",
    "btn-delete": "删除",
    "btn-history": "历史记录",
    "title-pin": "置顶这条记忆，标记为重要内容，并避免被自动清理。",
    "title-unpin": "取消置顶这条记忆，之后重新按普通清理规则处理。",
    "text-generated-above": "由上方记忆生成",
    "text-from-below": "来自下方提示词",
    "btn-refresh": "刷新",
    "tooltip-refresh-profile": "从存储中重新加载最新的用户画像。",
    "toast-profile-refresh-queued": "已加入画像刷新队列",
    "docs-group-overview": "总览",
    "docs-group-usage": "使用与浏览",
    "docs-group-setup": "配置与模型",
    "docs-group-troubleshooting": "排查与诊断",
    "docs-item-overview": "项目总览",
    "docs-item-project-memories": "项目记忆",
    "docs-item-manual-memory": "手动保存记忆",
    "docs-item-auto-capture": "自动采集",
    "docs-item-user-profile": "用户画像",
    "docs-item-setup-guide": "配置向导",
    "docs-item-embedding": "嵌入模式",
    "docs-item-provider": "Provider 配置",
    "docs-item-storage": "存储与检索",
    "docs-item-logging": "日志与调试",
    "migration-found-tags": "发现 {count} 条需要技术标签的记忆。",
    "migration-stopped": "迁移已停止：达到最大尝试次数",
    "migration-shards-mismatch": "{count} 个分片具有不同的维度",
    "migration-dimension-mismatch": "检测到维度不匹配",
    "migration-confirm-fresh":
      "执行“重新开始（删除所有）”迁移？\n\n此操作不可逆，并将会：\n- 删除所有现有记忆\n- 删除所有分片\n\n是否继续？",
    "migration-confirm-reembed":
      "执行“重新向量化（保留数据）”迁移？\n\n此操作不可逆，并将会：\n- 使用新模型重新向量化所有记忆\n- 这可能需要几分钟时间\n\n是否继续？",
    "migration-mismatch-details":
      "模型不匹配：配置使用 {configDimensions}D ({configModel})，但{shardInfo}。",
  },
};

function getLanguage() {
  return localStorage.getItem("opencode-mem-lang") || "en";
}

function setLanguage(lang) {
  localStorage.setItem("opencode-mem-lang", lang);
  applyLanguage();
}

function t(key, params = {}) {
  const lang = getLanguage();
  let text = translations[lang][key] || translations["en"][key] || key;

  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }

  return text;
}

function applyLanguage() {
  const lang = getLanguage();
  document.documentElement.lang = lang;
  document.title = t("document-title");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const translated = t(key);

    // If element has child nodes (like icons), we need to replace only the text nodes
    if (el.children.length > 0) {
      let textNodeFound = false;
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "") {
          node.textContent = " " + translated + " ";
          textNodeFound = true;
        }
      }
      if (!textNodeFound) {
        el.appendChild(document.createTextNode(" " + translated));
      }
    } else {
      el.textContent = translated;
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    el.setAttribute("title", t(key));
  });
}

document.documentElement.lang = getLanguage();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyLanguage, { once: true });
} else {
  applyLanguage();
}

window.t = t;
window.getLanguage = getLanguage;
window.setLanguage = setLanguage;
window.applyLanguage = applyLanguage;
