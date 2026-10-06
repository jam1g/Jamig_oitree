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
  var layoutButton = $("auto-layout");
  var resetViewButton = $("reset-view");
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

  var readerModal = $("reader-modal");

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

  var lastClickTs = 0;
  var lastClickId = null;

  var catModalMode = "edit";

  /* =========================================================
   *  场景变化时的刷新
   * ========================================================= */

  function refreshSceneUI() {
    renderSidebar();
    renderDrawer();
    runSearch();
  }

  CanvasAPI.setOnSceneChange(refreshSceneUI);
  EditorAPI.setEditorOnSceneChange(refreshSceneUI);

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

        var actions = document.createElement("span");
        actions.className = "cat-actions";

        var expBtn = document.createElement("button");
        expBtn.type = "button";
        expBtn.className = "cat-btn export";
        expBtn.textContent = "⇩";
        expBtn.title = "导出 .oitree";
        expBtn.setAttribute("aria-label", "导出目录为 .oitree");
        expBtn.draggable = false;
        expBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          exportCategory(cat);
        });

        actions.appendChild(expBtn);

        li.append(nameEl, countEl, actions);

        li.addEventListener("click", function (e) {
          if (e.target.closest(".cat-btn")) return;
          if (e.target.closest(".cat-name-input")) return;

          var now = Date.now();
          if (lastClickId === cat.id && now - lastClickTs < 300) {
            lastClickTs = now;
            return;
          }
          lastClickTs = now;
          lastClickId = cat.id;

          switchCategory(cat.id);
        });

        li.addEventListener("dblclick", function (e) {
          if (e.target.closest(".cat-btn")) return;
          if (e.target.closest(".cat-name-input")) return;
          e.preventDefault();
          openCategoryModal(cat.id);
        });

        li.addEventListener("dragstart", function (e) {
          if (e.target.closest(".cat-btn") || e.target.closest(".cat-name-input")) {
            e.preventDefault();
            return;
          }

          dragSrcId = cat.id;
          dragOverId = null;
          dragOverPos = null;

          setTimeout(function () {
            li.classList.add("is-dragging");
          }, 0);

          try {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", cat.id);
          } catch (_) {
            /* 忽略 */
          }
        });

        li.addEventListener("dragend", function () {
          clearDragIndicators();
          dragSrcId = null;
          dragOverId = null;
          dragOverPos = null;
        });

        li.addEventListener("dragover", function (e) {
          if (!dragSrcId || dragSrcId === cat.id) return;

          e.preventDefault();
          try {
            e.dataTransfer.dropEffect = "move";
          } catch (_) {
            /* 忽略 */
          }

          var rect = li.getBoundingClientRect();
          var isAbove = e.clientY < rect.top + rect.height / 2;

          var items = categoryList.querySelectorAll(".category-item");
          items.forEach(function (el) {
            if (el !== li) el.classList.remove("drop-above", "drop-below");
          });

          li.classList.toggle("drop-above", isAbove);
          li.classList.toggle("drop-below", !isAbove);

          dragOverId = cat.id;
          dragOverPos = isAbove ? "above" : "below";
        });

        li.addEventListener("dragleave", function (e) {
          if (!li.contains(e.relatedTarget)) {
            li.classList.remove("drop-above", "drop-below");
          }
        });

        li.addEventListener("drop", function (e) {
          e.preventDefault();
          e.stopPropagation();

          if (!dragSrcId || dragSrcId === cat.id) {
            clearDragIndicators();
            return;
          }

          var srcIdx = state.categories.findIndex(function (c) { return c.id === dragSrcId; });
          if (srcIdx < 0) {
            clearDragIndicators();
            return;
          }

          var movedArr = state.categories.splice(srcIdx, 1);
          var moved = movedArr[0];

          var dstIdx = state.categories.findIndex(function (c) { return c.id === cat.id; });
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
        });

        categoryList.appendChild(li);
      })(state.categories[ci]);
    }
  }

  /* =========================================================
   *  分类切换 / 删除
   * ========================================================= */

  function switchCategory(id) {
    if (state.activeCategoryId === id) return;
    syncActiveCategoryFromScene();
    state.activeCategoryId = id;
    CanvasAPI.loadActiveCategory();
    renderSidebar();
    renderDrawer();
    runSearch();
    persist();
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
      CanvasAPI.loadActiveCategory();
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
          var node = nodes.get(item.id);
          if (!node) return;
          CanvasAPI.setSelectedNode(node.id);
          CanvasAPI.panToNode(node);
          if (window.innerWidth < 720) closeDrawer();
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
          existing.view = { x: 0, y: 0, scale: 1 };
          existing.nodeCount = maxId;
          existing.author = importedMeta.author;
          existing.luoguUrl = importedMeta.luoguUrl;
          existing.description = importedMeta.description;

          state.activeCategoryId = existing.id;
          CanvasAPI.loadActiveCategory();
          renderSidebar();
          renderDrawer();
          runSearch();
          persist();

          if (importedNodes.length > 0) CanvasAPI.fitToView();
          return;
        }

        var newCat = createCategory(uniqueCategoryName(baseName), importedMeta);
        newCat.nodes = importedNodes;
        newCat.edges = importedEdges;
        newCat.nodeCount = maxId;

        syncActiveCategoryFromScene();
        state.categories.push(newCat);
        state.activeCategoryId = newCat.id;
        CanvasAPI.loadActiveCategory();
        renderSidebar();
        renderDrawer();
        runSearch();
        persist();

        if (importedNodes.length > 0) CanvasAPI.fitToView();
        return;
      }

      var newCat2 = createCategory(baseName, importedMeta);
      newCat2.nodes = importedNodes;
      newCat2.edges = importedEdges;
      newCat2.nodeCount = maxId;

      syncActiveCategoryFromScene();
      state.categories.push(newCat2);
      state.activeCategoryId = newCat2.id;
      CanvasAPI.loadActiveCategory();
      renderSidebar();
      renderDrawer();
      runSearch();
      persist();

      if (importedNodes.length > 0) CanvasAPI.fitToView();
    }).catch(function (err) {
      console.error("[oitree] 导入失败：", err);
      alert("导入失败：" + (err.message || err));
    });
  }

  /* =========================================================
   *  事件绑定
   * ========================================================= */

  addButton.addEventListener("click", function () { EditorAPI.openProblemModal(null); });
  layoutButton.addEventListener("click", CanvasAPI.autoLayout);
  resetViewButton.addEventListener("click", CanvasAPI.fitToView);

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
    persist();
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

      CanvasAPI.loadActiveCategory();
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
    return (
      !modal.hidden ||
      !catModal.hidden ||
      (zenModalEl && !zenModalEl.hidden) ||
      (readerModalEl && !readerModalEl.hidden)
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

  initAppState();

  CanvasAPI.bindCanvasPanZoom();
  CanvasAPI.loadActiveCategory();
  renderSidebar();
  renderDrawer();
  CanvasAPI.applyView();
  CanvasAPI.updateCanvasInfo();
  persist();
})();