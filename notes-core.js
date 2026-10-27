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
    var x = new XMLHttpRequest();
    x.open(method, url, true); x.timeout = 20000;
    x.onload = function () { cb(x.status >= 200 && x.status < 300 ? null : x.status, x.responseText); };
    x.onerror = x.ontimeout = function () { cb('offline'); };
    x.send(body || null);
  }
  // Latest state that decrypts with our key (anything else on the channel is ignored).
  function fetchLatest(cfg, cb) {
    req('GET', 'https://ntfy.sh/' + cfg.topic + '/json?poll=1&since=all&t=' + Date.now(), null, function (err, txt) {
      if (err) return cb(err);
      var best = null;
      (txt || '').split('\n').forEach(function (line) {
        if (!line) return;
        var m; try { m = JSON.parse(line); } catch (e) { return; }
        if (m.event !== 'message') return;
        var st = open(m.message, cfg.key);
        if (st && st.v === 1 && (!best || st.rev >= best.rev)) best = st;
      });
      cb(null, best);
    });
  }
  function publish(cfg, state, cb) {
    req('POST', 'https://ntfy.sh/' + cfg.topic, seal(state, cfg.key), function (err) { cb && cb(err); });
  }
  g.TVNotes = { derive: derive, fetchLatest: fetchLatest, publish: publish };
})(this);
