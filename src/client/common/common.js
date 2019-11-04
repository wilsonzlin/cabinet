'use strict';

const createUiState = states => states.reduce((proxy, name) => Object.defineProperty(proxy, name, {
  get () {
    return document.body.classList.contains(`s-${name}`);
  },
  set (value) {
    document.body.classList.toggle(`s-${name}`, value);
  }
}), {});

const configureSearch = (
  {
    $input,
    getEntries,
    getEntryValue,
    onSearchEnd,
  }
) => {
  $input.addEventListener('input', () => {
    const term = $input.value.trim();
    const regexp = term && RegExp(
      term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'),
      'i'
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

// Note that Edge will send mouse events even if the user is touching.
// https://github.com/MicrosoftEdge/WebAppsDocs/issues/39
const touch = (() => {
  let usingTouch = false;
  let lastTouchEvent = -Infinity;

  // This is necessary as mousemove events are also emitted while touching,
  // so we need to ensure that this was caused by a mouse and not touch input.
  // If it's been long enough since we've last seen a touch event (or one
  // has never occured), we assume that the input is (or has changed to) a mouse.
  // https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Supporting_both_TouchEvent_and_MouseEvent
  const mouseEventIsActuallyTouch = () => Date.now() - lastTouchEvent <= 500;

  // NOTE: Edge does not support touch events on `window`.
  const changeListeners = [];
  ['touchstart', 'touchmove', 'touchend'].forEach(event =>
    document.addEventListener(event, () => {
      lastTouchEvent = Date.now();
      if (!usingTouch) {
        usingTouch = true;
        changeListeners.forEach(listener => listener(usingTouch));
      }
    }, true));

  ['mousedown', 'mousemove', 'mouseup'].forEach(event =>
    document.addEventListener(event, () => {
      const newUsingTouch = mouseEventIsActuallyTouch();
      if (newUsingTouch !== usingTouch) {
        usingTouch = newUsingTouch;
        changeListeners.forEach(listener => listener(usingTouch));
      }
    }, true));

  return {
    mouseEventIsActuallyTouch,
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
    getRelativeTouchCoordiates (touches, $elem) {
      const rect = $elem.getBoundingClientRect();
      const positions = [];
      for (const touch of touches) {
        positions.push(this.getRelativeCoordinates(touch.clientX, touch.clientY, rect));
      }
      return positions;
    },
    getOffsetCoordinatesOfEvent (e) {
      if (e.touches && e.touches.length) {
        return this.getRelativeTouchCoordiates([e.touches[0]], e.target)[0];
      }
      // e.offset{X,Y} doesn't seem to work reliably.
      return this.getRelativeCoordinates(e.clientX, e.clientY, e.target.getBoundingClientRect());
    }
  };
})();

const configureTargets = onPress => {
  const $targets = document.querySelector('#targets');
  const eventListener = e => {
    const $target = e.target;
    let dir;
    // When there are multiple touches, usually the highest element that contains all touch
    // points is provided as the target. However, when the user switches back to one touch
    // input, Firefox still keeps using the outer element as the target.
    if ($target === $targets) {
      const pos = touch.getOffsetCoordinatesOfEvent(e, $targets);
      dir = pos[0] <= $targets.offsetWidth / 2 ? -1 : 1;
    } else {
      dir = $target === $targets.firstElementChild ? -1 : 1;
    }
    onPress(dir, e);
  };
  $targets.addEventListener('touchstart', eventListener);
  touch.onMouse($targets, 'mousedown', eventListener);
};
