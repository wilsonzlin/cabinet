import { Duration } from "luxon";
import { useEffect, useRef, useState } from "react";
import { ListedMedia, ListedPhoto } from "../../api/listFiles";
import { apiGetPath } from "./api";

export const useScreenDimensions = () => {
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const listener = () => {
      setHeight(document.documentElement.clientHeight);
      setWidth(document.documentElement.clientWidth);
    };
    const EVENTS = ["orientationchange", "resize"];
    for (const e of EVENTS) {
      window.addEventListener(e, listener, true);
    }
    return () => {
      for (const e of EVENTS) {
        window.removeEventListener(e, listener, true);
      }
    };
  }, []);
  return { height, width };
};

export const useElemDimensions = (elem: HTMLElement | null | undefined) => {
  // Do not use elem.offset{Height,Width} for initialState,
  // as they'll be expensively called for every invocation of this function,
  // but discarded immediately by useState.
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const observer = useRef(
    new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeight(entry.contentRect.height);
        setWidth(entry.contentRect.width);
      }
    })
  );
  useEffect(() => {
    console.warn("WARN PERF: Reattaching ResizeObserver");
    if (elem) {
      observer.current.observe(elem);
      return () => observer.current.unobserve(elem);
    }
    return;
  }, [elem]);
  return { height, width };
};

export const fileThumbnailCss = (file: ListedMedia | ListedPhoto) => ({
  backgroundImage: `url(${apiGetPath("getFile", {
    path: file.path,
    thumbnail: true,
  })})`,
  backgroundSize: file.type == "audio" ? "contain" : "cover",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center",
});

export const useLazyLoad = () => {
  const [visible, setVisible] = useState(false);
  const visibleDelay = useRef<any>(undefined);
  // Lazy load images as they appear, as some folders can have lots of files.
  const observer = useRef(
    new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          clearTimeout(visibleDelay.current);
          if (e.isIntersecting) {
            // We want to show the image, even if user is just scrolling/browsing.
            // We should only not load if the user is scrolling rapidly to a specific position, as if it's really deep,
            // a lot of images will be loaded unnecessarily.
            visibleDelay.current = setTimeout(() => {
              setVisible(true);
            }, 100);
          }
        }
      },
      {
        threshold: 0.2,
      }
    )
  );

  // We need to use useState instead of useRef in order for observer to activate/deactivate
  // when node is attached/detached.
  const [elem, setElem] = useState<HTMLElement | undefined>(undefined);
  useEffect(() => {
    if (elem) {
      observer.current.observe(elem);
      return () => observer.current.unobserve(elem);
    }
    return;
  }, [elem]);

  return {
    visible,
    setLazyElem: (elem: HTMLElement | null) => setElem(elem ?? undefined),
  };
};

export const formatDur = (seconds: number | Duration) => {
  const dur = Duration.isDuration(seconds)
    ? seconds
    : Duration.fromMillis(seconds * 1000);
  return dur.toFormat(dur.as("hours") >= 1 ? "h:mm:ss" : "m:ss");
};

// https://stackoverflow.com/a/9039885/6249022.
export const isIos = () =>
  [
    "iPad Simulator",
    "iPhone Simulator",
    "iPod Simulator",
    "iPad",
    "iPhone",
    "iPod",
  ].includes(navigator.platform) ||
  // iPad on iOS 13 detection
  (navigator.userAgent.includes("Mac") && "ontouchend" in document);

const round = (n: number, places: number) =>
  Math.round(n * 10 ** places) / 10 ** places;

export const formatSize = (s: number) => {
  if (s < 900) {
    return `${s} B`;
  }
  s /= 1024;
  if (s < 900) {
    return `${round(s, 2)} KB`;
  }
  s /= 1024;
  if (s < 900) {
    return `${round(s, 2)} MB`;
  }
  s /= 1024;
  if (s < 900) {
    return `${round(s, 2)} GB`;
  }
  s /= 1024;
  return `${round(s, 2)} TB`;
};
