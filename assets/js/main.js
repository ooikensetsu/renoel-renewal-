/* ==========================================================================
   RENOEL renewal - main.js  (vanilla JS / 依存ライブラリなし)
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var fmt = function (n) { return Math.round(n).toLocaleString('ja-JP'); };

  /* 市町村コード → 市町村名（地図・一覧・検索ボックスの橋渡し） */
  var CODE2CITY = {
    '20203': '上田市', '20219': '東御市', '20208': '小諸市', '20323': '御代田町',
    '20321': '軽井沢町', '20217': '佐久市', '20309': '佐久穂町'
  };

  /* 種別 × 市町村の掲載件数（サンプルデータ） */
  var COUNTS = {
    kodate:  { '佐久市': 42, '小諸市': 28, '御代田町': 11, '軽井沢町': 19, '上田市': 35, '東御市': 9, '佐久穂町': 7 },
    mansion: { '佐久市': 18, '小諸市':  6, '御代田町':  2, '軽井沢町':  5, '上田市':  7, '東御市': 0, '佐久穂町': 0 },
    tochi:   { '佐久市': 21, '小諸市':  9, '御代田町':  7, '軽井沢町': 12, '上田市': 10, '東御市': 3, '佐久穂町': 2 },
    'new':   { '佐久市': 11, '小諸市':  4, '御代田町':  3, '軽井沢町':  2, '上田市':  6, '東御市': 1, '佐久穂町': 0 },
    jigyo:   { '佐久市':  4, '小諸市':  2, '御代田町':  1, '軽井沢町':  1, '上田市':  1, '東御市': 0, '佐久穂町': 0 }
  };

  /* ------------------------------------------------------------------
     1. ドロワー（SP）
  ------------------------------------------------------------------ */
  (function drawer() {
    var btn = $('#drawerBtn'), dw = $('#drawer');
    if (!btn || !dw) return;

    function close() {
      dw.classList.remove('is-open');
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    btn.addEventListener('click', function () {
      var open = !dw.classList.contains('is-open');
      dw.classList.toggle('is-open', open);
      btn.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });

    $$('a', dw).forEach(function (a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dw.classList.contains('is-open')) close();
    });
  })();

  /* ------------------------------------------------------------------
     2. 検索ボックス（種別タブ／エリア／件数）
  ------------------------------------------------------------------ */
  var searchApi = (function searchBox() {
    var tabs   = $$('.searchBox__tabs button');
    var chips  = $$('.searchRow__ctl input[name="city"]');
    var outEl  = $('#searchCount');
    if (!tabs.length || !chips.length) return {};

    /* URLパラメータ（トップのエリア選択から引き継ぐ） */
    var params  = new URLSearchParams(location.search);
    var qType   = params.get('type');
    var qCity   = params.get('city');
    var type    = COUNTS[qType] ? qType : 'kodate';

    function refresh() {
      var table = COUNTS[type] || {};
      var sum = 0;

      chips.forEach(function (input) {
        var city = input.value;
        var n = table[city] || 0;
        var label = input.closest('.chk');
        var em = label ? label.querySelector('em') : null;

        input.dataset.n = n;
        if (em) em.textContent = n;

        // 該当なしの市町村は選べないようにする
        input.disabled = (n === 0);
        if (n === 0) input.checked = false;
        if (label) label.style.opacity = (n === 0) ? '.42' : '';

        if (input.checked) sum += n;
      });

      // 何も選ばれていなければ全域の合計を出す
      if (!chips.some(function (i) { return i.checked; })) {
        sum = Object.keys(table).reduce(function (a, k) { return a + table[k]; }, 0);
      }
      if (outEl) outEl.textContent = fmt(sum);
    }

    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        tabs.forEach(function (o) { o.classList.remove('is-active'); o.setAttribute('aria-selected', 'false'); });
        b.classList.add('is-active');
        b.setAttribute('aria-selected', 'true');
        type = b.dataset.type;
        refresh();
      });
    });

    chips.forEach(function (i) { i.addEventListener('change', refresh); });

    /* タブの見た目を type に合わせる */
    tabs.forEach(function (b) {
      var on = (b.dataset.type === type);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    refresh();

    var api = {
      /* 地図・エリアカードから市町村を指定する */
      selectCity: function (city) {
        var hit = false;
        chips.forEach(function (i) {
          var on = (i.value === city && !i.disabled);
          i.checked = on;
          if (on) hit = true;
        });
        refresh();
        return hit;
      }
    };

    if (qCity) api.selectCity(qCity);
    return api;
  })();

  /* ------------------------------------------------------------------
     3. AREA：地図と市町村一覧の連動 → 検索条件へ反映
  ------------------------------------------------------------------ */
  (function areaMap() {
    // 施工エリア内（.is-target）のみ操作対象。エリア外は背景として描くだけ
    var regions = $$('.areaMap__region.is-target');
    var items   = $$('.areaMap__listItem');
    if (!regions.length && !items.length) return;

    var all = regions.concat(items);

    function mark(cls, code) {
      all.forEach(function (el) { el.classList.toggle(cls, el.dataset.code === code); });
    }
    function clear(cls) {
      all.forEach(function (el) { el.classList.remove(cls); });
    }

    function select(code) {
      var city = CODE2CITY[code];
      if (!city) return;

      // 検索ボックスが同じページにある（＝検索ページ）ならその場で反映
      if (searchApi.selectCity) {
        mark('is-selected', code);
        searchApi.selectCity(city);
        var target = $('#search');
        if (target) {
          var top = target.getBoundingClientRect().top + window.pageYOffset - 90;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
        return;
      }

      // トップページからは検索ページへ市町村を引き継いで遷移
      mark('is-selected', code);
      location.href = 'search.html?city=' + encodeURIComponent(city);
    }

    all.forEach(function (el) {
      el.addEventListener('click', function () { select(el.dataset.code); });
      el.addEventListener('mouseenter', function () { mark('is-hover', el.dataset.code); });
      el.addEventListener('mouseleave', function () { clear('is-hover'); });
      if (el.getAttribute('role') === 'button') {
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            select(el.dataset.code);
          }
        });
      }
    });
  })();

  /* ------------------------------------------------------------------
     4. 資金計画シミュレーション（元利均等・ボーナス払いなし）
  ------------------------------------------------------------------ */
  (function simulation() {
    var price = $('#simPrice'), reno = $('#simReno'), down = $('#simDown'),
        rate  = $('#simRate'),  years = $('#simYears');
    if (!price) return;

    var out = {
      price: $('#simPriceOut'), reno: $('#simRenoOut'), down: $('#simDownOut'),
      rate: $('#simRateOut'), years: $('#simYearsOut'),
      monthly: $('#simMonthly'), total: $('#simTotal'), years2: $('#simYears2'), rate2: $('#simRate2')
    };

    function calc() {
      var p = +price.value, r0 = +reno.value, d = +down.value,
          ar = +rate.value, y = +years.value;

      var man = Math.max(p + r0 - d, 0);          // 借入総額（万円）
      var principal = man * 10000;
      var n = y * 12;
      var m = ar / 100 / 12;
      var monthly = (m === 0) ? principal / n
                              : principal * m / (1 - Math.pow(1 + m, -n));

      out.price.textContent  = fmt(p);
      out.reno.textContent   = fmt(r0);
      out.down.textContent   = fmt(d);
      out.rate.textContent   = ar.toFixed(2);
      out.years.textContent  = y;

      out.monthly.textContent = fmt(monthly);
      out.total.textContent   = fmt(man);
      out.years2.textContent  = y;
      out.rate2.textContent   = ar.toFixed(2);
    }

    [price, reno, down, rate, years].forEach(function (el) {
      el.addEventListener('input', calc);
    });
    calc();
  })();

  /* ------------------------------------------------------------------
     5. パスワードの表示／非表示（member.html の登録フォーム）
  ------------------------------------------------------------------ */
  (function passwordToggle() {
    var btns = $$('.pwToggle');
    if (!btns.length) return;

    btns.forEach(function (btn) {
      var input = document.getElementById(btn.dataset.target);
      if (!input) return;

      btn.addEventListener('click', function () {
        var show = (input.type === 'password');
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? '非表示' : '表示';
        btn.setAttribute('aria-pressed', String(show));
      });
    });
  })();

  /* ------------------------------------------------------------------
     6. 会員登録フォーム（STEP1〜4の切替・確認画面への反映）
  ------------------------------------------------------------------ */
  (function memberRegister() {
    var panels = $$('.formStep');
    var steps  = $$('#stepBar li');
    var form1  = $('#formStep1');
    var form2  = $('#formStep2');
    if (!panels.length || !form1 || !form2) return;

    function goStep(n) {
      panels.forEach(function (p) { p.classList.toggle('is-active', +p.dataset.step === n); });
      steps.forEach(function (li) {
        var s = +li.dataset.step;
        li.classList.toggle('is-current', s === n);
        li.classList.toggle('is-done', s < n);
      });
      var target = $('#register');
      if (target) {
        var top = target.getBoundingClientRect().top + window.pageYOffset - 90;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    }

    /* 入力欄の一致チェック（メール確認／パスワード確認） */
    function matchCheck(a, b, msg) {
      function check() { b.setCustomValidity(b.value !== '' && b.value !== a.value ? msg : ''); }
      a.addEventListener('input', check);
      b.addEventListener('input', check);
    }
    matchCheck($('#email1'), $('#email2'), 'メールアドレスが一致しません');
    matchCheck($('#pw1'), $('#pw2'), 'パスワードが一致しません');

    function checkedVals(name) {
      var vals = $$('input[name="' + name + '"]:checked').map(function (i) { return i.value; });
      return vals.length ? vals.join('、') : '指定なし';
    }

    function fillConfirm() {
      var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
      var setText = function (id, text) { var el = document.getElementById(id); if (el) el.textContent = text; };
      var contact = $('input[name="contact"]:checked');

      setText('cfName', (val('lastName') + ' ' + val('firstName')).trim() || '未入力');
      setText('cfKana', (val('kanaSei') + ' ' + val('kanaMei')).trim() || '未入力');
      setText('cfEmail', val('email1') || '未入力');
      setText('cfTel', val('tel') || '未入力');
      setText('cfContact', contact ? contact.value : '指定なし');
      setText('cfNotify', checkedVals('notify'));

      setText('cfType', checkedVals('wantType'));
      setText('cfCity', checkedVals('wantCity'));
      var pmin = val('wantPmin'), pmax = val('wantPmax');
      setText('cfPrice', (pmin || pmax) ? ((pmin || '下限なし') + ' 〜 ' + (pmax || '上限なし')) : '指定なし');
      setText('cfMadori', checkedVals('wantMadori'));
      setText('cfCondition', checkedVals('wantCondition'));
      setText('cfTiming', val('wantTiming') || '指定なし');

      var doneEmail = $('#doneEmail');
      if (doneEmail && val('email1')) doneEmail.textContent = val('email1');
    }

    form1.addEventListener('submit', function (e) {
      e.preventDefault();
      goStep(2);
    });

    form2.addEventListener('submit', function (e) {
      e.preventDefault();
      fillConfirm();
      goStep(3);
    });

    var submitBtn = $('#submitRegister');
    if (submitBtn) {
      submitBtn.addEventListener('click', function () { goStep(4); });
    }

    $$('.js-back').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        goStep(+a.dataset.to);
      });
    });
  })();

  /* ------------------------------------------------------------------
     7. スクロールフェードイン
  ------------------------------------------------------------------ */
  (function fadeIn() {
    var sel = '.secTtl, .secLead, .propCard, .levelCard, .caseCard, .shopSolo, ' +
              '.voiceCard, .newsCol, .simu__form, ' +
              '.simu__result, .searchBox, .areaMap, .memberCta__inner';
    var items = $$(sel);
    if (!items.length) return;

    items.forEach(function (i) { i.classList.add('fade'); });

    if (!('IntersectionObserver' in window)) {
      items.forEach(function (i) { i.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e, n) {
        if (!e.isIntersecting) return;
        var el = e.target;
        setTimeout(function () { el.classList.add('is-in'); }, n * 80);
        io.unobserve(el);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (i) { io.observe(i); });
  })();

  /* ------------------------------------------------------------------
     8. ページトップ / Cookie バー
  ------------------------------------------------------------------ */
  (function fixedParts() {
    var top = $('#pagetop');
    if (top) {
      window.addEventListener('scroll', function () {
        top.classList.toggle('is-show', window.pageYOffset > 600);
      }, { passive: true });
    }

    var bar = $('#cookieBar'), ok = $('#cookieOk');
    if (bar && ok) {
      var KEY = 'renoel_cookie_ok';
      var accepted = false;
      try { accepted = localStorage.getItem(KEY) === '1'; } catch (e) {}
      if (!accepted) setTimeout(function () { bar.classList.add('is-show'); }, 1400);
      ok.addEventListener('click', function () {
        bar.classList.remove('is-show');
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
      });
    }
  })();

})();
