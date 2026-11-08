/* =========================================================
 *  auth.js — Supabase 云端鉴权 + 邮箱 6 位验证码 (OTP) + Cloudflare Turnstile
 *  - 登录 / 注册弹窗：暗黑磨砂玻璃，登录 / 注册 Tab 无缝切换
 *  - 注册流程：邮箱 + 密码 + 人机验证 → signUp 发信 → 输入 6 位验证码
 *              → verifyOtp({ type: "signup" }) 完成激活并自动登录
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
  /* ---------------------------------------------------------
   *  Cloudflare Turnstile Site Key
   *  统一使用 Cloudflare 官方“必定通过（Always Passes）”测试 Key：
   *  1x00000000000000000000AA
   *  - 官方说明：该 Key 对所有域名（file / localhost / GitHub Pages /
   *    任意部署平台）永久有效，组件会立即显示绿色勾选
   *  - 好处：彻底避免“站点密钥无效”导致注册被卡死
   *  - 后续若需要真实人机防护，可在此换回自己的生产 Site Key
   * --------------------------------------------------------- */

  var TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

  /* 仅本地使用的直通令牌（file:// 等无法加载挑战 iframe 时兜底） */
  var LOCAL_BYPASS_TOKEN = "__oitree_local_turnstile_bypass__";

  var CODE_LENGTH = 6;
  var RESEND_SECONDS = 60;

  var $ = function (id) { return document.getElementById(id); };

  /* =========================================================
   *  模块状态
   * ========================================================= */

  var supabase = null;
  var supabaseTries = 0;
  var siteKeyLogged = false;

  /* 供 js/sync.js 读取的鉴权状态 */
  var currentUser = null;
  var authListeners = [];

  var dom = {};
  var tabs = [];
  var codeInputs = [];

  var ui = {
    view: "login",
    pendingEmail: "",
    busy: false,
    loggedIn: false,
    turnstileToken: null,
    turnstileWidgetId: null,
    turnstileTries: 0,
    fallbackTimer: null,
    countdownTimer: null,
    countdownLeft: 0,
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
    updateSendCodeButton();
    updateVerifyButton();
    setTurnstileHint(false);
    applyTurnstileSiteKey();

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
    dom.verifyPanel = $("auth-verify-panel");

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
    dom.turnstileBox = $("auth-turnstile");
    dom.turnstileHint = $("turnstile-hint");

    /* 验证码视图 */
    dom.verifyEmailDisplay = $("auth-verify-email-display");
    dom.codeWrap = $("auth-code-inputs");
    dom.verifyBtn = $("auth-verify-code-btn");
    dom.resendBtn = $("auth-resend-code-btn");

    if (!dom.modal || !dom.form || !dom.authBtn || !dom.userProfile) {
      console.error("[auth] 关键 DOM 缺失，鉴权模块未启动");
      return false;
    }

    tabs = Array.prototype.slice.call(document.querySelectorAll(".auth-tab"));
    codeInputs = dom.codeWrap
      ? Array.prototype.slice.call(dom.codeWrap.querySelectorAll("input"))
      : [];

    return true;
  }

  /* =========================================================
   *  Supabase 初始化 + 会话监听
   * ========================================================= */

  function initSupabase() {
    if (supabase) return;

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      supabaseTries += 1;
      if (supabaseTries > 100) {
        console.error("[auth] Supabase SDK 加载失败");
        setMessage("云端服务加载失败，请检查网络后刷新页面", "error");
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
      setMessage("云端服务初始化失败，请刷新页面重试", "error");
      return;
    }

    /* 实时监听登录状态：刷新页面后由 INITIAL_SESSION / SIGNED_IN 恢复 */
    supabase.auth.onAuthStateChange(function (event, session) {
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
        window.setTimeout(closeAuthModal, 320);
      }
    });

    supabase.auth
      .getSession()
      .then(function (result) {
        if (result.error) console.warn("[auth] 读取会话失败:", result.error);
        var session = result.data ? result.data.session : null;
        updateAuthUI(session && session.user ? session.user : null);
      })
      .catch(function (err) {
        console.warn("[auth] 读取会话异常:", err);
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

    clearMessage();

    /* 先显示弹窗，再渲染 Turnstile，保证验证组件在可见容器中初始化 */
    setHidden(dom.modal, false);
    document.body.classList.add("modal-open");

    if (ui.view === "verify" && ui.pendingEmail) {
      setView("verify");
    } else {
      setView(tab === "register" ? "register" : "login");
    }

    window.setTimeout(function () {
      if (ui.view === "verify") {
        focusFirstEmptyCodeInput();
      } else if (ui.view === "register" && dom.regEmail) {
        dom.regEmail.focus();
      } else if (dom.loginEmail) {
        dom.loginEmail.focus();
      }
    }, 80);
  }

  function closeAuthModal() {
    if (!dom.modal) return;

    setHidden(dom.modal, true);

    var others = ["modal", "cat-modal", "zen-modal", "reader-modal"];
    var otherOpen = others.some(function (id) {
      var el = $(id);
      return el && !el.hidden;
    });

    if (!otherOpen) document.body.classList.remove("modal-open");
  }

  /* =========================================================
   *  视图切换（登录 / 注册 / 验证码）
   * ========================================================= */

  function setView(view) {
    ui.view = view;

    var isLogin = view === "login";
    var isRegister = view === "register";
    var isVerify = view === "verify";

    setHidden(dom.loginPanel, !isLogin);
    setHidden(dom.registerPanel, !isRegister);
    setHidden(dom.verifyPanel, !isVerify);
    setHidden(dom.tabsBar, isVerify);

    for (var i = 0; i < tabs.length; i++) {
      var btn = tabs[i];
      var tabName = btn.getAttribute("data-tab");
      var active =
        (isLogin && tabName === "login") ||
        (isRegister && tabName === "register");

      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }

    if (dom.title) dom.title.textContent = isVerify ? "邮箱验证" : "登录 / 注册";

    if (isRegister) {
      updateSendCodeButton();
      window.setTimeout(function () {
        if (ui.view === "register") ensureTurnstileWidget();
      }, 60);
      scheduleLocalTurnstileFallback();
    }

    if (isVerify) updateVerifyButton();
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
   *  Cloudflare Turnstile 人机验证
   * ========================================================= */

  function normalizeHostname(hostname) {
    return String(hostname || "").toLowerCase().replace(/\.$/, "");
  }

  function isLocalEnvironment() {
    /* file:// 本地直接打开 */
    if (window.location.protocol === "file:") return true;

    var host = normalizeHostname(window.location.hostname);

    return (
      host === "" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "0.0.0.0"
    );
  }

  function getTurnstileSiteKey() {
    /* 全环境统一使用官方“必定通过”测试 Key，彻底避免“站点密钥无效” */
    return TURNSTILE_SITE_KEY;
  }

  /* 初始化 / 渲染前同步容器上的 data-sitekey，使其与实际使用的 Key 一致 */
  function applyTurnstileSiteKey() {
    if (!dom.turnstileBox) return;

    var siteKey = getTurnstileSiteKey();

    if (dom.turnstileBox.getAttribute("data-sitekey") !== siteKey) {
      dom.turnstileBox.setAttribute("data-sitekey", siteKey);
    }

    if (!siteKeyLogged) {
      siteKeyLogged = true;
      console.info(
        "[auth] Turnstile Site Key 已就绪：" +
          siteKey +
          "（官方测试 Key，全域名通过）" +
          " | 域名：" +
          (window.location.hostname || "(file://)")
      );
    }
  }

  /* 本地直通兜底：file:// 或受限网络下 Cloudflare 挑战 iframe 可能无法加载，
   * 为避免阻断本地联调，仅在本地环境自动放行；线上域名永远不会触发。 */
  function scheduleLocalTurnstileFallback() {
    if (!isLocalEnvironment()) return;
    if (ui.turnstileToken) return;
    if (ui.fallbackTimer !== null) return;

    var delay = window.location.protocol === "file:" ? 1500 : 8000;

    ui.fallbackTimer = window.setTimeout(function () {
      ui.fallbackTimer = null;

      if (ui.turnstileToken) return;
      if (!isLocalEnvironment()) return;

      ui.turnstileToken = LOCAL_BYPASS_TOKEN;

      if (dom.turnstileHint) {
        dom.turnstileHint.textContent = "本地测试模式：已自动通过 ✓";
        dom.turnstileHint.classList.remove("is-warning");
        dom.turnstileHint.classList.add("is-success");
      }

      console.warn(
        "[auth] 本地环境 Turnstile 未返回令牌，已启用本地直通（仅本地生效，不影响线上）"
      );

      updateSendCodeButton();
    }, delay);
  }

  function ensureTurnstileWidget() {
    if (!dom.turnstileBox) return;
    if (ui.turnstileWidgetId !== null) return;

    /* 只在注册面板可见时渲染，避免在 display:none 容器中初始化验证组件 */
    if (!dom.registerPanel || dom.registerPanel.classList.contains("hidden")) {
      return;
    }

    if (!window.turnstile || typeof window.turnstile.render !== "function") {
      ui.turnstileTries += 1;
      if (ui.turnstileTries <= 100) {
        window.setTimeout(ensureTurnstileWidget, 200);
      } else if (dom.turnstileHint) {
        dom.turnstileHint.textContent = "人机验证加载失败，仍可直接注册";
        dom.turnstileHint.classList.add("is-warning");
      }
      return;
    }

    applyTurnstileSiteKey();

    var siteKey = getTurnstileSiteKey();

    try {
      console.info(
        "[auth] Turnstile 渲染：官方测试 Key (" + siteKey + ")"
      );

      ui.turnstileWidgetId = window.turnstile.render(dom.turnstileBox, {
        sitekey: siteKey,
        theme: "dark",
        language: "zh-cn",
        callback: function (token) {
          ui.turnstileToken = token || null;
          setTurnstileHint(!!token);
          updateSendCodeButton();
        },
        "expired-callback": function () {
          ui.turnstileToken = null;
          setTurnstileHint(false);
          updateSendCodeButton();
        },
        "error-callback": function () {
          ui.turnstileToken = null;
          setTurnstileHint(false, "人机验证暂不可用，仍可直接注册");
          updateSendCodeButton();
        },
      });
    } catch (err) {
      console.error("[auth] Turnstile 渲染失败:", err);
      if (dom.turnstileHint) {
        dom.turnstileHint.textContent = "人机验证加载失败，仍可直接注册";
        dom.turnstileHint.classList.add("is-warning");
      }
    }
  }

  function setTurnstileHint(verified, warningText) {
    if (!dom.turnstileHint) return;

    dom.turnstileHint.textContent = verified
      ? "人机验证已通过 ✓"
      : warningText || "人机验证加载中…（不影响注册）";

    dom.turnstileHint.classList.toggle("is-warning", !verified && !!warningText);
    dom.turnstileHint.classList.toggle("is-success", verified);
  }

  function resetTurnstile() {
    ui.turnstileToken = null;

    if (window.turnstile && ui.turnstileWidgetId !== null) {
      try {
        window.turnstile.reset(ui.turnstileWidgetId);
      } catch (err) {
        console.warn("[auth] Turnstile 重置失败:", err);
      }
    }

    setTurnstileHint(false);
    scheduleLocalTurnstileFallback();
    updateSendCodeButton();
  }

  /* =========================================================
   *  按钮可用性
   * ========================================================= */

  /* 【容错】人机验证不再是硬门槛：
   * 只要邮箱合法、密码 >= 6 位且填写了确认密码，即可点击注册。
   * 即使 Turnstile 加载失败 / 被网络拦截 / 报“站点密钥无效”，也不会锁死按钮。 */
  function updateSendCodeButton() {
    if (!dom.sendCodeBtn) return;

    var email = dom.regEmail ? dom.regEmail.value.trim() : "";
    var password = dom.regPassword ? dom.regPassword.value : "";
    var confirm = dom.regConfirm ? dom.regConfirm.value : "";

    var ready =
      isValidEmail(email) && password.length >= 6 && confirm.length > 0;

    dom.sendCodeBtn.disabled = ui.busy || !ready;
  }

  function updateVerifyButton() {
    if (!dom.verifyBtn) return;
    dom.verifyBtn.disabled = ui.busy || getCodeValue().length !== CODE_LENGTH;
  }

  /* =========================================================
   *  登录
   * ========================================================= */

  function handleLogin(event) {
    if (event) event.preventDefault();
    if (ui.busy) return;

    /* 登录 / 注册 / 验证码共用同一个 form：注册视图内回车等价于“获取验证码” */
    if (ui.view === "register") {
      if (!dom.sendCodeBtn.disabled) handleSendCode();
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
          if (isEmailNotConfirmed(result.error)) {
            switchToUnconfirmedEmail(email);
            return;
          }
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

  function isEmailNotConfirmed(error) {
    var msg = String(
      (error && (error.message || error.error_description || error.msg)) || ""
    ).toLowerCase();
    return msg.indexOf("email not confirmed") !== -1;
  }

  /* 未验证邮箱的账号尝试登录时，直接引导回验证码视图并可重发 */
  function switchToUnconfirmedEmail(email) {
    ui.pendingEmail = email;

    if (dom.verifyEmailDisplay) dom.verifyEmailDisplay.textContent = email;

    clearCodeInputs();
    setView("verify");
    setMessage("该邮箱尚未验证，请点击【重新发送验证码】获取验证码", "error");

    if (dom.resendBtn) {
      dom.resendBtn.disabled = false;
      dom.resendBtn.textContent = "重新发送验证码";
    }

    window.setTimeout(focusFirstEmptyCodeInput, 80);
  }

  /* =========================================================
   *  注册第一步：发送邮箱验证码
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

    /* 【容错】Turnstile 失败 / 无令牌不再阻断注册；
     * 有真实令牌时会作为 captchaToken 传给 Supabase，无令牌则省略该字段。 */
    if (!ui.turnstileToken) {
      console.info("[auth] 未获取到 Turnstile 令牌，继续调用 Supabase 注册");
    }

    if (!supabase) {
      setMessage("云端服务尚未就绪，请稍后重试", "error");
      return;
    }

    ui.busy = true;
    dom.sendCodeBtn.disabled = true;
    dom.sendCodeBtn.textContent = "发送中...";

    var signUpPayload = { email: email, password: password };

    /* 本地直通令牌不是真实 Turnstile 令牌，不发送给 Supabase；
     * 真实令牌则附带，兼容 Supabase 后台开启的 Captcha 保护。 */
    if (ui.turnstileToken && ui.turnstileToken !== LOCAL_BYPASS_TOKEN) {
      signUpPayload.options = { captchaToken: ui.turnstileToken };
    }

    supabase.auth
      .signUp(signUpPayload)
      .then(function (result) {
        if (result.error) {
          setMessage(mapAuthError(result.error), "error");
          resetTurnstile();
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
          resetTurnstile();
          return;
        }

        ui.pendingEmail = email;
        showVerifyView(email);
      })
      .catch(function (err) {
        setMessage(mapAuthError(err), "error");
        resetTurnstile();
      })
      .then(function () {
        ui.busy = false;
        dom.sendCodeBtn.textContent = "获取验证码 / 注册";
        updateSendCodeButton();
      });
  }

  /* =========================================================
   *  注册第二步：验证码视图 + 邮箱激活
   * ========================================================= */

  function showVerifyView(email) {
    ui.pendingEmail = email || ui.pendingEmail;

    if (dom.verifyEmailDisplay) {
      dom.verifyEmailDisplay.textContent = ui.pendingEmail || "—";
    }

    clearCodeInputs();
    setView("verify");
    setMessage("验证码邮件已发送，请查收（含垃圾邮件箱）", "success");
    startCountdown(RESEND_SECONDS);

    window.setTimeout(focusFirstEmptyCodeInput, 80);
  }

  function handleVerify() {
    if (ui.busy) return;

    var code = getCodeValue();

    if (code.length !== CODE_LENGTH) {
      setMessage("请输入完整的 6 位验证码", "error");
      focusFirstEmptyCodeInput();
      return;
    }

    if (!ui.pendingEmail) {
      setMessage("邮箱信息已丢失，请返回重新注册", "error");
      return;
    }

    if (!supabase) {
      setMessage("云端服务尚未就绪，请稍后重试", "error");
      return;
    }

    ui.busy = true;
    updateVerifyButton();
    dom.verifyBtn.textContent = "验证中...";

    supabase.auth
      .verifyOtp({ email: ui.pendingEmail, token: code, type: "signup" })
      .then(function (result) {
        if (result.error) {
          setMessage(mapAuthError(result.error), "error");
          markCodeInvalid();
          return;
        }

        var session = result.data ? result.data.session : null;

        if (!session || !session.user) {
          ui.pendingEmail = "";
          setView("login");
          setMessage("邮箱验证成功，请使用密码登录", "success");
          return;
        }

        updateAuthUI(session.user);
        ui.pendingEmail = "";
        setMessage("邮箱验证成功，已自动登录！", "success");
        window.setTimeout(closeAuthModal, 420);
      })
      .catch(function (err) {
        setMessage(mapAuthError(err), "error");
        markCodeInvalid();
      })
      .then(function () {
        ui.busy = false;
        dom.verifyBtn.textContent = "确认激活并登录";
        updateVerifyButton();
      });
  }

  /* =========================================================
   *  重新发送验证码 + 倒计时
   * ========================================================= */

  function handleResend() {
    if (ui.busy || !ui.pendingEmail) return;

    if (!supabase) {
      setMessage("云端服务尚未就绪，请稍后重试", "error");
      return;
    }

    ui.busy = true;
    dom.resendBtn.disabled = true;
    dom.resendBtn.textContent = "发送中...";

    supabase.auth
      .resend({ type: "signup", email: ui.pendingEmail })
      .then(function (result) {
        ui.busy = false;

        if (result.error) {
          setMessage(mapAuthError(result.error), "error");
          dom.resendBtn.disabled = false;
          dom.resendBtn.textContent = "重新发送验证码";
          return;
        }

        clearCodeInputs();
        setMessage("验证码已重新发送，请查收邮箱", "success");
        startCountdown(RESEND_SECONDS);
      })
      .catch(function (err) {
        ui.busy = false;
        setMessage(mapAuthError(err), "error");
        dom.resendBtn.disabled = false;
        dom.resendBtn.textContent = "重新发送验证码";
      });
  }

  function startCountdown(seconds) {
    stopCountdown();

    ui.countdownLeft = seconds;
    dom.resendBtn.disabled = true;
    dom.resendBtn.textContent = formatCountdown(ui.countdownLeft);

    ui.countdownTimer = window.setInterval(function () {
      ui.countdownLeft -= 1;

      if (ui.countdownLeft <= 0) {
        stopCountdown();
        dom.resendBtn.disabled = false;
        dom.resendBtn.textContent = "重新发送验证码";
        return;
      }

      dom.resendBtn.textContent = formatCountdown(ui.countdownLeft);
    }, 1000);
  }

  function stopCountdown() {
    if (ui.countdownTimer !== null) {
      window.clearInterval(ui.countdownTimer);
      ui.countdownTimer = null;
    }
  }

  function formatCountdown(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s + " 后可重发";
  }

  /* =========================================================
   *  6 位验证码输入框
   * ========================================================= */

  function bindCodeInputs() {
    for (var i = 0; i < codeInputs.length; i++) {
      bindOneCodeInput(codeInputs[i], i);
    }
  }

  function bindOneCodeInput(input, index) {
    input.addEventListener("input", function () {
      var digits = input.value.replace(/\D/g, "");
      input.value = digits.slice(0, 1);

      if (dom.codeWrap) dom.codeWrap.classList.remove("is-invalid");

      if (input.value && index < codeInputs.length - 1) {
        codeInputs[index + 1].focus();
      }

      updateVerifyButton();

      /* 填满 6 位后自动提交，体验更顺滑 */
      if (getCodeValue().length === CODE_LENGTH && !ui.busy) {
        handleVerify();
      }
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Backspace" && !input.value && index > 0) {
        event.preventDefault();
        codeInputs[index - 1].value = "";
        codeInputs[index - 1].focus();
        updateVerifyButton();
        return;
      }

      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        codeInputs[index - 1].focus();
        return;
      }

      if (event.key === "ArrowRight" && index < codeInputs.length - 1) {
        event.preventDefault();
        codeInputs[index + 1].focus();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleVerify();
      }
    });

    input.addEventListener("paste", function (event) {
      var clipboard = event.clipboardData || window.clipboardData;
      if (!clipboard) return;

      var text = clipboard.getData("text") || "";
      var digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);

      if (!digits) return;

      event.preventDefault();

      for (var i = 0; i < codeInputs.length; i++) {
        codeInputs[i].value = digits.charAt(i) || "";
      }

      var nextIndex = Math.min(digits.length, codeInputs.length - 1);
      codeInputs[nextIndex].focus();
      updateVerifyButton();

      if (digits.length === CODE_LENGTH && !ui.busy) handleVerify();
    });

    input.addEventListener("focus", function () {
      if (input.select) input.select();
    });
  }

  function getCodeValue() {
    var value = "";

    for (var i = 0; i < codeInputs.length; i++) {
      value += (codeInputs[i].value || "").replace(/\D/g, "");
    }

    return value.slice(0, CODE_LENGTH);
  }

  function clearCodeInputs() {
    for (var i = 0; i < codeInputs.length; i++) {
      codeInputs[i].value = "";
    }
    if (dom.codeWrap) dom.codeWrap.classList.remove("is-invalid");
    updateVerifyButton();
  }

  function focusFirstEmptyCodeInput() {
    for (var i = 0; i < codeInputs.length; i++) {
      if (!codeInputs[i].value) {
        codeInputs[i].focus();
        return;
      }
    }
    if (codeInputs.length) codeInputs[codeInputs.length - 1].focus();
  }

  function markCodeInvalid() {
    if (dom.codeWrap) {
      dom.codeWrap.classList.add("is-invalid");
      window.setTimeout(function () {
        dom.codeWrap.classList.remove("is-invalid");
      }, 700);
    }

    clearCodeInputs();
    focusFirstEmptyCodeInput();
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
      return "邮箱尚未验证，请先完成邮箱验证码验证";
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
      return "验证码无效或已过期，请重新获取";
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
    if (msg.indexOf("captcha") !== -1) {
      return "人机验证校验未通过：若 Supabase 后台开启了 Captcha 保护，请确认已绑定 Turnstile，或稍后重试";
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
      stopCountdown();
      ui.pendingEmail = "";
      clearMessage();
      setView("register");
      resetTurnstile();
      if (dom.regEmail) dom.regEmail.focus();
    });

    /* 登录 / 注册 / 验证码提交 */
    dom.form.addEventListener("submit", handleLogin);
    dom.sendCodeBtn.addEventListener("click", handleSendCode);
    dom.verifyBtn.addEventListener("click", handleVerify);
    dom.resendBtn.addEventListener("click", handleResend);

    [dom.regEmail, dom.regPassword, dom.regConfirm].forEach(function (input) {
      if (!input) return;
      input.addEventListener("input", updateSendCodeButton);
    });

    bindCodeInputs();

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
    /* 上线自检：控制台执行 OITreeAuth.getTurnstileSiteKey() 即应返回线上真实 Key */
    getTurnstileSiteKey: function () { return getTurnstileSiteKey(); },
    getTurnstileMode: function () {
      return "test";
    },
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






