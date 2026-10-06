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
  var descExpanded = false;
  var infoPanelExpanded = false;

  var spotlightIds = null;
  var lastSpotlightFirstId = undefined;

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

  function panToNode(node) {
    var rect = canvas.getBoundingClientRect();
    var finalScale = view.scale < 0.85 ? 0.85 : view.scale;
    var targetX = rect.width / 2 - node.x * finalScale;
    var targetY = rect.height / 2 - node.y * finalScale;

    animateViewTo(targetX, targetY, finalScale, 520);

    node.el.classList.remove("flash-highlight");
    void node.el.offsetWidth;
    node.el.classList.add("flash-highlight");

    setTimeout(function () {
      node.el.classList.remove("flash-highlight");
    }, 1400);

    persist();
  }

  function fitToView() {
    if (nodes.size === 0) {
      view.scale = 1;
      view.x = 0;
      view.y = 0;
      applyView();
      return;
    }

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(function (n) {
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

    var lineEls = linksLayer.querySelectorAll(".link-line");
    lineEls.forEach(function (line) {
      var key = line.dataset.key;
      var link = links.get(key);
      if (!link) return;
      var gEl = line.nextElementSibling;

      if (!active) {
        line.classList.remove("is-dimmed", "is-highlighted");
        if (gEl && gEl.classList.contains("link-del")) {
          gEl.classList.remove("is-dimmed");
        }
        return;
      }

      var bothMatch = spotlightIds.has(link.from) && spotlightIds.has(link.to);

      if (bothMatch) {
        line.classList.remove("is-dimmed");
        line.classList.add("is-highlighted");
        if (gEl && gEl.classList.contains("link-del")) {
          gEl.classList.remove("is-dimmed");
        }
      } else {
        line.classList.remove("is-highlighted");
        line.classList.add("is-dimmed");
        if (gEl && gEl.classList.contains("link-del")) {
          gEl.classList.add("is-dimmed");
        }
      }
    });
  }

  function renderLinks() {
    linksLayer.replaceChildren();

    var active = spotlightIds !== null;

    links.forEach(function (link, key) {
      var from = nodes.get(link.from);
      var to = nodes.get(link.to);
      if (!from || !to) return;

      var hw = NODE_W / 2;
      var hh = NODE_H / 2;
      var dx = to.x - from.x;
      var dy = to.y - from.y;
      var len = Math.hypot(dx, dy);
      if (len < 4) return;

      var ux = dx / len;
      var uy = dy / len;

      var tx = ux !== 0 ? Math.abs(hw / ux) : Infinity;
      var ty = uy !== 0 ? Math.abs(hh / uy) : Infinity;
      var t = Math.min(tx, ty);
      t = Math.max(0, Math.min(t, len / 2 - 2));

      var sx = from.x + ux * t;
      var sy = from.y + uy * t;
      var ex = to.x - ux * t;
      var ey = to.y - uy * t;

      var p1 = worldToScreen(sx, sy);
      var p2 = worldToScreen(ex, ey);

      var line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("class", "link-line");
      line.setAttribute("x1", p1.x.toFixed(2));
      line.setAttribute("y1", p1.y.toFixed(2));
      line.setAttribute("x2", p2.x.toFixed(2));
      line.setAttribute("y2", p2.y.toFixed(2));
      line.setAttribute("marker-end", "url(#arrow)");
      line.dataset.key = key;

      var bothMatch = active && spotlightIds.has(link.from) && spotlightIds.has(link.to);
      var lineDimmed = active && !bothMatch;

      if (lineDimmed) line.classList.add("is-dimmed");
      else if (bothMatch) line.classList.add("is-highlighted");

      linksLayer.appendChild(line);

      var mx = (p1.x + p2.x) / 2;
      var my = (p1.y + p2.y) / 2;

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

      if (lineDimmed) g.classList.add("is-dimmed");

      g.addEventListener("pointerdown", function (event) {
        event.stopPropagation();
      });

      g.addEventListener("click", function (event) {
        event.stopPropagation();
        links.delete(key);
        renderLinks();
        persist();
      });

      linksLayer.appendChild(g);
    });
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
    links.forEach(function (link, key) {
      if (link.from === id || link.to === id) toDelete.push(key);
    });
    for (var i = 0; i < toDelete.length; i++) {
      links.delete(toDelete[i]);
    }

    node.el.remove();
    nodes.delete(id);

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

    renderLinks();
    syncActiveCategoryFromScene();
    if (onSceneChange) onSceneChange();
    persist();
  }

  function enableNodeInteraction(node) {
    node.el.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      if (event.target.closest(".anchor")) return;
      if (event.target.closest(".node-btn")) return;
      if (event.target.closest(".node-actions")) return;

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

  function enableAnchors(node) {
    var anchors = node.el.querySelectorAll(".anchor");

    anchors.forEach(function (anchor) {
      var side = anchor.dataset.side;

      anchor.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

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
          setHover(null);
          if (previewLine) {
            previewLine.remove();
            previewLine = null;
          }
        }

        var onUp = function (upEvent) {
          if (upEvent.pointerId !== pointerId) return;

          var target = nodeFromPoint(upEvent.clientX, upEvent.clientY);
          cleanup();

          if (target && target.id !== node.id) {
            var key = node.id + "->" + target.id;
            if (!links.has(key)) {
              links.set(key, { from: node.id, to: target.id });
              renderLinks();
              persist();
            }
          }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });
    });
  }

  function bindCanvasPanZoom() {
    canvas.addEventListener("pointerdown", function (event) {
      if (event.target.closest(".node")) return;
      if (event.target.closest(".link-del")) return;
      if (event.target.closest(".canvas-info")) return;

      var isMiddle = event.button === 1;
      var isRight = event.button === 2;
      var isLeft = event.button === 0;
      var onLine = !!(event.target.closest && event.target.closest(".link-line"));

      var shouldPan =
        isMiddle ||
        isRight ||
        (isLeft && session.spacePressed) ||
        (isLeft && !onLine && event.target === canvas);

      if (!shouldPan) return;

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
        persist();
      };

      canvas.classList.add("is-panning");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });

    canvas.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();

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
        wheelTimer = setTimeout(function () { persist(); }, 260);
      },
      { passive: false }
    );

    canvas.addEventListener("contextmenu", function (event) {
      event.preventDefault();

      var lineEl = event.target.closest && event.target.closest(".link-line");
      if (lineEl && lineEl.dataset.key) {
        links.delete(lineEl.dataset.key);
        renderLinks();
        persist();
      }
    });
  }

  function autoLayout() {
    var ids = Array.from(nodes.keys());
    if (ids.length === 0) return;

    var succ = new Map(ids.map(function (id) { return [id, []]; }));
    var pred = new Map(ids.map(function (id) { return [id, []]; }));

    links.forEach(function (link) {
      if (!nodes.has(link.from) || !nodes.has(link.to)) return;
      succ.get(link.from).push(link.to);
      pred.get(link.to).push(link.from);
    });

    var layer = new Map();
    var indeg = new Map(ids.map(function (id) { return [id, pred.get(id).length]; }));
    var placed = new Set();

    var queue = ids.filter(function (id) { return indeg.get(id) === 0; });
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
        var candidate = layer.get(id) + 1;
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

    var remaining = ids.filter(function (id) { return !placed.has(id); });
    var progress = true;

    while (remaining.length && progress) {
      progress = false;
      for (var j = remaining.length - 1; j >= 0; j--) {
        var rid = remaining[j];
        var unknown = pred.get(rid).filter(function (p) { return !placed.has(p); });
        if (unknown.length === 0) {
          var known = pred.get(rid).filter(function (p) { return placed.has(p); });
          var base = known.length
            ? Math.max.apply(null, known.map(function (p) { return layer.get(p) || 0; })) + 1
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
      var wknown = pred.get(wid).filter(function (p) { return placed.has(p); });
      var wbase = wknown.length
        ? Math.max.apply(null, wknown.map(function (p) { return layer.get(p) || 0; })) + 1
        : 0;
      layer.set(wid, wbase);
      placed.add(wid);
    }

    var maxLayer = Math.max.apply(null, ids.map(function (id) { return layer.get(id) || 0; }));
    var byLayer = [];
    for (var li = 0; li <= maxLayer; li++) byLayer.push([]);
    for (var idn = 0; idn < ids.length; idn++) {
      var lid = ids[idn];
      byLayer[layer.get(lid) || 0].push(lid);
    }

    function median(arr) {
      if (!arr.length) return null;
      var sorted = arr.slice().sort(function (a, b) { return a - b; });
      var mid = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function compareBy(refMap, refOrder) {
      return function (a, b) {
        var pos = new Map(refOrder.map(function (id, idx) { return [id, idx]; }));
        var ma = median(
          (refMap.get(a) || []).map(function (id) { return pos.get(id); })
            .filter(function (v) { return v !== undefined; })
        );
        var mb = median(
          (refMap.get(b) || []).map(function (id) { return pos.get(id); })
            .filter(function (v) { return v !== undefined; })
        );
        if (ma === null && mb === null) return 0;
        if (ma === null) return 1;
        if (mb === null) return -1;
        return ma - mb;
      };
    }

    for (var pass = 0; pass < 6; pass++) {
      for (var p1i = 1; p1i < byLayer.length; p1i++) {
        byLayer[p1i].sort(compareBy(pred, byLayer[p1i - 1]));
      }
      for (var p2i = byLayer.length - 2; p2i >= 0; p2i--) {
        byLayer[p2i].sort(compareBy(succ, byLayer[p2i + 1]));
      }
    }

    var colGap = NODE_W + 56;
    var rowGap = NODE_H + 92;
    var totalHeight = (byLayer.length - 1) * rowGap;

    byLayer.forEach(function (row, lix) {
      var rowWidth = Math.max(0, (row.length - 1) * colGap);
      row.forEach(function (id, idx) {
        var node = nodes.get(id);
        if (!node) return;
        var x = idx * colGap - rowWidth / 2;
        var y = lix * rowGap - totalHeight / 2;
        setNodePosition(node, x, y, false);
      });
    });

    renderLinks();
    fitToView();
    persist();
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

  function loadActiveCategory() {
    world.replaceChildren();
    nodes.clear();
    links.clear();
    linksLayer.replaceChildren();
    previewLayer.replaceChildren();
    previewLine = null;
    session.nodeCount = 0;
    session.selectedNodeId = null;

    spotlightIds = null;
    lastSpotlightFirstId = undefined;

    collapseInfoPanel();
    resetDescPanel();

    var cat = getActiveCategory();
    if (!cat) {
      view.x = 0;
      view.y = 0;
      view.scale = 1;
      applyView();
      updateCanvasInfo();
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
    updateCanvasInfo: updateCanvasInfo,
    loadActiveCategory: loadActiveCategory,

    applySpotlight: applySpotlight,
    clearSpotlight: clearSpotlight,
    updateSpotlightClasses: updateSpotlightClasses,
  };
})();