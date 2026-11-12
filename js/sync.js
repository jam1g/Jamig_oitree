/* =========================================================
 *  sync.js — Supabase 题库多端云同步
 *  - 登录 / 刷新恢复登录态后：自动拉取 user_oitree_data
 *  - 仅“内容型变更”触发上云：2s 防抖 + 快照去重
 *  - 视图漫游 / 选中题目 / 打开笔记等只读动作只落本地
 *  - 顶部轻量状态：固定图标胶囊（☁️ 就绪 / 呼吸同步 / ⚠ 失败）
 * ========================================================= */
(function () {
  "use strict";

  var TABLE = "user_oitree_data";
  var UPLOAD_DEBOUNCE = 2000;

  var auth = null;
  var client = null;
  var currentUser = null;

  /* idle | loading | ready | error */
  var pullState = "idle";

  /* 最近一次云端拉取：供登录流程 await，避免重复请求 */
  var pullPromise = null;
  var pullPromiseUserId = null;
  var pullSeq = 0;

  var uploadTimer = null;
  var uploading = false;
  var dirtyWhileUploading = false;

  var lastSyncedAt = null;
  var syncError = null;

  /* 最近一次成功上传 / 拉取的 state 快照：内容未变时直接跳过请求 */
  var lastUploadedSnapshot = null;

  var statusEl = null;
  var statusIconEl = null;
  var statusTextEl = null;

  function $(id) {
    return document.getElementById(id);
  }

  /* =========================================================
   *  初始化
   * ========================================================= */

  function init() {
    statusEl = $("sync-status");
    statusIconEl = $("sync-status-icon");
    statusTextEl = $("sync-status-text");

    if (statusEl) {
      statusEl.addEventListener("click", function () {
        if (syncError) retry();
      });
    }

    /* state.js 每次本地保存成功后会派发此事件 */
    window.addEventListener("oitree:persist", handleLocalPersist);

    waitForAuth(0);
  }

  function waitForAuth(tries) {
    auth = window.OITreeAuth;

    if (auth && typeof auth.onChange === "function") {
      auth.onChange(handleAuthChange);
      return;
    }

    if (tries > 100) {
      console.warn("[sync] 未检测到鉴权模块，云同步未启用");
      return;
    }

    window.setTimeout(function () {
      waitForAuth(tries + 1);
    }, 100);
  }

  /* =========================================================
   *  登录态变化
   * ========================================================= */

  function handleAuthChange(user) {
    auth = window.OITreeAuth;
    client =
      auth && typeof auth.getClient === "function" ? auth.getClient() : null;

    if (!user || !user.id) {
      /* 退出登录：回到纯本地模式，保留 localStorage */
      currentUser = null;
      pullState = "idle";
      pullPromise = null;
      pullPromiseUserId = null;
      pullSeq += 1;
      cancelUpload();
      uploading = false;
      dirtyWhileUploading = false;
      syncError = null;
      lastUploadedSnapshot = null;
      setStatus("");
      return;
    }

    var sameUser = !!(currentUser && currentUser.id === user.id);

    if (sameUser) {
      currentUser = user;
      /* 同一用户的 token 刷新 / 会话更新：拉取中或已就绪都不重复拉取 */
      if (pullState === "loading" || pullState === "ready") return;
      /* pullState === "error" 时允许自动重试 */
    } else {
      /* 切换账号：丢弃上一个账号的同步上下文，避免串号 */
      if (pullState === "loading") pullSeq += 1;
      pullState = "idle";
      pullPromise = null;
      pullPromiseUserId = null;
      cancelUpload();
      uploading = false;
      dirtyWhileUploading = false;
      syncError = null;
      lastUploadedSnapshot = null;
    }

    currentUser = user;

    /* 延迟到下一个宏任务再发起请求：
     * 避免在 Supabase onAuthStateChange 回调内部直接调用 Supabase API，
     * 同时让 auth.js 的 prepareWorkspace() 有机会复用同一个请求。 */
    window.setTimeout(function () {
      if (!currentUser || currentUser.id !== user.id) return;

      pullCloudData().catch(function () {
        /* 错误状态已由 pullCloudData 写入顶部状态与 syncError */
      });
    }, 0);
  }

  /* =========================================================
   *  云端拉取
   * ========================================================= */

  function pullCloudData(options) {
    var force = !!(options && options.force);

    if (!currentUser) {
      return Promise.reject(new Error("尚未登录，无法加载云端数据"));
    }

    if (!client) {
      client =
        auth && typeof auth.getClient === "function" ? auth.getClient() : null;
    }

    var userId = currentUser.id;

    if (!client) {
      pullState = "error";
      syncError = { action: "pull", message: "云端客户端未就绪" };
      setStatus("error", "云端客户端未就绪");
      return Promise.reject(new Error("云端客户端未就绪"));
    }

    /* 复用进行中 / 已完成的请求：登录流程与鉴权监听不会重复拉取 */
    if (!force && pullPromise && pullPromiseUserId === userId) {
      if (pullState === "loading" || pullState === "ready") return pullPromise;
    }

    var seq = ++pullSeq;

    pullState = "loading";
    cancelUpload();
    setStatus("loading");

    var promise = new Promise(function (resolve, reject) {
      client
        .from(TABLE)
        .select("data")
        .eq("user_id", userId)
        .maybeSingle()
        .then(function (result) {
          /* 已被后续请求（重试 / 切换账号）取代 */
          if (seq !== pullSeq) {
            resolve({ stale: true });
            return;
          }

          /* 拉取期间已登出 / 切换账号 */
          if (!currentUser || currentUser.id !== userId) {
            resolve({ stale: true, signedOut: true });
            return;
          }

          if (result.error) throw result.error;

          var payload = normalizeCloudPayload(
            result.data ? result.data.data : null
          );

          if (!payload) {
            /* 新用户：保留当前默认 / 本地数据，并立即初始化云端记录 */
            pullState = "ready";
            markSynced();
            scheduleUpload(0);
            resolve({ newUser: true });
            return;
          }

          if (!applyCloudState(payload)) {
            /* applyCloudState 内部已记录错误状态 */
            reject(
              new Error((syncError && syncError.message) || "云端数据异常")
            );
            return;
          }

          pullState = "ready";
          /* 云端数据与本地一致：记录快照，后续无变化时跳过上传 */
          lastUploadedSnapshot = snapshotState();
          markSynced();
          resolve({ payload: payload });
        })
        .catch(function (err) {
          if (seq !== pullSeq) return;
          if (!currentUser || currentUser.id !== userId) return;

          console.warn("[sync] 云端数据加载失败：", err);
          pullState = "error";
          syncError = { action: "pull", message: errorMessage(err) };
          setStatus("error", errorMessage(err));
          /* 失败时不做任何本地数据替换，继续离线可用 */
          reject(err);
        });
    });

    pullPromise = promise;
    pullPromiseUserId = userId;

    /* 事件驱动（非 await）的调用方不会处理 rejection，这里兜底避免控制台告警 */
    promise.catch(function () {});

    return promise;
  }

  /**
   * 登录 / 会话恢复时由 auth.js 显式调用。
   * 返回的 Promise 在云端数据真正写入内存（并已触发 state-applied）后 resolve，
   * 让登录流程可以“等数据就绪后再揭开遮罩”。
   *
   * @param {Object} user Supabase user
   * @param {Object} [options] { force: true } 忽略进行中的请求，强制重新拉取
   */
  function loadUserData(user, options) {
    var opts = options || {};

    if (user && user.id) currentUser = user;

    if (!currentUser) {
      return Promise.reject(new Error("尚未登录，无法加载云端数据"));
    }

    if (!client) {
      client =
        auth && typeof auth.getClient === "function" ? auth.getClient() : null;
    }

    if (!client) {
      pullState = "error";
      syncError = { action: "pull", message: "云端客户端未就绪" };
      setStatus("error", "云端客户端未就绪");
      return Promise.reject(new Error("云端客户端未就绪"));
    }

    if (
      !opts.force &&
      pullPromise &&
      pullPromiseUserId === currentUser.id &&
      pullState === "ready"
    ) {
      return Promise.resolve({ cached: true });
    }

    return pullCloudData({ force: !!opts.force });
  }

  function normalizeCloudPayload(raw) {
    var payload = raw;

    /* 兼容 data 列为 jsonb 或 text */
    if (typeof raw === "string") {
      try {
        payload = JSON.parse(raw);
      } catch (err) {
        console.warn("[sync] 云端数据不是有效 JSON：", err);
        return null;
      }
    }

    if (!payload || typeof payload !== "object") return null;
    if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
      return null;
    }

    return payload;
  }

  function applyCloudState(payload) {
    try {
      /* 直接替换全局 state，复用现有校验逻辑 */
      state = payload;
      ensureStateValid();

      /* 通知 app.js：重新加载画布 + 刷新侧栏 / 抽屉 / 搜索 */
      if (typeof window.CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("oitree:state-applied"));
      }

      /* 静默落本地缓存，不触发上云回声（云端本来就是这份数据） */
      saveStateSilently();
      return true;
    } catch (err) {
      console.warn("[sync] 应用云端数据失败：", err);
      pullState = "error";
      syncError = { action: "pull", message: errorMessage(err) };
      setStatus("error", errorMessage(err));
      return false;
    }
  }

  function markSynced() {
    lastSyncedAt = new Date();
    syncError = null;
    setStatus("synced");
  }

  /* =========================================================
   *  本地变更 → 云端上传
   *  - 只读动作由 state.js 标记 cloud:false，不会走到这里
   *  - 2s 防抖窗口内的多次内容变更合并为一次请求
   * ========================================================= */

  function handleLocalPersist(event) {
    /* 视图漫游 / 选中题目 / 镜头对焦等只读动作：禁止触发云端保存 */
    if (event && event.detail && event.detail.cloud === false) return;

    if (!currentUser || !client) return;
    if (pullState !== "ready") return;

    if (uploading) {
      dirtyWhileUploading = true;
      return;
    }

    scheduleUpload(UPLOAD_DEBOUNCE);
  }

  function scheduleUpload(delay) {
    cancelUpload();
    uploadTimer = window.setTimeout(
      pushCloudData,
      typeof delay === "number" ? delay : UPLOAD_DEBOUNCE
    );
  }

  function cancelUpload() {
    if (uploadTimer !== null) {
      window.clearTimeout(uploadTimer);
      uploadTimer = null;
    }
  }

  function snapshotState() {
    try {
      return JSON.stringify(state);
    } catch (err) {
      console.warn("[sync] 生成数据快照失败：", err);
      return null;
    }
  }

  function pushCloudData() {
    uploadTimer = null;

    if (!currentUser || !client || pullState !== "ready") return;

    /* 避免并发请求：上传期间的新变更只打脏标记，结束后统一补发 */
    if (uploading) {
      dirtyWhileUploading = true;
      return;
    }

    /* state 尚未初始化时不上传，避免把空数据写到云端 */
    if (typeof state === "undefined" || !state || !Array.isArray(state.categories)) {
      return;
    }

    var userId = currentUser.id;

    /* 合并当前画布状态，确保节点坐标 / 连线都是最新的 */
    if (typeof syncActiveCategoryFromScene === "function") {
      syncActiveCategoryFromScene();
    }

    var snapshot = snapshotState();

    /* 内容与上次成功同步完全一致：不请求、不刷新状态，消除无意义抖动 */
    if (snapshot !== null && snapshot === lastUploadedSnapshot) {
      dirtyWhileUploading = false;
      markSynced();
      return;
    }

    uploading = true;
    dirtyWhileUploading = false;
    setStatus("syncing");

    client
      .from(TABLE)
      .upsert(
        {
          user_id: userId,
          data: state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .then(function (result) {
        if (result && result.error) throw result.error;
        if (!currentUser || currentUser.id !== userId) return;
        lastUploadedSnapshot = snapshot;
        markSynced();
      })
      .catch(function (err) {
        if (!currentUser || currentUser.id !== userId) return;

        console.warn("[sync] 云端同步失败：", err);
        syncError = { action: "push", message: errorMessage(err) };
        setStatus("error", errorMessage(err));
      })
      .then(function () {
        uploading = false;

        /* 上传期间又有新的本地修改，继续补一次 */
        if (dirtyWhileUploading) {
          dirtyWhileUploading = false;
          scheduleUpload(UPLOAD_DEBOUNCE);
        }
      });
  }

  function retry() {
    if (!syncError) return;

    var action = syncError.action;
    syncError = null;

    if (action === "pull") {
      pullState = "idle";
      pullCloudData({ force: true }).catch(function () {
        /* 错误状态已写入顶部提示 */
      });
      return;
    }

    pullState = "ready";
    pushCloudData();
  }

  /* =========================================================
   *  顶部状态：固定 36px 图标胶囊 + 仅 hover 展示浮窗
   * ========================================================= */

  function setStatus(mode, errorText) {
    if (!statusEl) statusEl = $("sync-status");
    if (!statusIconEl) statusIconEl = $("sync-status-icon");
    if (!statusTextEl) statusTextEl = $("sync-status-text");
    if (!statusEl) return;

    if (!mode) {
      statusEl.hidden = true;
      statusEl.className = "sync-status";
      statusEl.removeAttribute("data-tooltip");
      statusEl.setAttribute("aria-label", "云端同步状态");
      if (statusTextEl) statusTextEl.textContent = "";
      return;
    }

    statusEl.hidden = false;
    statusEl.className = "sync-status is-" + mode;

    var icon = "☁️";
    var tooltip = "";

    if (mode === "error") {
      icon = "⚠";
      tooltip =
        "同步异常" + (errorText ? "：" + errorText : "") + " · 点击重试";
    } else if (mode === "loading") {
      tooltip = "正在加载云端数据…";
    } else if (mode === "syncing") {
      tooltip = "正在与 Supabase 云端同步…";
    } else {
      tooltip = "已与 Supabase 云端同步 · " + formatRelativeTime(lastSyncedAt);
    }

    if (statusIconEl) statusIconEl.textContent = icon;

    statusEl.setAttribute("data-tooltip", tooltip);
    statusEl.setAttribute("aria-label", tooltip);

    if (statusTextEl) statusTextEl.textContent = tooltip;
  }

  function formatRelativeTime(date) {
    if (!date) return "刚刚";

    var diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";

    return date.getMonth() + 1 + " 月 " + date.getDate() + " 日";
  }

  function errorMessage(error) {
    if (!error) return "未知错误";
    return error.message || error.error_description || String(error);
  }

  /* =========================================================
   *  调试 API
   * ========================================================= */

  window.OITreeSync = {
    pull: pullCloudData,
    push: pushCloudData,
    loadUserData: loadUserData,
    getStatus: function () {
      return {
        userId: currentUser ? currentUser.id : null,
        pullState: pullState,
        lastSyncedAt: lastSyncedAt,
        error: syncError,
        uploading: uploading,
      };
    },
  };

  /* =========================================================
   *  启动
   * ========================================================= */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();


