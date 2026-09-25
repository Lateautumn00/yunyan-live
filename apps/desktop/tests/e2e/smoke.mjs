import { _electron as electron } from 'playwright-core';

const app = await electron.launch({
  args: ['out/main/index.js']
});

try {
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  const title = await window.title();
  if (title !== '云砚直播') {
    throw new Error(`标题不匹配: "${title}"`);
  }
  const body = await window.textContent('body');
  if (!body?.includes('云砚直播')) {
    throw new Error('首页未渲染');
  }
  console.log('SMOKE OK: window opened, title + home page verified');
} finally {
  await app.close();
}
