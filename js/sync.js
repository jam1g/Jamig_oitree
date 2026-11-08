/* =========================================================
 *  sync.js — Supabase 题库多端云同步
 *  - 登录 / 刷新恢复登录态后：自动拉取 user_oitree_data
 *  - 本地 persist 事件：防抖后 upsert 完整 state JSON
 *  - 未登录 / 云端异常：保持纯 localStorage 离线模式
 *  - 顶部轻量状态：☁️ 云端已同步 / 同步中 / 失败可点击重试
 * ========================================================= */
(function () {
  "use strict";

  var TABLE = "user_oitree_data";
  var UPLOAD_DEBOUNCE = 900;

  var auth = null;
  var client = null;
  var currentUser = null;

  /* idle | loading | ready | error */
  var pullState = "idle";

  var uploadTimer = null;
  var uploading = false;
  var dirtyWhileUploading = false;

  var lastSyncedAt = null;
  var syncError = null;

  var statusEl = null;
  var statusTextEl = null;

  function $(id) {
    return document.getElementById(id);
  }

  /* =========================================================
   *  初始化
   * ========================================================= */

  function init() {
    statusEl = $("sync-status");
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
      cancelUpload();
      uploading = false;
      dirtyWhileUploading = false;
      syncError = null;
      setStatus("", "");
      return;
    }

    if (currentUser && currentUser.id === user.id) {
      currentUser = user;
      /* 同一用户的 token 刷新 / 会话更新：拉取中或已就绪都不重复拉取 */
      if (pullState === "loading" || pullState === "ready") return;
      /* pullState === "error" 时允许自动重试 */
    }

    currentUser = user;
    pullCloudData();
  }

  /* =========================================================
   *  云端拉取
   * ========================================================= */

  function pullCloudData() {
    if (!currentUser) return;
    if (pullState === "loading") return;

    if (!client) {
      client =
        auth && typeof auth.getClient === "function" ? auth.getClient() : null;
    }

    if (!client) {
      pullState = "error";
      syncError = { action: "pull", message: "云端客户端未就绪" };
      setStatus("error", "⚠️ 云端未就绪，点此重试", "云端客户端未就绪");
      return;
    }

    var userId = currentUser.id;

    pullState = "loading";
    cancelUpload();
    setStatus("loading", "☁️ 正在加载云端数据…");

    client
      .from(TABLE)
      .select("data")
      .eq("user_id", userId)
      .maybeSingle()
      .then(function (result) {
        /* 拉取期间已登出 / 切换账号 */
        if (!currentUser || currentUser.id !== userId) return;

        if (result.error) throw result.error;

        var payload = normalizeCloudPayload(
          result.data ? result.data.data : null
        );

        pullState = "ready";

        if (payload) {
          if (applyCloudState(payload)) {
            markSynced("☁️ 云端已同步");
          }
        } else {
          /* 新用户：保留当前默认 / 本地数据，并立即初始化云端记录 */
          markSynced("☁️ 云端已同步");
          scheduleUpload(0);
        }
      })
      .catch(function (err) {
        if (!currentUser || currentUser.id !== userId) return;

        console.warn("[sync] 云端数据加载失败：", err);
        pullState = "error";
        syncError = { action: "pull", message: errorMessage(err) };
        setStatus("error", "⚠️ 云端加载失败，点此重试", errorMessage(err));
        /* 失败时不做任何本地数据替换，继续离线可用 */
      });
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
      setStatus("error", "⚠️ 云端数据异常，点此重试", errorMessage(err));
      return false;
    }
  }

  function markSynced(text) {
    lastSyncedAt = new Date();
    syncError = null;
    setStatus("synced", text || "☁️ 云端已同步");
  }

  /* =========================================================
   *  本地变更 → 云端上传
   * ========================================================= */

  function handleLocalPersist() {
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

  function pushCloudData() {
    uploadTimer = null;

    if (!currentUser || !client || pullState !== "ready") return;

    var userId = currentUser.id;

    /* 合并当前画布状态，确保节点坐标 / 连线都是最新的 */
    if (typeof syncActiveCategoryFromScene === "function") {
      syncActiveCategoryFromScene();
    }

    uploading = true;
    dirtyWhileUploading = false;
    setStatus("syncing", "☁️ 正在同步…");

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
        markSynced("☁️ 云端已同步");
      })
      .catch(function (err) {
        if (!currentUser || currentUser.id !== userId) return;

        console.warn("[sync] 云端同步失败：", err);
        syncError = { action: "push", message: errorMessage(err) };
        setStatus("error", "⚠️ 同步失败，点此重试", errorMessage(err));
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
      pullCloudData();
      return;
    }

    pullState = "ready";
    setStatus("syncing", "☁️ 正在同步…");
    pushCloudData();
  }

  /* =========================================================
   *  顶部状态提示
   * ========================================================= */

  function setStatus(mode, text, errorText) {
    if (!statusEl) statusEl = $("sync-status");
    if (!statusTextEl) statusTextEl = $("sync-status-text");
    if (!statusEl) return;

    if (!text) {
      statusEl.hidden = true;
      statusEl.className = "sync-status";
      statusEl.removeAttribute("title");
      return;
    }

    statusEl.hidden = false;
    statusEl.className = "sync-status is-" + mode;

    if (statusTextEl) statusTextEl.textContent = text;

    var title = "";
    if (errorText) {
      title = "错误：" + errorText;
    } else if (lastSyncedAt) {
      title = "上次同步：" + formatTime(lastSyncedAt);
    }

    if (title) statusEl.title = title;
    else statusEl.removeAttribute("title");
  }

  function formatTime(date) {
    return (
      pad2(date.getHours()) +
      ":" +
      pad2(date.getMinutes()) +
      ":" +
      pad2(date.getSeconds())
    );
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


