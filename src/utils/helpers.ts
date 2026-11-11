/**
 * Returns false once the extension has been reloaded, updated or disabled
 * while this content script is still running in an open tab. In that state
 * every chrome.* API call throws "Extension context invalidated".
 */
export function isExtensionContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export function isContextInvalidatedError(e: unknown): boolean {
  return (
    e instanceof Error && e.message.includes("Extension context invalidated")
  );
}

export function mainLoop(cb: () => Promise<void>, ms: number): void {
  const call = () => {
    // Stop the orphaned loop if the extension was reloaded/updated.
    if (!isExtensionContextValid()) {
      return;
    }

    cb()
      .catch((e) => {
        if (!isContextInvalidatedError(e)) {
          throw e;
        }
      })
      .finally(() => {
        setTimeout(() => call(), ms);
      });
  };

  call();
}

function isObject(o: unknown): o is object {
  return typeof o === "object" && o !== null;
}

export function deepmerge<T extends Record<string, unknown>>(
  ...objs: unknown[]
): T {
  let newObj: Record<string, unknown> = {};

  for (const obj of objs) {
    if (!isObject(obj)) continue;

    for (const [key, val] of Object.entries(obj)) {
      if (isObject(val) && key in newObj) {
        newObj = {
          ...newObj,
          [key]: deepmerge(val, newObj[key]),
        };
      } else {
        newObj = {
          ...newObj,
          [key]: val,
        };
      }
    }
  }

  return newObj as T;
}
