/* =========================================================
 *  preferences.js — 个人中心 · 偏好设置
 *  - 技能树与画布：切换专题自动整理居中 / 连线样式
 *  - 代码与题解：默认代码高亮语言 / 代码等宽字体
 *  - 变更即时写入 localStorage['oitree_user_prefs']，
 *    并随 state.preferences 同步至 Supabase（user_oitree_data）
 * ========================================================= */

window.OITreePreferences = (function () {
  "use strict";

  var autoLayoutInput = null;
  var edgeStyleSelect = null;
  var codeLangSelect = null;
  var codeFontSelect = null;
  var bound = false;

  function $(id) {
    return document.getElementById(id);
  }

  function getPrefs() {
    return (
      window.userPreferences ||
      window.defaultPreferences || {
        autoLayoutOnSwitch: true,
        edgeStyle: "bezier",
        defaultCodeLanguage: "cpp",
        codeFont: "'JetBrains Mono', monospace",
      }
    );
  }

  /* A. 应用代码字体：写入根变量，全站 pre/code/编辑器即时生效 */
  function applyCodeFont(font) {
    if (!font || !document || !document.documentElement) return;
    document.documentElement.style.setProperty("--code-font-family", font);
  }

  /* B. 用当前偏好回填四个控件 */
  function syncControls() {
    var prefs = getPrefs();

    if (autoLayoutInput) {
      autoLayoutInput.checked = prefs.autoLayoutOnSwitch !== false;
    }

    if (edgeStyleSelect) {
      edgeStyleSelect.value =
        prefs.edgeStyle === "orthogonal" ? "orthogonal" : "bezier";
    }

    if (codeLangSelect) {
      codeLangSelect.value = prefs.defaultCodeLanguage || "cpp";
    }

    if (codeFontSelect) {
      codeFontSelect.value = prefs.codeFont || "'JetBrains Mono', monospace";
    }
  }

  /* C. 按当前连线样式重绘画布（画布未就绪时静默跳过） */
  function refreshEdgeRendering() {
    var canvas = window.OITreeCanvas;
    if (!canvas || typeof canvas.renderLinks !== "function") return;

    if (typeof canvas.isReady === "function" && !canvas.isReady()) return;

    try {
      canvas.renderLinks();
    } catch (err) {
      console.warn("[oitree] 重绘连线失败：", err);
    }
  }

  /* 全局应用：字体 → 控件状态 → 画布连线 */
  function applyAllPreferences() {
    var prefs = getPrefs();

    applyCodeFont(prefs.codeFont);
    syncControls();
    refreshEdgeRendering();

    return prefs;
  }

  /* 保存补丁并立即应用（localStorage + state.preferences + 云端防抖同步） */
  function updatePreferences(patch) {
    if (typeof window.savePreferences === "function") {
      window.savePreferences(patch);
    } else if (typeof window.setPreference === "function") {
      Object.keys(patch).forEach(function (key) {
        window.setPreference(key, patch[key]);
      });
    } else {
      /* 兜底：偏好模型缺失时至少保证本地缓存可用 */
      var prefs = getPrefs();
      Object.keys(patch).forEach(function (key) {
        prefs[key] = patch[key];
      });
      window.userPreferences = prefs;
      try {
        localStorage.setItem("oitree_user_prefs", JSON.stringify(prefs));
      } catch (err) {
        console.warn("[oitree] 保存偏好设置失败：", err);
      }
    }

    applyAllPreferences();
  }

  function handleAutoLayoutChange() {
    if (!autoLayoutInput) return;
    updatePreferences({ autoLayoutOnSwitch: !!autoLayoutInput.checked });
  }

  function handleEdgeStyleChange() {
    if (!edgeStyleSelect) return;
    updatePreferences({
      edgeStyle:
        edgeStyleSelect.value === "orthogonal" ? "orthogonal" : "bezier",
    });
  }

  function handleCodeLangChange() {
    if (!codeLangSelect) return;
    updatePreferences({ defaultCodeLanguage: codeLangSelect.value });
  }

  function handleCodeFontChange() {
    if (!codeFontSelect) return;
    updatePreferences({ codeFont: codeFontSelect.value });
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    if (autoLayoutInput) {
      autoLayoutInput.addEventListener("change", handleAutoLayoutChange);
    }
    if (edgeStyleSelect) {
      edgeStyleSelect.addEventListener("change", handleEdgeStyleChange);
    }
    if (codeLangSelect) {
      codeLangSelect.addEventListener("change", handleCodeLangChange);
    }
    if (codeFontSelect) {
      codeFontSelect.addEventListener("change", handleCodeFontChange);
    }

    /* 云端数据恢复 / 切换账号后，重新应用字体并回填控件 */
    window.addEventListener("oitree:state-applied", applyAllPreferences);
  }

  function init() {
    autoLayoutInput = $("pref-auto-layout");
    edgeStyleSelect = $("pref-edge-style");
    codeLangSelect = $("pref-code-lang");
    codeFontSelect = $("pref-code-font");

    bindEvents();
    applyAllPreferences();
  }

  /* 兼容文档约定的全局入口 */
  window.applyAllPreferences = applyAllPreferences;
  window.initPreferences = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    refresh: applyAllPreferences,
    applyAllPreferences: applyAllPreferences,
  };
})();

