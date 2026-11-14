/* =========================================================
 *  account.js — 个人中心 · 账号设置
 *  - 回显 / 修改昵称、只读登录邮箱、头像实时预览
 *  - Canvas 居中裁剪 160×160 + JPEG 0.85 → Base64 DataURL
 *  - 保存至 Supabase user_metadata（无需 Storage Bucket）
 *  - 保存成功后即时刷新顶部用户区 / 侧边栏 / 设置页
 * ========================================================= */

window.OITreeAccount = (function () {
  "use strict";

  var AVATAR_SIZE = 160;
  var AVATAR_QUALITY = 0.85;
  var MAX_SOURCE_BYTES = 12 * 1024 * 1024;

  var dom = {};
  var bound = false;
  var saving = false;
  var pendingAvatar = "";
  var currentAvatar = "";

  function $(id) {
    return document.getElementById(id);
  }

  function getAuth() {
    return window.OITreeAuth || null;
  }

  function getClient() {
    var auth = getAuth();
    return auth && typeof auth.getClient === "function" ? auth.getClient() : null;
  }

  function getCurrentUser() {
    var auth = getAuth();
    return auth && typeof auth.getUser === "function" ? auth.getUser() : null;
  }

  function getDisplayName(user) {
    var auth = getAuth();
    if (auth && typeof auth.getDisplayName === "function") {
      return auth.getDisplayName(user);
    }

    var email = user && user.email ? String(user.email).trim() : "";
    return email ? email.split("@")[0] : "用户";
  }

  function getAvatarUrl(user) {
    var auth = getAuth();
    if (auth && typeof auth.getAvatarUrl === "function") {
      return auth.getAvatarUrl(user);
    }

    var meta = user && user.user_metadata ? user.user_metadata : {};
    return typeof meta.avatar_url === "string" ? meta.avatar_url : "";
  }

  /* =========================================================
   *  状态提示
   * ========================================================= */

  function setMessage(text, type) {
    if (!dom.msg) return;

    if (!text) {
      dom.msg.textContent = "";
      dom.msg.className = "account-msg";
      dom.msg.hidden = true;
      return;
    }

    dom.msg.textContent = text;
    dom.msg.className = "account-msg " + (type || "info");
    dom.msg.hidden = false;
  }

  function clearMessage() {
    setMessage("");
  }

  function setSaving(busy) {
    saving = !!busy;

    if (!dom.saveBtn) return;

    dom.saveBtn.disabled = !!busy;
    dom.saveBtn.classList.toggle("is-loading", !!busy);
    dom.saveBtn.setAttribute("aria-busy", busy ? "true" : "false");
    dom.saveBtn.textContent = busy ? "保存中..." : "保存修改";
  }

  /* =========================================================
   *  资料回显与头像预览
   * ========================================================= */

  function renderAvatar(displayName) {
    var auth = getAuth();
    var name = String(displayName || "").trim();
    if (!name) name = getDisplayName(getCurrentUser());

    var url = pendingAvatar || currentAvatar;

    if (auth && typeof auth.renderUserAvatar === "function") {
      auth.renderUserAvatar(dom.avatar, url, name);
      return;
    }

    /* 兜底：鉴权模块不可用时至少显示首字母 */
    if (dom.avatarVisual) {
      dom.avatarVisual.classList.remove("has-avatar-image");
      dom.avatarVisual.textContent = (name.charAt(0) || "U").toUpperCase();
    }
  }

  function syncFromUser(user) {
    var displayName = user ? getDisplayName(user) : "";

    currentAvatar = getAvatarUrl(user);
    pendingAvatar = "";

    if (dom.nickname) dom.nickname.value = user ? displayName : "";
    if (dom.email) {
      dom.email.textContent = user && user.email ? user.email : "—";
    }

    renderAvatar(displayName || "用户");

    if (dom.saveBtn && !saving) dom.saveBtn.disabled = !user;
  }

  function refresh() {
    syncFromUser(getCurrentUser());
  }

  /* =========================================================
   *  头像读取、居中裁剪与压缩
   * ========================================================= */

  function readImageFile(file, onLoad, onError) {
    var reader = new FileReader();

    reader.onload = function () {
      var img = new Image();
      img.decoding = "async";
      img.onload = function () {
        onLoad(img);
      };
      img.onerror = function () {
        onError(new Error("图片解析失败，请换一张试试"));
      };
      img.src = String(reader.result || "");
    };

    reader.onerror = function () {
      onError(new Error("图片读取失败，请重试"));
    };

    reader.readAsDataURL(file);
  }

  function cropAvatar(img) {
    var sourceW = img.naturalWidth || img.width || 0;
    var sourceH = img.naturalHeight || img.height || 0;
    var side = Math.min(sourceW, sourceH);

    if (!side) throw new Error("图片尺寸无效");

    var canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;

    var ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持 Canvas");

    var sx = (sourceW - side) / 2;
    var sy = (sourceH - side) / 2;

    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) {
      ctx.imageSmoothingQuality = "high";
    }

    /* PNG 透明区域用暗色填充，避免导出 JPEG 后出现黑块 */
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    return canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
  }

  function handleAvatarChange() {
    var input = dom.avatarInput;
    var file = input && input.files ? input.files[0] : null;

    if (!file) return;

    clearMessage();

    if (!/^image\/(?:png|jpe?g|webp)$/i.test(file.type)) {
      setMessage("请选择 PNG / JPG / WebP 格式的图片", "error");
      input.value = "";
      return;
    }

    if (file.size > MAX_SOURCE_BYTES) {
      setMessage("图片体积过大，请选择 12MB 以内的图片", "error");
      input.value = "";
      return;
    }

    readImageFile(
      file,
      function (img) {
        try {
          pendingAvatar = cropAvatar(img);
          renderAvatar(dom.nickname ? dom.nickname.value : "");
          setMessage("头像预览已更新，点击「保存修改」后同步至云端", "info");
        } catch (err) {
          setMessage(
            err && err.message ? err.message : "头像处理失败",
            "error"
          );
        }
        input.value = "";
      },
      function (err) {
        setMessage(err && err.message ? err.message : "头像处理失败", "error");
        input.value = "";
      }
    );
  }

  /* =========================================================
   *  保存个人资料
   * ========================================================= */

  function handleSave() {
    if (saving) return;

    clearMessage();

    var client = getClient();
    var user = getCurrentUser();
    var nickname = dom.nickname ? dom.nickname.value.trim() : "";

    if (!client || !user) {
      setMessage("登录状态已失效，请重新登录后再试", "error");
      return;
    }

    if (!nickname) {
      setMessage("昵称不能为空", "error");
      if (dom.nickname) dom.nickname.focus();
      return;
    }

    if (nickname.length < 2 || nickname.length > 20) {
      setMessage("昵称长度需为 2 ~ 20 个字符", "error");
      if (dom.nickname) dom.nickname.focus();
      return;
    }

    var nextAvatar = pendingAvatar || currentAvatar || "";

    setSaving(true);

    client.auth
      .updateUser({
        data: {
          nickname: nickname,
          avatar_url: nextAvatar,
        },
      })
      .then(function (result) {
        if (result && result.error) throw result.error;

        var updatedUser = result && result.data ? result.data.user : null;

        /* 合并响应，保证即使 SDK 返回不完整也能立即刷新全站 */
        var meta = Object.assign(
          {},
          user.user_metadata || {},
          updatedUser ? updatedUser.user_metadata || {} : {},
          {
            nickname: nickname,
            avatar_url: nextAvatar,
          }
        );
        var mergedUser = Object.assign({}, user, updatedUser || {}, {
          user_metadata: meta,
        });

        currentAvatar = nextAvatar;
        pendingAvatar = "";

        syncFromUser(mergedUser);

        var auth = getAuth();
        if (auth && typeof auth.applyUser === "function") {
          auth.applyUser(mergedUser);
        }

        setMessage("个人资料更新成功！", "success");
      })
      .catch(function (err) {
        setMessage(
          "更新失败：" + (err && err.message ? err.message : "请稍后重试"),
          "error"
        );
      })
      .then(function () {
        setSaving(false);
      });
  }

  /* =========================================================
   *  事件绑定与公开 API
   * ========================================================= */

  function isPanelActive() {
    var panel = $("panel-account");
    return !!panel && panel.classList.contains("is-active");
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    if (dom.avatar) {
      dom.avatar.addEventListener("click", function () {
        if (dom.avatarInput) dom.avatarInput.click();
      });
    }

    if (dom.avatarInput) {
      dom.avatarInput.addEventListener("change", handleAvatarChange);
    }

    if (dom.nickname) {
      dom.nickname.addEventListener("input", function () {
        /* 未设置头像时，昵称首字母实时跟随 */
        renderAvatar(dom.nickname.value);
        if (dom.msg && !dom.msg.hidden) clearMessage();
      });

      dom.nickname.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          handleSave();
        }
      });
    }

    if (dom.saveBtn) {
      dom.saveBtn.addEventListener("click", handleSave);
    }

    var auth = getAuth();
    if (auth && typeof auth.onChange === "function") {
      auth.onChange(function (user) {
        if (!isPanelActive()) return;
        if (pendingAvatar) return;
        if (document.activeElement === dom.nickname) return;
        syncFromUser(user);
      });
    }
  }

  function init() {
    dom.avatar = $("account-avatar");
    dom.avatarVisual = $("account-avatar-visual");
    dom.avatarInput = $("avatarInput");
    dom.nickname = $("account-nickname");
    dom.email = $("account-email");
    dom.saveBtn = $("account-save-btn");
    dom.msg = $("account-msg");

    bindEvents();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    refresh: refresh,
    save: handleSave,
  };
})();
