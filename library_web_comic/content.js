// content.js (optional fallback content script)
// This file is kept minimal: it responds to GET_PAGE_META messages if scripting.executeScript is not available.
// If you rely on scripting.executeScript from popup, this file can be removed.

(function() {
  // Listen for messages from extension
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'GET_PAGE_META') return;
    try {
      const title = document.querySelector('meta[property="og:title"]')?.content
        || document.querySelector('meta[name="twitter:title"]')?.content
        || document.title || '';
      const image = document.querySelector('meta[property="og:image"]')?.content
        || document.querySelector('meta[name="twitter:image"]')?.content
        || '';
      const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
      const site = document.querySelector('meta[property="og:site_name"]')?.content
        || location.hostname.replace(/^www\./, '');
      sendResponse({ meta: { title: title.trim(), image: image.trim(), url: canonical, site: site.trim() } });
    } catch (e) {
      sendResponse({ meta: null });
    }
    // indicate async response not needed (we already called sendResponse)
    return true;
  });
})();