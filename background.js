// tldraw Math Typing: after an install or update, put the add-on into tldraw tabs that are
// already open, so they work without a reload. content.js guards against running twice.
const ext = globalThis.browser ?? globalThis.chrome;

const CONTENT = [
  'rules.js', 'fonts.js',
  'vendor/nerdamer/nerdamer.core.js', 'vendor/nerdamer/Algebra.js',
  'vendor/nerdamer/Calculus.js', 'vendor/nerdamer/Solve.js',
  'mathtools.js', 'content.js',
];

ext.runtime.onInstalled.addListener(async () => {
  let tabs = [];
  try {
    tabs = await ext.tabs.query({ url: ['https://tldraw.com/*', 'https://*.tldraw.com/*'] });
  } catch (_) { return; }
  for (const tab of tabs) {
    const target = { tabId: tab.id, allFrames: false };
    try {
      await ext.scripting.insertCSS({ target, files: ['content.css'] });
      await ext.scripting.executeScript({ target, files: ['page.js'], world: 'MAIN' });
      await ext.scripting.executeScript({ target, files: CONTENT });
    } catch (err) {
      console.warn('[math typing] could not attach to an open tab', tab.url, err);
    }
  }
});
