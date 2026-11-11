import { logger } from "../../utils/logger";
import { getShouldMuteAd } from "../../utils/config";
import {
  clickMuteBtn,
  getChannelInfo,
  isAdShowing,
  isVideoMuted,
} from "../../utils/youtubeDOM";
import { Events, YouTubeEvents } from "../../utils/youtubeEvents";
import { EventHandler } from "../../utils/types";

// How many ticks (200ms each) to keep trying to restore the sound after an ad.
const MAX_UNMUTE_ATTEMPTS = 25;

export class AdMuter implements EventHandler {
  // Whether we muted the player for the current ad(s). Only then do we unmute
  // it afterwards, so a video the user muted themselves stays muted.
  #mutedByUs = false;
  #unmuteAttempts = 0;
  #lastUnmuteClickAt = 0;

  public setupListeners(): void {
    YouTubeEvents.addListener(Events.adPlayStarted, () =>
      this.handleAdPlaybackStart()
    );
    YouTubeEvents.addListener(Events.tick, () => this.tick());
  }

  private async handleAdPlaybackStart() {
    if (this.#mutedByUs || isVideoMuted()) {
      return;
    }

    const { channelId } = getChannelInfo();

    if (!(await getShouldMuteAd(channelId))) {
      logger.debug("Not muting ad for this channel: ", channelId);

      return;
    }

    // Reading the config is async: the ad may already have been skipped by
    // now. Muting at this point would leave the actual video muted.
    if (this.#mutedByUs || !isAdShowing() || isVideoMuted()) {
      return;
    }

    logger.debug("video is NOT muted. Click button.");
    clickMuteBtn();
    this.#mutedByUs = true;
    this.#unmuteAttempts = 0;
  }

  /**
   * Restores the sound once no ad is showing anymore. Runs on every tick
   * instead of only on "ad ended", and retries until the video is actually
   * unmuted, since YouTube may swallow a click during the ad -> video switch.
   */
  private tick(): void {
    if (!this.#mutedByUs || isAdShowing()) {
      return;
    }

    if (!isVideoMuted() || this.#unmuteAttempts >= MAX_UNMUTE_ATTEMPTS) {
      this.#mutedByUs = false;
      this.#unmuteAttempts = 0;

      return;
    }

    // Give a previous click time to take effect before toggling again.
    if (Date.now() - this.#lastUnmuteClickAt < 600) {
      return;
    }

    logger.debug("resetting audio.");
    this.#unmuteAttempts++;
    this.#lastUnmuteClickAt = Date.now();
    clickMuteBtn();
  }
}
