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
  const $buttonPrevious = document.querySelector('#button-previous');
  const $buttonStop = document.querySelector('#button-stop');
  const $cover = document.querySelector('#cover');
  const $list = document.querySelector('#list');
  const $pane = document.querySelector('#pane');
  const $player = document.querySelector('#player');
  const $progress = document.querySelector('#progress');
  const $search = document.querySelector('#search');
  const $targets = document.querySelector('#targets');
  const $titleName = document.querySelector('#title-name');
  const $titleError = document.querySelector('#title-error');
  const $video = document.querySelector('#video');

  const $rippleElements = [];
  const ripples = (...ripples) => {
    let next$RippleIdx = 0;
    for (const [x, y, $parent] of ripples) {
      const $ripple = $rippleElements[next$RippleIdx] =
        $rippleElements[next$RippleIdx] || document.createElement('div');

      $ripple.classList.remove('ripple');
      Object.assign($ripple.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
      $parent.appendChild($ripple);
      // Reflow the element so the animation plays again.
      // In Edge if $ripple doesn't move the animation won't repeat otherwise.
      $ripple.clientWidth;
      $ripple.classList.add('ripple');
      $ripple.clientWidth;

      next$RippleIdx++;
    }
    $rippleElements.splice(next$RippleIdx).forEach($r => $r.remove());
  };
  const ripple = (x, y, $parent) => {
    ripples([x, y, $parent]);
  };

  $buttonFullscreen.addEventListener('click', () => toggleFullscreen());
  $buttonNext.addEventListener('click', () => videoControl.next());
  $buttonPlayback.addEventListener('click', () => videoControl.togglePlayback());
  $buttonPrevious.addEventListener('click', () => videoControl.previous());
  $buttonStop.addEventListener('click', () => videoControl.current = null);

  // TODO Should mute/pause as well?
  const toggleCover = force => $cover.style.display = (force || document[hiddenPropertyName]) ? 'block' : 'none';

  document.addEventListener(visibilityChangeEventName, () => toggleCover());

  window.addEventListener('focus', () => toggleCover(false));
  window.addEventListener('blur', () => toggleCover(true));

  $buttonCoverClose.addEventListener('click', () => toggleCover(false));

  $list.addEventListener('click', e => {
    if (e.target.classList.contains('entry-link')) {
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
        const listHeight = $list.clientHeight;
        if (offsetTop > listHeight * 0.95) {
          $list.scrollTop += offsetTop - $list.clientHeight + 120;
        } else if (offsetTop < listHeight * 0.15) {
          $list.scrollTop += offsetTop - 150;
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
      if (this._current && this._current.nextElementSibling) {
        this.current = this._current.nextElementSibling;
        this.scrollToCurrent();
      }
    },
    previous () {
      if (this._current && this._current.previousElementSibling) {
        this.current = this._current.previousElementSibling;
        this.scrollToCurrent();
      }
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
    $titleError.textContent = $video.error.message;
  });

  // This event listener handles and two or more chained clicks/taps for rewinding/fast-forwarding,
  // and tapping with two fingers for toggling playback.
  // The first tap is always used to just disengage. This is because moving the mouse automatically
  // disengages but touch users don't have an easy way to disengage.
  let playerLastPressTime;
  // Often a tap with two fingers is registered as a touch event with one touch, followed almost
  // instantly with another event with two touches.
  let oneTouchSetTimeout;
  configureTargets((direction, e) => {
    clearTimeout(oneTouchSetTimeout);
    if (uiState.loaded) {
      if (e.touches && e.touches.length === 2) {
        videoControl.togglePlayback();
        ripples(...touch.getRelativeTouchCoordiates(e.touches, $targets).map(([x, y]) => [x, y, $targets]));
        return;
      }

      if (Date.now() < playerLastPressTime + 500) {
        // Chained fast-forward with 2+ clicks/taps
        oneTouchSetTimeout = setTimeout((direction, $target) => {
          $video.currentTime += 10 * direction;
          ripple(...touch.getOffsetCoordinatesOfEvent(e), $target);
        }, 100, direction, e.target);
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
  document.addEventListener('touchstart', () => uiState.engaged = false, true);
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
