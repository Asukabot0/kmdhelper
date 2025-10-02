(function () {
  "use strict";

  if (location && location.hostname && location.hostname.indexOf("archiver.kmd.keio.ac.jp") === -1) {
    return;
  }

  if (window.__gcal_course_adder_initialized__) {
    return;
  }
  window.__gcal_course_adder_initialized__ = true;

  /**
   * Build Google Calendar event creation URL
   * @param {{
   *  title: string,
   *  description: string,
   *  start: { y: string, m: string, d: string, hh: string, mm: string },
   *  end: { y: string, m: string, d: string, hh: string, mm: string }
   * }} details
   */
  function createGoogleCalendarUrl(details) {
    var start = details.start.y + details.start.m + details.start.d + "T" + details.start.hh + details.start.mm + "00";
    var end = details.end.y + details.end.m + details.end.d + "T" + details.end.hh + details.end.mm + "00";
    var url = "https://www.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(details.title) +
      "&dates=" + encodeURIComponent(start + "/" + end) +
      "&details=" + encodeURIComponent(details.description || "");
    if (details.location) {
      url += "&location=" + encodeURIComponent(details.location);
    }
    return url;
  }

  function pad2(n) {
    return (n + "").padStart(2, "0");
  }

  function escapeHtml(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function collapseWhitespace(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function inferCourseName() {
    try {
      var en = document.querySelector("h1 .en, h2 .en, h3 .en");
      if (en && en.textContent) return collapseWhitespace(en.textContent);
      var h = document.querySelector("h1, h2, h3");
      if (h && h.textContent) return collapseWhitespace(h.textContent);
    } catch (e) {}
    return "";
  }

  function inferCourseLocation() {
    try {
      var ths = document.querySelectorAll("th");
      for (var i = 0; i < ths.length; i++) {
        var th = ths[i];
        var text = collapseWhitespace(th.textContent || "");
        if (!text) continue;
        if (text.indexOf("開講場所") !== -1 || text.indexOf("Class Room") !== -1) {
          var tr = th.closest("tr");
          if (!tr) continue;
          var td = tr.querySelector("td");
          if (!td) continue;
          var raw = (td.textContent || "").replace(/\r/g, "");
          var lines = raw.split("\n");
          for (var j = 0; j < lines.length; j++) {
            var line = collapseWhitespace(lines[j]);
            if (line) {
              return line;
            }
          }
        }
      }
    } catch (e) {}
    return "";
  }

  var COURSE_NAME = inferCourseName();
  var COURSE_LOCATION = inferCourseLocation();

  var weekday = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|月|火|水|木|金|土|日)";
  // Flexible date line: supports '-' or '/', optional weekday, optional time range
  var dateLineFlexible = "(\\d{4})[-\/]" + "(\\d{1,2})[-\/]" + "(\\d{1,2})" +
    "(?:\\s*\\(\\s*" + weekday + "\\s*\\))?" +
    "(?:\\s*(\\d{1,2}):(\\d{2})\\s*-\\s*(\\d{1,2}):(\\d{2}))?";
  // Description should stop when the next date line begins, or at two newlines, or a tag starts '<', or end of text
  var blockRegex = new RegExp(
    dateLineFlexible +
      "\\s*\\n" +
      "([^\\n]+)" +
      "(?:\\s*\\n([^\\n]+))?" +
      "(?:\\s*\\n([\\s\\S]*?))?" +
      "(?=(?:\\n{2,}|$)|(?:\\n" + dateLineFlexible + ")|<)",
    "gm"
  );

  // Alternate: single-line title after a hyphen (e.g., `YYYY/MM/DD - Title`)
  var blockRegexOneLine = new RegExp(
    dateLineFlexible +
      "\\s*-\\s*" +
      "([^\\n]+)" + // title on same line
      "(?:\\s*\\n([^\\n]+))?" + // optional next line title
      "(?:\\s*\\n([\\s\\S]*?))?" + // description
      "(?=(?:\\n{2,}|$)|(?:\\n" + dateLineFlexible + "))",
    "gm"
  );

  function shouldSkipNode(node) {
    var name = node.nodeName;
    return name === "SCRIPT" || name === "STYLE" || name === "NOSCRIPT" || name === "IFRAME" || name === "SVG" || name === "CANVAS";
  }

  function isSimpleTextContainer(node) {
    // Only process small, simple containers comprised of TEXT and BR nodes
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    var tag = node.tagName;
    if (!(tag === "P" || tag === "SPAN" || tag === "LI")) return false;
    if (typeof node.closest === "function" && node.closest("a")) return false;
    var children = node.childNodes;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.nodeType === Node.TEXT_NODE) continue;
      if (c.nodeType === Node.ELEMENT_NODE && c.tagName === "BR") continue;
      // Any other element inside disqualifies this container
      return false;
    }
    return true;
  }

  function getTextLikeFromEl(el) {
    // Build a text with \n for BR, preserving only text
    var out = [];
    var children = el.childNodes;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.nodeType === Node.TEXT_NODE) {
        out.push(c.nodeValue || "");
      } else if (c.nodeType === Node.ELEMENT_NODE && c.tagName === "BR") {
        out.push("\n");
      }
    }
    return out.join("");
  }

  function getCandidateElements() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
        if (!isSimpleTextContainer(node)) return NodeFilter.FILTER_SKIP;
        var textLike = getTextLikeFromEl(node);
        if (!textLike) return NodeFilter.FILTER_SKIP;
        if (new RegExp("^" + dateLineFlexible, "m").test(textLike)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });
    var list = [];
    var current;
    while ((current = walker.nextNode())) {
      list.push(current);
    }
    return list;
  }

  function processElement(el) {
    var textLike = getTextLikeFromEl(el);
    var replacements = [];
    var match;
    blockRegex.lastIndex = 0;
    while ((match = blockRegex.exec(textLike)) !== null) {
      var y = match[1];
      var mo = pad2(match[2]);
      var d = pad2(match[3]);
      var sh = match[4] != null ? pad2(match[4]) : null;
      var sm = match[5] != null ? pad2(match[5]) : null;
      var eh = match[6] != null ? pad2(match[6]) : null;
      var em = match[7] != null ? pad2(match[7]) : null;
      var titleLine1 = (match[8] || "").trim();
      var titleLine2 = (match[9] || "").trim();
      var description = (match[10] || "").trim();

      var usedInference = (sh === null || sm === null || eh === null || em === null);
      // Fallback: if time range missing, try infer from cached slot info
      if (sh === null || sm === null || eh === null || em === null) {
        var inferred = inferTimeRangeForDate(y, mo, d);
        if (inferred) {
          sh = inferred.start.split(':')[0];
          sm = inferred.start.split(':')[1];
          eh = inferred.end.split(':')[0];
          em = inferred.end.split(':')[1];
        } else {
          // If cannot infer, skip this block
          continue;
        }
      }

      var sessionTitle = titleLine2 || titleLine1;
      var finalTitle = sessionTitle;
      if (COURSE_NAME) {
        finalTitle = COURSE_NAME + " - " + sessionTitle;
      }

      var details = {
        title: finalTitle,
        description: description,
        location: COURSE_LOCATION || "",
        start: { y: y, m: mo, d: d, hh: sh, mm: sm },
        end: { y: y, m: mo, d: d, hh: eh, mm: em }
      };

      var url = createGoogleCalendarUrl(details);
      // Reconstruct display block with possibly inferred time and tag
      var header = y + '-' + mo + '-' + d + ' ' + sh + ':' + sm + ' - ' + eh + ':' + em + (usedInference ? ' [inferred]' : '');
      var bodyLines = [];
      if (titleLine1) bodyLines.push(titleLine1);
      if (titleLine2) bodyLines.push(titleLine2);
      if (description) bodyLines.push(description);
      var displayBlock = header + (bodyLines.length ? ('\n' + bodyLines.join('\n')) : '');
      var matchedBlock = match[0];
      replacements.push({ raw: matchedBlock, anchor: '<a href="' + url + '" class="gcal-generated-link" target="_blank">' + escapeHtml(displayBlock) + "</a>" });
    }
    // Also match one-line style (date - title)
    blockRegexOneLine.lastIndex = 0;
    while ((match = blockRegexOneLine.exec(textLike)) !== null) {
      var y2 = match[1];
      var mo2 = pad2(match[2]);
      var d2 = pad2(match[3]);
      var sh2 = match[4] != null ? pad2(match[4]) : null;
      var sm2 = match[5] != null ? pad2(match[5]) : null;
      var eh2 = match[6] != null ? pad2(match[6]) : null;
      var em2 = match[7] != null ? pad2(match[7]) : null;
      var titleLine1b = (match[8] || "").trim();
      var titleLine2b = (match[9] || "").trim();
      var descriptionb = (match[10] || "").trim();

      var usedInference2 = (sh2 === null || sm2 === null || eh2 === null || em2 === null);
      if (sh2 === null || sm2 === null || eh2 === null || em2 === null) {
        var inferred2 = inferTimeRangeForDate(y2, mo2, d2);
        if (inferred2) {
          sh2 = inferred2.start.split(':')[0];
          sm2 = inferred2.start.split(':')[1];
          eh2 = inferred2.end.split(':')[0];
          em2 = inferred2.end.split(':')[1];
        } else {
          continue;
        }
      }

      var sessionTitle2 = titleLine2b || titleLine1b;
      var finalTitle2 = sessionTitle2;
      if (COURSE_NAME) { finalTitle2 = COURSE_NAME + " - " + sessionTitle2; }

      var details2 = {
        title: finalTitle2,
        description: descriptionb,
        location: COURSE_LOCATION || "",
        start: { y: y2, m: mo2, d: d2, hh: sh2, mm: sm2 },
        end: { y: y2, m: mo2, d: d2, hh: eh2, mm: em2 }
      };

      var url2 = createGoogleCalendarUrl(details2);
      // Reconstruct one-line display
      var header2 = y2 + '-' + mo2 + '-' + d2 + ' ' + sh2 + ':' + sm2 + ' - ' + eh2 + ':' + em2 + (usedInference2 ? ' [inferred]' : '');
      var bodyParts = [titleLine1b];
      if (titleLine2b) bodyParts.push(titleLine2b);
      var line1 = header2 + ' - ' + bodyParts.join(' ');
      var displayBlock2 = line1 + (descriptionb ? ('\n' + descriptionb) : '');
      var matchedBlock2 = match[0];
      replacements.push({ raw: matchedBlock2, anchor: '<a href="' + url2 + '" class="gcal-generated-link" target="_blank">' + escapeHtml(displayBlock2) + "</a>" });
    }
    if (!replacements.length) return false;

    var replaced = textLike;
    for (var i = 0; i < replacements.length; i++) {
      replaced = replaced.split(replacements[i].raw).join(replacements[i].anchor);
    }
    // Replace container content safely: only text and BR existed
    el.innerHTML = replaced.replace(/\n/g, "<br>");
    return true;
  }

  // -------------------- Slot hint loading and time inference --------------------

  var __slotHintLoaded = false;
  var __slotHintByWeekday = null; // { Mon: {start,end}, ... }

  function normalizeNameForMatch(s) {
    return (s || '').replace(/\s+/g, '').toLowerCase();
  }

  function buildSlotHintFromCachePayload(payload) {
    try {
      if (!payload || !Array.isArray(payload.courses)) return null;
      var target = null;
      var nameKey = normalizeNameForMatch(COURSE_NAME);
      for (var i = 0; i < payload.courses.length; i++) {
        var c = payload.courses[i];
        var cn = normalizeNameForMatch(c && c.name);
        if (!cn) continue;
        if (cn === nameKey || cn.indexOf(nameKey) !== -1 || nameKey.indexOf(cn) !== -1) {
          target = c;
          break;
        }
      }
      if (!target) return null;
      var hint = {};
      var list = Array.isArray(target.slotDetails) ? target.slotDetails : [];
      for (var j = 0; j < list.length; j++) {
        var it = list[j];
        if (!it || !it.weekday || !it.start || !it.end) continue;
        hint[it.weekday] = { start: it.start, end: it.end };
      }
      return Object.keys(hint).length ? hint : null;
    } catch (e) { return null; }
  }

  function loadCourseSlotHint(cb) {
    if (__slotHintLoaded) { try { cb && cb(); } catch (e) {} return; }
    function done() { __slotHintLoaded = true; try { cb && cb(); } catch (e) {} }
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['kmd_course_overview_cache'], function(store){
          var payload = store && store.kmd_course_overview_cache;
          if (!payload) {
            try {
              var ls = localStorage.getItem('kmd_course_overview_cache');
              payload = ls ? JSON.parse(ls) : null;
            } catch (e) { payload = null; }
          }
          __slotHintByWeekday = buildSlotHintFromCachePayload(payload);
          done();
        });
      } else {
        var ls = null;
        try { ls = localStorage.getItem('kmd_course_overview_cache'); } catch (e) { ls = null; }
        var payload = ls ? JSON.parse(ls) : null;
        __slotHintByWeekday = buildSlotHintFromCachePayload(payload);
        done();
      }
    } catch (e) {
      __slotHintByWeekday = null;
      done();
    }
  }

  function inferTimeRangeForDate(y, m, d) {
    if (!__slotHintByWeekday) return null;
    var yy = parseInt(y, 10);
    var mm = parseInt(m, 10);
    var dd = parseInt(d, 10);
    if (!(yy > 0 && mm > 0 && dd > 0)) return null;
    var dt = new Date(yy, mm - 1, dd);
    if (isNaN(dt.getTime())) return null;
    var wdNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var wd = wdNames[dt.getDay()];
    var hint = __slotHintByWeekday[wd];
    return hint || null;
  }

  function processPage() {
    try {
      loadCourseSlotHint(function(){
        var candidates = getCandidateElements();
        var anyChanged = false;
        for (var i = 0; i < candidates.length; i++) {
          try {
            if (processElement(candidates[i])) anyChanged = true;
          } catch (eInner) {}
        }
        var isHomepage = detectHomepageCourseList();
        if (hasCourseLinks()) {
          injectApiButton();
          injectDeleteButton();
        }
        if (isHomepage) {
          injectCacheHomepageButton();
        }
        if (!hasCourseLinks() && !isHomepage) {
          removeButtonsWrapper();
        }
      });
    } catch (e) {
      // Fail-safe: still offer add-all button even if replacement fails
      removeButtonsWrapper();
    }
  }

  

  function collectEventsFromLinks() {
    function ymdHisToLocalString(s) {
      // s: YYYYMMDDTHHMMSS or YYYYMMDD
      var y = s.slice(0,4);
      var m = s.slice(4,6);
      var d = s.slice(6,8);
      if (s.length >= 15 && s.charAt(8) === 'T') {
        var hh = s.slice(9,11);
        var mm = s.slice(11,13);
        var ss = s.slice(13,15);
        return y + '-' + m + '-' + d + 'T' + hh + ':' + mm + ':' + ss; // local time string (no timezone)
      }
      // all-day fallback, set 00:00:00
      return y + '-' + m + '-' + d + 'T00:00:00';
    }

    function hashString(str) {
      // Simple deterministic hash (djb2)
      var hash = 5381;
      for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & 0xffffffff;
      }
      // convert to unsigned hex
      var hex = (hash >>> 0).toString(16);
      return hex;
    }

    var links = document.querySelectorAll('a.gcal-generated-link');
    var events = [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href') || '';
      try {
        var u = new URL(href, location.href);
        var sp = u.searchParams;
        var text = sp.get('text') || '';
        var details = sp.get('details') || '';
        var locationParam = sp.get('location') || (COURSE_LOCATION || '');
        var dates = sp.get('dates') || '';
        if (!dates) continue;
        var parts = dates.split('/');
        if (!parts[0]) continue;
        var startStr = ymdHisToLocalString(parts[0]);
        var endStr = parts[1] ? ymdHisToLocalString(parts[1]) : '';
        var canonical = [text, startStr, endStr || startStr, locationParam].join('|');
        var fp = hashString(canonical);
        events.push({
          title: text,
          description: details,
          location: locationParam,
          start: startStr,
          end: endStr || startStr,
          fingerprint: fp
        });
      } catch (e) {
        // skip invalid
      }
    }
    return events;
  }

  function injectApiButton() {
    if (document.getElementById('add-all-via-api-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'add-all-via-api-btn';
    btn.className = 'gcal-add-all-btn';
    btn.textContent = 'Add all via Google Calendar API';
    btn.addEventListener('click', function(){
      var events = collectEventsFromLinks();
      if (!events.length) {
        alert('No course links detected.');
        return;
      }
      var ok = confirm('This will create ' + events.length + ' events in your Google Calendar. Continue?');
      if (!ok) return;
      chrome.runtime.sendMessage({ type: 'CREATE_EVENTS', events: events }, function(resp){
        if (!resp || !resp.ok) {
          alert('Failed to create some or all events.');
          return;
        }
        alert('Created ' + (resp.created || 0) + ' events.');
      });
    });
    ensureButtonsWrapper();
    document.getElementById('gcal-buttons-wrapper').appendChild(btn);
  }

  function injectDeleteButton() {
    if (document.getElementById('delete-all-via-api-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'delete-all-via-api-btn';
    btn.className = 'gcal-add-all-btn';
    btn.textContent = 'Delete all via Google Calendar API';
    btn.addEventListener('click', function(){
      var events = collectEventsFromLinks();
      if (!events.length) {
        alert('No course links detected.');
        return;
      }
      // collect unique fingerprints
      var set = {};
      for (var i = 0; i < events.length; i++) { set[events[i].fingerprint] = true; }
      var fps = Object.keys(set);
      var ok = confirm('This will delete up to ' + events.length + ' matching events created via API. Continue?');
      if (!ok) return;
      chrome.runtime.sendMessage({ type: 'DELETE_EVENTS', fingerprints: fps }, function(resp){
        if (!resp || !resp.ok) {
          alert('Failed to delete some or all events.');
          return;
        }
        alert('Deleted ' + (resp.deleted || 0) + ' events.');
      });
    });
    ensureButtonsWrapper();
    document.getElementById('gcal-buttons-wrapper').appendChild(btn);
  }

  function ensureButtonsWrapper() {
    if (document.getElementById('gcal-buttons-wrapper')) return;
    var wrap = document.createElement('div');
    wrap.id = 'gcal-buttons-wrapper';
    document.body.appendChild(wrap);
  }

  function hasCourseLinks() {
    return document.querySelectorAll('a.gcal-generated-link').length > 0;
  }

  function removeButtonsWrapper() {
    var wrap = document.getElementById('gcal-buttons-wrapper');
    if (wrap && wrap.parentNode) {
      wrap.parentNode.removeChild(wrap);
    }
  }

  // -------------------- Homepage course overview support --------------------

  function detectHomepageCourseList() {
    try {
      // Only treat as homepage when NEWS contains a notice like:
      // "トップページをXXXX年度(秋/春)学期用に切り替えました"
      var items = document.querySelectorAll('li');
      for (var i = 0; i < items.length; i++) {
        var text = (items[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        if (text.indexOf('トップページ') !== -1 && (text.indexOf('切り替えました') !== -1 || text.indexOf('切り替え') !== -1)) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function parseHomepageCourses() {
    var results = [];
    var courseLinks = document.querySelectorAll('a[href*="e_class_top.cgi?"]');
    function dayFromChar(ch) {
      var map = { '月': 'Mon', '火': 'Tue', '水': 'Wed', '木': 'Thu', '金': 'Fri', '土': 'Sat', '日': 'Sun' };
      return map[ch] || '';
    }
    function slotToTimeRange(n) {
      switch (n) {
        case 1: return { start: '09:00', end: '10:30' };
        case 2: return { start: '10:45', end: '12:15' };
        case 3: return { start: '13:00', end: '14:30' };
        case 4: return { start: '14:45', end: '16:15' };
        case 5: return { start: '16:30', end: '18:00' };
        default: return null;
      }
    }
    function parseSlotToken(token) {
      var t = token.trim();
      if (!t) return null;
      if (t.indexOf('未定') !== -1) {
        return { weekday: 'TBD', slot: null, start: null, end: null, raw: token };
      }
      var m = t.match(/^([月火水木金土日])\s*(\d)$/);
      if (!m) return { weekday: '', slot: null, start: null, end: null, raw: token };
      var wd = dayFromChar(m[1]);
      var num = parseInt(m[2], 10);
      var range = slotToTimeRange(num);
      return { weekday: wd, slot: num, start: range ? range.start : null, end: range ? range.end : null, raw: token };
    }
    for (var i = 0; i < courseLinks.length; i++) {
      var a = courseLinks[i];
      var row = a.closest('tr');
      if (!row) continue;
      var tds = row.querySelectorAll('td');
      if (!tds.length) continue;
      // Try to find the td that looks like it contains weekday-slot tokens
      var slotText = '';
      for (var j = tds.length - 1; j >= 0; j--) {
        var txt = (tds[j].textContent || '').replace(/\s+/g, '').trim();
        if (!txt) continue;
        // Match patterns like 月1,火2,水３,木４,金５,未定未定, separated by comma/、
        if (/[月火水木金土日][0-9０-９]|未定/.test(txt)) {
          slotText = (tds[j].textContent || '').trim();
          break;
        }
      }
      var name = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var url = a.getAttribute('href') || '';
      var slots = [];
      var slotDetails = [];
      if (slotText) {
        var parts = slotText.split(/[,，、]/);
        for (var k = 0; k < parts.length; k++) {
          var token = parts[k].trim();
          if (!token) continue;
          // Normalize full-width digits to half-width
          var normalized = token.replace(/[０-９]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30); });
          // Basic token like 月1 or 未定未定; keep raw token
          slots.push(normalized);
          var parsed = parseSlotToken(normalized);
          if (parsed) slotDetails.push(parsed);
        }
      }
      results.push({ name: name, url: url, slots: slots, slotDetails: slotDetails });
    }
    return results;
  }

  function injectCacheHomepageButton() {
    if (document.getElementById('cache-course-slots-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'cache-course-slots-btn';
    btn.className = 'gcal-add-all-btn';
    btn.textContent = 'Cache course slots locally';
    btn.addEventListener('click', function(){
      var courses = parseHomepageCourses();
      if (!courses.length) { alert('No courses detected on homepage.'); return; }
      var termLabel = (function(){
        var bTags = document.querySelectorAll('b');
        for (var i = 0; i < bTags.length; i++) {
          var t = (bTags[i].textContent || '').trim();
          if (t.indexOf('授業一覧') !== -1) return t;
        }
        return '';
      })();
      var payload = { cachedAt: Date.now(), termLabel: termLabel, courses: courses };
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ kmd_course_overview_cache: payload }, function(){
            alert('Cached ' + courses.length + ' courses.');
          });
        } else {
          // Fallback to window.localStorage for testing
          localStorage.setItem('kmd_course_overview_cache', JSON.stringify(payload));
          alert('Cached ' + courses.length + ' courses (localStorage).');
        }
      } catch (e) {
        alert('Failed to cache courses: ' + e);
      }
    });
    ensureButtonsWrapper();
    document.getElementById('gcal-buttons-wrapper').appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", processPage);
  } else {
    processPage();
  }
})();


