(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    document.querySelectorAll("video[loop]").forEach(function (video) {
      video.removeAttribute("loop");
    });
  }

  function fitVideos() {
    document.querySelectorAll(".drill-video").forEach(function (video) {
      if (!video.videoWidth || !video.videoHeight) return;
      var frame = video.closest(".video-frame");
      if (!frame) return;
      var column = frame.parentElement.clientWidth;
      var maxHeight = Math.min(window.innerHeight * 0.72, 740);
      var width = Math.min(column, (maxHeight * video.videoWidth) / video.videoHeight);
      frame.style.width = Math.max(1, Math.round(width)) + "px";
      video.style.aspectRatio = video.videoWidth + " / " + video.videoHeight;
      video.style.maxHeight = "none";
    });
  }

  document.querySelectorAll(".drill-video").forEach(function (video) {
    if (video.readyState >= 1) fitVideos();
    video.addEventListener("loadedmetadata", fitVideos);
  });
  window.addEventListener("resize", fitVideos);

  var buttons = document.querySelectorAll("[data-filter]");
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
