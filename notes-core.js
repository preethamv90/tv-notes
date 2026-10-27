/* Shared by the phone page and the TV: key derivation, encryption, ntfy transport. */
(function (g) {
  'use strict';
  var nacl = g.nacl, U = g.nacl.util;
  function hex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += ('0' + u8[i].toString(16)).slice(-2); return s; }
  function derive(pass) {
    var p = String(pass).trim().toLowerCase();
    return {
      key: nacl.hash(U.decodeUTF8('tvnotes-key|' + p)).subarray(0, 32),
      topic: 'tvn-' + hex(nacl.hash(U.decodeUTF8('tvnotes-topic|' + p))).slice(0, 28)
    };
  }
  function seal(obj, key) {
    var nonce = nacl.randomBytes(24);
    var box = nacl.secretbox(U.decodeUTF8(JSON.stringify(obj)), nonce, key);
    var all = new Uint8Array(24 + box.length); all.set(nonce); all.set(box, 24);
    return U.encodeBase64(all);
  }
  function open(b64, key) {
    try {
      var all = U.decodeBase64(b64);
      var out = nacl.secretbox.open(all.subarray(24), all.subarray(0, 24), key);
      return out ? JSON.parse(U.encodeUTF8(out)) : null;
    } catch (e) { return null; }
  }
  function req(method, url, body, cb) {
    // Prefer fetch: some TV browsers return an empty body to XHR for streamed replies.
    if (typeof fetch === 'function') {
      var done = false, timer = setTimeout(function () { if (!done) { done = true; cb('timeout'); } }, 20000);
      fetch(url, { method: method, body: body || undefined, cache: 'no-store' }).then(function (r) {
        return r.text().then(function (t) { if (done) return; done = true; clearTimeout(timer); cb(r.ok ? null : r.status, t); });
      }).catch(function (e) { if (done) return; done = true; clearTimeout(timer); cb('offline'); });
      return;
    }
    var x = new XMLHttpRequest();
    x.open(method, url, true); x.timeout = 20000;
    x.onload = function () { cb(x.status >= 200 && x.status < 300 ? null : x.status, x.responseText); };
    x.onerror = x.ontimeout = function () { cb('offline'); };
    x.send(body || null);
  }
  // Every message on the channel is a full snapshot from one phone (or the TV).
  // Snapshots are MERGED, never replaced: items by id (newest edit wins), deletions
  // kept as tombstones, so a phone that is behind can never erase anyone's notes.
  var seen = {}; // message id -> decrypted snapshot, or false if not ours
  var KEEP_GONE_MS = 4 * 86400000;
  function merge(list) {
    var items = {}, gone = {}, rev = 0;
    list.forEach(function (st) {
      if (!st) return;
      rev = Math.max(rev, st.rev || 0);
      var g = st.gone || {};
      Object.keys(g).forEach(function (id) { if (!gone[id] || g[id] > gone[id]) gone[id] = g[id]; });
      (st.items || []).forEach(function (it) {
        var u = it.u || it.ts || 0, cur = items[it.id];
        if (!cur || u > (cur.u || cur.ts || 0)) items[it.id] = it;
      });
    });
    var now = Date.now();
    Object.keys(gone).forEach(function (id) { if (now - gone[id] > KEEP_GONE_MS) delete gone[id]; });
    var out = Object.keys(items).map(function (id) { return items[id]; })
      .filter(function (it) { return !gone[it.id] || gone[it.id] < (it.u || it.ts || 0); })
      .sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
    return { v: 1, rev: rev, items: out, gone: gone };
  }
  function fetchMerged(cfg, extra, cb) {
    req('GET', 'https://ntfy.sh/' + cfg.topic + '/json?poll=1&since=all', null, function (err, txt) {
      if (err) return cb(err);
      var msgs = [];
      (txt || '').split('\n').forEach(function (line) {
        if (!line) return; var m; try { m = JSON.parse(line); } catch (e) { return; }
        if (m.event === 'message') msgs.push(m);
      });
      var i = 0, found = [];
      (function next() {
        if (i >= msgs.length) return cb(null, merge(found.concat(extra || [])), found.length);
        var m = msgs[i++];
        if (m.id in seen) { if (seen[m.id]) found.push(seen[m.id]); return next(); }
        if (!m.attachment) {
          var st = open(m.message, cfg.key);
          seen[m.id] = st && st.v === 1 ? st : false;
          if (seen[m.id]) found.push(seen[m.id]);
          return next();
        }
        if (m.attachment.expires && m.attachment.expires * 1000 < Date.now()) { seen[m.id] = false; return next(); }
        req('GET', m.attachment.url, null, function (e2, body) {
          if (e2) return next();
          var st2 = open((body || '').trim(), cfg.key);
          seen[m.id] = st2 && st2.v === 1 ? st2 : false;
          if (seen[m.id]) found.push(seen[m.id]);
          next();
        });
      })();
    });
  }
  function publish(cfg, state, cb) {
    req('POST', 'https://ntfy.sh/' + cfg.topic, seal(state, cfg.key), function (err) { cb && cb(err); });
  }
  // Newest message on a channel that decrypts to version v (used for watch picks).
  function latest(cfg, v, cb) {
    req('GET', 'https://ntfy.sh/' + cfg.topic + '/json?poll=1&since=all', null, function (err, txt) {
      if (err) return cb(err);
      var msgs = [];
      (txt || '').split('\n').forEach(function (line) { if (!line) return; try { var m = JSON.parse(line); if (m.event === 'message') msgs.push(m); } catch (e) {} });
      var i = msgs.length - 1;
      (function next() {
        if (i < 0) return cb(null, null);
        var m = msgs[i--];
        if (!m.attachment) { var st = open(m.message, cfg.key); return st && st.v === v ? cb(null, st) : next(); }
        req('GET', m.attachment.url, null, function (e2, body) { var st2 = e2 ? null : open((body || '').trim(), cfg.key); return st2 && st2.v === v ? cb(null, st2) : next(); });
      })();
    });
  }
  function publishAny(cfg, obj, cb) {
    req('POST', 'https://ntfy.sh/' + cfg.topic, seal(obj, cfg.key), function (err) { cb && cb(err); });
  }
  g.TVNotes = { derive: derive, fetchMerged: fetchMerged, merge: merge, publish: publish, latest: latest, publishAny: publishAny };
})(this);
