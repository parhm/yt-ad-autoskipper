import { logger } from "./logger";
import { clickElem } from "./dom";

export function isVideoMuted(): boolean {
  const video = document.querySelector<HTMLVideoElement>(
    "#movie_player video, .html5-video-player video"
  );

  if (video) {
    return video.muted || video.volume === 0;
  }

  const volumeSlider = document.querySelector<HTMLElement>(
    ".ytp-volume-slider-handle"
  );

  return !!volumeSlider && parseInt(volumeSlider.style.left || "0") === 0;
}

export const skipButtonClasses = [
  "videoAdUiSkipButton", // Old close ad button
  "ytp-ad-skip-button", // New close ad button
  "ytp-ad-skip-button-modern", // Modern close ad button
  "ytp-skip-ad-button", // Current close ad button (incl. "clean player" layout)
];

const skipButtonSelector = [
  ...skipButtonClasses.map((c) => `.${c}`),
  "button[id^='skip-button']",
  ".ytp-ad-skip-button-slot button",
  ".ytp-ad-skip-button-container button",
].join(", ");

/**
 * Whether the given element is (one of) YouTube's skip ad buttons. Matches on
 * individual classes so that extra modifier classes (e.g.
 * `ytp-skip-ad-button--clean-player`) don't prevent a match.
 */
export function isSkipButton(el: Element): boolean {
  try {
    return el.matches(skipButtonSelector);
  } catch (e) {
    return false;
  }
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    el.getClientRects().length > 0
  );
}

export function getVisibleSkipButtons(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(skipButtonSelector)
  ).filter(isVisible);
}

/**
 * Clicks on all skip ad buttons, including hidden ones. YouTube renders the
 * skip button (hidden) as soon as the ad starts, and clicking it before it is
 * shown skips most ads right away, without waiting for the countdown.
 *
 * Returns true if a *visible* skip button was found.
 */
export function clickSkipAdBtn(): boolean {
  const elems = Array.from(
    document.querySelectorAll<HTMLElement>(skipButtonSelector)
  );
  logger.debug("clicking on elems: ", elems);
  elems.forEach((el) => el.click());

  return elems.some(isVisible);
}

function getPlayer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player.html5-video-player") ||
    document.querySelector<HTMLElement>(".html5-video-player")
  );
}

export function isAdShowing(): boolean {
  const player = getPlayer();

  return (
    !!player &&
    (player.classList.contains("ad-showing") ||
      player.classList.contains("ad-interrupting"))
  );
}

/**
 * Fallback for when clicking the skip button has no effect: jump the ad video
 * to its end. Only used once a skip button is shown, i.e. the ad is skippable.
 */
export function fastForwardAd(): void {
  if (!isAdShowing()) return;

  const video = getPlayer()?.querySelector<HTMLVideoElement>("video");

  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    logger.debug("fast forwarding ad to its end.");
    video.currentTime = video.duration;
  }
}

/**
 * Returns an identifier for the ad currently playing, or undefined if no ad
 * is playing.
 */
export function getCurrentAdId(): string | undefined {
  return (
    document
      .querySelector(".ytp-ad-visit-advertiser-button")
      ?.getAttribute("aria-label") ||
    document
      .querySelector(".ytp-visit-advertiser-link")
      ?.getAttribute("aria-label") ||
    document.querySelector(".ytp-ad-badge")?.textContent?.trim() ||
    (isAdShowing()
      ? `ad:${getPlayer()?.querySelector("video")?.src || "unknown"}`
      : undefined)
  );
}

export function clickMuteBtn(): void {
  logger.debug("click mute button.");
  const muteBtn = document.querySelector<HTMLElement>(".ytp-mute-button");

  if (!muteBtn) {
    logger.debug("mute button not present.");

    return;
  }

  clickElem(muteBtn);
}

export function getChannelInfo(): {
  channelId: string;
  channelName: string;
  imageUrl: string;
} {
  const channelA = document.querySelector<HTMLAnchorElement>(
    "ytd-video-owner-renderer ytd-channel-name a"
  );

  if (!channelA) {
    return {
      channelId: "",
      channelName: "",
      imageUrl: "",
    };
  }

  const channelName = channelA.innerText;
  const channelId = channelA.href.split("/").pop() || "";
  const imageUrl =
    document.querySelector<HTMLImageElement>("ytd-video-owner-renderer img")
      ?.src || "";

  return {
    imageUrl,
    channelId,
    channelName,
  };
}

export function isVideoPage(): boolean {
  return document.location.pathname === "/watch";
}
