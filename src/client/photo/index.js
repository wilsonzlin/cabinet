"use strict";

(() => {
  const uiState = createUiState([
    "previewing",
  ]);

  const folderTitle = document.title;

  const $buttonUp = document.querySelector("#button-up");
  const $folders = document.querySelector("#folders");
  const $preview = document.querySelector("#preview");
  const $previewTitle = document.querySelector("#preview-title");
  const $search = document.querySelector("#search");
  const $thumbnails = document.querySelector("#thumbnails");

  $buttonUp.addEventListener("click", () => {
    if (uiState.previewing) {
      history.back();
    } else {
      if (location.href.endsWith("/")) {
        location.href = "../";
      } else {
        location.href = "./";
      }
    }
  });

  configureSearch({
    $input: $search,
    getEntries: () => [...$folders.children, ...$thumbnails.children],
    getEntryValue: $li => $li.dataset.name,
  });

  const getIndexOfThumbnail = $thumb => Array.prototype.indexOf.call($thumbnails.children, $thumb);
  const getThumbnailUrl = $thumb => $thumb.children[0].href;
  const getFirstThumbnail = () => $thumbnails.children[0];
  const getLastThumbnail = () => $thumbnails.children[$thumbnails.children.length - 1];

  const preview = {
    // Unfortunately setting document.title here is needed as Firefox
    // does not update or keep titles automatically.
    current: undefined,
    load ($thumb) {
      this.current = $thumb;
      uiState.previewing = true;
      $previewTitle.textContent = $thumb.dataset.name;
      $preview.style.backgroundImage = `url("${getThumbnailUrl($thumb)}")`;
      document.title = `${$thumb.dataset.name} - Cabinet Photos`;
    },
    unload () {
      this.current = undefined;
      uiState.previewing = false;
      $previewTitle.textContent = "";
      $preview.style.backgroundImage = "";
      document.title = folderTitle;
    },
  };

  window.addEventListener("popstate", e => {
    if (e.state) {
      preview.load($thumbnails.children[e.state]);
    } else {
      preview.unload();
    }
  });

  const navigation = {
    _updateUrl ($thumb) {
      const idx = getIndexOfThumbnail($thumb);
      history.replaceState(idx, undefined, getThumbnailUrl($thumb));
    },
    start ($thumb) {
      preview.load($thumb);
      history.pushState(undefined, undefined, undefined);
      this._updateUrl($thumb);
    },
    end () {
      history.back();
    },
    next () {
      const $next = preview.current.nextElementSibling || getFirstThumbnail();
      preview.load($next);
      this._updateUrl($next);
    },
    previous () {
      const $prev = preview.current.previousElementSibling || getLastThumbnail();
      preview.load($prev);
      this._updateUrl($prev);
    },
  };

  $thumbnails.addEventListener("click", e => {
    if (e.target.tagName === "A") {
      e.preventDefault();
      navigation.start(e.target.parentNode);
    }
  });

  configureTargets(dir => {
    switch (dir) {
    case -1:
      navigation.previous();
      break;
    case 1:
      navigation.next();
      break;
    }
  });

  const THUMBNAILS_MIN_ROW_HEIGHT = 210;
  const THUMBNAILS_THUMBNAIL_MARGIN = 5;
  const THUMBNAILS_REFLOW_DEBOUNCE = 400;

  let reflowThumbnailsSetTimeout;
  let reflowThumbnailsRAF;
  const reflowThumbnails = () => {
    clearTimeout(reflowThumbnailsSetTimeout);
    cancelAnimationFrame(reflowThumbnailsRAF);
    reflowThumbnailsSetTimeout = setTimeout(() => {
      reflowThumbnailsRAF = requestAnimationFrame(() => {
        const thumbs = [...$thumbnails.children];
        const totalWidth = Math.floor($thumbnails.getBoundingClientRect().width);
        while (thumbs.length) {
          let currentRow = [];
          let currentRowHeight = 0;
          while (thumbs.length) {
            currentRow.push(thumbs.shift());
            currentRowHeight =
              (totalWidth
               - (THUMBNAILS_THUMBNAIL_MARGIN + 1)
               * (Math.max(0, currentRow.length - 1))
              )
              / currentRow.reduce((base, $thumb) => {
                const width = +$thumb.dataset.width;
                const height = +$thumb.dataset.height;
                return base + width / height;
              }, 0);
            if (currentRowHeight < THUMBNAILS_MIN_ROW_HEIGHT) {
              break;
            }
          }
          for (const [i, $thumb] of currentRow.entries()) {
            const ratio = $thumb.dataset.width / $thumb.dataset.height;
            const height = Math.min(210, currentRowHeight);
            Object.assign($thumb.style, {
              height: `${height}px`,
              width: `${ratio * height}px`,
              marginRight: i < currentRow.length - 1 ? `${THUMBNAILS_THUMBNAIL_MARGIN}px` : "",
            });
          }
        }
      });
    }, THUMBNAILS_REFLOW_DEBOUNCE);
  };

  window.addEventListener("resize", reflowThumbnails);
  window.addEventListener("orientationchange", reflowThumbnails);
  reflowThumbnails();

  window.addEventListener("keydown", e => {
    switch (e.keyCode) {
    case 37: // Left
      if (uiState.previewing) {
        navigation.previous();
      }
      break;

    case 39: // Right
      if (uiState.previewing) {
        navigation.next();
      }
      break;

    case 27: // Escape
      if (uiState.previewing) {
        e.preventDefault();
        navigation.end();
      }
      break;
    }
  }, true);
})();
