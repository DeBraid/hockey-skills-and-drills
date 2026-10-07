(function () {
  var script = document.currentScript;
  var rootUrl = new URL("../", script.src);
  var STORAGE_KEY = "hsd-practice-plan";

  function emptyPlan() {
    return { title: "", items: [] };
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
    return { title: title, items: items };
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
        title: plan.title,
        items: plan.items
      }));
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

  var frames = document.querySelectorAll(".drill-anim");

  function fitAnim(frame) {
    var doc;
    try {
      doc = frame.contentDocument;
    } catch (error) {
      return;
    }
    if (!doc || !doc.documentElement) return;
    var needed = doc.documentElement.scrollHeight;
    if (doc.body) needed = Math.max(needed, doc.body.scrollHeight);
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

  frames.forEach(function (frame) {
    frame.addEventListener("load", function () {
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
  });
  window.addEventListener("resize", function () {
    frames.forEach(fitAfterLayout);
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

  initPlanPage();

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
    var printTitle = document.getElementById("plan-print-title");
    var shareBtn = document.getElementById("plan-share");
    var printBtn = document.getElementById("plan-print");
    var clearBtn = document.getElementById("plan-clear");
    var status = document.getElementById("plan-status");
    var fallback = document.getElementById("plan-share-fallback");
    var total = document.getElementById("plan-total");
    var emptyEdit = document.getElementById("plan-empty");
    var emptyShared = document.getElementById("plan-shared-empty");

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
    }

    function applyChrome() {
      page.classList.toggle("is-shared", shared);
      banner.hidden = !shared;
      clearBtn.hidden = shared;
      titleInput.readOnly = shared;
      if (document.activeElement !== titleInput) titleInput.value = plan.title;
      titleInput.placeholder = shared ? "" : "Tuesday practice";
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
    });

    shareBtn.addEventListener("click", function () {
      if (!plan.items.length) {
        status.textContent = "Add a drill before sharing.";
        fallback.hidden = true;
        return;
      }
      var url = shared ? window.location.href : buildShareUrl(plan);
      copyText(url).then(function () {
        fallback.hidden = true;
        status.textContent = "Share link copied.";
      }, function () {
        status.textContent = "Select the link below to copy it.";
        fallback.hidden = false;
        fallback.value = url;
        fallback.focus();
        fallback.select();
      });
    });

    printBtn.addEventListener("click", function () {
      window.print();
    });

    clearBtn.addEventListener("click", function () {
      if (shared) return;
      if (!plan.items.length && !plan.title.trim()) {
        status.textContent = "The plan is already empty.";
        return;
      }
      if (!window.confirm("Clear this practice plan?")) return;
      plan = emptyPlan();
      savePlan(plan);
      titleInput.value = "";
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
      var hasExisting = existing.items.length > 0 || existing.title.trim();
      if (hasExisting && !window.confirm("Replace your saved practice plan with this one?")) return;
      var loaded = {
        title: plan.title,
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
      var clean = window.location.pathname;
      history.replaceState(null, "", clean);
      status.textContent = "Saved in this browser. You can edit this copy.";
      fallback.hidden = true;
      render();
    });

    render();
  }

  function parseShare(params, bySlug) {
    var raw = params.get("d") || "";
    var minutes = params.has("m") ? params.get("m").split(",") : null;
    var title = params.get("t") || "";
    if (title.length > 80) title = title.slice(0, 80);
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
      items.push({ slug: slug, minutes: minutesValue, note: "" });
    });
    return {
      skipped: unknown,
      plan: { title: title, items: items }
    };
  }

  function buildShareUrl(plan) {
    var slugs = [];
    var minutes = [];
    var anyMinutes = false;
    plan.items.forEach(function (item) {
      slugs.push(item.slug);
      if (item.minutes === "") minutes.push("");
      else {
        minutes.push(String(item.minutes));
        anyMinutes = true;
      }
    });
    while (minutes.length && minutes[minutes.length - 1] === "") minutes.pop();
    var query = "d=" + slugs.join(",");
    if (anyMinutes && minutes.length) query += "&m=" + minutes.join(",");
    var title = plan.title.trim();
    if (title) query += "&t=" + encodeURIComponent(title);
    return new URL("plan/?" + query, rootUrl).href;
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
})();
