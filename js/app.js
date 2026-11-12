/* =========================================================
 *  app.js — 应用主入口
 *  - DOM 引用汇总与模块绑定
 *  - 侧边栏分类目录渲染、拖拽排序、CRUD
 *  - 右侧抽屉题目列表渲染与排序
 *  - 🔦 全局搜索 + 难度筛选 + 聚光灯联动
 *  - 📖 阅读视图接线
 *  - 🎨 顶部难度筛选下拉框动态变色
 *  - 全局键盘事件（Ctrl+K / / / Esc / Space / Delete）
 *  - Bootstrap 启动
 * ========================================================= */

"use strict";

(function () {
  /* =========================================================
   *  便捷引用
   * ========================================================= */

  var $ = function (id) { return document.getElementById(id); };

  var CanvasAPI = window.OITreeCanvas;
  var EditorAPI = window.OITreeEditor;

  /* =========================================================
   *  DOM 引用
   * ========================================================= */

  var sidebar = $("sidebar");
  var sidebarToggle = $("sidebar-toggle");
  var categoryList = $("category-list");
  var addCategoryBtn = $("add-category");
  var importCategoryBtn = $("import-category");
  var importInput = $("import-input");

  var canvasEl = $("canvas");
  var linksSvg = $("links");
  var linksLayerEl = $("links-layer");
  var previewLayerEl = $("preview-layer");
  var worldEl = $("world");
  var addButton = $("add-node");
  var cleanViewButton = $("btn-clean-view");
  var zoomBadge = $("zoom-badge");
  var zoomValueEl = $("zoom-value");
  var arrowMarkerEl = $("arrow");

  /* 🔦 搜索相关 DOM */
  var searchInput = $("search-input");
  var searchClearBtn = $("search-clear");
  var difficultyFilter = $("difficulty-filter");

  var drawer = $("drawer");
  var drawerToggle = $("drawer-toggle");
  var drawerCloseBtn = $("drawer-close");
  var drawerBackdrop = $("drawer-backdrop");
  var drawerCategoryName = $("drawer-category-name");
  var drawerCount = $("drawer-count");
  var drawerList = $("drawer-list");
  var drawerSortSelect = $("drawer-sort-select");

  var modal = $("modal");
  var modalTitle = $("modal-title");
  var modalCreateTime = $("modal-create-time");
  var modalCloseBtn = $("modal-close");
  var modalCancelBtn = $("modal-cancel");
  var modalDeleteBtn = $("modal-delete");
  var form = $("problem-form");
  var titleInput = $("field-title");
  var difficultySelect = $("field-difficulty");
  var tagsInput = $("field-tags");
  var linkInput = $("field-link");
  var completedInput = $("field-completed");
  var noteInput = $("field-note");

  var catModal = $("cat-modal");
  var catModalTitle = $("cat-modal-title");
  var catModalCloseBtn = $("cat-modal-close");
  var catModalCancelBtn = $("cat-modal-cancel");
  var catModalSubmitBtn = $("cat-modal-submit");
  var catModalDeleteBtn = $("cat-modal-delete");
  var catForm = $("cat-form");
  var catNameInput = $("cat-field-name");
  var catAuthorInput = $("cat-field-author");
  var catLuoguInput = $("cat-field-luogu");
  var catDescInput = $("cat-field-desc");

  /* 🏷️ 连通块专题重命名弹窗 */
  var topicModal = $("topic-modal");
  var topicForm = $("topic-form");
  var topicModalCloseBtn = $("topic-modal-close");
  var topicModalCancelBtn = $("topic-modal-cancel");
  var topicFieldLabel = $("topic-field-label");
  var topicFieldName = $("topic-field-name");
  var topicFieldHint = $("topic-field-hint");

  var readerModal = $("reader-modal");

  /* 根题目导航面板 */
  var rootNav = $("root-nav");
  var rootNavList = $("root-nav-list");
  var rootNavReset = $("root-nav-reset");
  var rootNavPopover = $("root-nav-popover");

  /* =========================================================
   *  模块 DOM 绑定
   * ========================================================= */

  CanvasAPI.bindCanvasDom({
    canvas: canvasEl,
    world: worldEl,
    linksLayer: linksLayerEl,
    previewLayer: previewLayerEl,
    arrowMarker: arrowMarkerEl,
    zoomValue: zoomValueEl,
  });

  CanvasAPI.bindCanvasInfoDom({
    canvasInfo: $("canvas-info"),
    canvasInfoHeader: $("canvas-info-header"),
    canvasInfoIcon: $("canvas-info-icon"),
    canvasInfoHeaderText: $("canvas-info-header-text"),
    canvasInfoChevron: $("canvas-info-chevron"),
    canvasInfoDetail: $("canvas-info-detail"),
    canvasInfoAuthorLine: $("canvas-info-author-line"),
    canvasInfoAuthor: $("canvas-info-author"),
    canvasInfoLuoguDot: $("canvas-info-luogu-dot"),
    canvasInfoLuogu: $("canvas-info-luogu"),
    canvasInfoDescRow: $("canvas-info-desc-row"),
    canvasInfoToggle: $("canvas-info-toggle"),
    canvasInfoToggleIcon: $("canvas-info-toggle-icon"),
    canvasInfoToggleText: $("canvas-info-toggle-text"),
    canvasInfoDesc: $("canvas-info-desc"),
  });

  EditorAPI.bindEditorDom({
    modal: modal,
    modalTitle: modalTitle,
    modalCreateTime: modalCreateTime,
    modalCloseBtn: modalCloseBtn,
    modalCancelBtn: modalCancelBtn,
    modalDeleteBtn: modalDeleteBtn,
    form: form,
    titleInput: titleInput,
    difficultySelect: difficultySelect,
    tagsInput: tagsInput,
    linkInput: linkInput,
    completedInput: completedInput,
    noteInput: noteInput,
    noteTabEdit: $("note-tab-edit"),
    noteTabPreview: $("note-tab-preview"),
    notePreview: $("note-preview"),
    noteExpandBtn: $("note-expand-btn"),
    catDescTabEdit: $("cat-desc-tab-edit"),
    catDescTabPreview: $("cat-desc-tab-preview"),
    catDescPreview: $("cat-desc-preview"),
    catDescInput: catDescInput,
    catDescExpandBtn: $("cat-desc-expand-btn"),
    catNameInput: catNameInput,
    zenModal: $("zen-modal"),
    zenTitle: $("zen-title"),
    zenSubtitle: $("zen-subtitle"),
    zenInput: $("zen-input"),
    zenPreview: $("zen-preview"),
    zenCloseBtn: $("zen-close"),
    zenCancelBtn: $("zen-cancel"),
    zenSaveBtn: $("zen-save"),

    readerModal: readerModal,
    readerTitle: $("reader-title"),
    readerDifficulty: $("reader-difficulty"),
    readerStatus: $("reader-status"),
    readerTags: $("reader-tags"),
    readerCreated: $("reader-created"),
    readerCompleted: $("reader-completed"),
    readerBody: $("reader-body"),
    readerEditBtn: $("reader-edit"),
    readerCloseBtn: $("reader-close"),
  });

  /* =========================================================
   *  侧边栏拖拽状态
   * ========================================================= */

  var dragSrcId = null;
  var dragOverId = null;
  var dragOverPos = null;

  var catModalMode = "edit";
  /* 当前正在重命名的连通块专题：{ componentKey, topicKey, defaultName } */
  var topicRenameTarget = null;

  /* 工作台是否已完成首次渲染（登录 / 会话恢复期间保持 false） */
  var workspaceRendered = false;

  /* =========================================================
   *  场景变化时的刷新
   * ========================================================= */

  function refreshSceneUI() {
    renderSidebar();
    renderDrawer();
    runSearch();
    buildRootNav();
  }

  CanvasAPI.setOnSceneChange(refreshSceneUI);
  EditorAPI.setEditorOnSceneChange(refreshSceneUI);

  /* 工作台首次渲染：只做一次，保证“云端数据就绪 → 一次性挂载 DOM”。
   * 之后云端数据再次应用（重试 / 多端同步）才做增量刷新。 */
  function renderWorkspace(autoFocusFirst) {
    workspaceRendered = true;

    CanvasAPI.loadActiveCategory({ autoFocusFirst: !!autoFocusFirst });
    refreshSceneUI();
    CanvasAPI.applyView();
    CanvasAPI.updateCanvasInfo();
  }

  /* 渲染并等待浏览器完成首帧绘制（连续两帧 + 兜底定时器） */
  function renderWorkspaceAndWait() {
    renderWorkspace(true);

    return new Promise(function (resolve) {
      var settled = false;

      function done() {
        if (settled) return;
        settled = true;
        resolve();
      }

      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(done);
        });
      }

      /* 后台标签页 rAF 不触发时的兜底 */
      window.setTimeout(done, 600);
    });
  }

  /* ☁️ 云端数据应用后：已渲染过的工作台做刷新；
   * 首次渲染由登录 / 会话恢复流程在数据就绪后统一触发（OITreeApp.renderWorkspaceAndWait），
   * 避免默认分类 / 空白画布先闪一下再被真实数据推翻重绘。 */
  window.addEventListener("oitree:state-applied", function () {
    if (!workspaceRendered) return;
    /* 云端刷新只做增量重绘，不打断用户当前过滤与视角 */
    renderWorkspace(false);
  });

  CanvasAPI.setNodeClickHandler(EditorAPI.openProblemModal);
  CanvasAPI.setNoteClickHandler(EditorAPI.openReaderModal);

  EditorAPI.bindProblemFormEvents();
  EditorAPI.populateDifficultyOptions();

  /* =========================================================
   *  🎨 工具栏难度筛选：填充选项 + 动态变色
   * ========================================================= */

  function syncDifficultyFilterColor() {
    if (!difficultyFilter) return;

    var value = difficultyFilter.value;

    if (!value) {
      /* 「全部难度」 → 恢复默认文字色 */
      difficultyFilter.style.color = "";
      difficultyFilter.style.borderColor = "";
      return;
    }

    var info = difficultyMap.get(value);
    if (!info) return;

    difficultyFilter.style.color = info.border;
    difficultyFilter.style.borderColor = hexToRgba(info.border, 0.55);
  }

  function populateDifficultyFilter() {
    if (!difficultyFilter) return;

    difficultyFilter.replaceChildren();

    var defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = "全部难度";
    defOpt.style.color = "#e8eef7";
    defOpt.style.background = "#101827";
    difficultyFilter.appendChild(defOpt);

    difficultyMap.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d.value;
      opt.textContent = d.label;

      opt.style.color = d.border;
      opt.style.background = "#101827";
      opt.style.fontWeight = "650";

      difficultyFilter.appendChild(opt);
    });

    difficultyFilter.value = "";

    if (!difficultyFilter.__oitreeColorBound) {
      difficultyFilter.__oitreeColorBound = true;
      difficultyFilter.addEventListener("change", function () {
        syncDifficultyFilterColor();
        runSearch();
      });
    }

    syncDifficultyFilterColor();
  }

  populateDifficultyFilter();

  /* =========================================================
   *  🔦 全局搜索与聚光灯
   * ========================================================= */

  function readSearchQuery() {
    var q = (searchInput && searchInput.value ? searchInput.value : "")
      .trim()
      .toLowerCase();
    var diff = (difficultyFilter && difficultyFilter.value) || "";
    return {
      q: q,
      diff: diff,
      active: q.length > 0 || diff.length > 0,
    };
  }

  function runSearch() {
    var query = readSearchQuery();

    if (searchClearBtn) searchClearBtn.hidden = !query.active;

    if (!query.active) {
      CanvasAPI.clearSpotlight();
      return;
    }

    var matched = new Set();

    nodes.forEach(function (node) {
      var data = node.data || {};
      var title = (data.title || "").toLowerCase();
      var tags = (data.tags || "").toLowerCase();
      var difficulty = data.difficulty || "none";

      var kwOk =
        query.q.length === 0 ||
        title.indexOf(query.q) !== -1 ||
        tags.indexOf(query.q) !== -1;

      var diffOk =
        query.diff.length === 0 || difficulty === query.diff;

      if (kwOk && diffOk) matched.add(node.id);
    });

    CanvasAPI.applySpotlight(matched);
  }

  function clearSearch(focusBack) {
    if (searchInput) searchInput.value = "";
    if (difficultyFilter) difficultyFilter.value = "";
    if (searchClearBtn) searchClearBtn.hidden = true;

    /* 🎨 恢复筛选框默认颜色 */
    syncDifficultyFilterColor();

    CanvasAPI.clearSpotlight();

    if (focusBack && searchInput) {
      searchInput.focus();
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", runSearch);
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", function () {
      clearSearch(true);
    });
  }

  /* =========================================================
   *  根题目 / 专题导航面板
   * ========================================================= */

  var rootNavComponents = [];
  var rootNavActiveKey = null;
  var rootNavRootsMap = Object.create(null);

  function buildDefaultTopicTitle(roots) {
    if (!roots || roots.length === 0) return "未命名专题";
    if (roots.length === 1) return roots[0].title;

    /* 多根题：极简单行，绝不拼接所有长名字 */
    return roots[0].title + " 等 (" + roots.length + " 根题)";
  }

  /**
   * 连通块专题的稳定标识：优先使用最小根题目 ID。
   * 根题目 ID 在同一分类内稳定，新增下游节点 / 分支合并时名称仍可复用。
   */
  function getTopicKey(comp) {
    if (comp && comp.roots && comp.roots.length) {
      var ids = comp.roots
        .map(function (root) { return Number(root.id); })
        .filter(function (id) { return Number.isFinite(id); })
        .sort(function (a, b) { return a - b; });

      if (ids.length) return String(ids[0]);
    }

    return "comp:" + (comp && comp.key ? comp.key : "");
  }

  function getTopicCustomName(comp) {
    var cat = typeof getActiveCategory === "function" ? getActiveCategory() : null;
    if (!cat || !cat.topicNames || typeof cat.topicNames !== "object") return "";

    var name = cat.topicNames[getTopicKey(comp)];
    return typeof name === "string" ? name.trim() : "";
  }

  function buildRootNavTitle(comp) {
    var custom = getTopicCustomName(comp);
    if (custom) return custom;

    return buildDefaultTopicTitle(comp && comp.roots);
  }

  /* 极简齿轮 SVG：避免 emoji 在不同平台上的视觉差异 */
  var TOPIC_SETTINGS_ICON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"></circle>' +
    '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83' +
    'l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0' +
    'v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83' +
    'l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09' +
    'a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83' +
    'l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09' +
    'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83' +
    'l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4' +
    'h-.09a1.65 1.65 0 0 0-1.51 1z"></path>' +
    "</svg>";

  function buildTopicSettingsButton(comp) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "root-nav-item-settings";
    btn.dataset.componentKey = comp.key;
    btn.title = "设置专题名称";
    btn.setAttribute("aria-label", "设置专题名称");
    btn.innerHTML = TOPIC_SETTINGS_ICON;

    /* 设置按钮与卡片是兄弟节点；仍显式阻止冒泡，绝不触发“切换连通块” */
    btn.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
    });

    btn.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      openTopicRenameModal(comp);
    });

    return btn;
  }

  function buildRootNavFullTitle(roots) {
    return (roots || [])
      .map(function (root) { return root.title; })
      .join(" · ");
  }

  function hideRootPopover() {
    if (rootNavPopover) rootNavPopover.hidden = true;
  }

  function showRootPopover(item) {
    if (!rootNavPopover || !item) return;

    var roots = rootNavRootsMap[item.dataset.componentKey] || [];
    if (!roots.length) return;

    rootNavPopover.replaceChildren();

    var heading = document.createElement("div");
    heading.className = "root-nav-popover-title";
    heading.textContent = roots.length > 1
      ? "根题目（" + roots.length + " 道）"
      : "根题目";
    rootNavPopover.appendChild(heading);

    roots.forEach(function (root) {
      var row = document.createElement("span");
      row.className = "root-nav-popover-item";
      row.textContent = root.title;
      rootNavPopover.appendChild(row);
    });

    var rect = item.getBoundingClientRect();
    rootNavPopover.hidden = false;
    rootNavPopover.style.top = rect.top + rect.height / 2 + "px";
    rootNavPopover.style.right =
      window.innerWidth - rect.left + 12 + "px";
  }

  function buildRootNav() {
    if (!rootNav || !rootNavList) return;

    var components =
      window.OITreeCanvas && typeof window.OITreeCanvas.getGraphComponents === "function"
        ? window.OITreeCanvas.getGraphComponents()
        : [];

    rootNavComponents = components;
    rootNavRootsMap = Object.create(null);
    hideRootPopover();

    var filterIds =
      window.OITreeCanvas && typeof window.OITreeCanvas.getFilterNodeIds === "function"
        ? window.OITreeCanvas.getFilterNodeIds()
        : null;

    var filterKey = filterIds && filterIds.length
      ? filterIds.slice().sort(function (a, b) { return a - b; }).join(",")
      : null;

    /* 过滤器对应的连通块已不存在（切换分类 / 拓扑变化）→ 自动恢复全部 */
    if (filterKey) {
      var stillExists = components.some(function (comp) {
        return comp.key === filterKey;
      });

      if (!stillExists) {
        CanvasAPI.setComponentFilter(null);
        filterKey = null;
      }
    }

    rootNavActiveKey = filterKey;

    if (!components.length) {
      rootNav.hidden = true;
      rootNavList.replaceChildren();
      return;
    }

    rootNav.hidden = false;
    rootNavList.replaceChildren();

    components.forEach(function (comp) {
      rootNavRootsMap[comp.key] = comp.roots;

      var cell = document.createElement("div");
      cell.className = "root-nav-cell";
      cell.dataset.componentKey = comp.key;

      var item = document.createElement("button");
      item.type = "button";
      item.className = "root-nav-item";
      item.dataset.componentKey = comp.key;
      if (comp.key === filterKey) item.classList.add("is-active");

      var title = document.createElement("span");
      title.className = "root-nav-item-title";
      title.textContent = buildRootNavTitle(comp);
      title.title = buildRootNavFullTitle(comp.roots);

      var sub = document.createElement("span");
      sub.className = "root-nav-item-sub";
      sub.textContent = comp.nodeCount + " 题";

      item.append(title, sub);
      cell.append(item, buildTopicSettingsButton(comp));
      rootNavList.appendChild(cell);
    });
  }

  function handleRootNavClick(event) {
    var item = event.target.closest
      ? event.target.closest(".root-nav-item")
      : null;
    if (!item) return;

    var key = item.dataset.componentKey;
    var comp = null;

    for (var i = 0; i < rootNavComponents.length; i++) {
      if (rootNavComponents[i].key === key) {
        comp = rootNavComponents[i];
        break;
      }
    }

    if (!comp) return;

    hideRootPopover();

    rootNavActiveKey = key;

    /* ① 显示当前连通块，隐藏其他无关节点 */
    CanvasAPI.setComponentFilter(comp.nodeIds);

    /* ②~⑤ 自动整理当前可见题目 → 重绘连线 → 镜头居中 → 坐标回写持久化：
     * autoLayoutVisible 仅针对当前可见节点集合重新计算 X/Y，
     * 逐帧播放卡片归位动画并同步重绘连线，最终 persist() 写入云端同步数据。 */
    if (typeof CanvasAPI.autoLayoutVisible === "function") {
      CanvasAPI.autoLayoutVisible();
    } else {
      CanvasAPI.focusComponent(comp.nodeIds);
    }

    var items = rootNavList.querySelectorAll(".root-nav-item");
    items.forEach(function (el) {
      el.classList.toggle("is-active", el.dataset.componentKey === key);
    });
  }

  function handleRootNavReset() {
    hideRootPopover();

    rootNavActiveKey = null;
    CanvasAPI.setComponentFilter(null);

    if (rootNavList) {
      rootNavList.querySelectorAll(".root-nav-item").forEach(function (el) {
        el.classList.remove("is-active");
      });
    }

    /* “全部显示”同样触发一键整理布局：整张题单重新分层排版 + 平滑运镜 */
    if (typeof CanvasAPI.autoLayoutVisible === "function") {
      CanvasAPI.autoLayoutVisible();
    } else {
      CanvasAPI.fitToView();
    }
  }

  function handleRootNavPointerOver(event) {
    var item = event.target.closest
      ? event.target.closest(".root-nav-item")
      : null;
    if (!item) return;
    if (event.relatedTarget && item.contains(event.relatedTarget)) return;

    showRootPopover(item);
  }

  function handleRootNavPointerOut(event) {
    var item = event.target.closest
      ? event.target.closest(".root-nav-item")
      : null;
    if (!item) return;
    if (event.relatedTarget && item.contains(event.relatedTarget)) return;

    hideRootPopover();
  }

  /* =========================================================
   *  侧边栏渲染
   * ========================================================= */

  function clearDragIndicators() {
    var items = categoryList.querySelectorAll(".category-item");
    items.forEach(function (el) {
      el.classList.remove("is-dragging", "drop-above", "drop-below");
    });
  }

  function renderSidebar() {
    categoryList.replaceChildren();

    for (var ci = 0; ci < state.categories.length; ci++) {
      (function (cat) {
        var isActive = cat.id === state.activeCategoryId;

        var li = document.createElement("li");
        li.className = "category-item";
        li.dataset.catId = cat.id;
        li.setAttribute("role", "tab");
        li.draggable = true;

        if (isActive) {
          li.classList.add("is-active");
          li.setAttribute("aria-selected", "true");
        } else {
          li.setAttribute("aria-selected", "false");
        }

        var nameEl = document.createElement("span");
        nameEl.className = "cat-name";
        nameEl.textContent = cat.name;
        nameEl.title = cat.name;

        var countEl = document.createElement("span");
        countEl.className = "cat-count";
        var realCount = isActive ? nodes.size : (cat.nodes || []).length;
        countEl.textContent = String(realCount);
        countEl.title = realCount + " 道题目";

        var actions = document.createElement("span");
        actions.className = "cat-actions";
        actions.setAttribute("role", "group");
        actions.setAttribute("aria-label", "分类操作");

        /* 悬停浮动操作栏：设置 / 下载（事件由 #category-list 统一委托） */
        actions.appendChild(
          buildCategoryActionButton("settings", "⚙", "分类设置", "打开分类设置")
        );
        actions.appendChild(
          buildCategoryActionButton(
            "download",
            "⇩",
            "下载 .oitree",
            "导出该分类为 .oitree 备份"
          )
        );

        li.append(nameEl, countEl, actions);

        categoryList.appendChild(li);
      })(state.categories[ci]);
    }
  }

  function buildCategoryActionButton(action, glyph, title, ariaLabel) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-action-btn";
    btn.dataset.action = action;
    btn.textContent = glyph;
    btn.title = title;
    btn.setAttribute("aria-label", ariaLabel);
    btn.draggable = false;
    return btn;
  }

  /* =========================================================
   *  分类栏事件委托
   *  —— 所有交互只在 #category-list 上绑定一次，
   *     登录后云端数据无论重绘多少次都无需重新绑定。
   * ========================================================= */

  function findCategoryItem(target) {
    if (!target || !target.closest) return null;
    return target.closest(".category-item");
  }

  function handleCategoryListClick(event) {
    /* 1) 浮动操作栏：设置 / 下载 */
    var actionBtn = event.target.closest
      ? event.target.closest(".cat-action-btn")
      : null;

    if (actionBtn) {
      var actionItem = findCategoryItem(actionBtn);
      if (!actionItem || !actionItem.dataset.catId) return;

      event.preventDefault();
      event.stopPropagation();

      var catId = actionItem.dataset.catId;
      var action = actionBtn.dataset.action;

      if (action === "settings") {
        openCategoryModal(catId);
      } else if (action === "download") {
        var cat = getCategoryById(catId);
        if (cat) exportCategory(cat);
      }
      return;
    }

    /* 点击操作栏背景 / 间隙时不做任何事，避免误触切换分类 */
    if (event.target.closest && event.target.closest(".cat-actions")) {
      return;
    }

    /* 2) 点击整行：切换分类 */
    var item = findCategoryItem(event.target);
    if (!item || !item.dataset.catId) return;

    switchCategory(item.dataset.catId);
  }

  function handleCategoryListDragStart(event) {
    var item = findCategoryItem(event.target);
    if (!item || !item.dataset.catId) return;

    if (
      event.target.closest &&
      event.target.closest(".cat-action-btn")
    ) {
      event.preventDefault();
      return;
    }

    dragSrcId = item.dataset.catId;
    dragOverId = null;
    dragOverPos = null;

    var dragged = item;
    window.setTimeout(function () {
      dragged.classList.add("is-dragging");
    }, 0);

    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragSrcId);
    } catch (_) {
      /* 忽略 */
    }
  }

  function handleCategoryListDragEnd() {
    clearDragIndicators();
    dragSrcId = null;
    dragOverId = null;
    dragOverPos = null;
  }

  function handleCategoryListDragOver(event) {
    var item = findCategoryItem(event.target);
    if (!item || !item.dataset.catId) return;
    if (!dragSrcId || dragSrcId === item.dataset.catId) return;

    event.preventDefault();
    try {
      event.dataTransfer.dropEffect = "move";
    } catch (_) {
      /* 忽略 */
    }

    var rect = item.getBoundingClientRect();
    var isAbove = event.clientY < rect.top + rect.height / 2;

    var items = categoryList.querySelectorAll(".category-item");
    items.forEach(function (el) {
      if (el !== item) el.classList.remove("drop-above", "drop-below");
    });

    item.classList.toggle("drop-above", isAbove);
    item.classList.toggle("drop-below", !isAbove);

    dragOverId = item.dataset.catId;
    dragOverPos = isAbove ? "above" : "below";
  }

  function handleCategoryListDragLeave(event) {
    var item = findCategoryItem(event.target);
    if (!item) return;

    if (!item.contains(event.relatedTarget)) {
      item.classList.remove("drop-above", "drop-below");
    }
  }

  function handleCategoryListDrop(event) {
    var item = findCategoryItem(event.target);
    if (!item || !item.dataset.catId) return;

    event.preventDefault();
    event.stopPropagation();

    var targetId = item.dataset.catId;

    if (!dragSrcId || dragSrcId === targetId) {
      clearDragIndicators();
      return;
    }

    var srcIdx = state.categories.findIndex(function (c) {
      return c.id === dragSrcId;
    });
    if (srcIdx < 0) {
      clearDragIndicators();
      return;
    }

    var movedArr = state.categories.splice(srcIdx, 1);
    var moved = movedArr[0];

    var dstIdx = state.categories.findIndex(function (c) {
      return c.id === targetId;
    });
    if (dstIdx < 0) {
      state.categories.splice(srcIdx, 0, moved);
      clearDragIndicators();
      return;
    }

    if (dragOverPos === "below") dstIdx += 1;

    state.categories.splice(dstIdx, 0, moved);

    clearDragIndicators();
    dragSrcId = null;
    dragOverId = null;
    dragOverPos = null;

    renderSidebar();
    persist();
  }

  /* 只在启动时绑定一次；分类列表重绘不影响委托监听 */
  function bindCategoryListEvents() {
    categoryList.addEventListener("click", handleCategoryListClick);
    categoryList.addEventListener("dragstart", handleCategoryListDragStart);
    categoryList.addEventListener("dragend", handleCategoryListDragEnd);
    categoryList.addEventListener("dragover", handleCategoryListDragOver);
    categoryList.addEventListener("dragleave", handleCategoryListDragLeave);
    categoryList.addEventListener("drop", handleCategoryListDrop);
  }

  /* =========================================================
   *  分类切换 / 删除
   * ========================================================= */

  function switchCategory(id) {
    if (state.activeCategoryId === id) {
      /* 再次点击当前分类：重新聚焦首个连通块 */
      CanvasAPI.autoFocusFirstComponent();
      return;
    }

    syncActiveCategoryFromScene();
    state.activeCategoryId = id;
    CanvasAPI.loadActiveCategory({ autoFocusFirst: true });
    renderSidebar();
    renderDrawer();
    runSearch();
    /* 切换分类只是导航动作：只落本地，不触发云端上传 */
    persist({ cloud: false });
  }

  function deleteCategory(cat) {
    if (!cat) return false;

    if (state.categories.length <= 1) {
      alert("至少需要保留一个分类，无法删除最后一个分类。");
      return false;
    }

    var count = (cat.nodes || []).length;
    var msg =
      count > 0
        ? "删除后该分类下的所有题目（共 " + count + " 道）和连线都将被永久清空，确定删除吗？\n\n分类：「" + cat.name + "」"
        : "确定要删除分类「" + cat.name + "」吗？";

    if (!window.confirm(msg)) return false;

    var wasActive = state.activeCategoryId === cat.id;

    state.categories = state.categories.filter(function (c) { return c.id !== cat.id; });

    if (wasActive) {
      state.activeCategoryId = state.categories[0].id;
      CanvasAPI.loadActiveCategory({ autoFocusFirst: true });
      runSearch();
    }

    renderSidebar();
    persist();
    return true;
  }

  /* =========================================================
   *  目录信息编辑弹窗
   * ========================================================= */

  function openCategoryModal(id) {
    EditorAPI.setCatDescTab("edit");

    if (id) {
      var cat = getCategoryById(id);
      if (!cat) return;

      catModalMode = "edit";
      session.editingCategoryId = id;
      catModalTitle.textContent = "编辑目录信息";
      catModalSubmitBtn.textContent = "保存";
      catNameInput.value = cat.name || "";
      catAuthorInput.value = cat.author || "";
      catLuoguInput.value = cat.luoguUrl || "";
      catDescInput.value = cat.description || "";

      catModalDeleteBtn.hidden = state.categories.length <= 1;
    } else {
      catModalMode = "create";
      session.editingCategoryId = null;
      catModalTitle.textContent = "新建题库分类";
      catModalSubmitBtn.textContent = "创建";
      catNameInput.value = "";
      catAuthorInput.value = "";
      catLuoguInput.value = "";
      catDescInput.value = "";
      catModalDeleteBtn.hidden = true;
    }

    catNameInput.classList.remove("is-invalid");

    catModal.hidden = false;
    document.body.classList.add("modal-open");

    requestAnimationFrame(function () {
      catNameInput.focus();
      if (catNameInput.select) catNameInput.select();
    });
  }

  function closeCategoryModal() {
    catModal.hidden = true;
    var zenModalEl = document.getElementById("zen-modal");
    var readerModalEl = document.getElementById("reader-modal");
    if (
      modal.hidden &&
      (!zenModalEl || zenModalEl.hidden) &&
      (!readerModalEl || readerModalEl.hidden)
    ) {
      document.body.classList.remove("modal-open");
    }
    session.editingCategoryId = null;
    catModalMode = "edit";
    catForm.reset();

    EditorAPI.setCatDescTab("edit");
  }

  /* =========================================================
   *  🏷️ 连通块专题重命名
   * ========================================================= */

  function openTopicRenameModal(comp) {
    if (!comp || !topicModal) return;

    hideRootPopover();

    var defaultName = buildDefaultTopicTitle(comp.roots);
    var customName = getTopicCustomName(comp);

    topicRenameTarget = {
      componentKey: comp.key,
      topicKey: getTopicKey(comp),
      defaultName: defaultName,
    };

    if (topicFieldLabel) {
      topicFieldLabel.textContent =
        "修改专题名称（当前默认：" + defaultName + "）";
    }

    if (topicFieldHint) {
      topicFieldHint.textContent = "留空则恢复默认名称：" + defaultName;
    }

    if (topicFieldName) {
      topicFieldName.value = customName;
      topicFieldName.placeholder = defaultName;
      topicFieldName.classList.remove("is-invalid");
    }

    topicModal.hidden = false;
    document.body.classList.add("modal-open");

    requestAnimationFrame(function () {
      if (!topicFieldName) return;
      topicFieldName.focus();
      if (topicFieldName.select) topicFieldName.select();
    });
  }

  function closeTopicRenameModal() {
    if (!topicModal) return;

    topicModal.hidden = true;
    topicRenameTarget = null;

    if (topicForm) topicForm.reset();
    if (topicFieldName) {
      topicFieldName.classList.remove("is-invalid");
      topicFieldName.placeholder = "例如：区间贪心基础";
    }

    /* 仅当没有其他弹窗时才解除页面滚动锁 */
    var zenModalEl = document.getElementById("zen-modal");
    var readerModalEl = document.getElementById("reader-modal");
    if (
      modal.hidden &&
      catModal.hidden &&
      (!zenModalEl || zenModalEl.hidden) &&
      (!readerModalEl || readerModalEl.hidden)
    ) {
      document.body.classList.remove("modal-open");
    }
  }

  function saveTopicRename() {
    if (!topicRenameTarget) return;

    var cat = typeof getActiveCategory === "function" ? getActiveCategory() : null;
    if (!cat) {
      closeTopicRenameModal();
      return;
    }

    var name = topicFieldName ? topicFieldName.value.trim().slice(0, 32) : "";

    if (!cat.topicNames || typeof cat.topicNames !== "object") {
      cat.topicNames = {};
    }

    if (name) {
      cat.topicNames[topicRenameTarget.topicKey] = name;
    } else {
      /* 留空 = 恢复“首道根题目”默认名称 */
      delete cat.topicNames[topicRenameTarget.topicKey];
    }

    closeTopicRenameModal();

    /* 立即刷新右上角卡片标题 */
    buildRootNav();

    /* 内容型变更：走 2s 防抖后同步至 Supabase 云端 */
    persist();
  }

  /* =========================================================
   *  右侧抽屉
   * ========================================================= */

  function openDrawer() {
    drawer.classList.add("is-open");
    drawerBackdrop.classList.add("is-visible");
    drawerToggle.classList.add("is-open");
    renderDrawer();
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawerBackdrop.classList.remove("is-visible");
    drawerToggle.classList.remove("is-open");
  }

  function toggleDrawer() {
    if (drawer.classList.contains("is-open")) closeDrawer();
    else openDrawer();
  }

  /**
   * 让右上角“根题目 / 专题列表”的激活态与当前独占连通块保持一致。
   */
  function syncRootNavActiveState(componentKey) {
    rootNavActiveKey = componentKey || null;

    if (!rootNavList) return;

    rootNavList.querySelectorAll(".root-nav-item").forEach(function (el) {
      var isActive =
        !!componentKey && el.dataset.componentKey === componentKey;
      el.classList.toggle("is-active", isActive);
    });
  }

  function getComponentKeyFromIds(ids) {
    if (!ids || !ids.length) return null;

    return ids
      .slice()
      .sort(function (a, b) { return a - b; })
      .join(",");
  }

  function findComponentByNodeId(nodeId) {
    var components =
      CanvasAPI && typeof CanvasAPI.getGraphComponents === "function"
        ? CanvasAPI.getGraphComponents()
        : [];

    for (var i = 0; i < components.length; i++) {
      if (components[i].nodeIds.indexOf(Number(nodeId)) !== -1) {
        return components[i];
      }
    }

    return null;
  }

  /**
   * 右侧抽屉展开时的遮挡宽度。
   * 移动端点击题目后会立即收起抽屉，因此不让镜头为它让位。
   */
  function getDrawerRightInset() {
    if (!drawer || !drawer.classList.contains("is-open")) return 0;
    if (window.innerWidth < 720) return 0;

    var rect = drawer.getBoundingClientRect();
    return rect.width || 0;
  }

  /**
   * 抽屉点击题目：
   * 1) 若目标属于其他连通块，先切换独占分支，并同步右上角专题卡片激活态；
   * 2) 选中该题，并把镜头对焦到“剩余可视区域”中心，自动避开右侧抽屉。
   */
  function focusNodeFromDrawer(node) {
    if (!node) return;

    var targetComp = findComponentByNodeId(node.id);
    var filterIds = CanvasAPI.getFilterNodeIds();
    var currentKey = getComponentKeyFromIds(filterIds);
    var nodeVisible =
      !filterIds || filterIds.indexOf(Number(node.id)) !== -1;

    /* 跨连通块（或目标当前被隐藏）时，先切换到目标专题分支 */
    if (targetComp && (!nodeVisible || currentKey !== targetComp.key)) {
      CanvasAPI.setComponentFilter(targetComp.nodeIds);
      syncRootNavActiveState(targetComp.key);
    } else if (!targetComp && currentKey) {
      CanvasAPI.setComponentFilter(null);
      syncRootNavActiveState(null);
    }

    CanvasAPI.setSelectedNode(node.id);
    CanvasAPI.panToNode(node, { rightInset: getDrawerRightInset() });

    if (window.innerWidth < 720) closeDrawer();
  }

  function renderDrawer() {
    var cat = getActiveCategory();
    drawerCategoryName.textContent = cat ? cat.name : "—";

    var items = [];
    nodes.forEach(function (node) {
      var data = node.data;
      items.push({
        id: node.id,
        title: data.title || "未命名题目",
        difficulty: data.difficulty || "none",
        createdAt: data.createdAt || "",
        completedAt: data.completedAt || "",
      });
    });

    drawerCount.textContent = items.length + " 道题";

    var sort = drawerSortSelect.value;

    if (sort === "completed") {
      items.sort(function (a, b) {
        var aHas = a.completedAt ? 1 : 0;
        var bHas = b.completedAt ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        if (!aHas) {
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        }
        return (b.completedAt || "").localeCompare(a.completedAt || "");
      });
    } else if (sort === "created") {
      items.sort(function (a, b) {
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
    } else {
      items.sort(function (a, b) {
        return a.title.localeCompare(b.title, "zh-Hans-CN", {
          numeric: true,
          sensitivity: "base",
        });
      });
    }

    drawerList.replaceChildren();

    if (items.length === 0) {
      var empty = document.createElement("li");
      empty.className = "drawer-empty";
      empty.textContent = "当前分类还没有题目\n点「＋ 增加题目」开始吧";
      drawerList.appendChild(empty);
      return;
    }

    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var li = document.createElement("li");
        li.className = "drawer-item";
        li.dataset.nodeId = String(item.id);

        var diff = difficultyMap.get(item.difficulty) || difficultyMap.get("none");

        var titleEl = document.createElement("div");
        titleEl.className = "drawer-item-title";
        titleEl.textContent = item.title;
        titleEl.style.color = diff.border || diff.accent;

        var metaEl = document.createElement("div");
        metaEl.className = "drawer-item-meta";

        var parts = [];
        if (item.completedAt) {
          parts.push("✓ 完成于 " + item.completedAt);
        } else if (item.createdAt) {
          parts.push("加入于 " + item.createdAt.slice(0, 10));
        }
        metaEl.textContent = parts.join(" · ");

        li.append(titleEl, metaEl);

        li.addEventListener("click", function () {
          focusNodeFromDrawer(nodes.get(item.id));
        });

        drawerList.appendChild(li);
      })(items[i]);
    }
  }

  /* =========================================================
   *  文件导入
   * ========================================================= */

  function handleImportFile(file) {
    return file.text().then(function (text) {
      var payload = JSON.parse(text);

      if (!payload || typeof payload !== "object") {
        throw new Error("文件内容不是有效的 JSON 对象");
      }

      var rawNodes = Array.isArray(payload.nodes) ? payload.nodes : null;
      if (!rawNodes) {
        throw new Error("文件中缺少 nodes 字段，可能不是 .oitree 文件");
      }

      var importedNodes = [];
      var seenIds = new Set();
      for (var i = 0; i < rawNodes.length; i++) {
        var n = normalizeImportedNode(rawNodes[i]);
        if (!n) continue;
        if (seenIds.has(n.id)) continue;
        seenIds.add(n.id);
        importedNodes.push(n);
      }

      if (rawNodes.length > 0 && importedNodes.length === 0) {
        throw new Error("文件中没有有效的题目节点数据");
      }

      var nodeIds = new Set(importedNodes.map(function (n) { return n.id; }));
      var importedEdges = normalizeImportedEdges(payload.edges, nodeIds);
      var importedTopicNames = normalizeImportedTopicNames(payload.topicNames);

      var maxId = importedNodes.reduce(function (m, n) { return Math.max(m, n.id); }, 0);

      var baseName =
        (typeof payload.name === "string" && payload.name.trim()) ||
        file.name.replace(/\.(oitree|json)$/i, "").trim() ||
        "导入的目录";

      var importedMeta = {
        author: typeof payload.author === "string" ? payload.author : "",
        luoguUrl: typeof payload.luoguUrl === "string" ? payload.luoguUrl : "",
        description:
          typeof payload.description === "string" ? payload.description : "",
      };

      var existing = state.categories.find(function (c) { return c.name === baseName; });

      if (existing) {
        var overwrite = window.confirm(
          "已存在分类「" + baseName + "」。\n\n" +
            "「确定」→ 覆盖该分类（原数据将被替换）\n" +
            "「取消」→ 作为新分类导入（名称自动加后缀）"
        );

        if (overwrite) {
          syncActiveCategoryFromScene();
          existing.nodes = importedNodes;
          existing.edges = importedEdges;
          existing.topicNames = importedTopicNames;
          existing.view = { x: 0, y: 0, scale: 1 };
          existing.nodeCount = maxId;
          existing.author = importedMeta.author;
          existing.luoguUrl = importedMeta.luoguUrl;
          existing.description = importedMeta.description;
          /* 导入文件自带坐标，保留其排版，不触发 LR 自动迁移 */
          existing.layoutVersion =
            typeof CATEGORY_LAYOUT_VERSION === "number"
              ? CATEGORY_LAYOUT_VERSION
              : 4;

          state.activeCategoryId = existing.id;
          CanvasAPI.loadActiveCategory({ autoFocusFirst: true });
          renderSidebar();
          renderDrawer();
          runSearch();
          persist();
          return;
        }

        var newCat = createCategory(uniqueCategoryName(baseName), importedMeta);
        newCat.nodes = importedNodes;
        newCat.edges = importedEdges;
        newCat.topicNames = importedTopicNames;
        newCat.nodeCount = maxId;

        syncActiveCategoryFromScene();
        state.categories.push(newCat);
        state.activeCategoryId = newCat.id;
        CanvasAPI.loadActiveCategory({ autoFocusFirst: true });
        renderSidebar();
        renderDrawer();
        runSearch();
        persist();
        return;
      }

      var newCat2 = createCategory(baseName, importedMeta);
      newCat2.nodes = importedNodes;
      newCat2.edges = importedEdges;
      newCat2.topicNames = importedTopicNames;
      newCat2.nodeCount = maxId;

      syncActiveCategoryFromScene();
      state.categories.push(newCat2);
      state.activeCategoryId = newCat2.id;
      CanvasAPI.loadActiveCategory({ autoFocusFirst: true });
      renderSidebar();
      renderDrawer();
      runSearch();
      persist();
    }).catch(function (err) {
      console.error("[oitree] 导入失败：", err);
      alert("导入失败：" + (err.message || err));
    });
  }

  /* =========================================================
   *  事件绑定
   * ========================================================= */

  /**
   * 「整理视图」统一动作：
   * 1) 对当前可见节点重新计算横向 DAG 坐标；
   * 2) autoLayout 动画期间逐帧重绘连线；
   * 3) 按整理后的包围盒平滑缩放并居中镜头；
   * 4) persist() 回写坐标并进入云同步防抖。
   */
  function handleCleanView() {
    if (!CanvasAPI || typeof CanvasAPI.autoLayout !== "function") return;

    var visibleIds =
      typeof CanvasAPI.getFilterNodeIds === "function"
        ? CanvasAPI.getFilterNodeIds()
        : null;

    var options = {
      center: true,
      fit: true,
      animate: true,
      reserveRight: 270,
    };

    /* 专题独占浏览时只整理当前分支；全部显示时整理整图 */
    if (visibleIds && visibleIds.length) {
      options.nodeIds = visibleIds;
    }

    CanvasAPI.autoLayout(options);
  }

  addButton.addEventListener("click", function () { EditorAPI.openProblemModal(null); });

  if (cleanViewButton) {
    cleanViewButton.addEventListener("click", handleCleanView);
  }

  /* 根题目导航面板事件 */
  if (rootNavList) {
    rootNavList.addEventListener("click", handleRootNavClick);
    rootNavList.addEventListener("pointerover", handleRootNavPointerOver);
    rootNavList.addEventListener("pointerout", handleRootNavPointerOut);
    rootNavList.addEventListener("scroll", hideRootPopover);
  }

  if (rootNavReset) {
    rootNavReset.addEventListener("click", handleRootNavReset);
  }

  window.addEventListener("oitree:graph-changed", buildRootNav);
  window.addEventListener("resize", hideRootPopover);

  zoomBadge.addEventListener("click", function () {
    var rect = canvasEl.getBoundingClientRect();
    var centerWorld = CanvasAPI.screenToWorld(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );

    var newScale = 1;
    view.scale = newScale;
    view.x = rect.width / 2 - centerWorld.x * newScale;
    view.y = rect.height / 2 - centerWorld.y * newScale;
    CanvasAPI.applyView();
    /* 仅重置视角：只落本地，不触发云同步 */
    persist({ cloud: false });
  });

  sidebarToggle.addEventListener("click", function () {
    sidebar.classList.toggle("is-collapsed");
  });

  addCategoryBtn.addEventListener("click", function () {
    openCategoryModal(null);
  });

  importCategoryBtn.addEventListener("click", function () {
    importInput.click();
  });

  importInput.addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    handleImportFile(file);
  });

  drawerToggle.addEventListener("click", toggleDrawer);
  drawerCloseBtn.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  drawerSortSelect.addEventListener("change", renderDrawer);

  catModalCloseBtn.addEventListener("click", closeCategoryModal);
  catModalCancelBtn.addEventListener("click", closeCategoryModal);

  catModal.addEventListener("mousedown", function (event) {
    if (event.target === catModal) closeCategoryModal();
  });

  /* 🏷️ 专题重命名弹窗事件 */
  if (topicModalCloseBtn) {
    topicModalCloseBtn.addEventListener("click", closeTopicRenameModal);
  }
  if (topicModalCancelBtn) {
    topicModalCancelBtn.addEventListener("click", closeTopicRenameModal);
  }
  if (topicModal) {
    topicModal.addEventListener("mousedown", function (event) {
      if (event.target === topicModal) closeTopicRenameModal();
    });
  }
  if (topicForm) {
    topicForm.addEventListener("submit", function (event) {
      event.preventDefault();
      saveTopicRename();
    });
  }

  catNameInput.addEventListener("input", function () {
    catNameInput.classList.remove("is-invalid");
  });

  catModalDeleteBtn.addEventListener("click", function () {
    if (catModalMode !== "edit") return;

    var cat = getCategoryById(session.editingCategoryId);
    if (!cat) {
      closeCategoryModal();
      return;
    }

    var ok = deleteCategory(cat);
    if (ok) closeCategoryModal();
  });

  catForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var newName = catNameInput.value.trim();
    if (!newName) {
      catNameInput.classList.add("is-invalid");
      catNameInput.focus();
      return;
    }

    var meta = {
      author: catAuthorInput.value.trim(),
      luoguUrl: catLuoguInput.value.trim(),
      description: catDescInput.value,
    };

    if (catModalMode === "create") {
      syncActiveCategoryFromScene();

      var newCat = createCategory(newName, meta);
      state.categories.push(newCat);
      state.activeCategoryId = newCat.id;

      closeCategoryModal();

      CanvasAPI.loadActiveCategory({ autoFocusFirst: true });
      renderSidebar();
      renderDrawer();
      runSearch();
      persist();
      return;
    }

    var cat = getCategoryById(session.editingCategoryId);
    if (!cat) {
      closeCategoryModal();
      return;
    }

    cat.name = newName;
    cat.author = meta.author;
    cat.luoguUrl = meta.luoguUrl;
    cat.description = meta.description;

    closeCategoryModal();

    renderSidebar();
    CanvasAPI.updateCanvasInfo();
    renderDrawer();
    persist();
  });

  /* =========================================================
   *  全局键盘事件
   * ========================================================= */

  function isAnyModalOpen() {
    var zenModalEl = document.getElementById("zen-modal");
    var readerModalEl = document.getElementById("reader-modal");
    var authModalEl = document.getElementById("auth-modal");
    return (
      !modal.hidden ||
      !catModal.hidden ||
      (topicModal && !topicModal.hidden) ||
      (zenModalEl && !zenModalEl.hidden) ||
      (readerModalEl && !readerModalEl.hidden) ||
      (authModalEl && !authModalEl.hidden)
    );
  }

  window.addEventListener("keydown", function (event) {
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key === "k" || event.key === "K")
    ) {
      if (isAnyModalOpen()) return;
      event.preventDefault();
      if (searchInput) {
        searchInput.focus();
        if (searchInput.select) searchInput.select();
      }
      return;
    }

    if (
      event.key === "/" &&
      !isTextInput(event.target) &&
      !isAnyModalOpen()
    ) {
      event.preventDefault();
      if (searchInput) {
        searchInput.focus();
        if (searchInput.select) searchInput.select();
      }
      return;
    }

    if (event.key === "Escape") {
      /* auth.js 已处理（例如关闭登录弹窗）则不再执行全局 Esc 逻辑 */
      if (event.defaultPrevented) return;

      var zenModalEl = document.getElementById("zen-modal");
      var readerModalEl = document.getElementById("reader-modal");

      if (readerModalEl && !readerModalEl.hidden) {
        EditorAPI.closeReaderModal();
        return;
      }
      if (zenModalEl && !zenModalEl.hidden) {
        EditorAPI.closeZenMode(true);
        return;
      }
      if (topicModal && !topicModal.hidden) {
        closeTopicRenameModal();
        return;
      }
      if (!catModal.hidden) {
        closeCategoryModal();
        return;
      }
      if (!modal.hidden) {
        EditorAPI.closeProblemModal();
        return;
      }
      if (drawer.classList.contains("is-open")) {
        closeDrawer();
        return;
      }

      var hasSearch =
        (searchInput && searchInput.value.trim().length > 0) ||
        (difficultyFilter && difficultyFilter.value);

      if (hasSearch) {
        var wasFocused = document.activeElement === searchInput;
        clearSearch(false);
        if (wasFocused && searchInput) searchInput.blur();
        return;
      }

      if (document.activeElement === searchInput && searchInput) {
        searchInput.blur();
        return;
      }
    }

    if (event.code === "Space") {
      if (isTextInput(event.target)) return;
      if (isAnyModalOpen()) return;

      event.preventDefault();
      if (session.spacePressed) return;
      session.spacePressed = true;
      canvasEl.classList.add("is-pan-ready");
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      if (isTextInput(event.target)) return;
      if (isAnyModalOpen()) return;
      if (session.selectedNodeId === null) return;

      event.preventDefault();
      CanvasAPI.deleteNodeById(session.selectedNodeId);
    }
  });

  window.addEventListener("keyup", function (event) {
    if (event.code !== "Space") return;
    session.spacePressed = false;
    canvasEl.classList.remove("is-pan-ready");
  });

  /* =========================================================
   *  窗口尺寸变化
   * ========================================================= */

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    CanvasAPI.renderLinks();

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      CanvasAPI.renderLinks();
    }, 120);
  });

  /* =========================================================
   *  启动
   * ========================================================= */

  /* 若云同步已经先行写入 state（极快返回），则不再用本地缓存覆盖它 */
  if (!state) initAppState();

  CanvasAPI.bindCanvasPanZoom();

  /* 分类栏使用事件委托：只绑定一次，重绘后交互依然有效 */
  bindCategoryListEvents();

  /* 初始化根题目导航（登录并渲染后由 graph-changed 自动刷新） */
  buildRootNav();

  /* 对外暴露“渲染一次并等待首帧”能力：
   * 登录 / 刷新恢复会话时由 auth.js 在云端数据就绪后调用，
   * 确保默认骨架不会先于真实数据渲染。 */
  window.OITreeApp = {
    renderWorkspace: renderWorkspace,
    renderWorkspaceAndWait: renderWorkspaceAndWait,
    isRendered: function () {
      return workspaceRendered;
    },
    resetRenderState: function () {
      workspaceRendered = false;
    },
  };

  /* 兜底：鉴权模块缺失（例如脚本加载失败）时仍渲染工作台，避免空白页 */
  if (!window.OITreeAuth) {
    renderWorkspace(true);
  }
})();