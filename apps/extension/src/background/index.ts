// Register listeners synchronously and keep the worker stateless across restarts.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.info(`[Better YTM] Extension lifecycle: ${reason}.`);
});

export {};
