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
  var dateTimeLine = "(\\d{4})-(\\d{2})-(\\d{2})\\s*\\(\\s*" + weekday + "\\s*\\)\\s*(\\d{1,2}):(\\d{2})\\s*-\\s*(\\d{1,2}):(\\d{2})";
  // Description should stop when the next date-time line begins, or at two newlines, or a tag starts '<', or end of text
  var blockRegex = new RegExp(
    dateTimeLine +
      "\\s*\\n" +
      "([^\\n]+)" + // title line 1
      "(?:\\s*\\n([^\\n]+))?" + // optional title line 2
      "(?:\\s*\\n([\\s\\S]*?))?" + // description (optional)
      "(?=(?:\\n{2,}|$)|(?:\\n" + dateTimeLine + ")|<)",
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
        if (new RegExp("^" + dateTimeLine, "m").test(textLike)) return NodeFilter.FILTER_ACCEPT;
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
      var mo = match[2];
      var d = match[3];
      var sh = pad2(match[4]);
      var sm = pad2(match[5]);
      var eh = pad2(match[6]);
      var em = pad2(match[7]);
      var titleLine1 = (match[8] || "").trim();
      var titleLine2 = (match[9] || "").trim();
      var description = (match[10] || "").trim();

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
      var matchedBlock = match[0];
      replacements.push({ raw: matchedBlock, anchor: '<a href="' + url + '" class="gcal-generated-link" target="_blank">' + escapeHtml(matchedBlock) + "</a>" });
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

  function processPage() {
    try {
      var candidates = getCandidateElements();
      var anyChanged = false;
      for (var i = 0; i < candidates.length; i++) {
        try {
          if (processElement(candidates[i])) anyChanged = true;
        } catch (eInner) {}
      }
      if (hasCourseLinks()) {
        injectAddAllButton();
        injectApiButton();
        injectDeleteButton();
      } else {
        removeButtonsWrapper();
      }
    } catch (e) {
      // Fail-safe: still offer add-all button even if replacement fails
      removeButtonsWrapper();
    }
  }

  function injectAddAllButton() {
    if (document.getElementById("add-all-to-calendar-btn")) {
      return;
    }
    var btn = document.createElement("button");
    btn.id = "add-all-to-calendar-btn";
    btn.className = "gcal-add-all-btn";
    btn.textContent = "Add all courses to Calendar";
    btn.addEventListener("click", function () {
      var links = document.querySelectorAll("a.gcal-generated-link");
      var count = links.length;
      if (!count) {
        alert("No course links detected.");
        return;
      }
      var ok = confirm("This will open " + count + " Calendar event creation pages. Continue?");
      if (!ok) return;
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute("href");
        if (href) {
          window.open(href, "_blank", "noopener");
        }
      }
    });
    ensureButtonsWrapper();
    document.getElementById('gcal-buttons-wrapper').appendChild(btn);
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", processPage);
  } else {
    processPage();
  }
})();


