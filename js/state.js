/* =========================================================
 *  state.js — 状态、存储与通用工具
 *  （经典脚本：所有顶层声明共享全局词法作用域）
 *  🏷️ 新增：刷题状态 STATUSES / statusMap
 *  🎨 升级：难度字典全面对齐洛谷官方 9 级 + 官方色值
 * ========================================================= */

"use strict";

var SVG_NS = "http://www.w3.org/2000/svg";

var NODE_W = 200;
var NODE_H = 128;
var DRAG_THRESHOLD = 5;

var MIN_SCALE = 0.2;
var MAX_SCALE = 3;
var BASE_GRID = 26;

var STORAGE_KEY = "oitree.state.v4";
var LEGACY_KEYS = ["oitree.state.v3", "oitree.state.v2"];

/* =========================================================
 *  🎨 洛谷官方 9 级难度字典
 *  - value      : 数据存储键（稳定，不改动以兼容旧数据）
 *  - label      : 显示名称（与洛谷官方 1:1 对齐）
 *  - accent     : 节点左侧色条 / 强调色
 *  - border     : 节点边框色 / 下拉框文字色（保证深色主题可读）
 * ========================================================= */

var DIFFICULTIES = [
  { value: "none",        label: "暂无评定",       accent: "#bfbfbf", border: "#bfbfbf" },
  { value: "beginner",    label: "入门",           accent: "#fe4c61", border: "#fe4c61" },
  { value: "easy",        label: "普及-",          accent: "#f39c11", border: "#f39c11" },
  { value: "basic",       label: "普及",           accent: "#ffc116", border: "#ffc116" },
  { value: "easy-medium", label: "普及+/提高-",    accent: "#52c41a", border: "#52c41a" },
  { value: "medium",      label: "提高",           accent: "#2578b5", border: "#2578b5" },
  { value: "hard",        label: "提高+/省选-",    accent: "#0e90d2", border: "#0e90d2" },
  { value: "harder",      label: "省选/NOI-",      accent: "#9d3dcf", border: "#9d3dcf" },
  { value: "noi",         label: "NOI/NOI+/CTS",   accent: "#0e1d24", border: "#64748b" },
];

var difficultyMap = new Map(DIFFICULTIES.map(function (d) { return [d.value, d]; }));

/* =========================================================
 *  🏷️ 刷题状态
 *  - ac   独立 AC
 *  - hint 看题解才过（需复习二刷）
 *  - fail 未攻克（卡题 / 思维盲区）
 *  - none 暂未开始
 * ========================================================= */

var STATUSES = [
  { value: "ac",   label: "独立 AC",   shortLabel: "AC",   color: "#10b981" },
  { value: "hint", label: "看题解才过", shortLabel: "二刷", color: "#f59e0b" },
  { value: "fail", label: "未攻克",     shortLabel: "未过", color: "#ef4444" },
  { value: "none", label: "未开始",     shortLabel: "",     color: "#8f9bad" },
];

var statusMap = new Map(STATUSES.map(function (s) { return [s.value, s]; }));

/* 默认状态 */
var DEFAULT_STATUS = "ac";

/* =========================================================
 *  共享可变状态
 * ========================================================= */

var state = null;

var nodes = new Map();
var links = new Map();

var view = { x: 0, y: 0, scale: 1 };

var session = {
  editingNode: null,
  editingCategoryId: null,
  selectedNodeId: null,
  spacePressed: false,
  nodeCount: 0,
};

/* 内部：持久化防抖 */
var persistTimer = null;

/* =========================================================
 *  时间工具
 * ========================================================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatNow() {
  var d = new Date();
  return (
    d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " +
    pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds())
  );
}

/* =========================================================
 *  通用工具
 * ========================================================= */

function hexToRgba(hex, alpha) {
  var clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean.split("").map(function (c) { return c + c; }).join("");
  }
  var value = parseInt(clean, 16);
  var r = (value >> 16) & 255;
  var g = (value >> 8) & 255;
  var b = value & 255;
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

function normalizeUrl(raw) {
  if (!raw) return "";
  var trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return "https:" + trimmed;
  return "https://" + trimmed;
}

function isTextInput(el) {
  if (!el) return false;
  var tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

function sanitizeFilename(name) {
  return (
    String(name)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "category"
  );
}

function uniqueCategoryName(base) {
  var name = base;
  var i = 1;
  while (state.categories.some(function (c) { return c.name === name; })) {
    name = base + " (" + i + ")";
    i += 1;
  }
  return name;
}

/**
 * 规范化节点时间 / 状态字段：
 * - createdAt / completedAt / note 字符串兜底
 * - status 无效值兜底为 DEFAULT_STATUS
 */
function normalizeNodeTimes(data) {
  var out = data && typeof data === "object" ? Object.assign({}, data) : {};
  if (typeof out.createdAt !== "string" || !out.createdAt) {
    out.createdAt = formatNow();
  }
  if (typeof out.completedAt !== "string") out.completedAt = "";
  if (typeof out.note !== "string") out.note = "";

  /* 🏷️ 刷题状态兜底 */
  if (typeof out.status !== "string" || !statusMap.has(out.status)) {
    out.status = DEFAULT_STATUS;
  }

  return out;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
 *  Markdown / KaTeX / 代码高亮渲染
 * ========================================================= */

(function setupMarked() {
  if (!window.marked) return;
  try {
    window.marked.setOptions({
      gfm: true,
      breaks: true,
      headerIds: false,
      mangle: false,
    });
  } catch (_) {
    /* 兼容不同版本 API */
  }
})();

function renderMarkdownToElement(el, src, opts) {
  if (!el) return;
  var options = opts || {};
  var source = typeof src === "string" ? src : "";

  if (!source.trim()) {
    el.innerHTML =
      '<p class="preview-empty">' +
      escapeHtml(options.emptyText || "暂无内容") +
      "</p>";
    return;
  }

  var html = "";

  if (window.marked && typeof window.marked.parse === "function") {
    try {
      html = window.marked.parse(source);
    } catch (err) {
      console.warn("[oitree] Markdown 解析失败：", err);
      html = "<pre>" + escapeHtml(source) + "</pre>";
    }
  } else {
    html = "<pre>" + escapeHtml(source) + "</pre>";
  }

  el.innerHTML = html;

  if (window.hljs) {
    el.querySelectorAll("pre code").forEach(function (block) {
      try {
        window.hljs.highlightElement(block);
      } catch (_) {
        /* 忽略单块高亮失败 */
      }
    });
  }

  if (typeof window.renderMathInElement === "function") {
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
        errorColor: "#fe4c61",
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      });
    } catch (err) {
      console.warn("[oitree] KaTeX 渲染失败：", err);
    }
  }
}

/* =========================================================
 *  状态持久化
 * ========================================================= */

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.categories) && parsed.categories.length) {
        return parsed;
      }
    }
    for (var i = 0; i < LEGACY_KEYS.length; i++) {
      var key = LEGACY_KEYS[i];
      var legacy = localStorage.getItem(key);
      if (!legacy) continue;
      try {
        var p = JSON.parse(legacy);
        if (p && Array.isArray(p.categories) && p.categories.length) {
          return p;
        }
      } catch (_) {
        /* 忽略 */
      }
    }
    return null;
  } catch (err) {
    console.warn("[oitree] 读取本地数据失败：", err);
    return null;
  }
}

/** 加载 + 初始化默认状态 + 校验 */
function initAppState() {
  state = loadState();
  if (!state) state = createDefaultState();
  ensureStateValid();
}

function createCategory(name, meta) {
  meta = meta || {};
  return {
    id: "cat_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
    name: name || "新分类",
    author: typeof meta.author === "string" ? meta.author : "",
    luoguUrl: typeof meta.luoguUrl === "string" ? meta.luoguUrl : "",
    description: typeof meta.description === "string" ? meta.description : "",
    nodes: [],
    edges: [],
    view: { x: 0, y: 0, scale: 1 },
    nodeCount: 0,
  };
}

function createDefaultState() {
  var names = ["基础算法", "图论", "动态规划", "数据结构", "数学与数论"];
  var categories = names.map(function (n) { return createCategory(n); });
  return {
    activeCategoryId: categories[0].id,
    categories: categories,
  };
}

function ensureStateValid() {
  if (!Array.isArray(state.categories) || state.categories.length === 0) {
    state.categories = [createCategory("基础算法")];
  }
  if (
    !state.activeCategoryId ||
    !state.categories.some(function (c) { return c.id === state.activeCategoryId; })
  ) {
    state.activeCategoryId = state.categories[0].id;
  }
  for (var i = 0; i < state.categories.length; i++) {
    var cat = state.categories[i];
    if (typeof cat.author !== "string") cat.author = "";
    if (typeof cat.luoguUrl !== "string") cat.luoguUrl = "";
    if (typeof cat.description !== "string") cat.description = "";
    if (!Array.isArray(cat.nodes)) cat.nodes = [];
    if (!Array.isArray(cat.edges)) cat.edges = [];
    if (!cat.view || typeof cat.view !== "object") {
      cat.view = { x: 0, y: 0, scale: 1 };
    }
    if (typeof cat.nodeCount !== "number" || !Number.isFinite(cat.nodeCount)) {
      cat.nodeCount = 0;
    }

    /* 🏷️ 兼容旧数据：补齐 status 字段 */
    for (var j = 0; j < cat.nodes.length; j++) {
      var nd = cat.nodes[j];
      if (!nd || typeof nd !== "object") continue;
      if (!nd.data || typeof nd.data !== "object") nd.data = {};
      if (typeof nd.data.status !== "string" || !statusMap.has(nd.data.status)) {
        nd.data.status = DEFAULT_STATUS;
      }
      /* 🎨 兼容旧难度：丢弃未知值，兜底为 none */
      if (typeof nd.data.difficulty !== "string" || !difficultyMap.has(nd.data.difficulty)) {
        nd.data.difficulty = "none";
      }
    }
  }
}

function getActiveCategory() {
  return state.categories.find(function (c) { return c.id === state.activeCategoryId; }) || null;
}

function getCategoryById(id) {
  return state.categories.find(function (c) { return c.id === id; }) || null;
}

function syncActiveCategoryFromScene() {
  var cat = getActiveCategory();
  if (!cat) return;

  cat.nodes = [];
  nodes.forEach(function (node) {
    cat.nodes.push({
      id: node.id,
      x: node.x,
      y: node.y,
      data: Object.assign({}, node.data),
    });
  });

  cat.edges = [];
  links.forEach(function (link) {
    cat.edges.push({ from: link.from, to: link.to });
  });

  cat.view = { x: view.x, y: view.y, scale: view.scale };
  cat.nodeCount = session.nodeCount;
}

function persist() {
  syncActiveCategoryFromScene();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("[oitree] 保存本地数据失败：", err);
    }
  }, 160);
}

/* =========================================================
 *  .oitree 导出 / 导入
 * ========================================================= */

function exportCategory(cat) {
  if (cat.id === state.activeCategoryId) {
    syncActiveCategoryFromScene();
  }

  var payload = {
    format: "oitree",
    version: 2,
    exportedAt: new Date().toISOString(),
    name: cat.name,
    author: cat.author || "",
    luoguUrl: cat.luoguUrl || "",
    description: cat.description || "",
    nodeCount: cat.nodeCount || 0,
    nodes: (cat.nodes || []).map(function (n) {
      var data = normalizeNodeTimes(Object.assign({}, n.data));
      return {
        id: n.id,
        x: n.x,
        y: n.y,
        data: {
          title: data.title != null ? data.title : "",
          difficulty: data.difficulty != null ? data.difficulty : "none",
          status: data.status != null ? data.status : DEFAULT_STATUS,
          tags: data.tags != null ? data.tags : "",
          link: data.link != null ? data.link : "",
          note: data.note != null ? data.note : "",
          createdAt: data.createdAt || "",
          completedAt: data.completedAt || "",
        },
      };
    }),
    edges: (cat.edges || []).map(function (e) { return { from: e.from, to: e.to }; }),
  };

  var json = JSON.stringify(payload, null, 2);
  var blob = new Blob([json], { type: "application/json;charset=utf-8" });
  var url = URL.createObjectURL(blob);

  var a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(cat.name) + ".oitree";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
}

function normalizeImportedNode(raw) {
  if (!raw || typeof raw !== "object") return null;
  var rawId = Number(raw.id);
  if (!Number.isFinite(rawId) || rawId <= 0) return null;
  var id = Math.floor(rawId);

  var data = raw.data && typeof raw.data === "object" ? raw.data : {};

  var difficulty =
    typeof data.difficulty === "string" && difficultyMap.has(data.difficulty)
      ? data.difficulty
      : "none";

  var status =
    typeof data.status === "string" && statusMap.has(data.status)
      ? data.status
      : DEFAULT_STATUS;

  return {
    id: id,
    x: Number.isFinite(raw.x) ? Number(raw.x) : 0,
    y: Number.isFinite(raw.y) ? Number(raw.y) : 0,
    data: {
      title: String(data.title != null ? data.title : "未命名题目"),
      difficulty: difficulty,
      status: status,
      tags: String(data.tags != null ? data.tags : ""),
      link: String(data.link != null ? data.link : ""),
      note: String(data.note != null ? data.note : ""),
      createdAt:
        typeof data.createdAt === "string" && data.createdAt
          ? data.createdAt
          : formatNow(),
      completedAt:
        typeof data.completedAt === "string" ? data.completedAt : "",
    },
  };
}

function normalizeImportedEdges(rawEdges, nodeIds) {
  if (!Array.isArray(rawEdges)) return [];
  var result = [];
  var seen = new Set();

  for (var i = 0; i < rawEdges.length; i++) {
    var e = rawEdges[i];
    if (!e || typeof e !== "object") continue;
    var from = Number(e.from);
    var to = Number(e.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (from === to) continue;
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
    var key = from + "->" + to;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ from: from, to: to });
  }

  return result;
}