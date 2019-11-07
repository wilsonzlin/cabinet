'use strict';

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
      return ['hidden', 'visibilitychange'];
    } else if (document.msHidden !== undefined) {
      return ['msHidden', 'msvisibilitychange'];
    } else if (document.webkitHidden !== undefined) {
      return ['webkitHidden', 'webkitvisibilitychange'];
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
    'engaged',
    'fullscreen',
    'hoveringProgress',
    'loaded',
    'playing',
    'usingTouch',
  ]);

  const $buttonCoverClose = document.querySelector('#button-cover-close');
  const $buttonFullscreen = document.querySelector('#button-fullscreen');
  const $buttonNext = document.querySelector('#button-next');
  const $buttonPlayback = document.querySelector('#button-playback');
  const $buttonPlaybackTouchOnly = document.querySelector('#button-playback-touch-only');
  const $buttonPrevious = document.querySelector('#button-previous');
  const $buttonStop = document.querySelector('#button-stop');
  const $cover = document.querySelector('#cover');
  const $$entry = [...document.querySelectorAll('.entry')];
  const $folders = document.querySelector('#folders');
  const $pane = document.querySelector('#pane');
  const $player = document.querySelector('#player');
  const $progress = document.querySelector('#progress');
  const $search = document.querySelector('#search');
  const $speed = document.querySelector('#speed');
  const $targets = document.querySelector('#targets');
  const $titleName = document.querySelector('#title-name');
  const $titleError = document.querySelector('#title-error');
  const $video = document.querySelector('#video');

  $buttonFullscreen.addEventListener('click', () => toggleFullscreen());
  $buttonNext.addEventListener('click', () => videoControl.next());
  $buttonPlayback.addEventListener('click', () => videoControl.togglePlayback());
  $buttonPlaybackTouchOnly.addEventListener('touchstart', () => {
    const $b = $buttonPlaybackTouchOnly;
    videoControl.togglePlayback();
    // Show ripple through centre of button regardless of where tapped.
    ripples.one($targets, touch.getRelativeCoordinates(
      position.left($b) + position.width($b) / 2,
      position.top($b) + position.height($b) / 2,
      position.all($targets)
    ));
  });
  $buttonPrevious.addEventListener('click', () => videoControl.previous());
  $buttonStop.addEventListener('click', () => videoControl.current = null);

  // TODO Should mute/pause as well?
  const toggleCover = (shouldShow = document[hiddenPropertyName]) => $cover.style.display = shouldShow
    ? 'block'
    : 'none';

  document.addEventListener(visibilityChangeEventName, () => toggleCover());

  window.addEventListener('focus', () => toggleCover(false));
  window.addEventListener('blur', () => toggleCover(true));

  $buttonCoverClose.addEventListener('click', () => toggleCover(false));

  $folders.addEventListener('click', e => {
    if (e.target.classList.contains('entry-link')) {
      videoControl.current = e.target.parentNode;
    }
  });

  configureSearch({
    $input: $search,
    getEntries: () => $$entry,
    getEntryValue: $entry => $entry.children[1].textContent,
    onSearchEnd: () => videoControl.scrollToCurrent(),
  });

  // Probably don't need to sync with $video.onratechange, as only $speed should be able to set speed.
  $speed.addEventListener('change', e => {
    $video.playbackRate = +e.target.value;
  });

  const videoControl = {
    _current: null,
    scrollToCurrent () {
      const $entry = this._current;
      if ($entry) {
        const offsetTop = $entry.getBoundingClientRect().top;
        const listHeight = position.height($folders);
        if (offsetTop > listHeight * 0.95) {
          $folders.scrollTop += offsetTop - $folders.clientHeight + 120;
        } else if (offsetTop < listHeight * 0.15) {
          $folders.scrollTop += offsetTop - 150;
        }
      }
    },
    set current ($entry) {
      if ($entry === this._current) {
        return;
      }

      if ($entry) {
        const $link = $entry.children[1];
        $video.src = $link.dataset.url;
        // playbackRate resets on new media.
        $video.playbackRate = $speed.value;
        $titleName.textContent = $link.textContent;
        $entry.dataset.current = true;
        uiState.loaded = true;
      } else {
        // This is necessary because removeAttribute only hides video in Firefox; audio still continues.
        $video.pause();
        // Setting to null, undefined, or "" in Firefox actually loads "null", "undefined", or "".
        $video.removeAttribute('src');
        $titleName.textContent = '';
        $progress.max = 0;
        // Browsers don't consistently fire "pause" or "ended" events when changing
        // sources, so set engaged state here.
        uiState.loaded = uiState.playing = uiState.engaged = false;
      }

      $titleError.textContent = '';
      if (this._current) {
        delete this._current.dataset.current;
      }
      this._current = $entry;
    },
    togglePlayback () {
      // Firefox seems to insist on playing even if no video is loaded.
      if (this._current) {
        uiState.playing ? $video.pause() : $video.play();
      }
    },
    next () {
      // This should end if currently the last video and start from beginning if nothing loaded.
      this.current = $$entry[$$entry.indexOf(this._current) + 1] || null;
      this.scrollToCurrent();
    },
    previous () {
      // This should end if currently the first video and start from end if nothing loaded.
      this.current = (this._current == null
        ? $$entry[$$entry.length - 1]
        : $$entry[$$entry.indexOf(this._current) - 1])
        || null;
      this.scrollToCurrent();
    },
  };

  touch.onMouse($progress, 'mouseenter', () => uiState.hoveringProgress = true);
  touch.onMouse($progress, 'mouseleave', () => uiState.hoveringProgress = false);
  $progress.addEventListener('input', () => $video.currentTime = $progress.value);

  $video.addEventListener('ended', () => uiState.playing = uiState.engaged = false);
  $video.addEventListener('loadedmetadata', () => $progress.max = $video.duration);
  $video.addEventListener('play', () => uiState.playing = true);
  $video.addEventListener('pause', () => uiState.playing = uiState.engaged = false);
  $video.addEventListener('timeupdate', () => $progress.value = $video.currentTime);
  $video.addEventListener('error', e => {
    uiState.playing = uiState.engaged = uiState.loaded = false;
    console.error($video.error);
    $titleError.textContent = $video.error && $video.error.message || 'An unknown error occurred';
  });

  // This event listener handles and two or more chained clicks/taps for rewinding/fast-forwarding,
  // and tapping just once for toggling engagement.
  // Balance wait time between average duration between two or more clicks/taps and maximum delay
  // before UI feels unresponsive.
  const CHAINED_PRESSES_WAIT_MS = 250;
  let playerLastPressTime;
  let singlePressTimeout;
  touch.onMouse($targets, 'click', e => {
    clearTimeout(singlePressTimeout);
    if (uiState.loaded) {
      if (Date.now() - playerLastPressTime < CHAINED_PRESSES_WAIT_MS) {
        toggleFullscreen();
        // Undo single click effects.
        videoControl.togglePlayback();
        ripples.none();
        playerLastPressTime = undefined;
      } else {
        videoControl.togglePlayback();
        ripples.one($targets, touch.getRelativeEventCoordinates(e, $targets));
        playerLastPressTime = Date.now();
      }
    }
  });
  // Only disengage if intentional touch, with no movement over screen.
  $targets.addEventListener('touchend', e => {
    clearTimeout(singlePressTimeout);
    if (uiState.loaded && !touch.moved()) {
      if (Date.now() - playerLastPressTime < CHAINED_PRESSES_WAIT_MS) {
        // Chained fast-forward with 2+ clicks/taps
        uiState.engaged = false;
        $video.currentTime += 10 * targets.getDirection(e);
        ripples.one(e.target, touch.getRelativeTouchCoordiates(touch.lastTouches()[0], e.target));
      } else {
        // If no more taps happen with the next CHAINED_PRESSES_WAIT_MS,
        // toggle engagement.
        singlePressTimeout = setTimeout(engaged => uiState.engaged = engaged, CHAINED_PRESSES_WAIT_MS, !uiState.engaged);
      }
      playerLastPressTime = Date.now();
    }
  });

  // Note that Edge will send mouse events even if the user is touching,
  // so for consistency use one idle timeout for both mouse and touch.
  // https://github.com/MicrosoftEdge/WebAppsDocs/issues/39
  const IDLE_MS_BEFORE_ENGAGED = 7500;
  let engagedSetTimeout;
  touch.onChange(usingTouch => uiState.usingTouch = usingTouch);
  // Don't set engaged state until touch has ended.
  document.addEventListener('touchend', () => {
    clearTimeout(engagedSetTimeout);
    engagedSetTimeout = setTimeout(() => {
      if (uiState.playing) {
        uiState.engaged = true;
      }
    }, IDLE_MS_BEFORE_ENGAGED);
  }, true);
  touch.onMouse(document, 'mousemove', () => {
    clearTimeout(engagedSetTimeout);
    uiState.usingTouch = false;
    uiState.engaged = false;
    engagedSetTimeout = setTimeout(() => {
      if (uiState.playing && !uiState.hoveringProgress) {
        uiState.engaged = true;
      }
    }, IDLE_MS_BEFORE_ENGAGED);
  }, true);

  const toggleFullscreen = () => {
    if (navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform)) {
      uiState.fullscreen = !uiState.fullscreen;
      $pane.style.display = uiState.fullscreen ? 'none' : '';
      return;
    }

    if (uiState.fullscreen) {
      document.exitFullscreen();
    } else {
      $player.requestFullscreen();
    }
  };

  const onFullscreenChange = () => {
    uiState.fullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  };
  for (const event of [
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'msfullscreenchange',
  ]) {
    window.addEventListener(event, onFullscreenChange);
  }

  window.addEventListener('keydown', e => {
    if (document.activeElement !== $search && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
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

      case 27: // Escape
        // NOTE: Most browsers won't trigger a keydown event if fullscreen and user pressed Esc
        if (uiState.fullscreen) {
          e.preventDefault(); // Prevent escaping fullscreen on macOS
          toggleFullscreen();
        }
        break;
      }
    }
  }, true);
})();
