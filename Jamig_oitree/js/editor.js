/* =========================================================
 *  editor.js — 编辑器与弹窗
 *  IIFE 隔离：模块私有 DOM 引用 / 内部状态不会污染全局
 *  通过 window.OITreeEditor 暴露公开 API
 *
 *  🎨 升级：难度下拉框选项着色 + 当前选中值动态变色
 * ========================================================= */

window.OITreeEditor = (function () {
  "use strict";

  var modal = null;
  var modalTitle = null;
  var modalCreateTime = null;
  var modalCloseBtn = null;
  var modalCancelBtn = null;
  var modalDeleteBtn = null;
  var form = null;
  var titleInput = null;
  var difficultySelect = null;
  var tagsInput = null;
  var linkInput = null;
  var completedInput = null;
  var noteInput = null;

  var noteTabEdit = null;
  var noteTabPreview = null;
  var notePreview = null;
  var noteExpandBtn = null;

  var catDescTabEdit = null;
  var catDescTabPreview = null;
  var catDescPreview = null;
  var catDescInput = null;
  var catDescExpandBtn = null;
  var catNameInput = null;

  var zenModal = null;
  var zenTitle = null;
  var zenSubtitle = null;
  var zenInput = null;
  var zenPreview = null;
  var zenCloseBtn = null;
  var zenSaveBtn = null;

  var readerModal = null;
  var readerTitle = null;
  var readerDifficulty = null;
  var readerStatus = null;
  var readerTags = null;
  var readerCreated = null;
  var readerCompleted = null;
  var readerBody = null;
  var readerEditBtn = null;
  var readerCloseBtn = null;

  /* 🏷️ 状态按钮组 */
  var fieldStatusSeg = null;
  var fieldStatusInput = null;

  function bindEditorDom(refs) {
    modal = refs.modal;
    modalTitle = refs.modalTitle;
    modalCreateTime = refs.modalCreateTime;
    modalCloseBtn = refs.modalCloseBtn;
    modalCancelBtn = refs.modalCancelBtn;
    modalDeleteBtn = refs.modalDeleteBtn;
    form = refs.form;
    titleInput = refs.titleInput;
    difficultySelect = refs.difficultySelect;
    tagsInput = refs.tagsInput;
    linkInput = refs.linkInput;
    completedInput = refs.completedInput;
    noteInput = refs.noteInput;

    noteTabEdit = refs.noteTabEdit;
    noteTabPreview = refs.noteTabPreview;
    notePreview = refs.notePreview;
    noteExpandBtn = refs.noteExpandBtn;

    catDescTabEdit = refs.catDescTabEdit;
    catDescTabPreview = refs.catDescTabPreview;
    catDescPreview = refs.catDescPreview;
    catDescInput = refs.catDescInput;
    catDescExpandBtn = refs.catDescExpandBtn;
    catNameInput = refs.catNameInput;

    zenModal = refs.zenModal;
    zenTitle = refs.zenTitle;
    zenSubtitle = refs.zenSubtitle;
    zenInput = refs.zenInput;
    zenPreview = refs.zenPreview;
    zenCloseBtn = refs.zenCloseBtn;
    zenSaveBtn = refs.zenSaveBtn;

    readerModal = refs.readerModal;
    readerTitle = refs.readerTitle;
    readerDifficulty = refs.readerDifficulty;
    readerStatus = refs.readerStatus;
    readerTags = refs.readerTags;
    readerCreated = refs.readerCreated;
    readerCompleted = refs.readerCompleted;
    readerBody = refs.readerBody;
    readerEditBtn = refs.readerEditBtn;
    readerCloseBtn = refs.readerCloseBtn;

    /* 🐛 状态按钮组：优先 refs，缺失时回退 getElementById */
    fieldStatusSeg =
      refs.fieldStatusSeg || document.getElementById("field-status-seg");
    fieldStatusInput =
      refs.fieldStatus || document.getElementById("field-status");

    if (!readerModal) {
      console.warn("[oitree] reader-modal 未找到，阅读视图将无法打开！请检查 index.html。");
    }
    if (!fieldStatusSeg) {
      console.warn("[oitree] field-status-seg 未找到，刷题状态控件将不可用！请检查 index.html。");
    }

    /* 🏷️ 绑定状态按钮组事件（不再动态创建 DOM） */
    bindStatusButtonGroup();

    /* ⌨️ 为所有 Markdown 文本域挂上 Tab 缩进（4 空格 / Shift+Tab 反缩进） */
    attachTabIndent(zenInput);
    attachTabIndent(noteInput);
    attachTabIndent(catDescInput);

    /* 🎨 难度下拉框：change 时同步自身颜色 */
    if (difficultySelect && !difficultySelect.__oitreeColorBound) {
      difficultySelect.__oitreeColorBound = true;
      difficultySelect.addEventListener("change", syncDifficultySelectColor);
    }

    /* Tab 事件绑定 */
    if (noteTabEdit) noteTabEdit.addEventListener("click", function () { setNoteTab("edit"); });
    if (noteTabPreview) noteTabPreview.addEventListener("click", function () { setNoteTab("preview"); });
    if (catDescTabEdit) catDescTabEdit.addEventListener("click", function () { setCatDescTab("edit"); });
    if (catDescTabPreview) catDescTabPreview.addEventListener("click", function () { setCatDescTab("preview"); });

    /* 打开大窗口按钮 */
    if (noteExpandBtn) {
      noteExpandBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openZenMode("note");
      });
    }
    if (catDescExpandBtn) {
      catDescExpandBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openZenMode("catDesc");
      });
    }

    /* Zen 实时预览 */
    if (zenInput) {
      zenInput.addEventListener("input", function () {
        if (zenRenderTimer !== null) clearTimeout(zenRenderTimer);
        zenRenderTimer = setTimeout(function () {
          renderMarkdownToElement(zenPreview, zenInput.value, {
            emptyText: "开始输入后，右侧会实时渲染 Markdown、LaTeX 公式与代码",
          });
        }, 180);
      });
    }

    if (zenCloseBtn) zenCloseBtn.addEventListener("click", function () { closeZenMode(true); });

    if (zenSaveBtn) {
      zenSaveBtn.addEventListener("click", function () {
        var source = zenSource;
        closeZenMode(true);
        if (source === "catDesc") setCatDescTab("preview");
        else setNoteTab("preview");
      });
    }

    /* 阅读视图事件 */
    if (readerCloseBtn) {
      readerCloseBtn.addEventListener("click", function () {
        closeReaderModal();
      });
    }
    if (readerEditBtn) {
      readerEditBtn.addEventListener("click", function () {
        readerToEdit();
      });
    }
    if (readerModal) {
      readerModal.addEventListener("mousedown", function (event) {
        if (event.target === readerModal) closeReaderModal();
      });
    }
  }

  /* =========================================================
   *  🎨 难度下拉框：动态变色
   * ========================================================= */

  function syncDifficultySelectColor() {
    if (!difficultySelect) return;

    var value = difficultySelect.value;
    var info = difficultyMap.get(value);

    if (!info || value === "none") {
      /* 「暂无评定」或未知值 → 恢复默认文字色 */
      difficultySelect.style.color = "";
      difficultySelect.style.borderColor = "";
      return;
    }

    /* 使用 border 色（对深色主题可读性最优，如 NOI 的 #64748b） */
    difficultySelect.style.color = info.border;
    difficultySelect.style.borderColor = hexToRgba(info.border, 0.55);
  }

  /* =========================================================
   *  ⌨️ Markdown 文本域 Tab 键缩进
   * ========================================================= */

  var TAB_SPACES = "    ";

  function attachTabIndent(textarea) {
    if (!textarea) return;
    if (textarea.__oitreeTabIndentAttached) return;
    textarea.__oitreeTabIndentAttached = true;

    textarea.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        e.preventDefault();

        var sStart = this.selectionStart;
        var sEnd = this.selectionEnd;

        if (sStart !== sEnd) {
          this.value = this.value.substring(0, sStart) + this.value.substring(sEnd);
          this.selectionStart = this.selectionEnd = sStart;
          this.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }

        var before = this.value.substring(0, sStart);
        if (before.slice(-TAB_SPACES.length) === TAB_SPACES) {
          this.value =
            before.slice(0, -TAB_SPACES.length) +
            this.value.substring(sStart);
          this.selectionStart = this.selectionEnd = sStart - TAB_SPACES.length;
          this.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }

      e.preventDefault();

      var start = this.selectionStart;
      var end = this.selectionEnd;

      this.value =
        this.value.substring(0, start) +
        TAB_SPACES +
        this.value.substring(end);

      this.selectionStart = this.selectionEnd = start + TAB_SPACES.length;
      this.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  /* =========================================================
   *  🏷️ 刷题状态按钮组
   * ========================================================= */

  function bindStatusButtonGroup() {
    if (!fieldStatusSeg) return;

    fieldStatusSeg.addEventListener("click", function (e) {
      var btn = e.target.closest(".status-btn");
      if (!btn) return;
      if (!fieldStatusSeg.contains(btn)) return;
      setStatusValue(btn.dataset.status);
    });

    setStatusValue(DEFAULT_STATUS);
  }

  function setStatusValue(value) {
    if (!fieldStatusSeg) return;
    var valid = statusMap.has(value) ? value : DEFAULT_STATUS;

    var buttons = fieldStatusSeg.querySelectorAll(".status-btn");
    buttons.forEach(function (btn) {
      var isOn = btn.dataset.status === valid;
      btn.classList.toggle("is-active", isOn);
      btn.setAttribute("aria-checked", isOn ? "true" : "false");
    });

    if (fieldStatusInput) fieldStatusInput.value = valid;
  }

  function getStatusValue() {
    if (fieldStatusSeg) {
      var active = fieldStatusSeg.querySelector(".status-btn.is-active");
      if (active && statusMap.has(active.dataset.status)) {
        return active.dataset.status;
      }
    }
    if (fieldStatusInput && statusMap.has(fieldStatusInput.value)) {
      return fieldStatusInput.value;
    }
    return DEFAULT_STATUS;
  }

  /* =========================================================
   *  会话状态
   * ========================================================= */

  var noteTabMode = "edit";
  var catDescTabMode = "edit";
  var zenSource = "note";
  var zenRenderTimer = null;

  var onSceneChange = null;
  function setEditorOnSceneChange(handler) {
    onSceneChange = handler;
  }

  /* =========================================================
   *  🔗 题目链接智能提取
   * ========================================================= */

  function extractProblemIdFromUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "";
    var url = rawUrl.trim();
    if (!url) return "";

    var cfSet = url.match(/codeforces\.com\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)/i);
    if (cfSet) return "CF" + cfSet[1] + cfSet[2].toUpperCase();

    var cfContest = url.match(/codeforces\.com\/contest\/(\d+)\/problem\/([A-Za-z]\d*)/i);
    if (cfContest) return "CF" + cfContest[1] + cfContest[2].toUpperCase();

    var luogu = url.match(/luogu\.com\.cn\/problem\/([^/?#\s]+)/i);
    if (luogu) return luogu[1];

    var generic = url.match(/\/problem\/([^/?#\s]+)/i);
    if (generic) return generic[1];

    return "";
  }

  function tryAutoFillTitleFromUrl() {
    if (!titleInput || !linkInput) return;
    if ((titleInput.value || "").trim() !== "") return;

    var extracted = extractProblemIdFromUrl(linkInput.value);
    if (!extracted) return;

    titleInput.value = extracted;
    titleInput.classList.remove("is-invalid");
  }

  /* =========================================================
   *  题目笔记预览 / Tab
   * ========================================================= */

  function renderNotePreview() {
    if (!notePreview) return;
    renderMarkdownToElement(notePreview, noteInput ? noteInput.value : "", {
      emptyText: "暂无内容 · 切换到「✏️ 编辑」开始记录你的解题思路吧",
    });
  }

  function setNoteTab(mode) {
    if (mode !== "edit" && mode !== "preview") return;
    noteTabMode = mode;
    var isPreview = mode === "preview";

    if (noteTabEdit) {
      noteTabEdit.classList.toggle("is-active", !isPreview);
      noteTabEdit.setAttribute("aria-selected", String(!isPreview));
    }
    if (noteTabPreview) {
      noteTabPreview.classList.toggle("is-active", isPreview);
      noteTabPreview.setAttribute("aria-selected", String(isPreview));
    }

    if (isPreview) {
      renderNotePreview();
      if (noteInput) noteInput.hidden = true;
      if (notePreview) notePreview.hidden = false;
    } else {
      if (noteInput) noteInput.hidden = false;
      if (notePreview) notePreview.hidden = true;
    }
  }

  /* =========================================================
   *  大目录简介预览 / Tab
   * ========================================================= */

  function renderCatDescPreview() {
    if (!catDescPreview) return;
    renderMarkdownToElement(
      catDescPreview,
      catDescInput ? catDescInput.value : "",
      { emptyText: "暂无简介 · 切换到「✏️ 编辑」写点介绍吧" }
    );
  }

  function setCatDescTab(mode) {
    if (mode !== "edit" && mode !== "preview") return;
    catDescTabMode = mode;
    var isPreview = mode === "preview";

    if (catDescTabEdit) {
      catDescTabEdit.classList.toggle("is-active", !isPreview);
      catDescTabEdit.setAttribute("aria-selected", String(!isPreview));
    }
    if (catDescTabPreview) {
      catDescTabPreview.classList.toggle("is-active", isPreview);
      catDescTabPreview.setAttribute("aria-selected", String(isPreview));
    }

    if (isPreview) {
      renderCatDescPreview();
      if (catDescInput) catDescInput.hidden = true;
      if (catDescPreview) catDescPreview.hidden = false;
    } else {
      if (catDescInput) catDescInput.hidden = false;
      if (catDescPreview) catDescPreview.hidden = true;
    }
  }

  /* =========================================================
   *  Zen Mode
   * ========================================================= */

  function openZenMode(source) {
    if (!zenModal) return;

    zenSource = source === "catDesc" ? "catDesc" : "note";

    var srcText = "";
    var dynamicTitle = "";

    if (zenSource === "catDesc") {
      srcText = catDescInput ? catDescInput.value : "";

      var catName = "新分类";
      if (session.editingCategoryId) {
        var cat = getCategoryById(session.editingCategoryId);
        if (cat && cat.name) catName = cat.name;
      } else if (catNameInput && catNameInput.value.trim()) {
        catName = catNameInput.value.trim();
      }

      dynamicTitle = "大目录简介 · " + catName;
    } else {
      srcText = noteInput ? noteInput.value : "";

      var titleText = "新题目";
      if (session.editingNode && session.editingNode.data && session.editingNode.data.title) {
        titleText = session.editingNode.data.title;
      } else if (titleInput && titleInput.value.trim()) {
        titleText = titleInput.value.trim();
      }

      dynamicTitle = "题解笔记 - " + titleText;
    }

    if (zenTitle) {
      zenTitle.textContent = dynamicTitle;
      zenTitle.title = dynamicTitle;
    }

    if (zenInput) zenInput.value = srcText;

    renderMarkdownToElement(zenPreview, srcText, {
      emptyText: "开始输入后，右侧会实时渲染 Markdown、LaTeX 公式与代码",
    });

    zenModal.hidden = false;
    document.body.classList.add("modal-open");

    requestAnimationFrame(function () {
      if (!zenInput) return;
      zenInput.focus();
      try {
        zenInput.setSelectionRange(srcText.length, srcText.length);
        zenInput.scrollTop = zenInput.scrollHeight;
      } catch (_) { /* 忽略 */ }
    });
  }

  function closeZenMode(sync) {
    if (!zenModal || zenModal.hidden) return;

    if (sync !== false && zenInput) {
      if (zenSource === "catDesc" && catDescInput) {
        catDescInput.value = zenInput.value;
        if (catDescTabMode === "preview") renderCatDescPreview();
      } else if (zenSource === "note" && noteInput) {
        noteInput.value = zenInput.value;
        if (noteTabMode === "preview") renderNotePreview();
      }
    }

    zenModal.hidden = true;

    var catModalEl = document.getElementById("cat-modal");
    var readerModalEl = document.getElementById("reader-modal");
    if (
      modal.hidden &&
      (!catModalEl || catModalEl.hidden) &&
      (!readerModalEl || readerModalEl.hidden)
    ) {
      document.body.classList.remove("modal-open");
    }

    if (zenRenderTimer !== null) {
      clearTimeout(zenRenderTimer);
      zenRenderTimer = null;
    }
  }

  /* =========================================================
   *  📖 题解阅读视图
   * ========================================================= */

  function openReaderModal(node) {
    if (!readerModal) {
      console.error("[oitree] 无法打开阅读视图：reader-modal DOM 缺失！");
      return;
    }
    if (!node) {
      console.error("[oitree] openReaderModal 收到的 node 参数无效");
      return;
    }

    session.readerNode = node;

    var data = node.data || {};

    if (readerTitle) {
      readerTitle.textContent = data.title || "未命名题目";
    }

    if (readerDifficulty) {
      var diffInfo = difficultyMap.get(data.difficulty) || difficultyMap.get("none");
      readerDifficulty.textContent = diffInfo.label;
      readerDifficulty.style.background = hexToRgba(diffInfo.border, 0.18);
      readerDifficulty.style.borderColor = hexToRgba(diffInfo.border, 0.55);
      readerDifficulty.style.color = diffInfo.border;
    }

    if (readerStatus) {
      var st = statusMap.get(data.status) || statusMap.get(DEFAULT_STATUS);
      if (st && st.value !== "none" && st.shortLabel) {
        readerStatus.textContent = st.label;
        readerStatus.style.background = hexToRgba(st.color, 0.14);
        readerStatus.style.borderColor = hexToRgba(st.color, 0.5);
        readerStatus.style.color = st.color;
        readerStatus.hidden = false;
      } else {
        readerStatus.hidden = true;
      }
    }

    if (readerTags) {
      var tags = (data.tags || "").trim();
      readerTags.textContent = tags ? "· " + tags : "";
    }

    if (readerCreated) {
      readerCreated.textContent = data.createdAt ? "🕐 创建 " + data.createdAt : "";
    }
    if (readerCompleted) {
      readerCompleted.textContent = data.completedAt ? "✓ 完成于 " + data.completedAt : "";
    }

    if (readerBody) {
      readerBody.scrollTop = 0;
      renderMarkdownToElement(readerBody, data.note || "", {
        emptyText: "暂无复盘笔记 · 点击右上角「✏️ 编辑此题」添加解题思路、代码与公式…",
      });
    }

    readerModal.hidden = false;
    document.body.classList.add("modal-open");

    requestAnimationFrame(function () {
      if (readerBody) readerBody.focus();
    });
  }

  function closeReaderModal() {
    if (!readerModal || readerModal.hidden) return;

    readerModal.hidden = true;

    var catModalEl = document.getElementById("cat-modal");
    var zenModalEl = document.getElementById("zen-modal");
    if (
      modal.hidden &&
      (!catModalEl || catModalEl.hidden) &&
      (!zenModalEl || zenModalEl.hidden)
    ) {
      document.body.classList.remove("modal-open");
    }

    session.readerNode = null;
  }

  function readerToEdit() {
    var node = session.readerNode;
    if (!node) return;

    if (readerModal) readerModal.hidden = true;
    session.readerNode = null;

    openProblemModal(node);
  }

  /* =========================================================
   *  题目编辑弹窗
   * ========================================================= */

  function openProblemModal(node) {
    session.editingNode = node;
    form.reset();

    setNoteTab("edit");

    if (node) {
      modalTitle.textContent = "编辑题目";
      titleInput.value = node.data.title || "";
      difficultySelect.value = node.data.difficulty || "none";
      tagsInput.value = node.data.tags || "";
      linkInput.value = node.data.link || "";
      completedInput.value = node.data.completedAt || "";
      noteInput.value = node.data.note || "";

      setStatusValue(node.data.status || DEFAULT_STATUS);

      modalDeleteBtn.hidden = false;

      var created = node.data.createdAt || formatNow();
      modalCreateTime.textContent = "创建于 " + created;
    } else {
      modalTitle.textContent = "增加题目";
      difficultySelect.value = "none";
      completedInput.value = "";
      noteInput.value = "";
      modalDeleteBtn.hidden = true;
      modalCreateTime.textContent = "";

      setStatusValue(DEFAULT_STATUS);
    }

    /* 🎨 同步下拉框文字颜色 */
    syncDifficultySelectColor();

    titleInput.classList.remove("is-invalid");

    modal.hidden = false;
    document.body.classList.add("modal-open");

    requestAnimationFrame(function () {
      titleInput.focus();
      if (titleInput.select) titleInput.select();
    });
  }

  function closeProblemModal() {
    if (zenModal && !zenModal.hidden) {
      if (zenSource === "note") {
        closeZenMode(true);
      } else {
        zenModal.hidden = true;
      }
    }

    modal.hidden = true;
    var catModalEl = document.getElementById("cat-modal");
    var readerModalEl = document.getElementById("reader-modal");
    if (
      (!catModalEl || catModalEl.hidden) &&
      (!readerModalEl || readerModalEl.hidden)
    ) {
      document.body.classList.remove("modal-open");
    }
    session.editingNode = null;
    form.reset();
    modalCreateTime.textContent = "";

    setNoteTab("edit");
  }

  function bindProblemFormEvents() {
    modalCloseBtn.addEventListener("click", closeProblemModal);
    modalCancelBtn.addEventListener("click", closeProblemModal);

    modalDeleteBtn.addEventListener("click", function () {
      if (!session.editingNode) return;
      var id = session.editingNode.id;
      closeProblemModal();
      window.OITreeCanvas.deleteNodeById(id);
    });

    modal.addEventListener("mousedown", function (event) {
      if (event.target === modal) closeProblemModal();
    });

    titleInput.addEventListener("input", function () {
      titleInput.classList.remove("is-invalid");
    });

    if (linkInput) {
      linkInput.addEventListener("input", function () {
        tryAutoFillTitleFromUrl();
      });

      linkInput.addEventListener("paste", function () {
        setTimeout(function () {
          tryAutoFillTitleFromUrl();
        }, 0);
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var title = titleInput.value.trim();
      if (!title) {
        titleInput.classList.add("is-invalid");
        titleInput.focus();
        return;
      }

      var completedAt = (completedInput.value || "").trim();

      if (zenModal && !zenModal.hidden && zenSource === "note" && zenInput) {
        noteInput.value = zenInput.value;
      }

      var noteRaw = noteInput.value;
      var statusValue = getStatusValue();

      if (session.editingNode && nodes.has(session.editingNode.id)) {
        var prevCreatedAt = session.editingNode.data.createdAt || formatNow();

        session.editingNode.data = {
          title: title,
          difficulty: difficultySelect.value || "none",
          status: statusValue,
          tags: tagsInput.value.trim(),
          link: linkInput.value.trim(),
          note: noteRaw,
          createdAt: prevCreatedAt,
          completedAt: completedAt,
        };

        window.OITreeCanvas.applyNodeData(session.editingNode);
        syncActiveCategoryFromScene();
        if (onSceneChange) onSceneChange();
        persist();
      } else {
        var data = {
          title: title,
          difficulty: difficultySelect.value || "none",
          status: statusValue,
          tags: tagsInput.value.trim(),
          link: linkInput.value.trim(),
          note: noteRaw,
          createdAt: formatNow(),
          completedAt: completedAt,
        };

        window.OITreeCanvas.createNewNode(data);
        persist();
      }

      closeProblemModal();
    });
  }

  /* =========================================================
   *  🎨 难度下拉框选项注入（含颜色）
   * ========================================================= */

  function populateDifficultyOptions() {
    if (!difficultySelect) return;

    /* 防御：重复调用时清空旧选项（保留占位） */
    difficultySelect.replaceChildren();

    difficultyMap.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d.value;
      opt.textContent = d.label;

      /* 🎨 每个选项独立着色（深色背景避免原生菜单发白） */
      opt.style.color = d.border;
      opt.style.background = "#101827";
      opt.style.fontWeight = "650";

      difficultySelect.appendChild(opt);
    });

    difficultySelect.value = "none";

    /* 🎨 初始化后立即同步一次自身颜色 */
    syncDifficultySelectColor();
  }

  /* =========================================================
   *  公开 API
   * ========================================================= */

  var api = {
    bindEditorDom: bindEditorDom,
    setEditorOnSceneChange: setEditorOnSceneChange,

    renderNotePreview: renderNotePreview,
    setNoteTab: setNoteTab,
    renderCatDescPreview: renderCatDescPreview,
    setCatDescTab: setCatDescTab,

    openZenMode: openZenMode,
    closeZenMode: closeZenMode,

    openProblemModal: openProblemModal,
    closeProblemModal: closeProblemModal,
    bindProblemFormEvents: bindProblemFormEvents,
    populateDifficultyOptions: populateDifficultyOptions,

    openReaderModal: openReaderModal,
    closeReaderModal: closeReaderModal,
    readerToEdit: readerToEdit,

    extractProblemIdFromUrl: extractProblemIdFromUrl,

    setStatusValue: setStatusValue,
    getStatusValue: getStatusValue,

    /* 🎨 暴露同步方法（供外部按需刷新） */
    syncDifficultySelectColor: syncDifficultySelectColor,
  };

  window.openReaderModal = openReaderModal;
  window.closeReaderModal = closeReaderModal;

  return api;
})();