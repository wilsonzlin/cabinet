'use strict';

const cls = ($elem, name, force) => {
  if (force === undefined) {
    $elem.classList.toggle(name);
  } else {
    // IE 11 doesn't support .toggle with $force argument.
    if (force) {
      $elem.classList.add(name);
    } else {
      $elem.classList.remove(name);
    }
  }
};

const attr = ($elem, name, toggle) => {
  if (toggle) {
    $elem.dataset[name] = 'true';
  } else {
    delete $elem.dataset[name];
  }
};

const reflow = $elem => $elem.clientWidth;

const createUiState = states => states.reduce((proxy, name) => Object.defineProperty(proxy, name, {
  get () {
    return document.body.classList.contains(`s-${name}`);
  },
  set (value) {
    cls(document.body, `s-${name}`, value);
  },
}), {});

const configureSearch = (
  {
    $input,
    getEntries,
    getEntryValue,
    onSearchEnd,
  },
) => {
  $input.addEventListener('input', () => {
    const term = $input.value.trim();
    const regexp = term && RegExp(
      term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'),
      'i',
    );

    for (const $entry of getEntries()) {
      const value = getEntryValue($entry);
      $entry.hidden = !!(regexp && !regexp.test(value));
    }

    onSearchEnd && onSearchEnd();
  });

  window.addEventListener('keydown', e => {
    if (document.activeElement !== $input) {
      switch (e.keyCode) {
      case 70: // f
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          $input.focus();
        }
        break;
      }
    } else {
      switch (e.keyCode) {
      case 27: // Escape
        e.preventDefault(); // Prevent escaping fullscreen on macOS
        $input.blur();
        break;

      case 70: // f
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
        }
        break;
      }
    }
  });
};

// Get size and position information for an element that doesn't change in size
// or position unless the viewport changes.
const position = (() => {
  let cache;

  const resetCache = () => cache = new WeakMap();
  resetCache();

  window.addEventListener('resize', resetCache);
  window.addEventListener('orientationchange', resetCache);

  const computeIfAbsent = $elem => {
    const cached = cache.get($elem);
    if (cached) {
      return cached;
    }
    const rect = $elem.getBoundingClientRect();
    cache.set($elem, rect);
    return rect;
  };

  return Object.fromEntries([
    ...['top', 'right', 'bottom', 'left', 'width', 'height']
      .map(prop => [prop, $elem => computeIfAbsent($elem)[prop]]),
    ['all', $elem => computeIfAbsent($elem)],
  ]);
})();

// Note that Edge will send mouse events even if the user is touching.
// https://github.com/MicrosoftEdge/WebAppsDocs/issues/39
const touch = (() => {
  let usingTouch = false;
  let lastTouchStartTime = -Infinity;
  let lastTouchEventTime = -Infinity;
  let lastTouches;
  let touchHasMoved = false;

  // This is necessary as mousemove events are also emitted while touching,
  // so we need to ensure that this was caused by a mouse and not touch input.
  // If it's been long enough since we've last seen a touch event (or one
  // has never occurred), we assume that the input is (or has changed to) a mouse.
  // https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Supporting_both_TouchEvent_and_MouseEvent
  const mouseEventIsActuallyTouch = () => Date.now() - lastTouchEventTime <= 500;

  // NOTE: Edge does not support touch events on `window`.
  const changeListeners = [];
  for (const event of ['touchstart', 'touchmove', 'touchend']) {
    document.addEventListener(event, e => {
      lastTouchEventTime = Date.now();
      // Note that touchend does not have touches.
      if (e.type === 'touchstart') {
        lastTouchStartTime = Date.now();
        touchHasMoved = false;
        lastTouches = e.touches;
      } else if (e.type === 'touchmove') {
        // Humans aren't stable and inputs aren't accurate, so assume that any
        // touchmove events within some time of the touchstart should not
        // actually be interpreted as movement.
        touchHasMoved = Date.now() - lastTouchStartTime > 150;
        lastTouches = e.touches;
      }
      if (!usingTouch) {
        usingTouch = true;
        for (const listener of changeListeners) {
          listener(usingTouch);
        }
      }
    }, true);
  }

  for (const event of ['mousedown', 'mousemove', 'mouseup']) {
    document.addEventListener(event, () => {
      const newUsingTouch = mouseEventIsActuallyTouch();
      if (newUsingTouch !== usingTouch) {
        usingTouch = newUsingTouch;
        for (const listener of changeListeners) {
          listener(usingTouch);
        }
      }
    }, true);
  }

  return {
    isTouchEvent: mouseEventIsActuallyTouch,
    lastTouches () {
      return lastTouches;
    },
    moved () {
      return touchHasMoved;
    },
    onChange (listener) {
      changeListeners.push(listener);
    },
    onMouse ($target, event, handler, options) {
      $target.addEventListener(event, e => {
        if (mouseEventIsActuallyTouch()) {
          return;
        }
        handler(e);
      }, options);
    },
    getRelativeCoordinates (clientX, clientY, rect) {
      return [clientX - rect.left, clientY - rect.top];
    },
    getRelativeTouchCoordiates (touch, $elem) {
      const rect = position.all($elem);
      return this.getRelativeCoordinates(touch.clientX, touch.clientY, rect);
    },
    getRelativeEventCoordinates (e, $target = e.target) {
      if (e.touches && e.touches.length) {
        return this.getRelativeTouchCoordiates(e.touches[0], $target);
      }
      // e.offset{X,Y} doesn't seem to work reliably.
      return this.getRelativeCoordinates(e.clientX, e.clientY, position.all($target));
    },
  };
})();

const targets = (() => {
  const $targets = document.querySelector('#targets');

  const getDirection = event => {
    const $target = event.target;

    let dir;
    // When there are multiple touches, usually the highest element that contains all touch
    // points is provided as the target. However, when the user switches back to one touch
    // input, Firefox still keeps using the outer element as the target.
    if ($target === $targets) {
      const pos = touch.getRelativeEventCoordinates(event, $targets);
      dir = pos[0] <= $targets.offsetWidth / 2 ? -1 : 1;
    } else {
      dir = $target === $targets.firstElementChild ? -1 : 1;
    }
    return dir;
  };

  return {
    configure (onPress) {
      const eventListener = e => onPress(getDirection(e), e);
      $targets.addEventListener('click', eventListener);
    },
    getDirection,
  };
})();

const prefs = (() => {
  const component = location.pathname.split('/').filter(p => p)[0];

  const $container = document.querySelector('#prefs-container');
  if (!$container) {
    // Page does not use preferences.
    return;
  }

  const $close = document.querySelector('#prefs-close');
  $close.addEventListener('click', () => $container.hidden = true);

  const syncSetting = name =>
    fetch(`/user/${component}/preferences/${name}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        value: intf[name],
      }),
    });

  const handlers = {};
  const intf = {
    open () {
      $container.hidden = false;
    },
    onChange (name, handler) {
      handlers[name] = handler;
      // Call handler immediately with current value.
      handler(intf[name]);
    },
  };

  // Call any registered handler when value changes.
  $container.addEventListener('change', e => {
    const $target = e.target;
    // Remove 'pref-' prefix.
    const name = $target.name.slice(5);
    if (typeof name != 'string') {
      return;
    }
    syncSetting(name);
    const handler = handlers[name];
    if (!handler) {
      return;
    }
    handler(intf[name]);
  });

  const $options = document.querySelector('#prefs-options');
  for (const $ctl of $options.querySelectorAll('[name]')) {
    // Remove 'pref-' prefix.
    const name = $ctl.name.slice(5);
    // Use `checked` property as value if available.
    const prop = $ctl.checked !== undefined ? 'checked' : 'value';
    // Define getters and setters that retrieve values from DOM state.
    Object.defineProperty(intf, name, {
      get () {
        return $ctl[prop];
      },
      set (val) {
        $ctl[prop] = val;
        syncSetting(prop);
      },
    });
  }

  return intf;
})();
