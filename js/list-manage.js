/* =========================================================
 *  list-manage.js — 个人中心 · 题单管理
 *  - 顶部批量工具栏：全选 / 导入题单 / 批量下载 / 批量删除 / 新建题单
 *  - 点击摘要行平滑展开 / 收起卡片（CSS Grid 0fr → 1fr），悬停仅发光不变高
 *  - 单题单管理：进入画板 / 重命名 / 导出 / 删除
 *  - 所有内容型操作实时刷新左侧分类栏，并经 persist() 同步 Supabase
 * ========================================================= */

window.OITreeListManage = (function () {
  "use strict";

  var $ = function (id) {
    return document.getElementById(id);
  };

  /* =========================================================
   *  DOM 引用
   * ========================================================= */

  var container = null;
  var selectAllCheckbox = null;
  var selectedCountEl = null;
  var selectedInfoEl = null;
  var batchDownloadBtn = null;
  var batchDeleteBtn = null;
  var createListBtn = null;
  var importListBtn = null;
  var importListInput = null;

  var importBusy = false;
  var toastEl = null;
  var toastTimer = null;

  var nameModal = null;
  var nameForm = null;
  var nameTitleEl = null;
  var nameInput = null;
  var nameErrorEl = null;
  var nameSubmitBtn = null;
  var nameCloseBtn = null;
  var nameCancelBtn = null;

  var confirmModal = null;
  var confirmTextEl = null;
  var confirmItemsEl = null;
  var confirmErrorEl = null;
  var confirmOkBtn = null;
  var confirmCancelBtn = null;
  var confirmCloseBtn = null;

  /* =========================================================
   *  本地状态
   * ========================================================= */

  var selectedListIds = new Set();
  var expandedListIds = new Set();
  var nameModalMode = "create";
  var renameTargetId = null;
  var pendingDeleteIds = [];
  var pendingRender = false;
  var lastFocusedElement = null;

  var GAP_BETWEEN_LISTS = 140;

  var FALLBACK_DIFF_ORDER = [
    "beginner",
    "easy",
    "basic",
    "easy-medium",
    "medium",
    "hard",
    "harder",
    "noi",
    "none",
  ];

  var FALLBACK_DIFF_COLORS = {
    none: "#bfbfbf",
    beginner: "#fe4c61",
    easy: "#f39c11",
    basic: "#ffc116",
    "easy-medium": "#52c41a",
    medium: "#2578b5",
    hard: "#0e90d2",
    harder: "#9d3dcf",
    noi: "#33333a",
  };

  /* =========================================================
   *  基础工具
   * ========================================================= */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function getCategories() {
    var appState = window.state;
    return appState && Array.isArray(appState.categories)
      ? appState.categories
      : [];
  }

  function findCategory(id) {
    var cats = getCategories();
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].id === id) return cats[i];
    }
    return null;
  }

  function isPanelActive() {
    var panel = $("panel-lists");
    return !!panel && panel.classList.contains("is-active");
  }

  function isCanvasRendered() {
    var app = window.OITreeApp;
    if (!app || typeof app.isRendered !== "function") return true;
    return !!app.isRendered();
  }

  function getDifficultyInfo(key) {
    var map = window.difficultyMap;
    var info = map && typeof map.get === "function" ? map.get(key) : null;

    if (info) return info;

    return {
      value: key || "none",
      label: "暂无评定",
      accent: FALLBACK_DIFF_COLORS[key] || "#64748b",
      border: FALLBACK_DIFF_COLORS[key] || "#64748b",
    };
  }

  function getDifficultyOrder() {
    var list = window.DIFFICULTIES;
    if (Array.isArray(list) && list.length) {
      return list.map(function (item) {
        return item.value;
      });
    }
    return FALLBACK_DIFF_ORDER.slice();
  }

  /**
   * 读取题单内的节点：当前激活分类优先读取画布内存，
   * 保证刚编辑完、尚未触发持久化时列表统计也准确。
   */
  function getCategoryNodes(cat) {
    if (!cat) return [];

    var appState = window.state;
    var liveNodes = window.nodes;

    if (
      appState &&
      cat.id === appState.activeCategoryId &&
      isCanvasRendered() &&
      liveNodes &&
      typeof liveNodes.forEach === "function"
    ) {
      var live = [];
      liveNodes.forEach(function (node) {
        live.push({ id: node.id, data: node.data || {} });
      });
      return live;
    }

    return (Array.isArray(cat.nodes) ? cat.nodes : []).map(function (node) {
      return { id: node.id, data: node.data || {} };
    });
  }

  function getListStats(cat) {
    var nodes = getCategoryNodes(cat);
    var acCount = 0;
    var diffCounts = {};

    nodes.forEach(function (node) {
      var data = node.data || {};

      if (data.status === "ac") acCount += 1;

      var diff =
        typeof data.difficulty === "string" ? data.difficulty : "none";
      diffCounts[diff] = (diffCounts[diff] || 0) + 1;
    });

    return {
      nodes: nodes,
      total: nodes.length,
      acCount: acCount,
      diffCounts: diffCounts,
    };
  }

  function refreshSidebar() {
    var app = window.OITreeApp;
    if (app && typeof app.refreshSceneUI === "function") {
      app.refreshSceneUI();
      return;
    }
    if (app && typeof app.refreshSidebar === "function") {
      app.refreshSidebar();
    }
  }

  function persistSafe() {
    if (typeof window.persist === "function") window.persist();
  }

  function sanitizeName(name) {
    if (typeof window.sanitizeFilename === "function") {
      return window.sanitizeFilename(name);
    }
    return (
      String(name)
        .replace(/[\\/:*?"<>|]/g, "_")
        .trim() || "oitree"
    );
  }

  function downloadJson(payload, filename) {
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);

    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1200);
  }


  /* =========================================================
   *  卡片渲染
   * ========================================================= */

  function buildEmptyState() {
    var wrap = el("div", "lists-empty-state");

    var text = el(
      "span",
      "lists-empty-text",
      "还没有任何题单，新建一个开始整理你的算法知识树吧。"
    );

    var btn = el("button", "btn-tool btn-tool-primary", "＋ 新建第一个题单");
    btn.type = "button";
    btn.addEventListener("click", function () {
      openNameModal("create", null);
    });

    wrap.append(text, btn);
    return wrap;
  }

  function buildDifficultyBar(cat, stats) {
    var wrap = el("div", "drawer-difficulty");
    var bar = el("div", "diff-bar");
    var legend = el("div", "diff-legend");
    var order = getDifficultyOrder();
    var segments = [];

    order.forEach(function (key) {
      var count = stats.diffCounts[key] || 0;
      if (count <= 0) return;

      var info = getDifficultyInfo(key);
      var color = info.accent || FALLBACK_DIFF_COLORS[key] || "#64748b";

      var seg = el("span", "diff-bar-seg");
      seg.dataset.diff = key;
      seg.style.flex = String(count) + " 1 0";
      seg.style.background = color;
      seg.title = info.label + "：" + count + " 题";
      bar.appendChild(seg);

      var item = el("span", "diff-legend-item");
      item.dataset.diff = key;
      var dot = el("span", "diff-legend-dot");
      dot.style.background = color;
      var label = el("span", null, info.label + " " + count);
      item.append(dot, label);
      legend.appendChild(item);

      segments.push(info.label + " " + count + " 题");
    });

    if (!segments.length) {
      wrap.appendChild(bar);
      wrap.appendChild(el("span", "drawer-empty-hint", "暂无难度数据"));
      return wrap;
    }

    bar.setAttribute("role", "img");
    bar.setAttribute(
      "aria-label",
      cat.name + " 难度分布：" + segments.join("，")
    );

    wrap.append(bar, legend);
    return wrap;
  }

  function buildActionButton(action, label, className, title, catId) {
    var btn = el("button", className, label);
    btn.type = "button";
    btn.dataset.listAction = action;
    if (title) btn.title = title;

    /* 抽屉内按钮：阻止冒泡 + 直接处理动作，绝不让点击冒泡去触发展开 / 折叠 */
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      handleListAction(action, catId);
    });

    return btn;
  }

  function buildCard(cat) {
    var stats = getListStats(cat);
    var isSelected = selectedListIds.has(cat.id);

    var card = el("article", "list-manage-card");
    card.dataset.catId = cat.id;
    card.classList.toggle("is-selected", isSelected);
    card.classList.toggle("is-expanded", expandedListIds.has(cat.id));

    /* ---------- 常驻摘要行（点击展开 / 收起） ---------- */
    var summary = el("div", "card-summary-row");
    summary.setAttribute("role", "button");
    summary.setAttribute("tabindex", "0");
    summary.setAttribute(
      "aria-expanded",
      expandedListIds.has(cat.id) ? "true" : "false"
    );
    summary.title = "点击展开 / 收起题单详情";

    summary.addEventListener("keydown", function (event) {
      /* 只有摘要行自身获得焦点时才响应键盘；勾选框的 Enter / 空格交给原生行为 */
      if (event.target !== summary) return;

      if (
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "Spacebar"
      ) {
        event.preventDefault();
        event.stopPropagation();
        toggleCardExpand(card);
      }
    });

    var summaryLeft = el("div", "summary-left");

    /* 勾选热区：用 label 包裹复选框，把命中区从 16px 扩大到 24px，
     * 并拦截 click 冒泡，避免触发卡片摘要行的其他点击动作 */
    var checkboxHit = el("label", "list-checkbox-hit");
    checkboxHit.title = "勾选该题单";

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "custom-checkbox list-item-checkbox";
    checkbox.dataset.catId = cat.id;
    checkbox.checked = isSelected;
    checkbox.setAttribute("aria-label", "选择题单：" + cat.name);
    checkbox.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    checkboxHit.appendChild(checkbox);
    checkboxHit.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    var name = el("span", "list-name", cat.name);
    name.title = cat.name;

    var countTag = el("span", "count-tag", stats.total + " 题");

    summaryLeft.append(checkboxHit, name, countTag);

    var summaryRight = el("div", "summary-right");
    var acRate = el(
      "span",
      "ac-rate" + (stats.acCount === 0 ? " is-zero" : ""),
      "● AC: " + stats.acCount + "/" + stats.total
    );
    acRate.title =
      "已独立 AC " + stats.acCount + " 题，共 " + stats.total + " 题";

    var arrow = el("span", "card-arrow-icon", "▾");
    arrow.setAttribute("aria-hidden", "true");

    summaryRight.append(acRate, arrow);

    summary.append(summaryLeft, summaryRight);
    card.appendChild(summary);

    /* ---------- 点击展开抽屉 ---------- */
    var drawer = el("div", "card-expand-drawer");
    var inner = el("div", "drawer-inner");

    inner.appendChild(buildDifficultyBar(cat, stats));

    var actions = el("div", "drawer-actions-bar");
    actions.append(
      buildActionButton(
        "enter",
        "编辑",
        "btn-action-primary",
        "在画布中编辑该题单",
        cat.id
      ),
      buildActionButton(
        "rename",
        "重命名",
        "btn-action-ghost",
        "修改题单名称",
        cat.id
      ),
      buildActionButton(
        "export",
        "导出 (.oitree)",
        "btn-action-ghost",
        "将该题单导出为 .oitree",
        cat.id
      ),
      buildActionButton(
        "delete",
        "删除",
        "btn-action-danger",
        "删除该题单及其题目与连线",
        cat.id
      )
    );
    inner.appendChild(actions);

    drawer.appendChild(inner);
    card.appendChild(drawer);

    return card;
  }


  /* =========================================================
   *  渲染与选择状态
   * ========================================================= */

  function pruneSelection(cats) {
    var valid = new Set(
      cats.map(function (cat) {
        return cat.id;
      })
    );

    Array.from(selectedListIds).forEach(function (id) {
      if (!valid.has(id)) selectedListIds.delete(id);
    });

    Array.from(expandedListIds).forEach(function (id) {
      if (!valid.has(id)) expandedListIds.delete(id);
    });
  }

  function render() {
    if (!container) return;

    var cats = getCategories();
    pruneSelection(cats);

    container.replaceChildren();

    if (!cats.length) {
      container.appendChild(buildEmptyState());
    } else {
      var frag = document.createDocumentFragment();
      cats.forEach(function (cat) {
        frag.appendChild(buildCard(cat));
      });
      container.appendChild(frag);
    }

    updateBatchToolbarUI();
  }

  /* 鼠标停留在卡片列表内时延后重绘，避免重建节点打断点击/展开动画 */
  function requestRender() {
    if (!isPanelActive()) return;

    if (
      container &&
      typeof container.matches === "function" &&
      container.matches(":hover") &&
      !isAnyListModalOpen()
    ) {
      pendingRender = true;
      return;
    }

    render();
  }

  function handleContainerPointerLeave() {
    if (!pendingRender) return;
    pendingRender = false;
    render();
  }

  function syncSelectAllState() {
    if (!selectAllCheckbox) return;

    var cats = getCategories();
    var total = cats.length;
    var selected = 0;

    cats.forEach(function (cat) {
      if (selectedListIds.has(cat.id)) selected += 1;
    });

    selectAllCheckbox.disabled = total === 0;
    selectAllCheckbox.checked = total > 0 && selected === total;
    selectAllCheckbox.indeterminate = selected > 0 && selected < total;
  }

  /* 【极度关键】只更新顶部批量工具栏的局部 UI：
   * “已选 X 项”文本、批量按钮 disabled 状态、全选框的三态。
   * 绝不调用 render() / 重写 innerHTML —— 否则卡片会被重建，
   * 展开动画被打断，正在进行的点击也会因节点被替换而丢失。 */
  function updateBatchToolbarUI() {
    var count = selectedListIds.size;

    if (selectedCountEl) selectedCountEl.textContent = String(count);

    if (selectedInfoEl) {
      selectedInfoEl.classList.toggle("is-empty", count === 0);
      selectedInfoEl.setAttribute("aria-label", "已选 " + count + " 项");
    }

    if (batchDownloadBtn) batchDownloadBtn.disabled = count === 0;
    if (batchDeleteBtn) batchDeleteBtn.disabled = count === 0;

    syncSelectAllState();
  }

  function handleSelectAllChange() {
    var checked = !!(selectAllCheckbox && selectAllCheckbox.checked);
    var cats = getCategories();

    if (checked) {
      cats.forEach(function (cat) {
        selectedListIds.add(cat.id);
      });
    } else {
      selectedListIds.clear();
    }

    if (container) {
      var checkboxes = container.querySelectorAll(".list-item-checkbox");
      for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = checked;
      }

      var cards = container.querySelectorAll(".list-manage-card");
      for (var j = 0; j < cards.length; j++) {
        cards[j].classList.toggle("is-selected", checked);
      }
    }

    updateBatchToolbarUI();
  }

  /* 单个勾选框变更：只做状态更新 + 局部 UI 刷新，绝不触发全量重绘 */
  function handleCheckboxChange(event) {
    var checkbox = event.target;
    if (
      !checkbox ||
      !checkbox.classList ||
      !checkbox.classList.contains("list-item-checkbox")
    ) {
      return;
    }

    var id = checkbox.dataset.catId;
    if (!id) return;

    if (checkbox.checked) selectedListIds.add(id);
    else selectedListIds.delete(id);

    /* 仅切换当前卡片的选中描边（不重建节点） */
    var card = checkbox.closest(".list-manage-card");
    if (card) card.classList.toggle("is-selected", checkbox.checked);

    updateBatchToolbarUI();
  }

  /* 点击摘要行切换展开 / 收起（纯点击驱动，与鼠标悬停、键盘焦点均无关） */
  function toggleCardExpand(card) {
    var id = card.dataset.catId;
    if (!id) return;

    var next = !card.classList.contains("is-expanded");
    card.classList.toggle("is-expanded", next);

    if (next) expandedListIds.add(id);
    else expandedListIds.delete(id);

    syncCardExpandedState(card);
  }

  /* 同步摘要行的无障碍展开状态（只改属性，不重建任何节点） */
  function syncCardExpandedState(card) {
    var summary = card.querySelector(".card-summary-row");
    if (!summary) return;

    var expanded = card.classList.contains("is-expanded");
    summary.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function getSelectedCategories() {
    var cats = getCategories();
    return cats.filter(function (cat) {
      return selectedListIds.has(cat.id);
    });
  }


  /* =========================================================
   *  卡片交互（事件委托）
   * ========================================================= */

  function handleContainerClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var actionBtn = target.closest("[data-list-action]");
    if (actionBtn && container.contains(actionBtn)) {
      var actionCard = actionBtn.closest(".list-manage-card");
      if (!actionCard) return;

      event.preventDefault();
      event.stopPropagation();

      handleListAction(actionBtn.dataset.listAction, actionCard.dataset.catId);
      return;
    }

    /* 勾选框 / 勾选热区不参与卡片点击逻辑（触屏下的展开切换也要跳过） */
    if (
      target.closest(".list-item-checkbox") ||
      target.closest(".list-checkbox-hit")
    ) {
      return;
    }

    /* 点击摘要行（标题 / 空白 / 箭头）切换展开 / 收起 */
    var summary = target.closest(".card-summary-row");
    if (summary) {
      var card = summary.closest(".list-manage-card");
      if (!card) return;

      event.preventDefault();
      toggleCardExpand(card);
    }
  }

  function handleListAction(action, catId) {
    var cat = findCategory(catId);
    if (!cat) return;

    if (action === "enter") {
      enterCanvas(cat);
    } else if (action === "rename") {
      openNameModal("rename", cat);
    } else if (action === "export") {
      exportSingleList(cat);
    } else if (action === "delete") {
      openDeleteConfirm([cat.id]);
    }
  }

  function enterCanvas(cat) {
    var dashboard = window.OITreeDashboard;
    if (!dashboard || typeof dashboard.showCanvas !== "function") return;

    dashboard.showCanvas({ focus: { categoryId: cat.id } });
  }

  function exportSingleList(cat) {
    if (typeof window.exportCategory === "function") {
      window.exportCategory(cat);
      return;
    }

    var payload = buildBatchPayload([cat]);
    payload.name = cat.name;
    downloadJson(payload, sanitizeName(cat.name) + ".oitree");
  }


  /* =========================================================
   *  批量下载（合并所选题目与连线 → 单个 .oitree）
   * ========================================================= */

  function buildBatchPayload(cats) {
    if (
      isCanvasRendered() &&
      typeof window.syncActiveCategoryFromScene === "function"
    ) {
      window.syncActiveCategoryFromScene();
    }

    var nodeW = typeof window.NODE_W === "number" ? window.NODE_W : 200;
    var nodeH = typeof window.NODE_H === "number" ? window.NODE_H : 128;

    var mergedNodes = [];
    var mergedEdges = [];
    var mergedTopicNames = {};
    var categoriesPayload = [];
    var edgeSeen = new Set();
    var nextId = 1;
    var cursorY = 0;

    cats.forEach(function (cat) {
      var srcNodes = (Array.isArray(cat.nodes) ? cat.nodes : []).map(
        function (node) {
          var data =
            node.data && typeof node.data === "object"
              ? Object.assign({}, node.data)
              : {};

          if (typeof window.normalizeNodeTimes === "function") {
            data = window.normalizeNodeTimes(data);
          }

          return {
            id: Number(node.id),
            x: Number.isFinite(Number(node.x)) ? Number(node.x) : 0,
            y: Number.isFinite(Number(node.y)) ? Number(node.y) : 0,
            data: data,
          };
        }
      );

      var srcEdges = (Array.isArray(cat.edges) ? cat.edges : []).map(
        function (edge) {
          return { from: Number(edge.from), to: Number(edge.to) };
        }
      );

      var minX = Infinity;
      var maxX = -Infinity;
      var minY = Infinity;
      var maxY = -Infinity;

      srcNodes.forEach(function (node) {
        minX = Math.min(minX, node.x - nodeW / 2);
        maxX = Math.max(maxX, node.x + nodeW / 2);
        minY = Math.min(minY, node.y - nodeH / 2);
        maxY = Math.max(maxY, node.y + nodeH / 2);
      });

      var hasGeometry = srcNodes.length > 0;
      var offsetX = hasGeometry ? -minX : 0;
      var offsetY = hasGeometry ? cursorY - minY : 0;

      if (hasGeometry) cursorY += maxY - minY + GAP_BETWEEN_LISTS;

      var idMap = {};
      var maxSourceId = 0;

      srcNodes.forEach(function (node) {
        var sourceId = node.id;
        if (!Number.isFinite(sourceId)) return;

        var newId = nextId;
        nextId += 1;

        idMap[sourceId] = newId;
        maxSourceId = Math.max(maxSourceId, sourceId);

        mergedNodes.push({
          id: newId,
          x: node.x + offsetX,
          y: node.y + offsetY,
          data: Object.assign({}, node.data),
        });
      });

      /* 单个题单保留原始 ID / 原始连线，便于按题单还原 */
      var sourceIdSet = new Set(
        srcNodes.map(function (node) {
          return node.id;
        })
      );

      var cleanSourceEdges = [];
      var sourceEdgeSeen = new Set();

      srcEdges.forEach(function (edge) {
        if (
          !sourceIdSet.has(edge.from) ||
          !sourceIdSet.has(edge.to) ||
          edge.from === edge.to
        ) {
          return;
        }

        var sourceKey = edge.from + "->" + edge.to;
        if (sourceEdgeSeen.has(sourceKey)) return;
        sourceEdgeSeen.add(sourceKey);

        cleanSourceEdges.push({ from: edge.from, to: edge.to });

        /* 合并视图需要重映射 ID，避免不同题单的节点 ID 冲突 */
        var from = idMap[edge.from];
        var to = idMap[edge.to];

        if (from === undefined || to === undefined || from === to) return;

        var key = from + "->" + to;
        if (edgeSeen.has(key)) return;
        edgeSeen.add(key);

        mergedEdges.push({ from: from, to: to });
      });

      var categoryTopicNames = {};
      var sourceTopicNames =
        cat.topicNames && typeof cat.topicNames === "object"
          ? cat.topicNames
          : {};

      Object.keys(sourceTopicNames).forEach(function (rawKey) {
        var value = sourceTopicNames[rawKey];
        if (typeof value !== "string" || !value.trim()) return;

        categoryTopicNames[String(rawKey)] = value;

        var mappedKey = idMap[Number(rawKey)];
        if (mappedKey !== undefined) mergedTopicNames[mappedKey] = value;
      });

      categoriesPayload.push({
        name: cat.name,
        author: cat.author || "",
        luoguUrl: cat.luoguUrl || "",
        description: cat.description || "",
        nodeCount: maxSourceId,
        topicNames: categoryTopicNames,
        nodes: srcNodes.map(function (node) {
          return {
            id: node.id,
            x: node.x,
            y: node.y,
            data: Object.assign({}, node.data),
          };
        }),
        edges: cleanSourceEdges,
      });
    });

    return {
      format: "oitree",
      version: 2,
      kind: "batch",
      exportedAt: new Date().toISOString(),
      name: "题单合集",
      author: "",
      luoguUrl: "",
      description:
        "由 oitree 题单管理批量导出，共 " + cats.length + " 个题单。",
      nodeCount: nextId - 1,
      topicNames: mergedTopicNames,
      nodes: mergedNodes,
      edges: mergedEdges,
      categories: categoriesPayload,
    };
  }

  function handleBatchDownload() {
    var cats = getSelectedCategories();
    if (!cats.length) return;

    var payload = buildBatchPayload(cats);
    var baseName =
      cats.length === 1
        ? "题单合集_" + cats[0].name
        : "题单合集_" + cats.length + "个题单";

    downloadJson(payload, sanitizeName(baseName) + ".oitree");
  }


  /* =========================================================
   *  导入题单（.oitree / .json → 合并追加）
   * ========================================================= */

  function showToast(message, type) {
    if (!message) return;

    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "list-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;
    toastEl.className = "list-toast is-" + (type || "info");

    /* 强制回流，确保连续 Toast 仍能重新播放淡入动画 */
    void toastEl.offsetWidth;
    toastEl.classList.add("is-visible");

    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      if (toastEl) toastEl.classList.remove("is-visible");
      toastTimer = null;
    }, 2800);
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function () {
        resolve(String(reader.result || ""));
      };

      reader.onerror = function () {
        reject(new Error("文件读取失败，请重试"));
      };

      reader.readAsText(file, "UTF-8");
    });
  }

  function getImportFileBaseName(fileName) {
    return String(fileName || "")
      .replace(/\.(oitree|json)$/i, "")
      .trim();
  }

  function hasCategoryName(name) {
    return getCategories().some(function (cat) {
      return cat.name === name;
    });
  }

  function uniqueImportedCategoryName(base) {
    var name = String(base || "").trim() || "导入的题单";
    if (!hasCategoryName(name)) return name;

    var candidate = name + " (导入)";
    var index = 2;
    while (hasCategoryName(candidate)) {
      candidate = name + " (导入 " + index + ")";
      index += 1;
    }
    return candidate;
  }

  function normalizeImportEntry(entry, fallbackName) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("题单数据结构无效");
    }

    if (!Array.isArray(entry.nodes)) {
      throw new Error("题单缺少 nodes 题目列表，可能不是有效的 .oitree 文件");
    }

    var normalizeNode =
      typeof window.normalizeImportedNode === "function"
        ? window.normalizeImportedNode
        : null;
    var normalizeEdges =
      typeof window.normalizeImportedEdges === "function"
        ? window.normalizeImportedEdges
        : null;
    var normalizeTopicNames =
      typeof window.normalizeImportedTopicNames === "function"
        ? window.normalizeImportedTopicNames
        : null;

    if (!normalizeNode || !normalizeEdges || !normalizeTopicNames) {
      throw new Error("导入功能未就绪，请刷新页面后重试");
    }

    var nodes = [];
    var seenIds = new Set();

    entry.nodes.forEach(function (raw) {
      var node = normalizeNode(raw);
      if (!node || seenIds.has(node.id)) return;
      seenIds.add(node.id);
      nodes.push(node);
    });

    if (entry.nodes.length > 0 && nodes.length === 0) {
      throw new Error("题单中没有有效的题目节点数据");
    }

    var nodeIds = new Set(
      nodes.map(function (node) {
        return node.id;
      })
    );

    var entryName = typeof entry.name === "string" ? entry.name.trim() : "";
    var name = entryName || fallbackName || "导入的题单";

    return {
      name: name,
      nodes: nodes,
      edges: normalizeEdges(entry.edges, nodeIds),
      topicNames: normalizeTopicNames(entry.topicNames),
      nodeCount: nodes.reduce(function (max, node) {
        return Math.max(max, node.id);
      }, 0),
      meta: {
        author: typeof entry.author === "string" ? entry.author : "",
        luoguUrl: typeof entry.luoguUrl === "string" ? entry.luoguUrl : "",
        description:
          typeof entry.description === "string" ? entry.description : "",
      },
    };
  }

  function buildImportEntries(payload, fileBaseName) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("文件内容不是有效的 JSON 对象");
    }

    if (Array.isArray(payload.categories) && payload.categories.length) {
      var fallbackBase =
        typeof payload.name === "string" && payload.name.trim()
          ? payload.name.trim()
          : "导入的题单";

      return payload.categories.map(function (entry, index) {
        return normalizeImportEntry(
          entry,
          fallbackBase + " " + (index + 1)
        );
      });
    }

    if (Array.isArray(payload.nodes)) {
      return [normalizeImportEntry(payload, fileBaseName || "导入的题单")];
    }

    throw new Error(
      "文件中缺少 categories 或 nodes 题单结构，可能不是有效的 .oitree 文件"
    );
  }

  function applyImportedEntries(entries) {
    var appState = window.state;
    if (!appState || !Array.isArray(appState.categories)) {
      throw new Error("题库状态未就绪，请刷新页面后重试");
    }

    if (typeof window.syncActiveCategoryFromScene === "function") {
      window.syncActiveCategoryFromScene();
    }

    var layoutVersion =
      typeof window.CATEGORY_LAYOUT_VERSION === "number"
        ? window.CATEGORY_LAYOUT_VERSION
        : 5;

    entries.forEach(function (item) {
      var name = uniqueImportedCategoryName(item.name);
      var cat = null;

      if (typeof window.createCategory === "function") {
        cat = window.createCategory(name, item.meta);
      } else {
        cat = {
          id:
            "cat_" +
            Date.now().toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 7),
          name: name,
          author: item.meta.author,
          luoguUrl: item.meta.luoguUrl,
          description: item.meta.description,
          nodes: [],
          edges: [],
          topicNames: {},
          view: { x: 0, y: 0, scale: 1 },
          nodeCount: 0,
          layoutVersion: layoutVersion,
        };
      }

      cat.nodes = item.nodes;
      cat.edges = item.edges;
      cat.topicNames = item.topicNames;
      cat.nodeCount = item.nodeCount;
      cat.layoutVersion = layoutVersion;

      appState.categories.push(cat);
    });

    return entries.length;
  }

  function handleImportListFile(file) {
    if (!file || importBusy) return;

    if (!/\.(oitree|json)$/i.test(String(file.name || ""))) {
      showToast("仅支持 .oitree 或 .json 文件", "error");
      return;
    }

    importBusy = true;
    var originalText = importListBtn
      ? importListBtn.textContent.trim()
      : "导入题单";

    if (importListBtn) {
      importListBtn.disabled = true;
      importListBtn.textContent = "导入中...";
    }

    readFileAsText(file)
      .then(function (text) {
        var payload;

        try {
          payload = JSON.parse(text);
        } catch (err) {
          throw new Error("文件不是有效的 JSON 格式");
        }

        var entries = buildImportEntries(
          payload,
          getImportFileBaseName(file.name)
        );

        var count = applyImportedEntries(entries);

        refreshSidebar();
        persistSafe();
        render();

        showToast(
          count > 1
            ? "题单导入成功（共 " + count + " 个）"
            : "题单导入成功",
          "success"
        );
      })
      .catch(function (err) {
        console.error("[oitree] 题单导入失败：", err);
        showToast(
          "导入失败：" + (err && err.message ? err.message : "请检查文件格式"),
          "error"
        );
      })
      .then(function () {
        importBusy = false;
        if (importListBtn) {
          importListBtn.disabled = false;
          importListBtn.textContent = originalText || "导入题单";
        }
      });
  }


  /* =========================================================
   *  删除（单个 / 批量，二次确认）
   * ========================================================= */

  function openDeleteConfirm(ids) {
    var cats = [];

    ids.forEach(function (id) {
      var cat = findCategory(id);
      if (cat) cats.push(cat);
    });

    if (!cats.length) return;

    pendingDeleteIds = cats.map(function (cat) {
      return cat.id;
    });

    if (confirmTextEl) {
      confirmTextEl.textContent =
        "确认删除以下 " +
        cats.length +
        " 个题单吗？题单内的题目与连线会被一并清空，且无法撤销。";
    }

    if (confirmItemsEl) {
      confirmItemsEl.replaceChildren();

      cats.forEach(function (cat) {
        var li = el("li", "list-confirm-item");
        var name = el("span", "list-confirm-item-name", cat.name);
        var count = el(
          "span",
          "list-confirm-item-count",
          getListStats(cat).total + " 题"
        );
        li.append(name, count);
        confirmItemsEl.appendChild(li);
      });
    }

    if (confirmErrorEl) {
      confirmErrorEl.textContent = "";
      confirmErrorEl.hidden = true;
    }

    openModal(confirmModal);
  }

  function showConfirmError(message) {
    if (!confirmErrorEl) return;
    confirmErrorEl.textContent = message;
    confirmErrorEl.hidden = false;
  }

  function handleConfirmDelete() {
    var appState = window.state;
    if (!appState || !Array.isArray(appState.categories)) return;

    var idSet = new Set(pendingDeleteIds);
    var remaining = appState.categories.filter(function (cat) {
      return !idSet.has(cat.id);
    });

    if (!remaining.length) {
      showConfirmError("至少需要保留一个题单，无法删除全部题单。");
      return;
    }

    var activeDeleted = idSet.has(appState.activeCategoryId);

    if (
      activeDeleted &&
      isCanvasRendered() &&
      typeof window.syncActiveCategoryFromScene === "function"
    ) {
      window.syncActiveCategoryFromScene();
    }

    appState.categories = remaining;

    if (activeDeleted) {
      appState.activeCategoryId = remaining[0].id;

      if (
        window.OITreeCanvas &&
        typeof window.OITreeCanvas.loadActiveCategory === "function"
      ) {
        window.OITreeCanvas.loadActiveCategory({ autoFocusFirst: true });
      }
    }

    pendingDeleteIds.forEach(function (id) {
      selectedListIds.delete(id);
      expandedListIds.delete(id);
    });
    pendingDeleteIds = [];

    closeModal(confirmModal);
    refreshSidebar();
    persistSafe();
    render();
  }

  /* =========================================================
   *  新建 / 重命名
   * ========================================================= */

  function openNameModal(mode, cat) {
    nameModalMode = mode === "rename" ? "rename" : "create";
    renameTargetId = cat ? cat.id : null;

    if (nameTitleEl) {
      nameTitleEl.textContent =
        nameModalMode === "rename" ? "重命名题单" : "新建题单";
    }

    if (nameSubmitBtn) {
      nameSubmitBtn.textContent = nameModalMode === "rename" ? "保存" : "创建";
    }

    if (nameInput) {
      nameInput.value = cat ? cat.name : "";
      nameInput.placeholder =
        nameModalMode === "rename" ? "输入新的题单名称" : "例如：贪心";
      nameInput.classList.remove("is-invalid");
    }

    if (nameErrorEl) {
      nameErrorEl.textContent = "";
      nameErrorEl.hidden = true;
    }

    openModal(nameModal);

    window.requestAnimationFrame(function () {
      if (!nameInput) return;
      nameInput.focus();
      if (nameInput.select) nameInput.select();
    });
  }

  function showNameError(message) {
    if (nameErrorEl) {
      nameErrorEl.textContent = message;
      nameErrorEl.hidden = false;
    }
    if (nameInput) {
      nameInput.classList.add("is-invalid");
      nameInput.focus();
    }
  }

  function clearNameError() {
    if (nameInput) nameInput.classList.remove("is-invalid");
    if (nameErrorEl) {
      nameErrorEl.textContent = "";
      nameErrorEl.hidden = true;
    }
  }

  function createCategorySafe(name) {
    if (typeof window.createCategory === "function") {
      return window.createCategory(name);
    }

    return {
      id:
        "cat_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 7),
      name: name,
      author: "",
      luoguUrl: "",
      description: "",
      nodes: [],
      edges: [],
      topicNames: {},
      view: { x: 0, y: 0, scale: 1 },
      nodeCount: 0,
      layoutVersion:
        typeof window.CATEGORY_LAYOUT_VERSION === "number"
          ? window.CATEGORY_LAYOUT_VERSION
          : 5,
    };
  }

  function handleNameSubmit(event) {
    event.preventDefault();

    var value = nameInput ? nameInput.value.trim() : "";

    if (!value) {
      showNameError("请输入题单名称。");
      return;
    }

    if (value.length > 24) {
      showNameError("题单名称不能超过 24 个字符。");
      return;
    }

    var cats = getCategories();
    var duplicated = cats.some(function (cat) {
      return cat.name === value && cat.id !== renameTargetId;
    });

    if (duplicated) {
      showNameError("已存在同名题单，请换一个名称。");
      return;
    }

    if (nameModalMode === "rename") {
      var cat = findCategory(renameTargetId);
      if (!cat) {
        closeModal(nameModal);
        return;
      }

      cat.name = value;

      if (
        window.OITreeCanvas &&
        typeof window.OITreeCanvas.updateCanvasInfo === "function"
      ) {
        window.OITreeCanvas.updateCanvasInfo();
      }
    } else {
      if (
        isCanvasRendered() &&
        typeof window.syncActiveCategoryFromScene === "function"
      ) {
        window.syncActiveCategoryFromScene();
      }

      cats.push(createCategorySafe(value));
    }

    closeModal(nameModal);
    refreshSidebar();
    persistSafe();
    render();
  }


  /* =========================================================
   *  弹窗通用
   * ========================================================= */

  function isAnyListModalOpen() {
    return !!(
      (nameModal && !nameModal.hidden) ||
      (confirmModal && !confirmModal.hidden)
    );
  }

  function openModal(modal) {
    if (!modal) return;

    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    if (!modal || modal.hidden) return;

    modal.hidden = true;

    if (!isAnyListModalOpen()) {
      var otherIds = [
        "modal",
        "cat-modal",
        "topic-modal",
        "zen-modal",
        "reader-modal",
        "auth-modal",
      ];

      var otherOpen = otherIds.some(function (id) {
        var node = $(id);
        return node && !node.hidden;
      });

      if (!otherOpen) document.body.classList.remove("modal-open");
    }

    if (
      lastFocusedElement &&
      typeof lastFocusedElement.focus === "function"
    ) {
      try {
        lastFocusedElement.focus();
      } catch (_) {
        /* 忽略已移除节点的聚焦异常 */
      }
    }
    lastFocusedElement = null;
  }

  function handleDocumentKeydown(event) {
    if (event.key !== "Escape" || !isAnyListModalOpen()) return;

    event.preventDefault();
    event.stopPropagation();

    if (confirmModal && !confirmModal.hidden) {
      closeModal(confirmModal);
      return;
    }

    if (nameModal && !nameModal.hidden) closeModal(nameModal);
  }

  /* =========================================================
   *  事件绑定
   * ========================================================= */

  function bindEvents() {
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener("change", handleSelectAllChange);
    }

    if (importListBtn) {
      importListBtn.addEventListener("click", function () {
        if (importListInput) importListInput.click();
      });
    }

    if (importListInput) {
      importListInput.addEventListener("change", function (event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (file) handleImportListFile(file);
      });
    }

    if (batchDownloadBtn) {
      batchDownloadBtn.addEventListener("click", handleBatchDownload);
    }

    if (batchDeleteBtn) {
      batchDeleteBtn.addEventListener("click", function () {
        var cats = getSelectedCategories();
        if (!cats.length) return;

        openDeleteConfirm(
          cats.map(function (cat) {
            return cat.id;
          })
        );
      });
    }

    if (createListBtn) {
      createListBtn.addEventListener("click", function () {
        openNameModal("create", null);
      });
    }

    if (container) {
      container.addEventListener("click", handleContainerClick);
      container.addEventListener("change", handleCheckboxChange);
      container.addEventListener("pointerleave", handleContainerPointerLeave);
    }

    /* 新建 / 重命名弹窗 */
    if (nameForm) nameForm.addEventListener("submit", handleNameSubmit);

    if (nameInput) {
      nameInput.addEventListener("input", clearNameError);
    }

    if (nameCloseBtn) {
      nameCloseBtn.addEventListener("click", function () {
        closeModal(nameModal);
      });
    }

    if (nameCancelBtn) {
      nameCancelBtn.addEventListener("click", function () {
        closeModal(nameModal);
      });
    }

    if (nameModal) {
      nameModal.addEventListener("mousedown", function (event) {
        if (event.target === nameModal) closeModal(nameModal);
      });
    }

    /* 删除确认弹窗 */
    if (confirmOkBtn) {
      confirmOkBtn.addEventListener("click", handleConfirmDelete);
    }

    if (confirmCancelBtn) {
      confirmCancelBtn.addEventListener("click", function () {
        closeModal(confirmModal);
      });
    }

    if (confirmCloseBtn) {
      confirmCloseBtn.addEventListener("click", function () {
        closeModal(confirmModal);
      });
    }

    if (confirmModal) {
      confirmModal.addEventListener("mousedown", function (event) {
        if (event.target === confirmModal) closeModal(confirmModal);
      });
    }

    document.addEventListener("keydown", handleDocumentKeydown);

    /* 本地保存 / 云端数据应用 / 画布拓扑变化后刷新卡片 */
    ["oitree:persist", "oitree:graph-changed", "oitree:state-applied"].forEach(
      function (eventName) {
        window.addEventListener(eventName, requestRender);
      }
    );
  }

  /* =========================================================
   *  初始化
   * ========================================================= */

  function init() {
    container = $("manage-lists-container");
    if (!container) return;

    selectAllCheckbox = $("select-all-lists");
    selectedCountEl = $("selected-count");
    selectedInfoEl = $("selected-info");
    batchDownloadBtn = $("btn-batch-download");
    batchDeleteBtn = $("btn-batch-delete");
    createListBtn = $("btn-create-list");
    importListBtn = $("btn-import-list");
    importListInput = $("list-import-input");

    nameModal = $("list-name-modal");
    nameForm = $("list-name-form");
    nameTitleEl = $("list-name-title");
    nameInput = $("list-name-input");
    nameErrorEl = $("list-name-error");
    nameSubmitBtn = $("list-name-submit");
    nameCloseBtn = $("list-name-close");
    nameCancelBtn = $("list-name-cancel");

    confirmModal = $("list-confirm-modal");
    confirmTextEl = $("list-confirm-text");
    confirmItemsEl = $("list-confirm-items");
    confirmErrorEl = $("list-confirm-error");
    confirmOkBtn = $("list-confirm-ok");
    confirmCancelBtn = $("list-confirm-cancel");
    confirmCloseBtn = $("list-confirm-close");

    bindEvents();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    refresh: render,
    importFile: handleImportListFile,
    getSelectedIds: function () {
      return Array.from(selectedListIds);
    },
  };
})();

