/* =========================================================
 *  dashboard.js — 双视图路由与个人中心工作台
 *  - #dashboard-view：个人中心（默认视图）
 *  - #canvas-view：算法技能树画布
 *  - 由 auth.js 在登录就绪后显示 Dashboard
 * ========================================================= */

window.OITreeDashboard = (function () {
  "use strict";

  var dashboardView = null;
  var canvasView = null;
  var avatarEl = null;
  var nameEl = null;
  var emailEl = null;
  var startBtn = null;
  var logoutBtn = null;
  var chartTotalEl = null;
  var barsTrackEl = null;
  var difficultyPopover = null;
  var popoverTitleEl = null;
  var popoverDotEl = null;
  var popoverListEl = null;
  var popoverCloseBtn = null;
  var chartRefreshRaf = null;
  var currentProblemsByDiff = {};
  var navButtons = [];
  var panels = [];
  var currentPanel = "home";

  var DEFAULT_NAME = "Jamig";
  var DEFAULT_EMAIL = "lzhr128@126.com";

  /* 洛谷官方 8 阶难度标准（不含“暂无评定”） */
  var DIFFICULTY_TIERS = [
    { key: "beginner", label: "入门", color: "#fe4c61" },
    { key: "easy", label: "普及-", color: "#f39c11" },
    { key: "basic", label: "普及", color: "#ffc116" },
    { key: "easy-medium", label: "普及+/提高-", color: "#52c41a" },
    { key: "medium", label: "提高", color: "#2196f3" },
    { key: "hard", label: "提高+/省选-", color: "#1b55e2" },
    { key: "harder", label: "省选/NOI-", color: "#9c27b0" },
    { key: "noi", label: "NOI/NOI+/CTS", color: "#475569" },
  ];

  var BAR_MIN_HEIGHT = 15;
  var BAR_MAX_HEIGHT = 168;

  function $(id) {
    return document.getElementById(id);
  }

  function getAuth() {
    return window.OITreeAuth || null;
  }

  function getCanvasApi() {
    return window.OITreeCanvas || null;
  }

  function setViewActive(view, active) {
    if (!view) return;
    view.classList.toggle("active", !!active);
    view.setAttribute("aria-hidden", active ? "false" : "true");
  }

  function applyUser(user) {
    var name = DEFAULT_NAME;
    var email = DEFAULT_EMAIL;

    if (user) {
      var meta = user.user_metadata || {};
      name =
        meta.username ||
        meta.display_name ||
        meta.full_name ||
        DEFAULT_NAME;
      email = user.email || DEFAULT_EMAIL;
    }

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;

    if (avatarEl) {
      var source = String(name || email || "J").trim();
      avatarEl.textContent = (source.charAt(0) || "J").toUpperCase();
    }
  }

  function refreshUser() {
    var auth = getAuth();
    applyUser(
      auth && typeof auth.getUser === "function" ? auth.getUser() : null
    );
  }

  function isHomeActive() {
    if (!dashboardView || !dashboardView.classList.contains("active")) {
      return false;
    }

    for (var i = 0; i < panels.length; i++) {
      if (panels[i].dataset.panel === "home") {
        return panels[i].classList.contains("is-active");
      }
    }

    return true;
  }

  /**
   * 聚合全量题目的洛谷 8 阶难度数据。
   * 当前分类优先读取画布内存节点，避免刚编辑完时 state 尚未刷新。
   */
  function collectDifficultyStats() {
    var counts = {};
    var problems = {};

    DIFFICULTY_TIERS.forEach(function (tier) {
      counts[tier.key] = 0;
      problems[tier.key] = [];
    });

    var appState = window.state;
    if (!appState || !Array.isArray(appState.categories)) {
      return { counts: counts, total: 0, unrated: 0, problems: problems };
    }

    var activeId = appState.activeCategoryId;
    var canvasNodes = window.nodes;
    var hasCanvasNodes =
      canvasNodes &&
      typeof canvasNodes.size === "number" &&
      canvasNodes.size > 0;

    var total = 0;
    var unrated = 0;

    function addNode(categoryId, nd) {
      total += 1;

      var data = nd && nd.data ? nd.data : {};
      var diff = data.difficulty;

      if (diff && Object.prototype.hasOwnProperty.call(counts, diff)) {
        counts[diff] += 1;
        problems[diff].push({
          categoryId: categoryId,
          nodeId: Number(nd.id),
          title: String(data.title || "未命名题目"),
          status: typeof data.status === "string" ? data.status : "none",
          link: typeof data.link === "string" ? data.link : "",
        });
      } else {
        unrated += 1;
      }
    }

    appState.categories.forEach(function (cat) {
      var list = Array.isArray(cat.nodes) ? cat.nodes : [];

      /* 当前分类使用画布中的最新节点，避免统计滞后 */
      if (hasCanvasNodes && cat.id === activeId) {
        list = Array.from(canvasNodes.values());
      }

      list.forEach(function (nd) {
        addNode(cat.id, nd);
      });
    });

    DIFFICULTY_TIERS.forEach(function (tier) {
      problems[tier.key].sort(function (a, b) {
        return a.title.localeCompare(b.title, "zh-Hans-CN", {
          numeric: true,
          sensitivity: "base",
        });
      });
    });

    return {
      counts: counts,
      total: total,
      unrated: unrated,
      problems: problems,
    };
  }

  function buildDifficultyUnit(tier, count, height) {
    var unit = document.createElement("div");
    unit.className = "bar-unit" + (count === 0 ? " is-zero" : "");
    unit.dataset.diff = tier.key;
    unit.style.setProperty("--bar-color", tier.color);
    unit.style.setProperty("--target-h", height + "px");
    unit.setAttribute("role", "button");
    unit.tabIndex = 0;
    unit.title = tier.label + " · " + count + " 题";
    unit.setAttribute("aria-label", tier.label + " · " + count + " 题");

    var value = document.createElement("span");
    value.className = "bar-val";
    value.textContent = String(count);

    var pill = document.createElement("div");
    pill.className = "bar-pill";

    var label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = tier.label;

    unit.append(value, pill, label);

    unit.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleDifficultyPopover(tier, unit);
    });

    unit.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleDifficultyPopover(tier, unit);
    });

    return unit;
  }

  function renderHomeChart() {
    if (!barsTrackEl || !chartTotalEl) return;

    closeDifficultyPopover();

    var data = collectDifficultyStats();
    currentProblemsByDiff = data.problems || {};

    chartTotalEl.textContent = String(data.total);
    chartTotalEl.title = data.unrated
      ? "未评定 " + data.unrated + " 题"
      : "";

    var maxCount = 0;
    DIFFICULTY_TIERS.forEach(function (tier) {
      if (data.counts[tier.key] > maxCount) {
        maxCount = data.counts[tier.key];
      }
    });

    var fragment = document.createDocumentFragment();
    var units = [];

    DIFFICULTY_TIERS.forEach(function (tier) {
      var count = data.counts[tier.key] || 0;
      var ratio = maxCount > 0 ? count / maxCount : 0;
      var height = Math.round(
        BAR_MIN_HEIGHT + ratio * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT)
      );

      var unit = buildDifficultyUnit(tier, count, height);
      units.push(unit);
      fragment.appendChild(unit);
    });

    barsTrackEl.replaceChildren(fragment);

    /* 先保持高度 0，触发浏览器布局后再平滑生长 */
    void barsTrackEl.offsetWidth;

    window.requestAnimationFrame(function () {
      units.forEach(function (unit) {
        unit.classList.add("is-up");
      });
    });
  }

  function scheduleHomeChartRefresh() {
    if (chartRefreshRaf !== null) return;
    if (!isHomeActive()) return;

    chartRefreshRaf = window.requestAnimationFrame(function () {
      chartRefreshRaf = null;
      renderHomeChart();
    });
  }

  function getProblemDisplayName(problem) {
    var title = problem.title || "未命名题目";
    var link = problem.link || "";
    var match = link.match(/problem\/([A-Za-z0-9_]+)/i);

    if (match && title.indexOf(match[1]) === -1) {
      return match[1] + " " + title;
    }

    return title;
  }

  function getStatusBadge(status) {
    var map = window.statusMap;
    var info = map && typeof map.get === "function" ? map.get(status) : null;

    if (!info) {
      return { text: "未开始", className: "status-none" };
    }

    return {
      text: info.shortLabel || info.label || "未开始",
      className: "status-" + (status || "none"),
    };
  }

  function closeDifficultyPopover() {
    if (difficultyPopover) difficultyPopover.hidden = true;

    if (barsTrackEl) {
      barsTrackEl
        .querySelectorAll(".bar-unit.is-active")
        .forEach(function (unit) {
          unit.classList.remove("is-active");
        });
    }
  }

  function positionDifficultyPopover(unit) {
    if (!difficultyPopover || difficultyPopover.hidden) return;

    var card = $("home-chart-card");

    if (!card || !unit) {
      difficultyPopover.style.left = "auto";
      difficultyPopover.style.right = "16px";
      return;
    }

    var cardRect = card.getBoundingClientRect();
    var unitRect = unit.getBoundingClientRect();
    var popWidth = difficultyPopover.offsetWidth || 300;
    var left = unitRect.left - cardRect.left + unitRect.width / 2 - popWidth / 2;
    var maxLeft = Math.max(12, cardRect.width - popWidth - 12);

    left = Math.min(Math.max(12, left), maxLeft);

    difficultyPopover.style.left = left + "px";
    difficultyPopover.style.right = "auto";
  }

  function openDifficultyPopover(tier, unit) {
    if (!difficultyPopover) return;

    var problems = currentProblemsByDiff[tier.key] || [];

    if (barsTrackEl) {
      barsTrackEl.querySelectorAll(".bar-unit").forEach(function (el) {
        el.classList.toggle("is-active", el === unit);
      });
    }

    if (popoverDotEl) {
      popoverDotEl.style.background = tier.color;
    }

    if (popoverTitleEl) {
      popoverTitleEl.textContent = tier.label + " · " + problems.length + " 题";
    }

    if (popoverListEl) {
      popoverListEl.replaceChildren();

      if (problems.length === 0) {
        var empty = document.createElement("li");
        empty.className = "popover-empty";
        empty.textContent = "暂无题目";
        popoverListEl.appendChild(empty);
      } else {
        problems.forEach(function (problem) {
          var li = document.createElement("li");
          li.className = "popover-problem";
          li.tabIndex = 0;
          li.dataset.categoryId = problem.categoryId;
          li.dataset.nodeId = String(problem.nodeId);
          li.setAttribute("role", "button");
          li.setAttribute(
            "aria-label",
            "在画布中定位题目：" + getProblemDisplayName(problem)
          );

          var name = document.createElement("span");
          name.className = "popover-problem-name";
          name.textContent = getProblemDisplayName(problem);
          name.title = problem.title || "";

          var badge = getStatusBadge(problem.status);
          var statusEl = document.createElement("span");
          statusEl.className = "problem-status " + badge.className;
          statusEl.textContent = badge.text;

          li.append(name, statusEl);

          function openProblem(event) {
            if (event) event.stopPropagation();
            closeDifficultyPopover();
            showCanvas({
              focus: {
                categoryId: problem.categoryId,
                nodeId: problem.nodeId,
              },
            });
          }

          li.addEventListener("click", openProblem);
          li.addEventListener("keydown", function (event) {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openProblem(event);
          });

          popoverListEl.appendChild(li);
        });
      }
    }

    difficultyPopover.hidden = false;

    window.requestAnimationFrame(function () {
      positionDifficultyPopover(unit);
    });
  }

  function toggleDifficultyPopover(tier, unit) {
    if (!difficultyPopover) return;

    if (
      !difficultyPopover.hidden &&
      unit.classList.contains("is-active")
    ) {
      closeDifficultyPopover();
      return;
    }

    openDifficultyPopover(tier, unit);
  }

  function switchPanel(panel) {
    if (!panel) return;
    currentPanel = panel;

    navButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.dataset.panel === panel);
    });

    panels.forEach(function (el) {
      el.classList.toggle("is-active", el.dataset.panel === panel);
    });

    if (panel === "home") {
      scheduleHomeChartRefresh();
    }
  }

  /* 切回个人中心时收起画布上的浮层，保证 Dashboard 干净 */
  function closeCanvasOverlays() {
    var drawer = $("drawer");
    var backdrop = $("drawer-backdrop");
    var drawerToggle = $("drawer-toggle");
    var userMenu = $("toolbar-user-menu");
    var userBtn = $("toolbar-user-btn");

    if (drawer) drawer.classList.remove("is-open");
    if (backdrop) backdrop.classList.remove("is-visible");
    if (drawerToggle) drawerToggle.classList.remove("is-open");
    if (userMenu) userMenu.classList.add("hidden");
    if (userBtn) userBtn.setAttribute("aria-expanded", "false");
  }

  function showDashboard() {
    if (!dashboardView || !canvasView) return;

    closeCanvasOverlays();
    refreshUser();

    setViewActive(canvasView, false);
    setViewActive(dashboardView, true);

    /* 视图可见后再按真实尺寸渲染首页图表 */
    scheduleHomeChartRefresh();
  }

  function showCanvas(options) {
    if (!dashboardView || !canvasView) return;

    closeDifficultyPopover();

    var focus = options && options.focus ? options.focus : null;

    /* 从难度清单跳转时：若题目属于其他分类，先切换并重载该分类 */
    if (focus && focus.categoryId && window.state) {
      if (window.state.activeCategoryId !== focus.categoryId) {
        if (typeof window.syncActiveCategoryFromScene === "function") {
          window.syncActiveCategoryFromScene();
        }

        window.state.activeCategoryId = focus.categoryId;

        if (
          window.OITreeApp &&
          typeof window.OITreeApp.renderWorkspace === "function"
        ) {
          window.OITreeApp.renderWorkspace(false);
        } else if (
          window.OITreeCanvas &&
          typeof window.OITreeCanvas.loadActiveCategory === "function"
        ) {
          window.OITreeCanvas.loadActiveCategory({ autoFocusFirst: false });
        }

        if (typeof window.persist === "function") {
          window.persist({ cloud: false });
        }
      }
    }

    closeCanvasOverlays();
    setViewActive(dashboardView, false);
    setViewActive(canvasView, true);

    var canvasApi = getCanvasApi();
    if (!canvasApi) return;

    /* display 切换后同步重绘；getBoundingClientRect 会强制完成一次布局 */
    if (focus && focus.nodeId !== undefined && focus.nodeId !== null) {
      var node =
        window.nodes && typeof window.nodes.get === "function"
          ? window.nodes.get(Number(focus.nodeId))
          : null;

      if (node) {
        if (
          typeof canvasApi.getGraphComponents === "function" &&
          typeof canvasApi.setComponentFilter === "function"
        ) {
          var components = canvasApi.getGraphComponents();

          for (var i = 0; i < components.length; i++) {
            if (components[i].nodeIds.indexOf(node.id) !== -1) {
              canvasApi.setComponentFilter(components[i].nodeIds);
              break;
            }
          }
        }

        if (typeof canvasApi.setSelectedNode === "function") {
          canvasApi.setSelectedNode(node.id);
        }

        if (typeof canvasApi.panToNode === "function") {
          canvasApi.panToNode(node);
          return;
        }
      }
    }

    if (typeof canvasApi.applyView === "function") canvasApi.applyView();
    if (typeof canvasApi.renderLinks === "function") canvasApi.renderLinks();

    if (typeof canvasApi.autoFocusFirstComponent === "function") {
      canvasApi.autoFocusFirstComponent();
    }
    if (typeof canvasApi.fitToView === "function") {
      canvasApi.fitToView();
    }
  }

  function handleLogoutClick() {
    var auth = getAuth();
    if (!auth || typeof auth.signOut !== "function") {
      console.warn("[dashboard] 鉴权模块未就绪，无法退出登录");
      return;
    }

    var originalText = logoutBtn ? logoutBtn.textContent : "退出登录";

    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.textContent = "正在退出...";
    }

    function restoreButton() {
      if (!logoutBtn) return;
      logoutBtn.disabled = false;
      logoutBtn.textContent = originalText || "退出登录";
    }

    Promise.resolve(auth.signOut()).then(restoreButton, restoreButton);
  }

  function init() {
    dashboardView = $("dashboard-view");
    canvasView = $("canvas-view");
    avatarEl = $("dashboard-avatar");
    nameEl = $("dashboard-user-name");
    emailEl = $("dashboard-user-email");
    startBtn = $("btn-start-record");
    logoutBtn = $("dashboard-logout");
    chartTotalEl = $("total-problems-num");
    barsTrackEl = $("bars-track");
    difficultyPopover = $("diff-popover");
    popoverTitleEl = $("popover-diff-title");
    popoverDotEl = $("popover-dot");
    popoverListEl = $("popover-problems-list");
    popoverCloseBtn = $("popover-close-btn");

    navButtons = Array.prototype.slice.call(
      document.querySelectorAll(".dashboard-nav-btn")
    );
    panels = Array.prototype.slice.call(
      document.querySelectorAll(".dashboard-panel")
    );

    navButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchPanel(btn.dataset.panel);
      });
    });

    if (startBtn) {
      startBtn.addEventListener("click", function () {
        showCanvas();
      });
    }
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogoutClick);

    if (popoverCloseBtn) {
      popoverCloseBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        closeDifficultyPopover();
      });
    }

    /* 点击浮窗 / 柱体以外的区域关闭清单 */
    document.addEventListener("click", function (event) {
      if (!difficultyPopover || difficultyPopover.hidden) return;
      if (difficultyPopover.contains(event.target)) return;
      if (event.target.closest && event.target.closest(".bar-unit")) return;
      closeDifficultyPopover();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (!difficultyPopover || difficultyPopover.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      closeDifficultyPopover();
    });

    window.addEventListener("resize", closeDifficultyPopover);

    var auth = getAuth();
    if (auth && typeof auth.onChange === "function") {
      auth.onChange(applyUser);
    } else {
      refreshUser();
    }

    /* 本地保存 / 拓扑变化 / 云端数据应用后刷新 8 阶统计 */
    ["oitree:persist", "oitree:graph-changed", "oitree:state-applied"].forEach(
      function (eventName) {
        window.addEventListener(eventName, scheduleHomeChartRefresh);
      }
    );

    switchPanel("home");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    showDashboard: showDashboard,
    showCanvas: showCanvas,
    setUser: applyUser,
    switchPanel: switchPanel,
    refreshHomeChart: renderHomeChart,
    getActiveView: function () {
      if (dashboardView && dashboardView.classList.contains("active")) {
        return "dashboard";
      }
      if (canvasView && canvasView.classList.contains("active")) {
        return "canvas";
      }
      return "none";
    },
    getPanel: function () {
      return currentPanel;
    },
  };
})();
