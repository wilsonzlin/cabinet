"use strict";

(() => {
  Document.prototype.exitFullscreen =
    Document.prototype.exitFullscreen ||
    Document.prototype.webkitExitFullscreen ||
    Document.prototype.mozCancelFullScreen ||
    Document.prototype.msExitFullscreen;

  HTMLElement.prototype.requestFullscreen =
    HTMLElement.prototype.requestFullscreen ||
    HTMLElement.prototype.webkitRequestFullscreen ||
    HTMLElement.prototype.mozRequestFullScreen ||
    HTMLElement.prototype.msRequestFullscreen;

  const [hiddenPropertyName, visibilityChangeEventName] = (() => {
    if (document.hidden !== undefined) {
      return ["hidden", "visibilitychange"];
    } else if (document.msHidden !== undefined) {
      return ["msHidden", "msvisibilitychange"];
    } else if (document.webkitHidden !== undefined) {
      return ["webkitHidden", "webkitvisibilitychange"];
    }
  })();

  /**
   * States:
   *  - engaged: Video is playing and user has not recently interacted with video.
   *  - hoveringProcess: User is hovering over the progress with a mouse.
   *  - loaded: A video is currently showing but could be paused.
   *  - playing: Video is currently in motion.
   *  - usingTouch: User is using touch input.
   */
  const uiState = createUiState([
    "engaged",
    "fullscreen",
    "hoveringProgress",
    "loaded",
    "playing",
    "usingTouch",
  ]);

  const $buttonCoverClose = document.querySelector("#button-cover-close");
  const $buttonFullscreen = document.querySelector("#button-fullscreen");
  const $buttonNext = document.querySelector("#button-next");
  const $buttonPlayback = document.querySelector("#button-playback");
  const $buttonPrevious = document.querySelector("#button-previous");
  const $buttonStop = document.querySelector("#button-stop");
  const $cover = document.querySelector("#cover");
  const $list = document.querySelector("#list");
  const $pane = document.querySelector("#pane");
  const $player = document.querySelector("#player");
  const $progress = document.querySelector("#progress");
  const $search = document.querySelector("#search");
  const $title = document.querySelector("#title");
  const $video = document.querySelector("#video");

  $buttonFullscreen.addEventListener("click", () => toggleFullscreen());
  $buttonNext.addEventListener("click", () => videoControl.next());
  $buttonPlayback.addEventListener("click", () => videoControl.togglePlayback());
  $buttonPrevious.addEventListener("click", () => videoControl.previous());
  $buttonStop.addEventListener("click", () => videoControl.current = null);

  // TODO Should mute/pause as well?
  const toggleCover = force => $cover.style.display = (force || document[hiddenPropertyName]) ? "block" : "none";

  document.addEventListener(visibilityChangeEventName, () => toggleCover());

  window.addEventListener("focus", () => toggleCover(false));
  window.addEventListener("blur", () => toggleCover(true));

  $buttonCoverClose.addEventListener("click", () => toggleCover(false));

  $list.addEventListener("click", e => {
    if (e.target.tagName === "A") {
      e.preventDefault();
      videoControl.current = e.target.parentNode;
    }
  });

  configureSearch({
    $input: $search,
    getEntries: () => $list.children,
    getEntryValue: $entry => $entry.children[1].textContent,
    onSearchEnd: () => videoControl.scrollToCurrent(),
  });

  const videoControl = {
    _current: null,
    scrollToCurrent () {
      const $entry = this._current;
      if ($entry) {
        const offsetTop = $entry.getBoundingClientRect().top;
        // TODO Change to $list height
        const windowHeight = document.documentElement.clientHeight;
        if (offsetTop > windowHeight * 0.9) {
          $list.scrollTop += offsetTop - $list.clientHeight + 150;
        } else if (offsetTop < windowHeight * 0.1) {
          $list.scrollTop += offsetTop - 150;
        }
      }
    },
    set current ($entry) {
      if ($entry) {
        const $link = $entry.children[1];
        $video.src = $link.href;
        $title.textContent = $link.textContent;
        $entry.dataset.current = true;
        uiState.loaded = true;
      } else {
        $video.src = null;
        $title.textContent = "";
        $progress.max = 0;
        uiState.loaded = uiState.playing = false;
      }

      if (this._current) {
        delete this._current.dataset.current;
      }
      this._current = $entry;
    },
    togglePlayback () {
      uiState.playing ? $video.pause() : $video.play();
    },
    next () {
      if (this._current && this._current.nextElementSibling) {
        this.current = this._current.nextElementSibling;
      }
    },
    previous () {
      if (this._current && this._current.previousElementSibling) {
        this.current = this._current.previousElementSibling;
      }
    },
  };

  $progress.addEventListener("mouseenter", () => uiState.hoveringProgress = true);
  $progress.addEventListener("mouseleave", () => uiState.hoveringProgress = false);
  $progress.addEventListener("input", () => $video.currentTime = $progress.value);

  $video.addEventListener("ended", () => uiState.playing = false);
  $video.addEventListener("loadedmetadata", () => $progress.max = $video.duration);
  $video.addEventListener("play", () => uiState.playing = true);
  $video.addEventListener("pause", () => uiState.playing = uiState.engaged = false);
  $video.addEventListener("timeupdate", () => $progress.value = $video.currentTime);

  let playerLastClickTime;
  let playerSingleClickSetTimeout;
  // This event listener handles single clicks/taps for toggling playback
  // and two or more clicks/taps for rewinding/fast-forwarding.
  // TODO Gestures
  // TODO This does not make it convenient to pause on touch
  configureTargets(direction => {
    clearTimeout(playerSingleClickSetTimeout);
    if (playerLastClickTime + 500 >= Date.now()) {
      // Chained fast-forward with 2+ clicks/taps
      if (uiState.loaded) {
        $video.currentTime += 10 * direction;
      }
    } else {
      playerSingleClickSetTimeout = setTimeout(() => {
        if (uiState.usingTouch && uiState.engaged) {
          uiState.engaged = false;
        } else {
          videoControl.togglePlayback();
        }
      }, 200);
    }
    playerLastClickTime = Date.now();
  });

  let lastTouchStart;
  window.addEventListener("touchstart", e => {
    uiState.usingTouch = true;
    lastTouchStart = Date.now();
  });

  let engagedSetTimeout;
  window.addEventListener("mousemove", e => {
    clearTimeout(engagedSetTimeout);
    // This is necessary as mousemove events are also emitted while touching,
    // so we need to ensure that this was caused by a mouse and not touch input.
    // If it's been long enough since we've last seen a touch event (or one
    // has never occured), we assume that the input is (or has changed to) a mouse.
    const usingMouse = lastTouchStart === undefined || Date.now() > lastTouchStart + 500;
    if (usingMouse) {
      uiState.usingTouch = false;
      uiState.engaged = false;
    }
    engagedSetTimeout = setTimeout(() => {
      if (uiState.playing && !uiState.hoveringProgress) {
        uiState.engaged = true;
      }
    }, usingMouse ? 1000 : 3000);
  }, true);

  const toggleFullscreen = () => {
    if (navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform)) {
      uiState.fullscreen = !uiState.fullscreen;
      $pane.style.display = uiState.fullscreen ? "none" : "";
      return;
    }

    if (uiState.fullscreen) {
      document.exitFullscreen();
    } else {
      $player.requestFullscreen();
    }
  };

  const onFullscreenChange = e => {
    uiState.fullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  };
  for (const event of [
    "fullscreenchange",
    "webkitfullscreenchange",
    "mozfullscreenchange",
    "msfullscreenchange",
  ]) {
    window.addEventListener(event, onFullscreenChange);
  }

  window.addEventListener("keydown", e => {
    if (document.activeElement !== $search) {
      switch (e.keyCode) {
      case 32: // Space
      case 75: // k
        e.preventDefault();
        videoControl.togglePlayback();
        break;

      case 74: // j
      case 76: // l
        if (uiState.loaded) {
          $video.currentTime += 5 * (e.keyCode - 75);
        }
        break;

      case 37: // Left
      case 39: // Right
        e.preventDefault();
        if (uiState.loaded) {
          $video.currentTime += 10 * (e.keyCode - 38);
        }
        break;

      case 48: // 0 (Zero)
        $video.currentTime = 0;
        break;

      case 83: // s
        videoControl.current = null;
        break;

      case 65: // a
        videoControl.previous();
        break;
      case 68: // d
        videoControl.next();
        break;

      case 70: // f
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          $search.focus();
        }
        break;

      case 27: // Escape
        // NOTE: Most browsers won't trigger a keydown event if fullscreen and user pressed Esc
        if (uiState.fullscreen) {
          e.preventDefault(); // Prevent escaping fullscreen on macOS
          toggleFullscreen();
        }
        break;
      }
    } else {
      switch (e.keyCode) {
      case 27: // Escape
        e.preventDefault(); // Prevent escaping fullscreen on macOS
        $search.blur();
        break;

      case 70: // f
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
        }
        break;
      }
    }
  }, true);
})();
