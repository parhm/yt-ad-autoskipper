import {
  getIsSkipSkippingEnabled,
  getTimeToSkipAdOffset,
} from "../../utils/config";
import { addMilliseconds } from "../../utils/datetime";
import { logger } from "../../utils/logger";
import { Events, YouTubeEvents } from "../../utils/youtubeEvents";
import {
  clickSkipAdBtn,
  fastForwardAd,
  getChannelInfo,
  isAdShowing,
} from "../../utils/youtubeDOM";
import { EventHandler } from "../../utils/types";

export class VideoAdSkipper implements EventHandler {
  #skipAt: Date | null = null;
  #clickedAt: Date | null = null;
  #enableSkipSkipping = false;

  public setupListeners(): void {
    YouTubeEvents.addListener(Events.adPlayStarted, () => this.scheduleClick());
    YouTubeEvents.addListener(Events.adPlayEnded, () => this.teardown());
    YouTubeEvents.addListener(Events.tick, () => this.tick());
    logger.debug("listeners set up for ad skipper");
  }

  private teardown(): void {
    this.#skipAt = null;
    this.#clickedAt = null;
  }

  private skipSurveyImmediately() {
    clickSkipAdBtn();
  }

  private async scheduleClick(): Promise<void> {
    const { channelId } = getChannelInfo();
    const skipAdTime = await getTimeToSkipAdOffset(channelId);
    this.#enableSkipSkipping = await getIsSkipSkippingEnabled();

    if (skipAdTime < 0) {
      logger.debug("not skipping ad");
      this.teardown();

      return;
    }

    const skipAt = addMilliseconds(new Date(), skipAdTime * 1000);

    // The ad id can change while an ad is still playing (e.g. ad badge text,
    // or the next ad in a pod). Never push an already scheduled skip later,
    // otherwise the skip keeps getting postponed.
    if (!this.#skipAt || skipAt < this.#skipAt) {
      this.#skipAt = skipAt;
    }
    logger.debug("scheduling skip at ", this.#skipAt);
    this.renderCountdown();
  }

  private renderCountdown() {
    const countdown = document.querySelector("#yas_countdown");
    const text = countdown?.querySelector("span");

    if (!this.#skipAt) {
      countdown?.remove();

      return;
    }

    const time = Math.floor(
      Math.max(0, (this.#skipAt.getTime() - new Date().getTime()) / 1000)
    );

    const newText = document.createElement("span");
    newText.textContent = `Ad will be skipped in ${time} seconds. `;

    if (countdown) {
      text?.replaceWith(newText);

      return;
    }

    const newCountdown = document.createElement("div");
    newCountdown.id = "yas_countdown";
    newCountdown.style.margin = "10px 0";
    newCountdown.style.color = "var(--yt-spec-text-primary)";
    const link = document.createElement("a");
    link.href = "#";
    link.style.color = "inherit";
    link.style.textDecoration = "none";
    link.style.borderBottom = "1px solid";
    link.textContent = `Click here to not skip this ad. ${
      this.#enableSkipSkipping ? "" : "🔒"
    }`;
    link.onclick = () => {
      if (this.#enableSkipSkipping) {
        logger.debug("skipping ad skipping.");
        this.teardown();
      }

      return false;
    };

    if (!this.#enableSkipSkipping) {
      newCountdown.title =
        "This feature is locked. Please go to extension settings to enable it.";
    }

    newCountdown.append(newText, link);

    document
      .querySelector("ytd-video-primary-info-renderer #container")
      ?.insertAdjacentElement("afterbegin", newCountdown);
  }

  private tick(): void {
    this.renderCountdown();

    if (!this.#skipAt) {
      return;
    }

    if (this.#skipAt > new Date()) {
      return;
    }

    if (
      !isAdShowing() &&
      !document.querySelector(
        ".ytp-ad-player-overlay, .ytp-ad-player-overlay-layout"
      )
    ) {
      this.teardown();

      return;
    }

    // Click the skip button even while it is still hidden (this skips most
    // ads early), and keep retrying until the ad is gone.
    const visible = clickSkipAdBtn();

    if (!visible) {
      return;
    }

    if (!this.#clickedAt) {
      this.#clickedAt = new Date();

      return;
    }

    // The skip button is still there a while after clicking it: YouTube
    // ignored the click. Jump the ad to its end instead.
    if (new Date().getTime() - this.#clickedAt.getTime() > 1000) {
      fastForwardAd();
    }
  }
}
