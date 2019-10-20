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
};

const configureTargets = onClick => {
  const $targets = document.querySelector("#targets");
  $targets.addEventListener("click", e => {
    const dir = +e.target.dataset.direction;
    onClick(dir);
  });
};
