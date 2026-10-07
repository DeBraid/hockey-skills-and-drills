(function () {
  var buttons = document.querySelectorAll("[data-filter]");
  var frames = document.querySelectorAll(".drill-anim");

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

  if (!buttons.length) return;

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
})();
