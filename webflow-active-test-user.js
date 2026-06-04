(function () {
  var ACTIVE_ATTEMPT_FUNCTION_URL =
    "https://eaxashxpqpihonnuhdpx.supabase.co/functions/v1/get-active-attempt";
  var ACTIVE_TEST_CONTENT_FUNCTION_URL =
    "https://eaxashxpqpihonnuhdpx.supabase.co/functions/v1/get-active-test-content";
  var SAVE_ANSWER_FUNCTION_URL =
    "https://eaxashxpqpihonnuhdpx.supabase.co/functions/v1/save-answer";
  var TOGGLE_QUESTION_FLAG_FUNCTION_URL =
    "https://eaxashxpqpihonnuhdpx.supabase.co/functions/v1/toggle-question-flag";
  var SECTION_REVIEW_URL = "https://www.premedcatalyst.com/section-review";
  var ALLOWED_SECTION_POSITION_STORAGE_PREFIX =
    "portal_allowed_section_position:";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVheGFzaHhwcXBpaG9ubnVoZHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDk4MzMsImV4cCI6MjA4ODAyNTgzM30.j8n-puyJ6rKDMibSCxteJeWbVpI7xkxFux_njkHXlGg";
  var ACTIVE_QUESTION_STATE_KEY = "portal_active_question_state";
  var TOOLBAR_WIRED = false;
  var FLAG_BUTTON_WIRED = false;
  var NAV_MODAL_WIRED = false;
  var COUNTDOWN_INTERVAL_ID = null;
  var TIMER_STORAGE_KEY = "portal_timer_state";
  var SEEN_QUESTIONS_STORAGE_KEY = "portal_seen_questions";
  var ATTEMPT_ANSWERS_STORAGE_KEY = "portal_attempt_answers";
  var ATTEMPT_ANSWER_EVENTS_STORAGE_KEY = "portal_attempt_answer_events";
  var QUESTION_DWELL_STORAGE_KEY = "portal_attempt_question_dwell";
  var PASSAGE_ANNOTATIONS_STORAGE_KEY = "portal_passage_annotations";
  var ACTIVE_TEST_PRELOAD_STYLE_ID = "active-test-preload-style";
  var ACTIVE_TEST_APP_STYLE_ID = "active-test-ui-overrides";
  var QUESTION_NAV_LOADING_ID = "question-nav-loading-indicator";
  var QUESTION_NAV_IN_PROGRESS = false;
  var NAV_MODAL_SCROLL_LOCK_ACTIVE = false;
  var NAV_MODAL_SCROLL_Y = 0;
  var HIGHLIGHT_COLOR_STORAGE_KEY = "portal_highlight_color";
  var HIGHLIGHT_COLORS = {
    yellow: "#FFF59D",
    blue: "#B3D9FF",
  };
  var CURRENT_HIGHLIGHT_COLOR = "yellow";
  var CURRENT_TEST_CONTEXT = {
    session_kind: "test",
    attempt_id: null,
    passage_attempt_id: null,
    passage_id: null,
    question_id: null,
    is_flagged: false,
    remaining_seconds: 0,
    current_question_number: 1,
    total_questions: 0,
  };

  function withSessionPayload(base) {
    if (window.PortalSession && window.PortalSession.withSessionPayload) {
      return window.PortalSession.withSessionPayload(base);
    }
    var payload = Object.assign({}, base || {});
    var passageAttemptId =
      CURRENT_TEST_CONTEXT.passage_attempt_id ||
      new URLSearchParams(window.location.search || "").get(
        "passage_attempt_id",
      );
    if (passageAttemptId) {
      payload.passage_attempt_id = passageAttemptId;
      delete payload.attempt_id;
      return payload;
    }
    if (CURRENT_TEST_CONTEXT.attempt_id) {
      payload.attempt_id = CURRENT_TEST_CONTEXT.attempt_id;
    }
    delete payload.passage_attempt_id;
    return payload;
  }

  function getContextSessionId() {
    if (CURRENT_TEST_CONTEXT.session_kind === "passage") {
      return CURRENT_TEST_CONTEXT.passage_attempt_id;
    }
    return CURRENT_TEST_CONTEXT.attempt_id;
  }

  function getContentSessionId(content) {
    if (!content) return null;
    if (content.session_kind === "passage" && content.passage_attempt_id) {
      return content.passage_attempt_id;
    }
    return content.attempt_id || null;
  }

  function applySessionFromContent(content) {
    if (!content) return;
    if (window.PortalSession && window.PortalSession.applyFromContent) {
      window.PortalSession.applyFromContent(content);
    }
    if (content.session_kind === "passage" && content.passage_attempt_id) {
      CURRENT_TEST_CONTEXT.session_kind = "passage";
      CURRENT_TEST_CONTEXT.passage_attempt_id = content.passage_attempt_id;
      CURRENT_TEST_CONTEXT.attempt_id = null;
      return;
    }
    CURRENT_TEST_CONTEXT.session_kind = "test";
    CURRENT_TEST_CONTEXT.attempt_id = content.attempt_id || null;
    CURRENT_TEST_CONTEXT.passage_attempt_id = null;
  }

  function seedPassageSessionFromUrl() {
    var passageAttemptId = new URLSearchParams(
      window.location.search || "",
    ).get("passage_attempt_id");
    if (!passageAttemptId) return;
    CURRENT_TEST_CONTEXT.session_kind = "passage";
    CURRENT_TEST_CONTEXT.passage_attempt_id = passageAttemptId;
    CURRENT_TEST_CONTEXT.attempt_id = null;
    if (window.PortalSession && window.PortalSession.rememberPassageAttempt) {
      window.PortalSession.rememberPassageAttempt(passageAttemptId);
    } else {
      localStorage.setItem("portal_session_kind", "passage");
      localStorage.setItem(
        "portal_active_passage_attempt_id",
        passageAttemptId,
      );
      localStorage.removeItem("portal_active_attempt_id");
    }
  }

  var questionDwellSessionStartMs = null;
  var questionDwellSessionAttemptId = null;
  var questionDwellSessionQuestionId = null;

  function loadQuestionDwellRoot() {
    var raw = localStorage.getItem(QUESTION_DWELL_STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch (_) {
      return {};
    }
  }

  function saveQuestionDwellRoot(root) {
    localStorage.setItem(
      QUESTION_DWELL_STORAGE_KEY,
      JSON.stringify(root || {}),
    );
  }

  function addAccumulatedDwellSeconds(attemptId, questionId, seconds) {
    if (!attemptId || !questionId) return;
    var delta = Math.max(0, Math.floor(Number(seconds) || 0));
    if (delta <= 0) return;
    var root = loadQuestionDwellRoot();
    if (!root[attemptId]) root[attemptId] = {};
    var prev = Number(root[attemptId][questionId]) || 0;
    root[attemptId][questionId] = prev + delta;
    saveQuestionDwellRoot(root);
  }

  function flushOpenQuestionDwellSegment() {
    if (
      !questionDwellSessionStartMs ||
      !questionDwellSessionQuestionId ||
      !questionDwellSessionAttemptId
    ) {
      return;
    }
    var elapsed = Math.max(
      0,
      Math.floor((Date.now() - questionDwellSessionStartMs) / 1000),
    );
    var aid = questionDwellSessionAttemptId;
    var qid = questionDwellSessionQuestionId;
    questionDwellSessionStartMs = null;
    questionDwellSessionQuestionId = null;
    questionDwellSessionAttemptId = null;
    if (elapsed <= 0) return;
    addAccumulatedDwellSeconds(aid, qid, elapsed);
  }

  function startQuestionDwellSession(attemptId, questionId) {
    flushOpenQuestionDwellSegment();
    if (!attemptId || !questionId) return;
    questionDwellSessionAttemptId = attemptId;
    questionDwellSessionQuestionId = questionId;
    questionDwellSessionStartMs = Date.now();
  }

  function wireQuestionDwellLifecycle() {
    if (window.__portalQuestionDwellWired) return;
    window.__portalQuestionDwellWired = true;
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        flushOpenQuestionDwellSegment();
      } else {
        var aid = getContextSessionId();
        var qid = CURRENT_TEST_CONTEXT.question_id;
        if (aid && qid) startQuestionDwellSession(aid, qid);
      }
    });
    window.addEventListener("pagehide", function () {
      flushOpenQuestionDwellSegment();
    });
  }

  function getPassageAnnotationsStore() {
    var raw = localStorage.getItem(PASSAGE_ANNOTATIONS_STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch (_) {
      return {};
    }
  }

  function setPassageAnnotationsStore(store) {
    localStorage.setItem(
      PASSAGE_ANNOTATIONS_STORAGE_KEY,
      JSON.stringify(store || {}),
    );
  }

  function getSavedPassageMarkup(attemptId, passageId) {
    if (!attemptId || !passageId) return null;
    var store = getPassageAnnotationsStore();
    if (!store[attemptId] || !store[attemptId][passageId]) return null;
    return String(store[attemptId][passageId]);
  }

  function persistCurrentPassageMarkup() {
    var attemptId = getContextSessionId();
    var passageId = CURRENT_TEST_CONTEXT.passage_id;
    var body = getPassageBodyElement();
    if (!attemptId || !passageId || !body) return;
    var store = getPassageAnnotationsStore();
    if (!store[attemptId]) store[attemptId] = {};
    store[attemptId][passageId] = body.innerHTML;
    setPassageAnnotationsStore(store);
  }

  var FIGURE_INLINE_REF_RE = /\(\s*Figure\s+([^)]+?)\s*\)/gi;

  function normalizeFigurePanelKey(raw) {
    if (raw == null) return "";
    return String(raw)
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();
  }

  function figuresByPanelLabel(figures) {
    var map = {};
    if (!Array.isArray(figures)) return map;
    figures.forEach(function (f) {
      if (!f || !f.panel_label) return;
      var key = normalizeFigurePanelKey(f.panel_label);
      if (key) map[key] = f;
    });
    return map;
  }

  function createInlinePassageFigureElement(figure) {
    var panel = document.createElement("figure");
    panel.setAttribute("data-passage-inline-figure", "");
    panel.setAttribute("data-passage-figure", "");
    if (figure.panel_label) {
      panel.setAttribute("data-passage-figure-label", figure.panel_label);
    }

    var img = document.createElement("img");
    img.src = figure.image_url || "";
    img.alt =
      figure.alt_text ||
      (figure.panel_label ? "Figure " + figure.panel_label : "Passage figure");
    img.loading = "lazy";
    img.setAttribute("data-passage-figure-image", "");
    panel.appendChild(img);

    // Caption is omitted here: figure assets (e.g. SVG) usually embed the formatted caption;
    // appending DB caption as <figcaption> duplicated that text on active test and review.

    return panel;
  }

  /**
   * Plain-text passage: one <p> per non-empty line. After each paragraph, insert any figures
   * whose panel label is first cited in that line as (Figure 1A) etc.
   */
  function fillPassageBodyWithInlineFigures(container, plain, figures) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    if (plain == null || plain === "") return;

    var byLabel = figuresByPanelLabel(figures);
    var placed = {};

    String(plain)
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line.length > 0;
      })
      .forEach(function (line) {
        var p = document.createElement("p");
        p.textContent = line;
        p.style.margin = "0 0 12px";
        container.appendChild(p);

        var seenThisLine = {};
        var m;
        FIGURE_INLINE_REF_RE.lastIndex = 0;
        while ((m = FIGURE_INLINE_REF_RE.exec(line)) !== null) {
          var key = normalizeFigurePanelKey(m[1]);
          if (!key || seenThisLine[key]) continue;
          seenThisLine[key] = true;
          if (placed[key]) continue;
          var fig = byLabel[key];
          if (!fig) continue;
          placed[key] = true;
          var figEl = createInlinePassageFigureElement(fig);
          figEl.style.margin = "0 0 16px";
          container.appendChild(figEl);
        }
      });
  }

  function renderPassageBody(passage) {
    var body = getPassageBodyElement();
    if (!body) return;
    var text = (passage && passage.body) || "";
    var saved = getSavedPassageMarkup(
      getContextSessionId(),
      passage && passage.id,
    );
    if (saved) {
      body.innerHTML = saved;
      return;
    }
    fillPassageBodyWithInlineFigures(
      body,
      text,
      (passage && passage.figures) || [],
    );
  }

  function getPassageAttributionElement() {
    return document.querySelector("[data-passage-attribution]");
  }

  function renderPassageAttribution(passage) {
    var attributionEl = getPassageAttributionElement();
    if (!attributionEl) return;
    var text = (passage && passage.source_attribution) || "";
    if (!text) {
      attributionEl.textContent = "";
      attributionEl.style.display = "none";
      return;
    }
    attributionEl.textContent = text;
    attributionEl.style.display = "";
  }

  (function hidePageBeforeInit() {
    if (document.getElementById(ACTIVE_TEST_PRELOAD_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = ACTIVE_TEST_PRELOAD_STYLE_ID;
    style.textContent =
      "body > *:not(#active-test-loader-overlay){display:none !important;}";
    (document.head || document.documentElement).appendChild(style);
  })();

  (function injectUiOverrides() {
    if (document.getElementById(ACTIVE_TEST_APP_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = ACTIVE_TEST_APP_STYLE_ID;
    style.textContent =
      ".aamc-answer-text{font-weight:400!important;}" +
      ".text-block-54{color:#111!important;font-size:14px!important;}" +
      ".text-block-56{color:#111!important;text-transform:capitalize!important;margin-bottom:6px!important;font-size:16px!important;font-weight:700!important;}" +
      ".text-block-63.nav-flag-flagged{color:#e00!important;}" +
      "[data-passage-figures]{display:none!important;}" +
      "[data-passage-inline-figure]{margin:0;}" +
      "[data-passage-inline-figure] img{display:block;max-width:100%;height:auto;width:80%;margin: 0 auto;}" +
      "[data-passage-inline-figure] [data-passage-figure-caption],figcaption[data-passage-figure-caption]{margin-top:8px;font-size:13px;line-height:1.45;color:#333;}" +
      "[data-passage-attribution]{margin-top:16px;font-size:12px;line-height:1.45;color:#555;}" +
      "[data-text-action='highlight'][data-highlight-color]{box-shadow:inset 0 -4px 0 var(--active-highlight-color,#fff59d);}" +
      "[data-text-action='highlight-color-toggle'][data-highlight-color]{box-shadow:inset 0 -4px 0 var(--active-highlight-color,#fff59d);}" +
      "[data-nav-modal-overlay],.aamc-modal-overlay{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;min-height:100vh!important;min-height:100dvh!important;max-width:100%!important;margin:0!important;z-index:99990!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;padding:16px!important;overflow:hidden!important;overscroll-behavior:contain!important;}" +
      "[data-nav-modal-content],.aamc-modal-overlay .aamc-modal-content,.aamc-modal-content{max-height:min(85vh,720px)!important;overflow-y:auto!important;overscroll-behavior:contain!important;flex-shrink:0!important;}";
    (document.head || document.documentElement).appendChild(style);
  })();

  function showInitLoader() {
    if (document.querySelector("#active-test-loader-overlay")) return;
    var overlay = document.createElement("div");
    overlay.id = "active-test-loader-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(255,255,255,0.92)";
    overlay.style.zIndex = "99999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.innerHTML =
      '<div style="font-family:Arial,sans-serif;color:#000;font-weight:700;font-size:16px;">Loading your exam...</div>';
    document.body.appendChild(overlay);
  }

  function hideInitLoader() {
    var overlay = document.querySelector("#active-test-loader-overlay");
    if (overlay) overlay.remove();
    var preloadStyle = document.getElementById(ACTIVE_TEST_PRELOAD_STYLE_ID);
    if (preloadStyle) preloadStyle.remove();
  }

  function setQuestionNavLoading(isLoading, message) {
    var buttons = getPrevNextButtons();
    var navList = getNavigationListContainer();

    if (buttons.prevButton && "disabled" in buttons.prevButton) {
      buttons.prevButton.disabled = Boolean(isLoading);
    }
    if (buttons.nextButton && "disabled" in buttons.nextButton) {
      buttons.nextButton.disabled = Boolean(isLoading);
    }
    if (navList) {
      navList.style.pointerEvents = isLoading ? "none" : "";
      navList.style.opacity = isLoading ? "0.7" : "";
    }

    var existing = document.getElementById(QUESTION_NAV_LOADING_ID);
    if (!isLoading) {
      if (existing) existing.remove();
      return;
    }

    if (!existing) {
      existing = document.createElement("div");
      existing.id = QUESTION_NAV_LOADING_ID;
      existing.style.position = "fixed";
      existing.style.left = "50%";
      existing.style.bottom = "18px";
      existing.style.transform = "translateX(-50%)";
      existing.style.background = "rgba(17,24,39,0.92)";
      existing.style.color = "#fff";
      existing.style.padding = "8px 12px";
      existing.style.borderRadius = "999px";
      existing.style.fontSize = "12px";
      existing.style.fontWeight = "600";
      existing.style.zIndex = "99998";
      existing.style.fontFamily = "Arial,sans-serif";
      document.body.appendChild(existing);
    }
    existing.textContent = message || "Loading question...";
  }

  function getAllowedSectionPositionStorageKey(attemptId) {
    return ALLOWED_SECTION_POSITION_STORAGE_PREFIX + attemptId;
  }

  function getAllowedSectionPosition(attemptId) {
    if (!attemptId) return 1;
    var raw = localStorage.getItem(
      getAllowedSectionPositionStorageKey(attemptId),
    );
    var parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  function ensureAllowedSectionPosition(attemptId) {
    if (!attemptId) return 1;
    var key = getAllowedSectionPositionStorageKey(attemptId);
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "1");
    }
    return getAllowedSectionPosition(attemptId);
  }

  function getPassageSummaries(content) {
    if (!content || !Array.isArray(content.navigation_items)) return [];
    var summaries = [];
    var seen = {};
    content.navigation_items.forEach(function (item) {
      if (!item || !item.passage_id || seen[item.passage_id]) return;
      seen[item.passage_id] = true;
      var passageItems = content.navigation_items.filter(function (row) {
        return row.passage_id === item.passage_id;
      });
      if (passageItems.length === 0) return;
      var numbers = passageItems.map(function (row) {
        return Number(row.global_question_number || 0);
      });
      summaries.push({
        passage_id: item.passage_id,
        passage_title: item.passage_title || "Passage",
        position: summaries.length + 1,
        question_start: Math.min.apply(null, numbers),
        question_end: Math.max.apply(null, numbers),
      });
    });
    return summaries;
  }

  function getPassageQuestionRange(passage) {
    if (!passage) return { start: 1, end: 1 };
    return {
      start: Number(passage.questions_range_start || 1),
      end: Number(passage.questions_range_end || 1),
    };
  }

  function getCurrentPassageNavigationItems(content) {
    if (
      !content ||
      !Array.isArray(content.navigation_items) ||
      !content.current_passage
    ) {
      return [];
    }
    var passageId = content.current_passage.id;
    return content.navigation_items.filter(function (item) {
      return item && item.passage_id === passageId;
    });
  }

  function getFirstQuestionNumberForPassagePosition(content, position) {
    var summaries = getPassageSummaries(content);
    var summary = summaries.find(function (entry) {
      return entry.position === Number(position);
    });
    return summary ? summary.question_start : null;
  }

  function redirectToSectionReview() {
    var sessionId = getContextSessionId();
    var passageId = CURRENT_TEST_CONTEXT.passage_id;
    if (!sessionId || !passageId) return;
    flushOpenQuestionDwellSegment();
    persistCurrentPassageMarkup();
    setExamTimerPaused(true, "section_review");
    setModalOpen(false);
    var query =
      CURRENT_TEST_CONTEXT.session_kind === "passage"
        ? "?passage_attempt_id=" +
          encodeURIComponent(String(sessionId)) +
          "&passage_id=" +
          encodeURIComponent(String(passageId))
        : "?attempt_id=" +
          encodeURIComponent(String(sessionId)) +
          "&passage_id=" +
          encodeURIComponent(String(passageId));
    window.location.href = SECTION_REVIEW_URL + query;
  }

  function navigateToQuestion(questionNumber, loadingMessage, errorPrefix) {
    if (!questionNumber || QUESTION_NAV_IN_PROGRESS) return;
    var content = window.activeTestContent;
    if (content && content.current_passage) {
      var range = getPassageQuestionRange(content.current_passage);
      if (questionNumber < range.start || questionNumber > range.end) return;
    }
    QUESTION_NAV_IN_PROGRESS = true;
    setQuestionNavLoading(true, loadingMessage);
    loadActiveTestContent(questionNumber)
      .catch(function (err) {
        console.error((errorPrefix || "Navigation failed:") + " ", err);
      })
      .finally(function () {
        QUESTION_NAV_IN_PROGRESS = false;
        setQuestionNavLoading(false);
      });
  }

  function getPortalUser() {
    var rawUser = localStorage.getItem("portal_user");
    if (!rawUser) return null;

    try {
      return JSON.parse(rawUser);
    } catch (_) {
      return null;
    }
  }

  function getInitials(user) {
    if (!user) return "??";

    var first = (user.first_name || "").trim();
    var last = (user.last_name || "").trim();
    if (first && last) {
      return (first[0] + last[0]).toUpperCase();
    }

    var fullName = (user.name || "").trim();
    if (!fullName) return "??";

    var parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }

  function getFullName(user) {
    if (!user) return "";

    var first = (user.first_name || "").trim();
    var last = (user.last_name || "").trim();
    if (first || last) return (first + " " + last).trim();

    return (user.name || "").trim();
  }

  function getPortalUserId() {
    var direct = localStorage.getItem("portal_user_id");
    if (direct) return direct;

    var user = getPortalUser();
    return user && user.id ? user.id : null;
  }

  function getAttemptAnswerMap() {
    var raw = localStorage.getItem(ATTEMPT_ANSWERS_STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch (_) {
      return {};
    }
  }

  function setAttemptAnswerMap(map) {
    localStorage.setItem(
      ATTEMPT_ANSWERS_STORAGE_KEY,
      JSON.stringify(map || {}),
    );
  }

  function getAttemptAnswerEvents() {
    var raw = localStorage.getItem(ATTEMPT_ANSWER_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) || [];
    } catch (_) {
      return [];
    }
  }

  function setAttemptAnswerEvents(events) {
    localStorage.setItem(
      ATTEMPT_ANSWER_EVENTS_STORAGE_KEY,
      JSON.stringify(events || []),
    );
  }

  function syncAttemptAnswersFromContent(content) {
    var contentSessionId = getContentSessionId(content);
    if (
      !content ||
      !contentSessionId ||
      !Array.isArray(content.navigation_items)
    ) {
      return;
    }

    var map = getAttemptAnswerMap();
    var changed = false;

    content.navigation_items.forEach(function (item) {
      if (!item || !item.question_id || !item.selected_choice) return;
      map[item.question_id] = {
        attempt_id: contentSessionId,
        selected_choice: item.selected_choice,
        selected_at: new Date().toISOString(),
      };
      changed = true;
    });

    if (changed) setAttemptAnswerMap(map);
  }

  function mergeLocalAttemptAnswersIntoContent(content) {
    if (!content || !getContentSessionId(content)) return content;

    var map = getAttemptAnswerMap();
    function resolveChoice(questionId, existingChoice) {
      var local = map[questionId];
      if (
        local &&
        local.attempt_id === getContentSessionId(content) &&
        local.selected_choice
      ) {
        return local.selected_choice;
      }
      return existingChoice || null;
    }

    if (Array.isArray(content.navigation_items)) {
      content.navigation_items.forEach(function (item) {
        if (!item || !item.question_id) return;
        item.selected_choice = resolveChoice(
          item.question_id,
          item.selected_choice,
        );
      });
    }

    if (content.current_question && content.current_question.id) {
      content.current_question.selected_choice = resolveChoice(
        content.current_question.id,
        content.current_question.selected_choice,
      );
    }

    return content;
  }

  function countAnsweredQuestions(content) {
    if (!content || !Array.isArray(content.navigation_items)) return 0;
    return content.navigation_items.filter(function (item) {
      return Boolean(item && item.selected_choice);
    }).length;
  }

  function updateQuestionProgressFromContent(content) {
    setQuestionProgress(
      countAnsweredQuestions(content),
      Number(content && content.total_questions ? content.total_questions : 0),
    );
  }

  function updateActiveContentAnswerState(questionId, selectedChoice) {
    if (!window.activeTestContent || !questionId) return;
    if (
      window.activeTestContent.current_question &&
      window.activeTestContent.current_question.id === questionId
    ) {
      window.activeTestContent.current_question.selected_choice =
        selectedChoice;
    }
    if (!Array.isArray(window.activeTestContent.navigation_items)) return;
    window.activeTestContent.navigation_items.forEach(function (item) {
      if (item && item.question_id === questionId) {
        item.selected_choice = selectedChoice;
      }
    });
  }

  function persistAnswerToServer(questionId, selectedChoice) {
    var userId = getPortalUserId();
    if (!userId || !getContextSessionId() || !questionId || !selectedChoice) {
      return Promise.resolve();
    }

    return postToFunction(
      SAVE_ANSWER_FUNCTION_URL,
      withSessionPayload({
        user_id: userId,
        question_id: questionId,
        selected_choice: selectedChoice,
      }),
    ).catch(function (err) {
      console.error("Failed to save answer:", err);
    });
  }

  function setText(selector, value) {
    var nodes = document.querySelectorAll(selector);
    nodes.forEach(function (node) {
      node.textContent = value;
    });
  }

  function getPassageBodyElement() {
    return document.querySelector("[data-passage-body]");
  }

  function getFormattingButtons() {
    var allButtons = Array.from(document.querySelectorAll("button,a,div"));
    var highlightButton = document.querySelector(
      "[data-text-action='highlight']",
    );
    var strikeButton = document.querySelector(
      "[data-text-action='strikethrough']",
    );

    if (!highlightButton) {
      highlightButton =
        allButtons.find(function (el) {
          return /highlight/i.test((el.textContent || "").trim());
        }) || null;
    }

    if (!strikeButton) {
      strikeButton =
        allButtons.find(function (el) {
          return /strikethrough/i.test((el.textContent || "").trim());
        }) || null;
    }

    return { highlightButton: highlightButton, strikeButton: strikeButton };
  }

  function getHighlightColorToggle() {
    return document.querySelector(
      "[data-text-action='highlight-color-toggle']",
    );
  }

  function getHighlightColorKey() {
    return CURRENT_HIGHLIGHT_COLOR === "blue" ? "blue" : "yellow";
  }

  function loadHighlightColorPreference() {
    var stored = localStorage.getItem(HIGHLIGHT_COLOR_STORAGE_KEY);
    if (stored === "blue" || stored === "yellow") {
      CURRENT_HIGHLIGHT_COLOR = stored;
    }
  }

  function saveHighlightColorPreference() {
    localStorage.setItem(HIGHLIGHT_COLOR_STORAGE_KEY, getHighlightColorKey());
  }

  function getHighlightStyleText(colorKey) {
    var key = colorKey || getHighlightColorKey();
    return "background:" + HIGHLIGHT_COLORS[key] + ";";
  }

  function getHighlightIconElements(button) {
    if (!button) return [];
    var scoped = button.querySelectorAll("[data-highlight-icon]");
    if (scoped.length) return Array.from(scoped);
    return Array.from(button.querySelectorAll(".text-span-9, strong"));
  }

  function syncHighlightColorControl() {
    var colorKey = getHighlightColorKey();
    var colorValue = HIGHLIGHT_COLORS[colorKey];
    var controls = [
      getFormattingButtons().highlightButton,
      getHighlightColorToggle(),
    ];
    controls.forEach(function (control) {
      if (!control) return;
      control.setAttribute("data-highlight-color", colorKey);
      control.style.setProperty("--active-highlight-color", colorValue);
      control.setAttribute(
        "title",
        colorKey === "yellow"
          ? "Yellow highlight active. Shift+click Highlight to switch to blue."
          : "Blue highlight active. Shift+click Highlight to switch to yellow.",
      );
      getHighlightIconElements(control).forEach(function (icon) {
        icon.style.textDecorationLine = "underline";
        icon.style.textDecorationColor = colorValue;
      });
    });
  }

  function cycleHighlightColor() {
    CURRENT_HIGHLIGHT_COLOR =
      getHighlightColorKey() === "yellow" ? "blue" : "yellow";
    saveHighlightColorPreference();
    syncHighlightColorControl();
  }

  function setButtonEnabled(el, enabled) {
    if (!el) return;
    if ("disabled" in el) {
      el.disabled = !enabled;
    }
    el.setAttribute("aria-disabled", enabled ? "false" : "true");
    el.style.pointerEvents = enabled ? "" : "none";
    el.style.opacity = enabled ? "" : "0.55";
  }

  function getFlagButton() {
    var byAttr = document.querySelector("[data-flag-review-button]");
    if (byAttr) return byAttr;
    var candidates = Array.from(document.querySelectorAll("button,a,div"));
    return (
      candidates.find(function (el) {
        return /flag\s*for\s*review/i.test((el.textContent || "").trim());
      }) || null
    );
  }

  function getPrevNextButtons() {
    var prev =
      document.querySelector("[data-prev-button]") ||
      Array.from(document.querySelectorAll("button,a,div")).find(function (el) {
        return /^previous$/i.test((el.textContent || "").trim());
      }) ||
      Array.from(document.querySelectorAll("button,a,div")).find(function (el) {
        return /previous/i.test((el.textContent || "").trim());
      }) ||
      null;

    var next =
      document.querySelector("[data-next-button]") ||
      Array.from(document.querySelectorAll("button,a,div")).find(function (el) {
        return /^next$/i.test((el.textContent || "").trim());
      }) ||
      Array.from(document.querySelectorAll("button,a,div")).find(function (el) {
        return /\bnext\b/i.test((el.textContent || "").trim());
      }) ||
      null;

    return { prevButton: prev, nextButton: next };
  }

  function getSectionReviewParams() {
    var params = new URLSearchParams(window.location.search || "");
    return {
      isReturn: params.get("section_review") === "1",
      isReviewAll:
        params.get("section_review") === "1" &&
        params.get("review_all") === "1",
    };
  }

  function isSectionReviewReturnMode() {
    return getSectionReviewParams().isReturn;
  }

  function isSectionReviewAllMode() {
    return getSectionReviewParams().isReviewAll;
  }

  function isSectionReviewSingleMode() {
    var params = getSectionReviewParams();
    return params.isReturn && !params.isReviewAll;
  }

  function returnToSectionReviewScreen() {
    var returnUrl = getSectionReviewReturnUrl();
    if (returnUrl) {
      window.location.href = returnUrl;
      return;
    }
    redirectToSectionReview();
  }

  function applyReviewScreenButtonAlign(nextButton) {
    if (!nextButton) return;
    if (isSectionReviewSingleMode()) {
      nextButton.style.marginLeft = "auto";
    } else {
      nextButton.style.removeProperty("margin-left");
    }
  }

  function setSectionReviewChrome() {
    if (!isSectionReviewReturnMode()) return;
    setModalOpen(false);

    getNavButtons().forEach(function (btn) {
      btn.style.display = "none";
    });

    var buttons = getPrevNextButtons();
    if (isSectionReviewSingleMode()) {
      if (buttons.prevButton) {
        buttons.prevButton.style.display = "none";
      }
      if (buttons.nextButton) {
        buttons.nextButton.style.display = "";
        buttons.nextButton.textContent = "Review Screen";
        applyReviewScreenButtonAlign(buttons.nextButton);
      }
      return;
    }

    if (buttons.prevButton) {
      buttons.prevButton.style.display = "";
    }
    if (buttons.nextButton) {
      buttons.nextButton.style.display = "";
    }
    updateNextButtonLabel();
  }

  function updateNextButtonLabel() {
    var buttons = getPrevNextButtons();
    if (!buttons.nextButton) return;
    if (isSectionReviewSingleMode()) {
      buttons.nextButton.textContent = "Review Screen";
      applyReviewScreenButtonAlign(buttons.nextButton);
      return;
    }
    applyReviewScreenButtonAlign(buttons.nextButton);
    var content = window.activeTestContent;
    var range = content
      ? getPassageQuestionRange(content.current_passage)
      : { start: 1, end: 1 };
    var cur = Number(CURRENT_TEST_CONTEXT.current_question_number || 1);
    if (isSectionReviewReturnMode() && cur >= range.end) {
      buttons.nextButton.textContent = "Return to Section Review";
      return;
    }
    buttons.nextButton.textContent =
      cur >= range.end ? "Section Review" : "Next";
  }

  function wirePrevNextNavigation() {
    var buttons = getPrevNextButtons();
    if (!buttons.prevButton && !buttons.nextButton) return;

    if (buttons.prevButton) {
      buttons.prevButton.onclick = function (event) {
        event.preventDefault();
        if (!window.activeTestContent) return;
        var range = getPassageQuestionRange(
          window.activeTestContent.current_passage,
        );
        var cur = Number(CURRENT_TEST_CONTEXT.current_question_number || 1);
        var nextNum = Math.max(cur - 1, range.start);
        if (nextNum === cur) return;
        setModalOpen(false);
        navigateToQuestion(
          nextNum,
          "Loading previous question...",
          "Previous navigation failed:",
        );
      };
    }

    if (buttons.nextButton) {
      buttons.nextButton.onclick = function (event) {
        event.preventDefault();
        if (!window.activeTestContent) return;
        if (isSectionReviewSingleMode()) {
          returnToSectionReviewScreen();
          return;
        }
        var range = getPassageQuestionRange(
          window.activeTestContent.current_passage,
        );
        var cur = Number(CURRENT_TEST_CONTEXT.current_question_number || 1);
        if (cur >= range.end) {
          if (isSectionReviewReturnMode()) {
            returnToSectionReviewScreen();
            return;
          }
          redirectToSectionReview();
          return;
        }
        setModalOpen(false);
        navigateToQuestion(
          cur + 1,
          "Loading next question...",
          "Next navigation failed:",
        );
      };
    }
  }

  function getNavButtons() {
    return Array.from(
      document.querySelectorAll("[data-nav-open], .aamc-nav-btn"),
    ).filter(function (el) {
      return /navigation/i.test((el.textContent || "").trim());
    });
  }

  function getNavModalOverlay() {
    return (
      document.querySelector("[data-nav-modal-overlay]") ||
      document.querySelector(".aamc-modal-overlay")
    );
  }

  function getNavModalContent(overlay) {
    if (!overlay) return null;
    return (
      overlay.querySelector("[data-nav-modal-content]") ||
      overlay.querySelector(".aamc-modal-content") ||
      overlay.firstElementChild
    );
  }

  function getNavModalCloseButtons(overlay) {
    if (!overlay) return [];
    var byAttr = Array.from(
      overlay.querySelectorAll("[data-nav-close], .aamc-modal-close"),
    );
    if (byAttr.length > 0) return byAttr;

    return Array.from(overlay.querySelectorAll("button,a,div")).filter(
      function (el) {
        return /close/i.test((el.textContent || "").trim());
      },
    );
  }

  function setModalOpen(isOpen) {
    var overlay = getNavModalOverlay();
    if (!overlay) return;

    if (isOpen) {
      NAV_MODAL_SCROLL_Y =
        window.pageYOffset || document.documentElement.scrollTop || 0;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = "-" + NAV_MODAL_SCROLL_Y + "px";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      NAV_MODAL_SCROLL_LOCK_ACTIVE = true;
      overlay.style.display = "flex";
      overlay.setAttribute("aria-hidden", "false");
    } else {
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
      if (NAV_MODAL_SCROLL_LOCK_ACTIVE) {
        NAV_MODAL_SCROLL_LOCK_ACTIVE = false;
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        window.scrollTo(0, NAV_MODAL_SCROLL_Y);
      }
    }
  }

  function getNavigationListContainer() {
    return (
      document.querySelector("[data-nav-list]") ||
      document.querySelector(".aamc-modal-overlay tbody")
    );
  }

  function getNavUnseenCounter() {
    return document.querySelector("[data-nav-unseen-count]");
  }

  function getSeenQuestionsMap() {
    var raw = localStorage.getItem(SEEN_QUESTIONS_STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) || {};
    } catch (_) {
      return {};
    }
  }

  function markQuestionSeen(questionId) {
    if (!questionId) return;
    var map = getSeenQuestionsMap();
    map[questionId] = true;
    localStorage.setItem(SEEN_QUESTIONS_STORAGE_KEY, JSON.stringify(map));
  }

  function updateUrlQuestionNumber(questionNumber) {
    if (!questionNumber) return;
    var url = new URL(window.location.href);
    url.searchParams.set("question_number", String(questionNumber));
    window.history.replaceState({}, "", url.toString());
  }

  function renderNavigationItems(content) {
    var container = getNavigationListContainer();
    if (!container || !content || !Array.isArray(content.navigation_items))
      return;

    var seenMap = getSeenQuestionsMap();
    var lastPassageId = null;
    var unseenCount = 0;
    var fragment = document.createDocumentFragment();

    function createPassageHeader(title) {
      var wrap = document.createElement("div");
      wrap.className = "nav-passage-header";
      wrap.innerHTML =
        '<div style="font-size:12px;color:#555;font-weight:700;padding:2px 10px 2px;">' +
        escapeHtml(title || "Passage") +
        "</div>" +
        '<hr style="border:0;border-top:1px solid #d8d8d8;margin:10px 0 6px;" />';

      return wrap;
    }

    function buildQuestionRow(item, isCurrent, statusText, isFlagged) {
      var row = document.createElement("div");
      row.className = "div-block-230";
      row.innerHTML =
        '<div class="text-block-61"></div>' +
        '<div class="text-block-62"></div>' +
        '<div class="text-block-63"></div>';

      row.style.display = "";
      row.setAttribute(
        "data-nav-question-number",
        String(item.global_question_number),
      );
      row.classList.toggle("active", Boolean(isCurrent));

      var qTextEl =
        row.querySelector("[data-nav-qtext]") ||
        row.querySelector(".text-block-61");
      var statusEl =
        row.querySelector("[data-nav-status]") ||
        row.querySelector(".text-block-62");
      var flagEl =
        row.querySelector("[data-nav-flag]") ||
        row.querySelector(".text-block-63");

      if (qTextEl) {
        qTextEl.innerHTML =
          '<a href="#" data-nav-question-number="' +
          item.global_question_number +
          '">' +
          escapeHtml(
            (item.passage_title || "Question") +
              " " +
              item.global_question_number,
          ) +
          "</a>";
      }
      if (statusEl) {
        statusEl.textContent = statusText;
      }
      if (flagEl) {
        flagEl.setAttribute("data-nav-flag", "");
        flagEl.textContent = isFlagged ? "⚑" : "";
        flagEl.classList.toggle("nav-flag-flagged", Boolean(isFlagged));
      }

      row.addEventListener("click", function (event) {
        event.preventDefault();
        var qn = Number(row.getAttribute("data-nav-question-number") || 0);
        if (!qn) return;
        setModalOpen(false);
        navigateToQuestion(
          qn,
          "Navigating to question...",
          "Navigation jump failed:",
        );
      });

      return row;
    }

    getCurrentPassageNavigationItems(content).forEach(function (item) {
      if (item.passage_id !== lastPassageId) {
        fragment.appendChild(
          createPassageHeader(item.passage_title || "Passage"),
        );
        lastPassageId = item.passage_id;
      }

      var isAnswered = !!item.selected_choice;
      var isSeen = !!seenMap[item.question_id];
      var isCurrent =
        item.global_question_number === content.current_question_number;
      var statusText = "";

      if (isAnswered) {
        statusText = "";
      } else if (!isSeen) {
        statusText = "Unseen";
        unseenCount += 1;
      }

      fragment.appendChild(
        buildQuestionRow(item, isCurrent, statusText, item.is_flagged),
      );
    });

    container.innerHTML = "";
    container.appendChild(fragment);

    var unseenCounter = getNavUnseenCounter();
    if (unseenCounter) {
      unseenCounter.textContent = unseenCount + " Unseen/Incomplete";
    }
  }

  function wireNavigationModal() {
    if (NAV_MODAL_WIRED) return;
    NAV_MODAL_WIRED = true;

    var overlay = getNavModalOverlay();
    if (!overlay) return;
    var modalContent = getNavModalContent(overlay);
    var openButtons = getNavButtons();
    var closeButtons = getNavModalCloseButtons(overlay);

    setModalOpen(false);

    openButtons.forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        setModalOpen(true);
        renderNavigationItems(window.activeTestContent || null);
      });
    });

    closeButtons.forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        setModalOpen(false);
      });
    });

    overlay.addEventListener("click", function (event) {
      if (!modalContent) {
        setModalOpen(false);
        return;
      }
      if (!modalContent.contains(event.target)) {
        setModalOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setModalOpen(false);
      }
    });
  }

  function syncActiveTestFlagState(questionId, isFlagged) {
    var content = window.activeTestContent;
    if (!content || !questionId) return;

    if (
      content.current_question &&
      content.current_question.id === questionId
    ) {
      content.current_question.is_flagged = Boolean(isFlagged);
    }

    if (Array.isArray(content.navigation_items)) {
      content.navigation_items.forEach(function (item) {
        if (item && item.question_id === questionId) {
          item.is_flagged = Boolean(isFlagged);
        }
      });
    }

    renderNavigationItems(content);
  }

  function setFlagButtonBusy(isBusy) {
    var button = getFlagButton();
    if (!button) return;
    if (isBusy) {
      button.setAttribute("data-flag-busy", "true");
      button.setAttribute("aria-busy", "true");
      button.style.opacity = "0.65";
      button.style.pointerEvents = "none";
      if ("disabled" in button) {
        button.disabled = true;
      }
      return;
    }

    button.removeAttribute("data-flag-busy");
    button.removeAttribute("aria-busy");
    button.style.opacity = "";
    button.style.pointerEvents = "";
  }

  function renderFlagButtonState() {
    var button = getFlagButton();
    if (!button) return;
    if (button.getAttribute("data-flag-busy") === "true") return;
    button.style.color = "#555";
    var enabled = Boolean(CURRENT_TEST_CONTEXT.question_id);
    if ("disabled" in button) {
      button.disabled = !enabled;
    }

    if (!enabled) {
      button.textContent = "Flag for Review";
      return;
    }

    button.textContent = CURRENT_TEST_CONTEXT.is_flagged
      ? "Unflag Review"
      : "Flag for Review";
  }

  function wireFlagButton() {
    if (FLAG_BUTTON_WIRED) return;
    FLAG_BUTTON_WIRED = true;

    var button = getFlagButton();
    if (!button) return;

    button.addEventListener("click", async function (event) {
      event.preventDefault();
      if (!CURRENT_TEST_CONTEXT.question_id) return;

      var userId = getPortalUserId();
      if (!userId) return;

      setFlagButtonBusy(true);
      button.textContent = CURRENT_TEST_CONTEXT.is_flagged
        ? "Unflagging..."
        : "Flagging...";

      try {
        var result = await postToFunction(
          TOGGLE_QUESTION_FLAG_FUNCTION_URL,
          withSessionPayload({
            user_id: userId,
            question_id: CURRENT_TEST_CONTEXT.question_id,
          }),
        );
        CURRENT_TEST_CONTEXT.is_flagged = Boolean(result.is_flagged);
        syncActiveTestFlagState(
          CURRENT_TEST_CONTEXT.question_id,
          CURRENT_TEST_CONTEXT.is_flagged,
        );
      } catch (err) {
        console.error("Flag toggle error:", err);
      } finally {
        setFlagButtonBusy(false);
        renderFlagButtonState();
      }
    });
  }

  function isSelectionInsidePassage() {
    var body = getPassageBodyElement();
    if (!body) return false;
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    if (selection.isCollapsed) return false;
    var range = selection.getRangeAt(0);
    var common = range.commonAncestorContainer;
    return body.contains(common.nodeType === 1 ? common : common.parentElement);
  }

  function updateFormatButtonsState() {
    var buttons = getFormattingButtons();
    var enabled = isSelectionInsidePassage();
    setButtonEnabled(buttons.highlightButton, enabled);
    setButtonEnabled(buttons.strikeButton, enabled);
  }

  function normalizePassageMarkStyle(styleText) {
    return String(styleText || "")
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function getPassageMarkType(span) {
    if (!span || span.nodeType !== 1 || span.tagName !== "SPAN") return null;
    var mark = span.getAttribute("data-passage-mark");
    if (mark === "highlight" || mark === "strikethrough") return mark;
    var style = normalizePassageMarkStyle(span.getAttribute("style"));
    if (style.indexOf("background:#fff59d") !== -1) return "highlight";
    if (style.indexOf("background:#b3d9ff") !== -1) return "highlight";
    if (style.indexOf("text-decoration:line-through") !== -1) {
      return "strikethrough";
    }
    return null;
  }

  function rangeIntersectsNode(range, node) {
    if (!range || !node) return false;
    if (typeof range.intersectsNode === "function") {
      try {
        return range.intersectsNode(node);
      } catch (_) {
        return false;
      }
    }
    var nodeRange = document.createRange();
    try {
      nodeRange.selectNodeContents(node);
    } catch (_) {
      return false;
    }
    return (
      range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
    );
  }

  function getPassageMarkSpansInRange(range, markType) {
    var body = getPassageBodyElement();
    if (!body || !range || !markType) return [];

    var matches = [];
    var add = function (span) {
      if (!span || matches.indexOf(span) !== -1) return;
      matches.push(span);
    };

    [range.startContainer, range.endContainer].forEach(function (container) {
      var node =
        container && container.nodeType === 3
          ? container.parentElement
          : container;
      while (node && node !== body) {
        if (getPassageMarkType(node) === markType) add(node);
        node = node.parentElement;
      }
    });

    Array.from(body.querySelectorAll("span")).forEach(function (span) {
      if (getPassageMarkType(span) !== markType) return;
      if (rangeIntersectsNode(range, span)) add(span);
    });

    return matches;
  }

  function unwrapPassageMarkSpan(span) {
    if (!span || !span.parentNode) return;
    var parent = span.parentNode;
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  }

  function removePassageMarksInRange(range, markType) {
    var body = getPassageBodyElement();
    if (!body) return false;
    var spans = getPassageMarkSpansInRange(range, markType);
    if (!spans.length) return false;
    spans.forEach(unwrapPassageMarkSpan);
    body.normalize();
    return true;
  }

  function getTextNodesInRange(range) {
    var body = getPassageBodyElement();
    if (!body || !range) return [];

    var nodes = [];
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || node.nodeValue.length === 0) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!rangeIntersectsNode(range, node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    var current;
    while ((current = walker.nextNode())) {
      nodes.push(current);
    }
    return nodes;
  }

  function wrapTextNodeInRange(textNode, range, styleText, markType) {
    if (!textNode || textNode.nodeType !== 3 || !textNode.parentNode) return;

    var text = textNode.nodeValue || "";
    var start = textNode === range.startContainer ? range.startOffset : 0;
    var end = textNode === range.endContainer ? range.endOffset : text.length;
    start = Math.max(0, Math.min(start, text.length));
    end = Math.max(start, Math.min(end, text.length));
    if (start >= end) return;

    var parent = textNode.parentNode;
    var beforeText = text.slice(0, start);
    var middleText = text.slice(start, end);
    var afterText = text.slice(end);
    if (!middleText) return;

    var mark = document.createElement("span");
    mark.setAttribute("style", styleText);
    if (markType) mark.setAttribute("data-passage-mark", markType);
    if (markType === "highlight") {
      mark.setAttribute("data-passage-highlight-color", getHighlightColorKey());
    }
    mark.textContent = middleText;

    if (beforeText) {
      parent.insertBefore(document.createTextNode(beforeText), textNode);
    }
    parent.insertBefore(mark, textNode);
    if (afterText) {
      parent.insertBefore(document.createTextNode(afterText), textNode);
    }
    parent.removeChild(textNode);
  }

  function wrapRangeWithPassageMark(range, styleText, markType) {
    var nodes = getTextNodesInRange(range);
    if (!nodes.length) return;

    for (var i = nodes.length - 1; i >= 0; i--) {
      wrapTextNodeInRange(nodes[i], range, styleText, markType);
    }

    var body = getPassageBodyElement();
    if (body) body.normalize();
  }

  function wrapSelectionWithStyle(styleText, markType) {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;
    if (!isSelectionInsidePassage()) return;

    var range = selection.getRangeAt(0).cloneRange();
    wrapRangeWithPassageMark(range, styleText, markType);
    selection.removeAllRanges();
    persistCurrentPassageMarkup();
    updateFormatButtonsState();
  }

  function togglePassageMark(markType, styleText) {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;
    if (!isSelectionInsidePassage()) return;

    var range = selection.getRangeAt(0).cloneRange();
    if (removePassageMarksInRange(range, markType)) {
      selection.removeAllRanges();
      persistCurrentPassageMarkup();
      updateFormatButtonsState();
      return;
    }

    wrapSelectionWithStyle(styleText, markType);
  }

  function wireTextFormattingToolbar() {
    if (TOOLBAR_WIRED) return;
    TOOLBAR_WIRED = true;

    var buttons = getFormattingButtons();
    if (!buttons.highlightButton && !buttons.strikeButton) return;

    loadHighlightColorPreference();
    syncHighlightColorControl();

    if (buttons.highlightButton) {
      buttons.highlightButton.addEventListener("click", function (event) {
        event.preventDefault();
        if (event.shiftKey) {
          cycleHighlightColor();
          return;
        }
        togglePassageMark("highlight", getHighlightStyleText());
      });
    }

    var highlightColorToggle = getHighlightColorToggle();
    if (highlightColorToggle) {
      highlightColorToggle.addEventListener("click", function (event) {
        event.preventDefault();
        cycleHighlightColor();
      });
    }

    if (buttons.strikeButton) {
      buttons.strikeButton.addEventListener("click", function (event) {
        event.preventDefault();
        togglePassageMark("strikethrough", "text-decoration: line-through;");
      });
    }

    document.addEventListener("selectionchange", updateFormatButtonsState);
    document.addEventListener("mouseup", updateFormatButtonsState);
    document.addEventListener("keyup", updateFormatButtonsState);
    updateFormatButtonsState();
  }

  function formatDuration(seconds) {
    var s = Number(seconds || 0);
    var hh = String(Math.floor(s / 3600)).padStart(2, "0");
    var mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    var ss = String(s % 60).padStart(2, "0");
    return hh + ":" + mm + ":" + ss;
  }

  function setTimerText(seconds) {
    var formatted = formatDuration(seconds);
    setText("[data-time-remaining]", formatted);
    setText("[time-remaining]", formatted);
  }

  function setQuestionProgress(answered, total) {
    var text = String(answered || 0) + " of " + String(total || 0);
    setText("[data-question-progress]", text);
    setText("[question-progress]", text);
  }

  function persistTimerSnapshot() {
    if (!getContextSessionId()) return;
    var existing = loadTimerSnapshot() || {};
    var snapshot = {
      attempt_id: getContextSessionId(),
      remaining_seconds: CURRENT_TEST_CONTEXT.remaining_seconds || 0,
      updated_at: new Date().toISOString(),
    };
    if (existing.exam_paused) {
      snapshot.exam_paused = true;
      if (existing.pause_context)
        snapshot.pause_context = existing.pause_context;
    }
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(snapshot));
  }

  function loadTimerSnapshot() {
    var raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function isExamTimerPaused() {
    var snapshot = loadTimerSnapshot();
    return Boolean(snapshot && snapshot.exam_paused);
  }

  function setExamTimerPaused(isPaused, pauseContext) {
    if (!getContextSessionId()) return;
    var snapshot = loadTimerSnapshot() || {};
    snapshot.attempt_id = getContextSessionId();
    snapshot.remaining_seconds = Number(
      CURRENT_TEST_CONTEXT.remaining_seconds || snapshot.remaining_seconds || 0,
    );
    snapshot.exam_paused = Boolean(isPaused);
    if (isPaused) {
      snapshot.pause_context = pauseContext || "section_review";
    } else {
      delete snapshot.pause_context;
    }
    snapshot.updated_at = new Date().toISOString();
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(snapshot));
  }

  function getSectionReviewReturnUrl() {
    var params = new URLSearchParams(window.location.search || "");
    var sessionId =
      params.get("passage_attempt_id") ||
      params.get("attempt_id") ||
      getContextSessionId() ||
      "";
    var passageId =
      params.get("passage_id") || CURRENT_TEST_CONTEXT.passage_id || "";
    if (!sessionId || !passageId) return null;
    if (
      CURRENT_TEST_CONTEXT.session_kind === "passage" ||
      params.get("passage_attempt_id")
    ) {
      return (
        SECTION_REVIEW_URL +
        "?passage_attempt_id=" +
        encodeURIComponent(String(sessionId)) +
        "&passage_id=" +
        encodeURIComponent(String(passageId))
      );
    }
    return (
      SECTION_REVIEW_URL +
      "?attempt_id=" +
      encodeURIComponent(String(sessionId)) +
      "&passage_id=" +
      encodeURIComponent(String(passageId))
    );
  }

  function wireSectionReviewReturnShortcut() {
    document.addEventListener("keydown", function (event) {
      if (!event.altKey) return;
      if (String(event.key || "").toLowerCase() !== "w") return;
      if (!isSectionReviewReturnMode()) return;
      event.preventDefault();
      var returnUrl = getSectionReviewReturnUrl();
      if (returnUrl) window.location.href = returnUrl;
    });
  }

  function startCountdown(initialSeconds) {
    if (COUNTDOWN_INTERVAL_ID) {
      clearInterval(COUNTDOWN_INTERVAL_ID);
      COUNTDOWN_INTERVAL_ID = null;
    }

    setTimerText(initialSeconds);
    CURRENT_TEST_CONTEXT.remaining_seconds = Number(initialSeconds || 0);
    persistTimerSnapshot();
    if (isExamTimerPaused()) return;

    var remaining = Number(initialSeconds || 0);
    COUNTDOWN_INTERVAL_ID = setInterval(function () {
      remaining = Math.max(remaining - 1, 0);
      CURRENT_TEST_CONTEXT.remaining_seconds = remaining;
      setTimerText(remaining);
      persistTimerSnapshot();
      if (remaining === 0) {
        clearInterval(COUNTDOWN_INTERVAL_ID);
        COUNTDOWN_INTERVAL_ID = null;
      }
    }, 1000);
  }

  async function postToFunction(url, body) {
    var res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    var data = await res.json();
    if (!res.ok) {
      throw new Error((data && data.error) || "Request failed");
    }
    return data;
  }

  async function loadAttemptHeaderStats() {
    var userId = getPortalUserId();
    if (!userId) return;

    var activeAttempt = await postToFunction(
      ACTIVE_ATTEMPT_FUNCTION_URL,
      withSessionPayload({ user_id: userId }),
    );

    if (!activeAttempt || !activeAttempt.has_active_attempt) {
      setTimerText(0);
      return;
    }

    if (
      activeAttempt.session_kind === "passage" ||
      activeAttempt.passage_attempt_id
    ) {
      CURRENT_TEST_CONTEXT.session_kind = "passage";
      CURRENT_TEST_CONTEXT.passage_attempt_id =
        activeAttempt.passage_attempt_id || null;
      CURRENT_TEST_CONTEXT.attempt_id = null;
    } else {
      CURRENT_TEST_CONTEXT.session_kind = "test";
      CURRENT_TEST_CONTEXT.attempt_id = activeAttempt.attempt_id || null;
      CURRENT_TEST_CONTEXT.passage_attempt_id = null;
    }
    CURRENT_TEST_CONTEXT.remaining_seconds = Number(
      activeAttempt.remaining_seconds || 0,
    );

    var localTimer = loadTimerSnapshot();
    if (
      localTimer &&
      localTimer.attempt_id &&
      localTimer.attempt_id === getContextSessionId()
    ) {
      var localRemaining = Number(localTimer.remaining_seconds || 0);
      if (localRemaining > 0) {
        CURRENT_TEST_CONTEXT.remaining_seconds = Math.min(
          CURRENT_TEST_CONTEXT.remaining_seconds || localRemaining,
          localRemaining,
        );
      }
    }

    // Pause is only used while browsing section review; always resume here so
    // the countdown runs even if the return URL omitted section_review=1.
    setExamTimerPaused(false);
    startCountdown(CURRENT_TEST_CONTEXT.remaining_seconds);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getChoiceEntries(choices) {
    var keys = Object.keys(choices || {});
    keys.sort(function (a, b) {
      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    return keys.map(function (key) {
      return { key: key, text: choices[key] };
    });
  }

  function ensureRadioInput(answerNode) {
    var input = answerNode.querySelector(
      'input[type="radio"].aamc-radio-input',
    );
    if (input) return input;

    input = document.createElement("input");
    input.type = "radio";
    input.className = "aamc-radio-input";
    input.name = "active-question-choice";
    input.style.position = "absolute";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    input.setAttribute("aria-hidden", "true");
    answerNode.appendChild(input);
    return input;
  }

  function persistSelectedChoice(questionId, choiceKey) {
    if (!questionId) return;
    var payload = {
      question_id: questionId,
      selected_choice: choiceKey,
      selected_at: new Date().toISOString(),
    };
    localStorage.setItem(ACTIVE_QUESTION_STATE_KEY, JSON.stringify(payload));
    window.activeQuestionSelection = payload;
  }

  function applyChoiceSelection(container, selectedKey, questionId) {
    var answers = Array.from(container.querySelectorAll(".aamc-answer"));
    answers.forEach(function (answer) {
      var key = answer.getAttribute("data-choice-key");
      var radio = answer.querySelector(".aamc-radio");
      var input = ensureRadioInput(answer);
      var isSelected = key === selectedKey;

      answer.classList.toggle("selected", isSelected);
      if (radio) radio.classList.toggle("selected", isSelected);
      input.checked = isSelected;
    });

    if (selectedKey) {
      persistSelectedChoice(questionId, selectedKey);

      if (questionId && getContextSessionId()) {
        var map = getAttemptAnswerMap();
        var previous =
          map[questionId] &&
          map[questionId].attempt_id === getContextSessionId()
            ? map[questionId].selected_choice
            : null;

        map[questionId] = {
          attempt_id: getContextSessionId(),
          selected_choice: selectedKey,
          selected_at: new Date().toISOString(),
        };
        setAttemptAnswerMap(map);

        updateActiveContentAnswerState(questionId, selectedKey);
        updateQuestionProgressFromContent(window.activeTestContent);
        renderNavigationItems(window.activeTestContent);
        persistAnswerToServer(questionId, selectedKey);

        if (previous !== selectedKey) {
          var events = getAttemptAnswerEvents();
          events.push({
            attempt_id: getContextSessionId(),
            question_id: questionId,
            previous_choice: previous,
            new_choice: selectedKey,
            changed_at: new Date().toISOString(),
          });
          setAttemptAnswerEvents(events);
        }
      }
    }
  }

  function renderStyledChoices(choices, selectedChoice, questionId) {
    var container = document.querySelector("[data-question-choices]");
    if (!container) return;

    var entries = getChoiceEntries(choices);
    if (entries.length === 0) return;

    var answerNodes = Array.from(container.querySelectorAll(".aamc-answer"));
    if (answerNodes.length === 0) {
      container.innerHTML =
        '<div class="aamc-answer">' +
        '  <div class="aamc-radio"></div>' +
        '  <div class="aamc-answer-text"><span class="aamc-label">A.</span> Option text</div>' +
        "</div>";
      answerNodes = Array.from(container.querySelectorAll(".aamc-answer"));
    }

    var template = answerNodes[0];

    while (answerNodes.length < entries.length) {
      var clone = template.cloneNode(true);
      clone.classList.remove("selected");
      container.appendChild(clone);
      answerNodes.push(clone);
    }

    answerNodes.forEach(function (node, idx) {
      var item = entries[idx];
      if (!item) {
        node.style.display = "none";
        return;
      }

      node.style.display = "";
      node.setAttribute("data-choice-key", item.key);

      var labelSpan = node.querySelector(".aamc-label");
      if (labelSpan) {
        var labelHost = labelSpan.parentElement || node;
        labelHost.innerHTML =
          '<span class="aamc-label">' +
          escapeHtml(item.key) +
          ".</span> " +
          escapeHtml(item.text);
      }

      var input = ensureRadioInput(node);
      input.value = item.key;
      input.name = "active-question-choice-" + (questionId || "unknown");
      input.setAttribute("data-choice-key", item.key);

      node.onclick = function () {
        applyChoiceSelection(container, item.key, questionId);
      };
    });

    applyChoiceSelection(container, selectedChoice || null, questionId);
  }

  function getQuestionNumberFromUrl() {
    var params = new URLSearchParams(window.location.search || "");
    var raw = params.get("question_number");
    if (!raw) return null;
    var parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  async function loadActiveTestContent(forcedQuestionNumber) {
    var userId = getPortalUserId();
    if (!userId) return;

    flushOpenQuestionDwellSegment();
    wireQuestionDwellLifecycle();

    var payload = { user_id: userId };
    var questionNumber = forcedQuestionNumber || getQuestionNumberFromUrl();
    if (questionNumber) payload.question_number = questionNumber;

    var content = await postToFunction(
      ACTIVE_TEST_CONTENT_FUNCTION_URL,
      withSessionPayload(payload),
    );

    if (!content || !content.current_passage || !content.current_question)
      return;

    applySessionFromContent(content);
    syncAttemptAnswersFromContent(content);
    content = mergeLocalAttemptAnswersIntoContent(content);

    var contentSessionId = getContentSessionId(content);
    ensureAllowedSectionPosition(contentSessionId);
    var allowedPosition = getAllowedSectionPosition(contentSessionId);
    if (content.current_passage.position > allowedPosition) {
      var firstAllowedQuestion = getFirstQuestionNumberForPassagePosition(
        content,
        allowedPosition,
      );
      if (
        firstAllowedQuestion &&
        firstAllowedQuestion !== content.current_question_number
      ) {
        return loadActiveTestContent(firstAllowedQuestion);
      }
    }

    setText(
      "[data-passage-meta]",
      "Passage " +
        content.current_passage.position +
        " of " +
        content.current_passage.total_passages +
        " • Questions " +
        content.current_passage.questions_range_start +
        "-" +
        content.current_passage.questions_range_end,
    );
    setText(
      "[data-question-number]",
      "Question " + content.current_question_number,
    );

    setText("[data-passage-title]", content.current_passage.title || "");
    applySessionFromContent(content);
    CURRENT_TEST_CONTEXT.passage_id = content.current_passage.id || null;
    renderPassageBody(content.current_passage);
    renderPassageAttribution(content.current_passage);
    setText("[data-question-stem]", content.current_question.stem || "");

    renderStyledChoices(
      content.current_question.choices || {},
      content.current_question.selected_choice,
      content.current_question.id,
    );
    markQuestionSeen(content.current_question.id);
    CURRENT_TEST_CONTEXT.current_question_number =
      content.current_question_number;
    updateUrlQuestionNumber(content.current_question_number);
    window.activeTestContent = content;
    renderNavigationItems(content);

    CURRENT_TEST_CONTEXT.question_id = content.current_question.id || null;
    CURRENT_TEST_CONTEXT.is_flagged = Boolean(
      content.current_question.is_flagged,
    );
    startQuestionDwellSession(
      getContentSessionId(content),
      content.current_question.id || null,
    );
    CURRENT_TEST_CONTEXT.total_questions = Number(content.total_questions || 0);
    CURRENT_TEST_CONTEXT.current_question_number = Number(
      content.current_question_number || 1,
    );
    updateQuestionProgressFromContent(content);
    updateNextButtonLabel();
    setSectionReviewChrome();
    renderFlagButtonState();
    wireFlagButton();

    wireTextFormattingToolbar();
    wirePrevNextNavigation();
  }

  function applyUserToScreen() {
    var user = getPortalUser();
    var initials = getInitials(user);
    var fullName = getFullName(user);

    // Avatar initials targets
    setText("[data-user-initials]", initials);
    setText("[avatar-initials]", initials);

    // Full name targets
    setText("[data-user-full-name]", fullName);
    setText("[full-name]", fullName);
  }

  document.addEventListener("DOMContentLoaded", function () {
    showInitLoader();
    seedPassageSessionFromUrl();
    applyUserToScreen();
    wireNavigationModal();
    wireSectionReviewReturnShortcut();
    Promise.resolve()
      .then(function () {
        return loadActiveTestContent();
      })
      .then(function () {
        return loadAttemptHeaderStats();
      })
      .catch(function (err) {
        console.error("Active test screen init error:", err);
      })
      .finally(function () {
        hideInitLoader();
      });
  });
})();
