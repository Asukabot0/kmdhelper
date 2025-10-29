const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestWindow } = require('./helpers/mini-dom');

function loadContentScript(window) {
  const contentPath = path.join(__dirname, '..', 'kmdhelpler', 'content.js');
  delete require.cache[contentPath];
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.NodeFilter = window.NodeFilter;
  global.localStorage = window.localStorage;
  Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
  Object.defineProperty(global, 'location', { value: { href: 'https://archiver.kmd.keio.ac.jp/home', hostname: 'archiver.kmd.keio.ac.jp' }, configurable: true });
  window.__kmdhelperTestMode = true;
  window.__kmdhelperCourseNameOverride = '';
  require(contentPath);
  return window.__kmdhelper;
}

function resetGlobals() {
  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.NodeFilter;
  delete global.localStorage;
  delete global.navigator;
  delete global.location;
}

test('parseHomepageCourses extracts slot details from homepage HTML', () => {
  const htmlPath = path.join(__dirname, '..', 'kmdhelpler', 'test', 'homepage_sample.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { window } = createTestWindow(html);
  const helper = loadContentScript(window);
  const courses = helper.parseHomepageCourses();
  assert.ok(Array.isArray(courses));
  assert.ok(courses.length > 0);
  const first = courses.find(c => c.url.includes('2025_44016'));
  assert.ok(first, 'Expected to find course 2025_44016');
  assert.equal(first.name.includes('イノベーションパイプライン１Ａ'), true);
  assert.deepEqual(first.slots, ['月1', '月2', '水1', '水2']);
  const monSlot = first.slotDetails.find(it => it.weekday === 'Mon' && it.slot === 1);
  assert.ok(monSlot);
  assert.equal(monSlot.start, '09:00');
  assert.equal(monSlot.end, '10:30');
  const tbdSlot = first.slotDetails.find(it => it.weekday === 'TBD');
  assert.equal(tbdSlot, undefined);
  resetGlobals();
});

test('buildSlotHintFromCachePayload matches course titles when present', () => {
  const htmlPath = path.join(__dirname, '..', 'kmdhelpler', 'test', 'homepage_sample.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { window } = createTestWindow(html);
  const helper = loadContentScript(window);
  window.__kmdhelper.__testAccess.setCourseName('イノベーションパイプライン１Ａ （英）');
  const payload = { courses: helper.parseHomepageCourses() };
  const hint = helper.buildSlotHintFromCachePayload(payload);
  assert.ok(hint);
  assert.equal(hint.Mon.start, '10:45');
  assert.equal(hint.Mon.end, '12:15');
  assert.equal(hint.Wed.start, '10:45');
  assert.equal(hint.Wed.end, '12:15');
  resetGlobals();
});

test('buildSlotHintFromCachePayload returns null when course title missing', () => {
  const htmlPath = path.join(__dirname, '..', 'kmdhelpler', 'test', 'homepage_sample.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { window } = createTestWindow(html);
  const helper = loadContentScript(window);
  window.__kmdhelper.__testAccess.setCourseName('');
  const payload = { courses: helper.parseHomepageCourses() };
  const hint = helper.buildSlotHintFromCachePayload(payload);
  assert.equal(hint, null);
  resetGlobals();
});
