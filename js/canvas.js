/* =========================================================
 *  canvas.js — 画布核心引擎
 *  IIFE 隔离：模块私有 DOM 引用 / 内部状态不会污染全局
 *  通过 window.OITreeCanvas 暴露公开 API
 *  🎨 难度配色自动继承 state.js 的 difficultyMap，无需改动
 * ========================================================= */

window.OITreeCanvas = (function () {
  "use strict";

  var canvas = null;
  var world = null;
  var linksLayer = null;
  var previewLayer = null;
  var arrowMarker = null;
  var zoomValue = null;

  function bindCanvasDom(refs) {
    canvas = refs.canvas;
    world = refs.world;
    linksLayer = refs.linksLayer;
    previewLayer = refs.previewLayer;
    arrowMarker = refs.arrowMarker;
    zoomValue = refs.zoomValue;
  }

  var canvasInfo = null;
  var canvasInfoHeader = null;
  var canvasInfoIcon = null;
  var canvasInfoHeaderText = null;
  var canvasInfoChevron = null;
  var canvasInfoDetail = null;
  var canvasInfoAuthorLine = null;
  var canvasInfoAuthor = null;
  var canvasInfoLuoguDot = null;
  var canvasInfoLuogu = null;
  var canvasInfoDescRow = null;
  var canvasInfoToggle = null;
  var canvasInfoToggleIcon = null;
  var canvasInfoToggleText = null;
  var canvasInfoDesc = null;

  function bindCanvasInfoDom(refs) {
    canvasInfo = refs.canvasInfo;
    canvasInfoHeader = refs.canvasInfoHeader;
    canvasInfoIcon = refs.canvasInfoIcon;
    canvasInfoHeaderText = refs.canvasInfoHeaderText;
    canvasInfoChevron = refs.canvasInfoChevron;
    canvasInfoDetail = refs.canvasInfoDetail;
    canvasInfoAuthorLine = refs.canvasInfoAuthorLine;
    canvasInfoAuthor = refs.canvasInfoAuthor;
    canvasInfoLuoguDot = refs.canvasInfoLuoguDot;
    canvasInfoLuogu = refs.canvasInfoLuogu;
    canvasInfoDescRow = refs.canvasInfoDescRow;
    canvasInfoToggle = refs.canvasInfoToggle;
    canvasInfoToggleIcon = refs.canvasInfoToggleIcon;
    canvasInfoToggleText = refs.canvasInfoToggleText;
    canvasInfoDesc = refs.canvasInfoDesc;

    if (canvasInfoHeader) {
      canvasInfoHeader.addEventListener("click", toggleInfoPanel);
    }
    if (canvasInfoToggle) {
      canvasInfoToggle.addEventListener("click", function () {
        descExpanded = !descExpanded;
        if (descExpanded) {
          canvasInfoDesc.hidden = false;
          canvasInfoToggleIcon.textContent = "▴";
          canvasInfoToggleText.textContent = "收起简介";
        } else {
          canvasInfoDesc.hidden = true;
          canvasInfoToggleIcon.textContent = "▾";
          canvasInfoToggleText.textContent = "查看简介";
        }
      });
    }
  }

  var previewLine = null;
  var wheelTimer = null;
  var viewAnimRaf = null;
  var nodeFlashTimer = null;
  var descExpanded = false;
  var infoPanelExpanded = false;

  var spotlightIds = null;
  var lastSpotlightFirstId = undefined;

  /* 悬停血统聚焦：当前鼠标所在节点 ID（null 表示未聚焦） */
  var hoveredNodeId = null;

  /* 根题目导航过滤：当前独占显示的连通块节点集合（null = 全部显示） */
  var filterNodeIds = null;
  var filterCategoryId = null;

  /* 跨连通块拉线时临时唤醒全图，松手后再恢复原聚焦 */
  var connectionReveal = false;
  var connectionPrevFilterIds = null;
  var connectionPrevFilterCategoryId = null;

  /* =========================================================
   *  横向（LR）自动布局参数
   * ========================================================= */
  var LAYOUT_VERSION =
    typeof CATEGORY_LAYOUT_VERSION === "number" ? CATEGORY_LAYOUT_VERSION : 5;
  var RANK_SEP = 340;          /* 层间距（X 轴），推荐 320~360 */
  var LAYOUT_FIXED_GAP = 40;   /* 同列卡片垂直最小间距（Y 轴） */
  var LAYOUT_PADDING_X = 160;  /* 左边距 */
  var LAYOUT_PADDING_Y = 160;  /* 上边距 */
  var LAYOUT_ANIM_DURATION = 420; /* 整理归位动画时长（ms） */

  var onNodeClick = null;
  var onNoteClick = null;

  function setNodeClickHandler(handler) {
    onNodeClick = handler;
    nodes.forEach(function (node) {
      node.__onClick = handler;
    });
  }

  function setNoteClickHandler(handler) {
    onNoteClick = handler;
    nodes.forEach(function (node) {
      node.__onNoteClick = handler;
    });
  }

  var onSceneChange = null;
  function setOnSceneChange(handler) {
    onSceneChange = handler;
  }

  function screenToWorld(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var sx = clientX - rect.left;
    var sy = clientY - rect.top;
    return {
      x: (sx - view.x) / view.scale,
      y: (sy - view.y) / view.scale,
    };
  }

  function worldToScreen(wx, wy) {
    return {
      x: wx * view.scale + view.x,
      y: wy * view.scale + view.y,
    };
  }

  function updateGrid() {
    var size = BASE_GRID * view.scale;
    while (size < 15) size *= 2;
    while (size > 130) size /= 2;

    canvas.style.backgroundSize = size + "px " + size + "px";
    canvas.style.backgroundPosition = view.x + "px " + view.y + "px";
  }

  function applyView() {
    world.style.transform =
      "translate(" + view.x + "px, " + view.y + "px) scale(" + view.scale + ")";

    var arrowSize = Math.max(8, Math.min(20, 12 * view.scale));
    arrowMarker.setAttribute("markerWidth", arrowSize);
    arrowMarker.setAttribute("markerHeight", arrowSize);

    updateGrid();
    zoomValue.textContent = Math.round(view.scale * 100) + "%";
    renderLinks();
  }

  function animateViewTo(targetX, targetY, targetScale, duration) {
    if (duration === undefined) duration = 520;

    if (viewAnimRaf !== null) {
      cancelAnimationFrame(viewAnimRaf);
      viewAnimRaf = null;
    }

    var startX = view.x;
    var startY = view.y;
    var startScale = view.scale;
    var startTime = performance.now();

    function step(now) {
      var t = Math.min(1, (now - startTime) / duration);
      var eased = 1 - Math.pow(1 - t, 3);

      view.x = startX + (targetX - startX) * eased;
      view.y = startY + (targetY - startY) * eased;
      view.scale = startScale + (targetScale - startScale) * eased;

      applyView();

      if (t < 1) {
        viewAnimRaf = requestAnimationFrame(step);
      } else {
        viewAnimRaf = null;
      }
    }

    viewAnimRaf = requestAnimationFrame(step);
  }

  /* 手动拖拽 / 缩放时立即终止运镜动画，避免与用户操作打架 */
  function stopViewAnimation() {
    if (viewAnimRaf !== null) {
      cancelAnimationFrame(viewAnimRaf);
      viewAnimRaf = null;
    }
  }

  /* =========================================================
   *  节点整理动画：逐帧插值 X / Y，同时重绘 SVG 连线
   *  - 卡片与连线始终贴合，避免 CSS 位移与连线重绘脱节；
   *  - 拖拽 / 切换分类时调用 stopLayoutAnimation 立即收尾。
   * ========================================================= */
  var layoutAnimRaf = null;
  var layoutAnimTargets = null;

  function stopLayoutAnimation(snapToTarget) {
    if (layoutAnimRaf !== null) {
      cancelAnimationFrame(layoutAnimRaf);
      layoutAnimRaf = null;
    }

    if (snapToTarget && layoutAnimTargets) {
      layoutAnimTargets.forEach(function (target) {
        if (nodes.get(target.node.id) !== target.node) return;
        setNodePosition(target.node, target.x, target.y, false);
      });
      renderLinks();
    }

    /* 先落位再恢复过渡，避免取消瞬间重新触发 left/top 过渡 */
    if (canvas) canvas.classList.remove("is-layout-animating");

    layoutAnimTargets = null;
  }

  function animateNodePositions(targets, duration, onDone) {
    stopLayoutAnimation(false);

    if (!targets || targets.length === 0) {
      if (typeof onDone === "function") onDone();
      return;
    }

    var starts = targets.map(function (target) {
      return { x: target.node.x, y: target.node.y };
    });

    layoutAnimTargets = targets;
    canvas.classList.add("is-layout-animating");

    var startTime = performance.now();

    function frame(now) {
      var t = Math.min(1, (now - startTime) / duration);
      var eased = 1 - Math.pow(1 - t, 3);

      for (var i = 0; i < targets.length; i++) {
        var target = targets[i];
        var start = starts[i];
        setNodePosition(
          target.node,
          start.x + (target.x - start.x) * eased,
          start.y + (target.y - start.y) * eased,
          false
        );
      }

      renderLinks();

      if (t < 1) {
        layoutAnimRaf = requestAnimationFrame(frame);
        return;
      }

      layoutAnimRaf = null;
      layoutAnimTargets = null;

      /* 最终精确落位，规避插值尾差（保持过渡关闭，防止尾帧二次缓动） */
      for (var k = 0; k < targets.length; k++) {
        setNodePosition(targets[k].node, targets[k].x, targets[k].y, false);
      }
      renderLinks();

      canvas.classList.remove("is-layout-animating");

      if (typeof onDone === "function") onDone();
    }

    layoutAnimRaf = requestAnimationFrame(frame);
  }

  /* =========================================================
   *  节点高光闪烁（单例）
   *  - 全局只保留一个定时器：快速连点题目时先清场上一次高光；
   *  - 同一时刻只允许唯一目标卡片处于 flash-highlight 状态。
   * ========================================================= */
  function clearNodeFlash() {
    if (nodeFlashTimer !== null) {
      clearTimeout(nodeFlashTimer);
      nodeFlashTimer = null;
    }

    /* 强制清场：抹掉所有节点上残留的闪烁类，避免多卡并发闪烁 */
    var flashing = document.querySelectorAll(".node.flash-highlight");
    for (var i = 0; i < flashing.length; i++) {
      flashing[i].classList.remove("flash-highlight");
    }
  }

  function flashNode(node) {
    if (!node || !node.el) return;

    clearNodeFlash();

    /* 同一卡片连续点击时也强制重启 CSS 动画 */
    node.el.classList.remove("flash-highlight");
    void node.el.offsetWidth;
    node.el.classList.add("flash-highlight");

    nodeFlashTimer = window.setTimeout(function () {
      node.el.classList.remove("flash-highlight");
      nodeFlashTimer = null;
    }, 1500);
  }

  /**
   * 镜头平滑对焦某个节点。
   * options.rightInset: 画布右侧被浮层（如题目抽屉）遮挡的像素宽度，
   * 用于把目标节点推到“剩余可视区域”的正中央。
   */
  function panToNode(node, options) {
    if (!node) return;

    var opts = options || {};
    var rightInset = typeof opts.rightInset === "number"
      ? Math.max(0, opts.rightInset)
      : 0;

    var rect = canvas.getBoundingClientRect();
    var finalScale = view.scale < 0.85 ? 0.85 : view.scale;

    /* 扣掉右侧抽屉宽度，避免目标卡片停在抽屉底下；
     * 画布本地坐标已包含左侧分类栏偏移，是 (window.innerWidth - drawerWidth)/2
     * 在画布坐标系中的等价实现。 */
    var usableWidth = Math.max(160, rect.width - rightInset);
    var targetScreenX = usableWidth / 2;
    var targetScreenY = rect.height / 2;

    var targetX = targetScreenX - node.x * finalScale;
    var targetY = targetScreenY - node.y * finalScale;

    animateViewTo(targetX, targetY, finalScale, 520);
    flashNode(node);

    /* 仅镜头移动 / 选中，属于只读导航动作：只落本地，不触发云端上传 */
    persist({ cloud: false });
  }

  function fitToView() {
    var visibleNodes = [];

    var activeFilter = connectionReveal ? null : filterNodeIds;

    nodes.forEach(function (node) {
      if (activeFilter && !activeFilter.has(node.id)) return;
      visibleNodes.push(node);
    });

    if (visibleNodes.length === 0) {
      view.scale = 1;
      view.x = 0;
      view.y = 0;
      applyView();
      return;
    }

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    visibleNodes.forEach(function (n) {
      minX = Math.min(minX, n.x - NODE_W / 2);
      maxX = Math.max(maxX, n.x + NODE_W / 2);
      minY = Math.min(minY, n.y - NODE_H / 2);
      maxY = Math.max(maxY, n.y + NODE_H / 2);
    });

    var rect = canvas.getBoundingClientRect();
    var padX = 90, padY = 110;
    var contentW = maxX - minX + padX * 2;
    var contentH = maxY - minY + padY * 2;
    var scale = Math.min(rect.width / contentW, rect.height / contentH);
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(scale, 1.15)));

    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;

    view.scale = scale;
    view.x = rect.width / 2 - cx * scale;
    view.y = rect.height / 2 - cy * scale;

    applyView();
  }

  function setSelectedNode(id) {
    if (session.selectedNodeId === id) return;
    if (session.selectedNodeId !== null) {
      var prev = nodes.get(session.selectedNodeId);
      if (prev) prev.el.classList.remove("is-selected");
    }
    session.selectedNodeId = id;
    if (id !== null) {
      var next = nodes.get(id);
      if (next) next.el.classList.add("is-selected");
    }
  }

  function applySpotlight(matchedIds) {
    var next;
    if (matchedIds === null || matchedIds === undefined) {
      next = null;
    } else if (matchedIds instanceof Set) {
      next = matchedIds;
    } else if (Array.isArray(matchedIds)) {
      next = new Set(matchedIds);
    } else {
      next = null;
    }

    /* 独占分支过滤时，聚光灯只考虑当前可见节点（拉线唤醒全图时不过滤） */
    if (next && filterNodeIds && !connectionReveal) {
      var visibleMatches = new Set();
      next.forEach(function (id) {
        var numericId = Number(id);
        if (filterNodeIds.has(numericId)) visibleMatches.add(numericId);
      });
      next = visibleMatches.size ? visibleMatches : null;
    }

    spotlightIds = next;
    updateSpotlightClasses();

    if (spotlightIds !== null && spotlightIds.size > 0) {
      var firstId = null;
      spotlightIds.forEach(function (id) {
        if (firstId === null) firstId = id;
      });

      if (firstId !== lastSpotlightFirstId) {
        var node = nodes.get(firstId);
        if (node) panToNode(node);
        lastSpotlightFirstId = firstId;
      }
    } else {
      lastSpotlightFirstId = undefined;
    }
  }

  function clearSpotlight() {
    spotlightIds = null;
    lastSpotlightFirstId = undefined;
    updateSpotlightClasses();
  }

  /* =========================================================
   *  悬停血统高光聚焦
   *  - 当前卡片 + 所有祖先 + 所有子孙 + 沿途连线
   *  - 使用双向 BFS 递归遍历，完整点亮整条血统链路
   * ========================================================= */

  function getLineage(id) {
    var nodeIds = new Set([id]);
    var edgeKeys = new Set();

    /* 构建有向邻接表：out = 后继，into = 前驱 */
    var outMap = new Map();
    var inMap = new Map();

    links.forEach(function (link, key) {
      if (!outMap.has(link.from)) outMap.set(link.from, []);
      outMap.get(link.from).push({ id: link.to, key: key });

      if (!inMap.has(link.to)) inMap.set(link.to, []);
      inMap.get(link.to).push({ id: link.from, key: key });
    });

    /**
     * BFS 遍历一个方向（顺流 / 逆流）。
     * visited 以根节点为初始值，既能避免重复入队，也能防止数据中存在环时死循环。
     */
    function traverse(adjacency, queue) {
      var visited = new Set([id]);
      var cursor = 0;

      while (cursor < queue.length) {
        var currentId = queue[cursor++];
        var nextEdges = adjacency.get(currentId) || [];

        for (var i = 0; i < nextEdges.length; i++) {
          var edge = nextEdges[i];

          edgeKeys.add(edge.key);
          nodeIds.add(edge.id);

          if (!visited.has(edge.id)) {
            visited.add(edge.id);
            queue.push(edge.id);
          }
        }
      }
    }

    /* 顺流：一路点亮所有子孙题目及连线 */
    traverse(outMap, [id]);
    /* 逆流：一路上溯所有前置母题及连线 */
    traverse(inMap, [id]);

    return { nodeIds: nodeIds, edgeKeys: edgeKeys };
  }

  function setHoveredNode(id) {
    if (hoveredNodeId === id) return;
    hoveredNodeId = id;
    applyHoverHighlight();
  }

  function clearHoverFocus() {
    if (hoveredNodeId === null && !canvas.classList.contains("is-focused")) return;
    hoveredNodeId = null;
    applyHoverHighlight();
  }

  function applyHoverHighlight() {
    nodes.forEach(function (node) {
      node.el.classList.remove("highlight");
    });

    var groups = linksLayer.querySelectorAll(".edge-group");
    groups.forEach(function (group) {
      group.classList.remove("highlight");

      var line = group.querySelector(".edge-line");
      if (line) line.setAttribute("marker-end", "url(#arrow)");
    });

    if (hoveredNodeId === null || !nodes.has(hoveredNodeId)) {
      canvas.classList.remove("is-focused");
      return;
    }

    canvas.classList.add("is-focused");

    var lineage = getLineage(hoveredNodeId);

    lineage.nodeIds.forEach(function (id) {
      var node = nodes.get(id);
      if (node) node.el.classList.add("highlight");
    });

    var highlighted = [];
    groups.forEach(function (group) {
      if (lineage.edgeKeys.has(group.dataset.key)) {
        group.classList.add("highlight");

        var lineEl = group.querySelector(".edge-line");
        if (lineEl) lineEl.setAttribute("marker-end", "url(#arrow-highlight)");

        highlighted.push(group);
      }
    });

    /* 高光连线移到最上层，避免被其他连线的 Halo 描边切断 */
    for (var i = 0; i < highlighted.length; i++) {
      linksLayer.appendChild(highlighted[i]);
    }
  }

  /* =========================================================
   *  根题目导航：连通块分析 / 分支独占过滤 / 智能居中运镜
   * ========================================================= */

  function notifyGraphChanged() {
    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("oitree:graph-changed"));
    }
  }

  /**
   * 分析当前画布图谱：
   * - 无向 BFS 划分弱连通块（专题分支）
   * - 每个分支内统计入度，入度为 0 的节点作为根题目（支持多根）
   */
  function getGraphComponents() {
    var ids = Array.from(nodes.keys());
    if (!ids.length) return [];

    var adjacency = new Map(ids.map(function (id) { return [id, []]; }));
    var indeg = new Map(ids.map(function (id) { return [id, 0]; }));

    links.forEach(function (link) {
      if (!nodes.has(link.from) || !nodes.has(link.to)) return;

      adjacency.get(link.from).push(link.to);
      adjacency.get(link.to).push(link.from);
      indeg.set(link.to, (indeg.get(link.to) || 0) + 1);
    });

    var visited = new Set();
    var components = [];

    ids.forEach(function (startId) {
      if (visited.has(startId)) return;

      var compIds = [];
      var queue = [startId];
      visited.add(startId);

      for (var qi = 0; qi < queue.length; qi++) {
        var cur = queue[qi];
        compIds.push(cur);

        var neighbors = adjacency.get(cur) || [];
        for (var n = 0; n < neighbors.length; n++) {
          var nb = neighbors[n];
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }

      compIds.sort(function (a, b) { return a - b; });

      var roots = compIds.filter(function (id) {
        return (indeg.get(id) || 0) === 0;
      });

      /* 兜底：纯环分支没有入度 0 节点，取最小入度节点作为代表 */
      if (!roots.length) {
        var minDegree = Infinity;
        compIds.forEach(function (id) {
          var degree = indeg.get(id) || 0;
          if (degree < minDegree) minDegree = degree;
        });
        roots = compIds.filter(function (id) {
          return (indeg.get(id) || 0) === minDegree;
        });
      }
      roots.sort(function (a, b) { return a - b; });

      var edgeCount = 0;
      var compSet = new Set(compIds);
      links.forEach(function (link) {
        if (compSet.has(link.from) && compSet.has(link.to)) {
          edgeCount += 1;
        }
      });

      components.push({
        key: compIds.join(","),
        nodeIds: compIds,
        roots: roots.map(function (id) {
          var node = nodes.get(id);
          return {
            id: id,
            title: node && node.data.title ? node.data.title : "未命名题目",
          };
        }),
        nodeCount: compIds.length,
        edgeCount: edgeCount,
      });
    });

    components.sort(function (a, b) { return a.nodeIds[0] - b.nodeIds[0]; });
    return components;
  }

  function getFilterNodeIds() {
    return filterNodeIds ? Array.from(filterNodeIds) : null;
  }

  function applyComponentFilterClasses() {
    var activeFilter = connectionReveal ? null : filterNodeIds;

    nodes.forEach(function (node) {
      var hidden = !!(activeFilter && !activeFilter.has(node.id));
      node.el.classList.toggle("is-hidden", hidden);
    });

    var groups = linksLayer.querySelectorAll(".edge-group");
    groups.forEach(function (group) {
      var hidden = !!activeFilter && (
        !activeFilter.has(Number(group.dataset.from)) ||
        !activeFilter.has(Number(group.dataset.to))
      );
      group.classList.toggle("is-hidden", hidden);
    });
  }

  /**
   * 拉线开始：临时移除所有 .is-hidden，唤醒全图便于跨连通块吸附。
   * 原聚焦节点集合会被记录，取消连线时原样恢复。
   */
  function beginConnectionReveal() {
    if (connectionReveal) return;

    connectionPrevFilterIds = filterNodeIds ? Array.from(filterNodeIds) : null;
    connectionPrevFilterCategoryId = filterCategoryId;
    connectionReveal = true;

    canvas.classList.add("is-connecting");
    applyComponentFilterClasses();
  }

  /**
   * 结束拉线：
   * - restorePrevious = true  → 恢复拉线前的聚焦分支（取消 / 同块连线）
   * - restorePrevious = false → 保留当前临时状态，由调用方设置新的合并分支
   */
  function endConnectionReveal(restorePrevious) {
    if (!connectionReveal) return;

    connectionReveal = false;
    canvas.classList.remove("is-connecting");

    if (restorePrevious) {
      filterNodeIds = connectionPrevFilterIds
        ? new Set(connectionPrevFilterIds)
        : null;
      filterCategoryId = connectionPrevFilterCategoryId;
    }

    connectionPrevFilterIds = null;
    connectionPrevFilterCategoryId = null;

    applyComponentFilterClasses();
  }

  /**
   * 设置当前独占显示的连通块节点集合；传 null 恢复全部显示。
   */
  function setComponentFilter(nodeIds) {
    if (nodeIds && nodeIds.length) {
      filterNodeIds = new Set(nodeIds.map(Number));
      var cat = typeof getActiveCategory === "function" ? getActiveCategory() : null;
      filterCategoryId = cat ? cat.id : null;
    } else {
      filterNodeIds = null;
      filterCategoryId = null;
    }

    /* 过滤变化时清除悬停血统高光，避免隐藏节点残留高亮 */
    hoveredNodeId = null;
    applyHoverHighlight();

    /* 分支切换时立即熄灭所有闪烁高光，保证同一时刻只有唯一焦点 */
    clearNodeFlash();

    applyComponentFilterClasses();

    if (spotlightIds !== null) {
      updateSpotlightClasses();
    }
  }

  /**
   * 图拓扑变更（删线 / 删题）后的完整刷新闭环：
   * 1. 重绘 SVG 连线
   * 2. 重新分析连通块，检测是否发生“连通块分裂”
   * 3. 保持参考题目所在分支的独占过滤（否则沿用原聚焦 / 回退第 1 个）
   * 4. 通知右上角根题目导航重建
   */
  function refreshGraphAfterRemoval(referenceNodeId) {
    /* 拓扑变更时退出任何未完成的拉线全显态 */
    connectionReveal = false;
    connectionPrevFilterIds = null;
    connectionPrevFilterCategoryId = null;
    canvas.classList.remove("is-connecting");

    renderLinks();

    var componentsData = getGraphComponents();
    var targetComp = null;

    /* 1) 优先保持“当前操作题目”所在的分支 */
    if (referenceNodeId !== null && referenceNodeId !== undefined) {
      targetComp = findComponentByNodeId(componentsData, Number(referenceNodeId));
    }

    /* 2) 若参考节点已被删除，沿用原聚焦分支中仍然存在的节点 */
    if (!targetComp && filterNodeIds) {
      for (var i = 0; i < componentsData.length && !targetComp; i++) {
        var compIds = componentsData[i].nodeIds;
        for (var j = 0; j < compIds.length; j++) {
          if (filterNodeIds.has(compIds[j])) {
            targetComp = componentsData[i];
            break;
          }
        }
      }
    }

    /* 3) 再尝试当前选中的题目 */
    if (!targetComp && session.selectedNodeId !== null) {
      targetComp = findComponentByNodeId(
        componentsData,
        session.selectedNodeId
      );
    }

    /* 4) 最终回退到第一个连通块 */
    if (!targetComp && componentsData.length > 0) {
      targetComp = componentsData[0];
    }

    if (targetComp) {
      setComponentFilter(targetComp.nodeIds);
    } else {
      setComponentFilter(null);
    }

    notifyGraphChanged();
  }

  function deleteLinkByKey(key) {
    var link = links.get(key);
    if (!link) return;

    /* 以起点所在分支作为删除后的聚焦参考 */
    var referenceId = link.from;
    links.delete(key);

    refreshGraphAfterRemoval(referenceId);
    persist();
  }

  /**
   * 默认聚焦第一个连通块（首选根题分支）：
   * 仅显示该分支 + 自动运镜居中 + 通知面板刷新激活态。
   */
  function autoFocusFirstComponent() {
    var components = getGraphComponents();

    if (components.length > 0) {
      setComponentFilter(components[0].nodeIds);
      focusComponent(components[0].nodeIds);
    } else {
      setComponentFilter(null);
    }

    notifyGraphChanged();
  }

  /**
   * 计算一组节点（世界坐标，含卡片尺寸）的包围盒。
   * nodeIds 为空时返回 null。
   */
  function boundsOfNodes(nodeIds) {
    var idSet = nodeIds && nodeIds.length
      ? new Set(nodeIds.map(Number))
      : null;

    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    var found = false;

    nodes.forEach(function (node) {
      if (idSet && !idSet.has(node.id)) return;

      found = true;
      minX = Math.min(minX, node.x - NODE_W / 2);
      maxX = Math.max(maxX, node.x + NODE_W / 2);
      minY = Math.min(minY, node.y - NODE_H / 2);
      maxY = Math.max(maxY, node.y + NODE_H / 2);
    });

    return found
      ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY }
      : null;
  }

  /**
   * 计算“整理后坐标表”的包围盒（世界坐标，含卡片尺寸）。
   * 用于在卡片归位动画开始前，就能按最终成果计算镜头目标。
   */
  function boundsOfPositions(positions) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    var found = false;

    positions.forEach(function (pos) {
      found = true;
      minX = Math.min(minX, pos.x - NODE_W / 2);
      maxX = Math.max(maxX, pos.x + NODE_W / 2);
      minY = Math.min(minY, pos.y - NODE_H / 2);
      maxY = Math.max(maxY, pos.y + NODE_H / 2);
    });

    return found
      ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY }
      : null;
  }

  /**
   * 镜头居中核心：把指定包围盒平滑移动到屏幕黄金中心。
   * - fit = true 时同步计算最优缩放，保证整理后的整组题目完整入镜；
   * - reserveRight 为右上角根题目导航面板预留安全区。
   */
  function centerBounds(bounds, options) {
    if (!bounds) return;

    var opts = options || {};
    var animate = opts.animate !== false;
    var reserveRight = typeof opts.reserveRight === "number"
      ? opts.reserveRight
      : 270;

    var rect = canvas.getBoundingClientRect();
    var safeWidth = Math.max(220, rect.width - reserveRight);
    var targetScreenX = Math.max(120, safeWidth / 2);
    var targetScreenY = rect.height / 2;

    var targetScale = view.scale;

    if (opts.fit) {
      var padX = 90;
      var padY = 110;
      var contentW = Math.max(1, bounds.maxX - bounds.minX) + padX * 2;
      var contentH = Math.max(1, bounds.maxY - bounds.minY) + padY * 2;
      var fitted = Math.min(safeWidth / contentW, rect.height / contentH);
      targetScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, Math.min(fitted, 1.15))
      );
    }

    var centerX = (bounds.minX + bounds.maxX) / 2;
    var centerY = (bounds.minY + bounds.maxY) / 2;

    var targetX = targetScreenX - centerX * targetScale;
    var targetY = targetScreenY - centerY * targetScale;

    if (animate) {
      animateViewTo(targetX, targetY, targetScale, 560);

      window.setTimeout(function () {
        /* 整理动画尚未结束时不要写入中间坐标，结束后会自行 persist() */
        if (layoutAnimRaf !== null) return;
        /* 镜头视角保存：只落本地，不触发云同步 */
        persist({ cloud: false });
      }, 620);
    } else {
      view.x = targetX;
      view.y = targetY;
      view.scale = targetScale;
      applyView();
    }
  }

  /**
   * 对外暴露的镜头居中 API：
   * centerNodes(nodeIds, { fit, animate, reserveRight })
   */
  function centerNodes(nodeIds, options) {
    centerBounds(boundsOfNodes(nodeIds), options);
  }

  /**
   * 镜头智能居中：把指定节点群整体移动到屏幕黄金中心。
   * 右侧预留 270px 给根题目导航面板。
   */
  function focusComponent(nodeIds) {
    var targetIds = nodeIds && nodeIds.length
      ? nodeIds
      : (filterNodeIds ? Array.from(filterNodeIds) : []);

    if (!targetIds.length) return;

    centerNodes(targetIds, {
      animate: true,
      fit: false,
      reserveRight: 270,
    });
  }

  function updateSpotlightClasses() {
    var active = spotlightIds !== null;

    nodes.forEach(function (node) {
      if (!active) {
        node.el.classList.remove("is-dimmed", "is-highlighted");
      } else if (spotlightIds.has(node.id)) {
        node.el.classList.remove("is-dimmed");
        node.el.classList.add("is-highlighted");
      } else {
        node.el.classList.remove("is-highlighted");
        node.el.classList.add("is-dimmed");
      }
    });

    var groups = linksLayer.querySelectorAll(".edge-group");
    groups.forEach(function (group) {
      var key = group.dataset.key;
      var link = links.get(key);
      if (!link) return;

      if (!active) {
        group.classList.remove("is-dimmed", "is-highlighted");
        return;
      }

      var bothMatch = spotlightIds.has(link.from) && spotlightIds.has(link.to);
      group.classList.toggle("is-highlighted", bothMatch);
      group.classList.toggle("is-dimmed", !bothMatch);
    });
  }

  /* 三次贝塞尔曲线上 t 处的坐标（用于放置删除按钮） */
  function cubicPointAt(x0, y0, x1, y1, x2, y2, x3, y3, t) {
    var mt = 1 - t;
    var a = mt * mt * mt;
    var b = 3 * mt * mt * t;
    var c = 3 * mt * t * t;
    var d = t * t * t;
    return {
      x: a * x0 + b * x1 + c * x2 + d * x3,
      y: a * y0 + b * y1 + c * y2 + d * y3,
    };
  }

  function buildLinkDeleteControl(key, mx, my) {
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "link-del");
    g.setAttribute("transform", "translate(" + mx.toFixed(2) + ", " + my.toFixed(2) + ")");

    var circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", "9");

    var cross1 = document.createElementNS(SVG_NS, "path");
    cross1.setAttribute("d", "M -3.4 -3.4 L 3.4 3.4");

    var cross2 = document.createElementNS(SVG_NS, "path");
    cross2.setAttribute("d", "M 3.4 -3.4 L -3.4 3.4");

    g.append(circle, cross1, cross2);

    g.addEventListener("pointerdown", function (event) {
      event.stopPropagation();
    });

    g.addEventListener("click", function (event) {
      event.stopPropagation();
      deleteLinkByKey(key);
    });

    return g;
  }

  /* =========================================================
   *  多出入度锚点分散
   *  - 同一起点多条出边：右侧 25% / 50% / 75% 微幅错开
   *  - 同一终点多条入边：左侧同理错开，避免箭头重叠
   * ========================================================= */
  function buildEdgeAnchorFractions() {
    var outgoing = new Map();
    var incoming = new Map();

    links.forEach(function (link, key) {
      var from = nodes.get(link.from);
      var to = nodes.get(link.to);
      if (!from || !to) return;

      if (!outgoing.has(link.from)) outgoing.set(link.from, []);
      outgoing.get(link.from).push({
        key: key,
        otherY: to.y,
        otherId: to.id,
      });

      if (!incoming.has(link.to)) incoming.set(link.to, []);
      incoming.get(link.to).push({
        key: key,
        otherY: from.y,
        otherId: from.id,
      });
    });

    var outFractions = new Map();
    var inFractions = new Map();

    function assign(groups, store) {
      groups.forEach(function (list, nodeId) {
        /* 按对端节点 Y 排序，保证上下锚点与上下邻居一一对应 */
        list.sort(function (a, b) {
          if (a.otherY !== b.otherY) return a.otherY - b.otherY;
          return a.otherId - b.otherId;
        });

        var count = list.length;

        for (var i = 0; i < count; i++) {
          var fraction;

          if (count === 1) {
            fraction = 0.5;
          } else if (count === 2) {
            fraction = i === 0 ? 0.25 : 0.75;
          } else {
            fraction = 0.25 + (i / (count - 1)) * 0.5;
          }

          store.set(list[i].key, fraction);
        }

        /* 与当前节点完全同高的连线（典型：根节点直达汇聚终点）强制走 50% 正中心，
         * 这样两端锚点同高，长边就是一条严格水平的直线，不会因兄弟边挤占而倾斜。
         * 其余边在中心两侧按原有上下顺序重新均分，避免锚点百分比重复。 */
        var self = nodes.get(nodeId);
        if (count > 1 && self) {
          var alignedIdx = -1;
          var alignedCount = 0;

          for (var a = 0; a < count; a++) {
            if (Math.abs(list[a].otherY - self.y) < 0.5) {
              alignedIdx = a;
              alignedCount++;
            }
          }

          if (alignedCount === 1) {
            store.set(list[alignedIdx].key, 0.5);

            var belowCount = alignedIdx;
            for (var b = 0; b < belowCount; b++) {
              store.set(
                list[b].key,
                0.25 + (b / belowCount) * 0.25
              );
            }

            var aboveCount = count - 1 - alignedIdx;
            for (var c = alignedIdx + 1; c < count; c++) {
              store.set(
                list[c].key,
                0.5 + ((c - alignedIdx) / aboveCount) * 0.25
              );
            }
          }
        }
      });
    }

    assign(outgoing, outFractions);
    assign(incoming, inFractions);

    return { out: outFractions, in: inFractions };
  }

  /* =========================================================
   *  连线避障（Obstacle Avoidance）
   * ========================================================= */

  var EDGE_AVOID_PAD = 18;         /* 碰撞检测膨胀量：必须小于同列间隙的一半，保证正中通道可通行 */
  var EDGE_AVOID_CLEARANCE = 24;   /* 绕行时与障碍卡片边缘的目标间距（20~30px） */
  var EDGE_AVOID_MAX_OFFSET = 50;  /* 控制点垂直位移硬上限（px），杜绝深渊长弧 */

  /* 同列卡片之间是 LAYOUT_FIXED_GAP；碰撞膨胀不能吃掉整条通道。
   * 这里按当前缩放动态收窄，保证 40px 间隙的中线始终被视为“可通行”。 */
  function getEdgeAvoidPad() {
    var corridorHalf = (LAYOUT_FIXED_GAP * view.scale) / 2;
    return Math.max(0, Math.min(EDGE_AVOID_PAD, corridorHalf - 0.5));
  }

  /* 将当前所有“可见”节点转换为屏幕坐标矩形，供曲线碰撞检测使用。
   * 独占分支过滤时排除隐藏节点，避免连线绕开不可见卡片产生虚假长弧。 */
  function collectNodeScreenRects() {
    var scale = view.scale;
    var hw = (NODE_W / 2) * scale;
    var hh = (NODE_H / 2) * scale;
    var rects = [];
    var activeFilter = connectionReveal ? null : filterNodeIds;

    nodes.forEach(function (node) {
      if (activeFilter && !activeFilter.has(node.id)) return;

      var p = worldToScreen(node.x, node.y);
      rects.push({
        id: node.id,
        left: p.x - hw,
        right: p.x + hw,
        top: p.y - hh,
        bottom: p.y + hh,
      });
    });

    return rects;
  }

  /* 采样贝塞尔曲线，返回沿途命中的卡片矩形 */
  function curveHitRects(
    x1, y1, cx1, cy1, cx2, cy2, x2, y2,
    rects
  ) {
    var hits = [];
    var span = Math.abs(x2 - x1);
    var steps = Math.max(12, Math.min(64, Math.round(span / 18)));
    var pad = getEdgeAvoidPad();

    for (var s = 1; s < steps; s++) {
      var t = s / steps;
      var p = cubicPointAt(x1, y1, cx1, cy1, cx2, cy2, x2, y2, t);

      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];

        if (
          p.x > r.left - pad &&
          p.x < r.right + pad &&
          p.y > r.top - pad &&
          p.y < r.bottom + pad
        ) {
          if (hits.indexOf(r) === -1) hits.push(r);
        }
      }
    }

    return hits;
  }

  /**
   * 计算一条边的控制点：
   * - 默认使用标准水平控制点；
   * - 若曲线穿过中间卡片（跨级长线穿心），向较近的一侧上下隆起绕行；
   * - 控制点垂直位移做硬 Clamp：min(卡片高度 * 0.6, 50px)，
   *   避免跨度越大弧线越深、形成失控的“深渊跳绳线”。
   */
  function resolveEdgeControlPoints(x1, y1, x2, y2, rects, fromId, toId) {
    var dx = (x2 - x1) * 0.5;
    var cx1 = x1 + dx;
    var cx2 = x2 - dx;

    var defaultGeometry = {
      cx1: cx1,
      cy1: y1,
      cx2: cx2,
      cy2: y2,
      avoided: false,
    };

    /* 先按 X 区间预筛候选障碍卡片，避免大图时全量扫描 */
    var minX = Math.min(x1, x2);
    var maxX = Math.max(x1, x2);
    var candidates = [];

    for (var r = 0; r < rects.length; r++) {
      var rect = rects[r];
      if (rect.id === fromId || rect.id === toId) continue;
      if (rect.right < minX || rect.left > maxX) continue;
      candidates.push(rect);
    }

    if (candidates.length === 0) return defaultGeometry;

    var hits = curveHitRects(
      x1, y1, cx1, y1, cx2, y2, x2, y2,
      candidates
    );

    if (hits.length === 0) return defaultGeometry;

    var midY = (y1 + y2) / 2;
    var hitTop = Infinity;
    var hitBottom = -Infinity;

    for (var i = 0; i < hits.length; i++) {
      if (hits[i].top < hitTop) hitTop = hits[i].top;
      if (hits[i].bottom > hitBottom) hitBottom = hits[i].bottom;
    }

    var upTarget = hitTop - EDGE_AVOID_CLEARANCE;
    var downTarget = hitBottom + EDGE_AVOID_CLEARANCE;
    var targetY =
      Math.abs(midY - upTarget) <= Math.abs(downTarget - midY)
        ? upTarget
        : downTarget;

    /* 反解 t=0.5 处到达 targetY 的控制点 Y：
     * y(0.5) = 0.125*y1 + 0.75*cy + 0.125*y2
     * 再对控制点相对中线的垂直位移做硬 Clamp。 */
    var controlYForTarget = (targetY - 0.125 * (y1 + y2)) / 0.75;
    var rawOffset = controlYForTarget - midY;
    var cardScreenHeight = NODE_H * view.scale;
    var maxOffset = Math.min(cardScreenHeight * 0.6, EDGE_AVOID_MAX_OFFSET);
    var offset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));
    var controlY = midY + offset;

    return {
      cx1: cx1,
      cy1: controlY,
      cx2: cx2,
      cy2: controlY,
      avoided: true,
    };
  }

  function renderLinks() {
    linksLayer.replaceChildren();

    var active = spotlightIds !== null;
    var nodeScreenRects = collectNodeScreenRects();
    var anchorFractions = buildEdgeAnchorFractions();

    links.forEach(function (link, key) {
      var from = nodes.get(link.from);
      var to = nodes.get(link.to);
      if (!from || !to) return;

      /* 锚点：父卡片右侧 → 子卡片左侧；
       * 多条出边 / 入边自动按 25% / 50% / 75% 在卡片边缘竖向错开。 */
      var outFraction = anchorFractions.out.get(key);
      var inFraction = anchorFractions.in.get(key);

      if (outFraction === undefined) outFraction = 0.5;
      if (inFraction === undefined) inFraction = 0.5;

      var start = worldToScreen(
        from.x + NODE_W / 2,
        from.y - NODE_H / 2 + outFraction * NODE_H
      );
      var end = worldToScreen(
        to.x - NODE_W / 2,
        to.y - NODE_H / 2 + inFraction * NODE_H
      );

      var x1 = start.x;
      var y1 = start.y;
      var x2 = end.x;
      var y2 = end.y;

      /* 三次贝塞尔 + 跨级长线避障：
       * 默认水平控制点；若曲线穿过中间卡片，会自动上下隆起绕行。 */
      var geometry = resolveEdgeControlPoints(
        x1, y1, x2, y2,
        nodeScreenRects,
        link.from, link.to
      );

      var cx1 = geometry.cx1;
      var cy1 = geometry.cy1;
      var cx2 = geometry.cx2;
      var cy2 = geometry.cy2;

      var d =
        "M " + x1.toFixed(2) + " " + y1.toFixed(2) +
        " C " + cx1.toFixed(2) + " " + cy1.toFixed(2) +
        ", " + cx2.toFixed(2) + " " + cy2.toFixed(2) +
        ", " + x2.toFixed(2) + " " + y2.toFixed(2);

      var group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "edge-group");
      group.dataset.key = key;
      group.dataset.from = String(link.from);
      group.dataset.to = String(link.to);
      group.dataset.avoided = geometry.avoided ? "1" : "0";

      /* 底层 Halo：画布同色加粗描边，制造交叉处的立体切口 */
      var halo = document.createElementNS(SVG_NS, "path");
      halo.setAttribute("class", "edge-halo");
      halo.setAttribute("d", d);

      /* 顶层主题连线 */
      var line = document.createElementNS(SVG_NS, "path");
      line.setAttribute("class", "edge-line");
      line.setAttribute("d", d);
      line.setAttribute("marker-end", "url(#arrow)");

      var bothMatch = active && spotlightIds.has(link.from) && spotlightIds.has(link.to);
      if (active) {
        group.classList.add(bothMatch ? "is-highlighted" : "is-dimmed");
      }

      /* 根题目导航独占过滤：非当前分支连线完全隐藏（拉线时临时全显示） */
      if (
        !connectionReveal &&
        filterNodeIds &&
        (!filterNodeIds.has(link.from) || !filterNodeIds.has(link.to))
      ) {
        group.classList.add("is-hidden");
      }

      group.append(halo, line);

      /* 保留原有的中点删除按钮 */
      var mid = cubicPointAt(x1, y1, cx1, cy1, cx2, cy2, x2, y2, 0.5);
      group.appendChild(buildLinkDeleteControl(key, mid.x, mid.y));

      linksLayer.appendChild(group);
    });

    /* 拖拽 / 缩放导致重绘后，恢复悬停血统高光 */
    if (hoveredNodeId !== null) applyHoverHighlight();
  }

  function setNodePosition(node, x, y, rerender) {
    if (rerender === undefined) rerender = true;
    node.x = x;
    node.y = y;
    node.el.style.left = x + "px";
    node.el.style.top = y + "px";
    if (rerender) renderLinks();
  }

  function diffFromMap(v) {
    return difficultyMap.get(v) || difficultyMap.get("none");
  }

  function applyNodeData(node) {
    var data = node.data;
    var diffInfo = diffFromMap(data.difficulty);

    node.el.style.setProperty("--node-accent", diffInfo.accent);
    node.el.style.setProperty("--node-accent-border", diffInfo.border);
    node.el.style.setProperty("--node-accent-soft", hexToRgba(diffInfo.border, 0.2));

    var titleEl = node.el.querySelector(".node-title");
    titleEl.textContent = data.title || "未命名题目";
    titleEl.title = data.title || "";

    var tagsEl = node.el.querySelector(".node-tags");
    tagsEl.textContent = data.tags || "";
    tagsEl.hidden = !data.tags;

    var linkBtn = node.el.querySelector(".node-btn-link");
    if (linkBtn) {
      if (data.link) {
        linkBtn.href = normalizeUrl(data.link);
        linkBtn.hidden = false;
      } else {
        linkBtn.removeAttribute("href");
        linkBtn.hidden = true;
      }
    }

    var badge = node.el.querySelector(".node-status-badge");
    if (badge) {
      var st = statusMap.get(data.status) || statusMap.get(DEFAULT_STATUS);
      if (st && st.value !== "none" && st.shortLabel) {
        badge.textContent = st.shortLabel;
        badge.dataset.status = st.value;
        badge.hidden = false;
      } else {
        badge.textContent = "";
        badge.removeAttribute("data-status");
        badge.hidden = true;
      }
    }

    node.el.setAttribute(
      "aria-label",
      "题目 " + (data.title || "未命名") +
      "，难度 " + diffInfo.label +
      "，状态 " + ((statusMap.get(data.status) || {}).label || "未开始")
    );
  }

  function nextPosition() {
    var rect = canvas.getBoundingClientRect();
    var center = screenToWorld(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );

    var x = center.x;
    var y = center.y;

    function occupied(px, py) {
      var found = false;
      nodes.forEach(function (n) {
        if (
          Math.abs(n.x - px) < NODE_W + 16 &&
          Math.abs(n.y - py) < NODE_H + 16
        ) {
          found = true;
        }
      });
      return found;
    }

    var attempt = 0;
    while (occupied(x, y) && attempt < 200) {
      attempt += 1;
      var angle = attempt * 2.399963;
      var radius = 46 * Math.sqrt(attempt) * 1.6;
      x = center.x + Math.cos(angle) * radius;
      y = center.y + Math.sin(angle) * radius;
    }

    return { x: x, y: y };
  }

  function buildNodeElement(id) {
    var el = document.createElement("div");
    el.className = "node";
    el.dataset.id = String(id);

    var titleEl = document.createElement("div");
    titleEl.className = "node-title";

    var tagsEl = document.createElement("div");
    tagsEl.className = "node-tags";

    var actionsEl = document.createElement("div");
    actionsEl.className = "node-actions";

    var linkBtn = document.createElement("a");
    linkBtn.className = "node-btn node-btn-link";
    linkBtn.target = "_blank";
    linkBtn.rel = "noopener noreferrer";
    linkBtn.title = "在新标签页打开题目";
    linkBtn.hidden = true;

    var linkIcon = document.createElement("span");
    linkIcon.setAttribute("aria-hidden", "true");
    linkIcon.textContent = "↗";
    var linkText = document.createElement("span");
    linkText.textContent = "题面";
    linkBtn.append(linkIcon, linkText);

    var noteBtn = document.createElement("button");
    noteBtn.type = "button";
    noteBtn.className = "node-btn node-btn-note";
    noteBtn.title = "阅读复盘笔记 / 题解";

    var noteIcon = document.createElement("span");
    noteIcon.setAttribute("aria-hidden", "true");
    noteIcon.textContent = "📖";
    var noteText = document.createElement("span");
    noteText.textContent = "笔记";
    noteBtn.append(noteIcon, noteText);

    actionsEl.append(linkBtn, noteBtn);

    el.append(titleEl, tagsEl, actionsEl);

    var statusBadge = document.createElement("div");
    statusBadge.className = "node-status-badge";
    statusBadge.hidden = true;
    el.appendChild(statusBadge);

    var sides = ["top", "right", "bottom", "left"];
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i];
      var a = document.createElement("button");
      a.type = "button";
      a.className = "anchor anchor-" + side;
      a.dataset.side = side;
      a.title = "按住拖到另一个节点以连线";
      a.setAttribute("aria-label", "从 " + side + " 方向连线");
      el.appendChild(a);
    }

    return el;
  }

  function setupNodeActionButtons(node) {
    var noteBtn = node.el.querySelector(".node-btn-note");
    if (!noteBtn) return;

    noteBtn.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
    });

    noteBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();

      if (typeof node.__onNoteClick === "function") {
        node.__onNoteClick(node);
        return;
      }

      if (window.OITreeEditor && typeof window.OITreeEditor.openReaderModal === "function") {
        window.OITreeEditor.openReaderModal(node);
        return;
      }

      console.error("[oitree] 笔记按钮无可用处理器");
    });
  }

  function buildSceneNode(nodeData, animate) {
    if (animate === undefined) animate = true;

    var el = buildNodeElement(nodeData.id);
    el.style.left = nodeData.x + "px";
    el.style.top = nodeData.y + "px";

    world.appendChild(el);

    var data = normalizeNodeTimes(Object.assign({}, nodeData.data));

    var node = {
      id: nodeData.id,
      el: el,
      x: nodeData.x,
      y: nodeData.y,
      data: data,
    };

    applyNodeData(node);
    nodes.set(node.id, node);
    enableNodeInteraction(node);
    enableAnchors(node);
    setupNodeActionButtons(node);

    if (onNodeClick) {
      node.__onClick = onNodeClick;
    }
    if (onNoteClick) {
      node.__onNoteClick = onNoteClick;
    }

    if (animate) {
      requestAnimationFrame(function () { el.classList.add("is-visible"); });
    } else {
      el.classList.add("is-visible");
    }

    if (spotlightIds !== null) {
      if (spotlightIds.has(node.id)) {
        el.classList.add("is-highlighted");
      } else {
        el.classList.add("is-dimmed");
      }
    }

    /* 根题目导航独占过滤：非当前分支卡片完全隐藏（拉线时临时全显示） */
    if (!connectionReveal && filterNodeIds && !filterNodeIds.has(node.id)) {
      el.classList.add("is-hidden");
    }

    return node;
  }

  function createNewNode(data) {
    session.nodeCount += 1;
    var id = session.nodeCount;
    var pos = nextPosition();

    var nodeData = normalizeNodeTimes(Object.assign({}, data));
    if (!nodeData.createdAt) nodeData.createdAt = formatNow();

    buildSceneNode({ id: id, x: pos.x, y: pos.y, data: nodeData }, true);
    renderLinks();

    syncActiveCategoryFromScene();
    if (onSceneChange) onSceneChange();
  }

  function deleteNodeById(id) {
    var node = nodes.get(id);
    if (!node) return;

    var title = node.data.title || "未命名题目";
    var relatedCount = 0;
    links.forEach(function (l) {
      if (l.from === id || l.to === id) relatedCount += 1;
    });

    var msg =
      relatedCount > 0
        ? "确定删除题目「" + title + "」吗？\n同时会级联删除 " + relatedCount + " 条相关连线。"
        : "确定删除题目「" + title + "」吗？";

    if (!window.confirm(msg)) return;

    var toDelete = [];
    var neighborIds = [];
    links.forEach(function (link, key) {
      if (link.from === id || link.to === id) {
        toDelete.push(key);
      }
      if (link.from === id && link.to !== id) neighborIds.push(link.to);
      if (link.to === id && link.from !== id) neighborIds.push(link.from);
    });
    for (var i = 0; i < toDelete.length; i++) {
      links.delete(toDelete[i]);
    }

    node.el.remove();
    nodes.delete(id);

    if (hoveredNodeId === id) {
      hoveredNodeId = null;
      applyHoverHighlight();
    }

    if (session.selectedNodeId === id) session.selectedNodeId = null;
    if (session.editingNode && session.editingNode.id === id) {
      session.editingNode = null;
    }
    if (session.readerNode && session.readerNode.id === id) {
      session.readerNode = null;
    }

    if (spotlightIds !== null) {
      spotlightIds.delete(id);
      if (lastSpotlightFirstId === id) lastSpotlightFirstId = undefined;
    }

    /* 选择仍存活的相邻题目作为分裂后的聚焦参考 */
    var referenceId = null;
    for (var n = 0; n < neighborIds.length; n++) {
      if (nodes.has(neighborIds[n])) {
        referenceId = neighborIds[n];
        break;
      }
    }

    /* 重新绘制 + 重新分析连通块 + 分裂过滤 + 导航面板刷新 */
    refreshGraphAfterRemoval(referenceId);

    syncActiveCategoryFromScene();
    if (onSceneChange) onSceneChange();
    persist();
  }

  function enableNodeInteraction(node) {
    /* 悬停血统高光：进入卡片点亮前驱/后继链路，移出恢复 */
    node.el.addEventListener("mouseenter", function () {
      setHoveredNode(node.id);
    });

    node.el.addEventListener("mouseleave", function () {
      if (hoveredNodeId === node.id) clearHoverFocus();
    });

    node.el.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      if (event.target.closest(".anchor")) return;
      if (event.target.closest(".node-btn")) return;
      if (event.target.closest(".node-actions")) return;

      stopViewAnimation();
      stopLayoutAnimation(true);

      event.preventDefault();
      event.stopPropagation();

      var pointerId = event.pointerId;
      try {
        node.el.setPointerCapture(pointerId);
      } catch (_) { /* 忽略 */ }

      var startClient = { x: event.clientX, y: event.clientY };
      var startWorld = screenToWorld(event.clientX, event.clientY);
      var offsetX = startWorld.x - node.x;
      var offsetY = startWorld.y - node.y;

      var dragging = false;

      var onMove = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;

        var screenDist = Math.hypot(
          moveEvent.clientX - startClient.x,
          moveEvent.clientY - startClient.y
        );

        if (!dragging && screenDist < DRAG_THRESHOLD) return;

        if (!dragging) {
          dragging = true;
          node.el.classList.add("is-dragging");
        }

        var current = screenToWorld(moveEvent.clientX, moveEvent.clientY);
        setNodePosition(node, current.x - offsetX, current.y - offsetY);
      };

      var onUp = function (upEvent) {
        if (upEvent.pointerId !== pointerId) return;

        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);

        node.el.classList.remove("is-dragging");

        if (dragging) {
          persist();
        } else {
          setSelectedNode(node.id);
          if (typeof node.__onClick === "function") {
            node.__onClick(node);
          }
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  function anchorWorldPoint(node, side) {
    var hw = NODE_W / 2;
    var hh = NODE_H / 2;
    switch (side) {
      case "top": return { x: node.x, y: node.y - hh };
      case "bottom": return { x: node.x, y: node.y + hh };
      case "left": return { x: node.x - hw, y: node.y };
      default: return { x: node.x + hw, y: node.y };
    }
  }

  function nodeFromPoint(clientX, clientY) {
    var el = document.elementFromPoint(clientX, clientY);
    var nodeEl = el && el.closest ? el.closest(".node") : null;
    if (!nodeEl) return null;
    return nodes.get(Number(nodeEl.dataset.id)) || null;
  }

  function findComponentByNodeId(components, id) {
    if (!components) return null;
    for (var i = 0; i < components.length; i++) {
      if (components[i].nodeIds.indexOf(id) !== -1) return components[i];
    }
    return null;
  }

  function enableAnchors(node) {
    var anchors = node.el.querySelectorAll(".anchor");

    anchors.forEach(function (anchor) {
      var side = anchor.dataset.side;

      anchor.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        stopViewAnimation();

        /* 拉线开始：唤醒全图，任何分支的卡片都可作为吸附目标 */
        beginConnectionReveal();

        var pointerId = event.pointerId;
        try {
          anchor.setPointerCapture(pointerId);
        } catch (_) { /* 忽略 */ }

        var startWorld = anchorWorldPoint(node, side);

        previewLine = document.createElementNS(SVG_NS, "line");
        previewLine.setAttribute("class", "preview-line");
        previewLine.setAttribute("marker-end", "url(#arrow-preview)");
        previewLayer.appendChild(previewLine);

        function updatePreview(clientX, clientY) {
          var p1 = worldToScreen(startWorld.x, startWorld.y);
          var p2 = screenToWorld(clientX, clientY);
          var p2s = worldToScreen(p2.x, p2.y);

          previewLine.setAttribute("x1", p1.x.toFixed(2));
          previewLine.setAttribute("y1", p1.y.toFixed(2));
          previewLine.setAttribute("x2", p2s.x.toFixed(2));
          previewLine.setAttribute("y2", p2s.y.toFixed(2));
        }

        updatePreview(event.clientX, event.clientY);

        var hoverTarget = null;

        function setHover(target) {
          if (hoverTarget === target) return;
          if (hoverTarget) hoverTarget.el.classList.remove("is-target");
          hoverTarget = target;
          if (hoverTarget) hoverTarget.el.classList.add("is-target");
        }

        var onMove = function (moveEvent) {
          if (moveEvent.pointerId !== pointerId) return;
          updatePreview(moveEvent.clientX, moveEvent.clientY);

          var target = nodeFromPoint(moveEvent.clientX, moveEvent.clientY);
          setHover(target && target.id !== node.id ? target : null);
        };

        function cleanup() {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          window.removeEventListener("keydown", onKeyDown, true);
          setHover(null);
          if (previewLine) {
            previewLine.remove();
            previewLine = null;
          }
        }

        function cancelConnectionDrag() {
          cleanup();
          endConnectionReveal(true);
        }

        var onKeyDown = function (keyEvent) {
          if (keyEvent.key !== "Escape") return;
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
          cancelConnectionDrag();
        };

        var onUp = function (upEvent) {
          if (upEvent.pointerId !== pointerId) return;

          var target = nodeFromPoint(upEvent.clientX, upEvent.clientY);
          cleanup();

          /* 松手到空白 / 自身 / 已存在连线：恢复原聚焦 */
          if (!target || target.id === node.id) {
            endConnectionReveal(true);
            return;
          }

          var key = node.id + "->" + target.id;
          if (links.has(key)) {
            endConnectionReveal(true);
            return;
          }

          /* 写入新边之前先分析：判断是否为跨连通块连接 */
          var beforeComponents = getGraphComponents();
          var sourceComp = findComponentByNodeId(beforeComponents, node.id);
          var targetComp = findComponentByNodeId(beforeComponents, target.id);
          var isCrossComponent =
            !sourceComp || !targetComp || sourceComp.key !== targetComp.key;

          links.set(key, { from: node.id, to: target.id });

          if (isCrossComponent) {
            /* 两个独立分支正式合并：退出临时全显，聚焦新的合并连通块 */
            endConnectionReveal(false);

            var mergedComponents = getGraphComponents();
            var merged = findComponentByNodeId(mergedComponents, node.id);

            if (merged) {
              setComponentFilter(merged.nodeIds);
              renderLinks();
              focusComponent(merged.nodeIds);
            } else {
              setComponentFilter(null);
              renderLinks();
            }

            persist();
            notifyGraphChanged();
          } else {
            /* 同一分支内部连线：恢复原聚焦与视角 */
            endConnectionReveal(true);
            renderLinks();
            persist();
            notifyGraphChanged();
          }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        window.addEventListener("keydown", onKeyDown, true);
      });
    });
  }

  function bindCanvasPanZoom() {
    canvas.addEventListener("pointerdown", function (event) {
      if (event.target.closest("#root-nav")) return;
      if (event.target.closest(".node")) return;
      if (event.target.closest(".link-del")) return;
      if (event.target.closest(".canvas-info")) return;

      var isMiddle = event.button === 1;
      var isRight = event.button === 2;
      var isLeft = event.button === 0;
      var onLine = !!(event.target.closest && event.target.closest(".edge-line"));

      var shouldPan =
        isMiddle ||
        isRight ||
        (isLeft && session.spacePressed) ||
        (isLeft && !onLine && event.target === canvas);

      if (!shouldPan) return;

      /* 用户开始手动拖拽：立即终止自动运镜与整理动画 */
      stopViewAnimation();
      stopLayoutAnimation(true);

      if (isLeft && !session.spacePressed && event.target === canvas) {
        setSelectedNode(null);
      }

      event.preventDefault();

      var pointerId = event.pointerId;
      try {
        canvas.setPointerCapture(pointerId);
      } catch (_) { /* 忽略 */ }

      var startClient = { x: event.clientX, y: event.clientY };
      var startView = { x: view.x, y: view.y };

      var onMove = function (moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        view.x = startView.x + (moveEvent.clientX - startClient.x);
        view.y = startView.y + (moveEvent.clientY - startClient.y);
        applyView();
      };

      var onUp = function (upEvent) {
        if (upEvent.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        canvas.classList.remove("is-panning");
        if (session.spacePressed) canvas.classList.add("is-pan-ready");
        /* 漫游画布只保存视角，不上云 */
        persist({ cloud: false });
      };

      canvas.classList.add("is-panning");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });

    canvas.addEventListener(
      "wheel",
      function (event) {
        if (event.target.closest("#root-nav")) return;

        event.preventDefault();

        /* 手动缩放同样打断自动运镜 */
        stopViewAnimation();

        var rect = canvas.getBoundingClientRect();
        var mx = event.clientX - rect.left;
        var my = event.clientY - rect.top;

        var delta = -event.deltaY;
        if (event.deltaMode === 1) delta *= 16;
        if (event.deltaMode === 2) delta *= 400;

        var factor = Math.exp(delta * 0.0016);
        var nextScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, view.scale * factor)
        );

        if (nextScale === view.scale) return;

        var real = nextScale / view.scale;
        view.x = mx - (mx - view.x) * real;
        view.y = my - (my - view.y) * real;
        view.scale = nextScale;

        applyView();

        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function () {
          /* 滚轮缩放只保存视角，不上云 */
          persist({ cloud: false });
        }, 260);
      },
      { passive: false }
    );

    canvas.addEventListener("contextmenu", function (event) {
      if (event.target.closest("#root-nav")) return;

      event.preventDefault();

      var lineEl = event.target.closest && event.target.closest(".edge-line");
      var groupEl =
        lineEl && lineEl.closest ? lineEl.closest(".edge-group") : null;
      var key = groupEl ? groupEl.dataset.key : null;

      if (key) {
        deleteLinkByKey(key);
      }
    });
  }

  /**
   * 一键整理布局（横向 LR 分层 + 垂直对称居中 + 交叉最小化）。
   *
   * options:
   * - nodeIds: 仅整理指定节点集合（根题目卡片切换时只整理当前可见分支）
   * - animate: 是否播放卡片归位动画（默认 true）
   * - center:  是否自动运镜居中（默认 true）
   * - fit:     居中时是否自适应缩放（默认 true）
   * - reserveRight: 右侧导航面板预留宽度
   * - cloud:   是否把整理结果计入云端同步（默认 true；导航自动整理传 false）
   */
  function autoLayout(options) {
    var opts = options && typeof options === "object" ? options : {};

    /* 只排版指定集合（可见分支）；其他隐藏节点保持原坐标不动 */
    var scopeIds = null;
    if (
      opts.nodeIds &&
      (Array.isArray(opts.nodeIds) || opts.nodeIds instanceof Set)
    ) {
      scopeIds = [];
      var seenIds = new Set();

      Array.from(opts.nodeIds).forEach(function (rawId) {
        var id = Number(rawId);
        if (!nodes.has(id) || seenIds.has(id)) return;
        seenIds.add(id);
        scopeIds.push(id);
      });

      if (scopeIds.length === 0) return false;
    }

    var ids = scopeIds || Array.from(nodes.keys());
    if (ids.length === 0) return false;

    var idScope = scopeIds ? new Set(scopeIds) : null;

    /* 构建有向邻接表（分层 / 交叉最小化）与边表 */
    var succ = new Map(ids.map(function (id) { return [id, []]; }));
    var pred = new Map(ids.map(function (id) { return [id, []]; }));
    var allEdges = [];

    links.forEach(function (link) {
      if (!nodes.has(link.from) || !nodes.has(link.to)) return;
      if (idScope && (!idScope.has(link.from) || !idScope.has(link.to))) return;

      succ.get(link.from).push(link.to);
      pred.get(link.to).push(link.from);
      allEdges.push({ from: link.from, to: link.to });
    });

    /* =========================================================
     * 1. 识别弱连通分量：互不相连的题单彼此独立排版
     * ========================================================= */
    var components = [];
    var visited = new Set();

    ids.forEach(function (startId) {
      if (visited.has(startId)) return;

      var comp = [];
      var queue = [startId];
      visited.add(startId);

      for (var qi = 0; qi < queue.length; qi++) {
        var cur = queue[qi];
        comp.push(cur);

        var neighbors = succ.get(cur).concat(pred.get(cur));
        for (var n = 0; n < neighbors.length; n++) {
          var nb = neighbors[n];
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }

      comp.sort(function (a, b) { return a - b; });
      components.push(comp);
    });

    /* 按最小节点 id 排序，保证每次布局的堆叠顺序稳定 */
    components.sort(function (a, b) { return a[0] - b[0]; });

    /* =========================================================
     * 4. 交叉数计算：给定上层顺序和下层顺序，计算连线交叉对数
     *    若上层边 (u1,v1) 在左，下层对应边 (u2,v2) 在右（或反之），则判定交叉。
     * ========================================================= */
    function countCrossings(upperOrder, lowerOrder, edges) {
      var upperPos = new Map();
      for (var i = 0; i < upperOrder.length; i++) {
        upperPos.set(upperOrder[i], i);
      }
      var lowerPos = new Map();
      for (var i = 0; i < lowerOrder.length; i++) {
        lowerPos.set(lowerOrder[i], i);
      }

      var edgeList = [];
      for (var e = 0; e < edges.length; e++) {
        var link = edges[e];
        if (upperPos.has(link.from) && lowerPos.has(link.to)) {
          edgeList.push({ u: upperPos.get(link.from), v: lowerPos.get(link.to) });
        }
      }

      var crossings = 0;
      for (var i = 0; i < edgeList.length; i++) {
        for (var j = i + 1; j < edgeList.length; j++) {
          var a = edgeList[i], b = edgeList[j];
          if ((a.u < b.u && a.v > b.v) || (a.u > b.u && a.v < b.v)) {
            crossings++;
          }
        }
      }
      return crossings;
    }

    /* =========================================================
     * 5. 生成所有排列（用于穷举最优顺序）
     * ========================================================= */
    function permute(arr, callback) {
      var used = new Array(arr.length);
      for (var i = 0; i < arr.length; i++) used[i] = false;
      var current = [];
      function backtrack() {
        if (current.length === arr.length) {
          callback(current.slice());
          return;
        }
        for (var i = 0; i < arr.length; i++) {
          if (!used[i]) {
            used[i] = true;
            current.push(arr[i]);
            backtrack();
            current.pop();
            used[i] = false;
          }
        }
      }
      backtrack();
    }

    /* =========================================================
     * 6. 贪心插入：将下层节点逐个插入到当前序列的最佳位置
     *    每次选择使交叉数增加最少的插入位置
     * ========================================================= */
    function greedyInsert(upperOrder, nodes, edges) {
      var order = [];
      var remaining = nodes.slice();
      while (remaining.length > 0) {
        var bestNode = null;
        var bestPos = 0;
        var bestCrossings = Infinity;
        for (var r = 0; r < remaining.length; r++) {
          var node = remaining[r];
          for (var p = 0; p <= order.length; p++) {
            var trial = order.slice();
            trial.splice(p, 0, node);
            var c = countCrossings(upperOrder, trial, edges);
            if (c < bestCrossings) {
              bestCrossings = c;
              bestNode = node;
              bestPos = p;
            }
          }
        }
        order.splice(bestPos, 0, bestNode);
        remaining = remaining.filter(function (n) { return n !== bestNode; });
      }
      return order;
    }

    /* =========================================================
     * 7. 局部交换优化：尝试交换任意两个位置的节点，若能减少交叉则交换
     * ========================================================= */
    function localSwapOptimize(upperOrder, order, edges, maxIter) {
      var current = order.slice();
      var currentCrossings = countCrossings(upperOrder, current, edges);
      var improved = true;
      var iter = 0;
      while (improved && iter < maxIter) {
        improved = false;
        iter++;
        for (var i = 0; i < current.length; i++) {
          for (var j = i + 1; j < current.length; j++) {
            var trial = current.slice();
            var tmp = trial[i]; trial[i] = trial[j]; trial[j] = tmp;
            var c = countCrossings(upperOrder, trial, edges);
            if (c < currentCrossings) {
              current = trial;
              currentCrossings = c;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
      }
      return current;
    }

    /* =========================================================
     * 8. 查找下层最优顺序：固定上层顺序，对下层寻找交叉数最少的排列
     *    - 节点数 <= 8：穷举所有排列，严格最优（零交叉优先）
     *    - 节点数 > 8：贪心插入 + 局部交换优化
     * ========================================================= */
    function findBestLowerOrder(upperOrder, lowerNodes, edges) {
      var n = lowerNodes.length;
      if (n <= 1) return lowerNodes.slice();

      var layerEdges = [];
      var upperSet = new Set(upperOrder);
      var lowerSet = new Set(lowerNodes);
      for (var e = 0; e < edges.length; e++) {
        var link = edges[e];
        if (upperSet.has(link.from) && lowerSet.has(link.to)) {
          layerEdges.push(link);
        }
      }

      if (n <= 8) {
        var bestOrder = null;
        var bestCrossings = Infinity;
        permute(lowerNodes, function (p) {
          var c = countCrossings(upperOrder, p, layerEdges);
          if (c < bestCrossings) {
            bestCrossings = c;
            bestOrder = p.slice();
          }
        });
        return bestOrder;
      }

      // 大层：贪心插入 + 局部优化
      var order = greedyInsert(upperOrder, lowerNodes, layerEdges);
      order = localSwapOptimize(upperOrder, order, layerEdges, 100);
      return order;
    }

    /* =========================================================
     * 6. 单个连通块内部排版
     *    X：rank * rankSep（严格 LR）
     *    Y：同列强制等间距 pitch = NODE_H + 40
     * ========================================================= */
    var rankSep = RANK_SEP;
    var paddingX = LAYOUT_PADDING_X;
    var fixedGap = LAYOUT_FIXED_GAP;
    var pitch = NODE_H + fixedGap;

    function layoutComponent(componentIds) {
      var idSet = new Set(componentIds);

      /* 6.1 分层：Kahn 最长路径，DAG 中所有边严格向右 */
      var layer = new Map();
      var indeg = new Map(componentIds.map(function (id) {
        var localPreds = pred.get(id).filter(function (p) {
          return idSet.has(p);
        });
        return [id, localPreds.length];
      }));
      var placed = new Set();

      var queue = componentIds.filter(function (id) {
        return indeg.get(id) === 0;
      });
      queue.forEach(function (id) {
        layer.set(id, 0);
        placed.add(id);
      });

      var qi = 0;
      while (qi < queue.length) {
        var id = queue[qi++];
        var nexts = succ.get(id);

        for (var i = 0; i < nexts.length; i++) {
          var next = nexts[i];
          if (!idSet.has(next)) continue;

          var candidate = (layer.get(id) || 0) + 1;
          if (!layer.has(next) || layer.get(next) < candidate) {
            layer.set(next, candidate);
          }

          indeg.set(next, indeg.get(next) - 1);
          if (indeg.get(next) === 0 && !placed.has(next)) {
            placed.add(next);
            queue.push(next);
          }
        }
      }

      /* 6.2 环 / 剩余节点兜底分层 */
      var remaining = componentIds.filter(function (id) {
        return !placed.has(id);
      });
      var progress = true;

      while (remaining.length && progress) {
        progress = false;
        for (var j = remaining.length - 1; j >= 0; j--) {
          var rid = remaining[j];
          var localPreds = pred.get(rid).filter(function (p) {
            return idSet.has(p);
          });
          var unknown = localPreds.filter(function (p) {
            return !placed.has(p);
          });

          if (unknown.length === 0) {
            var known = localPreds.filter(function (p) {
              return placed.has(p);
            });
            var base = known.length
              ? Math.max.apply(null, known.map(function (p) {
                  return layer.get(p) || 0;
                })) + 1
              : 0;
            layer.set(rid, base);
            placed.add(rid);
            remaining.splice(j, 1);
            progress = true;
          }
        }
      }

      while (remaining.length) {
        var wid = remaining.shift();
        var wknown = pred.get(wid).filter(function (p) {
          return idSet.has(p) && placed.has(p);
        });
        var wbase = wknown.length
          ? Math.max.apply(null, wknown.map(function (p) {
              return layer.get(p) || 0;
            })) + 1
          : 0;
        layer.set(wid, wbase);
        placed.add(wid);
      }

      var maxLayer = Math.max.apply(null, componentIds.map(function (id) {
        return layer.get(id) || 0;
      }));

      var byLayer = [];
      for (var li = 0; li <= maxLayer; li++) byLayer.push([]);
      componentIds.forEach(function (id) {
        byLayer[layer.get(id) || 0].push(id);
      });

      /* 块内有效边，用于交叉数计算 */
      var componentEdges = allEdges.filter(function (edge) {
        return idSet.has(edge.from) && idSet.has(edge.to);
      });

      /* 6.3 逐层确定垂直顺序（交叉数最小化） */
      for (var lix = 1; lix < byLayer.length; lix++) {
        byLayer[lix] = findBestLowerOrder(
          byLayer[lix - 1],
          byLayer[lix].slice(),
          componentEdges
        );
      }

      /* 6.4 计算 Y：同列等间距，列整体以父节点重心为中心 */
      var nodeY = new Map();
      var positions = new Map();

      /* 连通块的水平几何中心线：第一列（根层）节点的平均 Y。
       * 横向 LR 布局中根层本身以 0 为中心，因此它同时也是整块的对称轴。 */
      var componentCenterY = 0;
      var rootIds = new Set(byLayer[0] || []);

      byLayer.forEach(function (row, lix) {
        if (row.length === 0) return;

        var desiredCenter = 0;

        if (lix > 0) {
          var sum = 0;
          var cnt = 0;

          for (var i = 0; i < row.length; i++) {
            var parents = pred.get(row[i]).filter(function (p) {
              return idSet.has(p);
            });

            var parentSum = 0;
            var parentCnt = 0;

            for (var k = 0; k < parents.length; k++) {
              var py = nodeY.get(parents[k]);
              if (py !== undefined) {
                parentSum += py;
                parentCnt++;
              }
            }

            if (parentCnt > 0) {
              sum += parentSum / parentCnt;
              cnt++;
            }
          }

          if (cnt > 0) desiredCenter = sum / cnt;
        }

        /* 单节点收束列（终点列）：
         * 若该列唯一节点是终点，且根节点存在直达跨级边，
         * 则把它拉回连通块中心线（根节点水平轴），
         * 避免被下方兄弟节点“拽”下沉，跨级长线可直接水平穿过中间空隙。 */
        if (lix > 0 && row.length === 1) {
          var onlyId = row[0];
          var localSucc = succ.get(onlyId).filter(function (s) {
            return idSet.has(s);
          });

          if (localSucc.length === 0) {
            var directRoots = pred.get(onlyId).filter(function (p) {
              return idSet.has(p) && rootIds.has(p);
            });

            if (directRoots.length > 0) {
              /* 单根时 componentCenterY 就是根节点高度；
               * 多根时使用整块几何中心线，避免偏向某一个根。 */
              desiredCenter = componentCenterY;
            }
          }
        }

        /* 固定 pitch：消除列内忽大忽小的黑洞空白；
         * startY 取父节点重心的最小二乘最优中心。 */
        var startY = desiredCenter - ((row.length - 1) / 2) * pitch;
        var rankX = paddingX + lix * rankSep;

        row.forEach(function (id, idx) {
          var y = startY + idx * pitch;
          nodeY.set(id, y);
          positions.set(id, { x: rankX, y: y });
        });

        /* 根层排完后固化连通块中心线（多根时取根节点平均高度） */
        if (lix === 0) {
          var centerSum = 0;
          for (var ci = 0; ci < row.length; ci++) {
            centerSum += nodeY.get(row[ci]);
          }
          componentCenterY = row.length > 0 ? centerSum / row.length : 0;
        }
      });

      /* 6.5 连通块包围盒（含卡片高度） */
      var minY = Infinity;
      var maxY = -Infinity;

      positions.forEach(function (pos) {
        if (pos.y < minY) minY = pos.y;
        if (pos.y > maxY) maxY = pos.y;
      });

      return {
        positions: positions,
        minY: minY - NODE_H / 2,
        maxY: maxY + NODE_H / 2,
      };
    }

    /* =========================================================
     * 7. 多连通块垂直堆叠：固定 70px 间距，完全隔离
     *    每个独立题单单独排版后再向下拼接，互不穿插。
     * ========================================================= */
    var COMPONENT_GAP = 70;
    var finalPositions = new Map();
    var cursorY = LAYOUT_PADDING_Y;

    components.forEach(function (comp) {
      var result = layoutComponent(comp);
      var shiftY = cursorY - result.minY;

      result.positions.forEach(function (pos, id) {
        finalPositions.set(id, {
          x: pos.x,
          y: pos.y + shiftY,
        });
      });

      cursorY = result.maxY + shiftY + COMPONENT_GAP;
    });

    /* =========================================================
     * 8. 应用位置并刷新
     *    - 先按最终坐标计算包围盒，镜头与卡片归位动画并行；
     *    - 逐帧写入 left/top 并重绘连线，保证连线始终贴合卡片；
     *    - 动画结束后 persist()：新坐标回写到当前分类，云端同步可用。
     * ========================================================= */
    var targets = [];
    finalPositions.forEach(function (pos, id) {
      var node = nodes.get(id);
      if (node) targets.push({ node: node, x: pos.x, y: pos.y });
    });

    if (targets.length === 0) return false;

    /* 标记为已应用当前版本布局，避免下次加载重复重排 */
    var activeCat =
      typeof getActiveCategory === "function" ? getActiveCategory() : null;
    if (activeCat) activeCat.layoutVersion = LAYOUT_VERSION;

    var shouldAnimate = opts.animate !== false;
    var syncCloud = opts.cloud !== false;

    /* 镜头目标基于“整理后的最终坐标”，避免等卡片全部归位后再运镜造成两段式卡顿；
     * 全量整理但当前仍有分支独占过滤时，只把可见分支纳入取景（与原 fitToView 行为一致）。 */
    if (opts.center !== false) {
      var cameraPositions = finalPositions;

      if (!scopeIds && !connectionReveal && filterNodeIds) {
        cameraPositions = new Map();
        finalPositions.forEach(function (pos, id) {
          if (filterNodeIds.has(id)) cameraPositions.set(id, pos);
        });
      }

      centerBounds(boundsOfPositions(cameraPositions), {
        animate: shouldAnimate,
        fit: opts.fit !== false,
        reserveRight: typeof opts.reserveRight === "number"
          ? opts.reserveRight
          : 270,
      });
    }

    if (!shouldAnimate) {
      stopLayoutAnimation(false);
      targets.forEach(function (target) {
        setNodePosition(target.node, target.x, target.y, false);
      });
      renderLinks();
      persist({ cloud: syncCloud });
      return true;
    }

    animateNodePositions(targets, LAYOUT_ANIM_DURATION, function () {
      persist({ cloud: syncCloud });
    });

    return true;
  }

  /**
   * 对“当前可见节点集合”一键整理 + 镜头居中。
   * 右上角根题目卡片（以及“全部显示”）点击时调用。
   */
  function autoLayoutVisible() {
    var visibleIds = filterNodeIds ? Array.from(filterNodeIds) : null;

    if (visibleIds && visibleIds.length) {
      return autoLayout({
        nodeIds: visibleIds,
        center: true,
        fit: true,
        animate: true,
        reserveRight: 270,
        /* 专题切换附带的自动整理：仅本地生效，不触发云端上传 */
        cloud: false,
      });
    }

    return autoLayout({
      center: true,
      fit: true,
      animate: true,
      reserveRight: 270,
      /* “全部显示”附带的自动整理：仅本地生效，不触发云端上传 */
      cloud: false,
    });
  }

  function resetDescPanel() {
    descExpanded = false;
    canvasInfoDesc.hidden = true;
    canvasInfoToggleIcon.textContent = "▾";
    canvasInfoToggleText.textContent = "查看简介";
  }

  function expandInfoPanel() {
    infoPanelExpanded = true;
    canvasInfoDetail.hidden = false;
    canvasInfoChevron.textContent = "▴";
    canvasInfoHeader.setAttribute("aria-expanded", "true");
  }

  function collapseInfoPanel() {
    infoPanelExpanded = false;
    canvasInfoDetail.hidden = true;
    canvasInfoChevron.textContent = "▾";
    canvasInfoHeader.setAttribute("aria-expanded", "false");
  }

  function toggleInfoPanel() {
    if (infoPanelExpanded) collapseInfoPanel();
    else expandInfoPanel();
  }

  function updateCanvasInfo() {
    var cat = getActiveCategory();

    if (!cat) {
      canvasInfo.hidden = true;
      return;
    }

    var author = (cat.author || "").trim();
    var luoguRaw = (cat.luoguUrl || "").trim();
    var desc = (cat.description || "").trim();

    var hasAuthor = author.length > 0;
    var hasLuogu = luoguRaw.length > 0;
    var hasDesc = desc.length > 0;

    if (!hasAuthor && !hasDesc) {
      canvasInfo.hidden = true;
      return;
    }

    canvasInfo.hidden = false;

    if (hasAuthor) {
      canvasInfoIcon.textContent = "👤";
      canvasInfoHeaderText.textContent = "作者 " + author;
    } else if (hasDesc) {
      canvasInfoIcon.textContent = "📝";
      canvasInfoHeaderText.textContent = "题单简介";
    }

    if (hasAuthor) {
      canvasInfoAuthorLine.hidden = false;
      canvasInfoAuthor.textContent = author;

      if (hasLuogu) {
        canvasInfoAuthor.href = normalizeUrl(luoguRaw);
        canvasInfoLuoguDot.hidden = false;
        canvasInfoLuogu.hidden = false;
        canvasInfoLuogu.href = normalizeUrl(luoguRaw);
      } else {
        canvasInfoAuthor.removeAttribute("href");
        canvasInfoLuoguDot.hidden = true;
        canvasInfoLuogu.hidden = true;
        canvasInfoLuogu.removeAttribute("href");
      }
    } else {
      canvasInfoAuthorLine.hidden = true;
    }

    if (hasDesc) {
      canvasInfoDescRow.hidden = false;
      canvasInfoDesc.classList.add("has-markdown");
      renderMarkdownToElement(canvasInfoDesc, desc, { emptyText: "暂无内容" });
      resetDescPanel();
    } else {
      canvasInfoDescRow.hidden = true;
      canvasInfoDesc.hidden = true;
      canvasInfoDesc.classList.remove("has-markdown");
      canvasInfoDesc.textContent = "";
    }
  }

  function loadActiveCategory(options) {
    var cat = getActiveCategory();
    var autoFocusFirst = !!(options && options.autoFocusFirst);

    stopViewAnimation();
    stopLayoutAnimation(false);
    clearNodeFlash();

    /* 切换题单时清理未完成的拉线预览状态 */
    connectionReveal = false;
    connectionPrevFilterIds = null;
    connectionPrevFilterCategoryId = null;
    canvas.classList.remove("is-connecting");

    world.replaceChildren();
    nodes.clear();
    links.clear();
    linksLayer.replaceChildren();
    previewLayer.replaceChildren();
    previewLine = null;
    session.nodeCount = 0;
    session.selectedNodeId = null;

    /* 切换分类时清除上一分类的独占过滤；同一分类刷新则保留 */
    if (filterCategoryId && (!cat || cat.id !== filterCategoryId)) {
      filterNodeIds = null;
      filterCategoryId = null;
    }

    /* 重置悬停血统聚焦状态 */
    hoveredNodeId = null;
    canvas.classList.remove("is-focused");

    spotlightIds = null;
    lastSpotlightFirstId = undefined;

    collapseInfoPanel();
    resetDescPanel();

    if (!cat) {
      view.x = 0;
      view.y = 0;
      view.scale = 1;
      applyView();
      updateCanvasInfo();
      applyComponentFilterClasses();
      notifyGraphChanged();
      return;
    }

    var catNodes = cat.nodes || [];
    for (var i = 0; i < catNodes.length; i++) {
      var nd = catNodes[i];
      var node = buildSceneNode(
        { id: nd.id, x: nd.x, y: nd.y, data: Object.assign({}, nd.data) },
        false
      );
      if (nd.id > session.nodeCount) session.nodeCount = nd.id;
      if (onNodeClick) node.__onClick = onNodeClick;
      if (onNoteClick) node.__onNoteClick = onNoteClick;
    }

    var catEdges = cat.edges || [];
    for (var e = 0; e < catEdges.length; e++) {
      var edge = catEdges[e];
      var key = edge.from + "->" + edge.to;
      links.set(key, { from: edge.from, to: edge.to });
    }

    var v = cat.view || { x: 0, y: 0, scale: 1 };
    view.x = v.x;
    view.y = v.y;
    view.scale = v.scale;

    applyView();
    renderLinks();
    updateCanvasInfo();

    /* 旧版数据（无 layoutVersion）首次加载时，一次性迁移为横向 LR 布局；
     * 已迁移 / 新建分类保留用户手动拖拽的位置。 */
    if (nodes.size > 0 && cat.layoutVersion !== LAYOUT_VERSION) {
      autoLayout({ animate: false });
    }

    /* 进入分类题单：默认自动聚焦第一个连通块并运镜居中；
     * 同分类的云端刷新（autoFocusFirst=false）保留用户当前过滤与视角。 */
    if (autoFocusFirst) {
      autoFocusFirstComponent();
    } else {
      applyComponentFilterClasses();
      notifyGraphChanged();
    }
  }

  return {
    bindCanvasDom: bindCanvasDom,
    bindCanvasInfoDom: bindCanvasInfoDom,
    setNodeClickHandler: setNodeClickHandler,
    setNoteClickHandler: setNoteClickHandler,
    setOnSceneChange: setOnSceneChange,

    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    updateGrid: updateGrid,
    applyView: applyView,
    animateViewTo: animateViewTo,
    panToNode: panToNode,
    fitToView: fitToView,

    setSelectedNode: setSelectedNode,
    renderLinks: renderLinks,
    setNodePosition: setNodePosition,
    applyNodeData: applyNodeData,
    nextPosition: nextPosition,
    buildSceneNode: buildSceneNode,
    createNewNode: createNewNode,
    deleteNodeById: deleteNodeById,
    bindCanvasPanZoom: bindCanvasPanZoom,
    autoLayout: autoLayout,
    autoLayoutVisible: autoLayoutVisible,
    centerNodes: centerNodes,
    stopLayoutAnimation: stopLayoutAnimation,
    updateCanvasInfo: updateCanvasInfo,
    loadActiveCategory: loadActiveCategory,

    applySpotlight: applySpotlight,
    clearSpotlight: clearSpotlight,
    updateSpotlightClasses: updateSpotlightClasses,

    /* 根题目导航 */
    getGraphComponents: getGraphComponents,
    setComponentFilter: setComponentFilter,
    getFilterNodeIds: getFilterNodeIds,
    focusComponent: focusComponent,
    autoFocusFirstComponent: autoFocusFirstComponent,
  };
})();