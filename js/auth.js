/* =========================================================
 *  auth.js — Supabase 云端鉴权 + 邮箱激活链接
 *  - 登录 / 注册弹窗：暗黑磨砂玻璃，登录 / 注册 Tab 无缝切换
 *  - 注册流程：邮箱 + 密码 → signUp 发送激活邮件
 *              → 用户点击邮件中的确认链接激活 → 返回登录
 *  - 登录流程：signInWithPassword
 *  - 会话保持：onAuthStateChange 实时同步，刷新不丢失登录态
 *  - 右上角【用户】菜单：退出登录（signOut）
 * ========================================================= */
(function () {
  "use strict";

  /* =========================================================
   *  云端配置
   * ========================================================= */

  var SUPABASE_URL = "https://ogdxloknhpjkwjlewymr.supabase.co";
  var SUPABASE_KEY = "sb_publishable_pzyik4TyzrwGj5qrsW4ykg_PGOByxSW";

  var $ = function (id) { return document.getElementById(id); };

  /* =========================================================
   *  模块状态
   * ========================================================= */

  var supabase = null;
  var supabaseTries = 0;

  /* 供 js/sync.js 读取的鉴权状态 */
  var currentUser = null;
  var authListeners = [];

  var dom = {};
  var tabs = [];

  var ui = {
    view: "login",
    pendingEmail: "",
    busy: false,
    loggedIn: false,
    authResolved: false,
    locked: false,
    backdropPressed: false,
    menuOpen: false,
  };

  /* =========================================================
   *  启动
   * ========================================================= */

  function init() {
    if (!cacheDom()) return;

    bindUiEvents();
    updateAuthUI(null); // 未登录：隐藏【用户】按钮，仅显示【登录 / 注册】

    initSupabase();
  }

  function cacheDom() {
    dom.modal = $("auth-modal");
    dom.form = $("auth-form");
    dom.title = $("auth-modal-title");
    dom.closeBtn = $("auth-modal-close");
    dom.tabsBar = $("auth-tabs-bar");
    dom.msg = $("auth-msg");

    dom.loginPanel = $("auth-login-panel");
    dom.registerPanel = $("auth-register-panel");
    dom.activatePanel = $("auth-activate-panel");

    /* 未登录拦截层 */
    dom.gateTip = $("auth-gate-tip");

    /* 顶部工具栏 */
    dom.authBtn = $("toolbar-auth-btn");
    dom.userProfile = $("toolbar-user-profile");
    dom.userBtn = $("toolbar-user-btn");
    dom.userName = $("toolbar-user-name");
    dom.userAvatar = document.querySelector("#toolbar-user-profile .user-avatar");
    dom.userMenu = $("toolbar-user-menu");
    dom.logoutBtn = $("btn-logout");

    /* Tab 切换 */
    dom.switchToRegister = $("auth-switch-to-register");
    dom.switchToLogin = $("auth-switch-to-login");
    dom.backToRegister = $("auth-back-to-register");

    /* 登录表单 */
    dom.loginEmail = $("auth-login-email");
    dom.loginPassword = $("auth-login-password");
    dom.loginSubmit = $("auth-login-submit");

    /* 注册表单 */
    dom.regEmail = $("auth-reg-email");
    dom.regPassword = $("auth-reg-password");
    dom.regConfirm = $("auth-reg-confirm");
    dom.sendCodeBtn = $("auth-send-code-btn");

    /* 激活邮件视图 */
    dom.activateEmail = $("auth-activate-email");
    dom.gotoLoginBtn = $("auth-goto-login-btn");

    if (!dom.modal || !dom.form || !dom.authBtn || !dom.userProfile) {
      console.error("[auth] 关键 DOM 缺失，鉴权模块未启动");
      return false;
    }

    tabs = Array.prototype.slice.call(document.querySelectorAll(".auth-tab"));

    return true;
  }

  /* =========================================================
   *  Supabase 初始化 + 会话监听
   * ========================================================= */

  function initSupabase() {
    if (supabase) return;

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      supabaseTries += 1;
      /* Supabase SDK 是阻塞加载的；若未就绪基本是网络/CDN 失败，快速失败避免长时间卡在验证中 */
      if (supabaseTries > 10) {
        console.error("[auth] Supabase SDK 加载失败");
        handleAuthUnavailable("云端服务加载失败，请检查网络后刷新页面");
        return;
      }
      window.setTimeout(initSupabase, 200);
      return;
    }

    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch (err) {
      console.error("[auth] Supabase 初始化失败:", err);
      handleAuthUnavailable("云端服务初始化失败，请刷新页面重试");
      return;
    }

    /* 实时监听登录状态：刷新页面后由 INITIAL_SESSION / SIGNED_IN 恢复 */
    supabase.auth.onAuthStateChange(function (event, session) {
      markAuthResolved();

      if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        updateAuthUI(null);
        return;
      }

      updateAuthUI(session && session.user ? session.user : null);

      /* 在弹窗内完成登录 / 邮箱激活后自动收起弹窗 */
      if (
        (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
        session &&
        session.user &&
        dom.modal &&
        !dom.modal.hidden
      ) {
        window.setTimeout(function () {
          closeAuthModal(true);
        }, 320);
      }
    });

    supabase.auth
      .getSession()
      .then(function (result) {
        if (result.error) console.warn("[auth] 读取会话失败:", result.error);
        markAuthResolved();
        var session = result.data ? result.data.session : null;
        updateAuthUI(session && session.user ? session.user : null);
      })
      .catch(function (err) {
        console.warn("[auth] 读取会话异常:", err);
        markAuthResolved();
        updateAuthUI(null);
      });
  }

  /* =========================================================
   *  登录态 UI
   * ========================================================= */

  function updateAuthUI(user) {
    var loggedIn = !!(user && user.id);
    ui.loggedIn = loggedIn;

    /* 同步鉴权状态给云同步模块 */
    currentUser = loggedIn ? user : null;
    notifyAuthListeners(currentUser);

    /* 未登录必须彻底隐藏【用户】按钮，登录后隐藏【登录 / 注册】 */
    setHidden(dom.authBtn, loggedIn);
    setHidden(dom.userProfile, !loggedIn);

    if (loggedIn) {
      var meta = user.user_metadata || {};
      var name =
        meta.username ||
        meta.display_name ||
        meta.full_name ||
        user.email ||
        "已登录用户";

      if (dom.userName) dom.userName.textContent = name;
      if (dom.userAvatar) dom.userAvatar.textContent = buildAvatarText(name);
      if (dom.userBtn) {
        dom.userBtn.title = user.email || name;
        dom.userBtn.setAttribute(
          "aria-label",
          "用户菜单（" + (user.email || name) + "）"
        );
      }
    } else {
      if (dom.userName) dom.userName.textContent = "用户";
      if (dom.userAvatar) dom.userAvatar.textContent = "👤";
      if (dom.userBtn) {
        dom.userBtn.removeAttribute("title");
        dom.userBtn.setAttribute("aria-label", "用户菜单");
      }
      closeUserMenu();
    }

    syncAuthGate(currentUser);
  }

  function buildAvatarText(name) {
    var clean = String(name || "").trim();
    if (!clean) return "👤";
    return clean.charAt(0).toUpperCase();
  }

  /* 统一隐藏：同时使用 class 与 hidden 属性，避免元素自身 display 规则覆盖 */
  function setHidden(el, hide) {
    if (!el) return;
    if (hide) {
      el.classList.add("hidden");
      el.setAttribute("hidden", "");
    } else {
      el.classList.remove("hidden");
      el.removeAttribute("hidden");
    }
  }

  /* =========================================================
   *  提示消息
   * ========================================================= */

  function setMessage(text, type) {
    if (!dom.msg) return;

    if (!text) {
      dom.msg.textContent = "";
      dom.msg.className = "auth-msg";
      dom.msg.hidden = true;
      return;
    }

    dom.msg.textContent = text;
    dom.msg.className = "auth-msg " + (type || "error");
    dom.msg.hidden = false;
  }

  function clearMessage() {
    setMessage("");
  }

  /* =========================================================
   *  弹窗开关
   * ========================================================= */

  function openAuthModal(tab) {
    if (!dom.modal) return;

    /* 未登录时始终进入强制登录态（隐藏关闭按钮、禁止遮罩关闭） */
    if (!ui.loggedIn) setLocked(true);

    clearMessage();

    /* 先显示弹窗，再切换到对应视图 */
    setHidden(dom.modal, false);
    document.body.classList.add("modal-open");

    if (ui.view === "activate" && ui.pendingEmail) {
      setView("activate");
    } else {
      setView(tab === "register" ? "register" : "login");
    }

    window.setTimeout(function () {
      if (ui.view === "activate") {
        if (dom.gotoLoginBtn) dom.gotoLoginBtn.focus();
      } else if (ui.view === "register" && dom.regEmail) {
        dom.regEmail.focus();
      } else if (dom.loginEmail) {
        dom.loginEmail.focus();
      }
    }, 80);
  }

  function closeAuthModal(force) {
    if (!dom.modal) return;

    /* 强制登录态下禁止任何关闭方式（关闭按钮 / 遮罩 / Esc） */
    if (ui.locked && !force) return;

    setHidden(dom.modal, true);

    var others = ["modal", "cat-modal", "zen-modal", "reader-modal"];
    var otherOpen = others.some(function (id) {
      var el = $(id);
      return el && !el.hidden;
    });

    if (!otherOpen) document.body.classList.remove("modal-open");
  }

  /* =========================================================
   *  未登录访问拦截（路由守卫）
   * ========================================================= */

  function markAuthResolved() {
    if (ui.authResolved) return;
    ui.authResolved = true;
    document.body.classList.remove("auth-checking");
  }

  function setLocked(locked) {
    ui.locked = !!locked;
    document.body.classList.toggle("auth-locked", ui.locked);

    if (dom.closeBtn) {
      if (ui.locked) {
        dom.closeBtn.hidden = true;
        dom.closeBtn.setAttribute("hidden", "");
      } else {
        dom.closeBtn.hidden = false;
        dom.closeBtn.removeAttribute("hidden");
      }
    }

    if (dom.gateTip) {
      dom.gateTip.textContent = ui.locked
        ? "🔒 请先登录后继续使用"
        : "正在验证登录状态…";
    }
  }

  function syncAuthGate(user) {
    if (!ui.authResolved) return;

    if (user) {
      var wasLocked = ui.locked;
      setLocked(false);

      /* 登录成功：等成功提示展示片刻后平滑收起登录卡片 */
      if (wasLocked && dom.modal && !dom.modal.hidden) {
        window.setTimeout(function () {
          closeAuthModal(true);
        }, 320);
      }
      return;
    }

    var wasUnlocked = !ui.locked;

    setLocked(true);

    if (wasUnlocked) {
      /* 首次进入未登录态 / 退出登录：清空画布与内存数据 */
      clearAppDataForLock();
    }

    openForcedLogin(wasUnlocked ? "请先登录后继续使用" : "");
  }

  function openForcedLogin(message, type) {
    if (!dom.modal) return;

    /* 已经处于强制登录态：保留当前 Tab 与用户输入，不重复刷新 */
    if (!dom.modal.hidden && ui.locked) return;

    ui.pendingEmail = "";
    ui.view = "login";

    openAuthModal("login");

    if (message) setMessage(message, type || "info");
  }

  /* 清除上一个账号的画布 / 内存 / 本地缓存，防止数据串号 */
  function clearAppDataForLock() {
    /* 先关闭可能残留的编辑弹窗，避免其内部逻辑回写旧数据 */
    closeAppOverlays();

    try {
      if (typeof STORAGE_KEY === "string") {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      /* 忽略 */
    }

    if (typeof LEGACY_KEYS !== "undefined" && Array.isArray(LEGACY_KEYS)) {
      for (var i = 0; i < LEGACY_KEYS.length; i++) {
        try {
          localStorage.removeItem(LEGACY_KEYS[i]);
        } catch (_) {
          /* 忽略 */
        }
      }
    }

    /* 重置为默认题库；state-applied 会让 app.js 重新加载画布并刷新侧栏 */
    if (typeof initAppState === "function") {
      initAppState();
    }

    if (typeof window.CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("oitree:state-applied"));
    }
  }

  function closeAppOverlays() {
    try {
      if (window.OITreeEditor) {
        if (typeof window.OITreeEditor.closeProblemModal === "function") {
          window.OITreeEditor.closeProblemModal();
        }
        if (typeof window.OITreeEditor.closeZenMode === "function") {
          window.OITreeEditor.closeZenMode(true);
        }
        if (typeof window.OITreeEditor.closeReaderModal === "function") {
          window.OITreeEditor.closeReaderModal();
        }
      }
    } catch (err) {
      /* 忽略 */
    }

    var catModal = $("cat-modal");
    if (catModal) {
      catModal.hidden = true;
      catModal.classList.add("hidden");
    }

    var drawer = $("drawer");
    if (drawer) drawer.classList.remove("is-open");

    var drawerBackdrop = $("drawer-backdrop");
    if (drawerBackdrop) drawerBackdrop.classList.remove("is-visible");

    var drawerToggle = $("drawer-toggle");
    if (drawerToggle) drawerToggle.classList.remove("is-open");
  }

  function handleAuthUnavailable(message) {
    markAuthResolved();
    ui.loggedIn = false;
    currentUser = null;

    setHidden(dom.authBtn, false);
    setHidden(dom.userProfile, true);
    notifyAuthListeners(null);

    setLocked(true);
    openForcedLogin(
      message || "无法连接云端，请检查网络后刷新页面",
      "error"
    );
  }

  /* =========================================================
   *  视图切换（登录 / 注册 / 邮箱激活）
   * ========================================================= */

  function setView(view) {
    ui.view = view;

    var isLogin = view === "login";
    var isRegister = view === "register";
    var isActivate = view === "activate";

    setHidden(dom.loginPanel, !isLogin);
    setHidden(dom.registerPanel, !isRegister);
    setHidden(dom.activatePanel, !isActivate);
    setHidden(dom.tabsBar, isActivate);

    for (var i = 0; i < tabs.length; i++) {
      var btn = tabs[i];
      var tabName = btn.getAttribute("data-tab");
      var active =
        (isLogin && tabName === "login") ||
        (isRegister && tabName === "register");

      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }

    if (dom.title) dom.title.textContent = isActivate ? "邮箱激活" : "登录 / 注册";
  }

  function switchTab(tab) {
    if (tab !== "login" && tab !== "register") return;

    clearMessage();
    setView(tab);

    window.setTimeout(function () {
      if (tab === "register" && dom.regEmail) dom.regEmail.focus();
      if (tab === "login" && dom.loginEmail) dom.loginEmail.focus();
    }, 30);
  }

  /* =========================================================
   *  登录
   * ========================================================= */

  function handleLogin(event) {
    if (event) event.preventDefault();
    if (ui.busy) return;

    /* 登录 / 注册共用同一个 form：注册视图内回车等价于“立即注册” */
    if (ui.view === "register") {
      handleSendCode();
      return;
    }
    if (ui.view !== "login") return;

    var email = dom.loginEmail ? dom.loginEmail.value.trim() : "";
    var password = dom.loginPassword ? dom.loginPassword.value : "";

    clearMessage();

    if (!isValidEmail(email)) {
      setMessage("请输入有效的邮箱地址", "error");
      if (dom.loginEmail) dom.loginEmail.focus();
      return;
    }

    if (password.length < 6) {
      setMessage("密码至少需要 6 位", "error");
      if (dom.loginPassword) dom.loginPassword.focus();
      return;
    }

    if (!supabase) {
      setMessage("云端服务尚未就绪，请稍后重试", "error");
      return;
    }

    ui.busy = true;
    dom.loginSubmit.disabled = true;
    dom.loginSubmit.textContent = "登录中...";

    supabase.auth
      .signInWithPassword({ email: email, password: password })
      .then(function (result) {
        if (result.error) {
          setMessage(mapAuthError(result.error), "error");
          return;
        }

        var session = result.data ? result.data.session : null;
        if (!session || !session.user) {
          setMessage("登录成功，但未获取到会话，请稍后重试", "error");
          return;
        }

        updateAuthUI(session.user);
        setMessage("登录成功，欢迎回来！", "success");
        window.setTimeout(closeAuthModal, 320);
      })
      .catch(function (err) {
        setMessage(mapAuthError(err), "error");
      })
      .then(function () {
        ui.busy = false;
        dom.loginSubmit.disabled = false;
        dom.loginSubmit.textContent = "登录";
      });
  }

  /* =========================================================
   *  注册：发送邮箱激活链接
   * ========================================================= */

  function handleSendCode() {
    if (ui.busy) return;

    var email = dom.regEmail ? dom.regEmail.value.trim() : "";
    var password = dom.regPassword ? dom.regPassword.value : "";
    var confirm = dom.regConfirm ? dom.regConfirm.value : "";

    clearMessage();

    if (!isValidEmail(email)) {
      setMessage("请输入有效的邮箱地址", "error");
      if (dom.regEmail) dom.regEmail.focus();
      return;
    }

    if (password.length < 6) {
      setMessage("密码至少需要 6 位", "error");
      if (dom.regPassword) dom.regPassword.focus();
      return;
    }

    if (password !== confirm) {
      setMessage("两次输入的密码不一致", "error");
      if (dom.regConfirm) dom.regConfirm.focus();
      return;
    }

    if (!supabase) {
      setMessage("云端服务尚未就绪，请稍后重试", "error");
      return;
    }

    ui.busy = true;
    dom.sendCodeBtn.textContent = "发送中...";

    supabase.auth
      .signUp({ email: email, password: password })
      .then(function (result) {
        if (result.error) {
          setMessage(mapAuthError(result.error), "error");
          return;
        }

        var data = result.data || {};
        var user = data.user;

        /* 项目关闭了邮箱确认：注册后直接获得会话 */
        if (data.session && data.session.user) {
          updateAuthUI(data.session.user);
          setMessage("注册成功，已自动登录！", "success");
          window.setTimeout(closeAuthModal, 320);
          return;
        }

        /* 已注册邮箱：Supabase 返回空 identities 作为防枚举处理 */
        if (
          user &&
          Array.isArray(user.identities) &&
          user.identities.length === 0
        ) {
          setMessage("该邮箱已注册，请切换到【登录】", "error");
          return;
        }

        ui.pendingEmail = email;
        showActivateView(email);
      })
      .catch(function (err) {
        setMessage(mapAuthError(err), "error");
      })
      .then(function () {
        ui.busy = false;
        dom.sendCodeBtn.textContent = "立即注册";
      });
  }

  /* =========================================================
   *  注册成功：显示激活邮件提示
   * ========================================================= */

  function showActivateView(email) {
    ui.pendingEmail = email || ui.pendingEmail;

    if (dom.activateEmail) {
      dom.activateEmail.textContent = ui.pendingEmail || "—";
    }

    clearMessage();
    setView("activate");

    window.setTimeout(function () {
      if (dom.gotoLoginBtn) dom.gotoLoginBtn.focus();
    }, 80);
  }

  /* 我已激活，去登录：切回登录 Tab 并自动填入邮箱 */
  function handleGotoLogin() {
    var email =
      ui.pendingEmail || (dom.regEmail ? dom.regEmail.value.trim() : "");

    if (dom.loginEmail && email) dom.loginEmail.value = email;

    clearMessage();
    setView("login");
    setMessage("邮箱已自动填入，请输入密码登录", "success");

    window.setTimeout(function () {
      if (dom.loginPassword) dom.loginPassword.focus();
    }, 60);
  }

  /* =========================================================
   *  右上角用户菜单 + 退出登录
   * ========================================================= */

  function toggleUserMenu() {
    if (!dom.userMenu) return;

    ui.menuOpen = !ui.menuOpen;
    setHidden(dom.userMenu, !ui.menuOpen);

    if (dom.userBtn) {
      dom.userBtn.setAttribute("aria-expanded", ui.menuOpen ? "true" : "false");
    }
  }

  function closeUserMenu() {
    if (!dom.userMenu) return;

    ui.menuOpen = false;
    setHidden(dom.userMenu, true);

    if (dom.userBtn) dom.userBtn.setAttribute("aria-expanded", "false");
  }

  function handleLogout() {
    closeUserMenu();
    clearMessage();

    if (!supabase) {
      updateAuthUI(null);
      return;
    }

    if (dom.logoutBtn) {
      dom.logoutBtn.disabled = true;
      dom.logoutBtn.textContent = "正在退出...";
    }

    supabase.auth
      .signOut()
      .then(function (result) {
        if (result && result.error) {
          console.warn("[auth] 退出登录失败:", result.error);
        }
        updateAuthUI(null);
      })
      .catch(function (err) {
        console.warn("[auth] 退出登录异常:", err);
        updateAuthUI(null);
      })
      .then(function () {
        if (dom.logoutBtn) {
          dom.logoutBtn.disabled = false;
          dom.logoutBtn.textContent = "🚪 退出登录";
        }
      });
  }

  /* =========================================================
   *  表单校验 + 错误文案
   * ========================================================= */

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function mapAuthError(error) {
    var raw =
      (error && (error.message || error.error_description || error.msg)) || "";
    var msg = String(raw).toLowerCase();

    if (!msg) return "操作失败，请稍后重试";

    if (msg.indexOf("invalid login credentials") !== -1) {
      return "邮箱或密码错误，请重新输入";
    }
    if (msg.indexOf("email not confirmed") !== -1) {
      return "邮箱尚未激活，请先点击邮件中的确认链接，然后再登录";
    }
    if (msg.indexOf("user already registered") !== -1) {
      return "该邮箱已注册，请直接登录";
    }
    if (
      msg.indexOf("password should be at least") !== -1 ||
      msg.indexOf("weak password") !== -1
    ) {
      return "密码强度不足，请至少输入 6 位密码";
    }
    if (
      msg.indexOf("token has expired") !== -1 ||
      msg.indexOf("invalid token") !== -1 ||
      msg.indexOf("invalid or has expired") !== -1
    ) {
      return "激活链接无效或已过期，请重新注册";
    }
    if (
      msg.indexOf("rate limit") !== -1 ||
      msg.indexOf("too many requests") !== -1 ||
      msg.indexOf("only request this after") !== -1
    ) {
      return "操作过于频繁，请稍后再试";
    }
    if (
      msg.indexOf("failed to fetch") !== -1 ||
      msg.indexOf("network") !== -1
    ) {
      return "网络连接失败，请检查网络后重试";
    }
    if (msg.indexOf("signups not allowed") !== -1) {
      return "当前项目已关闭邮箱注册，请联系管理员";
    }
    if (msg.indexOf("email address") !== -1 && msg.indexOf("invalid") !== -1) {
      return "邮箱地址格式不正确";
    }

    return raw || "操作失败，请稍后重试";
  }

  /* =========================================================
   *  事件绑定
   * ========================================================= */

  function bindUiEvents() {
    /* 打开弹窗：必须在 DOM 就绪后绑定，修复点击无反应 */
    dom.authBtn.addEventListener("click", function () {
      openAuthModal("login");
    });

    dom.closeBtn.addEventListener("click", function () {
      closeAuthModal();
    });

    /* 防误关：按下与抬起都必须在遮罩本身，且不能有文字选区 */
    dom.modal.addEventListener("mousedown", function (event) {
      ui.backdropPressed = event.target === dom.modal;
    });

    document.addEventListener("mouseup", function (event) {
      if (!ui.backdropPressed) return;

      ui.backdropPressed = false;
      if (event.target !== dom.modal) return;

      var selection = window.getSelection ? String(window.getSelection()) : "";
      if (selection.length > 0) return;

      closeAuthModal();
    });

    window.addEventListener("blur", function () {
      ui.backdropPressed = false;
    });

    /* Tab 切换 */
    for (var i = 0; i < tabs.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          switchTab(btn.getAttribute("data-tab"));
        });
      })(tabs[i]);
    }

    dom.switchToRegister.addEventListener("click", function () {
      switchTab("register");
    });

    dom.switchToLogin.addEventListener("click", function () {
      switchTab("login");
    });

    dom.backToRegister.addEventListener("click", function () {
      ui.pendingEmail = "";
      clearMessage();
      setView("register");
      if (dom.regEmail) dom.regEmail.focus();
    });

    dom.gotoLoginBtn.addEventListener("click", handleGotoLogin);

    /* 登录 / 注册提交 */
    dom.form.addEventListener("submit", handleLogin);
    dom.sendCodeBtn.addEventListener("click", handleSendCode);

    /* 右上角用户菜单 */
    dom.userBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleUserMenu();
    });

    dom.logoutBtn.addEventListener("click", handleLogout);

    document.addEventListener("click", function (event) {
      if (!ui.menuOpen) return;
      if (dom.userProfile.contains(event.target)) return;
      closeUserMenu();
    });

    /* Esc 关闭弹窗 / 菜单 */
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;

      if (!dom.modal.hidden) {
        event.preventDefault();
        closeAuthModal();
        return;
      }

      if (ui.menuOpen) closeUserMenu();
    });
  }

  /* =========================================================
   *  对外鉴权 API（供 js/sync.js 使用）
   * ========================================================= */

  function notifyAuthListeners(user) {
    for (var i = 0; i < authListeners.length; i++) {
      try {
        authListeners[i](user);
      } catch (err) {
        console.warn("[auth] 鉴权监听回调异常：", err);
      }
    }
  }

  window.OITreeAuth = {
    getClient: function () { return supabase; },
    getUser: function () { return currentUser; },
    isLoggedIn: function () { return !!currentUser; },
    onChange: function (handler) {
      if (typeof handler !== "function") return function () {};

      authListeners.push(handler);
      /* 晚加载的模块可立即拿到当前登录状态 */
      handler(currentUser);

      return function () {
        var idx = authListeners.indexOf(handler);
        if (idx !== -1) authListeners.splice(idx, 1);
      };
    },
  };

  /* =========================================================
   *  启动入口
   * ========================================================= */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();






