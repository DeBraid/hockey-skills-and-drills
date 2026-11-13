/* Private lineup pages: editor, list, roster, and the read-only share view.
   Contains no roster data; the server embeds it only for that team's coaches. */
(function () {
  "use strict";

  var POSITIONS = ["LW", "C", "RW", "LD", "RD", "OUT"];
  var statusEl = document.getElementById("lu-status");
  var mainEl = document.getElementById("content");
  var TEAM = (mainEl && mainEl.getAttribute("data-team")) || "stars";
  var PAGE = "/lineups/team/" + TEAM + "/";
  var API = "/api/lineups/team/" + TEAM;

  function status(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error((data && data.error) || "Something went wrong. Try again.");
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  document.querySelectorAll("[data-print]").forEach(function (button) {
    button.addEventListener("click", function () { window.print(); });
  });

  document.querySelectorAll("[data-team-switch]").forEach(function (select) {
    select.addEventListener("change", function () {
      var tail = select.getAttribute("data-tail") || "";
      location.href = "/lineups/team/" + select.value + "/" + tail;
    });
  });

  var createForm = document.getElementById("lu-create");
  var showCreate = document.getElementById("lu-show-create");
  if (showCreate && createForm) {
    showCreate.addEventListener("click", function () {
      createForm.hidden = false;
      showCreate.parentElement.hidden = true;
      var first = createForm.querySelector("input");
      if (first) first.focus();
    });
  }
  if (createForm) {
    createForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var form = new FormData(createForm);
      api("POST", "/api/teams", {
        name: String(form.get("name") || ""),
        ageGroup: String(form.get("ageGroup") || ""),
        season: String(form.get("season") || ""),
        scheduleUrl: String(form.get("scheduleUrl") || "")
      }).then(function (data) {
        location.href = "/lineups/team/" + data.team.id + "/roster/";
      }).catch(function (error) { status(error.message, true); });
    });
  }

  var settingsForm = document.getElementById("lu-settings");
  if (settingsForm) {
    settingsForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var form = new FormData(settingsForm);
      api("PATCH", "/api/teams/" + TEAM, {
        name: String(form.get("name") || ""),
        ageGroup: String(form.get("ageGroup") || ""),
        season: String(form.get("season") || ""),
        scheduleUrl: String(form.get("scheduleUrl") || "")
      }).then(function () { location.reload(); })
        .catch(function (error) { status(error.message, true); });
    });
  }
  var deleteTeam = document.getElementById("lu-delete-team");
  if (deleteTeam) {
    deleteTeam.addEventListener("click", function () {
      if (!confirm("Delete this team, its roster, and its lineups? This cannot be undone.")) return;
      api("DELETE", "/api/teams/" + TEAM).then(function () { location.href = "/lineups/"; })
        .catch(function (error) { status(error.message, true); });
    });
  }
  var inviteForm = document.getElementById("lu-invite");
  if (inviteForm) {
    inviteForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var form = new FormData(inviteForm);
      var hours = String(form.get("expiresInHours") || "");
      api("POST", "/api/teams/" + TEAM + "/invites", {
        singleUse: form.get("singleUse") === "on",
        expiresInHours: hours ? Number(hours) : null
      }).then(function (data) {
        var link = document.getElementById("lu-invite-link");
        if (link && data.invite) {
          link.hidden = false;
          link.textContent = "";
          var a = document.createElement("a");
          a.href = data.invite.path;
          a.textContent = location.origin + data.invite.path;
          link.appendChild(a);
        }
        location.reload();
      }).catch(function (error) { status(error.message, true); });
    });
  }
  document.querySelectorAll("[data-revoke-invite]").forEach(function (button) {
    button.addEventListener("click", function () {
      api("DELETE", "/api/teams/" + TEAM + "/invites/" + button.getAttribute("data-revoke-invite"))
        .then(function () { location.reload(); })
        .catch(function (error) { status(error.message, true); });
    });
  });
  document.querySelectorAll("[data-remove-member]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!confirm("Remove this assistant coach?")) return;
      api("DELETE", "/api/teams/" + TEAM + "/members/" + button.getAttribute("data-remove-member"))
        .then(function () { location.reload(); })
        .catch(function (error) { status(error.message, true); });
    });
  });
  document.querySelectorAll("[data-run-again]").forEach(function (button) {
    button.addEventListener("click", function () {
      button.disabled = true;
      var now = new Date();
      var month = String(now.getMonth() + 1);
      var day = String(now.getDate());
      var today = now.getFullYear() + "-" + (month.length < 2 ? "0" : "") + month + "-" + (day.length < 2 ? "0" : "") + day;
      api("POST", "/api/plans", { copyFrom: button.getAttribute("data-run-again"), teamId: TEAM, practiceDate: today })
        .then(function (data) { location.href = "/plan/?saved=" + data.plan.id; })
        .catch(function (error) { button.disabled = false; status(error.message, true); });
    });
  });
  var joinForm = document.getElementById("lu-join");
  if (joinForm) {
    joinForm.addEventListener("submit", function (event) {
      event.preventDefault();
      api("POST", "/api/teams/join/" + joinForm.getAttribute("data-token"), {})
        .then(function (data) { location.href = "/lineups/team/" + data.teamId + "/"; })
        .catch(function () { status("That invite link is no longer good.", true); });
    });
  }

  // ---------- list page ----------
  document.querySelectorAll("[data-duplicate]").forEach(function (button) {
    button.addEventListener("click", function () {
      button.disabled = true;
      api("POST", API, { copyFrom: button.getAttribute("data-duplicate") })
        .then(function (data) { location.href = PAGE + data.lineup.id + "/"; })
        .catch(function (error) { button.disabled = false; status(error.message, true); });
    });
  });

  // ---------- roster page ----------
  var addForm = document.getElementById("lu-add");
  if (addForm) {
    addForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var form = new FormData(addForm);
      var practiceRaw = form.get("practiceNumber");
      api("POST", API + "/roster", {
        number: Number(form.get("number")),
        practiceNumber: practiceRaw === null || String(practiceRaw) === "" ? null : Number(practiceRaw),
        firstName: String(form.get("firstName") || ""),
        lastInitial: String(form.get("lastInitial") || "").trim().replace(/\./g, "").slice(0, 2).toUpperCase(),
        position: String(form.get("position") || ""),
        preferred: String(form.get("preferred") || ""),
        goalie: String(form.get("position") || "") === "G"
      })
        .then(function () { location.reload(); })
        .catch(function (error) { status(error.message, true); });
    });
  }
  document.querySelectorAll("[data-pref-player]").forEach(function (button) {
    button.addEventListener("click", function () {
      var next = prompt("Preferred positions (C, W, D, G), e.g. C/W. Leave blank to clear.", button.getAttribute("data-pref") || "");
      if (next === null) return;
      api("PATCH", API + "/roster/" + button.getAttribute("data-pref-player"), { preferred: next })
        .then(function () { location.reload(); })
        .catch(function (error) { status(error.message, true); });
    });
  });
  document.querySelectorAll("[data-remove-player]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!confirm("Remove " + button.getAttribute("data-label") + " from the roster?")) return;
      api("DELETE", API + "/roster/" + button.getAttribute("data-remove-player"))
        .then(function () { location.reload(); })
        .catch(function (error) { status(error.message, true); });
    });
  });

  // ---------- editor ----------
  var dataEl = document.getElementById("lu-data");
  if (!dataEl) return;
  var data = JSON.parse(dataEl.textContent || "{}");
  var players = {};
  (data.players || []).forEach(function (p) { players[p.id] = p; });
  var lineup = data.lineup || { id: null, title: "", slots: {}, shareToken: null };
  var slots = {};
  POSITIONS.forEach(function (pos) {
    slots[pos] = ((lineup.slots && lineup.slots[pos]) || []).filter(function (id) { return players[id]; });
  });
  var selected = null;
  var dirty = false;
  var titleInput = document.getElementById("lu-title");
  var printTitle = document.getElementById("lu-print-title");
  var notesInput = document.getElementById("lu-notes");
  var stars = [0, 1, 2].map(function (i) { var id = lineup.stars && lineup.stars[i]; return id && players[id] ? id : null; });

  function poolIds() {
    var placed = {};
    POSITIONS.forEach(function (pos) { slots[pos].forEach(function (id) { placed[id] = true; }); });
    return (data.players || []).filter(function (p) { return p.active && !p.goalie && !placed[p.id]; }).map(function (p) { return p.id; });
  }

  function goalieIds() {
    var out = {};
    slots.OUT.forEach(function (id) { out[id] = true; });
    return (data.players || []).filter(function (p) { return p.active && p.goalie && !out[p.id]; }).map(function (p) { return p.id; });
  }

  // Goalies move only between Goalies and Out; skaters never go to Goalies.
  function allowed(id, pos) {
    var goalie = players[id] && players[id].goalie;
    if (goalie) return pos === "GOALIES" || pos === "OUT";
    return pos !== "GOALIES";
  }

  function listFor(pos) { return pos === "POOL" || pos === "GOALIES" ? null : slots[pos]; }

  function render() {
    ["POOL", "GOALIES"].concat(POSITIONS).forEach(function (pos) {
      var ul = document.querySelector('[data-list="' + pos + '"]');
      var ids = pos === "POOL" ? poolIds() : pos === "GOALIES" ? goalieIds() : slots[pos];
      ul.textContent = "";
      ids.forEach(function (id, index) {
        var li = document.createElement("li");
        li.className = "lu-chip" + (players[id].goalie ? " lu-goalie" : "") + (id === selected ? " selected" : "") + (players[id].active ? "" : " inactive");
        var prefix = linePrefix(pos);
        if (prefix) {
          var tag = document.createElement("span");
          tag.className = "lu-line";
          tag.textContent = prefix + (index + 1);
          li.appendChild(tag);
          li.appendChild(document.createTextNode(" "));
        }
        li.appendChild(document.createTextNode(players[id].label));
        if (players[id].pref && !players[id].goalie) {
          var pref = document.createElement("span");
          pref.className = "lu-pref-tag";
          pref.textContent = players[id].pref;
          pref.title = "Prefers " + players[id].pref;
          li.appendChild(document.createTextNode(" "));
          li.appendChild(pref);
        }
        li.setAttribute("data-id", id);
        li.setAttribute("role", "button");
        li.setAttribute("tabindex", "0");
        li.setAttribute("aria-pressed", id === selected ? "true" : "false");
        ul.appendChild(li);
      });
      if (!ids.length) {
        var none = document.createElement("li");
        none.className = "lu-none";
        none.textContent = pos === "POOL" ? "Everyone is placed. Drag a player here to un-place them." : pos === "GOALIES" ? "No goalie in net" : "Drop here";
        ul.appendChild(none);
      }
      var count = document.querySelector('[data-count="' + pos + '"]');
      if (count) count.textContent = String(ids.length);
    });
    document.body.classList.toggle("lu-selecting", Boolean(selected));
  }

  // Row labels so coaches read lines across: forwards L1, L2, L3; defence pairs P1, P2, P3.
  function linePrefix(pos) {
    if (pos === "LW" || pos === "C" || pos === "RW") return "L";
    if (pos === "LD" || pos === "RD") return "P";
    return "";
  }

  function move(id, pos, beforeId) {
    if (!allowed(id, pos)) {
      selected = null;
      render();
      status(players[id].goalie ? "Goalies can only go to Out." : "Only goalies go in the Goalies spot.", true);
      return;
    }
    POSITIONS.forEach(function (p) {
      var i = slots[p].indexOf(id);
      if (i !== -1) slots[p].splice(i, 1);
    });
    var target = listFor(pos);
    if (target) {
      var at = beforeId && beforeId !== id ? target.indexOf(beforeId) : -1;
      if (at === -1) target.push(id);
      else target.splice(at, 0, id);
    }
    selected = null;
    markDirty();
    render();
  }

  // ---------- auto-save (serialized: one request at a time, latest state wins) ----------
  var saveState = document.getElementById("lu-save-state");
  var saving = false;
  var queued = false;
  var failed = false;
  var timer = null;
  var retryDelay = 2000;

  function showSave(text, isError) {
    saveState.textContent = text;
    saveState.classList.toggle("error", Boolean(isError));
  }

  function markDirty(delay) {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(saveNow, typeof delay === "number" ? delay : 0);
  }

  function saveNow() {
    clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    if (saving) { queued = true; return; }
    saving = true;
    queued = false;
    dirty = false;
    showSave("Saving…");
    var body = { title: titleInput.value.trim(), slots: slots, notes: notesInput ? notesInput.value : "", stars: stars };
    var request = lineup.id ? api("PATCH", "/api/lineups/" + lineup.id, body) : api("POST", API, body);
    request
      .then(function (result) {
        var isNew = !lineup.id;
        lineup.id = result.lineup.id;
        lineup.shareToken = result.lineup.shareToken;
        failed = false;
        retryDelay = 2000;
        if (isNew) {
          history.replaceState(null, "", PAGE + lineup.id + "/");
          ["lu-delete", "lu-copy", "lu-regen", "lu-unshare"].forEach(function (id) {
            document.getElementById(id).disabled = false;
          });
        }
        saving = false;
        if (dirty || queued) { saveNow(); return; }
        showSave("Saved");
      })
      .catch(function (error) {
        saving = false;
        dirty = true;
        failed = true;
        // A rejected change (bad input) will not succeed on retry; show why instead.
        if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
          showSave("Couldn't save", true);
          status(error.message, true);
          return;
        }
        showSave("Couldn't save — retrying", true);
        timer = setTimeout(saveNow, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      });
  }

  function savePending() { return dirty || saving || failed; }

  function zoneOf(el) {
    var zone = el && el.closest ? el.closest("[data-pos]") : null;
    return zone ? zone.getAttribute("data-pos") : null;
  }

  // Tap: select a player, then tap a column (or a player in it) to move there.
  function tap(target) {
    var chip = target.closest(".lu-chip");
    var pos = zoneOf(target);
    if (chip && chip.hasAttribute("data-id")) {
      var id = chip.getAttribute("data-id");
      if (selected === id) { selected = null; render(); return; }
      if (selected) { move(selected, pos, id); return; }
      selected = id;
      render();
      return;
    }
    if (selected && pos) move(selected, pos, null);
  }

  // Where a drag would land: the zone under the pointer and the player to insert before
  // (null = end of the list). Uses chip midpoints, so dropping in a gap or on a chip works.
  function dropTarget(x, y, dragId) {
    var over = document.elementFromPoint(x, y);
    var zone = over && over.closest("[data-pos]");
    if (!zone) return null;
    var pos = zone.getAttribute("data-pos");
    var list = zone.querySelector("[data-list]");
    var chips = Array.prototype.filter.call(list.querySelectorAll(".lu-chip[data-id]"), function (c) {
      return c.getAttribute("data-id") !== dragId;
    });
    var before = null;
    if (pos !== "POOL" && pos !== "GOALIES") {
      for (var i = 0; i < chips.length; i++) {
        var r = chips[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { before = chips[i]; break; }
      }
    }
    return { zone: zone, pos: pos, list: list, chips: chips, before: before, beforeId: before ? before.getAttribute("data-id") : null };
  }

  var marker = document.createElement("div");
  marker.className = "lu-drop-marker";
  marker.hidden = true;
  document.body.appendChild(marker);

  function showDrop(target) {
    document.querySelectorAll("[data-pos].over").forEach(function (z) { z.classList.remove("over"); });
    marker.hidden = true;
    if (!target) return;
    target.zone.classList.add("over");
    if (target.pos === "POOL" || target.pos === "GOALIES") return;
    var listRect = target.list.getBoundingClientRect();
    var y;
    if (target.before) {
      y = target.before.getBoundingClientRect().top - 3;
    } else if (target.chips.length) {
      y = target.chips[target.chips.length - 1].getBoundingClientRect().bottom + 3;
    } else {
      y = listRect.top + 2;
    }
    marker.style.left = listRect.left + "px";
    marker.style.width = listRect.width + "px";
    marker.style.top = y - 2 + "px";
    marker.hidden = false;
  }

  // Pointer drag (mouse, touch, pen).
  var drag = null;
  var board = document.querySelector(".lu-editor");

  board.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (!event.target.closest("[data-pos]")) return;
    var chip = event.target.closest(".lu-chip[data-id]");
    drag = { id: chip ? chip.getAttribute("data-id") : null, chip: chip, x: event.clientX, y: event.clientY, active: false, ghost: null, pointer: event.pointerId };
    if (chip) {
      try { chip.setPointerCapture(event.pointerId); } catch (e) {}
    }
  });

  board.addEventListener("pointermove", function (event) {
    if (!drag || !drag.id || drag.pointer !== event.pointerId) return;
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) < 8) return;
      drag.active = true;
      var rect = drag.chip.getBoundingClientRect();
      drag.dx = event.clientX - rect.left;
      drag.dy = event.clientY - rect.top;
      drag.ghost = drag.chip.cloneNode(true);
      drag.ghost.className = "lu-chip lu-ghost";
      drag.ghost.style.width = rect.width + "px";
      document.body.appendChild(drag.ghost);
      drag.chip.classList.add("lu-dragging");
    }
    event.preventDefault();
    drag.ghost.style.left = event.clientX - drag.dx + "px";
    drag.ghost.style.top = event.clientY - drag.dy + "px";
    showDrop(dropTarget(event.clientX, event.clientY, drag.id));
    if (event.clientY < 70) window.scrollBy(0, -14);
    else if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
  });

  function endDrag(event, cancelled) {
    if (!drag || drag.pointer !== event.pointerId) return;
    var current = drag;
    drag = null;
    showDrop(null);
    if (current.ghost) current.ghost.remove();
    if (current.chip) current.chip.classList.remove("lu-dragging");
    if (cancelled) return;
    if (!current.active) { tap(event.target.closest ? event.target : current.chip); return; }
    var target = dropTarget(event.clientX, event.clientY, current.id);
    if (!target) return;
    move(current.id, target.pos, target.beforeId);
  }

  board.addEventListener("pointerup", function (event) {
    if (drag && drag.chip && !drag.active) {
      // Captured pointer: event.target is the chip; tap uses it directly.
      var chip = drag.chip;
      drag = null;
      tap(chip);
      return;
    }
    if (drag && !drag.id) {
      drag = null;
      tap(event.target);
      return;
    }
    endDrag(event, false);
  });
  board.addEventListener("pointercancel", function (event) { endDrag(event, true); });

  board.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var el = event.target.closest(".lu-chip[data-id], [data-pos] h2");
    if (!el) return;
    event.preventDefault();
    tap(el);
  });
  document.querySelectorAll("[data-pos] h2").forEach(function (h) { h.setAttribute("tabindex", "0"); });

  var gameSelect = document.getElementById("lu-game");
  if (gameSelect) {
    gameSelect.addEventListener("change", function () {
      titleInput.value = gameSelect.value;
      printTitle.textContent = titleInput.value.trim() || "Lineup";
      if (!gameSelect.value) titleInput.focus();
      markDirty(800);
    });
  }

  titleInput.addEventListener("input", function () {
    printTitle.textContent = titleInput.value.trim() || "Lineup";
    markDirty(800);
  });
  titleInput.addEventListener("blur", function () { if (dirty) saveNow(); });

  // ---------- after the game: notes + three stars (private) ----------
  if (notesInput) {
    notesInput.addEventListener("input", function () { markDirty(1200); });
    notesInput.addEventListener("blur", function () { if (dirty) saveNow(); });
  }
  var starSelects = Array.prototype.slice.call(document.querySelectorAll("select[data-star]"));
  function renderStars() {
    var roster = (data.players || []).filter(function (p) { return p.active || stars.indexOf(p.id) >= 0; });
    starSelects.forEach(function (sel) {
      var i = Number(sel.getAttribute("data-star"));
      var taken = {};
      stars.forEach(function (id, j) { if (id && j !== i) taken[id] = true; });
      sel.innerHTML = "";
      var none = document.createElement("option");
      none.value = "";
      none.textContent = "— None —";
      sel.appendChild(none);
      roster.forEach(function (p) {
        if (taken[p.id]) return;
        var o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.label + (p.goalie ? " (G)" : "");
        sel.appendChild(o);
      });
      sel.value = stars[i] || "";
      sel.classList.toggle("set", Boolean(stars[i]));
    });
  }
  starSelects.forEach(function (sel) {
    sel.addEventListener("change", function () {
      stars[Number(sel.getAttribute("data-star"))] = sel.value || null;
      renderStars();
      markDirty();
    });
  });
  renderStars();

  window.addEventListener("beforeunload", function (event) {
    if (!savePending()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  document.getElementById("lu-delete").addEventListener("click", function () {
    if (!lineup.id || !confirm("Delete this lineup? Its share link will stop working.")) return;
    api("DELETE", "/api/lineups/" + lineup.id)
      .then(function () { clearTimeout(timer); dirty = false; failed = false; location.href = PAGE; })
      .catch(function (error) { status(error.message, true); });
  });

  var linkInput = document.getElementById("lu-link");
  function shareUrl(token) { return location.origin + "/lineups/v/" + token + "/"; }
  function showLink(token, verb) {
    var url = shareUrl(token);
    linkInput.value = url;
    linkInput.hidden = false;
    var done = function () { status(verb); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () {
        linkInput.select();
        status("Copy the link below.");
      });
    } else {
      linkInput.select();
      status("Copy the link below.");
    }
  }

  document.getElementById("lu-copy").addEventListener("click", function () {
    if (!lineup.id) return;
    if (lineup.shareToken) { showLink(lineup.shareToken, "Link copied."); return; }
    api("POST", "/api/lineups/" + lineup.id + "/share", {})
      .then(function (result) { lineup.shareToken = result.shareToken; showLink(result.shareToken, "Link copied."); })
      .catch(function (error) { status(error.message, true); });
  });

  document.getElementById("lu-regen").addEventListener("click", function () {
    if (!lineup.id || !confirm("Make a new link? The old link will stop working.")) return;
    api("POST", "/api/lineups/" + lineup.id + "/share", { regenerate: true })
      .then(function (result) { lineup.shareToken = result.shareToken; showLink(result.shareToken, "New link copied. The old link no longer works."); })
      .catch(function (error) { status(error.message, true); });
  });

  document.getElementById("lu-unshare").addEventListener("click", function () {
    if (!lineup.id || !confirm("Turn off the share link? Anyone using it will see Not found.")) return;
    api("DELETE", "/api/lineups/" + lineup.id + "/share")
      .then(function () { lineup.shareToken = null; linkInput.hidden = true; linkInput.value = ""; status("Share link turned off."); })
      .catch(function (error) { status(error.message, true); });
  });

  render();
})();
