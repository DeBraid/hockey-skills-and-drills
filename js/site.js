(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    document.querySelectorAll("video[loop]").forEach(function (video) {
      video.removeAttribute("loop");
    });
  }

  function fitFrame(media, width, height) {
    if (!width || !height) return;
    var frame = media.closest(".video-frame");
    if (!frame) return;
    var column = frame.parentElement.clientWidth;
    var maxHeight = Math.min(window.innerHeight * 0.72, 740);
    var fitted = Math.min(column, (maxHeight * width) / height);
    frame.style.width = Math.max(1, Math.round(fitted)) + "px";
    media.style.aspectRatio = width + " / " + height;
    media.style.maxHeight = "none";
  }

  function fitVideos() {
    document.querySelectorAll(".drill-video").forEach(function (video) {
      fitFrame(video, video.videoWidth, video.videoHeight);
    });
    document.querySelectorAll(".drill-gif").forEach(function (img) {
      fitFrame(img, img.naturalWidth, img.naturalHeight);
    });
  }

  document.querySelectorAll(".drill-video").forEach(function (video) {
    if (video.readyState >= 1) fitVideos();
    video.addEventListener("loadedmetadata", fitVideos);
  });
  document.querySelectorAll(".drill-gif").forEach(function (img) {
    var still = img.getAttribute("data-still");
    function showStill() {
      if (!still || img.getAttribute("src") === still) return;
      img.src = still;
    }
    img.addEventListener("error", showStill);
    if (reduceMotion) showStill();
    if (img.complete && img.naturalWidth) fitVideos();
    img.addEventListener("load", fitVideos);
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
