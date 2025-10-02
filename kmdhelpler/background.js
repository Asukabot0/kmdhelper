/* global chrome */
(function() {
  'use strict';

  var OAUTH_CLIENT_ID = '780619614213-2odc4151p8c26f4os8d272fn49klskt7.apps.googleusercontent.com';
  var OAUTH_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

  function getAuthUrl() {
    var redirectUri = chrome.identity.getRedirectURL();
    var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(OAUTH_CLIENT_ID) +
      '&response_type=token' +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&scope=' + encodeURIComponent(OAUTH_SCOPES.join(' ')) +
      '&include_granted_scopes=true' +
      '&prompt=consent';
    return authUrl;
  }

  function parseAccessTokenFromRedirectUrl(url) {
    try {
      var hash = url.split('#')[1] || '';
      var params = new URLSearchParams(hash);
      var token = params.get('access_token');
      var expiresIn = parseInt(params.get('expires_in') || '0', 10);
      var tokenType = params.get('token_type');
      if (token && tokenType && tokenType.toLowerCase() === 'bearer') {
        return { token: token, expiresIn: expiresIn };
      }
    } catch (e) {}
    return null;
  }

  function withToken(cb) {
    chrome.storage.local.get(['gcal_token', 'gcal_token_exp'], function(store) {
      var now = Math.floor(Date.now() / 1000);
      if (store.gcal_token && store.gcal_token_exp && store.gcal_token_exp - now > 60) {
        cb(store.gcal_token);
        return;
      }
      chrome.identity.launchWebAuthFlow({ url: getAuthUrl(), interactive: true }, function(redirectUrl) {
        if (chrome.runtime.lastError || !redirectUrl) {
          cb(null);
          return;
        }
        var parsed = parseAccessTokenFromRedirectUrl(redirectUrl);
        if (!parsed) {
          cb(null);
          return;
        }
        var exp = Math.floor(Date.now() / 1000) + (parsed.expiresIn || 3600);
        chrome.storage.local.set({ gcal_token: parsed.token, gcal_token_exp: exp }, function() {
          cb(parsed.token);
        });
      });
    });
  }

  function createEvent(token, calendarId, event) {
    return fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    }).then(function(res) {
      if (res.status === 401) {
        var err = new Error('Unauthorized');
        err.code = 401;
        throw err;
      }
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(j){
          var e = new Error('Calendar API error');
          e.details = j;
          throw e;
        });
      }
      return res.json();
    });
  }

  function toRfc3339Local(date) {
    // Date assumed local; Calendar API expects RFC3339 with timezone offset
    function pad2(n){return String(n).padStart(2,'0');}
    var y = date.getFullYear();
    var m = pad2(date.getMonth()+1);
    var d = pad2(date.getDate());
    var hh = pad2(date.getHours());
    var mm = pad2(date.getMinutes());
    var ss = pad2(date.getSeconds());
    var tz = -date.getTimezoneOffset();
    var sign = tz >= 0 ? '+' : '-';
    var tzh = pad2(Math.floor(Math.abs(tz)/60));
    var tzm = pad2(Math.abs(tz)%60);
    return y + '-' + m + '-' + d + 'T' + hh + ':' + mm + ':' + ss + sign + tzh + ':' + tzm;
  }

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (!msg || msg.type !== 'CREATE_EVENTS') return;
    withToken(function(token) {
      if (!token) {
        sendResponse({ ok: false, error: 'AUTH_FAILED' });
        return;
      }
      // Default calendar: 'primary'
      var calendarId = 'primary';
      var events = msg.events || [];
      var payloads = events.map(function(e){
        return {
          summary: e.title,
          description: e.description || '',
          location: e.location || '',
          start: { dateTime: toRfc3339Local(new Date(e.start)), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end: { dateTime: toRfc3339Local(new Date(e.end)), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          extendedProperties: { 'private': { 'elearning_fp': (e.fingerprint || '') } }
        };
      });
      var created = 0;
      var errors = [];
      (function next(i){
        if (i >= payloads.length) {
          sendResponse({ ok: errors.length === 0, created: created, errors: errors });
          return;
        }
        createEvent(token, calendarId, payloads[i]).then(function(){
          created++;
          next(i+1);
        }).catch(function(err){
          if (err && err.code === 401) {
            // force reauth once
            chrome.storage.local.remove(['gcal_token','gcal_token_exp'], function(){
              withToken(function(token2){
                if (!token2) {
                  errors.push({ index: i, error: 'AUTH_RETRY_FAILED' });
                  next(i+1);
                  return;
                }
                createEvent(token2, calendarId, payloads[i]).then(function(){
                  created++;
                  next(i+1);
                }).catch(function(e2){
                  errors.push({ index: i, error: (e2 && e2.details) || String(e2) });
                  next(i+1);
                });
              });
            });
          } else {
            errors.push({ index: i, error: (err && err.details) || String(err) });
            next(i+1);
          }
        });
      })(0);
    });
    return true; // async sendResponse
  });

  function listEventsByFingerprint(token, calendarId, fingerprint) {
    var url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events'
      + '?maxResults=2500'
      + '&privateExtendedProperty=' + encodeURIComponent('elearning_fp=' + fingerprint);
    return fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function(res){
        if (res.status === 401) { var e = new Error('Unauthorized'); e.code = 401; throw e; }
        if (!res.ok) { return res.json().catch(function(){return {};}).then(function(j){ var e = new Error('List error'); e.details = j; throw e; }); }
        return res.json();
      })
      .then(function(json){ return (json.items || []).map(function(it){ return it.id; }); });
  }

  function deleteEvent(token, calendarId, eventId) {
    var url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId);
    return fetch(url, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } })
      .then(function(res){
        if (res.status === 401) { var e = new Error('Unauthorized'); e.code = 401; throw e; }
        if (!res.ok && res.status !== 204) { var e2 = new Error('Delete error'); e2.status = res.status; throw e2; }
        return true;
      });
  }

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (!msg || msg.type !== 'DELETE_EVENTS') return;
    withToken(function(token) {
      if (!token) { sendResponse({ ok: false, error: 'AUTH_FAILED' }); return; }
      var calendarId = 'primary';
      var fps = Array.isArray(msg.fingerprints) ? msg.fingerprints : [];
      var deleted = 0, errors = [];
      (function next(i){
        if (i >= fps.length) { sendResponse({ ok: errors.length === 0, deleted: deleted, errors: errors }); return; }
        listEventsByFingerprint(token, calendarId, fps[i]).then(function(ids){
          if (!ids.length) { next(i+1); return; }
          // delete sequentially for this fingerprint
          (function delj(j){
            if (j >= ids.length) { next(i+1); return; }
            deleteEvent(token, calendarId, ids[j]).then(function(){ deleted++; delj(j+1); }).catch(function(err){
              if (err && err.code === 401) {
                chrome.storage.local.remove(['gcal_token','gcal_token_exp'], function(){
                  withToken(function(token2){
                    if (!token2) { errors.push({ fp: fps[i], error: 'AUTH_RETRY_FAILED' }); delj(j+1); return; }
                    deleteEvent(token2, calendarId, ids[j]).then(function(){ deleted++; delj(j+1); }).catch(function(e2){ errors.push({ fp: fps[i], error: String(e2) }); delj(j+1); });
                  });
                });
              } else { errors.push({ fp: fps[i], error: String(err) }); delj(j+1); }
            });
          })(0);
        }).catch(function(err){ errors.push({ fp: fps[i], error: String(err) }); next(i+1); });
      })(0);
    });
    return true;
  });
})();


