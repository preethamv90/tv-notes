/* Watch: AI picks on the phone. Keys stay in this phone's storage only. */
(function (g) {
  'use strict';
  var PROV = { 8: 'Netflix', 1796: 'Netflix', 175: 'Netflix', 9: 'Prime Video', 2100: 'Prime Video', 613: 'Prime Video', 337: 'Disney+', 15: 'Hulu', 283: 'Crunchyroll', 1968: 'Crunchyroll', 532: 'aha' };
  var INDIAN = { te: 1, hi: 1, ta: 1, ml: 1 };
  var MODEL = 'claude-sonnet-5-5';
  var WHO = ['Me', 'Both of us', 'Family'];
  var QUICK = ['Something for tonight', 'Telugu movie', 'Tamil or Malayalam thriller', 'K-drama to binge', 'Korean movie', 'Anime series', 'Light comedy', 'Hindi movie'];
  var IMG = 'https://image.tmdb.org/t/p/';

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function jget(k, d) { try { return JSON.parse(ls(k) || '') || d; } catch (e) { return d; } }

  var css = document.createElement('style');
  css.textContent =
    '.ask-keys label{display:block;font:600 13px var(--font);color:var(--muted);margin:14px 0 6px}' +
    '.ask-keys input{width:100%;box-sizing:border-box;font:15px var(--font);color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:11px 12px}' +
    '.ask-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}' +
    '.ask-chips button{border:1px solid var(--line);background:var(--surface);color:var(--fg);font:600 14px var(--font);padding:8px 12px;border-radius:999px}' +
    '.ask-chips button[aria-pressed="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}' +
    '.ask-box{width:100%;box-sizing:border-box;font:17px var(--font);color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;min-height:70px;resize:vertical}' +
    '.ask-go{width:100%;margin-top:10px}' +
    '.pick{display:flex;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:10px;margin-top:10px}' +
    '.pick img,.pick .np{width:78px;height:117px;border-radius:10px;object-fit:cover;background:var(--surface-2);flex:0 0 auto}' +
    '.pick h3{margin:0;font-size:17px}.pick .m{font-size:13px;color:var(--muted);margin-top:2px}' +
    '.pick .svc{display:inline-block;font:700 12px var(--font);padding:3px 8px;border-radius:999px;background:var(--surface-2);margin-top:6px}' +
    '.pick .svc.unk{color:var(--muted)}' +
    '.pick .why{font-size:14px;margin-top:6px}' +
    '.pick .acts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}' +
    '.pick .acts button,.pick .acts a{border:1px solid var(--line);background:transparent;color:var(--fg);font:600 13px var(--font);padding:6px 10px;border-radius:10px;text-decoration:none}' +
    '.pick .acts [aria-pressed="true"]{background:var(--fg);color:var(--bg)}' +
    '.ask-send{position:sticky;bottom:0;background:var(--bg);padding:10px 0 calc(env(safe-area-inset-bottom,0px) + 12px)}' +
    '.ask-send .primary{width:100%}' +
    '.ask-note{font-size:13px;color:var(--muted);margin-top:8px}';
  document.head.appendChild(css);

  var ctx, app, state = { who: 0, quick: -1, text: '', busy: false, picks: null, err: '' };

  function hasKeys() { return !!(ls('tva-tmdb') && ls('tva-ai')); }

  function open(c) {
    ctx = c; g.TVAsk.active = true; app = document.getElementById('app'); state.who = +(ls('tva-who') || 0);
    if (hasKeys()) return render();
    app.innerHTML = '<header><button class="link" id="kn">‹ Notes</button><h1>Watch</h1><span></span></header><div class="empty">Getting the keys from your TV…</div>';
    document.getElementById('kn').onclick = function () { ctx.back(); };
    fromTV(function () { if (g.TVAsk.active) render(); });
  }

  function render() {
    if (!hasKeys()) return renderKeys();
    var p = state.picks;
    app.innerHTML =
      '<header><button class="link" id="ab">‹ Notes</button><h1>Watch</h1><button class="link" id="ak">Keys</button></header>' +
      '<div class="ask-chips" role="group" aria-label="For">' + WHO.map(function (w, i) { return '<button data-w="' + i + '" aria-pressed="' + (state.who === i) + '">' + esc(i === 0 ? ctx.me : w) + '</button>'; }).join('') + '</div>' +
      '<textarea class="ask-box" id="aq" placeholder="What are you in the mood for? e.g. a gripping Malayalam thriller under 2 hours">' + esc(state.text) + '</textarea>' +
      '<div class="ask-chips">' + QUICK.map(function (q, i) { return '<button data-q="' + i + '" aria-pressed="' + (state.quick === i) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<button class="primary ask-go" id="ago"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? esc(state.busy) : 'Suggest') + '</button>' +
      (state.err ? '<div class="err">' + esc(state.err) + '</div>' : '') +
      (p ? (p.length ? p.map(card).join('') : '<div class="empty">Nothing matched on your apps. Try asking differently.</div>') : '') +
      (p && p.length ? '<div class="ask-send"><button class="primary" id="as">Send to TV</button><div class="ask-note" id="asn">Shows on the TV with the D button.</div></div>' : '');
    document.getElementById('ab').onclick = function () { ctx.back(); };
    document.getElementById('ak').onclick = renderKeys;
    var aq = document.getElementById('aq'); aq.oninput = function () { state.text = aq.value; state.quick = -1; };
    [].forEach.call(app.querySelectorAll('[data-w]'), function (b) { b.onclick = function () { state.who = +b.dataset.w; ls('tva-who', state.who); render(); }; });
    [].forEach.call(app.querySelectorAll('[data-q]'), function (b) { b.onclick = function () { state.quick = +b.dataset.q; state.text = QUICK[state.quick]; render(); }; });
    document.getElementById('ago').onclick = suggest;
    [].forEach.call(app.querySelectorAll('[data-rate]'), function (b) { b.onclick = function () { rate(+b.dataset.i, +b.dataset.rate); }; });
    var as = document.getElementById('as'); if (as) as.onclick = sendToTV;
  }

  function card(x, i) {
    var lk = jget('tva-likes', {})[x.m + x.id], v = lk ? lk.v : 0;
    return '<div class="pick">' + (x.p ? '<img src="' + IMG + 'w185' + x.p + '" alt="">' : '<div class="np"></div>') +
      '<div><h3>' + esc(x.t) + '</h3><div class="m">' + esc([x.y, x.m === 'tv' ? 'Series' : 'Movie', x.lang].filter(Boolean).join(' · ')) + '</div>' +
      (x.app ? '<span class="svc">' + esc(x.app) + '</span>' : '<span class="svc unk">Where to watch: Unknown · try aha / ZEE5</span>') +
      '<div class="why">' + esc(x.why) + '</div>' +
      '<div class="acts"><button data-rate="1" data-i="' + i + '" aria-pressed="' + (v === 1) + '">Like</button><button data-rate="-1" data-i="' + i + '" aria-pressed="' + (v === -1) + '">Not for me</button>' +
      '<a href="https://www.justwatch.com/us/search?q=' + encodeURIComponent(x.t) + '" target="_blank" rel="noopener">JustWatch</a></div></div></div>';
  }

  function fromTV(done) {
    TVNotes.latest(TVNotes.derive(ctx.pass + '|keys'), 3, function (err, k) {
      if (k && k.tmdb && k.ai) { ls('tva-tmdb', k.tmdb); ls('tva-ai', k.ai); }
      done(!!(k && k.tmdb && k.ai));
    });
  }

  function renderKeys() {
    app.innerHTML = '<header>' + (hasKeys() ? '<button class="link" id="kb">‹ Watch</button>' : '<button class="link" id="kn">‹ Notes</button>') + '<h1>Watch setup</h1><span></span></header>' +
      '<p class="ask-note">Keys normally come from the TV automatically: turn the TV on with the Home app open, then tap Get from TV. Or paste them here. They are only sent to TMDB and Anthropic.</p>' +
      '<button class="primary ask-go" id="kg" type="button">Get from TV</button>' +
      '<form class="ask-keys" id="kf"><label for="kt">TMDB read access token</label><input id="kt" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(ls('tva-tmdb') || '') + '">' +
      '<label for="ka">Anthropic API key</label><input id="ka" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(ls('tva-ai') || '') + '">' +
      '<button class="primary ask-go">Save</button></form>';
    var kb = document.getElementById('kb'); if (kb) kb.onclick = render;
    document.getElementById('kg').onclick = function () { var b = this; b.textContent = 'Checking…'; fromTV(function (ok) { if (ok) render(); else b.textContent = 'Not found yet. Make sure the TV is on, then try again.'; }); };
    var kn = document.getElementById('kn'); if (kn) kn.onclick = function () { ctx.back(); };
    document.getElementById('kf').onsubmit = function (e) {
      e.preventDefault();
      ls('tva-tmdb', document.getElementById('kt').value.trim() || null);
      ls('tva-ai', document.getElementById('ka').value.trim() || null);
      render();
    };
  }

  function tmdb(path, params) {
    var q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch('https://api.themoviedb.org/3' + path + (q ? '?' + q : ''), { headers: { Authorization: 'Bearer ' + ls('tva-tmdb'), Accept: 'application/json' } })
      .then(function (r) { if (r.status === 401) throw new Error('TMDB key was rejected. Check it under Keys.'); return r.ok ? r.json() : null; });
  }

  function askClaude(text) {
    var likes = jget('tva-likes', {}), liked = [], disliked = [];
    Object.keys(likes).forEach(function (k) { (likes[k].v > 0 ? liked : disliked).push(likes[k].t); });
    var recent = jget('tva-recent', []);
    var forWho = state.who === 0 ? 'one adult (' + ctx.me + ')' : state.who === 1 ? 'Preetham and Krishna Priya together' : 'the whole family, including a child (keep it kid-friendly)';
    var sys = 'You recommend movies and series for a household in the United States. ' +
      'Their streaming apps: Netflix, Prime Video, Disney+, Hulu, Crunchyroll, aha, ZEE5. ' +
      'They watch English, Telugu, Hindi, Tamil, Malayalam, Korean (dramas and movies) and Japanese anime. ' +
      'Suggest only real, released titles that are likely streaming in the US on those apps right now. Mix well-known picks with a few lesser-known strong ones. ' +
      'Output exactly 10 lines and nothing else (no intro, no notes), best first, each line: Title | year | movie or tv | ISO 639-1 language code | short reason under 80 characters';
    var user = 'What they asked for: ' + text + '\nWho is watching: ' + forWho +
      (liked.length ? '\nThey liked: ' + liked.slice(-25).join('; ') : '') +
      (disliked.length ? '\nNot for them: ' + disliked.slice(-25).join('; ') : '') +
      (recent.length ? '\nAlready suggested recently, avoid repeating: ' + recent.slice(-40).join('; ') : '');
    function call(tries) {
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ls('tva-ai'), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: MODEL, max_tokens: 900, thinking: { type: 'between_tools' }, system: sys, messages: [{ role: 'user', content: user }] })
      }).catch(function () {
        if (tries > 0) { state.busy = 'Retrying…'; render(); return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return call(tries - 1); }); }
        throw new Error('Couldn’t reach Claude. Check Wi-Fi, keep this screen open, and tap Suggest again.');
      });
    }
    return call(2).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(r.status === 401 ? 'Anthropic key was rejected. Check it under Keys.' : (d.error && d.error.message) || 'AI request failed (' + r.status + ').');
        var t = (d.content || []).map(function (c) { return c.text || ''; }).join('');
        var picks = [];
        t.split('\n').forEach(function (line) {
          var f = line.split('|').map(function (x) { return x.trim(); });
          if (f.length < 4 || !f[0] || /^title$/i.test(f[0])) return;
          picks.push({ title: f[0].replace(/^[-*\d.\s]+/, ''), year: parseInt(f[1], 10) || '', type: /tv|series/i.test(f[2]) ? 'tv' : 'movie', lang: (f[3] || '').toLowerCase(), why: f[4] || '' });
        });
        if (!picks.length) throw new Error('Claude’s answer came back in an unexpected format. Tap Suggest again.');
        return picks;
      });
    });
  }

  function resolve(c) {
    var m = c.type === 'tv' ? 'tv' : 'movie';
    var yk = m === 'movie' ? 'primary_release_year' : 'first_air_date_year';
    var p = { query: c.title }; if (c.year) p[yk] = c.year;
    return tmdb('/search/' + m, p).then(function (d) {
      if (d && d.results && d.results.length) return d;
      return tmdb('/search/' + m, { query: c.title });
    }).then(function (d) {
      var r = d && d.results && d.results[0]; if (!r) return null;
      return tmdb('/' + m + '/' + r.id + '/watch/providers').then(function (w) {
        var us = (w && w.results && w.results.US) || {}, app = '';
        (us.flatrate || []).concat(us.ads || []).some(function (x) { if (PROV[x.provider_id]) { app = PROV[x.provider_id]; return true; } });
        var lang = r.original_language || c.lang;
        if (!app && !INDIAN[lang]) return null;
        return { id: r.id, m: m, t: r.title || r.name, y: (r.release_date || r.first_air_date || '').slice(0, 4), p: r.poster_path || '', why: String(c.why || '').slice(0, 140), app: app, lang: ({ en: 'English', te: 'Telugu', hi: 'Hindi', ta: 'Tamil', ml: 'Malayalam', ko: 'Korean', ja: 'Japanese' })[lang] || '' };
      });
    }).catch(function (e) { if (/key was rejected/.test(e.message)) throw e; return null; });
  }

  function suggest() {
    var text = (state.text || '').trim() || 'Something great for tonight';
    state.busy = 'Thinking…'; state.err = ''; state.picks = null; render();
    askClaude(text).then(function (cands) {
      state.busy = 'Checking your apps…'; render();
      var list = cands.slice(0, 12), out = [];
      return Promise.all(list.map(resolve));
    }).then(function (list) {
      var seen = {}, out = [];
      list.forEach(function (x) { if (x && !seen[x.m + x.id]) { seen[x.m + x.id] = 1; out.push(x); } });
      out.sort(function (a, b) { return (b.app ? 1 : 0) - (a.app ? 1 : 0); });
      state.picks = out.slice(0, 8); state.ask = text; state.busy = false;
      var recent = jget('tva-recent', []).concat(state.picks.map(function (x) { return x.t; })); ls('tva-recent', JSON.stringify(recent.slice(-60)));
      render();
    }).catch(function (e) { state.busy = false; state.err = e.message || 'Something went wrong.'; render(); });
  }

  function rate(i, v) {
    var x = state.picks[i], likes = jget('tva-likes', {}), k = x.m + x.id;
    if (likes[k] && likes[k].v === v) delete likes[k]; else likes[k] = { t: x.t + (x.y ? ' (' + x.y + ')' : ''), v: v };
    ls('tva-likes', JSON.stringify(likes)); render();
  }

  function sendToTV() {
    var n = document.getElementById('asn'); n.textContent = 'Sending…';
    var cfg = TVNotes.derive(ctx.pass + '|picks');
    var body = { v: 2, by: ctx.me, ask: String(state.ask || '').slice(0, 60), at: Date.now(), list: state.picks.map(function (x) { return { id: x.id, m: x.m, t: x.t, y: x.y, p: x.p, why: x.why, app: x.app }; }) };
    TVNotes.publishAny(cfg, body, function (err) { n.textContent = err ? 'Couldn’t send. Check your connection and try again.' : 'Sent. Press D on the TV remote.'; });
  }

  g.TVAsk = { open: open };
})(this);
