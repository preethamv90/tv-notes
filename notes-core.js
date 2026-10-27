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
  // Latest state that decrypts with our key. Big states (with drawings) arrive as ntfy
  // attachments; each is downloaded once and remembered by message id.
  var seen = {}; // message id -> decrypted state, or false if not ours
  function fetchLatest(cfg, cb) {
    req('GET', 'https://ntfy.sh/' + cfg.topic + '/json?poll=1&since=all&t=' + Date.now(), null, function (err, txt) {
      if (err) return cb(err);
      var msgs = [];
      (txt || '').split('\n').forEach(function (line) {
        if (!line) return; var m; try { m = JSON.parse(line); } catch (e) { return; }
        if (m.event === 'message') msgs.push(m);
      });
      msgs.sort(function (x, y) { return y.time - x.time; });
      var i = 0;
      (function next() {
        if (i >= msgs.length) return cb(null, null);
        var m = msgs[i++];
        if (m.id in seen) { if (seen[m.id]) return cb(null, seen[m.id]); return next(); }
        if (!m.attachment) {
          var st = open(m.message, cfg.key);
          seen[m.id] = st && st.v === 1 ? st : false;
          return seen[m.id] ? cb(null, seen[m.id]) : next();
        }
        if (m.attachment.expires && m.attachment.expires * 1000 < Date.now()) { seen[m.id] = false; return next(); }
        req('GET', m.attachment.url, null, function (e2, body) {
          if (e2) return next();
          var st2 = open((body || '').trim(), cfg.key);
          seen[m.id] = st2 && st2.v === 1 ? st2 : false;
          return seen[m.id] ? cb(null, seen[m.id]) : next();
        });
      })();
    });
  }
  function publish(cfg, state, cb) {
    req('POST', 'https://ntfy.sh/' + cfg.topic, seal(state, cfg.key), function (err) { cb && cb(err); });
  }
  g.TVNotes = { derive: derive, fetchLatest: fetchLatest, publish: publish };
})(this);
