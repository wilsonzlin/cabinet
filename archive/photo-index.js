"use strict";

(() => {
  let currentPath;

  let ensureThumbnailIsLoaded = thumb => {
    return new Promise((resolve, reject) => {
      let mediaElem = thumb.attributes.usingVideo ? thumb.$video : thumb.$image;
      mediaElem[thumb.attributes.usingVideo ? "onloadeddata" : "onload"] = () => {
        resolve(thumb);
      };
      mediaElem.onerror = err => {
        reject({
          message: `Thumbnail failed to load as ${thumb.attributes.usingVideo ? "video" : "image"}: ${mediaElem.src}`,
          imageSrc: mediaElem.src,
        });
      };
    });
  };

  function resolvePath (base, basename) {
    return base.replace(/\/+$/, "") + "/" + encodeURIComponent(basename);
  }

  let reflowThumbnailsSetTimeout;
  let reflowThumbnailsRequestAnimationFrame;

  function reflowThumbnails () {
    clearTimeout(reflowThumbnailsSetTimeout);
    cancelAnimationFrame(reflowThumbnailsRequestAnimationFrame);
    reflowThumbnailsSetTimeout = setTimeout(() => {
      reflowThumbnailsRequestAnimationFrame = requestAnimationFrame(() => {
        let thumbs = app.thumbnails.slice();
        let totalWidth = Math.floor(app.$thumbnails.getBoundingClientRect().width);
        while (thumbs.length) {
          let currentRow = [];
          let currentRowHeight = 0;
          while (thumbs.length) {
            currentRow.push(thumbs.shift());
            currentRowHeight = (totalWidth - 6 * (Math.max(0, currentRow.length - 1))) /
                               currentRow.reduce((base, curr) => {
                                 let width = curr.attributes.usingVideo ?
                                             curr.$video.videoWidth :
                                             curr.$image.naturalWidth;
                                 let height = curr.attributes.usingVideo ?
                                              curr.$video.videoHeight :
                                              curr.$image.naturalHeight;
                                 return base + width / height;
                               }, 0);
            if (currentRowHeight < 210) {
              break;
            }
          }
          ;
          currentRow.forEach((thumb, i, t) => {
            if (i != t.length - 1) {
              thumb.$thumbnail.style.marginRight = "5px";
            }
            (thumb.attributes.usingVideo ? thumb.$video : thumb.$image).height = Math.min(210, currentRowHeight);
          });
        }
      });
    }, 400);
  }

  function loadFolder (path) {
    app.attributes.previewing = false;
    currentPath = path;
    app.currentBaseName = path;

    fetch(`${location.origin}/folder${path}`, {
      credentials: "include",
    })
      .then(res => res.json())
      .then(data => {
        app.folders = data.filter(f => f.type === "folder").map(f => {
          return {
            path: resolvePath(currentPath, f.name),
            name: f.name,
          };
        });
        app.thumbnails = data.filter(f => f.type === "file").map(f => {
          return {
            path: resolvePath(currentPath, f.name),
            name: f.name,
          };
        });
        return Promise.all(app.thumbnails.map(t => ensureThumbnailIsLoaded(t)));
      })
      .then(() => {
        reflowThumbnails();
      })
      .catch(e => {
        console.error(e);
        alert("Error while fetching videos.json:\n" + e.message);
      });
  }

  let photoSiblings = new WeakMap();
  let photoSiblingLeftKey = {};
  let photoSiblingRightKey = {};

  function loadPhoto (path) {
    app.attributes.previewing = true;
    if (/\.(gifv|webm)$/i.test(path)) {
      app.$previewImage.style.display = "none";
      app.$previewVideo.style.display = "";
      app.$previewVideo.src = `/photo${path}`;
    } else {
      app.$previewVideo.style.display = "none";
      app.$previewImage.style.display = "";
      app.$previewImage.src = `/photo${path}`;
    }

    let thumbIdx = app.thumbnails.findIndex(t => t.path === path);
    if (thumbIdx > -1) {
      photoSiblings.set(photoSiblingLeftKey, app.thumbnails.get(thumbIdx === 0 ?
                                                                (app.thumbnails.length - 1) :
                                                                (thumbIdx - 1)));
      photoSiblings.set(photoSiblingRightKey, app.thumbnails.get(thumbIdx === (app.thumbnails.length - 1) ?
                                                                 0 :
                                                                 (thumbIdx + 1)));
    } else {
      photoSiblings.delete(photoSiblingLeftKey);
      photoSiblings.delete(photoSiblingRightKey);
    }

    app.currentBaseName = path;
  };

  function handleHash () {
    let path = location.hash.slice(1) || "/";
    if (/\.(png|gifv?|jpe?g|bmp|svg|tiff?|web(p|m))$/i.test(path)) {
      loadPhoto(path);
    } else {
      loadFolder(path);
    }
  };

  window.onhashchange = handleHash;
  handleHash();

  window.onresize = reflowThumbnails;
  window.onorientationchange = reflowThumbnails;

  function previewNavigateLeft () {
    let previous = photoSiblings.get(photoSiblingLeftKey);
    if (previous) {
      history.replaceState(undefined, undefined, "#" + previous.path);
      loadPhoto(previous.path);
    }
  }

  function previewNavigateRight () {
    let next = photoSiblings.get(photoSiblingRightKey);
    if (next) {
      history.replaceState(undefined, undefined, "#" + next.path);
      loadPhoto(next.path);
    }
  }

  app.attributes.previewNavigateLeftCallback = previewNavigateLeft;
  app.attributes.previewNavigateRightCallback = previewNavigateRight;

  window.addEventListener("keydown", e => {
    switch (e.keyCode) {
    case 37: // Left
      if (app.attributes.previewing) {
        previewNavigateLeft();
      }
      break;

    case 39: // Right
      if (app.attributes.previewing) {
        previewNavigateRight();
      }
      break;
    }
  }, true);
})();
