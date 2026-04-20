const EXTENSION_UI_PATH = "app.html";

chrome.action.onClicked.addListener(async (tab) => {
  const extensionPageUrl = new URL(chrome.runtime.getURL(EXTENSION_UI_PATH));
  if (tab && Number.isInteger(tab.id)) {
    extensionPageUrl.searchParams.set("sourceTabId", String(tab.id));
  }

  await chrome.tabs.create({
    url: extensionPageUrl.toString(),
  });
});
