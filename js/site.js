(function () {
  var script = document.currentScript;
  var rootUrl = new URL("../", (script && script.src) || (location.origin + "/js/site.js"));
  var STORAGE_KEY = "hsd-practice-plan";
  var ANON_KEY = "hsd-anon-id";
  var EXCLUDE_KEY = "hsd-exclude-stats";
  var IMPORT_KEY = "hsd-import-offered";
  var accountState = { ready: false, enabled: false, google: false, email: false, user: null };
  var accountReady = [];

  var WHEN_KEY = "hsd-plan-when";

  function emptyPlan() {
    return { title: "", notes: "", date: "", start: "", savedId: "", teamId: "", items: [] };
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    var parts = value.split("-");
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    if (y < 2000 || y > 2100) return "";
    var dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return "";
    return value;
  }

  function validTime(value) {
    if (typeof value !== "string") return "";
    var match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
    if (!match) return "";
    var h = Number(match[1]);
    var min = Number(match[2]);
    if (h > 23 || min > 59) return "";
    return (h < 10 ? "0" : "") + h + ":" + (min < 10 ? "0" : "") + min;
  }

  function rememberWhen(plan) {
    if (!plan || !plan.savedId) return;
    try {
      var all = JSON.parse(localStorage.getItem(WHEN_KEY) || "{}");
      if (!all || typeof all !== "object" || Array.isArray(all)) all = {};
      all[plan.savedId] = { date: plan.date || "", start: plan.start || "" };
      localStorage.setItem(WHEN_KEY, JSON.stringify(all));
    } catch (error) {
      return;
    }
  }

  function recallWhen(savedId) {
    if (!savedId) return { date: "", start: "" };
    try {
      var all = JSON.parse(localStorage.getItem(WHEN_KEY) || "{}");
      var row = all && all[savedId];
      if (!row || typeof row !== "object") return { date: "", start: "" };
      return { date: validDate(row.date), start: validTime(row.start) };
    } catch (error) {
      return { date: "", start: "" };
    }
  }

  function normalizeMinutes(value) {
    if (value === null || value === undefined) return "";
    var text = String(value).trim();
    if (!text) return "";
    var n = Number(text);
    if (!isFinite(n) || n < 0) return "";
    return Math.min(180, Math.round(n));
  }

  function sanitize(data, bySlug) {
    var source = data && Array.isArray(data.items) ? data.items : [];
    var seen = {};
    var items = [];
    source.forEach(function (item) {
      if (!item || typeof item.slug !== "string" || seen[item.slug]) return;
      if (bySlug && !bySlug[item.slug]) return;
      seen[item.slug] = true;
      var note = typeof item.note === "string" ? item.note.slice(0, 140) : "";
      items.push({
        slug: item.slug,
        minutes: normalizeMinutes(item.minutes),
        note: note
      });
    });
    var title = data && typeof data.title === "string" ? data.title.slice(0, 80) : "";
    var notes = data && typeof data.notes === "string" ? data.notes.slice(0, 2000) : "";
    var savedId = "";
    if (data && typeof data.savedId === "string" && /^[0-9a-f-]{36}$/i.test(data.savedId)) {
      savedId = data.savedId;
    }
    var teamId = "";
    if (data && typeof data.teamId === "string" && /^[a-z0-9-]{1,32}$/.test(data.teamId)) teamId = data.teamId;
    return {
      title: title,
      notes: notes,
      date: validDate(data && data.date),
      start: validTime(data && data.start),
      savedId: savedId,
      teamId: teamId,
      items: items
    };
  }

  function readPlan() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyPlan();
      return sanitize(JSON.parse(raw), null);
    } catch (error) {
      return emptyPlan();
    }
  }

  function savePlan(plan) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        title: plan.title || "",
        notes: plan.notes || "",
        date: plan.date || "",
        start: plan.start || "",
        savedId: plan.savedId || "",
        teamId: plan.teamId || "",
        items: plan.items || []
      }));
      rememberWhen(plan);
      return true;
    } catch (error) {
      return false;
    }
  }

  function syncToggles(source) {
    var current = source || readPlan();
    var slugs = {};
    current.items.forEach(function (item) {
      slugs[item.slug] = true;
    });
    document.querySelectorAll("[data-plan-slug]").forEach(function (button) {
      var slug = button.getAttribute("data-plan-slug");
      var title = button.getAttribute("data-plan-title") || "this drill";
      var on = !!slugs[slug];
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.textContent = on ? "In plan \u2713" : "Add to plan";
      button.setAttribute(
        "aria-label",
        on ? "Remove " + title + " from plan" : "Add " + title + " to plan"
      );
    });
    var count = "(" + current.items.length + ")";
    document.querySelectorAll("[data-plan-count]").forEach(function (node) {
      node.textContent = count;
    });
    var path = window.location.pathname;
    if (/\/plan\/(index\.html)?$/.test(path) || /\/plan$/.test(path)) {
      document.querySelectorAll(".plan-nav").forEach(function (link) {
        link.setAttribute("aria-current", "page");
      });
    }
  }

  function toggleSlug(slug) {
    var current = readPlan();
    var index = -1;
    current.items.forEach(function (item, i) {
      if (item.slug === slug) index = i;
    });
    if (index === -1) current.items.push({ slug: slug, minutes: "", note: "" });
    else current.items.splice(index, 1);
    if (!savePlan(current)) return;
    syncToggles(current);
    if (index === -1) track("drill_add_to_plan", { drill: slug });
  }

  // Usage counts for the private stats page. A random browser ID only: no
  // cookies, names, or emails. Sent only where the site's API is running.
  var anonCache = "";

  function anonId() {
    if (anonCache) return anonCache;
    var id = "";
    try {
      id = localStorage.getItem(ANON_KEY) || "";
    } catch (error) {
      id = "";
    }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      id = randomId();
      try {
        localStorage.setItem(ANON_KEY, id);
      } catch (error) {
        // Private mode: this page view still counts with a one-off ID.
      }
    }
    anonCache = id;
    return id;
  }

  function randomId() {
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    var out = "";
    for (var j = 0; j < bytes.length; j += 1) out += (bytes[j] < 16 ? "0" : "") + bytes[j].toString(16);
    return out;
  }

  function statsExcluded(state) {
    // The server marks only the admin's own session with user.admin. From then
    // on this browser sends no usage beacons and skips Vercel Analytics.
    if (state.user && state.user.admin === true) {
      try {
        localStorage.setItem(EXCLUDE_KEY, "1");
      } catch (error) {
        // Server-side filtering still hides this browser.
      }
      return true;
    }
    try {
      return localStorage.getItem(EXCLUDE_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function track(name, fields) {
    whenAccountReady(function (state) {
      if (!state.enabled || statsExcluded(state)) return;
      var payload = { name: name, anon: anonId() };
      Object.keys(fields || {}).forEach(function (key) {
        payload[key] = fields[key];
      });
      var body = JSON.stringify(payload);
      var url = apiUrl("api/event");
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
      } catch (error) {
        // Fall through to fetch.
      }
      try {
        fetch(url, { method: "POST", body: body, credentials: "same-origin", keepalive: true }).catch(function () {});
      } catch (error) {
        return;
      }
    });
  }

  function trackPageView() {
    var page = document.body ? document.body.getAttribute("data-page") || "other" : "other";
    // Team pages stay quiet: no roster or lineup details in the usage log.
    if (page === "lineups") return;
    var drill = document.body ? document.body.getAttribute("data-drill") : "";
    if (page === "drill" && drill) track("drill_view", { drill: drill });
    else if (page !== "practice") track("page_view", { page: page });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-plan-slug]");
    if (!button) return;
    toggleSlug(button.getAttribute("data-plan-slug"));
  });

  var refreshPlan = null;
  var firstShow = true;
  syncToggles(readPlan());
  window.addEventListener("pageshow", function () {
    if (firstShow) {
      firstShow = false;
      return;
    }
    if (refreshPlan) refreshPlan();
    else syncToggles(readPlan());
  });

  function fitAnim(frame) {
    var doc;
    try {
      doc = frame.contentDocument;
    } catch (error) {
      return;
    }
    if (!doc || !doc.documentElement) return;
    var target = doc.querySelector("main") || doc.body || doc.documentElement;
    var box = target.getBoundingClientRect();
    var needed = Math.ceil(box.bottom);
    if (needed > 0 && Math.abs(needed - frame.clientHeight) > 1) {
      frame.style.height = needed + "px";
    }
  }

  function fitAfterLayout(frame) {
    frame.style.height = "";
    window.requestAnimationFrame(function () {
      fitAnim(frame);
      window.requestAnimationFrame(function () {
        fitAnim(frame);
      });
    });
  }

  function watchAnim(frame) {
    if (!frame || frame.getAttribute("data-anim-watch")) return;
    frame.setAttribute("data-anim-watch", "1");
    frame.addEventListener("load", function () {
      var media = frame.closest(".practice-media");
      if (media) {
        var loaded = null;
        try {
          loaded = frame.contentDocument;
        } catch (error) {
          loaded = null;
        }
        if (!loaded || !loaded.querySelector(".drill")) {
          media.classList.add("is-fallback");
          return;
        }
        media.classList.add("is-live");
      }
      fitAfterLayout(frame);
      try {
        var fonts = frame.contentDocument.fonts;
        if (fonts && fonts.ready) {
          fonts.ready.then(function () {
            fitAfterLayout(frame);
          });
        }
      } catch (error) {
        return;
      }
    });
    frame.addEventListener("error", function () {
      var media = frame.closest(".practice-media");
      if (media) media.classList.add("is-fallback");
    });
  }

  document.querySelectorAll(".drill-anim").forEach(watchAnim);
  window.addEventListener("resize", function () {
    document.querySelectorAll(".drill-anim").forEach(fitAfterLayout);
  });

  var buttons = document.querySelectorAll("[data-filter]");
  if (buttons.length) {
    var cards = document.querySelectorAll(".card");
    var empty = document.getElementById("empty-filter");
    var count = document.getElementById("drill-count");

    function apply(tag) {
      var shown = 0;
      cards.forEach(function (card) {
        var tags = (card.getAttribute("data-tags") || "").split(/\s+/);
        var visible = tag === "all" || tags.indexOf(tag) !== -1;
        card.hidden = !visible;
        if (visible) shown += 1;
      });
      if (empty) empty.hidden = shown !== 0;
      if (count) {
        count.textContent = shown + (shown === 1 ? " drill" : " drills");
      }
      buttons.forEach(function (button) {
        var pressed = button.getAttribute("data-filter") === tag;
        button.setAttribute("aria-pressed", pressed ? "true" : "false");
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        apply(button.getAttribute("data-filter"));
      });
    });
  }

  // Menu first, and each feature isolated, so one failure (e.g. storage
  // blocked in an in-app browser) can never hide the phone menu.
  [initMobileMenu, initPlanPage, initPracticePage, initPlansPage, initAccountPage, initAccounts, trackPageView].forEach(function (fn) {
    try { fn(); } catch (error) { if (window.console) console.error(error); }
  });

  function initPlanPage() {
    var catalogNode = document.getElementById("drill-catalog");
    var list = document.getElementById("plan-list");
    if (!catalogNode || !list) return;

    var catalog = [];
    try {
      catalog = JSON.parse(catalogNode.textContent);
    } catch (error) {
      catalog = [];
    }
    var bySlug = {};
    catalog.forEach(function (drill) {
      bySlug[drill.slug] = drill;
    });

    var page = document.querySelector(".plan-page");
    var banner = document.getElementById("plan-shared");
    var bannerText = document.getElementById("plan-shared-text");
    var loadBtn = document.getElementById("plan-load");
    var titleInput = document.getElementById("plan-title");
    var dateInput = document.getElementById("plan-date");
    var startInput = document.getElementById("plan-start");
    var practiceLink = document.getElementById("plan-practice");
    var sharedPracticeLink = document.getElementById("plan-shared-practice");
    var printTitle = document.getElementById("plan-print-title");
    var shareBtn = document.getElementById("plan-share");
    var printBtn = document.getElementById("plan-print");
    var clearBtn = document.getElementById("plan-clear");
    var status = document.getElementById("plan-status");
    var fallback = document.getElementById("plan-share-fallback");
    var total = document.getElementById("plan-total");
    var emptyEdit = document.getElementById("plan-empty");
    var emptyShared = document.getElementById("plan-shared-empty");
    var notesInput = document.getElementById("plan-notes");
    var printNotes = document.getElementById("plan-print-notes");
    var saveBox = document.getElementById("plan-save");
    var saveBtn = document.getElementById("plan-save-btn");
    var saveNewBtn = document.getElementById("plan-save-new");
    var signinBanner = document.getElementById("plan-signin");
    var signinText = document.getElementById("plan-signin-text");
    var signinLink = document.getElementById("plan-signin-link");
    var importBanner = document.getElementById("plan-import");
    var importYes = document.getElementById("plan-import-yes");
    var importNo = document.getElementById("plan-import-no");
    var accountStateLine = document.getElementById("plan-account-state");

    var shared = false;
    var skipped = 0;
    var plan = emptyPlan();
    var params = new URLSearchParams(window.location.search);

    if (params.has("d")) {
      var parsed = parseShare(params, bySlug);
      shared = true;
      skipped = parsed.skipped;
      plan = parsed.plan;
    } else {
      plan = sanitize(readPlan(), bySlug);
      savePlan(plan);
    }

    function findItem(slug) {
      for (var i = 0; i < plan.items.length; i += 1) {
        if (plan.items[i].slug === slug) return plan.items[i];
      }
      return null;
    }

    function indexOf(slug) {
      for (var i = 0; i < plan.items.length; i += 1) {
        if (plan.items[i].slug === slug) return i;
      }
      return -1;
    }

    function updateSummary() {
      var n = plan.items.length;
      var minutes = 0;
      plan.items.forEach(function (item) {
        if (item.minutes !== "") minutes += item.minutes;
      });
      total.hidden = n === 0;
      var drills = n === 1 ? "1 drill" : n + " drills";
      total.textContent = drills + " \u00b7 " + minutes + " min";
      printTitle.textContent = plan.title.trim();
      if (printNotes) printNotes.textContent = (plan.notes || "").trim();
      syncPracticeLinks();
    }

    function syncPracticeLinks() {
      var href = plan.items.length ? buildPracticeUrl(plan) : new URL("practice/", rootUrl).href;
      if (practiceLink) practiceLink.href = href;
      if (sharedPracticeLink) sharedPracticeLink.href = href;
    }

    function blockEmptyPractice(event) {
      if (plan.items.length) return;
      event.preventDefault();
      status.textContent = "Add a drill before opening the practice page.";
    }

    function applyChrome() {
      page.classList.toggle("is-shared", shared);
      banner.hidden = !shared;
      clearBtn.hidden = shared;
      titleInput.readOnly = shared;
      if (document.activeElement !== titleInput) titleInput.value = plan.title;
      titleInput.placeholder = shared ? "" : "Tuesday practice";
      if (dateInput && document.activeElement !== dateInput) dateInput.value = plan.date || "";
      var teamSelect = document.getElementById("plan-team");
      if (teamSelect && document.activeElement !== teamSelect && plan.teamId) {
        var hasTeam = false;
        for (var ti = 0; ti < teamSelect.options.length; ti += 1) {
          if (teamSelect.options[ti].value === plan.teamId) hasTeam = true;
        }
        if (hasTeam) teamSelect.value = plan.teamId;
      }
      if (startInput && document.activeElement !== startInput) startInput.value = plan.start || "";
      if (dateInput) dateInput.readOnly = shared;
      if (startInput) startInput.readOnly = shared;
      if (notesInput) {
        notesInput.readOnly = shared;
        if (document.activeElement !== notesInput) notesInput.value = plan.notes || "";
      }
      updateAccountChrome();
      if (shared) {
        var message;
        if (!plan.items.length) {
          message = skipped
            ? skipped + " unknown drill" + (skipped === 1 ? " was" : "s were") + " skipped."
            : "This link did not match any drills in the library.";
        } else if (skipped) {
          message = "This is a shared plan. " + skipped + " unknown drill" +
            (skipped === 1 ? " was" : "s were") +
            " skipped. It is not saved in this browser yet.";
        } else {
          message = "This is a shared plan. It is not saved in this browser yet.";
        }
        bannerText.textContent = message;
        loadBtn.hidden = plan.items.length === 0;
      }
      emptyEdit.hidden = shared || plan.items.length > 0;
      emptyShared.hidden = !shared || plan.items.length > 0;
      updateSummary();
      syncToggles(shared ? readPlan() : plan);
    }

    function render() {
      list.textContent = "";
      plan.items.forEach(function (item, index) {
        var drill = bySlug[item.slug];
        if (!drill) return;
        list.appendChild(renderItem(item, drill, index));
      });
      applyChrome();
    }

    function renderItem(item, drill, index) {
      var li = el("li", "plan-item");
      li.setAttribute("data-slug", item.slug);

      var thumb = el("a", "plan-thumb");
      thumb.href = drill.page;
      var img = document.createElement("img");
      img.src = drill.png;
      img.alt = drill.alt || "";
      thumb.appendChild(img);

      var body = el("div", "plan-item-body");
      if (drill.series) body.appendChild(el("p", "series", drill.series));

      var heading = el("h2");
      heading.appendChild(el("span", "plan-index", String(index + 1)));
      var titleLink = document.createElement("a");
      titleLink.href = drill.page;
      titleLink.textContent = drill.title;
      heading.appendChild(titleLink);
      body.appendChild(heading);

      var tags = el("ul", "tag-row");
      (drill.tags || []).forEach(function (label) {
        var tagItem = el("li");
        tagItem.appendChild(el("span", "tag", label));
        tags.appendChild(tagItem);
      });
      body.appendChild(tags);

      if (!shared) {
        var fields = el("div", "plan-fields");
        fields.appendChild(minutesField(item, drill));
        fields.appendChild(noteField(item, drill));
        body.appendChild(fields);

        var actions = el("div", "plan-item-actions");
        var up = actionButton("Up", "Move " + drill.title + " up");
        up.setAttribute("data-move", "up");
        up.disabled = index === 0;
        var down = actionButton("Down", "Move " + drill.title + " down");
        down.setAttribute("data-move", "down");
        down.disabled = index === plan.items.length - 1;
        var remove = actionButton("Remove", "Remove " + drill.title, "btn danger");
        remove.setAttribute("data-remove", "");
        actions.appendChild(up);
        actions.appendChild(down);
        actions.appendChild(remove);
        body.appendChild(actions);
      }

      var meta = el("p", "plan-print-meta");
      if (item.minutes !== "") meta.textContent = item.minutes + " min";
      body.appendChild(meta);

      var notePrint = el("p", "plan-print-note");
      if (item.note.trim()) notePrint.textContent = item.note.trim();
      body.appendChild(notePrint);

      if (drill.points && drill.points.length) {
        body.appendChild(el("h3", "plan-points-heading", "Coaching points"));
        var points = el("ul", "points plan-points");
        drill.points.forEach(function (point) {
          points.appendChild(el("li", "", point));
        });
        body.appendChild(points);
      }

      li.appendChild(thumb);
      li.appendChild(body);
      return li;
    }

    function minutesField(item, drill) {
      var label = document.createElement("label");
      label.appendChild(document.createTextNode("Minutes"));
      var input = document.createElement("input");
      input.className = "plan-minutes-input";
      input.type = "number";
      input.min = "0";
      input.max = "180";
      input.step = "1";
      input.inputMode = "numeric";
      input.value = item.minutes === "" ? "" : String(item.minutes);
      input.setAttribute("aria-label", "Minutes for " + drill.title);
      label.appendChild(input);
      return label;
    }

    function noteField(item, drill) {
      var label = document.createElement("label");
      label.appendChild(document.createTextNode("Note"));
      var input = document.createElement("input");
      input.className = "plan-note-input";
      input.type = "text";
      input.maxLength = 140;
      input.placeholder = "Optional";
      input.autocomplete = "off";
      input.value = item.note;
      input.setAttribute("aria-label", "Note for " + drill.title);
      label.appendChild(input);
      return label;
    }

    function actionButton(label, aria, className) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = className || "btn";
      button.textContent = label;
      button.setAttribute("aria-label", aria);
      return button;
    }

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null) node.textContent = text;
      return node;
    }

    list.addEventListener("click", function (event) {
      if (shared) return;
      var button = event.target.closest("button");
      if (!button || !list.contains(button)) return;
      var row = button.closest(".plan-item");
      if (!row) return;
      var index = indexOf(row.getAttribute("data-slug"));
      if (index < 0) return;
      if (button.hasAttribute("data-remove")) {
        plan.items.splice(index, 1);
        savePlan(plan);
        render();
        var rows = list.querySelectorAll(".plan-item");
        var focusIndex = Math.min(index, rows.length - 1);
        if (focusIndex >= 0) {
          var next = rows[focusIndex].querySelector("[data-remove]");
          if (next) next.focus();
        }
        status.textContent = "Removed from the plan.";
      } else if (button.getAttribute("data-move")) {
        var delta = button.getAttribute("data-move") === "up" ? -1 : 1;
        var nextIndex = index + delta;
        if (nextIndex < 0 || nextIndex >= plan.items.length) return;
        var moved = plan.items[index];
        plan.items.splice(index, 1);
        plan.items.splice(nextIndex, 0, moved);
        savePlan(plan);
        render();
        var movedRow = list.querySelector('[data-slug="' + moved.slug + '"]');
        var focus = movedRow && movedRow.querySelector('[data-move="' + button.getAttribute("data-move") + '"]');
        if (focus) focus.focus();
      }
    });

    list.addEventListener("input", function (event) {
      if (shared) return;
      var row = event.target.closest(".plan-item");
      if (!row) return;
      var item = findItem(row.getAttribute("data-slug"));
      if (!item) return;
      if (event.target.classList.contains("plan-minutes-input")) {
        item.minutes = normalizeMinutes(event.target.value);
        var meta = row.querySelector(".plan-print-meta");
        if (meta) meta.textContent = item.minutes === "" ? "" : item.minutes + " min";
        savePlan(plan);
        updateSummary();
      } else if (event.target.classList.contains("plan-note-input")) {
        item.note = event.target.value.slice(0, 140);
        var notePrint = row.querySelector(".plan-print-note");
        if (notePrint) notePrint.textContent = item.note.trim();
        savePlan(plan);
        syncPracticeLinks();
      }
    });

    list.addEventListener("change", function (event) {
      if (shared || !event.target.classList.contains("plan-minutes-input")) return;
      var row = event.target.closest(".plan-item");
      if (!row) return;
      var item = findItem(row.getAttribute("data-slug"));
      if (!item) return;
      item.minutes = normalizeMinutes(event.target.value);
      event.target.value = item.minutes === "" ? "" : String(item.minutes);
      var meta = row.querySelector(".plan-print-meta");
      if (meta) meta.textContent = item.minutes === "" ? "" : item.minutes + " min";
      savePlan(plan);
      updateSummary();
    });

    titleInput.addEventListener("input", function () {
      if (shared) return;
      plan.title = titleInput.value.slice(0, 80);
      savePlan(plan);
      printTitle.textContent = plan.title.trim();
      syncPracticeLinks();
    });

    shareBtn.addEventListener("click", function () {
      if (!plan.items.length) {
        status.textContent = "Add a drill before sharing.";
        fallback.hidden = true;
        return;
      }
      var url = buildPracticeUrl(plan);
      track("plan_share", { drills: plan.items.length });
      copyText(url).then(function () {
        fallback.hidden = true;
        status.textContent = "Share link copied. Open the practice page for the QR code.";
      }, function () {
        status.textContent = "Select the link below to copy it.";
        fallback.hidden = false;
        fallback.value = url;
        fallback.focus();
        fallback.select();
      });
    });

    printBtn.addEventListener("click", function () {
      track("plan_print", { drills: plan.items.length });
      window.print();
    });

    clearBtn.addEventListener("click", function () {
      if (shared) return;
      if (!plan.items.length && !plan.title.trim() && !(plan.notes || "").trim() && !plan.date && !plan.start) {
        status.textContent = "The plan is already empty.";
        return;
      }
      if (!window.confirm("Clear this practice plan?")) return;
      plan = emptyPlan();
      savePlan(plan);
      titleInput.value = "";
      if (dateInput) dateInput.value = "";
      if (startInput) startInput.value = "";
      if (notesInput) notesInput.value = "";
      status.textContent = "Plan cleared.";
      fallback.hidden = true;
      render();
    });

    refreshPlan = function () {
      if (shared) {
        syncToggles(readPlan());
        return;
      }
      plan = sanitize(readPlan(), bySlug);
      render();
    };

    loadBtn.addEventListener("click", function () {
      if (!shared || !plan.items.length) return;
      var existing = readPlan();
      var hasExisting = existing.items.length > 0 || existing.title.trim() || (existing.notes || "").trim() || existing.date || existing.start;
      if (hasExisting && !window.confirm("Replace your saved practice plan with this one?")) return;
      var loaded = {
        title: plan.title,
        notes: plan.notes || "",
        date: plan.date || "",
        start: plan.start || "",
        savedId: "",
        items: plan.items.map(function (item) {
          return { slug: item.slug, minutes: item.minutes, note: item.note };
        })
      };
      if (!savePlan(loaded)) {
        status.textContent = "Could not save the plan in this browser.";
        return;
      }
      plan = loaded;
      shared = false;
      skipped = 0;
      var clean = window.location.pathname.replace(/\/index\.html$/, "/");
      history.replaceState(null, "", clean);
      status.textContent = "Saved in this browser. You can edit this copy.";
      fallback.hidden = true;
      render();
      maybeOfferImport();
    });

    if (notesInput) {
      notesInput.addEventListener("input", function () {
        if (shared) return;
        plan.notes = notesInput.value.slice(0, 2000);
        savePlan(plan);
        if (printNotes) printNotes.textContent = plan.notes.trim();
        updateAccountChrome();
        syncPracticeLinks();
      });
    }

    if (dateInput) {
      dateInput.addEventListener("change", function () {
        if (shared) return;
        plan.date = validDate(dateInput.value);
        dateInput.value = plan.date;
        savePlan(plan);
        syncPracticeLinks();
      });
    }

    if (startInput) {
      startInput.addEventListener("change", function () {
        if (shared) return;
        plan.start = validTime(startInput.value);
        startInput.value = plan.start;
        savePlan(plan);
        syncPracticeLinks();
      });
    }

    if (practiceLink) practiceLink.addEventListener("click", blockEmptyPractice);
    if (sharedPracticeLink) sharedPracticeLink.addEventListener("click", blockEmptyPractice);

    titleInput.addEventListener("input", function () {
      updateAccountChrome();
    });

    if (saveBtn) saveBtn.addEventListener("click", function () { saveCurrent(false); });
    if (saveNewBtn) saveNewBtn.addEventListener("click", function () { saveCurrent(true); });
    if (importYes) importYes.addEventListener("click", function () { importLocalPlan(importBanner); });
    if (importNo) importNo.addEventListener("click", function () { dismissImport(importBanner); });

    var teamSelect = document.getElementById("plan-team");
    if (teamSelect) {
      teamSelect.addEventListener("change", function () {
        if (shared) return;
        plan.teamId = /^[a-z0-9-]{1,32}$/.test(teamSelect.value) ? teamSelect.value : "";
        savePlan(plan);
      });
    }

    whenAccountReady(function () {
      if (signinLink) signinLink.href = signInHref();
      updateAccountChrome();
      loadTeamChoices();
      var preset = params.get("team");
      if (!shared && preset && /^[a-z0-9-]{1,32}$/.test(preset) && !params.get("saved")) {
        plan.teamId = preset;
        savePlan(plan);
      }
      var saved = params.get("saved");
      if (!shared && saved) {
        if (accountState.user) loadSavedPlan(saved);
        else promptSignIn("Sign in to open this saved plan.");
        return;
      }
      maybeOfferImport();
    });

    function updateAccountChrome() {
      var enabled = accountState.ready && accountState.enabled;
      if (saveBox) saveBox.hidden = !enabled || shared;
      if (accountStateLine) {
        accountStateLine.hidden = !enabled || shared || !accountState.user;
        if (!accountStateLine.hidden) {
          accountStateLine.textContent = plan.savedId
            ? "Saved to your account."
            : "Not saved to your account yet.";
        }
      }
      if (!enabled || shared || !accountState.user) {
        if (importBanner && importBanner.dataset.done !== "show") importBanner.hidden = true;
      }
    }

    function promptSignIn(message) {
      if (!signinBanner) return;
      if (signinText) signinText.textContent = message;
      if (signinLink) signinLink.href = signInHref();
      signinBanner.hidden = false;
    }

    function maybeOfferImport() {
      if (!importBanner || shared || !accountState.user) return;
      if (importBanner.dataset.done) return;
      var existing = readPlan();
      if (existing.savedId) return;
      if (!planWorthSaving(existing)) return;
      if (importSeen(accountState.user.id)) return;
      importBanner.hidden = false;
      importBanner.dataset.done = "show";
    }

    function loadTeamChoices() {
      var label = document.getElementById("plan-team-label");
      var select = document.getElementById("plan-team");
      var hint = document.getElementById("plan-team-hint");
      if (!label || !select || !accountState.user) {
        if (label) label.hidden = true;
        if (hint) hint.hidden = true;
        return;
      }
      fetchJson(apiUrl("api/teams")).then(function (result) {
        var teams = result.ok && result.data && Array.isArray(result.data.teams) ? result.data.teams : [];
        var current = plan.teamId || "";
        select.textContent = "";
        var personal = document.createElement("option");
        personal.value = "";
        personal.textContent = "Just me";
        select.appendChild(personal);
        teams.forEach(function (team) {
          if (!team || typeof team.id !== "string" || !/^[a-z0-9-]{1,32}$/.test(team.id)) return;
          var option = document.createElement("option");
          option.value = team.id;
          option.textContent = String(team.name || "Team").slice(0, 60);
          select.appendChild(option);
        });
        var known = false;
        for (var i = 0; i < select.options.length; i += 1) {
          if (select.options[i].value === current) known = true;
        }
        select.value = known ? current : "";
        if (!known) plan.teamId = "";
        else plan.teamId = current;
        var show = teams.length > 0;
        label.hidden = !show;
        if (hint) hint.hidden = !show;
      }, function () {
        label.hidden = true;
        if (hint) hint.hidden = true;
      });
    }

    function saveCurrent(asNew) {
      if (!accountState.enabled) return;
      if (!accountState.user) {
        promptSignIn("Sign in to save this plan to your account. The copy in this browser stays either way.");
        return;
      }
      if (!planWorthSaving(plan)) {
        status.textContent = "Add a drill, a title, or a note before saving.";
        return;
      }
      var creating = asNew || !plan.savedId;
      status.textContent = "Saving\u2026";
      var request = creating
        ? fetchJson(apiUrl("api/plans"), { method: "POST", body: JSON.stringify(planPayload(plan)) })
        : fetchJson(apiUrl("api/plans/" + plan.savedId), { method: "PATCH", body: JSON.stringify(planPayload(plan)) });
      request.then(function (result) {
        if (!creating && result.status === 404) {
          return fetchJson(apiUrl("api/plans"), {
            method: "POST",
            body: JSON.stringify(planPayload(plan))
          }).then(function (created) {
            finishSave(created, "That saved plan was missing, so this was saved as a new plan.");
          });
        }
        finishSave(result, asNew ? "Saved as a new plan." : "Saved to your account.");
      }, function () {
        status.textContent = "Could not reach your account. The copy in this browser is still here.";
      });
    }

    function finishSave(result, message) {
      if (!result.ok || !result.data.plan) {
        status.textContent = (result.data && result.data.error) || "Could not save the plan.";
        return;
      }
      plan.savedId = result.data.plan.id;
      savePlan(plan);
      status.textContent = message;
      updateAccountChrome();
    }

    function loadSavedPlan(id) {
      status.textContent = "Opening saved plan\u2026";
      fetchJson(apiUrl("api/plans/" + id)).then(function (result) {
        if (result.status === 401) {
          promptSignIn("Sign in to open this saved plan.");
          status.textContent = "";
          return;
        }
        if (!result.ok || !result.data.plan) {
          status.textContent = "That saved plan could not be opened.";
          history.replaceState(null, "", window.location.pathname);
          return;
        }
        var loaded = planFromApi(result.data.plan, bySlug);
        var existing = readPlan();
        var hasExisting = planWorthSaving(existing);
        if (hasExisting && plansDiffer(existing, loaded) && !window.confirm("Replace the plan in this browser with the saved one?")) {
          history.replaceState(null, "", window.location.pathname);
          status.textContent = "";
          return;
        }
        if (!savePlan(loaded)) {
          status.textContent = "Could not open that plan in this browser.";
          return;
        }
        plan = loaded;
        shared = false;
        history.replaceState(null, "", window.location.pathname);
        status.textContent = "Opened your saved plan.";
        fallback.hidden = true;
        render();
      }, function () {
        status.textContent = "Could not reach your account.";
      });
    }

    render();
  }

  function initPracticePage() {
    var list = document.getElementById("practice-list");
    var catalogNode = document.getElementById("drill-catalog");
    if (!list || !catalogNode) return;
    if (/\/shell\.html$/.test(window.location.pathname)) {
      var redirected = new URL(window.location.href);
      redirected.pathname = redirected.pathname.replace(/\/shell\.html$/, "/");
      window.location.replace(redirected.href);
      return;
    }

    var catalog = [];
    try {
      catalog = JSON.parse(catalogNode.textContent);
    } catch (error) {
      catalog = [];
    }
    var bySlug = {};
    catalog.forEach(function (drill) {
      bySlug[drill.slug] = drill;
    });

    var params = new URLSearchParams(window.location.search);
    var parsed = params.has("d") ? parseShare(params, bySlug) : { skipped: 0, plan: emptyPlan() };
    var plan = parsed.plan;
    var skipped = parsed.skipped;
    track("practice_view", { drills: plan.items.length });

    var titleNode = document.getElementById("practice-title");
    var summary = document.getElementById("practice-summary");
    var planNotes = document.getElementById("practice-plan-notes");
    var empty = document.getElementById("practice-empty");
    var skippedNode = document.getElementById("practice-skipped");
    var status = document.getElementById("practice-status");
    var editLink = document.getElementById("practice-edit");
    var dialog = document.getElementById("practice-qr-dialog");
    var qrMount = document.getElementById("practice-qr-code");
    var qrUrl = document.getElementById("practice-qr-url");
    var qrStatus = document.getElementById("practice-qr-status");
    var pageTitle = plan.title.trim() || "Practice";
    document.title = pageTitle + " · Hockey Skills & Drills";
    if (titleNode) titleNode.textContent = pageTitle;

    var totalMinutes = 0;
    var allTimed = plan.items.length > 0;
    plan.items.forEach(function (item) {
      if (item.minutes === "") allTimed = false;
      else totalMinutes += item.minutes;
    });
    var cursor = startMinutes(plan.start);
    var parts = [];
    var dateLabel = formatPlanDate(plan.date);
    if (dateLabel) parts.push(dateLabel);
    if (cursor !== null && allTimed) parts.push(clockLabel(cursor) + "\u2013" + clockLabel(cursor + totalMinutes));
    else if (cursor !== null) parts.push("Starts " + clockLabel(cursor));
    var drillLabel = plan.items.length === 1 ? "1 drill" : plan.items.length + " drills";
    if (plan.items.length) parts.push(drillLabel);
    if (plan.items.length) parts.push(totalMinutes + " min");
    if (summary) summary.textContent = parts.join(" \u00b7 ");
    if (planNotes) {
      var noteText = (plan.notes || "").trim();
      planNotes.hidden = !noteText;
      planNotes.textContent = noteText;
    }
    if (skipped && skippedNode && plan.items.length) {
      skippedNode.hidden = false;
      skippedNode.textContent = skipped + (skipped === 1 ? " drill in the link is not" : " drills in the link are not") + " in the library.";
    }
    if (editLink) editLink.href = plan.items.length ? buildShareUrl(plan) : new URL("plan/", rootUrl).href;
    applyPracticeSocial(plan, totalMinutes, plan.items.length ? bySlug[plan.items[0].slug] : null);

    if (!plan.items.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = params.has("d")
          ? "Nothing in this link matched a drill in the library."
          : "Build a plan, tap Share, then open the practice page.";
      }
    } else {
      plan.items.forEach(function (item, index) {
        list.appendChild(practiceCard(item, bySlug[item.slug], index));
      });
      armAnimations(list);
    }

    var pageUrl = function () { return cleanPageUrl(window.location.href); };
    var copyBtn = document.getElementById("practice-copy");
    var shareBtn = document.getElementById("practice-share");
    var qrCopy = document.getElementById("practice-qr-copy");
    var qrShare = document.getElementById("practice-qr-share");
    var canShare = !!(navigator.share);
    if (shareBtn) shareBtn.hidden = !canShare;
    if (qrShare) qrShare.hidden = !canShare;

    function copyPageLink(statusNode) {
      track("practice_share", { drills: plan.items.length });
      copyText(pageUrl()).then(function () {
        var message = "Link copied.";
        if (status) status.textContent = message;
        if (statusNode) statusNode.textContent = message;
      }, function () {
        var message = "Select the address bar to copy this page.";
        if (status) status.textContent = message;
        if (statusNode) statusNode.textContent = message;
      });
    }

    function sharePage() {
      track("practice_share", { drills: plan.items.length });
      var url = pageUrl();
      if (!navigator.share) {
        copyPageLink(qrStatus);
        return;
      }
      navigator.share({ title: document.title, url: url }).catch(function () {});
    }

    if (copyBtn) copyBtn.addEventListener("click", function () { copyPageLink(status); });
    if (qrCopy) qrCopy.addEventListener("click", function () { copyPageLink(qrStatus); });
    if (shareBtn) shareBtn.addEventListener("click", sharePage);
    if (qrShare) qrShare.addEventListener("click", sharePage);

    var qrBtn = document.getElementById("practice-qr");
    var closeBtn = document.getElementById("practice-qr-close");
    if (qrBtn) {
      qrBtn.addEventListener("click", function () {
        var url = pageUrl();
        if (qrUrl) qrUrl.textContent = url;
        if (qrStatus) qrStatus.textContent = "";
        if (qrMount) {
          qrMount.textContent = "";
          var svg = makeQr(url);
          if (svg) qrMount.innerHTML = svg;
          else qrMount.textContent = "This link is too long for a QR code. Copy it instead.";
        }
        track("practice_qr", { drills: plan.items.length });
        if (dialog && dialog.showModal) dialog.showModal();
      });
    }
    if (closeBtn && dialog) closeBtn.addEventListener("click", function () { dialog.close(); });
    if (dialog) {
      dialog.addEventListener("click", function (event) {
        var rect = dialog.getBoundingClientRect();
        var inside = event.clientX >= rect.left && event.clientX <= rect.right &&
          event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) dialog.close();
      });
    }

    function practiceCard(item, drill, index) {
      var li = document.createElement("li");
      li.className = "practice-card";
      var schedule = document.createElement("p");
      schedule.className = "practice-schedule";
      if (item.minutes !== "") {
        var mins = document.createElement("span");
        mins.className = "practice-mins";
        mins.textContent = item.minutes + " min";
        schedule.appendChild(mins);
      }
      if (cursor !== null) {
        var clock = document.createElement("span");
        clock.className = "practice-clock";
        if (item.minutes === "") clock.textContent = clockLabel(cursor);
        else {
          clock.textContent = clockLabel(cursor) + "\u2013" + clockLabel(cursor + item.minutes);
          cursor += item.minutes;
        }
        schedule.appendChild(clock);
      }
      if (schedule.childNodes.length) li.appendChild(schedule);
      if (drill.series) {
        var series = document.createElement("p");
        series.className = "practice-kicker";
        series.textContent = drill.series;
        li.appendChild(series);
      }
      var heading = document.createElement("h2");
      var indexLabel = document.createElement("span");
      indexLabel.className = "plan-index";
      indexLabel.textContent = String(index + 1);
      heading.appendChild(indexLabel);
      heading.appendChild(document.createTextNode(" " + drill.title));
      li.appendChild(heading);
      if (item.note && item.note.trim()) {
        var note = document.createElement("p");
        note.className = "practice-note";
        note.textContent = item.note.trim();
        li.appendChild(note);
      }
      li.appendChild(practiceMedia(drill, index));
      if (drill.points && drill.points.length) {
        var pointsHeading = document.createElement("h3");
        pointsHeading.className = "practice-points-heading";
        pointsHeading.textContent = "Coaching points";
        li.appendChild(pointsHeading);
        var points = document.createElement("ul");
        points.className = "points";
        drill.points.forEach(function (point) {
          var pointItem = document.createElement("li");
          pointItem.textContent = point;
          points.appendChild(pointItem);
        });
        li.appendChild(points);
      }
      var more = document.createElement("p");
      more.className = "practice-more";
      var link = document.createElement("a");
      link.href = drill.page;
      link.textContent = "Full drill page";
      more.appendChild(link);
      li.appendChild(more);
      return li;
    }

    function practiceMedia(drill, index) {
      var media = document.createElement("div");
      media.className = "practice-media";
      var img = document.createElement("img");
      img.className = "practice-still";
      img.src = drill.png;
      img.alt = drill.alt || "";
      media.appendChild(img);
      if (!drill.anim || !drill.animW || !drill.animH) {
        media.classList.add("is-fallback");
        return media;
      }
      var frame = document.createElement("div");
      frame.className = "anim-frame";
      frame.style.setProperty("--anim-w", String(drill.animW));
      frame.style.setProperty("--anim-h", String(drill.animH));
      var iframe = document.createElement("iframe");
      iframe.className = "drill-anim";
      iframe.setAttribute("data-src", drill.anim);
      iframe.title = "Animation of " + drill.title;
      iframe.style.aspectRatio = drill.animW + " / " + drill.animH;
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("data-anim-w", String(drill.animW));
      iframe.setAttribute("data-anim-h", String(drill.animH));
      if (index === 0) iframe.setAttribute("data-eager", "1");
      frame.appendChild(iframe);
      media.appendChild(frame);
      return media;
    }

    function armAnimations(root) {
      var frames = [].slice.call(root.querySelectorAll(".drill-anim"));
      frames.forEach(watchAnim);
      function loadFrame(frame) {
        var src = frame.getAttribute("data-src");
        if (!src || frame.getAttribute("src")) return;
        frame.src = src;
      }
      if (!("IntersectionObserver" in window)) {
        frames.forEach(loadFrame);
        return;
      }
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          loadFrame(entry.target);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: "600px 0px" });
      frames.forEach(function (frame) {
        if (frame.getAttribute("data-eager") === "1") loadFrame(frame);
        else observer.observe(frame);
      });
    }

    function applyPracticeSocial(source, minutes, first) {
      var label = source.items.length === 1 ? "1 drill" : source.items.length + " drills";
      var description = source.items.length ? label + " \u00b7 " + minutes + " min" : "A shared practice plan with the diagrams, times, and coaching points.";
      var socialTitle = (source.title.trim() || "Practice plan") + " \u00b7 Hockey Skills & Drills";
      setMeta("name", "description", description);
      setMeta("property", "og:title", socialTitle);
      setMeta("property", "og:description", description);
      setMeta("name", "twitter:title", socialTitle);
      setMeta("name", "twitter:description", description);
      var pageLink = cleanPageUrl(window.location.href);
      setMeta("property", "og:url", pageLink);
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute("href", pageLink);
      if (!first || !first.png) return;
      var image = new URL(first.png, window.location.href).href;
      setMeta("property", "og:image", image);
      setMeta("name", "twitter:image", image);
      if (first.alt) setMeta("property", "og:image:alt", first.alt);
    }

    function setMeta(attr, key, value) {
      var node = document.querySelector("meta[" + attr + '="' + key + '"]');
      if (node) node.setAttribute("content", value);
    }
  }

  function startMinutes(value) {
    var match = /^(\d{2}):(\d{2})$/.exec(value || "");
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function clockLabel(total) {
    var mins = ((total % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + (m < 10 ? "0" : "") + m + " " + suffix;
  }

  function formatPlanDate(iso) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!match) return "";
    var dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    try {
      return dt.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
    } catch (error) {
      return iso;
    }
  }

  function makeQr(url) {
    if (typeof qrcode !== "function") return "";
    var levels = ["M", "L"];
    for (var i = 0; i < levels.length; i += 1) {
      try {
        var qr = qrcode(0, levels[i]);
        qr.addData(url);
        qr.make();
        return qr.createSvgTag({
          cellSize: 4,
          margin: 16,
          scalable: true,
          alt: "QR code for this practice page",
          title: "Practice page"
        });
      } catch (error) {
        continue;
      }
    }
    return "";
  }

  // Share query. The plan page has always used d (slugs), m (minutes) and t (title).
  // The practice page adds n (per-drill notes, encodeURIComponent, joined by %1F),
  // pn (practice notes), date (YYYY-MM-DD) and start (HH:MM). Old links omit the new fields.
  function shareQuery(plan) {
    var slugs = [];
    var minutes = [];
    var notes = [];
    var anyMinutes = false;
    var anyNotes = false;
    plan.items.forEach(function (item) {
      slugs.push(item.slug);
      if (item.minutes === "" || item.minutes === null || item.minutes === undefined) minutes.push("");
      else {
        minutes.push(String(item.minutes));
        anyMinutes = true;
      }
      var note = typeof item.note === "string" ? item.note.slice(0, 140).replace(/\u001f/g, "") : "";
      notes.push(note);
      if (note.trim()) anyNotes = true;
    });
    while (minutes.length && minutes[minutes.length - 1] === "") minutes.pop();
    while (notes.length && notes[notes.length - 1] === "") notes.pop();
    var params = new URLSearchParams();
    params.set("d", slugs.join(","));
    if (anyMinutes && minutes.length) params.set("m", minutes.join(","));
    var title = (plan.title || "").trim().slice(0, 80);
    if (title) params.set("t", title);
    var practiceNotes = (plan.notes || "").slice(0, 2000);
    if (practiceNotes.trim()) params.set("pn", practiceNotes);
    if (plan.date) params.set("date", plan.date);
    if (plan.start) params.set("start", plan.start);
    var query = params.toString();
    if (anyNotes && notes.length) {
      query += (query ? "&" : "") + "n=" + notes.map(function (note) {
        return encodeURIComponent(note);
      }).join("%1F");
    }
    return query;
  }

  function parseShare(params, bySlug) {
    var raw = params.get("d") || "";
    var minutes = params.has("m") ? params.get("m").split(",") : null;
    var noteParts = params.has("n") ? params.get("n").split("\u001f") : null;
    var title = params.get("t") || "";
    if (title.length > 80) title = title.slice(0, 80);
    var practiceNotes = params.get("pn") || "";
    if (practiceNotes.length > 2000) practiceNotes = practiceNotes.slice(0, 2000);
    var slugs = raw.split(",");
    var seen = {};
    var items = [];
    var unknown = 0;
    slugs.forEach(function (part, index) {
      var slug = part.trim();
      if (!slug) return;
      if (!bySlug[slug]) {
        unknown += 1;
        return;
      }
      if (seen[slug]) return;
      seen[slug] = true;
      var minutesValue = "";
      if (minutes && index < minutes.length) minutesValue = normalizeMinutes(minutes[index]);
      var note = "";
      if (noteParts && index < noteParts.length && typeof noteParts[index] === "string") {
        note = noteParts[index].replace(/\u001f/g, "").slice(0, 140);
      }
      items.push({ slug: slug, minutes: minutesValue, note: note });
    });
    return {
      skipped: unknown,
      plan: {
        title: title,
        notes: practiceNotes,
        date: validDate(params.get("date")),
        start: validTime(params.get("start")),
        savedId: "",
        items: items
      }
    };
  }

  function buildShareUrl(plan) {
    return new URL("plan/?" + shareQuery(plan), rootUrl).href;
  }

  function buildPracticeUrl(plan) {
    return new URL("practice/?" + shareQuery(plan), rootUrl).href;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (error) {
        ok = false;
      }
      document.body.removeChild(area);
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  function cleanPageUrl(value) {
    try {
      var url = new URL(value, rootUrl);
      url.pathname = url.pathname.replace(/\/index\.html$/, "/");
      return url.href;
    } catch (error) {
      return value;
    }
  }

  function apiUrl(path) {
    return new URL(String(path).replace(/^\//, ""), rootUrl).href;
  }

  function fetchJson(url, options) {
    var opts = options || {};
    opts.credentials = "same-origin";
    var headers = opts.headers || {};
    if (!headers.accept) headers.accept = "application/json";
    if (opts.body && !headers["content-type"]) headers["content-type"] = "application/json";
    opts.headers = headers;
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data || {} };
      });
    });
  }

  function whenAccountReady(fn) {
    if (accountState.ready) fn(accountState);
    else accountReady.push(fn);
  }

  function signInHref() {
    var url = new URL("account/", rootUrl);
    url.searchParams.set("next", cleanPageUrl(window.location.href));
    return url.href;
  }

  function safeNext() {
    var next = new URLSearchParams(window.location.search).get("next");
    var fallback = new URL("account/", rootUrl).href;
    if (!next) return fallback;
    try {
      var url = new URL(next, rootUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
      if (url.origin !== rootUrl.origin) return fallback;
      var rootPath = rootUrl.pathname;
      if (rootPath !== "/" && url.pathname.indexOf(rootPath) !== 0) return fallback;
      return cleanPageUrl(url.href);
    } catch (error) {
      return fallback;
    }
  }

  function planWorthSaving(plan) {
    return !!(plan && (plan.items.length || (plan.title || "").trim() || (plan.notes || "").trim()));
  }

  function plansDiffer(a, b) {
    return JSON.stringify({ title: a.title, notes: a.notes || "", date: a.date || "", start: a.start || "", teamId: a.teamId || "", items: a.items }) !==
      JSON.stringify({ title: b.title, notes: b.notes || "", date: b.date || "", start: b.start || "", teamId: b.teamId || "", items: b.items });
  }

  function planPayload(plan) {
    var payload = {
      title: plan.title || "",
      notes: plan.notes || "",
      practiceDate: plan.date || null,
      items: (plan.items || []).map(function (item) {
        return {
          slug: item.slug,
          minutes: item.minutes === "" ? null : item.minutes,
          note: item.note || ""
        };
      })
    };
    var label = document.getElementById("plan-team-label");
    var select = document.getElementById("plan-team");
    if (select && label && !label.hidden) payload.teamId = select.value || null;
    else if (plan.teamId) payload.teamId = plan.teamId;
    return payload;
  }

  function planFromApi(record, bySlug) {
    var plan = sanitize({
      title: record.title || "",
      notes: record.notes || "",
      date: record.practiceDate || "",
      teamId: record.teamId || "",
      savedId: record.id || "",
      items: (record.items || []).map(function (item) {
        return {
          slug: item.slug,
          minutes: item.minutes === null || item.minutes === undefined ? "" : item.minutes,
          note: item.note || ""
        };
      })
    }, bySlug);
    if (plan.savedId) {
      var when = recallWhen(plan.savedId);
      if (!plan.date) plan.date = when.date;
      if (!plan.start) plan.start = when.start;
    }
    return plan;
  }

  function importSeen(userId) {
    try {
      return localStorage.getItem(IMPORT_KEY) === userId;
    } catch (error) {
      return true;
    }
  }

  function rememberImport(userId) {
    try {
      localStorage.setItem(IMPORT_KEY, userId);
    } catch (error) {
      return;
    }
  }

  function dismissImport(banner) {
    if (accountState.user) rememberImport(accountState.user.id);
    if (banner) {
      banner.hidden = true;
      banner.dataset.done = "1";
    }
  }

  function importLocalPlan(banner) {
    var existing = readPlan();
    if (!accountState.user || !planWorthSaving(existing)) {
      dismissImport(banner);
      return;
    }
    fetchJson(apiUrl("api/plans"), {
      method: "POST",
      body: JSON.stringify(planPayload(existing))
    }).then(function (result) {
      if (!result.ok || !result.data.plan) {
        var status = document.getElementById("plan-status") || document.getElementById("account-status");
        if (status) status.textContent = (result.data && result.data.error) || "Could not save the plan.";
        return;
      }
      existing.savedId = result.data.plan.id;
      savePlan(existing);
      rememberImport(accountState.user.id);
      if (banner) {
        banner.hidden = true;
        banner.dataset.done = "1";
      }
      var statusNode = document.getElementById("plan-status") || document.getElementById("account-status");
      if (statusNode) statusNode.textContent = "Saved the browser plan to your account.";
      if (document.getElementById("account-list")) loadAccountPlans();
      if (typeof refreshPlan === "function" && document.getElementById("plan-list")) refreshPlan();
    }, function () {
      var statusNode = document.getElementById("plan-status") || document.getElementById("account-status");
      if (statusNode) statusNode.textContent = "Could not reach your account.";
    });
  }

  function initAccounts() {
    fetch(apiUrl("api/health"), {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    }).then(function (res) {
      if (!res.ok) throw new Error("no api");
      return res.json();
    }).then(function (health) {
      if (!health || !health.ok || !health.accounts) throw new Error("no accounts");
      accountState.enabled = true;
      accountState.google = !!health.google;
      accountState.email = !!health.email;
      return fetchJson(apiUrl("api/auth/session")).catch(function () {
        return { data: {} };
      });
    }).then(function (result) {
      var user = result && result.data && result.data.user;
      if (user && user.id) accountState.user = user;
    }).catch(function () {
      accountState.enabled = false;
      accountState.user = null;
    }).then(function () {
      accountState.ready = true;
      renderAccountSlot();
      accountReady.forEach(function (fn) { fn(accountState); });
      accountReady = [];
    });
  }


  // Mobile menu: Drills, Plans, and (any signed-in coach) Lineups and Rosters.
  // Admin is a separate check and stays limited to ADMIN_EMAILS.
  function initMobileMenu() {
    var inner = document.querySelector(".site-header .header-inner");
    if (!inner || inner.querySelector(".menu-btn")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-btn";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "site-menu");
    btn.setAttribute("aria-label", "Menu");
    btn.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
    var panel = document.createElement("nav");
    panel.id = "site-menu";
    panel.className = "menu-panel";
    panel.setAttribute("aria-label", "Menu");
    panel.hidden = true;
    var list = document.createElement("ul");
    panel.appendChild(list);
    var foot = document.createElement("div");
    foot.className = "menu-foot";
    panel.appendChild(foot);
    function item(label, href, before) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      li.appendChild(a);
      if (before) list.insertBefore(li, before); else list.appendChild(li);
      return li;
    }
    item("Drills", new URL("./", rootUrl).href);
    var plansItem = item("Plans", new URL("plans/", rootUrl).href);
    var plansAnchor = plansItem.querySelector("a");
    if (plansAnchor && onPlansPage()) plansAnchor.setAttribute("aria-current", "page");
    inner.appendChild(btn);
    inner.appendChild(panel);
    function setOpen(open) {
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(panel.hidden);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) setOpen(false);
    });
    whenAccountReady(function (state) {
      if (!state.enabled) return;
      var a = document.createElement(state.user ? "button" : "a");
      a.className = "menu-auth";
      if (state.user) {
        a.type = "button";
        a.textContent = "Sign out";
        a.addEventListener("click", function () {
          var home = new URL("./", rootUrl).href;
          authPost("signout", { callbackUrl: home }).then(function () {
            window.location.href = home;
          }, function () { window.location.href = new URL("account/", rootUrl).href; });
        });
      } else {
        a.href = new URL("account/", rootUrl).href;
        a.textContent = "Sign in";
      }
      foot.appendChild(a);
      if (!state.user) return;
      item("Lineups", new URL("lineups/", rootUrl).href);
      item("Rosters", new URL("lineups/rosters/", rootUrl).href);
      fetch(new URL("admin/", rootUrl).href, { method: "HEAD", credentials: "same-origin" }).then(function (res) {
        if (!res.ok) return;
        item("Admin", new URL("admin/", rootUrl).href);
      }).catch(function () {});
    });
  }

  function renderAccountSlot() {
    var slot = document.querySelector("[data-account-slot]");
    if (!slot) return;
    slot.textContent = "";
    if (!accountState.enabled) {
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    if (!accountState.user) {
      var link = document.createElement("a");
      link.className = "plan-nav";
      link.href = new URL("account/", rootUrl).href;
      link.textContent = "Sign in";
      slot.appendChild(link);
      return;
    }
    var user = accountState.user;
    var label = user.name || user.email || "Account";
    var chip = document.createElement("a");
    chip.className = "account-chip";
    chip.href = new URL("account/", rootUrl).href;
    chip.setAttribute("aria-label", label);
    var avatar = safeAvatar(user.image);
    if (avatar) {
      var img = document.createElement("img");
      img.className = "avatar";
      img.src = avatar;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      chip.appendChild(img);
    } else {
      var fallback = document.createElement("span");
      fallback.className = "avatar-fallback";
      fallback.setAttribute("aria-hidden", "true");
      fallback.textContent = initials(label);
      chip.appendChild(fallback);
    }
    var name = document.createElement("span");
    name.className = "account-name";
    name.textContent = label;
    chip.appendChild(name);
    slot.appendChild(chip);
    var plans = document.createElement("a");
    plans.className = "plan-nav";
    plans.href = new URL("account/", rootUrl).href;
    plans.textContent = "My plans";
    plans.setAttribute("data-account-nav", "");
    if (onAccountPage()) plans.setAttribute("aria-current", "page");
    slot.appendChild(plans);
  }

  function initials(label) {
    var parts = String(label || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    var text = parts.map(function (part) { return part.charAt(0); }).join("");
    if (!text && label) text = String(label).charAt(0);
    return (text || "?").toUpperCase();
  }

  function onAccountPage() {
    var path = window.location.pathname;
    return /\/account\/(index\.html)?$/.test(path) || /\/account$/.test(path);
  }

  function onPlansPage() {
    var path = window.location.pathname;
    return /\/plans\/(index\.html)?$/.test(path) || /\/plans$/.test(path);
  }

  function initPlansPage() {
    var list = document.getElementById("plans-list");
    if (!list) return;
    var unavailable = document.getElementById("plans-unavailable");
    var signedOut = document.getElementById("plans-out");
    var signedIn = document.getElementById("plans-in");
    var empty = document.getElementById("plans-empty");
    var status = document.getElementById("plans-status");
    var signIn = document.getElementById("plans-signin");

    whenAccountReady(function () {
      if (signIn) signIn.href = signInHref();
      if (!accountState.enabled) {
        if (unavailable) unavailable.hidden = false;
        if (signedOut) signedOut.hidden = true;
        if (signedIn) signedIn.hidden = true;
        return;
      }
      if (unavailable) unavailable.hidden = true;
      if (!accountState.user) {
        if (signedOut) signedOut.hidden = false;
        if (signedIn) signedIn.hidden = true;
        return;
      }
      if (signedOut) signedOut.hidden = true;
      if (signedIn) signedIn.hidden = false;
      loadPlansList();
    });

    function loadPlansList() {
      fetchJson(apiUrl("api/plans")).then(function (result) {
        if (!result.ok) {
          if (status) status.textContent = (result.data && result.data.error) || "Could not load your plans.";
          return;
        }
        var plans = (result.data.plans || []).slice().sort(comparePlans);
        list.textContent = "";
        var shown = 0;
        plans.forEach(function (plan) {
          var row = planRow(plan);
          if (!row) return;
          list.appendChild(row);
          shown += 1;
        });
        if (empty) empty.hidden = shown !== 0;
      }, function () {
        if (status) status.textContent = "Could not reach your account.";
      });
    }

    function comparePlans(a, b) {
      var aTime = planTime(a);
      var bTime = planTime(b);
      if (aTime !== bTime) return bTime - aTime;
      return String(b && b.id || "").localeCompare(String(a && a.id || ""));
    }

    function planTime(plan) {
      var raw = plan && (plan.updatedAt || plan.createdAt);
      var time = Date.parse(raw || "");
      return isNaN(time) ? 0 : time;
    }

    function planRow(plan) {
      if (!plan || typeof plan.id !== "string" || !/^[0-9a-f-]{36}$/i.test(plan.id)) return null;
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = new URL("plan/?saved=" + encodeURIComponent(plan.id), rootUrl).href;
      var title = document.createElement("strong");
      var name = typeof plan.title === "string" ? plan.title.trim() : "";
      title.textContent = name || "Untitled plan";
      var date = document.createElement("span");
      date.className = "plans-date";
      var when = formatUpdated(plan.updatedAt || plan.createdAt);
      date.textContent = when ? "Updated " + when : "";
      link.appendChild(title);
      link.appendChild(date);
      li.appendChild(link);
      return li;
    }
  }

  function initAccountPage() {
    var incoming = document.getElementById("account-in");
    var outgoing = document.getElementById("account-out");
    if (!incoming || !outgoing) return;
    var unavailable = document.getElementById("account-unavailable");
    var status = document.getElementById("account-status");
    var googleBtn = document.getElementById("account-google");
    var emailForm = document.getElementById("account-email");
    var emailInput = document.getElementById("account-email-input");
    var importBanner = document.getElementById("account-import");
    var importYes = document.getElementById("account-import-yes");
    var importNo = document.getElementById("account-import-no");
    var signOutBtn = document.getElementById("account-signout");
    var deleteBtn = document.getElementById("account-delete");

    if (googleBtn) {
      googleBtn.addEventListener("click", function () {
        googleBtn.disabled = true;
        authPost("signin/google", { callbackUrl: safeNext() }).then(function (data) {
          var target = data && data.url ? safeHttpUrl(data.url) : "";
          if (target) window.location.href = target;
          else {
            googleBtn.disabled = false;
            if (status) status.textContent = "Google sign-in did not start. Try again.";
          }
        }, function () {
          googleBtn.disabled = false;
          if (status) status.textContent = "Could not reach sign-in. Try again.";
        });
      });
    }

    if (emailForm) {
      emailForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var email = emailInput ? emailInput.value.trim() : "";
        if (!email) return;
        var submit = emailForm.querySelector("button");
        if (submit) submit.disabled = true;
        authPost("signin/resend", { email: email, callbackUrl: safeNext() }).then(function (data) {
          if (submit) submit.disabled = false;
          if (data && data.error) {
            if (status) status.textContent = String(data.error).slice(0, 200);
            return;
          }
          if (data.url && data.url.indexOf("verify-request") === -1 && data.url.indexOf("error=") !== -1) {
            if (status) status.textContent = "Could not send the sign-in email.";
            return;
          }
          if (status) status.textContent = "Check your email for a sign-in link.";
        }, function () {
          if (submit) submit.disabled = false;
          if (status) status.textContent = "Could not reach sign-in. Try again.";
        });
      });
    }

    if (importYes) importYes.addEventListener("click", function () { importLocalPlan(importBanner); });
    if (importNo) importNo.addEventListener("click", function () { dismissImport(importBanner); });
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function () {
        var typed = window.prompt("This deletes your account and every saved plan. Type delete to confirm.");
        if (typed !== "delete") {
          if (typed && status) status.textContent = "Account was not deleted.";
          return;
        }
        deleteBtn.disabled = true;
        fetchJson(apiUrl("api/account"), {
          method: "DELETE",
          body: JSON.stringify({ confirm: "delete my account" })
        }).then(function (result) {
          if (!result.ok) {
            deleteBtn.disabled = false;
            if (status) status.textContent = (result.data && result.data.error) || "Could not delete the account.";
            return;
          }
          window.location.href = new URL("account/", rootUrl).href;
        }, function () {
          deleteBtn.disabled = false;
          if (status) status.textContent = "Could not reach your account.";
        });
      });
    }

    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        signOutBtn.disabled = true;
        var accountHome = new URL("account/", rootUrl).href;
        authPost("signout", { callbackUrl: accountHome }).then(function (data) {
          var next = sameOriginUrl(data && data.url) || accountHome;
          window.location.href = cleanPageUrl(next);
        }, function () {
          signOutBtn.disabled = false;
          if (status) status.textContent = "Could not sign out. Try again.";
        });
      });
    }

    whenAccountReady(function () {
      var error = new URLSearchParams(window.location.search).get("error");
      if (error && status) status.textContent = signInError(error);
      if (!accountState.enabled) {
        if (unavailable) unavailable.hidden = false;
        outgoing.hidden = true;
        incoming.hidden = true;
        return;
      }
      if (unavailable) unavailable.hidden = true;
      if (!accountState.user) {
        outgoing.hidden = false;
        incoming.hidden = true;
        if (googleBtn) googleBtn.hidden = !accountState.google;
        if (emailForm) emailForm.hidden = !accountState.email;
        return;
      }
      var next = new URLSearchParams(window.location.search).get("next");
      var dest = safeNext();
      if (next && dest.indexOf("/account") === -1) {
        window.location.replace(dest);
        return;
      }
      outgoing.hidden = true;
      incoming.hidden = false;
      var userLine = document.getElementById("account-user");
      if (userLine) {
        userLine.textContent = "Signed in as " + (accountState.user.name || accountState.user.email || "your account");
      }
      maybeOfferAccountImport();
      loadAccountPlans();
    });

    function maybeOfferAccountImport() {
      if (!importBanner || !accountState.user) return;
      var existing = readPlan();
      if (existing.savedId || !planWorthSaving(existing) || importSeen(accountState.user.id)) {
        importBanner.hidden = true;
        return;
      }
      importBanner.hidden = false;
    }
  }

  function loadAccountPlans() {
    var list = document.getElementById("account-list");
    var empty = document.getElementById("account-empty");
    var status = document.getElementById("account-status");
    if (!list) return;
    fetchJson(apiUrl("api/plans")).then(function (result) {
      if (!result.ok) {
        if (status) status.textContent = (result.data && result.data.error) || "Could not load your plans.";
        return;
      }
      var plans = result.data.plans || [];
      list.textContent = "";
      if (empty) empty.hidden = plans.length !== 0;
      plans.forEach(function (plan) {
        list.appendChild(accountCard(plan));
      });
    }, function () {
      if (status) status.textContent = "Could not reach your account.";
    });
  }

  function accountCard(plan) {
    var li = document.createElement("li");
    li.className = "account-card";
    var title = document.createElement("h2");
    title.textContent = plan.title.trim() || "Untitled plan";
    var meta = document.createElement("p");
    meta.className = "account-meta";
    var drills = plan.drillCount === 1 ? "1 drill" : plan.drillCount + " drills";
    meta.textContent = drills + " \u00b7 " + plan.totalMinutes + " min \u00b7 Updated " + formatUpdated(plan.updatedAt);
    var actions = document.createElement("div");
    actions.className = "account-actions";
    var open = document.createElement("a");
    open.className = "btn primary";
    open.href = new URL("plan/?saved=" + encodeURIComponent(plan.id), rootUrl).href;
    open.textContent = "Open";
    var rename = document.createElement("button");
    rename.type = "button";
    rename.className = "btn";
    rename.textContent = "Rename";
    var duplicate = document.createElement("button");
    duplicate.type = "button";
    duplicate.className = "btn";
    duplicate.textContent = "Duplicate";
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn danger";
    remove.textContent = "Delete";
    actions.appendChild(open);
    actions.appendChild(rename);
    actions.appendChild(duplicate);
    actions.appendChild(remove);
    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(actions);

    rename.addEventListener("click", function () {
      if (li.querySelector(".rename-row")) return;
      var form = document.createElement("form");
      form.className = "rename-row";
      var input = document.createElement("input");
      input.type = "text";
      input.maxLength = 80;
      input.value = plan.title;
      input.setAttribute("aria-label", "Plan name");
      var saveName = document.createElement("button");
      saveName.className = "btn primary";
      saveName.type = "submit";
      saveName.textContent = "Save name";
      var cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.type = "button";
      cancel.textContent = "Cancel";
      form.appendChild(input);
      form.appendChild(saveName);
      form.appendChild(cancel);
      li.insertBefore(form, actions);
      input.focus();
      cancel.addEventListener("click", function () { form.remove(); });
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        saveName.disabled = true;
        fetchJson(apiUrl("api/plans/" + plan.id), {
          method: "PATCH",
          body: JSON.stringify({ title: input.value })
        }).then(function (result) {
          if (!result.ok) {
            saveName.disabled = false;
            var status = document.getElementById("account-status");
            if (status) status.textContent = (result.data && result.data.error) || "Could not rename the plan.";
            return;
          }
          loadAccountPlans();
        });
      });
    });

    duplicate.addEventListener("click", function () {
      duplicate.disabled = true;
      fetchJson(apiUrl("api/plans/" + plan.id)).then(function (result) {
        if (!result.ok || !result.data.plan) {
          duplicate.disabled = false;
          return;
        }
        var source = result.data.plan;
        var copyTitle = ("Copy of " + (source.title.trim() || "Untitled plan")).slice(0, 80);
        return fetchJson(apiUrl("api/plans"), {
          method: "POST",
          body: JSON.stringify({
            title: copyTitle,
            notes: source.notes || "",
            items: source.items || [],
            teamId: source.teamId || null,
            practiceDate: source.practiceDate || null
          })
        });
      }).then(function (result) {
        duplicate.disabled = false;
        if (!result || !result.ok) return;
        var status = document.getElementById("account-status");
        if (status) status.textContent = "Duplicated.";
        loadAccountPlans();
      }, function () {
        duplicate.disabled = false;
      });
    });

    remove.addEventListener("click", function () {
      var name = plan.title.trim() || "this plan";
      if (!window.confirm("Delete " + name + "? This cannot be undone.")) return;
      remove.disabled = true;
      fetchJson(apiUrl("api/plans/" + plan.id), { method: "DELETE" }).then(function (result) {
        if (!result.ok) {
          remove.disabled = false;
          return;
        }
        var current = readPlan();
        if (current.savedId === plan.id) {
          current.savedId = "";
          savePlan(current);
        }
        loadAccountPlans();
      });
    });

    return li;
  }

  function formatUpdated(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    try {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (error) {
      return date.toDateString();
    }
  }

  function signInError(code) {
    if (code === "Verification") return "That sign-in link expired or was already used. Request a new one.";
    if (code === "AccessDenied") return "That sign-in was cancelled.";
    if (code === "Configuration") return "Sign-in is not set up yet.";
    if (code === "OAuthAccountNotLinked") return "An account with that email already exists. Sign in the same way you did the first time.";
    return "Sign-in did not work. Try again.";
  }

  function safeHttpUrl(url) {
    try {
      var parsed = new URL(url, rootUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
      return parsed.href;
    } catch (error) {
      return "";
    }
  }

  function sameOriginUrl(url) {
    var parsed = safeHttpUrl(url);
    if (!parsed) return "";
    try {
      if (new URL(parsed).origin !== rootUrl.origin) return "";
    } catch (error) {
      return "";
    }
    return parsed;
  }

  function safeAvatar(url) {
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== "https:") return "";
      var host = parsed.hostname.toLowerCase();
      if (host === "lh3.googleusercontent.com" || host.endsWith(".googleusercontent.com")) return parsed.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function authPost(action, fields) {
    return fetchJson(apiUrl("api/auth/csrf")).then(function (csrf) {
      var body = new URLSearchParams();
      body.set("csrfToken", (csrf.data && csrf.data.csrfToken) || "");
      Object.keys(fields).forEach(function (key) {
        body.set(key, fields[key]);
      });
      return fetch(apiUrl("api/auth/" + action), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "X-Auth-Return-Redirect": "1"
        },
        body: body
      }).then(function (res) {
        return res.json().catch(function () { return {}; });
      });
    });
  }
})();
