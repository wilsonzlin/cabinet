"use strict";

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
  $input.addEventListener("input", () => {
    const term = $input.value.trim();
    const regexp = term && RegExp(
      term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"),
      "i"
    );

    for (const $entry of getEntries()) {
      const value = getEntryValue($entry);
      $entry.hidden = !!(regexp && !regexp.test(value));
    }

    onSearchEnd && onSearchEnd();
  });

  window.addEventListener("keydown", e => {
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

const configureTargets = onClick => {
  const $targets = document.querySelector("#targets");
  $targets.addEventListener("click", e => {
    const dir = +e.target.dataset.direction;
    onClick(dir);
  });
};
