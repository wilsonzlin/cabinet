"use strict";

(() => {
  const uiState = createUiState([
    "previewing",
  ]);

  const $folders = document.querySelector("#folders");
  const $preview = document.querySelector("#preview");
  const $search = document.querySelector("#search");
  const $thumbnails = document.querySelector("#thumbnails");

  configureSearch({
    $input: $search,
    getEntries: () => [...$folders.children, ...$thumbnails.children],
    getEntryValue: $li => $li.dataset.name,
  });

  const THUMBNAILS_MIN_ROW_HEIGHT = 210;
  const THUMBNAILS_THUMBNAIL_MARGIN = 5;
  const THUMBNAILS_REFLOW_DEBOUNCE = 400;

  $thumbnails.addEventListener("click", e => {
    if (e.target.tagName === "A") {
      e.preventDefault();
      loadPhoto(e.target.parentNode);
    }
  });

  configureTargets(dir => {
    switch (dir) {
    case -1:
      previousPhoto();
      break;
    case 1:
      nextPhoto();
      break;
    }
  });

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

  let currentPhoto = undefined;
  const loadPhoto = $thumb => {
    currentPhoto = $thumb;
    uiState.previewing = true;
    $preview.style.backgroundImage = `url(${$thumb.children[0].href})`;
  };
  const unloadPhoto = () => {
    currentPhoto = undefined;
    uiState.previewing = false;
    $preview.style.backgroundImage = "";
  };
  const previousPhoto = () => {
    const $prev = currentPhoto.previousElementSibling || $thumbnails.children[$thumbnails.children.length - 1];
    loadPhoto($prev);
  };
  const nextPhoto = () => {
    const $next = currentPhoto.nextElementSibling || $thumbnails.children[0];
    loadPhoto($next);
  };

  window.addEventListener("keydown", e => {
    switch (e.keyCode) {
    case 37: // Left
      if (uiState.previewing) {
        previousPhoto();
      }
      break;

    case 39: // Right
      if (uiState.previewing) {
        nextPhoto();
      }
      break;

    case 27: // Escape
      if (uiState.previewing) {
        e.preventDefault();
        unloadPhoto();
      }
      break;
    }
  }, true);
})();
