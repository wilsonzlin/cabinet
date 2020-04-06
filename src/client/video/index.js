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

  const leftPad = (str, n, pad = '0') => {
    return pad.repeat(n - String(str).length) + str;
  };

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
    'hideList',
    'hoveringProgress',
    'loaded',
    'playing',
    'scrubbing',
    'usingTouch',
  ]);

  const $buttonCoverClose = document.querySelector('#button-cover-close');
  const $buttonDislike = document.querySelector('#button-dislike');
  const $buttonFullscreen = document.querySelector('#button-fullscreen');
  const $buttonLike = document.querySelector('#button-like');
  const $buttonListHide = document.querySelector('#button-list-hide');
  const $buttonListShow = document.querySelector('#button-list-show');
  const $buttonNext = document.querySelector('#button-next');
  const $buttonPlaybackTouchOnly = document.querySelector('#button-playback-touch-only');
  const $buttonPrevious = document.querySelector('#button-previous');
  const $buttonSettings = document.querySelector('#button-settings');
  const $buttonStop = document.querySelector('#button-stop');
  const $cover = document.querySelector('#cover');
  const $$entry = [...document.querySelectorAll('.entry')];
  const $filter = document.querySelector('#filter');
  const $folders = document.querySelector('#folders');
  const $$folderName = document.querySelectorAll('.folder-name');
  const $notification = document.querySelector('#notification');
  const $notificationText = document.querySelector('#notification-text');
  const $notificationProgress = document.querySelector('#notification-progress');
  const $playbackMontagesContainer = document.querySelector('#playback-montages-container');
  const $playbackMontages = document.querySelector('#playback-montages');
  const $$playbackMontageOverlayMask = document.querySelectorAll('.playback-montage-overlay-mask');
  const $player = document.querySelector('#player');
  const $playerControls = document.querySelector('#player-controls');
  const $progress = document.querySelector('#progress');
  const $search = document.querySelector('#search');
  const $speed = document.querySelector('#speed');
  const $targets = document.querySelector('#targets');
  const $time = document.querySelector('#time');
  const $titleName = document.querySelector('#title-name');
  const $titleError = document.querySelector('#title-error');
  const $video = document.querySelector('#video');

  const notification = (() => {
    const TIMEOUT_ANIMATION_CLASS = 'notification-progress-animate-timeout';
    const VISIBLE_CLASS = 'notification-visible';

    // Keep in sync with #notification style.
    const TRANSITION_DURATION = 300;

    let timeout;
    return {
      notify (msg, duration = 1200) {
        clearTimeout(timeout);

        cls($notification, VISIBLE_CLASS, true);

        cls($notificationProgress, TIMEOUT_ANIMATION_CLASS, false);
        reflow($notificationProgress);
        cls($notificationProgress, TIMEOUT_ANIMATION_CLASS, true);
        $notificationProgress.style.animationDuration = `${duration}ms`;
        reflow($notificationProgress);

        $notificationText.textContent = msg;
        timeout = setTimeout(() => cls($notification, VISIBLE_CLASS, false), duration - TRANSITION_DURATION);
      },
    };
  })();

  // Button only rendered when signed in.
  $buttonLike && $buttonLike.addEventListener('click', () => {
    const $entry = videoControl.current;
    if ($entry) {
      fetch(`/user/video/${$entry.dataset.id}/like`, {
        method: 'POST',
      })
        .then(res => res.json())
        .then(({liked}) => attr($entry, 'liked', liked));
    }
  });
  // Button only rendered when signed in.
  $buttonDislike && $buttonDislike.addEventListener('click', () => {
    const $entry = videoControl.current;
    if ($entry) {
      fetch(`/user/video/${$entry.dataset.id}/dislike`, {
        method: 'POST',
      })
        .then(res => res.json())
        .then(({disliked}) => attr($entry, 'disliked', disliked));
    }
  });

  $buttonListHide.addEventListener('click', () => uiState.hideList = true);
  $buttonListShow.addEventListener('click', () => uiState.hideList = false);
  $buttonSettings.addEventListener('click', () => prefs.open());

  $buttonFullscreen.addEventListener('click', () => toggleFullscreen());
  $buttonNext.addEventListener('click', () => videoControl.next());
  $buttonPlaybackTouchOnly.addEventListener('touchstart', () => {
    const $b = $buttonPlaybackTouchOnly;
    videoControl.togglePlayback();
    // Show ripple through centre of button regardless of where tapped.
    ripples.one($targets, touch.getRelativeCoordinates(
      position.left($b) + position.width($b) / 2,
      position.top($b) + position.height($b) / 2,
      position.all($targets),
    ));
  });
  $buttonPrevious.addEventListener('click', () => videoControl.previous());
  $buttonStop.addEventListener('click', () => videoControl.current = null);

  // TODO Should mute/pause as well?
  const toggleCover = (shouldShow = document[hiddenPropertyName]) => $cover.style.display = shouldShow && prefs.usePrivacyCover ? 'block' : 'none';
  document.addEventListener(visibilityChangeEventName, () => toggleCover());
  window.addEventListener('focus', () => toggleCover(false));
  window.addEventListener('blur', () => toggleCover(true));
  $buttonCoverClose.addEventListener('click', () => toggleCover(false));

  for (const $entry of $$entry) {
    $entry.addEventListener('click', () => videoControl.current = $entry);
    const $preview = $entry.querySelector('.entry-preview');
    const $snippet = $entry.querySelector('.entry-snippet');
    if ($preview) {
      $preview.addEventListener('mouseenter', () => {
        if (prefs.showVideoSnippets) {
          $snippet.currentTime = 0;
          $snippet.play();
        }
      });
      $preview.addEventListener('mouseleave', () => $snippet.pause());
    }
  }

  $filter.addEventListener('change', () => {
    const filter = $filter.value.split(' ');
    for (const $entry of $$entry) {
      const liked = $entry.dataset.liked;
      const disliked = $entry.dataset.disliked;
      attr($entry, 'filtered', !(
        liked && filter.includes('liked')
        || disliked && filter.includes('disliked')
        || !liked && !disliked && filter.includes('neutral')
      ));
    }
  });

  configureSearch({
    $input: $search,
    getEntries: () => $$entry,
    getEntryValue: $entry => $entry.textContent,
    onSearchEnd: () => {
      videoControl.scrollToCurrent();
      for (const $name of $$folderName) {
        $name.hidden = [
          ...$name
            .nextElementSibling // .folder-videos-container.
            .firstElementChild // .folder-videos-list.
            .children, // [.entry, .entry, .entry, ...].
        ].every($entry => $entry.hidden);
      }
    },
  });
  prefs.onChange('groupVideosByFolder', val => cls($folders, 'folders-show-titles', val));
  prefs.onChange('showVideoThumbnails', val => cls($folders, 'folders-show-thumbnails', val));
  prefs.onChange('showVideoSnippets', val => cls($folders, 'folders-show-snippets', val));

  const lazyLoadingObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const $entry = entry.target;
        $entry.src = $entry.dataset.src;
        lazyLoadingObserver.unobserve($entry);
      }
    }
  });
  document.querySelectorAll('.lazy').forEach($e => lazyLoadingObserver.observe($e));

  // Probably don't need to sync with $video.onratechange, as only $speed should be able to set speed.
  $speed.addEventListener('click', e => {
    // Firefox triggers click event on input as well.
    if (e.target.tagName === 'DIV') {
      cls($speed, 'expanded');
    }
  });
  $speed.addEventListener('change', e => videoControl.speed = e.target.value);

  const videoControl = {
    _current: null,
    // Need to store as playbackRate is reset on every new media.
    _speed: 1,
    set speed (val) {
      this._speed = $video.playbackRate = val;
    },
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
    get current () {
      return this._current;
    },
    set current ($entry) {
      if ($entry === this._current) {
        return;
      }

      if ($entry) {
        $video.src = `/stream/${$entry.dataset.id}`;
        // playbackRate resets on new media.
        $video.playbackRate = this._speed;
        $titleName.textContent = $entry.textContent;
        attr($entry, 'current', true);
        uiState.loaded = true;
        // For some videos FF doesn't seem to autoplay sometimes.
        // It might be because video doesn't have its moov atom at the beginning,
        // and FF doesn't want to download entire video.
        // Video might also be not well-formed.
        $video.play();
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
        attr(this._current, 'current', false);
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
      let next = this._current;
      do {
        next = $$entry[$$entry.indexOf(next) + 1];
      } while (next && (next.hidden || next.dataset.filtered));
      this.current = next || null;
      this.scrollToCurrent();
    },
    previous () {
      // This should end if currently the first video and start from end if nothing loaded.
      let prev = this._current;
      do {
        prev = prev == null
          ? $$entry[$$entry.length - 1]
          : $$entry[$$entry.indexOf(prev) - 1];
      } while (prev && (prev.hidden || prev.dataset.filtered));
      this.current = prev || null;
      this.scrollToCurrent();
    },
    seekRelative (seconds) {
      if (this.current) {
        $video.currentTime += seconds;
        if (seconds > 0) {
          notification.notify(`Fast forward ${seconds}s`);
        } else {
          notification.notify(`Rewind ${-seconds}s`);
        }
      }
    },
    // Value between 0 and 100 (inclusive).
    seekPercentile (percentile) {
      if (this.current) {
        $video.currentTime = $video.duration * percentile / 100;
        switch (percentile) {
        case 0:
          notification.notify(`Jump to beginning`);
          break;
        case 50:
          notification.notify(`Jump to middle`);
          break;
        default:
          notification.notify(`Jump to ${percentile}%`);
        }
      }
    },
  };

  const formatTime = dur => {
    const seconds = Math.round(dur % 60);
    const minutes = Math.round((dur / 60) % 60);
    const hours = Math.round(dur / 3600);
    return hours
      ? `${hours}:${leftPad(minutes, 2)}:${leftPad(seconds, 2)}`
      : `${minutes}:${leftPad(seconds, 2)}`;
  };

  let timeUpdater;
  const updateTime = () => {
    $time.textContent = [
      formatTime($progress.value),
      `-${formatTime($progress.max - $progress.value)}`,
    ].join(' / ');
  };

  let wasPlayingBeforeScrubbing;
  touch.onMouse($progress, 'mouseenter', () => uiState.hoveringProgress = true);
  $progress.addEventListener('mousedown', () => {
    wasPlayingBeforeScrubbing = uiState.playing;
  }, true);
  touch.onMouse($progress, 'mousemove', e => {
    // Hide montage; we'll show it again at the end of this function if we find a montage and frame to show.
    $playbackMontagesContainer.classList.remove('showing');
    // TODO Optimise and do nothing if unchanged
    if (!prefs.showVideoMontage || !videoControl.current) {
      return;
    }
    const position = e.offsetX / $progress.clientWidth;
    const $montage = [...$playbackMontages.children].filter($m => {
      const isCurrent = $m.dataset.id === videoControl.current.dataset.id;
      $m.classList.toggle('active', isCurrent);
      return isCurrent;
    })[0];
    if (!$montage) {
      return;
    }
    const $preview = videoControl.current.querySelector('.entry-preview');
    // TODO Handle viewport resize/rotation?
    const montagePadding = $playerControls.clientWidth / 2 - $preview.dataset.width * 120 / $preview.dataset.height / 2;
    $playbackMontages.style.paddingLeft = `${montagePadding}px`;
    $$playbackMontageOverlayMask.forEach($mask => $mask.style.width = `${montagePadding}px`);
    // TODO Optimise
    const $frame = [...$montage.querySelectorAll('.playback-montage-frame')]
      .reverse()
      .find($f => +$f.dataset.time <= position * $video.duration);
    if ($frame) {
      $playbackMontagesContainer.classList.add('showing');
      $playbackMontages.scrollLeft = $frame.offsetLeft - montagePadding;
    }
  });
  touch.onMouse($progress, 'mouseleave', () => {
    uiState.hoveringProgress = false;
    $playbackMontagesContainer.classList.remove('showing');
  });
  $progress.addEventListener('mouseup', () => {
    wasPlayingBeforeScrubbing = undefined;
  }, true);
  let scrubbingTimeout;
  $progress.addEventListener('input', () => {
    clearTimeout(scrubbingTimeout);

    // Cache variable.
    const shouldPlay = wasPlayingBeforeScrubbing;
    if (shouldPlay) {
      $video.pause();
    }
    uiState.scrubbing = true;
    updateTime();
    scrubbingTimeout = setTimeout(() => {
      $video.currentTime = $progress.value;
      uiState.scrubbing = false;
      if (shouldPlay) {
        $video.play();
      }
    }, 240);
  });

  $video.addEventListener('ended', () => {
    uiState.playing = uiState.engaged = false;
    updateTime();
    clearInterval(timeUpdater);
  });
  $video.addEventListener('loadedmetadata', () => $progress.max = $video.duration);
  $video.addEventListener('play', () => {
    uiState.playing = true;
    updateTime();
    timeUpdater = setInterval(updateTime, 1000);
  });
  $video.addEventListener('pause', () => {
    uiState.playing = uiState.engaged = false;
    updateTime();
    clearInterval(timeUpdater);
  });
  $video.addEventListener('timeupdate', () => {
    if (!uiState.scrubbing) {
      $progress.value = $video.currentTime;
    }
  });
  $video.addEventListener('error', () => {
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
        videoControl.seekRelative(10 * targets.getDirection(e));
        ripples.one(e.target, touch.getRelativeTouchCoordiates(touch.lastTouches()[0], e.target));
      } else {
        // If no more taps happen with the next CHAINED_PRESSES_WAIT_MS,
        // toggle engagement.
        singlePressTimeout = setTimeout(engaged => uiState.engaged = engaged, CHAINED_PRESSES_WAIT_MS, !uiState.engaged);
      }
      playerLastPressTime = Date.now();
    }
  });

  // Only engage after idle with mouse input.
  // Note that Edge does not support touch events:
  // https://github.com/MicrosoftEdge/WebAppsDocs/issues/39
  const IDLE_MS_BEFORE_ENGAGED = 1500;
  let engagedSetTimeout;
  touch.onChange(usingTouch => uiState.usingTouch = usingTouch);
  // Don't set engaged state until touch has ended.
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
        videoControl.seekRelative(5 * (e.keyCode - 75));
        break;

      case 37: // Left
      case 39: // Right
        e.preventDefault();
        videoControl.seekRelative(10 * (e.keyCode - 38));
        break;

      case 48: // 0 (Zero)
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57: // 9
        videoControl.seekPercentile((e.keyCode - 48) * 10);
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
