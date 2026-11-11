import {
  deepmerge,
  isContextInvalidatedError,
  isExtensionContextValid,
} from "./helpers";
import { logger } from "./logger";

import { Subscription } from "./types";

type TimeToSkipConfig = {
  timeToSkip: number;
};

type MuteAdConfig = {
  muteAd: boolean;
};

type BaseConfig = TimeToSkipConfig & MuteAdConfig;

export type ChannelConfig = {
  channelName: string;
  channelId: string;
  imageUrl: string;
} & BaseConfig;

export type ConfigObj = {
  globalConfig: BaseConfig;
  channelConfigs: Record<string, ChannelConfig>;
};

type Scope = "global" | string;

// Seconds to let an ad play before skipping it, by default. 0 skips right away
// by clicking the (still hidden) skip button.
const AD_PLAYBACK_OFFSET = 0;
export const DEFAULT_CONFIG: ConfigObj = Object.freeze({
  globalConfig: {
    timeToSkip: AD_PLAYBACK_OFFSET,
    muteAd: true,
  },
  channelConfigs: {},
});

// All features are unlocked in this fork, so every user is treated as a supporter.
const LOCAL_SUBSCRIPTION: Subscription = Object.freeze({
  subscriptionId: "local",
  user: {
    displayName: "Supporter",
    email: "",
    stsTokenManager: { accessToken: "", refreshToken: "" },
  },
  nextSyncAt: Number.MAX_SAFE_INTEGER,
});

export async function getSubscription(): Promise<Subscription | null> {
  return LOCAL_SUBSCRIPTION;
}

export async function getConfig(): Promise<ConfigObj> {
  if (!isExtensionContextValid()) {
    return DEFAULT_CONFIG;
  }

  let config: ConfigObj | undefined;

  try {
    ({ config } = await chrome.storage.local.get(["config"]));
  } catch (e) {
    if (isContextInvalidatedError(e)) {
      return DEFAULT_CONFIG;
    }

    throw e;
  }

  if (!config) {
    return DEFAULT_CONFIG;
  }

  return config;
}

async function setConfig(config: ConfigObj): Promise<void> {
  if (!isExtensionContextValid()) {
    return;
  }

  const subscription = await getSubscription();

  if (!subscription?.subscriptionId) {
    logger.debug("not setting config because user does not have subscription.");
    return;
  }

  return await chrome.storage.local.set({ config });
}

async function mergeChannelConfig(
  scope: Scope,
  addition: TimeToSkipConfig | MuteAdConfig
) {
  const currentConfig = await getConfig();

  if (scope === "global") {
    const newConfig: ConfigObj = {
      ...currentConfig,
      globalConfig: deepmerge<ChannelConfig>(
        currentConfig.globalConfig,
        addition
      ),
    };

    await setConfig(newConfig);

    return;
  }

  if (!(scope in currentConfig.channelConfigs)) {
    logger.warn("Channel has not been created yet. This should not happen.");

    return;
  }

  const newConfig: ConfigObj = {
    ...currentConfig,
    channelConfigs: {
      ...currentConfig.channelConfigs,
      [scope]: deepmerge<ChannelConfig>(
        currentConfig.channelConfigs[scope],
        addition
      ),
    },
  };

  await setConfig(newConfig);
}

export async function getTimeToSkipAdOffset(
  channelId?: string
): Promise<number> {
  const config = await getConfig();

  logger.debug("getTimeToSkipOffset: ", config);

  if (channelId && channelId in config.channelConfigs) {
    return config.channelConfigs[channelId].timeToSkip;
  }

  return config.globalConfig.timeToSkip;
}

export async function setTimeToSkipAdOffset(
  scope: Scope,
  value: number
): Promise<number> {
  const configAddition = {
    timeToSkip: value,
  };

  await mergeChannelConfig(scope, configAddition);

  return await getTimeToSkipAdOffset();
}

export async function getShouldMuteAd(channelId?: string): Promise<boolean> {
  const config = await getConfig();

  logger.debug("getIsMute: ", config);

  if (channelId && channelId in config.channelConfigs) {
    return config.channelConfigs[channelId].muteAd;
  }

  return config.globalConfig.muteAd;
}

export async function setShouldMuteAd(
  scope: Scope,
  value: boolean
): Promise<boolean> {
  const configAddition = {
    muteAd: value,
  };

  await mergeChannelConfig(scope, configAddition);

  return getShouldMuteAd();
}

export async function getIsSkipSkippingEnabled(): Promise<boolean> {
  const subscription = await getSubscription();

  return !!subscription?.user;
}

export async function getChannelConfig(
  channelId: Scope
): Promise<ChannelConfig | BaseConfig | undefined> {
  const currentConfig = await getConfig();

  if (channelId === "global") {
    return currentConfig.globalConfig;
  }

  return currentConfig.channelConfigs[channelId];
}

export async function createChannel(
  channelId: string,
  channelName: string,
  imageUrl: string
): Promise<void> {
  const currentConfig = await getConfig();

  const newConfig: ConfigObj = {
    ...currentConfig,
    channelConfigs: {
      ...currentConfig.channelConfigs,
      [channelId]: {
        channelId,
        channelName,
        imageUrl,
        timeToSkip: DEFAULT_CONFIG.globalConfig.timeToSkip,
        muteAd: DEFAULT_CONFIG.globalConfig.muteAd,
      },
    },
  };

  await setConfig(newConfig);
}

export async function removeChannel(channelId: string): Promise<void> {
  const currentConfig = await getConfig();

  const newChannelConfig = Object.fromEntries(
    Object.entries(currentConfig.channelConfigs).filter(
      ([id]) => id !== channelId
    )
  );

  const newConfig = {
    ...currentConfig,
    channelConfigs: newChannelConfig,
  };

  await setConfig(newConfig);
}
